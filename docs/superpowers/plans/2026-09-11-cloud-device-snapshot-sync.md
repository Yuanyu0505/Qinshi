# Qin Cloud Device Snapshot Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Qin 设置页加入零付费、手动触发、端到端加密的设备快照同步，让任意已配对设备可选择另一台设备的完整快照覆盖本机，并在覆盖前留下 JSON 备份、本机回滚副本和最近三份云端历史。

**Architecture:** GitHub Pages PWA 继续负责全部业务代码与本地 `qinshi_` 数据；浏览器使用 Web Crypto 加密快照并通过 HTTPS 调用 Cloudflare Worker，Worker 只认证请求、管理设备和以 D1 事务提交密文快照。客户端同步协调器先完成 PWA/Worker 版本预检，再按“固定来源快照 → 本机备份 → 双快照暂存 → 本机原子替换 → 云端事务提交”的顺序执行，任何失败均停止或回滚而不自动合并数据。

**Tech Stack:** 现有原生 HTML/CSS/JavaScript PWA、Web Crypto、CompressionStream、IndexedDB、Node.js 内置测试器、Playwright、Cloudflare Workers、D1、Wrangler 4、Vitest 4.1+、`@cloudflare/vitest-plugin`。

**Spec:** `docs/superpowers/specs/2026-09-11-cloud-device-snapshot-sync-design.md`

## Global Constraints

- 只在设置页由用户手动触发同步；不得新增后台、定时或自动上传。
- 同步采用“设备快照模式”，每次只允许一个明确来源设备的完整数据覆盖当前设备，绝不自动判断方向或合并记录。
- 同步范围是当前及未来全部以 `qinshi_` 开头的 `localStorage` 字符串值；其他键不得上传或覆盖。
- 覆盖前必须先下载 JSON 备份，并把当前设备覆盖前数据保存为当前设备最新历史快照；每台设备最多保留一个最新快照和三份历史快照。
- 云端仅保存密文、摘要和必要元数据；密码、恢复密钥、主密钥、设备令牌及个人数据明文不得进入 D1、日志、仓库或构建产物。
- PBKDF2 使用 HMAC-SHA-256、16 字节随机盐和 600,000 次迭代；HKDF 使用 SHA-256 并按用途分离；快照和密钥包装使用 AES-256-GCM 与 12 字节随机 IV。
- 单个明文快照上限 10 MiB；密文分块不超过 512 KiB；单同步空间密文总量上限 100 MiB；临时上传会话 24 小时后过期。
- Worker 只允许 `https://yuanyu0505.github.io` 以及 `http://localhost:8000` 至 `http://localhost:8010`；不得使用通配 Origin。
- 只创建 Cloudflare Workers Free 和 D1 Free 资源，不启用 Workers Paid、R2、Durable Objects、付费 Cron 或任何自动超额计费能力。
- 云端不可用、免费额度耗尽或同步未配置时，全部本地工具和现有 JSON 导入导出必须保持可用。
- 同步前先检查公网 PWA 版本与 Worker 的 `minimumReadVersion`、`minimumWriteVersion`；版本不满足时更新工具并用不可变快照 ID续传，不允许旧 PWA 写入。
- 桌面、390px 手机、768px 与 1024px 平板都不得依赖整页横向滚动；主要控件最小触控尺寸为 44×44px。
- 实现期间不得提交 `.env`、`.dev.vars`、Cloudflare API Token、真实 D1 database ID 或本机配对凭据。
- 本计划是一条紧密依赖链：客户端数据契约决定加密信封，信封决定 Worker API，API 再决定设置页和发布流程，因此不拆成彼此独立的计划。

---

## File and Responsibility Map

### Existing files to modify

- `js/settings.js`：把现有备份逻辑整理为可测试、可复用的 `QinshiSettings` 数据存储接口，并保留原有按钮行为。
- `js/pwa.js`：公开同步专用版本预检、应用更新和恢复待办操作接口。
- `index.html`：加入跨设备同步面板、创建/加入表单、设备快照、历史、安全设置和确认对话框；加载新脚本。
- `css/style.css`：设置页云同步的桌面、手机、平板布局与可访问状态。
- `service-worker.js`：预缓存新增客户端模块并随发布版本更新缓存名。
- `version.json`：发布时递增当前补丁版本。
- `tests/pwa-update.test.js`：覆盖同步版本预检与更新续传契约。
- `tests/mobile-layout.cjs`：加入云同步设置页的手机和平板布局检查。
- `serve.test.js`：验证新面板、脚本顺序、公开配置和 PWA 资源清单。
- `.gitignore`：忽略 Worker 本地状态、真实部署配置、凭据和本地测试数据库。
- `README.md`：记录功能边界、免费策略、部署与灾备入口。

### New client files

- `js/cloud-sync-core.js` / `js/cloud-sync-core.test.js`：规范化快照、语义版本比较、大小限制、设备/历史排序和纯状态规则。
- `js/cloud-sync-crypto.js` / `js/cloud-sync-crypto.test.js`：编码、摘要、PBKDF2/HKDF、AES-GCM、压缩、密钥包装和恢复密钥。
- `js/cloud-sync-storage.js` / `js/cloud-sync-storage.test.js`：IndexedDB 配对凭据与临时回滚副本，以及 `sessionStorage` 同步待办。
- `js/cloud-sync-api.js` / `js/cloud-sync-api.test.js`：Worker HTTP 协议、超时、有限重试、幂等键、错误映射和分块传输。
- `js/cloud-sync.js` / `js/cloud-sync.test.js`：创建/加入、上传、下载覆盖、历史恢复、设备/安全操作和 UI 控制器。
- `js/cloud-sync-config.js`：只保存公开 Worker URL 与功能开关，不保存秘密。
- `tests/cloud-sync-browser.cjs`：浏览器交互、断网、刷新续传、响应式与本地回滚流程。

### New Worker files

- `cloud-sync/worker/package.json` 与 `package-lock.json`：独立锁定 Wrangler、Vitest 和 Cloudflare Worker 测试插件。
- `cloud-sync/worker/wrangler.jsonc.example`：不含真实 database ID 的可复制配置模板。
- `cloud-sync/worker/wrangler.test.jsonc`：只绑定本地测试 D1。
- `cloud-sync/worker/vitest.config.js`：在 workerd/Miniflare 中运行 Worker 与 D1 测试。
- `cloud-sync/worker/test/apply-migrations.js`：在每个隔离测试文件开始前应用 D1 迁移。
- `cloud-sync/worker/migrations/0001_initial.sql`：首版只增不删的 D1 表、索引和约束。
- `cloud-sync/worker/src/index.js`：路由、CORS、统一响应和顶层异常边界。
- `cloud-sync/worker/src/validation.js`：字段白名单、版本、大小、ID、时间和请求体校验。
- `cloud-sync/worker/src/auth.js`：同步空间定位、密码派生认证值、设备令牌、恢复认证和递增冷却。
- `cloud-sync/worker/src/spaces.js`：创建、配对、密码修改、恢复密钥轮换、恢复密码和删除空间。
- `cloud-sync/worker/src/devices.js`：设备列表、重命名、撤销与快照保留/删除。
- `cloud-sync/worker/src/snapshots.js`：上传会话、分块、摘要校验、最新/历史事务、下载与清理。
- `cloud-sync/worker/src/errors.js`：稳定错误码与脱敏日志。
- `cloud-sync/worker/test/*.spec.js`：Worker/D1 集成测试。
- `cloud-sync/worker/README.md`：本地开发、迁移、零付费检查和部署顺序。

### Shared protocol contracts

All JSON APIs use UTF-8, `Content-Type: application/json`, camelCase fields and `{ error: { code, message, retryable } }` failures. Binary chunk upload/download uses `application/octet-stream`. IDs are client-generated UUID v4 values; normalized sync codes are uppercase base32 without separators. These exact records are shared between Tasks 2, 3, 6–13:

```js
// Public crypto records. Each base64url field is unpadded.
KdfParams = { version: 1, kdf: 'PBKDF2-HMAC-SHA-256', hash: 'SHA-256', iterations: 600000, salt: string };
EncryptedBlob = { version: 1, algorithm: 'AES-256-GCM', iv: string, ciphertext: string };
DeviceRegistration = { deviceId: string, deviceToken: string, encryptedName: EncryptedBlob };

CreateSpaceRequest = {
  syncCode: string, spaceId: string, kdf: KdfParams, authKey: string,
  passwordWrappedMaster: EncryptedBlob, recoveryAuthKey: string,
  recoveryWrappedMaster: EncryptedBlob, device: DeviceRegistration, appVersion: string
};
PairRequest = { authKey: string, device: DeviceRegistration, appVersion: string };
RecoverRequest = {
  recoveryAuthKey: string, newAuthKey: string, newPasswordWrappedMaster: EncryptedBlob,
  newRecoveryAuthKey: string, newRecoveryWrappedMaster: EncryptedBlob,
  device: DeviceRegistration, appVersion: string
};
UploadCreateRequest = {
  operation: 'upload'|'replace-before'|'replace-after'|'restore-before'|'restore-after',
  snapshotId: string, sourceSnapshotId: string|null, appVersion: string,
  formatVersion: 1, schemaVersion: 1, encoding: 'gzip'|'identity',
  clientCreatedAt: string, dataHash: string, iv: string,
  ciphertextBytes: number, chunkCount: number, ciphertextDigest: string,
  encryptedSummary: EncryptedBlob
};
UploadCommitRequest = { beforeUploadId: string|null, sourceSnapshotId: string|null };
```

`POST /v1/spaces` returns `{spaceId,deviceId,minimumReadVersion,minimumWriteVersion}`. `GET /v1/spaces/{code}/parameters` returns `{spaceId,kdf,passwordWrappedMaster,recoveryWrappedMaster,minimumReadVersion,minimumWriteVersion}`. Pair/recover returns the same binding/version fields. `POST /v1/uploads` returns `{uploadId,snapshotId,expiresAt,uploadedChunks}`. Commit returns `{operationId,latestSnapshotId,historySnapshotIds,serverCommittedAt}`. Snapshot metadata returns all `UploadCreateRequest` cryptographic/AAD fields except `operation`, plus `serverCreatedAt`, `deviceId` and `chunkCount`; it never returns data plaintext or token digests.

---

### Task 1: Extract a Transactional Qin Local Data Store

**Files:**
- Modify: `js/settings.js`
- Create: `js/settings.test.js`

**Interfaces:**
- Consumes: 浏览器 `localStorage`、`Blob`、`URL` 与下载链接。
- Produces: `QinshiSettings.collectManagedData(): Record<string,string>`、`validateManagedData(data): Record<string,string>`、`makePayload(reason, metadata?): BackupPayload`、`downloadPayload(payload, reason): void`、`replaceManagedData(data): {previous: Record<string,string>}`、`restoreManagedData(previous): void`。

- [ ] **Step 1: Write failing tests for collection, validation and rollback**

```js
test('collects every current and future qinshi key only', () => {
  const api = loadSettings({ qinshi_atlas: '1', qinshi_future_module: '{"x":2}', theme: 'dark' });
  assert.deepEqual(api.collectManagedData(), {
    qinshi_atlas: '1',
    qinshi_future_module: '{"x":2}'
  });
});

test('replace rolls back every managed key when one write fails', () => {
  const harness = createStorage({ qinshi_old: 'safe' }, { failOnKey: 'qinshi_bad' });
  const api = loadSettingsWithStorage(harness.storage);
  assert.throws(() => api.replaceManagedData({ qinshi_new: 'next', qinshi_bad: 'x' }));
  assert.deepEqual(harness.dump(), { qinshi_old: 'safe' });
});
```

- [ ] **Step 2: Run the focused test and confirm the new API is absent**

Run: `node --test js/settings.test.js`

Expected: FAIL because `QinshiSettings.collectManagedData` and `replaceManagedData` are not exported.

- [ ] **Step 3: Refactor the existing implementation without changing manual import/export behavior**

```js
function validateManagedData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份文件缺少本机进度数据。');
  Object.keys(data).forEach(function (key) {
    if (key.indexOf(STORAGE_PREFIX) !== 0 || typeof data[key] !== 'string') {
      throw new Error('备份文件包含不允许的数据项。');
    }
  });
  return data;
}

function restoreManagedData(previous) {
  clearManagedData();
  Object.keys(previous).forEach(function (key) { localStorage.setItem(key, previous[key]); });
}
```

Keep `formatVersion: 1`, `appName: "Qin"`, existing Chinese copy and automatic pre-import download. Extend `backupFileName` so `reason: "before-cloud-sync"` produces names in the exact form `Qin-backup-before-cloud-sync-2026-09-11T08-00-00-000Z.json` using the operation’s real ISO time. `replaceManagedData` must return the captured previous map after a successful replacement.

- [ ] **Step 4: Run the test and the existing static contract test**

Run: `node --test js/settings.test.js serve.test.js`

Expected: PASS; existing import/export markup and behavior remain present.

- [ ] **Step 5: Commit the data-store boundary**

```bash
git add js/settings.js js/settings.test.js
git commit -m "refactor: expose transactional settings storage"
```

---

### Task 2: Implement Snapshot Contracts and Version Rules

**Files:**
- Create: `js/cloud-sync-core.js`
- Create: `js/cloud-sync-core.test.js`

**Interfaces:**
- Consumes: `QinshiSettings.validateManagedData(data)` and an injected SHA-256 function.
- Produces: `QinshiCloudSyncCore.canonicalStringify(value)`, `createSnapshotEnvelope(input)`, `validateSnapshotEnvelope(value)`, `compareVersions(a,b)`, `assertVersionAllowed(app, limits, operation)`, `sortSnapshotSources(rows)`, `MAX_PLAINTEXT_BYTES`.

- [ ] **Step 1: Write failing contract tests**

```js
test('canonicalizes keys and preserves unknown qinshi modules', async () => {
  const envelope = await core.createSnapshotEnvelope({
    appVersion: '1.0.39', sourceDeviceId: 'dev-a', clientCreatedAt: '2026-09-11T08:00:00.000Z',
    data: { qinshi_z: '2', qinshi_new_module: '1', qinshi_a: '0' }
  });
  assert.deepEqual(Object.keys(envelope.data), ['qinshi_a', 'qinshi_new_module', 'qinshi_z']);
  assert.match(envelope.dataHash, /^[A-Za-z0-9_-]{43}$/);
});

test('rejects write below server minimum and sorts by server time', () => {
  assert.throws(() => core.assertVersionAllowed('1.0.39', {
    minimumReadVersion: '1.0.38', minimumWriteVersion: '1.0.40'
  }, 'write'), /更新/);
  assert.deepEqual(core.sortSnapshotSources([
    { snapshotId: 'old', serverCreatedAt: 10 }, { snapshotId: 'new', serverCreatedAt: 20 }
  ]).map(x => x.snapshotId), ['new', 'old']);
});
```

- [ ] **Step 2: Run the tests and confirm module-not-found failure**

Run: `node --test js/cloud-sync-core.test.js`

Expected: FAIL because `js/cloud-sync-core.js` does not exist.

- [ ] **Step 3: Implement the immutable envelope and exact limits**

```js
var MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
function compareVersions(left, right) {
  var a = String(left).split('.').map(Number);
  var b = String(right).split('.').map(Number);
  for (var i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
}
function assertVersionAllowed(appVersion, limits, operation) {
  var minimum = operation === 'write' ? limits.minimumWriteVersion : limits.minimumReadVersion;
  if (compareVersions(appVersion, minimum) < 0) throw new Error('请先更新工具后再继续同步。');
}
```

`canonicalStringify` recursively sorts object keys and preserves array order. `createSnapshotEnvelope` sets exactly `formatVersion: 1`, `appName: "Qin"`, `schemaVersion: 1`, `appVersion`, `sourceDeviceId`, `clientCreatedAt`, `dataHash`, `data`; it rejects output larger than 10 MiB. `validateSnapshotEnvelope` recomputes `dataHash` and rejects extra/non-`qinshi_` values through the Task 1 validator.

- [ ] **Step 4: Run the core tests**

Run: `node --test js/cloud-sync-core.test.js`

Expected: PASS for canonicalization, digest stability, semantic versions, invalid keys, tampered hash, malformed dates and the 10 MiB boundary.

- [ ] **Step 5: Commit the snapshot contract**

```bash
git add js/cloud-sync-core.js js/cloud-sync-core.test.js
git commit -m "feat: define cloud snapshot contracts"
```

---

### Task 3: Implement End-to-End Cryptography

**Files:**
- Create: `js/cloud-sync-crypto.js`
- Create: `js/cloud-sync-crypto.test.js`

**Interfaces:**
- Consumes: standards-compatible `crypto.subtle`, `crypto.getRandomValues`, `CompressionStream`, `DecompressionStream`.
- Produces: `randomId(bytes)`, `generateRecoveryKey()`, `derivePasswordKeys(password, params)`, `deriveRecoveryKeys(recoveryKey, salt)`, `wrapMasterKey(masterKey, wrappingKey, aad)`, `unwrapMasterKey(record, wrappingKey, aad)`, `encryptSnapshot(envelope, masterKey, aadFields)`, `decryptSnapshot(record, masterKey, aadFields)`, `chunkCiphertext(bytes, 524288)`, `joinAndVerifyChunks(chunks, digest)`.

- [ ] **Step 1: Write deterministic-vector and tamper tests**

```js
test('derives separate auth and wrapping keys', async () => {
  const result = await cryptoApi.derivePasswordKeys('correct horse', {
    salt: bytesToBase64url(new Uint8Array(16).fill(7)), iterations: 600000,
    hash: 'SHA-256', kdf: 'PBKDF2-HMAC-SHA-256', version: 1
  });
  assert.notEqual(result.authKey, result.wrappingKey);
  assert.equal(base64urlToBytes(result.authKey).byteLength, 32);
});

test('rejects ciphertext and AAD tampering', async () => {
  const encrypted = await cryptoApi.encryptSnapshot(envelope, masterKey, aad);
  encrypted.ciphertext = flipOneBit(encrypted.ciphertext);
  await assert.rejects(() => cryptoApi.decryptSnapshot(encrypted, masterKey, aad), /校验失败/);
});
```

- [ ] **Step 2: Run the crypto tests and confirm failure**

Run: `node --test js/cloud-sync-crypto.test.js`

Expected: FAIL because the crypto module does not exist.

- [ ] **Step 3: Implement key derivation, wrapping and snapshot encryption**

```js
async function derivePasswordKeys(password, params) {
  var root = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64url(params.salt), iterations: 600000
  }, root, 256);
  return {
    authKey: await hkdf(bits, 'qinshi-sync/password-auth/v1'),
    wrappingKey: await hkdf(bits, 'qinshi-sync/password-wrap/v1')
  };
}
```

Use a 256-bit random master key, 128-bit-or-longer random sync code, 32-byte recovery key, 16-byte KDF salt and a fresh 12-byte AES-GCM IV for every encryption. The displayed recovery key must be grouped and include a checksum; parsing must reject a changed character before contacting the Worker. Compress with gzip only when `CompressionStream` and `DecompressionStream` both exist; otherwise record `encoding: "identity"`.

- [ ] **Step 4: Run all crypto cases**

Run: `node --test js/cloud-sync-crypto.test.js`

Expected: PASS for round trips, wrong password/recovery key, changed AAD, changed chunk, gzip and identity fallback, recovery checksum and 512 KiB chunking.

- [ ] **Step 5: Commit cryptography**

```bash
git add js/cloud-sync-crypto.js js/cloud-sync-crypto.test.js
git commit -m "feat: encrypt cloud device snapshots"
```

---

### Task 4: Persist Device Credentials and Rollback Copies in IndexedDB

**Files:**
- Create: `js/cloud-sync-storage.js`
- Create: `js/cloud-sync-storage.test.js`

**Interfaces:**
- Consumes: IndexedDB、`sessionStorage` or injected adapters in tests.
- Produces: `openStore()`, `savePairing(pairing)`, `loadPairing()`, `forgetPairing()`, `savePendingOperation(operation)`, `loadPendingOperation()`, `clearPendingOperation()`, `saveRollbackCopy(copy)`, `loadRollbackCopy()`, `clearRollbackCopy()`.

- [ ] **Step 1: Write failing persistence tests**

```js
test('stores token and master key but never password', async () => {
  await store.savePairing({ spaceId: 's', deviceId: 'd', deviceToken: 't', masterKey: 'm' });
  const saved = await store.loadPairing();
  assert.deepEqual(saved, { spaceId: 's', deviceId: 'd', deviceToken: 't', masterKey: 'm' });
  assert.equal(JSON.stringify(adapter.dump()).includes('password'), false);
});

test('pending operation contains immutable id and no decrypted data', async () => {
  await store.savePendingOperation({ type: 'pull', snapshotId: 'snap-1' });
  assert.deepEqual(await store.loadPendingOperation(), { type: 'pull', snapshotId: 'snap-1' });
});
```

- [ ] **Step 2: Run and observe the missing module failure**

Run: `node --test js/cloud-sync-storage.test.js`

Expected: FAIL because `js/cloud-sync-storage.js` does not exist.

- [ ] **Step 3: Implement one database with three records**

```js
var DB_NAME = 'qinshi-cloud-sync';
var STORE_NAME = 'state';
var DB_VERSION = 1;
// Keys: pairing, pending-operation, rollback-copy.
```

IndexedDB uses only the keys `pairing` and `rollback-copy`. `savePendingOperation` writes `{type,snapshotId}` to the non-managed `sessionStorage` key `qin-cloud-sync-pending`; this key intentionally does not start with `qinshi_`. Store no password and no recovery key. `forgetPairing` removes IndexedDB `pairing` and the session pending key; local progress is untouched. A rollback copy is removed only after local and cloud commit both succeed or after the user explicitly discards a recovered rollback.

- [ ] **Step 4: Run storage tests**

Run: `node --test js/cloud-sync-storage.test.js`

Expected: PASS including transaction abort, upgrade creation, refresh persistence and forget-device isolation.

- [ ] **Step 5: Commit IndexedDB support**

```bash
git add js/cloud-sync-storage.js js/cloud-sync-storage.test.js
git commit -m "feat: persist cloud sync device state"
```

---

### Task 5: Scaffold the Worker and D1 Schema

**Files:**
- Modify: `.gitignore`
- Create: `cloud-sync/worker/package.json`
- Create: `cloud-sync/worker/package-lock.json`
- Create: `cloud-sync/worker/wrangler.jsonc.example`
- Create: `cloud-sync/worker/wrangler.test.jsonc`
- Create: `cloud-sync/worker/vitest.config.js`
- Create: `cloud-sync/worker/test/apply-migrations.js`
- Create: `cloud-sync/worker/migrations/0001_initial.sql`
- Create: `cloud-sync/worker/src/index.js`
- Create: `cloud-sync/worker/src/errors.js`
- Create: `cloud-sync/worker/test/health.spec.js`

**Interfaces:**
- Consumes: D1 binding `DB`, variables `ALLOWED_ORIGINS`, `MINIMUM_READ_VERSION`, `MINIMUM_WRITE_VERSION`.
- Produces: ES module Worker default export `fetch(request, env, ctx)`, `GET /v1/health`, six D1 tables and stable JSON errors `{error:{code,message,retryable}}`.

- [ ] **Step 1: Create the package and write a failing health/CORS test**

```json
{
  "name": "qin-cloud-sync-worker",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "dev": "wrangler dev -c wrangler.test.jsonc" }
}
```

```js
import { exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
it('returns version limits and exact allowed origin', async () => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
    headers: { Origin: 'https://yuanyu0505.github.io' }
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('https://yuanyu0505.github.io');
  expect(await response.json()).toMatchObject({ minimumReadVersion: '1.0.39', minimumWriteVersion: '1.0.39' });
});
```

- [ ] **Step 2: Install pinned dependencies and run the failing test**

Run in `cloud-sync/worker`: `npm install --save-dev vitest@^4.1.0 @cloudflare/vitest-plugin wrangler@^4`

Run: `npm test -- health.spec.js`

Expected: FAIL because the route and D1 migration are not implemented. Commit `package-lock.json`; do not add a root package manifest.

Configure the official Worker runtime plugin and migrations:

```js
// vitest.config.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: './wrangler.test.jsonc' },
    miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations(path.join(here, 'migrations')) } }
  }))],
  test: { setupFiles: ['./test/apply-migrations.js'] }
});
```

```js
// test/apply-migrations.js
import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll } from 'vitest';
beforeAll(async () => { await applyD1Migrations(env.DB, env.TEST_MIGRATIONS); });
```

`wrangler.test.jsonc` binds `DB` to `qin-cloud-sync-test` with the all-zero database UUID, which is local-only under Miniflare, and sets both minimum versions to `1.0.39`.

- [ ] **Step 3: Add the complete initial schema**

```sql
CREATE TABLE sync_spaces (
  id TEXT PRIMARY KEY, locator_hash TEXT NOT NULL UNIQUE, kdf_json TEXT NOT NULL,
  auth_digest TEXT NOT NULL, password_wrapped_master_json TEXT NOT NULL,
  recovery_auth_digest TEXT NOT NULL, recovery_wrapped_master_json TEXT NOT NULL,
  minimum_read_version TEXT NOT NULL, minimum_write_version TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE,
  encrypted_name_json TEXT NOT NULL, revoked_at INTEGER, last_used_at INTEGER NOT NULL,
  last_uploaded_at INTEGER, created_at INTEGER NOT NULL,
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE
);
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, device_id TEXT NOT NULL,
  source_snapshot_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('latest','history','staged')),
  app_version TEXT NOT NULL, format_version INTEGER NOT NULL, schema_version INTEGER NOT NULL,
  encoding TEXT NOT NULL CHECK (encoding IN ('gzip','identity')),
  client_created_at TEXT NOT NULL, data_hash TEXT NOT NULL, iv TEXT NOT NULL,
  ciphertext_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
  ciphertext_digest TEXT NOT NULL, encrypted_summary_json TEXT NOT NULL,
  server_created_at INTEGER NOT NULL, committed_at INTEGER,
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE TABLE snapshot_chunks (
  snapshot_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, body BLOB NOT NULL,
  chunk_digest TEXT NOT NULL, PRIMARY KEY (snapshot_id, chunk_index),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, device_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upload','replace-before','replace-after','restore-before','restore-after')),
  idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
  expected_chunks INTEGER NOT NULL, expected_bytes INTEGER NOT NULL,
  expected_digest TEXT NOT NULL, status TEXT NOT NULL,
  result_json TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (space_id, device_id, idempotency_key),
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);
CREATE TABLE auth_throttles (
  locator_hash TEXT PRIMARY KEY, failure_count INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_device_role_time ON snapshots(space_id, device_id, role, server_created_at DESC);
CREATE UNIQUE INDEX idx_snapshots_one_latest ON snapshots(space_id, device_id) WHERE role='latest';
CREATE INDEX idx_upload_sessions_expiry ON upload_sessions(status, expires_at);
```

- [ ] **Step 4: Implement health, OPTIONS and fail-closed CORS**

```js
const ALLOWED_LOCAL = /^http:\/\/localhost:(800[0-9]|8010)$/;
function allowedOrigin(origin) {
  return origin === 'https://yuanyu0505.github.io' || ALLOWED_LOCAL.test(origin || '');
}
```

Reject disallowed browser origins with `403 ORIGIN_NOT_ALLOWED`; never return `Access-Control-Allow-Origin: *`. Health returns deployed limits and no secrets. `errors.js` maps quota/storage failures to `FREE_QUOTA_EXHAUSTED`, `retryable: true` and logs only request ID, route, status and stable code.

- [ ] **Step 5: Apply the local migration and run tests**

Run in `cloud-sync/worker`: `npx wrangler d1 migrations apply qin-cloud-sync-test --local -c wrangler.test.jsonc`

Expected: migration `0001_initial.sql` applies successfully.

Run: `npm test -- health.spec.js`

Expected: PASS for allowed production/local origins, denied foreign origins, preflight headers, health payload and log redaction.

- [ ] **Step 6: Ignore every local Cloudflare artifact and commit**

Append exactly these ignore entries:

```gitignore
cloud-sync/worker/.wrangler/
cloud-sync/worker/.dev.vars
cloud-sync/worker/wrangler.local.jsonc
cloud-sync/worker/test-results/
```

```bash
git add .gitignore cloud-sync/worker
git commit -m "feat: scaffold encrypted sync worker"
```

---

### Task 6: Add Strict Validation, Authentication and Throttling

**Files:**
- Create: `cloud-sync/worker/src/validation.js`
- Create: `cloud-sync/worker/src/auth.js`
- Create: `cloud-sync/worker/test/auth.spec.js`
- Modify: `cloud-sync/worker/src/index.js`

**Interfaces:**
- Consumes: `env.DB`, headers `Authorization: Device <deviceId>.<deviceToken>` and `X-Qin-App-Version`.
- Produces: `readJson(request, allowedKeys, maxBytes)`, `requireVersion(request, env, operation)`, `authenticateDevice(request, env)`, `verifyPasswordAuth(locatorHash, submittedAuthKey, env)`, `verifyRecoveryAuth(locatorHash, submittedRecoveryAuth, env)`, `recordAuthFailure(locatorHash, now, env)`, `clearAuthFailures(locatorHash, env)`.

- [ ] **Step 1: Write failing authentication and validation tests**

```js
it('returns the same public error for missing space and wrong password', async () => {
  const missing = await pair('unknown-code', 'bad-auth');
  const wrong = await pair(knownCode, 'bad-auth');
  expect(missing.status).toBe(401);
  expect(await missing.json()).toEqual(await wrong.json());
});

it('rejects unknown fields and old write clients', async () => {
  expect((await postJson('/v1/uploads', { unexpected: true }, oldToken)).status).toBe(400);
  expect((await postJson('/v1/uploads', validUpload, oldToken, { appVersion: '1.0.38' })).status).toBe(426);
});
```

- [ ] **Step 2: Run and observe failures**

Run in `cloud-sync/worker`: `npm test -- auth.spec.js`

Expected: FAIL because authentication, field whitelisting and cooldown do not exist.

- [ ] **Step 3: Implement constant-time digest checks and exact cooldowns**

```js
const COOLDOWN_SECONDS = [0, 2, 5, 15, 60, 300, 900];
function constantTimeEqual(left, right) {
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  if (a.length !== 32 || b.length !== 32) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < 32; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
```

Hash submitted password/recovery auth values and device tokens with SHA-256 before comparison. Use `locator_hash = SHA-256(normalizedSyncCode)` so raw sync codes are absent from D1. After failures use the listed cooldown capped at 900 seconds, keyed only by locator hash; do not store raw IP. Any successful authentication clears that locator’s throttle row.

- [ ] **Step 4: Run authentication tests**

Run: `npm test -- auth.spec.js`

Expected: PASS for constant response shape, token revocation, version 426, strict content type/body size/field list, increasing cooldown and sanitized logs.

- [ ] **Step 5: Commit authentication**

```bash
git add cloud-sync/worker/src cloud-sync/worker/test/auth.spec.js
git commit -m "feat: authenticate cloud sync devices"
```

---

### Task 7: Implement Space Creation, Pairing and Recovery

**Files:**
- Create: `cloud-sync/worker/src/spaces.js`
- Create: `cloud-sync/worker/test/spaces.spec.js`
- Modify: `cloud-sync/worker/src/index.js`

**Interfaces:**
- Consumes: client-generated encrypted master-key wrappers, digests, encrypted device name, random public IDs and strict request bodies.
- Produces: `POST /v1/spaces`, `GET /v1/spaces/{code}/parameters`, `POST /v1/spaces/{code}/pair`, `POST /v1/spaces/{code}/recover`, `POST /v1/security/password`, `POST /v1/security/recovery-key`, `DELETE /v1/spaces/current`.

- [ ] **Step 1: Write failing space lifecycle tests**

```js
it('creates a space without persisting any submitted secret plaintext', async () => {
  const created = await createSpace(validCreateBody);
  expect(created.status).toBe(201);
  const dbText = JSON.stringify(await dumpTables(env.DB));
  expect(dbText).not.toContain(validCreateBody.deviceToken);
  expect(dbText).not.toContain(validCreateBody.authKey);
  expect(dbText).not.toContain('personal-value');
});

it('recovery resets password and revokes every old token', async () => {
  const recovered = await recover(validRecoveryBody);
  expect(recovered.status).toBe(200);
  expect((await listDevices(oldDeviceToken)).status).toBe(401);
  expect((await listDevices(recovered.body.deviceToken)).status).toBe(200);
});
```

- [ ] **Step 2: Run and confirm route failures**

Run in `cloud-sync/worker`: `npm test -- spaces.spec.js`

Expected: FAIL with 404 responses for lifecycle endpoints.

- [ ] **Step 3: Implement the lifecycle with server-side transactions**

```js
export async function recoverSpace(db, space, input, now) {
  await db.batch([
    db.prepare('UPDATE sync_spaces SET auth_digest=?, password_wrapped_master_json=?, recovery_auth_digest=?, recovery_wrapped_master_json=?, updated_at=? WHERE id=?')
      .bind(input.newAuthDigest, JSON.stringify(input.newPasswordWrappedMaster), input.newRecoveryAuthDigest, JSON.stringify(input.newRecoveryWrappedMaster), now, space.id),
    db.prepare('UPDATE devices SET revoked_at=? WHERE space_id=? AND revoked_at IS NULL').bind(now, space.id),
    db.prepare('INSERT INTO devices (id, space_id, token_digest, encrypted_name_json, revoked_at, last_used_at, last_uploaded_at, created_at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)')
      .bind(input.newDeviceId, space.id, input.newDeviceTokenDigest, JSON.stringify(input.encryptedDeviceName), now, now)
  ]);
}
```

Creation accepts only public KDF parameters, digests, wrapped keys, encrypted name and hashed/token inputs; raw token is returned only from the client’s own generated request and is never echoed by server logs. `GET parameters` exposes KDF version/salt/iterations and wrapped master key but returns the same generic authentication-family failure timing for unknown codes. Password change may retain devices; recovery-key password reset always revokes all previous tokens. Permanent deletion requires a freshly verified password or recovery authenticator plus body text `永久删除同步空间`.

- [ ] **Step 4: Run space lifecycle tests**

Run: `npm test -- spaces.spec.js auth.spec.js`

Expected: PASS for create, pair, password rotation, recovery rotation, recovery reset, revocation, permanent deletion and absence of plaintext secrets.

- [ ] **Step 5: Commit lifecycle endpoints**

```bash
git add cloud-sync/worker/src cloud-sync/worker/test/spaces.spec.js
git commit -m "feat: manage encrypted sync spaces"
```

---

### Task 8: Implement Devices, Upload Sessions and Immutable Snapshot Reads

**Files:**
- Create: `cloud-sync/worker/src/devices.js`
- Create: `cloud-sync/worker/src/snapshots.js`
- Create: `cloud-sync/worker/test/snapshots.spec.js`
- Modify: `cloud-sync/worker/src/index.js`

**Interfaces:**
- Consumes: authenticated device context and encrypted metadata/chunks.
- Produces: `GET /v1/devices`, `PATCH /v1/devices/{deviceId}`, `DELETE /v1/devices/{deviceId}`, `POST /v1/uploads`, `PUT /v1/uploads/{uploadId}/chunks/{index}`, `POST /v1/uploads/{uploadId}/commit`, `GET /v1/snapshots/{snapshotId}`, `GET /v1/snapshots/{snapshotId}/chunks/{index}`.

- [ ] **Step 1: Write failing session, history and limit tests**

```js
it('replays the same committed result for one idempotency key', async () => {
  const first = await uploadCompleteSnapshot({ idempotencyKey: 'op-1' });
  const second = await uploadCompleteSnapshot({ idempotencyKey: 'op-1' });
  expect(second).toEqual(first);
  expect(await countCommittedSnapshots()).toBe(1);
});

it('keeps one latest and three newest histories per device', async () => {
  for (let i = 0; i < 6; i += 1) await uploadVersion(i);
  expect(await rolesFor(deviceId)).toEqual(['latest', 'history', 'history', 'history']);
});
```

- [ ] **Step 2: Run and observe missing route failures**

Run in `cloud-sync/worker`: `npm test -- snapshots.spec.js`

Expected: FAIL because upload and snapshot routes are not implemented.

- [ ] **Step 3: Implement staged uploads and exact limits**

```js
const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_SPACE_BYTES = 100 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
```

Create one `upload_sessions` row linked by `snapshot_id` to one staged `snapshots` row before accepting chunks. Each `PUT` validates index range, byte length and `X-Chunk-SHA256`. Commit verifies all indices are present exactly once and the joined ciphertext digest matches. Same `(space_id, device_id, idempotency_key)` with identical body returns its stored result; a changed body returns `409 IDEMPOTENCY_CONFLICT`.

A normal upload uses one `operation: "upload"` session. A source-to-current replacement creates two sessions owned by the current device: `replace-before` contains current local data and `replace-after` contains the selected source data re-encrypted for the current device. The client commits through the `replace-after` URL with body `{ beforeUploadId: beforeSession.id }`; the Worker verifies both sessions are complete, staged, owned by the same authenticated device and not previously consumed, then commits both in one D1 batch. History restore uses the equivalent `restore-before` and `restore-after` pair.

- [ ] **Step 4: Implement the D1 commit batch for upload and replacement**

```js
function replacementStatements(db, input, now) {
  return [
    db.prepare("UPDATE snapshots SET role='history', committed_at=? WHERE space_id=? AND device_id=? AND role='latest'").bind(now, input.spaceId, input.deviceId),
    db.prepare("UPDATE snapshots SET role='history', committed_at=? WHERE id=? AND role='staged'").bind(now, input.beforeSnapshotId),
    db.prepare("UPDATE snapshots SET role='latest', committed_at=? WHERE id=? AND role='staged'").bind(now, input.afterSnapshotId),
    db.prepare("DELETE FROM snapshots WHERE id IN (SELECT id FROM snapshots WHERE space_id=? AND device_id=? AND role='history' ORDER BY server_created_at DESC, id DESC LIMIT -1 OFFSET 3)").bind(input.spaceId, input.deviceId),
    db.prepare("UPDATE upload_sessions SET status='committed', result_json=? WHERE id=?").bind(JSON.stringify(input.result), input.uploadId)
  ];
}
```

For a normal upload, old latest becomes history and the staged snapshot becomes latest. For replacement/restore, the explicitly uploaded pre-overwrite snapshot is ordered as the newest history, the old cloud latest follows it, and the re-encrypted target snapshot becomes latest; then trim histories to three. Use one `DB.batch()` call so any failed statement rolls back the role switch and result. Delete expired, uncommitted sessions only during later authenticated requests.

- [ ] **Step 5: Implement metadata/read/device operations**

`GET /v1/devices` returns encrypted names plus server timestamps, latest/history snapshot metadata and current/revoked flags; it never returns token digests. Current device latest is excluded from cross-device source suggestions by the client, not deleted. Rename replaces only encrypted name. Revoke disallows revoking the sole active device unless the request is permanent space deletion; `deleteSnapshots=true` deletes that device’s ciphertext, `false` retains it but denies future token use.

- [ ] **Step 6: Run the full Worker suite**

Run: `npm test -- --max-workers=1 --no-isolate`

Expected: PASS for chunk retry, digest failures, missing chunks, immutable reads, snapshot deletion during pull, transactional rollback, three-history trimming, 10 MiB/100 MiB limits, 24-hour cleanup, revoke retain/delete choices and D1 quota error mapping.

- [ ] **Step 7: Commit snapshot services**

```bash
git add cloud-sync/worker/src cloud-sync/worker/test/snapshots.spec.js
git commit -m "feat: store encrypted device snapshots"
```

---

### Task 9: Build the Browser HTTP Client

**Files:**
- Create: `js/cloud-sync-config.js`
- Create: `js/cloud-sync-api.js`
- Create: `js/cloud-sync-api.test.js`

**Interfaces:**
- Consumes: `fetch`, public `QinshiCloudSyncConfig.apiBaseUrl`, paired device credentials.
- Produces: `CloudSyncApi.health()`, `createSpace(body)`, `getParameters(code)`, `pair(code,body)`, `listDevices()`, `createUpload(body,idempotencyKey)`, `putChunk(uploadId,index,bytes,digest)`, `commitUpload(uploadId,body,idempotencyKey)`, `getSnapshot(id)`, `getChunk(id,index)`, device/security methods and `CloudSyncApiError`.

- [ ] **Step 1: Write failing transport tests**

```js
test('retries GET and idempotent writes twice but not auth failures', async () => {
  const fetch = sequence([networkError(), response(503, quotaError), response(200, { ok: true })]);
  const api = createApi({ fetch, apiBaseUrl: 'https://sync.example.test' });
  assert.deepEqual(await api.health(), { ok: true });
  assert.equal(fetch.calls.length, 3);
});

test('sends app version, device auth and the same idempotency key', async () => {
  await api.createUpload(body, 'stable-op-id');
  assert.equal(lastHeaders['X-Qin-App-Version'], '1.0.39');
  assert.equal(lastHeaders['Idempotency-Key'], 'stable-op-id');
  assert.match(lastHeaders.Authorization, /^Device /);
});
```

- [ ] **Step 2: Run and confirm missing client failure**

Run: `node --test js/cloud-sync-api.test.js`

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement fail-closed configuration and transport**

```js
window.QinshiCloudSyncConfig = Object.freeze({ enabled: false, apiBaseUrl: '' });

async function request(path, options) {
  if (!config.enabled || !/^https:\/\//.test(config.apiBaseUrl)) {
    throw new CloudSyncApiError('SYNC_NOT_CONFIGURED', '云同步服务尚未配置。', false);
  }
  // Abort after 15 seconds; retry network/429/503 twice at 500 ms and 1500 ms.
}
```

Retry only GET, chunk PUT and writes carrying an idempotency key. Map `401 DEVICE_REVOKED` to a dedicated state that clears local pairing after user-facing notice, but do not clear any `qinshi_` data. Never include request bodies, authorization values or ciphertext in logs.

- [ ] **Step 4: Run API tests**

Run: `node --test js/cloud-sync-api.test.js`

Expected: PASS for URL joining, headers, timeouts, retry boundaries, quota/offline/version/revoked/source-deleted messages and disabled configuration.

- [ ] **Step 5: Commit the HTTP client**

```bash
git add js/cloud-sync-config.js js/cloud-sync-api.js js/cloud-sync-api.test.js
git commit -m "feat: connect pwa to cloud sync api"
```

---

### Task 10: Expose PWA Version Preflight and Resumable Operations

**Files:**
- Modify: `js/pwa.js`
- Modify: `tests/pwa-update.test.js`

**Interfaces:**
- Consumes: existing non-cached `version.json` checks and service-worker update flow.
- Produces: `QinshiPWA.ensureCurrentForSync(workerLimits): Promise<{ready:boolean,updateRequired:boolean}>`, `QinshiPWA.applyWaitingUpdate(): boolean`, existing `version`.

- [ ] **Step 1: Add failing preflight tests**

```js
test('sync preflight blocks when public or Worker version requires update', async () => {
  const pwa = await loadPwa(registration, { remoteVersion: '1.0.40', appVersion: '1.0.39' });
  assert.deepEqual(await pwa.ensureCurrentForSync({ minimumReadVersion: '1.0.40', minimumWriteVersion: '1.0.40' }), {
    ready: false, updateRequired: true
  });
});
```

- [ ] **Step 2: Run and observe missing method failure**

Run: `node --test tests/pwa-update.test.js`

Expected: FAIL because `ensureCurrentForSync` is undefined.

- [ ] **Step 3: Implement a public promise-based preflight**

```js
function ensureCurrentForSync(limits) {
  return fetchRemoteVersion().then(function (remoteVersion) {
    var minimum = limits.minimumWriteVersion;
    var ready = compareVersions(APP_VERSION, remoteVersion) >= 0 && compareVersions(APP_VERSION, minimum) >= 0;
    if (!ready) return registration.update().then(function () { return { ready: false, updateRequired: true }; });
    return { ready: true, updateRequired: false };
  });
}
```

Reuse the existing no-cache/retry behavior and status UI. This method must not clear caches or reload by itself. The sync coordinator stores `{type,snapshotId}` under `sessionStorage` key `qin-cloud-sync-pending`, then calls the explicit existing update application path. Export `applyWaitingUpdate`; if no waiting worker is ready, keep the operation pending and tell the user to use “强制修复更新”.

- [ ] **Step 4: Run PWA tests**

Run: `node --test tests/pwa-update.test.js`

Expected: PASS for current version, public newer version, Worker minimum version, offline failure and unchanged existing update safeguards.

- [ ] **Step 5: Commit PWA preflight support**

```bash
git add js/pwa.js tests/pwa-update.test.js
git commit -m "feat: gate cloud sync on pwa version"
```

---

### Task 11: Implement Create, Join and Manual Upload Coordination

**Files:**
- Create: `js/cloud-sync.js`
- Create: `js/cloud-sync.test.js`

**Interfaces:**
- Consumes: Tasks 1–4 and 9–10 globals plus Worker endpoints.
- Produces: `QinshiCloudSync.createSpace(input)`, `joinSpace(input)`, `uploadCurrentDevice()`, `getDashboard()`, `forgetCurrentDevice()`, `resumePendingOperation()`.

- [ ] **Step 1: Write failing orchestration tests**

```js
test('create shows recovery once, persists pairing and uploads first snapshot', async () => {
  const result = await sync.createSpace({ password: 'long password', deviceName: 'Windows 设备' });
  assert.match(result.syncCode, /^[A-Z0-9-]+$/);
  assert.ok(result.recoveryKey);
  assert.equal(api.calls.createSpace, 1);
  assert.equal(api.calls.commitUpload, 1);
  assert.equal(storage.dump().password, undefined);
});

test('join registers only and does not upload or overwrite', async () => {
  await sync.joinSpace({ syncCode, password, deviceName: 'iPhone 设备' });
  assert.equal(api.calls.pair, 1);
  assert.equal(api.calls.createUpload, 0);
  assert.deepEqual(settings.collectManagedData(), localBefore);
});
```

- [ ] **Step 2: Run and confirm the missing coordinator failure**

Run: `node --test js/cloud-sync.test.js --test-name-pattern="create|join|upload"`

Expected: FAIL because `js/cloud-sync.js` does not exist.

- [ ] **Step 3: Implement creation and pairing**

```js
async function joinSpace(input) {
  var params = await api.getParameters(normalizeSyncCode(input.syncCode));
  var keys = await cryptoApi.derivePasswordKeys(input.password, params.kdf);
  var masterKey = await cryptoApi.unwrapMasterKey(params.passwordWrappedMaster, keys.wrappingKey, params.spaceId);
  var device = createLocalDevice(input.deviceName || detectDeviceName());
  var paired = await api.pair(input.syncCode, encryptedPairBody(device, keys.authKey, masterKey));
  await storage.savePairing(pairingRecord(paired, device, masterKey));
  return paired;
}
```

Creation must generate all secrets client-side, require password confirmation, show/download the sync code and one-time recovery key, require “我已保存恢复密钥” before closing, and then upload the first latest snapshot. Joining never uploads and never replaces local data.

`detectDeviceName()` uses this deterministic order: iPhone user agent → `iPhone 设备`; iPad user agent or macOS platform with more than one touch point → `iPad 设备`; Android with mobile marker → `Android 手机`; Android without mobile marker → `Android 平板`; Windows → `Windows 设备`; otherwise → `浏览器设备`. The form always permits editing before pairing.

- [ ] **Step 4: Implement no-change-aware manual upload**

Collect all `qinshi_` values, create/encrypt an envelope, preflight PWA and Worker write versions, then compare its `dataHash` against the authenticated metadata of the current cloud latest. If unchanged, update UI with “本机数据无变化” and do not create history. Otherwise upload chunks with one stable operation UUID and commit.

- [ ] **Step 5: Run focused coordination tests**

Run: `node --test js/cloud-sync.test.js --test-name-pattern="create|join|upload|no change|revoked"`

Expected: PASS; password and recovery key are absent from IndexedDB and logs, join makes no data change, upload is manual and idempotent.

- [ ] **Step 6: Commit accountless pairing and upload**

```bash
git add js/cloud-sync.js js/cloud-sync.test.js
git commit -m "feat: create and upload device snapshots"
```

---

### Task 12: Implement Safe Source-to-Current Overwrite and History Restore

**Files:**
- Modify: `js/cloud-sync.js`
- Modify: `js/cloud-sync.test.js`

**Interfaces:**
- Consumes: immutable `snapshotId`, `QinshiSettings`, crypto, IndexedDB store and two staged upload sessions.
- Produces: `preparePull(snapshotId)`, `confirmPull(preview)`, `restoreHistory(snapshotId)`, `recoverInterruptedRollback()`.

- [ ] **Step 1: Write failing ordering and rollback tests**

```js
test('pull pins source id and performs backup before local replacement', async () => {
  await sync.confirmPull(await sync.preparePull('snap-source-7'));
  assert.deepEqual(events, [
    'preflight', 'download:snap-source-7', 'decrypt-validate', 'json-backup',
    'save-indexeddb-rollback', 'stage-before', 'stage-after', 'replace-local',
    'commit-cloud', 'clear-rollback', 'reload'
  ]);
});

test('cloud commit failure restores local data and retains rollback copy', async () => {
  api.failCommit = true;
  await assert.rejects(() => sync.confirmPull(preview), /云端提交失败/);
  assert.deepEqual(settings.collectManagedData(), before);
  assert.deepEqual(await storage.loadRollbackCopy(), before);
});
```

- [ ] **Step 2: Run and observe failing pull behavior**

Run: `node --test js/cloud-sync.test.js --test-name-pattern="pull|restore|rollback"`

Expected: FAIL because pull/history restore methods do not exist.

- [ ] **Step 3: Implement immutable download and confirmation preview**

`preparePull(snapshotId)` preflights versions, re-fetches exact snapshot metadata, downloads every chunk, verifies per-chunk and full ciphertext digests, decrypts and validates the envelope, then returns only a preview object containing source full device name, current full device name, server snapshot time, app version, item count, byte size, snapshot ID and an opaque in-memory prepared handle. It does not modify data. UI confirmation text must contain `来源设备 → 当前设备` and “当前设备全部个人数据将被覆盖”.

- [ ] **Step 4: Implement the exact overwrite protocol**

```js
async function confirmPull(prepared) {
  var before = settings.collectManagedData();
  settings.downloadPayload(settings.makePayload('before-cloud-sync'), 'before-cloud-sync');
  await storage.saveRollbackCopy({ createdAt: nowIso(), data: before });
  var staged = await stageReplacementSnapshots(before, prepared.envelope.data);
  try {
    settings.replaceManagedData(prepared.envelope.data);
    await api.commitUpload(staged.uploadId, staged.commitBody, staged.idempotencyKey);
  } catch (error) {
    settings.restoreManagedData(before);
    throw error;
  }
  await storage.clearRollbackCopy();
  location.reload();
}
```

The `before` snapshot is encrypted under the current space key and marked as current device’s newest history. The `after` snapshot is the source data re-encrypted with a new IV/AAD and owned by the current device. A blocked browser download does not stop the IndexedDB rollback copy. Before local replacement the user may cancel; after replacement begins all duplicate controls are locked.

- [ ] **Step 5: Implement version-update resume and interrupted recovery**

When preflight requires an update, persist only `{type:'pull'|'restore', snapshotId}` and trigger PWA update. After reload, reauthenticate, re-fetch that exact snapshot ID and reopen confirmation; never store decrypted data in pending state. On startup, if a rollback copy remains, compare it with local data and show “恢复覆盖前数据” / “保留当前数据并删除回滚副本”; never silently discard it.

- [ ] **Step 6: Run all coordinator tests**

Run: `node --test js/cloud-sync.test.js js/settings.test.js js/cloud-sync-core.test.js js/cloud-sync-crypto.test.js js/cloud-sync-storage.test.js js/cloud-sync-api.test.js`

Expected: PASS for successful pulls, blocked downloads, storage exhaustion, source deletion, changed source latest alias, broken chunks, wrong AAD, local write failure, cloud batch failure, reload continuation and own-history restore.

- [ ] **Step 7: Commit overwrite safety**

```bash
git add js/cloud-sync.js js/cloud-sync.test.js
git commit -m "feat: safely restore device snapshots"
```

---

### Task 13: Add Device and Security Coordination

**Files:**
- Modify: `js/cloud-sync.js`
- Modify: `js/cloud-sync.test.js`

**Interfaces:**
- Consumes: authenticated API and local master key.
- Produces: `renameDevice(deviceId,name)`, `revokeDevice(deviceId,deleteSnapshots)`, `changePassword(input)`, `rotateRecoveryKey()`, `resetPasswordWithRecovery(input)`, `deleteSpace(input)`.

- [ ] **Step 1: Write failing device/security tests**

```js
test('rename encrypts the name and never sends plaintext', async () => {
  await sync.renameDevice('dev-2', '安卓平板');
  assert.equal(JSON.stringify(api.lastBody).includes('安卓平板'), false);
});

test('forget device removes pairing only', async () => {
  await sync.forgetCurrentDevice();
  assert.equal(await storage.loadPairing(), null);
  assert.deepEqual(settings.collectManagedData(), existingProgress);
});
```

- [ ] **Step 2: Run and confirm missing operation failures**

Run: `node --test js/cloud-sync.test.js --test-name-pattern="rename|revoke|password|recovery|delete space|forget"`

Expected: FAIL for unimplemented operations.

- [ ] **Step 3: Implement encrypted metadata and credential rotation**

Encrypt every device name and user-readable summary using the master key with purpose-specific AAD. Password change derives new auth/wrap keys and sends only new auth digest plus new wrapped master key. Recovery rotation generates and displays a new one-time key and invalidates the old server values atomically. Recovery password reset replaces both password and recovery wrappers, revokes all existing tokens and saves only the newly registered device token locally.

- [ ] **Step 4: Implement destructive confirmations**

Revoke dialog must show device full name and radio options “保留该设备快照” / “同时删除该设备快照”. Permanent delete requires fresh password or recovery key, then a second dialog whose text input must equal `永久删除同步空间`; successful deletion clears only cloud pairing state, leaving local `qinshi_` data and JSON export intact.

- [ ] **Step 5: Run device/security tests and commit**

Run: `node --test js/cloud-sync.test.js --test-name-pattern="rename|revoke|password|recovery|delete space|forget"`

Expected: PASS with no plaintext metadata/secrets in requests or persistence.

```bash
git add js/cloud-sync.js js/cloud-sync.test.js
git commit -m "feat: manage sync devices and security"
```

---

### Task 14: Build the Settings Page Sync Interface

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/cloud-sync.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: all `QinshiCloudSync` methods and current Settings/PWA panels.
- Produces: accessible unbound/paired dashboards, source selector, history, progress, confirmation and device/security dialogs.

- [ ] **Step 1: Add failing static markup and script-order tests**

```js
test('云同步设置页包含完整手动流程且脚本依赖顺序正确', () => {
  assert.match(html, /id="cloud-sync-panel"/);
  assert.match(html, /上传本机快照/);
  assert.match(html, /从其他设备同步/);
  assert.ok(indexOfScript('cloud-sync-core.js') < indexOfScript('cloud-sync.js'));
  assert.ok(indexOfScript('settings.js') < indexOfScript('cloud-sync.js'));
  assert.ok(indexOfScript('pwa.js') < indexOfScript('cloud-sync.js'));
});
```

- [ ] **Step 2: Run and observe missing UI failure**

Run: `node --test serve.test.js --test-name-pattern="云同步"`

Expected: FAIL because the cloud sync panel and scripts are absent.

- [ ] **Step 3: Add the unbound and paired panel states**

```html
<section id="cloud-sync-panel" class="panel settings-panel cloud-sync-panel" aria-labelledby="cloud-sync-title">
  <div id="cloud-sync-title" class="panel-title">跨设备数据同步</div>
  <p class="settings-copy">手动选择一台来源设备，用它的全部工具数据覆盖当前设备；不会自动合并。</p>
  <div id="cloud-sync-unbound"></div>
  <div id="cloud-sync-paired" hidden></div>
  <p id="cloud-sync-status" class="settings-status" role="status" aria-live="polite"></p>
</section>
```

Unbound state contains “创建同步空间” and “加入已有同步空间”; labels are persistent, password fields use `autocomplete="new-password"` or `current-password`, visibility toggles have explicit accessible names, and device name defaults from platform but remains editable. When config is disabled, show “云同步服务尚未配置，本机数据和 JSON 备份不受影响” and disable only cloud actions.

Display a fixed explanation: “工具版本由 PWA 更新；本面板只同步工具内保存的数据。同步开始前会先检查并更新工具版本。” This prevents users from mistaking data snapshots for code distribution.

- [ ] **Step 4: Add the dashboard, source cards and confirmation**

Paired dashboard shows current device full name, tool version, cloud status, last upload and last result. Source cards sort by Worker server upload time descending, exclude current latest from cross-device sources, default to no selection, and show decrypted device name, server time, snapshot tool version, size and latest/history badge. Confirmation repeats source, target, time, item/size summary and requires an explicit checkbox plus “确认覆盖当前设备”.

- [ ] **Step 5: Add progress, history, management and security panels**

Use `<progress>` plus text such as “上传第 2/5 块”; do not rely on color. Provide history restore only for current device histories, editable device names, revoke retain/delete choice, password change, recovery-key rotation, forget-device, and permanent space deletion. Keep existing JSON panel unchanged and visible.

- [ ] **Step 6: Wire events with a single in-flight write lock**

```js
async function withWriteLock(action) {
  if (state.writeInFlight) return;
  state.writeInFlight = true;
  renderWriteLock(true);
  try { await action(); } finally { state.writeInFlight = false; renderWriteLock(false); }
}
```

Cancel remains enabled only before local replacement starts. Clear sensitive input values immediately after each operation. Use `textContent`, never `innerHTML`, for decrypted names, summaries and errors.

- [ ] **Step 7: Run static and client tests**

Run: `node --test serve.test.js js/cloud-sync.test.js`

Expected: PASS for both panel states, copy, script ordering, explicit source selection, confirmation, write lock, recovery display and unchanged JSON backup.

- [ ] **Step 8: Commit the settings interface**

```bash
git add index.html css/style.css js/cloud-sync.js serve.test.js
git commit -m "feat: add device snapshot sync settings"
```

---

### Task 15: Make the Sync Flow Responsive and Browser-Testable

**Files:**
- Modify: `css/style.css`
- Modify: `tests/mobile-layout.cjs`
- Create: `tests/cloud-sync-browser.cjs`

**Interfaces:**
- Consumes: served PWA and a route-stubbed Worker API.
- Produces: desktop table/wide cards, single-column phone/tablet cards, 44px controls and end-to-end browser regression coverage.

- [ ] **Step 1: Write failing responsive and browser tests**

```js
for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 1366 }]) {
  await page.setViewportSize(viewport);
  await page.goto(appUrl + '#settings');
  await expectNoPageHorizontalOverflow(page);
  await expectMinTapTargets(page, '#cloud-sync-panel button', 44);
}
```

Add a browser flow that creates mocked encrypted device metadata, selects “Windows 设备 1”, verifies the direction text, confirms overwrite, forces commit failure and asserts original `qinshi_` values plus rollback recovery UI remain.

- [ ] **Step 2: Run and observe layout/flow failures**

Run: `node tests/cloud-sync-browser.cjs`

Run: `node tests/mobile-layout.cjs`

Expected: FAIL because cloud-sync layout selectors and flows are not implemented.

- [ ] **Step 3: Implement responsive CSS with no horizontal dependency**

```css
.cloud-sync-device-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cloud-sync-action { min-height: 44px; }
.cloud-sync-direction { overflow-wrap: anywhere; }
@media (max-width: 1024px) {
  .cloud-sync-device-grid { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .cloud-sync-panel { padding: 14px; }
  .cloud-sync-actions { display: grid; grid-template-columns: 1fr; }
}
```

Use a modal sheet on phones and centered dialog on wider screens. Keep all values wrapping inside cards, reserve fixed-width columns only above 1024px, preserve visible focus rings, and use red only for destructive actions.

- [ ] **Step 4: Complete browser scenarios**

Test create → one-time recovery confirmation → first upload; join without overwrite; upload no-change; source pull; PWA update pending/reload resume; offline; revoked token; missing/tampered chunk; cloud commit rollback; forget device; and JSON export still working.

- [ ] **Step 5: Run responsive/browser checks**

Run: `node tests/cloud-sync-browser.cjs`

Run: `node tests/mobile-layout.cjs`

Expected: PASS at 390, 768, 1024 and 1440 widths with no page-level horizontal overflow and all major controls at least 44×44px.

- [ ] **Step 6: Commit responsive coverage**

```bash
git add css/style.css tests/mobile-layout.cjs tests/cloud-sync-browser.cjs
git commit -m "test: cover responsive cloud sync flows"
```

---

### Task 16: Document and Locally Verify the Free Worker Deployment

**Files:**
- Create: `cloud-sync/worker/README.md`
- Modify: `README.md`
- Modify: `cloud-sync/worker/wrangler.jsonc.example`

**Interfaces:**
- Consumes: user-owned Cloudflare Free account at execution time.
- Produces: a locally verified Worker configuration and an explicit deployment runbook; no remote mutation occurs in this task.

- [ ] **Step 1: Document the exact local configuration workflow**

The committed example uses:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "qin-cloud-sync",
  "main": "src/index.js",
  "compatibility_date": "2026-09-11",
  "vars": {
    "ALLOWED_ORIGINS": "https://yuanyu0505.github.io,http://localhost:8000,http://localhost:8001,http://localhost:8002,http://localhost:8003,http://localhost:8004,http://localhost:8005,http://localhost:8006,http://localhost:8007,http://localhost:8008,http://localhost:8009,http://localhost:8010",
    "MINIMUM_READ_VERSION": "1.0.39",
    "MINIMUM_WRITE_VERSION": "1.0.39"
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "qin-cloud-sync",
    "database_id": "00000000-0000-0000-0000-000000000000",
    "migrations_dir": "migrations"
  }]
}
```

README must say the zero UUID is intentionally non-deployable. At deployment, copy this to ignored `wrangler.local.jsonc` and replace only the ID with the UUID returned by `wrangler d1 create qin-cloud-sync`; never commit that file.

- [ ] **Step 2: Document local migration and smoke commands**

```bash
cd cloud-sync/worker
npm ci
npx wrangler d1 migrations apply qin-cloud-sync-test --local -c wrangler.test.jsonc
npm test -- --max-workers=1 --no-isolate
npx wrangler dev -c wrangler.test.jsonc
```

The smoke checklist exercises health, create, pair, upload, source replacement, three-history trim, revoke and recovery against local D1. It also queries local D1 and asserts that a known plaintext device name, sample `qinshi_` value, password, recovery key and device token do not appear.

- [ ] **Step 3: Record the free-only and failure policy**

README states that the app never creates paid resources or offers paid upgrades; free quota exhaustion maps to a paused sync notice; third-party pricing can change; local features and JSON backups remain available. It names Workers Free + D1 Free as the only cloud dependencies and lists R2, Durable Objects and scheduled triggers as prohibited.

- [ ] **Step 4: Run documentation contract tests**

Add assertions to `serve.test.js` that the Worker runbook contains `Workers Free`, `D1 Free`, `wrangler.local.jsonc`, no committed real UUID pattern other than the all-zero sentinel, and the exact deploy ordering.

Run: `node --test serve.test.js --test-name-pattern="云同步部署"`

Expected: PASS.

- [ ] **Step 5: Commit the runbook**

```bash
git add README.md serve.test.js cloud-sync/worker/README.md cloud-sync/worker/wrangler.jsonc.example
git commit -m "docs: add free cloud sync runbook"
```

---

### Task 17: Execute Authorized Cloudflare Deployment in Safe Order

**Files:**
- Local ignored file: `cloud-sync/worker/wrangler.local.jsonc`
- Modify after deployment: `js/cloud-sync-config.js`
- Modify after public verification: `cloud-sync/worker/wrangler.local.jsonc` only

**Interfaces:**
- Consumes: explicit user authorization to sign in to and mutate their Cloudflare account.
- Produces: a public Worker HTTPS URL, migrated D1 database and restricted production CORS.

- [ ] **Step 1: Stop and obtain explicit authorization for external account changes**

Explain that the following steps create a D1 database, deploy a Worker and send requests to the user’s Cloudflare account. Do not execute `wrangler login`, `d1 create`, remote migration or deploy until the user explicitly authorizes these external mutations.

- [ ] **Step 2: Verify the account is on free plans before resource creation**

Run after authorization in `cloud-sync/worker`: `npx wrangler login`

Run: `npx wrangler whoami`

In the Cloudflare dashboard verify Workers plan is Free and no paid Workers subscription/usage-based add-on is enabled. If the account is not free-only, stop; do not create or deploy resources.

- [ ] **Step 3: Create D1 and prepare ignored production config**

Run: `npx wrangler d1 create qin-cloud-sync`

Copy `wrangler.jsonc.example` to ignored `wrangler.local.jsonc` and replace the all-zero `database_id` with the exact returned UUID. Verify `git status --short` does not list `wrangler.local.jsonc`.

- [ ] **Step 4: Apply remote migration and deploy backward-compatible Worker**

Run: `npx wrangler d1 migrations apply qin-cloud-sync --remote -c wrangler.local.jsonc`

Run: `npx wrangler deploy -c wrangler.local.jsonc`

Record the returned `https://…workers.dev` URL outside logs containing credentials. Keep `MINIMUM_READ_VERSION` and `MINIMUM_WRITE_VERSION` at the currently published PWA version during this first deploy.

- [ ] **Step 5: Run production API smoke checks without real personal data**

Use generated disposable credentials and `qinshi_smoke = "encrypted-smoke"` in the browser/client harness to test create, pair, upload, immutable download, replacement, revoke and recovery. Then permanently delete the disposable space. Confirm disallowed Origin gets 403 and the GitHub Pages Origin receives exact CORS. Never print derived keys, tokens or plaintext request payloads.

- [ ] **Step 6: Patch the public endpoint into the PWA**

Use `apply_patch` to change `enabled` from `false` to `true` and `apiBaseUrl` from the empty string to the exact HTTPS URL printed by the successful `wrangler deploy` command. Re-open `js/cloud-sync-config.js`, parse the configured value with `new URL(...)`, and assert its protocol is `https:` and hostname ends with `.workers.dev`; do not infer or hand-type the account subdomain.

- [ ] **Step 7: Commit only the public endpoint change**

```bash
git add js/cloud-sync-config.js
git commit -m "chore: configure cloud sync endpoint"
```

Expected: `git diff --cached --name-only` lists only `js/cloud-sync-config.js`; no token, account ID, database ID or local config is staged.

---

### Task 18: Release the PWA with Existing Update Safeguards

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `version.json`
- Modify: `serve.test.js`
- Modify: `tests/pwa-update.test.js`

**Interfaces:**
- Consumes: configured public Worker and all new client scripts.
- Produces: next patch PWA release with versioned resources and complete offline precache.

- [ ] **Step 1: Add failing release consistency assertions**

```js
test('all cloud sync scripts are versioned and precached', () => {
  for (const file of ['cloud-sync-config.js','cloud-sync-core.js','cloud-sync-crypto.js','cloud-sync-storage.js','cloud-sync-api.js','cloud-sync.js']) {
    assert.match(html, new RegExp(`js/${file.replace('.', '\\.')}\\?v=${escapeRegex(version)}`));
    assert.match(serviceWorker, new RegExp(`\\./js/${file.replace('.', '\\.')}`));
  }
});
```

- [ ] **Step 2: Run and observe stale release failures**

Run: `node --test serve.test.js tests/pwa-update.test.js --test-name-pattern="cloud sync|版本|PWA"`

Expected: FAIL until every new script, cache name and version beacon agree.

- [ ] **Step 3: Increment the current PWA patch version exactly once**

Read the current three-part semantic version from `version.json`, increment only its patch component by one, and apply that exact result consistently to `version.json`, `js/pwa.js`, `service-worker.js` cache name, every `?v=` resource in `index.html`, and release assertions. This instruction deliberately derives from the execution-time version so a later unrelated release cannot cause a downgrade.

- [ ] **Step 4: Add every new module to load order and precache**

Load order must be `settings.js` → `cloud-sync-config.js` → `cloud-sync-core.js` → `cloud-sync-crypto.js` → `cloud-sync-storage.js` → `cloud-sync-api.js` → `pwa.js` → `cloud-sync.js` → remaining UI/app scripts. Add all six cloud-sync files to `PRECACHE_URLS`; preserve non-cached `version.json`, first-open/foreground/reconnect/30-minute checks, retry, persistent update notice and forced repair behavior.

- [ ] **Step 5: Run the complete local verification suite**

Run: `node --test js/*.test.js tests/pwa-update.test.js serve.test.js`

Run: `node tests/cloud-sync-browser.cjs`

Run: `node tests/mobile-layout.cjs`

Run in `cloud-sync/worker`: `npm test -- --max-workers=1 --no-isolate`

Expected: all tests pass. If any fail, stop release work, report the exact failure and fix only the relevant implementation before rerunning that suite.

- [ ] **Step 6: Commit the release package**

```bash
git add index.html js/pwa.js service-worker.js version.json serve.test.js tests/pwa-update.test.js
git commit -m "chore: release encrypted device sync pwa"
```

---

### Task 19: Publish, Verify, Then Raise the Worker Write Floor

**Files:**
- Local ignored file: `cloud-sync/worker/wrangler.local.jsonc`
- No repository file is modified unless a release defect is found.

**Interfaces:**
- Consumes: explicit user authorization to push GitHub and deploy the Worker, a clean feature branch and the released version from Task 18.
- Produces: published GitHub Pages PWA, verified multi-device sync and a Worker write floor equal to the new public PWA version.

- [ ] **Step 1: Inspect the exact outgoing change set and secrets**

Run: `git status --short`

Run: `git diff --check`

Run: `git grep -n -E "(api[_-]?token|deviceToken|recoveryKey|password).{0,20}(=|:)" -- ':!docs/superpowers/**' ':!**/*.test.js'`

Expected: only intended committed files differ from `master`; no `.dev.vars`, `wrangler.local.jsonc`, real database UUID, token or user workbook/image is tracked. Preserve all unrelated user changes in the main workspace.

- [ ] **Step 2: Obtain explicit authorization for GitHub push and production checks**

Pushing and production requests are external mutations. Stop until the user authorizes merging to local `master`, pushing `master:main`, and running disposable production sync checks.

- [ ] **Step 3: Merge and publish using the project’s established route**

After authorization, fast-forward local `master` from the isolated branch when possible. If `master` moved, rebase only the feature branch after inspecting conflicts; never reset or overwrite user files. Push `master:main` and let `.github/workflows/pages.yml` deploy GitHub Pages.

- [ ] **Step 4: Verify public PWA before changing Worker floors**

Poll the public `version.json`, `service-worker.js`, `index.html` and every new cloud-sync script with cache-busting query parameters. Require the exact Task 18 version in the beacon/cache/script URLs and HTTP 200 for all assets. Open the public PWA once at 390px, 768px, 1024px and desktop width and confirm the settings sync panel is usable without horizontal page scrolling.

- [ ] **Step 5: Complete disposable two-device production acceptance**

Use two clean browser profiles named “Windows 验收设备” and “手机验收设备”. Create a disposable space, upload A, join B without changing B, select A → B, verify JSON backup is triggered and B is overwritten, change/upload B, select B → A, verify reverse overwrite, create four more snapshots and confirm only three histories remain, force an offline and revoked-device error, then delete the disposable space. Do not use or upload the user’s real progress for this acceptance.

- [ ] **Step 6: Raise only the minimum write version and redeploy Worker**

In ignored `wrangler.local.jsonc`, set `MINIMUM_WRITE_VERSION` to the exact publicly verified Task 18 PWA version; retain `MINIMUM_READ_VERSION` unless the data format genuinely became unreadable. Run: `npx wrangler deploy -c wrangler.local.jsonc`.

Verify the public `/v1/health` now returns the new write floor, the new PWA can upload, and a simulated prior-version request gets `426 UPDATE_REQUIRED` without creating an upload session.

- [ ] **Step 7: Report verifiable completion evidence**

Report the local `master` commit, pushed `origin/main` commit, PWA version, public Pages URL, Worker health result, D1 migration state, local/Worker/browser suite results, production two-device scenario result, and confirmation that only encrypted disposable data reached D1. Do not claim real-device iOS/Android success unless those devices were actually tested by the user.

---

## Final Acceptance Checklist

- [ ] 手动创建/加入同步空间可用，首次后本设备无需重复输入密码。
- [ ] 创建时生成一次性恢复密钥，恢复重设会撤销全部旧设备令牌。
- [ ] 任意设备可以上传自己的完整快照，其他设备必须明确选择来源后才能覆盖。
- [ ] 加入设备不会自动上传或覆盖；不同设备数据从不自动合并。
- [ ] 覆盖前显示完整来源、目标、服务器时间和摘要，并要求二次确认。
- [ ] 覆盖前 JSON 备份、IndexedDB 回滚副本和当前设备最新历史均产生。
- [ ] 当前设备云端最新版成为来源数据的重新加密副本，每台设备历史最多三份。
- [ ] PWA 或 Worker 版本不足时先更新工具，再用原不可变快照 ID恢复操作。
- [ ] 所有现有与未来 `qinshi_` 字符串值被同步，其他 localStorage 数据不受影响。
- [ ] D1、日志、仓库和构建产物均不含个人数据、设备名、密码、恢复密钥、主密钥或设备令牌明文。
- [ ] 网络、额度、分块、解密、本地写入或 D1 事务任一失败都不会留下半份本机数据或替换有效云端最新版。
- [ ] 设置页保留 JSON 导入导出；云端未配置或不可用时全部本地功能正常。
- [ ] 设备重命名、撤销并保留/删除快照、改密码、轮换恢复密钥、忘记设备和永久删除空间均有完整流程。
- [ ] 390px、768px、1024px 和桌面宽度无整页横向溢出，主要按钮至少 44×44px。
- [ ] 只部署 Workers Free 与 D1 Free；免费额度用尽时同步停止并明确提示，不产生自动费用。
- [ ] 发布顺序严格为 Worker 向后兼容 → PWA → 公网验证 → Worker 提升最低写入版本。
