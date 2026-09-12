import { env } from 'cloudflare:workers';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

const origin = 'https://yuanyu0505.github.io';
const code = 'JBSWY3DPEHPK3PXPJBSWY3DPEE';
const random = size => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(size)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const password = random(32);
const recovery = random(32);
const token = 'test-device-token';
const deviceId = 'test-device-id';
const encryptedBlob = { version: 1, algorithm: 'AES-256-GCM', iv: random(12), ciphertext: random(48) };
const device = { deviceId: crypto.randomUUID(), deviceToken: random(32), encryptedName: encryptedBlob };
const upload = {
  operation: 'upload', snapshotId: 'snapshot-test', sourceSnapshotId: null, appVersion: '1.0.39',
  formatVersion: 1, schemaVersion: 1, encoding: 'identity', clientCreatedAt: '2026-09-11T00:00:00Z',
  dataHash: 'test-data-hash', iv: 'test-iv', ciphertextBytes: 32, chunkCount: 1,
  ciphertextDigest: 'test-ciphertext-digest', encryptedSummary: encryptedBlob
};
const recoveryBody = {
  recoveryAuthKey: recovery, newAuthKey: random(32), newPasswordWrappedMaster: encryptedBlob,
  newRecoveryAuthKey: random(32), newRecoveryWrappedMaster: encryptedBlob,
  device, appVersion: '1.0.39'
};
let locator;
let log;

async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

function request(path, body, options = {}) {
  return new Request(`https://worker.test${path}`, {
    method: options.method || 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json', 'X-Qin-App-Version': '1.0.39',
      'Idempotency-Key': crypto.randomUUID(),
      Authorization: `Device ${deviceId}.${token}`, ...options.headers
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

const send = (path, body, options) => worker.fetch(request(path, body, options), env, {});
const pair = (syncCode, authKey) => send(`/v1/spaces/${syncCode}/pair`, { authKey, device, appVersion: '1.0.39' });

beforeEach(async () => {
  log = vi.spyOn(console, 'info').mockImplementation(() => {});
  await env.DB.batch([
    env.DB.prepare('DELETE FROM devices'), env.DB.prepare('DELETE FROM sync_spaces'),
    env.DB.prepare('DELETE FROM auth_throttles')
  ]);
  locator = await digest(code);
  await env.DB.prepare('INSERT INTO sync_spaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('space-test', locator, '{}', await digest(password), '{}', await digest(recovery), '{}', '1.0.39', '1.0.39', 1, 1).run();
  await env.DB.prepare('INSERT INTO devices VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)')
    .bind(deviceId, 'space-test', await digest(token), '{}', 1, 1).run();
});
afterEach(() => vi.restoreAllMocks());

it('returns the same public error for missing space and wrong password', async () => {
  const missing = await pair('unknown-code', 'bad-auth');
  const wrong = await pair(code, 'bad-auth');
  expect(missing.status).toBe(401);
  expect(wrong.status).toBe(401);
  expect(await missing.json()).toEqual(await wrong.json());
  expect(wrong.headers.get('access-control-allow-origin')).toBe(origin);
  expect(wrong.headers.get('cache-control')).toBe('no-store');
});

it('rejects unknown fields before checking old write clients', async () => {
  expect((await send('/v1/uploads', { unexpected: true }, { headers: { 'X-Qin-App-Version': '1.0.38' } })).status).toBe(400);
  expect((await send('/v1/uploads', upload, { headers: { 'X-Qin-App-Version': '1.0.38' } })).status).toBe(426);
});

it.each(['', 'Bearer test-device-token', `Device ${deviceId}.wrong-token`, `Device missing.${token}`, `Device ${deviceId}.${token}.extra`])(
  'denies invalid device authorization %s', async authorization => {
    const response = await send('/v1/devices', undefined, { method: 'GET', headers: { Authorization: authorization } });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_FAILED');
  }
);

it('accepts a valid digest-backed token and denies it immediately after revocation', async () => {
  const { authenticateDevice } = await import('../src/auth.js');
  const context = await authenticateDevice(request('/v1/devices', undefined, { method: 'GET' }), env);
  expect(context).toMatchObject({ deviceId, spaceId: 'space-test', locatorHash: locator });
  expect(JSON.stringify(context)).not.toContain(await digest(token));
  await env.DB.prepare('UPDATE devices SET revoked_at = 2 WHERE id = ?').bind(deviceId).run();
  expect((await send('/v1/devices', undefined, { method: 'GET' })).status).toBe(401);
});

it('implements pairing while leaving upload business operations to later tasks', async () => {
  expect((await pair(code, password)).status).toBe(200);
  expect((await send('/v1/uploads', upload)).status).toBe(404);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first()).count).toBe(2);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM upload_sessions').first()).count).toBe(0);
});

it.each([undefined, '', '1.0.38', '1.0', '1.0.39-beta', '01.0.39', '1.0.39.0'])('rejects missing, malformed or old write versions %s', async version => {
  const { requireVersion } = await import('../src/validation.js');
  const headers = version === undefined ? {} : { 'X-Qin-App-Version': version };
  expect(() => requireVersion(new Request('https://worker.test', { headers }), env, 'write')).toThrow(expect.objectContaining({ code: 'UPGRADE_REQUIRED' }));
});

it('compares versions numerically and keeps independent read and write floors', async () => {
  const { requireVersion } = await import('../src/validation.js');
  const req = new Request('https://worker.test', { headers: { 'X-Qin-App-Version': '1.0.99' } });
  expect(() => requireVersion(req, { MINIMUM_READ_VERSION: '1.0.9', MINIMUM_WRITE_VERSION: '1.0.100' }, 'read')).not.toThrow();
  expect(() => requireVersion(req, { MINIMUM_READ_VERSION: '1.0.9', MINIMUM_WRITE_VERSION: '1.0.100' }, 'write')).toThrow();
  expect(() => requireVersion(req, {}, 'write')).toThrow();
  expect(() => requireVersion(req, env, 'unexpected')).toThrow();
});

it.each([
  ['text/plain', '{}', 'UNSUPPORTED_MEDIA_TYPE'],
  ['application/jsonp', '{}', 'UNSUPPORTED_MEDIA_TYPE'],
  ['application/json', '{', 'INVALID_REQUEST'],
  ['application/json', 'null', 'INVALID_REQUEST'],
  ['application/json', '[]', 'INVALID_REQUEST'],
  ['application/json', '"text"', 'INVALID_REQUEST'],
  ['application/json', '{"__proto__":{}}', 'INVALID_REQUEST'],
  ['application/json', '{"unexpected":true}', 'INVALID_REQUEST']
])('rejects invalid JSON shape/content type %s %s', async (type, body, errorCode) => {
  const { readJson } = await import('../src/validation.js');
  await expect(readJson(new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': type }, body }), ['name'], 64))
    .rejects.toMatchObject({ code: errorCode });
});

it('counts actual UTF-8 bytes instead of characters or declared content length', async () => {
  const { readJson } = await import('../src/validation.js');
  const make = () => new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': '1' }, body: '{"name":"中"}' });
  await expect(readJson(make(), ['name'], 14)).resolves.toEqual({ name: '中' });
  await expect(readJson(make(), ['name'], 13)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
});

it('stops reading a streaming JSON body at the byte limit', async () => {
  const { readJson } = await import('../src/validation.js');
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16)); }, cancel() { cancelled = true; } });
  await expect(readJson(new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), [], 8))
    .rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  expect(cancelled).toBe(true);
});

it('compares full SHA-256 digests and rejects malformed or partial digests', async () => {
  const { constantTimeEqual } = await import('../src/auth.js');
  const left = new Uint8Array(32).fill(17);
  expect(constantTimeEqual(left, left.slice())).toBe(true);
  for (const index of [0, 15, 31]) {
    const right = left.slice(); right[index] ^= 1;
    expect(constantTimeEqual(left, right)).toBe(false);
  }
  expect(constantTimeEqual(left, new Uint8Array(31))).toBe(false);
  expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(false);
});

it('normalizes grouped lowercase Base32 sync codes and persists only the canonical locator hash', async () => {
  const { hashLocator } = await import('../src/auth.js');
  expect(await hashLocator(` ${code}\n`)).toBe(locator);
  expect(await hashLocator(code.toLowerCase())).toBe(locator);
  expect(await hashLocator('  jbsw y3dp-ehpk3pxpjbswy3dpee  ')).toBe(locator);
  await pair(code, 'bad-auth');
  const rows = await env.DB.prepare('SELECT * FROM auth_throttles').all();
  expect(rows.results[0].locator_hash).toBe(locator);
  expect(JSON.stringify(rows.results)).not.toContain(code);
});

it.each(['', ' - ', 'ABC_234', 'ABC123', 'ABC890', 'ABC=', 'AB/C', 'ABC+DEF', 'AB\tCD', 'AB\nCD', 'AB\u00a0CD', 'ABſCD', 'A'.repeat(129)])(
  'rejects characters or length outside the sync-code Base32 normalization contract: %s', async value => {
    const { hashLocator } = await import('../src/auth.js');
    await expect(hashLocator(value)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  }
);

it('normalizes a URL-encoded grouped path code to the existing space without leaking it', async () => {
  const input = encodeURIComponent(' jbsw y3dp-ehpk3pxpjbswy3dpee ');
  expect((await pair(input, password)).status).toBe(200);
  expect(JSON.stringify(log.mock.calls)).not.toContain(input);
  expect(JSON.stringify(log.mock.calls)).not.toContain(code);
});

it.each(['ABC_234', 'ABC123', '%', '%2541', 'AB%09CD'])('rejects malformed or non-Base32 path codes %s', async input => {
  expect((await pair(input, password)).status).toBe(400);
});

it('records the exact progressive cooldowns and caps further failures at 900 seconds', async () => {
  const { recordAuthFailure } = await import('../src/auth.js');
  const now = 1700000000000;
  for (const [index, seconds] of [0, 2, 5, 15, 60, 300, 900, 900].entries()) {
    await recordAuthFailure(locator, now, env);
    const row = await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(locator).first();
    expect(row).toEqual({ locator_hash: locator, failure_count: index + 1, cooldown_until: now + seconds * 1000, updated_at: now });
  }
});

it('increments failures atomically under concurrent requests', async () => {
  const { recordAuthFailure } = await import('../src/auth.js');
  await Promise.all(Array.from({ length: 8 }, () => recordAuthFailure(locator, 1700000000000, env)));
  const row = await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(locator).first();
  expect(row.failure_count).toBe(8);
  expect(row.cooldown_until).toBe(1700000900000);
});

it.each([code, 'UNKNOWNCODE'])('admits only the first two concurrent wrong password/recovery attempts for %s', async syncCode => {
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => index % 2
    ? pair(syncCode, 'bad-auth')
    : send(`/v1/spaces/${syncCode}/recover`, { ...recoveryBody, recoveryAuthKey: 'bad-auth' })));
  expect(responses.map(response => response.status).sort()).toEqual([401, 401, 429, 429, 429, 429, 429, 429]);
  const row = await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(await digest(syncCode)).first();
  expect(row).toMatchObject({ failure_count: 2, cooldown_until: 1700000002000 });
});

it('admits only one concurrent failure after an existing cooldown expires', async () => {
  const { recordAuthFailure } = await import('../src/auth.js');
  await recordAuthFailure(locator, 1700000000000, env);
  await recordAuthFailure(locator, 1700000000000, env);
  vi.spyOn(Date, 'now').mockReturnValue(1700000002000);
  const responses = await Promise.all(Array.from({ length: 8 }, () => pair(code, 'bad-auth')));
  expect(responses.map(response => response.status).sort()).toEqual([401, 429, 429, 429, 429, 429, 429, 429]);
  const row = await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(locator).first();
  expect(row).toMatchObject({ failure_count: 3, cooldown_until: 1700000007000 });
});

it('does not clear a cooldown created by competing failures after a successful credential pre-check', async () => {
  const { recordAuthFailure, verifyPasswordAuth } = await import('../src/auth.js');
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  let firstBatch = true;
  const racingEnv = { ...env, DB: {
    prepare: query => env.DB.prepare(query),
    async batch(statements) {
      const result = await env.DB.batch(statements);
      if (firstBatch) {
        firstBatch = false;
        // Real D1 failures interleave just after the original request's stale read.
        await recordAuthFailure(locator, 1700000000000, env);
        await recordAuthFailure(locator, 1700000000000, env);
      }
      return result;
    }
  } };
  await expect(verifyPasswordAuth(locator, password, racingEnv)).rejects.toMatchObject({ code: 'AUTH_COOLDOWN' });
  expect((await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(locator).first()).failure_count).toBe(2);
});

it('enforces the exact cooldown boundary without extending it for blocked requests', async () => {
  const { verifyPasswordAuth } = await import('../src/auth.js');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  await expect(verifyPasswordAuth(locator, 'bad', env)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(verifyPasswordAuth(locator, 'bad', env)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  clock.mockReturnValue(1700000001999);
  await expect(verifyPasswordAuth(locator, password, env)).rejects.toMatchObject({ code: 'AUTH_COOLDOWN' });
  expect((await env.DB.prepare('SELECT failure_count FROM auth_throttles').first()).failure_count).toBe(2);
  clock.mockReturnValue(1700000002000);
  await expect(verifyPasswordAuth(locator, password, env)).resolves.toMatchObject({ id: 'space-test' });
  expect(await env.DB.prepare('SELECT * FROM auth_throttles').first()).toBeNull();
});

it('shares password and recovery throttles but never substitutes their authenticators', async () => {
  const { verifyPasswordAuth, verifyRecoveryAuth } = await import('../src/auth.js');
  await expect(verifyRecoveryAuth(locator, password, env)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(verifyPasswordAuth(locator, recovery, env)).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  await expect(verifyRecoveryAuth(locator, recovery, env)).rejects.toMatchObject({ code: 'AUTH_COOLDOWN' });
  await env.DB.prepare('UPDATE auth_throttles SET cooldown_until = 0').run();
  await expect(verifyRecoveryAuth(locator, recovery, env)).resolves.toMatchObject({ id: 'space-test' });
  expect(await env.DB.prepare('SELECT * FROM auth_throttles').first()).toBeNull();
});

it('clears only the authenticated locator throttle after valid device authentication', async () => {
  const { recordAuthFailure, authenticateDevice, clearAuthFailures } = await import('../src/auth.js');
  const other = await digest('other-space');
  await recordAuthFailure(locator, Date.now(), env);
  await recordAuthFailure(other, Date.now(), env);
  await authenticateDevice(request('/v1/devices', undefined, { method: 'GET' }), env);
  expect(await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(locator).first()).toBeNull();
  expect(await env.DB.prepare('SELECT * FROM auth_throttles WHERE locator_hash = ?').bind(other).first()).not.toBeNull();
  await clearAuthFailures(other, env);
  expect(await env.DB.prepare('SELECT * FROM auth_throttles').first()).toBeNull();
});

it('keeps credentials, sync code and IP out of error bodies and structured logs', async () => {
  const response = await send(`/v1/spaces/${code}/pair`, { authKey: 'private-auth-test' }, { headers: { 'CF-Connecting-IP': '192.0.2.23' } });
  expect(response.status).toBe(401);
  const logs = JSON.stringify(log.mock.calls);
  for (const secret of [code, 'private-auth-test', token, deviceId, '192.0.2.23']) {
    expect(logs).not.toContain(secret);
  }
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({ requestId: expect.any(String), route: '/v1/spaces/:code/pair', status: 401, code: 'AUTH_FAILED' });
  expect(await response.json()).toEqual({ error: { code: 'AUTH_FAILED', message: expect.any(String), retryable: false } });
});

it('preserves fail-closed quota errors in the authentication path', async () => {
  const brokenEnv = { ...env, DB: { prepare() { throw new Error('D1_ERROR: database or disk is full: SQLITE_FULL private-auth-test'); } } };
  const response = await worker.fetch(request(`/v1/spaces/${code}/pair`, { authKey: password }), brokenEnv, {});
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('FREE_QUOTA_EXHAUSTED');
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-auth-test');
});

it('fails closed when D1 rejects the atomic failure-admission write', async () => {
  const failingEnv = { ...env, DB: {
    batch: statements => env.DB.batch(statements),
    prepare(query) {
      if (query.startsWith('INSERT INTO auth_throttles')) throw new Error('SQLITE_FULL private-auth-test');
      return env.DB.prepare(query);
    }
  } };
  const response = await worker.fetch(request(`/v1/spaces/${code}/pair`, { authKey: 'bad-auth', device, appVersion: '1.0.39' }), failingEnv, {});
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('FREE_QUOTA_EXHAUSTED');
  expect(await env.DB.prepare('SELECT * FROM auth_throttles').first()).toBeNull();
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-auth-test');
});

it('hashes authenticator text using the standard SHA-256 vector', async () => {
  const { hashAuthValue } = await import('../src/auth.js');
  expect(await hashAuthValue('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await expect(hashAuthValue('')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(hashAuthValue({})).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
});

it.each(['plaintext', 'a'.repeat(63), 'g'.repeat(64), ''])('fails closed for a malformed stored authenticator digest %s', async malformed => {
  await env.DB.prepare('UPDATE sync_spaces SET auth_digest = ?').bind(malformed).run();
  expect((await pair(code, password)).status).toBe(401);
});

it('rejects the stored digest itself as a password or device bearer credential', async () => {
  expect((await pair(code, await digest(password))).status).toBe(401);
  expect((await send('/v1/devices', undefined, { method: 'GET', headers: { Authorization: `Device ${deviceId}.${await digest(token)}` } })).status).toBe(401);
});

it('uses identical cooldown status, body and failure counts for unknown and known spaces', async () => {
  const outcomes = [];
  for (const syncCode of ['unknown-code', code]) {
    const responses = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await pair(syncCode, 'bad');
      responses.push({ status: response.status, body: await response.json() });
    }
    outcomes.push(responses);
  }
  expect(outcomes[0]).toEqual(outcomes[1]);
  expect(outcomes[0].map(response => response.status)).toEqual([401, 401, 429]);
  const { results } = await env.DB.prepare('SELECT failure_count FROM auth_throttles').all();
  expect(results.map(row => row.failure_count)).toEqual([2, 2]);
});

it('applies content type and byte limits at the public upload boundary', async () => {
  const badType = await send('/v1/uploads', upload, { headers: { 'Content-Type': 'text/plain' } });
  expect(badType.status).toBe(415);
  expect((await badType.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  const oversized = await send('/v1/uploads', { envelope: 'a'.repeat(65536) });
  expect(oversized.status).toBe(413);
  expect((await oversized.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
});

it('guards recovery using its own authenticator and logs only the route template', async () => {
  expect((await send(`/v1/spaces/${code}/recover`, { ...recoveryBody, recoveryAuthKey: password })).status).toBe(401);
  expect((await send(`/v1/spaces/${code}/recover`, recoveryBody)).status).toBe(200);
  expect(JSON.parse(log.mock.calls[0][0]).route).toBe('/v1/spaces/:code/recover');
});

it('denies invalid device digests even when the submitted token text is identical', async () => {
  await env.DB.prepare('UPDATE devices SET token_digest = ?').bind(token).run();
  expect((await send('/v1/devices', undefined, { method: 'GET' })).status).toBe(401);
});

it('rejects malformed UTF-8 rather than replacing it inside JSON values', async () => {
  const { readJson } = await import('../src/validation.js');
  const body = new Uint8Array([123, 34, 110, 97, 109, 101, 34, 58, 34, 255, 34, 125]);
  await expect(readJson(new Request('https://worker.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), ['name'], 64))
    .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
});

it.each([
  ['pair', { authKey: password, device, appVersion: '1.0.39' }],
  ['recover', recoveryBody],
  ['uploads', upload]
])('accepts the exact %s shared top-level contract', async (route, body) => {
  const path = route === 'uploads' ? '/v1/uploads' : `/v1/spaces/${code}/${route}`;
  expect((await send(path, body)).status).toBe(route === 'uploads' ? 404 : 200);
});

it.each([
  ['pair', 'deviceId'], ['pair', 'deviceToken'], ['pair', 'encryptedDeviceName'], ['pair', 'unexpected'],
  ['recover', 'recoveryAuth'], ['recover', 'newRecoveryAuth'], ['recover', 'newDeviceId'], ['recover', 'newDeviceToken'], ['recover', 'encryptedDeviceName'], ['recover', 'unexpected'],
  ['uploads', 'envelope'], ['uploads', 'unexpected']
])('rejects legacy or unknown %s top-level field %s', async (route, field) => {
  const body = route === 'pair' ? { authKey: password, device, appVersion: '1.0.39' } : route === 'recover' ? recoveryBody : upload;
  const path = route === 'uploads' ? '/v1/uploads' : `/v1/spaces/${code}/${route}`;
  expect((await send(path, { ...body, [field]: 'legacy' })).status).toBe(400);
});
