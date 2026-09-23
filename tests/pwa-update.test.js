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
  let reloadCalls = 0;
  const localStorageData = new Map([['qinshi-progress', 'keep-me']]);
  const sessionStorageData = new Map(options.sessionEntries || []);
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
      reload() { reloadCalls += 1; },
      replace(url) { replacedLocations.push(String(url)); }
    },
    navigator: { serviceWorker },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    QinshiPWA: null
  };
  windowObject.sessionStorage = {
    getItem(key) { return sessionStorageData.get(key) || null; },
    setItem(key, value) { sessionStorageData.set(key, String(value)); },
    removeItem(key) { sessionStorageData.delete(key); }
  };
  const fetchImpl = options.fetch || (async () => ({
    ok: true,
    async json() { return { version: '1.0.40' }; }
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
    sessionStorage: windowObject.sessionStorage,
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
    localStorageData,
    sessionStorageData,
    serviceWorkerListeners,
    serviceWorker,
    get reloadCalls() { return reloadCalls; }
  };
}

function idleRegistration(overrides = {}) {
  return { waiting: null, installing: null, addEventListener() {}, async update() {}, ...overrides };
}

const currentLimits = { minimumReadVersion: '1.0.40', minimumWriteVersion: '1.0.40' };

test('同步预检重新读取无缓存版本信标，当前版本满足读写要求时放行', async () => {
  let updates = 0;
  const loaded = await loadPwa(idleRegistration({ async update() { updates += 1; } }));
  const before = loaded.fetchCalls.length;
  const result = await loaded.api.ensureCurrentForSync(currentLimits);
  assert.equal(result.ready, true);
  assert.equal(result.updateRequired, false);
  assert.equal(loaded.fetchCalls.length, before + 1);
  assert.equal(loaded.fetchCalls.at(-1)[1].cache, 'no-store');
  assert.equal(loaded.fetchCalls.at(-1)[1].headers['Cache-Control'], 'no-cache');
  assert.equal(updates, 0);
});

for (const requirement of [
  { name: '公网版本', remote: '1.0.41', limits: currentLimits },
  { name: 'Worker 最低读版本', remote: '1.0.40', limits: { ...currentLimits, minimumReadVersion: '1.0.41' } },
  { name: 'Worker 最低写版本', remote: '1.0.40', limits: { ...currentLimits, minimumWriteVersion: '1.0.100' } }
]) {
  test(`同步预检在${requirement.name}要求更新时阻断，且不能自动应用或删除待恢复操作`, async () => {
    const messages = [];
    const pending = JSON.stringify({ type: 'pull', snapshotId: 'immutable-snapshot-1' });
    let updates = 0;
    const registration = idleRegistration({ async update() { updates += 1; } });
    const loaded = await loadPwa(registration, {
      sessionEntries: [['qin-cloud-sync-pending', pending]],
      fetch: async () => ({ ok: true, async json() { return { version: requirement.remote }; } })
    });
    const before = updates;
    registration.update = async function () {
      updates += 1;
      this.waiting = { state: 'installed', postMessage(message) { messages.push(message); } };
    };
    const result = await loaded.api.ensureCurrentForSync(requirement.limits);
    assert.equal(result.ready, false);
    assert.equal(result.updateRequired, true);
    assert.equal(updates, before + 1);
    assert.equal(loaded.elements.get('pwa-update-notice').hidden, false);
    assert.equal(loaded.sessionStorageData.get('qin-cloud-sync-pending'), pending);
    assert.equal(loaded.localStorageData.get('qinshi-progress'), 'keep-me');
    assert.deepEqual(messages, []);
    assert.deepEqual(loaded.deletedCaches, []);
    assert.deepEqual(loaded.replacedLocations, []);
    loaded.serviceWorkerListeners.get('controllerchange')();
    assert.equal(loaded.reloadCalls, 0);
  });
}

test('同步预检按数值比较版本，公网较旧或 Worker 最低版本较低不阻断', async () => {
  const loaded = await loadPwa(idleRegistration(), {
    fetch: async () => ({ ok: true, async json() { return { version: '1.0.9' }; } })
  });
  const result = await loaded.api.ensureCurrentForSync({ minimumReadVersion: '1.0.9', minimumWriteVersion: '1.0.10' });
  assert.equal(result.ready, true);
  assert.equal(result.updateRequired, false);
});

test('同步预检离线时重试三次后阻断，不误报必须更新或触发重载', async () => {
  let offline = false;
  const loaded = await loadPwa(idleRegistration(), {
    fetch: async () => {
      if (offline) throw new Error('offline');
      return { ok: true, async json() { return { version: '1.0.40' }; } };
    }
  });
  offline = true;
  const before = loaded.fetchCalls.length;
  const result = await loaded.api.ensureCurrentForSync(currentLimits);
  assert.equal(result.ready, false);
  assert.equal(result.updateRequired, false);
  assert.equal(loaded.fetchCalls.length, before + 3);
  assert.match(loaded.elements.get('pwa-status').textContent, /失败/);
  assert.equal(loaded.reloadCalls, 0);
  assert.deepEqual(loaded.deletedCaches, []);
});

test('无效或缺失的 Worker 版本约束不能放行同步', async () => {
  const loaded = await loadPwa(idleRegistration());
  for (const limits of [undefined, {}, { ...currentLimits, minimumWriteVersion: 'not-a-version' }]) {
    const result = await loaded.api.ensureCurrentForSync(limits);
    assert.equal(result.ready, false);
    assert.equal(result.updateRequired, false);
  }
});

test('无效公网版本不能放行同步', async () => {
  const loaded = await loadPwa(idleRegistration(), {
    fetch: async () => ({ ok: true, async json() { return { version: 'not-a-version' }; } })
  });
  const result = await loaded.api.ensureCurrentForSync(currentLimits);
  assert.equal(result.ready, false);
  assert.equal(result.updateRequired, false);
});

test('已确定必须更新但 Service Worker 更新失败时仍保留 updateRequired', async () => {
  let attempts = 0;
  const loaded = await loadPwa(idleRegistration({ async update() { attempts += 1; throw new Error('offline'); } }));
  const result = await loaded.api.ensureCurrentForSync({ ...currentLimits, minimumWriteVersion: '1.0.41' });
  assert.equal(result.ready, false);
  assert.equal(result.updateRequired, true);
  assert.equal(attempts, 3);
  assert.match(loaded.elements.get('pwa-status').textContent, /强制修复更新/);
});

test('显式更新在 worker 未就绪时保留 pending 并提示强制修复更新', async () => {
  const pending = JSON.stringify({ type: 'restore', snapshotId: 'history-snapshot-1' });
  const loaded = await loadPwa(idleRegistration(), { sessionEntries: [['qin-cloud-sync-pending', pending]] });
  assert.equal(loaded.api.applyWaitingUpdate(), false);
  assert.match(loaded.elements.get('pwa-status').textContent, /强制修复更新/);
  assert.equal(loaded.sessionStorageData.get('qin-cloud-sync-pending'), pending);
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 0);
});

test('只有显式应用 waiting worker 后才重载一次，精确 pending ID 跨重载保持不变', async () => {
  const messages = [];
  const pending = JSON.stringify({ type: 'pull', snapshotId: 'immutable-snapshot-1' });
  const loaded = await loadPwa(idleRegistration({ waiting: { state: 'installed', postMessage(message) { messages.push(message.type); } } }), {
    sessionEntries: [['qin-cloud-sync-pending', pending]]
  });
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 0);
  assert.equal(loaded.api.applyWaitingUpdate(), true);
  assert.deepEqual(messages, ['SKIP_WAITING']);
  assert.equal(loaded.reloadCalls, 0);
  loaded.serviceWorkerListeners.get('controllerchange')();
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 1);
  assert.equal(loaded.sessionStorageData.get('qin-cloud-sync-pending'), pending);
});

test('显式更新发送失败返回 false，不能让后续 controllerchange 意外重载', async () => {
  const pending = JSON.stringify({ type: 'pull', snapshotId: 'immutable-snapshot-1' });
  const loaded = await loadPwa(idleRegistration({ waiting: { state: 'installed', postMessage() { throw new Error('worker unavailable'); } } }), {
    sessionEntries: [['qin-cloud-sync-pending', pending]]
  });
  assert.equal(loaded.api.applyWaitingUpdate(), false);
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 0);
  assert.equal(loaded.sessionStorageData.get('qin-cloud-sync-pending'), pending);
  assert.match(loaded.elements.get('pwa-status').textContent, /强制修复更新/);
});

test('其他标签页激活旧 waiting worker 后显式更新必须阻断并保留精确 pending', async () => {
  const messages = [];
  const worker = { state: 'installed', postMessage(message) { messages.push(message.type); } };
  const registration = idleRegistration({ waiting: worker });
  const pending = JSON.stringify({ type: 'pull', snapshotId: 'immutable-snapshot-1' });
  const loaded = await loadPwa(registration, { sessionEntries: [['qin-cloud-sync-pending', pending]] });
  assert.equal(loaded.elements.get('pwa-update-notice').hidden, false);

  registration.waiting = null;
  worker.state = 'activated';
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 0);
  assert.equal(loaded.api.applyWaitingUpdate(), false);
  assert.deepEqual(messages, []);
  loaded.serviceWorkerListeners.get('controllerchange')();
  assert.equal(loaded.reloadCalls, 0);
  assert.equal(loaded.sessionStorageData.get('qin-cloud-sync-pending'), pending);
  assert.equal(loaded.elements.get('pwa-update-notice').hidden, true);
  assert.match(loaded.elements.get('pwa-status').textContent, /强制修复更新/);
  const fetches = loaded.fetchCalls.length;
  assert.equal(await loaded.api.checkForUpdate(), false);
  assert.equal(loaded.fetchCalls.length, fetches + 1);
});

test('显式更新不能使用非 installed 状态的 worker 或无 controller 的首次安装', async () => {
  for (const state of ['installing', 'activating', 'activated', 'redundant', undefined]) {
    const messages = [];
    const registration = idleRegistration({ waiting: { state, postMessage(message) { messages.push(message.type); } } });
    const loaded = await loadPwa(registration);
    assert.equal(loaded.api.applyWaitingUpdate(), false, String(state));
    assert.deepEqual(messages, []);
    loaded.serviceWorkerListeners.get('controllerchange')();
    assert.equal(loaded.reloadCalls, 0);
  }
  const messages = [];
  const loaded = await loadPwa(idleRegistration({ waiting: { state: 'installed', postMessage(message) { messages.push(message.type); } } }));
  loaded.serviceWorker.controller = null;
  assert.equal(loaded.api.applyWaitingUpdate(), false);
  assert.deepEqual(messages, []);
});

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
  const waitingWorker = { state: 'installed', postMessage() {} };
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
  const messages = [];
  const installingWorker = {
    state: 'installing',
    postMessage(message) { messages.push(message.type); },
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const registration = {
    waiting: null,
    installing: installingWorker,
    addEventListener() {},
    async update() {}
  };
  const { api, elements } = await loadPwa(registration);

  assert.equal(typeof listeners.get('statechange'), 'function');
  registration.waiting = installingWorker;
  installingWorker.state = 'installed';
  listeners.get('statechange')();

  assert.equal(elements.get('pwa-update-notice').hidden, false);
  assert.equal(api.applyWaitingUpdate(), true);
  assert.deepEqual(messages, ['SKIP_WAITING']);
});
