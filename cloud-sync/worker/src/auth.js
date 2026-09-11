import { SyncError } from './errors.js';

const COOLDOWN_SECONDS = [0, 2, 5, 15, 60, 300, 900];
const EMPTY_DIGEST = new Uint8Array(32);

export function constantTimeEqual(left, right) {
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  if (a.length !== 32 || b.length !== 32) return false;
  let diff = 0;
  for (let index = 0; index < 32; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

async function digestBytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

// Storage format: lowercase hex SHA-256 of the submitted UTF-8 authenticator/token text.
export async function hashAuthValue(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new SyncError('INVALID_REQUEST');
  return Array.from(await digestBytes(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashLocator(syncCode) {
  if (typeof syncCode !== 'string') throw new SyncError('INVALID_REQUEST');
  const trimmed = syncCode.trim();
  // Only ASCII spaces/hyphens are grouping characters; reject non-ASCII case-folding aliases.
  if (!/^[A-Za-z2-7 -]+$/.test(trimmed)) throw new SyncError('INVALID_REQUEST');
  const normalized = trimmed.replace(/[ -]/g, '').toUpperCase();
  if (!/^[A-Z2-7]{1,128}$/.test(normalized)) throw new SyncError('INVALID_REQUEST');
  return hashAuthValue(normalized);
}

function storedDigest(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
}

function requireLocator(locatorHash) {
  if (!storedDigest(locatorHash)) throw new SyncError('INVALID_REQUEST');
}

export async function recordAuthFailure(locatorHash, now, env) {
  return writeAuthFailure(locatorHash, now, env, false);
}

async function writeAuthFailure(locatorHash, now, env, enforceCooldown) {
  requireLocator(locatorHash);
  if (!Number.isSafeInteger(now) || now < 0) throw new SyncError('INTERNAL_ERROR');
  // The guarded UPSERT is the failure-admission point, shared across Worker isolates.
  // Direct failure recording remains available to callers that already own admission.
  const cases = COOLDOWN_SECONDS.slice(1).map((seconds, index) => `WHEN ${index + 1} THEN ${seconds * 1000}`).join(' ');
  return env.DB.prepare(`INSERT INTO auth_throttles (locator_hash, failure_count, cooldown_until, updated_at)
    VALUES (?, 1, ?, ?) ON CONFLICT(locator_hash) DO UPDATE SET
    failure_count = auth_throttles.failure_count + 1,
    cooldown_until = excluded.updated_at + CASE auth_throttles.failure_count ${cases} ELSE 900000 END,
    updated_at = excluded.updated_at
    ${enforceCooldown ? 'WHERE auth_throttles.cooldown_until <= excluded.updated_at' : ''}
    RETURNING *`).bind(locatorHash, now, now).first();
}

export async function clearAuthFailures(locatorHash, env) {
  requireLocator(locatorHash);
  await env.DB.prepare('DELETE FROM auth_throttles WHERE locator_hash = ?').bind(locatorHash).run();
}

async function verifySpaceAuth(locatorHash, submitted, digestField, env) {
  requireLocator(locatorHash);
  const validInput = typeof submitted === 'string' && submitted.length > 0 && submitted.length <= 256;
  // Missing spaces perform the same reads, SHA-256 and 32-byte comparison as wrong authenticators.
  const [spaceResult, throttleResult] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM sync_spaces WHERE locator_hash = ?').bind(locatorHash),
    env.DB.prepare('SELECT cooldown_until FROM auth_throttles WHERE locator_hash = ?').bind(locatorHash)
  ]);
  const space = spaceResult.results[0];
  const expected = storedDigest(space?.[digestField]);
  const matches = constantTimeEqual(await digestBytes(validInput ? submitted : ''), expected || EMPTY_DIGEST);
  const now = Date.now();
  if (throttleResult.results[0]?.cooldown_until > now) throw new SyncError('AUTH_COOLDOWN');
  const parametersOnly = digestField === null;
  if (!space || (!parametersOnly && (!validInput || !expected || !matches))) {
    const recorded = await writeAuthFailure(locatorHash, now, env, true);
    if (!recorded) throw new SyncError('AUTH_COOLDOWN');
    throw new SyncError('AUTH_FAILED');
  }
  // Public lookup shares failure work and cooldown admission, but is not authentication
  // and must never clear an existing failure counter.
  if (parametersOnly) return space;
  // A competing request may have started cooldown after the initial read. Only clear
  // an eligible row, then inspect any remaining row within the same D1 transaction.
  const [, remainingThrottle] = await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_throttles WHERE locator_hash = ? AND cooldown_until <= ?').bind(locatorHash, now),
    env.DB.prepare('SELECT cooldown_until FROM auth_throttles WHERE locator_hash = ?').bind(locatorHash)
  ]);
  if (remainingThrottle.results.length) throw new SyncError('AUTH_COOLDOWN');
  return space;
}

export function verifyPasswordAuth(locatorHash, submittedAuthKey, env) {
  return verifySpaceAuth(locatorHash, submittedAuthKey, 'auth_digest', env);
}

export function lookupSpace(locatorHash, env) {
  return verifySpaceAuth(locatorHash, '', null, env);
}

export function verifyRecoveryAuth(locatorHash, submittedRecoveryAuth, env) {
  return verifySpaceAuth(locatorHash, submittedRecoveryAuth, 'recovery_auth_digest', env);
}

export async function authenticateDevice(request, env) {
  const match = /^Device ([A-Za-z0-9_-]{1,128})\.([A-Za-z0-9_-]{1,256})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new SyncError('AUTH_FAILED');
  const row = await env.DB.prepare(`SELECT d.id, d.space_id, d.token_digest, d.revoked_at, s.locator_hash,
    s.minimum_read_version, s.minimum_write_version FROM devices d
    JOIN sync_spaces s ON s.id = d.space_id WHERE d.id = ?`).bind(match[1]).first();
  const expected = storedDigest(row?.token_digest);
  const matches = constantTimeEqual(await digestBytes(match[2]), expected || EMPTY_DIGEST);
  if (!row || row.revoked_at !== null || !expected || !matches) throw new SyncError('AUTH_FAILED');
  await clearAuthFailures(row.locator_hash, env);
  return {
    deviceId: row.id, spaceId: row.space_id, locatorHash: row.locator_hash,
    minimumReadVersion: row.minimum_read_version, minimumWriteVersion: row.minimum_write_version
  };
}
