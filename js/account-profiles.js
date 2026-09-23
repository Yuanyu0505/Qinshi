(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.QinshiAccountProfiles = api;
    if (root.localStorage && root.sessionStorage) {
      root.QinshiAccounts = api.createStore({
        localStorage: root.localStorage,
        sessionStorage: root.sessionStorage,
        uuid: function () {
          return root.crypto && typeof root.crypto.randomUUID === "function"
            ? root.crypto.randomUUID()
            : "account-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        },
        reload: function () { root.location.reload(); },
        lease: root.QinshiAccountLease
      });
      root.QinshiAccounts.boot();
    }
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var REGISTRY_KEY = "qinshi_accounts_v1";
  var ACCOUNT_PREFIX = "qinshi_account_v1:";
  var ACTIVE_SESSION_KEY = "qinshi_active_account_v1";
  var RETURN_SESSION_KEY = "qinshi_account_return_v1";
  var MAX_ACCOUNTS = 3;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clean(value) { return String(value == null ? "" : value).trim(); }
  function pairKey(account) { return clean(account.name).toLocaleLowerCase() + "\u0000" + clean(account.server).toLocaleLowerCase(); }
  function validId(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value); }

  function normalizeAccountInput(input) {
    var value = input || {};
    var name = clean(value.name);
    var server = clean(value.server);
    if (!name) throw new Error("请输入账号名称。");
    if (!server) throw new Error("请输入服务器。");
    if (name.length > 40) throw new Error("账号名称不能超过40个字符。");
    if (server.length > 40) throw new Error("服务器不能超过40个字符。");
    return { name: name, server: server };
  }

  function normalizeRegistry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("账号注册表格式不正确。");
    if (value.schemaVersion !== 1 || !Array.isArray(value.accounts) || !Array.isArray(value.order)) {
      throw new Error("账号注册表版本不受支持。");
    }
    if (value.accounts.length > MAX_ACCOUNTS) throw new Error("最多保存3个账号。");
    var ids = new Set();
    var pairs = new Set();
    var accounts = value.accounts.map(function (item) {
      if (!item || !validId(item.id)) throw new Error("账号 ID 不正确。");
      if (ids.has(item.id)) throw new Error("账号 ID 重复。");
      ids.add(item.id);
      var input = normalizeAccountInput(item);
      var normalized = {
        id: item.id,
        name: input.name,
        server: input.server,
        createdAt: clean(item.createdAt),
        updatedAt: clean(item.updatedAt)
      };
      if (!normalized.createdAt || !normalized.updatedAt) throw new Error("账号时间信息不正确。");
      var pair = pairKey(normalized);
      if (pairs.has(pair)) throw new Error("相同名称和服务器的账号已存在。");
      pairs.add(pair);
      return normalized;
    });
    if (!accounts.length) {
      return { schemaVersion: 1, primaryAccountId: null, order: [], accounts: [] };
    }
    if (!ids.has(value.primaryAccountId)) throw new Error("主账号不存在。");
    var order = [];
    value.order.forEach(function (id) {
      if (!ids.has(id) || order.indexOf(id) !== -1) throw new Error("账号顺序不正确。");
      order.push(id);
    });
    accounts.forEach(function (account) { if (order.indexOf(account.id) === -1) order.push(account.id); });
    order = [value.primaryAccountId].concat(order.filter(function (id) { return id !== value.primaryAccountId; }));
    return { schemaVersion: 1, primaryAccountId: value.primaryAccountId, order: order, accounts: accounts };
  }

  function parseRegistry(raw) {
    if (raw == null || raw === "") return null;
    try { return normalizeRegistry(JSON.parse(raw)); }
    catch (error) { throw new Error("无法读取账号注册表：" + error.message); }
  }

  function physicalKey(accountId, logicalKey) {
    if (!validId(accountId)) throw new Error("账号 ID 不正确。");
    var key = clean(logicalKey);
    if (!key || key.indexOf("qinshi_") !== 0 || key === REGISTRY_KEY || key.indexOf(ACCOUNT_PREFIX) === 0) {
      throw new Error("个人数据键不受支持。");
    }
    return ACCOUNT_PREFIX + accountId + ":" + encodeURIComponent(key);
  }

  function parsePhysicalKey(key) {
    if (typeof key !== "string" || key.indexOf(ACCOUNT_PREFIX) !== 0) return null;
    var rest = key.slice(ACCOUNT_PREFIX.length);
    var separator = rest.indexOf(":");
    if (separator <= 0) return null;
    var id = rest.slice(0, separator);
    if (!validId(id)) return null;
    try { return { accountId: id, logicalKey: decodeURIComponent(rest.slice(separator + 1)) }; }
    catch (error) { return null; }
  }

  function createStore(options) {
    options = options || {};
    var storage = options.localStorage;
    var session = options.sessionStorage;
    var uuid = options.uuid || function () { return "account-" + Date.now().toString(36); };
    var now = options.now || function () { return new Date().toISOString(); };
    var reload = options.reload || function () {};
    var lease = options.lease || null;
    var registry = null;
    var activeAccountId = null;
    var booted = false;

    function requireStorage() {
      if (!storage || !session) throw new Error("浏览器存储不可用。");
    }
    function saveRegistry(next) {
      next = normalizeRegistry(next);
      storage.setItem(REGISTRY_KEY, JSON.stringify(next));
      registry = next;
      return clone(next);
    }
    function find(id) { return registry && registry.accounts.find(function (item) { return item.id === id; }) || null; }
    function requireAccount(id) {
      var account = find(id);
      if (!account) throw new Error("账号不存在。");
      return account;
    }
    function assertWritable(id) {
      if (!lease) return;
      if (!lease.canWrite(id)) {
        var error = new Error("该账号正在其他标签页编辑，当前页面为只读模式。");
        error.code = "ACCOUNT_READ_ONLY";
        throw error;
      }
    }
    function canWrite(id) { return !lease || lease.canWrite(id); }
    function orderedAccounts() {
      if (!registry) return [];
      return registry.order.map(function (id) { return find(id); }).filter(Boolean).map(clone);
    }
    function listStorageKeys() {
      var keys = [];
      for (var index = 0; index < storage.length; index += 1) {
        var key = storage.key(index);
        if (key) keys.push(key);
      }
      return keys;
    }
    function legacyKeys() {
      return listStorageKeys().filter(function (key) {
        return key.indexOf("qinshi_") === 0 && key !== REGISTRY_KEY && key.indexOf(ACCOUNT_PREFIX) !== 0;
      });
    }
    function accountKeys(id) {
      var prefix = ACCOUNT_PREFIX + id + ":";
      return listStorageKeys().filter(function (key) { return key.indexOf(prefix) === 0; });
    }
    function rollbackWrites(previous, added) {
      added.forEach(function (key) { storage.removeItem(key); });
      Object.keys(previous).forEach(function (key) { storage.setItem(key, previous[key]); });
    }
    function migrateLegacyLocalData() {
      requireStorage();
      var existing = parseRegistry(storage.getItem(REGISTRY_KEY));
      if (existing) {
        registry = existing;
        return { migrated: false, accountId: existing.primaryAccountId };
      }
      var keys = legacyKeys();
      if (!keys.length) return { migrated: false, accountId: null };
      var id = uuid();
      var stamp = now();
      var account = { id: id, name: "默认账号", server: "未填写", createdAt: stamp, updatedAt: stamp };
      var next = { schemaVersion: 1, primaryAccountId: id, order: [id], accounts: [account] };
      var added = [];
      try {
        keys.forEach(function (key) {
          var target = physicalKey(id, key);
          var value = storage.getItem(key);
          storage.setItem(target, value);
          added.push(target);
          if (storage.getItem(target) !== value) throw new Error("迁移数据校验失败。");
        });
        saveRegistry(next);
        keys.forEach(function (key) { storage.removeItem(key); });
      } catch (error) {
        added.forEach(function (key) { storage.removeItem(key); });
        storage.removeItem(REGISTRY_KEY);
        registry = null;
        throw error;
      }
      return { migrated: true, accountId: id };
    }
    function boot() {
      requireStorage();
      var migration = migrateLegacyLocalData();
      registry = parseRegistry(storage.getItem(REGISTRY_KEY)) || { schemaVersion: 1, primaryAccountId: null, order: [], accounts: [] };
      var sessionId = session.getItem(ACTIVE_SESSION_KEY);
      activeAccountId = find(sessionId) ? sessionId : registry.primaryAccountId;
      if (activeAccountId) session.setItem(ACTIVE_SESSION_KEY, activeAccountId);
      else session.removeItem(ACTIVE_SESSION_KEY);
      booted = true;
      if (activeAccountId && lease) lease.claim(activeAccountId);
      return migration;
    }
    function ensureBoot() { if (!booted) boot(); }
    function bindAccount(id) {
      ensureBoot();
      requireAccount(id);
      var previous = activeAccountId;
      if (lease && previous && previous !== id) lease.release(previous);
      activeAccountId = id;
      session.setItem(ACTIVE_SESSION_KEY, id);
      if (lease) lease.claim(id);
      return clone(find(id));
    }
    function currentAccount() { ensureBoot(); return activeAccountId && find(activeAccountId) ? clone(find(activeAccountId)) : null; }
    function primaryAccount() { ensureBoot(); return registry.primaryAccountId ? clone(find(registry.primaryAccountId)) : null; }
    function createAccount(input) {
      ensureBoot();
      if (registry.accounts.length >= MAX_ACCOUNTS) throw new Error("最多保存3个账号。");
      var normalized = normalizeAccountInput(input);
      if (registry.accounts.some(function (item) { return pairKey(item) === pairKey(normalized); })) {
        throw new Error("相同名称和服务器的账号已存在。");
      }
      var stamp = now();
      var account = { id: uuid(), name: normalized.name, server: normalized.server, createdAt: stamp, updatedAt: stamp };
      var next = clone(registry);
      next.accounts.push(account);
      if (!next.primaryAccountId) next.primaryAccountId = account.id;
      next.order.push(account.id);
      saveRegistry(next);
      if (!activeAccountId) bindAccount(account.id);
      return clone(account);
    }
    function updateAccount(id, patch) {
      ensureBoot();
      requireAccount(id);
      var normalized = normalizeAccountInput(patch);
      if (registry.accounts.some(function (item) { return item.id !== id && pairKey(item) === pairKey(normalized); })) {
        throw new Error("相同名称和服务器的账号已存在。");
      }
      var next = clone(registry);
      var item = next.accounts.find(function (entry) { return entry.id === id; });
      item.name = normalized.name;
      item.server = normalized.server;
      item.updatedAt = now();
      saveRegistry(next);
      return clone(find(id));
    }
    function setPrimary(id) {
      ensureBoot();
      requireAccount(id);
      var next = clone(registry);
      next.primaryAccountId = id;
      next.order = [id].concat(next.order.filter(function (value) { return value !== id; }));
      saveRegistry(next);
      return clone(find(id));
    }
    function reorderAccounts(ids) {
      ensureBoot();
      if (!Array.isArray(ids)) throw new Error("账号顺序不正确。");
      var expected = registry.order.slice().sort();
      var actual = ids.slice().sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual) || ids[0] !== registry.primaryAccountId) {
        throw new Error("主账号必须置顶，且顺序必须包含全部账号。");
      }
      var next = clone(registry);
      next.order = ids.slice();
      saveRegistry(next);
      return orderedAccounts();
    }
    function listAccountData(id) {
      ensureBoot();
      requireAccount(id);
      var data = {};
      accountKeys(id).forEach(function (key) {
        var parsed = parsePhysicalKey(key);
        if (parsed && parsed.logicalKey.indexOf("qinshi_") === 0) data[parsed.logicalKey] = storage.getItem(key);
      });
      return data;
    }
    function replaceAccountData(id, data) {
      ensureBoot();
      requireAccount(id);
      assertWritable(id);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("账号数据格式不正确。");
      var previous = {};
      accountKeys(id).forEach(function (key) { previous[key] = storage.getItem(key); });
      var added = [];
      try {
        Object.keys(data).forEach(function (logicalKey) {
          if (typeof data[logicalKey] !== "string") throw new Error("账号数据值不正确。");
          var key = physicalKey(id, logicalKey);
          if (!Object.prototype.hasOwnProperty.call(previous, key)) added.push(key);
          storage.setItem(key, data[logicalKey]);
        });
        Object.keys(previous).forEach(function (key) {
          var parsed = parsePhysicalKey(key);
          if (!parsed || !Object.prototype.hasOwnProperty.call(data, parsed.logicalKey)) storage.removeItem(key);
        });
      } catch (error) {
        rollbackWrites(previous, added);
        throw error;
      }
    }
    function clearAccountData(id) {
      ensureBoot();
      requireAccount(id);
      assertWritable(id);
      var previous = {};
      accountKeys(id).forEach(function (key) { previous[key] = storage.getItem(key); });
      try { Object.keys(previous).forEach(function (key) { storage.removeItem(key); }); }
      catch (error) {
        Object.keys(previous).forEach(function (key) { storage.setItem(key, previous[key]); });
        throw error;
      }
    }
    function deleteAccount(id) {
      ensureBoot();
      requireAccount(id);
      assertWritable(id);
      var previousRegistry = clone(registry);
      var previousData = {};
      accountKeys(id).forEach(function (key) { previousData[key] = storage.getItem(key); });
      var next = clone(registry);
      next.accounts = next.accounts.filter(function (item) { return item.id !== id; });
      next.order = next.order.filter(function (value) { return value !== id; });
      if (!next.accounts.length) {
        next.primaryAccountId = null;
      } else if (next.primaryAccountId === id) {
        next.accounts.sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id); });
        next.primaryAccountId = next.accounts[0].id;
        next.order = [next.primaryAccountId].concat(next.order.filter(function (value) { return value !== next.primaryAccountId; }));
      }
      saveRegistry(next);
      try { Object.keys(previousData).forEach(function (key) { storage.removeItem(key); }); }
      catch (error) {
        saveRegistry(previousRegistry);
        Object.keys(previousData).forEach(function (key) { storage.setItem(key, previousData[key]); });
        throw error;
      }
      if (lease) lease.release(id);
      if (activeAccountId === id) {
        activeAccountId = next.primaryAccountId;
        if (activeAccountId) {
          session.setItem(ACTIVE_SESSION_KEY, activeAccountId);
          if (lease) lease.claim(activeAccountId);
        }
        else session.removeItem(ACTIVE_SESSION_KEY);
      }
      return { nextAccountId: activeAccountId, empty: !next.accounts.length };
    }
    function getItem(logicalKey) {
      ensureBoot();
      if (!activeAccountId) return null;
      return storage.getItem(physicalKey(activeAccountId, logicalKey));
    }
    function setItem(logicalKey, value) {
      ensureBoot();
      if (!activeAccountId) throw new Error("请先创建游戏账号。");
      if (!canWrite(activeAccountId)) return false;
      storage.setItem(physicalKey(activeAccountId, logicalKey), String(value));
      return true;
    }
    function removeItem(logicalKey) {
      ensureBoot();
      if (!activeAccountId) return;
      if (!canWrite(activeAccountId)) return false;
      storage.removeItem(physicalKey(activeAccountId, logicalKey));
      return true;
    }
    function switchAccount(id, returnState) {
      bindAccount(id);
      if (returnState) session.setItem(RETURN_SESSION_KEY, JSON.stringify(returnState));
      reload();
    }
    function consumeReturnState() {
      var raw = session.getItem(RETURN_SESSION_KEY);
      session.removeItem(RETURN_SESSION_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (error) { return null; }
    }

    return {
      boot: boot,
      migrateLegacyLocalData: migrateLegacyLocalData,
      listAccounts: function () { ensureBoot(); return orderedAccounts(); },
      currentAccount: currentAccount,
      primaryAccount: primaryAccount,
      bindAccount: bindAccount,
      createAccount: createAccount,
      updateAccount: updateAccount,
      setPrimary: setPrimary,
      reorderAccounts: reorderAccounts,
      listAccountData: listAccountData,
      replaceAccountData: replaceAccountData,
      clearAccountData: clearAccountData,
      deleteAccount: deleteAccount,
      getItem: getItem,
      setItem: setItem,
      removeItem: removeItem,
      switchAccount: switchAccount,
      consumeReturnState: consumeReturnState,
      isReadOnly: function () { ensureBoot(); return Boolean(activeAccountId && lease && !lease.canWrite(activeAccountId)); },
      takeOverEditing: function (id) { ensureBoot(); requireAccount(id || activeAccountId); return lease ? lease.takeOver(id || activeAccountId) : true; },
      claimEditing: function (id) { ensureBoot(); requireAccount(id || activeAccountId); return lease ? lease.claim(id || activeAccountId) : true; },
      subscribeAccess: function (listener) { return lease ? lease.subscribe(listener) : function () {}; },
      registry: function () { ensureBoot(); return clone(registry); }
    };
  }

  return {
    REGISTRY_KEY: REGISTRY_KEY,
    ACCOUNT_PREFIX: ACCOUNT_PREFIX,
    ACTIVE_SESSION_KEY: ACTIVE_SESSION_KEY,
    MAX_ACCOUNTS: MAX_ACCOUNTS,
    normalizeAccountInput: normalizeAccountInput,
    normalizeRegistry: normalizeRegistry,
    parsePhysicalKey: parsePhysicalKey,
    physicalKey: physicalKey,
    createStore: createStore
  };
});
