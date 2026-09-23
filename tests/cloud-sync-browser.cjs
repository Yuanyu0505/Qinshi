const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');

const PASSWORD = 'browser-only-test-password';
const LIMITS = { minimumReadVersion: '1.0.40', minimumWriteVersion: '1.0.40' };
const INTENDED_ROUTES = new Set([
  'GET /v1/health', 'POST /v1/spaces', 'GET /v1/spaces/:code/parameters', 'POST /v1/spaces/:code/pair',
  'POST /v1/spaces/:code/recover', 'GET /v1/devices', 'PATCH /v1/devices/:deviceId',
  'DELETE /v1/devices/:deviceId', 'POST /v1/uploads', 'PUT /v1/uploads/:uploadId/chunks/:index',
  'POST /v1/uploads/:uploadId/commit', 'GET /v1/snapshots/:snapshotId',
  'GET /v1/snapshots/:snapshotId/chunks/:index', 'POST /v1/security/password',
  'POST /v1/security/recovery-key', 'DELETE /v1/spaces/current', 'OPTIONS *'
]);
const SAFE_REQUEST_FIELDS = new Set(['method', 'pathname', 'contentType', 'hasVersion', 'hasIdempotency',
  'hasValidAuth', 'requiresAuth', 'requiresIdempotency', 'expectsJson', 'expectsBinary', 'confirmation', 'authField']);
const coveredRoutes = new Set();
let browser, server, appUrl, appPort;
let scenarioStubs = [];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('base64url');
}

function uuidFor(sequence) {
  return `00000000-0000-4000-8000-${Number(sequence).toString(16).padStart(12, '0')}`;
}

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function validBase64url(value, minimumBytes, maximumBytes = minimumBytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  let bytes;
  try { bytes = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); } catch { return false; }
  return bytes.length >= minimumBytes && bytes.length <= maximumBytes &&
    bytes.toString('base64url') === value;
}

function normalizedPath(pathname) {
  if (/^\/v1\/spaces\/[^/]+\/(parameters|pair|recover)$/.test(pathname)) {
    return pathname.replace(/^\/v1\/spaces\/[^/]+\//, '/v1/spaces/:code/');
  }
  if (/^\/v1\/devices\/[^/]+$/.test(pathname)) return '/v1/devices/:deviceId';
  if (/^\/v1\/uploads\/[^/]+\/chunks\/[^/]+$/.test(pathname)) return '/v1/uploads/:uploadId/chunks/:index';
  if (/^\/v1\/uploads\/[^/]+\/commit$/.test(pathname)) return '/v1/uploads/:uploadId/commit';
  if (/^\/v1\/snapshots\/[^/]+\/chunks\/[^/]+$/.test(pathname)) return '/v1/snapshots/:snapshotId/chunks/:index';
  if (/^\/v1\/snapshots\/[^/]+$/.test(pathname)) return '/v1/snapshots/:snapshotId';
  return pathname;
}

class CloudStub {
  constructor() { this.reset(); scenarioStubs.push(this); }

  reset() {
    this.space = null;
    this.devices = new Map();
    this.uploads = new Map();
    this.snapshots = new Map();
    this.receipts = new Map();
    this.sequence = 0;
    this.offline = false;
    this.revoked = new Set();
    this.tamperSnapshotId = null;
    this.failReplacementCommit = false;
    this.requests = [];
    this.responses = [];
    this.violations = [];
    this.allowedOrigin = '';
  }

  responseHeaders(request, headers = {}) {
    return { 'Access-Control-Allow-Origin': this.allowedOrigin, 'Access-Control-Expose-Headers': 'X-Chunk-SHA256',
      'Cache-Control': 'no-store', 'Vary': 'Origin', ...headers };
  }

  fulfill(route, details) {
    const headers = Object.fromEntries(Object.entries(details.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    this.responses.push({ method: route.request().method(), pathname: normalizedPath(new URL(route.request().url()).pathname),
      status: details.status, allowOrigin: headers['access-control-allow-origin'] || '', vary: headers.vary || '',
      expose: headers['access-control-expose-headers'] || '', allowMethods: headers['access-control-allow-methods'] || '',
      allowHeaders: headers['access-control-allow-headers'] || '' });
    return route.fulfill(details);
  }

  json(route, status, value, headers = {}) {
    const request = route.request();
    return this.fulfill(route, { status, contentType: 'application/json; charset=utf-8',
      headers: this.responseHeaders(request, headers), body: JSON.stringify(value) });
  }

  violation(route, reason, status = 400, cors = true) {
    const request = route.request();
    const safe = { method: request.method(), pathname: normalizedPath(new URL(request.url()).pathname), reason };
    this.violations.push(safe);
    if (!cors) return this.fulfill(route, { status, contentType: 'application/json; charset=utf-8',
      headers: { 'Cache-Control': 'no-store', Vary: 'Origin' }, body: JSON.stringify({ error: { code: 'ORIGIN_NOT_ALLOWED' } }) });
    return this.json(route, status, { error: { code: status === 401 ? 'AUTH_FAILED' : 'INVALID_REQUEST' } });
  }

  authenticate(request) {
    const match = /^Device ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(request.headers().authorization || '');
    if (!match) return null;
    const device = this.devices.get(match[1]);
    if (!device || device.revoked || device.deviceToken !== match[2] || !this.space || device.spaceId !== this.space.spaceId) return null;
    return device;
  }

  body(request, exactFields) {
    let value;
    try { value = request.postDataJSON(); } catch { return null; }
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const actual = Object.keys(value).sort();
    const expected = exactFields.slice().sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return null;
    return value;
  }

  validDevice(value) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === 'deviceId,deviceToken,encryptedName' &&
      validId(value.deviceId) && validBase64url(value.deviceToken, 32) && this.validBlob(value.encryptedName, false);
  }

  validBlob(value, wrapped = true) {
    return value && !Array.isArray(value) && typeof value === 'object' &&
      Object.keys(value).sort().join(',') === 'algorithm,ciphertext,iv,version' && value.version === 1 &&
      value.algorithm === 'AES-256-GCM' && validBase64url(value.iv, 12) &&
      validBase64url(value.ciphertext, wrapped ? 48 : 16, wrapped ? 48 : 4096);
  }

  validKdf(value) {
    return value && !Array.isArray(value) && typeof value === 'object' &&
      Object.keys(value).sort().join(',') === 'hash,iterations,kdf,salt,version' && value.version === 1 &&
      value.kdf === 'PBKDF2-HMAC-SHA-256' && value.hash === 'SHA-256' && value.iterations === 600000 &&
      validBase64url(value.salt, 16);
  }

  validUpload(body) {
    const fields = ['operation', 'snapshotId', 'sourceSnapshotId', 'appVersion', 'formatVersion', 'schemaVersion', 'encoding',
      'clientCreatedAt', 'dataHash', 'iv', 'ciphertextBytes', 'chunkCount', 'ciphertextDigest', 'encryptedSummary'];
    return body && Object.keys(body).sort().join(',') === fields.sort().join(',') &&
      ['upload', 'replace-before', 'replace-after', 'restore-before', 'restore-after'].includes(body.operation) &&
      validId(body.snapshotId) && (body.sourceSnapshotId === null || validId(body.sourceSnapshotId)) &&
      body.appVersion === LIMITS.minimumWriteVersion && body.formatVersion === 1 && body.schemaVersion === 1 &&
      ['identity', 'gzip'].includes(body.encoding) && typeof body.clientCreatedAt === 'string' &&
      !Number.isNaN(Date.parse(body.clientCreatedAt)) && new Date(Date.parse(body.clientCreatedAt)).toISOString() ===
        body.clientCreatedAt.replace(/(?<=:\d{2})Z$/, '.000Z') &&
      validBase64url(body.dataHash, 32) && validBase64url(body.iv, 12) && Number.isSafeInteger(body.ciphertextBytes) &&
      body.ciphertextBytes >= 16 && body.ciphertextBytes <= 10 * 1024 * 1024 && Number.isSafeInteger(body.chunkCount) &&
      body.chunkCount === Math.ceil(body.ciphertextBytes / (512 * 1024)) && validBase64url(body.ciphertextDigest, 32) &&
      body.operation.endsWith('-after') === (body.sourceSnapshotId !== null) && body.sourceSnapshotId !== body.snapshotId &&
      this.validBlob(body.encryptedSummary, false);
  }

  assertClean() {
    assert.deepEqual(this.violations, [], 'Worker stub protocol violations must stay empty');
    const known = new Set(Array.from(INTENDED_ROUTES, value => value.slice(value.indexOf(' ') + 1)));
    for (const request of this.requests) {
      assert.deepEqual(Object.keys(request).filter(key => !SAFE_REQUEST_FIELDS.has(key)), [], 'request observations must contain safe flags only');
      assert.ok(request.method === 'OPTIONS' ? known.has(request.pathname) : INTENDED_ROUTES.has(`${request.method} ${request.pathname}`),
        `unexpected Worker route ${request.method} ${request.pathname}`);
      if (request.method !== 'OPTIONS') {
        assert.equal(request.hasVersion, true, `${request.method} ${request.pathname} version`);
        if (request.requiresAuth) assert.equal(request.hasValidAuth, true, `${request.method} ${request.pathname} auth`);
        if (request.requiresIdempotency) assert.equal(request.hasIdempotency, true, `${request.method} ${request.pathname} idempotency`);
        if (request.expectsJson) assert.match(request.contentType, /^application\/json(?:\s*;\s*charset=utf-8)?$/i);
        if (request.expectsBinary) assert.equal(request.contentType, 'application/octet-stream');
      }
    }
    for (const response of this.responses) {
      assert.equal(response.allowOrigin, this.allowedOrigin, `${response.method} ${response.pathname} CORS origin`);
      assert.equal(response.vary, 'Origin', `${response.method} ${response.pathname} Vary`);
      assert.equal(response.expose, 'X-Chunk-SHA256', `${response.method} ${response.pathname} expose`);
      if (response.method === 'OPTIONS') {
        assert.equal(response.allowMethods, 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        assert.equal(response.allowHeaders, 'Authorization, Content-Type, X-Qin-App-Version, Idempotency-Key, X-Chunk-SHA256');
      }
    }
  }

  validateStoredUpload(upload, device) {
    if (!upload || !this.validUpload(upload.body) || upload.deviceId !== device.deviceId || upload.spaceId !== device.spaceId ||
      upload.chunks.length !== upload.body.chunkCount) return false;
    let total = 0;
    for (let index = 0; index < upload.body.chunkCount; index += 1) {
      const chunk = upload.chunks[index];
      const expected = index < upload.body.chunkCount - 1 ? 512 * 1024 : upload.body.ciphertextBytes - index * 512 * 1024;
      if (!Buffer.isBuffer(chunk) || chunk.length !== expected || digest(chunk) !== upload.chunkDigests[index]) return false;
      total += chunk.length;
    }
    return total === upload.body.ciphertextBytes && digest(Buffer.concat(upload.chunks)) === upload.body.ciphertextDigest;
  }

  validCommittedSource(snapshotId, spaceId) {
    if (snapshotId === null) return true;
    const source = this.snapshots.get(snapshotId);
    return Boolean(source && source.spaceId === spaceId && source.role !== 'staged');
  }

  metadata(upload, deviceId) {
    const { operation, ...body } = upload.body;
    return { ...body, deviceId, serverCreatedAt: new Date(1700000000000 + (++this.sequence * 1000)).toISOString() };
  }

  saveLatest(device, upload, beforeUpload) {
    const latest = this.metadata(upload, device.deviceId);
    this.snapshots.set(latest.snapshotId, { metadata: latest, chunks: upload.chunks.slice(),
      spaceId: device.spaceId, role: 'latest' });
    if (beforeUpload) {
      const before = this.metadata(beforeUpload, device.deviceId);
      this.snapshots.set(before.snapshotId, { metadata: before, chunks: beforeUpload.chunks.slice(),
        spaceId: device.spaceId, role: 'history' });
      device.historySnapshots.unshift(before);
    } else if (device.latestSnapshot) {
      const prior = this.snapshots.get(device.latestSnapshot.snapshotId);
      if (prior) prior.role = 'history';
      device.historySnapshots.unshift(device.latestSnapshot);
    }
    device.historySnapshots = device.historySnapshots.slice(0, 3);
    device.latestSnapshot = latest;
    device.lastUploadedAt = latest.serverCreatedAt;
    return latest;
  }

  async handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    if (this.offline) return route.abort('internetdisconnected');
    const headers = request.headers();
    const safePath = normalizedPath(pathname);
    const idempotent = (method === 'POST' && (pathname === '/v1/spaces' || /\/(?:pair|recover)$/.test(pathname) ||
      pathname === '/v1/uploads' || /\/commit$/.test(pathname) || /^\/v1\/security\/(?:password|recovery-key)$/.test(pathname))) ||
      (method === 'DELETE' && pathname === '/v1/spaces/current');
    const needsAuth = /^\/v1\/devices(?:\/|$)/.test(pathname) || pathname === '/v1/uploads' ||
      /^\/v1\/(?:uploads|snapshots)\//.test(pathname) || /^\/v1\/security\/(?:password|recovery-key)$/.test(pathname) ||
      pathname === '/v1/spaces/current';
    const device = this.authenticate(request);
    const observation = { method, pathname: safePath, contentType: headers['content-type'] || '',
      hasVersion: headers['x-qin-app-version'] === LIMITS.minimumWriteVersion,
      hasIdempotency: /^[A-Za-z0-9_-]{1,128}$/.test(headers['idempotency-key'] || ''),
      hasValidAuth: Boolean(device), requiresAuth: needsAuth, requiresIdempotency: idempotent,
      expectsJson: ['POST', 'PATCH', 'DELETE'].includes(method), expectsBinary: method === 'PUT' };
    this.requests.push(observation);
    coveredRoutes.add(method === 'OPTIONS' ? 'OPTIONS *' : `${method} ${safePath}`);
    if (headers.origin !== this.allowedOrigin) return this.violation(route, 'origin-not-allowed', 403, false);
    if (method === 'OPTIONS') {
      const requestedMethod = headers['access-control-request-method'];
      const requestedHeaders = (headers['access-control-request-headers'] || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      const allowed = ['authorization', 'content-type', 'x-qin-app-version', 'idempotency-key', 'x-chunk-sha256'];
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(requestedMethod) || requestedHeaders.some(v => !allowed.includes(v))) {
        return this.violation(route, 'invalid-preflight', 403);
      }
      return this.fulfill(route, { status: 204, headers: this.responseHeaders(request, {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Qin-App-Version, Idempotency-Key, X-Chunk-SHA256',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }) });
    }
    if (headers['x-qin-app-version'] !== LIMITS.minimumWriteVersion) return this.violation(route, 'invalid-app-version', 426);
    const jsonWrite = ['POST', 'PATCH', 'DELETE'].includes(method);
    const chunkWrite = method === 'PUT';
    if (jsonWrite && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers['content-type'] || '')) {
      return this.violation(route, 'invalid-json-content-type', 415);
    }
    if (chunkWrite && (headers['content-type'] || '').toLowerCase() !== 'application/octet-stream') {
      return this.violation(route, 'invalid-chunk-content-type', 415);
    }
    if (idempotent && !/^[A-Za-z0-9_-]{1,128}$/.test(headers['idempotency-key'] || '')) return this.violation(route, 'missing-idempotency-key');
    if (needsAuth && !device) return this.violation(route, 'invalid-device-auth', 401);
    if (device && this.revoked.has(device.deviceId)) {
      return this.json(route, 401, { error: { code: 'AUTH_FAILED' } });
    }
    if (method === 'GET' && pathname === '/v1/health') return this.json(route, 200, LIMITS);

    if (method === 'POST' && pathname === '/v1/spaces') {
      const body = this.body(request, ['syncCode', 'spaceId', 'kdf', 'authKey', 'passwordWrappedMaster',
        'recoveryAuthKey', 'recoveryWrappedMaster', 'device', 'appVersion']);
      if (!body || !this.validDevice(body.device) || body.appVersion !== LIMITS.minimumWriteVersion ||
        typeof body.syncCode !== 'string' || body.syncCode.trim().replace(/[ -]/g, '').length < 26 || !validId(body.spaceId) ||
        !validBase64url(body.authKey, 32) || !validBase64url(body.recoveryAuthKey, 32) || !this.validKdf(body.kdf) ||
        !this.validBlob(body.passwordWrappedMaster) || !this.validBlob(body.recoveryWrappedMaster)) {
        return this.violation(route, 'invalid-create-body');
      }
      this.space = { syncCode: body.syncCode, spaceId: body.spaceId, kdf: body.kdf,
        authKey: body.authKey, recoveryAuthKey: body.recoveryAuthKey,
        passwordWrappedMaster: body.passwordWrappedMaster, recoveryWrappedMaster: body.recoveryWrappedMaster };
      this.devices.set(body.device.deviceId, { deviceId: body.device.deviceId, deviceToken: body.device.deviceToken,
        spaceId: body.spaceId, encryptedName: body.device.encryptedName, revoked: false, revokedAt: null,
        createdAt: new Date(1700000000000).toISOString(), lastUsedAt: null, lastUploadedAt: null,
        latestSnapshot: null, historySnapshots: [] });
      return this.json(route, 201, { spaceId: body.spaceId, deviceId: body.device.deviceId, ...LIMITS });
    }

    const parameters = /^\/v1\/spaces\/([^/]+)\/parameters$/.exec(pathname);
    if (method === 'GET' && parameters && this.space && parameters[1] === this.space.syncCode) {
      return this.json(route, 200, { spaceId: this.space.spaceId, kdf: this.space.kdf,
        passwordWrappedMaster: this.space.passwordWrappedMaster,
        recoveryWrappedMaster: this.space.recoveryWrappedMaster, ...LIMITS });
    }
    const pair = /^\/v1\/spaces\/([^/]+)\/pair$/.exec(pathname);
    if (method === 'POST' && pair && this.space && pair[1] === this.space.syncCode) {
      const body = this.body(request, ['authKey', 'device', 'appVersion']);
      if (!body || body.appVersion !== LIMITS.minimumWriteVersion || !validBase64url(body.authKey, 32) ||
        !this.validDevice(body.device)) return this.violation(route, 'invalid-pair-body');
      if (body.authKey !== this.space.authKey) return this.violation(route, 'invalid-pair-auth', 401);
      this.devices.set(body.device.deviceId, { deviceId: body.device.deviceId, deviceToken: body.device.deviceToken,
        spaceId: this.space.spaceId, encryptedName: body.device.encryptedName, revoked: false, revokedAt: null,
        createdAt: new Date(1700000001000).toISOString(), lastUsedAt: null, lastUploadedAt: null,
        latestSnapshot: null, historySnapshots: [] });
      return this.json(route, 200, { spaceId: this.space.spaceId, deviceId: body.device.deviceId, ...LIMITS });
    }

    const recover = /^\/v1\/spaces\/([^/]+)\/recover$/.exec(pathname);
    if (method === 'POST' && recover && this.space && recover[1] === this.space.syncCode) {
      const body = this.body(request, ['recoveryAuthKey', 'newAuthKey', 'newPasswordWrappedMaster',
        'newRecoveryAuthKey', 'newRecoveryWrappedMaster', 'device', 'appVersion']);
      if (!body || body.appVersion !== LIMITS.minimumWriteVersion || !validBase64url(body.recoveryAuthKey, 32) ||
        !validBase64url(body.newAuthKey, 32) || !validBase64url(body.newRecoveryAuthKey, 32) ||
        !this.validBlob(body.newPasswordWrappedMaster) || !this.validBlob(body.newRecoveryWrappedMaster) ||
        !this.validDevice(body.device)) return this.violation(route, 'invalid-recover-body');
      if (body.recoveryAuthKey !== this.space.recoveryAuthKey) return this.violation(route, 'invalid-recover-auth', 401);
      const revokedAt = new Date(1700000000000 + (++this.sequence * 1000)).toISOString();
      this.devices.forEach(saved => { saved.revoked = true; saved.revokedAt = revokedAt; });
      this.space.authKey = body.newAuthKey;
      this.space.passwordWrappedMaster = body.newPasswordWrappedMaster;
      this.space.recoveryAuthKey = body.newRecoveryAuthKey;
      this.space.recoveryWrappedMaster = body.newRecoveryWrappedMaster;
      this.devices.set(body.device.deviceId, { deviceId: body.device.deviceId, deviceToken: body.device.deviceToken,
        spaceId: this.space.spaceId, encryptedName: body.device.encryptedName, revoked: false, revokedAt: null,
        createdAt: revokedAt, lastUsedAt: null, lastUploadedAt: null, latestSnapshot: null, historySnapshots: [] });
      return this.json(route, 200, { spaceId: this.space.spaceId, deviceId: body.device.deviceId, ...LIMITS });
    }

    if (method === 'GET' && pathname === '/v1/devices') {
      return this.json(route, 200, { devices: Array.from(this.devices.values()).map(device => ({
        deviceId: device.deviceId, encryptedName: device.encryptedName, current: device.deviceId === this.authenticate(request).deviceId,
        revoked: device.revoked,
        revokedAt: device.revokedAt, createdAt: device.createdAt, lastUsedAt: device.lastUsedAt,
        lastUploadedAt: device.lastUploadedAt, latestSnapshot: device.latestSnapshot,
        historySnapshots: device.historySnapshots
      })) });
    }

    const deviceMutation = /^\/v1\/devices\/([^/]+)$/.exec(pathname);
    if (deviceMutation && (method === 'PATCH' || method === 'DELETE')) {
      const target = this.devices.get(deviceMutation[1]);
      if (!target || target.spaceId !== device.spaceId) return this.json(route, 404, { error: { code: 'NOT_FOUND' } });
      if (method === 'PATCH') {
        const body = this.body(request, ['encryptedName']);
        if (!body || !this.validBlob(body.encryptedName, false)) return this.violation(route, 'invalid-device-patch-body');
        target.encryptedName = body.encryptedName;
        return this.json(route, 200, { deviceId: target.deviceId, encryptedName: target.encryptedName });
      }
      const body = this.body(request, ['deleteSnapshots']);
      if (!body || typeof body.deleteSnapshots !== 'boolean') return this.violation(route, 'invalid-device-delete-body');
      target.revoked = true;
      target.revokedAt = new Date(1700000000000 + (++this.sequence * 1000)).toISOString();
      if (body.deleteSnapshots) {
        for (const [id, saved] of this.snapshots) if (saved.metadata.deviceId === target.deviceId) this.snapshots.delete(id);
        target.latestSnapshot = null; target.historySnapshots = [];
      }
      return this.fulfill(route, { status: 204, headers: this.responseHeaders(request) });
    }

    if (method === 'POST' && (pathname === '/v1/security/password' || pathname === '/v1/security/recovery-key')) {
      const passwordChange = pathname.endsWith('/password');
      const fields = passwordChange ? ['authKey', 'newAuthKey', 'newPasswordWrappedMaster', 'appVersion'] :
        ['authKey', 'newRecoveryAuthKey', 'newRecoveryWrappedMaster', 'appVersion'];
      const body = this.body(request, fields);
      if (!body || body.appVersion !== LIMITS.minimumWriteVersion ||
        !validBase64url(body.authKey, 32) ||
        (passwordChange && (!validBase64url(body.newAuthKey, 32) || !this.validBlob(body.newPasswordWrappedMaster))) ||
        (!passwordChange && (!validBase64url(body.newRecoveryAuthKey, 32) || body.newRecoveryAuthKey === this.space.recoveryAuthKey ||
          !this.validBlob(body.newRecoveryWrappedMaster)))) return this.violation(route, 'invalid-security-body');
      if (body.authKey !== this.space.authKey) return this.violation(route, 'invalid-security-auth', 401);
      if (passwordChange) {
        this.space.authKey = body.newAuthKey;
        this.space.passwordWrappedMaster = body.newPasswordWrappedMaster;
      } else {
        this.space.recoveryAuthKey = body.newRecoveryAuthKey;
        this.space.recoveryWrappedMaster = body.newRecoveryWrappedMaster;
      }
      return this.json(route, 200, { spaceId: this.space.spaceId, deviceId: device.deviceId, ...LIMITS });
    }

    if (method === 'POST' && pathname === '/v1/uploads') {
      const body = request.postDataJSON();
      if (!this.validUpload(body)) return this.violation(route, 'invalid-upload-body');
      if (!this.validCommittedSource(body.sourceSnapshotId, device.spaceId)) {
        return this.violation(route, 'invalid-upload-source');
      }
      const uploadId = uuidFor(++this.sequence);
      this.uploads.set(uploadId, { uploadId, deviceId: device.deviceId, spaceId: device.spaceId, body, chunks: [], chunkDigests: [] });
      this.snapshots.set(body.snapshotId, { metadata: { ...body, deviceId: device.deviceId }, chunks: [],
        spaceId: device.spaceId, role: 'staged', uploadId });
      return this.json(route, 201, { uploadId, snapshotId: body.snapshotId, uploadedChunks: [],
        expiresAt: new Date(Date.now() + 60000).toISOString() });
    }
    const chunkUpload = /^\/v1\/uploads\/([^/]+)\/chunks\/(\d+)$/.exec(pathname);
    if (method === 'PUT' && chunkUpload) {
      const upload = this.uploads.get(chunkUpload[1]);
      const bytes = request.postDataBuffer();
      const index = Number(chunkUpload[2]);
      const expectedSize = index < upload?.body.chunkCount - 1 ? 512 * 1024 : upload?.body.ciphertextBytes - index * 512 * 1024;
      if (!upload || upload.deviceId !== device.deviceId || upload.spaceId !== device.spaceId ||
        index >= upload.body.chunkCount || bytes.length !== expectedSize || digest(bytes) !== headers['x-chunk-sha256']) {
        return this.violation(route, 'invalid-upload-chunk');
      }
      upload.chunks[index] = Buffer.from(bytes);
      upload.chunkDigests[index] = headers['x-chunk-sha256'];
      return this.json(route, 200, { chunkIndex: index });
    }
    const commit = /^\/v1\/uploads\/([^/]+)\/commit$/.exec(pathname);
    if (method === 'POST' && commit) {
      const key = request.headers()['idempotency-key'];
      if (this.receipts.has(key)) return this.json(route, 200, this.receipts.get(key));
      const upload = this.uploads.get(commit[1]);
      const body = this.body(request, ['beforeUploadId', 'sourceSnapshotId']);
      if (!body || !this.validateStoredUpload(upload, device) || body.sourceSnapshotId !== upload.body.sourceSnapshotId) {
        return this.violation(route, 'invalid-upload-commit');
      }
      if (!this.validCommittedSource(upload.body.sourceSnapshotId, upload.spaceId)) {
        return this.violation(route, 'invalid-commit-source');
      }
      const beforeUpload = body.beforeUploadId ? this.uploads.get(body.beforeUploadId) : null;
      if ((upload.body.operation.endsWith('-after') && (!this.validateStoredUpload(beforeUpload, device) ||
        beforeUpload.body.operation !== upload.body.operation.replace('-after', '-before') ||
        beforeUpload.body.sourceSnapshotId !== null || beforeUpload.body.snapshotId === upload.body.snapshotId)) ||
        (!upload.body.operation.endsWith('-after') && body.beforeUploadId !== null)) {
        return this.violation(route, 'invalid-commit-reference');
      }
      if (this.failReplacementCommit && body.beforeUploadId) {
        return this.json(route, 500, { error: { code: 'INTERNAL_ERROR' } });
      }
      const latest = this.saveLatest(device, upload, beforeUpload);
      const receipt = { operationId: upload.uploadId, latestSnapshotId: latest.snapshotId,
        historySnapshotIds: beforeUpload ? [beforeUpload.body.snapshotId] : [],
        serverCommittedAt: latest.serverCreatedAt };
      this.receipts.set(key, receipt);
      return this.json(route, 200, receipt);
    }

    const snapshot = /^\/v1\/snapshots\/([^/]+)$/.exec(pathname);
    if (method === 'GET' && snapshot) {
      const saved = this.snapshots.get(snapshot[1]);
      return saved && saved.spaceId === device.spaceId && saved.role !== 'staged' ? this.json(route, 200, saved.metadata) :
        this.json(route, 404, { error: { code: 'NOT_FOUND' } });
    }
    const snapshotChunk = /^\/v1\/snapshots\/([^/]+)\/chunks\/(\d+)$/.exec(pathname);
    if (method === 'GET' && snapshotChunk) {
      const saved = this.snapshots.get(snapshotChunk[1]);
      const index = Number(snapshotChunk[2]);
      if (!saved || saved.spaceId !== device.spaceId || saved.role === 'staged' || !saved.chunks[index]) {
        return this.json(route, 404, { error: { code: 'NOT_FOUND' } });
      }
      const original = saved.chunks[index];
      const bytes = this.tamperSnapshotId === snapshotChunk[1]
        ? Buffer.from(original.map((value, offset) => offset === 0 ? value ^ 1 : value)) : original;
      return this.fulfill(route, { status: 200, contentType: 'application/octet-stream',
        headers: this.responseHeaders(request, { 'X-Chunk-SHA256': digest(original) }), body: bytes });
    }
    if (method === 'DELETE' && pathname === '/v1/spaces/current') {
      const raw = request.postDataJSON();
      const authField = raw && Object.hasOwn(raw, 'authKey') ? 'authKey' : 'recoveryAuthKey';
      const body = this.body(request, [authField, 'confirmation', 'appVersion']);
      if (!body || body.confirmation !== '永久删除同步空间' || body.appVersion !== LIMITS.minimumWriteVersion) {
        return this.violation(route, 'invalid-delete-body');
      }
      if (!this.space || body[authField] !== this.space[authField]) return this.violation(route, 'invalid-delete-auth', 401);
      this.requests[this.requests.length - 1].confirmation = body.confirmation;
      this.requests[this.requests.length - 1].authField = authField;
      this.space = null; this.devices.clear(); this.uploads.clear(); this.snapshots.clear(); this.receipts.clear();
      return this.fulfill(route, { status: 204, headers: this.responseHeaders(request) });
    }
    return this.json(route, 404, { error: { code: 'NOT_FOUND' } });
  }
}

before(async () => {
  for (let port = 8000; port <= 8010; port += 1) {
    const candidate = createServer();
    try {
      await new Promise((resolve, reject) => {
        candidate.once('error', reject);
        candidate.listen(port, () => { candidate.removeListener('error', reject); resolve(); });
      });
      server = candidate; appPort = port; break;
    } catch (error) {
      if (!error || error.code !== 'EADDRINUSE') throw error;
    }
  }
  if (!server) throw new Error('No permitted localhost port is available in the deterministic 8000-8010 range.');
  appUrl = 'http://localhost:' + appPort;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

after(async () => {
  try {
    assert.deepEqual(Array.from(INTENDED_ROUTES).filter(route => !coveredRoutes.has(route)), [],
      'every strict Worker route family must be covered');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
});

afterEach(() => {
  const stubs = scenarioStubs;
  scenarioStubs = [];
  stubs.forEach(stub => stub.assertClean());
});

async function browserPage(stub, options = {}) {
  stub.allowedOrigin = appUrl;
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true,
    viewport: options.viewport || { width: 1280, height: 900 } });
  const page = await context.newPage();
  let remoteVersion = '1.0.40';
  await page.route('**/js/cloud-sync-config.js*', route => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: 'window.QinshiCloudSyncConfig=Object.freeze({enabled:true,apiBaseUrl:"https://sync.test"});'
  }));
  await page.route('**/version.json*', route => route.fulfill({ status: 200,
    contentType: 'application/json; charset=utf-8', body: JSON.stringify({ version: remoteVersion }) }));
  await page.route('https://sync.test/**', route => stub.handle(route));
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('.tab[data-partition="settings"]').click());
  await page.locator('#cloud-sync-panel').waitFor({ state: 'visible' });
  return { context, page, stub, setRemoteVersion(value) { remoteVersion = value; } };
}

async function dispatchStub(stub, options) {
  const method = options.method || 'GET';
  const headers = Object.fromEntries(Object.entries({
    origin: stub.allowedOrigin,
    ...(method === 'OPTIONS' ? {} : { 'x-qin-app-version': LIMITS.minimumWriteVersion }),
    ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(options.headers || {})
  }).map(([key, value]) => [key.toLowerCase(), value]));
  const request = {
    url: () => 'https://sync.test' + options.path,
    method: () => method,
    headers: () => headers,
    postDataJSON: () => {
      if (options.body === undefined) throw new Error('missing JSON body');
      return structuredClone(options.body);
    },
    postDataBuffer: () => Buffer.from(options.bytes || [])
  };
  let result;
  const route = {
    request: () => request,
    fulfill: async details => { result = details; return details; },
    abort: async code => { result = { aborted: code }; return result; }
  };
  await stub.handle(route);
  return result;
}

function authHeader(device) {
  return { authorization: `Device ${device.deviceId}.${device.deviceToken}` };
}

function consumeExpectedViolation(stub, reason, status, expected) {
  const violation = stub.violations.pop();
  const request = stub.requests.pop();
  const response = stub.responses.pop();
  assert.deepEqual(violation && violation.reason, reason);
  assert.equal(response && response.status, status);
  if (expected) {
    const pathname = normalizedPath(expected.path);
    assert.deepEqual({ method: request && request.method, pathname: request && request.pathname },
      { method: expected.method, pathname });
    assert.deepEqual({ method: response && response.method, pathname: response && response.pathname },
      { method: expected.method, pathname });
  }
  assert.deepEqual(violation && { method: violation.method, pathname: violation.pathname },
    request && { method: request.method, pathname: request.pathname });
  assert.deepEqual(Object.keys(request || {}).filter(key => !SAFE_REQUEST_FIELDS.has(key)), [],
    'failed request observations must contain safe flags only');
  assert.ok(request && !JSON.stringify(request).includes('authorization'));
  return response;
}

async function exerciseStrictContractRoutes(stub) {
  const original = Array.from(stub.devices.values())[0];
  const originalAuth = authHeader(original);
  const syncCodePath = encodeURIComponent(stub.space.syncCode);

  const createValidationStub = new CloudStub();
  createValidationStub.allowedOrigin = stub.allowedOrigin;
  await dispatchStub(createValidationStub, { method: 'POST', path: '/v1/spaces', headers: {
    'idempotency-key': 'strict-invalid-kdf'
  }, body: {
    syncCode: 'A'.repeat(26), spaceId: uuidFor(970), kdf: {}, authKey: stub.space.authKey,
    passwordWrappedMaster: stub.space.passwordWrappedMaster, recoveryAuthKey: stub.space.recoveryAuthKey,
    recoveryWrappedMaster: stub.space.recoveryWrappedMaster,
    device: { deviceId: original.deviceId, deviceToken: original.deviceToken, encryptedName: original.encryptedName },
    appVersion: LIMITS.minimumWriteVersion
  } });
  consumeExpectedViolation(createValidationStub, 'invalid-create-body', 400, { method: 'POST', path: '/v1/spaces' });

  const forbidden = await dispatchStub(stub, { path: '/v1/health', headers: { origin: `http://127.0.0.1:${appPort}` } });
  const forbiddenObservation = consumeExpectedViolation(stub, 'origin-not-allowed', 403, { method: 'GET', path: '/v1/health' });
  assert.equal(forbiddenObservation.allowOrigin, '');
  assert.equal(forbiddenObservation.expose, '');
  assert.equal(forbiddenObservation.vary, 'Origin');

  const preflight = await dispatchStub(stub, { method: 'OPTIONS', path: '/v1/uploads', headers: {
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'authorization,content-type,x-qin-app-version,idempotency-key'
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], stub.allowedOrigin);
  assert.equal(preflight.headers.Vary, 'Origin');
  assert.equal(preflight.headers['Access-Control-Expose-Headers'], 'X-Chunk-SHA256');

  const missingKeyRoutes = [
    ['POST', '/v1/spaces', {}, {}],
    ['POST', `/v1/spaces/${syncCodePath}/pair`, {}, {}],
    ['POST', `/v1/spaces/${syncCodePath}/recover`, {}, {}],
    ['POST', '/v1/uploads', {}, originalAuth],
    ['POST', `/v1/uploads/${uuidFor(900)}/commit`, {}, originalAuth],
    ['POST', '/v1/security/password', {}, originalAuth],
    ['POST', '/v1/security/recovery-key', {}, originalAuth],
    ['DELETE', '/v1/spaces/current', {}, originalAuth]
  ];
  for (const [method, path, body, headers] of missingKeyRoutes) {
    await dispatchStub(stub, { method, path, body, headers });
    consumeExpectedViolation(stub, 'missing-idempotency-key', 400, { method, path: new URL('https://sync.test' + path).pathname });
  }

  const unknownFieldRoutes = [
    ['POST', '/v1/spaces', 'invalid-create-body', { 'idempotency-key': 'unknown-create' }],
    ['POST', `/v1/spaces/${syncCodePath}/pair`, 'invalid-pair-body', { 'idempotency-key': 'unknown-pair' }],
    ['POST', `/v1/spaces/${syncCodePath}/recover`, 'invalid-recover-body', { 'idempotency-key': 'unknown-recover' }],
    ['PATCH', `/v1/devices/${original.deviceId}`, 'invalid-device-patch-body', originalAuth],
    ['DELETE', `/v1/devices/${original.deviceId}`, 'invalid-device-delete-body', originalAuth],
    ['POST', '/v1/uploads', 'invalid-upload-body', { ...originalAuth, 'idempotency-key': 'unknown-upload' }],
    ['POST', `/v1/uploads/${uuidFor(901)}/commit`, 'invalid-upload-commit', { ...originalAuth, 'idempotency-key': 'unknown-commit' }],
    ['POST', '/v1/security/password', 'invalid-security-body', { ...originalAuth, 'idempotency-key': 'unknown-password' }],
    ['POST', '/v1/security/recovery-key', 'invalid-security-body', { ...originalAuth, 'idempotency-key': 'unknown-recovery-key' }],
    ['DELETE', '/v1/spaces/current', 'invalid-delete-body', { ...originalAuth, 'idempotency-key': 'unknown-delete' }]
  ];
  for (const [method, path, reason, headers] of unknownFieldRoutes) {
    await dispatchStub(stub, { method, path, body: { unexpected: true }, headers });
    consumeExpectedViolation(stub, reason, 400, { method, path: new URL('https://sync.test' + path).pathname });
  }

  await dispatchStub(stub, { method: 'PATCH', path: `/v1/devices/${original.deviceId}`,
    body: { encryptedName: original.encryptedName }, headers: { authorization: `Device ${original.deviceId}.wrong-token` } });
  consumeExpectedViolation(stub, 'invalid-device-auth', 401, { method: 'PATCH', path: `/v1/devices/${original.deviceId}` });

  assert.equal(stub.validBlob(original.encryptedName, false), true, JSON.stringify({
    fields: Object.keys(original.encryptedName).sort(), ivBytes: Buffer.from(original.encryptedName.iv, 'base64url').length,
    ciphertextBytes: Buffer.from(original.encryptedName.ciphertext, 'base64url').length
  }));
  let response = await dispatchStub(stub, { method: 'PATCH', path: `/v1/devices/${original.deviceId}`,
    body: { encryptedName: original.encryptedName }, headers: originalAuth });
  assert.equal(response.status, 200, JSON.stringify(stub.violations.at(-1)));

  await dispatchStub(stub, { method: 'PATCH', path: `/v1/devices/${original.deviceId}`,
    body: { encryptedName: { ...original.encryptedName, iv: 'not-base64url' } }, headers: originalAuth });
  consumeExpectedViolation(stub, 'invalid-device-patch-body', 400, { method: 'PATCH', path: `/v1/devices/${original.deviceId}` });

  const nextAuth = digest(Buffer.from('strict-password-auth'));
  response = await dispatchStub(stub, { method: 'POST', path: '/v1/security/password', headers: {
    ...originalAuth, 'idempotency-key': 'strict-password-operation'
  }, body: { authKey: stub.space.authKey, newAuthKey: nextAuth,
    newPasswordWrappedMaster: stub.space.passwordWrappedMaster, appVersion: LIMITS.minimumWriteVersion } });
  assert.equal(response.status, 200);

  const nextRecovery = digest(Buffer.from('strict-recovery-auth'));
  response = await dispatchStub(stub, { method: 'POST', path: '/v1/security/recovery-key', headers: {
    ...originalAuth, 'idempotency-key': 'strict-recovery-operation'
  }, body: { authKey: nextAuth, newRecoveryAuthKey: nextRecovery,
    newRecoveryWrappedMaster: stub.space.recoveryWrappedMaster, appVersion: LIMITS.minimumWriteVersion } });
  assert.equal(response.status, 200);

  response = await dispatchStub(stub, { method: 'DELETE', path: `/v1/devices/${original.deviceId}`,
    headers: originalAuth, body: { deleteSnapshots: false } });
  assert.equal(response.status, 204);

  const replacement = {
    deviceId: uuidFor(950), deviceToken: digest(Buffer.from('strict-new-device-token')),
    encryptedName: original.encryptedName
  };
  const recoveredAuth = digest(Buffer.from('strict-recovered-auth'));
  const recoveredRecovery = digest(Buffer.from('strict-recovered-recovery'));
  response = await dispatchStub(stub, { method: 'POST', path: `/v1/spaces/${syncCodePath}/recover`, headers: {
    'idempotency-key': 'strict-recover-operation'
  }, body: { recoveryAuthKey: nextRecovery, newAuthKey: recoveredAuth,
    newPasswordWrappedMaster: stub.space.passwordWrappedMaster, newRecoveryAuthKey: recoveredRecovery,
    newRecoveryWrappedMaster: stub.space.recoveryWrappedMaster, device: replacement, appVersion: LIMITS.minimumWriteVersion } });
  assert.equal(response.status, 200);

  await dispatchStub(stub, { method: 'POST', path: `/v1/spaces/${syncCodePath}/recover`, headers: {
    'idempotency-key': 'strict-recover-unknown-field'
  }, body: { recoveryAuthKey: recoveredRecovery, newAuthKey: recoveredAuth,
    newPasswordWrappedMaster: stub.space.passwordWrappedMaster, newRecoveryAuthKey: nextRecovery,
    newRecoveryWrappedMaster: stub.space.recoveryWrappedMaster, device: replacement,
    appVersion: LIMITS.minimumWriteVersion, unexpected: true } });
  consumeExpectedViolation(stub, 'invalid-recover-body', 400, { method: 'POST', path: `/v1/spaces/${stub.space.syncCode}/recover` });

  const replacementDevice = stub.devices.get(replacement.deviceId);
  const sourceSnapshotId = original.latestSnapshot.snapshotId;
  const bytes = Buffer.from('0123456789abcdef');
  const baseUpload = { appVersion: LIMITS.minimumWriteVersion, formatVersion: 1, schemaVersion: 1,
    encoding: 'identity', clientCreatedAt: '2026-09-11T08:00:00.000Z', dataHash: digest(Buffer.from('strict-data')),
    iv: 'A'.repeat(16), ciphertextBytes: bytes.length, chunkCount: 1, ciphertextDigest: digest(bytes),
    encryptedSummary: original.encryptedName };
  const beforeId = uuidFor(961), afterId = uuidFor(962);

  const missingSourceId = uuidFor(966);
  const crossSpaceSourceId = uuidFor(967);
  const stagedSourceId = uuidFor(968);
  stub.snapshots.set(crossSpaceSourceId, { metadata: { snapshotId: crossSpaceSourceId }, chunks: [bytes],
    spaceId: uuidFor(980), role: 'latest' });
  stub.snapshots.set(stagedSourceId, { metadata: { snapshotId: stagedSourceId }, chunks: [bytes],
    spaceId: stub.space.spaceId, role: 'staged' });
  for (const [label, invalidSourceId] of [['missing', missingSourceId], ['cross-space', crossSpaceSourceId], ['staged', stagedSourceId]]) {
    await dispatchStub(stub, { method: 'POST', path: '/v1/uploads', headers: {
      ...authHeader(replacementDevice), 'idempotency-key': `strict-${label}-source-create`
    }, body: { ...baseUpload, operation: 'replace-after', snapshotId: uuidFor(981 + label.length),
      sourceSnapshotId: invalidSourceId } });
    consumeExpectedViolation(stub, 'invalid-upload-source', 400, { method: 'POST', path: '/v1/uploads' });
  }

  await dispatchStub(stub, { method: 'POST', path: '/v1/uploads', headers: {
    ...authHeader(replacementDevice), 'idempotency-key': 'strict-invalid-source-relation'
  }, body: { ...baseUpload, operation: 'replace-after', snapshotId: uuidFor(965), sourceSnapshotId: null } });
  consumeExpectedViolation(stub, 'invalid-upload-body', 400, { method: 'POST', path: '/v1/uploads' });

  const beforeUpload = { uploadId: beforeId, deviceId: replacement.deviceId, spaceId: stub.space.spaceId,
    body: { ...baseUpload, operation: 'replace-before', snapshotId: uuidFor(963), sourceSnapshotId: null },
    chunks: [bytes], chunkDigests: [digest(bytes)] };
  const afterUpload = { uploadId: afterId, deviceId: replacement.deviceId, spaceId: stub.space.spaceId,
    body: { ...baseUpload, operation: 'replace-after', snapshotId: uuidFor(964), sourceSnapshotId },
    chunks: [bytes], chunkDigests: [digest(bytes)] };
  stub.uploads.set(beforeId, beforeUpload); stub.uploads.set(afterId, afterUpload);
  const commitRequest = { method: 'POST', path: `/v1/uploads/${afterId}/commit`, headers: {
    ...authHeader(replacementDevice), 'idempotency-key': 'strict-incomplete-before'
  }, body: { beforeUploadId: beforeId, sourceSnapshotId } };

  commitRequest.headers['idempotency-key'] = 'strict-mismatched-source';
  commitRequest.body.sourceSnapshotId = uuidFor(969);
  await dispatchStub(stub, commitRequest);
  consumeExpectedViolation(stub, 'invalid-upload-commit', 400, { method: 'POST', path: `/v1/uploads/${afterId}/commit` });
  assert.equal(stub.receipts.has('strict-mismatched-source'), false);

  beforeUpload.chunks = []; beforeUpload.chunkDigests = [];
  commitRequest.headers['idempotency-key'] = 'strict-incomplete-before';
  commitRequest.body.sourceSnapshotId = sourceSnapshotId;
  await dispatchStub(stub, commitRequest);
  consumeExpectedViolation(stub, 'invalid-commit-reference', 400, { method: 'POST', path: `/v1/uploads/${afterId}/commit` });
  assert.equal(stub.receipts.has('strict-incomplete-before'), false);

  beforeUpload.chunks = [bytes]; beforeUpload.chunkDigests = [digest(Buffer.from('tampered-before'))];
  commitRequest.headers['idempotency-key'] = 'strict-tampered-before';
  await dispatchStub(stub, commitRequest);
  consumeExpectedViolation(stub, 'invalid-commit-reference', 400, { method: 'POST', path: `/v1/uploads/${afterId}/commit` });
  assert.equal(stub.receipts.has('strict-tampered-before'), false);

  const deletingBeforeSnapshotId = uuidFor(971);
  const deletingAfterSnapshotId = uuidFor(972);
  const createStaged = async (body, operationKey) => {
    const created = await dispatchStub(stub, { method: 'POST', path: '/v1/uploads', headers: {
      ...authHeader(replacementDevice), 'idempotency-key': operationKey
    }, body });
    assert.equal(created.status, 201);
    return JSON.parse(created.body).uploadId;
  };
  const putStagedChunk = async (uploadId) => {
    const uploaded = await dispatchStub(stub, { method: 'PUT', path: `/v1/uploads/${uploadId}/chunks/0`, headers: {
      ...authHeader(replacementDevice), 'content-type': 'application/octet-stream', 'x-chunk-sha256': digest(bytes)
    }, bytes });
    assert.equal(uploaded.status, 200);
  };
  const deletingBeforeId = await createStaged({ ...baseUpload, operation: 'replace-before',
    snapshotId: deletingBeforeSnapshotId, sourceSnapshotId: null }, 'strict-delete-source-before-create');
  const deletingAfterId = await createStaged({ ...baseUpload, operation: 'replace-after',
    snapshotId: deletingAfterSnapshotId, sourceSnapshotId }, 'strict-delete-source-after-create');
  await putStagedChunk(deletingBeforeId);
  await putStagedChunk(deletingAfterId);
  stub.snapshots.delete(sourceSnapshotId);
  await dispatchStub(stub, { method: 'POST', path: `/v1/uploads/${deletingAfterId}/commit`, headers: {
    ...authHeader(replacementDevice), 'idempotency-key': 'strict-deleted-source-commit'
  }, body: { beforeUploadId: deletingBeforeId, sourceSnapshotId } });
  consumeExpectedViolation(stub, 'invalid-commit-source', 400,
    { method: 'POST', path: `/v1/uploads/${deletingAfterId}/commit` });
  assert.equal(stub.receipts.has('strict-deleted-source-commit'), false);
}

async function createSpace(session, deviceName = 'Windows 设备 1', localValue = 'source-progress', inspectRecovery) {
  const { page, stub } = session;
  const requestStart = stub.requests.length;
  await page.evaluate(value => localStorage.setItem('qinshi_browser_progress', value), localValue);
  await page.locator('#cloud-sync-create-device').fill(deviceName);
  await page.locator('#cloud-sync-create-password').fill(PASSWORD);
  await page.locator('#cloud-sync-create-confirm').fill(PASSWORD);
  await page.locator('#cloud-sync-create-form button[type="submit"]').click();
  await page.locator('#cloud-sync-recovery-layer').waitFor({ state: 'visible' });
  if (inspectRecovery) await inspectRecovery(page);
  const syncCode = await page.locator('#cloud-sync-recovery-code').innerText();
  assert.match(syncCode, /^[A-Z2-7]{26,}$/);
  assert.ok((await page.locator('#cloud-sync-recovery-key').innerText()).length > 30);
  await page.locator('#cloud-sync-recovery-ack').check();
  await page.locator('#cloud-sync-recovery-confirm').click();
  await page.locator('#cloud-sync-status').filter({ hasText: '同步空间已创建' }).waitFor();
  await page.locator('#cloud-sync-paired').waitFor({ state: 'visible' });
  const flow = stub.requests.slice(requestStart).filter(entry => entry.method !== 'OPTIONS');
  const createIndex = flow.findIndex(entry => entry.method === 'POST' && entry.pathname === '/v1/spaces');
  const uploadIndex = flow.findIndex(entry => entry.method === 'POST' && entry.pathname === '/v1/uploads');
  const chunkIndex = flow.findIndex(entry => entry.method === 'PUT' && entry.pathname === '/v1/uploads/:uploadId/chunks/:index');
  const commitIndex = flow.findIndex(entry => entry.method === 'POST' && entry.pathname === '/v1/uploads/:uploadId/commit');
  assert.ok(createIndex >= 0 && createIndex < uploadIndex && uploadIndex < chunkIndex && chunkIndex < commitIndex,
    'create must precede upload-create, chunk PUT and commit');
  assert.equal(flow.filter(entry => entry.method === 'POST' && entry.pathname === '/v1/spaces').length, 1);
  return syncCode;
}

async function assertModalIsolation(page, layerSelector, options = {}) {
  const state = await page.evaluate(selector => {
    const layer = document.querySelector(selector);
    const dialog = layer.querySelector('[role="dialog"]');
    const active = document.activeElement;
    const rect = dialog.getBoundingClientRect();
    const sibling = Array.from(layer.parentElement.children).find(node => node !== layer && !node.classList.contains('cloud-sync-modal'));
    return {
      focusInside: dialog.contains(active),
      htmlLocked: document.documentElement.classList.contains('cloud-sync-modal-open'),
      bodyLocked: document.body.classList.contains('cloud-sync-modal-open'),
      siblingUnavailable: Boolean(sibling && (sibling.inert || sibling.getAttribute('aria-hidden') === 'true')),
      top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight,
      overflowY: getComputedStyle(dialog).overflowY
    };
  }, layerSelector);
  assert.equal(state.focusInside, true);
  assert.equal(state.htmlLocked, true);
  assert.equal(state.bodyLocked, true);
  assert.equal(state.siblingUnavailable, true);
  if (options.mobile) {
    assert.ok(state.top >= 0 && state.bottom <= state.viewport + 1);
    assert.ok(['auto', 'scroll'].includes(state.overflowY));
  }
  const focusables = page.locator(`${layerSelector} button:not([disabled]), ${layerSelector} input:not([disabled])`);
  const count = await focusables.count();
  assert.ok(count > 1);
  await focusables.nth(count - 1).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(selector => document.querySelector(selector).contains(document.activeElement), layerSelector), true);
  await focusables.first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(selector => document.querySelector(selector).contains(document.activeElement), layerSelector), true);
}

async function assertModalClosed(page, layerSelector, restoredFocusId) {
  await page.locator(layerSelector).waitFor({ state: 'hidden' });
  if (restoredFocusId) {
    await page.waitForFunction(id => document.activeElement && document.activeElement.id === id, restoredFocusId);
  }
  const state = await page.evaluate(() => ({
    htmlLocked: document.documentElement.classList.contains('cloud-sync-modal-open'),
    bodyLocked: document.body.classList.contains('cloud-sync-modal-open'),
    activeId: document.activeElement && document.activeElement.id,
    leakedInert: Array.from(document.querySelectorAll('[inert]')).some(node => !node.closest('[hidden]'))
  }));
  assert.equal(state.htmlLocked, false);
  assert.equal(state.bodyLocked, false);
  assert.equal(state.leakedInert, false);
  if (restoredFocusId) assert.equal(state.activeId, restoredFocusId);
}

async function joinSpace(session, syncCode, deviceName = '当前设备', localValue = 'target-progress') {
  const { page, stub } = session;
  const requestStart = stub.requests.length;
  await page.evaluate(value => localStorage.setItem('qinshi_browser_progress', value), localValue);
  await page.locator('#cloud-sync-join-code').fill(syncCode);
  await page.locator('#cloud-sync-join-device').fill(deviceName);
  await page.locator('#cloud-sync-join-password').fill(PASSWORD);
  await page.locator('#cloud-sync-join-form button[type="submit"]').click();
  await page.locator('#cloud-sync-status').filter({ hasText: '尚未上传或覆盖' }).waitFor();
  const flow = stub.requests.slice(requestStart).filter(entry => entry.method !== 'OPTIONS');
  const parametersIndex = flow.findIndex(entry => entry.method === 'GET' && entry.pathname === '/v1/spaces/:code/parameters');
  const pairIndex = flow.findIndex(entry => entry.method === 'POST' && entry.pathname === '/v1/spaces/:code/pair');
  assert.ok(parametersIndex >= 0 && parametersIndex < pairIndex, 'join must read parameters before pair');
  assert.equal(flow.some(entry => entry.pathname === '/v1/uploads'), false, 'join must not upload');
}

async function pairedDevices(stub) {
  const source = await browserPage(stub);
  const syncCode = await createSpace(source);
  const target = await browserPage(stub);
  await joinSpace(target, syncCode);
  return { source, target, syncCode };
}

async function selectSourceAndOpenConfirmation(page) {
  const card = page.locator('#cloud-sync-source-list .cloud-sync-source-card', { hasText: 'Windows 设备 1' }).first();
  await card.locator('input[type="radio"]').check();
  await page.locator('#cloud-sync-prepare').click();
  await page.locator('#cloud-sync-confirm-layer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#cloud-sync-direction').innerText(), 'Windows 设备 1 → 当前设备');
}

async function readRollback(page) {
  return page.evaluate(() => window.QinshiCloudSyncStorage.loadRollbackCopy());
}

test('1 创建空间展示一次性恢复凭据并在确认后上传首份快照', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub, { viewport: { width: 390, height: 844 } });
  try {
    await createSpace(session, 'Windows 设备 1', 'source-progress', async page => {
      await assertModalIsolation(page, '#cloud-sync-recovery-layer', { mobile: true });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#cloud-sync-recovery-layer').isVisible(), true);
    });
    assert.equal(stub.devices.size, 1);
    assert.ok(Array.from(stub.devices.values())[0].latestSnapshot);
    assert.equal(await session.page.locator('#cloud-sync-recovery-code').innerText(), '');
    assert.equal(await session.page.locator('#cloud-sync-recovery-key').innerText(), '');
    const creates = stub.requests.filter(entry => entry.method === 'POST' && entry.pathname === '/v1/spaces');
    assert.equal(creates.length, 1);
    assert.equal(creates[0].hasVersion, true);
    assert.equal(creates[0].hasIdempotency, true);
    await exerciseStrictContractRoutes(stub);
  } finally { await session.context.close(); }
});

test('2 加入空间只绑定设备，不上传也不覆盖本机数据', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const source = await browserPage(stub);
  const code = await createSpace(source);
  const target = await browserPage(stub);
  try {
    await joinSpace(target, code);
    assert.equal(await target.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'target-progress');
    assert.equal(Array.from(stub.devices.values()).filter(device => device.latestSnapshot).length, 1);
  } finally { await target.context.close(); await source.context.close(); }
});

test('3 本机数据未变化时手动上传不新增快照', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    await createSpace(session);
    const before = stub.snapshots.size;
    await session.page.locator('#cloud-sync-upload').click();
    await session.page.locator('#cloud-sync-status').filter({ hasText: '本机数据无变化' }).waitFor();
    assert.equal(stub.snapshots.size, before);
  } finally { await session.context.close(); }
});

test('4 明确选择来源后显示完整方向并用来源覆盖当前设备', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const { source, target } = await pairedDevices(stub);
  try {
    await selectSourceAndOpenConfirmation(target.page);
    await assertModalIsolation(target.page, '#cloud-sync-confirm-layer');
    await target.page.keyboard.press('Escape');
    await assertModalClosed(target.page, '#cloud-sync-confirm-layer', 'cloud-sync-prepare');
    await selectSourceAndOpenConfirmation(target.page);
    assert.match(await target.page.locator('#cloud-sync-confirm-summary').innerText(), /来源时间/);
    assert.match(await target.page.locator('#cloud-sync-confirm-summary').innerText(), /快照工具版本/);
    assert.match(await target.page.locator('#cloud-sync-confirm-summary').innerText(), /数据摘要/);
    await target.page.locator('#cloud-sync-confirm-check').check();
    const downloadPromise = target.page.waitForEvent('download');
    const navigationPromise = target.page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await target.page.locator('#cloud-sync-confirm-overwrite').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^Qin-backup-before-cloud-sync-/);
    await navigationPromise;
    assert.equal(await target.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'source-progress');
  } finally { await target.context.close(); await source.context.close(); }
});

test('5 更新后按不可变快照继续并重新要求确认', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const { source, target } = await pairedDevices(stub);
  try {
    const sourceId = Array.from(stub.devices.values()).find(device => device.latestSnapshot).latestSnapshot.snapshotId;
    const card = target.page.locator('#cloud-sync-source-list .cloud-sync-source-card', { hasText: 'Windows 设备 1' }).first();
    await card.locator('input[type="radio"]').check();
    target.setRemoteVersion('9.9.9');
    await target.page.locator('#cloud-sync-prepare').click();
    await target.page.locator('#cloud-sync-status').filter({ hasText: '先完成版本检查或更新' }).waitFor();
    assert.deepEqual(await target.page.evaluate(() => JSON.parse(sessionStorage.getItem('qin-cloud-sync-pending'))),
      { type: 'pull', snapshotId: sourceId });
    target.setRemoteVersion('1.0.40');
    await target.page.reload({ waitUntil: 'networkidle' });
    await target.page.evaluate(() => document.querySelector('.tab[data-partition="settings"]').click());
    await target.page.locator('#cloud-sync-confirm-layer').waitFor({ state: 'visible' });
    assert.equal(await target.page.locator('#cloud-sync-direction').innerText(), 'Windows 设备 1 → 当前设备');
    assert.equal(await target.page.locator('#cloud-sync-confirm-check').isChecked(), false);
    assert.equal(await target.page.locator('#cloud-sync-confirm-overwrite').isDisabled(), true);
  } finally { await target.context.close(); await source.context.close(); }
});

test('6 离线失败保留配对和本机数据并显示可操作提示', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    await createSpace(session);
    stub.offline = true;
    await session.page.evaluate(() => localStorage.setItem('qinshi_browser_progress', 'offline-local'));
    await session.page.locator('#cloud-sync-upload').click();
    await session.page.locator('#cloud-sync-status').filter({ hasText: '网络不可用' }).waitFor({ timeout: 10000 });
    assert.equal(await session.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'offline-local');
    assert.ok(await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()));
  } finally { stub.offline = false; await session.context.close(); }
});

test('7 令牌撤销只条件清理旧配对，保留进度、待办和回滚证据', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    await createSpace(session);
    const pairing = await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing());
    await session.page.evaluate(async () => {
      sessionStorage.setItem('qin-cloud-sync-pending', JSON.stringify({ type: 'upload', snapshotId: 'pending-browser' }));
      await window.QinshiCloudSyncStorage.claimRollbackCopy({ ownerId: crypto.randomUUID(),
        createdAt: new Date().toISOString(), data: { qinshi_browser_progress: 'source-progress' } });
    });
    stub.revoked.add(pairing.deviceId);
    await session.page.locator('#cloud-sync-refresh').click();
    await session.page.locator('#cloud-sync-status').filter({ hasText: '配对已失效或被撤销' }).waitFor();
    assert.equal(await session.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'source-progress');
    assert.deepEqual(await session.page.evaluate(() => JSON.parse(sessionStorage.getItem('qin-cloud-sync-pending'))),
      { type: 'upload', snapshotId: 'pending-browser' });
    assert.ok(await readRollback(session.page));
    assert.deepEqual(await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()), pairing);
  } finally { await session.context.close(); }

  const noRollbackStub = new CloudStub();
  const noRollback = await browserPage(noRollbackStub);
  try {
    await createSpace(noRollback, '无回滚设备', 'no-rollback-local');
    const pairing = await noRollback.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing());
    await noRollback.page.evaluate(() => {
      sessionStorage.setItem('qin-cloud-sync-pending', JSON.stringify({ type: 'upload', snapshotId: 'pending-no-rollback' }));
    });
    noRollbackStub.revoked.add(pairing.deviceId);
    await noRollback.page.locator('#cloud-sync-refresh').click();
    await noRollback.page.locator('#cloud-sync-status').filter({ hasText: '配对已失效或被撤销' }).waitFor();
    assert.equal(await noRollback.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'no-rollback-local');
    assert.deepEqual(await noRollback.page.evaluate(() => JSON.parse(sessionStorage.getItem('qin-cloud-sync-pending'))),
      { type: 'upload', snapshotId: 'pending-no-rollback' });
    assert.equal(await noRollback.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()), null);
  } finally { await noRollback.context.close(); }
});

test('8 缺失或篡改的分块在替换前被拒绝', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const { source, target } = await pairedDevices(stub);
  try {
    const snapshotId = Array.from(stub.devices.values()).find(device => device.latestSnapshot).latestSnapshot.snapshotId;
    await selectSourceAndOpenConfirmation(target.page);
    await target.page.evaluate(() => {
      window.__cloudSyncProbe = { resume: 0, rollback: 0 };
      const recover = window.QinshiCloudSync.recoverInterruptedRollback;
      window.QinshiCloudSync.resumePendingOperation = async function () {
        window.__cloudSyncProbe.resume += 1;
        return { status: 'manual-upload-required' };
      };
      window.QinshiCloudSync.recoverInterruptedRollback = async function () {
        window.__cloudSyncProbe.rollback += 1;
        return recover.call(window.QinshiCloudSync);
      };
      window.QinshiCloudSync.confirmPull = async function () { throw new Error('替换前测试失败'); };
    });
    await target.page.locator('#cloud-sync-confirm-check').check();
    await target.page.locator('#cloud-sync-confirm-overwrite').click();
    await target.page.locator('#cloud-sync-status').filter({ hasText: '替换前测试失败' }).waitFor();
    await target.page.waitForFunction(() => window.__cloudSyncProbe.rollback === 1);
    assert.deepEqual(await target.page.evaluate(() => window.__cloudSyncProbe), { resume: 0, rollback: 1 });
    assert.equal(await target.page.locator('#cloud-sync-rollback').isVisible(), false);
    await target.page.reload({ waitUntil: 'networkidle' });
    await target.page.evaluate(() => document.querySelector('.tab[data-partition="settings"]').click());
    await target.page.locator('#cloud-sync-panel').waitFor({ state: 'visible' });
    stub.tamperSnapshotId = snapshotId;
    const card = target.page.locator('#cloud-sync-source-list .cloud-sync-source-card', { hasText: 'Windows 设备 1' }).first();
    await card.locator('input[type="radio"]').check();
    await target.page.locator('#cloud-sync-prepare').click();
    await target.page.locator('#cloud-sync-status').filter({ hasText: '校验' }).waitFor();
    assert.equal(await target.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'target-progress');
    assert.equal(await readRollback(target.page), null);
    stub.tamperSnapshotId = null;
    stub.snapshots.get(snapshotId).chunks[0] = null;
    await target.page.locator('#cloud-sync-source-list .cloud-sync-source-card', { hasText: 'Windows 设备 1' })
      .first().locator('input[type="radio"]').check();
    await target.page.locator('#cloud-sync-prepare').click();
    await target.page.locator('#cloud-sync-status').filter({ hasText: '删除或不可用' }).waitFor();
    assert.equal(await target.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'target-progress');
    assert.equal(await readRollback(target.page), null);
  } finally { await target.context.close(); await source.context.close(); }
});

test('9 云端提交失败后恢复原数据并保留可见回滚恢复入口', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const { source, target } = await pairedDevices(stub);
  try {
    stub.failReplacementCommit = true;
    await selectSourceAndOpenConfirmation(target.page);
    await target.page.locator('#cloud-sync-confirm-check').check();
    const downloadPromise = target.page.waitForEvent('download');
    await target.page.locator('#cloud-sync-confirm-overwrite').click();
    await downloadPromise;
    await target.page.locator('#cloud-sync-rollback').waitFor({ state: 'visible' });
    assert.match(await target.page.locator('#cloud-sync-status').innerText(), /服务暂时异常/);
    assert.equal(await target.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'target-progress');
    assert.ok(await readRollback(target.page));
    assert.equal(await target.page.locator('#cloud-sync-rollback').isVisible(), true);
  } finally { await target.context.close(); await source.context.close(); }
});

test('10 忘记本设备只清除云配对并保留本机进度和 JSON 备份入口', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    await createSpace(session);
    session.page.once('dialog', dialog => dialog.accept());
    await session.page.locator('#cloud-sync-forget').click();
    await session.page.locator('#cloud-sync-unbound').waitFor({ state: 'visible' });
    assert.equal(await session.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'source-progress');
    assert.equal(await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()), null);
    assert.equal(await session.page.locator('#settings-export').isVisible(), true);
  } finally { await session.context.close(); }
});

test('11 云同步界面接入后 JSON 导出仍生成有效完整备份', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    await session.page.evaluate(() => {
      localStorage.setItem('qinshi_browser_progress', 'json-export-value');
      localStorage.setItem('unmanaged-key', 'must-not-export');
    });
    const downloadPromise = session.page.waitForEvent('download');
    await session.page.locator('#settings-export').click();
    const download = await downloadPromise;
    const payload = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8'));
    assert.equal(payload.formatVersion, 1);
    assert.equal(payload.data.qinshi_browser_progress, 'json-export-value');
    assert.equal(Object.hasOwn(payload.data, 'unmanaged-key'), false);
    assert.deepEqual(stub.requests, []);
    assert.deepEqual(stub.responses, []);
  } finally { await session.context.close(); }
});

test('12 永久删除使用独立确认弹层，取消安全且成功删除只清云端数据', { timeout: 120000 }, async () => {
  const stub = new CloudStub();
  const session = await browserPage(stub);
  try {
    const code = await createSpace(session);
    const form = session.page.locator('#cloud-sync-delete-form');
    await form.locator('input[name="syncCode"]').fill(code);
    await session.page.locator('#cloud-sync-delete-password').fill(PASSWORD);
    await session.page.locator('#cloud-sync-delete-space').click();
    await session.page.locator('#cloud-sync-delete-confirm-layer').waitFor({ state: 'visible' });
    await assertModalIsolation(session.page, '#cloud-sync-delete-confirm-layer');
    assert.equal(await session.page.locator('#cloud-sync-delete-confirm-submit').isDisabled(), true);
    assert.equal(await session.page.locator('#cloud-sync-delete-password').inputValue(), '');
    await session.page.keyboard.press('Escape');
    await assertModalClosed(session.page, '#cloud-sync-delete-confirm-layer', 'cloud-sync-delete-space');
    assert.equal(stub.space.spaceId.length > 0, true);
    assert.ok(await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()));
    await session.page.locator('#cloud-sync-delete-password').fill(PASSWORD);
    await session.page.locator('#cloud-sync-delete-space').click();
    await session.page.locator('#cloud-sync-delete-confirm-layer').waitFor({ state: 'visible' });
    const phrase = session.page.locator('#cloud-sync-delete-confirm-text');
    await phrase.fill('永久删除');
    assert.equal(await session.page.locator('#cloud-sync-delete-confirm-submit').isDisabled(), true);
    await phrase.fill('永久删除同步空间');
    assert.equal(await session.page.locator('#cloud-sync-delete-confirm-submit').isEnabled(), true);
    await session.page.locator('#cloud-sync-delete-confirm-submit').click();
    await session.page.locator('#cloud-sync-unbound').waitFor({ state: 'visible' });
    assert.equal(stub.space, null);
    assert.equal(await session.page.evaluate(() => window.QinshiCloudSyncStorage.loadPairing()), null);
    assert.equal(await session.page.evaluate(() => localStorage.getItem('qinshi_browser_progress')), 'source-progress');
    assert.equal(await session.page.locator('#settings-export').isVisible(), true);
    const deletes = stub.requests.filter(entry => entry.method === 'DELETE' && entry.pathname === '/v1/spaces/current');
    assert.equal(deletes.length, 1);
    assert.deepEqual({ version: deletes[0].hasVersion, idempotency: deletes[0].hasIdempotency,
      contentType: deletes[0].contentType, confirmation: deletes[0].confirmation, authField: deletes[0].authField }, {
      version: true, idempotency: true, contentType: 'application/json',
      confirmation: '永久删除同步空间', authField: 'authKey'
    });
  } finally { await session.context.close(); }
});
