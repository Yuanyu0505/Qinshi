"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createApi, CloudSyncApiError } = require("./cloud-sync-api.js");

const pairing = { deviceId: "device-1", deviceToken: "test-token" };
function reply(status, body, headers) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
function failure(status, code, headers) {
  return reply(status, { error: { code, message: "untrusted-private-response", retryable: true } }, headers);
}
function interruptedResponse() {
  return new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"private":"partial')); },
    pull(controller) { controller.error(new TypeError("private-body-transport-detail")); }
  }), { status: 200 });
}
function setup(steps, options = {}) {
  const calls = [], delays = [];
  const api = createApi({ enabled: true, apiBaseUrl: "https://sync.example.test/", appVersion: "1.0.39", pairing,
    sleep: async milliseconds => { delays.push(milliseconds); },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      assert.ok(steps.length, "Unexpected extra request");
      const step = steps.shift();
      if (step instanceof Error) throw step;
      return typeof step === "function" ? step(init) : step;
    }, ...options });
  return { api, calls, delays };
}

test("GET retries network and 503 at most twice using backoff", async () => {
  const { api, calls, delays } = setup([new TypeError("private-url"), failure(503, "FREE_QUOTA_EXHAUSTED"), reply(200, { ok: true })]);
  assert.deepEqual(await api.health(), { ok: true });
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [500, 1500]);
  assert.equal(calls[0].url, "https://sync.example.test/v1/health");
});

test('security replay pairing override uses original token for retries and dual-auth confirmation only', async () => {
  for (const method of ['changePassword', 'rotateRecoveryKey', 'deleteSpace']) {
    const original = { deviceId: 'original', deviceToken: 'original-token' };
    const h = setup([new TypeError('lost'), failure(401, 'AUTH_FAILED'), reply(200, { devices: [] }), reply(204)], {
      getPairing: async () => ({ deviceId: 'current', deviceToken: 'current-token' })
    });
    await assert.rejects(h.api[method]({ authKey: 'derived' }, 'same-op', { pairing: original }), { code: 'AUTH_FAILED' });
    for (const call of h.calls) assert.equal(call.headers.Authorization, 'Device original.original-token');
    assert.equal(h.calls[0].body, h.calls[1].body);
    assert.equal(h.calls[0].headers['Idempotency-Key'], 'same-op');
    assert.equal(h.calls[2].method, 'GET');
    await h.api[method]({ authKey: 'derived' }, 'new-op');
    assert.equal(h.calls.at(-1).headers.Authorization, 'Device current.current-token');
  }
});

test('delete receipt replay accepts absent storage pairing only with valid explicit override and operation key', async () => {
  const h = setup([reply(204)], { getPairing: async () => null });
  await assert.rejects(h.api.deleteSpace({}, 'same-op'), { code: 'PAIRING_REQUIRED' });
  await assert.rejects(h.api.deleteSpace({}, 'same-op', { pairing: { deviceId: 'bad\n', deviceToken: 't' } }), { code: 'PAIRING_REQUIRED' });
  await assert.rejects(h.api.deleteSpace({}, undefined, { pairing }), { code: 'INVALID_REQUEST' });
  await h.api.deleteSpace({ confirmation: '永久删除同步空间' }, 'same-op', { pairing });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].headers.Authorization, 'Device device-1.test-token');
});

test("upload writes preserve auth, version, serialized body and idempotency key across retries", async () => {
  const { api, calls } = setup([new TypeError("offline"), reply(200, { uploadId: "upload-1" })]);
  const body = { appVersion: "1.0.39", ciphertextDigest: "opaque" };
  assert.deepEqual(await api.createUpload(body, "stable-op-id"), { uploadId: "upload-1" });
  for (const call of calls) {
    assert.equal(call.method, "POST");
    assert.equal(call.headers["X-Qin-App-Version"], "1.0.39");
    assert.equal(call.headers.Authorization, "Device device-1.test-token");
    assert.equal(call.headers["Idempotency-Key"], "stable-op-id");
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.equal(call.body, JSON.stringify(body));
    assert.equal(call.credentials, "omit");
    assert.equal(call.redirect, "error");
    assert.equal(call.cache, "no-store");
    assert.equal(call.referrerPolicy, "no-referrer");
  }
});

test("public lifecycle writes generate one key per operation without sending device credentials", async () => {
  let serial = 0;
  const { api, calls } = setup([new TypeError("offline"), reply(201, { spaceId: "s" }), reply(201, { spaceId: "t" })], {
    randomUUID: () => "operation-" + (++serial)
  });
  await api.createSpace({ authKey: "opaque" });
  await api.createSpace({ authKey: "different" });
  assert.deepEqual(calls.map(call => call.headers["Idempotency-Key"]), ["operation-1", "operation-1", "operation-2"]);
  assert.ok(calls.every(call => !Object.hasOwn(call.headers, "Authorization")));
});

test("chunk PUT is retryable without a key and downloads return bytes", async () => {
  const bytes = new Uint8Array([1, 2, 255]);
  const { api, calls } = setup([failure(429, "AUTH_COOLDOWN"), reply(204), new Response(bytes)]);
  assert.equal(await api.putChunk("upload-1", 2, bytes, "A".repeat(43)), null);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.method, "PUT");
    assert.equal(call.url, "https://sync.example.test/v1/uploads/upload-1/chunks/2");
    assert.equal(call.headers["X-Chunk-SHA256"], "A".repeat(43));
    assert.equal(call.headers["Content-Type"], "application/octet-stream");
    assert.deepEqual(call.body, bytes);
    assert.ok(!Object.hasOwn(call.headers, "Idempotency-Key"));
  }
  assert.deepEqual(new Uint8Array(await api.getChunk("snapshot-1", 2)), bytes);
});

test("non-idempotent device mutations never retry even for network, 429, or 503", async () => {
  for (const step of [new TypeError("offline"), failure(429, "AUTH_COOLDOWN"), failure(503, "FREE_QUOTA_EXHAUSTED")]) {
    for (const operation of [api => api.renameDevice("device-2", { encryptedName: {} }), api => api.revokeDevice("device-2", { deleteSnapshots: false })]) {
      const { api, calls, delays } = setup([step]);
      await assert.rejects(operation(api), error => error instanceof CloudSyncApiError && error.retryable === false);
      assert.equal(calls.length, 1);
      assert.deepEqual(delays, []);
    }
  }
});

test('chunk detail downloads preserve validated server digest for verification', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const digest = 'A'.repeat(43);
  const { api } = setup([new Response(bytes, { headers: { 'X-Chunk-SHA256': digest } })]);
  const result = await api.getChunk('snapshot', 0, { withDigest: true });
  assert.deepEqual(new Uint8Array(result.bytes), bytes);
  assert.equal(result.digest, digest);
});

test('chunk detail downloads reject missing and malformed digest headers', async () => {
  for (const digest of [null, 'bad', 'B'.repeat(43)]) {
    const { api } = setup([new Response(new Uint8Array([1]), { headers: digest ? { 'X-Chunk-SHA256': digest } : {} })]);
    await assert.rejects(api.getChunk('snapshot', 0, { withDigest: true }), error => error.code === 'INVALID_RESPONSE');
  }
});

test("Retry-After seconds and HTTP dates are honored without shortening backoff", async () => {
  const { api, delays } = setup([
    failure(429, "AUTH_COOLDOWN", { "Retry-After": "2" }),
    failure(503, "FREE_QUOTA_EXHAUSTED", { "Retry-After": "Sun, 13 Sep 2026 00:00:04 GMT" }), reply(200, {})
  ], { now: () => Date.parse("2026-09-13T00:00:00Z") });
  await api.health();
  assert.deepEqual(delays, [2000, 4000]);
  const fallback = setup([failure(503, "FREE_QUOTA_EXHAUSTED", { "Retry-After": "invalid" }), failure(503, "FREE_QUOTA_EXHAUSTED", { "Retry-After": "0" }), reply(200, {})]);
  await fallback.api.health();
  assert.deepEqual(fallback.delays, [500, 1500]);
});

test("exhausted offline and quota retries expose only safe dedicated errors", async () => {
  for (const [steps, code, text] of [
    [Array.from({ length: 3 }, () => new TypeError("secret-url-token")), "OFFLINE", /网络/],
    [Array.from({ length: 3 }, () => failure(503, "FREE_QUOTA_EXHAUSTED")), "FREE_QUOTA_EXHAUSTED", /额度/]
  ]) {
    const { api, calls } = setup(steps);
    await assert.rejects(api.health(), error => error.code === code && text.test(error.message) && !/secret|untrusted/.test(String(error)));
    assert.equal(calls.length, 3);
  }
});

test("401 on a paired endpoint becomes invalid pairing without deleting storage", async () => {
  for (const code of ["AUTH_FAILED", "DEVICE_REVOKED", "UNKNOWN"]) {
    const { api, calls, delays } = setup([failure(401, code)]);
    await assert.rejects(api.listDevices(), error => error.code === "DEVICE_REVOKED" && error.pairingInvalid && !error.retryable && /重新配对/.test(error.message));
    assert.equal(calls.length, 1);
    assert.deepEqual(delays, []);
    assert.deepEqual(pairing, { deviceId: "device-1", deviceToken: "test-token" });
  }
});

test("dual-auth 401 preserves pairing when a single device-only confirmation succeeds", async () => {
  for (const method of ["changePassword", "rotateRecoveryKey", "deleteSpace"]) {
    let pairingReads = 0;
    const { api, calls, delays } = setup([
      failure(401, "AUTH_FAILED"), reply(200, { devices: [] })
    ], { getPairing: async () => { pairingReads++; return { deviceId: "device", deviceToken: "token-" + pairingReads }; } });
    await assert.rejects(api[method]({ authKey: "wrong-private-auth" }, "security-key"), { code: "AUTH_FAILED", status: 401, pairingInvalid: false, retryable: false });
    assert.equal(pairingReads, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, []);
    assert.equal(calls[1].url, "https://sync.example.test/v1/devices");
    assert.equal(calls[1].method, "GET");
    assert.deepEqual(calls[1].headers, { "X-Qin-App-Version": "1.0.39", Authorization: "Device device.token-1" });
    assert.equal(calls[1].body, undefined);
    assert.equal(calls[0].headers["Idempotency-Key"], "security-key");
  }
});

test("dual-auth 401 marks revoked only after one device-only confirmation also returns 401", async () => {
  for (const method of ["changePassword", "rotateRecoveryKey", "deleteSpace"]) {
    const { api, calls, delays } = setup([failure(401, "AUTH_FAILED"), failure(401, "AUTH_FAILED")]);
    await assert.rejects(api[method]({}, "security-key"), { code: "DEVICE_REVOKED", status: 401, pairingInvalid: true, retryable: false });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "GET");
    assert.equal(calls[1].url, "https://sync.example.test/v1/devices");
    assert.deepEqual(delays, []);
  }
});

test("dual-auth confirmation failures preserve original auth failure without retries or recursive probes", async () => {
  const responses = [() => new TypeError("private-network-detail"), () => failure(503, "FREE_QUOTA_EXHAUSTED"),
    () => failure(429, "AUTH_COOLDOWN"), () => new Response("private-malformed-json"),
    () => reply(200, null), () => interruptedResponse()];
  for (const method of ["changePassword", "rotateRecoveryKey", "deleteSpace"]) {
    for (const response of responses) {
      const { api, calls, delays } = setup([failure(401, "AUTH_FAILED"), response()]);
      await assert.rejects(api[method]({}, "security-key"), error => error.code === "AUTH_FAILED" && error.status === 401 &&
        !error.pairingInvalid && !error.retryable && !/private|untrusted/.test(error.message + JSON.stringify(error)));
      assert.equal(calls.length, 2);
      assert.equal(calls[1].method, "GET");
      assert.deepEqual(delays, []);
    }
  }
});

test("public pair and recovery 401 never probe or invalidate an existing pairing", async () => {
  for (const method of ["pair", "recover"]) {
    const { api, calls } = setup([failure(401, "AUTH_FAILED")]);
    await assert.rejects(api[method]("ABCD", {}, "public-key"), { code: "AUTH_FAILED", pairingInvalid: false });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.Authorization, undefined);
  }
});

test("public auth failures, old versions and deleted snapshots remain distinguishable", async () => {
  for (const [status, serverCode, invoke, expectedCode, text] of [
    [401, "AUTH_FAILED", api => api.pair("ABCD", {}, "pair-key"), "AUTH_FAILED", /验证/],
    [426, "UPGRADE_REQUIRED", api => api.listDevices(), "UPGRADE_REQUIRED", /更新/],
    [404, "NOT_FOUND", api => api.getSnapshot("removed"), "SOURCE_DELETED", /删除/],
    [404, "NOT_FOUND", api => api.getChunk("removed", 0), "SOURCE_DELETED", /删除/],
    [404, "NOT_FOUND", api => api.listDevices(), "NOT_FOUND", /不存在/],
    [500, "INTERNAL_ERROR", api => api.health(), "INTERNAL_ERROR", /服务/],
    [409, "IDEMPOTENCY_CONFLICT", api => api.createUpload({}, "old"), "IDEMPOTENCY_CONFLICT", /重复/]
  ]) {
    const { api, calls } = setup([failure(status, serverCode)]);
    await assert.rejects(invoke(api), error => error.code === expectedCode && text.test(error.message) && !error.pairingInvalid);
    assert.equal(calls.length, 1);
  }
});

test("disabled or unsafe base URL fails closed before fetch", async () => {
  const cases = [{ enabled: false }, { apiBaseUrl: "" }, { apiBaseUrl: "http://sync.example.test" },
    { apiBaseUrl: "https://user:password@sync.example.test" }, { apiBaseUrl: "https://sync.example.test/?token=secret" },
    { apiBaseUrl: "https://sync.example.test/#fragment" }, { enabled: "true" }];
  for (const config of cases) {
    const { api, calls } = setup([], config);
    await assert.rejects(api.health(), { code: "SYNC_NOT_CONFIGURED" });
    assert.equal(calls.length, 0);
  }
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve("./cloud-sync-config.js"), "utf8"), context);
  assert.equal(context.QinshiCloudSyncConfig.enabled, false);
  assert.equal(context.QinshiCloudSyncConfig.apiBaseUrl, "");
  assert.ok(Object.isFrozen(context.QinshiCloudSyncConfig));
});

test("missing or malformed pairing cannot send an authenticated request", async () => {
  for (const saved of [null, {}, { deviceId: "id", deviceToken: "bad\r\ntoken" }, { deviceId: 123, deviceToken: 456 }]) {
    const { api, calls } = setup([], { pairing: saved });
    await assert.rejects(api.listDevices(), { code: "PAIRING_REQUIRED" });
    assert.equal(calls.length, 0);
  }
});

test("unsafe paths, indices, operation keys and chunk headers fail before transport", async () => {
  const operations = [
    api => api.getSnapshot(".."), api => api.getSnapshot("\ud800"),
    api => api.getChunk("snapshot", -1), api => api.getChunk("snapshot", 0.5),
    api => api.createUpload({}, ""), api => api.createUpload({}, "injected\r\nheader"),
    api => api.putChunk("upload", 0, new Uint8Array([1]), "bad\r\nheader"),
    api => api.putChunk("upload", 0, new Uint8Array([1]), undefined)
  ];
  for (const invoke of operations) {
    const { api, calls } = setup([]);
    await assert.rejects(invoke(api), { code: "INVALID_REQUEST" });
    assert.equal(calls.length, 0);
  }
});

test("retries retain the original pairing and chunk bytes even when callers mutate them", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  let reads = 0;
  const { api, calls } = setup([
    () => { bytes.fill(0); throw new TypeError("offline"); }, reply(204)
  ], { getPairing: async () => { reads++; return { deviceId: "device", deviceToken: "token-" + reads }; } });
  await api.putChunk("upload", 0, bytes, "A".repeat(43));
  assert.equal(reads, 1);
  assert.deepEqual(calls.map(call => [...call.body]), [[1, 2, 3], [1, 2, 3]]);
  assert.deepEqual(calls.map(call => call.headers.Authorization), ["Device device.token-1", "Device device.token-1"]);
});

test("missing or malformed app versions are rejected before fetch", async () => {
  for (const appVersion of [undefined, "", "1.0.39\r\nsecret", "not-a-version"]) {
    const { api, calls } = setup([], { appVersion });
    await assert.rejects(api.health(), { code: "UPGRADE_REQUIRED" });
    assert.equal(calls.length, 0);
  }
});

test("all endpoint methods use the actual Worker routes and encoded segments", async () => {
  const operations = [
    [api => api.getParameters("AB CD-EF"), "GET", "/v1/spaces/AB%20CD-EF/parameters", false],
    [api => api.pair("ABC", {}, "k"), "POST", "/v1/spaces/ABC/pair", false],
    [api => api.recover("ABC", {}, "k"), "POST", "/v1/spaces/ABC/recover", false],
    [api => api.listDevices(), "GET", "/v1/devices", true],
    [api => api.renameDevice("other", { encryptedName: "opaque" }), "PATCH", "/v1/devices/other", true],
    [api => api.revokeDevice("other", { deleteSnapshots: true }), "DELETE", "/v1/devices/other", true],
    [api => api.commitUpload("upload", {}, "k"), "POST", "/v1/uploads/upload/commit", true],
    [api => api.getSnapshot("snapshot"), "GET", "/v1/snapshots/snapshot", true],
    [api => api.changePassword({}, "k"), "POST", "/v1/security/password", true],
    [api => api.rotateRecoveryKey({}, "k"), "POST", "/v1/security/recovery-key", true],
    [api => api.deleteSpace({}, "k"), "DELETE", "/v1/spaces/current", true]
  ];
  for (const [invoke, method, path, authenticated] of operations) {
    const { api, calls } = setup([reply(200, { ok: true })], { apiBaseUrl: "https://sync.example.test/base///" });
    assert.deepEqual(await invoke(api), { ok: true });
    assert.equal(calls[0].url, "https://sync.example.test/base" + path);
    assert.equal(calls[0].method, method);
    assert.equal(Object.hasOwn(calls[0].headers, "Authorization"), authenticated);
  }
});

test("the 15-second timeout covers headers and response body, aborting each attempt", async () => {
  for (const stalledBody of [false, true]) {
    const timers = new Map(), calls = [];
    let timerId = 0;
    const api = createApi({ enabled: true, apiBaseUrl: "https://sync.example.test", appVersion: "1.0.39", sleep: async () => {},
      setTimeout: (callback, ms) => { assert.equal(ms, 15000); timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id),
      fetch: async (url, init) => {
        calls.push(init);
        if (stalledBody) return { ok: true, status: 200, json: () => new Promise(() => {}) };
        return new Promise(() => {});
      }
    });
    const result = assert.rejects(api.health(), { code: "TIMEOUT" });
    for (let index = 0; index < 3; index++) {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(timers.size, 1);
      [...timers.values()][0]();
    }
    await result;
    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.signal.aborted));
    assert.equal(timers.size, 0);
  }
});

test("malformed success JSON and unknown server errors do not leak or trigger network retries", async () => {
  for (const step of [new Response("private-ciphertext", { status: 200 }), failure(400, "secret-code-token")]) {
    const { api, calls } = setup([step]);
    await assert.rejects(api.health(), error => ["INVALID_RESPONSE", "HTTP_ERROR"].includes(error.code) && !/private|secret|untrusted/.test(JSON.stringify(error) + error.message));
    assert.equal(calls.length, 1);
  }
});

test("JSON body interruptions retry only safe operations with unchanged requests", async () => {
  const operations = [
    api => api.health(),
    api => api.createUpload({ ciphertextDigest: "opaque" }, "body-retry-key"),
    api => api.putChunk("upload", 0, new Uint8Array([1, 2, 3]), "A".repeat(43))
  ];
  for (const invoke of operations) {
    const { api, calls, delays } = setup([interruptedResponse(), interruptedResponse(), reply(200, { ok: true })]);
    assert.deepEqual(await invoke(api), { ok: true });
    assert.equal(calls.length, 3);
    assert.deepEqual(delays, [500, 1500]);
    for (const call of calls.slice(1)) {
      assert.equal(call.url, calls[0].url);
      assert.equal(call.method, calls[0].method);
      assert.deepEqual(call.headers, calls[0].headers);
      assert.deepEqual(call.body, calls[0].body);
    }
  }
});

test("binary body interruptions retry downloads and retain the request", async () => {
  const { api, calls, delays } = setup([interruptedResponse(), new Response(new Uint8Array([4, 5, 6]))]);
  assert.deepEqual(new Uint8Array(await api.getChunk("snapshot", 0)), new Uint8Array([4, 5, 6]));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://sync.example.test/v1/snapshots/snapshot/chunks/0");
  assert.deepEqual(calls[1].headers, calls[0].headers);
  assert.deepEqual(delays, [500]);
});

test("non-idempotent body interruptions never retry and exhausted safe retries stay sanitized", async () => {
  const unsafe = setup([interruptedResponse()]);
  await assert.rejects(unsafe.api.renameDevice("other", { encryptedName: {} }), { code: "OFFLINE", retryable: false });
  assert.equal(unsafe.calls.length, 1);
  assert.deepEqual(unsafe.delays, []);
  const safe = setup([interruptedResponse(), interruptedResponse(), interruptedResponse()]);
  await assert.rejects(safe.api.health(), error => error.code === "OFFLINE" && !/private/.test(error.message + JSON.stringify(error)));
  assert.equal(safe.calls.length, 3);
});

test("complete JSON syntax or shape errors are invalid responses without retry", async () => {
  for (const response of [new Response('{"incomplete":'), reply(200, null), reply(200, []), reply(200, 42)]) {
    const { api, calls, delays } = setup([response]);
    await assert.rejects(api.health(), { code: "INVALID_RESPONSE", retryable: false });
    assert.equal(calls.length, 1);
    assert.deepEqual(delays, []);
  }
});

test("browser global resolves public config, PWA version and latest pairing without logging secrets", async () => {
  const logs = [], calls = [];
  let token = "first-token";
  const context = { URL, AbortController, setTimeout, clearTimeout,
    QinshiCloudSyncConfig: { enabled: true, apiBaseUrl: "https://sync.example.test" }, QinshiPWA: { version: "1.0.40" },
    QinshiCloudSyncStorage: { loadPairing: async () => ({ deviceId: "device-1", deviceToken: token }),
      forgetPairing: () => assert.fail("Transport must not delete pairing") },
    console: Object.fromEntries(["log", "info", "warn", "error", "debug"].map(method => [method, (...args) => logs.push(args)])),
    fetch: async (url, init) => {
      calls.push(init);
      if (init.method === "POST") context.QinshiPWA.version = "1.0.99";
      return failure(401, "AUTH_FAILED");
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("./cloud-sync-api.js"), "utf8"), context);
  await assert.rejects(context.QinshiCloudSyncApi.listDevices(), { code: "DEVICE_REVOKED" });
  token = "second-token";
  await assert.rejects(context.QinshiCloudSyncApi.listDevices(), { code: "DEVICE_REVOKED" });
  assert.equal(calls[0].headers["X-Qin-App-Version"], "1.0.40");
  assert.equal(calls[1].headers.Authorization, "Device device-1.second-token");
  await assert.rejects(context.QinshiCloudSyncApi.changePassword({ authKey: "private-auth" }, "private-op"), { code: "DEVICE_REVOKED" });
  assert.equal(calls.length, 4);
  assert.equal(calls[3].method, "GET");
  assert.equal(calls[3].headers["X-Qin-App-Version"], "1.0.40");
  assert.deepEqual(logs, []);
});
