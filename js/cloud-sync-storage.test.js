const { test } = require("node:test");
const assert = require("node:assert/strict");
const storageApi = require("./cloud-sync-storage.js");

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createSessionStorage() {
  const values = new Map();
  return {
    getItem: function (key) { return values.has(key) ? values.get(key) : null; },
    setItem: function (key, value) { values.set(key, String(value)); },
    removeItem: function (key) { values.delete(key); },
    dump: function () { return Object.fromEntries(values); }
  };
}

function createFakeIndexedDb() {
  const databases = new Map();
  const connections = [];
  let abortNextTransaction = false;
  let failNextRead = false;
  let failNextTransactionCreation = false;

  function later(callback) { queueMicrotask(callback); }

  function requestResult(request, result, transaction) {
    transaction.enqueue(function () {
      if (transaction.aborted) return;
      request.result = clone(typeof result === 'function' ? result() : result);
      if (request.onsuccess) request.onsuccess({ target: request });
    });
    return request;
  }

  function FakeTransaction(database, storeName) {
    this.database = database;
    this.storeName = storeName;
    this.writes = [];
    this.finished = false;
    this.aborted = false;
    this.error = null;
    this.requests = [];
    this.scheduled = false;
    (database.transactions ||= []).push(this);
  }

  FakeTransaction.prototype.enqueue = function (callback) {
    this.requests.push(callback);
    this.pump();
  };
  FakeTransaction.prototype.pump = function () {
    const tx = this;
    if (tx.database.transactions[0] !== tx || tx.scheduled || tx.finished) return;
    tx.scheduled = true;
    later(() => {
      tx.scheduled = false;
      if (tx.aborted) return;
      const request = tx.requests.shift();
      if (request) { request(); tx.pump(); }
      else tx.finish();
    });
  };
  FakeTransaction.prototype.release = function () {
    this.database.transactions.shift();
    this.database.transactions[0]?.pump();
  };
  FakeTransaction.prototype.abort = function () {
    this.aborted = this.finished = true;
    later(() => { this.onabort?.({ target: this }); this.release(); });
  };

  FakeTransaction.prototype.objectStore = function (name) {
    const transaction = this;
    if (name !== transaction.storeName) throw new Error("unknown store");
    return {
      get: function (key) {
        const request = {};
        if (failNextRead) {
          failNextRead = false;
          transaction.enqueue(function () {
            request.error = new Error("read failed");
            if (request.onerror) request.onerror({ target: request });
          });
          return request;
        }
        return requestResult(request, () => transaction.database.stores.get(name).get(key), transaction);
      },
      put: function (value, key) {
        transaction.writes.push({ type: "put", key: key, value: clone(value) });
        return requestResult({}, key, transaction);
      },
      delete: function (key) {
        transaction.writes.push({ type: "delete", key: key });
        return requestResult({}, undefined, transaction);
      }
    };
  };

  FakeTransaction.prototype.finish = function () {
    const transaction = this;
    if (transaction.finished) return;
    transaction.finished = true;
    later(function () {
      if (abortNextTransaction) {
        abortNextTransaction = false;
        transaction.aborted = true;
        transaction.error = new Error("transaction aborted");
        if (transaction.onabort) transaction.onabort({ target: transaction });
        transaction.release();
        return;
      }
      const store = transaction.database.stores.get(transaction.storeName);
      transaction.writes.forEach(function (write) {
        if (write.type === "put") store.set(write.key, clone(write.value));
        else store.delete(write.key);
      });
      if (transaction.oncomplete) transaction.oncomplete({ target: transaction });
      transaction.release();
    });
  };

  function FakeDatabase(database) {
    this.database = database;
    this.closed = false;
    this.objectStoreNames = {
      contains: function (name) { return database.stores.has(name); }
    };
    connections.push(this);
  }

  FakeDatabase.prototype.createObjectStore = function (name) {
    if (this.database.stores.has(name)) throw new Error("store exists");
    this.database.stores.set(name, new Map());
    return {};
  };

  FakeDatabase.prototype.transaction = function (name) {
    if (failNextTransactionCreation) {
      failNextTransactionCreation = false;
      throw new Error("transaction creation failed");
    }
    if (!this.database.stores.has(name)) throw new Error("unknown store");
    return new FakeTransaction(this.database, name);
  };

  FakeDatabase.prototype.close = function () {
    this.closed = true;
  };

  return {
    open: function (name, version) {
      const request = {};
      later(function () {
        let database = databases.get(name);
        const oldVersion = database ? database.version : 0;
        if (!database) {
          database = { version: 0, stores: new Map() };
          databases.set(name, database);
        }
        const result = new FakeDatabase(database);
        request.result = result;
        if (version > oldVersion && request.onupgradeneeded) {
          request.onupgradeneeded({ oldVersion: oldVersion, newVersion: version, target: request });
          database.version = version;
        }
        if (request.onsuccess) request.onsuccess({ target: request });
      });
      return request;
    },
    abortNextTransaction: function () { abortNextTransaction = true; },
    failNextRead: function () { failNextRead = true; },
    failNextTransactionCreation: function () { failNextTransactionCreation = true; },
    dump: function () {
      const database = databases.get("qinshi-cloud-sync");
      if (!database) return {};
      return Object.fromEntries(Array.from(database.stores.entries()).map(function (entry) {
        return [entry[0], Object.fromEntries(entry[1])];
      }));
    },
    hasStore: function (name) {
      const database = databases.get("qinshi-cloud-sync");
      return Boolean(database && database.stores.has(name));
    },
    version: function () {
      const database = databases.get("qinshi-cloud-sync");
      return database ? database.version : 0;
    },
    openCount: function () { return connections.length; },
    closeCount: function () { return connections.filter(function (connection) { return connection.closed; }).length; },
    triggerVersionChange: function () {
      connections.forEach(function (connection) {
        if (connection.onversionchange) connection.onversionchange({ target: connection });
      });
    }
  };
}

function createStore(adapter, sessionStorage) {
  return storageApi.createStorage({ indexedDB: adapter, sessionStorage: sessionStorage });
}

test("creates the version-one state store during an IndexedDB upgrade", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());

  await store.openStore();

  assert.equal(adapter.version(), 1);
  assert.equal(adapter.hasStore("state"), true);
});

test("rejects non-primitive and extra pairing fields before they can be persisted", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());

  await assert.rejects(
    store.savePairing({
      spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m",
      deviceName: { password: "nested-secret" }
    }),
    /配对/
  );
  await assert.rejects(
    store.savePairing({
      spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m", password: "secret"
    }),
    /配对/
  );
  assert.deepEqual(adapter.dump(), {});
});

test("persists paired credentials and rollback copies across a fresh storage instance", async () => {
  const adapter = createFakeIndexedDb();
  const first = createStore(adapter, createSessionStorage());
  await first.savePairing({ spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m" });
  await first.saveRollbackCopy({ qinshi_progress: "before-pull" });

  const refreshed = createStore(adapter, createSessionStorage());

  assert.deepEqual(await refreshed.loadPairing(), {
    spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m"
  });
  assert.deepEqual(await refreshed.loadRollbackCopy(), { qinshi_progress: "before-pull" });
});

test("stores a pending operation with exactly its type and immutable snapshot id", async () => {
  const sessionStorage = createSessionStorage();
  const store = createStore(createFakeIndexedDb(), sessionStorage);
  const operation = { type: "pull", snapshotId: "snap-1" };

  const saving = store.savePendingOperation(operation);
  operation.snapshotId = "changed-after-save";
  await saving;

  assert.deepEqual(await store.loadPendingOperation(), { type: "pull", snapshotId: "snap-1" });
  assert.deepEqual(JSON.parse(sessionStorage.getItem("qin-cloud-sync-pending")), {
    type: "pull", snapshotId: "snap-1"
  });
});

test("rejects pending operations containing decrypted data or extra fields", async () => {
  const sessionStorage = createSessionStorage();
  const store = createStore(createFakeIndexedDb(), sessionStorage);

  await assert.rejects(
    store.savePendingOperation({ type: "pull", snapshotId: "snap-1", decryptedData: { qinshi_x: "x" } }),
    /续传/
  );
  assert.equal(sessionStorage.getItem("qin-cloud-sync-pending"), null);
});

test("rejects a write when its IndexedDB transaction aborts", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());
  adapter.abortNextTransaction();

  await assert.rejects(store.saveRollbackCopy({ qinshi_progress: "before-pull" }), /aborted/);
  assert.equal(await store.loadRollbackCopy(), null);
});

test("snapshots a rollback copy before asynchronous IndexedDB opening", async () => {
  const store = createStore(createFakeIndexedDb(), createSessionStorage());
  const copy = { qinshi_progress: { stage: "before-pull" } };

  const saving = store.saveRollbackCopy(copy);
  copy.qinshi_progress.stage = "changed-after-save";
  await saving;

  assert.deepEqual(await store.loadRollbackCopy(), { qinshi_progress: { stage: "before-pull" } });
});

test("rejects rollback copies that cannot be safely structured-cloned", async () => {
  const store = createStore(createFakeIndexedDb(), createSessionStorage());

  await assert.rejects(store.saveRollbackCopy({ qinshi_progress: function () {} }), /回滚/);
  const circular = {};
  circular.self = circular;
  await assert.rejects(store.saveRollbackCopy(circular), /回滚/);
  const arrayWithSymbol = ["kept"];
  arrayWithSymbol[Symbol("hidden")] = "would-be-lost";
  await assert.rejects(store.saveRollbackCopy(arrayWithSymbol), /回滚/);
  const objectWithHiddenValue = { qinshi_progress: "kept" };
  Object.defineProperty(objectWithHiddenValue, "hidden", { value: "would-be-lost" });
  await assert.rejects(store.saveRollbackCopy(objectWithHiddenValue), /回滚/);
});

test("rejects a read when IndexedDB reports a request error", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());
  adapter.failNextRead();

  await assert.rejects(store.loadPairing(), /read failed/);
});

test("forgetting a device preserves rollback, local progress, and unrelated session state", async () => {
  const adapter = createFakeIndexedDb();
  const sessionStorage = createSessionStorage();
  const localStorage = createSessionStorage();
  const store = createStore(adapter, sessionStorage);
  localStorage.setItem("qinshi_progress", "kept");
  sessionStorage.setItem("unrelated", "kept");
  await store.savePairing({ spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m" });
  await store.savePendingOperation({ type: "push", snapshotId: "snap-1" });
  await store.saveRollbackCopy({ qinshi_progress: "before-push" });

  await store.forgetPairing();

  assert.equal(await store.loadPairing(), null);
  assert.equal(await store.loadPendingOperation(), null);
  assert.deepEqual(await store.loadRollbackCopy(), { qinshi_progress: "before-push" });
  assert.equal(localStorage.getItem("qinshi_progress"), "kept");
  assert.equal(sessionStorage.getItem("unrelated"), "kept");
});

test("removes a rollback copy only when explicitly cleared", async () => {
  const store = createStore(createFakeIndexedDb(), createSessionStorage());
  await store.saveRollbackCopy({ qinshi_progress: "before-apply" });

  await store.clearPendingOperation();
  assert.deepEqual(await store.loadRollbackCopy(), { qinshi_progress: "before-apply" });
  await store.clearRollbackCopy();

  assert.equal(await store.loadRollbackCopy(), null);
});

test("internal operations close their own IndexedDB connections on every settlement path", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());

  await store.savePairing({ spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m" });
  adapter.abortNextTransaction();
  await assert.rejects(store.saveRollbackCopy({ qinshi_progress: "abort" }), /aborted/);
  adapter.failNextRead();
  await assert.rejects(store.loadPairing(), /read failed/);
  adapter.failNextTransactionCreation();
  await assert.rejects(store.loadRollbackCopy(), /transaction creation failed/);

  assert.equal(adapter.closeCount(), adapter.openCount());
});

test("a version change closes an openStore connection without closing it eagerly", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());
  const database = await store.openStore();

  assert.equal(adapter.closeCount(), 0);
  adapter.triggerVersionChange();

  assert.equal(database.closed, true);
  assert.equal(adapter.closeCount(), 1);
});

const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('rollback claim atomically admits one owner across two storage connections', async () => {
  const adapter = createFakeIndexedDb();
  const a = createStore(adapter, createSessionStorage());
  const b = createStore(adapter, createSessionStorage());
  const results = await Promise.allSettled([
    a.claimRollbackCopy({ ownerId: ownerA, data: { qinshi_progress: 'A' } }),
    b.claimRollbackCopy({ ownerId: ownerB, data: { qinshi_progress: 'B' } })
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.code, 'ROLLBACK_CONFLICT');
  assert.deepEqual(await b.loadRollbackCopy(), { ownerId: ownerA, data: { qinshi_progress: 'A' } });
  assert.equal(adapter.closeCount(), adapter.openCount());
});

test('rollback owner clear prevents non-owner and stale-owner deletion including legacy writes', async () => {
  const adapter = createFakeIndexedDb();
  const a = createStore(adapter, createSessionStorage());
  const b = createStore(adapter, createSessionStorage());
  await a.claimRollbackCopy({ ownerId: ownerA, data: { qinshi_progress: 'A' } });
  for (const owner of [undefined, ownerB]) await assert.rejects(b.clearRollbackCopy(owner), error => error.code === 'ROLLBACK_CONFLICT');
  await assert.rejects(b.saveRollbackCopy({ qinshi_progress: 'legacy bypass' }), error => error.code === 'ROLLBACK_CONFLICT');
  await a.clearRollbackCopy(ownerA);
  await b.claimRollbackCopy({ ownerId: ownerB, data: { qinshi_progress: 'B' } });
  await assert.rejects(a.clearRollbackCopy(ownerA), error => error.code === 'ROLLBACK_CONFLICT');
  assert.equal((await a.loadRollbackCopy()).ownerId, ownerB);
  await b.clearRollbackCopy(ownerB);
  assert.equal(await a.loadRollbackCopy(), null);
  await assert.rejects(a.clearRollbackCopy(ownerA), error => error.code === 'ROLLBACK_CONFLICT');
  assert.equal(adapter.closeCount(), adapter.openCount());
});

test('rollback claim snapshots inputs, fails closed on transaction/read errors and preserves legacy recovery', async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());
  const copy = { ownerId: ownerA, data: { qinshi_progress: 'original' } };
  const claim = store.claimRollbackCopy(copy);
  copy.data.qinshi_progress = 'mutated';
  await claim;
  assert.equal((await store.loadRollbackCopy()).data.qinshi_progress, 'original');
  await store.clearRollbackCopy(ownerA);
  adapter.abortNextTransaction();
  await assert.rejects(store.claimRollbackCopy(copy), /aborted/);
  assert.equal(await store.loadRollbackCopy(), null);
  adapter.failNextRead();
  await assert.rejects(store.claimRollbackCopy(copy), /read failed/);
  assert.equal(await store.loadRollbackCopy(), null);
  await assert.rejects(store.claimRollbackCopy({ data: {} }), /owner|回滚/);
  await store.saveRollbackCopy({ qinshi_progress: 'legacy' });
  await store.clearRollbackCopy();
  assert.equal(await store.loadRollbackCopy(), null);
  assert.equal(adapter.closeCount(), adapter.openCount());
});

test('legacy scalar rollback values remain explicitly clearable without an owner', async () => {
  const store = createStore(createFakeIndexedDb(), createSessionStorage());
  for (const value of [null, false, 0, 'legacy']) {
    await store.saveRollbackCopy(value);
    await store.clearRollbackCopy();
    assert.equal(await store.loadRollbackCopy(), null);
  }
});
