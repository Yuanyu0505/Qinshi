# Atlas Filter, Sort, and Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图鉴增加严格的库存筛选、备注来源多选、可选排序和持久化多图鉴置顶，并提供桌面单行、手机平板两行的紧凑布局。

**Architecture:** 扩展 `js/atlas.js` 的纯函数管线，在一次派生中计算升级计划、库存状态、备注来源和置顶状态，再完成过滤、三组拆分和排序。`js/app.js` 仅管理会话状态、DOM 事件与 `qinshi_atlas_pins_v1`，现有等级、收藏和库存格式保持不变。

**Tech Stack:** 原生 HTML、CSS、JavaScript（UMD）、Node `node:test` 契约测试。

**Spec:** `docs/superpowers/specs/2026-08-25-atlas-filter-sort-pin-design.md`

## Global Constraints

- 只修改图鉴相关实现、样式、测试和本功能文档。
- 不修改既有图鉴等级、收藏、目标等级和个人库存存储格式。
- 新增置顶键必须是 `qinshi_atlas_pins_v1`。
- 首次进入图鉴仍不展示默认结果；任何筛选或排序操作会激活结果。
- 手机和平板筛选控件固定两行、每行两个，不允许横向滚动。
- 本次不更新 PWA、不推送 GitHub；完成后快进合并到本地 `master`。
- 按项目 `AGENTS.md`，测试、lint 和手动验收由用户执行；实现中补充测试但不主动运行。

---

### Task 1: 图鉴库存派生、筛选和排序核心

**Files:**
- Modify: `js/atlas.js`
- Test: `js/atlas.test.js`

**Interfaces:**
- Consumes: `upgradePlan(item, currentLevel, targetLevel, upgradeStages)`、`normalizeInventoryRecord(record)`、`equipmentRecordKey(stageKey, index)`。
- Produces: `deriveAtlasState(item, options)`、`equipmentInventoryStatus(plan, record)`、`detectNoteSources(recordEntries)`、扩展后的 `filterAtlas(items, options)`。

- [ ] **Step 1: 在 `js/atlas.test.js` 增加库存状态和备注来源契约**

```js
test("deriveAtlasState：严格区分装备齐全、未齐全和未录入", () => {
  const owned = A.deriveAtlasState(fixture[2], {
    levels: { "t-0003": 5 }, targetLevel: 8, upgradeStages,
    inventory: { "t-0003": { equipment: { "5→6|0": { name: "冰魄戒", owned: true, note: "" }, "7→8|0": { name: "墨眉", owned: true, note: "" } } } }
  });
  assert.strictEqual(owned.equipmentState, "owned");
});

test("detectNoteSources：碎片和禁地顺序不同仍命中组合来源", () => {
  assert.deepStrictEqual(A.detectNoteSources(["碎片/禁地", "禁地/碎片、楼兰"]), ["禁地", "碎片", "碎片/禁地", "楼兰"]);
});
```

- [ ] **Step 2: 在 `js/atlas.js` 实现派生状态函数**

```js
function detectNoteSources(notes) {
  const found = {};
  notes.forEach(note => {
    const text = String(note || "").replace(/\s+/g, "");
    if (text.includes("禁地")) found["禁地"] = true;
    if (text.includes("碎片")) found["碎片"] = true;
    if (text.includes("禁地") && text.includes("碎片")) found["碎片/禁地"] = true;
  });
  return NOTE_SOURCE_ORDER.filter(source => found[source]);
}
function equipmentInventoryStatus(plan, record) {
  if (!plan.equipmentStages.length) return { state: "owned", noteSources: [] };
  const entries = plan.equipmentStages.flatMap(stage => stage.items.map((token, index) => ({ stage, token, index })));
  if (entries.some(entry => !record.equipment[equipmentRecordKey(entry.stage.key, entry.index)])) {
    return { state: "unset", noteSources: [] };
  }
  const notes = entries.filter(entry => !record.equipment[equipmentRecordKey(entry.stage.key, entry.index)].owned)
    .map(entry => record.equipment[equipmentRecordKey(entry.stage.key, entry.index)].note);
  return { state: notes.length ? "missing" : "owned", noteSources: detectNoteSources(notes) };
}
function deriveAtlasState(item, options) {
  return { item: item, plan: plan, soulState: soulState, equipmentState: equipmentState,
    noteSources: noteSources, favorite: favorite, pinned: pinned };
}
```

- [ ] **Step 3: 增加筛选、普通排序和固定置顶排序测试**

```js
assert.deepStrictEqual(A.filterAtlas(fixture, inventoryOptions).map(item => item.id), ["t-0003"]);
assert.deepStrictEqual(A.filterAtlas(fixture, pinOptions).map(item => item.id), ["t-0001", "t-0003", "t-0002"]);
["asc", "desc"].forEach(direction => {
  const ids = A.filterAtlas(fixture, { ...soulOptions, sortDirection: direction }).map(item => item.id);
  assert.strictEqual(ids[0], "t-0001");
  assert.strictEqual(ids[ids.length - 1], "t-0003");
});
```

- [ ] **Step 4: 扩展 `filterAtlas` 管线**

```js
const states = searchAtlas(result, opts.query, opts.levels, opts.field, opts.targetLevel)
  .map(item => deriveAtlasState(item, opts))
  .filter(state => opts.soulFilter === "all" || state.soulState.state === opts.soulFilter);
return stableSort(pinned, pinnedComparator)
  .concat(stableSort(favorites, ordinaryComparator(opts)), stableSort(regular, ordinaryComparator(opts)))
  .map(state => state.item);
```

- [ ] **Step 5: 导出新增纯函数并检查旧调用保持兼容**

```js
return {
  normalize, parseLevelQuery, levelOf, isFavorite, favoriteFirst, equipmentRecordKey,
  soulInventoryStatus, normalizeInventoryRecord, detectNoteSources, equipmentInventoryStatus,
  deriveAtlasState, sortEquipment, neededStages, upgradePlan, summarizeUpgrade, searchAtlas, filterAtlas
};
```

### Task 2: 紧凑筛选和排序控件

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: Task 1 扩展后的 `ATLAS.filterAtlas(items, options)`。
- Produces: `atlasState.favoriteType`、`soulFilter`、`equipmentFilter`、`noteSources`、`sortField`、`sortDirection` 以及相应 DOM 控件。

- [ ] **Step 1: 在 `serve.test.js` 增加筛选与响应式布局契约**

```js
assert.match(index.body, /id="atlas-favorite-type"/);
assert.match(index.body, /id="atlas-note-filter"/);
assert.match(css.body, /\.atlas-advanced-filters/);
assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?grid-template-columns:\s*repeat\(2,/);
```

- [ ] **Step 2: 在 `index.html` 添加四个筛选下拉、两个排序下拉和清除按钮**

```html
<div class="atlas-advanced-filters">
  <label id="atlas-favorite-type-wrap">图鉴类型<select id="atlas-favorite-type"><option value="all">全部类型</option></select></label>
  <label>魂魄<select id="atlas-soul-filter"><option value="enough">已达标</option></select></label>
  <label>装备<select id="atlas-equipment-filter"><option value="missing">未齐全</option></select></label>
  <div id="atlas-note-filter" class="atlas-note-filter"><button id="atlas-note-toggle">全部来源</button></div>
</div>
```

- [ ] **Step 3: 扩展 `el` 与 `atlasState`，绑定筛选和排序事件**

```js
Object.assign(atlasState, { favoriteType: "all", soulFilter: "all", equipmentFilter: "all",
  noteSources: [], sortField: "default", sortDirection: "asc" });
```

- [ ] **Step 4: 实现备注来源多选下拉交互**

```js
function syncAtlasFilterControls() {
  const enabled = atlasState.equipmentFilter === "missing";
  el.atlasNoteToggle.disabled = !enabled;
  el.atlasNoteToggle.textContent = enabled && atlasState.noteSources.length
    ? atlasState.noteSources.join("、") : (enabled ? "全部来源" : "需先选择装备未齐全");
}
function closeAtlasNoteFilter() {
  el.atlasNoteMenu.hidden = true;
  el.atlasNoteToggle.setAttribute("aria-expanded", "false");
}
```

- [ ] **Step 5: 将新状态传给 `ATLAS.filterAtlas` 并实现清除行为**

```js
ATLAS.filterAtlas(ATLAS_DATA.items, { category: atlasState.tab, levels: atlasState.levels,
  targetLevel: atlasState.targetLevel, favorites: atlasState.favorites,
  inventory: atlasState.inventory,
  pins: atlasState.pins, favoriteType: atlasState.favoriteType, soulFilter: atlasState.soulFilter,
  equipmentFilter: atlasState.equipmentFilter, noteSources: atlasState.noteSources,
  sortField: atlasState.sortField, sortDirection: atlasState.sortDirection,
  upgradeStages: ATLAS_DATA.meta.upgradeStages });
```

- [ ] **Step 6: 添加桌面单行和手机平板两行样式**

```css
.atlas-advanced-filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1024px) {
  .atlas-advanced-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

### Task 3: 置顶持久化、交互与红色视觉

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `atlasState.favorites`、Task 1 的 `pins` 排序输入。
- Produces: `loadAtlasPins()`、`saveAtlasPins()`、`data-atlas-pin` 按钮和 `.atlas-item-pinned` 视觉。

- [ ] **Step 1: 在 `serve.test.js` 增加置顶存储、按钮和视觉契约**

```js
assert.match(app.body, /ATLAS_PINS_KEY\s*=\s*"qinshi_atlas_pins_v1"/);
assert.match(app.body, /data-atlas-pin/);
assert.match(css.body, /\.atlas-item-pinned/);
```

- [ ] **Step 2: 实现置顶数据读取与保存**

```js
const ATLAS_PINS_KEY = "qinshi_atlas_pins_v1";
function loadAtlasPins() {
  const parsed = JSON.parse(localStorage.getItem(ATLAS_PINS_KEY) || "[]");
  return Array.isArray(parsed) ? Array.from(new Set(parsed.map(String))) : [];
}
function saveAtlasPins() { localStorage.setItem(ATLAS_PINS_KEY, JSON.stringify(atlasState.pins)); }
```

- [ ] **Step 3: 实现置顶按钮和取消收藏联动**

```js
if (favoriteButton && removing) {
  atlasState.pins = atlasState.pins.filter((pinId) => pinId !== id);
  saveAtlasPins();
}
```

- [ ] **Step 4: 渲染置顶标签、按钮和卡片类名**

```js
const pinned = favorite && atlasState.pins.includes(itemId);
// atlas-item-pinned、置顶标签、置顶/取消置顶按钮
```

- [ ] **Step 5: 添加红色置顶样式并覆盖收藏绿色**

```css
.atlas-item-pinned { border-color: #ff3b30; }
.atlas-pin-badge { color: #fff; background: #e53935; }
.atlas-item-pinned .atlas-head .q-badge,
.atlas-item-pinned .atlas-head .forge-name { color: #ff4b4b; }
```

### Task 4: 文档状态、提交与本地合并

**Files:**
- Modify: `docs/superpowers/plans/2026-08-25-atlas-filter-sort-pin.md`

**Interfaces:**
- Consumes: Tasks 1–3 的完成结果。
- Produces: 独立功能提交与本地 `master` 快进合并。

- [ ] **Step 1: 自查范围并确认未修改 PWA 文件**

```powershell
git status --short
git diff --name-only master...HEAD
```

- [ ] **Step 2: 按项目约定不主动运行测试，记录用户手动验证清单**

```text
图鉴首次空白、四筛选组合、备注多选、三种库存状态、五种排序、置顶联动、桌面单行、移动两行、刷新后置顶保留。
```

- [ ] **Step 3: 提交图鉴功能**

```powershell
git add -- 'docs/superpowers/specs/2026-08-25-atlas-filter-sort-pin-design.md' 'docs/superpowers/plans/2026-08-25-atlas-filter-sort-pin.md' 'index.html' 'js/app.js' 'js/atlas.js' 'js/atlas.test.js' 'css/style.css' 'serve.test.js'
git commit -m "feat: add atlas filters sorting and pins"
```

- [ ] **Step 4: 在主工作区快进合并功能分支**

```powershell
git -c safe.directory='C:/Users/pghyl/Desktop/deepseek' merge --ff-only codex/atlas-filter-sort-pin
```

- [ ] **Step 5: 保留功能分支与工作树，不推送 GitHub，不更新 PWA**

```text
最终交付说明本地 master 已合并、PWA/GitHub 未更新，并列出建议的手动验证重点。
```
