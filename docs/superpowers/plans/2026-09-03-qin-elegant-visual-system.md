# 典雅水墨秦风三端视觉系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变业务逻辑的前提下，为网页、平板和手机端建立统一、克制、易读的典雅水墨秦风视觉系统。

**Architecture:** 保留现有 HTML 与 JavaScript 交互结构，在 `css/style.css` 末尾新增唯一的最终主题层，以设计令牌统一覆盖旧视觉碎片。响应式规则分别覆盖桌面、平板和手机，所有保护性规则放在最终层，确保剑形导航、手机底栏、战匣丹囊非冻结模式栏和装备属性折叠行为不被回归。

**Tech Stack:** 静态 HTML、原生 JavaScript、CSS、Node.js `node:test`

**Spec:** `docs/superpowers/specs/2026-09-03-qin-elegant-visual-system-design.md`

## Global Constraints

- 不修改任何业务数据、筛选规则、个人进度和交互流程。
- 保留当前剑形导航、手机底部导航与“更多”入口。
- 不恢复页面巨型外框、面板角纹或战匣丹囊冻结模式栏。
- 手机和平板交互控件最小高度不低于 `44px`。
- PWA 版本保持 `1.0.27`，不修改 `service-worker.js`、`js/pwa.js`、`manifest.webmanifest`。
- 完成后只快进合并到本地 `master`，不推送 GitHub。

---

### Task 1: 建立视觉回归契约

**Files:**
- Modify: `serve.test.js`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `GET /css/style.css` 返回的生产样式表。
- Produces: 三端主题令牌、公共表面、控件、表格、断点和保护规则的回归契约。

- [ ] **Step 1: Write the failing test**

  新增一项集成测试，通过真实 HTTP 服务读取 `css/style.css`，检查最终主题层标识、`--qin-space-*` 间距令牌、`font-variant-numeric: tabular-nums`、平板／手机断点、`44px` 触控约束、无角纹、战匣丹囊非冻结保护和 `prefers-reduced-motion`。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test --test-name-pattern="典雅水墨秦风" serve.test.js`

  Expected: FAIL，原因是最终主题层及新令牌尚不存在。

- [ ] **Step 3: Commit the failing contract with its implementation task**

  测试与 Task 2 的实现一起提交，避免主分支出现只有失败测试的中间状态。

### Task 2: 实现公共视觉系统

**Files:**
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: 现有 `--bg`、`--panel`、`--gold`、`--red` 等兼容变量和现有组件类名。
- Produces: `--qin-space-*`、`--qin-radius-*`、`--qin-surface-*` 等最终主题令牌，以及统一的面板、卡片、按钮、表单、状态和表格视觉。

- [ ] **Step 1: Add the final design-token layer**

  在 `css/style.css` 末尾添加 `Qin elegant ink final theme` 区块，定义墨底、漆面、青铜、暗金、朱砂、玉色、暖灰、间距、圆角和阴影令牌，并映射旧变量。

- [ ] **Step 2: Normalize shared surfaces and hierarchy**

  统一一级面板、结果卡、资料卡和浮层的材质；强制取消普通面板角纹与页面巨型外框；使用背景差、留白和细分隔降低内层套框感。

- [ ] **Step 3: Normalize controls and states**

  统一默认、悬停、激活、聚焦、文本操作、危险操作、成功状态与表单控件，并保持数字字段无步进按钮。

- [ ] **Step 4: Normalize tables and dense data**

  统一表头、行高、数字对齐、分隔和滚动容器；仅让表格表头在其滚动容器内吸顶，不冻结普通工具栏。

- [ ] **Step 5: Run targeted test**

  Run: `node --test --test-name-pattern="典雅水墨秦风" serve.test.js`

  Expected: PASS。

- [ ] **Step 6: Commit**

  ```powershell
  git add -- css/style.css serve.test.js docs/superpowers/specs/2026-09-03-qin-elegant-visual-system-design.md docs/superpowers/plans/2026-09-03-qin-elegant-visual-system.md
  git commit -m "style: unify Qin visual system"
  ```

### Task 3: 完成三端响应式细化

**Files:**
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: Task 2 的主题令牌和公共组件层。
- Produces: 桌面 `>=1025px`、平板 `768px–1024px`、手机 `<=767px` 与短横屏的最终布局密度规则。

- [ ] **Step 1: Refine desktop density**

  保持剑形目录，统一一级面板间距、多列卡片间距和桌面表格可读性。

- [ ] **Step 2: Refine tablet density**

  缩减装饰和内边距，保证双列卡片、复杂表单换行及横向滚动容器不溢出页面。

- [ ] **Step 3: Refine mobile density and touch**

  强制单列内容流、44px 触控尺寸、底部安全区、低阴影和紧凑标题；保留手机底栏、“更多”抽屉及现有卡片／折叠方案。

- [ ] **Step 4: Protect interaction-specific layouts**

  对 `.battle-pouch-modes` 保持 `position: static` 和无整体边框；对桌面剑导航与手机底栏分别限定样式范围；不改变装备品质顺序和展开状态。

- [ ] **Step 5: Run the complete suite**

  Run: `node --test --test-reporter=dot`

  Expected: 231 项既有测试加新增测试全部 PASS。

### Task 4: 视觉验收与本地合并

**Files:**
- Verify: `css/style.css`
- Verify: `index.html`
- Verify: `service-worker.js`
- Verify: `js/pwa.js`

**Interfaces:**
- Consumes: 完成的功能分支。
- Produces: 仅位于本地 `master` 的视觉优化提交。

- [ ] **Step 1: Review the diff**

  检查改动仅包含样式、回归测试、设计文档和实施计划，不包含用户表格／图片，也不包含 PWA 文件。

- [ ] **Step 2: Verify PWA remains unchanged**

  核对 `service-worker.js` 与 `js/pwa.js` 仍为 `1.0.27`，并确认它们不在 diff 中。

- [ ] **Step 3: Run fresh full verification on the feature branch**

  Run: `node --test --test-reporter=dot`

  Expected: 全部 PASS，0 failures。

- [ ] **Step 4: Fast-forward merge to local master**

  从主工作区执行 `git merge --ff-only codex/qin-elegant-visual-system`，不执行 `git push`。

- [ ] **Step 5: Run fresh full verification on master**

  Run: `node --test --test-reporter=dot`

  Expected: 全部 PASS，0 failures。

## Self-Review

- Spec coverage: 全局色彩、字体、材质、公共组件、三端断点、动效、非冻结保护、无角纹与不更新 PWA 均有对应任务。
- Placeholder scan: 计划中无 `TBD`、`TODO` 或未定义实现项。
- Type consistency: 本计划不新增 JavaScript 接口；所有 CSS 令牌和选择器均由 Task 2 定义并由 Task 3 消费。
