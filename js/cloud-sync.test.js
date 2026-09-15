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
    async clearPendingOperation() { state.pending = null; },
    async loadRollbackCopy() { return structuredClone(state.rollback || null); }
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

test('create enrollment resumes a lost response with original acknowledged credentials and operation', async () => {
  const h = harness();
  const createSpace = h.api.createSpace;
  let receipt;
  let sent;
  h.api.createSpace = async (...args) => {
    if (!receipt) {
      sent = structuredClone(args);
      receipt = await createSpace(...args);
      throw new Error('create response lost');
    }
    assert.deepEqual(args, sent);
    return receipt;
  };
  await assert.rejects(create(h), /create response lost/);
  assert.equal(h.state.pairing, null);
  assert.equal(h.state.pending, null);
  await assert.rejects(create(h), /待恢复/);
  const result = await h.sync.resumePendingOperation();
  assert.equal(result.status, 'created');
  assert.equal(result.syncCode, sent[0].syncCode);
  assert.equal(h.state.spaces.length, 1);
  assert.equal(h.state.credentials.length, 1);
  assert.equal(h.state.pairing.deviceToken, sent[0].device.deviceToken);
  assert.equal(h.state.commits.length, 1);
});

test('join enrollment resumes a lost response without making another device or uploading', async () => {
  const h = harness();
  const created = await create(h);
  h.state.pairing = null;
  const localBefore = structuredClone(h.state.data);
  const pair = h.api.pair;
  let receipt;
  let sent;
  h.api.pair = async (...args) => {
    if (!receipt) {
      sent = structuredClone(args);
      receipt = await pair(...args);
      throw new Error('pair response lost');
    }
    assert.deepEqual(args, sent);
    return receipt;
  };
  await assert.rejects(h.sync.joinSpace({ syncCode: created.syncCode, password }), /pair response lost/);
  assert.equal(h.state.pairing, null);
  h.events.length = 0;
  assert.equal((await h.sync.resumePendingOperation()).status, 'joined');
  assert.equal(h.state.pairing.deviceToken, sent[1].device.deviceToken);
  assert.equal(h.events.includes('getParameters'), false);
  assert.equal(h.events.includes('collect'), false);
  assert.equal(h.state.commits.length, 1);
  assert.deepEqual(h.state.data, localBefore);
});

test('enrollment local save failure retries persistence without replaying accepted remote enrollment', async () => {
  for (const operation of ['create', 'join']) {
    const h = harness();
    let syncCode;
    if (operation === 'join') {
      syncCode = (await create(h)).syncCode;
      h.state.pairing = null;
    }
    const savePairing = h.storage.savePairing;
    let expected;
    let fail = true;
    h.storage.savePairing = async value => {
      if (fail) { fail = false; expected = structuredClone(value); throw new Error('local persistence failed'); }
      assert.deepEqual(value, expected);
      return savePairing(value);
    };
    const attempt = operation === 'create' ? create(h) : h.sync.joinSpace({ syncCode, password });
    await assert.rejects(attempt, /local persistence failed/);
    h.api.createSpace = h.api.pair = async () => { assert.fail('accepted enrollment must not be sent again'); };
    assert.equal((await h.sync.resumePendingOperation()).status, operation === 'create' ? 'created' : 'joined');
    assert.deepEqual(h.state.pairing, expected);
    assert.equal(h.state.pending, null);
    assert.equal(h.state.commits.length, 1);
  }
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

test('upload commit replay survives trimmed ciphertext without recreating or putting chunks', async () => {
  const h = harness();
  await create(h);
  h.state.data.qinshi_progress = 'changed';
  const commit = h.api.commitUpload;
  let receipt;
  let request;
  h.api.commitUpload = async (...args) => {
    h.events.push('commit-receipt');
    if (!receipt) {
      request = structuredClone(args);
      receipt = await commit(...args);
      throw Object.assign(new Error('response lost after commit'), { code: 'TIMEOUT' });
    }
    assert.deepEqual(args, request);
    return receipt;
  };
  await assert.rejects(h.sync.uploadCurrentDevice(), /response lost/);
  h.state.chunks = [];
  h.state.devices[0].latestSnapshot = null;
  const createUpload = h.api.createUpload;
  h.api.createUpload = async (...args) => ({ ...await createUpload(...args), uploadedChunks: [] });
  h.api.putChunk = async () => { throw Object.assign(new Error('committed upload cannot accept chunks'), { code: 'IDEMPOTENCY_CONFLICT' }); };
  h.events.length = 0;
  const result = await h.sync.resumePendingOperation();
  assert.equal(result.snapshotId, receipt.latestSnapshotId);
  assert.deepEqual(h.events, ['health', 'preflight', 'commit-receipt']);
  assert.equal(h.state.pending, null);
});

test('upload chunk failure retries the same create request before entering commit phase', async () => {
  const h = harness();
  await create(h);
  h.state.data.qinshi_progress = 'changed';
  const putChunk = h.api.putChunk;
  let failed = false;
  h.api.putChunk = async (...args) => {
    if (!failed) { failed = true; throw new Error('chunk offline'); }
    return putChunk(...args);
  };
  await assert.rejects(h.sync.uploadCurrentDevice(), /chunk offline/);
  const staged = structuredClone(h.state.uploads.at(-1));
  assert.equal(h.state.commits.length, 1);
  await h.sync.resumePendingOperation();
  assert.deepEqual(h.state.uploads.at(-1), staged);
  assert.equal(h.state.commits.length, 2);
});

test('upload authoritative commit 404 after staged expiry allows an explicit same-ciphertext new session retry', async () => {
  const h = harness();
  await create(h);
  h.state.data.qinshi_progress = 'pending progress';
  let clock = 0;
  let session;
  let creations = 0;
  let originalRequest;
  let originalChunk;
  let attempts = 0;
  const missing = Object.freeze(Object.assign(new Error('expired upload session'), { status: 404, code: 'HTTP_ERROR' }));
  h.api.createUpload = async (body, key) => {
    h.events.push('new-session');
    const request = JSON.stringify({ body, key });
    if (originalRequest) assert.ok(request === originalRequest, 'must retain exact upload metadata and operation key');
    else originalRequest = request;
    creations++;
    session = { uploadId: `staged-${creations}`, snapshotId: body.snapshotId,
      expiresAt: clock + 24 * 60 * 60 * 1000, uploadedChunks: [] };
    return session;
  };
  h.api.putChunk = async (id, index, bytes, digest) => {
    h.events.push('chunk');
    assert.equal(id, session.uploadId);
    assert.equal(index, 0);
    const chunk = JSON.stringify({ bytes: Buffer.from(bytes).toString('base64url'), digest });
    if (originalChunk) assert.ok(chunk === originalChunk, 'must retain exact ciphertext bytes');
    else originalChunk = chunk;
  };
  h.api.commitUpload = async (id, body, key) => {
    h.events.push('commit');
    assert.equal(id, session.uploadId);
    assert.equal(key, JSON.parse(originalRequest).key);
    assert.deepEqual(body, { beforeUploadId: null, sourceSnapshotId: null });
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('commit never reached server'), { status: 0, code: 'OFFLINE' });
    if (clock >= session.expiresAt) throw missing;
    return { operationId: id, latestSnapshotId: session.snapshotId, historySnapshotIds: [], serverCommittedAt: clock };
  };
  await assert.rejects(h.sync.uploadCurrentDevice(), /never reached/);
  const pending = structuredClone(h.state.pending);
  assert.deepEqual(Object.keys(pending).sort(), ['snapshotId', 'type']);
  clock = 24 * 60 * 60 * 1000 + 1;
  h.state.data.qinshi_progress = 'new local progress must not replace the pending snapshot';
  h.events.length = 0;
  await assert.rejects(h.sync.resumePendingOperation(), error => error === missing);
  assert.deepEqual(h.events, ['health', 'preflight', 'commit']);
  assert.equal(creations, 1);
  assert.deepEqual(h.state.pending, pending);
  h.events.length = 0;
  const result = await h.sync.uploadCurrentDevice();
  assert.equal(result.snapshotId, pending.snapshotId);
  assert.equal(creations, 2);
  assert.deepEqual(h.events, ['health', 'preflight', 'new-session', 'chunk', 'commit']);
  assert.equal(h.state.pending, null);
});

test('upload ambiguous commit failures keep commit-first regardless of error code spelling', async () => {
  for (const failure of [
    { status: 0, code: 'OFFLINE' }, { status: 0, code: 'TIMEOUT' },
    { status: 503, code: 'SERVICE_UNAVAILABLE' }, { status: 0, code: 'NOT_FOUND' },
    { status: '404', code: 'NOT_FOUND' }, null
  ]) {
    const h = harness();
    await create(h);
    h.state.data.qinshi_progress = 'changed';
    const commit = h.api.commitUpload;
    const original = failure && Object.assign(new Error('ambiguous commit'), failure);
    let first = true;
    h.api.commitUpload = async (...args) => {
      h.events.push('commit-attempt');
      if (first) {
        first = false;
        if (original) throw original;
        return {}; // Complete but malformed response is not proof that the session is absent.
      }
      return commit(...args);
    };
    await assert.rejects(h.sync.uploadCurrentDevice(), error => original ? error === original : /提交响应/.test(error.message));
    const creations = h.state.uploads.length;
    h.events.length = 0;
    await h.sync.resumePendingOperation();
    assert.equal(h.state.uploads.length, creations);
    assert.deepEqual(h.events, ['health', 'preflight', 'commit-attempt', 'commitUpload']);
    assert.equal(h.state.pending, null);
  }
});

test('upload local cleanup 404 cannot reset a successful commit to uploading', async () => {
  const h = harness();
  await create(h);
  h.state.data.qinshi_progress = 'changed';
  const clearPending = h.storage.clearPendingOperation;
  let first = true;
  h.storage.clearPendingOperation = async () => {
    if (first) { first = false; throw Object.assign(new Error('local cleanup failure'), { status: 404 }); }
    return clearPending();
  };
  await assert.rejects(h.sync.uploadCurrentDevice(), /local cleanup failure/);
  h.events.length = 0;
  await h.sync.resumePendingOperation();
  assert.deepEqual(h.events, ['health', 'preflight', 'commitUpload']);
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

test('revoked device awaits safe notice before forgetting and preserves original error', async () => {
  const h = harness();
  await create(h);
  const pairingBefore = structuredClone(h.state.pairing);
  const localBefore = structuredClone(h.state.data);
  const original = Object.assign(new Error('unsafe server detail'), { code: 'DEVICE_REVOKED', pairingInvalid: true });
  let releaseNotice;
  let noticeStarted;
  const started = new Promise(resolve => { noticeStarted = resolve; });
  h.deps.notifyPairingInvalid = async value => {
    h.events.push('notice');
    assert.deepEqual(Object.keys(value).sort(), ['code', 'message']);
    assert.equal(value.code, 'DEVICE_REVOKED');
    assert.equal(value.message.includes(original.message), false);
    for (const secret of [pairingBefore.masterKey, pairingBefore.deviceToken, password,
      h.state.spaces[0].body.authKey, h.state.devices[0].encryptedName.ciphertext]) {
      assert.equal(JSON.stringify(value).includes(secret), false);
    }
    noticeStarted();
    await new Promise(resolve => { releaseNotice = resolve; });
    h.events.push('notice-finished');
  };
  h.api.listDevices = async () => { throw original; };
  h.events.length = 0;
  const outcome = h.sync.getDashboard().catch(error => error);
  await Promise.race([started, outcome.then(() => assert.fail('notice was skipped'))]);
  assert.deepEqual(h.state.pairing, pairingBefore);
  releaseNotice();
  assert.equal(await outcome, original);
  assert.deepEqual(h.events, ['notice', 'notice-finished', 'forgetPairing']);
  assert.equal(h.state.pairing, null);
  assert.deepEqual(h.state.data, localBefore);
});

test('revoked notice and cleanup failures cannot replace the original error', async () => {
  for (const [noticeFails, cleanupFails] of [[true, false], [false, true], [true, true]]) {
    const h = harness();
    await create(h);
    const localBefore = structuredClone(h.state.data);
    const original = Object.freeze(Object.assign(new Error('revoked original'), { code: 'DEVICE_REVOKED', pairingInvalid: true }));
    h.deps.notifyPairingInvalid = async () => { h.events.push('notice'); if (noticeFails) throw new Error('private callback detail'); };
    const forget = h.storage.forgetPairing;
    h.storage.forgetPairing = async () => {
      if (cleanupFails) { h.events.push('cleanup-failed'); throw new Error('private storage detail'); }
      return forget();
    };
    h.api.listDevices = async () => { throw original; };
    h.events.length = 0;
    await assert.rejects(h.sync.getDashboard(), error => error === original);
    assert.deepEqual(h.events, ['notice', cleanupFails ? 'cleanup-failed' : 'forgetPairing']);
    assert.deepEqual(h.state.data, localBefore);
  }
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

async function pullHarness() {
  const h = harness();
  await create(h);
  const source = structuredClone(h.state.devices[0].latestSnapshot);
  const sourceBytes = h.state.chunks.map(bytes => bytes.slice());
  h.source = source;
  h.state.data = { qinshi_progress: 'unsynced local', qinshi_extra: 'must be removed' };
  h.state.rollback = null;
  h.storage.loadRollbackCopy = async () => structuredClone(h.state.rollback);
  h.storage.saveRollbackCopy = async copy => { h.events.push('save-rollback'); h.state.rollback = structuredClone(copy); };
  h.storage.claimRollbackCopy = async copy => {
    if (h.state.rollback) throw Object.assign(new Error('回滚已被占用'), { code: 'ROLLBACK_CONFLICT' });
    return h.storage.saveRollbackCopy(copy);
  };
  h.storage.clearRollbackCopy = async ownerId => {
    if (h.state.rollback && h.state.rollback.ownerId !== ownerId) throw Object.assign(new Error('回滚 owner 冲突'), { code: 'ROLLBACK_CONFLICT' });
    h.events.push('clear-rollback'); h.state.rollback = null;
  };
  h.deps.settings.makePayload = reason => ({ formatVersion: 1, appName: 'Qin', reason, data: structuredClone(h.state.data) });
  h.deps.settings.downloadPayload = payload => { h.events.push('json-backup'); h.state.backup = structuredClone(payload); };
  h.deps.settings.replaceManagedData = data => { h.events.push('replace-local'); h.state.data = structuredClone(data); };
  h.deps.settings.restoreManagedData = data => { h.events.push('restore-local'); h.state.data = structuredClone(data); };
  h.deps.location = { reload() { h.events.push('reload'); } };
  h.deps.pwa.applyUpdate = () => { h.events.push('apply-update'); assert.deepEqual(h.state.pending, { type: h.resumeType || 'pull', snapshotId: source.snapshotId }); };
  h.api.getSnapshot = async id => { h.events.push('download:' + id); assert.equal(id, source.snapshotId); return structuredClone(source); };
  h.api.getChunk = async (id, index, options) => {
    assert.equal(id, source.snapshotId);
    assert.equal(options.withDigest, true);
    return { bytes: sourceBytes[index].slice().buffer, digest: createHash('sha256').update(sourceBytes[index]).digest('base64url') };
  };
  const sessions = new Map();
  h.api.createUpload = async (body, key) => {
    h.events.push('stage:' + body.operation);
    h.state.uploads.push(structuredClone({ body, key }));
    const uploadId = randomUUID();
    sessions.set(uploadId, { body: structuredClone(body), key, chunks: [] });
    return { uploadId, snapshotId: body.snapshotId, uploadedChunks: [] };
  };
  h.api.putChunk = async (id, index, bytes, digest) => {
    assert.equal(createHash('sha256').update(bytes).digest('base64url'), digest);
    sessions.get(id).chunks[index] = { index, byteLength: bytes.length, data: Buffer.from(bytes).toString('base64url'), digest };
  };
  h.api.commitUpload = async (id, body, key) => {
    h.events.push('commit-cloud');
    const after = sessions.get(id), before = sessions.get(body.beforeUploadId);
    assert.equal(after.key, key);
    assert.equal(after.body.sourceSnapshotId, source.snapshotId);
    assert.equal(body.sourceSnapshotId, source.snapshotId);
    assert.equal(before.body.operation, after.body.operation.replace('-after', '-before'));
    h.state.commits.push({ id, body, key });
    h.state.committedPair = { before, after };
    return { operationId: id, latestSnapshotId: after.body.snapshotId, historySnapshotIds: [before.body.snapshotId], serverCommittedAt: 2 };
  };
  h.events.length = 0;
  return h;
}

test('pull pins source id, keeps preview opaque, backs up before replacement and commits one pair', async () => {
  const h = await pullHarness();
  const before = structuredClone(h.state.data);
  const preview = await h.sync.preparePull(h.source.snapshotId);
  assert.equal(preview.snapshotId, h.source.snapshotId);
  assert.equal(preview.sourceDeviceName, 'Windows 设备');
  assert.equal(preview.currentDeviceName, 'Windows 设备');
  assert.equal(preview.serverCreatedAt, 1);
  assert.equal(preview.itemCount, 1);
  assert.match(preview.confirmationText, /Windows 设备 → Windows 设备/);
  assert.match(preview.confirmationText, /当前设备全部个人数据将被覆盖/);
  assert.equal(JSON.stringify(preview).includes('local progress'), false);
  assert.deepEqual(h.state.data, before);
  h.state.devices[0].latestSnapshot = null; // Never resolve a latest alias after selection.
  await h.sync.confirmPull(preview);
  assert.deepEqual(h.state.data, { qinshi_progress: 'local progress' });
  assert.deepEqual(h.state.backup.data, before);
  assert.equal(h.state.rollback, null);
  assert.equal(h.state.pending, null);
  assert.deepEqual(h.events.filter(event => !['collect', 'listDevices'].includes(event)), [
    'health', 'preflight', 'download:' + h.source.snapshotId,
    'health', 'preflight', 'download:' + h.source.snapshotId,
    'save-rollback', 'json-backup', 'stage:replace-before', 'stage:replace-after',
    'replace-local', 'commit-cloud', 'clear-rollback', 'reload'
  ]);
  for (const [side, expected] of [['before', before], ['after', { qinshi_progress: 'local progress' }]]) {
    const staged = h.state.committedPair[side];
    const bytes = await h.cryptoApi.joinAndVerifyChunks(staged.chunks, staged.body.ciphertextDigest);
    const envelope = await h.cryptoApi.decryptSnapshot({ version: 1, algorithm: 'AES-256-GCM', ...staged.body, ciphertext: Buffer.from(bytes).toString('base64url') }, h.state.pairing.masterKey,
      { ...staged.body, spaceId: h.state.pairing.spaceId, sourceDeviceId: h.state.pairing.deviceId });
    assert.deepEqual(envelope.data, expected);
    assert.notEqual(staged.body.iv, h.source.iv);
    assert.notEqual(staged.body.snapshotId, h.source.snapshotId);
  }
  await assert.rejects(h.sync.confirmPull(preview), /确认|失效/);
});

test('pull rejects missing explicit id or forged confirmation before side effects', async () => {
  const h = await pullHarness();
  await assert.rejects(h.sync.preparePull(), /快照/);
  await assert.rejects(h.sync.confirmPull({ snapshotId: h.source.snapshotId }), /确认|失效/);
  assert.deepEqual(h.events, []);
});

test('pull PWA update resumes the exact source id after reload without persisting plaintext', async () => {
  const h = await pullHarness();
  h.state.ready = false;
  h.deps.pwa.ensureCurrentForSync = async () => { h.events.push('preflight'); return { ready: h.state.ready, updateRequired: !h.state.ready }; };
  await assert.rejects(h.sync.preparePull(h.source.snapshotId), /版本|更新/);
  assert.deepEqual(h.events, ['health', 'preflight', 'apply-update']);
  assert.deepEqual(h.state.pending, { type: 'pull', snapshotId: h.source.snapshotId });
  h.state.ready = true;
  h.state.devices[0].latestSnapshot = null;
  h.events.length = 0;
  const resumed = await moduleApi.createSync(h.deps).resumePendingOperation();
  assert.equal(resumed.status, 'confirmation-required');
  assert.equal(resumed.preview.snapshotId, h.source.snapshotId);
  assert.equal(h.events.includes('replace-local'), false);
});

test('pull validates chunk and total digests, metadata identity, AAD and schema before any backup', async () => {
  for (const change of ['chunk', 'chunk-digest', 'full-digest', 'identity', 'aad', 'schema']) {
    const h = await pullHarness();
    const getChunk = h.api.getChunk;
    if (change === 'chunk') h.api.getChunk = async (...args) => { const result = await getChunk(...args); new Uint8Array(result.bytes)[0] ^= 1; return result; };
    if (change === 'chunk-digest') h.api.getChunk = async (...args) => ({ ...await getChunk(...args), digest: 'A'.repeat(43) });
    if (change === 'full-digest') h.source.ciphertextDigest = 'A'.repeat(43);
    if (change === 'identity') h.api.getSnapshot = async () => ({ ...h.source, snapshotId: randomUUID() });
    if (change === 'aad') h.cryptoApi.decryptSnapshot = (record, key, fields) => cryptoModule.createCrypto({ crypto: webcrypto }).decryptSnapshot(record, key, { ...fields, spaceId: randomUUID() });
    if (change === 'schema') h.cryptoApi.decryptSnapshot = async () => ({ formatVersion: 99, data: { outside: 'forbidden' } });
    await assert.rejects(h.sync.preparePull(h.source.snapshotId));
    assert.equal(h.events.includes('json-backup'), false, change);
    assert.equal(h.state.rollback, null, change);
  }
});

test('pull source deletion at confirmation never backs up or replaces local data', async () => {
  const h = await pullHarness();
  const preview = await h.sync.preparePull(h.source.snapshotId);
  h.api.getSnapshot = async () => { throw new Error('source deleted'); };
  await assert.rejects(h.sync.confirmPull(preview), /source deleted/);
  assert.equal(h.events.includes('json-backup'), false);
});

test('pull blocked JSON download still saves IndexedDB rollback before replacing', async () => {
  const h = await pullHarness();
  h.deps.settings.downloadPayload = () => { h.events.push('blocked-download'); throw new Error('download blocked'); };
  const result = await h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId));
  assert.equal(result.backupDownloadFailed, true);
  assert.ok(h.events.indexOf('save-rollback') < h.events.indexOf('replace-local'));
});

test('pull rollback storage exhaustion aborts before staging or modifying local data', async () => {
  const h = await pullHarness();
  const before = structuredClone(h.state.data);
  h.storage.saveRollbackCopy = async () => { throw new Error('quota exceeded'); };
  await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), /quota/);
  assert.deepEqual(h.state.data, before);
  assert.equal(h.events.includes('stage:replace-before'), false);
});

test('pull local, stage and cloud failures preserve original data and rollback evidence', async () => {
  for (const phase of ['stage', 'local', 'cloud']) {
    const h = await pullHarness();
    const before = structuredClone(h.state.data);
    if (phase === 'stage') h.api.createUpload = async () => { throw new Error('stage failed'); };
    if (phase === 'local') h.deps.settings.replaceManagedData = () => { h.state.data = {}; throw new Error('local failed'); };
    if (phase === 'cloud') h.api.commitUpload = async () => { throw new Error('cloud failed'); };
    await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), new RegExp(phase + ' failed'));
    assert.deepEqual(h.state.data, before);
    assert.deepEqual(h.state.rollback.data, before);
    assert.equal(h.events.includes('clear-rollback'), false);
    assert.equal(h.events.includes('reload'), false);
    await assert.rejects(h.sync.preparePull(h.source.snapshotId), /回滚/);
  }
});

test('pull cancellation before local replacement aborts and keeps recovery evidence', async () => {
  const h = await pullHarness();
  const preview = await h.sync.preparePull(h.source.snapshotId);
  const createUpload = h.api.createUpload;
  h.api.createUpload = async (...args) => { h.sync.cancelPull(preview); return createUpload(...args); };
  await assert.rejects(h.sync.confirmPull(preview), /取消/);
  assert.equal(h.events.includes('replace-local'), false);
  assert.ok(h.state.rollback);
});

test('pull locks duplicate controls while replacement is in progress', async () => {
  const h = await pullHarness();
  const preview = await h.sync.preparePull(h.source.snapshotId);
  const commit = h.api.commitUpload;
  h.api.commitUpload = async (...args) => {
    await assert.rejects(h.sync.confirmPull(preview), /正在进行/);
    await assert.rejects(h.sync.uploadCurrentDevice(), /正在进行/);
    assert.equal(h.sync.cancelPull(preview), false);
    return commit(...args);
  };
  await h.sync.confirmPull(preview);
});

test('restore history prepares explicit confirmation and uses the restore atomic pair', async () => {
  const h = await pullHarness();
  h.state.devices[0].historySnapshots = [h.source];
  h.state.devices[0].latestSnapshot = null;
  const preview = await h.sync.restoreHistory(h.source.snapshotId);
  assert.equal(preview.type, 'restore');
  assert.equal(h.events.includes('replace-local'), false);
  await h.sync.confirmPull(preview);
  assert.equal(h.state.committedPair.before.body.operation, 'restore-before');
  assert.equal(h.state.committedPair.after.body.operation, 'restore-after');
});

test('rollback recovery never silently deletes evidence and requires an explicit action', async () => {
  const h = await pullHarness();
  h.state.rollback = { createdAt: time, data: { qinshi_progress: 'original' } };
  let recovered = await h.sync.recoverInterruptedRollback();
  assert.equal(recovered.status, 'recovery-required');
  assert.equal(recovered.matchesCurrent, false);
  assert.deepEqual(recovered.actions, ['恢复覆盖前数据', '保留当前数据并删除回滚副本']);
  assert.ok(h.state.rollback);
  await h.sync.recoverInterruptedRollback('restore');
  assert.deepEqual(h.state.data, { qinshi_progress: 'original' });
  assert.equal(h.state.rollback, null);
  h.state.rollback = { createdAt: time, data: { qinshi_progress: 'other' } };
  await h.sync.recoverInterruptedRollback('discard');
  assert.deepEqual(h.state.data, { qinshi_progress: 'original' });
  assert.equal(h.state.rollback, null);
});

test('rollback restoration failure retains evidence and cannot claim successful recovery', async () => {
  const h = await pullHarness();
  h.state.rollback = { createdAt: time, data: { qinshi_progress: 'original' } };
  h.deps.settings.restoreManagedData = () => { throw new Error('restore unavailable'); };
  await assert.rejects(h.sync.recoverInterruptedRollback('restore'), /restore unavailable/);
  assert.ok(h.state.rollback);
});

test('rollback evidence blocks uploads and is discovered on resume even without pending session state', async () => {
  const h = await pullHarness();
  h.state.rollback = { createdAt: time, data: { qinshi_progress: 'original' } };
  await assert.rejects(h.sync.uploadCurrentDevice(), /回滚/);
  assert.equal((await moduleApi.createSync(h.deps).resumePendingOperation()).status, 'recovery-required');
  assert.equal(h.events.includes('collect'), true); // Recovery comparison, never upload staging.
  assert.equal(h.events.some(event => event.startsWith('stage:')), false);
  assert.ok(h.state.rollback);
});

test('pull cleanup failure after both commits retains current data and rollback evidence', async () => {
  const h = await pullHarness();
  h.storage.clearPendingOperation = async () => { throw new Error('cleanup failed'); };
  await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), /cleanup failed/);
  assert.deepEqual(h.state.data, { qinshi_progress: 'local progress' });
  assert.ok(h.state.committedPair);
  assert.ok(h.state.rollback);
  assert.equal(h.events.includes('restore-local'), false);
});

test('pull detects local edits during staging and never overwrites them', async () => {
  const h = await pullHarness();
  const createUpload = h.api.createUpload;
  h.api.createUpload = async (...args) => { h.state.data.qinshi_progress = 'edited while waiting'; return createUpload(...args); };
  await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), /本机数据已变化/);
  assert.equal(h.state.data.qinshi_progress, 'edited while waiting');
  assert.equal(h.events.includes('replace-local'), false);
  assert.ok(h.state.rollback);
});

test('restore update resume retains restore type and rejects other-device history', async () => {
  const h = await pullHarness();
  h.resumeType = 'restore';
  h.state.devices[0].historySnapshots = [h.source];
  h.state.devices[0].latestSnapshot = null;
  h.deps.pwa.ensureCurrentForSync = async () => ({ ready: h.state.ready, updateRequired: !h.state.ready });
  h.state.ready = false;
  await assert.rejects(h.sync.restoreHistory(h.source.snapshotId), /更新|版本/);
  assert.deepEqual(h.state.pending, { type: 'restore', snapshotId: h.source.snapshotId });
  h.state.ready = true;
  assert.equal((await moduleApi.createSync(h.deps).resumePendingOperation()).preview.type, 'restore');
  h.state.devices[0].historySnapshots = [];
  await assert.rejects(h.sync.restoreHistory(h.source.snapshotId), /历史快照/);
});

test('pull from a different device shows full names and re-encrypts with current-device AAD', async () => {
  const h = await pullHarness();
  h.state.pairing = null;
  await h.sync.joinSpace({ syncCode: h.state.spaces[0].body.syncCode, password, deviceName: '当前平板的完整设备名称' });
  h.state.devices.push({ ...h.state.pairRequest.body.device, revoked: false, latestSnapshot: null, historySnapshots: [] });
  await assert.rejects(h.sync.restoreHistory(h.source.snapshotId), /当前设备的历史/);
  const preview = await h.sync.preparePull(h.source.snapshotId);
  assert.match(preview.confirmationText, /Windows 设备 → 当前平板的完整设备名称/);
  await h.sync.confirmPull(preview);
  const staged = h.state.committedPair.after;
  const bytes = await h.cryptoApi.joinAndVerifyChunks(staged.chunks, staged.body.ciphertextDigest);
  const record = { version: 1, algorithm: 'AES-256-GCM', ...staged.body, ciphertext: Buffer.from(bytes).toString('base64url') };
  const fields = { ...staged.body, spaceId: h.state.pairing.spaceId, sourceDeviceId: h.state.pairing.deviceId };
  assert.deepEqual((await h.cryptoApi.decryptSnapshot(record, h.state.pairing.masterKey, fields)).data, { qinshi_progress: 'local progress' });
  await assert.rejects(h.cryptoApi.decryptSnapshot(record, h.state.pairing.masterKey, { ...fields, sourceDeviceId: h.source.deviceId }), /校验/);
});

test('stale pull preview cannot override an upload that became pending after preparation', async () => {
  for (const persistent of [true, false]) {
    const h = await pullHarness();
    const preview = await h.sync.preparePull(h.source.snapshotId);
    h.api.commitUpload = async () => { throw new Error('ambiguous upload'); };
    await assert.rejects(h.sync.uploadCurrentDevice(), /ambiguous upload/);
    if (!persistent) h.state.pending = null; // Still reject the private pending upload.
    h.events.length = 0;
    await assert.rejects(h.sync.confirmPull(preview), /已有同步|待处理/);
    assert.deepEqual(h.events, []);
    assert.equal(h.state.rollback, null);
  }
});

test('stale restore confirmation rejects a different persistent operation before any side effect', async () => {
  const h = await pullHarness();
  h.state.devices[0].historySnapshots = [h.source];
  const preview = await h.sync.restoreHistory(h.source.snapshotId);
  h.state.pending = { type: 'upload', snapshotId: randomUUID() };
  h.events.length = 0;
  await assert.rejects(h.sync.confirmPull(preview), /已有同步|待处理/);
  assert.deepEqual(h.events, []);
});

test('two tabs cannot both back up or replace when racing to claim the rollback copy', async () => {
  const h = await pullHarness();
  const b = moduleApi.createSync({ ...h.deps, storage: { ...h.storage,
    loadPendingOperation: async () => null, savePendingOperation: async () => {}, clearPendingOperation: async () => {} } });
  const aPreview = await h.sync.preparePull(h.source.snapshotId);
  const bPreview = await b.preparePull(h.source.snapshotId);
  const claim = h.storage.claimRollbackCopy;
  let release;
  let claimed;
  const started = new Promise(resolve => { claimed = resolve; });
  h.storage.claimRollbackCopy = async copy => { await claim(copy); claimed(); await new Promise(resolve => { release = resolve; }); };
  const outcome = h.sync.confirmPull(aPreview);
  await Promise.race([started, outcome.then(() => assert.fail('atomic rollback claim was skipped'))]);
  const owner = h.state.rollback.ownerId;
  assert.match(owner, /^[0-9a-f-]{36}$/);
  h.events.length = 0;
  await assert.rejects(b.confirmPull(bPreview), /回滚/);
  assert.deepEqual(h.events, []);
  assert.equal(h.state.rollback.ownerId, owner);
  release();
  await outcome;
  assert.equal(h.state.rollback, null);
  assert.equal(h.events.filter(event => event === 'json-backup').length, 1);
});

test('atomic rollback claim loser does not download a backup even after both tabs passed prechecks', async () => {
  const h = await pullHarness();
  const preview = await h.sync.preparePull(h.source.snapshotId);
  h.storage.claimRollbackCopy = async () => {
    h.state.rollback = { ownerId: randomUUID(), createdAt: time, data: { qinshi_progress: 'other tab' } };
    throw Object.assign(new Error('回滚已被占用'), { code: 'ROLLBACK_CONFLICT' });
  };
  await assert.rejects(h.sync.confirmPull(preview), error => error.code === 'ROLLBACK_CONFLICT');
  assert.equal(h.events.includes('json-backup'), false);
  assert.equal(h.events.some(event => event.startsWith('stage:')), false);
  assert.equal(h.state.rollback.data.qinshi_progress, 'other tab');
});

test('stale failure cannot restore or clear another owner rollback record', async () => {
  const h = await pullHarness();
  const replacement = { ownerId: randomUUID(), createdAt: time, data: { qinshi_progress: 'other tab rollback' } };
  h.api.commitUpload = async () => {
    h.state.rollback = structuredClone(replacement);
    h.state.data = { qinshi_progress: 'other tab current' };
    throw new Error('commit failed after ownership changed');
  };
  await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), /回滚|owner/);
  assert.deepEqual(h.state.data, { qinshi_progress: 'other tab current' });
  assert.deepEqual(h.state.rollback, replacement);
  assert.equal(h.events.includes('restore-local'), false);
});

test('explicit recovery cannot clear a new record installed after the original read', async () => {
  const h = await pullHarness();
  h.state.rollback = { ownerId: randomUUID(), createdAt: time, data: { qinshi_progress: 'original' } };
  const replacement = { ownerId: randomUUID(), createdAt: time, data: { qinshi_progress: 'other tab' } };
  h.storage.clearPendingOperation = async () => { h.state.rollback = structuredClone(replacement); };
  await assert.rejects(h.sync.recoverInterruptedRollback('discard'), error => error.code === 'ROLLBACK_CONFLICT');
  assert.deepEqual(h.state.rollback, replacement);
});

test('owned crash recovery restores or discards only the captured owner and keeps session metadata minimal', async () => {
  for (const action of ['restore', 'discard']) {
    const h = await pullHarness();
    h.api.commitUpload = async () => { throw new Error('interrupted commit'); };
    await assert.rejects(h.sync.confirmPull(await h.sync.preparePull(h.source.snapshotId)), /interrupted/);
    assert.deepEqual(Object.keys(h.state.pending).sort(), ['snapshotId', 'type']);
    const ownerId = h.state.rollback.ownerId;
    assert.equal(typeof ownerId, 'string');
    const fresh = moduleApi.createSync(h.deps);
    assert.equal((await fresh.resumePendingOperation()).status, 'recovery-required');
    await assert.rejects(fresh.preparePull(h.source.snapshotId), /回滚/);
    const result = await fresh.recoverInterruptedRollback(action);
    assert.equal(result.status, action === 'restore' ? 'recovered' : 'discarded');
    assert.equal(h.state.rollback, null);
    assert.equal(h.state.pending, null);
  }
});
