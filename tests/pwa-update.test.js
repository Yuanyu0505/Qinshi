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

async function flushAsync(times = 6) {
  for (let index = 0; index < times; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function loadPwa(registration, options = {}) {
  const elements = new Map([
    ['pwa-status', createElement()],
    ['pwa-update-notice', createElement()],
    ['pwa-mode-status', createElement()],
    ['pwa-version', createElement()],
    ['pwa-apply-update', createElement()],
    ['pwa-check-update', createElement()],
    ['pwa-repair-update', createElement()],
    ['pwa-install-help', createElement()],
    ['pwa-install', createElement()]
  ]);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const serviceWorkerListeners = new Map();
  const registerCalls = [];
  const intervalCalls = [];
  const fetchCalls = [];
  const deletedCaches = [];
  const replacedLocations = [];
  const localStorageData = new Map([['qinshi-progress', 'keep-me']]);
  let fetchAttempt = 0;
  const serviceWorker = {
    controller: {},
    ready: Promise.resolve(registration),
    getRegistrations: async () => options.registrations || [registration],
    register: async (...args) => {
      registerCalls.push(args);
      return registration;
    },
    addEventListener(type, listener) { serviceWorkerListeners.set(type, listener); }
  };
  const windowObject = {
    location: {
      protocol: 'https:',
      href: 'https://example.test/Qinshi/?view=atlas#settings',
      reload() {},
      replace(url) { replacedLocations.push(String(url)); }
    },
    navigator: { serviceWorker },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    QinshiPWA: null
  };
  const fetchImpl = options.fetch || (async () => ({
    ok: true,
    async json() { return { version: '1.0.39' }; }
  }));
  const context = {
    console,
    document: {
      hidden: false,
      getElementById(id) { return elements.get(id) || null; },
      addEventListener(type, listener) { documentListeners.set(type, listener); }
    },
    navigator: windowObject.navigator,
    window: windowObject,
    fetch: async (...args) => {
      fetchCalls.push(args);
      fetchAttempt += 1;
      return fetchImpl(...args, fetchAttempt);
    },
    caches: {
      async keys() { return options.cacheKeys || ['qinshi-site-1.0.37', 'unrelated-cache']; },
      async delete(key) { deletedCaches.push(key); return true; }
    },
    localStorage: {
      getItem(key) { return localStorageData.get(key) || null; },
      setItem(key, value) { localStorageData.set(key, String(value)); }
    },
    Promise,
    Date,
    URL,
    setTimeout(callback) { Promise.resolve().then(callback); return 1; },
    clearTimeout() {},
    setInterval(callback, delay) { intervalCalls.push({ callback, delay }); return intervalCalls.length; },
    clearInterval() {}
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'pwa.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'js/pwa.js' });
  documentListeners.get('DOMContentLoaded')();
  windowListeners.get('load')();
  await flushAsync();
  return {
    api: windowObject.QinshiPWA,
    elements,
    registerCalls,
    fetchCalls,
    intervalCalls,
    windowListeners,
    documentListeners,
    deletedCaches,
    replacedLocations,
    localStorageData
  };
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

test('首次打开通过不缓存的版本信标检查远端版本', async () => {
  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() {}
  };
  const { fetchCalls, intervalCalls } = await loadPwa(registration);

  assert.equal(fetchCalls.length, 1);
  assert.match(String(fetchCalls[0][0]), /^\.\/version\.json\?t=\d+$/);
  assert.equal(fetchCalls[0][1].cache, 'no-store');
  assert.equal(intervalCalls.length, 1);
  assert.equal(intervalCalls[0].delay, 30 * 60 * 1000);
});

test('联网恢复和返回前台会再次检查版本信标', async () => {
  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() {}
  };
  const loaded = await loadPwa(registration);
  const initialFetches = loaded.fetchCalls.length;

  loaded.windowListeners.get('online')();
  await flushAsync();
  assert.equal(loaded.fetchCalls.length, initialFetches + 1);

  loaded.documentListeners.get('visibilitychange')();
  await flushAsync();
  assert.equal(loaded.fetchCalls.length, initialFetches + 2);
});

test('版本信标遇到短暂网络失败会自动重试三次并继续更新', async () => {
  let updateCalls = 0;
  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() { updateCalls += 1; }
  };
  const loaded = await loadPwa(registration, {
    fetch: async (...args) => {
      const attempt = args.at(-1);
      if (attempt < 3) throw new Error('offline');
      return { ok: true, async json() { return { version: '9.9.9' }; } };
    }
  });

  assert.equal(loaded.fetchCalls.length, 3);
  assert.equal(updateCalls, 1);
});

test('强制修复只移除本站 Service Worker 和 PWA 缓存并保留个人进度', async () => {
  const unregistered = [];
  const registration = {
    scope: 'https://example.test/Qinshi/',
    waiting: null,
    installing: null,
    addEventListener() {},
    async update() {}
  };
  const otherRegistration = {
    scope: 'https://example.test/Other/',
    async unregister() { unregistered.push(this.scope); return true; }
  };
  registration.unregister = async function () { unregistered.push(this.scope); return true; };
  const loaded = await loadPwa(registration, { registrations: [registration, otherRegistration] });
  loaded.elements.get('pwa-repair-update').dispatch('click');
  await flushAsync(10);

  assert.deepEqual(unregistered, ['https://example.test/Qinshi/']);
  assert.deepEqual(loaded.deletedCaches, ['qinshi-site-1.0.37']);
  assert.equal(loaded.localStorageData.get('qinshi-progress'), 'keep-me');
  assert.equal(loaded.replacedLocations.length, 1);
  assert.match(loaded.replacedLocations[0], /pwa-repair=\d+/);
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
