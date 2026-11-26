const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const STORE = require("../js/formation-progress-store.js");
const CORE = require("../js/formations.js");

const KEY = "qinshi_formation_progress_v1";
const formation = {
  id: "f1", name: "测试合阵", candidates: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }],
};
const formations = [formation, { id: "f2", candidates: [{ id: "c", name: "丙" }] }];
const member = { owned: true, level: 1, attack: 10, health: 100, defense: 0, usesReference: false };

// Only the physical persistence boundary is replaced; normalization is the real core.
function fixture(raw = null) {
  let active = "account-a";
  let contextCurrent = true;
  let readFailure = null;
  let writeResult = true;
  let readHook = null;
  const data = new Map([["account-a", raw], ["account-b", '{"otherAccount":true}']]);
  const writes = [];
  const accounts = {
    currentAccount() { return active ? { id: active } : null; },
    isCurrentContext() { return contextCurrent; },
    getItem(key) {
      assert.equal(key, KEY);
      if (readFailure) throw readFailure;
      if (readHook) readHook();
      return data.get(active) ?? null;
    },
    setItem(key, value) {
      assert.equal(key, KEY);
      if (writeResult instanceof Error) throw writeResult;
      if (writeResult !== true) return writeResult;
      writes.push({ account: active, key, value });
      data.set(active, value);
      return true;
    },
  };
  return {
    store: STORE.create(accounts, formations, CORE), data, writes,
    switchAccount(id) { active = id; },
    staleContext() { contextCurrent = false; },
    failRead(error) { readFailure = error; },
    writeReturns(result) { writeResult = result; },
    onRead(hook) { readHook = hook; },
  };
}

function draft(members = { a: { ...member } }, mainId = null) {
  return { mainId, members };
}

test("reads missing, empty and valid archives without writing or stripping fields", () => {
  for (const [raw, status, expected] of [
    [null, "missing", {}],
    ["{}", "empty", {}],
    ['{"f1":{"mainId":null,"members":{}},"version":{"future":2}}', "valid", {
      f1: { mainId: null, members: {} }, version: { future: 2 },
    }],
  ]) {
    const f = fixture(raw);
    assert.deepEqual(f.store.read(), { status, stored: expected, error: "" });
    assert.equal(f.writes.length, 0);
  }
});

test("corrupt JSON and incompatible known structures remain untouched and block saves", () => {
  for (const raw of ["", "{bad", "null", "[]", '"value"',
    '{"f1":null}', '{"f1":[]}', '{"f1":{}}', '{"f1":{"members":[]}}',
    '{"f1":{"members":{"a":null}}}', '{"f1":{"members":{"a":{"owned":"true"}}}}',
    '{"f1":{"mainId":3,"members":{}}}',
    '{"f1":{"members":{"a":{"owned":true,"attack":-1}}}}',
  ]) {
    const f = fixture(raw);
    const read = f.store.read();
    assert.equal(read.status, "invalid", raw);
    assert.equal(read.stored, null);
    assert.ok(read.error);
    assert.equal(f.store.save("f1", draft()).ok, false);
    assert.equal(f.data.get("account-a"), raw);
    assert.equal(f.writes.length, 0);
  }
});

test("unrepresentable unknown JSON numbers block saving without changing the original bytes", () => {
  for (const raw of [
    '{"future":{"id":9007199254740993}}',
    '{"future":{"id":9007199254740992}}',
    '{"future":{"values":[1,1e400]}}',
    '{"future":{"precise":0.12345678901234567890123456789}}',
    '{"future":{"underflow":1e-400}}',
    '{"future":{"signedZero":-0}}',
    '{"f1":{"members":{"futureCandidate":{"futureStat":9007199254740993}}}}',
  ]) {
    const f = fixture(raw);
    const result = f.store.read();
    assert.equal(result.status, "invalid", raw);
    assert.equal(result.stored, null);
    assert.ok(result.error);
    assert.equal(f.store.save("f1", draft()).ok, false);
    assert.equal(f.data.get("account-a"), raw);
    assert.equal(f.writes.length, 0);
  }
});

test("safe unknown decimal numbers and number-like strings remain compatible", () => {
  const raw = '{"future":{"ratio":1.25,"small":0.00001,"trailing":1.500,"exponent":2.5e+2,"text":"9007199254740993 1e400 \\\"quote\\\"","max":9007199254740991}}';
  const f = fixture(raw);
  assert.equal(f.store.read().status, "valid");
  assert.equal(f.store.save("f1", draft()).ok, true);
  const saved = JSON.parse(f.data.get("account-a"));
  assert.deepEqual(saved.future, {
    ratio: 1.25, small: 0.00001, trailing: 1.5, exponent: 250,
    text: '9007199254740993 1e400 "quote"', max: 9007199254740991,
  });
});

test("read errors and absent accounts are not treated as empty archives", () => {
  const f = fixture();
  f.failRead(new Error("private storage detail"));
  const result = f.store.read();
  assert.equal(result.status, "read-error");
  assert.equal(result.stored, null);
  assert.ok(result.error);
  assert.equal(result.error.includes("private storage detail"), false);
  assert.equal(f.store.save("f1", draft()).ok, false);
  const absent = fixture();
  absent.switchAccount(null);
  assert.equal(absent.store.read().status, "read-error");
  assert.equal(absent.store.save("f1", draft()).ok, false);
  assert.equal(absent.writes.length, 0);
});

test("save merges known member fields and preserves unknown data and other formations", () => {
  const original = {
    futureVersion: { unchanged: [1, "two"] },
    f1: { mainId: "a", extension: { flag: true }, members: {
      a: { ...member, tattoo: { rarity: "future" } },
      b: { ...member, keepOnlyWhileOwned: true },
      futureCandidate: { owned: true, futureStat: 80 },
    } },
    f2: { mainId: "c", members: { c: { ...member, extra: 2 } }, extra: "stay" },
  };
  const f = fixture(JSON.stringify(original));
  const before = f.store.read();
  const input = draft({ a: { ...member, attack: 42 } }, "a");
  const result = f.store.save("f1", input);
  assert.equal(result.ok, true);
  assert.equal(result.error, "");
  assert.deepEqual(JSON.parse(f.data.get("account-a")), {
    futureVersion: { unchanged: [1, "two"] },
    f1: { mainId: "a", extension: { flag: true }, members: {
      a: { ...member, attack: 42, tattoo: { rarity: "future" } },
      futureCandidate: { owned: true, futureStat: 80 },
    } },
    f2: { mainId: "c", members: { c: { ...member, extra: 2 } }, extra: "stay" },
  });
  assert.deepEqual(before.stored, original);
  assert.equal(input.members.a.attack, 42);
  assert.equal(f.data.get("account-b"), '{"otherAccount":true}');
});

test("explicit owned:false removes a known member without removing unknown candidates", () => {
  const f = fixture(JSON.stringify({ f1: { mainId: "a", members: {
    a: { ...member }, futureCandidate: { opaque: "keep" },
  } } }));
  f.store.read();
  assert.equal(f.store.save("f1", draft({ a: { owned: false } })).ok, true);
  assert.deepEqual(JSON.parse(f.data.get("account-a")), {
    f1: { mainId: null, members: { futureCandidate: { opaque: "keep" } } },
  });
});

test("a deliberately emptied formation clears only its known progress", () => {
  const f = fixture(JSON.stringify({ f1: { mainId: "a", members: { a: member } }, future: 7 }));
  f.store.read();
  assert.equal(f.store.save("f1", draft({})).ok, true);
  assert.deepEqual(JSON.parse(f.data.get("account-a")), { future: 7 });
});

test("false, undefined and thrown writes never commit the proposed archive", () => {
  for (const failure of [false, undefined, new Error("quota detail")]) {
    const raw = JSON.stringify({ f1: draft({ a: member }) });
    const f = fixture(raw);
    const before = f.store.read();
    f.writeReturns(failure);
    const result = f.store.save("f1", draft({ a: { ...member, attack: 99 } }));
    assert.equal(result.ok, false);
    assert.deepEqual(result.stored, before.stored);
    assert.ok(result.error);
    assert.equal(result.error.includes("quota detail"), false);
    assert.equal(f.data.get("account-a"), raw);
    assert.equal(f.writes.length, 0);
    f.writeReturns(true);
    assert.equal(f.store.save("f1", draft()).ok, true);
  }
});

test("stale raw revisions reject overwriting changes from another view", () => {
  const f = fixture("{}");
  f.store.read();
  const external = '{"external":true}';
  f.data.set("account-a", external);
  const result = f.store.save("f1", draft());
  assert.equal(result.ok, false);
  assert.deepEqual(result.stored, {});
  assert.equal(f.data.get("account-a"), external);
  assert.equal(f.writes.length, 0);
});

test("failure to reread the revision leaves the saved snapshot and physical archive intact", () => {
  const raw = JSON.stringify({ f1: draft({ a: member }) });
  const f = fixture(raw);
  const previous = f.store.read();
  f.failRead(new Error("access denied"));
  const result = f.store.save("f1", draft({ a: { ...member, attack: 22 } }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.stored, previous.stored);
  assert.equal(f.data.get("account-a"), raw);
  assert.equal(f.writes.length, 0);
});

test("invalid fields in another known formation block writes to the selected formation", () => {
  const raw = '{"f1":{"members":{}},"f2":{"members":[]}}';
  const f = fixture(raw);
  assert.equal(f.store.read().status, "invalid");
  assert.equal(f.store.save("f1", draft()).ok, false);
  assert.equal(f.data.get("account-a"), raw);
});

test("unknown JSON property names survive without mutating object prototypes", () => {
  const raw = '{"__proto__":{"safe":true},"f1":{"members":{"a":{"owned":true,"level":1,"attack":10,"health":100,"defense":0,"usesReference":false,"__proto__":{"extension":2}}}}}';
  const f = fixture(raw);
  f.store.read();
  assert.equal(f.store.save("f1", draft()).ok, true);
  const stored = JSON.parse(f.data.get("account-a"));
  assert.equal(Object.prototype.hasOwnProperty.call(stored, "__proto__"), true);
  assert.deepEqual(stored.__proto__, { safe: true });
  assert.deepEqual(stored.f1.members.a.__proto__, { extension: 2 });
  assert.equal({}.safe, undefined);
  assert.equal({}.extension, undefined);
});

test("account changes and stale account contexts reject cross-account writes", () => {
  for (const invalidate of [f => f.switchAccount("account-b"), f => f.staleContext()]) {
    const f = fixture("{}");
    f.store.read();
    invalidate(f);
    assert.equal(f.store.isCurrent(), false);
    assert.equal(f.store.save("f1", draft()).ok, false);
    assert.equal(f.writes.length, 0);
    assert.equal(f.data.get("account-a"), "{}");
    assert.equal(f.data.get("account-b"), '{"otherAccount":true}');
  }
});

test("account changes during the revision read reject writing the newly active account", () => {
  const f = fixture("{}");
  f.store.read();
  f.data.set("account-b", "{}");
  f.onRead(() => f.switchAccount("account-b"));
  assert.equal(f.store.save("f1", draft()).ok, false);
  assert.equal(f.writes.length, 0);
});

test("save requires a successful read and rejects unsupported formations and malformed drafts", () => {
  const f = fixture("{}");
  assert.equal(f.store.save("f1", draft()).ok, false);
  f.store.read();
  for (const [id, value] of [
    ["missing", draft()], ["f1", null], ["f1", { members: [] }],
    ["f1", draft({ a: { ...member, attack: "invalid" } })],
    ["f1", draft({ a: { ...member, level: 0 } })],
    ["f1", draft({ a: { ...member } }, "b")],
  ]) {
    assert.equal(f.store.save(id, value).ok, false);
  }
  assert.equal(f.writes.length, 0);
});

test("incomplete owned members preserve missing/null values instead of inventing zeroes", () => {
  const f = fixture();
  f.store.read();
  const result = f.store.save("f1", draft({ a: { ...member, attack: null } }, "a"));
  assert.equal(result.ok, true);
  assert.equal(result.stored.f1.members.a.attack, null);
  assert.equal(result.stored.f1.members.a.defense, 0);
  assert.equal(result.stored.f1.mainId, "a");
});

test("returned archive objects cannot mutate the private committed baseline", () => {
  const f = fixture(JSON.stringify({ f1: draft({ a: member }) }));
  const read = f.store.read();
  read.stored.f1.members.a.attack = 999;
  f.writeReturns(false);
  const failure = f.store.save("f1", draft());
  assert.equal(failure.stored.f1.members.a.attack, 10);
  failure.stored.f1.members.a.attack = 888;
  f.writeReturns(true);
  const saved = f.store.save("f1", draft());
  saved.stored.f1.members.a.attack = 777;
  f.writeReturns(false);
  assert.equal(f.store.save("f1", draft()).stored.f1.members.a.attack, 10);
});

test("repeated successful saves advance the private raw revision", () => {
  const f = fixture();
  f.store.read();
  assert.equal(f.store.save("f1", draft()).ok, true);
  assert.equal(f.store.save("f1", draft({ a: { ...member, attack: 20 } })).ok, true);
  assert.equal(JSON.parse(f.data.get("account-a")).f1.members.a.attack, 20);
  assert.equal(f.writes.length, 2);
});

test("browser UMD exposes the same pure store without accessing browser storage", () => {
  const window = {};
  Object.defineProperty(window, "localStorage", {
    get() { throw new Error("direct browser storage access is forbidden"); },
  });
  const context = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/formation-progress-store.js"), "utf8"), context);
  assert.equal(typeof window.FORMATION_PROGRESS_STORE.create, "function");
  const api = window.FORMATION_PROGRESS_STORE;
  const accounts = {
    currentAccount() { return { id: "browser-account" }; },
    isCurrentContext() { return true; },
    getItem() { return null; },
    setItem() { throw new Error("unexpected write"); },
  };
  const result = api.create(accounts, formations, CORE).read();
  assert.equal(result.status, "missing");
});
