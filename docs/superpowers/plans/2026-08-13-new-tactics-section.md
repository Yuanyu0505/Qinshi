# New Tactics Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从“新兵法”工作表生成六种兵法数据，并在 Qin 中提供单兵法个人进度、目标资源计算和完整资料查询。

**Architecture:** 使用 `tools/build_tactics.py` 将Excel转换为只读 `data/tactics.js`；`js/tactics.js` 提供无DOM依赖的阶数限制、属性快照和资源计算；`js/tactics-ui.js` 独立负责兵法筛选、localStorage和页面渲染；`js/app.js` 只接入分区导航和动态标题。这样数据解析、业务计算和UI互相隔离，便于以后更新Excel或单独调整布局。

**Tech Stack:** Python 3、openpyxl、原生JavaScript UMD、node:test、HTML、CSS、localStorage、Service Worker/PWA

## Global Constraints

- 数据源固定为 `秦时相关（更新贯侯钟离昧）20260618.xlsx` 的“新兵法”工作表。
- 不修改源Excel，不修改其他分区的数据格式和已有localStorage键。
- 兵法顺序固定为 `风、林、火、山、阴、雷`。
- 兵法0–15阶；真言内部以 `-1` 表示“未激活”。
- 风林火山普通真言最高9阶；极真言在兵法10阶解锁为0阶，兵法15阶对应极5阶。
- 阴雷真言阶数与兵法阶数一一对应。
- 火兵法使用“火之印记”；风兵法6阶防属性使用240；极真言属性按10%逐阶累计。
- 电脑、Android、iPhone和iPad使用同一套功能；兵法位于手机“更多”菜单。
- 所有进阶表现使用箭头，例如 `5→6阶` 和 `未激活→0阶`。
- 项目测试、lint、格式检查和设备验收由用户执行；实施代理只编写测试和列出命令，不主动运行验证命令。

---

## File Map

**Create:**

- `tools/build_tactics.py`：解析六个Excel区域并生成规范化数据。
- `tests/test_build_tactics.py`：验证工作表数据、已确认修正和生成结构。
- `data/tactics.js`：自动生成的浏览器只读数据。
- `js/tactics.js`：无DOM依赖的兵法业务规则与计算。
- `js/tactics.test.js`：业务计算单元测试。
- `js/tactics-ui.js`：兵法个人进度、计算器和资料表UI。

**Modify:**

- `index.html`：新增导航入口、兵法容器及脚本加载。
- `js/app.js`：登记 `tactics` 分区、标题和手机“更多”激活状态。
- `css/style.css`：兵法桌面和移动端布局。
- `service-worker.js`：预缓存兵法资源并将缓存版本提升至 `1.0.7`。
- `js/pwa.js`：显示版本提升至 `1.0.7`。
- `README.md`：补充兵法功能、数据生成和测试命令。
- `HANDOVER.md`：补充兵法数据结构、存储键和维护规则。

**No change required:**

- `js/settings.js` 已自动导出和导入所有以 `qinshi_` 开头的localStorage键，因此新增 `qinshi_tactics_progress_v1` 会自动进入现有备份。

---

### Task 1: 解析“新兵法”并生成浏览器数据

**Files:**

- Create: `tools/build_tactics.py`
- Create: `tests/test_build_tactics.py`
- Create: `data/tactics.js`

**Interfaces:**

- Consumes: “新兵法”工作表的 `B2:P20`、`B24:P42`、`B45:P63`、`B66:P84`、`S2:AD20`、`S24:AD42`。
- Produces: `window.TACTICS_DATA`，包含 `meta.order` 和六个规范化 `items`。

- [ ] **Step 1: 写生成脚本测试**

  在 `tests/test_build_tactics.py` 导入 `parse_sheet`，使用真实工作簿建立以下断言：

```python
class TestBuildTactics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = parse_sheet(XLSX)
        cls.items = {item["id"]: item for item in cls.payload["items"]}

    def test_order_and_rank_continuity(self):
        self.assertEqual(self.payload["meta"]["order"], ["风", "林", "火", "山", "阴", "雷"])
        self.assertEqual(set(self.items), {"wind", "forest", "fire", "mountain", "yin", "thunder"})
        for item in self.items.values():
            self.assertEqual([row["rank"] for row in item["ranks"]], list(range(16)))

    def test_confirmed_source_corrections(self):
        fire = self.items["fire"]
        wind = self.items["wind"]
        self.assertEqual(fire["markName"], "火之印记")
        self.assertIn(
            {"name": "防", "value": 240, "unit": "flat"},
            wind["ranks"][6]["baseAttributes"],
        )

    def test_forest_mantra_mapping(self):
        forest = self.items["forest"]
        ling = next(item for item in forest["mantras"] if item["id"] == "ling")
        extreme = next(item for item in forest["mantras"] if item["id"] == "extreme")
        self.assertEqual(ling["stages"][3], {
            "rank": 3, "tacticRank": 3, "value": 4, "fragments": 70,
        })
        self.assertEqual(extreme["stages"][0], {
            "rank": 0, "tacticRank": 10, "value": 10, "fragments": 50,
        })
        self.assertEqual(extreme["stages"][5], {
            "rank": 5, "tacticRank": 15, "value": 60, "fragments": 250,
        })

    def test_yin_and_thunder_percent_groups(self):
        yin = self.items["yin"]
        thunder = self.items["thunder"]
        self.assertEqual(
            [item["value"] for item in yin["ranks"][0]["baseAttributes"]],
            [10, 10, 10, 10],
        )
        self.assertEqual(yin["mantras"][0]["name"], "殇")
        self.assertEqual(yin["mantras"][0]["materialName"], "殇真言碎片")
        self.assertEqual(thunder["mantras"][0]["name"], "盛")
        self.assertEqual(thunder["mantras"][0]["materialName"], "盛真言碎片")
```

- [ ] **Step 2: 记录用户验证命令**

  由用户执行：

```powershell
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python -m unittest tests.test_build_tactics -v
```

  首次预期：`ModuleNotFoundError: No module named 'tools.build_tactics'`。

- [ ] **Step 3: 实现数据模型和解析器**

  `tools/build_tactics.py` 定义固定区域及输出模型：

```python
ORDER = ["风", "林", "火", "山", "阴", "雷"]
STANDARD_BLOCKS = {
    "forest": {"name": "林", "range": (2, 20), "start_col": 2},
    "mountain": {"name": "山", "range": (24, 42), "start_col": 2},
    "wind": {"name": "风", "range": (45, 63), "start_col": 2},
    "fire": {"name": "火", "range": (66, 84), "start_col": 2},
}
SPECIAL_BLOCKS = {
    "yin": {"name": "阴", "range": (2, 20), "start_col": 19},
    "thunder": {"name": "雷", "range": (24, 42), "start_col": 19},
}
```

  每个 `item` 输出：

```python
{
    "id": "wind",
    "name": "风兵法",
    "kind": "standard",
    "markName": "风之印记",
    "ranks": [{
        "rank": 0,
        "baseAttributes": [{"name": "内力", "value": 45, "unit": "flat"}],
        "extraAttributes": [],
        "proficiency": {"min": 1.0, "max": 2.5},
        "advance": {"mark": 0, "merit": 0, "horn": 0},
        "rehearsal": {"singleHorn": 2, "guaranteeHorn": 100},
    }],
    "mantras": [{
        "id": "qi",
        "name": "齐",
        "attribute": "防",
        "unit": "percent",
        "materialName": "齐真言碎片",
        "unlockTacticRank": 0,
        "maxRank": 9,
        "stages": [{"rank": 0, "tacticRank": 0, "value": 1, "fragments": 40}],
    }],
}
```

  解析规则必须显式实现：

```python
def displayed_percent(value, coordinate):
    if isinstance(value, str) and value.endswith("%"):
        return float(value[:-1])
    if isinstance(value, (int, float)):
        return float(value) * 100
    raise ValueError(f"百分比无法识别：{coordinate}={value!r}")

def extreme_value(mantra_rank):
    return (mantra_rank + 1) * 10
```

  常规兵法真言表内数值直接作为百分比；统真言单位设为 `flat`。阴雷基础百分比把Excel小数换算成显示百分数；表内字符串百分比去掉 `%` 后存数值。火印记名称从兵法定义生成，不读取错误表头；风6阶防属性在读到源值后替换为240。

- [ ] **Step 4: 加入结构验证**

  `parse_sheet()` 在返回前执行：

```python
def validate_payload(payload):
    items = payload["items"]
    if [item["name"][0] for item in items] != ORDER:
        raise ValueError("兵法顺序或数据块缺失")
    for item in items:
        ranks = [row["rank"] for row in item["ranks"]]
        if ranks != list(range(16)):
            raise ValueError(f"{item['name']}阶数不连续：{ranks}")
        for mantra in item["mantras"]:
            expected = list(range(mantra["maxRank"] + 1))
            actual = [stage["rank"] for stage in mantra["stages"]]
            if actual != expected:
                raise ValueError(f"{item['name']}·{mantra['name']}真言阶数不连续：{actual}")
```

- [ ] **Step 5: 生成 `data/tactics.js`**

  输出格式：

```javascript
/* 由 tools/build_tactics.py 自动生成，请勿手改 */
window.TACTICS_DATA = { /* payload */ };
```

  生成命令属于构建步骤，不属于验证：

```powershell
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $python tools/build_tactics.py
```

- [ ] **Step 6: 提交数据生成链**

```powershell
git add tools/build_tactics.py tests/test_build_tactics.py data/tactics.js
git commit -m "feat: generate tactics data"
```

---

### Task 2: 实现兵法纯计算核心

**Files:**

- Create: `js/tactics.js`
- Create: `js/tactics.test.js`

**Interfaces:**

- Consumes: Task 1 的单个 tactic 数据对象及 `{rank, rehearsalSpent, mantras}` 进度对象。
- Produces: `window.TACTICS`/CommonJS模块，公开 `defaultProgress`、`allowedMantraRank`、`normalizeProgress`、`changeRank`、`validateState`、`attributeSnapshot`、`calculatePlan`。

- [ ] **Step 1: 写阶数和进度测试**

```javascript
test("defaultProgress：六种真言均从未激活开始", () => {
  assert.deepStrictEqual(T.defaultProgress(forest), {
    rank: 0,
    rehearsalSpent: 0,
    mantras: { ling: -1, chan: -1, command: -1, extreme: -1 }
  });
});

test("allowedMantraRank：普通真言和极真言按兵法阶数限制", () => {
  assert.strictEqual(T.allowedMantraRank(forest, "ling", 8), 8);
  assert.strictEqual(T.allowedMantraRank(forest, "ling", 15), 9);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 9), -1);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 10), 0);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 15), 5);
});

test("changeRank：兵法阶数变化重置本阶号角并收缩真言", () => {
  const changed = T.changeRank(forest, {
    rank: 15, rehearsalSpent: 250,
    mantras: { ling: 9, chan: 9, command: 9, extreme: 5 }
  }, 8);
  assert.strictEqual(changed.rehearsalSpent, 0);
  assert.deepStrictEqual(changed.mantras, { ling: 8, chan: 8, command: 8, extreme: -1 });
});
```

- [ ] **Step 2: 写资源计算测试**

```javascript
test("calculatePlan：5→8阶只累计6、7、8阶进阶材料", () => {
  const result = T.calculatePlan(wind, startAt5, targetAt8);
  assert.deepStrictEqual(result.advance.steps.map(step => step.rank), [6, 7, 8]);
  assert.strictEqual(result.advance.mark, 770);
  assert.strictEqual(result.advance.merit, 5500);
});

test("calculatePlan：真言未激活→3阶包含0、1、2、3阶碎片", () => {
  const result = T.calculatePlan(forest, startInactive, targetMantra3);
  assert.strictEqual(result.mantras.ling.fragments, 220);
});

test("calculatePlan：极真言0→5阶不重复计算激活碎片", () => {
  const result = T.calculatePlan(forest, extremeAt0, extremeAt5);
  assert.strictEqual(result.mantras.extreme.fragments, 750);
  assert.strictEqual(result.targetAttributes.find(item => item.key === "mantra:extreme").value, 60);
});

test("rehearsal：950阈值、单次7按952实际消耗", () => {
  const result = T.calculatePlan(windRank4Fixture, startAt4ZeroSpent, targetAt4);
  assert.deepStrictEqual(result.rehearsal, {
    rank: 4, proficiency: { min: 5.6, max: 7.5 }, singleHorn: 7,
    guaranteeHorn: 950, carriedSpent: 0, remainingRuns: 136, actualAdditionalHorn: 952
  });
});

test("rehearsal：升至新阶时不继承旧阶号角", () => {
  const result = T.calculatePlan(wind, {...startAt4, rehearsalSpent: 945}, targetAt5);
  assert.strictEqual(result.rehearsal.carriedSpent, 0);
  assert.strictEqual(result.rehearsal.actualAdditionalHorn, 1800);
});
```

  `startAt*` 和 `targetAt*` 使用文件顶部的完整fixture构建，不引用浏览器全局。

- [ ] **Step 3: 记录用户验证命令**

```powershell
node --test js/tactics.test.js
```

  首次预期：`Cannot find module './tactics.js'`。

- [ ] **Step 4: 实现UMD模块和进度规则**

```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TACTICS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function allowedMantraRank(tactic, mantraId, tacticRank) {
    var mantra = tactic.mantras.find(function (item) { return item.id === mantraId; });
    if (!mantra || tacticRank < mantra.unlockTacticRank) return -1;
    return mantra.stages.reduce(function (max, stage) {
      return stage.tacticRank <= tacticRank ? Math.max(max, stage.rank) : max;
    }, -1);
  }

  function defaultProgress(tactic) {
    var mantras = {};
    tactic.mantras.forEach(function (item) { mantras[item.id] = -1; });
    return { rank: 0, rehearsalSpent: 0, mantras: mantras };
  }

  function changeRank(tactic, progress, nextRank) {
    var copy = normalizeProgress(tactic, progress);
    var rank = clamp(Math.trunc(nextRank), 0, 15);
    copy.rank = rank;
    copy.rehearsalSpent = 0;
    tactic.mantras.forEach(function (mantra) {
      copy.mantras[mantra.id] = Math.min(copy.mantras[mantra.id], allowedMantraRank(tactic, mantra.id, rank));
    });
    return copy;
  }
```

  `normalizeProgress()` 必须补齐缺失真言、把未知字段丢弃并限制阶数，但不能在读取旧数据时抛错导致整个页面失效。

- [ ] **Step 5: 实现属性快照与材料计划**

  `attributeSnapshot(tactic, state)` 返回稳定键值：

```javascript
[
  { key: "base:血:flat", group: "base", name: "血", value: 1440, unit: "flat" },
  { key: "mantra:ling", group: "mantra", name: "内力", value: 6, unit: "percent", mantraName: "灵" }
]
```

  `calculatePlan(tactic, start, target)`：

```javascript
function calculatePlan(tactic, startInput, targetInput) {
  var start = normalizeProgress(tactic, startInput);
  var target = normalizeProgress(tactic, targetInput);
  var errors = validateState(tactic, start, target);
  if (errors.length) return { valid: false, errors: errors };
  var steps = tactic.ranks.filter(function (row) {
    return row.rank > start.rank && row.rank <= target.rank;
  });
  var advance = steps.reduce(function (sum, row) {
    sum.mark += row.advance.mark;
    sum.merit += row.advance.merit;
    sum.horn += row.advance.horn;
    sum.steps.push({ rank: row.rank, advance: row.advance });
    return sum;
  }, { mark: 0, merit: 0, horn: 0, steps: [] });
  return {
    valid: true,
    start: start,
    target: target,
    advance: advance,
    mantras: mantraPlans(tactic, start.mantras, target.mantras),
    rehearsal: rehearsalPlan(tactic, start, target),
    startAttributes: attributeSnapshot(tactic, start),
    targetAttributes: attributeSnapshot(tactic, target),
    attributeDeltas: attributeDeltas(tactic, start, target)
  };
}
```

  `rehearsalPlan()` 使用已确认公式；阴雷返回 `null`。`mantraPlans()` 按每种真言分别累加 `current + 1` 到 `target` 的碎片并保留逐级明细。

- [ ] **Step 6: 提交计算核心**

```powershell
git add js/tactics.js js/tactics.test.js
git commit -m "feat: add tactics calculation core"
```

---

### Task 3: 新增兵法分区结构和导航

**Files:**

- Modify: `index.html`
- Modify: `js/app.js`

**Interfaces:**

- Consumes: `data/tactics.js`、`js/tactics.js`、`js/tactics-ui.js`。
- Produces: `#partition-tactics` 及UI脚本所需固定容器。

- [ ] **Step 1: 在导航中加入兵法**

  桌面导航顺序改为：

```html
<button class="tab mobile-secondary" data-partition="inscription">铭文</button>
<button class="tab mobile-secondary" data-partition="tactics">兵法</button>
<button class="tab mobile-secondary" data-partition="quiz">答题</button>
```

  手机“更多”同步加入：

```html
<button type="button" data-partition="inscription">铭文</button>
<button type="button" data-partition="tactics">兵法</button>
<button type="button" data-partition="quiz">答题</button>
```

- [ ] **Step 2: 加入兵法页面容器**

```html
<section id="partition-tactics" hidden>
  <section class="panel tactics-selector-panel">
    <div class="filter-row">
      <span class="filter-label">兵法筛选</span>
      <div id="tactics-selector" class="segs tactics-selector"></div>
    </div>
  </section>
  <div id="tactics-workspace" hidden>
    <section id="tactics-progress" class="tactics-section"></section>
    <section id="tactics-calculator" class="tactics-section"></section>
    <section id="tactics-reference" class="tactics-section"></section>
  </div>
</section>
```

- [ ] **Step 3: 登记分区标题和切换对象**

  在 `js/app.js` 增加：

```javascript
// PARTITION_TITLES 内在 inscription 与 quiz 之间插入
tactics: "兵法",

// 替换原 secondaryPartitions
const secondaryPartitions = ["inscription", "tactics", "quiz", "loulan", "settings"];

// parts 内新增
tactics: document.getElementById("partition-tactics"),
```

- [ ] **Step 4: 按依赖顺序加载脚本**

```html
<script src="data/tactics.js"></script>
<!-- existing data files -->
<script src="js/tactics.js"></script>
<script src="js/tactics-ui.js"></script>
<script src="js/app.js"></script>
```

  `tactics-ui.js` 必须在 `app.js` 前载入；二者均通过 `DOMContentLoaded` 初始化，不互相调用内部函数。

- [ ] **Step 5: 提交页面骨架**

```powershell
git add index.html js/app.js
git commit -m "feat: add tactics partition shell"
```

---

### Task 4: 实现个人进度与目标计算UI

**Files:**

- Create: `js/tactics-ui.js`

**Interfaces:**

- Consumes: `window.TACTICS_DATA`、`window.TACTICS`、Task 3的固定DOM容器。
- Produces: `qinshi_tactics_progress_v1` 和完整单兵法工作台。

- [ ] **Step 1: 建立UI状态和安全存储**

```javascript
(function () {
  "use strict";
  var DATA = window.TACTICS_DATA;
  var CORE = window.TACTICS;
  var STORE_KEY = "qinshi_tactics_progress_v1";
  var state = {
    selectedId: "",
    editing: false,
    referenceMode: "collapsed",
    progress: {},
    calculator: null
  };

  function loadProgress() {
    var parsed = {};
    try { parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (error) { parsed = {}; }
    DATA.items.forEach(function (tactic) {
      state.progress[tactic.id] = CORE.normalizeProgress(tactic, parsed[tactic.id]);
    });
  }

  function saveProgress() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.progress));
  }
})();
```

  未知兵法ID和未知真言字段不得重新写回。localStorage写入失败时在兵法分区内显示错误，不破坏内存中的编辑内容。

- [ ] **Step 2: 渲染六种兵法选择器**

  按 `DATA.meta.order` 生成风、林、火、山、阴、雷。首次 `selectedId === ""` 时保持 `#tactics-workspace.hidden = true`。点击后：

```javascript
function selectTactic(id) {
  state.selectedId = id;
  state.editing = false;
  state.referenceMode = "collapsed";
  resetCalculatorFromProgress();
  renderAll();
}
```

  该值不写入localStorage或sessionStorage；切换分区不会销毁JS状态，刷新页面才恢复未选择。

- [ ] **Step 3: 实现个人进度只读摘要和编辑表单**

  摘要必须显示兵法阶数、基础属性、每种真言阶数/属性；常规兵法再显示：

```text
本阶已消耗 945号角｜保底阈值950｜再演练1次｜实际还需7号角
```

  编辑表单使用 `select` 限制兵法0–15阶和真言允许范围；未激活选项值为 `-1`。常规兵法显示数字输入：

```html
<input type="number" min="0" step="7" max="952" data-field="rehearsalSpent">
```

  兵法阶数选择发生变化时，按新阶数更新真言下拉范围。只有保存时发现新阶数与已保存阶数不同，才使用 `CORE.changeRank()` 将号角清零并收缩超限真言；如果用户把阶数改动后又改回原阶，保留表单中填写的本阶号角。保存前如果发生真言收缩，使用确认框列出：

```text
降低兵法阶数将调整：极5阶→未激活、灵9阶→8阶。是否保存？
```

  保存成功后关闭编辑表单、更新摘要，并调用 `resetCalculatorFromProgress()` 让默认计算起点同步到最新进度。

- [ ] **Step 4: 实现可自由调整起点和终点的计算器**

  计算器状态：

```javascript
{
  start: { rank: 5, rehearsalSpent: 945, mantras: { qi: 4, dart: 4, command: 4, extreme: -1 } },
  target: { rank: 5, rehearsalSpent: 0, mantras: { qi: 4, dart: 4, command: 4, extreme: -1 } }
}
```

  提供：起点兵法阶数、起点各真言、本阶已消耗号角、终点兵法阶数、终点各真言、“恢复为个人进度”和“一键升至允许上限”。

  “一键升至允许上限”实现：

```javascript
function maximizeTargetMantras(tactic) {
  tactic.mantras.forEach(function (mantra) {
    state.calculator.target.mantras[mantra.id] = CORE.allowedMantraRank(
      tactic, mantra.id, state.calculator.target.rank
    );
  });
  renderCalculator();
}
```

  起点或终点兵法阶变化时同步重建相关真言下拉范围；终点低于起点、真言目标低于起点或号角输入不合法时，显示 `calculatePlan().errors`，不渲染旧结果。

- [ ] **Step 5: 渲染计算结果**

  结果分成四块：

```html
<div class="tactics-result-grid">
  <article>属性提升</article>
  <article>兵法进阶材料</article>
  <article>真言碎片</article>
  <article>目标阶演练</article>
</div>
```

  属性显示遵循：

```javascript
function formatAttribute(item) {
  return item.name + "+" + formatNumber(item.value) + (item.unit === "percent" ? "%" : "");
}
```

  材料汇总同时显示：对应印记、功勋、进阶号角、演练号角、号角总计；无消耗项显示0。真言碎片按真言分别展示逐级路径和合计，例如：

```text
灵真言：未激活→0阶 40、0→1阶 50、1→2阶 60，共150片
```

- [ ] **Step 6: 实现事件委托和错误边界**

  选择器、编辑器、计算器和资料按钮分别在其根容器绑定一次 `click`/`change`/`input` 事件，不在每次渲染时重复绑定。若 `TACTICS_DATA` 或 `TACTICS` 缺失，在分区显示：

```text
兵法数据加载失败，请确认 data/tactics.js 与 js/tactics.js 存在。
```

- [ ] **Step 7: 提交个人进度与计算UI**

```powershell
git add js/tactics-ui.js
git commit -m "feat: add tactics progress and calculator"
```

---

### Task 5: 实现资料查询表和响应式样式

**Files:**

- Modify: `js/tactics-ui.js`
- Modify: `css/style.css`

**Interfaces:**

- Consumes: 当前选中兵法、个人进度当前阶、计算器目标阶。
- Produces: 可折叠的0–15阶资料表和电脑/移动端布局。

- [ ] **Step 1: 实现四种资料模式**

  `state.referenceMode` 只允许：

```javascript
["collapsed", "current", "target", "all"]
```

  点击“仅看当前阶”“仅看目标阶”“查看全部”后自动展开；点击“收起资料”后只保留标题和按钮。渲染行筛选：

```javascript
function referenceRows(tactic) {
  if (state.referenceMode === "current") {
    return tactic.ranks.filter(function (row) { return row.rank === state.progress[tactic.id].rank; });
  }
  if (state.referenceMode === "target") {
    return tactic.ranks.filter(function (row) { return row.rank === state.calculator.target.rank; });
  }
  return state.referenceMode === "all" ? tactic.ranks : [];
}
```

- [ ] **Step 2: 分类型渲染表头**

  常规兵法表头：

```text
阶｜基础属性｜熟练度｜进阶材料｜单次演练号角｜完美保底阈值｜真言属性｜真言碎片
```

  阴雷表头：

```text
阶｜组合基础属性｜额外属性｜进阶材料｜真言属性｜真言碎片
```

  0阶进阶材料显示“初始阶，无兵法进阶材料”；真言碎片仍显示对应的“未激活→0阶”。空白属性不显示占位破折号以外的虚假数值。

- [ ] **Step 3: 标记当前阶与目标阶**

```javascript
function rankRowClass(rank, currentRank, targetRank) {
  if (rank === currentRank && rank === targetRank) return "is-current-target";
  if (rank === currentRank) return "is-current";
  if (rank === targetRank) return "is-target";
  return "";
}
```

  当前阶绿色边线/文字，目标阶鲜红边线/文字；同阶同时显示“当前/目标”徽标。

- [ ] **Step 4: 添加桌面样式**

  新增作用域均以 `#partition-tactics` 开头，避免影响现有分区：

```css
#partition-tactics .tactics-section {
  margin-top: 14px;
  padding: 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
}
#partition-tactics .tactics-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 10px;
}
#partition-tactics .tactics-result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
#partition-tactics tr.is-current { box-shadow: inset 4px 0 0 #35d06f; }
#partition-tactics tr.is-target { box-shadow: inset 4px 0 0 #ff4b4b; }
```

- [ ] **Step 5: 添加手机和平板样式**

```css
@media (max-width: 1024px) {
  #partition-tactics .tactics-selector { flex-wrap: wrap; }
  #partition-tactics .tactics-form-grid,
  #partition-tactics .tactics-result-grid { grid-template-columns: 1fr; }
  #partition-tactics .tactics-table-scroll {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  #partition-tactics .tactics-reference-table { min-width: 980px; }
  #partition-tactics .tactics-reference-table tr > :first-child {
    position: sticky;
    left: 0;
    z-index: 3;
    min-width: 64px;
    background: var(--panel);
    box-shadow: 8px 0 10px rgba(0, 0, 0, .35);
  }
  #partition-tactics .tactics-reference-table thead th:first-child { z-index: 4; }
}
```

  表格容器只允许左右滑动，不设置固定高度或内部纵向滚动；上下滚动继续由页面负责。

- [ ] **Step 6: 提交资料与样式**

```powershell
git add js/tactics-ui.js css/style.css
git commit -m "feat: add tactics reference and responsive layout"
```

---

### Task 6: 接入PWA离线缓存和项目文档

**Files:**

- Modify: `service-worker.js`
- Modify: `js/pwa.js`
- Modify: `README.md`
- Modify: `HANDOVER.md`

**Interfaces:**

- Consumes: 新增的兵法数据和脚本资源。
- Produces: PWA `1.0.7` 离线版本及维护说明。

- [ ] **Step 1: 更新Service Worker缓存**

```javascript
const CACHE_NAME = CACHE_PREFIX + "1.0.7";
// 在 PRECACHE_URLS 的 data 项末尾插入
"./data/tactics.js",
// 在 PRECACHE_URLS 的 js 项末尾插入
"./js/tactics.js",
"./js/tactics-ui.js",
```

  保留现有所有预缓存项，不因新增兵法而删除其他分区资源。

- [ ] **Step 2: 同步显示版本**

```javascript
var APP_VERSION = "1.0.7";
```

  `service-worker.js` 和 `js/pwa.js` 必须使用相同版本。

- [ ] **Step 3: 更新README**

  在分区说明加入：

```markdown
- **兵法**：按风、林、火、山、阴、雷筛选；保存兵法及真言个人进度；自由设置计算起点和目标，汇总进阶材料、真言碎片和目标阶演练号角；查看0–15阶完整资料。
```

  在数据生成命令加入：

```powershell
& $python tools/build_tactics.py
```

  在测试命令加入 `js/tactics.test.js` 和 `tests.test_build_tactics`。

- [ ] **Step 4: 更新HANDOVER**

  记录：

- Excel六个数据区域和四项业务修正。
- `data/tactics.js` 只能由生成脚本更新。
- `qinshi_tactics_progress_v1` 数据形状。
- 兵法/真言阶数约束和演练号角公式。
- PWA `1.0.7` 新增缓存资源。

- [ ] **Step 5: 提交发布接入**

```powershell
git add service-worker.js js/pwa.js README.md HANDOVER.md
git commit -m "docs: document tactics section and bump pwa"
```

---

### Task 7: 准备用户手动验收清单

**Files:**

- No file changes required unless验收中发现问题。

**Interfaces:**

- Consumes: Tasks 1–6 的完整实现。
- Produces: 用户可执行的验证命令和场景清单。

- [ ] **Step 1: 向用户提供自动测试命令但不主动执行**

```powershell
$python = 'C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
node --test js/tactics.test.js
& $python -m unittest tests.test_build_tactics -v
```

- [ ] **Step 2: 提供桌面端验收场景**

  用户手动检查：

1. 首次进入兵法只显示六个筛选按钮。
2. 选择林后模块顺序为个人进度、目标计算、资料查询。
3. 林9阶普通真言属性及碎片正确；林10阶极真言显示未激活→0阶、10%、50片。
4. 风6阶防为240；火使用火之印记。
5. 阴、雷组合百分比和殇/盛真言显示正确。
6. 当前5阶目标8阶只累计6–8阶进阶材料，并只计算8阶演练。
7. 950阈值、单次7显示136次和952号角。
8. 改变个人兵法阶数后本阶号角清零，临时计算不覆盖个人进度。
9. 导出备份包含 `qinshi_tactics_progress_v1`，旧备份导入不报错。

- [ ] **Step 3: 提供手机和平板验收场景**

1. “更多”菜单能进入兵法，顶部标题为“兵法”。
2. 六个按钮和编辑表单不横向溢出。
3. 资料表可以左右滑动，首列“阶”完整遮挡下层内容。
4. 上下滚动由页面负责，不出现表内大块空白或双重纵向滚动。
5. 更新至PWA `1.0.7` 后断网仍能进入兵法并读取数据。

- [ ] **Step 4: 仅在用户验收反馈后修正**

  不宣称未经用户执行的测试或设备验收已经通过；如用户反馈具体问题，在当前功能分支继续修正并保留其他既有改动。
