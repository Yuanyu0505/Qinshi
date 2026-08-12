# 手机和平板宽表滚动体验修正实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除手机和平板锻造及铭文宽表的嵌套纵向滚动空白，按查询模式控制冻结列，并修复材料汇总布局与冻结列透字。

**Architecture:** 页面负责所有纵向滚动，宽表容器只负责横向滚动。通过渲染时添加模式类来区分主锻造与素材装备；四大类通用表格使用独立滚动层，使固定列紧贴滚动视口左边界。

**Tech Stack:** 原生 HTML、CSS、JavaScript，现有 PWA/GitHub Pages。

## Global Constraints

- 只修改宽度不超过 `1024px` 的手机和平板行为，桌面端保持不变。
- 主锻造不冻结；素材装备、四大类总览和铭文资料表只冻结第一列，不冻结第一行。
- 不修改数据文件、搜索排序逻辑、个人进度存储键或备份格式。
- 不引入新依赖。
- 测试、lint、格式检查和功能验收由用户手动执行，AI 不主动运行验证流程。

---

### Task 1: 为锻造表格提供独立模式和滚动容器

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `applyForging()` 的 `forgeState.mode`，现有 `.summary-table` 和 `.forge-scroll`。
- Produces: `.summary-table-scroll`、`.forge-scroll-main`、`.forge-scroll-material`。

- [ ] **Step 1: 包装四大类通用表格**

在 `index.html` 中用 `<div class="summary-table-scroll">` 包裹 `.summary-table`，标题保留在滚动层外。

- [ ] **Step 2: 标记主锻造结果**

`applyForging()` 在主锻造分支输出 `<div class="forge-scroll forge-scroll-main">`。

- [ ] **Step 3: 标记素材装备结果**

`applyForging()` 在素材装备分支输出 `<div class="forge-scroll forge-scroll-material">`。

### Task 2: 移除嵌套纵向滚动并限定冻结列

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 1 输出的三个类名以及 `#inscription-reference .table-wrap`。
- Produces: 手机和平板端仅横向滚动、按模式冻结第一列的样式。

- [ ] **Step 1: 移除内部纵向滚动**

删除目标表格容器的 `max-height`，将 `.summary-table-scroll`、`.forge-scroll` 和铭文资料 `.table-wrap` 设置为 `overflow-x: auto; overflow-y: hidden`。

- [ ] **Step 2: 取消第一行冻结**

在移动/平板媒体查询中把目标表格 `thead th` 的 `position` 恢复为 `static`，不再设置 `top` 或 sticky 层级。

- [ ] **Step 3: 仅冻结指定表格第一列**

仅对 `.summary-table-scroll .summary-table`、`.forge-scroll-material .forge-h-table` 和 `#inscription-reference .ins-reference-table` 的首列设置 `position: sticky; left: 0`；不对 `.forge-scroll-main` 应用冻结。

- [ ] **Step 4: 修复固定列透字**

首列使用 `background-color: #191611`、`background-clip: padding-box`、右侧边界和双层阴影遮罩；总览滚动层使用负边距和等量内边距抵消卡片内边距，使固定列贴合可见区域。

### Task 3: 手机材料汇总固定两列

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.prog-material-grid` 和 `.prog-material-grid-overall`。
- Produces: 手机端普通弟子汇总与全体汇总均为两列。

- [ ] **Step 1: 修改手机断点网格**

在 `@media (max-width: 767px)` 中将 `.prog-material-grid` 设置为 `repeat(2, minmax(0, 1fr))`，并保留 `.prog-material-grid-overall` 两列。

- [ ] **Step 2: 防止材料标记溢出**

让网格材料标记保持 `max-width: 100%`，必要时允许文本在单元格内断行，而不改变数据顺序。

### Task 4: 更新 PWA 与交接文档

**Files:**
- Modify: `service-worker.js`
- Modify: `js/pwa.js`
- Modify: `index.html`
- Modify: `HANDOVER.md`
- Modify: `docs/superpowers/plans/2026-08-12-mobile-scroll-refinement.md`

**Interfaces:**
- Consumes: 本次静态资源变更。
- Produces: PWA `1.0.2` 和手动验收说明。

- [ ] **Step 1: 提升缓存与显示版本**

将 Service Worker 缓存名、`APP_VERSION` 和设置页初始版本统一提升到 `1.0.2`。

- [ ] **Step 2: 更新交接文档**

记录滚动策略变更、模式差异、两列汇总和桌面端不受影响。

- [ ] **Step 3: 提交代码**

提交本次实现到 `codex/atlas-upgrade-target`。

- [ ] **Step 4: 获得用户上传授权后推送**

将当前提交推送至远程 `main` 并触发 GitHub Pages。

- [ ] **Step 5: 用户手动验收**

用户按设计规格的六项重点完成手机、平板及桌面环境验收。
