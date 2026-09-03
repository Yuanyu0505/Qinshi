# 战匣丹囊资料表与子页签修正实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让战匣丹囊子页签正常随页面滚动，关键节点显示区间累计材料，并统一资料表对齐。

**Architecture:** 在 `js/battle-box-pill-pouch.js` 增加纯函数生成关键节点行，复用既有 `costBetween` 累计材料；界面层根据视图调用该函数，样式层仅调整子页签容器和资料表布局。现有数据文件继续保存逐级材料，不改数据含义。

**Tech Stack:** 原生 JavaScript、HTML、CSS、Node.js `node:test`

**Spec:** `docs/superpowers/specs/2026-09-03-battle-pouch-reference-layout-design.md`

## Global Constraints

- 不改变个人进度、目标计算、等级原始数据与子页签按钮自身样式。
- “全部等级／当前附近”继续显示单级材料，只有“关键节点”显示相邻关键节点区间累计。
- 不更新 PWA，不推送 GitHub；完成后快进合并到本地 `master`。

---

### Task 1: 关键节点区间累计

**Files:**
- Modify: `js/battle-box-pill-pouch.test.js`
- Modify: `js/battle-box-pill-pouch.js`
- Modify: `js/battle-box-pill-pouch-ui.js`

**Interfaces:**
- Consumes: `costBetween(levels, currentLevel, targetLevel)`
- Produces: `keyReferenceRows(levels)`，返回复制后的关键节点行，属性保持节点值，`pearls` 与 `shells` 为区间累计值。

- [x] **Step 1: Write the failing test**

为战匣和丹囊分别断言1级、10级、20级的关键节点材料为手工汇总结果，并断言原始数据未被修改。

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="关键节点材料" js/battle-box-pill-pouch.test.js`

Expected: FAIL，因为 `keyReferenceRows` 尚不存在。

- [x] **Step 3: Write minimal implementation**

新增 `keyReferenceRows(levels)`；按关键节点列表逐段调用 `costBetween`，再将累计材料覆盖到节点行副本。界面的关键节点分支改为调用该函数，并将列名改成“PVP免伤”。

- [x] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="关键节点材料" js/battle-box-pill-pouch.test.js`

Expected: PASS。

### Task 2: 子页签与表格布局

**Files:**
- Modify: `serve.test.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.battle-pouch-modes`、`.battle-pouch-reference-table`
- Produces: 普通流无外框子页签；固定列宽、水平和垂直居中的资料表；手机卡片内容垂直居中。

- [x] **Step 1: Write the failing test**

增加页面级断言：子页签为 `position: static` 且无外框；资料表使用 `table-layout: fixed`、居中和垂直居中；手机数据行具有垂直居中；界面输出“PVP免伤”。

- [x] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="战匣丹囊子页签|战匣丹囊资料表" serve.test.js`

Expected: FAIL，命中当前冻结、带框和右/左混合对齐样式。

- [x] **Step 3: Write minimal implementation**

修改战匣丹囊专属CSS：取消冻结和外层装饰，表格固定布局，全部单元格居中且 `vertical-align: middle`，手机卡片数据行增加 `align-items: center`。

- [x] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern="战匣丹囊子页签|战匣丹囊资料表" serve.test.js`

Expected: PASS。

### Task 3: 回归验证与本地合并

**Files:**
- Modify: `docs/superpowers/plans/2026-09-03-battle-pouch-reference-layout.md`

**Interfaces:**
- Produces: 已验证并快进合并到本地 `master` 的提交。

- [x] **Step 1: Run focused tests**

Run: `node --test js/battle-box-pill-pouch.test.js serve.test.js`

Expected: PASS。

- [x] **Step 2: Run full tests and diff checks**

Run: `node --test --test-reporter=dot`

Run: `git diff --check`

Expected: 全部测试通过，Git差异格式检查通过。

- [ ] **Step 3: Commit implementation**

提交设计、计划、测试与实现文件，提交信息：`fix: refine battle pouch reference tables`。

- [ ] **Step 4: Merge to local master**

在主工作区执行 `git merge --ff-only codex/battle-pouch-reference-fixes`，不暂存或修改用户现有工作簿、临时目录和图片。
