import { constantTimeEqual } from './auth.js';
import { SyncError } from './errors.js';
import { requireVersion } from './validation.js';

// Response-loss retries are supported for 24 hours. At most 100 expired records are
// removed per successful mutation, in that mutation's transaction; no scheduler is needed.
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000;

async function sha256(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function requireIdempotencyKey(request) {
  const key = request.headers.get('Idempotency-Key');
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new SyncError('INVALID_REQUEST');
  return key;
}

export async function lifecycleProof(request, operation, body, locatorHash, key) {
  const authorization = request.headers.get('Authorization') || '';
  // Public routes use the locator hash. Device-scoped routes can still be located
  // after deletion, without treating a device ID or the idempotency key as proof.
  const deviceId = /^Device ([A-Za-z0-9_-]{1,128})\.[A-Za-z0-9_-]{1,256}$/.exec(authorization)?.[1] || null;
  const scopeHash = await sha256(canonical([request.method, operation, locatorHash || deviceId]));
  const keyHash = await sha256(key);
  const authorizationDigest = await sha256(authorization);
  // This is provisional until business validation. Only a completely validated
  // committed request can populate the ledger, so an exact digest match proves the
  // replay has the same validated shape even if its old credentials are now invalid.
  const requestDigest = await sha256(canonical({ method: request.method, scopeHash,
    body: operation === 'create' ? { ...body, syncCode: locatorHash } : body,
    authorizationDigest, appVersion: request.headers.get('X-Qin-App-Version') }));
  return { scopeHash, keyHash, requestDigest };
}

function digestEqual(left, right) {
  const bytes = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
    ? Uint8Array.from(value.match(/../g), part => parseInt(part, 16)) : new Uint8Array(0);
  return constantTimeEqual(bytes(left), bytes(right));
}

export function lifecycleResponse(status, responseJson) {
  return new Response(responseJson, { status, ...(responseJson === null ? {} : { headers: { 'Content-Type': 'application/json' } }) });
}

export async function replayLifecycle(request, env, proof) {
  const saved = await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE scope_hash = ? AND key_hash = ? AND expires_at > ?')
    .bind(proof.scopeHash, proof.keyHash, Date.now()).first();
  if (!saved) return null;
  if (!digestEqual(saved.request_digest, proof.requestDigest)) throw new SyncError('IDEMPOTENCY_CONFLICT');
  // Deployment gates already ran. Enforce stored and (if still present) current
  // space floors too, including response-loss retries after a deployment upgrade.
  const current = await env.DB.prepare('SELECT minimum_read_version, minimum_write_version FROM sync_spaces WHERE id = ?').bind(saved.space_id).first();
  for (const limits of [saved, current].filter(Boolean)) {
    requireVersion(request, { MINIMUM_READ_VERSION: limits.minimum_read_version, MINIMUM_WRITE_VERSION: limits.minimum_write_version }, 'write');
  }
  return lifecycleResponse(saved.status, saved.response_json);
}

export function lifecycleCommitPrefix(db, proof, space, status, responseJson, now) {
  // The claim already contains the sanitized final response. D1 batch atomicity
  // makes it invisible unless every business statement succeeds. A UNIQUE loser
  // rolls back its entire batch and subsequently reads the winner's committed row.
  return [
    db.prepare('DELETE FROM lifecycle_idempotency WHERE scope_hash = ? AND key_hash = ? AND expires_at <= ?')
      .bind(proof.scopeHash, proof.keyHash, now),
    db.prepare('DELETE FROM lifecycle_idempotency WHERE rowid IN (SELECT rowid FROM lifecycle_idempotency WHERE expires_at <= ? ORDER BY expires_at LIMIT 99)').bind(now),
    db.prepare(`INSERT INTO lifecycle_idempotency (scope_hash, key_hash, request_digest, status, response_json, space_id,
      minimum_read_version, minimum_write_version, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(proof.scopeHash, proof.keyHash, proof.requestDigest, status, responseJson, space.id,
        space.minimum_read_version, space.minimum_write_version, now, now + REPLAY_TTL_MS)
  ];
}
