import { env } from 'cloudflare:workers';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

const appVersion = '1.0.39';
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = size => encode(crypto.getRandomValues(new Uint8Array(size)));
const blob = () => ({ version: 1, algorithm: 'AES-256-GCM', iv: random(12), ciphertext: random(40) });
const registration = () => ({ deviceId: crypto.randomUUID(), deviceToken: random(32), encryptedName: blob() });
const digest = async bytes => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
let space;
let logs;
function request(path, body, { method = 'POST', device = space.device, key = crypto.randomUUID(), headers = {} } = {}) {
  return new Request(`https://worker.test${path}`, { method, headers: {
    Origin: 'https://yuanyu0505.github.io', 'Content-Type': 'application/json', 'X-Qin-App-Version': appVersion,
    Authorization: `Device ${device.deviceId}.${device.deviceToken}`, 'Idempotency-Key': key, ...headers
  }, ...(body === undefined ? {} : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }) });
}
const send = (path, body, options, bindings = env) => worker.fetch(request(path, body, options), bindings, {});
async function createSpace() {
  const body = { syncCode: random(32).replace(/[^A-Z2-7]/g, 'A').padEnd(32, 'A'), spaceId: crypto.randomUUID(),
    kdf: { version: 1, kdf: 'PBKDF2-HMAC-SHA-256', hash: 'SHA-256', iterations: 600000, salt: random(16) },
    authKey: random(32), passwordWrappedMaster: { ...blob(), ciphertext: random(48) }, recoveryAuthKey: random(32),
    recoveryWrappedMaster: { ...blob(), ciphertext: random(48) }, device: registration(), appVersion };
  expect((await send('/v1/spaces', body, { device: body.device })).status).toBe(201);
  return body;
}
async function pair() {
  const device = registration();
  expect((await send(`/v1/spaces/${space.syncCode}/pair`, { authKey: space.authKey, device, appVersion })).status).toBe(200);
  return device;
}
async function input(overrides = {}, bytes = new Uint8Array(32).fill(7)) {
  return { bytes, body: { operation: 'upload', snapshotId: crypto.randomUUID(), sourceSnapshotId: null, appVersion,
    formatVersion: 1, schemaVersion: 1, encoding: 'identity', clientCreatedAt: '2026-09-11T08:00:00.000Z',
    dataHash: random(32), iv: random(12), ciphertextBytes: bytes.length, chunkCount: Math.ceil(bytes.length / 524288),
    ciphertextDigest: await digest(bytes), encryptedSummary: blob(), ...overrides } };
}
async function staged(overrides = {}, options = {}, bytes) {
  const item = await input(overrides, bytes);
  const response = await send('/v1/uploads', item.body, options);
  expect(response.status).toBe(201);
  return { ...item, session: await response.json(), options };
}
async function put(item, index = 0, bytes = item.bytes.slice(index * 524288, (index + 1) * 524288), options = {}) {
  return send(`/v1/uploads/${item.session.uploadId}/chunks/${index}`, bytes, { ...item.options, ...options, method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': await digest(bytes), ...options.headers } });
}
const commit = (item, body = {}, bindings = env) => send(`/v1/uploads/${item.session.uploadId}/commit`, body, item.options, bindings);
async function complete(overrides = {}, options = {}) {
  const item = await staged(overrides, options);
  expect((await put(item)).status).toBe(200);
  const response = await commit(item);
  expect(response.status).toBe(200);
  return { ...item, result: await response.json() };
}
const get = (path, options = {}) => send(path, undefined, { ...options, method: 'GET' });
const snapshots = async () => (await env.DB.prepare('SELECT * FROM snapshots ORDER BY id').all()).results;

beforeEach(async () => {
  logs = vi.spyOn(console, 'info').mockImplementation(() => {});
  await env.DB.batch([env.DB.prepare('DELETE FROM sync_spaces'), env.DB.prepare('DELETE FROM lifecycle_idempotency'), env.DB.prepare('DELETE FROM auth_throttles')]);
  space = await createSpace();
});
afterEach(() => vi.restoreAllMocks());

it('creates a staged session, resumes chunk indices, and replays one immutable committed result', async () => {
  const key = crypto.randomUUID();
  const item = await staged({}, { key });
  expect(item.session).toEqual({ uploadId: expect.any(String), snapshotId: item.body.snapshotId, expiresAt: expect.any(Number), uploadedChunks: [] });
  expect((await get(`/v1/snapshots/${item.body.snapshotId}`)).status).toBe(404);
  expect((await put(item)).status).toBe(200);
  expect((await put(item)).status).toBe(200);
  const resumed = await send('/v1/uploads', item.body, { key });
  expect((await resumed.json()).uploadedChunks).toEqual([0]);
  const first = await commit(item);
  expect(first.status).toBe(200);
  const result = await first.json();
  expect(result).toEqual({ operationId: item.session.uploadId, latestSnapshotId: item.body.snapshotId, historySnapshotIds: [], serverCommittedAt: expect.any(Number) });
  expect(await (await commit(item)).json()).toEqual(result);
  expect((await snapshots()).length).toBe(1);
  const metadata = await (await get(`/v1/snapshots/${item.body.snapshotId}`)).json();
  const { operation, ...expected } = item.body;
  expect(metadata).toEqual({ ...expected, deviceId: space.device.deviceId, serverCreatedAt: expect.any(Number) });
  expect(new Uint8Array(await (await get(`/v1/snapshots/${item.body.snapshotId}/chunks/0`)).arrayBuffer())).toEqual(item.bytes);
  expect((await put(item)).status).toBe(409);
});

it('exposes chunk digests to the exact allowed browser origin on success and errors', async () => {
  const item = await complete();
  const path = `/v1/snapshots/${item.body.snapshotId}/chunks/0`;
  const response = await get(path);
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://yuanyu0505.github.io');
  expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Chunk-SHA256');
  expect(response.headers.get('X-Chunk-SHA256')).toBe(item.body.ciphertextDigest);
  const missing = await get(`/v1/snapshots/${crypto.randomUUID()}/chunks/0`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get('Access-Control-Expose-Headers')).toBe('X-Chunk-SHA256');
  const forbidden = await get(path, { headers: { Origin: 'https://evil.test' } });
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers.get('Access-Control-Expose-Headers')).toBeNull();
  expect(forbidden.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

it('rejects changed create/commit bodies under the same operation without mutation', async () => {
  const key = crypto.randomUUID();
  const item = await complete({}, { key });
  expect((await send('/v1/uploads', { ...item.body, iv: random(12) }, { key })).status).toBe(409);
  expect((await commit(item, { beforeUploadId: crypto.randomUUID() })).status).toBe(409);
  expect((await snapshots()).length).toBe(1);
});

it('admits one concurrent session and one commit for an identical idempotency key', async () => {
  const item = await input();
  const key = crypto.randomUUID();
  const replies = await Promise.all(Array.from({ length: 5 }, () => send('/v1/uploads', item.body, { key })));
  expect(replies.map(reply => reply.status)).toEqual(Array(5).fill(201));
  const sessions = await Promise.all(replies.map(reply => reply.json()));
  expect(new Set(sessions.map(session => session.uploadId)).size).toBe(1);
  const upload = { ...item, session: sessions[0], options: { key } };
  expect((await put(upload)).status).toBe(200);
  const committed = await Promise.all(Array.from({ length: 5 }, () => commit(upload)));
  expect(committed.map(reply => reply.status)).toEqual(Array(5).fill(200));
  expect(new Set(await Promise.all(committed.map(reply => reply.text()))).size).toBe(1);
});

it('keeps one latest and exactly three newest histories, retaining trimmed-session replay', async () => {
  const items = [];
  for (let i = 0; i < 6; i += 1) items.push(await complete());
  const rows = await snapshots();
  expect(rows.filter(row => row.role === 'latest').map(row => row.id)).toEqual([items[5].body.snapshotId]);
  expect(rows.filter(row => row.role === 'history').map(row => row.id).sort()).toEqual(items.slice(2, 5).map(item => item.body.snapshotId).sort());
  expect(await (await commit(items[0])).json()).toEqual(items[0].result);
  expect((await get(`/v1/snapshots/${items[0].body.snapshotId}/chunks/0`)).status).toBe(404);
});

it.each(['replace', 'restore'])('commits %s before/after atomically with the explicit before as newest history', async kind => {
  const old = await complete();
  const source = await complete({}, { device: await pair() });
  const before = await staged({ operation: `${kind}-before` });
  const after = await staged({ operation: `${kind}-after`, sourceSnapshotId: source.body.snapshotId });
  expect((await put(before)).status).toBe(200);
  expect((await put(after)).status).toBe(200);
  expect((await commit(before)).status).toBe(400);
  const result = await (await commit(after, { beforeUploadId: before.session.uploadId, sourceSnapshotId: source.body.snapshotId })).json();
  expect(result.latestSnapshotId).toBe(after.body.snapshotId);
  expect(result.historySnapshotIds).toEqual([before.body.snapshotId, old.body.snapshotId]);
  expect((await env.DB.prepare('SELECT status FROM upload_sessions WHERE id = ?').bind(before.session.uploadId).first()).status).toBe('committed');
  expect((await get(`/v1/snapshots/${source.body.snapshotId}`)).status).toBe(200);
});

it('rejects incomplete, consumed, wrong-kind and other-device before sessions', async () => {
  const source = await complete({}, { device: await pair() });
  const after = await staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId });
  await put(after);
  for (const before of [await staged({ operation: 'replace-before' }), await complete(),
    await staged({ operation: 'restore-before' }), await staged({ operation: 'replace-before' }, { device: await pair() })]) {
    expect((await commit(after, { beforeUploadId: before.session.uploadId })).status).toBe(400);
  }
  expect((await snapshots()).find(row => row.id === after.body.snapshotId).role).toBe('staged');
});

it('rejects missing chunks, wrong whole digest, conflicting retries and invalid chunk indices', async () => {
  const item = await staged();
  expect((await commit(item)).status).toBe(400);
  expect((await put(item, 1)).status).toBe(400);
  expect((await put(item, 0, item.bytes, { headers: { 'X-Chunk-SHA256': random(32) } })).status).toBe(400);
  expect((await put(item)).status).toBe(200);
  expect((await put(item, 0, new Uint8Array(32).fill(8))).status).toBe(409);
  const bad = await staged({ ciphertextDigest: random(32) });
  await put(bad);
  expect((await commit(bad)).status).toBe(400);
  expect((await snapshots()).every(row => row.role === 'staged')).toBe(true);
});

it('enforces snapshot/chunk sizes, counts, crypto records and field allowlists before storage', async () => {
  for (const overrides of [{ ciphertextBytes: 10485761 }, { ciphertextBytes: 0 }, { chunkCount: 0 }, { chunkCount: 2 },
    { dataHash: 'plaintext' }, { iv: random(16) }, { formatVersion: 2 }, { schemaVersion: 2 },
    { clientCreatedAt: '2026-02-30T00:00:00.000Z' }, { sourceSnapshotId: crypto.randomUUID() }, { password: 'must-not-persist' }]) {
    const item = await input(overrides);
    expect([400, 413]).toContain((await send('/v1/uploads', item.body)).status);
  }
  expect(await snapshots()).toEqual([]);
  const item = await staged({}, {}, new Uint8Array(524289));
  expect((await put(item, 0, new Uint8Array(524289))).status).toBe(413);
  expect((await put(item, 0, new Uint8Array(20))).status).toBe(400);
  expect((await put(item, 0)).status).toBe(200);
  expect((await put(item, 1)).status).toBe(200);
  expect((await commit(item)).status).toBe(200);
});

it('reserves staged bytes and atomically enforces the 100 MiB space quota', async () => {
  const item = await input({ ciphertextBytes: 10485760, chunkCount: 20 });
  for (let i = 0; i < 10; i += 1) expect((await send('/v1/uploads', { ...item.body, snapshotId: crypto.randomUUID() })).status).toBe(201);
  const refused = await send('/v1/uploads', { ...item.body, snapshotId: crypto.randomUUID() });
  expect(refused.status).toBe(503);
  expect((await refused.json()).error.code).toBe('FREE_QUOTA_EXHAUSTED');
  expect((await snapshots()).length).toBe(10);
});

it('cleans only expired staged snapshots during later authenticated requests at the 24 hour boundary', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const committed = await complete();
  const temp = await staged();
  await put(temp);
  clock.mockReturnValue(1700086399999);
  expect((await get('/v1/devices')).status).toBe(200);
  expect((await snapshots()).length).toBe(2);
  clock.mockReturnValue(1700086400000);
  expect((await get('/v1/devices', { device: registration() })).status).toBe(401);
  expect((await snapshots()).length).toBe(2);
  expect((await get('/v1/devices')).status).toBe(200);
  expect((await snapshots()).map(row => row.id)).toEqual([committed.body.snapshotId]);
  expect((await put(temp)).status).toBe(404);
});

it('does not leak or mutate another space through device, session, snapshot or source identifiers', async () => {
  const own = await complete();
  const foreignSpace = await createSpace();
  const foreign = await complete({}, { device: foreignSpace.device });
  const active = await staged();
  const foreignOptions = { device: foreignSpace.device };
  for (const path of [`/v1/snapshots/${own.body.snapshotId}`, `/v1/snapshots/${own.body.snapshotId}/chunks/0`]) {
    expect((await get(path, foreignOptions)).status).toBe(404);
  }
  expect((await put(active, 0, active.bytes, foreignOptions)).status).toBe(404);
  expect((await send(`/v1/uploads/${active.session.uploadId}/commit`, {}, foreignOptions)).status).toBe(404);
  expect((await send(`/v1/devices/${space.device.deviceId}`, { encryptedName: blob() }, { ...foreignOptions, method: 'PATCH' })).status).toBe(404);
  expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: true }, { ...foreignOptions, method: 'DELETE' })).status).toBe(404);
  const sourceAttempt = await input({ operation: 'replace-after', sourceSnapshotId: foreign.body.snapshotId });
  expect((await send('/v1/uploads', sourceAttempt.body)).status).toBe(404);
  const listing = JSON.stringify(await (await get('/v1/devices')).json());
  expect(listing).not.toContain(foreignSpace.device.deviceId);
});

it('lists encrypted metadata, renames only the name and never serializes token digests or ciphertext logs', async () => {
  const item = await complete();
  const name = blob();
  const response = await send(`/v1/devices/${space.device.deviceId}`, { encryptedName: name }, { method: 'PATCH' });
  expect(response.status).toBe(200);
  const listing = await (await get('/v1/devices')).json();
  expect(listing.devices).toHaveLength(1);
  expect(listing.devices[0]).toMatchObject({ deviceId: space.device.deviceId, encryptedName: name, current: true, revoked: false,
    latestSnapshot: { snapshotId: item.body.snapshotId }, historySnapshots: [], lastUsedAt: expect.any(Number), lastUploadedAt: expect.any(Number) });
  const stored = await env.DB.prepare('SELECT token_digest FROM devices WHERE id = ?').bind(space.device.deviceId).first();
  expect(JSON.stringify(listing)).not.toContain(stored.token_digest);
  for (const value of [space.device.deviceToken, stored.token_digest, name.ciphertext, item.body.encryptedSummary.ciphertext, item.body.snapshotId]) {
    expect(JSON.stringify(logs.mock.calls)).not.toContain(value);
  }
});

it.each([false, true])('revokes another device with deleteSnapshots=%s and refuses the sole active device', async deleteSnapshots => {
  const second = await pair();
  const item = await complete({}, { device: second });
  expect((await send(`/v1/devices/${second.deviceId}`, { deleteSnapshots }, { method: 'DELETE' })).status).toBe(204);
  expect((await get('/v1/devices', { device: second })).status).toBe(401);
  expect((await get(`/v1/snapshots/${item.body.snapshotId}`)).status).toBe(deleteSnapshots ? 404 : 200);
  expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: true }, { method: 'DELETE' })).status).toBe(400);
  expect((await get('/v1/devices')).status).toBe(200);
});

it('rolls back role changes, history trimming and both session results on a real D1 constraint failure', async () => {
  await complete();
  const before = await staged({ operation: 'replace-before' });
  const source = await complete({}, { device: await pair() });
  const after = await staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId });
  await put(before); await put(after);
  const original = await snapshots();
  let committing = false;
  const failedEnv = { ...env, DB: {
    prepare(query) {
      if (query.startsWith("UPDATE upload_sessions SET status = 'committed'")) committing = true;
      return env.DB.prepare(query);
    },
    batch: statements => env.DB.batch(committing ? [...statements,
      env.DB.prepare('UPDATE sync_spaces SET kdf_json = NULL WHERE id = ?').bind(space.spaceId)] : statements) } };
  expect((await commit(after, { beforeUploadId: before.session.uploadId }, failedEnv)).status).toBe(500);
  expect(await snapshots()).toEqual(original);
  expect((await env.DB.prepare('SELECT status FROM upload_sessions WHERE id = ?').bind(after.session.uploadId).first()).status).toBe('staged');
  expect((await commit(after, { beforeUploadId: before.session.uploadId })).status).toBe(200);
});

it('preserves CORS, method/version gates and sanitized D1 quota errors on snapshot routes', async () => {
  const item = await complete();
  const path = `/v1/snapshots/${item.body.snapshotId}`;
  expect((await get(path, { headers: { 'X-Qin-App-Version': '1.0.38' } })).status).toBe(426);
  expect((await get(path, { headers: { Origin: 'https://evil.test' } })).status).toBe(403);
  const wrong = await send(path, {});
  expect(wrong.status).toBe(405);
  expect(wrong.headers.get('Allow')).toBe('GET, OPTIONS');
  const preflight = await send(`/v1/devices/${space.device.deviceId}`, undefined, { method: 'OPTIONS' });
  expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
  const quotaEnv = { ...env, DB: { prepare() { throw new Error('SQLITE_FULL secret-ciphertext'); } } };
  const response = await send(path, undefined, { method: 'GET' }, quotaEnv);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('secret-ciphertext');
});

function interleaveBatch(queryMatch, action) {
  let armed = false;
  let fired = false;
  async function fire() { if (armed && !fired) { fired = true; await action(); } }
  return { ...env, DB: {
    prepare(query) {
      if (queryMatch(query)) armed = true;
      const statement = env.DB.prepare(query);
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values);
        const first = bound.first.bind(bound);
        const all = bound.all.bind(bound);
        bound.first = async (...args) => { await fire(); return first(...args); };
        bound.all = async (...args) => { await fire(); return all(...args); };
        return bound;
      };
      return statement;
    },
    async batch(statements) {
      await fire();
      return env.DB.batch(statements);
    }
  } };
}

it('commits a full 10 MiB ciphertext split into exactly twenty 512 KiB chunks', async () => {
  const item = await staged({}, {}, new Uint8Array(10485760).fill(9));
  for (let index = 0; index < 20; index += 1) expect((await put(item, index)).status).toBe(200);
  expect((await commit(item)).status).toBe(200);
  const response = await get(`/v1/snapshots/${item.body.snapshotId}/chunks/19`);
  expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(524288).fill(9));
}, 15000);

it('admits only one reservation when concurrent uploads race for the final 10 MiB', async () => {
  const item = await input({ ciphertextBytes: 10485760, chunkCount: 20 });
  for (let i = 0; i < 9; i += 1) expect((await send('/v1/uploads', { ...item.body, snapshotId: crypto.randomUUID() })).status).toBe(201);
  const responses = await Promise.all(Array.from({ length: 2 }, () => send('/v1/uploads', { ...item.body, snapshotId: crypto.randomUUID() })));
  expect(responses.map(reply => reply.status).sort()).toEqual([201, 503]);
  expect((await snapshots()).length).toBe(10);
});

it('leaves exactly one latest when distinct complete sessions commit concurrently', async () => {
  const items = await Promise.all([staged(), staged(), staged()]);
  for (const item of items) expect((await put(item)).status).toBe(200);
  const responses = await Promise.all(items.map(item => commit(item)));
  expect(responses.map(reply => reply.status)).toEqual([200, 200, 200]);
  const results = await Promise.all(responses.map(reply => reply.json()));
  expect(results.map(result => result.historySnapshotIds.length).sort()).toEqual([0, 1, 2]);
  const rows = await snapshots();
  expect(rows.filter(row => row.role === 'latest')).toHaveLength(1);
  expect(rows.filter(row => row.role === 'history')).toHaveLength(2);
});

it('rejects explicit contradictory null source instead of silently substituting the creation source', async () => {
  const source = await complete({}, { device: await pair() });
  const before = await staged({ operation: 'replace-before' });
  const after = await staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId });
  await put(before); await put(after);
  expect((await commit(after, { beforeUploadId: before.session.uploadId, sourceSnapshotId: null })).status).toBe(400);
  expect((await snapshots()).find(row => row.id === after.body.snapshotId).role).toBe('staged');
});

it('does not consume the same before session in two concurrent replacements', async () => {
  const source = await complete({}, { device: await pair() });
  const before = await staged({ operation: 'replace-before' });
  const afters = await Promise.all([staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId }),
    staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId })]);
  for (const item of [before, ...afters]) await put(item);
  const replies = await Promise.all(afters.map(after => commit(after, { beforeUploadId: before.session.uploadId })));
  expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
  expect(replies.filter(reply => [400, 409].includes(reply.status))).toHaveLength(1);
});

it('rolls back a staged upload if its device is revoked after authentication but before the mutation', async () => {
  const other = await pair();
  const item = await input();
  const racingEnv = interleaveBatch(query => query.startsWith('INSERT INTO snapshots'), async () => {
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  expect((await send('/v1/uploads', item.body, {}, racingEnv)).status).toBe(401);
  expect(await snapshots()).toEqual([]);
});

it('cannot commit or write chunks after a concurrent revocation', async () => {
  const other = await pair();
  const item = await staged();
  await put(item);
  const racingEnv = interleaveBatch(query => query.startsWith("UPDATE upload_sessions SET status = 'committed'"), async () => {
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: true }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  expect([401, 404]).toContain((await commit(item, {}, racingEnv)).status);
  expect(await snapshots()).toEqual([]);
  expect((await put(item)).status).toBe(401);
});

it('does not return snapshot bytes if revocation wins immediately before the read transaction', async () => {
  const other = await pair();
  const item = await complete();
  const racingEnv = interleaveBatch(query => query.includes('SELECT c.body, c.chunk_digest'), async () => {
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  const response = await send(`/v1/snapshots/${item.body.snapshotId}/chunks/0`, undefined, { method: 'GET' }, racingEnv);
  expect(response.status).toBe(401);
});

it('returns not found if ciphertext is deleted between immutable metadata and chunk reads', async () => {
  const device = await pair();
  const item = await complete({}, { device });
  const metadata = await get(`/v1/snapshots/${item.body.snapshotId}`);
  expect(metadata.status).toBe(200);
  expect((await send(`/v1/devices/${device.deviceId}`, { deleteSnapshots: true }, { method: 'DELETE' })).status).toBe(204);
  expect((await get(`/v1/snapshots/${item.body.snapshotId}/chunks/0`)).status).toBe(404);
  expect((await get(`/v1/snapshots/${item.body.snapshotId}`)).status).toBe(404);
});

it('does not allow two concurrent revocations to remove every active device', async () => {
  const other = await pair();
  const replies = await Promise.all([
    send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE' }),
    send(`/v1/devices/${other.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })
  ]);
  expect(replies.map(reply => reply.status).sort()).toEqual([204, 400]);
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL').first()).count).toBe(1);
});

it('rejects unknown rename/delete fields, malformed indices and missing upload idempotency keys', async () => {
  const item = await input();
  const req = request('/v1/uploads', item.body);
  req.headers.delete('Idempotency-Key');
  expect((await worker.fetch(req, env, {})).status).toBe(400);
  expect((await send(`/v1/devices/${space.device.deviceId}`, { encryptedName: blob(), name: 'plaintext' }, { method: 'PATCH' })).status).toBe(400);
  expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: 'true' }, { method: 'DELETE' })).status).toBe(400);
  const upload = await staged();
  for (const index of ['-1', '01', '1.5', '9007199254740992']) {
    expect((await send(`/v1/uploads/${upload.session.uploadId}/chunks/${index}`, upload.bytes, { method: 'PUT' })).status).toBe(400);
  }
});

it('orders the explicit before as newest history even when it was staged before a later cloud upload', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const source = await complete({}, { device: await pair() });
  const before = await staged({ operation: 'replace-before' });
  await put(before);
  clock.mockReturnValue(1700000000100);
  const oldLatest = await complete();
  const originalMetadata = await (await get(`/v1/snapshots/${oldLatest.body.snapshotId}`)).json();
  const after = await staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId });
  await put(after);
  expect((await commit(after, { beforeUploadId: before.session.uploadId })).status).toBe(200);
  const listing = await (await get('/v1/devices')).json();
  const histories = listing.devices.find(device => device.current).historySnapshots;
  expect(histories.map(snapshot => snapshot.snapshotId)).toEqual([before.body.snapshotId, oldLatest.body.snapshotId]);
  expect(histories[0].serverCreatedAt).toBeGreaterThan(histories[1].serverCreatedAt);
  expect(await (await get(`/v1/snapshots/${oldLatest.body.snapshotId}`)).json()).toEqual(originalMetadata);
});

it('renews the requested expired session even when it falls beyond the bounded cleanup backlog', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  const key = crypto.randomUUID();
  const item = await staged({}, { key });
  const statements = [];
  for (let index = 0; index < 100; index += 1) {
    const id = crypto.randomUUID();
    statements.push(env.DB.prepare(`INSERT INTO snapshots SELECT ?, space_id, device_id, source_snapshot_id, role, app_version,
      format_version, schema_version, encoding, client_created_at, data_hash, iv, ciphertext_bytes, chunk_count, ciphertext_digest,
      encrypted_summary_json, server_created_at, committed_at FROM snapshots WHERE id = ?`).bind(id, item.body.snapshotId));
    statements.push(env.DB.prepare(`INSERT INTO upload_sessions (id, space_id, device_id, snapshot_id, operation, idempotency_key,
      request_json, expected_chunks, expected_bytes, expected_digest, status, expires_at, created_at)
      SELECT ?, space_id, device_id, ?, operation, ?, request_json, expected_chunks, expected_bytes, expected_digest, status,
        expires_at - 1, created_at FROM upload_sessions WHERE id = ?`).bind(crypto.randomUUID(), id, crypto.randomUUID(), item.session.uploadId));
  }
  await env.DB.batch(statements);
  clock.mockReturnValue(1700086400000);
  const response = await send('/v1/uploads', item.body, { key });
  expect(response.status).toBe(201);
  const replacement = await response.json();
  expect(replacement.uploadId).not.toBe(item.session.uploadId);
  expect(replacement.expiresAt).toBe(1700172800000);
  expect((await snapshots()).length).toBe(1);
});

it('rejects stale authorization if a deleted space and device are recreated with the same ids and a new token', async () => {
  const item = await input();
  const racingEnv = interleaveBatch(query => query.startsWith('INSERT INTO snapshots'), async () => {
    expect((await send('/v1/spaces/current', { authKey: space.authKey, confirmation: '永久删除同步空间', appVersion }, { method: 'DELETE' })).status).toBe(204);
    const replacement = { ...space, device: { ...space.device, deviceToken: random(32) } };
    expect((await send('/v1/spaces', replacement, { device: replacement.device })).status).toBe(201);
  });
  expect((await send('/v1/uploads', item.body, {}, racingEnv)).status).toBe(401);
  expect(await snapshots()).toEqual([]);
});

it('retains only a request fingerprint and necessary ids in committed receipts, not encrypted summary payloads', async () => {
  const device = await pair();
  const item = await complete({}, { device });
  const before = JSON.stringify((await env.DB.prepare('SELECT * FROM upload_sessions').all()).results);
  expect(before).not.toContain(item.body.encryptedSummary.ciphertext);
  expect(before).not.toContain(item.body.encryptedSummary.iv);
  expect((await send(`/v1/devices/${device.deviceId}`, { deleteSnapshots: true }, { method: 'DELETE' })).status).toBe(204);
  for (const table of ['snapshots', 'snapshot_chunks', 'upload_sessions']) {
    const persisted = JSON.stringify((await env.DB.prepare(`SELECT * FROM ${table}`).all()).results);
    expect(persisted).not.toContain(item.body.encryptedSummary.ciphertext);
  }
});

it('never accepts direct before-session commits even after a valid after commit consumed it', async () => {
  const source = await complete({}, { device: await pair() });
  const before = await staged({ operation: 'replace-before' });
  const after = await staged({ operation: 'replace-after', sourceSnapshotId: source.body.snapshotId });
  await put(before); await put(after);
  const body = { beforeUploadId: before.session.uploadId, sourceSnapshotId: source.body.snapshotId };
  expect((await commit(after, body)).status).toBe(200);
  expect((await commit(before, body)).status).toBe(400);
});

it('denies create direct replay when revoked between receipt and chunk-index reads', async () => {
  const other = await pair();
  const key = crypto.randomUUID();
  const item = await complete({}, { key });
  const racingEnv = interleaveBatch(query => query.includes('FROM snapshot_chunks') && query.includes('chunk_index'), async () => {
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  const response = await send('/v1/uploads', item.body, { key }, racingEnv);
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_FAILED');
});

it('denies commit direct replay when revocation wins its receipt read', async () => {
  const other = await pair();
  const item = await complete();
  const racingEnv = interleaveBatch(query => query.startsWith('SELECT * FROM upload_sessions WHERE id = ?'), async () => {
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  const response = await commit(item, {}, racingEnv);
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_FAILED');
});

it.each(['create', 'commit'])('does not turn an %s mutation AUTH_FAILED into successful winner replay', async operation => {
  const other = await pair();
  const key = crypto.randomUUID();
  const item = operation === 'commit' ? await staged({}, { key }) : await input();
  if (operation === 'commit') await put(item);
  const racingEnv = interleaveBatch(query => operation === 'create' ? query.startsWith('INSERT INTO snapshots')
    : query.startsWith("UPDATE upload_sessions SET status = 'committed'"), async () => {
    const winner = operation === 'create' ? await send('/v1/uploads', item.body, { key }) : await commit(item);
    expect(winner.status).toBe(operation === 'create' ? 201 : 200);
    if (operation === 'create') {
      const uploaded = { ...item, session: await winner.json(), options: { key } };
      expect((await put(uploaded)).status).toBe(200);
      expect((await commit(uploaded)).status).toBe(200);
    }
    expect((await send(`/v1/devices/${space.device.deviceId}`, { deleteSnapshots: false }, { method: 'DELETE', device: other })).status).toBe(204);
  });
  const response = operation === 'create' ? await send('/v1/uploads', item.body, { key }, racingEnv) : await commit(item, {}, racingEnv);
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_FAILED');
});

it.each(['create', 'commit'])('preserves an authorized %s winner replay after a deterministic duplicate mutation race', async operation => {
  const key = crypto.randomUUID();
  const item = operation === 'commit' ? await staged({}, { key }) : await input();
  if (operation === 'commit') await put(item);
  let winner;
  const racingEnv = interleaveBatch(query => operation === 'create' ? query.startsWith('INSERT INTO snapshots')
    : query.startsWith("UPDATE upload_sessions SET status = 'committed'"), async () => {
    const response = operation === 'create' ? await send('/v1/uploads', item.body, { key }) : await commit(item);
    expect(response.status).toBe(operation === 'create' ? 201 : 200);
    winner = await response.json();
  });
  const response = operation === 'create' ? await send('/v1/uploads', item.body, { key }, racingEnv) : await commit(item, {}, racingEnv);
  expect(response.status).toBe(operation === 'create' ? 201 : 200);
  expect(await response.json()).toEqual(winner);
  expect((await snapshots()).length).toBe(1);
});

it('denies old create receipt replay after identical space/device ids are recreated with a new token', async () => {
  const key = crypto.randomUUID();
  const item = await complete({}, { key });
  const racingEnv = interleaveBatch(query => query.includes('FROM snapshot_chunks') && query.includes('chunk_index'), async () => {
    expect((await send('/v1/spaces/current', { authKey: space.authKey, confirmation: '永久删除同步空间', appVersion }, { method: 'DELETE' })).status).toBe(204);
    const replacement = { ...space, device: { ...space.device, deviceToken: random(32) } };
    expect((await send('/v1/spaces', replacement, { device: replacement.device })).status).toBe(201);
  });
  const response = await send('/v1/uploads', item.body, { key }, racingEnv);
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_FAILED');
  expect(await snapshots()).toEqual([]);
});

it.each([
  ['same key and body', true, true, 201],
  ['different key', false, false, 503],
  ['same key with different body', true, false, 409]
])('arbitrates the final 10 MiB quota slot for %s before allocating any extra snapshot', async (_name, sameKey, sameBody, status) => {
  const item = await input({ ciphertextBytes: 10485760, chunkCount: 20 });
  for (let index = 0; index < 9; index += 1) {
    expect((await send('/v1/uploads', { ...item.body, snapshotId: crypto.randomUUID() })).status).toBe(201);
  }
  const key = crypto.randomUUID();
  const winnerBody = sameBody ? item.body : { ...item.body, snapshotId: crypto.randomUUID() };
  const winnerKey = sameKey ? key : crypto.randomUUID();
  let winner;
  // A has already found no receipt. B occupies the final slot immediately before
  // A's mutation batch; all SQL and both create requests execute against real D1.
  const racingEnv = interleaveBatch(query => query.startsWith('INSERT INTO snapshots'), async () => {
    const response = await send('/v1/uploads', winnerBody, { key: winnerKey });
    expect(response.status).toBe(201);
    winner = await response.json();
  });
  const response = await send('/v1/uploads', item.body, { key }, racingEnv);
  expect(response.status).toBe(status);
  if (status === 201) expect(await response.json()).toEqual(winner);
  else expect((await response.json()).error.code).toBe(status === 503 ? 'FREE_QUOTA_EXHAUSTED' : 'IDEMPOTENCY_CONFLICT');
  expect(await env.DB.prepare('SELECT COUNT(*) AS count, SUM(ciphertext_bytes) AS bytes FROM snapshots').first())
    .toEqual({ count: 10, bytes: 104857600 });
  expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM upload_sessions').first()).count).toBe(10);
  expect((await env.DB.prepare(`SELECT COUNT(*) AS count FROM snapshots s LEFT JOIN upload_sessions u ON u.snapshot_id = s.id
    WHERE u.id IS NULL`).first()).count).toBe(0);
  expect((await env.DB.prepare(`SELECT COUNT(*) AS count FROM upload_sessions u LEFT JOIN snapshots s ON s.id = u.snapshot_id
    WHERE u.status = 'staged' AND s.id IS NULL`).first()).count).toBe(0);
});
