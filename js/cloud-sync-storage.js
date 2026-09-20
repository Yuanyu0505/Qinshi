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
  var RECOVERY_LEASE_MS = 60000;
  var OWNER_WRITE_LEASE_MS = 60000;

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

    function rollbackConflict() {
      var error = new Error('回滚副本已被其他操作占用，请先处理已有回滚。');
      error.code = 'ROLLBACK_CONFLICT';
      return error;
    }

    function pairingIdentity(value) {
      if (value === null) return null;
      var identity = {};
      ['spaceId', 'deviceId', 'deviceToken'].forEach(function (field) {
        if (!value || typeof value[field] !== 'string' || !value[field]) throw new Error('配对凭据不正确。');
        identity[field] = value[field];
      });
      return identity;
    }

    function conditionalPairing(expected, replacement, allowAbsent) {
      var identity, saved;
      try {
        identity = pairingIdentity(expected);
        saved = replacement === null ? null : sanitizePairing(replacement);
      } catch (error) { return Promise.reject(error); }
      return openStore().then(function (database) {
        return new Promise(function (resolve, reject) {
          var tx, failure, settled = false;
          function settle(handler, value) {
            if (settled) return;
            settled = true;
            closeDatabase(database);
            handler(value);
          }
          function fail(error) {
            failure = error;
            try { if (tx) tx.abort(); } catch (ignored) { /* Keep the original failure. */ }
            settle(reject, error);
          }
          try {
            tx = database.transaction(STORE_NAME, 'readwrite');
            tx.onabort = function () { settle(reject, failure || errorFrom(tx, 'IndexedDB transaction aborted.')); };
            tx.onerror = function () { settle(reject, failure || errorFrom(tx, 'IndexedDB transaction failed.')); };
            tx.oncomplete = function () { settle(resolve); };
            var store = tx.objectStore(STORE_NAME);
            var rollback = store.get(ROLLBACK_COPY_KEY);
            rollback.onerror = function () { fail(errorFrom(rollback, 'IndexedDB request failed.')); };
            rollback.onsuccess = function () {
              if (rollback.result !== undefined) { fail(rollbackConflict()); return; }
              var pairing = store.get(PAIRING_KEY);
              pairing.onerror = function () { fail(errorFrom(pairing, 'IndexedDB request failed.')); };
              pairing.onsuccess = function () {
                try {
                  var current = pairing.result;
                  var absent = current === undefined;
                  var matches = identity === null ? absent : current && ['spaceId', 'deviceId', 'deviceToken'].every(function (field) {
                    return current[field] === identity[field];
                  });
                  if (!matches && !(saved === null && allowAbsent && absent)) {
                    var conflict = new Error('配对已变化，请重新处理当前配对。');
                    conflict.code = 'PAIRING_CONFLICT';
                    throw conflict;
                  }
                  // No await between reads and mutation; comparison and rollback
                  // fence are part of this same serialized readwrite transaction.
                  var mutation = saved === null ? store.delete(PAIRING_KEY) : store.put(saved, PAIRING_KEY);
                  mutation.onerror = function () { fail(errorFrom(mutation, 'IndexedDB request failed.')); };
                } catch (error) { fail(error); }
              };
            };
          } catch (error) { fail(error); }
        });
      });
      // Deliberately never remove session pending state: a marker can arrive
      // while IDB commits, and it is not part of this atomic transaction.
    }

    // The read and conditional write share one IDB readwrite transaction. Do not
    // await between requests: Safari may auto-close an inactive transaction.
    function rollbackTransaction(action) {
      return openStore().then(function (database) {
        return new Promise(function (resolve, reject) {
          var tx, failure, result, settled = false;
          function settle(handler, value) {
            if (settled) return;
            settled = true;
            closeDatabase(database);
            handler(value);
          }
          function fail(error) {
            failure = error;
            try { if (tx) tx.abort(); } catch (ignored) { /* Preserve the safe original failure. */ }
            settle(reject, error);
          }
          try {
            tx = database.transaction(STORE_NAME, 'readwrite');
            tx.onabort = function () { settle(reject, failure || errorFrom(tx, 'IndexedDB transaction aborted.')); };
            tx.onerror = function () { settle(reject, failure || errorFrom(tx, 'IndexedDB transaction failed.')); };
            tx.oncomplete = function () { settle(resolve, result); };
            var store = tx.objectStore(STORE_NAME);
            var request = store.get(ROLLBACK_COPY_KEY);
            request.onerror = function () { fail(errorFrom(request, 'IndexedDB request failed.')); };
            request.onsuccess = function () {
              try {
                var next = action(request.result);
                result = next.result;
                if (next.readOnly) return;
                var mutation = next.removing ? store.delete(ROLLBACK_COPY_KEY) : store.put(next.value, ROLLBACK_COPY_KEY);
                mutation.onerror = function () { fail(errorFrom(mutation, 'IndexedDB request failed.')); };
              } catch (error) { fail(error); }
            };
          } catch (error) { fail(error); }
        });
      });
    }

    function leaseNow() {
      var value = config.now ? config.now() : Date.now();
      if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - RECOVERY_LEASE_MS) throw new Error('回滚租约时钟不正确。');
      return value;
    }

    function checkRecovery(current, ownerId, actionId, time) {
      if (!current || current.ownerId !== ownerId || current.recoveryActionId !== actionId ||
        !Number.isSafeInteger(current.recoveryLeaseUntil) || current.recoveryLeaseUntil <= time) throw rollbackConflict();
    }

    function checkWrite(current, ownerId, fenceId, time) {
      if (!current || current.ownerId !== ownerId || current.recoveryActionId !== undefined ||
        current.writeFenceId !== fenceId || typeof fenceId !== 'string' ||
        !Number.isSafeInteger(current.writeLeaseUntil) || current.writeLeaseUntil <= time) throw rollbackConflict();
    }

    function changeRollback(saved, ownerId, removing, actionId, fenceId) {
      return rollbackTransaction(function (current) {
        if (!removing && current !== undefined) throw rollbackConflict();
        var currentOwner = current && typeof current === 'object' ? current.ownerId : undefined;
        if (removing && current === undefined && ownerId !== undefined) throw rollbackConflict();
        if (removing && current !== undefined && currentOwner !== ownerId) throw rollbackConflict();
        if (removing && actionId !== undefined) checkRecovery(current, ownerId, actionId, leaseNow());
        if (removing && (fenceId !== undefined || (current && current.writeFenceId !== undefined))) checkWrite(current, ownerId, fenceId, leaseNow());
        // Once recovery has taken ownership, the original overwrite actor must
        // never regain write/clear rights, even after its recovery lease expires.
        if (removing && actionId === undefined && current && current.recoveryActionId !== undefined) throw rollbackConflict();
        return { removing: removing, value: saved };
      });
    }

    function recoveryLease(ownerId, actionId, renewing) {
      if (typeof actionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId)) {
        return Promise.reject(new Error('回滚恢复 action 不正确。'));
      }
      return rollbackTransaction(function (current) {
        var time = leaseNow();
        if (!isPlainObject(current) || current.ownerId !== ownerId) throw rollbackConflict();
        if (current.writeFenceId !== undefined &&
          (!Number.isSafeInteger(current.writeLeaseUntil) || current.writeLeaseUntil > time)) throw rollbackConflict();
        if (renewing) checkRecovery(current, ownerId, actionId, time);
        else if (current.recoveryActionId !== undefined &&
          (!Number.isSafeInteger(current.recoveryLeaseUntil) || current.recoveryLeaseUntil > time)) throw rollbackConflict();
        var saved = Object.assign({}, current, { recoveryActionId: actionId, recoveryLeaseUntil: time + RECOVERY_LEASE_MS });
        delete saved.writeFenceId;
        delete saved.writeLeaseUntil;
        return { value: saved, result: saved };
      });
    }

    function writeLease(ownerId, fenceId, mode) {
      if (typeof fenceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fenceId)) {
        return Promise.reject(new Error('回滚写入 fence 不正确。'));
      }
      return rollbackTransaction(function (current) {
        var time = leaseNow();
        if (!isPlainObject(current) || current.ownerId !== ownerId || current.recoveryActionId !== undefined) throw rollbackConflict();
        if (mode !== 'acquire') checkWrite(current, ownerId, fenceId, time);
        else if (current.writeFenceId !== undefined &&
          (!Number.isSafeInteger(current.writeLeaseUntil) || current.writeLeaseUntil > time)) throw rollbackConflict();
        var saved = Object.assign({}, current);
        if (mode === 'release') {
          delete saved.writeFenceId;
          delete saved.writeLeaseUntil;
        } else {
          saved.writeFenceId = fenceId;
          saved.writeLeaseUntil = time + OWNER_WRITE_LEASE_MS;
        }
        return { value: saved, result: saved };
      });
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
      replacePairingIfCurrent: function (expected, replacement) {
        if (replacement === null) return Promise.reject(new Error('配对凭据不正确。'));
        return conditionalPairing(expected, replacement, false);
      },
      forgetPairingIfCurrent: function (expected, options) { return conditionalPairing(expected, null, !!(options && options.allowAbsent === true)); },
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
        return changeRollback(saved, undefined, false);
      },
      claimRollbackCopy: function (copy) {
        var saved;
        try {
          saved = cloneRollbackCopy(copy);
          if (!saved || typeof saved.ownerId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.ownerId)) {
            throw new Error('回滚 owner 不正确。');
          }
        } catch (error) { return Promise.reject(error); }
        return changeRollback(saved, saved.ownerId, false);
      },
      loadRollbackCopy: function () { return readRecord(ROLLBACK_COPY_KEY); },
      assertRollbackOwner: function (ownerId) {
        return rollbackTransaction(function (current) {
          if (!current || current.ownerId !== ownerId || current.recoveryActionId !== undefined) throw rollbackConflict();
          return { readOnly: true, result: current };
        });
      },
      acquireRollbackRecovery: function (ownerId, actionId) { return recoveryLease(ownerId, actionId, false); },
      renewRollbackRecovery: function (ownerId, actionId) { return recoveryLease(ownerId, actionId, true); },
      acquireRollbackWrite: function (ownerId, fenceId) { return writeLease(ownerId, fenceId, 'acquire'); },
      renewRollbackWrite: function (ownerId, fenceId) { return writeLease(ownerId, fenceId, 'renew'); },
      releaseRollbackWrite: function (ownerId, fenceId) { return writeLease(ownerId, fenceId, 'release'); },
      clearRollbackCopy: function (ownerId, actionId, fenceId) { return changeRollback(undefined, ownerId, true, actionId, fenceId); }
    };
  }

  var storage = createStorage();
  storage.createStorage = createStorage;
  return storage;
});
