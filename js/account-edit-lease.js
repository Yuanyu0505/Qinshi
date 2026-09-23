(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.QinshiAccountLeaseApi = api;
    if (root.localStorage && root.sessionStorage) {
      var tabKey = "qinshi_account_tab_v1";
      var tabId = root.sessionStorage.getItem(tabKey);
      if (!tabId) {
        tabId = root.crypto && typeof root.crypto.randomUUID === "function"
          ? root.crypto.randomUUID()
          : "tab-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        root.sessionStorage.setItem(tabKey, tabId);
      }
      var channel = typeof root.BroadcastChannel === "function" ? new root.BroadcastChannel("qinshi-account-lease-v1") : null;
      root.QinshiAccountLease = api.createLease({
        storage: root.localStorage,
        tabId: tabId,
        channel: channel,
        autoRenew: true,
        token: function () {
          return root.crypto && typeof root.crypto.randomUUID === "function"
            ? root.crypto.randomUUID()
            : "lease-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        }
      });
      if (root.addEventListener) {
        root.addEventListener("storage", function (event) {
          if (event.key && event.key.indexOf(api.LEASE_PREFIX) === 0) root.QinshiAccountLease.refresh(event.key.slice(api.LEASE_PREFIX.length));
        });
        root.addEventListener("pagehide", function () { root.QinshiAccountLease.releaseAll(); });
        root.addEventListener("visibilitychange", function () {
          if (!root.document || root.document.visibilityState === "visible") root.QinshiAccountLease.renewAll();
        });
      }
    }
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LEASE_PREFIX = "qin_runtime_account_lease_v1:";
  var DEFAULT_TTL = 5 * 60 * 1000;

  function createLease(options) {
    options = options || {};
    var storage = options.storage;
    var tabId = String(options.tabId || "");
    var makeToken = options.token || function () { return Math.random().toString(36).slice(2); };
    var now = options.now || Date.now;
    var ttl = Number(options.ttl) > 0 ? Number(options.ttl) : DEFAULT_TTL;
    var channel = options.channel || null;
    var owned = new Map();
    var listeners = new Set();

    function key(accountId) { return LEASE_PREFIX + accountId; }
    function read(accountId) {
      var raw = storage && storage.getItem(key(accountId));
      if (!raw) return null;
      try {
        var value = JSON.parse(raw);
        return value && typeof value.ownerTabId === "string" && typeof value.token === "string" && Number.isFinite(value.expiresAt) ? value : null;
      } catch (error) { return null; }
    }
    function valid(value) { return Boolean(value && value.expiresAt > now()); }
    function notify(accountId) {
      var state = { accountId: accountId, writable: canWrite(accountId), lease: read(accountId) };
      listeners.forEach(function (listener) { listener(state); });
      return state;
    }
    function write(accountId, token) {
      var stamp = now();
      var value = { accountId: accountId, ownerTabId: tabId, token: token, renewedAt: stamp, expiresAt: stamp + ttl };
      storage.setItem(key(accountId), JSON.stringify(value));
      owned.set(accountId, token);
      if (channel && typeof channel.postMessage === "function") channel.postMessage({ type: "lease-changed", accountId: accountId });
      notify(accountId);
      return canWrite(accountId);
    }
    function claim(accountId) {
      var current = read(accountId);
      var token = owned.get(accountId);
      if (valid(current) && !(token && current.ownerTabId === tabId && current.token === token)) {
        notify(accountId);
        return false;
      }
      return write(accountId, token || makeToken());
    }
    function takeOver(accountId) { return write(accountId, makeToken()); }
    function canWrite(accountId) {
      var current = read(accountId);
      var token = owned.get(accountId);
      return Boolean(valid(current) && token && current.ownerTabId === tabId && current.token === token);
    }
    function renew(accountId) {
      if (!canWrite(accountId)) return false;
      return write(accountId, owned.get(accountId));
    }
    function renewAll() { Array.from(owned.keys()).forEach(renew); }
    function release(accountId) {
      var current = read(accountId);
      var token = owned.get(accountId);
      if (current && token && current.ownerTabId === tabId && current.token === token) storage.removeItem(key(accountId));
      owned.delete(accountId);
      if (channel && typeof channel.postMessage === "function") channel.postMessage({ type: "lease-changed", accountId: accountId });
      notify(accountId);
    }
    function releaseAll() { Array.from(owned.keys()).forEach(release); }
    function refresh(accountId) { return notify(accountId); }
    function subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners.add(listener);
      return function () { listeners.delete(listener); };
    }
    if (channel && typeof channel.addEventListener === "function") {
      channel.addEventListener("message", function (event) {
        var message = event && event.data;
        if (message && message.type === "lease-changed" && message.accountId) notify(message.accountId);
      });
    }
    var interval = options.autoRenew !== true || typeof setInterval !== "function" ? null : setInterval(renewAll, Math.max(30000, Math.floor(ttl / 3)));
    function destroy() {
      releaseAll();
      if (interval !== null && typeof clearInterval === "function") clearInterval(interval);
      if (channel && typeof channel.close === "function") channel.close();
      listeners.clear();
    }
    return { claim: claim, takeOver: takeOver, canWrite: canWrite, renew: renew, renewAll: renewAll, release: release, releaseAll: releaseAll, refresh: refresh, subscribe: subscribe, destroy: destroy };
  }

  return { LEASE_PREFIX: LEASE_PREFIX, DEFAULT_TTL: DEFAULT_TTL, createLease: createLease };
});
