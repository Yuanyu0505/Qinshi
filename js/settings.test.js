const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
    window: { setTimeout() {}, location: { reload() {} }, confirm() { return true; } }
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

test("validateManagedData accepts only string qinshi entries", () => {
  const api = loadSettings({});
  const data = { qinshi_atlas: "1" };
  assert.strictEqual(api.validateManagedData(data), data);
  assert.throws(() => api.validateManagedData(null), /备份文件缺少本机进度数据。/);
  assert.throws(() => api.validateManagedData({ theme: "dark" }), /备份文件包含不允许的数据项。/);
  assert.throws(() => api.validateManagedData({ qinshi_atlas: 1 }), /备份文件包含不允许的数据项。/);
});

test("replace returns the previous managed map and leaves unrelated keys untouched", () => {
  const harness = createStorage({ qinshi_old: "safe", theme: "dark" });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.deepStrictEqual(asPlainObject(api.replaceManagedData({ qinshi_new: "next" })), {
    previous: { qinshi_old: "safe" }
  });
  assert.deepStrictEqual(harness.dump(), { qinshi_new: "next", theme: "dark" });
});

test("replace rejects data outside the managed string-key scope", () => {
  const harness = createStorage({ qinshi_old: "safe", theme: "dark" });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData({ theme: "light" }), /备份文件包含不允许的数据项。/);
  assert.deepStrictEqual(harness.dump(), { qinshi_old: "safe", theme: "dark" });
});

test("replace rolls back every managed key when one write fails", () => {
  const harness = createStorage({ qinshi_old: "safe" }, { failOnKey: "qinshi_bad" });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData({ qinshi_new: "next", qinshi_bad: "x" }));
  assert.deepStrictEqual(harness.dump(), { qinshi_old: "safe" });
});

test("replace preserves an existing failed key when its write fails", () => {
  const harness = createStorage({ qinshi_bad: "safe", qinshi_old: "keep" }, { failOnKey: "qinshi_bad" });
  const api = loadSettingsWithStorage(harness.storage).api;
  assert.throws(() => api.replaceManagedData({ qinshi_old: "changed", qinshi_new: "new", qinshi_bad: "next" }));
  assert.deepStrictEqual(harness.dump(), { qinshi_bad: "safe", qinshi_old: "keep" });
});

test("restore restores a captured managed map without changing unrelated data", () => {
  const harness = createStorage({ qinshi_new: "next", theme: "dark" });
  const api = loadSettingsWithStorage(harness.storage).api;
  api.restoreManagedData({ qinshi_old: "safe" });
  assert.deepStrictEqual(harness.dump(), { qinshi_old: "safe", theme: "dark" });
});

test("payload preserves the backup contract and cloud-sync downloads use their reason", () => {
  const harness = createStorage({ qinshi_atlas: "1", theme: "dark" });
  const loaded = loadSettingsWithStorage(harness.storage);
  const payload = loaded.api.makePayload("before-cloud-sync", { deviceId: "device-1" });
  assert.deepStrictEqual(asPlainObject(payload), {
    formatVersion: 1,
    appName: "Qin",
    reason: "before-cloud-sync",
    exportedAt: "2026-09-11T08:00:00.000Z",
    data: { qinshi_atlas: "1" },
    metadata: { deviceId: "device-1" }
  });
  loaded.api.downloadPayload(payload, "before-cloud-sync");
  assert.deepStrictEqual(loaded.downloads, [{
    href: "blob:qin",
    download: "Qin-backup-before-cloud-sync-2026-09-11T08-00-00-000Z.json"
  }]);
});
