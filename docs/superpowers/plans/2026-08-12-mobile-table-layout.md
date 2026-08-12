# 手机和平板表格布局优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变桌面端布局的前提下，让手机和平板完整展示锻造个人进度、折叠图鉴汇总装备，并为锻造与铭文表格冻结第一行和第一列。

**Architecture:** 继续复用现有页面 DOM 和表格渲染逻辑，通过 `@media (max-width: 1024px)` 覆盖移动/平板样式；图鉴汇总仅增加一个无持久化状态的折叠容器与事件委托。桌面端由默认样式保持现状，移动端通过媒体查询改变显示行为。

**Tech Stack:** 原生 HTML、CSS、JavaScript，现有静态 GitHub Pages/PWA。

## Global Constraints

- 只修改宽度不超过 `1024px` 的手机和平板布局，桌面端布局不得改变。
- 不修改 Excel、生成数据、个人进度存储键或备份格式。
- 不引入新依赖。
- 项目测试、lint、格式检查及功能验收由用户手动执行，AI 不主动运行验证流程。

---

### Task 1: 橙装锻造个人进度自适应

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `equipmentHtml()` 输出的 `.mini-table.prog-material-table`、`.prog-stage-label`、`.prog-stage-materials`。
- Produces: `@media (max-width: 1024px)` 下卡片内两列自适应布局。

- [ ] **Step 1: 覆盖个人进度表格宽度**

在移动/平板媒体查询内将 `.prog-material-table` 设置为 `width: 100%`、`min-width: 0`，覆盖全局 `table { min-width: 860px; }`。

- [ ] **Step 2: 取消历史位移**

将 `.prog-stage-label` 与 `.prog-stage-materials` 的 `transform` 重置为 `none`，避免阶段和材料脱离卡片。

- [ ] **Step 3: 设置紧凑列宽与换行**

阶段列使用固定紧凑宽度，材料列使用剩余空间；材料容器允许换行，并保证所有内容位于卡片宽度内。

### Task 2: 图鉴汇总装备移动端折叠

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `atlasUpgradeSummaryHtml(summary)` 生成的汇总装备列表。
- Produces: `.atlas-summary-equipment-toggle` 按钮与 `.atlas-summary-equipment` 折叠区域。

- [ ] **Step 1: 输出可折叠结构**

在有装备需求的汇总中输出 `aria-expanded="false"` 的展开按钮，并为装备区域提供稳定的可定位类名。

- [ ] **Step 2: 绑定事件委托**

在图鉴汇总容器上监听按钮点击，切换展开状态、按钮文案以及装备区域的展开类，不写入 `localStorage`。

- [ ] **Step 3: 限定响应式显示规则**

桌面端隐藏展开按钮且始终显示装备；`@media (max-width: 1024px)` 下默认隐藏装备区域，仅在具有展开类时显示。

### Task 3: 锻造与铭文表格冻结首行首列

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.summary-card .summary-table`、`.forge-scroll .forge-h-table`、`#inscription-reference .table-wrap .ins-reference-table`。
- Produces: 移动/平板端 B2 起滚动、第一行及第一列冻结的表格行为。

- [ ] **Step 1: 规范滚动容器**

在移动/平板媒体查询内为三类表格容器设置 `overflow: auto` 和 `max-height: min(65vh, 720px)`，使宽表和长表都在自身容器内滚动。

- [ ] **Step 2: 冻结第一行**

对目标表格 `thead th` 设置 `position: sticky; top: 0`，使用不透明背景和高于普通单元格的层级。

- [ ] **Step 3: 冻结第一列**

对目标表格每行第一个 `th` 或 `td` 设置 `position: sticky; left: 0`，并设置不透明背景和层级。

- [ ] **Step 4: 提升左上角层级**

对目标表格 `thead th:first-child` 同时保留 `top: 0` 和 `left: 0`，使用最高层级，确保双向滚动时不被覆盖。

### Task 4: 文档、提交与发布交接

**Files:**
- Modify: `HANDOVER.md`
- Modify: `service-worker.js`

**Interfaces:**
- Consumes: 本次 CSS/JavaScript 变更。
- Produces: 更新说明、PWA 缓存版本和可推送提交。

- [ ] **Step 1: 更新交接文档**

记录四项移动端布局优化、桌面端不受影响以及用户手动验收重点。

- [ ] **Step 2: 更新 PWA 缓存版本**

提升 `service-worker.js` 的缓存版本，确保已安装设备能收到新版静态资源。

- [ ] **Step 3: 提交并推送**

提交实现到当前分支并推送远程 `main`，由 GitHub Pages 工作流发布。

- [ ] **Step 4: 用户手动验收**

用户按照设计规格中的五项重点，在手机、平板和桌面环境手动验证。
