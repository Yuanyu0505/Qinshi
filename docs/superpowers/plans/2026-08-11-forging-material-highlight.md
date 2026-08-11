# 橙装锻造素材搜索标签高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已确认示意图为橙装锻造素材搜索结果增加四种清晰的标签状态。

**Architecture:** `js/app.js` 只负责在素材搜索模式为标签增加作用域类；`css/style.css` 在该作用域内定义紫色、橙色和命中红色三组视觉样式。查询逻辑和数据保持不变。

**Tech Stack:** 原生 JavaScript、CSS。

## Global Constraints

- 只影响“作为素材装备”结果。
- 非搜索目标使用白色字体和2px同色外框。
- 搜索目标均使用红色背景和2px红色外框，紫装文字为紫色、橙装文字为橙色。
- 不执行自动验证。

---

### Task 1: 素材标签作用域

**Files:**
- Modify: `js/app.js`

- [x] 为 `forgingTokenHtml` 增加素材模式参数。
- [x] 素材模式的全部装备标签增加 `material-token` 类。
- [x] 维持现有命中判断和查询结果结构。

### Task 2: 四种视觉状态

**Files:**
- Modify: `css/style.css`

- [x] 普通紫色素材改为紫色实色背景、2px紫框和白字。
- [x] 普通橙色素材改为橙色实色背景、2px橙框和白字。
- [x] 紫色和橙色命中素材统一使用红色实色背景和2px红框，并分别保留紫色、橙色文字。

### Task 3: 交接

- [x] 提交到累计分支 `codex/atlas-upgrade-target`。
- [x] 列出用户手动验证重点。
