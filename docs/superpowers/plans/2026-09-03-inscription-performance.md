# 铭文交互性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除铭文三个子页面切换和查询输入时的同步大规模渲染卡顿。

**Architecture:** 使用一个无 DOM 依赖的渲染协调器管理子页面的首次渲染、缓存失效和搜索合并刷新；铭文页面只在当前内容需要时调用既有渲染函数。CSS 使用 `content-visibility` 跳过视口外卡片的布局与绘制，同时保留现有视觉语义。

**Tech Stack:** 原生 JavaScript、CSS、Node.js `node:test`

**Spec:** `docs/superpowers/specs/2026-09-03-inscription-performance-design.md`

## Global Constraints

- 铭文数据、筛选规则、结果顺序和个人进度数据结构保持不变。
- 查询结果必须完整显示，不增加分页或结果上限。
- 星形描边保持 `4px`。
- 电脑、平板和手机端共用同一套行为。

---

### Task 1: 可测试的渲染协调器

**Files:**
- Create: `js/inscription-performance.js`
- Create: `js/inscription-performance.test.js`

**Interfaces:**
- Produces: `createRenderCoordinator(options)`，返回 `activate(mode)`、`invalidate(mode)`、`markDirty(mode)`、`scheduleQuery()` 和 `cancelPendingQuery()`。

- [ ] **Step 1: Write the failing test**

使用真实协调器 API 断言：首次激活渲染一次、重复激活复用结果、隐藏页失效后延迟到下次激活、连续搜索调度只执行最后一次。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test js/inscription-performance.test.js`
Expected: FAIL，因为 `js/inscription-performance.js` 尚不存在。

- [ ] **Step 3: Write minimal implementation**

实现 UMD 风格的纯状态协调器；浏览器挂载到 `window.INSCRIPTION_PERFORMANCE`，Node.js 通过 `module.exports` 读取。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test js/inscription-performance.test.js`
Expected: PASS。

### Task 2: 铭文页面按需渲染与输入合并

**Files:**
- Modify: `index.html`
- Modify: `js/inscription.js`
- Modify: `service-worker.js`
- Test: `js/inscription-performance.test.js`

**Interfaces:**
- Consumes: `window.INSCRIPTION_PERFORMANCE.createRenderCoordinator(options)`。
- Produces: 查询页和资料页按需渲染，个人进度变更只使查询缓存失效。

- [ ] **Step 1: Write the failing integration assertions**

补充协调器行为场景，覆盖当前页失效立即刷新和隐藏页失效延迟刷新。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test js/inscription-performance.test.js`
Expected: FAIL，显示缺失的失效行为。

- [ ] **Step 3: Write minimal implementation**

在页面初始化、模式切换、筛选监听及个人进度保存/删除处接入协调器；在 HTML 中按顺序加载辅助脚本，并加入离线资源清单。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test js/inscription-performance.test.js`
Expected: PASS。

### Task 3: 视口外卡片延迟绘制

**Files:**
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: 查询卡片、进度卡片的布局绘制隔离，星形保留 4px 描边并移除高成本滤镜。

- [ ] **Step 1: Write the failing regression assertion**

添加页面资源和关键性能样式的回归约束。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test serve.test.js`
Expected: FAIL，因为性能样式尚不存在。

- [ ] **Step 3: Write minimal implementation**

为铭文结果容器和卡片添加 `contain`、`content-visibility`、`contain-intrinsic-size`，并用 `text-shadow` 替代星形 `filter`。

- [ ] **Step 4: Run targeted and full verification**

Run: `node --test js/inscription-performance.test.js serve.test.js`
Expected: PASS。

Run: `node --test`
Expected: 全部测试通过。

### Task 4: 装备属性单行紧凑布局

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: 副属性筛选单行自适应布局、手机短标签和单行“进阶详情”按钮。

- [ ] **Step 1: Write and verify the failing regression assertion**

断言筛选容器不换行、不横向滚动，长标签具有手机短标签，进阶详情禁止文字换行。

- [ ] **Step 2: Implement the compact layout**

为副属性行增加独立类名，按宽度压缩间距和字号；手机仅缩短三个“敌方减…”标签的显示文字，保留完整 `aria-label` 和 `title`。

- [ ] **Step 3: Verify desktop, tablet and mobile geometry**

检查三种宽度下 15 个筛选按钮均处于一行、容器无水平溢出，进阶详情为 `white-space: nowrap`。

### Task 5: 锻造材料总览无横向滚动布局

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: 阶段单元格 `data-label`，桌面/平板紧凑表格和手机阶段网格卡。

- [ ] **Step 1: Write and verify the failing regression assertion**

断言总览不再声明左右滑动，容器无横向滚动，移动布局可读取阶段标签。

- [ ] **Step 2: Implement responsive rendering**

电脑和平板使用固定表格布局与紧凑列；手机隐藏表头并把每个类别行转换为两列阶段卡，合计材料分行显示。

- [ ] **Step 3: Verify all target widths**

在 1311px、900px、390px 宽度下检查容器 `scrollWidth <= clientWidth`，并确认页面本身无水平溢出。
