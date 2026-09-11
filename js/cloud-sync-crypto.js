/**
 * 云同步加密基础层。仅使用 Web Crypto，不访问网络、存储或日志。
 * 密钥均为无填充 base64url；调用者负责密钥生命周期，不能持久化明文密钥。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.QinshiCloudSyncCrypto = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var ITERATIONS = 600000;
  var MAX_CHUNK_BYTES = 524288;
  var MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
  var AAD_FIELDS = ["spaceId", "sourceDeviceId", "snapshotId", "formatVersion", "appVersion", "clientCreatedAt", "dataHash"];
  var ENVELOPE_AAD_FIELDS = ["sourceDeviceId", "formatVersion", "appVersion", "clientCreatedAt", "dataHash"];

  function bytesToBase64url(bytes) {
    var binary = "";
    for (var offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 32768));
    }
    return root.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64urlToBytes(value, length) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
      throw new Error("base64url 格式不正确。");
    }
    var binary = root.atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
    var bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
    if (bytesToBase64url(bytes) !== value || (length !== undefined && bytes.length !== length)) {
      throw new Error("base64url 长度或编码不正确。");
    }
    return bytes;
  }

  function canonical(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
    if (Array.isArray(value)) {
      var parts = [];
      for (var index = 0; index < value.length; index += 1) {
        // Preserve holes as JSON null; explicit unsupported values still fail closed.
        parts.push(index in value ? canonical(value[index]) : "null");
      }
      return "[" + parts.join(",") + "]";
    }
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + canonical(value[key]);
      }).join(",") + "}";
    }
    throw new Error("AAD 格式不正确。");
  }

  function createCrypto(dependencies) {
    var config = dependencies || {};
    var crypto = config.crypto || root.crypto;
    var Compression = Object.prototype.hasOwnProperty.call(config, "CompressionStream") ? config.CompressionStream : root.CompressionStream;
    var Decompression = Object.prototype.hasOwnProperty.call(config, "DecompressionStream") ? config.DecompressionStream : root.DecompressionStream;
    var encoder = new TextEncoder();

    function requireCrypto() {
      if (!crypto || !crypto.subtle || typeof crypto.getRandomValues !== "function") throw new Error("Web Crypto 不可用。");
    }

    function randomBytes(length) {
      requireCrypto();
      return crypto.getRandomValues(new Uint8Array(length));
    }

    function randomId(bytes) {
      if (bytes === undefined) bytes = 16;
      if (!Number.isInteger(bytes) || bytes < 16 || bytes > 65536) throw new Error("随机标识长度不正确。");
      return bytesToBase64url(randomBytes(bytes));
    }

    function generateMasterKey() { return randomId(32); }

    function generateKdfParams() {
      return { salt: randomId(16), iterations: ITERATIONS, hash: "SHA-256", kdf: "PBKDF2-HMAC-SHA-256", version: 1 };
    }

    async function sha256(bytes) {
      requireCrypto();
      return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    }

    async function recoveryChecksum(bytes) {
      return Array.from((await sha256(bytes)).subarray(0, 4), function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("").toUpperCase();
    }

    async function generateRecoveryKey() {
      var bytes = randomBytes(32);
      var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("").toUpperCase();
      var display = hex + await recoveryChecksum(bytes);
      return { recoveryKey: bytesToBase64url(bytes), displayKey: display.match(/.{8}/g).join("-") };
    }

    async function parseRecoveryKey(display) {
      if (typeof display !== "string" || !/^(?:[0-9A-Fa-f]{8}-){8}[0-9A-Fa-f]{8}$/.test(display)) throw new Error("恢复密钥校验失败。");
      var compact = display.replace(/-/g, "").toUpperCase();
      var bytes = Uint8Array.from(compact.slice(0, 64).match(/../g), function (pair) { return parseInt(pair, 16); });
      if (await recoveryChecksum(bytes) !== compact.slice(64)) throw new Error("恢复密钥校验失败。");
      return bytesToBase64url(bytes);
    }

    async function derivePurposeKeys(material, saltBytes, purpose) {
      var key = await crypto.subtle.importKey("raw", material, "HKDF", false, ["deriveBits"]);
      async function derive(label) {
        return bytesToBase64url(new Uint8Array(await crypto.subtle.deriveBits({
          name: "HKDF", hash: "SHA-256", salt: saltBytes,
          info: encoder.encode("qinshi-sync/" + purpose + "-" + label + "/v1")
        }, key, 256)));
      }
      return { authKey: await derive("auth"), wrappingKey: await derive("wrap") };
    }

    async function derivePasswordKeys(password, params) {
      requireCrypto();
      if (typeof password !== "string" || !password || !params || params.iterations !== ITERATIONS ||
        params.hash !== "SHA-256" || params.kdf !== "PBKDF2-HMAC-SHA-256" || params.version !== 1) {
        throw new Error("密码派生参数不正确。");
      }
      var saltBytes = base64urlToBytes(params.salt, 16);
      var passwordBytes = encoder.encode(password);
      var material;
      try {
        var key = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
        material = new Uint8Array(await crypto.subtle.deriveBits({
          name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: ITERATIONS
        }, key, 256));
        return await derivePurposeKeys(material, saltBytes, "password");
      } finally {
        passwordBytes.fill(0);
        if (material) material.fill(0);
      }
    }

    async function deriveRecoveryKeys(recoveryKey, salt) {
      requireCrypto();
      var saltBytes = base64urlToBytes(salt, 16);
      var material = base64urlToBytes(recoveryKey, 32);
      try { return await derivePurposeKeys(material, saltBytes, "recovery"); }
      finally { material.fill(0); }
    }

    async function aesKey(rawKey, usage) {
      requireCrypto();
      var bytes = base64urlToBytes(rawKey, 32);
      try { return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [usage]); }
      finally { bytes.fill(0); }
    }

    function authenticatedBytes(kind, record, aad) {
      return encoder.encode(canonical(["qinshi-sync/" + kind + "/v1", record.version, record.algorithm,
        kind === "snapshot" ? record.encoding : null, aad]));
    }

    function validateRecord(record, snapshot) {
      if (!record || record.version !== 1 || record.algorithm !== "AES-256-GCM" ||
        (snapshot && record.encoding !== "identity" && record.encoding !== "gzip")) throw new Error("密文记录不正确。");
    }

    async function encrypt(bytes, key, kind, aad, encoding) {
      var record = { version: 1, algorithm: "AES-256-GCM", iv: bytesToBase64url(randomBytes(12)) };
      if (kind === "snapshot") record.encoding = encoding;
      record.ciphertext = bytesToBase64url(new Uint8Array(await crypto.subtle.encrypt({
        name: "AES-GCM", iv: base64urlToBytes(record.iv, 12), tagLength: 128,
        additionalData: authenticatedBytes(kind, record, aad)
      }, await aesKey(key, "encrypt"), bytes)));
      return record;
    }

    async function decrypt(record, key, kind, aad) {
      validateRecord(record, kind === "snapshot");
      var iv = base64urlToBytes(record.iv, 12);
      var ciphertext = base64urlToBytes(record.ciphertext);
      if (ciphertext.length < 16) throw new Error("密文长度不正确。");
      return new Uint8Array(await crypto.subtle.decrypt({
        name: "AES-GCM", iv: iv, tagLength: 128, additionalData: authenticatedBytes(kind, record, aad)
      }, await aesKey(key, "decrypt"), ciphertext));
    }

    async function wrapMasterKey(masterKey, wrappingKey, aad) {
      if (aad === undefined || aad === null || aad === "") throw new Error("主密钥 AAD 不能为空。");
      var bytes = base64urlToBytes(masterKey, 32);
      try { return await encrypt(bytes, wrappingKey, "master-key", aad); }
      finally { bytes.fill(0); }
    }

    async function unwrapMasterKey(record, wrappingKey, aad) {
      var bytes;
      try {
        if (aad === undefined || aad === null || aad === "") throw new Error();
        bytes = await decrypt(record, wrappingKey, "master-key", aad);
        if (bytes.length !== 32) throw new Error();
        return bytesToBase64url(bytes);
      } catch (error) { throw new Error("主密钥校验失败。"); }
      finally { if (bytes) bytes.fill(0); }
    }

    function snapshotAad(fields) {
      if (!fields || fields.formatVersion !== 1) throw new Error("快照 AAD 不正确。");
      return AAD_FIELDS.map(function (field) {
        if (field !== "formatVersion" && (typeof fields[field] !== "string" || !fields[field])) throw new Error("快照 AAD 不正确。");
        if (field === "dataHash") base64urlToBytes(fields[field], 32);
        return fields[field];
      });
    }

    function assertEnvelopeMatches(envelope, fields) {
      if (!envelope || !ENVELOPE_AAD_FIELDS.every(function (field) { return envelope[field] === fields[field]; })) {
        throw new Error("快照与 AAD 不匹配。");
      }
    }

    async function transform(bytes, Stream, limit) {
      var reader = new Blob([bytes]).stream().pipeThrough(new Stream("gzip")).getReader();
      var parts = [];
      var length = 0;
      try {
        while (true) {
          var item = await reader.read();
          if (item.done) break;
          length += item.value.length;
          if (length > limit) throw new Error("快照超过大小限制。");
          parts.push(item.value);
        }
      } catch (error) {
        await reader.cancel().catch(function () {});
        throw error;
      } finally { reader.releaseLock(); }
      var output = new Uint8Array(length);
      var offset = 0;
      parts.forEach(function (part) { output.set(part, offset); offset += part.length; });
      return output;
    }

    async function encryptSnapshot(envelope, masterKey, fields) {
      var aad = snapshotAad(fields);
      assertEnvelopeMatches(envelope, fields);
      var bytes = encoder.encode(JSON.stringify(envelope));
      if (bytes.length > MAX_PLAINTEXT_BYTES) throw new Error("快照明文不能超过 10 MiB。");
      var encoding = typeof Compression === "function" && typeof Decompression === "function" ? "gzip" : "identity";
      // Failure is fatal; never silently downgrade a chosen encoding.
      if (encoding === "gzip") bytes = await transform(bytes, Compression, MAX_PLAINTEXT_BYTES + MAX_CHUNK_BYTES);
      return encrypt(bytes, masterKey, "snapshot", aad, encoding);
    }

    async function decryptSnapshot(record, masterKey, fields) {
      try {
        var aad = snapshotAad(fields);
        var bytes = await decrypt(record, masterKey, "snapshot", aad);
        if (record.encoding === "gzip") {
          if (typeof Decompression !== "function") throw new Error();
          bytes = await transform(bytes, Decompression, MAX_PLAINTEXT_BYTES);
        }
        if (bytes.length > MAX_PLAINTEXT_BYTES) throw new Error();
        var envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        assertEnvelopeMatches(envelope, fields);
        // The core module must validate schema, managed-data allowlist and dataHash before import.
        return envelope;
      } catch (error) { throw new Error("快照校验失败。"); }
    }

    async function chunkCiphertext(bytes, chunkSize) {
      if (chunkSize === undefined) chunkSize = MAX_CHUNK_BYTES;
      if (!(bytes instanceof Uint8Array) || !Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_BYTES) {
        throw new Error("密文分块参数不正确。");
      }
      bytes = bytes.slice();
      var chunks = [];
      for (var offset = 0; offset < bytes.length || (offset === 0 && bytes.length === 0); offset += chunkSize) {
        var part = bytes.subarray(offset, offset + chunkSize);
        chunks.push({ index: chunks.length, byteLength: part.length, data: bytesToBase64url(part), digest: bytesToBase64url(await sha256(part)) });
      }
      return { chunks: chunks, digest: bytesToBase64url(await sha256(bytes)), byteLength: bytes.length };
    }

    async function joinAndVerifyChunks(chunks, digest) {
      try {
        base64urlToBytes(digest, 32);
        if (!Array.isArray(chunks) || !chunks.length) throw new Error();
        var parts = [];
        var length = 0;
        for (var index = 0; index < chunks.length; index += 1) {
          var chunk = chunks[index];
          if (!chunk || chunk.index !== index || !Number.isInteger(chunk.byteLength) || chunk.byteLength < 0 ||
            chunk.byteLength > MAX_CHUNK_BYTES || (chunk.byteLength === 0 && chunks.length !== 1) ||
            typeof chunk.data !== "string" || chunk.data.length > Math.ceil(MAX_CHUNK_BYTES * 4 / 3)) throw new Error();
          var bytes = base64urlToBytes(chunk.data, chunk.byteLength);
          base64urlToBytes(chunk.digest, 32);
          if (bytesToBase64url(await sha256(bytes)) !== chunk.digest) throw new Error();
          parts.push(bytes);
          length += bytes.length;
        }
        // Allocate the joined ciphertext only after every individual chunk is verified.
        var joined = new Uint8Array(length);
        var offset = 0;
        parts.forEach(function (part) { joined.set(part, offset); offset += part.length; });
        if (bytesToBase64url(await sha256(joined)) !== digest) throw new Error();
        return joined;
      } catch (error) { throw new Error("密文分块校验失败。"); }
    }

    return {
      randomId: randomId, generateMasterKey: generateMasterKey, generateKdfParams: generateKdfParams,
      generateRecoveryKey: generateRecoveryKey, parseRecoveryKey: parseRecoveryKey,
      derivePasswordKeys: derivePasswordKeys, deriveRecoveryKeys: deriveRecoveryKeys,
      wrapMasterKey: wrapMasterKey, unwrapMasterKey: unwrapMasterKey,
      encryptSnapshot: encryptSnapshot, decryptSnapshot: decryptSnapshot,
      chunkCiphertext: chunkCiphertext, joinAndVerifyChunks: joinAndVerifyChunks
    };
  }

  var api = createCrypto();
  api.createCrypto = createCrypto;
  return api;
});
