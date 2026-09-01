# Forging Progress Equipment Quality and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade forging personal-progress equipment to a versioned divine-name-aware orange/red model with quality-derived visuals, correct material limits, and reversible navigation to equipment attributes.

**Architecture:** Keep generated forging and equipment data unchanged. Extend `js/equipment-forging.js` with the cross-dataset progress catalog, put migration, quality conversion, search, and stage-limit rules in pure `js/progress.js`, and leave `js/app.js` responsible for DOM rendering and mutually exclusive navigation sessions.

**Tech Stack:** Vanilla JavaScript (UMD modules), HTML/CSS, Node.js built-in test runner, localStorage PWA, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-01-forging-progress-equipment-quality-navigation-design.md`

## Global Constraints

- Support all 156 forging records; prefer a real divine equipment target and retain the ordinary forging name for materials.
- Keep ordinary and divine choices for 地煞魔铠／神兵魔铠, 月光耳坠／神兵月光, 寒霜挂坠／神兵寒霜, 百家杂记／神兵百家.
- Support only orange and red qualities; new and migrated records default to red.
- Orange uses 6 stages and red uses 11 stages; stage labels and material-table labels remain unchanged.
- Quality switching overwrites one progress value: red→orange clamps at 6 and orange→red inherits the value.
- Existing user spreadsheets, images, `.codex-tmp/`, favorites, comparisons, and unrelated localStorage keys must remain untouched.
- Desktop, tablet, and phone must share the same behavior; touch targets at widths up to 1024px remain at least 44px high.
- Release as PWA `1.0.23`, merge by fast-forward into local `master`, push `master:main`, and verify GitHub Pages.

---

### Task 1: Build the personal-progress equipment catalog

**Files:**
- Modify: `js/equipment-forging.js`
- Modify: `js/equipment-forging.test.js`

**Interfaces:**
- Consumes: `resolveForgeTarget(name, forgingItems)` and `resolveEquipmentTarget(forgeName, equipmentItems, forgingItems)`.
- Produces: `buildProgressEquipmentCatalog(forgingItems, equipmentItems) -> ProgressEquipmentOption[]`, where each option has `{ forgeName, equipmentName, equipmentId, cat, aliases, preferred }`.
- Produces: `searchProgressEquipmentCatalog(catalog, keyword) -> ProgressEquipmentOption[]`.
- Produces: `preferredProgressEquipment(catalog, savedName) -> ProgressEquipmentOption | null`.

- [ ] **Step 1: Write failing catalog tests**

Add assertions that normal aliases collapse to one divine option, Ghost Valley uses its independent forging row, and the four scarce groups keep both exact equipment variants:

```js
test("个人进度目录：普通名和神兵名归一到首选神兵", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "墨眉").map((entry) => [entry.forgeName, entry.equipmentName]),
    [["墨眉", "神兵墨眉"]]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "鬼谷子").map((entry) => [entry.forgeName, entry.equipmentName]),
    [["神兵鬼谷子", "神兵鬼谷子"]]
  );
});

test("个人进度目录：四组稀缺装备保留普通和神兵两个选项", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "魔铠").map((entry) => entry.equipmentName),
    ["地煞魔铠", "神兵魔铠"]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "百家").map((entry) => entry.equipmentName),
    ["百家杂记", "神兵百家"]
  );
});
```

- [ ] **Step 2: Run catalog tests and confirm the missing-interface failure**

Run: `node --test js/equipment-forging.test.js`

Expected: FAIL because `buildProgressEquipmentCatalog` is not defined.

- [ ] **Step 3: Implement catalog construction and alias matching**

Add an explicit exception table and stable normalization:

```js
var PROGRESS_VARIANT_EXCEPTIONS = {
  "地煞魔铠": "神兵魔铠",
  "月光耳坠": "神兵月光",
  "寒霜挂坠": "神兵寒霜",
  "百家杂记": "神兵百家"
};

function normalizeProgressKeyword(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}
```

Build one preferred option per logical forging item, replace the ordinary Ghost Valley option with the independent divine row, append ordinary variants only for the four exceptions, include short aliases (`魔铠`, `月光`, `寒霜`, `百家`), and retain unmatched forging records with `equipmentId: null`.

- [ ] **Step 4: Run focused catalog tests**

Run: `node --test js/equipment-forging.test.js`

Expected: all equipment-forging tests PASS.

- [ ] **Step 5: Commit catalog behavior**

```bash
git add js/equipment-forging.js js/equipment-forging.test.js
git commit -m "feat: map forging progress equipment variants"
```

### Task 2: Add versioned progress migration, quality conversion, and stage limits

**Files:**
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`

**Interfaces:**
- Consumes: `ProgressEquipmentOption[]` from Task 1 and `FORGING_DATA.items`.
- Produces: `normalizeProgressStore(raw, catalog, forgingItems) -> { version: 2, disciples: Disciple[] }`.
- Produces: `qualityStageLimit(quality) -> 6 | 11`.
- Produces: `convertQuality(progressItem, nextQuality) -> ProgressItem` without mutating the input.
- Produces: `requiresQualityDowngradeConfirmation(progressItem, nextQuality) -> boolean`.
- Produces: `progressStatus(progressItem) -> { label, tier }`, with tiers `orange`, `orange-gold`, `red`, `red-gold`.
- Extends: `remainingStages(item, progress, quality)` and `nextStage(item, progress, quality)`; omitted quality remains red-compatible for existing callers.
- Extends: `searchEquipment(data, disciples, keyword, catalog)` to match `forgeName`, `equipmentName`, and aliases.

- [ ] **Step 1: Write failing quality and migration tests**

```js
test("品质换算：红色高锻压缩为橙金且橙金升红继承为6锻", () => {
  assert.deepStrictEqual(P.convertQuality({ id: "i1", forgeName: "墨眉", quality: "red", progress: 9 }, "orange"), {
    id: "i1", forgeName: "墨眉", quality: "orange", progress: 6
  });
  assert.deepStrictEqual(P.convertQuality({ id: "i1", forgeName: "墨眉", quality: "orange", progress: 6 }, "red"), {
    id: "i1", forgeName: "墨眉", quality: "red", progress: 6
  });
  assert.strictEqual(P.requiresQualityDowngradeConfirmation({ quality: "red", progress: 7 }, "orange"), true);
  assert.strictEqual(P.requiresQualityDowngradeConfirmation({ quality: "red", progress: 6 }, "orange"), false);
});

test("品质状态：满锻使用橙金或红金且普通进度显示锻数", () => {
  assert.deepStrictEqual(P.progressStatus({ quality: "orange", progress: 6 }), { label: "满锻", tier: "orange-gold" });
  assert.deepStrictEqual(P.progressStatus({ quality: "red", progress: 11 }), { label: "满锻", tier: "red-gold" });
  assert.deepStrictEqual(P.progressStatus({ quality: "red", progress: 5 }), { label: "5锻", tier: "red" });
});

test("旧进度迁移：默认红色、保留锻数并优先神兵", () => {
  const migrated = P.normalizeProgressStore({ disciples: [{ id: "d1", name: "弟子", items: [
    { id: "i1", name: "墨眉", cat: "武器", progress: 9 },
    { id: "i2", name: "地煞魔铠", cat: "盔甲", progress: 2 }
  ] }] }, progressCatalog, forgingItems);
  assert.strictEqual(migrated.version, 2);
  assert.deepStrictEqual(migrated.disciples[0].items.map((entry) => [entry.forgeName, entry.equipmentName, entry.quality, entry.progress]), [
    ["墨眉", "神兵墨眉", "red", 9],
    ["地煞魔铠", "神兵魔铠", "red", 2]
  ]);
});
```

- [ ] **Step 2: Write failing stage-limit and alias-search tests**

```js
test("橙色只统计前6段且红色统计完整11段", () => {
  assert.strictEqual(P.remainingStages(item, 0, "orange").length, 6);
  assert.deepStrictEqual(P.remainingStages(item, 6, "orange"), []);
  assert.strictEqual(P.remainingStages(item, 6, "red").length, 5);
});

test("个人进度搜索：普通名可命中已保存神兵", () => {
  const result = P.searchEquipment(data, migratedDisciples, "墨眉", progressCatalog);
  assert.strictEqual(result.owned[0].progressItem.equipmentName, "神兵墨眉");
});
```

- [ ] **Step 3: Run progress tests and confirm failures**

Run: `node --test js/progress.test.js`

Expected: FAIL because the new migration and quality functions are missing and orange stages are not capped.

- [ ] **Step 4: Implement the pure progress model**

Use constants and non-mutating helpers:

```js
var PROGRESS_STORE_VERSION = 2;
var QUALITY_LIMITS = { orange: 6, red: 11 };

function qualityStageLimit(quality) {
  return quality === "orange" ? QUALITY_LIMITS.orange : QUALITY_LIMITS.red;
}

function convertQuality(progressItem, nextQuality) {
  var quality = nextQuality === "orange" ? "orange" : "red";
  return Object.assign({}, progressItem, {
    quality: quality,
    progress: Math.min(Math.max(0, progressItem.progress | 0), qualityStageLimit(quality))
  });
}
```

Normalize every disciple and record, migrate old `name` records through the catalog, clamp invalid progress, preserve record IDs and categories, and make every material/search function use the current quality limit.

- [ ] **Step 5: Run focused progress and mapping tests**

Run: `node --test js/progress.test.js js/equipment-forging.test.js`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the progress model**

```bash
git add js/progress.js js/progress.test.js
git commit -m "feat: model forging progress quality"
```

### Task 3: Render quality-aware progress equipment on desktop, tablet, and phone

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 1 catalog APIs and Task 2 progress APIs.
- Produces DOM actions: `data-act="switch-quality"`, `data-progress-equipment`, and quality classes `progress-equipment-orange`, `progress-equipment-orange-gold`, `progress-equipment-red`, `progress-equipment-red-gold`.

- [ ] **Step 1: Write failing interface assertions**

Add a `serve.test.js` case that requires versioned loading, quality actions, dynamic status, no visible quality word badge, and responsive styling:

```js
test("锻造个人进度使用神兵名称底色、品质换算和锻数状态", async () => {
  await withServer(async (port) => {
    const [app, css] = await Promise.all([get(port, "/js/app.js"), get(port, "/css/style.css")]);
    assert.match(app.body, /buildProgressEquipmentCatalog/);
    assert.match(app.body, /normalizeProgressStore/);
    assert.match(app.body, /data-act="switch-quality"/);
    assert.match(app.body, /data-progress-equipment=/);
    assert.match(app.body, /progressStatus/);
    assert.doesNotMatch(app.body, /\$\{item\.quality\}色/);
    assert.match(css.body, /\.progress-equipment-red-gold/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.progress-equipment-link[\s\S]*?min-height:\s*44px/);
  });
});
```

- [ ] **Step 2: Run the interface test and confirm failure**

Run: `node --test --test-name-pattern="锻造个人进度使用神兵名称底色" serve.test.js`

Expected: FAIL because the new DOM hooks and styles do not exist.

- [ ] **Step 3: Wire versioned load/save and catalog-backed add options**

Create one catalog at startup, normalize loaded data, and save the version:

```js
const progressEquipmentCatalog = EQUIP_FORGING.buildProgressEquipmentCatalog(FDATA.items, DATA.items);

function loadProgress() {
  const parsed = JSON.parse(localStorage.getItem(PROG_STORE_KEY) || "null");
  return PROG.normalizeProgressStore(parsed, progressEquipmentCatalog, FDATA.items).disciples;
}

function saveProgress() {
  localStorage.setItem(PROG_STORE_KEY, JSON.stringify({ version: 2, disciples: progState.disciples }));
}
```

Render Task 1 options, save `forgeName`, `equipmentName`, `equipmentId`, `quality: "red"`, and `progress: 0`, and remove the old `（分类·橙色）` candidate copy.

- [ ] **Step 4: Render the quality-aware equipment header and switch action**

Use `PROG.progressStatus(it)` to choose the name class and status copy. Add a separate neutral “切换品质” button only outside read-only search results. Before red high-progress downgrade, call `confirm("当前红色高锻进度将折算为橙金，原高锻进度无法恢复，是否继续？")`; only save after confirmation.

Keep stage labels from `item.stages`, but slice the rendered buttons and all material calculations at `PROG.qualityStageLimit(it.quality)`.

- [ ] **Step 5: Add four quality name styles and responsive touch rules**

Define distinct orange, orange-gold, red, and red-gold backgrounds, reusing the existing equipment-name badge geometry. Keep the equipment name and “切换品质” as separate focusable controls, and add `min-height: 44px; touch-action: manipulation` inside the existing `@media (max-width: 1024px)` block.

- [ ] **Step 6: Run interface and pure tests**

Run: `node --test js/progress.test.js js/equipment-forging.test.js serve.test.js`

Expected: all selected tests PASS.

- [ ] **Step 7: Commit the responsive UI**

```bash
git add js/app.js css/style.css serve.test.js
git commit -m "feat: display forging progress quality"
```

### Task 4: Add reversible personal-progress and equipment navigation

**Files:**
- Modify: `js/equipment-forging.js`
- Modify: `js/equipment-forging.test.js`
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Produces: `createProgressReturnSession(progressView, equipmentName, recordId, scrollY)`.
- Produces: `matchesProgressReturnSession(session, equipmentName)`.
- Consumes: existing `buildReverseEquipmentView`, `captureEquipmentView`, `restoreEquipmentView`, `switchPartition`, and existing forge return-session APIs.

- [ ] **Step 1: Write failing return-session tests**

```js
test("个人进度返回会话：深拷贝来源并只匹配有效同名装备", () => {
  const session = EquipmentForging.createProgressReturnSession(
    { page: 2, query: "墨眉", view: "progress" }, "神兵墨眉", "i1", 720
  );
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "神兵墨眉"), true);
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "墨眉"), false);
  session.valid = false;
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "神兵墨眉"), false);
});
```

- [ ] **Step 2: Run session tests and confirm failure**

Run: `node --test js/equipment-forging.test.js`

Expected: FAIL because the progress return-session functions are absent.

- [ ] **Step 3: Implement the pure session helpers**

Store `{ progressView, equipmentName, recordId, scrollY, valid: true }`, deep-clone the captured view, trim the name, and clamp scroll to a non-negative number.

- [ ] **Step 4: Write failing page-wiring assertions**

```js
test("个人进度装备可进入装备属性并一次性返回原页", async () => {
  await withServer(async (port) => {
    const app = await get(port, "/js/app.js");
    assert.match(app.body, /let progressReturnSession = null/);
    assert.match(app.body, /function captureProgressView/);
    assert.match(app.body, /createProgressReturnSession/);
    assert.match(app.body, /matchesProgressReturnSession/);
    assert.match(app.body, /source:\s*"progress-return"/);
    assert.match(app.body, /invalidateProgressReturnSession\("equipment-filter"\)/);
  });
});
```

- [ ] **Step 5: Implement mutually exclusive navigation sessions**

Add `progressReturnSession`, `captureProgressView`, `restoreProgressView`, and `invalidateProgressReturnSession`. Starting progress→equipment clears `forgeReturnSession`; starting equipment→forge clears `progressReturnSession`.

On a progress equipment click:

1. Capture `progState.page`, `progState.query`, `progState.view`, the search input, record ID, and `window.scrollY`.
2. Restore the equipment view built by `buildReverseEquipmentView` for the exact `equipmentName`.
3. Switch to equipment while preserving the prepared result and scroll the results into view.

On an equipment result name click, check an exact valid progress return session before existing forge navigation. A match restores progress view and scroll; a different name invalidates the session and follows the existing forge query behavior.

Invalidate only on actual changes to equipment search, category, favorites-only, main/sub filters, sorting, or comparison, and on user partition changes. Do not invalidate on scroll. Preserve equipment favorites, comparison contents, and show-main state during forward navigation.

- [ ] **Step 6: Run navigation regression tests**

Run: `node --test js/equipment-forging.test.js js/progress.test.js js/query.test.js serve.test.js`

Expected: all selected tests PASS, including the existing equipment↔forging return tests.

- [ ] **Step 7: Commit navigation behavior**

```bash
git add js/equipment-forging.js js/equipment-forging.test.js js/app.js serve.test.js
git commit -m "feat: return from equipment to forging progress"
```

### Task 5: Release PWA 1.0.23 and integrate

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `serve.test.js`
- Modify: `HANDOVER.md`

**Interfaces:**
- Produces matching visible, runtime, and cache version `1.0.23`.

- [ ] **Step 1: Raise the PWA test expectation first**

Update the release test to require:

```js
assert.match(index.body, /id="pwa-version">1\.0\.23<\/strong>/);
assert.match(worker.body, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*"1\.0\.23"/);
assert.match(pwa.body, /APP_VERSION\s*=\s*"1\.0\.23"/);
```

- [ ] **Step 2: Run the release assertion and confirm red**

Run: `node --test --test-name-pattern="PWA 1.0.23" serve.test.js`

Expected: FAIL while production files still declare `1.0.22`.

- [ ] **Step 3: Update production version and handover notes**

Set the version in `index.html`, `js/pwa.js`, and `service-worker.js` to `1.0.23`. Add a dated `HANDOVER.md` section describing divine-name migration, orange/red progress limits, reversible navigation, responsive controls, and manual verification targets.

- [ ] **Step 4: Run syntax, whitespace, focused, and full tests**

```bash
node --check js/app.js
node --check js/progress.js
node --check js/equipment-forging.js
git diff --check
node --test js/progress.test.js js/equipment-forging.test.js js/query.test.js serve.test.js
node --test
```

Expected: every command exits 0 and the full suite reports zero failures.

- [ ] **Step 5: Commit the PWA release**

```bash
git add index.html js/pwa.js service-worker.js serve.test.js HANDOVER.md
git commit -m "chore: release pwa 1.0.23"
```

- [ ] **Step 6: Review the complete branch against the spec**

Check `git diff <base-sha>..HEAD`, confirm every spec section has implementation and tests, and confirm `git status --short` contains no feature files.

- [ ] **Step 7: Fast-forward local master and rerun the full suite**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek merge --ff-only codex/forging-progress-equipment-quality
node --test
```

Expected: fast-forward succeeds and all tests pass on merged `master`.

- [ ] **Step 8: Push and verify GitHub Pages**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek push origin master:main
git ls-remote origin refs/heads/main
```

Verify `https://yuanyu0505.github.io/Qinshi/service-worker.js` contains `1.0.23` and `https://yuanyu0505.github.io/Qinshi/js/progress.js` contains `normalizeProgressStore`.
