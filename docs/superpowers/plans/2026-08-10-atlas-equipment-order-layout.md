# 图鉴装备排序与阶段布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图鉴升级汇总按品质和名称稳定排序，并将单项图鉴的升级阶段与对应装备以不可拆分的组展示。

**Architecture:** 汇总数据层继续在 `summarizeUpgrade` 中聚合装备，仅替换其排序比较器。界面层将“所需装备”标题从装备内容流中分离，并将每个阶段及其装备嵌入一个独立的行内组；样式层负责组内对齐和组间换行。

**Tech Stack:** 原生 JavaScript、Node 内置 `node:test`、HTML 模板字符串、CSS Flexbox。

## Global Constraints

- 必须在 `codex/atlas-upgrade-target` 累计分支上修改，保留既有橙装锻造搜索、特殊属性分类和图鉴目标等级功能。
- 装备数据、存储格式、目标等级计算和材料统计不得改变。
- 用户指定由其手动验证，本次不执行测试、lint 或浏览器自动检查。

---

### Task 1: 汇总装备排序

**Files:**
- Modify: `js/atlas.test.js`
- Modify: `js/atlas.js:71-101`

**Interfaces:**
- Consumes: `summarizeUpgrade(items, levels, targetLevel, upgradeStages)` 聚合出的 `{ n, q, count }` 装备对象。
- Produces: `summary.equipment`，顺序为紫色优先、同色按中文名称拼音字母序。

- [x] **Step 1: 写入预期失败的排序用例**

```js
const summary = A.summarizeUpgrade(fixture, { "t-0001": 5, "t-0002": 5, "t-0003": 5 }, 10, upgradeStages);
assert.deepStrictEqual(
  summary.equipment.map(item => `${item.q}:${item.n}`),
  ["紫:冰魄戒", "紫:号钟琴", "紫:水寒", "紫:阴符经", "橙:残虹", "橙:罡星冠", "橙:黄帝内经", "橙:墨梅"]
);
```

- [x] **Step 2: 人工验证失败前提**

按项目约定，此步骤由用户手动执行；变更前的实现会先按数量排序，因此不能满足上述品质优先规则。

- [x] **Step 3: 实现最小排序比较器**

```js
function equipmentQualityOrder(item) {
  return item.q === "紫" ? 0 : 1;
}

summary.equipment = Object.keys(equipmentMap).map(function (key) { return equipmentMap[key]; })
  .sort(function (a, b) {
    return equipmentQualityOrder(a) - equipmentQualityOrder(b)
      || a.n.localeCompare(b.n, "zh-Hans-CN");
  });
```

- [ ] **Step 4: 人工验证结果（由用户执行）**

由用户在图鉴页面设置目标等级并检查汇总标签顺序。

### Task 2: 阶段装备成组布局

**Files:**
- Modify: `js/app.js:221-274`
- Modify: `css/style.css:335-343`

**Interfaces:**
- Consumes: `plan.equipmentStages`，每项包含 `key` 与 `items`。
- Produces: `.atlas-equipment-stage-list` 下的多个 `.atlas-equipment-stage`；每组内部包含阶段标签和对应装备。

- [x] **Step 1: 调整模板结构**

```html
<div class="atlas-upgrade-equipment">
  <div class="atlas-equipment-title">所需装备</div>
  <div class="atlas-equipment-stage-list">
    <div class="atlas-equipment-stage">
      <span class="atlas-stage-key">5→6</span>
      <span class="atlas-equipment-items"><span class="mat mat-purple">文曲服</span></span>
    </div>
  </div>
</div>
```

- [x] **Step 2: 添加组级布局样式**

```css
.atlas-equipment-stage-list { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.atlas-equipment-stage { display: inline-flex; align-items: center; gap: 6px; }
.atlas-equipment-items { display: inline-flex; flex-wrap: wrap; gap: 4px; }
```

- [ ] **Step 3: 人工验收布局（由用户执行）**

由用户检查 `5→6` 与对应装备、`7→8` 与对应装备、`9→10` 与对应装备在宽屏和窄屏时均保持同组。

### Task 3: 交接

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-atlas-equipment-order-layout-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-atlas-equipment-order-layout.md`

**Interfaces:**
- Consumes: 已完成的排序与布局变更。
- Produces: 说明改动范围和用户手动验收项的交接记录。

- [x] **Step 1: 检查累计分支状态**

运行：`git status --short`。

- [ ] **Step 2: 提交改动**

```bash
git add js/atlas.js js/atlas.test.js js/app.js css/style.css docs/superpowers/specs/2026-08-10-atlas-equipment-order-layout-design.md docs/superpowers/plans/2026-08-10-atlas-equipment-order-layout.md
git commit -m "feat: refine atlas equipment layout"
```

- [x] **Step 3: 交接手动检查项**

向用户说明未执行自动验证，并列出排序与阶段装备相邻的两个检查项。
