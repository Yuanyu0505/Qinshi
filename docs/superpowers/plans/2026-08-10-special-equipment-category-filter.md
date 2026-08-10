# 特殊属性装备分类筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为特殊属性装备增加与现有筛选条件可组合的精确分类单选筛选。

**Architecture:** `js/query.js` 负责纯分类匹配并将其纳入现有查询；`js/app.js` 从数据元信息动态生成分类按钮并维护状态；`index.html` 只提供容器。复用现有 `.segs` 和 `.seg` 视觉样式。

**Tech Stack:** 原生 HTML、CSS、JavaScript（UMD 模块）。

## Global Constraints

- 分类来源固定为 `SPECIAL_EQUIPMENT_DATA.meta.categories`，不修改生成数据文件。
- 分类为精确单选，默认不限。
- 分类、名称、主属性和副属性条件使用 AND 组合。
- 保持现有排序和浏览器存储行为不变。
- 按 `AGENTS.md`，AI 不运行测试、lint、格式检查或页面验证；由用户手动验收。

---

### Task 1: 查询核心支持分类条件

**Files:**
- Modify: `js/query.js`

**Interfaces:**
- Produces: `matchCategory(item, category) -> boolean`。
- Extends: `queryItems(items, { category, search, main, filters, sortAttr, valueSource })`。

- [ ] **Step 1: 增加精确分类匹配函数**

在 `matchMain` 附近新增：

```js
function matchCategory(item, category) {
  return category == null || category === "" || item.cat === category;
}
```

- [ ] **Step 2: 将分类纳入查询条件**

在 `queryItems` 读取：

```js
var category = opts.category == null ? "" : opts.category;
```

并让入选条件包含 `matchCategory(items[i], category)`，与现有名称、主属性和副属性匹配取交集。

- [ ] **Step 3: 导出函数**

在返回对象中增加：

```js
matchCategory: matchCategory
```

### Task 2: 分类筛选界面与状态接入

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

**Interfaces:**
- Produces DOM: `#category-filter`。
- Extends state: `state.category`。

- [ ] **Step 1: 增加分类按钮容器**

在“按属性筛选”面板中、主属性行之前增加：

```html
<div class="filter-row">
  <span class="filter-label">装备分类</span>
  <div id="category-filter" class="segs"></div>
</div>
```

- [ ] **Step 2: 增加状态与元素引用**

在 `state` 中新增：

```js
category: ""
```

在 `el` 中新增：

```js
categoryBtns: document.getElementById("category-filter")
```

- [ ] **Step 3: 动态生成按钮**

新增 `renderCategoryButtons()`：先输出“不限”，再遍历 `DATA.meta.categories`。每个按钮使用 `data-category`，空字符串代表不限：

```html
<button type="button" class="seg active" data-category="">不限</button>
```

- [ ] **Step 4: 绑定点击与查询传参**

点击 `button[data-category]` 时更新 `state.category` 并调用 `apply()`。在 `apply()` 调用 `Q.queryItems` 时传入：

```js
category: state.category
```

- [ ] **Step 5: 渲染选中态与清除逻辑**

在 `renderControls()` 中按 `btn.dataset.category === state.category` 切换 `active`。在现有清除函数中设置：

```js
state.category = "";
```

在 `init()` 中、首次 `apply()` 前调用 `renderCategoryButtons()`。

### Task 3: 交付说明与提交

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents: 特殊属性装备支持精确分类筛选。

- [ ] **Step 1: 更新 README 功能说明**

把“特殊属性装备”的说明由“搜索 / 筛选 / 排序”补充为“名称搜索 / 装备分类筛选 / 属性筛选 / 排序”。

- [ ] **Step 2: 提交实现改动**

```powershell
git add -- js/query.js index.html js/app.js README.md docs/superpowers/plans/2026-08-10-special-equipment-category-filter.md
git commit -m "feat: filter special equipment by category"
```
