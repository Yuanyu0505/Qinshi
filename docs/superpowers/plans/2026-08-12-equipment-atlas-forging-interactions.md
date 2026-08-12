# 装备属性、图鉴与橙装锻造交互优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现装备属性待筛选状态和品质排版、图鉴汇总默认折叠，以及橙装锻造查询重排与弟子搜索跳转。

**Architecture:** 保留现有单页应用和数据模块边界，只在 `js/app.js` 的三个独立状态分支中增加界面状态与事件处理。纯搜索匹配逻辑放在现有 `js/progress.js`，结构顺序和文字放在 `index.html`，视觉表现集中在 `css/style.css`，不修改任何生成数据和本地存储结构。

**Tech Stack:** 原生 HTML、CSS、JavaScript，现有 UMD 查询模块和浏览器 `localStorage`。

## Global Constraints

- 不修改装备属性、图鉴、橙装锻造的数据生成脚本和源数据。
- 不修改 `qinshi_forging_progress_v1` 的 `localStorage` 数据结构。
- 本次不专门新增手机或平板布局，现有响应式规则继续生效。
- 项目功能验证、测试、lint、格式检查及手动验收由用户自行执行；实施者不主动运行验证命令，也不宣称结果已经通过。
- 保留所有既有分区和此前最新工具改动。

---

### Task 1: 装备属性待筛选状态、名称品质与典籍排版

**Files:**
- Modify: `js/app.js:18-25, 105-170, 850-1030`
- Modify: `css/style.css:730-805`

**Interfaces:**
- Consumes: `state`、`switchPartition(name)`、`apply()`、`equipmentTableHtml()`、`renderCards()`、`bookStageHtml()`。
- Produces: `state.activated: boolean`、以 `null` 区分“未选择”的 `state.category/state.main`、`resetEquipmentView()`、`equipmentNameHtml(item)`、支持连接符参数的 `tokenHtml(tokens, separator)`。

- [ ] **Step 1: 为装备属性增加明确的待筛选状态**

在 `state` 中新增 `activated: false`，并将 `category`、`main` 的初始值改成 `null`。`null` 表示尚未选择，空字符串 `""` 表示用户主动选择了“除典籍外”或“不限”。实现 `resetEquipmentView()`，统一清空搜索词、分类、主属性、副属性、排序属性和档位，并将 `activated` 设为 `false`：

```js
function resetEquipmentView() {
  state.search = "";
  state.category = null;
  state.main = null;
  state.filters = [];
  state.sortAttr = null;
  state.valueSource = "max";
  state.activated = false;
  el.search.value = "";
  apply();
}
```

在 `switchPartition(name)` 中，当 `name === "equipment"` 时调用该函数。初始化完成时也保持待筛选状态，不把空分类解释成已点击“除典籍外”。

- [ ] **Step 2: 只在有效交互后激活查询**

搜索输入、分类按钮、主属性按钮、副属性按钮和排序按钮的事件中，根据当前条件设置 `state.activated`。搜索被删空且其他条件均未选择时恢复 `false`；点击任何分类或主属性按钮均视为主动筛选，包括值为空的“除典籍外/不限”按钮。

```js
function hasEquipmentConditions() {
  return state.search.trim() !== "" || state.category !== null ||
    state.main !== null || state.filters.length > 0;
}
```

分类或主属性按钮点击后把按钮值写入状态；即使该值是空字符串，`hasEquipmentConditions()` 也会因为它不再是 `null` 而保持激活。调用查询模块时把 `null` 转成空字符串，以复用既有“不限/除典籍外”匹配规则。清除按钮改为调用 `resetEquipmentView()`。

- [ ] **Step 3: 待筛选时隐藏所有结果状态**

在 `apply()` 内先渲染控件，再按 `state.activated` 分支：

```js
if (!state.activated) {
  el.results.hidden = true;
  el.empty.hidden = true;
  el.count.textContent = "等待筛选";
  return;
}
```

已激活时沿用现有查询、结果数量和空结果提示逻辑。

`renderControls()` 只有在 `state.category !== null` 或 `state.main !== null` 时才比较按钮值并添加 `active`，保证初始状态没有任何按钮高亮。

- [ ] **Step 4: 统一装备名称品质输出**

新增一个不依赖展示容器的品质判断与渲染函数：

```js
function equipmentNameHtml(item) {
  const purple = item.bookGroup === "初始紫色典籍";
  return `<span class="equipment-name-badge ${purple ? "equipment-name-purple" : "equipment-name-orange"}">${escapeHtml(item.name)}</span>`;
}
```

桌面表格 `td.name` 和卡片 `.card-head` 均调用该函数。不要改变分类、主属性和排序值的输出。

- [ ] **Step 5: 调整典籍属性 HTML 结构**

让 `tokenHtml()` 接受可选连接符；普通装备继续使用“+”，典籍阶次传空连接符并给词条加独立容器：

```js
function tokenHtml(tokens, separator) {
  const joiner = separator === undefined
    ? '<span class="plus"> + </span>'
    : separator;
  return tokens.map(renderToken).join(joiner);
}

function bookStageHtml(item, tier) {
  // ...
  return `<div class="book-stage-row">
    <span class="book-stage-label">${stage.stage}阶</span>
    <span class="book-stage-values">${tokenHtml(stage.tokens, "")}</span>
  </div>`;
}
```

确保数据中的原始属性文本不被改写，仅去掉界面的属性间连接符。

- [ ] **Step 6: 实现品质徽章与紧凑对齐样式**

在 `css/style.css` 中增加：

```css
.equipment-name-badge {
  display: inline-block;
  padding: 4px 10px;
  border: 2px solid currentColor;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  white-space: nowrap;
}
.equipment-name-purple { background: #7030a0; border-color: #7030a0; }
.equipment-name-orange { background: #f79646; border-color: #f79646; }
.book-stage-row { grid-template-columns: max-content minmax(0, max-content); justify-content: center; column-gap: 6px; }
.book-stage-label { padding: 0 2px; border-right: 0; }
.book-stage-values { display: flex; flex-direction: column; align-items: flex-start; padding: 5px 2px; }
.book-stage-values .tier-attr,
.book-stage-values .tier-status { display: block; text-align: left; }
```

保留各阶次分隔线及普通装备样式。

- [ ] **Step 7: 提交装备属性改动**

```powershell
git add -- js/app.js css/style.css
git commit -m "feat: refine equipment results interaction"
```

---

### Task 2: 图鉴汇总所需装备全端默认折叠

**Files:**
- Modify: `css/style.css:591-600, 915-922`
- Review only: `js/app.js:288-299, 370-390`

**Interfaces:**
- Consumes: 现有 `.atlas-summary-equipment-toggle` 点击事件与 `.atlas-summary-equipment.is-expanded` 状态。
- Produces: 桌面与移动端一致的汇总折叠表现；无需新增存储状态。

- [ ] **Step 1: 将折叠基础样式移出移动端媒体查询**

把当前只在移动端生效的三条规则提升到全局：

```css
.atlas-summary-equipment-toggle { display: inline-flex; margin: 2px 0 4px; }
.atlas-summary-equipment { display: none; }
.atlas-summary-equipment.is-expanded { display: block; }
```

删除或收敛媒体查询中的重复规则，避免桌面规则被覆盖。没有所需装备时 HTML 本身不输出按钮，保持现有逻辑。

- [ ] **Step 2: 核对现有重新渲染即复位机制**

保留 `atlasUpgradeSummaryHtml()` 每次输出 `aria-expanded="false"` 且不带 `is-expanded` 的行为。`applyAtlas()` 在页签、搜索、等级范围和目标等级变化时重建汇总，因此天然恢复折叠；不要为此增加持久化变量。

- [ ] **Step 3: 提交图鉴折叠改动**

```powershell
git add -- css/style.css
git commit -m "feat: collapse atlas summary equipment by default"
```

---

### Task 3: 橙装锻造查询顺序与个人进度弟子搜索

**Files:**
- Modify: `index.html:197-245`
- Modify: `js/progress.js:105-175`
- Modify: `js/app.js:445-475, 675-745`
- Modify: `css/style.css:458-480`

**Interfaces:**
- Consumes: `PROGRESS.normalizeSearch` 的内部规则、`progState.disciples` 保存顺序、`progState.page` 分页约定（0 为汇总，弟子索引为 `page - 1`）。
- Produces: `PROGRESS.searchDisciples(disciples, keyword): Array<{ disciple, index, exact }>`、`openProgressDisciple(index)`、可点击的 `[data-prog-disciple-index]`。

- [ ] **Step 1: 重排橙装锻造查询 DOM**

在 `#forge-query` 中按以下顺序放置现有节点，不改节点 `id`：

```html
<section class="panel">查找方式……</section>
<div id="forge-results"></div>
<div class="summary-card">锻造材料总览（四大类通用）……</div>
```

这样既有事件绑定无需改变，查询结果位于查找方式和总览之间。

- [ ] **Step 2: 更新个人进度搜索文案**

将标签改为“搜索”，输入提示改为“搜索已保存弟子、弟子持有装备或尚未完成的锻造材料…”，说明文字明确材料需求仍只统计未完成阶段。

- [ ] **Step 3: 在纯逻辑模块增加弟子匹配**

在 `js/progress.js` 增加并导出：

```js
function searchDisciples(disciples, keyword) {
  var q = normalizeSearch(keyword);
  if (!q) return [];
  return (Array.isArray(disciples) ? disciples : []).map(function (disciple, index) {
    var name = normalizeSearch(disciple && disciple.name);
    return { disciple: disciple, index: index, exact: name === q, matched: name.indexOf(q) !== -1 };
  }).filter(function (entry) {
    return entry.disciple && entry.matched;
  }).map(function (entry) {
    return { disciple: entry.disciple, index: entry.index, exact: entry.exact };
  });
}
```

返回顺序即保存顺序；不修改 `searchEquipment()` 的输出结构。

- [ ] **Step 4: 封装弟子分页跳转**

在 `js/app.js` 增加：

```js
function openProgressDisciple(index) {
  progState.query = "";
  el.progSearch.value = "";
  progState.page = index + 1;
  renderProgress();
}
```

搜索输入事件先调用 `PROG.searchDisciples()`。若存在 `exact === true` 的结果，立即调用 `openProgressDisciple(exact.index)` 并结束本次处理；否则保存查询词并渲染组合结果。

- [ ] **Step 5: 渲染部分匹配弟子并支持点击跳转**

在 `renderProgressSearch()` 中同时取得弟子结果和装备结果。弟子结果非空时，先输出：

```html
<section class="prog-search-section prog-disciple-results">
  <h3 class="drop-title">匹配弟子<span class="drop-count">N 名</span></h3>
  <div class="prog-disciple-matches">
    <button type="button" class="seg" data-prog-disciple-index="0">田虎</button>
  </div>
</section>
```

装备结果仍按“弟子直接持有”“尚未完成的锻造材料需求”原样追加。三类均为空时显示“未找到匹配的弟子或装备”。

在 `el.progSearchResults` 上增加点击委托，读取 `data-prog-disciple-index` 并调用 `openProgressDisciple()`。

- [ ] **Step 6: 增加弟子匹配区域样式**

```css
.prog-disciple-matches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
```

沿用现有 `.seg`、`.prog-search-section` 视觉体系，不新增新的颜色含义。

- [ ] **Step 7: 提交橙装锻造改动**

```powershell
git add -- index.html js/progress.js js/app.js css/style.css
git commit -m "feat: add disciple progress search navigation"
```

---

### Task 4: 交付说明与用户手动验证清单

**Files:**
- Review: `docs/superpowers/specs/2026-08-12-equipment-atlas-forging-interactions-design.md`
- Review: 本计划前三个任务修改的文件

**Interfaces:**
- Consumes: 三个已完成的独立交付单元。
- Produces: 不宣称未经用户验证的交付说明和精确手动检查点。

- [ ] **Step 1: 检查 Git 改动范围，不运行项目验证流程**

只用 `git status --short` 和 `git diff --stat` 确认没有无关文件进入改动；按照项目规则，不主动运行测试、lint、格式检查或浏览器验收。

- [ ] **Step 2: 向用户列出手动验证重点**

交付说明必须覆盖：

- 装备属性反复进入时的重置与隐藏。
- 四类触发方式和清除条件。
- 四种装备来源的名称品质颜色。
- 典籍阶次紧凑排版和属性间无“+”。
- 五个图鉴页签的默认折叠、展开与条件变化复位。
- 橙装锻造查询区的新顺序。
- 弟子全名直接跳转、部分姓名结果点击、装备名搜索和空结果提示。
- 明确说明功能结果等待用户手动验证。
