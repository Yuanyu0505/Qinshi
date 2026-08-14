# 装备全分类搜索与典籍详情气泡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让未选择分类时的装备搜索覆盖全部装备，并把典籍逐阶累计详情改为不撑高表格行的锚定浮层气泡。

**Architecture:** 查询核心使用 `null`、空字符串和具体分类名表达三种不同分类范围；界面层保持初始未激活。典籍详情由一个页面级共享浮层渲染，内容继续消费 `Q.cumulativeBookStages()`，以按钮作为定位锚点，避免复制累计逻辑和被滚动表格裁切。

**Tech Stack:** 原生 JavaScript、HTML、CSS、Node `node:test` 现有测试契约。

## Global Constraints

- 初次进入装备属性分区仍不展示数据。
- `category === null` 表示全部分类；`category === ""` 只表示“除典籍外”。
- 每个阶段单独占一行；同一阶段的累计属性横向紧凑排列。
- 同一时间只打开一个气泡；支持“收起”、外部点击和 `Esc` 关闭。
- 不改变累计计算、非典籍展示、其他分区、PWA 文件或存储格式。
- 项目测试、浏览器验证和手动验收由用户执行，实施过程中只编写测试契约，不主动运行。

---

### Task 1: 区分全部分类与“除典籍外”

**Files:**
- Modify: `js/query.test.js`
- Modify: `js/query.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `Q.queryItems(items, opts)` 和装备分区 `state.category`。
- Produces: `matchCategory(item, category)` 的三态语义；`apply()` 原样传递 `null | "" | 具体分类名`。

- [ ] **Step 1: 写查询行为契约**

在 `js/query.test.js` 增加字面量断言：

```js
assert.strictEqual(Q.matchCategory(nonBook, null), true);
assert.strictEqual(Q.matchCategory(book, null), true);
assert.strictEqual(Q.matchCategory(book, ""), false);
assert.strictEqual(Q.matchCategory(nonBook, ""), true);
```

再增加仅提供搜索词、分类为 `null` 时同时命中典籍和非典籍夹具的断言。该测试防止再次把“未选择”折叠成“除典籍外”。

- [ ] **Step 2: 记录用户可执行的 RED 命令**

建议用户执行：

```powershell
node --test js/query.test.js
```

预期修改实现前新增契约失败；按照项目约定，AI 不主动执行。

- [ ] **Step 3: 修改查询核心与调用端**

在 `js/query.js` 将分类判断调整为：

```js
function matchCategory(item, category) {
  if (category == null) return true;
  if (category === "") return BOOK_CATEGORIES.indexOf(item.cat) === -1;
  return item.cat === category;
}
```

在 `js/app.js` 的 `apply()` 中直接传递：

```js
category: state.category,
```

保持 `state.activated` 与 `resetEquipmentView()` 的现有初始行为。

- [ ] **Step 4: 记录用户可执行的 GREEN 命令**

建议用户执行 `node --test js/query.test.js`，预期新增及既有查询契约通过。

- [ ] **Step 5: 提交**

```powershell
git add js/query.test.js js/query.js js/app.js
git commit -m "fix: search all equipment without category"
```

---

### Task 2: 将逐阶详情改为共享浮层气泡

**Files:**
- Modify: `serve.test.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `Q.cumulativeBookStages(item, tier)`、装备 `item.id` 与品质 `tier`。
- Produces: `#book-detail-popover` 页面级浮层、`.book-detail-toggle` 锚点按钮、打开/定位/关闭交互。

- [ ] **Step 1: 写页面行为契约**

在 `serve.test.js` 增加契约，锁定以下用户可见行为：

- 页面存在唯一 `#book-detail-popover`，默认 `hidden`。
- 原来的内联 `<details class="book-tier-details">` 不再输出。
- 每个品质输出 `.book-detail-toggle`，携带装备 ID、品质和 `aria-expanded="false"`。
- 气泡内容调用 `Q.cumulativeBookStages()`，每个 `.book-popover-stage-row` 对应一个阶段。
- 存在“详情”“收起”、外部点击、`Escape`、滚动与尺寸变化的关闭处理。
- CSS 使用 `position: fixed` 和高层级，阶段行为独立网格行。

- [ ] **Step 2: 记录用户可执行的 RED 命令**

建议用户执行：

```powershell
node --test serve.test.js
```

预期修改实现前新增契约失败；按照项目约定，AI 不主动执行。

- [ ] **Step 3: 添加共享浮层节点**

在 `index.html` 的装备属性分区加入一个默认隐藏的页面级浮层：

```html
<div id="book-detail-popover" class="book-detail-popover" role="dialog" aria-modal="false" hidden>
  <div class="book-detail-popover-head">
    <strong id="book-detail-popover-title"></strong>
    <button type="button" class="book-detail-close">收起</button>
  </div>
  <div id="book-detail-popover-body"></div>
  <span class="book-detail-arrow" aria-hidden="true"></span>
</div>
```

- [ ] **Step 4: 替换详情渲染并实现气泡状态**

在 `js/app.js`：

- 把每个品质原生 `<details>` 替换为 `.book-detail-toggle` 按钮。
- 使用一个当前打开记录保存装备 ID、品质和触发按钮。
- 打开时查找真实装备，调用 `Q.cumulativeBookStages(item, tier)`。
- 每个阶段输出一条 `.book-popover-stage-row`，阶段属性通过 `tokenHtml(stage.tokens, "、")` 横向连接。
- 标题输出“装备名 · 品质”；按钮切换“详情/收起”并同步 `aria-expanded`。
- 根据触发按钮与气泡的 `getBoundingClientRect()` 计算固定定位；优先上方、空间不足时下方，并限制左右边界。
- 外部点击、`Escape`、滚动、尺寸变化、重新查询和切换分区时关闭。

- [ ] **Step 5: 添加紧凑气泡样式**

在 `css/style.css`：

- 删除只服务于旧内联 `<details>` 展开区域的规则。
- 为气泡设置深色背景、金色边框、阴影、圆角、`position: fixed` 和高于粘性表格的 `z-index`。
- 阶段区使用一行一个阶段的双列网格：左侧阶段标签，右侧横向属性；属性过多时仅在该行内换行。
- 通过 `data-placement` 切换箭头方向。
- 窄屏限制宽度为 `calc(100vw - 24px)`。

- [ ] **Step 6: 记录用户可执行的 GREEN 命令**

建议用户执行：

```powershell
node --test serve.test.js js/query.test.js
```

并手动检查桌面和窄屏下气泡不会撑高表格行、不会被横向滚动容器裁切。

- [ ] **Step 7: 提交**

```powershell
git add serve.test.js index.html js/app.js css/style.css
git commit -m "feat: show book growth in anchored popover"
```

---

### Task 3: 只读复核与本地合并

**Files:**
- Review: `js/query.js`
- Review: `js/app.js`
- Review: `index.html`
- Review: `css/style.css`
- Review: `js/query.test.js`
- Review: `serve.test.js`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的完整差异。
- Produces: 范围、逻辑和交互检查结论；在无阻断问题时快进合并本地 `master`。

- [ ] **Step 1: 检查完整差异**

重点核对：分类三态未破坏明确筛选；初始页面仍为空；气泡不参与表格布局；逐阶数据来自累计查询核心；非典籍路径和 PWA 文件未改。

- [ ] **Step 2: 检查合并安全性**

确认功能分支文件与主工作区未提交的 Excel、图片不存在路径重叠，并确认 `master` 仍是功能分支基点。

- [ ] **Step 3: 快进合并**

```powershell
git merge --ff-only codex/equipment-search-popover
```

保留功能分支与工作树；不推送远程，不更新 PWA。
