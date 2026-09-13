/**
 * 云同步 HTTP 边界。只传输数据，不写入本地存储，也不记录请求或响应。
 * 浏览器暴露 QinshiCloudSyncApi；Node 可用 createApi 注入 fetch 与时钟。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.QinshiCloudSyncApi = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var MESSAGES = Object.freeze({
    SYNC_NOT_CONFIGURED: "云同步服务尚未配置。",
    PAIRING_REQUIRED: "请先配对云同步设备。",
    DEVICE_REVOKED: "本设备的配对已失效或被撤销，请重新配对。",
    AUTH_FAILED: "同步身份验证失败，请检查同步码和凭据。",
    AUTH_COOLDOWN: "身份验证暂时受限，请稍后重试。",
    UPGRADE_REQUIRED: "请先更新工具后再继续同步。",
    FREE_QUOTA_EXHAUSTED: "云同步免费存储或额度已用尽，请稍后重试。",
    SOURCE_DELETED: "所选快照来源已删除或不可用，请刷新来源列表。",
    OFFLINE: "网络不可用，请检查连接后重试。",
    TIMEOUT: "云同步请求超时，请稍后重试。",
    INVALID_REQUEST: "同步请求不正确。",
    INVALID_RESPONSE: "云同步服务返回了无效响应。",
    IDEMPOTENCY_CONFLICT: "重复操作标识与请求不一致，请重新发起操作。",
    PAYLOAD_TOO_LARGE: "同步数据超过服务大小限制。",
    UNSUPPORTED_MEDIA_TYPE: "同步请求的数据格式不受支持。",
    ORIGIN_NOT_ALLOWED: "当前页面不允许使用此同步服务。",
    NOT_FOUND: "请求的同步资源不存在。",
    METHOD_NOT_ALLOWED: "同步服务不支持此操作。",
    INTERNAL_ERROR: "云同步服务暂时异常，请稍后重试。",
    SERVICE_UNAVAILABLE: "云同步服务暂时不可用，请稍后重试。",
    RATE_LIMITED: "同步请求过于频繁，请稍后重试。",
    HTTP_ERROR: "云同步请求失败，请稍后重试。"
  });
  var SERVER_CODES = ["INVALID_REQUEST", "IDEMPOTENCY_CONFLICT", "AUTH_FAILED", "AUTH_COOLDOWN",
    "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "UPGRADE_REQUIRED", "ORIGIN_NOT_ALLOWED",
    "NOT_FOUND", "METHOD_NOT_ALLOWED", "FREE_QUOTA_EXHAUSTED", "INTERNAL_ERROR"];
  var RETRY_DELAYS = [500, 1500];

  class CloudSyncApiError extends Error {
    constructor(code, message, retryable, status) {
      super(message);
      this.name = "CloudSyncApiError";
      this.code = code;
      this.retryable = Boolean(retryable);
      this.status = status || 0;
      // The coordinator may show this notice, then forget pairing. Never clear qinshi_ data here.
      this.pairingInvalid = code === "DEVICE_REVOKED";
    }
  }

  function safeError(code, retryable, status) {
    return new CloudSyncApiError(code, MESSAGES[code], retryable, status);
  }

  function segment(value) {
    if (typeof value !== "string" || !value || value === "." || value === "..") throw safeError("INVALID_REQUEST");
    try { return encodeURIComponent(value); }
    catch (error) { throw safeError("INVALID_REQUEST"); }
  }

  function chunkIndex(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw safeError("INVALID_REQUEST");
    return String(value);
  }

  function createApi(dependencies) {
    var options = dependencies || {};
    var setTimer = options.setTimeout || root.setTimeout.bind(root);
    var clearTimer = options.clearTimeout || root.clearTimeout.bind(root);
    var sleep = options.sleep || function (ms) { return new Promise(function (resolve) { setTimer(resolve, ms); }); };
    var now = options.now || Date.now;

    function baseUrl() {
      var config = options.config || root.QinshiCloudSyncConfig || {};
      var enabled = Object.hasOwn(options, "enabled") ? options.enabled : config.enabled;
      var base = Object.hasOwn(options, "apiBaseUrl") ? options.apiBaseUrl : config.apiBaseUrl;
      try {
        if (enabled !== true || typeof base !== "string" || !/^https:\/\//.test(base)) throw new Error();
        var url = new URL(base);
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error();
        return url.href.replace(/\/+$/, "");
      } catch (error) { throw safeError("SYNC_NOT_CONFIGURED"); }
    }

    async function loadPairing() {
      try {
        var saved;
        if (options.getPairing) saved = await options.getPairing();
        else if (Object.hasOwn(options, "pairing")) saved = options.pairing;
        else if (root.QinshiCloudSyncStorage) saved = await root.QinshiCloudSyncStorage.loadPairing();
        if (!saved || typeof saved.deviceId !== "string" || typeof saved.deviceToken !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(saved.deviceId) || !/^[A-Za-z0-9_-]{1,256}$/.test(saved.deviceToken)) throw new Error();
        return "Device " + saved.deviceId + "." + saved.deviceToken;
      } catch (error) { throw safeError("PAIRING_REQUIRED"); }
    }

    function operationKey(key) {
      if (key === undefined) {
        try { key = options.randomUUID ? options.randomUUID() : root.crypto.randomUUID(); }
        catch (error) { throw safeError("INVALID_REQUEST"); }
      }
      if (typeof key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw safeError("INVALID_REQUEST");
      return key;
    }

    function retryAfter(response) {
      var value = response.headers && response.headers.get("Retry-After");
      if (!value) return 0;
      var milliseconds = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now();
      // Do not let an overflowing timeout turn a server cooldown into an immediate retry.
      if (!Number.isFinite(milliseconds) || milliseconds < 0) return 0;
      return milliseconds;
    }

    async function waitDelay(milliseconds) {
      while (milliseconds > 2147483647) {
        await sleep(2147483647);
        milliseconds -= 2147483647;
      }
      await sleep(milliseconds);
    }

    async function perform(url, init, details, canRetry) {
      var controller = new root.AbortController();
      var timer;
      var timeout = new Promise(function (resolve, reject) {
        timer = setTimer(function () {
          reject(safeError("TIMEOUT", canRetry));
          controller.abort();
        }, 15000);
      });
      var transport = (async function () {
        var response;
        try {
          var fetchImpl = options.fetch || root.fetch;
          response = await fetchImpl.call(root, url, Object.assign({}, init, { signal: controller.signal }));
        } catch (error) { throw safeError("OFFLINE", canRetry); }
        if (!response.ok) {
          var payload;
          try { payload = await response.json(); } catch (error) { payload = null; }
          var serverCode = payload && payload.error && payload.error.code;
          var status = response.status;
          var code = SERVER_CODES.indexOf(serverCode) !== -1 ? serverCode : "HTTP_ERROR";
          if (status === 401) code = details.auth ? "DEVICE_REVOKED" : "AUTH_FAILED";
          else if (status === 426) code = "UPGRADE_REQUIRED";
          else if (status === 404 && details.snapshot) code = "SOURCE_DELETED";
          else if (code === "HTTP_ERROR" && status === 503) code = "SERVICE_UNAVAILABLE";
          else if (code === "HTTP_ERROR" && status === 429) code = "RATE_LIMITED";
          var transient = (status === 429 || status === 503) &&
            ["AUTH_COOLDOWN", "FREE_QUOTA_EXHAUSTED", "SERVICE_UNAVAILABLE", "RATE_LIMITED"].indexOf(code) !== -1;
          var failure = safeError(code, canRetry && transient, status);
          failure.retryAfterMs = retryAfter(response);
          throw failure;
        }
        if (response.status === 204) return null;
        try { return await (details.binary ? response.arrayBuffer() : response.json()); }
        catch (error) { throw safeError("INVALID_RESPONSE"); }
      })();
      try { return await Promise.race([transport, timeout]); }
      finally { clearTimer(timer); }
    }

    async function request(path, details) {
      var base = baseUrl();
      var appVersion = options.appVersion || (root.QinshiPWA && root.QinshiPWA.version);
      if (typeof appVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(appVersion)) throw safeError("UPGRADE_REQUIRED");
      var method = details.method || "GET";
      var headers = { "X-Qin-App-Version": appVersion };
      if (details.auth) headers.Authorization = await loadPairing();
      if (details.idempotent) headers["Idempotency-Key"] = operationKey(details.key);
      var body;
      if (details.chunk) {
        if (typeof details.digest !== "string" || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(details.digest)) {
          throw safeError("INVALID_REQUEST");
        }
        headers["Content-Type"] = "application/octet-stream";
        headers["X-Chunk-SHA256"] = details.digest;
        // Snapshot bytes so retries cannot send a caller-mutated buffer.
        if (details.body instanceof ArrayBuffer) body = details.body.slice(0);
        else if (ArrayBuffer.isView(details.body)) body = new Uint8Array(details.body.buffer, details.body.byteOffset, details.body.byteLength).slice();
        else throw safeError("INVALID_REQUEST");
      } else if (details.body !== undefined) {
        headers["Content-Type"] = "application/json";
        try { body = JSON.stringify(details.body); } catch (error) { throw safeError("INVALID_REQUEST"); }
      }
      var canRetry = method === "GET" || (method === "PUT" && details.chunk === true) || Boolean(headers["Idempotency-Key"]);
      var init = { method: method, headers: headers, body: body, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" };
      for (var attempt = 0; ; attempt++) {
        try { return await perform(base + path, init, details, canRetry); }
        catch (error) {
          if (!(error instanceof CloudSyncApiError)) throw safeError("INVALID_RESPONSE");
          if (!error.retryable || attempt >= RETRY_DELAYS.length) throw error;
          await waitDelay(Math.max(RETRY_DELAYS[attempt], error.retryAfterMs || 0));
        }
      }
    }

    function write(path, body, key, auth, method) {
      return request(path, { method: method || "POST", body: body, key: key, auth: auth, idempotent: true });
    }

    return {
      health: function () { return request("/v1/health", {}); },
      createSpace: function (body, key) { return write("/v1/spaces", body, key, false); },
      getParameters: async function (code) { return request("/v1/spaces/" + segment(code) + "/parameters", {}); },
      pair: async function (code, body, key) { return write("/v1/spaces/" + segment(code) + "/pair", body, key, false); },
      recover: async function (code, body, key) { return write("/v1/spaces/" + segment(code) + "/recover", body, key, false); },
      listDevices: function () { return request("/v1/devices", { auth: true }); },
      renameDevice: async function (id, body) { return request("/v1/devices/" + segment(id), { method: "PATCH", body: body, auth: true }); },
      revokeDevice: async function (id, body) { return request("/v1/devices/" + segment(id), { method: "DELETE", body: body, auth: true }); },
      createUpload: function (body, key) { return write("/v1/uploads", body, key, true); },
      putChunk: async function (id, index, bytes, digest) {
        return request("/v1/uploads/" + segment(id) + "/chunks/" + chunkIndex(index), { method: "PUT", body: bytes, digest: digest, auth: true, chunk: true });
      },
      commitUpload: async function (id, body, key) { return write("/v1/uploads/" + segment(id) + "/commit", body, key, true); },
      getSnapshot: async function (id) { return request("/v1/snapshots/" + segment(id), { auth: true, snapshot: true }); },
      getChunk: async function (id, index) { return request("/v1/snapshots/" + segment(id) + "/chunks/" + chunkIndex(index), { auth: true, snapshot: true, binary: true }); },
      changePassword: function (body, key) { return write("/v1/security/password", body, key, true); },
      rotateRecoveryKey: function (body, key) { return write("/v1/security/recovery-key", body, key, true); },
      deleteSpace: function (body, key) { return write("/v1/spaces/current", body, key, true, "DELETE"); }
    };
  }

  var api = createApi();
  api.createApi = createApi;
  api.CloudSyncApiError = CloudSyncApiError;
  return api;
});
