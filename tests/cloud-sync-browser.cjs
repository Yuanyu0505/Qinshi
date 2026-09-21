const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');

const PASSWORD = 'browser-only-test-password';
const LIMITS = { minimumReadVersion: '1.0.39', minimumWriteVersion: '1.0.39' };
let browser, server, appUrl;
let scenarioStubs = [];

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('base64url');
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
    this.violations = [];
    this.allowedOrigin = '';
  }

  responseHeaders(request, headers = {}) {
    return { 'Access-Control-Allow-Origin': request.headers().origin || this.allowedOrigin,
      'Vary': 'Origin', 'Access-Control-Expose-Headers': 'X-Chunk-SHA256', ...headers };
  }

  json(route, status, value, headers = {}) {
    const request = route.request();
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8',
      headers: this.responseHeaders(request, headers), body: JSON.stringify(value) });
  }

  violation(route, reason, status = 400) {
    const request = route.request();
    const safe = { method: request.method(), pathname: new URL(request.url()).pathname, reason };
    this.violations.push(safe);
    return this.json(route, status, { error: { code: status === 401 ? 'AUTH_FAILED' : 'INVALID_REQUEST' } });
  }

  authenticate(request) {
    const match = /^Device ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(request.headers().authorization || '');
    if (!match) return null;
    const device = this.devices.get(match[1]);
    if (!device || device.deviceToken !== match[2] || !this.space || device.spaceId !== this.space.spaceId) return null;
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
      typeof value.deviceId === 'string' && typeof value.deviceToken === 'string' && value.encryptedName;
  }

  validUpload(body) {
    const fields = ['operation', 'snapshotId', 'sourceSnapshotId', 'appVersion', 'formatVersion', 'schemaVersion', 'encoding',
      'clientCreatedAt', 'dataHash', 'iv', 'ciphertextBytes', 'chunkCount', 'ciphertextDigest', 'encryptedSummary'];
    return body && Object.keys(body).sort().join(',') === fields.sort().join(',') &&
      ['upload', 'replace-before', 'replace-after', 'restore-before', 'restore-after'].includes(body.operation) &&
      typeof body.snapshotId === 'string' && (body.sourceSnapshotId === null || typeof body.sourceSnapshotId === 'string') &&
      body.appVersion === LIMITS.minimumWriteVersion && body.formatVersion === 1 && body.schemaVersion === 1 &&
      ['identity', 'gzip'].includes(body.encoding) && typeof body.clientCreatedAt === 'string' &&
      typeof body.dataHash === 'string' && typeof body.iv === 'string' && Number.isSafeInteger(body.ciphertextBytes) &&
      body.ciphertextBytes >= 16 && Number.isSafeInteger(body.chunkCount) && body.chunkCount > 0 &&
      body.chunkCount === Math.ceil(body.ciphertextBytes / (512 * 1024)) && typeof body.ciphertextDigest === 'string' &&
      body.encryptedSummary && typeof body.encryptedSummary === 'object';
  }

  assertClean() {
    assert.deepEqual(this.violations, [], 'Worker stub protocol violations must stay empty');
  }

  metadata(upload, deviceId) {
    const { operation, ...body } = upload.body;
    return { ...body, deviceId, serverCreatedAt: new Date(1700000000000 + (++this.sequence * 1000)).toISOString() };
  }

  saveLatest(device, upload, beforeUpload) {
    const latest = this.metadata(upload, device.deviceId);
    this.snapshots.set(latest.snapshotId, { metadata: latest, chunks: upload.chunks.slice(), spaceId: device.spaceId });
    if (beforeUpload) {
      const before = this.metadata(beforeUpload, device.deviceId);
      this.snapshots.set(before.snapshotId, { metadata: before, chunks: beforeUpload.chunks.slice(), spaceId: device.spaceId });
      device.historySnapshots.unshift(before);
    } else if (device.latestSnapshot) {
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
    this.requests.push({ method, pathname, contentType: headers['content-type'] || '',
      hasVersion: headers['x-qin-app-version'] === LIMITS.minimumWriteVersion,
      hasIdempotency: Boolean(headers['idempotency-key']) });
    if (headers.origin !== this.allowedOrigin) return this.violation(route, 'origin-not-allowed', 403);
    if (method === 'OPTIONS') {
      const requestedMethod = headers['access-control-request-method'];
      const requestedHeaders = (headers['access-control-request-headers'] || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
      const allowed = ['authorization', 'content-type', 'x-qin-app-version', 'idempotency-key', 'x-chunk-sha256'];
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(requestedMethod) || requestedHeaders.some(v => !allowed.includes(v))) {
        return this.violation(route, 'invalid-preflight', 403);
      }
      return route.fulfill({ status: 204, headers: this.responseHeaders(request, {
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
    const idempotent = (method === 'POST' && (pathname === '/v1/spaces' || /\/pair$/.test(pathname) || pathname === '/v1/uploads' || /\/commit$/.test(pathname))) ||
      (method === 'DELETE' && pathname === '/v1/spaces/current');
    if (idempotent && !/^[A-Za-z0-9_-]{1,128}$/.test(headers['idempotency-key'] || '')) return this.violation(route, 'missing-idempotency-key');
    const device = this.authenticate(request);
    const needsAuth = pathname === '/v1/devices' || pathname === '/v1/uploads' || /^\/v1\/(?:uploads|snapshots)\//.test(pathname) || pathname === '/v1/spaces/current';
    if (needsAuth && !device) return this.violation(route, 'invalid-device-auth', 401);
    if (device && this.revoked.has(device.deviceId)) {
      return this.json(route, 401, { error: { code: 'AUTH_FAILED' } });
    }
    if (method === 'GET' && pathname === '/v1/health') return this.json(route, 200, LIMITS);

    if (method === 'POST' && pathname === '/v1/spaces') {
      const body = this.body(request, ['syncCode', 'spaceId', 'kdf', 'authKey', 'passwordWrappedMaster',
        'recoveryAuthKey', 'recoveryWrappedMaster', 'device', 'appVersion']);
      if (!body || !this.validDevice(body.device) || body.appVersion !== LIMITS.minimumWriteVersion ||
        typeof body.syncCode !== 'string' || typeof body.spaceId !== 'string' || typeof body.authKey !== 'string' ||
        typeof body.recoveryAuthKey !== 'string' || !body.kdf || !body.passwordWrappedMaster || !body.recoveryWrappedMaster) {
        return this.violation(route, 'invalid-create-body');
      }
      this.space = { syncCode: body.syncCode, spaceId: body.spaceId, kdf: body.kdf,
        authKey: body.authKey, recoveryAuthKey: body.recoveryAuthKey,
        passwordWrappedMaster: body.passwordWrappedMaster, recoveryWrappedMaster: body.recoveryWrappedMaster };
      this.devices.set(body.device.deviceId, { deviceId: body.device.deviceId, deviceToken: body.device.deviceToken,
        spaceId: body.spaceId, encryptedName: body.device.encryptedName, revoked: false, revokedAt: null,
        createdAt: new Date(1700000000000).toISOString(), lastUsedAt: null, lastUploadedAt: null,
        latestSnapshot: null, historySnapshots: [] });
      return this.json(route, 200, { spaceId: body.spaceId, deviceId: body.device.deviceId, ...LIMITS });
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
      if (!body || body.authKey !== this.space.authKey || body.appVersion !== LIMITS.minimumWriteVersion || !this.validDevice(body.device)) {
        return this.violation(route, 'invalid-pair-body', 401);
      }
      this.devices.set(body.device.deviceId, { deviceId: body.device.deviceId, deviceToken: body.device.deviceToken,
        spaceId: this.space.spaceId, encryptedName: body.device.encryptedName, revoked: false, revokedAt: null,
        createdAt: new Date(1700000001000).toISOString(), lastUsedAt: null, lastUploadedAt: null,
        latestSnapshot: null, historySnapshots: [] });
      return this.json(route, 200, { spaceId: this.space.spaceId, deviceId: body.device.deviceId, ...LIMITS });
    }

    if (method === 'GET' && pathname === '/v1/devices') {
      return this.json(route, 200, { devices: Array.from(this.devices.values()).map(device => ({
        deviceId: device.deviceId, encryptedName: device.encryptedName, revoked: device.revoked,
        revokedAt: device.revokedAt, createdAt: device.createdAt, lastUsedAt: device.lastUsedAt,
        lastUploadedAt: device.lastUploadedAt, latestSnapshot: device.latestSnapshot,
        historySnapshots: device.historySnapshots
      })) });
    }

    if (method === 'POST' && pathname === '/v1/uploads') {
      const body = request.postDataJSON();
      if (!this.validUpload(body)) return this.violation(route, 'invalid-upload-body');
      const uploadId = 'upload-' + (++this.sequence);
      this.uploads.set(uploadId, { uploadId, deviceId: device.deviceId, spaceId: device.spaceId, body, chunks: [] });
      return this.json(route, 200, { uploadId, snapshotId: body.snapshotId, uploadedChunks: [],
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
      return this.json(route, 200, { chunkIndex: index });
    }
    const commit = /^\/v1\/uploads\/([^/]+)\/commit$/.exec(pathname);
    if (method === 'POST' && commit) {
      const key = request.headers()['idempotency-key'];
      if (this.receipts.has(key)) return this.json(route, 200, this.receipts.get(key));
      const upload = this.uploads.get(commit[1]);
      const body = this.body(request, ['beforeUploadId', 'sourceSnapshotId']);
      if (!upload || upload.deviceId !== device.deviceId || upload.spaceId !== device.spaceId || !body ||
        upload.chunks.length !== upload.body.chunkCount || upload.chunks.some(chunk => !chunk) ||
        digest(Buffer.concat(upload.chunks)) !== upload.body.ciphertextDigest || body.sourceSnapshotId !== upload.body.sourceSnapshotId) {
        return this.violation(route, 'invalid-upload-commit');
      }
      if (this.failReplacementCommit && body.beforeUploadId) {
        return this.json(route, 500, { error: { code: 'INTERNAL_ERROR' } });
      }
      const beforeUpload = body.beforeUploadId ? this.uploads.get(body.beforeUploadId) : null;
      if ((upload.body.operation.endsWith('-after') && (!beforeUpload || beforeUpload.deviceId !== device.deviceId ||
        beforeUpload.body.operation !== upload.body.operation.replace('-after', '-before'))) ||
        (!upload.body.operation.endsWith('-after') && body.beforeUploadId !== null)) {
        return this.violation(route, 'invalid-commit-reference');
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
      return saved && saved.spaceId === device.spaceId ? this.json(route, 200, saved.metadata) :
        this.json(route, 404, { error: { code: 'NOT_FOUND' } });
    }
    const snapshotChunk = /^\/v1\/snapshots\/([^/]+)\/chunks\/(\d+)$/.exec(pathname);
    if (method === 'GET' && snapshotChunk) {
      const saved = this.snapshots.get(snapshotChunk[1]);
      const index = Number(snapshotChunk[2]);
      if (!saved || saved.spaceId !== device.spaceId || !saved.chunks[index]) return this.json(route, 404, { error: { code: 'NOT_FOUND' } });
      const original = saved.chunks[index];
      const bytes = this.tamperSnapshotId === snapshotChunk[1]
        ? Buffer.from(original.map((value, offset) => offset === 0 ? value ^ 1 : value)) : original;
      return route.fulfill({ status: 200, contentType: 'application/octet-stream',
        headers: this.responseHeaders(request, { 'X-Chunk-SHA256': digest(original) }), body: bytes });
    }
    if (method === 'DELETE' && pathname === '/v1/spaces/current') {
      const raw = request.postDataJSON();
      const authField = raw && Object.hasOwn(raw, 'authKey') ? 'authKey' : 'recoveryAuthKey';
      const body = this.body(request, [authField, 'confirmation', 'appVersion']);
      if (!body || body.confirmation !== '永久删除同步空间' || body.appVersion !== LIMITS.minimumWriteVersion ||
        !this.space || body[authField] !== this.space[authField]) return this.violation(route, 'invalid-delete-body', 401);
      this.requests[this.requests.length - 1].confirmation = body.confirmation;
      this.requests[this.requests.length - 1].authField = authField;
      this.space = null; this.devices.clear(); this.uploads.clear(); this.snapshots.clear(); this.receipts.clear();
      return route.fulfill({ status: 204, headers: this.responseHeaders(request) });
    }
    return this.json(route, 404, { error: { code: 'NOT_FOUND' } });
  }
}

before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  appUrl = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
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
  let remoteVersion = '1.0.39';
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
  return { context, page, setRemoteVersion(value) { remoteVersion = value; } };
}

async function createSpace(session, deviceName = 'Windows 设备 1', localValue = 'source-progress', inspectRecovery) {
  const { page } = session;
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
  const { page } = session;
  await page.evaluate(value => localStorage.setItem('qinshi_browser_progress', value), localValue);
  await page.locator('#cloud-sync-join-code').fill(syncCode);
  await page.locator('#cloud-sync-join-device').fill(deviceName);
  await page.locator('#cloud-sync-join-password').fill(PASSWORD);
  await page.locator('#cloud-sync-join-form button[type="submit"]').click();
  await page.locator('#cloud-sync-status').filter({ hasText: '尚未上传或覆盖' }).waitFor();
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
    target.setRemoteVersion('1.0.39');
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
