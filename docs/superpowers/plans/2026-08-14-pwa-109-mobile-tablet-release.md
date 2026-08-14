# PWA 1.0.9 手机和平板发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 适配 `1.0.6` 之后的全部工具变更，并以 PWA `1.0.9` 发布到 GitHub Pages。

**Architecture:** 业务逻辑和数据保持不变，只在现有 `max-width: 1024px` 与手机媒体查询中补充触控、卡片、滚动和气泡规则。完成适配后同步三个 PWA 版本源，并通过既有 `origin/main` 发布链推送。

**Tech Stack:** HTML、CSS、原生 JavaScript、Service Worker、GitHub Pages。

## Global Constraints

- 覆盖手机当前 `1.0.6` 之后的全部工具改动。
- PWA 版本统一为 `1.0.9`。
- 不修改业务数据和本地存储格式。
- 不提交用户本地 Excel 与图片。
- 按项目约定不主动运行测试、lint、格式化或浏览器验收。

---

### Task 1: 固化移动适配与版本契约

**Files:**
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `css/style.css` 的窄屏媒体查询和三个 PWA 版本源。
- Produces: 图鉴、兵法、典籍气泡的触控/布局契约，以及 `1.0.9` 版本一致性契约。

- [ ] **Step 1:** 将 PWA 版本契约从 `1.0.8` 更新为 `1.0.9`，并覆盖 `index.html`、`js/pwa.js`、`service-worker.js`。
- [ ] **Step 2:** 增加图鉴收藏按钮 44 像素触控区契约。
- [ ] **Step 3:** 增加兵法表单 16 像素字号、操作按钮触控高度、资料表首列冻结契约。
- [ ] **Step 4:** 增加典籍卡片固定累计标签列、进阶详情按钮触控高度、气泡动态视口高度契约。
- [ ] **Step 5:** 记录建议用户执行 `node --test serve.test.js js/atlas.test.js js/tactics.test.js js/query.test.js`；AI 不执行。

### Task 2: 补齐手机和平板样式

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 现有 `.atlas-favorite-toggle`、兵法表单/按钮/资料表、`.book-card` 与 `.book-detail-popover`。
- Produces: 不改变桌面布局的 `max-width: 1024px` 和手机专用适配规则。

- [ ] **Step 1:** 在不超过 1024 像素时扩大图鉴收藏、兵法按钮和典籍详情按钮的触控高度。
- [ ] **Step 2:** 在手机媒体查询中将兵法输入控件字号设为 16 像素，并保持单列布局。
- [ ] **Step 3:** 为手机典籍卡片设置统一累计标签列，保证累计属性和进阶详情同起点。
- [ ] **Step 4:** 为手机典籍气泡设置动态视口最大高度、内部滚动和滚动边界控制。
- [ ] **Step 5:** 保留平板典籍表冻结前三列、兵法表冻结首列、关卡掉落两列自适应规则。

### Task 3: 提升 PWA 版本并记录发布

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: 当前完整运行时预缓存清单。
- Produces: `qinshi-site-1.0.9` 缓存和页面显示版本 `1.0.9`。

- [ ] **Step 1:** 将三个版本源统一改为 `1.0.9`。
- [ ] **Step 2:** 核对预缓存清单包含兵法和全部既有运行时资源；不缓存设计文档和测试文件。
- [ ] **Step 3:** 在交接文档记录 `1.0.9` 覆盖 `1.0.6` 后的移动适配及典籍功能。
- [ ] **Step 4:** 只读检查改动范围，提交发布分支。

### Task 4: 合并并部署 GitHub Pages

**Files:**
- No file changes.

**Interfaces:**
- Consumes: `codex/pwa-1.0.9-release` 发布提交。
- Produces: 本地 `master` 与远程 `origin/main` 的 `1.0.9` 发布版本。

- [ ] **Step 1:** 确认本地 `master` 仅保留用户原有 Excel 与图片改动，发布分支以当前 `master` 为基线。
- [ ] **Step 2:** 以 fast-forward 合并到本地 `master`。
- [ ] **Step 3:** 获取远程状态，确认推送不会覆盖远程新提交。
- [ ] **Step 4:** 将本地 `master` 推送到 `origin/main`，触发既有 GitHub Pages 工作流。
- [ ] **Step 5:** 向用户说明手机端检查更新和必要时重新打开应用的步骤。
