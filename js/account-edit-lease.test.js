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
