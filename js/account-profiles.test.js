"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Accounts = require("./account-profiles.js");

function memoryStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    get length() { return data.size; },
    key(index) { return Array.from(data.keys())[index] || null; },
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    dump() { return Object.fromEntries(data); }
  };
}

function harness(initial) {
  let serial = 0;
  const localStorage = memoryStorage(initial);
  const sessionStorage = memoryStorage();
  const api = Accounts.createStore({
    localStorage,
    sessionStorage,
    uuid: () => `account-${++serial}`,
    now: () => `2026-09-23T00:00:0${serial}.000Z`
  });
  api.boot();
  return { api, localStorage, sessionStorage };
}

test("账号注册表限制三个账号且名称服务器组合唯一", () => {
  const h = harness();
  h.api.createAccount({ name: "主号", server: "微信一区" });
  assert.throws(() => h.api.createAccount({ name: " 主号 ", server: "微信一区 " }), /已存在/);
  h.api.createAccount({ name: "小号", server: "微信二区" });
  h.api.createAccount({ name: "三号", server: "QQ一区" });
  assert.throws(() => h.api.createAccount({ name: "四号", server: "QQ二区" }), /最多保存3个账号/);
});

test("相同逻辑键在不同账号命名空间中完全隔离", () => {
  const h = harness();
  const a = h.api.createAccount({ name: "A", server: "一区" });
  const b = h.api.createAccount({ name: "B", server: "一区" });
  h.api.bindAccount(a.id);
  h.api.setItem("qinshi_progress", "A-data");
  h.api.bindAccount(b.id);
  h.api.setItem("qinshi_progress", "B-data");
  h.api.bindAccount(a.id);
  assert.equal(h.api.getItem("qinshi_progress"), "A-data");
  h.api.bindAccount(b.id);
  assert.equal(h.api.getItem("qinshi_progress"), "B-data");
});

test("主账号固定置顶且其余账号按保存顺序交换", () => {
  const h = harness();
  const a = h.api.createAccount({ name: "A", server: "一区" });
  const b = h.api.createAccount({ name: "B", server: "一区" });
  const c = h.api.createAccount({ name: "C", server: "一区" });
  h.api.setPrimary(b.id);
  assert.deepEqual(h.api.listAccounts().map(item => item.id), [b.id, a.id, c.id]);
  h.api.reorderAccounts([b.id, c.id, a.id]);
  assert.deepEqual(h.api.listAccounts().map(item => item.id), [b.id, c.id, a.id]);
});

test("删除主账号由创建时间最早的剩余账号接管，删除最后账号进入空状态", () => {
  const h = harness();
  const a = h.api.createAccount({ name: "A", server: "一区" });
  const b = h.api.createAccount({ name: "B", server: "一区" });
  h.api.setPrimary(b.id);
  assert.equal(h.api.deleteAccount(b.id).nextAccountId, a.id);
  assert.equal(h.api.primaryAccount().id, a.id);
  assert.deepEqual(h.api.deleteAccount(a.id), { nextAccountId: null, empty: true });
  assert.equal(h.api.currentAccount(), null);
});

test("旧单账号数据自动迁移为默认主账号且只迁移一次", () => {
  const h = harness({ qinshi_forging_progress_v1: "legacy", qinshi_atlas_inventory_v1: "{}" });
  const current = h.api.currentAccount();
  assert.equal(current.name, "默认账号");
  assert.equal(current.server, "未填写");
  assert.equal(h.api.getItem("qinshi_forging_progress_v1"), "legacy");
  assert.equal(h.localStorage.getItem("qinshi_forging_progress_v1"), null);
  assert.deepEqual(h.api.migrateLegacyLocalData(), { migrated: false, accountId: current.id });
});

test("迁移写入失败时保留全部旧数据且不提交注册表", () => {
  const localStorage = memoryStorage({ qinshi_progress: "legacy" });
  const originalSet = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    if (String(key).startsWith(Accounts.ACCOUNT_PREFIX)) throw new Error("quota");
    originalSet.call(this, key, value);
  };
  const api = Accounts.createStore({ localStorage, sessionStorage: memoryStorage(), uuid: () => "account-1" });
  assert.throws(() => api.boot(), /quota/);
  assert.equal(localStorage.getItem("qinshi_progress"), "legacy");
  assert.equal(localStorage.getItem(Accounts.REGISTRY_KEY), null);
});

test("更新账号不会改变不可变 ID 和已保存数据", () => {
  const h = harness();
  const account = h.api.createAccount({ name: "旧名", server: "一区" });
  h.api.setItem("qinshi_progress", "kept");
  const updated = h.api.updateAccount(account.id, { name: "新名", server: "二区" });
  assert.equal(updated.id, account.id);
  assert.equal(h.api.getItem("qinshi_progress"), "kept");
});
