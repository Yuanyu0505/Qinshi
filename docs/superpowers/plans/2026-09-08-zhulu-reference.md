# 逐鹿资料分区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增只读“逐鹿”资料分区，支持进度奖励定位、赛季典籍组合筛选、十个月循环预测和跨分区临时查询。

**Architecture:** 工作簿派生数据存放在独立数据模块，纯查询、预测和跳转会话规则存放在无界面核心模块，页面渲染与交互存放在独立界面模块。现有 `js/app.js` 仅负责顶层分区切换，以及与图鉴、橙装锻造既有状态的桥接。

**Tech Stack:** 静态 HTML、CSS、浏览器原生 JavaScript、Python/openpyxl 数据提取、Node.js 内置测试运行器、Service Worker。

**Spec:** `docs/superpowers/specs/2026-09-08-zhulu-reference-design.md`

## Global Constraints

- 顶层名称固定为“逐鹿”，位置固定在“楼兰棋阵”之后、“答题”之前。
- 只读取源工作簿“逐鹿”工作表 I～S 列；原始工作簿和其他资料文件不得加入提交。
- 逐鹿分区不得读写 `localStorage`、`sessionStorage` 或进度备份结构。
- 明确赛季资料覆盖预测；预测仅从 2027 年 1 月开始，并必须显示“预测”。
- “伍德终始”只在派生数据中规范为“五德终始”，不得修改源工作簿。
- 手机和平板端不得依赖横向滑动查看逐鹿资料。
- 按项目约定，实施代理只编写测试与列出命令，不主动运行验证；测试由用户手动执行。
- 正式集成时将 PWA 版本从 `1.0.34` 更新为 `1.0.35`，并预缓存全部新增运行时文件。
- 保留当前工作区中与本功能无关的未提交文件和改动。

---

### Task 1: 提取并固化逐鹿资料

**Files:**
- Create: `tools/build_zhulu.py`
- Create: `data/zhulu.js`
- Create: `js/zhulu.test.js`

**Interfaces:**
- Produces: 浏览器全局和 CommonJS 兼容对象 `ZHULU_DATA`。
- `ZHULU_DATA.progressRewards: Array<{progress:number,item:string,quantity:number,seasonTier:number|null}>`
- `ZHULU_DATA.seasonTiers: Array<{progress:number,quality:"紫"|"橙"|"红",yuanbao:number}>`
- `ZHULU_DATA.seasons: Array<{year:number,month:number,rewards:Record<string,string>}>`
- `ZHULU_DATA.meta: {sourceSheet:string,sourceRanges:string[],firstSeason:string,lastSeason:string,predictionAnchor:string,predictionCycleLength:number}`

- [ ] **Step 1: 编写数据完整性失败测试**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const DATA = require("../data/zhulu.js");

test("逐鹿进度奖励完整覆盖 5 至 2500 的 40 个节点", () => {
  assert.strictEqual(DATA.progressRewards.length, 40);
  assert.deepStrictEqual(DATA.progressRewards[0], {
    progress: 5, item: "烤山鸡", quantity: 5, seasonTier: null
  });
  assert.deepStrictEqual(DATA.progressRewards.at(-1), {
    progress: 2500, item: "紫/橙色典籍2", quantity: 1, seasonTier: 2500
  });
});

test("赛季档位固定映射进度、品质与元宝", () => {
  assert.deepStrictEqual(DATA.seasonTiers, [
    { progress: 1000, quality: "紫", yuanbao: 0 },
    { progress: 1200, quality: "橙", yuanbao: 7000 },
    { progress: 1400, quality: "紫", yuanbao: 0 },
    { progress: 1800, quality: "橙", yuanbao: 7000 },
    { progress: 2200, quality: "红", yuanbao: 20000 },
    { progress: 2500, quality: "橙", yuanbao: 0 }
  ]);
});

test("明确赛季从 2021 年 7 月连续保存到 2026 年 12 月", () => {
  assert.strictEqual(DATA.seasons.length, 66);
  assert.deepStrictEqual([DATA.seasons[0].year, DATA.seasons[0].month], [2021, 7]);
  assert.deepStrictEqual([DATA.seasons.at(-1).year, DATA.seasons.at(-1).month], [2026, 12]);
  assert.strictEqual(DATA.seasons.find((x) => x.year === 2026 && x.month === 9).rewards[2200], "三十六计");
});

test("派生数据统一使用五德终始", () => {
  assert.ok(DATA.seasons.some((season) => Object.values(season.rewards).includes("五德终始")));
  assert.ok(DATA.seasons.every((season) => !Object.values(season.rewards).includes("伍德终始")));
});
```

- [ ] **Step 2: 由用户运行数据测试并确认模块尚未存在**

Run: `node --test js/zhulu.test.js`

Expected: FAIL，错误指出无法加载 `../data/zhulu.js`。

- [ ] **Step 3: 实现只读提取脚本**

`tools/build_zhulu.py` 接受明确参数，不在脚本中写死用户目录：

```python
parser.add_argument("--workbook", required=True)
parser.add_argument("--output", default="data/zhulu.js")
workbook = openpyxl.load_workbook(args.workbook, data_only=True, read_only=True)
sheet = workbook["逐鹿"]
```

读取规则固定为：

```python
progress_rows = range(3, 43)
season_blocks = [range(3, 35), range(39, 51), range(55, 67), range(71, 83)]
tier_columns = {1000: "N", 1200: "O", 1400: "P", 1800: "Q", 2200: "R", 2500: "S"}
```

将 `伍德终始` 替换为 `五德终始`，将名称尾部的 `（紫）`、`（橙）`、`（红）` 从典籍名称中移除，品质只取固定档位映射。脚本不得写回工作簿。

- [ ] **Step 4: 生成静态数据模块**

Run:

```text
python tools/build_zhulu.py --workbook "秦时相关（更新贯侯钟离昧）20260618.xlsx" --output data/zhulu.js
```

模块包装方式与现有数据文件一致：

```js
(function (root, factory) {
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  root.ZHULU_DATA = data;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return { progressRewards: [], seasonTiers: [], seasons: [], meta: {} };
});
```

- [ ] **Step 5: 由用户运行数据完整性测试**

Run: `node --test js/zhulu.test.js`

Expected: 4 项数据测试全部 PASS。

- [ ] **Step 6: 提交数据任务**

```text
git add tools/build_zhulu.py data/zhulu.js js/zhulu.test.js
git commit -m "feat: add zhulu reference data"
```

---

### Task 2: 实现进度定位与赛季预测核心

**Files:**
- Create: `js/zhulu.js`
- Modify: `js/zhulu.test.js`

**Interfaces:**
- Consumes: `ZHULU_DATA`。
- Produces: 浏览器全局和 CommonJS 兼容对象 `ZHULU`。
- `normalizeText(value): string`
- `locateProgressRewards(rewards, query): {mode:"all"|"progress"|"item",items:Array,message:string}`
- `predictSeason(data, year, month): {year:number,month:number,rewards:Record<string,string>,predicted:true}|null`
- `defaultPredictionMonths(data, now, count): Array<Season>`
- `querySeasons(data, filters, now): {explicit:Array,predicted:Array}`
- `groupDefaultSeasons(data, now): {current:Array,upcoming:Array,history:Array,predicted:Array}`
- `createJumpSession(target, zhuluView, targetView, appliedTargetView): JumpSession`
- `shouldRestoreJumpTarget(session, currentTargetView): boolean`

- [ ] **Step 1: 编写进度定位失败测试**

```js
const CORE = require("./zhulu.js");

test("数字查询定位准确节点或前后节点", () => {
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "160").items.map((x) => x.progress), [160]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "150").items.map((x) => x.progress), [140, 160]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "1").items.map((x) => x.progress), [5]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "3000").items.map((x) => x.progress), [2500]);
});

test("道具查询返回全部匹配节点", () => {
  const result = CORE.locateProgressRewards(DATA.progressRewards, "元宝");
  assert.strictEqual(result.mode, "item");
  assert.deepStrictEqual(result.items.map((x) => x.progress), [10, 100, 450, 900]);
});
```

- [ ] **Step 2: 编写预测与筛选失败测试**

```js
test("2027 年预测延续 2024 年 3 月开始的十个月循环", () => {
  const predicted = CORE.predictSeason(DATA, 2027, 1);
  assert.strictEqual(predicted.predicted, true);
  assert.deepStrictEqual(predicted.rewards, DATA.seasons.find((x) => x.year === 2024 && x.month === 7).rewards);
});

test("明确资料优先且预测不回填历史月份", () => {
  assert.strictEqual(CORE.predictSeason(DATA, 2026, 12), null);
  assert.strictEqual(CORE.predictSeason(DATA, 2023, 4), null);
});

test("组合筛选同时约束年月、典籍、品质和进度", () => {
  const result = CORE.querySeasons(DATA, {
    year: 2026, month: null, query: "三十六计", quality: "红", progress: 2200
  }, new Date(2026, 8, 8));
  assert.ok(result.explicit.length > 0);
  assert.ok(result.explicit.every((season) => season.year === 2026));
  assert.ok(result.explicit.every((season) => season.matches.every((item) => item.progress === 2200 && item.quality === "红")));
});
```

- [ ] **Step 3: 编写临时跳转判定失败测试**

```js
test("目标页未改动时恢复旧状态，改动后不恢复", () => {
  const session = CORE.createJumpSession(
    "atlas",
    { tab: "seasons", query: "孟子", scrollY: 320 },
    { query: "韩非子", category: "红色神将" },
    { query: "孟子", category: "全部" }
  );
  assert.strictEqual(CORE.shouldRestoreJumpTarget(session, { query: "孟子", category: "全部" }), true);
  assert.strictEqual(CORE.shouldRestoreJumpTarget(session, { query: "孟子", category: "红色神将" }), false);
});
```

- [ ] **Step 4: 由用户运行核心测试并确认导出尚未存在**

Run: `node --test js/zhulu.test.js`

Expected: FAIL，错误指出无法加载 `./zhulu.js` 或核心函数不存在。

- [ ] **Step 5: 实现进度定位**

数字判断使用完整非负整数：

```js
function isProgressQuery(value) {
  return /^\d+$/.test(String(value || "").trim());
}
```

数字命中返回一个节点；未命中使用有序数组寻找最近的较低与较高节点。关键词匹配使用去空格、小写化和“五德终始”别名规范化。

- [ ] **Step 6: 实现明确月份索引与十个月预测**

```js
function serialMonth(year, month) {
  return Number(year) * 12 + Number(month) - 1;
}

function cycleIndex(year, month) {
  var anchor = serialMonth(2024, 3);
  return ((serialMonth(year, month) - anchor) % 10 + 10) % 10;
}
```

预测模板取 `2024-03` 至 `2024-12` 十条明确记录；目标年月不晚于 `2026-12` 时返回 `null`。查询更远年月时只计算请求月份；默认预测范围由 `defaultPredictionMonths(data, now, 12)` 生成。

- [ ] **Step 7: 实现组合筛选和默认分组**

筛选结果中的每个月包含 `matches`，每项结构固定为：

```js
{
  progress: 2200,
  quality: "红",
  yuanbao: 20000,
  book: "三十六计"
}
```

无筛选时返回当前、后续、历史和预测四组；有筛选时返回明确与预测两组。典籍名称搜索未指定年月时只合并未来 12 个月预测。

- [ ] **Step 8: 实现跳转会话指纹**

对排序后的普通对象做稳定序列化；`shouldRestoreJumpTarget` 仅在当前目标页查询状态与 `appliedTargetView` 完全一致时返回 `true`。指纹不得包含图鉴等级、收藏、库存或橙装实际进度数据，只比较查询视图字段。

- [ ] **Step 9: 由用户运行核心测试**

Run: `node --test js/zhulu.test.js`

Expected: 数据、定位、预测、筛选和跳转会话测试全部 PASS。

- [ ] **Step 10: 提交核心任务**

```text
git add js/zhulu.js js/zhulu.test.js
git commit -m "feat: query and predict zhulu seasons"
```

---

### Task 3: 构建逐鹿分区界面与响应式布局

**Files:**
- Modify: `index.html`
- Create: `js/zhulu-ui.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `window.ZHULU_DATA`、`window.ZHULU`、`window.UI_PERFORMANCE`。
- Produces: `window.ZHULU_UI.init()`、`captureView()`、`restoreView(view)`、`showError(message)`。
- Emits: `qinshi:zhulu-navigate`，`detail` 为 `{target:"forging-progress"|"atlas",bookName:string,zhuluView:object}`。

- [ ] **Step 1: 编写首页资源与结构失败测试**

在 `serve.test.js` 增加：

```js
test("首页提供逐鹿分区及数据、核心和界面脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-zhulu"/);
    assert.match(page.body, /data-partition="zhulu">逐鹿</);
    assert.match(page.body, /<script src="data\/zhulu\.js"><\/script>/);
    assert.match(page.body, /<script src="js\/zhulu\.js"><\/script>/);
    assert.match(page.body, /<script src="js\/zhulu-ui\.js"><\/script>/);
  });
});
```

- [ ] **Step 2: 由用户运行结构测试并确认失败**

Run: `node --test serve.test.js`

Expected: FAIL，首页尚无 `partition-zhulu`。

- [ ] **Step 3: 在首页挂载导航和分区骨架**

在桌面导航和手机“更多”菜单中，将按钮插入楼兰棋阵之后、答题之前：

```html
<button type="button" class="tab mobile-secondary" data-partition="zhulu">逐鹿</button>
```

分区骨架包含以下稳定标识：

```html
<section id="partition-zhulu" hidden>
  <div id="zhulu-tabs" class="segs" aria-label="逐鹿资料类型">…</div>
  <section id="zhulu-progress-view">…</section>
  <section id="zhulu-season-view" hidden>…</section>
  <div id="zhulu-action-menu" role="dialog" hidden>…</div>
  <div id="zhulu-error" class="error" hidden></div>
</section>
```

脚本顺序固定为数据、核心、界面，并在 `ui-performance.js` 之后加载界面脚本。

- [ ] **Step 4: 实现界面状态与按需渲染**

界面状态固定为：

```js
var state = {
  tab: "progress",
  progressQuery: "",
  seasonFilters: { year: null, month: null, query: "", quality: null, progress: null },
  progressScrollY: 0,
  seasonScrollY: 0
};
```

首次激活分区才渲染；搜索输入通过 `UI_PERFORMANCE.createRefreshQueue` 合并连续刷新；筛选和结果点击使用事件委托。

- [ ] **Step 5: 实现进度奖励界面**

- 空查询渲染 40 行完整表。
- 数字查询渲染定位节点和边界提示。
- 道具查询渲染全部包含匹配项。
- 六个典籍节点使用 `data-zhulu-tier-link="进度"`，点击切换赛季页并写入进度筛选。

- [ ] **Step 6: 实现赛季筛选与结果分组**

- 年、月使用原生下拉框；品质和进度使用现有分段按钮样式；典籍使用搜索框。
- 无筛选显示“当前赛季／后续赛季／历史赛季／未来预测”。
- 有筛选显示“明确资料／预测资料”。
- 每档奖励显示进度、典籍品质底色、元宝消耗；0 元宝显示“无需元宝”。
- 典籍名称按钮使用 `data-zhulu-book="典籍名"` 打开三项操作菜单。

- [ ] **Step 7: 实现操作菜单**

- “查看出现赛季”在当前页面写入典籍名称筛选。
- 另外两项派发 `qinshi:zhulu-navigate`。
- 菜单支持点击外部、Escape 和关闭按钮关闭；焦点返回触发菜单的典籍名称。

- [ ] **Step 8: 实现三端样式**

- 大于 1024 像素：赛季一行六档，使用等宽网格，不产生外层横向滚动。
- 641～1024 像素：月份卡片，六档使用三列两行。
- 不大于 640 像素：月份卡片，六档使用两列三行；极窄宽度降为单列。
- 进度奖励在不大于 1024 像素时改为卡片，不显示桌面表头。
- 品质底色复用现有典籍名称颜色变量，不新建冲突色板。

- [ ] **Step 9: 由用户运行结构测试并手动检查布局**

Run: `node --test serve.test.js`

Expected: 首页结构与资源断言 PASS。

Manual:

- 电脑端确认六档同一行；
- 平板端确认三列两行；
- 手机端确认两列三行且页面没有横向滚动；
- 确认当前、后续、历史、预测标签清晰可辨。

- [ ] **Step 10: 提交界面任务**

```text
git add index.html js/zhulu-ui.js css/style.css serve.test.js
git commit -m "feat: add responsive zhulu reference interface"
```

---

### Task 4: 接入图鉴与橙装锻造临时跳转

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `js/zhulu.test.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `qinshi:zhulu-navigate`、`ZHULU_UI.captureView()`、`ZHULU.shouldRestoreJumpTarget()`。
- Produces: 两个返回容器 `#zhulu-atlas-return`、`#zhulu-forging-return`，以及唯一活动会话 `zhuluJumpSession`。

- [ ] **Step 1: 为跳转目标增加返回入口结构测试**

```js
assert.match(page.body, /id="zhulu-atlas-return"/);
assert.match(page.body, /id="zhulu-forging-return"/);
```

- [ ] **Step 2: 由用户运行测试并确认返回入口缺失**

Run: `node --test serve.test.js`

Expected: FAIL，两个返回容器尚不存在。

- [ ] **Step 3: 实现图鉴查询视图快照**

在 `js/app.js` 增加 `captureAtlasQueryView()` 与 `restoreAtlasQueryView(view)`。快照只包含：

```js
{
  activated, tab, query, searchField, levelMin, levelMax,
  favoriteType, soulFilter, equipmentFilter, noteSources,
  sortField, sortDirection
}
```

不得复制或覆盖图鉴等级、收藏、置顶和库存数据。

- [ ] **Step 4: 实现图鉴临时搜索**

收到 `target: "atlas"` 时：

```js
atlasState.activated = true;
atlasState.tab = "全部";
atlasState.query = bookName;
atlasState.searchField = "all";
atlasState.favoriteType = "all";
atlasState.soulFilter = "all";
atlasState.equipmentFilter = "all";
atlasState.noteSources = [];
atlasState.sortField = "default";
atlasState.sortDirection = "asc";
```

保留等级上下限与目标等级，不修改任何已保存进度。切换到 `atlas` 后调用既有 `applyAtlas()`。

- [ ] **Step 5: 实现橙装锻造个人进度临时搜索**

收到 `target: "forging-progress"` 时：

```js
progState.view = "progress";
progState.page = 0;
progState.query = bookName;
el.progSearch.value = bookName;
```

切换到 `forging` 后调用既有 `applyForgeView()` 和 `applyProgressSearch()`。现有目录搜索按名称包含匹配，因此同一关键词可以同时返回普通版与神兵版；不得自动新增个人进度记录。

- [ ] **Step 6: 实现返回与状态接管判断**

- 跳转时保存逐鹿视图、目标原视图和跳转后视图。
- 目标页顶部显示“返回逐鹿”。
- 点击返回时，用当前目标查询视图与跳转后视图比较；相等则恢复目标原视图，不相等则保留用户当前视图。
- 随后以 `source: "zhulu-return"` 切换回逐鹿，并调用 `ZHULU_UI.restoreView(session.zhuluView)` 恢复滚动位置。
- 用户通过普通导航离开目标分区时清除跳转会话和返回提示。

- [ ] **Step 7: 将逐鹿加入顶层分区注册**

在 `PARTITION_TITLES`、`secondaryPartitions` 和 `parts` 中加入 `zhulu`，标题为“逐鹿”。哈希地址固定为 `#zhulu`，浏览器前进后退沿用现有分区导航机制。

- [ ] **Step 8: 由用户执行跳转手动验收**

Manual:

- 从“三十六计”打开“查看锻造进度”，确认进入个人进度并同时展示可匹配的普通版、神兵版；
- 从“孟子”打开“查看图鉴需求”，确认显示需要孟子的弟子；
- 不修改目标条件时返回，确认目标旧状态恢复；
- 修改目标条件后返回，确认用户新状态保留；
- 确认逐鹿筛选和滚动位置均恢复。

- [ ] **Step 9: 提交跳转任务**

```text
git add index.html js/app.js js/zhulu.test.js serve.test.js
git commit -m "feat: link zhulu books to progress and atlas"
```

---

### Task 5: 完成离线集成与项目说明

**Files:**
- Modify: `service-worker.js`
- Modify: `js/pwa.js`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `HANDOVER.md`
- Modify: `serve.test.js`

**Interfaces:**
- Adds PWA cache entries: `data/zhulu.js`、`js/zhulu.js`、`js/zhulu-ui.js`。
- Sets visible and runtime version to `1.0.35`。

- [ ] **Step 1: 增加 PWA 版本与预缓存失败测试**

```js
test("PWA 1.0.35 离线缓存包含逐鹿资源", () => {
  const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  const pwa = fs.readFileSync(path.join(__dirname, "js", "pwa.js"), "utf8");
  assert.match(worker, /CACHE_NAME = CACHE_PREFIX \+ "1\.0\.35"/);
  assert.match(worker, /\.\/data\/zhulu\.js/);
  assert.match(worker, /\.\/js\/zhulu\.js/);
  assert.match(worker, /\.\/js\/zhulu-ui\.js/);
  assert.match(pwa, /APP_VERSION = "1\.0\.35"/);
});
```

- [ ] **Step 2: 由用户运行发布测试并确认失败**

Run: `node --test serve.test.js`

Expected: FAIL，版本仍为 `1.0.34` 或逐鹿资源尚未进入预缓存。

- [ ] **Step 3: 更新 PWA 版本和预缓存清单**

- `service-worker.js`：缓存名更新为 `qinshi-site-1.0.35`。
- `js/pwa.js`：`APP_VERSION` 更新为 `1.0.35`。
- `index.html`：设置页可见版本更新为 `1.0.35`。
- `service-worker.js`：加入三个逐鹿运行时文件，保持与首页加载路径完全一致。

- [ ] **Step 4: 更新说明文档**

`README.md` 增加逐鹿功能说明：进度节点查询、赛季组合筛选、预测标记、三项典籍跳转和无个人进度。`HANDOVER.md` 增加三个新模块的职责、数据来源范围和测试命令。

- [ ] **Step 5: 由用户运行完整测试**

Run:

```text
node --test js/zhulu.test.js serve.test.js
node --test js/*.test.js serve.test.js
```

Expected: 逐鹿聚焦测试与现有全量测试全部 PASS。

- [ ] **Step 6: 由用户执行三端与离线验收**

Manual:

- 电脑、平板、手机分别检查两个标签页、四类组合筛选和操作菜单；
- 检查 2026 年明确后续赛季与 2027 年预测赛季标识不同；
- 检查任意远期年月按十个月周期即时生成；
- 安装或刷新 PWA 后断网重新打开，确认逐鹿数据、筛选和跳转入口可正常加载；
- 检查浏览器存储，确认没有新增逐鹿进度键。

- [ ] **Step 7: 提交离线集成与文档**

```text
git add service-worker.js js/pwa.js index.html README.md HANDOVER.md serve.test.js
git commit -m "chore: release pwa 1.0.35 with zhulu reference"
```

---

## Self-Review

- 规范中的数据范围、两页结构、组合筛选、当前／后续／历史分组、十个月预测、三项跳转、返回状态和三端布局均有对应任务。
- 文件职责与现有 `data/*`、`js/*`、`*-ui.js` 模式一致，未要求重构其他分区。
- 所有新增接口在首次出现时给出稳定名称和数据结构，后续任务引用保持一致。
- 计划没有要求提交工作簿、截图或其他用户资料。
- 验证命令完整列出，但依照项目约定由用户手动执行。
