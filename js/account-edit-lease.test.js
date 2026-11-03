"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Lease = require("./account-edit-lease.js");

function sharedStorage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function channelHub() {
  const listeners = new Set();
  return () => ({
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    postMessage(data) { listeners.forEach(listener => listener({ data })); },
    close() {}
  });
}

test("同一账号只有第一个标签页取得编辑权", () => {
  const storage = sharedStorage();
  const channel = channelHub();
  const a = Lease.createLease({ storage, tabId: "tab-a", token: () => "token-a", channel: channel(), now: () => 100 });
  const b = Lease.createLease({ storage, tabId: "tab-b", token: () => "token-b", channel: channel(), now: () => 100 });
  assert.equal(a.claim("account-1"), true);
  assert.equal(b.claim("account-1"), false);
  assert.equal(a.canWrite("account-1"), true);
  assert.equal(b.canWrite("account-1"), false);
});

test("接管编辑权后旧标签页在下一次写入检查时立即失效", () => {
  const storage = sharedStorage();
  const channel = channelHub();
  const a = Lease.createLease({ storage, tabId: "tab-a", token: () => "token-a", channel: channel(), now: () => 100 });
  const b = Lease.createLease({ storage, tabId: "tab-b", token: () => "token-b", channel: channel(), now: () => 100 });
  a.claim("account-1");
  assert.equal(b.takeOver("account-1"), true);
  assert.equal(a.canWrite("account-1"), false);
  assert.equal(b.canWrite("account-1"), true);
});

test("过期租约可以由新标签页取得", () => {
  const storage = sharedStorage();
  let clock = 100;
  const a = Lease.createLease({ storage, tabId: "tab-a", token: () => "token-a", now: () => clock, ttl: 50 });
  const b = Lease.createLease({ storage, tabId: "tab-b", token: () => "token-b", now: () => clock, ttl: 50 });
  a.claim("account-1");
  clock = 151;
  assert.equal(b.claim("account-1"), true);
  assert.equal(a.canWrite("account-1"), false);
});

test("释放租约不会删除已经被其他标签页接管的租约", () => {
  const storage = sharedStorage();
  const a = Lease.createLease({ storage, tabId: "tab-a", token: () => "token-a", now: () => 100 });
  const b = Lease.createLease({ storage, tabId: "tab-b", token: () => "token-b", now: () => 100 });
  a.claim("account-1");
  b.takeOver("account-1");
  a.release("account-1");
  assert.equal(b.canWrite("account-1"), true);
});

test("休眠后仅原 token 的过期租约可以恢复续期", () => {
  const storage=sharedStorage();let clock=100;
  const lease=Lease.createLease({storage,tabId:'a',token:()=> 'original',now:()=>clock,ttl:50});
  lease.claim('account-1');clock=1000;
  assert.equal(lease.canWrite('account-1'),false);
  lease.renewAll();
  assert.equal(lease.canWrite('account-1'),true);
  assert.equal(JSON.parse(storage.getItem(Lease.LEASE_PREFIX+'account-1')).token,'original');
});

test("写入前恢复自身过期编辑权，不接管其他标签页或替换 token", () => {
  const storage=sharedStorage();let clock=100;
  const a=Lease.createLease({storage,tabId:'a',token:()=> 'one',now:()=>clock,ttl:50});
  const b=Lease.createLease({storage,tabId:'b',token:()=> 'two',now:()=>clock,ttl:50});
  a.claim('account-1');clock=200;
  assert.equal(a.ensureWritable('account-1'),true);
  b.takeOver('account-1');const other=storage.getItem(Lease.LEASE_PREFIX+'account-1');
  assert.equal(a.ensureWritable('account-1'),false);
  clock=1000;a.renewAll();
  assert.equal(a.ensureWritable('account-1'),false);
  assert.equal(storage.getItem(Lease.LEASE_PREFIX+'account-1'),other);
});

test('BFCache 仅恢复本页释放且未被替换的租约',()=>{
  const storage=sharedStorage();let clock=100;
  const a=Lease.createLease({storage,tabId:'a',token:()=> 'a',now:()=>clock,ttl:50});
  const b=Lease.createLease({storage,tabId:'b',token:()=> 'b',now:()=>clock,ttl:50});
  a.claim('one');a.suspendAll();assert.equal(storage.getItem(Lease.LEASE_PREFIX+'one'),null);
  a.resumeAll(()=>true);assert.equal(a.canWrite('one'),true);
  a.suspendAll();b.claim('one');clock=1000;
  const foreign=storage.getItem(Lease.LEASE_PREFIX+'one');a.resumeAll(()=>true);
  assert.equal(a.canWrite('one'),false);assert.equal(storage.getItem(Lease.LEASE_PREFIX+'one'),foreign);
  a.suspendAll();a.resumeAll(()=>true);
  assert.equal(a.canWrite('one'),false,'a page that was already read-only cannot acquire editing on restore');
});

test('账号上下文不再匹配时 BFCache 不恢复编辑权',()=>{
  const storage=sharedStorage(),a=Lease.createLease({storage,tabId:'a',token:()=> 'a',now:()=>100});
  a.claim('old');a.suspendAll();a.resumeAll(()=>false);
  assert.equal(a.canWrite('old'),false);assert.equal(storage.getItem(Lease.LEASE_PREFIX+'old'),null);
});
