# 橙装锻造个人进度装备搜索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在橙装锻造个人进度中增加跨全部弟子的装备模糊搜索，完整展示直接持有关系和未完成阶段的材料需求关系。

**Architecture:** 在 `js/progress.js` 中实现无 DOM 依赖的结构化搜索；`js/app.js` 维护搜索状态并复用现有进度卡片渲染；`index.html` 和 `css/style.css` 提供搜索入口与结果样式。保持现有 `localStorage` 数据格式和分页状态不变。

**Tech Stack:** 原生 HTML、CSS、JavaScript（UMD 模块）、浏览器 `localStorage`。

## Global Constraints

- 不修改 `data/forging.js` 或 Excel 构建脚本。
- 不修改 `qinshi_forging_progress_v1` 的数据结构。
- 材料关系只统计当前进度之后尚未完成的阶段。
- 直接持有的装备即使全部锻造完成也参与搜索。
- 使用模糊匹配；直接持有与材料需求分区展示，不相互去重。
- 清空搜索词后恢复搜索前页码。
- 按 `AGENTS.md`，AI 不运行测试、lint、格式检查或浏览器验证；由用户手动验收。

---

### Task 1: 个人进度结构化搜索

**Files:**
- Modify: `js/progress.js`

**Interfaces:**
- Consumes: `data.items`、`disciples[]`、搜索关键词。
- Produces: `searchEquipment(data, disciples, keyword) -> { owned, required }`。

- [ ] **Step 1: 增加搜索词规范化与安全数组处理**

新增 `normalizeSearch`，把空值转为空字符串、去除首尾空格并转为小写。对缺失的 `disciples`、`items`、`stages` 和 `tokens` 使用空数组，避免异常记录中断搜索。

- [ ] **Step 2: 实现稳定的装备遍历顺序**

对每位弟子的装备副本按以下分类排序，原数组不变；同一分类使用原添加顺序：

```js
var CAT_ORDER = ["武器", "盔甲", "首饰", "典籍"];
```

- [ ] **Step 3: 生成直接持有结果**

每个名称命中的个人装备实例生成：

```js
{
  disciple: disciple,
  progressItem: progressItem,
  item: forgingItemOrNull
}
```

匹配以个人进度中保存的 `progressItem.name` 为准，因此锻造源数据缺失的旧记录仍可被找到。

- [ ] **Step 4: 生成未完成材料需求结果**

找到锻造源数据后，从规范化后的 `progressItem.progress` 开始遍历剩余阶段。材料名称命中时，按当前个人装备实例聚合为一条结果：

```js
{
  disciple: disciple,
  progressItem: progressItem,
  item: forgingItem,
  hits: [
    {
      stageIdx: 3,
      stage: "3-4锻",
      tokens: [{ tokenIdx: 0, token: { n: "非攻", q: "紫" } }]
    }
  ]
}
```

同一阶段多个材料名称命中时聚合在该阶段的 `tokens` 中；已完成阶段不遍历。

- [ ] **Step 5: 导出搜索接口**

在 UMD 返回对象中增加：

```js
searchEquipment: searchEquipment
```

空白关键词返回 `{ owned: [], required: [] }`。

### Task 2: 搜索入口与视觉结构

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Produces DOM: `#prog-search`、`#prog-search-results`。
- Consumed by: Task 3 的 `js/app.js`。

- [ ] **Step 1: 在个人进度顶部增加搜索面板**

放在 `.progress-toolbar` 后、`.prog-pager` 前：

```html
<section class="panel prog-search-panel">
  <div class="filter-row">
    <span class="filter-label">搜索装备</span>
    <input id="prog-search" type="search"
      placeholder="搜索弟子持有装备或尚未完成的锻造材料…"
      autocomplete="off">
  </div>
  <div class="muted-tip">跨全部弟子搜索；材料需求只统计尚未完成的锻造阶段。</div>
</section>
<div id="prog-search-results" hidden></div>
```

- [ ] **Step 2: 增加与现有主题一致的输入样式**

让 `#prog-search` 复用 `#forge-search` 的尺寸、背景、边框和焦点效果；在小屏幕下保持 `width: 100%`。

- [ ] **Step 3: 增加结果关系与命中样式**

新增 `.prog-search-section`、`.prog-search-relation`、`.prog-search-context`、`.prog-search-hits` 和 `.prog-stage.search-hit`。命中阶段使用现有红金强调色，结果容器沿用现有面板和圆角边框。

### Task 3: 搜索状态、渲染与分页切换

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `PROG.searchEquipment(FDATA, progState.disciples, progState.query)`。
- Consumes DOM: `#prog-search`、`#prog-search-results`。
- Produces: 两类完整搜索结果，并复用现有装备进度卡片。

- [ ] **Step 1: 接入 DOM 与状态**

在 `el` 中增加：

```js
progSearch: document.getElementById("prog-search"),
progSearchResults: document.getElementById("prog-search-results")
```

在 `progState` 中增加：

```js
query: ""
```

- [ ] **Step 2: 监听搜索输入**

在 `initProgress()` 中监听 `input`，同步 `progState.query` 并调用 `renderProgress()`。搜索不调用 `saveProgress()`。

- [ ] **Step 3: 扩展装备卡片以支持命中阶段**

把现有签名：

```js
equipmentHtml(d, it)
```

扩展为：

```js
equipmentHtml(d, it, options)
```

`options.hitStageIndexes` 为阶段下标集合；对应阶段按钮增加 `search-hit` 类。未传 `options` 时保持原弟子分页渲染完全不变。

- [ ] **Step 4: 渲染直接持有分区**

每条关系先展示“`弟子名 · 直接持有`”，随后调用 `equipmentHtml(disciple, progressItem)`，完整展示当前进度、下一阶段和剩余阶段。源数据缺失时沿用现有“锻造数据缺失”提示。

- [ ] **Step 5: 渲染材料需求分区**

每条关系展示“`弟子名 · 主装备名需要该材料`”，列出所有命中的阶段、材料名和品质；随后调用：

```js
equipmentHtml(disciple, progressItem, {
  hitStageIndexes: new Set(hits.map(function (hit) { return hit.stageIdx; }))
})
```

从而保留完整主装备进度并突出命中阶段。

- [ ] **Step 6: 切换搜索与原分页界面**

`renderProgress()` 首先规范化 `progState.query`：

- 有关键词：隐藏 `.prog-pager`、`#prog-overall` 和 `#prog-disciples`，显示 `#prog-search-results`；
- 无关键词：隐藏并清空搜索结果，显示 `.prog-pager`，恢复现有汇总/单弟子分页逻辑；
- 切换过程中不修改 `progState.page`。

- [ ] **Step 7: 处理空结果和分区计数**

分区标题分别显示直接持有数量和材料需求关系数量。两类均为空时显示“未找到匹配装备”；单个分区为空时显示该分区的空提示。

### Task 4: 使用说明与交付

**Files:**
- Modify: `README.md`

**Interfaces:**
- Documents: 个人进度全局装备搜索规则。

- [ ] **Step 1: 更新功能说明**

在“橙装锻造”分区说明中加入：个人进度支持跨全部弟子模糊搜索装备，同时显示直接归属和未完成锻造材料需求。

- [ ] **Step 2: 列出用户手动验证重点**

交付说明应请用户检查：直接持有、已完成装备、未完成材料过滤、多阶段合并、跨弟子完整性、清空恢复页码、进度变更后的结果同步，以及桌面/手机布局。

- [ ] **Step 3: 提交实现改动**

```powershell
git add -- js/progress.js index.html css/style.css js/app.js README.md docs/superpowers/plans/2026-08-10-forging-progress-equipment-search.md
git commit -m "feat: search equipment across forging progress"
```
