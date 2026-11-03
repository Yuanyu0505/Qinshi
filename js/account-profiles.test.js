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

test('休眠后的铭文写入安全续期，其他标签页接管后拒绝覆盖',()=>{
  const Lease=require('./account-edit-lease.js'),State=require('./inscription-crafting-state.js');
  let clock=100;const localStorage=memoryStorage(),sessionStorage=memoryStorage();
  const lease=Lease.createLease({storage:localStorage,tabId:'a',token:()=> 'a-token',now:()=>clock,ttl:50});
  const api=Accounts.createStore({localStorage,sessionStorage,lease,uuid:()=> 'lease-account'});api.boot();api.createAccount({name:'A',server:'one'});
  const query=State.createQueryStore(api),workbench=State.createWorkbench(api),q=query.inspect(),w=workbench.inspect();
  clock=1000;
  const nextQuery={...q.target,dun:'鬼遁'};
  assert.equal(query.save(nextQuery,q.token,'lease-account').target.dun,'鬼遁');
  assert.equal(workbench.save(w.state,w.token,'lease-account').valid,true);
  const before=api.getItem(State.QUERY_KEY);
  const other=Lease.createLease({storage:localStorage,tabId:'b',token:()=> 'b-token',now:()=>clock,ttl:50});other.takeOver('lease-account');
  assert.throws(()=>query.save({...nextQuery,dun:'云遁'},before,'lease-account'),/其他标签页|只读/);
  assert.equal(api.getItem(State.QUERY_KEY),before);
});

test('缓存页面不能写入已删除账号或已变更的会话账号',()=>{
  const h=harness(),a=h.api.createAccount({name:'A',server:'one'}),b=h.api.createAccount({name:'B',server:'two'});
  h.api.bindAccount(a.id);
  h.sessionStorage.setItem(Accounts.ACTIVE_SESSION_KEY,b.id);
  assert.equal(h.api.isCurrentContext(),false);
  assert.throws(()=>h.api.setItem('qinshi_inscription_path_query_v1','stale'),/账号.*更新|重新加载/);
  assert.equal(h.localStorage.getItem(Accounts.physicalKey(a.id,'qinshi_inscription_path_query_v1')),null);
  h.sessionStorage.setItem(Accounts.ACTIVE_SESSION_KEY,a.id);
  const registry=h.api.registry();registry.accounts=registry.accounts.filter(x=>x.id!==a.id);registry.order=registry.order.filter(x=>x!==a.id);registry.primaryAccountId=b.id;
  h.localStorage.setItem(Accounts.REGISTRY_KEY,JSON.stringify(registry));
  assert.equal(h.api.isCurrentContext(),false);
  assert.throws(()=>h.api.setItem('qinshi_inscription_crafting_v1','stale'),/账号.*更新|重新加载/);
  assert.equal(h.localStorage.getItem(Accounts.physicalKey(a.id,'qinshi_inscription_crafting_v1')),null);
});

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

test("木人巷数据随账号快照导出恢复且不会串号", () => {
  const h = harness();
  const a = h.api.createAccount({ name: "A", server: "一区" });
  const b = h.api.createAccount({ name: "B", server: "二区" });
  h.api.bindAccount(a.id);
  h.api.setItem("qinshi_wooden_man_alley_progress_v1", '{"currentFloor":75}');
  const snapshot = h.api.listAccountData(a.id);
  assert.equal(snapshot.qinshi_wooden_man_alley_progress_v1, '{"currentFloor":75}');
  h.api.bindAccount(b.id);
  assert.equal(h.api.getItem("qinshi_wooden_man_alley_progress_v1"), null);
  h.api.replaceAccountData(b.id, snapshot);
  assert.equal(h.api.getItem("qinshi_wooden_man_alley_progress_v1"), '{"currentFloor":75}');
  h.api.bindAccount(a.id);
  assert.equal(h.api.getItem("qinshi_wooden_man_alley_progress_v1"), '{"currentFloor":75}');
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
