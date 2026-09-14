const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto, randomUUID, createHash } = require('node:crypto');
const moduleApi = require('./cloud-sync.js');
const cryptoModule = require('./cloud-sync-crypto.js');
const coreModule = require('./cloud-sync-core.js');

const limits = { minimumReadVersion: '1.0.39', minimumWriteVersion: '1.0.39' };
const password = 'test-only long password';
const time = '2026-09-11T08:00:00.000Z';

// Only browser persistence and network are substituted. Envelopes, crypto,
// password KDFs, metadata authentication and orchestration run as production code.
function harness(options = {}) {
  const events = [];
  const state = { pairing: null, pending: null, data: { qinshi_progress: 'local progress' },
    spaces: [], devices: [], uploads: [], commits: [], credentials: [], ready: true };
  const cryptoApi = cryptoModule.createCrypto({ crypto: webcrypto, CompressionStream: null, DecompressionStream: null });
  const core = coreModule.createCore({
    validateManagedData(data) {
      for (const key of Object.keys(data)) assert.ok(key.startsWith('qinshi_') && typeof data[key] === 'string');
    },
    sha256: async value => createHash('sha256').update(value).digest()
  });
  const storage = {
    async loadPairing() { return structuredClone(state.pairing); },
    async savePairing(value) {
      assert.deepEqual(Object.keys(value).sort(), ['deviceId', 'deviceName', 'deviceToken', 'masterKey', 'pairedAt', 'spaceId']);
      events.push('savePairing'); state.pairing = structuredClone(value);
    },
    async forgetPairing() { events.push('forgetPairing'); state.pairing = null; state.pending = null; },
    async savePendingOperation(value) {
      assert.deepEqual(Object.keys(value).sort(), ['snapshotId', 'type']);
      state.pending = structuredClone(value);
    },
    async loadPendingOperation() { return structuredClone(state.pending); },
    async clearPendingOperation() { state.pending = null; }
  };
  const api = {
    async health() { events.push('health'); return limits; },
    async createSpace(body, key) {
      events.push('createSpace'); state.spaces.push(structuredClone({ body, key }));
      state.devices.push({ ...body.device, current: true, revoked: false, latestSnapshot: null, historySnapshots: [] });
      return { spaceId: body.spaceId, deviceId: body.device.deviceId, ...limits };
    },
    async getParameters(code) {
      events.push('getParameters'); state.lookupCode = code;
      const body = state.spaces[0].body;
      return { spaceId: body.spaceId, kdf: body.kdf, passwordWrappedMaster: body.passwordWrappedMaster,
        recoveryWrappedMaster: body.recoveryWrappedMaster, ...limits };
    },
    async pair(code, body, key) {
      events.push('pair'); state.pairRequest = structuredClone({ code, body, key });
      return { spaceId: state.spaces[0].body.spaceId, deviceId: body.device.deviceId, ...limits };
    },
    async listDevices() { events.push('listDevices'); return { devices: structuredClone(state.devices) }; },
    async createUpload(body, key) {
      events.push('createUpload'); state.uploads.push(structuredClone({ body, key }));
      return { uploadId: 'upload-session', snapshotId: body.snapshotId, expiresAt: Date.now() + 60000, uploadedChunks: [] };
    },
    async putChunk(id, index, bytes, digest) {
      events.push('putChunk'); assert.equal(id, 'upload-session');
      assert.equal(createHash('sha256').update(bytes).digest('base64url'), digest);
      (state.chunks ||= [])[index] = new Uint8Array(bytes);
      return { chunkIndex: index };
    },
    async commitUpload(id, body, key) {
      events.push('commitUpload'); state.commits.push(structuredClone({ id, body, key }));
      const upload = state.uploads.at(-1).body;
      const { operation, ...metadata } = upload;
      state.devices[0].latestSnapshot = { ...metadata, deviceId: state.pairing.deviceId, serverCreatedAt: 1 };
      return { operationId: id, latestSnapshotId: upload.snapshotId, historySnapshotIds: [], serverCommittedAt: 1 };
    }
  };
  const deps = { api, storage, cryptoApi, core, webCrypto: webcrypto, randomUUID,
    appVersion: '1.0.39', now: () => time, navigator: { userAgent: 'Windows' },
    pwa: { async ensureCurrentForSync(value) { events.push('preflight'); assert.deepEqual(value, limits); return { ready: state.ready }; } },
    settings: { collectManagedData() { events.push('collect'); return structuredClone(state.data); } },
    async confirmRecoveryCredentials(value) {
      events.push('confirmRecovery'); state.credentials.push(value); return true;
    }, ...options };
  return { sync: moduleApi.createSync(deps), deps, api, storage, state, events, cryptoApi, core };
}

async function create(h, input = {}) {
  return h.sync.createSpace({ password, confirmPassword: password, deviceName: 'Windows 设备', ...input });
}

test('create requires matching password confirmation before side effects', async () => {
  const h = harness();
  await assert.rejects(create(h, { confirmPassword: 'different' }), /密码/);
  assert.deepEqual(h.events, []);
});

test('create cancellation never writes remotely or saves pairing', async () => {
  for (const acknowledgement of [false, undefined, 'true']) {
    const h = harness({ confirmRecoveryCredentials: async () => acknowledgement });
    await assert.rejects(create(h), /恢复密钥/);
    assert.equal(h.state.spaces.length, 0);
    assert.equal(h.state.pairing, null);
    assert.equal(h.state.uploads.length, 0);
  }
});

test('create shows recovery once, persists only pairing and uploads first decryptable snapshot', async () => {
  const randomByteLengths = [];
  const h = harness({ webCrypto: { subtle: webcrypto.subtle, getRandomValues(bytes) {
    randomByteLengths.push(bytes.length); return webcrypto.getRandomValues(bytes);
  } } });
  const result = await create(h);
  assert.match(result.syncCode, /^[A-Z2-7]{26,}$/);
  assert.equal(result.recoveryKey, undefined); // Secret is delivered only to the acknowledgement callback.
  assert.equal(h.state.credentials.length, 1);
  const secret = h.state.credentials[0];
  assert.equal(secret.syncCode, result.syncCode);
  const body = h.state.spaces[0].body;
  assert.equal(randomByteLengths[0], 17); // 136 random bits precede Base32 encoding.
  for (const id of [body.spaceId, body.device.deviceId, h.state.spaces[0].key, h.state.uploads[0].key]) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  assert.equal(body.syncCode, result.syncCode);
  assert.equal(body.device.deviceToken, h.state.pairing.deviceToken);
  assert.equal(body.device.deviceId, h.state.pairing.deviceId);
  assert.equal(JSON.stringify(body).includes('Windows 设备'), false);
  const recoveryKey = await h.cryptoApi.parseRecoveryKey(secret.recoveryKey);
  const recovery = await h.cryptoApi.deriveRecoveryKeys(recoveryKey, body.kdf.salt);
  assert.equal(await h.cryptoApi.unwrapMasterKey(body.recoveryWrappedMaster, recovery.wrappingKey, body.spaceId), h.state.pairing.masterKey);
  assert.ok(h.events.indexOf('confirmRecovery') < h.events.indexOf('createSpace'));
  assert.ok(h.events.indexOf('savePairing') < h.events.indexOf('collect'));
  assert.ok(h.events.indexOf('preflight') < h.events.indexOf('collect'));
  assert.equal(h.state.commits.length, 1);
  assert.deepEqual(h.state.commits[0].body, { beforeUploadId: null, sourceSnapshotId: null });
  const upload = h.state.uploads[0].body;
  assert.equal(new Set([body.passwordWrappedMaster.iv, body.recoveryWrappedMaster.iv,
    body.device.encryptedName.iv, upload.iv, upload.encryptedSummary.iv]).size, 5);
  assert.deepEqual(Object.keys(upload).sort(), ['operation', 'snapshotId', 'sourceSnapshotId', 'appVersion',
    'formatVersion', 'schemaVersion', 'encoding', 'clientCreatedAt', 'dataHash', 'iv',
    'ciphertextBytes', 'chunkCount', 'ciphertextDigest', 'encryptedSummary'].sort());
  const ciphertext = Buffer.concat(h.state.chunks).toString('base64url');
  const envelope = await h.cryptoApi.decryptSnapshot({ version: 1, algorithm: 'AES-256-GCM',
    encoding: upload.encoding, iv: upload.iv, ciphertext }, h.state.pairing.masterKey,
  { ...upload, spaceId: body.spaceId, sourceDeviceId: body.device.deviceId });
  assert.deepEqual((await h.core.validateSnapshotEnvelope(envelope)).data, h.state.data);
  assert.equal(h.state.pending, null);
  assert.equal(JSON.stringify(h.state.pairing).includes(password), false);
  assert.equal(JSON.stringify(h.state.pairing).includes(recoveryKey), false);
  await assert.rejects(create(h), /已配对/);
  assert.equal(h.state.credentials.length, 1);
});

test('join normalizes code and registers only without collecting, uploading or overwriting', async () => {
  const h = harness();
  const created = await create(h);
  h.state.pairing = null;
  h.events.length = 0;
  const localBefore = structuredClone(h.state.data);
  const before = h.state.uploads.length;
  await h.sync.joinSpace({ syncCode: created.syncCode.toLowerCase().match(/.{1,5}/g).join('-'), password, deviceName: 'iPhone 设备' });
  assert.equal(h.state.lookupCode, created.syncCode);
  assert.equal(h.state.pairRequest.code, created.syncCode);
  assert.equal(h.state.pairing.deviceName, 'iPhone 设备');
  assert.equal(h.state.uploads.length, before);
  assert.equal(h.events.includes('collect'), false);
  assert.deepEqual(h.state.data, localBefore);
  assert.equal(JSON.stringify(h.state.pairRequest).includes(password), false);
});

test('join wrong password never registers or saves pairing', async () => {
  const h = harness();
  const created = await create(h);
  h.state.pairing = null;
  h.events.length = 0;
  await assert.rejects(h.sync.joinSpace({ syncCode: created.syncCode, password: 'wrong password' }), /主密钥/);
  assert.equal(h.events.includes('pair'), false);
  assert.equal(h.events.includes('savePairing'), false);
});

test('upload preflight blocks before collection, encryption or upload', async () => {
  const h = harness();
  await create(h);
  h.events.length = 0;
  h.state.ready = false;
  await assert.rejects(h.sync.uploadCurrentDevice(), /更新|版本/);
  assert.deepEqual(h.events, ['health', 'preflight']);
});

test('upload no change uses authenticated latest metadata and creates no history', async () => {
  const h = harness();
  await create(h);
  const result = await h.sync.uploadCurrentDevice();
  assert.equal(result.status, 'unchanged');
  assert.equal(result.message, '本机数据无变化');
  assert.equal(h.state.uploads.length, 1);
  assert.equal(h.state.commits.length, 1);
  const dashboard = await h.sync.getDashboard();
  assert.equal(dashboard.devices[0].deviceName, 'Windows 设备');
  assert.equal(JSON.stringify(dashboard).includes(h.state.pairing.deviceToken), false);
  assert.equal(JSON.stringify(dashboard).includes(h.state.pairing.masterKey), false);
});

test('upload rejects forged latest hash and encrypted summary before write', async () => {
  const h = harness();
  await create(h);
  const latest = h.state.devices[0].latestSnapshot;
  latest.dataHash = 'A'.repeat(43);
  await assert.rejects(h.sync.uploadCurrentDevice(), /校验/);
  assert.equal(h.state.uploads.length, 1);
});

test('dashboard rejects metadata ciphertext tampering and cross-purpose replay', async () => {
  const h = harness();
  await create(h);
  const device = h.state.devices[0];
  const original = structuredClone(device.encryptedName);
  device.encryptedName = device.latestSnapshot.encryptedSummary;
  await assert.rejects(h.sync.getDashboard(), /校验/);
  device.encryptedName = original;
  const originalDeviceId = device.deviceId;
  device.deviceId = randomUUID();
  await assert.rejects(h.sync.getDashboard(), /校验/);
  device.deviceId = originalDeviceId;
  const bytes = Buffer.from(original.ciphertext, 'base64url');
  bytes[0] ^= 1;
  device.encryptedName.ciphertext = bytes.toString('base64url');
  await assert.rejects(h.sync.getDashboard(), /校验/);
});

test('upload enforces final ciphertext cap including the GCM tag', async () => {
  const h = harness();
  await create(h);
  h.state.devices[0].latestSnapshot = null;
  const base = await h.core.createSnapshotEnvelope({ appVersion: '1.0.39', sourceDeviceId: h.state.pairing.deviceId,
    clientCreatedAt: time, data: { qinshi_progress: '' } });
  h.state.data.qinshi_progress = 'x'.repeat(10 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(base)));
  await assert.rejects(h.sync.uploadCurrentDevice(), /密文.*10 MiB/);
  assert.equal(h.state.uploads.length, 1);
});

test('upload retry reuses encrypted bytes and stable operation UUID after ambiguous commit', async () => {
  const h = harness();
  await create(h);
  h.state.data.qinshi_progress = 'changed';
  const commit = h.api.commitUpload;
  let fail = true;
  h.api.commitUpload = async (...args) => {
    const result = await commit(...args);
    if (fail) { fail = false; throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' }); }
    return result;
  };
  await assert.rejects(h.sync.uploadCurrentDevice(), /timeout/);
  const staged = structuredClone(h.state.uploads.at(-1));
  assert.deepEqual(h.state.pending, { type: 'upload', snapshotId: staged.body.snapshotId });
  h.state.data.qinshi_progress = 'changed after failure';
  await h.sync.resumePendingOperation();
  assert.deepEqual(h.state.uploads.at(-1), staged);
  assert.equal(h.state.commits.at(-1).key, h.state.commits.at(-2).key);
  assert.equal(h.state.commits.at(-1).key, staged.key);
  assert.equal(h.state.pending, null);
});

test('resume after reload never recollects or silently starts an automatic upload', async () => {
  const h = harness();
  h.state.pending = { type: 'upload', snapshotId: randomUUID() };
  const result = await h.sync.resumePendingOperation();
  assert.equal(result.status, 'manual-upload-required');
  assert.deepEqual(h.events, []);
});

test('revoked device clears pairing and pending operation but preserves local progress', async () => {
  const h = harness();
  await create(h);
  const localBefore = structuredClone(h.state.data);
  h.api.listDevices = async () => { throw Object.assign(new Error('device revoked'), { code: 'DEVICE_REVOKED', pairingInvalid: true }); };
  await assert.rejects(h.sync.uploadCurrentDevice(), /revoked/);
  assert.equal(h.state.pairing, null);
  assert.equal(h.state.pending, null);
  assert.deepEqual(h.state.data, localBefore);
});

test('forget current device affects local pairing only and leaves qinshi data untouched', async () => {
  const h = harness();
  await create(h);
  h.events.length = 0;
  const localBefore = structuredClone(h.state.data);
  await h.sync.forgetCurrentDevice();
  assert.deepEqual(h.events, ['forgetPairing']);
  assert.equal(h.state.pairing, null);
  assert.deepEqual(h.state.data, localBefore);
});

test('device naming follows phone/tablet priority and accepts editable overrides', () => {
  for (const [navigator, expected] of [
    [{ userAgent: 'iPhone Android Mobile Windows' }, 'iPhone 设备'],
    [{ userAgent: 'iPad' }, 'iPad 设备'],
    [{ platform: 'MacIntel', maxTouchPoints: 5 }, 'iPad 设备'],
    [{ userAgent: 'Android Mobile' }, 'Android 手机'],
    [{ userAgent: 'Android' }, 'Android 平板'],
    [{ userAgent: 'Windows NT' }, 'Windows 设备'],
    [{ userAgent: 'Linux' }, '浏览器设备']
  ]) assert.equal(moduleApi.createSync({ navigator }).detectDeviceName(), expected);
});

test('join rejects Unicode case-folding aliases before touching network', async () => {
  const h = harness();
  await assert.rejects(h.sync.joinSpace({ syncCode: 'ı'.repeat(26), password }), /同步码/);
  assert.deepEqual(h.events, []);
});
