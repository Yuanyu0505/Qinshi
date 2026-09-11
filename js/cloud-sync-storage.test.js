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
  let abortNextTransaction = false;
  let failNextRead = false;

  function later(callback) { queueMicrotask(callback); }

  function requestResult(request, result, transaction) {
    later(function () {
      if (transaction.aborted) return;
      request.result = clone(result);
      if (request.onsuccess) request.onsuccess({ target: request });
      transaction.finish();
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
  }

  FakeTransaction.prototype.objectStore = function (name) {
    const transaction = this;
    if (name !== transaction.storeName) throw new Error("unknown store");
    return {
      get: function (key) {
        const request = {};
        if (failNextRead) {
          failNextRead = false;
          later(function () {
            request.error = new Error("read failed");
            if (request.onerror) request.onerror({ target: request });
            transaction.finish();
          });
          return request;
        }
        return requestResult(request, transaction.database.stores.get(name).get(key), transaction);
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
        return;
      }
      const store = transaction.database.stores.get(transaction.storeName);
      transaction.writes.forEach(function (write) {
        if (write.type === "put") store.set(write.key, clone(write.value));
        else store.delete(write.key);
      });
      if (transaction.oncomplete) transaction.oncomplete({ target: transaction });
    });
  };

  function FakeDatabase(database) {
    this.database = database;
    this.objectStoreNames = {
      contains: function (name) { return database.stores.has(name); }
    };
  }

  FakeDatabase.prototype.createObjectStore = function (name) {
    if (this.database.stores.has(name)) throw new Error("store exists");
    this.database.stores.set(name, new Map());
    return {};
  };

  FakeDatabase.prototype.transaction = function (name) {
    if (!this.database.stores.has(name)) throw new Error("unknown store");
    return new FakeTransaction(this.database, name);
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

test("stores paired credentials but strips passwords and recovery keys", async () => {
  const adapter = createFakeIndexedDb();
  const store = createStore(adapter, createSessionStorage());

  await store.savePairing({
    spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m",
    password: "never-store", recoveryKey: "never-store"
  });

  assert.deepEqual(await store.loadPairing(), {
    spaceId: "s", deviceId: "d", deviceToken: "t", masterKey: "m"
  });
  assert.equal(JSON.stringify(adapter.dump()).includes("password"), false);
  assert.equal(JSON.stringify(adapter.dump()).includes("recoveryKey"), false);
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
