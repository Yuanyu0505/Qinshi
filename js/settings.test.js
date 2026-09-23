const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Accounts = require("./account-profiles.js");

function managedData(logical) {
  const id = "account-1";
  const registry = {
    schemaVersion: 1,
    primaryAccountId: id,
    order: [id],
    accounts: [{ id, name: "主号", server: "一区", createdAt: "2026-09-11T08:00:00.000Z", updatedAt: "2026-09-11T08:00:00.000Z" }]
  };
  const data = { [Accounts.REGISTRY_KEY]: JSON.stringify(registry) };
  Object.entries(logical || {}).forEach(([key, value]) => { data[Accounts.physicalKey(id, key)] = value; });
  return data;
}

function createStorage(initial, options) {
  const values = new Map(Object.entries(initial || {}));
  const config = options || {};
  return {
    storage: {
      get length() { return values.size; },
      key(index) { return Array.from(values.keys())[index] || null; },
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) {
        if (key === config.failOnKey) throw new Error("storage write failed");
        values.set(key, String(value));
      },
      removeItem(key) { values.delete(key); }
    },
    dump() { return Object.fromEntries(values); }
  };
}

function loadSettingsWithStorage(storage, options) {
  const downloads = [];
  const config = options || {};
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    createElement() {
      return {
        click() { downloads.push({ href: this.href, download: this.download }); },
        remove() {}
      };
    },
    body: { appendChild() {} }
  };
  class FixedDate extends Date {
    constructor() { super("2026-09-11T08:00:00.000Z"); }
  }
  const context = {
    Blob: class Blob { constructor(parts, settings) { this.parts = parts; this.settings = settings; } },
    Date: FixedDate,
    URL: { createObjectURL() { return "blob:qin"; }, revokeObjectURL() {} },
    document,
    localStorage: storage,
    window: { QinshiAccountProfiles: Accounts, crypto: { randomUUID: () => "import-account" }, setTimeout() {}, location: { reload() {} }, confirm() { return true; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "settings.js"), "utf8"), context);
  return { api: context.window.QinshiSettings, downloads };
}

function loadSettings(initial) {
  const harness = createStorage(initial);
  return loadSettingsWithStorage(harness.storage).api;
}

function asPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

test("collects every current and future qinshi key only", () => {
  const api = loadSettings({ qinshi_atlas: "1", qinshi_future_module: '{"x":2}', theme: "dark" });
  assert.deepStrictEqual(asPlainObject(api.collectManagedData()), {
    qinshi_atlas: "1",
    qinshi_future_module: '{"x":2}'
  });
});

test("validateManagedData accepts only a complete multi-account snapshot", () => {
  const api = loadSettings({});
  const data = managedData({ qinshi_atlas: "1" });
  assert.strictEqual(api.validateManagedData(data), data);
  assert.throws(() => api.validateManagedData(null), /备份文件缺少本机进度数据。/);
  assert.throws(() => api.validateManagedData({ theme: "dark" }), /备份文件包含不允许的数据项。/);
  assert.throws(() => api.validateManagedData({ qinshi_atlas: "1" }), /旧版单账号云快照/);
});

test("replace returns the previous managed map and leaves unrelated keys untouched", () => {
  const previous = managedData({ qinshi_old: "safe" });
  const next = managedData({ qinshi_new: "next" });
  const harness = createStorage(Object.assign({}, previous, { theme: "dark" }));
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.deepStrictEqual(asPlainObject(api.replaceManagedData(next)), { previous });
  assert.deepStrictEqual(harness.dump(), Object.assign({}, next, { theme: "dark" }));
});

test("replace rejects data outside the managed string-key scope", () => {
  const previous = managedData({ qinshi_old: "safe" });
  const harness = createStorage(Object.assign({}, previous, { theme: "dark" }));
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData({ theme: "light" }), /备份文件包含不允许的数据项。/);
  assert.deepStrictEqual(harness.dump(), Object.assign({}, previous, { theme: "dark" }));
});

test("replace rolls back every managed key when one write fails", () => {
  const previous = managedData({ qinshi_old: "safe" });
  const next = managedData({ qinshi_new: "next", qinshi_bad: "x" });
  const badKey = Accounts.physicalKey("account-1", "qinshi_bad");
  const harness = createStorage(previous, { failOnKey: badKey });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData(next));
  assert.deepStrictEqual(harness.dump(), previous);
});

test("replace preserves an existing failed key when its write fails", () => {
  const previous = managedData({ qinshi_bad: "safe", qinshi_old: "keep" });
  const next = managedData({ qinshi_old: "changed", qinshi_new: "new", qinshi_bad: "next" });
  const harness = createStorage(previous, { failOnKey: Accounts.physicalKey("account-1", "qinshi_bad") });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData(next));
  assert.deepStrictEqual(harness.dump(), previous);
});

test("restore restores a captured managed map without changing unrelated data", () => {
  const next = managedData({ qinshi_new: "next" });
  const previous = managedData({ qinshi_old: "safe" });
  const harness = createStorage(Object.assign({}, next, { theme: "dark" }));
  const api = loadSettingsWithStorage(harness.storage).api;
  api.restoreManagedData(previous);
  assert.deepStrictEqual(harness.dump(), Object.assign({}, previous, { theme: "dark" }));
});

test("payload preserves the backup contract and cloud-sync downloads use their reason", () => {
  const data = managedData({ qinshi_atlas: "1" });
  const harness = createStorage(Object.assign({}, data, { theme: "dark" }));
  const loaded = loadSettingsWithStorage(harness.storage);
  const payload = loaded.api.makePayload("before-cloud-sync", { deviceId: "device-1" });
  assert.deepStrictEqual(asPlainObject(payload), {
    formatVersion: 2,
    appName: "Qin",
    reason: "before-cloud-sync",
    exportedAt: "2026-09-11T08:00:00.000Z",
    data,
    metadata: { deviceId: "device-1" }
  });
  loaded.api.downloadPayload(payload, "before-cloud-sync");
  assert.deepStrictEqual(loaded.downloads, [{
    href: "blob:qin",
    download: "Qin-backup-before-cloud-sync-2026-09-11T08-00-00-000Z.json"
  }]);
});

test("旧版 JSON 备份升级为默认账号后通过新版校验", () => {
  const api = loadSettings({});
  const upgraded = api.validatePayload({ formatVersion: 1, appName: "Qin", data: { qinshi_atlas: "legacy" } });
  const registry = JSON.parse(upgraded[Accounts.REGISTRY_KEY]);
  assert.equal(registry.accounts[0].name, "默认账号");
  assert.equal(registry.accounts[0].server, "未填写");
  assert.equal(upgraded[Accounts.physicalKey(registry.primaryAccountId, "qinshi_atlas")], "legacy");
});
