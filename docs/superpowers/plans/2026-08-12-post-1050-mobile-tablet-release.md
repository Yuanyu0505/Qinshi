# 今日 10:50 后功能的手机与平板适配发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将今日 10:50 后已经进入桌面网页的最新功能完整适配到手机横竖屏和平板横竖屏，并发布到 GitHub Pages。

**Architecture:** 保留现有单页静态站、数据结构和桌面布局，只在 `js/app.js` 的移动卡片渲染中增加典籍折叠结构，并在 `css/style.css` 中按手机、手机横屏和平板断点补充响应式规则。发布前统一提升 PWA 缓存版本，最终把本地 `master` 推送到 `origin/main`，由现有 GitHub Pages workflow 部署。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Service Worker、Web App Manifest、GitHub Actions / GitHub Pages

## Global Constraints

- 覆盖手机竖屏、手机横屏、平板竖屏、平板横屏；桌面网页端现有布局不改变。
- 今日 10:50 后的功能必须全部保留：动态分区标题、工具名 `Qin`、典籍/神兵典籍、全区“技免”、装备属性默认空结果、图鉴汇总默认折叠、橙装查询区位置与弟子搜索。
- 装备属性分区在所有端每次进入时仍重置为未筛选、无结果，只有用户主动筛选或搜索后展示内容。
- 手机端典籍采用“一件典籍一张卡片、档次可多开折叠”；默认展开当前取值档位，选择“最高”或未指定档位时展开该典籍实际存在的最高档位。
- 平板端典籍保留完整表格，表格在结果容器内部横向滚动，分类、装备名、主属性三列保持可识别且不能发生内容穿透。
- 不改动本地保存格式、生成数据、工作簿 `秦时相关（更新贯侯钟离昧）20260618.xlsx`、未跟踪的 `答题.jpg` 或其他既有分区业务逻辑。
- 按项目约定，不主动执行测试、lint 或浏览器验收；完成后列出用户需手动验证的重点，不宣称未经用户验收的结果已经通过。
- PWA 版本统一从 `1.0.5` 提升到 `1.0.6`，确保已安装设备能够取得新缓存。

---

### Task 1: 手机端典籍折叠卡片

**Files:**
- Modify: `js/app.js:1037-1096`
- Modify: `css/style.css:780-850`

**Interfaces:**
- Consumes: `state.valueSource`、`Q.TIER_ORDER`、`item.bookGroup`、`item.stages[tier]`、现有 `bookStageHtml(item, tier)`。
- Produces: `bookDisplayTiers(item)`、`defaultBookCardTier(item, tiers)`、`bookCardTiersHtml(item)`；`renderCards(items)` 使用这些函数输出可多开的 `<details>`。

- [ ] **Step 1: 增加典籍实际档位与默认展开档位计算**

在 `bookStageHtml()` 后加入以下纯函数；只返回典籍真实存在的档位，初始紫色典籍额外包含“紫色”，并把“最高/无指定”解析成实际最高档：

```js
  function bookDisplayTiers(item) {
    const tiers = item.bookGroup === "初始紫色典籍"
      ? ["紫色"].concat(Q.TIER_ORDER)
      : Q.TIER_ORDER.slice();
    return tiers.filter((tier) => Array.isArray(item.stages && item.stages[tier]) && item.stages[tier].length);
  }

  function defaultBookCardTier(item, tiers) {
    if (state.valueSource !== "max" && tiers.includes(state.valueSource)) return state.valueSource;
    return tiers[tiers.length - 1] || "";
  }
```

- [ ] **Step 2: 输出可同时展开多个档位的典籍卡片内容**

增加 `bookCardTiersHtml()`。使用原生 `<details>` 保持多开能力；只给默认档位加 `open`，并复用现有阶段属性渲染：

```js
  function bookCardTiersHtml(item) {
    const tiers = bookDisplayTiers(item);
    const defaultTier = defaultBookCardTier(item, tiers);
    return tiers.map((tier) => `<details class="book-card-tier"${tier === defaultTier ? " open" : ""}>
      <summary>${tier}</summary>
      <div class="book-card-stage-content">${bookStageHtml(item, tier)}</div>
    </details>`).join("");
  }
```

- [ ] **Step 3: 让移动卡片按装备类型选择渲染结构**

修改 `renderCards(items)`：典籍卡片增加 `book-card` 类并调用 `bookCardTiersHtml(item)`；普通武器、防具、饰品继续使用原有 `.card-tier`，不得改变桌面表格路径：

```js
  function renderCards(items) {
    const hasFilter = state.filters.length > 0;
    el.cards.innerHTML = items.map((item) => {
      const badge = hasFilter ? sortBadge(item) : "";
      const tierHtml = item.bookGroup
        ? bookCardTiersHtml(item)
        : Q.TIER_ORDER.map((tier) => `<div class="card-tier"><span class="tier-label">${tier}</span>${tokenHtml(item.tiers[tier])}</div>`).join("");

      return `<div class="card${item.bookGroup ? " book-card" : ""}">
        <div class="card-head">
          <span class="cat">${item.cat}</span>
          ${equipmentNameHtml(item)}
          ${badge ? `<span class="badge">${badge}</span>` : ""}
        </div>
        <div class="card-main">主属性：<b>${item.main}</b></div>
        ${tierHtml}
      </div>`;
    }).join("");
  }
```

- [ ] **Step 4: 增加手机典籍折叠样式**

在卡片样式附近加入以下规则，确保档次标题紧凑、阶段标签和属性左对齐、展开内容不横向溢出：

```css
.book-card-tier { border-top: 1px dashed rgba(58, 49, 37, .6); }
.book-card-tier summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 7px 2px;
  color: var(--gold);
  font-weight: 700;
  cursor: pointer;
}
.book-card-tier summary::after { content: "展开"; color: var(--muted); font-size: 12px; font-weight: 400; }
.book-card-tier[open] summary::after { content: "收起"; }
.book-card-stage-content { min-width: 0; padding-bottom: 5px; }
.book-card .book-stage-list { height: auto; min-height: 0; }
.book-card .book-stage-row { grid-template-columns: 38px minmax(0, 1fr); justify-content: stretch; }
.book-card .book-stage-values { width: auto; min-width: 0; }
.book-card .book-stage-values .tier-attr,
.book-card .book-stage-values .tier-status { white-space: normal; overflow-wrap: anywhere; }
```

- [ ] **Step 5: 复核本任务改动范围并提交**

仅查看 `git diff -- js/app.js css/style.css`，确认普通装备卡片和桌面 `equipmentTableHtml()` 未被改写，然后提交：

```powershell
git add -- js/app.js css/style.css
git commit -m "feat: adapt book cards for mobile screens"
```

### Task 2: 平板典籍表格与四方向滚动收口

**Files:**
- Modify: `css/style.css:731-815`
- Modify: `css/style.css:913-996`

**Interfaces:**
- Consumes: `.equipment-table-groups`、`.equipment-result-group`、`.book-equipment-table` 的现有 74px / 116px / 118px 前三列宽度。
- Produces: 仅在 768–1024px 平板断点内生效的内部滚动和前三列冻结规则。

- [ ] **Step 1: 隔离装备属性结果表格的滚动绘制层**

在 768–1024px 平板媒体查询中加入：

```css
  #partition-equipment .equipment-table-groups,
  #partition-equipment .equipment-result-group { min-width: 0; }
  #partition-equipment .equipment-result-group .table-wrap {
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    isolation: isolate;
  }
  #partition-equipment .book-equipment-table {
    border-collapse: separate;
    border-spacing: 0;
  }
```

- [ ] **Step 2: 在平板端冻结分类、装备名、主属性三列**

使用现有列宽计算 `left`，给表头更高层级并给第三列加遮挡阴影：

```css
  #partition-equipment .book-equipment-table tr > :nth-child(1) { position: sticky; left: 0; z-index: 2; }
  #partition-equipment .book-equipment-table tr > :nth-child(2) { position: sticky; left: 74px; z-index: 2; }
  #partition-equipment .book-equipment-table tr > :nth-child(3) {
    position: sticky;
    left: 190px;
    z-index: 2;
    box-shadow: 9px 0 12px -11px #000, 1px 0 0 var(--line);
  }
  #partition-equipment .book-equipment-table tbody tr > :nth-child(-n+3) {
    background-color: #191611;
    background-clip: padding-box;
  }
  #partition-equipment .book-equipment-table thead tr > :nth-child(-n+3) {
    z-index: 4;
    background-color: #221d16;
  }
```

- [ ] **Step 3: 处理表格纵向查看时的表头层级**

保持表头 `top: 0`，但限定在滚动容器内；前三列表头 `z-index: 5`，避免阶段属性滚动到左侧固定列上方：

```css
  #partition-equipment .book-equipment-table thead th { position: sticky; top: 0; z-index: 3; }
  #partition-equipment .book-equipment-table thead th:nth-child(-n+3) { z-index: 5; }
```

- [ ] **Step 4: 保持非典籍装备与手机渲染边界**

确认上述选择器只指向 `.book-equipment-table`；普通装备表格不增加不存在的“紫色”列，手机端继续隐藏 `#partition-equipment #table-wrap`。

- [ ] **Step 5: 复核本任务改动范围并提交**

仅查看 `git diff -- css/style.css`，确认规则位于平板媒体查询内，然后提交：

```powershell
git add -- css/style.css
git commit -m "fix: contain equipment tables on tablets"
```

### Task 3: 手机横屏与跨分区响应式收口

**Files:**
- Modify: `css/style.css:449-596`
- Modify: `css/style.css:913-1100`

**Interfaces:**
- Consumes: 现有手机底部导航、图鉴 `.atlas-summary-equipment-*`、橙装 `.prog-*` / `.forge-*`、铭文 `.ins-*` 响应式规则。
- Produces: 手机横屏识别条件、两列弟子材料汇总、窄屏自动换行以及已有表格固定列的遮挡修正。

- [ ] **Step 1: 把现有手机规则扩展到常见手机横屏**

将手机媒体查询入口从：

```css
@media (max-width: 767px) {
```

改为：

```css
@media (max-width: 767px),
       (max-width: 932px) and (max-height: 500px) and (orientation: landscape) {
```

这样手机横屏继续使用底部导航与卡片布局，平板横屏仍使用左侧导航和表格布局。

- [ ] **Step 2: 防止后置桌面卡片规则覆盖手机横屏**

在文件末尾追加高优先级手机横屏覆盖：

```css
@media (min-width: 768px) and (max-width: 932px) and (max-height: 500px) and (orientation: landscape) {
  #partition-equipment #table-wrap { display: none; }
  #partition-equipment .cards { display: block; }
}
```

- [ ] **Step 3: 收紧手机横屏的固定导航与安全留白**

在同一横屏查询内加入较短的导航高度与内容底部空间，避免遮挡：

```css
  .wrap { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
  .tabs { padding-top: 4px; padding-bottom: calc(4px + env(safe-area-inset-bottom)); }
  .tab { min-height: 38px; }
  .mobile-more-layer { padding-bottom: calc(62px + env(safe-area-inset-bottom)); }
```

- [ ] **Step 4: 收口图鉴折叠内容和装备徽章换行**

在手机规则内补充：

```css
  .atlas-summary-equipment-list,
  .atlas-equipment-stage-list { max-width: 100%; gap: 6px; }
  .atlas-summary-equipment-list > *,
  .atlas-equipment-stage-list > *,
  .equipment-name-badge { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
```

不得改动 `.atlas-summary-equipment` 默认 `display: none` 与 `.is-expanded` 的展开逻辑。

- [ ] **Step 5: 收口橙装个人进度与搜索结果**

在手机规则内保证个人材料为两列，搜索结果、弟子卡片和阶段材料不会把页面撑宽：

```css
  .prog-material-grid,
  .prog-material-grid-overall { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .prog-search-section,
  .prog-search-relation,
  .prog-disciple,
  .prog-equipment { min-width: 0; max-width: 100%; }
  .prog-search-hits,
  .prog-stage-materials { max-width: 100%; overflow-wrap: anywhere; }
```

保持“查询分区位于锻造材料总览上方”、搜索弟子跳页和“搜索”文案不变。

- [ ] **Step 6: 修正平板固定首列的遮挡背景**

在 `@media (max-width: 1024px)` 现有橙装/铭文固定列规则中，补充 `isolation: isolate`、不透明背景与更明确的右边界；只覆盖素材装备、四大类通用和铭文资料表，主锻造装备表仍不冻结：

```css
  #partition-forging .forge-scroll-material,
  #inscription-reference .table-wrap { isolation: isolate; }
  #partition-forging .summary-table tr > :first-child,
  #partition-forging .forge-scroll-material .forge-h-table tr > :first-child,
  #inscription-reference .ins-reference-table tr > :first-child {
    background-color: #191611;
    background-clip: padding-box;
    box-shadow: 10px 0 12px -11px #000, 1px 0 0 var(--line);
  }
```

- [ ] **Step 7: 收口铭文与其他分区的长词条**

在手机和平板断点内让铭文副属性、“技免”和其余结果卡片允许正常换行；不改变筛选逻辑、个人进度和资料表数据：

```css
  .ins-query-substats,
  .ins-saved-substats,
  .ins-reference-table td,
  .answer-card,
  .drop-item { min-width: 0; overflow-wrap: anywhere; }
```

- [ ] **Step 8: 复核本任务改动范围并提交**

仅查看 `git diff -- css/style.css`，确认没有新增桌面基础规则或修改分区数据，然后提交：

```powershell
git add -- css/style.css
git commit -m "fix: refine responsive layouts across partitions"
```

### Task 4: PWA 缓存升级与离线更新

**Files:**
- Modify: `index.html:299`
- Modify: `js/pwa.js:4`
- Modify: `service-worker.js:4`

**Interfaces:**
- Consumes: 当前 `APP_VERSION`、页面版本展示和 `CACHE_NAME`。
- Produces: 全部统一为 `1.0.6`，Service Worker 激活后清理旧 `qinshi-site-*` 缓存。

- [ ] **Step 1: 更新页面展示版本**

把：

```html
<strong id="pwa-version">1.0.5</strong>
```

改为：

```html
<strong id="pwa-version">1.0.6</strong>
```

- [ ] **Step 2: 更新前端 PWA 版本常量**

把 `js/pwa.js` 中：

```js
var APP_VERSION = "1.0.5";
```

改为：

```js
var APP_VERSION = "1.0.6";
```

- [ ] **Step 3: 更新 Service Worker 缓存名**

把 `service-worker.js` 中：

```js
const CACHE_NAME = CACHE_PREFIX + "1.0.5";
```

改为：

```js
const CACHE_NAME = CACHE_PREFIX + "1.0.6";
```

保持 `CACHE_PREFIX`、预缓存文件列表和旧缓存清理逻辑不变。

- [ ] **Step 4: 复核三个版本号完全一致并提交**

只用文本搜索确认 `index.html`、`js/pwa.js`、`service-worker.js` 中均为 `1.0.6`，不启动浏览器或测试，然后提交：

```powershell
git add -- index.html js/pwa.js service-worker.js
git commit -m "chore: bump Qin PWA cache to 1.0.6"
```

### Task 5: 合并并发布到 GitHub Pages

**Files:**
- No source file changes
- Existing deployment workflow: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: 已完成的适配分支、本地 `master`、远程 `origin/main`。
- Produces: `origin/main` 上的最新静态站提交，以及由现有 workflow 触发的 GitHub Pages 部署。

- [ ] **Step 1: 检查待发布提交与本地保留文件**

查看 `git status --short` 和 `git log --oneline origin/main..HEAD`；确认工作簿修改和 `答题.jpg` 仍未暂存，适配提交中只包含源代码、文档和 PWA 文件。

- [ ] **Step 2: 将适配分支快进合并回本地 master**

回到主工作区后使用非破坏性的 fast-forward 合并：

```powershell
git merge --ff-only <adaptation-branch>
```

若无法 fast-forward，停止并报告实际分叉，不使用 `reset --hard`、`checkout --` 或删除本地文件。

- [ ] **Step 3: 推送本地 master 到远程 main**

使用用户已确认的发布目标：

```powershell
git push origin master:main
```

该操作会触发 `.github/workflows/pages.yml`；不得推送工作簿修改和未跟踪图片。

- [ ] **Step 4: 报告发布范围与用户手动验收清单**

最终交付必须明确：

- 已推送的分支与提交；
- GitHub Pages 地址；
- PWA 更新到 `1.0.6`，已安装设备可能需要打开一次应用、等待更新提示后刷新；
- 建议用户分别手动检查手机竖屏、手机横屏、平板竖屏、平板横屏；
- 重点检查典籍折叠默认档位和多开、平板前三列冻结无穿透、图鉴默认折叠、橙装个人进度两列、铭文资料表滚动；
- 按项目约定，本次未由 AI 主动执行测试、lint 或浏览器手动验收。
