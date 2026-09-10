# Forging Progress Navigation Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一橙装锻造个人进度的装备菜单、阶段编辑与材料搜索命中展示，并完成 PWA 1.0.35 之后所有改动的手机/平板适配审查和 1.0.36 发布。

**Architecture:** 在 `js/progress.js` 中增加可独立测试的材料命中展示模型，`js/app.js` 继续负责 DOM 渲染但统一使用现有 `forging` 物品菜单入口；`css/style.css` 为阶段实心命中、整行命中及窄屏连续语句提供样式。发布阶段同步更新 PWA 三处版本和发布说明，不引入新的持久化结构或资料数据。

**Tech Stack:** 原生 JavaScript（UMD）、HTML、CSS、Node.js `node:test`、Service Worker、浏览器 DOM API。

**Spec:** `docs/superpowers/specs/2026-09-09-forging-progress-navigation-release-design.md`

## Global Constraints

- 复用 `ItemNavigation.actionsForSource("forging")` 的六项菜单和现有名称模型、导航栈，不复制一套跳转实现。
- 阶段编辑必须更新实际弟子装备记录并保存；搜索结果保持只读外观，不开放品质切换或移除。
- 材料需求标题使用 `progressItem.equipmentName`，不能退回普通锻造主装备名。
- 只有真实装备素材可打开菜单；横杠和进化石保持不可点击。
- 手机允许连续句子自然换行，但禁止强制拆块和新增横向滚动。
- 不提交主目录已有的无关未提交文件或用户资料。

---

### Task 1: 材料需求展示模型

**Files:**
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`

**Interfaces:**
- Produces: `Progress.buildRequiredSearchPresentation(entry)`，返回 `{ ownerLabel, hits, hitStageIndexes }`。

- [ ] **Step 1: Write failing tests**

使用字面量夹具证明 `ownerLabel` 为“弄玉 · 神兵左传”，命中描述保留 `7→8锻` 与 `黄石天书`，多个阶段维持原顺序，命中索引去重。

- [ ] **Step 2: Run RED test**

Run: `node --test js/progress.test.js`

Expected: FAIL because `buildRequiredSearchPresentation` is undefined.

- [ ] **Step 3: Implement minimal pure model**

从搜索结果的 `disciple`、`progressItem` 和 `hits` 派生展示模型；不读取 DOM，不修改搜索算法。

- [ ] **Step 4: Run GREEN test**

Run: `node --test js/progress.test.js`

Expected: PASS with zero failures.

### Task 2: 统一菜单、阶段编辑和命中渲染

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `Progress.buildRequiredSearchPresentation(entry)` and generic `[data-item-menu-source="forging"]` controller.
- Produces: clickable owned/required equipment names and stage materials, editable search-result stage buttons, continuous requirement sentence, solid stage hit and full-row hit classes.

- [ ] **Step 1: Capture failing browser behavior before implementation**

在本地页面确认：个人进度装备名仍直接跳转、所需阶段装备名不可点击、所需结果阶段按钮不可编辑、命中材料行未整行高亮。

- [ ] **Step 2: Implement generic triggers and editable required results**

让个人进度装备名及阶段装备材料生成 `data-item-menu-source="forging"` 与 `data-item-name`；移除旧的 `data-progress-equipment` 专用跳转分支；所需结果调用 `equipmentHtml` 时传入 `editStage: true`。

- [ ] **Step 3: Implement continuous sentence and hit classes**

使用展示模型渲染一个 `.prog-search-requirement` 连续句子，并在阶段按钮和对应剩余材料表行附加命中类。

- [ ] **Step 4: Add responsive styles**

阶段命中使用金色实心底和白字；整行使用不遮盖文本的金色半透明背景/内描边；连续句在手机端允许自然换行，菜单触发元素保持可读与可触控。

- [ ] **Step 5: Run focused tests**

Run: `node --test js/progress.test.js js/item-navigation.test.js serve.test.js`

Expected: PASS with zero failures.

### Task 3: 弟子顺序调整

**Files:**
- Modify: `js/progress.js`
- Modify: `js/progress.test.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Produces: `Progress.swapDisciples(disciples, firstId, secondId)`，返回不修改原数组的新顺序。
- Produces: temporary `progReorderState` with `active`, `draft`, and `selectedId` fields.

- [ ] **Step 1: Write failing swap tests**

使用三名弟子的字面量数组证明 A/B 完整记录交换、原数组不变、无效或相同 ID 返回等价副本。

- [ ] **Step 2: Run RED test**

Run: `node --test js/progress.test.js`

Expected: FAIL because `swapDisciples` is undefined.

- [ ] **Step 3: Implement pure swap and reorder controls**

分页栏增加“调整顺序”，下方增加排序面板；进入时复制当前数组，点击两名弟子调用纯交换函数，保存时提交临时数组并以当前弟子 ID 重算页码，取消时直接丢弃草稿。

- [ ] **Step 4: Add responsive and accessible styles**

排序列表桌面/平板自适应多列、手机单列；选中态清晰，按钮至少 44px，面板使用 `aria` 状态且无横向溢出。

- [ ] **Step 5: Run focused tests**

Run: `node --test js/progress.test.js serve.test.js`

Expected: PASS with zero failures.

### Task 4: PWA 1.0.35 之后的手机和平板专项审查

**Files:**
- Modify: `css/style.css` only when an observed regression requires a fix.
- Test: `serve.test.js` only when a stable responsive contract needs regression coverage.

**Interfaces:**
- Consumes: product-code diff from PWA release commit `ec60a51` through current feature HEAD.
- Produces: verified responsive behavior at 390×844, 768×1024, 1024×768 and 1440×900.

- [ ] **Step 1: Audit changed UI surfaces**

Run: `git diff --stat ec60a51..HEAD` and inspect every changed HTML/CSS/UI JavaScript path for fixed widths, nowrap, overflow, small controls and viewport-dependent positioning.

- [ ] **Step 2: Exercise browser journeys at all target viewports**

检查装备属性→橙装锻造、关卡掉落→个人进度、逐鹿→个人进度、三种锻造查询模式互切、直接持有与材料需求菜单、阶段修改、命中整行及逐级返回。

- [ ] **Step 3: Fix only observed responsive regressions**

先记录失败视口和现象，再做最小 CSS/布局修复；重新执行相同视口和流程确认。

- [ ] **Step 4: Run complete tests after acceptance fixes**

Run: `node --test`

Expected: all tests pass with zero failures.

### Task 5: 发布、合并和推送

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `HANDOVER.md`
- Modify: `serve.test.js`

**Interfaces:**
- Produces: PWA version `1.0.36`, matching cache/display/runtime versions and release documentation.

- [ ] **Step 1: Write and run failing release contract test**

将发布测试期望改为 `1.0.36` 并要求离线缓存覆盖本次运行时资源；运行 `node --test serve.test.js`，预期因当前仍为 `1.0.35` 而失败。

- [ ] **Step 2: Update PWA version and release notes**

同步修改 `index.html`、`js/pwa.js`、`service-worker.js`，并在 `HANDOVER.md` 增加 1.0.36 说明。

- [ ] **Step 3: Verify release tree**

Run: `node --test`

Expected: all tests pass with zero failures; `git status --short` only lists intended files.

- [ ] **Step 4: Commit feature branch**

提交设计、计划、测试、业务代码、响应式样式和 PWA 发布文件，不包含用户资料或主目录无关改动。

- [ ] **Step 5: Fast-forward local master and verify**

Run: `git -C C:/Users/pghyl/Desktop/deepseek merge --ff-only codex/unified-item-navigation` then `node --test` in the main checkout.

Expected: merge succeeds and all tests pass; pre-existing main-worktree changes remain present.

- [ ] **Step 6: Push GitHub and verify deployment**

Run approved push from local `master` to GitHub `main`, then verify the deployed Service Worker contains `1.0.36`.

Expected: push succeeds and deployed PWA advertises cache version `1.0.36`.
