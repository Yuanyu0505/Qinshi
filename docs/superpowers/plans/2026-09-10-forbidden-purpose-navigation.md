# Forbidden Purpose Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为禁地奖励加入可多选用途、用途筛选和按装备族同步，并为弟子、装备、碎片、机关兽和神核接入精确跨分区查询。

**Architecture:** 扩展 `js/forbidden.js` 为禁地需求 V2、装备族解析、用途筛选和弟子／机关兽目标映射的纯逻辑核心；`js/forbidden-ui.js` 使用复合名称组件和统一用途编辑器。`js/app.js` 与 `js/item-navigation.js` 扩展现有导航适配器，使图鉴支持精确多目标，机关兽支持跨模式共享查询，并继续使用现有返回栈。

**Tech Stack:** 原生 JavaScript（UMD）、HTML、CSS、浏览器 DOM API、LocalStorage、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-10-forbidden-purpose-navigation-design.md`

## Global Constraints

- 不修改禁地奖励资料、日期、活动排序和既有搜索字段。
- 用途允许多选，但根据道具类型只显示有效用途。
- 装备本体与对应碎片使用同一装备族；机关兽本体与神核不共用需求状态。
- 弟子图鉴使用显式精确映射，隐虎季布不得误匹配普通季布。
- 从禁地进入橙装锻造默认个人进度，切换模式保持装备族和返回关系。
- 从禁地进入机关兽默认个人进度，切换模式保持机关兽查询和返回关系。
- 现有勾选迁移为已勾选、用途未分类，设置备份继续兼容。
- 手机和平板不得产生新增横向滚动，触控目标至少 44px。
- 遵从用户明确要求：AI 不主动运行测试、构建或实机验收；测试命令仅记录给用户执行。

---

### Task 1: 禁地需求 V2、用途和精确目标纯逻辑

**Files:**
- Modify: `data/forbidden.js`
- Modify: `js/forbidden.js`
- Modify: `js/forbidden.test.js`

**Interfaces:**
- Produces: `FORBIDDEN.normalizeNeedsV2(rawV2, rawV1, data)`。
- Produces: `FORBIDDEN.rewardIdentity(sectionKey, rawName, resolvedFamilyKey)`。
- Produces: `FORBIDDEN.setRewardSelection(needs, eventId, identity, selected, purposes)`。
- Produces: `FORBIDDEN.applyFamilyChange(needs, data, identity, change)`。
- Produces: `FORBIDDEN.matchesPurpose(needs, eventId, purpose)`。
- Produces: `FORBIDDEN.discipleAtlasTargets(data, name)` and `FORBIDDEN.machineBeastTarget(name)`。

- [ ] **Step 1: Add specification tests without executing them**

```js
test("旧禁地需求迁移后保持勾选且用途未分类", () => {
  const needs = F.normalizeNeedsV2({}, { eventA: { disciples: ["兵家王翦"], items: ["月光耳坠碎片"] } }, fixture);
  assert.deepEqual(needs.events.eventA.disciples, ["兵家王翦"]);
  assert.deepEqual(needs.events.eventA.rewards["equipment:月光耳坠碎片"].purposes, []);
});

test("装备与碎片共享装备族但保留各自显示名", () => {
  const body = F.rewardIdentity("orangeDrops", "月光耳坠", equipment, forging);
  const fragment = F.rewardIdentity("equipmentFragments", "月光耳坠", equipment, forging);
  assert.equal(body.familyKey, fragment.familyKey);
  assert.equal(fragment.displayName, "月光耳坠碎片");
});

test("兵家王翦只映射本体与神王翦", () => {
  assert.deepEqual(F.discipleAtlasTargets("兵家王翦"), ["兵家王翦", "神·王翦"]);
  assert.deepEqual(F.discipleAtlasTargets("隐虎季布"), []);
});
```

- [ ] **Step 2: Implement V2 normalization and immutable helpers**

V2 结构固定为：

```js
{
  version: 2,
  events: {
    eventId: {
      disciples: ["兵家王翦"],
      rewards: {
        "equipment:月光耳坠碎片": {
          name: "月光耳坠碎片",
          category: "equipment",
          familyKey: "月光耳坠",
          purposes: ["atlas", "forging"]
        }
      }
    }
  }
}
```

纯函数必须去重、过滤无效用途，并保证旧数据缺失、损坏或包含重复值时返回安全结构。

- [ ] **Step 3: Add full explicit disciple and machine-beast mapping tables**

在 `data/forbidden.js` 中为每名禁地弟子保存 `atlasTargets`，为机关兽短名保存 `queryName`。映射必须使用完整名称；隐虎季布为 `atlasTargets: []`。

- [ ] **Step 4: Record user verification command without running it**

```powershell
node --test js/forbidden.test.js
```

### Task 2: 禁地复合控件、用途面板和筛选

**Files:**
- Modify: `index.html`
- Modify: `js/forbidden-ui.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 1 V2 helpers and mapping APIs。
- Produces: `FORBIDDEN_UI.captureView()` including `purpose`。
- Produces: DOM event `qinshi:forbidden-navigate` with `{ kind, name, targets, trigger }`。

- [ ] **Step 1: Add markup assertions without executing them**

```js
assert.match(page.body, /id="forbidden-purpose-filter"/);
assert.match(page.body, /id="forbidden-purpose-editor"/);
assert.match(page.body, /data-forbidden-purpose="atlas"/);
```

- [ ] **Step 2: Add single-select purpose filter**

在大小禁地筛选旁加入“全部用途／未分类／图鉴／锻造／机关兽”。`captureView`、`restoreView` 和 `applyNavigationQuery` 必须包含用途筛选，导航查询时清空用途阻挡条件。

- [ ] **Step 3: Render compound tokens**

每个 token 输出独立的 `data-forbidden-select`、`data-forbidden-name-action`、`data-forbidden-purpose-edit` 和用途徽标。奖励汇总复用同一生成器；弟子不输出用途入口。

- [ ] **Step 4: Implement purpose editor transaction**

打开时复制当前用途到草稿；保存时调用仅本期或全装备族纯函数；取消不写入；“取消勾选”按应用范围清除选择和用途。名称点击只派发导航事件，不能改变选择。

- [ ] **Step 5: Add responsive visual layers**

实现橙色未选、绿色已选、紫色图鉴、金橙锻造、蓝色机关兽、红色搜索外框。手机使用固定底部弹层与安全区 padding，桌面／平板使用视口内浮层；控件最小高度 44px，内容换行且无水平溢出。

- [ ] **Step 6: Record user verification commands without running them**

```powershell
node --test js/forbidden.test.js serve.test.js
```

### Task 3: 禁地来源物品导航与图鉴精确组合查询

**Files:**
- Modify: `js/item-navigation.js`
- Modify: `js/item-navigation.test.js`
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Produces: `ItemNavigation.actionsForSource("forbidden")`。
- Produces: atlas view field `exactNames: string[]`。
- Consumes: `qinshi:forbidden-navigate`。

- [ ] **Step 1: Add navigation tests without executing them**

```js
assert.deepEqual(nav.actionsForSource("forbidden"), [
  { id: "atlas", label: "前往图鉴分区查询" },
  { id: "forging", label: "前往橙装锻造分区查询" },
  { id: "equipment", label: "前往装备属性分区查询" }
]);
```

- [ ] **Step 2: Add forbidden equipment menu source**

所有非机关兽奖励都派发 `forbidden`；碎片先解析本体名称，再交给现有装备映射器。导航到锻造时把禁地来源默认目标设为 `{ partition: "forging", view: "progress" }`。

- [ ] **Step 3: Add exact atlas query state**

```js
function applyAtlasExactNavigation(names, label) {
  atlasState.exactNames = names.slice();
  atlasState.query = label;
  atlasState.activated = true;
  applyAtlas();
}
```

图鉴过滤器在 `exactNames.length > 0` 时按标准化完整名称集合匹配。搜索框 `input` 事件清空 `exactNames` 后执行普通搜索。组合目标缺失时渲染缺失提示；空目标显示普通“未找到”。

- [ ] **Step 4: Extend return fingerprint**

图鉴 capture／restore 包含 `exactNames` 与缺失目标；禁地 capture／restore 包含 `purpose`。手动改变图鉴条件不清除返回栈。

- [ ] **Step 5: Record user verification command without running it**

```powershell
node --test js/item-navigation.test.js serve.test.js
```

### Task 4: 机关兽精确跳转和跨模式共享查询

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Produces: `MACHINE_BEAST_UI.captureView()`、`restoreView(view)`、`applyNavigationQuery(name)`。
- Consumes: forbidden navigation detail `{ kind: "machine-beast", name }`。

- [ ] **Step 1: Add machine partition return container**

在机关兽分区顶部增加 `data-item-navigation-return="machine-beasts"`，交由现有返回栏控制器更新。

- [ ] **Step 2: Implement shared navigation query**

`applyNavigationQuery(name)` 切到个人进度并把同一完整名称写入 progress、calculator、reference 三个查询状态；之后模式切换继续保留该名称。`captureView`／`restoreView` 只捕获界面查询和模式，不回滚机关兽持久化进度。

- [ ] **Step 3: Route beast and nucleus names directly**

禁地事件为机关兽或神核时跳过物品菜单，直接调用统一 `navigateItem` 的机器兽目标适配器。目标不存在时显示机关兽现有空结果，不回退到模糊短词。

- [ ] **Step 4: Record user verification command without running it**

```powershell
node --test js/machine-beasts.test.js serve.test.js
```

### Task 5: 静态审查、提交和合并本地 master

**Files:**
- Review all files modified in Tasks 1–4。

**Interfaces:**
- Produces: one feature commit on `codex/forbidden-purpose-navigation` and a local fast-forward merge to `master`。

- [ ] **Step 1: Perform non-executing static review**

逐项阅读 diff，检查事件名、数据字段、DOM ID、目标分区名、脚本加载顺序和 CSS 选择器一致。不得运行测试、构建、浏览器或实机验收。

- [ ] **Step 2: Check repository scope**

```powershell
git status --short
git diff --check
git diff --stat
```

`git diff --check` 属于静态补丁格式检查，不执行应用代码。若用户对“任何验证”作更严格解释，则只执行 `git status --short` 和人工阅读 diff。

- [ ] **Step 3: Commit the feature branch**

```powershell
git add data/forbidden.js js/forbidden.js js/forbidden-ui.js js/item-navigation.js js/app.js js/machine-beasts-ui.js index.html css/style.css js/forbidden.test.js js/item-navigation.test.js serve.test.js docs/superpowers/specs/2026-09-10-forbidden-purpose-navigation-design.md docs/superpowers/plans/2026-09-10-forbidden-purpose-navigation.md
git commit -m "feat: add forbidden purpose navigation"
```

- [ ] **Step 4: Merge into local master without disturbing user files**

确认主目录仍为 `master`，记录并保护既有未提交资料，随后执行仅合并功能提交的非破坏性合并。若主目录文件与提交发生冲突，停止合并并保留工作分支，不覆盖用户文件。

- [ ] **Step 5: Report unverified handoff**

明确说明功能分支提交号、本地 `master` 合并结果、实际修改文件，以及测试／构建／实机验收均未运行并等待用户验证。
