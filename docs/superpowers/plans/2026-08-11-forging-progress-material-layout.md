# Forging Progress Material Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在橙装锻造个人进度中统一剩余材料的品质样式、排序、三列汇总和跨装备阶段对齐。

**Architecture:** 保留现有进度数据结构，只调整纯逻辑层的汇总排序和页面渲染层。材料标签复用已有 `material-token` 品质样式，汇总使用独立 CSS Grid，阶段明细使用固定列宽表格。

**Tech Stack:** 原生 JavaScript、HTML 字符串渲染、CSS Grid/Table Layout。

## Global Constraints

- 保留当前累计工作树中的全部既有功能。
- 不改变 localStorage 格式或锻造数据源。
- 自动验证、测试、lint 和格式检查由用户自行执行。

---

### Task 1: 汇总排序

**Files:**
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`

**Interfaces:**
- Consumes: `aggregateMaterials(stageList)` 当前生成的 `{ n, q, count }[]`。
- Produces: 按橙色、紫色和名称拼音顺序排列的相同数据结构。

- [x] **Step 1:** 将数量倒序比较替换为品质优先级比较，并以 `localeCompare(..., "zh-Hans-CN")` 作为同品质名称排序。
- [x] **Step 2:** 同步更新函数注释和既有断言，避免文档、测试预期与行为不一致；测试由用户按项目约定自行执行。

### Task 2: 汇总标签与阶段结构

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `PROG.discipleSummary`、`PROG.overallSummary` 和 `forgingTokenHtml`。
- Produces: `progressSummaryHtml(materials)` 汇总网格，以及带 `prog-material-table` 类和固定列定义的阶段明细。

- [x] **Step 1:** 让个人进度的阶段材料调用 `forgingTokenHtml(token, false, true)`，使用实心品质样式。
- [x] **Step 2:** 新增汇总标签渲染函数，将数量输出为“装备名 ×数量”。
- [x] **Step 3:** 将全体与单弟子汇总的品质表格替换为统一三列网格。
- [x] **Step 4:** 为剩余阶段表增加专用类与 `colgroup`，固定阶段列和材料列结构。

### Task 3: 页面布局样式

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.prog-material-grid`、`.prog-material-table` 和 `.material-token`。
- Produces: 桌面三列、窄屏自适应的汇总布局，以及不同装备间一致的阶段/材料列位置。

- [x] **Step 1:** 添加三列 Grid 与两级响应式降列规则。
- [x] **Step 2:** 固定阶段表格布局、阶段列宽度和材料列对齐方式。
- [x] **Step 3:** 限定标签在网格单元和阶段材料列中的排版，避免覆盖其他分区。

### Task 4: 交付检查与提交

**Files:**
- Review: `js/progress.js`
- Review: `js/app.js`
- Review: `css/style.css`

- [x] **Step 1:** 查看 `git diff`，确认没有改变存储格式、查询逻辑或其他分区。
- [x] **Step 2:** 按项目约定不执行自动验证，列出汇总排序、三列布局和跨装备对齐的手动验收重点。
- [ ] **Step 3:** 提交本次改动到 `codex/atlas-upgrade-target`。
