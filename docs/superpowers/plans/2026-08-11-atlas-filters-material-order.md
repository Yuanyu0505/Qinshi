# Atlas Filters and Material Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图鉴增加复合筛选并统一图鉴、橙装个人进度的材料品质排序与布局。

**Architecture:** `js/atlas.js` 负责图鉴字段搜索、复合筛选及装备排序；`js/progress.js` 负责个人进度材料排序。`js/app.js` 只绑定控件和渲染，CSS 使用专用修饰类控制四列汇总及阶段对齐。

**Tech Stack:** 原生 JavaScript、HTML、CSS、Node 内置测试结构、localStorage。

## Global Constraints

- 保留累计工作树全部既有改动和本地存储格式。
- 图鉴等级范围为 `0–20`，闭区间筛选。
- 材料品质顺序为紫色、橙色，同品质按名称拼音升序。
- 项目的测试、lint 和浏览器验收由用户自行执行。

---

### Task 1: 图鉴纯逻辑

**Files:**
- Modify: `js/atlas.js`
- Modify: `js/atlas.test.js`

**Interfaces:**
- Produces: `sortEquipment(items)`、`searchAtlas(items, query, levels, field)`、`filterAtlas(items, options)`。

- [x] **Step 1:** 增加字段限定搜索、等级精确搜索和复合筛选回归用例。
- [x] **Step 2:** 增加阶段材料紫色优先、同品质名称升序回归用例。
- [x] **Step 3:** 实现三个纯逻辑接口，并让汇总排序复用 `sortEquipment()`。

### Task 2: 橙装个人进度排序

**Files:**
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`

**Interfaces:**
- Produces: `sortMaterialTokens(tokens)`；`aggregateMaterials(stageList)` 复用相同品质比较器。

- [x] **Step 1:** 将汇总期望改为紫色优先，并增加阶段内紫橙混合排序用例。
- [x] **Step 2:** 实现材料排序函数并导出，横杠固定放在有效装备之后。

### Task 3: 图鉴筛选界面与材料样式

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `ATLAS.filterAtlas()`、`ATLAS.sortEquipment()`。

- [x] **Step 1:** 增加“全部”分区按钮、搜索限制下拉框和 `0–20` 等级区间输入框。
- [x] **Step 2:** 绑定筛选状态，使用 `filterAtlas()` 生成交集结果。
- [x] **Step 3:** 图鉴单条和汇总装备增加 `.material-token`，阶段材料经 `sortEquipment()` 排序。

### Task 4: 橙装个人进度布局

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `PROG.sortMaterialTokens()`。

- [x] **Step 1:** 全体汇总增加四列修饰类，弟子汇总保持原样。
- [x] **Step 2:** 阶段材料渲染前排序，并增加统一材料容器。
- [x] **Step 3:** 调整阶段/材料固定列宽及材料对齐规则，保留响应式降列。

### Task 5: 范围检查与提交

- [x] **Step 1:** 检查新增条件全部取交集，且答题只读等未提交改动仍保留。
- [x] **Step 2:** 按项目约定列出用户手动验证重点，不主动运行验证。
- [x] **Step 3:** 提交累计改动到 `codex/atlas-upgrade-target`。
