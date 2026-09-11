const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const cloudSync = require("./cloud-sync-core.js");

function validateManagedData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("备份文件缺少本机进度数据。");
  }
  Object.keys(data).forEach(function (key) {
    if (key.indexOf("qinshi_") !== 0 || typeof data[key] !== "string") {
      throw new Error("备份文件包含不允许的数据项。");
    }
  });
  return data;
}

function createCore() {
  return cloudSync.createCore({
    validateManagedData: validateManagedData,
    sha256: async function (text) {
      return crypto.createHash("sha256").update(text, "utf8").digest();
    }
  });
}

function snapshotInput(data) {
  return {
    appVersion: "1.0.39",
    sourceDeviceId: "dev-a",
    clientCreatedAt: "2026-09-11T08:00:00.000Z",
    data: data
  };
}

test("canonicalizes nested keys and preserves unknown qinshi modules", async () => {
  const core = createCore();
  const envelope = await core.createSnapshotEnvelope(snapshotInput({
    qinshi_z: "2",
    qinshi_new_module: "1",
    qinshi_a: "0"
  }));

  assert.deepEqual(Object.keys(envelope.data), ["qinshi_a", "qinshi_new_module", "qinshi_z"]);
  assert.deepEqual(Object.keys(envelope), [
    "formatVersion", "appName", "schemaVersion", "appVersion",
    "sourceDeviceId", "clientCreatedAt", "dataHash", "data"
  ]);
  assert.match(envelope.dataHash, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(core.canonicalStringify({ z: [{ b: 2, a: 1 }], a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"z":[{"a":1,"b":2}]}');
});

test("produces the same data hash for equivalent key order", async () => {
  const core = createCore();
  const first = await core.createSnapshotEnvelope(snapshotInput({ qinshi_a: "0", qinshi_b: "1" }));
  const second = await core.createSnapshotEnvelope(snapshotInput({ qinshi_b: "1", qinshi_a: "0" }));

  assert.equal(first.dataHash, second.dataHash);
});

test("validates the immutable envelope and detects tampered data", async () => {
  const core = createCore();
  const envelope = await core.createSnapshotEnvelope(snapshotInput({ qinshi_future: "kept" }));

  await assert.doesNotReject(core.validateSnapshotEnvelope(envelope));
  await assert.rejects(
    core.validateSnapshotEnvelope(Object.assign({}, envelope, { data: { qinshi_future: "changed" } })),
    /哈希/
  );
  await assert.rejects(
    core.validateSnapshotEnvelope(Object.assign({}, envelope, { extra: true })),
    /快照/
  );
  await assert.rejects(
    core.validateSnapshotEnvelope(Object.assign({}, envelope, { data: { theme: "dark" } })),
    /不允许/
  );
});

test("rejects malformed snapshot metadata", async () => {
  const core = createCore();
  const envelope = await core.createSnapshotEnvelope(snapshotInput({ qinshi_a: "0" }));

  await assert.rejects(
    core.validateSnapshotEnvelope(Object.assign({}, envelope, { formatVersion: 2 })),
    /快照/
  );
  await assert.rejects(
    core.createSnapshotEnvelope(Object.assign(snapshotInput({ qinshi_a: "0" }), { clientCreatedAt: "not-a-date" })),
    /时间/
  );
  await assert.rejects(
    core.createSnapshotEnvelope(Object.assign(snapshotInput({ qinshi_a: "0" }), { sourceDeviceId: "" })),
    /设备/
  );
});

test("accepts the 10 MiB plaintext boundary and rejects one byte above it", async () => {
  const core = createCore();
  const base = await core.createSnapshotEnvelope(snapshotInput({ qinshi_payload: "" }));
  const envelopeBytes = Buffer.byteLength(core.canonicalStringify(base), "utf8");
  const payloadLength = cloudSync.MAX_PLAINTEXT_BYTES - envelopeBytes;
  const atLimit = await core.createSnapshotEnvelope(snapshotInput({ qinshi_payload: "x".repeat(payloadLength) }));

  assert.equal(Buffer.byteLength(core.canonicalStringify(atLimit), "utf8"), cloudSync.MAX_PLAINTEXT_BYTES);
  await assert.rejects(
    core.createSnapshotEnvelope(snapshotInput({ qinshi_payload: "x".repeat(payloadLength + 1) })),
    /10 MiB/
  );
});

test("compares three-part semantic versions numerically", () => {
  const core = createCore();

  assert.equal(core.compareVersions("1.0.9", "1.0.10"), -1);
  assert.equal(core.compareVersions("1.10.0", "1.2.99"), 1);
  assert.equal(core.compareVersions("1.0.39", "1.0.39"), 0);
});

test("uses separate server read and write minimum versions", () => {
  const core = createCore();
  const limits = { minimumReadVersion: "1.0.38", minimumWriteVersion: "1.0.40" };

  assert.doesNotThrow(() => core.assertVersionAllowed("1.0.39", limits, "read"));
  assert.throws(() => core.assertVersionAllowed("1.0.39", limits, "write"), /更新/);
  assert.throws(() => core.assertVersionAllowed("1.0.37", limits, "read"), /更新/);
});

test("sorts snapshot sources by Worker serverCreatedAt instead of client time", () => {
  const core = createCore();
  const rows = [
    { snapshotId: "old", serverCreatedAt: 10, clientCreatedAt: "2099-01-01T00:00:00.000Z" },
    { snapshotId: "new", serverCreatedAt: 20, clientCreatedAt: "2000-01-01T00:00:00.000Z" }
  ];

  assert.deepEqual(core.sortSnapshotSources(rows).map(function (row) { return row.snapshotId; }), ["new", "old"]);
  assert.deepEqual(rows.map(function (row) { return row.snapshotId; }), ["old", "new"]);
});
