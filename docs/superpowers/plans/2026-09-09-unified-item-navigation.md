# Unified Item Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为装备属性、橙装锻造、关卡掉落、图鉴、禁地和逐鹿建立统一的物品名称映射、操作菜单、目标查询和多级返回能力。

**Architecture:** 新建纯逻辑模块 `js/item-navigation.js`，集中负责导航物品解析、来源菜单配置、导航栈和目标状态恢复判定；`js/app.js` 只通过各分区状态适配器驱动页面。个人进度搜索改为“可唯一解析时按装备族精确匹配、否则维持原模糊匹配”，逐鹿和禁地界面公开最小的查询状态接口。

**Tech Stack:** 原生 JavaScript（UMD）、HTML、CSS、Node.js `node:test`、浏览器 DOM API。

**Spec:** `docs/superpowers/specs/2026-09-09-unified-item-navigation-design.md`

## Global Constraints

- 所有进入橙装锻造主装备、素材装备或个人进度的查询词均使用普通锻造名称；`鬼谷子` 与 `神兵鬼谷子` 保持两个独立键。
- 装备属性目标使用首选神兵名称；无映射时使用原点击名称并正常显示空结果。
- 所有跨分区菜单项统一命名为“前往 XX 分区查询”，仅“查看出现赛季”和“前往个人进度查询”例外。
- 返回栈必须支持任意多级逐级返回，并恢复来源筛选、结果与滚动位置。
- 目标页面未修改时恢复其跳转前状态；目标页面被修改后保留新状态，但返回关系不失效。
- 顶部主导航由用户主动切换分区时清空整条导航链；刷新页面自然清空。
- 不修改资料数据、各分区普通手动搜索规则、本地进度／收藏／库存／禁地需求的持久化结构或 PWA 版本。
- 菜单需支持点击外部、滚动、窗口变化和 `Esc` 关闭，触控按钮最小高度 44px。

---

### Task 1: 名称模型、菜单定义和导航栈

**Files:**
- Create: `js/item-navigation.js`
- Create: `js/item-navigation.test.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `EquipmentForging.resolveForgeTarget(name, forgingItems)`、`EquipmentForging.resolveEquipmentTarget(forgeName, equipmentItems, forgingItems)`。
- Produces: `ItemNavigation.resolveItem(clickedName, equipmentItems, forgingItems)`、`ItemNavigation.actionsForSource(source)`、`ItemNavigation.createStack()`、`stack.push(frame)`、`stack.pop()`、`stack.peek()`、`stack.clear()`、`ItemNavigation.captureFingerprint(value)`、`ItemNavigation.shouldRestoreDestination(frame, currentView)`。

- [ ] **Step 1: Write the failing tests**

```js
test("神兵月光解析为普通锻造键并保留神兵装备名", () => {
  assert.deepEqual(nav.resolveItem("神兵月光", equipment, forging), {
    clickedName: "神兵月光", forgeKey: "月光耳坠",
    equipmentName: "神兵月光", familyKey: "月光耳坠"
  });
});

test("鬼谷子与神兵鬼谷子保持两个独立装备族", () => {
  assert.equal(nav.resolveItem("鬼谷子", equipment, forging).familyKey, "鬼谷子");
  assert.equal(nav.resolveItem("神兵鬼谷子", equipment, forging).familyKey, "神兵鬼谷子");
});

test("无锻造资料装备仍使用原名形成导航物品", () => {
  assert.equal(nav.resolveItem("秦时周年历", equipment, forging).forgeKey, "秦时周年历");
});

test("导航栈逐级返回且只在目标未改动时恢复旧目标状态", () => {
  const stack = nav.createStack();
  stack.push({ sourcePartition: "equipment", destinationPartition: "forging", destinationAppliedView: { query: "墨眉" } });
  stack.push({ sourcePartition: "forging", destinationPartition: "atlas", destinationAppliedView: { query: "墨眉" } });
  assert.equal(stack.pop().sourcePartition, "forging");
  assert.equal(stack.pop().sourcePartition, "equipment");
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test js/item-navigation.test.js`

Expected: FAIL because `js/item-navigation.js` does not exist.

- [ ] **Step 3: Implement the pure navigation core**

```js
function resolveItem(clickedName, equipmentItems, forgingItems) {
  var name = normalize(clickedName);
  var forgeKey = equipmentForging.resolveForgeTarget(name, forgingItems) || name;
  var equipment = name === "鬼谷子" || name === "神兵鬼谷子"
    ? (equipmentItems || []).find(function (entry) { return entry.name === name; })
    : equipmentForging.resolveEquipmentTarget(forgeKey, equipmentItems, forgingItems);
  return { clickedName: name, forgeKey: forgeKey,
    equipmentName: equipment ? equipment.name : name, familyKey: forgeKey };
}
```

实现固定来源菜单、JSON 稳定指纹、深拷贝导航帧和 LIFO 栈；在 `index.html` 中于 `equipment-forging.js` 后、`app.js` 前加载新模块。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test js/item-navigation.test.js js/equipment-forging.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add js/item-navigation.js js/item-navigation.test.js index.html
git commit -m "feat: add unified item navigation core"
```

### Task 2: 个人进度装备族精确搜索

**Files:**
- Modify: `js/equipment-forging.js`
- Modify: `js/equipment-forging.test.js`
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`

**Interfaces:**
- Consumes: `catalog[]` entries containing `forgeName`、`equipmentName`、`aliases`。
- Produces: `EquipmentForging.resolveProgressFamily(catalog, keyword): string|null` and extended `Progress.searchEquipment(data, disciples, keyword, catalog, familyKey?)`。

- [ ] **Step 1: Write failing catalog and search tests**

```js
test("个人进度目录同时保留鬼谷子和神兵鬼谷子", () => {
  const names = forging.buildProgressEquipmentCatalog(forgeItems, equipmentItems).map((entry) => entry.forgeName);
  assert.ok(names.includes("鬼谷子"));
  assert.ok(names.includes("神兵鬼谷子"));
});

test("月光耳坠精确装备族同时命中直接持有与待用素材且排除无关月光名称", () => {
  const result = progress.searchEquipment(data, disciples, "月光耳坠", catalog, "月光耳坠");
  assert.deepEqual(result.owned.map((entry) => entry.progressItem.equipmentName), ["神兵月光"]);
  assert.equal(result.required.length, 1);
});
```

另加测试证明 `鬼谷子` 不命中 `神兵鬼谷子`，以及宽泛关键词仍按原子串规则返回多项。

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test js/equipment-forging.test.js js/progress.test.js`

Expected: FAIL because ordinary Ghost is currently removed and exact-family mode is absent.

- [ ] **Step 3: Implement exact family resolution and matching**

```js
function resolveProgressFamily(catalog, keyword) {
  var query = normalizeProgressKeyword(keyword);
  var families = unique(catalog.filter(function (entry) {
    return [entry.forgeName, entry.equipmentName].concat(entry.aliases || []).some(function (name) {
      return normalizeProgressKeyword(name) === query;
    });
  }).map(function (entry) { return entry.forgeName; }));
  return families.length === 1 ? families[0] : null;
}
```

删除目录中隐藏普通鬼谷子的分支。`searchEquipment` 在存在唯一 `familyKey` 时，对直接持有记录和未完成素材分别解析装备族后严格相等；否则执行原模糊搜索。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test js/equipment-forging.test.js js/progress.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add js/equipment-forging.js js/equipment-forging.test.js js/progress.js js/progress.test.js
git commit -m "feat: search forging progress by equipment family"
```

### Task 3: 禁地与逐鹿目标查询适配器

**Files:**
- Modify: `js/forbidden-ui.js`
- Modify: `js/zhulu-ui.js`
- Modify: `js/zhulu.js`
- Modify: `js/zhulu.test.js`

**Interfaces:**
- Produces: `FORBIDDEN_UI.captureView()`、`FORBIDDEN_UI.restoreView(view)`、`FORBIDDEN_UI.applyNavigationQuery(name)`。
- Produces: `ZHULU_UI.applyNavigationQuery(name)` while retaining `captureView()` and `restoreView(view)`。
- Produces: `Zhulu.buildNavigationSeasonView(view, bookName)` for deterministic adapter tests.

- [ ] **Step 1: Write failing adapter test**

```js
test("逐鹿导航查询切到赛季典籍并清空阻挡条件", () => {
  assert.deepEqual(zhulu.buildNavigationSeasonView({ seasonFilters: { year: 2025, quality: "red" } }, "孙子兵法"), {
    tab: "seasons",
    seasonFilters: { year: null, month: null, query: "孙子兵法", quality: null, progress: null }
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --test js/zhulu.test.js`

Expected: FAIL because `buildNavigationSeasonView` is undefined.

- [ ] **Step 3: Implement adapters without snapshotting persistent data**

`FORBIDDEN_UI.captureView` 仅复制 `query`、`size`、`selectedOnly`、`showSchedule`、`expanded`；`restoreView` 保留当前 `needs`，同步搜索框并渲染；`applyNavigationQuery` 清除限制、展开命中项并渲染。`ZHULU_UI.applyNavigationQuery` 调用纯函数生成赛季查询状态并渲染。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test js/zhulu.test.js js/forbidden.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add js/forbidden-ui.js js/zhulu-ui.js js/zhulu.js js/zhulu.test.js
git commit -m "feat: expose item navigation query adapters"
```

### Task 4: 统一菜单、分区适配与多级返回控制器

**Files:**
- Modify: `js/app.js`
- Modify: `js/zhulu-ui.js`
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `ItemNavigation.resolveItem`、`actionsForSource`、`createStack`；`FORBIDDEN_UI` and `ZHULU_UI` adapters。
- Produces: one generic item action menu event path, per-partition `captureView/applyQuery/restoreView`, generic top return banner, nested navigation and explicit return behavior.

- [ ] **Step 1: Write failing integration assertions**

```js
test("首页提供统一物品操作菜单和六分区返回入口", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.match(page.body, /id="item-navigation-menu"/);
    for (const name of ["equipment", "forging", "drops", "atlas", "forbidden", "zhulu"]) {
      assert.match(page.body, new RegExp('data-item-navigation-return="' + name + '"'));
    }
    assert.doesNotMatch(page.body, /data-drop-action="forging-main"/);
    assert.doesNotMatch(page.body, /data-drop-action="forging-material"/);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --test serve.test.js`

Expected: FAIL because generic menu and return containers are absent and old menu markup remains.

- [ ] **Step 3: Implement partition adapters and generic controller**

在 `app.js` 中定义六个适配器：

```js
const partitionAdapters = {
  equipment: { captureView, applyQuery, restoreView },
  forging: { captureView, applyQuery, restoreView },
  atlas: { captureView, applyQuery, restoreView },
  drops: { captureView, applyQuery, restoreView },
  forbidden: window.FORBIDDEN_UI,
  zhulu: window.ZHULU_UI
};
```

用统一 `navigationStack` 替代 `forgeReturnSession`、`progressReturnSession`、`dropJumpSession`、`zhuluJumpSession`。导航时捕获来源和目标旧状态、应用目标查询并保存应用指纹；返回时恢复来源，且仅在目标指纹未变时恢复目标旧状态。顶部导航的用户点击清空栈，锻造内部模式切换不清空。

- [ ] **Step 4: Implement all source menus and clickable names**

装备属性每个名称固定四项；锻造主装备与真实阶段装备固定六项；掉落固定三项；逐鹿固定四项并保留“查看出现赛季”。进入锻造时装备属性默认主装备，掉落／逐鹿默认个人进度。菜单采用统一定位、焦点、外部点击、滚动、调整尺寸和 `Esc` 关闭逻辑。

- [ ] **Step 5: Add responsive and accessibility styles**

菜单项和返回按钮最小高度 44px；手机端返回提示上下排列、按钮占满宽度；保留装备品质底色、锻造命中颜色和结果布局。

- [ ] **Step 6: Run focused tests to verify GREEN**

Run: `node --test js/item-navigation.test.js js/drops.test.js js/zhulu.test.js serve.test.js`

Expected: PASS with zero failures.

- [ ] **Step 7: Commit**

```bash
git add js/app.js js/zhulu-ui.js index.html css/style.css serve.test.js
git commit -m "feat: unify item query navigation and return flow"
```

### Task 5: 完整回归与浏览器验收

**Files:**
- Modify only if a failing regression requires a tested fix.

**Interfaces:**
- Consumes: all preceding production and test interfaces.
- Produces: verified feature branch ready for local `master` merge.

- [ ] **Step 1: Run the full test suite**

Run: `node --test`

Expected: all tests pass, zero failures, zero unexpected warnings.

- [ ] **Step 2: Start the local application for acceptance**

Run: `node serve.js --host 127.0.0.1 --port 4173`

Expected: server remains available at `http://127.0.0.1:4173/`.

- [ ] **Step 3: Exercise desktop and narrow-screen journeys**

实际检查：装备属性→橙装锻造→图鉴逐级返回；掉落→锻造个人进度并切换三种模式后返回；逐鹿→装备属性；锻造阶段素材→禁地；`月光耳坠` 个人进度的直接持有与待用素材结果；`鬼谷子` 双键隔离；`秦时周年历` 空锻造结果。桌面与窄屏分别检查菜单不越界、44px 触控和返回提示布局。

- [ ] **Step 4: Re-run full tests after acceptance fixes**

Run: `node --test`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit any acceptance-only fixes**

```bash
git add js/app.js js/item-navigation.js js/progress.js js/equipment-forging.js js/forbidden-ui.js js/zhulu-ui.js js/zhulu.js index.html css/style.css
git commit -m "fix: refine unified item navigation acceptance"
```

如果实机验收没有产生修复，则跳过该提交步骤。

### Task 6: 快进合并到本地 master

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: green `codex/unified-item-navigation` branch and existing local `master`.
- Produces: local `master` containing all confirmed navigation changes without touching unrelated dirty files.

- [ ] **Step 1: Verify branch cleanliness and commit range**

Run: `git status --short` and `git log --oneline master..codex/unified-item-navigation`

Expected: feature worktree clean and only the design, plan, tests and implementation commits are listed.

- [ ] **Step 2: Verify the exact tree to merge**

Run: `node --test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Fast-forward local master**

Run: `git -C C:/Users/pghyl/Desktop/deepseek merge --ff-only codex/unified-item-navigation`

Expected: fast-forward succeeds; unrelated pre-existing unstaged and untracked main-worktree files remain unchanged.

- [ ] **Step 4: Verify merged master**

Run: `node --test`

Expected: all tests pass with zero failures on local `master`.
