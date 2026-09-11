const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createElement() {
  const listeners = new Map();
  return {
    hidden: true,
    textContent: '',
    classList: { toggle() {} },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { if (listeners.has(type)) listeners.get(type)(); }
  };
}

async function loadPwa(registration) {
  const elements = new Map([
    ['pwa-status', createElement()],
    ['pwa-update-notice', createElement()],
    ['pwa-mode-status', createElement()],
    ['pwa-version', createElement()],
    ['pwa-apply-update', createElement()],
    ['pwa-check-update', createElement()],
    ['pwa-install-help', createElement()],
    ['pwa-install', createElement()]
  ]);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const serviceWorkerListeners = new Map();
  const registerCalls = [];
  const serviceWorker = {
    controller: {},
    ready: Promise.resolve(registration),
    register: async (...args) => {
      registerCalls.push(args);
      return registration;
    },
    addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); }
  };
  const windowObject = {
    location: { protocol: 'https:' },
    navigator: { serviceWorker },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    QinshiPWA: null
  };
  const context = {
    console,
    document: {
      getElementById(id) { return elements.get(id) || null; },
      addEventListener(type, listener) { documentListeners.set(type, listener); }
    },
    navigator: windowObject.navigator,
    window: windowObject,
    Promise,
    setTimeout,
    clearTimeout
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'pwa.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'js/pwa.js' });
  documentListeners.get('DOMContentLoaded')();
  windowListeners.get('load')();
  await new Promise(resolve => setImmediate(resolve));
  return { api: windowObject.QinshiPWA, elements, registerCalls };
}

test('注册 Service Worker 时绕过 HTTP 缓存检查最新版', async () => {
  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() {}
  };
  const { registerCalls } = await loadPwa(registration);

  assert.equal(registerCalls.length, 1);
  assert.equal(registerCalls[0][0], './service-worker.js');
  assert.equal(registerCalls[0][1].updateViaCache, 'none');
});

test('检查更新会识别 update 完成后已经进入 waiting 的新版', async () => {
  const waitingWorker = { postMessage() {} };
  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() { this.waiting = waitingWorker; }
  };
  const { api, elements } = await loadPwa(registration);

  assert.equal(await api.checkForUpdate(), true);
  assert.equal(elements.get('pwa-update-notice').hidden, false);
});

test('注册完成时已在 installing 的新版安装后会立即显示更新提示', async () => {
  const listeners = new Map();
  const installingWorker = {
    state: 'installing',
    postMessage() {},
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const registration = {
    waiting: null,
    installing: installingWorker,
    addEventListener() {},
    async update() {}
  };
  const { elements } = await loadPwa(registration);

  assert.equal(typeof listeners.get('statechange'), 'function');
  registration.waiting = installingWorker;
  installingWorker.state = 'installed';
  listeners.get('statechange')();

  assert.equal(elements.get('pwa-update-notice').hidden, false);
});
