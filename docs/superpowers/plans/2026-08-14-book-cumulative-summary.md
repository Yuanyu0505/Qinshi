# Book Cumulative Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐两件神兵装备属性、统一三处装备名称，并让所有典籍按同品质逐阶累计，默认只显示最高阶累计结果且可按品质展开成长详情。

**Architecture:** Excel 解析仍保留原始典籍阶段数据；生成器仅在已确认的神兵装备上应用稳定的名称和属性覆盖，并把典籍 `max` 改为各品质最高阶累计值。`js/query.js` 提供唯一的典籍累计纯函数，展示、筛选排序和排序值都消费同一结果；`js/app.js` 只负责最高阶摘要及原生 `details` 展开/收起。

**Tech Stack:** Python/openpyxl、原生 JavaScript UMD、HTML/CSS、Python unittest、Node `node:test`

## Global Constraints

- 标准名称固定为 `神兵月狼锦纱`、`神兵月华袍`、`神兵火魅耳环`。
- 神兵破阵弓和神兵月华袍四档属性必须使用设计文档中的精确值。
- 典籍只在同一本、同一品质内累计；不跨品质累计，不覆写原始 `stages`。
- 相同属性相加，`攻防血`保持复合匹配，速度和敌方减属性同样参与累计。
- 默认仅展示品质最高阶累计结果：紫色/橙色10阶，橙金/红色/红金15阶。
- 每个品质独立提供详情/收起；详情显示0/5/10/15阶截至当前阶的累计成长。
- 具体品质排序使用该品质最高阶累计值；最高值排序比较各品质最高阶累计值。
- 非典籍装备的展示、筛选和排序逻辑保持不变。
- 项目验证由用户执行；实施代理只写测试契约并列命令，不运行测试、lint、格式检查或浏览器验收。
- 不修改用户 Excel，不更新 PWA，不合并 `master`，不推送远程。

## File Map

**Modify:**

- `tools/build_special_equipment.py`：神兵名称/属性覆盖，典籍累计 `max`。
- `tests/test_build_special_equipment.py`：生成数据契约。
- `data/special-equipment.js`：运行生成器得到的新数据。
- `js/query.js`：累计阶段、最高阶token与累计排序。
- `js/query.test.js`：累计和排序契约。
- `js/app.js`：最高阶摘要与按品质详情。
- `css/style.css`：累计摘要、详情按钮和展开区样式。
- `serve.test.js`：页面源码契约。

---

### Task 1: 修正生成源与装备数据

**Files:**

- Modify: `tests/test_build_special_equipment.py`
- Modify: `tools/build_special_equipment.py`
- Regenerate: `data/special-equipment.js`

**Interfaces:**

- Produces canonical equipment names and complete tier tokens consumed by all query/render code.
- Preserves the workbook and all unaffected parsed rows.

- [ ] **Step 1: Replace the obsolete empty-tier test with exact source contracts**

Add helpers/assertions equivalent to:

```python
def test_divine_equipment_name_normalization(self):
    names = {item["name"] for item in self.items}
    self.assertIn("神兵月狼锦纱", names)
    self.assertIn("神兵月华袍", names)
    self.assertIn("神兵火魅耳环", names)
    self.assertNotIn("神兵月狼", names)
    self.assertNotIn("神兵月华", names)
    self.assertNotIn("神兵火魅", names)

def test_new_divine_equipment_tiers(self):
    bow = next(i for i in self.items if i["name"] == "神兵破阵弓")
    robe = next(i for i in self.items if i["name"] == "神兵月华袍")
    self.assertEqual(
        [[t["raw"] for t in bow["tiers"][tier]] for tier in ("橙色", "橙金", "红色", "红金")],
        [["5%暴伤", "10%抗暴"], ["10%暴伤", "10%抗暴"], ["10%暴伤", "10%抗暴"], ["15%暴伤", "10%抗暴"]],
    )
    self.assertEqual(
        [[t["raw"] for t in robe["tiers"][tier]] for tier in ("橙色", "橙金", "红色", "红金")],
        [["6%穿透", "6%暴伤"], ["8%穿透", "8%暴伤"], ["10%穿透", "10%暴伤"], ["10%穿透", "15%暴伤"]],
    )
```

Add a book max assertion:

```python
def test_book_max_uses_final_cumulative_value(self):
    book = next(i for i in self.items if i["name"] == "神兵鬼谷子")
    self.assertEqual(book["max"]["暴击"], 41.0)
    self.assertEqual(book["max"]["抗暴"], 35.0)
```

- [ ] **Step 2: Record the user-owned validation command without running it**

```powershell
python -m unittest tests.test_build_special_equipment
```

- [ ] **Step 3: Add canonical-name and tier override constants**

In `tools/build_special_equipment.py` add:

```python
NAME_OVERRIDES = {
    "神兵月狼": "神兵月狼锦纱",
    "神兵月华": "神兵月华袍",
    "神兵火魅": "神兵火魅耳环",
}

TIER_OVERRIDES = {
    "神兵破阵弓": {
        "橙色": ["5%暴伤", "10%抗暴"],
        "橙金": ["10%暴伤", "10%抗暴"],
        "红色": ["10%暴伤", "10%抗暴"],
        "红金": ["15%暴伤", "10%抗暴"],
    },
    "神兵月华袍": {
        "橙色": ["6%穿透", "6%暴伤"],
        "橙金": ["8%穿透", "8%暴伤"],
        "红色": ["10%穿透", "10%暴伤"],
        "红金": ["10%穿透", "15%暴伤"],
    },
}
```

Canonicalize `name` before category/tier processing. When an override exists for a name+tier, build that tier exclusively from `parse_cell()` over the listed strings; otherwise retain the existing workbook parsing path. Continue feeding every numeric token to `update_max_map()`.

- [ ] **Step 4: Compute book max from each tier's final cumulative tokens**

Add a small Python helper that merges numeric tokens by `t`, preserves first-appearance order and `matches`, then updates the book `max_map` from every tier's final cumulative result. Do not change `stages` or flattened `tiers`. Remove the existing per-raw-token `update_max_map(max_map, token)` call inside the book stage loop so `max` is not left on the old single-token rule.

The helper must format aggregate raw values as:

```python
def format_token_raw(token, value):
    if token["t"] == "速":
        return f"{value:g}速"
    if token["t"].startswith("敌方减"):
        return f"敌方-{value:g}%{token['t'][3:]}"
    return f"{value:g}%{token['t']}"

def cumulative_numeric_tokens(stage_rows):
    totals = {}
    ordered = []
    for stage_row in stage_rows:
        for token in stage_row["tokens"]:
            if "t" not in token or not isinstance(token.get("v"), (int, float)):
                continue
            key = token["t"]
            if key not in totals:
                totals[key] = dict(token)
                totals[key]["v"] = 0.0
                ordered.append(key)
            totals[key]["v"] += token["v"]
    result = []
    for key in ordered:
        token = totals[key]
        token["raw"] = format_token_raw(token, token["v"])
        result.append(token)
    return result
```

After finishing one tier's `stage_rows`, call `update_max_map()` for every token from `cumulative_numeric_tokens(stage_rows)`.

- [ ] **Step 5: Regenerate the current data file as an implementation step**

Use the bundled Python runtime or project Python to run:

```powershell
python tools/build_special_equipment.py
```

This is the required data-generation mutation, not a validation run. Do not modify the workbook.

- [ ] **Step 6: Commit Task 1**

```powershell
git add tools/build_special_equipment.py tests/test_build_special_equipment.py data/special-equipment.js
git commit -m "fix: complete divine equipment source data"
```

---

### Task 2: 建立统一的典籍累计与排序逻辑

**Files:**

- Modify: `js/query.test.js`
- Modify: `js/query.js`

**Interfaces:**

- Produces `cumulativeBookStages(item, tier)` and `finalBookStage(item, tier)` for rendering.
- Changes `sortToken()` only for `item.bookGroup`; non-book behavior remains byte-for-byte equivalent in outcome.

- [ ] **Step 1: Expand the book fixture with real stage-shaped data**

Give the fixture book a `stages.红金` array whose repeated values prove accumulation, including:

```javascript
"红金": [
  { stage: 0, tokens: [{ t: "速", v: 150, raw: "150速" }] },
  { stage: 5, tokens: [
    { t: "攻防血", v: 12, raw: "12%攻防血", matches: ["攻", "防", "血", "攻防血"] },
    { t: "技免", v: 25, raw: "25%技免" },
    { t: "抗暴", v: 12, raw: "12%抗暴" }
  ] },
  { stage: 10, tokens: [
    { t: "攻防血", v: 16, raw: "16%攻防血", matches: ["攻", "防", "血", "攻防血"] },
    { t: "技免", v: 35, raw: "35%技免" },
    { t: "暴击", v: 16, raw: "16%暴击" }
  ] },
  { stage: 15, tokens: [
    { t: "攻防血", v: 23, raw: "23%攻防血", matches: ["攻", "防", "血", "攻防血"] },
    { t: "抗暴", v: 23, raw: "23%抗暴" },
    { t: "暴伤", v: 28, raw: "28%暴伤" },
    { t: "暴击", v: 25, raw: "25%暴击" }
  ] }
]
```

- [ ] **Step 2: Add cumulative stage and sorting contracts**

Assert that `cumulativeBookStages(item, "红金")` returns stages 0/5/10/15 and final values:

```javascript
{
  "速": 150,
  "攻防血": 51,
  "技免": 60,
  "抗暴": 35,
  "暴击": 41,
  "暴伤": 28
}
```

Also assert:

```javascript
assert.strictEqual(Q.sortValue(book, "攻", "红金"), 51);
assert.strictEqual(Q.sortValue(book, "技免", "红金"), 60);
assert.strictEqual(Q.sortValue(book, "暴击", "红金"), 41);
assert.strictEqual(Q.sortToken(book, "暴击", "红金").raw, "41%暴击");
```

Keep existing non-book `sortValue` assertions to provide compatibility coverage.

- [ ] **Step 3: Record the user-owned validation command without running it**

```powershell
node --test js/query.test.js
```

- [ ] **Step 4: Implement cumulative pure helpers**

In `js/query.js`, add helpers that:

1. Read `item.stages[tier]` in source order.
2. Merge numeric tokens by exact `t` and sum `v`.
3. Preserve the first occurrence order and copy `matches`.
4. Reformat `raw` as speed, enemy-reduction, or percent text.
5. Snapshot the aggregate tokens after each stage.
6. Return the last snapshot from `finalBookStage()`.

Use the following implementation shape and export both public helpers:

```javascript
function numberText(value) {
  return String(Number(value));
}

function cumulativeRaw(token, value) {
  if (token.t === "速") return numberText(value) + "速";
  if (token.t.indexOf("敌方减") === 0) {
    return "敌方-" + numberText(value) + "%" + token.t.slice(3);
  }
  return numberText(value) + "%" + token.t;
}

function cumulativeBookStages(item, tier) {
  var source = item && item.stages && item.stages[tier] || [];
  var totals = Object.create(null);
  var order = [];
  return source.map(function (stage) {
    (stage.tokens || []).forEach(function (token) {
      if (!token.t || typeof token.v !== "number") return;
      if (!totals[token.t]) {
        totals[token.t] = Object.assign({}, token, { v: 0 });
        order.push(token.t);
      }
      totals[token.t].v += token.v;
      totals[token.t].raw = cumulativeRaw(totals[token.t], totals[token.t].v);
    });
    return {
      stage: stage.stage,
      tokens: order.map(function (key) { return Object.assign({}, totals[key]); })
    };
  });
}

function finalBookStage(item, tier) {
  var stages = cumulativeBookStages(item, tier);
  return stages.length ? stages[stages.length - 1] : null;
}
```

Unknown/status tokens are not numeric book effects and therefore do not enter cumulative totals. This matches the current book source, whose effect cells are numeric tokens or blank.

- [ ] **Step 5: Route book sorting through final cumulative tokens**

In `sortToken()`:

- If `item.bookGroup` is truthy, build the candidate tier list from the requested tier or all existing stage tiers for `max`.
- For each candidate tier, inspect only `finalBookStage(item, tier).tokens`.
- Apply the existing `tokenMatches()` behavior and return the largest cumulative token.
- Otherwise execute the existing non-book tier scanning logic unchanged.

- [ ] **Step 6: Commit Task 2**

```powershell
git add js/query.js js/query.test.js
git commit -m "feat: accumulate book equipment effects"
```

---

### Task 3: 默认最高阶摘要与按品质成长详情

**Files:**

- Modify: `serve.test.js`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**

- Consumes `Q.cumulativeBookStages()` and `Q.finalBookStage()` from Task 2.
- Preserves current table/card selection and all non-book renderers.

- [ ] **Step 1: Add source-level rendering contracts**

In `serve.test.js`, add a test that loads `/js/app.js` and `/css/style.css` and asserts the implementation contains:

- calls to `Q.finalBookStage(item, tier)` and `Q.cumulativeBookStages(item, tier)`;
- the visible label `阶累计`;
- a per-tier `<details class="book-tier-details">` with “详情” and “收起” labels;
- scoped `.book-tier-summary` and `.book-tier-details` CSS;
- no use of the old always-expanded `bookStageHtml(item, tier, sharedStageCount)` table path.

- [ ] **Step 2: Record the user-owned validation command without running it**

```powershell
node --test serve.test.js js/query.test.js
```

- [ ] **Step 3: Replace the book stage renderer with summary/detail renderers**

Implement focused helpers in `js/app.js`:

```javascript
function bookStageRowsHtml(stages) {
  return `<div class="book-stage-list">${stages.map((stage) =>
    `<div class="book-stage-row"><span class="book-stage-label">${stage.stage}阶</span><span class="book-stage-values">${tokenHtml(stage.tokens, "")}</span></div>`
  ).join("")}</div>`;
}

function bookTierSummaryHtml(item, tier) {
  const finalStage = Q.finalBookStage(item, tier);
  if (!finalStage) return '<span class="tier-none">—</span>';
  return `<div class="book-tier-summary"><span class="book-tier-summary-label">${finalStage.stage}阶累计</span><span class="book-stage-values">${tokenHtml(finalStage.tokens, "")}</span></div>`;
}

function bookTierDetailsHtml(item, tier) {
  const stages = Q.cumulativeBookStages(item, tier);
  if (!stages.length) return "";
  return `<details class="book-tier-details"><summary><span class="details-open">详情</span><span class="details-close">收起</span></summary>${bookStageRowsHtml(stages)}</details>`;
}

function bookTierHtml(item, tier) {
  return `<div class="book-tier-block">${bookTierSummaryHtml(item, tier)}${bookTierDetailsHtml(item, tier)}</div>`;
}
```

`bookTierSummaryHtml()` must derive the stage label from `Q.finalBookStage()` rather than hard-code 10/15. `bookTierDetailsHtml()` must start closed and render every cumulative stage returned by the query core.

- [ ] **Step 4: Use the same tier block in desktop tables and mobile cards**

- In `equipmentTableHtml()`, book cells render `bookTierHtml(item, tier)` and remove shared row-count sizing.
- In `bookCardTiersHtml()`, keep the quality label visible but do not open any quality by default; render the same highest-stage summary and nested detail control.
- `tokenHtml()` remains responsible for active-filter highlighting, so cumulative tokens receive the existing highlighted style.
- `sortBadge()` continues to call `Q.sortToken()` and automatically displays cumulative values from Task 2.

- [ ] **Step 5: Add compact scoped styles**

Replace obsolete fixed-height book-stage grid assumptions with styles for:

```css
#partition-equipment .book-tier-summary { display: grid; gap: 5px; }
#partition-equipment .book-tier-summary-label { color: var(--gold-dim); font-size: 12px; }
#partition-equipment .book-tier-details { margin-top: 7px; border-top: 1px dashed rgba(58,49,37,.6); }
#partition-equipment .book-tier-details > summary { cursor: pointer; color: var(--gold); list-style: none; }
#partition-equipment .book-tier-details .details-close { display: none; }
#partition-equipment .book-tier-details[open] .details-open { display: none; }
#partition-equipment .book-tier-details[open] .details-close { display: inline; }
```

Keep cumulative attribute tokens left-aligned and the complete tier block centered inside its cell. Add only necessary narrow-screen adjustments inside the existing equipment mobile breakpoint.

- [ ] **Step 6: Commit Task 3**

```powershell
git add serve.test.js js/app.js css/style.css
git commit -m "feat: summarize cumulative book tiers"
```

---

## Final Handoff

After all task reviews and the final whole-branch review:

- Stop on `codex/book-cumulative-summary`.
- Do not update `service-worker.js` or `js/pwa.js`.
- Do not merge `master` or push remote.
- Tell the user the change is ready and ask separately whether to update PWA and/or merge.
- State that implementation agents did not run validation under project policy.
- Suggest the user run:

```powershell
python -m unittest tests.test_build_special_equipment
node --test js/query.test.js serve.test.js
```

- Manual checks: verify both new divine items; confirm all three canonical names; confirm default book cells show only 10/15阶累计; expand and collapse each tier; confirm 神兵鬼谷子 red-gold totals and sorting; confirm non-book rows remain unchanged.
