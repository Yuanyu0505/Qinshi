/**
 * 云同步快照核心（纯逻辑，无 DOM 依赖）。
 * 浏览器暴露 window.QinshiCloudSyncCore；Node 测试可经 createCore 注入依赖。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
  } else {
    root.QinshiCloudSyncCore = factory(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
  var ENVELOPE_KEYS = [
    "formatVersion", "appName", "schemaVersion", "appVersion",
    "sourceDeviceId", "clientCreatedAt", "dataHash", "data"
  ];

  function canonicalStringify(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return "[" + value.map(canonicalStringify).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonicalStringify(value[key]);
      }).join(",") + "}";
    }
    throw new Error("快照包含不支持的数据类型。");
  }

  function parseVersion(value) {
    var text = String(value);
    if (!/^\d+\.\d+\.\d+$/.test(text)) throw new Error("版本格式不正确。");
    return text.split(".").map(function (part) {
      return part.replace(/^0+(?=\d)/, "");
    });
  }

  function compareVersions(left, right) {
    var a = parseVersion(left);
    var b = parseVersion(right);
    for (var index = 0; index < 3; index += 1) {
      if (a[index].length !== b[index].length) return a[index].length < b[index].length ? -1 : 1;
      if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
    }
    return 0;
  }

  function isStrictIsoDate(value) {
    if (typeof value !== "string" || !value) return false;
    var time = Date.parse(value);
    return !Number.isNaN(time) && new Date(time).toISOString() === value;
  }

  function byteLength(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function bytesToBase64Url(bytes) {
    var raw;
    if (typeof bytes === "string") {
      if (/^[A-Za-z0-9_-]{43}$/.test(bytes)) return bytes;
      throw new Error("SHA-256 结果格式无效。");
    }
    if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
    if (!bytes || typeof bytes.length !== "number") throw new Error("SHA-256 结果格式无效。");
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64url");
    raw = "";
    for (var index = 0; index < bytes.length; index += 1) raw += String.fromCharCode(bytes[index]);
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function defaultValidateManagedData(data) {
    if (!root.QinshiSettings || typeof root.QinshiSettings.validateManagedData !== "function") {
      throw new Error("本机进度校验器不可用。");
    }
    return root.QinshiSettings.validateManagedData(data);
  }

  function defaultSha256(text) {
    if (!root.crypto || !root.crypto.subtle || typeof TextEncoder === "undefined") {
      throw new Error("SHA-256 不可用。");
    }
    return root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  }

  function assertEnvelopeShape(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== ENVELOPE_KEYS.length ||
      !ENVELOPE_KEYS.every(function (key) { return Object.prototype.hasOwnProperty.call(value, key); })) {
      throw new Error("快照格式不正确。");
    }
    if (value.formatVersion !== 1 || value.appName !== "Qin" || value.schemaVersion !== 1 ||
      typeof value.appVersion !== "string" || !value.appVersion) {
      throw new Error("快照格式不正确。");
    }
    if (typeof value.sourceDeviceId !== "string" || !value.sourceDeviceId) throw new Error("来源设备不正确。");
    if (!isStrictIsoDate(value.clientCreatedAt)) throw new Error("快照时间不正确。");
    if (typeof value.dataHash !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.dataHash)) {
      throw new Error("快照哈希不正确。");
    }
  }

  function freezeEnvelope(fields, data) {
    return Object.freeze({
      formatVersion: 1,
      appName: "Qin",
      schemaVersion: 1,
      appVersion: fields.appVersion,
      sourceDeviceId: fields.sourceDeviceId,
      clientCreatedAt: fields.clientCreatedAt,
      dataHash: fields.dataHash,
      data: Object.freeze(data)
    });
  }

  function createCore(dependencies) {
    var config = dependencies || {};
    var validateManagedData = config.validateManagedData || defaultValidateManagedData;
    var sha256 = config.sha256 || defaultSha256;

    function normalizedData(data) {
      validateManagedData(data);
      return JSON.parse(canonicalStringify(data));
    }

    async function hashData(data) {
      return bytesToBase64Url(await sha256(canonicalStringify(data)));
    }

    async function createSnapshotEnvelope(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("快照格式不正确。");
      var fields = {
        formatVersion: 1,
        appName: "Qin",
        schemaVersion: 1,
        appVersion: input.appVersion,
        sourceDeviceId: input.sourceDeviceId,
        clientCreatedAt: input.clientCreatedAt,
        dataHash: "___________________________________________",
        data: input.data
      };
      assertEnvelopeShape(fields);
      var data = normalizedData(input.data);
      fields.dataHash = await hashData(data);
      var envelope = freezeEnvelope(fields, data);
      if (byteLength(canonicalStringify(envelope)) > MAX_PLAINTEXT_BYTES) {
        throw new Error("快照明文不能超过 10 MiB。");
      }
      return envelope;
    }

    async function validateSnapshotEnvelope(value) {
      assertEnvelopeShape(value);
      var data = normalizedData(value.data);
      if (byteLength(canonicalStringify(value)) > MAX_PLAINTEXT_BYTES) {
        throw new Error("快照明文不能超过 10 MiB。");
      }
      if (await hashData(data) !== value.dataHash) throw new Error("快照哈希不匹配。");
      return freezeEnvelope(value, data);
    }

    function assertVersionAllowed(appVersion, limits, operation) {
      if (operation !== "read" && operation !== "write") throw new Error("同步操作不正确。");
      if (!limits || typeof limits !== "object") throw new Error("请先更新工具后再继续同步。");
      var minimum = operation === "write" ? limits.minimumWriteVersion : limits.minimumReadVersion;
      try {
        if (compareVersions(appVersion, minimum) < 0) throw new Error("请先更新工具后再继续同步。");
      } catch (error) {
        if (error && error.message === "请先更新工具后再继续同步。") throw error;
        throw new Error("请先更新工具后再继续同步。");
      }
    }

    function sortSnapshotSources(rows) {
      if (!Array.isArray(rows)) throw new Error("快照来源列表不正确。");
      return rows.slice().sort(function (left, right) {
        return Number(right.serverCreatedAt) - Number(left.serverCreatedAt);
      });
    }

    return {
      canonicalStringify: canonicalStringify,
      createSnapshotEnvelope: createSnapshotEnvelope,
      validateSnapshotEnvelope: validateSnapshotEnvelope,
      compareVersions: compareVersions,
      assertVersionAllowed: assertVersionAllowed,
      sortSnapshotSources: sortSnapshotSources,
      MAX_PLAINTEXT_BYTES: MAX_PLAINTEXT_BYTES
    };
  }

  var core = createCore();
  core.createCore = createCore;
  return core;
});
