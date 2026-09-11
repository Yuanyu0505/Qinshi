import { authenticateDevice, hashAuthValue, hashLocator, lookupSpace, verifyPasswordAuth, verifyRecoveryAuth } from './auth.js';
import { SyncError } from './errors.js';
import { readJson, requireVersion } from './validation.js';

// Shared protocol names are centralized here; raw credentials are hashed before storage.
const FIELDS = {
  create: ['syncCode', 'spaceId', 'kdf', 'authKey', 'passwordWrappedMaster', 'recoveryAuthKey', 'recoveryWrappedMaster', 'device', 'appVersion'],
  pair: ['authKey', 'device', 'appVersion'],
  recover: ['recoveryAuthKey', 'newAuthKey', 'newPasswordWrappedMaster', 'newRecoveryAuthKey', 'newRecoveryWrappedMaster', 'device', 'appVersion'],
  password: ['authKey', 'newAuthKey', 'newPasswordWrappedMaster', 'appVersion'],
  'recovery-key': ['authKey', 'newRecoveryAuthKey', 'newRecoveryWrappedMaster', 'appVersion'],
  delete: ['authKey', 'recoveryAuthKey', 'confirmation', 'appVersion']
};

function requireObject(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) {
    throw new SyncError('INVALID_REQUEST');
  }
}

function base64url(value, minimumBytes, maximumBytes = minimumBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)
    || value.length > Math.ceil(maximumBytes * 4 / 3)) throw new SyncError('INVALID_REQUEST');
  let bytes;
  try { bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/')); }
  catch { throw new SyncError('INVALID_REQUEST'); }
  const canonical = btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (bytes.length < minimumBytes || bytes.length > maximumBytes || canonical !== value) throw new SyncError('INVALID_REQUEST');
}

function requireId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new SyncError('INVALID_REQUEST');
}

function requireBlob(value, wrapped = true) {
  requireObject(value, ['version', 'algorithm', 'iv', 'ciphertext']);
  if (value.version !== 1 || value.algorithm !== 'AES-256-GCM') throw new SyncError('INVALID_REQUEST');
  base64url(value.iv, 12);
  base64url(value.ciphertext, wrapped ? 48 : 16, wrapped ? 48 : 4096);
}

function requireDevice(value) {
  requireObject(value, ['deviceId', 'deviceToken', 'encryptedName']);
  requireId(value.deviceId);
  base64url(value.deviceToken, 32);
  requireBlob(value.encryptedName, false);
}

function requireKdf(value) {
  requireObject(value, ['version', 'kdf', 'hash', 'iterations', 'salt']);
  if (value.version !== 1 || value.kdf !== 'PBKDF2-HMAC-SHA-256' || value.hash !== 'SHA-256' || value.iterations !== 600000) throw new SyncError('INVALID_REQUEST');
  base64url(value.salt, 16);
}

function validateBody(body, operation, request) {
  const fields = operation === 'delete'
    ? [Object.hasOwn(body, 'authKey') ? 'authKey' : 'recoveryAuthKey', 'confirmation', 'appVersion']
    : FIELDS[operation];
  requireObject(body, fields);
  if (body.appVersion !== request.headers.get('X-Qin-App-Version')) throw new SyncError('INVALID_REQUEST');
  for (const field of ['authKey', 'recoveryAuthKey', 'newAuthKey', 'newRecoveryAuthKey']) {
    if (Object.hasOwn(body, field)) base64url(body[field], 32);
  }
  for (const field of ['passwordWrappedMaster', 'recoveryWrappedMaster', 'newPasswordWrappedMaster', 'newRecoveryWrappedMaster']) {
    if (Object.hasOwn(body, field)) requireBlob(body[field]);
  }
  if (Object.hasOwn(body, 'device')) requireDevice(body.device);
  if (operation === 'create') {
    requireId(body.spaceId);
    requireKdf(body.kdf);
    // At least 130 random Base32 bits; lookup still accepts shorter unknown codes generically.
    if (typeof body.syncCode !== 'string' || body.syncCode.trim().replace(/[ -]/g, '').length < 26) throw new SyncError('INVALID_REQUEST');
  }
  if (operation === 'delete' && body.confirmation !== '永久删除同步空间') throw new SyncError('INVALID_REQUEST');
}

function requireSpaceVersion(request, space, operation) {
  requireVersion(request, { MINIMUM_READ_VERSION: space.minimum_read_version, MINIMUM_WRITE_VERSION: space.minimum_write_version }, operation);
}

function binding(space, deviceId) {
  return { spaceId: space.id, deviceId, minimumReadVersion: space.minimum_read_version, minimumWriteVersion: space.minimum_write_version };
}

async function runBatch(db, statements) {
  try { return await db.batch(statements); }
  catch (error) {
    // Only known schema conflicts are translated. Quota/other errors retain the global fail-closed mapping.
    for (let current = error, seen = new Set(); current && !seen.has(current); current = current.cause) {
      seen.add(current);
      if (/NOT NULL constraint failed: sync_spaces.auth_digest/.test(current.message || '')) throw new SyncError('AUTH_FAILED');
      if (/UNIQUE constraint failed: (?:sync_spaces|devices)\./.test(current.message || '')) throw new SyncError('INVALID_REQUEST');
    }
    throw error;
  }
}

function insertDevice(db, spaceId, device, tokenDigest, now) {
  return db.prepare(`INSERT INTO devices (id, space_id, token_digest, encrypted_name_json, revoked_at, last_used_at, last_uploaded_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)`).bind(device.deviceId, spaceId, tokenDigest, JSON.stringify(device.encryptedName), now, now);
}

// The guard runs in the same transaction as every mutation. A credential change or
// revocation after the asynchronous pre-check must abort the entire batch.
function mutationGuard(db, space, deviceId = null) {
  return db.prepare(`UPDATE sync_spaces SET auth_digest = CASE WHEN
    auth_digest = ? AND recovery_auth_digest = ? AND password_wrapped_master_json = ? AND recovery_wrapped_master_json = ?
    AND (? IS NULL OR EXISTS (SELECT 1 FROM devices WHERE id = ? AND space_id = sync_spaces.id AND revoked_at IS NULL))
    THEN auth_digest ELSE NULL END WHERE id = ?`)
    .bind(space.auth_digest, space.recovery_auth_digest, space.password_wrapped_master_json, space.recovery_wrapped_master_json, deviceId, deviceId, space.id);
}

export async function handleSpaceRoute(request, env, operation, encodedCode) {
  const method = operation === 'parameters' ? 'GET' : operation === 'delete' ? 'DELETE' : 'POST';
  if (request.method !== method) throw new SyncError('METHOD_NOT_ALLOWED');
  const body = operation === 'parameters' ? null : await readJson(request, FIELDS[operation]);
  requireVersion(request, env, operation === 'parameters' ? 'read' : 'write');
  let locatorHash;
  if (encodedCode !== undefined) {
    let syncCode;
    try { syncCode = decodeURIComponent(encodedCode); }
    catch { throw new SyncError('INVALID_REQUEST'); }
    locatorHash = await hashLocator(syncCode);
  }

  if (operation === 'create') {
    validateBody(body, operation, request);
    locatorHash = await hashLocator(body.syncCode);
    const [authDigest, recoveryDigest, tokenDigest] = await Promise.all([
      hashAuthValue(body.authKey), hashAuthValue(body.recoveryAuthKey), hashAuthValue(body.device.deviceToken)
    ]);
    const now = Date.now();
    await runBatch(env.DB, [
      env.DB.prepare(`INSERT INTO sync_spaces (id, locator_hash, kdf_json, auth_digest, password_wrapped_master_json,
        recovery_auth_digest, recovery_wrapped_master_json, minimum_read_version, minimum_write_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(body.spaceId, locatorHash, JSON.stringify(body.kdf), authDigest,
        JSON.stringify(body.passwordWrappedMaster), recoveryDigest, JSON.stringify(body.recoveryWrappedMaster),
        env.MINIMUM_READ_VERSION, env.MINIMUM_WRITE_VERSION, now, now),
      insertDevice(env.DB, body.spaceId, body.device, tokenDigest, now)
    ]);
    return Response.json(binding({ id: body.spaceId, minimum_read_version: env.MINIMUM_READ_VERSION, minimum_write_version: env.MINIMUM_WRITE_VERSION }, body.device.deviceId), { status: 201 });
  }

  if (operation === 'parameters') {
    const space = await lookupSpace(locatorHash, env);
    requireSpaceVersion(request, space, 'read');
    return Response.json({ spaceId: space.id, kdf: JSON.parse(space.kdf_json), passwordWrappedMaster: JSON.parse(space.password_wrapped_master_json),
      recoveryWrappedMaster: JSON.parse(space.recovery_wrapped_master_json), minimumReadVersion: space.minimum_read_version, minimumWriteVersion: space.minimum_write_version });
  }

  let deviceContext;
  if (operation !== 'pair' && operation !== 'recover') {
    // Validate deletion's exactly-one authenticator/confirmation before checking it.
    if (operation === 'delete') validateBody(body, operation, request);
    deviceContext = await authenticateDevice(request, env);
    locatorHash = deviceContext.locatorHash;
  }
  // Preserve Task 6's generic auth failure/cooldown before deeper business validation.
  const recovery = operation === 'recover' || (operation === 'delete' && Object.hasOwn(body, 'recoveryAuthKey'));
  const space = await (recovery ? verifyRecoveryAuth(locatorHash, body.recoveryAuthKey, env) : verifyPasswordAuth(locatorHash, body.authKey, env));
  requireSpaceVersion(request, space, 'write');
  validateBody(body, operation, request);
  const newRecoveryDigest = body.newRecoveryAuthKey === undefined ? null : await hashAuthValue(body.newRecoveryAuthKey);
  if (newRecoveryDigest === space.recovery_auth_digest) throw new SyncError('INVALID_REQUEST');
  const now = Date.now();
  const statements = [mutationGuard(env.DB, space, deviceContext?.deviceId)];
  if (operation === 'pair' || operation === 'recover') {
    statements.push(insertDevice(env.DB, space.id, body.device, await hashAuthValue(body.device.deviceToken), now));
  }
  if (operation === 'recover') {
    statements.push(
      env.DB.prepare(`UPDATE sync_spaces SET auth_digest = ?, password_wrapped_master_json = ?, recovery_auth_digest = ?, recovery_wrapped_master_json = ?, updated_at = ? WHERE id = ?`)
        .bind(await hashAuthValue(body.newAuthKey), JSON.stringify(body.newPasswordWrappedMaster), newRecoveryDigest, JSON.stringify(body.newRecoveryWrappedMaster), now, space.id),
      env.DB.prepare('UPDATE devices SET revoked_at = ? WHERE space_id = ? AND id <> ? AND revoked_at IS NULL').bind(now, space.id, body.device.deviceId)
    );
  } else if (operation === 'password') {
    statements.push(env.DB.prepare('UPDATE sync_spaces SET auth_digest = ?, password_wrapped_master_json = ?, updated_at = ? WHERE id = ?')
      .bind(await hashAuthValue(body.newAuthKey), JSON.stringify(body.newPasswordWrappedMaster), now, space.id));
  } else if (operation === 'recovery-key') {
    statements.push(env.DB.prepare('UPDATE sync_spaces SET recovery_auth_digest = ?, recovery_wrapped_master_json = ?, updated_at = ? WHERE id = ?')
      .bind(newRecoveryDigest, JSON.stringify(body.newRecoveryWrappedMaster), now, space.id));
  } else if (operation === 'delete') {
    statements.push(env.DB.prepare('DELETE FROM sync_spaces WHERE id = ?').bind(space.id),
      env.DB.prepare('DELETE FROM auth_throttles WHERE locator_hash = ?').bind(locatorHash));
  }
  const result = await runBatch(env.DB, statements);
  if (result[0].meta.changes !== 1) throw new SyncError('AUTH_FAILED');
  return operation === 'delete' ? new Response(null, { status: 204 }) : Response.json(binding(space, body.device?.deviceId || deviceContext.deviceId));
}
