# 多游戏账号档案系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Qin 增加最多三套、跨全部个人数据分区隔离的账号档案，并让完整备份和云同步安全支持全部账号。

**Architecture:** 新增账号注册表和按账号 ID 划分的物理存储命名空间，所有业务模块通过统一门面访问当前标签页绑定账号的数据。设置备份继续处理全部 `qinshi_` 受管键，旧本机数据与旧 JSON 可迁移，旧云快照必须拒绝。

**Tech Stack:** Vanilla JavaScript、DOM、Local/Session Storage、BroadcastChannel、Node `node:test`、Service Worker、GitHub Pages PWA。

**Spec:** `docs/superpowers/specs/2026-09-23-multi-account-profiles-design.md`

## Global Constraints

- 最多三个账号，名称和服务器均由玩家自由填写，规范化后的组合必须唯一。
- 主账号固定置顶；其他账号可手动排序；设主账号不立即切换。
- 个人数据全部隔离；云同步凭据、PWA 状态和纯界面偏好保持全局。
- 不同标签页可选择不同账号；同账号只有一个标签页能编辑。
- 清空、删除和导入前必须先触发全部账号完整备份。
- 旧本机数据和版本 1 JSON 自动迁移；缺少账号注册表的旧云快照拒绝覆盖。
- 不修改用户未提交的 Excel、README、HANDOVER、serve.js 和本地图片。
- 按项目 `AGENTS.md` 不主动运行测试、构建或实机验收；只更新测试并给出用户手动命令。
- 完成后快进合并本地 `master`、升级 PWA、推送远端 `main` 并只读确认线上版本。

## Review Focus

- 存储空间不足或中途异常时，旧数据必须保留，不能留下已提交的半账号。
- 两个标签页争抢同一账号时，失去租约的一方任何持久化写入都必须被拒绝。
- 删除当前主账号、删除最后账号、清空当前账号后，重新加载目标必须确定且不会循环。
- 旧 JSON 可以迁移，但同样缺少注册表的旧云快照必须在写入前被拒绝。
- 新增或遗漏的 `qinshi_` 游戏键不能逃出账号命名空间，也不能把运行时租约写入备份。

---

### Task 1: 账号注册表与存储门面

**Files:**
- Create: `js/account-profiles.js`
- Create: `js/account-profiles.test.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `window.QinshiAccounts`。
- Core methods: `boot()`, `currentAccount()`, `listAccounts()`, `getItem(key)`, `setItem(key,value)`, `removeItem(key)`, `createAccount(input)`, `updateAccount(id,patch)`, `setPrimary(id)`, `reorderAccounts(ids)`, `clearAccountData(id)`, `deleteAccount(id)`, `switchAccount(id,returnState)`。
- Registry key: `qinshi_accounts_v1`。
- Physical prefix: `qinshi_account_v1:<accountId>:`。

- [ ] **Step 1: Write registry validation tests**

```js
test("账号注册表限制三个账号且名称服务器组合唯一", () => {
  const store = harness();
  store.createAccount({ name: "主号", server: "微信一区" });
  assert.throws(() => store.createAccount({ name: " 主号 ", server: "微信一区 " }), /已存在/);
  store.createAccount({ name: "小号", server: "微信二区" });
  store.createAccount({ name: "三号", server: "QQ一区" });
  assert.throws(() => store.createAccount({ name: "四号", server: "QQ二区" }), /最多保存3个账号/);
});
```

- [ ] **Step 2: Implement immutable IDs and registry normalization**

Implement pure helpers `normalizeAccountInput`, `validateRegistry`, `normalizeRegistry`, `newAccount`, and `physicalKey(accountId, logicalKey)`. Reject empty fields, duplicate IDs, duplicate normalized name/server pairs, invalid primary IDs, invalid order members and more than three accounts.

- [ ] **Step 3: Write account isolation and deletion tests**

```js
test("相同逻辑键在两个账号中完全隔离", () => {
  const h = harness();
  const a = h.create("A", "一区");
  const b = h.create("B", "一区");
  h.bind(a.id); h.api.setItem("qinshi_progress", "A-data");
  h.bind(b.id); h.api.setItem("qinshi_progress", "B-data");
  h.bind(a.id); assert.equal(h.api.getItem("qinshi_progress"), "A-data");
  h.bind(b.id); assert.equal(h.api.getItem("qinshi_progress"), "B-data");
});
```

- [ ] **Step 4: Implement account CRUD and namespaced storage**

Account mutations must validate a cloned registry before writing it. Data replacement writes and reads every physical key before the registry commit point. `deleteAccount` chooses the earliest remaining `createdAt` as replacement primary and returns `{ nextAccountId, empty }`.

- [ ] **Step 5: Load the storage layer before every personal-data module**

Add `<script src="js/account-profiles.js?v=<release>"></script>` after static data and before `js/tactics-ui.js`, `js/formations-ui.js`, `js/machine-beasts-ui.js`, `js/battle-box-pill-pouch-ui.js`, `js/inscription.js`, `js/forbidden-ui.js` and `js/app.js`.

- [ ] **Step 6: Update tests without running them**

Add static load-order assertions to `serve.test.js`. Suggested user command: `node --test js/account-profiles.test.js serve.test.js`.

### Task 2: 旧本机迁移与所有业务模块接入

**Files:**
- Modify: `js/account-profiles.js`
- Modify: `js/app.js`
- Modify: `js/battle-box-pill-pouch-ui.js`
- Modify: `js/forbidden-ui.js`
- Modify: `js/inscription.js`
- Modify: `js/formations-ui.js`
- Modify: `js/tactics-ui.js`
- Modify: `js/machine-beasts-ui.js`
- Modify tests beside each module

**Interfaces:**
- Consumes: `QinshiAccounts.getItem/setItem/removeItem` from Task 1.
- Produces: every existing personal logical key stored under the active account namespace.
- Migration method: `migrateLegacyLocalData()` returning `{ migrated, accountId }`.

- [ ] **Step 1: Add idempotent legacy migration tests**

```js
test("旧单账号数据只迁移一次且失败不删除旧键", () => {
  const h = harness({ qinshi_forging_progress_v1: "legacy" });
  const first = h.api.migrateLegacyLocalData();
  assert.equal(first.migrated, true);
  assert.equal(h.raw.getItem("qinshi_forging_progress_v1"), null);
  assert.equal(h.api.getItem("qinshi_forging_progress_v1"), "legacy");
  assert.equal(h.api.migrateLegacyLocalData().migrated, false);
});
```

Also simulate a quota exception during physical writes and assert the legacy key and absent registry remain unchanged.

- [ ] **Step 2: Implement two-phase local migration**

Recognize legacy keys beginning `qinshi_` while excluding `qinshi_accounts_v1` and `qinshi_account_v1:`. Write all physical values, read them back, commit the default-account registry, then remove legacy keys.

- [ ] **Step 3: Replace direct personal localStorage calls**

In every listed business module bind:

```js
var accountStore = window.QinshiAccounts;
var saved = accountStore.getItem(STORE_KEY);
accountStore.setItem(STORE_KEY, JSON.stringify(value));
```

Keep logical key constants unchanged. Do not route `sessionStorage`, cloud pairing IndexedDB or PWA version state through the account store.

- [ ] **Step 4: Add per-module account isolation fixtures**

Update each module test harness with a fake `QinshiAccounts` adapter and assert that load/save calls use the logical key, not raw `localStorage`.

- [ ] **Step 5: Add a direct-storage guard test**

In `serve.test.js`, scan production personal-data modules and fail if they contain `localStorage.getItem(`, `localStorage.setItem(` or `localStorage.removeItem(` outside `account-profiles.js` and `settings.js`.

- [ ] **Step 6: Do not run tests**

Suggested user command: `node --test js/app*.test.js js/*ui*.test.js js/inscription-performance.test.js` plus the existing full suite.

### Task 3: 完整备份、旧 JSON 迁移与云快照门禁

**Files:**
- Modify: `js/settings.js`
- Modify: `js/settings.test.js`
- Modify: `js/cloud-sync.js`
- Modify: `js/cloud-sync.test.js`
- Modify: `js/cloud-sync-core.js`
- Modify: `js/cloud-sync-core.test.js`

**Interfaces:**
- Backup format: `formatVersion: 2` with all `qinshi_` managed keys.
- Produces: `QinshiSettings.downloadBackup(reason): boolean`, `validateMultiAccountData(data)`, `upgradeV1Payload(payload)`.
- Cloud preflight consumes `validateMultiAccountData` and rejects legacy snapshot data before replacement staging.

- [ ] **Step 1: Write version 2 backup and version 1 upgrade tests**

```js
test("新版备份包含三个账号且旧 JSON 升级为默认账号", () => {
  const modern = settings.makePayload("manual");
  assert.equal(modern.formatVersion, 2);
  assert.ok(modern.data.qinshi_accounts_v1);
  const upgraded = settings.validatePayload({ formatVersion: 1, appName: "Qin", data: {
    qinshi_forging_progress_v1: "legacy"
  }});
  assert.match(upgraded.qinshi_accounts_v1, /默认账号/);
});
```

- [ ] **Step 2: Implement strict multi-account validation**

Parse the registry, call the Task 1 validator, require every `qinshi_account_v1:<id>:` key to belong to a listed account, reject raw legacy keys in format 2, and enforce the three-account maximum.

- [ ] **Step 3: Make backup triggering observable**

`downloadBackup(reason)` returns `true` only after the anchor click is triggered. Destructive account operations stop when it returns false or throws.

- [ ] **Step 4: Preserve atomic whole-device replacement**

Validate the full candidate before calling `replaceManagedData`. On any write error restore the previous complete managed dataset.

- [ ] **Step 5: Add old-cloud-snapshot rejection tests**

Prepare an otherwise valid encrypted snapshot whose data contains only a legacy `qinshi_progress` key. Assert `preparePull` and `restoreHistory` reject with a user-facing “旧版快照” error before `stageReplacement` or local replacement runs.

- [ ] **Step 6: Keep current cloud history behavior**

Assert a valid version 2 snapshot still creates the current-device before snapshot, installs the selected source, uploads the after snapshot, and preserves exactly the existing recent-three history contract.

- [ ] **Step 7: Do not run tests**

Suggested user command: `node --test js/settings.test.js js/cloud-sync-core.test.js js/cloud-sync.test.js`.

### Task 4: 多标签页编辑租约

**Files:**
- Create: `js/account-edit-lease.js`
- Create: `js/account-edit-lease.test.js`
- Modify: `js/account-profiles.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `window.QinshiAccountLease.create(options)` with `claim(accountId)`, `takeOver(accountId)`, `release()`, `canWrite(accountId)`, `subscribe(listener)`.
- Lease key prefix: `qin_runtime_account_lease_v1:`; channel: `qinshi-account-lease-v1`.
- Storage writes in `QinshiAccounts.setItem/removeItem/replace/clear/delete` require `canWrite(accountId)`.

- [ ] **Step 1: Write ownership, takeover and expiry tests**

Use two fake tabs sharing one localStorage and fake BroadcastChannel. Assert first tab edits, second is read-only, takeover invalidates the first synchronously through lease re-check, and an expired/crashed owner can be replaced.

- [ ] **Step 2: Implement token-checked leases**

Each lease stores `{ accountId, ownerTabId, token, renewedAt, expiresAt }`. A write succeeds only when the stored owner and token equal the caller. Renew on an interval and visibility changes; release on `pagehide` when still owner.

- [ ] **Step 3: Integrate lease state into account storage**

Expose `isReadOnly()`, `takeOverEditing()` and `subscribeAccess()`. Throw an error with code `ACCOUNT_READ_ONLY` before any personal write when the tab is not owner.

- [ ] **Step 4: Add runtime files to PWA load order and precache**

Load `account-edit-lease.js` before `account-profiles.js`; add both to `service-worker.js` and Pages publication assertions.

- [ ] **Step 5: Do not run tests**

Suggested user command: `node --test js/account-edit-lease.test.js js/account-profiles.test.js`.

### Task 5: 全局切换器、初始化页和设置管理页

**Files:**
- Create: `js/account-profiles-ui.js`
- Create: `js/account-profiles-ui.test.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `QinshiAccounts` and `QinshiAccountLease`.
- Produces DOM flows for initialization, switching, account cards, edit/create, primary change, clear/delete confirmation, reorder, read-only banner and takeover.

- [ ] **Step 1: Add the global and settings markup**

Add semantic containers with stable IDs: `account-switcher`, `account-switcher-list`, `account-init-overlay`, `account-manager`, `account-editor`, `account-reorder-panel`, `account-readonly-banner`, and `account-takeover`.

- [ ] **Step 2: Implement initialization and validation UI**

When no account exists, keep ordinary partitions hidden/inert and require both fields. Display duplicate, empty-field and three-account-limit errors inline.

- [ ] **Step 3: Implement switch and return-state flow**

Save the current partition ID and existing navigation return state into `sessionStorage`, bind the target account, reload, then restore the partition without carrying filters or data from the source account.

- [ ] **Step 4: Implement account management actions**

Create/edit forms use custom text inputs. `setPrimary` only rerenders account order. Clear/delete first call `QinshiSettings.downloadBackup`, then require an exact normalized account-name confirmation. Reorder mode swaps two non-primary accounts and persists only on Save.

- [ ] **Step 5: Implement read-only and takeover UI**

The banner names the account and explains the other-tab lock. Persistent controls use a shared disabled state while query/filter/navigation controls remain usable. Takeover calls `takeOverEditing` and rerenders both tabs from lease events.

- [ ] **Step 6: Add desktop, tablet and mobile CSS**

Desktop uses a sidebar popover; phone uses a safe-area-aware bottom sheet; tablet uses a centered sheet. Maintain 44px touch targets, single-column account cards below 767px, no horizontal overflow, visible destructive-action separation and non-obscuring read-only banner.

- [ ] **Step 7: Add DOM behavior tests and static responsive assertions**

Cover zero-account initialization, primary fixed first, manual swap, no immediate switch on primary change, switch reload return, backup-before-destructive ordering, delete-last-account and takeover state.

- [ ] **Step 8: Do not run tests**

Suggested user command: `node --test js/account-profiles-ui.test.js serve.test.js` followed by manual phone/tablet acceptance.

### Task 6: PWA release, integration and delivery

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `version.json`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes all Tasks 1–5.
- Produces the next PWA release and GitHub Pages deployment.

- [ ] **Step 1: Choose the next version from current `version.json`**

Increment `1.0.42` to `1.0.43` consistently in resource query strings, displayed version, `APP_VERSION`, service-worker cache and `version.json`.

- [ ] **Step 2: Verify release resource declarations by inspection**

Ensure all three account scripts are loaded in dependency order, included in Service Worker precache, copied by the existing Pages workflow and asserted by `serve.test.js`.

- [ ] **Step 3: Record unrun verification scope**

Do not run test/build/manual acceptance. In the final response list the suggested full command and the required desktop, iOS, Android and tablet checks without claiming they passed.

- [ ] **Step 4: Commit the feature branch**

Stage only this task's files. Preserve main-workspace modifications to README, HANDOVER, serve.js, Excel and images.

- [ ] **Step 5: Fast-forward merge into local master**

Confirm the feature branch starts at current master and use `git merge --ff-only codex/multi-account-profiles`.

- [ ] **Step 6: Push and inspect deployment**

Push `master:main`, then perform read-only checks that online `version.json`, `service-worker.js` and `index.html` expose `1.0.43` and the new account scripts.
