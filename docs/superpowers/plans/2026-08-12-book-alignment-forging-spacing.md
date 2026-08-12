# 典籍属性对齐与锻造空查询间距修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让典籍各档次的阶次、属性和分隔线统一对齐，并在锻造搜索为空时移除占位间距。

**Architecture:** 保留当前表格和数据结构，通过为每个典籍档次单元格写入统一阶段行数 CSS 变量，让各档次内部网格共享一致行高；阶段标签和属性列使用固定轨道对齐。锻造空查询只切换既有结果容器的内容和 `hidden` 状态，不增加新状态或数据结构。

**Tech Stack:** 原生 HTML、CSS、JavaScript。

## Global Constraints

- 不修改装备、典籍或锻造数据及生成脚本。
- 不修改筛选规则、个人进度、本地存储或其他分区。
- 紫色、橙色只有 `10阶` 的档次保持单行居中，不生成不存在的阶段。
- 项目功能验证、测试、lint、格式检查及手动验收由用户自行执行；实施者不主动运行验证命令。
- 不暂存或修改用户的未跟踪 `答题.jpg`，不删除现有保险 stash。

---

### Task 1: 统一典籍阶段网格与属性基准线

**Files:**
- Modify: `js/app.js:1024-1045`
- Modify: `css/style.css:785-818`

**Interfaces:**
- Consumes: `bookStageHtml(item, tier)`、`equipmentTableHtml(items, tiers, title)`、`item.stages[tier]`。
- Produces: `bookStageHtml(item, tier, sharedStageCount)`，以及 `.book-stage-list` 使用的 `--book-stage-count` CSS 变量。

- [ ] **Step 1: 计算同一装备共有的最大阶段行数**

在 `equipmentTableHtml()` 渲染每个装备前，根据本表实际显示的 `tiers` 计算最大阶段数：

```js
const sharedStageCount = item.bookGroup
  ? Math.max(1, ...tiers.map((tier) => ((item.stages && item.stages[tier]) || []).length))
  : 1;
```

只用于各档次行高对齐，不补造缺失阶段。

- [ ] **Step 2: 把共享阶段数写入典籍阶段容器**

调整函数签名并输出 CSS 变量。单阶段档次使用 `1`，多阶段档次使用同一装备的共享阶段数：

```js
function bookStageHtml(item, tier, sharedStageCount) {
  const stages = item.stages && item.stages[tier] ? item.stages[tier] : [];
  if (!stages.length) return '<span class="tier-none">—</span>';
  const rowCount = stages.length === 1 ? 1 : sharedStageCount;
  return `<div class="book-stage-list" style="--book-stage-count:${rowCount}">...</div>`;
}
```

`equipmentTableHtml()` 调用时传入该装备的 `sharedStageCount`。紫色或橙色仅有一个 `10阶` 时，容器只渲染一条占满整个档次单元格的阶段记录，因此垂直居中且不会虚构其他阶段。

- [ ] **Step 3: 固定阶段标签和属性轨道**

将 CSS 改为同一档次内固定两列，并让整体居中：

```css
.book-stage-row {
  display: grid;
  grid-template-columns: 34px 88px;
  justify-content: center;
  column-gap: 4px;
  align-items: center;
  min-height: 38px;
}
.book-stage-label {
  justify-content: flex-end;
  text-align: right;
}
.book-stage-values {
  width: 88px;
  align-items: flex-start;
}
```

阶段标签共用右侧基准线，属性共用左侧基准线。

- [ ] **Step 4: 统一同一装备各档次的阶段行高**

让阶段容器按共享阶段数分配行高：

```css
.book-stage-list {
  display: grid;
  grid-template-rows: repeat(var(--book-stage-count, 1), minmax(38px, 1fr));
  height: 100%;
}
.book-stage-row { min-height: 0; }
```

每个实际阶段占一行；多阶段档次因为使用相同 `--book-stage-count`，阶段边界和虚线分隔位置保持一致。只有单阶段的档次使用一行撑满整格并居中展示。

- [ ] **Step 5: 提交典籍对齐修复**

```powershell
git add -- js/app.js css/style.css
git commit -m "fix: align book equipment stage attributes"
```

---

### Task 2: 移除橙装锻造空查询占位

**Files:**
- Modify: `js/app.js:852-870`

**Interfaces:**
- Consumes: `applyForging()`、`el.forgeResults`、`forgeState.query`。
- Produces: 空查询时隐藏、有效查询时显示的 `#forge-results`。

- [ ] **Step 1: 空查询时清空并隐藏结果容器**

将空查询分支替换为：

```js
if (!q) {
  el.forgeResults.innerHTML = "";
  el.forgeResults.hidden = true;
  return;
}
```

不再渲染“输入装备名开始查询”。

- [ ] **Step 2: 有效查询前恢复结果容器**

紧接空查询分支后加入：

```js
el.forgeResults.hidden = false;
```

后续主装备、素材装备和无匹配提示继续使用原有逻辑。

- [ ] **Step 3: 提交锻造间距修复**

```powershell
git add -- js/app.js
git commit -m "fix: hide empty forging query placeholder"
```

---

### Task 3: 范围检查与用户手动验证清单

**Files:**
- Review: `js/app.js`
- Review: `css/style.css`

**Interfaces:**
- Consumes: 前两个任务的提交。
- Produces: 不宣称通过的交付说明。

- [ ] **Step 1: 检查 Git 改动范围**

只运行 `git status --short`、`git diff --stat` 和提交列表，确认业务文件仅为 `js/app.js`、`css/style.css`，且 `答题.jpg` 未被暂存。按项目约定不运行测试、lint、格式检查或浏览器验收。

- [ ] **Step 2: 列出手动验证重点**

- 检查多件初始橙色典籍和神兵典籍的 `0阶/5阶/10阶/15阶` 标签纵向对齐。
- 检查各档次具体属性左边缘一致。
- 检查橙色、橙金、红色、红金阶段分隔线横向一致。
- 检查初始紫色典籍的紫色单阶段档没有虚构其他阶段。
- 检查锻造搜索为空时查找面板与材料总览紧邻；输入关键词后结果正常出现；无匹配提示仍保留。
