/**
 * 云同步本地状态：仅持久化已配对凭据与显式回滚副本。
 * 浏览器暴露 window.QinshiCloudSyncStorage；Node 测试可经 createStorage 注入存储适配器。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.QinshiCloudSyncStorage = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var DB_NAME = "qinshi-cloud-sync";
  var STORE_NAME = "state";
  var DB_VERSION = 1;
  var PAIRING_KEY = "pairing";
  var ROLLBACK_COPY_KEY = "rollback-copy";
  var PENDING_OPERATION_KEY = "qin-cloud-sync-pending";
  var PAIRING_FIELDS = ["spaceId", "deviceId", "deviceToken", "masterKey", "deviceName", "pairedAt"];

  function errorFrom(source, fallback) {
    return source && source.error ? source.error : new Error(fallback);
  }

  function closeDatabase(database) {
    if (database && typeof database.close === "function") database.close();
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function sanitizePairing(pairing) {
    if (!isPlainObject(pairing)) throw new Error("配对凭据不正确。");
    if (!Object.keys(pairing).every(function (field) { return PAIRING_FIELDS.indexOf(field) !== -1; })) {
      throw new Error("配对凭据不正确。");
    }
    var saved = {};
    PAIRING_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(pairing, field)) saved[field] = pairing[field];
    });
    if (typeof saved.spaceId !== "string" || !saved.spaceId ||
      typeof saved.deviceId !== "string" || !saved.deviceId ||
      typeof saved.deviceToken !== "string" || !saved.deviceToken ||
      typeof saved.masterKey !== "string" || !saved.masterKey) {
      throw new Error("配对凭据不正确。");
    }
    if ((Object.prototype.hasOwnProperty.call(saved, "deviceName") && typeof saved.deviceName !== "string") ||
      (Object.prototype.hasOwnProperty.call(saved, "pairedAt") && typeof saved.pairedAt !== "string")) {
      throw new Error("配对凭据不正确。");
    }
    return saved;
  }

  function validatePendingOperation(operation) {
    if (!isPlainObject(operation) ||
      Object.keys(operation).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(operation, "type") ||
      !Object.prototype.hasOwnProperty.call(operation, "snapshotId") ||
      typeof operation.type !== "string" || !operation.type ||
      typeof operation.snapshotId !== "string" || !operation.snapshotId) {
      throw new Error("同步续传操作不正确。");
    }
    return { type: operation.type, snapshotId: operation.snapshotId };
  }

  function assertSafeRollbackValue(value, ancestors) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (Number.isFinite(value) && !Object.is(value, -0)) return;
      throw new Error("回滚副本不正确。");
    }
    if (!value || typeof value !== "object" || ancestors.indexOf(value) !== -1) {
      throw new Error("回滚副本不正确。");
    }
    var prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length ||
        Object.getOwnPropertyNames(value).length !== value.length + 1 ||
        Object.getOwnPropertySymbols(value).length !== 0) {
        throw new Error("回滚副本不正确。");
      }
      ancestors.push(value);
      for (var index = 0; index < value.length; index += 1) {
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, index);
        if (!arrayDescriptor || !Object.prototype.hasOwnProperty.call(arrayDescriptor, "value")) {
          throw new Error("回滚副本不正确。");
        }
        assertSafeRollbackValue(arrayDescriptor.value, ancestors);
      }
      ancestors.pop();
      return;
    }
    var keys = Object.keys(value);
    if ((prototype !== Object.prototype && prototype !== null) ||
      Object.getOwnPropertySymbols(value).length !== 0 || Object.getOwnPropertyNames(value).length !== keys.length) {
      throw new Error("回滚副本不正确。");
    }
    ancestors.push(value);
    keys.forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new Error("回滚副本不正确。");
      }
      assertSafeRollbackValue(descriptor.value, ancestors);
    });
    ancestors.pop();
  }

  function copyStrictJson(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(copyStrictJson);
    var copy = {};
    Object.keys(value).forEach(function (key) {
      Object.defineProperty(copy, key, {
        value: copyStrictJson(value[key]), enumerable: true, configurable: true, writable: true
      });
    });
    return copy;
  }

  function cloneRollbackCopy(copy) {
    try {
      assertSafeRollbackValue(copy, []);
      if (typeof root.structuredClone === "function") return root.structuredClone(copy);
      return copyStrictJson(copy);
    } catch (error) {
      throw new Error("回滚副本不正确。");
    }
  }

  function createStorage(dependencies) {
    var config = dependencies || {};
    var indexedDB = config.indexedDB || root.indexedDB;
    var sessionStorage = config.sessionStorage || root.sessionStorage;

    function openStore() {
      return new Promise(function (resolve, reject) {
        if (!indexedDB || typeof indexedDB.open !== "function") {
          reject(new Error("IndexedDB 不可用。"));
          return;
        }
        var request;
        try {
          request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          reject(error);
          return;
        }
        request.onupgradeneeded = function (event) {
          var database = event.target.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
        };
        request.onerror = function () { reject(errorFrom(request, "无法打开云同步本地存储。")); };
        request.onblocked = function () { reject(new Error("云同步本地存储被占用。")); };
        request.onsuccess = function () {
          var database = request.result;
          database.onversionchange = function () { closeDatabase(database); };
          resolve(database);
        };
      });
    }

    function transaction(mode, action) {
      return openStore().then(function (database) {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var tx;
          function settle(handler, value) {
            if (settled) return;
            settled = true;
            closeDatabase(database);
            handler(value);
          }
          try {
            tx = database.transaction(STORE_NAME, mode);
          } catch (error) {
            settle(reject, error);
            return;
          }
          tx.onabort = function () { settle(reject, errorFrom(tx, "IndexedDB transaction aborted.")); };
          tx.onerror = function () { settle(reject, errorFrom(tx, "IndexedDB transaction failed.")); };
          tx.oncomplete = function () { settle(resolve); };
          var request;
          try {
            request = action(tx.objectStore(STORE_NAME));
            request.onerror = function () { settle(reject, errorFrom(request, "IndexedDB request failed.")); };
          } catch (error) {
            if (tx && typeof tx.abort === "function") tx.abort();
            settle(reject, error);
          }
        });
      });
    }

    function readRecord(key) {
      return openStore().then(function (database) {
        return new Promise(function (resolve, reject) {
          var settled = false;
          var value;
          function settle(handler, result) {
            if (settled) return;
            settled = true;
            closeDatabase(database);
            handler(result);
          }
          var tx;
          var request;
          try {
            tx = database.transaction(STORE_NAME, "readonly");
            tx.onabort = function () { settle(reject, errorFrom(tx, "IndexedDB transaction aborted.")); };
            tx.onerror = function () { settle(reject, errorFrom(tx, "IndexedDB transaction failed.")); };
            tx.oncomplete = function () { settle(resolve, value === undefined ? null : value); };
            request = tx.objectStore(STORE_NAME).get(key);
            request.onerror = function () { settle(reject, errorFrom(request, "IndexedDB request failed.")); };
            request.onsuccess = function () { value = request.result; };
          } catch (error) {
            settle(reject, error);
          }
        });
      });
    }

    function writeRecord(key, value) {
      return transaction("readwrite", function (store) { return store.put(value, key); });
    }

    function deleteRecord(key) {
      return transaction("readwrite", function (store) { return store.delete(key); });
    }

    function getSessionStorage() {
      if (!sessionStorage || typeof sessionStorage.getItem !== "function" ||
        typeof sessionStorage.setItem !== "function" || typeof sessionStorage.removeItem !== "function") {
        throw new Error("sessionStorage 不可用。");
      }
      return sessionStorage;
    }

    return {
      openStore: openStore,
      savePairing: function (pairing) {
        var saved;
        try {
          saved = sanitizePairing(pairing);
        } catch (error) {
          return Promise.reject(error);
        }
        return writeRecord(PAIRING_KEY, saved);
      },
      loadPairing: function () { return readRecord(PAIRING_KEY); },
      forgetPairing: function () {
        return deleteRecord(PAIRING_KEY).then(function () {
          getSessionStorage().removeItem(PENDING_OPERATION_KEY);
        });
      },
      savePendingOperation: function (operation) {
        var pending;
        try {
          pending = validatePendingOperation(operation);
        } catch (error) {
          return Promise.reject(error);
        }
        return Promise.resolve().then(function () {
          getSessionStorage().setItem(PENDING_OPERATION_KEY, JSON.stringify(pending));
        });
      },
      loadPendingOperation: function () {
        return Promise.resolve().then(function () {
          var raw = getSessionStorage().getItem(PENDING_OPERATION_KEY);
          if (raw === null) return null;
          try {
            return validatePendingOperation(JSON.parse(raw));
          } catch (error) {
            throw new Error("同步续传操作不正确。");
          }
        });
      },
      clearPendingOperation: function () {
        return Promise.resolve().then(function () { getSessionStorage().removeItem(PENDING_OPERATION_KEY); });
      },
      saveRollbackCopy: function (copy) {
        var saved;
        try {
          saved = cloneRollbackCopy(copy);
        } catch (error) {
          return Promise.reject(error);
        }
        return writeRecord(ROLLBACK_COPY_KEY, saved);
      },
      loadRollbackCopy: function () { return readRecord(ROLLBACK_COPY_KEY); },
      clearRollbackCopy: function () { return deleteRecord(ROLLBACK_COPY_KEY); }
    };
  }

  var storage = createStorage();
  storage.createStorage = createStorage;
  return storage;
});
