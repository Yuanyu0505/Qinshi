const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto, createHash } = require("node:crypto");
const cryptoApi = require("./cloud-sync-crypto.js");

// Synthetic fixtures only; these are never credentials for an actual space.
const b64 = bytes => Buffer.from(bytes).toString("base64url");
const unb64 = text => new Uint8Array(Buffer.from(text, "base64url"));
const masterKey = b64(new Uint8Array(32).fill(3));
const salt = b64(new Uint8Array(16).fill(7));
const params = { salt, iterations: 600000, hash: "SHA-256", kdf: "PBKDF2-HMAC-SHA-256", version: 1 };
const envelope = {
  formatVersion: 1, appName: "Qin", schemaVersion: 1, appVersion: "1.0.39",
  sourceDeviceId: "test-device", clientCreatedAt: "2026-09-11T08:00:00.000Z",
  dataHash: createHash("sha256").update('{"qinshi_test":"1"}').digest("base64url"),
  data: { qinshi_test: "1" }
};
const aad = {
  spaceId: "test-space", snapshotId: "test-snapshot", sourceDeviceId: envelope.sourceDeviceId,
  formatVersion: 1, appVersion: envelope.appVersion, clientCreatedAt: envelope.clientCreatedAt,
  dataHash: envelope.dataHash
};
const identity = () => cryptoApi.createCrypto({ crypto: webcrypto, CompressionStream: undefined, DecompressionStream: undefined });
function flip(text) { const bytes = unb64(text); bytes[0] ^= 1; return b64(bytes); }

test("password derivation matches independent 600000-iteration vectors and rejects downgrade records", async () => {
  const result = await cryptoApi.derivePasswordKeys("test-only password", params);
  assert.equal(result.authKey, "e2kZR7brKE02p4Bu-KwI1dXjbuGYwOPxpG7mgmT3W5Q");
  assert.equal(result.wrappingKey, "0THT9bG0X_3R1GxLpyf_1U4oq0LorsGAhWDlqD4QNas");
  const generated = cryptoApi.generateKdfParams();
  assert.equal(unb64(generated.salt).length, 16);
  assert.equal(generated.iterations, 600000);
  for (const change of [{ iterations: 1 }, { iterations: 599999 }, { iterations: 600001 }, { hash: "SHA-1" },
    { kdf: "PBKDF2" }, { version: 2 }, { salt: b64(new Uint8Array(15)) }]) {
    await assert.rejects(() => cryptoApi.derivePasswordKeys("test-only password", { ...params, ...change }));
  }
});

test("recovery derivation uses the public space salt and distinct purpose labels", async () => {
  const recovery = b64(new Uint8Array(32).fill(9));
  const result = await cryptoApi.deriveRecoveryKeys(recovery, salt);
  assert.equal(result.authKey, "_aMiRdBwboSCENgQ1DUwz3rXYnwH5-wSOyPeF6JGYYs");
  assert.equal(result.wrappingKey, "Sy-Y5_w-X4hZYfM2HpgNBLMwGRXf5kM36f51VtGNGXM");
  assert.notDeepEqual(result, await cryptoApi.deriveRecoveryKeys(recovery, b64(new Uint8Array(16).fill(8))));
  await assert.rejects(() => cryptoApi.deriveRecoveryKeys(b64(new Uint8Array(31)), salt));
});

test("random identifiers, master keys, and public salts have required entropy sizes", () => {
  assert.equal(unb64(cryptoApi.randomId()).length, 16);
  assert.equal(unb64(cryptoApi.randomId(32)).length, 32);
  assert.equal(unb64(cryptoApi.generateMasterKey()).length, 32);
  assert.notEqual(cryptoApi.randomId(), cryptoApi.randomId());
  assert.notEqual(cryptoApi.generateMasterKey(), cryptoApi.generateMasterKey());
  for (const length of [0, 15, 1.5, NaN, 65537]) assert.throws(() => cryptoApi.randomId(length));
});

test("recovery display is grouped, round trips all 32 bytes, and rejects every changed character", async () => {
  const generated = await cryptoApi.generateRecoveryKey();
  assert.equal(unb64(generated.recoveryKey).length, 32);
  assert.match(generated.displayKey, /^(?:[0-9A-F]{8}-){8}[0-9A-F]{8}$/);
  assert.equal(await cryptoApi.parseRecoveryKey(generated.displayKey), generated.recoveryKey);
  for (let i = 0; i < generated.displayKey.length; i++) {
    if (generated.displayKey[i] === "-") continue;
    const changed = generated.displayKey.slice(0, i) + (generated.displayKey[i] === "0" ? "1" : "0") + generated.displayKey.slice(i + 1);
    await assert.rejects(() => cryptoApi.parseRecoveryKey(changed), /校验/);
  }
  await assert.rejects(() => cryptoApi.parseRecoveryKey(generated.displayKey.slice(1)), /校验/);
});

test("master key wrapping round trips, uses fresh 12-byte IVs, and rejects key, AAD, ciphertext and header changes", async () => {
  const keys = await cryptoApi.deriveRecoveryKeys(b64(new Uint8Array(32).fill(9)), salt);
  const record = await cryptoApi.wrapMasterKey(masterKey, keys.wrappingKey, "space/test/master/v1");
  assert.equal(unb64(record.iv).length, 12);
  assert.equal(unb64(record.ciphertext).length, 48);
  assert.equal(await cryptoApi.unwrapMasterKey(record, keys.wrappingKey, "space/test/master/v1"), masterKey);
  const second = await cryptoApi.wrapMasterKey(masterKey, keys.wrappingKey, "space/test/master/v1");
  assert.notEqual(record.iv, second.iv);
  const wrongRecovery = await cryptoApi.deriveRecoveryKeys(b64(new Uint8Array(32).fill(8)), salt);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(record, wrongRecovery.wrappingKey, "space/test/master/v1"), /校验失败/);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(record, keys.wrappingKey, "other-space"), /校验失败/);
  for (const change of [{ ciphertext: flip(record.ciphertext) }, { iv: flip(record.iv) }, { algorithm: "AES-CBC" }, { version: 2 }]) {
    await assert.rejects(() => cryptoApi.unwrapMasterKey({ ...record, ...change }, keys.wrappingKey, "space/test/master/v1"), /校验失败/);
  }
});

test("wrong password cannot unwrap the master key", async () => {
  const right = await cryptoApi.derivePasswordKeys("test-only password", params);
  const wrong = await cryptoApi.derivePasswordKeys("test-only wrong password", params);
  const record = await cryptoApi.wrapMasterKey(masterKey, right.wrappingKey, "test-aad");
  await assert.rejects(() => cryptoApi.unwrapMasterKey(record, wrong.wrappingKey, "test-aad"), /校验失败/);
});

test("identity snapshots round trip independently of AAD property order and never expose plaintext", async () => {
  const api = identity();
  const record = await api.encryptSnapshot(envelope, masterKey, aad);
  assert.equal(record.encoding, "identity");
  assert.equal(unb64(record.iv).length, 12);
  assert.ok(!JSON.stringify(record).includes("qinshi_test"));
  assert.deepEqual(await api.decryptSnapshot(record, masterKey, Object.fromEntries(Object.entries(aad).reverse())), envelope);
  assert.notEqual(record.iv, (await api.encryptSnapshot(envelope, masterKey, aad)).iv);
});

test("all seven snapshot AAD fields are mandatory and authenticated", async () => {
  const api = identity();
  const record = await api.encryptSnapshot(envelope, masterKey, aad);
  for (const field of Object.keys(aad)) {
    const changed = { ...aad, [field]: field === "formatVersion" ? 2 : aad[field] + "x" };
    await assert.rejects(() => api.decryptSnapshot(record, masterKey, changed), /校验失败/);
    const missing = { ...aad }; delete missing[field];
    await assert.rejects(() => api.encryptSnapshot(envelope, masterKey, missing));
  }
  await assert.rejects(() => api.encryptSnapshot(envelope, masterKey, { ...aad, sourceDeviceId: "different" }));
});

test("snapshot encryption rejects wrong key, bit flips, malformed base64url, and unauthenticated encoding", async () => {
  const api = identity();
  const record = await api.encryptSnapshot(envelope, masterKey, aad);
  for (const change of [{ ciphertext: flip(record.ciphertext) }, { iv: flip(record.iv) }, { encoding: "gzip" },
    { encoding: "unknown" }, { version: 2 }, { algorithm: "AES-CBC" }, { ciphertext: record.ciphertext + "=" },
    { iv: b64(new Uint8Array(11)) }, { ciphertext: "A" }, { ciphertext: "AB" }]) {
    await assert.rejects(() => api.decryptSnapshot({ ...record, ...change }, masterKey, aad), /校验失败/);
  }
  await assert.rejects(() => api.decryptSnapshot(record, b64(new Uint8Array(32).fill(4)), aad), /校验失败/);
});

test("gzip requires both capabilities and authenticated gzip cannot fall back to identity", async () => {
  const gzip = cryptoApi.createCrypto({ crypto: webcrypto, CompressionStream, DecompressionStream });
  const record = await gzip.encryptSnapshot(envelope, masterKey, aad);
  assert.equal(record.encoding, "gzip");
  assert.deepEqual(await gzip.decryptSnapshot(record, masterKey, aad), envelope);
  await assert.rejects(() => identity().decryptSnapshot(record, masterKey, aad), /校验失败/);
  for (const deps of [{ CompressionStream, DecompressionStream: undefined }, { CompressionStream: undefined, DecompressionStream }]) {
    const api = cryptoApi.createCrypto({ crypto: webcrypto, ...deps });
    assert.equal((await api.encryptSnapshot(envelope, masterKey, aad)).encoding, "identity");
  }
  class BrokenCompression { constructor() { throw new Error("test compression unavailable"); } }
  const broken = cryptoApi.createCrypto({ crypto: webcrypto, CompressionStream: BrokenCompression, DecompressionStream });
  await assert.rejects(() => broken.encryptSnapshot(envelope, masterKey, aad), /compression unavailable/);
});

test("ciphertext chunks respect 512 KiB and verify per-chunk and whole SHA-256 digests", async () => {
  const bytes = new Uint8Array(524288 * 2 + 3).fill(19);
  const result = await cryptoApi.chunkCiphertext(bytes, 524288);
  assert.deepEqual(result.chunks.map(chunk => chunk.byteLength), [524288, 524288, 3]);
  assert.equal(result.digest, createHash("sha256").update(bytes).digest("base64url"));
  for (const chunk of result.chunks) assert.equal(chunk.digest, createHash("sha256").update(unb64(chunk.data)).digest("base64url"));
  assert.deepEqual(await cryptoApi.joinAndVerifyChunks(result.chunks, result.digest), bytes);
  const changed = result.chunks.map(chunk => ({ ...chunk })); changed[0].data = flip(changed[0].data);
  await assert.rejects(() => cryptoApi.joinAndVerifyChunks(changed, result.digest), /校验失败/);
  changed[0].digest = createHash("sha256").update(unb64(changed[0].data)).digest("base64url");
  await assert.rejects(() => cryptoApi.joinAndVerifyChunks(changed, result.digest), /校验失败/);
  for (const chunks of [result.chunks.slice(1), [...result.chunks].reverse(), [...result.chunks, result.chunks[0]], []]) {
    await assert.rejects(() => cryptoApi.joinAndVerifyChunks(chunks, result.digest), /校验失败/);
  }
  await assert.rejects(() => cryptoApi.chunkCiphertext(bytes, 524289));
  await assert.rejects(() => cryptoApi.chunkCiphertext(bytes, 0));
  await assert.rejects(() => cryptoApi.joinAndVerifyChunks([{ index: 0, byteLength: 524289, data: b64(new Uint8Array(524289)), digest: result.digest }], result.digest), /校验失败/);
});

test("empty and exact-boundary ciphertext chunks round trip without an empty trailing chunk", async () => {
  for (const length of [0, 524288]) {
    const result = await cryptoApi.chunkCiphertext(new Uint8Array(length));
    assert.equal(result.chunks.length, 1);
    assert.equal(result.chunks[0].byteLength, length);
    assert.deepEqual(await cryptoApi.joinAndVerifyChunks(result.chunks, result.digest), new Uint8Array(length));
  }
});

test("structured master-key AAD is stable across key order and remains purpose-bound", async () => {
  const key = b64(new Uint8Array(32).fill(8));
  const record = await cryptoApi.wrapMasterKey(masterKey, key, { spaceId: "test-space", purpose: "password" });
  assert.equal(await cryptoApi.unwrapMasterKey(record, key, { purpose: "password", spaceId: "test-space" }), masterKey);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(record, key, { purpose: "recovery", spaceId: "test-space" }), /校验失败/);
  await assert.rejects(() => cryptoApi.wrapMasterKey(masterKey, key));
  await assert.rejects(() => cryptoApi.wrapMasterKey(b64(new Uint8Array(31)), key, "test-aad"));
});

test("sparse and empty arrays cannot substitute for each other in structured AAD", async () => {
  const key = b64(new Uint8Array(32).fill(8));
  const sparseAad = { spaceId: "test-space", context: new Array(1) };
  const emptyAad = { spaceId: "test-space", context: [] };
  const sparseRecord = await cryptoApi.wrapMasterKey(masterKey, key, sparseAad);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(sparseRecord, key, emptyAad), /校验失败/);
  const emptyRecord = await cryptoApi.wrapMasterKey(masterKey, key, emptyAad);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(emptyRecord, key, sparseAad), /校验失败/);
});

test("nested sparse AAD arrays preserve positions using JSON null semantics", async () => {
  const key = b64(new Uint8Array(32).fill(8));
  const sparse = new Array(3);
  sparse[1] = { nested: new Array(1) };
  const record = await cryptoApi.wrapMasterKey(masterKey, key, { context: sparse });
  assert.equal(await cryptoApi.unwrapMasterKey(record, key, { context: [null, { nested: [null] }, null] }), masterKey);
  await assert.rejects(() => cryptoApi.unwrapMasterKey(record, key, { context: [null, { nested: [null] }] }), /校验失败/);
});

test("unsupported explicit AAD array values remain rejected instead of becoming null", async () => {
  const key = b64(new Uint8Array(32).fill(8));
  const record = await cryptoApi.wrapMasterKey(masterKey, key, { context: [null] });
  for (const unsupported of [undefined, function () {}, Symbol("test-only")]) {
    await assert.rejects(() => cryptoApi.wrapMasterKey(masterKey, key, { context: [unsupported] }), /AAD/);
    await assert.rejects(() => cryptoApi.unwrapMasterKey(record, key, { context: [unsupported] }), /校验失败/);
  }
});

test("browser export initializes without CommonJS and uses the provided Web Crypto", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, btoa, atob });
  vm.runInContext(fs.readFileSync(require.resolve("./cloud-sync-crypto.js"), "utf8"), context);
  assert.equal(unb64(context.QinshiCloudSyncCrypto.generateMasterKey()).length, 32);
  const keys = await context.QinshiCloudSyncCrypto.deriveRecoveryKeys(b64(new Uint8Array(32).fill(9)), salt);
  assert.equal(keys.authKey, "_aMiRdBwboSCENgQ1DUwz3rXYnwH5-wSOyPeF6JGYYs");
  const unavailable = cryptoApi.createCrypto({ crypto: {} });
  assert.throws(() => unavailable.randomId(), /Web Crypto/);
  await assert.rejects(() => unavailable.derivePasswordKeys("test-only password", params), /Web Crypto/);
});

test("independent AES-GCM records with invalid gzip or excessive expansion fail closed", async () => {
  const api = cryptoApi.createCrypto({ crypto: webcrypto, CompressionStream, DecompressionStream });
  const key = await webcrypto.subtle.importKey("raw", unb64(masterKey), "AES-GCM", false, ["encrypt"]);
  async function seal(bytes) {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const authenticated = JSON.stringify(["qinshi-sync/snapshot/v1", 1, "AES-256-GCM", "gzip",
      [aad.spaceId, aad.sourceDeviceId, aad.snapshotId, aad.formatVersion, aad.appVersion, aad.clientCreatedAt, aad.dataHash]]);
    return { version: 1, algorithm: "AES-256-GCM", encoding: "gzip", iv: b64(iv),
      ciphertext: b64(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128,
        additionalData: new TextEncoder().encode(authenticated) }, key, bytes)) };
  }
  const invalid = await seal(new TextEncoder().encode(JSON.stringify(envelope)));
  await assert.rejects(() => api.decryptSnapshot(invalid, masterKey, aad), /校验失败/);
  const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
  const compressed = await new Response(new Blob([tooLarge]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const bomb = await seal(compressed);
  await assert.rejects(() => api.decryptSnapshot(bomb, masterKey, aad), /校验失败/);
  await assert.rejects(() => identity().encryptSnapshot({ ...envelope, data: { qinshi_test: "x".repeat(10 * 1024 * 1024) } }, masterKey, aad), /10 MiB/);
});
