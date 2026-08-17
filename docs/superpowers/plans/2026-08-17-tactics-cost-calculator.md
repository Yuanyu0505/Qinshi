# 兵法逐阶与综合元宝计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正兵法进阶必须逐阶演练至完美的号角逻辑，并提供六兵法库存、购买包、单项价格和全部合计计算。

**Architecture:** `js/tactics.js` 承担逐阶演练、材料目录、存储规范化和购买包估算等纯逻辑；`js/tactics-ui.js` 复用纯逻辑渲染“兵法详情／计算”子分区并持久化配置；`css/style.css` 提供桌面表格与移动卡片布局。单兵法和综合计算必须调用同一逐阶函数。

**Tech Stack:** 原生 JavaScript、localStorage、HTML、CSS、Node.js `node:test`

## Global Constraints

- 5→8 阶计算 5、6、7 阶演练至完美，不计算 8 阶自身演练。
- 起点阶可扣除自定义已消耗号角，中间阶从 0 开始。
- 统、极真言碎片跨风林火山共享，其他真言碎片独立。
- 单兵法价格使用完整共享库存独立估算；全部合计汇总需求后只抵扣一次共享库存。
- 所有计算设置、库存和购买包配置长期保存。
- 不更新 PWA、Service Worker 或 GitHub Pages，不推送 GitHub。
- AI 不运行测试、lint、格式化或浏览器验证；命令仅供用户手动执行。
- 完成后提交并快进合并到本地 `master`。

---

### Task 1: 修正逐阶熟练度号角核心

**Files:**
- Modify: `js/tactics.test.js`
- Modify: `js/tactics.js`

**Interfaces:**
- Produces: `rehearsalAdvancePlan(tactic, startRank, targetRank, startSpent) -> {steps,totalHorn}`。
- Consumes: `tactic.ranks[].rehearsal`、起点和终点兵法阶。

- [ ] **Step 1: 增加 5→8 阶回归用例**

```js
test("5到8阶累计5、6、7阶演练且不包含8阶", () => {
  const tactic = fixtureStandardTactic();
  const plan = T.rehearsalAdvancePlan(tactic, 5, 8, 14);
  assert.deepEqual(plan.steps.map(step => step.rank), [5, 6, 7]);
  assert.equal(plan.steps[0].spent, 14);
  assert.equal(plan.steps[1].spent, 0);
  assert.equal(plan.steps[2].spent, 0);
  assert.equal(plan.steps.some(step => step.rank === 8), false);
});
```

补充起点等于终点返回 0、阴雷返回 0、起点已达保底和单次号角不能整除阈值时向上取整。

- [ ] **Step 2: 实现逐阶函数**

```js
function rehearsalAdvancePlan(tactic, startInput, targetInput, startSpentInput) {
  if (!tactic || tactic.kind !== "standard") return { steps: [], totalHorn: 0 };
  var start = clamp(integer(startInput, 0), 0, 15);
  var target = clamp(integer(targetInput, start), start, 15);
  var steps = [];
  var totalHorn = 0;
  for (var rank = start; rank < target; rank += 1) {
    var row = findRank(tactic, rank);
    var rehearsal = row && row.rehearsal;
    if (!rehearsal) continue;
    var single = positiveInteger(rehearsal.singleHorn, 0);
    var guarantee = nonNegativeInteger(rehearsal.guaranteeHorn, 0);
    var spent = rank === start ? clamp(nonNegativeInteger(startSpentInput, 0), 0, actualMaximum(rehearsal)) : 0;
    var runs = single ? Math.ceil(Math.max(0, guarantee - spent) / single) : 0;
    var horn = runs * single;
    steps.push({ rank: rank, singleHorn: single, guaranteeHorn: guarantee, spent: spent, runs: runs, horn: horn });
    totalHorn += horn;
  }
  return { steps: steps, totalHorn: totalHorn };
}
```

- [ ] **Step 3: 让 calculatePlan 使用新逻辑**

`calculatePlan` 保留 `(start,target]` 进阶材料和真言逻辑，将旧“目标阶演练”替换为 `rehearsalAdvancePlan(tactic, start.rank, target.rank, start.rehearsalSpent)`。

- [ ] **Step 4: 建议用户运行核心测试**

```powershell
node --test js/tactics.test.js
```

### Task 2: 材料目录、共享键和购买包估算

**Files:**
- Modify: `js/tactics.test.js`
- Modify: `js/tactics.js`

**Interfaces:**
- Produces: `materialKeyForMark(tactic)`、`materialKeyForMantra(tactic, mantra)`、`materialCatalog(tactics)`、`normalizeCostState(tactics, raw, progress)`、`estimatePurchases(demand, stock, packs)`、`aggregateCostPlans(...)`。

- [ ] **Step 1: 定义稳定材料键**

```js
function materialKeyForMark(tactic) { return "mark:" + tactic.id; }
function materialKeyForMantra(tactic, mantra) {
  if (mantra.id === "tong") return "mantra:shared:tong";
  if (mantra.id === "extreme") return "mantra:shared:extreme";
  return "mantra:" + tactic.id + ":" + mantra.id;
}
```

固定共享键：`shared:merit`、`shared:horn`、`mantra:shared:tong`、`mantra:shared:extreme`。

- [ ] **Step 2: 增加共享与独立真言测试**

```js
assert.equal(T.materialKeyForMantra(wind, windTong), T.materialKeyForMantra(forest, forestTong));
assert.equal(T.materialKeyForMantra(wind, windExtreme), T.materialKeyForMantra(fire, fireExtreme));
assert.notEqual(T.materialKeyForMantra(wind, windQi), T.materialKeyForMantra(forest, forestLing));
```

- [ ] **Step 3: 实现购买包公式**

```js
function estimatePurchases(demandInput, stockInput, packInput) {
  var demand = nonNegativeInteger(demandInput, 0);
  var stock = nonNegativeInteger(stockInput, 0);
  var shortage = Math.max(0, demand - stock);
  var size = positiveInteger(packInput && packInput.packSize, 0);
  var price = optionalNonNegativeInteger(packInput && packInput.packPrice);
  if (!shortage) return { demand, stock, shortage: 0, packs: 0, yuan: 0, leftover: stock - demand, priced: true };
  if (!size || price === null) return { demand, stock, shortage, packs: null, yuan: null, leftover: null, priced: false };
  var packs = Math.ceil(shortage / size);
  return { demand, stock, shortage, packs, yuan: packs * price, leftover: stock + packs * size - demand, priced: true };
}
```

- [ ] **Step 4: 实现单项与全部汇总**

每种兵法先由 `calculatePlan` 转换为材料键需求。单兵法结果用完整库存估算；全部结果先把已勾选兵法需求按材料键求和，再扣一次库存。结果包含 `pricedSubtotal`、`complete` 和 `unpricedKeys`。

- [ ] **Step 5: 增加包向上取整和共享库存测试**

覆盖缺21、每包10、80元宝得到3包240元宝及购买后余9；覆盖风和林单独都被1000功勋库存覆盖，但合计1500仍缺500。

### Task 3: 子分区与综合计算存储

**Files:**
- Modify: `index.html`
- Modify: `js/tactics-ui.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 1/2 纯逻辑、`qinshi_tactics_progress_v1`。
- Produces: `qinshi_tactics_cost_calculator_v1`、详情/计算切换和持久化配置。

- [ ] **Step 1: 在兵法分区加入子分区容器**

```html
<div id="tactics-modes" class="segs tactics-modes">
  <button type="button" class="seg active" data-tactics-mode="detail">兵法详情</button>
  <button type="button" class="seg" data-tactics-mode="cost">计算</button>
</div>
<div id="tactics-detail-mode">...</div>
<div id="tactics-cost-mode" hidden></div>
```

现有选择器和三个详情 section 移入 `tactics-detail-mode`，不改变其 ID。

- [ ] **Step 2: 建立存储状态**

```js
var COST_STORE_KEY = "qinshi_tactics_cost_calculator_v1";
state.mode = "detail";
state.cost = CORE.normalizeCostState(orderedTactics(), loadCostState(), state.progress);
state.costErrors = {};
```

首次默认全部勾选、起点和真言起点读取个人进度、终点等于起点。保存后恢复全部字段。

- [ ] **Step 3: 实现“从个人进度重新读取”**

仅重置每种兵法起点、真言起点和起点阶已消耗号角；终点、参与状态、库存和购买包配置保持不变。若重置后终点低于起点，将对应终点提升到起点，真言终点同理收缩到合法范围。

- [ ] **Step 4: 增加 DOM 契约**

`serve.test.js` 断言两个 mode 按钮、`tactics-cost-mode`、新存储键、全选/清空和从个人进度读取动作存在。

### Task 4: 六兵法、库存和价格表单

**Files:**
- Modify: `js/tactics-ui.js`

**Interfaces:**
- Consumes: `state.cost`、`CORE.materialCatalog`、兵法和真言合法阶数函数。
- Produces: 六兵法配置、材料库存和购买包配置表单。

- [ ] **Step 1: 渲染六兵法配置**

每张卡包含参与勾选、兵法起止阶、真言起止阶；风林火山显示起点阶已消耗号角。所有 select 选项按目标兵法允许上限动态生成。

- [ ] **Step 2: 渲染材料目录**

每个稳定材料键一行，显示名称、库存、每包数量和每包元宝。统和极各只出现一行，六种印记分别出现。

- [ ] **Step 3: 表单变更即规范化保存**

输入事件更新草稿，失焦或 select 变更时验证。合法数据写入 `localStorage`；不合法数据保留原输入和错误提示，不覆盖上次合法存储。

- [ ] **Step 4: 实现全选、清空和计算动作**

全选/清空只更新参与状态；“计算”读取当前合法状态生成单项和合计结果，不扣减库存。

### Task 5: 单项与合计结果展示

**Files:**
- Modify: `js/tactics-ui.js`
- Modify: `js/tactics.test.js`

**Interfaces:**
- Consumes: `CORE.aggregateCostPlans`。
- Produces: 六兵法独立估算卡片和全部合计。

- [ ] **Step 1: 展示每种兵法原始需求**

分为进阶材料、逐阶演练明细、真言碎片。逐阶演练显示阶数、已消耗、剩余次数和号角。

- [ ] **Step 2: 展示每种兵法独立购买估算**

列出需求、库存、缺口、购买包数、元宝和购买后余量，并显示“单项使用全部共享库存独立估算”。

- [ ] **Step 3: 展示全部合计**

只聚合已勾选兵法。共享库存只扣一次。若任何缺口材料无价格，显示“总价未完整”、已定价小计和未设置材料列表；否则显示全部元宝。

- [ ] **Step 4: 增加结果契约测试**

纯逻辑测试覆盖单项0元、合计仍缺500的场景；页面契约断言“总价未完整”和共享库存说明存在。

### Task 6: 响应式样式、交接与提交

**Files:**
- Modify: `css/style.css`
- Modify: `HANDOVER.md`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 3–5 的 class 和 data 属性。
- Produces: 桌面表格、移动卡片和正式交接说明。

- [ ] **Step 1: 桌面样式**

六兵法配置使用双列或表格，材料和结果列对齐；价格、缺口和总元宝使用高对比色，错误使用现有 `.error` 风格。

- [ ] **Step 2: 手机和平板样式**

在 `max-width: 1024px` 下改为单列卡片；按钮和输入最小高度44px、输入字号16px；关键结果无需横向滚动。

- [ ] **Step 3: 更新 HANDOVER**

记录两个子分区、新存储键、逐阶号角区间、统/极共享、包购买公式及备份兼容。

- [ ] **Step 4: 建议用户手动验证**

```powershell
node --test js/tactics.test.js serve.test.js
```

手动重点：5→8阶、起点已消耗号角、统/极共享、缺价格、单项与合计差异、刷新后恢复、手机和平板单列布局。

- [ ] **Step 5: 提交并合并**

```powershell
git add index.html js/tactics.js js/tactics.test.js js/tactics-ui.js css/style.css serve.test.js HANDOVER.md
git commit -m "feat: calculate tactics inventory costs"
git -C C:\Users\pghyl\Desktop\deepseek merge --ff-only codex/atlas-tactics-planning
```
