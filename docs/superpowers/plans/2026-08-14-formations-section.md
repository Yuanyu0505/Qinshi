# 合阵分区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从最新 Excel“合阵”工作表生成可靠数据，并在 Qin 中新增支持官方资料、个人进度、自由计算、位置排序和主将/助阵联合推荐的响应式合阵分区。

**Architecture:** 使用独立 Python 生成器把 Excel 固化为 `data/formations.js`，浏览器计算全部集中在无 DOM 的 `js/formations.js`，本地存储和渲染集中在 `js/formations-ui.js`。`index.html` 只提供分区挂载点与脚本顺序，`js/app.js` 仅负责全局分区切换，不把合阵业务重新塞入现有大文件。

**Tech Stack:** Python 3、openpyxl、原生 JavaScript（UMD/CommonJS 测试兼容）、HTML5、CSS Grid/Flexbox、Node.js `node:test`。

## Global Constraints

- 源工作簿固定读取 `秦时相关（更新贯侯钟离昧）20260618.xlsx` 的“合阵”工作表，不修改工作簿。
- 必须生成 19 个合阵、144 条候选弟子记录；异常时停止且不得覆盖现有完整数据。
- “神·弟子”和“神弟子”统一显示为无中点名称，内部匹配忽略中点与空格，同时保留源名称。
- 等级只保存和展示；转换值仅按 `floor(当前来源属性 × 转换比例)` 计算。
- 每个弟子最多担任一次主将或占用一个助阵位置，主将不得参与助阵计算。
- 推荐算法必须精确求解：先最大化已填位置数量，再最大化各位置归一化总分，不使用贪心近似。
- 电脑、手机和平板同步适配；移动端不得依赖缩放或横向滑动查看计算排行榜和推荐结果。
- 新存储键固定为 `qinshi_formation_progress_v1`，必须自动进入现有设置备份；旧备份缺少该键时安全使用空进度。
- 本次不修改 `js/pwa.js`、`service-worker.js`、PWA 版本、预缓存表或发布配置。
- 按项目规则，测试、lint、格式化和浏览器验收由用户手动执行；实施中写测试但不主动运行。

---

### Task 1: Excel 生成器与固化数据

**Files:**
- Create: `tools/build_formations.py`
- Create: `tests/test_build_formations.py`
- Create: `data/formations.js`

**Interfaces:**
- Consumes: 最新工作簿绝对路径或仓库默认工作簿；“合阵”工作表的三个资料区和 `J76:R95` 汇总区。
- Produces: `parse_sheet(path) -> {meta, items}`、`parse_worksheet(ws) -> {meta, items}`、`write_output(payload, path)`；浏览器全局 `window.FORMATIONS_DATA`。

- [ ] **Step 1: 写生成器契约测试**

```python
class TestBuildFormations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = parse_sheet(XLSX)

    def test_fixed_counts_and_slot_distribution(self):
        self.assertEqual(self.payload["meta"]["formationCount"], 19)
        self.assertEqual(self.payload["meta"]["candidateCount"], 144)
        self.assertEqual(
            sorted(len(item["slots"]) for item in self.payload["items"]),
            [5] * 7 + [6] * 12,
        )

    def test_special_rules_are_preserved(self):
        expected = {
            ("旗开得胜", 4): ("血", 1, "全体内力"),
            ("胜友如云", 4): ("血", 1, "全体内力"),
            ("义薄云天", 4): ("血", 2, "全体内力"),
            ("天光云影", 4): ("血", 2, "追加伤害"),
            ("影形不离", 4): ("血", 2, "全体内力"),
        }
        actual = {
            (item["name"], slot["position"]):
                (slot["sourceAttribute"], slot["ratePercent"], slot["targetAttribute"])
            for item in self.payload["items"] for slot in item["slots"]
            if (item["name"], slot["position"]) in expected
        }
        self.assertEqual(actual, expected)
```

- [ ] **Step 2: 由用户手动确认契约测试初始失败**

Run: `python -m unittest tests.test_build_formations -v`

Expected: FAIL，提示 `tools.build_formations` 尚不存在。

- [ ] **Step 3: 实现名称、数字与规则解析器**

```python
RULE_RE = re.compile(r"(?P<rate>\d+(?:\.\d+)?)%\s*(?P<source>攻|血|防)\s*[→-]\s*(?P<target>全体攻|全体血|全体防|全体内力|全体护盾|追加伤害)")

def normalize_name(value):
    return re.sub(r"[·•・\s]+", "", str(value or "").strip())

def parse_rule(value, coordinate):
    raw = str(value or "").strip()
    match = RULE_RE.fullmatch(raw.replace("属性", ""))
    if not match:
        raise ValueError(f"转换规则无法识别：{coordinate}={value!r}")
    return {
        "sourceAttribute": match.group("source"),
        "ratePercent": float(match.group("rate")),
        "targetAttribute": match.group("target"),
        "rawRule": raw,
    }
```

- [ ] **Step 4: 实现三个资料区、官方汇总区关联和严格校验**

```python
def validate_payload(payload):
    if len(payload["items"]) != 19:
        raise ValueError("合阵数量必须为19")
    candidates = sum(len(item["candidates"]) for item in payload["items"])
    if candidates != 144:
        raise ValueError("候选弟子记录必须为144")
    for item in payload["items"]:
        positions = [slot["position"] for slot in item["slots"]]
        if positions != list(range(1, len(positions) + 1)) or len(positions) not in (5, 6):
            raise ValueError(f"{item['name']}助阵位置不连续")
```

生成器先完成全部解析和 `validate_payload`，再使用临时文件替换输出，避免失败时覆盖 `data/formations.js`。

- [ ] **Step 5: 生成 `data/formations.js`**

Run: `python tools/build_formations.py --workbook "C:\Users\pghyl\Desktop\deepseek\秦时相关（更新贯侯钟离昧）20260618.xlsx"`

Expected: 生成 `window.FORMATIONS_DATA = {...};`，包含 19 个合阵和 144 条候选记录。该命令属于数据生成，不是验证流程。

- [ ] **Step 6: 由用户手动运行生成器测试**

Run: `python -m unittest tests.test_build_formations -v`

Expected: PASS。

- [ ] **Step 7: 提交生成器与数据**

```bash
git add tools/build_formations.py tests/test_build_formations.py data/formations.js
git commit -m "feat: generate formation data"
```

---

### Task 2: 无 DOM 计算核心与精确推荐

**Files:**
- Create: `js/formations.js`
- Create: `js/formations.test.js`

**Interfaces:**
- Consumes: Task 1 的 formation、slot、candidate 数据；自由试算状态 `{mainId, members}`。
- Produces: `window.FORMATIONS`/CommonJS API：`normalizeName`、`parseIntegerInput`、`normalizeProgress`、`calculateCell`、`buildMatrix`、`rankColumn`、`recommendFormation`、`summarizeTargets`。

- [ ] **Step 1: 写输入、矩阵与标色测试**

```javascript
test("calculateCell 向下取整且等级不参与", () => {
  assert.strictEqual(F.calculateCell({ attack: 24967 }, { sourceAttribute: "攻", ratePercent: 6 }), 1498);
});

test("rankColumn 使用不同数值档标红和标黄", () => {
  assert.deepStrictEqual(F.rankColumn([100, 100, 80, 70]), ["highest", "highest", "second", null]);
  assert.deepStrictEqual(F.rankColumn([0, 0]), ["highest", "highest"]);
});
```

- [ ] **Step 2: 由用户手动确认核心测试初始失败**

Run: `node --test js/formations.test.js`

Expected: FAIL，提示模块尚不存在。

- [ ] **Step 3: 实现输入清洗、进度归一化和矩阵**

```javascript
function parseIntegerInput(value, minimum) {
  var text = String(value == null ? "" : value).replace(/[\s,，]/g, "");
  if (!/^\d+$/.test(text) || Number(text) < minimum) return { valid: false, value: null };
  return { valid: true, value: Number(text) };
}

function calculateCell(stats, slot) {
  var key = { "攻": "attack", "血": "health", "防": "defense" }[slot.sourceAttribute];
  return Math.floor(stats[key] * slot.ratePercent / 100);
}
```

`normalizeProgress` 仅保留候选名单中的成员，允许不完整字段，主将不再拥有时清空；`buildMatrix` 排除主将、不参与和输入不完整成员。

- [ ] **Step 4: 写精确联合推荐测试**

```javascript
test("推荐优先填满位置且同一弟子不重复", () => {
  const result = F.recommendFormation(fixture, progress);
  assert.strictEqual(result.assignments.length, fixture.slots.length);
  assert.strictEqual(new Set(result.assignments.map(item => item.candidateId)).size, result.assignments.length);
});

test("未指定主将时选择排除后助阵得分最高者", () => {
  const result = F.recommendFormation(fixture, progressWithoutMain);
  assert.strictEqual(result.mainId, "low-opportunity-cost");
});
```

- [ ] **Step 5: 实现记忆化精确分配与同分规则**

```javascript
function betterPlan(left, right) {
  if (!right) return true;
  if (left.filled !== right.filled) return left.filled > right.filled;
  if (Math.abs(left.score - right.score) > 1e-10) return left.score > right.score;
  if (left.officialMatches !== right.officialMatches) return left.officialMatches > right.officialMatches;
  return left.tieKey < right.tieKey;
}
```

对每个位置预先计算最大值和归一化分数，以 `(positionIndex, usedMask)` 为记忆化键；未指定主将时枚举每名完整、已拥有候选作为主将，复用同一求解器，官方主将匹配只用于同分。

- [ ] **Step 6: 实现目标属性汇总与参考值提醒数据**

```javascript
function summarizeTargets(assignments) {
  return assignments.reduce(function (summary, item) {
    summary[item.slot.targetAttribute] = (summary[item.slot.targetAttribute] || 0) + item.value;
    return summary;
  }, {});
}
```

- [ ] **Step 7: 由用户手动运行核心测试**

Run: `node --test js/formations.test.js`

Expected: PASS，包括输入、矩阵、并列标色、部分推荐、主将枚举和同分稳定性。

- [ ] **Step 8: 提交计算核心**

```bash
git add js/formations.js js/formations.test.js
git commit -m "feat: calculate formation recommendations"
```

---

### Task 3: 个人进度、自由试算与合阵页面渲染

**Files:**
- Create: `js/formations-ui.js`
- Modify: `index.html`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `window.FORMATIONS_DATA`、`window.FORMATIONS`、`localStorage`。
- Produces: `window.FORMATIONS_UI.init()`；存储键 `qinshi_formation_progress_v1`；DOM 根节点 `#formation-selector`、`#formation-workspace`。

- [ ] **Step 1: 写页面结构与脚本顺序契约**

```javascript
test("首页包含合阵分区和数据、核心、UI脚本", async () => {
  const r = await get(port, "/");
  assert.match(r.body, /id="partition-formations"/);
  assert.match(r.body, /data\/formations\.js/);
  assert.match(r.body, /js\/formations\.js/);
  assert.match(r.body, /js\/formations-ui\.js/);
});
```

- [ ] **Step 2: 由用户手动确认页面契约初始失败**

Run: `node --test serve.test.js`

Expected: FAIL，首页尚无合阵挂载点和脚本。

- [ ] **Step 3: 在 `index.html` 增加最小挂载结构和脚本**

```html
<section id="partition-formations" hidden>
  <section class="panel formation-selector-panel">
    <div id="formation-selector"></div>
  </section>
  <div id="formation-workspace" hidden></div>
</section>
<script src="data/formations.js"></script>
<script src="js/formations.js"></script>
<script src="js/formations-ui.js"></script>
```

脚本顺序必须保证 data/core/UI 均在 `js/app.js` 前加载。

- [ ] **Step 4: 实现选择器与会话状态**

按阵眼石分组渲染合阵按钮；刷新默认未选择，当前页面切换分区后保留内存中的 `selectedFormationId`。选择后依次渲染官方资料、个人进度、自由计算、推荐结果。

- [ ] **Step 5: 实现个人进度编辑和存储容错**

```javascript
var STORE_KEY = "qinshi_formation_progress_v1";

function saveStoredProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify(storedByFormation));
}
```

首次勾选自动填充等级 1 和三维参考值；任一属性输入改变即切换为个人实际数据；恢复按钮回填参考值。取消编辑使用深拷贝丢弃草稿，保存允许不完整字段并返回只读摘要。

- [ ] **Step 6: 实现自由试算、矩阵排序和推荐摘要**

自由试算初始化为个人进度深拷贝，所有变动仅更新临时状态；“恢复为个人进度”重新复制。桌面矩阵列标题独立排序，并对最高/次高单元格添加 `is-highest`/`is-second`；推荐卡展示公式、最终值、汇总、缺少人数、不完整成员和参考值人数。

- [ ] **Step 7: 实现移动端单位置排行榜交互**

移动端渲染助阵位置选择按钮，只展示一个位置的排名列表；同一临时状态和排序结果与桌面共用，不复制计算逻辑。平板宽度足够时由 CSS 自动切回完整矩阵。

- [ ] **Step 8: 由用户手动运行页面契约测试**

Run: `node --test serve.test.js js/formations.test.js`

Expected: PASS。

- [ ] **Step 9: 提交 UI 与存储**

```bash
git add index.html js/formations-ui.js serve.test.js
git commit -m "feat: add formation workspace"
```

---

### Task 4: 全局导航与初始化接线

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 3 的 `#partition-formations` 和 `window.FORMATIONS_UI.init()`。
- Produces: 桌面/移动统一的 `data-partition="formations"` 导航与标题“合阵”。

- [ ] **Step 1: 扩展导航顺序契约**

```javascript
test("合阵位于兵法之后答题之前", async () => {
  const r = await get(port, "/");
  const tactics = r.body.indexOf('data-partition="tactics"');
  const formations = r.body.indexOf('data-partition="formations"');
  const quiz = r.body.indexOf('data-partition="quiz"');
  assert.ok(tactics < formations && formations < quiz);
});
```

- [ ] **Step 2: 修改桌面导航和移动“更多”菜单**

整体顺序固定为：`图鉴、关卡掉落、装备属性、橙装锻造、铭文、兵法、合阵、答题、楼兰棋阵、设置`。移动底栏仍显示既有四个主分区，“合阵”位于“更多”菜单中兵法之后。

- [ ] **Step 3: 修改 `js/app.js` 分区注册与初始化**

```javascript
PARTITION_TITLES.formations = "合阵";
parts.formations = document.getElementById("partition-formations");
secondaryPartitions.splice(secondaryPartitions.indexOf("quiz"), 0, "formations");
```

在全局初始化中调用一次 `window.FORMATIONS_UI.init()`；切走再返回不重新初始化，刷新才清空合阵选择。

- [ ] **Step 4: 更新设置备份说明文字**

将说明补充为包含“合阵个人进度”。不改 `js/settings.js` 的前缀导出逻辑，因为新键已使用 `qinshi_` 前缀。

- [ ] **Step 5: 由用户手动运行导航契约测试**

Run: `node --test serve.test.js`

Expected: PASS。

- [ ] **Step 6: 提交导航接线**

```bash
git add index.html js/app.js serve.test.js
git commit -m "feat: connect formation navigation"
```

---

### Task 5: 电脑、手机和平板响应式样式

**Files:**
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: Task 3 的 `.formation-*` DOM 类。
- Produces: 桌面完整矩阵、平板自适应矩阵、手机单位置榜单与纵向推荐卡片。

- [ ] **Step 1: 写关键响应式样式契约**

```javascript
test("合阵样式包含桌面矩阵和移动单位置榜单", async () => {
  const css = await get(port, "/css/style.css");
  assert.match(css.body, /#partition-formations/);
  assert.match(css.body, /formation-matrix/);
  assert.match(css.body, /formation-mobile-ranking/);
  assert.match(css.body, /@media \(max-width: 767px\)/);
});
```

- [ ] **Step 2: 实现桌面工作台样式**

阵眼石分组按钮自动换行；资料与编辑表格使用现有暗金主题；矩阵完整显示全部位置列；最高值使用鲜红文字/边框，次高使用金黄文字/边框；推荐位卡片横向自适应。

- [ ] **Step 3: 实现手机与平板样式**

在手机和窄屏平板隐藏 `.formation-desktop-matrix`、显示 `.formation-mobile-ranking`；弟子编辑卡片单列、字段换行；官方位置和推荐位置纵向卡片；禁止合阵业务容器产生页面级横向溢出。中等平板在空间足够时使用双列资料卡，并可恢复完整矩阵。

- [ ] **Step 4: 实现可访问性与错误状态样式**

为焦点、禁用、选中、输入错误、数据缺失、参考值与个人实际数据添加可辨识样式；颜色之外同时使用文字标签或边框区分最高/次高。

- [ ] **Step 5: 由用户手动进行响应式验收**

Manual: 在桌面、iPhone/Android 竖屏、手机横屏、iPad/Android 平板检查无需缩放或页面级左右滑动即可完成选择、编辑、排序和查看推荐。

- [ ] **Step 6: 提交响应式样式**

```bash
git add css/style.css serve.test.js
git commit -m "style: adapt formation workspace"
```

---

### Task 6: 交接文档、范围审计与本地合并

**Files:**
- Modify: `HANDOVER.md`
- Modify: `docs/superpowers/plans/2026-08-14-formations-section.md`

**Interfaces:**
- Consumes: Tasks 1–5 的最终文件和提交。
- Produces: 可追溯交接说明、完成勾选的实施计划、本地 `master` 合并结果。

- [ ] **Step 1: 更新交接文档**

记录合阵数据来源、生成命令、文件职责、存储键、推荐算法优先级、响应式策略和建议手动验收命令；明确 PWA 未更新。

- [ ] **Step 2: 完成计划自审**

逐条核对设计文档第 1～14 节，确认每项均落在 Tasks 1–5；扫描计划和实现，不得留下 `TBD`、`TODO` 或未定义接口；核对 `formationId`、`candidateId`、`position`、`ratePercent` 字段在 Python 数据、JS 核心和 UI 中一致。

- [ ] **Step 3: 审计改动范围**

只读检查最终 diff，确认未包含源 Excel、`答题.jpg`、`js/pwa.js`、`service-worker.js`、PWA 版本或发布配置；确认没有改动其他分区数据结构。

- [ ] **Step 4: 列出用户手动验证命令**

```bash
python -m unittest tests.test_build_formations -v
node --test js/formations.test.js serve.test.js
```

不由 AI 主动运行；最终交付时同时列出 19/144 数据量、特殊规则、主将排除、并列标色、移动单位置榜单和备份兼容的手动重点。

- [ ] **Step 5: 提交文档**

```bash
git add HANDOVER.md docs/superpowers/plans/2026-08-14-formations-section.md
git commit -m "docs: hand over formation section"
```

- [ ] **Step 6: 自动合并到本地 `master`**

在不暂存、不覆盖用户工作簿和 `答题.jpg` 的前提下，把实现分支合并回本地 `master`，保留功能分支；不推送 GitHub，不更新 PWA。

## 执行记录

- 2026-08-14：Tasks 1–5 的数据生成、计算核心、个人进度、自由试算、导航接线和响应式布局均已实现并分步提交。
- 生成结果：19 个合阵、144 条候选弟子记录；5/6 助阵结构来自源表，官方汇总中的“无”按空位置处理。
- 范围审计：未修改源 Excel、`答题.jpg`、`js/pwa.js`、`service-worker.js`、PWA 版本、预缓存表或发布配置。
- 按项目约定，计划中所有测试、lint、格式检查和浏览器/设备验证步骤保留为用户手动执行项，AI 未主动运行。

