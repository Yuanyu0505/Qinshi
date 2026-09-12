import { env } from 'cloudflare:workers';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { authenticateDevice } from '../src/auth.js';

const appVersion = '1.0.39';
const origin = 'https://yuanyu0505.github.io';
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = size => encode(crypto.getRandomValues(new Uint8Array(size)));
const blob = (size = 48) => ({ version: 1, algorithm: 'AES-256-GCM', iv: random(12), ciphertext: random(size) });
const registration = () => ({ deviceId: crypto.randomUUID(), deviceToken: random(32), encryptedName: blob(40) });
const newSpace = () => ({
  syncCode: Array.from(crypto.getRandomValues(new Uint8Array(32)), value => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[value % 32]).join(''),
  spaceId: crypto.randomUUID(),
  kdf: { version: 1, kdf: 'PBKDF2-HMAC-SHA-256', hash: 'SHA-256', iterations: 600000, salt: random(16) },
  authKey: random(32), passwordWrappedMaster: blob(), recoveryAuthKey: random(32),
  recoveryWrappedMaster: blob(), device: registration(), appVersion
});
const recoveryFor = space => ({
  recoveryAuthKey: space.recoveryAuthKey, newAuthKey: random(32), newPasswordWrappedMaster: blob(),
  newRecoveryAuthKey: random(32), newRecoveryWrappedMaster: blob(), device: registration(), appVersion
});
let space;
let logs;

function request(path, body, { method = 'POST', device, headers = {} } = {}) {
  return new Request(`https://worker.test${path}`, { method, headers: {
    Origin: origin, 'Content-Type': 'application/json', 'X-Qin-App-Version': appVersion,
    'Idempotency-Key': crypto.randomUUID(),
    ...(device ? { Authorization: `Device ${device.deviceId}.${device.deviceToken}` } : {}), ...headers
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const send = (path, body, options) => worker.fetch(request(path, body, options), env, {});
const create = body => send('/v1/spaces', body || space);
const pair = (authKey = space.authKey, device = registration(), code = space.syncCode) => send(`/v1/spaces/${code}/pair`, { authKey, device, appVersion });
const parameters = (code = space.syncCode, headers) => send(`/v1/spaces/${code}/parameters`, undefined, { method: 'GET', headers });
const bound = device => authenticateDevice(request('/v1/devices', undefined, { method: 'GET', device }), env);
const passwordBody = () => ({ authKey: space.authKey, newAuthKey: random(32), newPasswordWrappedMaster: blob(), appVersion });
const rotationBody = () => ({ authKey: space.authKey, newRecoveryAuthKey: random(32), newRecoveryWrappedMaster: blob(), appVersion });
const eraseBody = () => ({ authKey: space.authKey, confirmation: '永久删除同步空间', appVersion });
const row = () => env.DB.prepare('SELECT * FROM sync_spaces WHERE id = ?').bind(space.spaceId).first();
async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function dump() {
  const tables = ['sync_spaces', 'devices', 'auth_throttles', 'snapshots', 'snapshot_chunks', 'upload_sessions', 'lifecycle_idempotency'];
  return JSON.stringify(await Promise.all(tables.map(table => env.DB.prepare(`SELECT * FROM ${table}`).all())));
}

beforeEach(async () => {
  logs = vi.spyOn(console, 'info').mockImplementation(() => {});
  await env.DB.batch([env.DB.prepare('DELETE FROM sync_spaces'), env.DB.prepare('DELETE FROM auth_throttles'), env.DB.prepare('DELETE FROM lifecycle_idempotency')]);
  space = newSpace();
});
afterEach(() => vi.restoreAllMocks());

it('creates the exact public binding and stores only digests and encrypted records', async () => {
  const response = await create();
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ spaceId: space.spaceId, deviceId: space.device.deviceId, minimumReadVersion: appVersion, minimumWriteVersion: appVersion });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  const stored = await row();
  expect(stored).toMatchObject({ locator_hash: await digest(space.syncCode), auth_digest: await digest(space.authKey), recovery_auth_digest: await digest(space.recoveryAuthKey) });
  expect(JSON.parse(stored.kdf_json)).toEqual(space.kdf);
  expect(JSON.parse(stored.password_wrapped_master_json)).toEqual(space.passwordWrappedMaster);
  const device = await env.DB.prepare('SELECT * FROM devices').first();
  expect(device.token_digest).toBe(await digest(space.device.deviceToken));
  expect(JSON.parse(device.encrypted_name_json)).toEqual(space.device.encryptedName);
  const persisted = await dump();
  for (const secret of [space.syncCode, space.authKey, space.recoveryAuthKey, space.device.deviceToken]) {
    expect(persisted).not.toContain(secret);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  }
  await expect(bound(space.device)).resolves.toMatchObject({ spaceId: space.spaceId });
});

it('returns only public parameters for normalized grouped codes', async () => {
  await create();
  const grouped = encodeURIComponent(` ${space.syncCode.slice(0, 8).toLowerCase()}-${space.syncCode.slice(8).toLowerCase()} `);
  const response = await parameters(grouped);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ spaceId: space.spaceId, kdf: space.kdf, passwordWrappedMaster: space.passwordWrappedMaster,
    recoveryWrappedMaster: space.recoveryWrappedMaster, minimumReadVersion: appVersion, minimumWriteVersion: appVersion });
  expect(JSON.stringify(logs.mock.calls)).not.toContain(grouped);
});

it('uses the generic authentication failure and shared cooldown for unknown parameters', async () => {
  await create();
  const missing = await parameters('UNKNOWNCODE');
  const wrong = await pair(random(32));
  expect(missing.status).toBe(401);
  expect(await missing.json()).toEqual(await wrong.json());
  expect((await parameters('UNKNOWNCODE')).status).toBe(401);
  expect((await parameters('UNKNOWNCODE')).status).toBe(429);
  await pair(random(32));
  expect((await parameters()).status).toBe(429);
});

it('pairs a new digest-backed device without replacing existing devices', async () => {
  await create();
  const device = registration();
  const response = await pair(space.authKey, device);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ spaceId: space.spaceId, deviceId: device.deviceId, minimumReadVersion: appVersion, minimumWriteVersion: appVersion });
  await expect(bound(device)).resolves.toMatchObject({ deviceId: device.deviceId });
  await expect(bound(space.device)).resolves.toMatchObject({ deviceId: space.device.deviceId });
});

it('changes the password wrapper and authenticator while retaining every device and recovery key', async () => {
  await create();
  const second = registration();
  await pair(space.authKey, second);
  const input = passwordBody();
  const response = await send('/v1/security/password', input, { device: space.device });
  expect(response.status).toBe(200);
  expect((await row()).auth_digest).toBe(await digest(input.newAuthKey));
  expect(JSON.parse((await row()).password_wrapped_master_json)).toEqual(input.newPasswordWrappedMaster);
  expect((await row()).recovery_auth_digest).toBe(await digest(space.recoveryAuthKey));
  expect(JSON.parse((await row()).recovery_wrapped_master_json)).toEqual(space.recoveryWrappedMaster);
  expect((await pair(space.authKey)).status).toBe(401);
  expect((await pair(input.newAuthKey)).status).toBe(200);
  await expect(bound(space.device)).resolves.toBeDefined();
  await expect(bound(second)).resolves.toBeDefined();
});

it('rotates only the recovery wrapper and authenticator and immediately invalidates the old recovery key', async () => {
  await create();
  const input = rotationBody();
  const response = await send('/v1/security/recovery-key', input, { device: space.device });
  expect(response.status).toBe(200);
  const stored = await row();
  expect(stored.auth_digest).toBe(await digest(space.authKey));
  expect(JSON.parse(stored.password_wrapped_master_json)).toEqual(space.passwordWrappedMaster);
  expect(stored.recovery_auth_digest).toBe(await digest(input.newRecoveryAuthKey));
  expect(JSON.parse(stored.recovery_wrapped_master_json)).toEqual(input.newRecoveryWrappedMaster);
  expect((await send(`/v1/spaces/${space.syncCode}/recover`, recoveryFor(space))).status).toBe(401);
  await expect(bound(space.device)).resolves.toBeDefined();
  const reset = recoveryFor({ recoveryAuthKey: input.newRecoveryAuthKey });
  expect((await send(`/v1/spaces/${space.syncCode}/recover`, reset)).status).toBe(200);
});

it('recovery replaces both credential families and revokes all old tokens while registering only the new device', async () => {
  await create();
  const second = registration();
  await pair(space.authKey, second);
  const input = recoveryFor(space);
  const response = await send(`/v1/spaces/${space.syncCode}/recover`, input);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ spaceId: space.spaceId, deviceId: input.device.deviceId, minimumReadVersion: appVersion, minimumWriteVersion: appVersion });
  for (const device of [space.device, second]) {
    expect((await send('/v1/devices', undefined, { method: 'GET', device })).status).toBe(401);
  }
  await expect(bound(input.device)).resolves.toMatchObject({ spaceId: space.spaceId });
  const stored = await row();
  expect(stored.auth_digest).toBe(await digest(input.newAuthKey));
  expect(stored.recovery_auth_digest).toBe(await digest(input.newRecoveryAuthKey));
  expect(JSON.parse(stored.password_wrapped_master_json)).toEqual(input.newPasswordWrappedMaster);
  expect(JSON.parse(stored.recovery_wrapped_master_json)).toEqual(input.newRecoveryWrappedMaster);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL').first()).count).toBe(1);
  expect((await pair(space.authKey)).status).toBe(401);
  expect((await pair(input.newAuthKey)).status).toBe(200);
  expect((await send(`/v1/spaces/${space.syncCode}/recover`, recoveryFor(space))).status).toBe(401);
  const persisted = await dump();
  for (const secret of [input.recoveryAuthKey, input.newAuthKey, input.newRecoveryAuthKey, input.device.deviceToken]) {
    expect(persisted).not.toContain(secret);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(secret);
  }
});

it('rolls creation back completely if device registration conflicts', async () => {
  await create();
  const another = newSpace();
  another.device.deviceToken = space.device.deviceToken;
  expect((await create(another)).status).toBe(400);
  expect(await env.DB.prepare('SELECT * FROM sync_spaces WHERE id = ?').bind(another.spaceId).first()).toBeNull();
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first()).count).toBe(1);
});

it('rolls recovery back without changing credentials or revocation when the new registration conflicts', async () => {
  await create();
  const original = await row();
  const input = { ...recoveryFor(space), device: space.device };
  expect((await send(`/v1/spaces/${space.syncCode}/recover`, input)).status).toBe(400);
  expect(await row()).toEqual(original);
  await expect(bound(space.device)).resolves.toBeDefined();
});

it.each(['password', 'recovery-key'])('requires device authorization and a fresh password for %s changes', async route => {
  await create();
  const input = route === 'password' ? passwordBody() : rotationBody();
  const original = await row();
  expect((await send(`/v1/security/${route}`, input)).status).toBe(401);
  expect((await send(`/v1/security/${route}`, { ...input, authKey: random(32) }, { device: space.device })).status).toBe(401);
  expect(await row()).toEqual(original);
});

it.each(['authKey', 'recoveryAuthKey'])('permanently deletes only the authenticated space with a fresh %s', async key => {
  expect((await create()).status).toBe(201);
  const other = newSpace();
  await create(other);
  const snapshotId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO snapshots VALUES (?, ?, ?, NULL, ?, ?, 1, 1, ?, ?, ?, ?, 16, 1, ?, ?, 1, NULL)')
    .bind(snapshotId, space.spaceId, space.device.deviceId, 'staged', appVersion, 'identity', '2026-09-11T00:00:00Z', random(32), random(12), random(32), JSON.stringify(blob())).run();
  await env.DB.prepare('INSERT INTO snapshot_chunks VALUES (?, 0, ?, ?)').bind(snapshotId, new Uint8Array(16), random(32)).run();
  await env.DB.prepare('INSERT INTO upload_sessions VALUES (?, ?, ?, ?, ?, ?, ?, 1, 16, ?, ?, NULL, 2, 1)')
    .bind(crypto.randomUUID(), space.spaceId, space.device.deviceId, snapshotId, 'upload', crypto.randomUUID(), '{}', random(32), 'pending').run();
  const response = await send('/v1/spaces/current', { [key]: space[key], confirmation: '永久删除同步空间', appVersion }, { method: 'DELETE', device: space.device });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(await row()).toBeNull();
  for (const table of ['snapshots', 'snapshot_chunks', 'upload_sessions']) expect((await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count).toBe(0);
  await expect(bound(space.device)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(bound(other.device)).resolves.toMatchObject({ spaceId: other.spaceId });
  expect((await parameters()).status).toBe(401);
});

it('refuses deletion without exact confirmation, a unique fresh credential, and an active device', async () => {
  await create();
  expect((await send('/v1/spaces/current', eraseBody(), { method: 'DELETE' })).status).toBe(401);
  for (const input of [
    { ...eraseBody(), confirmation: '永久删除同步空间 ' },
    { ...eraseBody(), recoveryAuthKey: space.recoveryAuthKey },
    { confirmation: '永久删除同步空间', appVersion }
  ]) expect((await send('/v1/spaces/current', input, { method: 'DELETE', device: space.device })).status).toBe(400);
  expect((await send('/v1/spaces/current', { ...eraseBody(), authKey: random(32) }, { method: 'DELETE', device: space.device })).status).toBe(401);
  expect(await row()).not.toBeNull();
});

// Each mutation catches an omitted nested field/length/type check before any write.
it.each([
  ['plaintext password', body => { body.password = 'personal-value'; }],
  ['missing recovery wrapper', body => { delete body.recoveryWrappedMaster; }],
  ['non UUID space ID', body => { body.spaceId = 'not-a-uuid'; }],
  ['non v4 device ID', body => { body.device.deviceId = '11111111-1111-1111-8111-111111111111'; }],
  ['short locator', body => { body.syncCode = 'ABCDEF'; }],
  ['weak KDF', body => { body.kdf.iterations = 1; }],
  ['extra KDF field', body => { body.kdf.password = 'personal-value'; }],
  ['wrong salt size', body => { body.kdf.salt = random(15); }],
  ['padded authenticator', body => { body.authKey += '='; }],
  ['short authenticator', body => { body.authKey = random(31); }],
  ['short recovery authenticator', body => { body.recoveryAuthKey = random(31); }],
  ['short device token', body => { body.device.deviceToken = random(31); }],
  ['extra device field', body => { body.device.name = 'personal-value'; }],
  ['wrong wrapper algorithm', body => { body.passwordWrappedMaster.algorithm = 'AES-128-GCM'; }],
  ['short IV', body => { body.passwordWrappedMaster.iv = random(11); }],
  ['wrong wrapped key size', body => { body.passwordWrappedMaster.ciphertext = random(47); }],
  ['plaintext wrapper field', body => { body.recoveryWrappedMaster.masterKey = 'personal-value'; }],
  ['short encrypted name', body => { body.device.encryptedName.ciphertext = random(15); }],
  ['noncanonical base64url', body => { body.kdf.salt = 'AAAAAAAAAAAAAAAAAAAAAB'; }],
  ['body version mismatch', body => { body.appVersion = '1.0.38'; }]
])('rejects create input with %s without persisting user values', async (_label, mutate) => {
  mutate(space);
  const response = await create();
  expect(response.status).toBe(400);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM sync_spaces').first()).count).toBe(0);
  expect(await dump()).not.toContain('personal-value');
  expect(JSON.stringify(logs.mock.calls)).not.toContain('personal-value');
});

it('keeps lifecycle version, origin, method, JSON size and content-type gates', async () => {
  expect((await send('/v1/spaces', space, { headers: { 'X-Qin-App-Version': '1.0.38' } })).status).toBe(426);
  expect((await send('/v1/spaces', space, { headers: { Origin: 'https://evil.test' } })).status).toBe(403);
  expect((await send('/v1/spaces', undefined, { method: 'GET' })).status).toBe(405);
  expect((await send('/v1/spaces', space, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415);
  expect((await send('/v1/spaces', { ...space, authKey: 'a'.repeat(65536) })).status).toBe(413);
  await create();
  expect((await parameters(space.syncCode, { 'X-Qin-App-Version': '1.0.38' })).status).toBe(426);
});

it('enforces per-space read and write floors as well as deployment floors', async () => {
  await create();
  await env.DB.prepare('UPDATE sync_spaces SET minimum_read_version = ?, minimum_write_version = ?').bind('1.0.40', '1.0.41').run();
  expect((await parameters()).status).toBe(426);
  expect((await pair()).status).toBe(426);
  expect((await send('/v1/security/password', passwordBody(), { device: space.device })).status).toBe(426);
});

it('keeps quota exhaustion fail-closed and redacted during lifecycle writes', async () => {
  const failingEnv = { ...env, DB: { prepare: query => env.DB.prepare(query), batch() { throw new Error('SQLITE_FULL private-value'); } } };
  const response = await worker.fetch(request('/v1/spaces', space), failingEnv, {});
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('FREE_QUOTA_EXHAUSTED');
  expect(await row()).toBeNull();
  expect(JSON.stringify(logs.mock.calls)).not.toContain('private-value');
});

// Auth uses two D1 batches; interleave a real competing operation immediately before
// the following mutation batch. Only scheduling is controlled; every query runs in D1.
function interleaveMutation(action) {
  let batches = 0;
  return { ...env, DB: {
    prepare: query => env.DB.prepare(query),
    async batch(statements) {
      batches += 1;
      if (batches === 3) await action();
      return env.DB.batch(statements);
    }
  } };
}

it('rejects a pair whose password was rotated after the credential pre-check', async () => {
  await create();
  const registrationInput = registration();
  const changed = passwordBody();
  const racingEnv = interleaveMutation(async () => {
    expect((await send('/v1/security/password', changed, { device: space.device })).status).toBe(200);
  });
  const response = await worker.fetch(request(`/v1/spaces/${space.syncCode}/pair`, { authKey: space.authKey, device: registrationInput, appVersion }), racingEnv, {});
  expect(response.status).toBe(401);
  expect((await row()).auth_digest).toBe(await digest(changed.newAuthKey));
  expect(await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(registrationInput.deviceId).first()).toBeNull();
});

it('admits only one recovery when two requests verified the same previous recovery credential', async () => {
  await create();
  const stale = recoveryFor(space);
  const winner = recoveryFor(space);
  const racingEnv = interleaveMutation(async () => {
    expect((await send(`/v1/spaces/${space.syncCode}/recover`, winner)).status).toBe(200);
  });
  const response = await worker.fetch(request(`/v1/spaces/${space.syncCode}/recover`, stale), racingEnv, {});
  expect(response.status).toBe(401);
  expect((await row()).auth_digest).toBe(await digest(winner.newAuthKey));
  expect(await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(stale.device.deviceId).first()).toBeNull();
  await expect(bound(winner.device)).resolves.toBeDefined();
  await expect(bound(space.device)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
});

it.each(['password', 'recovery-key', 'delete'])('rejects %s if the authorizing device was revoked before the transaction', async operation => {
  await create();
  const original = await row();
  const body = operation === 'password' ? passwordBody() : operation === 'recovery-key' ? rotationBody() : eraseBody();
  const path = operation === 'delete' ? '/v1/spaces/current' : `/v1/security/${operation}`;
  const racingEnv = interleaveMutation(() => env.DB.prepare('UPDATE devices SET revoked_at = 1 WHERE id = ?').bind(space.device.deviceId).run());
  const response = await worker.fetch(request(path, body, { device: space.device, method: operation === 'delete' ? 'DELETE' : 'POST' }), racingEnv, {});
  expect(response.status).toBe(401);
  expect(await row()).toEqual(original);
});

it('rolls back wrappers, new registration and old-token revocation if a later D1 statement fails', async () => {
  await create();
  const original = await row();
  const input = recoveryFor(space);
  let batches = 0;
  const failingEnv = { ...env, DB: {
    prepare: query => env.DB.prepare(query),
    batch(statements) {
      batches += 1;
      return env.DB.batch(batches === 3
        ? [...statements, env.DB.prepare('UPDATE sync_spaces SET kdf_json = NULL WHERE id = ?').bind(space.spaceId)]
        : statements);
    }
  } };
  const response = await worker.fetch(request(`/v1/spaces/${space.syncCode}/recover`, input), failingEnv, {});
  expect(response.status).toBe(500);
  expect(await row()).toEqual(original);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first()).count).toBe(1);
  await expect(bound(space.device)).resolves.toBeDefined();
});

it('does not reset authentication failure counts during successful public parameter reads', async () => {
  await create();
  expect((await pair(random(32))).status).toBe(401);
  expect((await parameters()).status).toBe(200);
  expect((await env.DB.prepare('SELECT failure_count FROM auth_throttles').first()).failure_count).toBe(1);
  expect((await pair(random(32))).status).toBe(401);
  expect((await parameters()).status).toBe(429);
});

it('rejects a duplicate normalized locator without modifying the original space', async () => {
  await create();
  const original = await row();
  const duplicate = newSpace();
  duplicate.syncCode = ` ${space.syncCode.toLowerCase()} `;
  expect((await create(duplicate)).status).toBe(400);
  expect(await row()).toEqual(original);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first()).count).toBe(1);
});

it.each(['pair', 'recover', 'password', 'recovery-key', 'delete'])('rejects missing and unknown fields for %s without business state changes', async operation => {
  await create();
  const original = await row();
  const body = operation === 'pair' ? { authKey: space.authKey, device: registration(), appVersion }
    : operation === 'recover' ? recoveryFor(space)
      : operation === 'password' ? passwordBody() : operation === 'recovery-key' ? rotationBody() : eraseBody();
  const path = ['pair', 'recover'].includes(operation) ? `/v1/spaces/${space.syncCode}/${operation}`
    : operation === 'delete' ? '/v1/spaces/current' : `/v1/security/${operation}`;
  const options = { device: space.device, method: operation === 'delete' ? 'DELETE' : 'POST' };
  expect((await send(path, { ...body, password: 'personal-value' }, options)).status).toBe(400);
  const incomplete = { ...body };
  delete incomplete.appVersion;
  expect((await send(path, incomplete, options)).status).toBe(400);
  expect(await row()).toEqual(original);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first()).count).toBe(1);
  expect(await dump()).not.toContain('personal-value');
});

it.each(['recovery-key', 'recover'])('refuses %s that would leave the old recovery credential valid', async operation => {
  await create();
  const original = await row();
  const input = operation === 'recover' ? recoveryFor(space) : rotationBody();
  input.newRecoveryAuthKey = space.recoveryAuthKey;
  const path = operation === 'recover' ? `/v1/spaces/${space.syncCode}/recover` : '/v1/security/recovery-key';
  const response = await send(path, input, { device: space.device });
  expect(response.status).toBe(400);
  expect(await row()).toEqual(original);
  await expect(bound(space.device)).resolves.toBeDefined();
});

const writes = ['create', 'pair', 'recover', 'password', 'recovery-key', 'delete'];
async function operationRequest(operation) {
  if (operation !== 'create') expect((await create()).status).toBe(201);
  const body = operation === 'create' ? space : operation === 'pair' ? { authKey: space.authKey, device: registration(), appVersion }
    : operation === 'recover' ? recoveryFor(space) : operation === 'password' ? passwordBody() : operation === 'recovery-key' ? rotationBody() : eraseBody();
  const path = operation === 'create' ? '/v1/spaces' : ['pair', 'recover'].includes(operation) ? `/v1/spaces/${space.syncCode}/${operation}`
    : operation === 'delete' ? '/v1/spaces/current' : `/v1/security/${operation}`;
  const options = { device: space.device, method: operation === 'delete' ? 'DELETE' : 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } };
  return { body, path, options, status: operation === 'create' ? 201 : operation === 'delete' ? 204 : 200 };
}
async function businessState() {
  return JSON.stringify(await Promise.all(['sync_spaces', 'devices', 'snapshots', 'snapshot_chunks', 'upload_sessions']
    .map(async table => (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results)));
}
const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;

it.each(writes)('rejects missing and malformed idempotency keys for %s before mutation', async operation => {
  const input = await operationRequest(operation);
  const before = await businessState();
  for (const key of [null, '', 'contains spaces', 'a'.repeat(129), 'invalid,key']) {
    const req = request(input.path, input.body, input.options);
    if (key === null) req.headers.delete('Idempotency-Key'); else req.headers.set('Idempotency-Key', key);
    const response = await worker.fetch(req, env, {});
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    expect(await businessState()).toBe(before);
  }
});

it.each(writes)('replays committed %s after response loss with the original credential proof and no new mutation', async operation => {
  const input = await operationRequest(operation);
  const first = await send(input.path, input.body, input.options);
  expect(first.status).toBe(input.status);
  const expected = await first.text();
  const committed = await businessState();
  const retry = await send(input.path, reverseKeys(input.body), input.options);
  expect(retry.status).toBe(first.status);
  expect(await retry.text()).toBe(expected);
  expect(retry.headers.get('cache-control')).toBe('no-store');
  expect(retry.headers.get('access-control-allow-origin')).toBe(origin);
  expect(await businessState()).toBe(committed);
});

it.each(writes)('returns idempotency conflict for changed %s body or authorization without changing business state', async operation => {
  const input = await operationRequest(operation);
  expect((await send(input.path, input.body, input.options)).status).toBe(input.status);
  const before = await businessState();
  const changedBody = { ...input.body, [operation === 'recover' ? 'newAuthKey' : 'authKey']: random(32) };
  const changedAuth = { ...input.options, headers: { ...input.options.headers, Authorization: `Device ${space.device.deviceId}.${random(32)}` } };
  for (const response of [await send(input.path, changedBody, input.options), await send(input.path, input.body, changedAuth)]) {
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  }
  expect(await businessState()).toBe(before);
});

it.each(writes)('commits concurrent identical %s requests once and replays the same result to every caller', async operation => {
  const input = await operationRequest(operation);
  const responses = await Promise.all(Array.from({ length: 6 }, () => send(input.path, input.body, input.options)));
  expect(responses.map(response => response.status)).toEqual(Array(6).fill(input.status));
  const bodies = await Promise.all(responses.map(response => response.text()));
  expect(new Set(bodies).size).toBe(1);
  const committed = await businessState();
  expect((await send(input.path, input.body, input.options)).status).toBe(input.status);
  expect(await businessState()).toBe(committed);
  const keyDigest = await digest(input.options.headers['Idempotency-Key']);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM lifecycle_idempotency WHERE key_hash = ?').bind(keyDigest).first()).count).toBe(1);
});

it('normalizes locator spelling before fingerprinting create and pair replays', async () => {
  const input = await operationRequest('create');
  expect((await send(input.path, input.body, input.options)).status).toBe(201);
  expect((await send(input.path, { ...space, syncCode: ` ${space.syncCode.toLowerCase()} ` }, input.options)).status).toBe(201);
  const body = { authKey: space.authKey, device: registration(), appVersion };
  const options = { headers: { 'Idempotency-Key': crypto.randomUUID() } };
  expect((await send(`/v1/spaces/${space.syncCode}/pair`, body, options)).status).toBe(200);
  expect((await send(`/v1/spaces/${encodeURIComponent(` ${space.syncCode.toLowerCase()} `)}/pair`, body, options)).status).toBe(200);
});

it('keeps the same key independent across operation scopes', async () => {
  const input = await operationRequest('create');
  expect((await send(input.path, input.body, input.options)).status).toBe(201);
  expect((await send(`/v1/spaces/${space.syncCode}/pair`, { authKey: space.authKey, device: registration(), appVersion }, input.options)).status).toBe(200);
  const changed = passwordBody();
  expect((await send('/v1/security/password', changed, input.options)).status).toBe(200);
  expect((await send('/v1/security/recovery-key', { ...rotationBody(), authKey: changed.newAuthKey }, input.options)).status).toBe(200);
});

it.each(writes)('rolls back the %s idempotency claim and business mutation if the transaction result write fails', async operation => {
  const input = await operationRequest(operation);
  const before = await businessState();
  let hasClaim = false;
  const failureEnv = { ...env, DB: {
    prepare(query) {
      if (query.startsWith('INSERT INTO lifecycle_idempotency')) hasClaim = true;
      return env.DB.prepare(query);
    },
    batch(statements) {
      // Auth batches are SELECT/DELETE only; fail the transaction by appending a
      // genuine constraint violation whenever the mutation prepares its claim.
      return env.DB.batch(hasClaim ? [...statements, env.DB.prepare("INSERT INTO lifecycle_idempotency (scope_hash, key_hash, request_digest, status, response_json, space_id, minimum_read_version, minimum_write_version, created_at, expires_at) VALUES ('failure-scope', 'failure-key', NULL, 204, NULL, NULL, '1.0.39', '1.0.39', 0, 1)")] : statements);
    }
  } };
  const failed = await worker.fetch(request(input.path, input.body, input.options), failureEnv, {});
  expect(failed.status).toBe(500);
  expect(await businessState()).toBe(before);
  const keyDigest = await digest(input.options.headers['Idempotency-Key']);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM lifecycle_idempotency WHERE key_hash = ?').bind(keyDigest).first()).count).toBe(0);
  expect((await send(input.path, input.body, input.options)).status).toBe(input.status);
});

it('bounds replay retention to 24 hours and cleans expired claims during a successful lifecycle transaction', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const input = await operationRequest('delete');
  expect((await send(input.path, input.body, input.options)).status).toBe(204);
  const keyDigest = await digest(input.options.headers['Idempotency-Key']);
  const saved = await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE key_hash = ?').bind(keyDigest).first();
  expect(saved.expires_at).toBe(1700086400000);
  clock.mockReturnValue(1700086399999);
  expect((await send(input.path, input.body, input.options)).status).toBe(204);
  clock.mockReturnValue(1700086400000);
  expect((await send(input.path, input.body, input.options)).status).toBe(401);
  expect((await create(newSpace())).status).toBe(201);
  expect(await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE key_hash = ?').bind(keyDigest).first()).toBeNull();
});

it('never persists request bodies, crypto payloads, auth headers or raw keys in the idempotency ledger', async () => {
  const input = await operationRequest('create');
  expect((await send(input.path, input.body, input.options)).status).toBe(201);
  const text = JSON.stringify((await env.DB.prepare('SELECT * FROM lifecycle_idempotency').all()).results);
  for (const value of [space.syncCode, space.authKey, space.recoveryAuthKey, space.device.deviceToken, space.device.encryptedName.ciphertext,
    space.passwordWrappedMaster.ciphertext, space.recoveryWrappedMaster.ciphertext, input.options.headers['Idempotency-Key'],
    `Device ${space.device.deviceId}.${space.device.deviceToken}`]) {
    expect(text).not.toContain(value);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(value);
  }
});

it('keeps version and origin gates active when replaying a previously committed write', async () => {
  const input = await operationRequest('create');
  expect((await send(input.path, input.body, input.options)).status).toBe(201);
  expect((await worker.fetch(request(input.path, input.body, input.options), { ...env, MINIMUM_WRITE_VERSION: '1.0.40' }, {})).status).toBe(426);
  expect((await send(input.path, input.body, { ...input.options, headers: { ...input.options.headers, Origin: 'https://evil.test' } })).status).toBe(403);
  await env.DB.prepare('UPDATE sync_spaces SET minimum_write_version = ? WHERE id = ?').bind('1.0.40', space.spaceId).run();
  expect((await send(input.path, input.body, input.options)).status).toBe(426);
});

it.each(['pair', 'recover', 'password', 'recovery-key', 'delete'])('does not commit a %s replay claim if the space disappeared before its transaction', async operation => {
  const input = await operationRequest(operation);
  const racingEnv = interleaveMutation(async () => {
    expect((await send('/v1/spaces/current', eraseBody(), { method: 'DELETE', device: space.device })).status).toBe(204);
  });
  const response = await worker.fetch(request(input.path, input.body, input.options), racingEnv, {});
  expect(response.status).toBe(401);
  expect(await row()).toBeNull();
  const keyDigest = await digest(input.options.headers['Idempotency-Key']);
  expect(await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE key_hash = ?').bind(keyDigest).first()).toBeNull();
});

it.each(['recover', 'password', 'delete'])('does not record false authentication failures if identical %s already committed before credential reads', async operation => {
  const input = await operationRequest(operation);
  let firstBatch = true;
  const racingEnv = { ...env, DB: {
    prepare: query => env.DB.prepare(query),
    async batch(statements) {
      if (firstBatch) {
        firstBatch = false;
        expect((await send(input.path, input.body, input.options)).status).toBe(input.status);
      }
      return env.DB.batch(statements);
    }
  } };
  const response = await worker.fetch(request(input.path, input.body, input.options), racingEnv, {});
  expect(response.status).toBe(input.status);
  expect(await env.DB.prepare('SELECT * FROM auth_throttles').first()).toBeNull();
});

it('rolls expired-record cleanup back along with a failed lifecycle mutation', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const old = await operationRequest('create');
  expect((await send(old.path, old.body, old.options)).status).toBe(201);
  const oldKey = await digest(old.options.headers['Idempotency-Key']);
  clock.mockReturnValue(1700086400000);
  const fresh = newSpace();
  const options = { headers: { 'Idempotency-Key': crypto.randomUUID() } };
  const failingEnv = { ...env, DB: {
    prepare: query => env.DB.prepare(query),
    batch: statements => env.DB.batch([...statements, env.DB.prepare('UPDATE sync_spaces SET kdf_json = NULL WHERE id = ?').bind(fresh.spaceId)])
  } };
  expect((await worker.fetch(request('/v1/spaces', fresh, options), failingEnv, {})).status).toBe(500);
  expect(await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE key_hash = ?').bind(oldKey).first()).not.toBeNull();
  expect(await env.DB.prepare('SELECT * FROM sync_spaces WHERE id = ?').bind(fresh.spaceId).first()).toBeNull();
  expect((await send('/v1/spaces', fresh, options)).status).toBe(201);
  expect(await env.DB.prepare('SELECT * FROM lifecycle_idempotency WHERE key_hash = ?').bind(oldKey).first()).toBeNull();
});

it('bounds opportunistic cleanup work and permits a fresh authenticated operation under an expired key', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const input = await operationRequest('recovery-key');
  expect((await send(input.path, input.body, input.options)).status).toBe(200);
  clock.mockReturnValue(1700086400000);
  const expiredSpace = crypto.randomUUID();
  await env.DB.batch(await Promise.all(Array.from({ length: 150 }, async (_, index) => env.DB.prepare(`INSERT INTO lifecycle_idempotency
    (scope_hash, key_hash, request_digest, status, response_json, space_id, minimum_read_version, minimum_write_version, created_at, expires_at)
    VALUES (?, ?, ?, 204, NULL, ?, '1.0.39', '1.0.39', 0, 1)`)
    .bind(await digest(`scope-${index}`), await digest(`key-${index}`), await digest('request'), expiredSpace))));
  const renewed = rotationBody();
  expect((await send(input.path, renewed, input.options)).status).toBe(200);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM lifecycle_idempotency WHERE space_id = ?').bind(expiredSpace).first()).count).toBe(51);
  expect((await row()).recovery_auth_digest).toBe(await digest(renewed.newRecoveryAuthKey));
  expect((await send(input.path, renewed, input.options)).status).toBe(200);
});

it.each(writes)('allows only one winner when different %s requests race for the same key', async operation => {
  const input = await operationRequest(operation);
  const changed = operation === 'create' || operation === 'pair' ? { ...input.body, device: registration() }
    : operation === 'recover' || operation === 'password' ? { ...input.body, newAuthKey: random(32) }
      : operation === 'recovery-key' ? { ...input.body, newRecoveryAuthKey: random(32) }
        : { recoveryAuthKey: space.recoveryAuthKey, confirmation: '永久删除同步空间', appVersion };
  const bodies = [input.body, changed];
  const responses = await Promise.all(bodies.map(body => send(input.path, body, input.options)));
  expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([input.status, 409]);
  const winner = bodies[responses.findIndex(response => response.status === input.status)];
  const rejected = responses.find(response => response.status === 409);
  expect((await rejected.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  if (operation === 'password' || operation === 'recover') expect((await row()).auth_digest).toBe(await digest(winner.newAuthKey));
  if (operation === 'recovery-key') expect((await row()).recovery_auth_digest).toBe(await digest(winner.newRecoveryAuthKey));
  expect((await send(input.path, winner, input.options)).status).toBe(input.status);
});
