# 图鉴目标等级升级统计与阶段箭头 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 读取图鉴升级成本表，为图鉴提供可持久化的目标等级、单条和筛选结果汇总升级统计，并统一图鉴和橙装锻造的升级阶段箭头文案。

**Architecture:** `tools/build_atlas.py` 将 `图鉴汇总!T51:X69` 解析为 `ATLAS_DATA.meta.upgradeStages`；`js/atlas.js` 负责纯升级计划与汇总计算；`js/app.js` 保存目标等级并渲染结果。阶段标签由构建脚本生成，避免直接维护生成数据。

**Tech Stack:** Python + openpyxl、原生 HTML/CSS/JavaScript（UMD）、浏览器 `localStorage`。

## Global Constraints

- 不修改 Excel 源文件；只读取 `图鉴汇总!T50:X70`。
- 目标等级默认 19，可在升级表最大等级（当前 20）内调整。
- 成本从当前等级之后到目标等级之前的所有升级阶段累计。
- 实际装备从图鉴弟子记录中统计，W 列只作为需要装备阶段的来源标记。
- `14→15` 及之后成长值为 0，页面明确提示 14 级后不再获得成长值。
- 升级含义的阶段文本统一使用 `→`；关卡编号等非升级文本保持不变。
- 按 `AGENTS.md`，AI 不运行测试、lint、格式检查或页面验证；由用户手动验收。

---

### Task 1: 构建图鉴升级成本元数据与箭头阶段标签

**Files:**
- Modify: `tools/build_atlas.py`
- Modify: `tools/build_forging.py`
- Modify: `tests/test_build_atlas.py`
- Modify: `tests/test_build_forging.py`
- Modify: `data/atlas.js`（由构建脚本生成）
- Modify: `data/forging.js`（由构建脚本生成）

**Interfaces:**
- Produces: `ATLAS_DATA.meta.upgradeStages`, `maxLevel`, `defaultTargetLevel`。
- Produces: 所有图鉴与橙装锻造升级阶段使用箭头的生成数据。

- [ ] **Step 1: 图鉴阶段键改为箭头**

将：

```python
STAGES = [("5--6", 6), ("7--8", 8), ("9--10", 10)]
```

改为：

```python
STAGES = [("5→6", 6), ("7→8", 8), ("9→10", 10)]
```

- [ ] **Step 2: 解析 T51:X69 的升级成本表**

新增 `parse_upgrade_stages(ws)`，逐行读取 T、U、V、W、X：

```python
{
  "key": "1→2",
  "from": 1,
  "to": 2,
  "knots": 35,
  "souls": 20,
  "needsEquipment": False,
  "growth": 1,
}
```

将原始 T 列 `1-2` 解析为整数 `from=1`、`to=2`，再生成箭头键。W 列非空且数值大于 0 时 `needsEquipment=True`。

- [ ] **Step 3: 扩展图鉴元信息**

在 `build_data()` 写入：

```python
"upgradeStages": upgrade_stages,
"maxLevel": max(stage["to"] for stage in upgrade_stages),
"defaultTargetLevel": min(max(item["level"] for item in items), max_level),
```

当前生成结果应为最高等级 20、默认目标等级 19。

- [ ] **Step 4: 橙装锻造阶段改为箭头**

把 `tools/build_forging.py` 的阶段数组改为：

```python
STAGE_NAMES = [
  "0→1锻", "1→2锻", "2→3锻", "3→4锻", "4→5锻", "5→6锻",
  "6→7锻", "7→8锻", "8→9锻", "9→10锻", "10锻→红金",
]
```

- [ ] **Step 5: 同步构建测试期望并重新生成数据**

更新 Python 构建测试中的箭头期望。使用项目的 bundled Python 重新生成：

```powershell
& $python tools/build_atlas.py
& $python tools/build_forging.py
```

该步骤只更新由构建脚本管理的 `data/atlas.js` 与 `data/forging.js`。

### Task 2: 图鉴升级计划与汇总纯逻辑

**Files:**
- Modify: `js/atlas.js`
- Modify: `js/atlas.test.js`

**Interfaces:**
- Produces: `upgradePlan(item, currentLevel, targetLevel, upgradeStages)`。
- Produces: `summarizeUpgrade(items, levels, targetLevel, upgradeStages)`。

- [ ] **Step 1: 计算单条升级计划**

`upgradePlan` 只选择满足 `currentLevel < stage.to <= targetLevel` 的成本阶段，返回：

```js
{
  currentLevel: 5,
  targetLevel: 19,
  reached: false,
  knots: 3558,
  souls: 595,
  growth: 29,
  equipmentStages: [
    { key: "5→6", items: [{ n: "冰魄戒", q: "紫" }] },
    { key: "7→8", items: [{ n: "墨眉", q: "橙" }] },
    { key: "9→10", items: [{ n: "黄帝内经", q: "橙" }] }
  ]
}
```

`equipmentStages` 还必须满足当前等级小于阶段结束等级且阶段结束等级不高于目标等级。

- [ ] **Step 2: 汇总多条升级计划**

`summarizeUpgrade` 遍历当前筛选结果，只统计 `reached=false` 的计划，返回未达标人数、绳结、魂魄、成长值及按“名称 + 品质”聚合的装备数组：

```js
{ n: "墨眉", q: "橙", count: 3 }
```

- [ ] **Step 3: 增加逻辑测试样例**

更新现有图鉴阶段键为箭头，并新增覆盖：

```js
assert.strictEqual(A.upgradePlan(item, 19, 19, stages).reached, true);
assert.deepStrictEqual(A.upgradePlan(item, 5, 7, stages).equipmentStages.map(s => s.key), ["5→6"]);
assert.strictEqual(A.upgradePlan(item, 13, 19, stages).growth, 7);
```

同时验证汇总按装备名称和品质正确累加。

### Task 3: 图鉴目标等级界面与高亮展示

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `ATLAS_DATA.meta.upgradeStages`, `maxLevel`, `defaultTargetLevel`。
- Persists: `qinshi_atlas_target_level_v1`。

- [ ] **Step 1: 增加目标等级与汇总容器**

在图鉴筛选面板中增加：

```html
<div class="filter-row">
  <span class="filter-label">目标等级</span>
  <input id="atlas-target-level" type="number" min="1" step="1">
</div>
<div class="muted-tip">达到目标等级即视为完成；14级后不再获得成长值。</div>
```

在 `#atlas-results` 前增加 `#atlas-upgrade-summary`。

- [ ] **Step 2: 维护及保存目标等级**

在 `js/app.js` 新增常量 `ATLAS_TARGET_LEVEL_KEY`、元素引用和 `atlasState.targetLevel`。加载时从新键读取；数值无效、低于 1 或高于 `ATLAS_DATA.meta.maxLevel` 时回退为 `defaultTargetLevel`。输入变更后保存并重新渲染。

- [ ] **Step 3: 渲染当前筛选结果升级总汇**

`applyAtlas()` 在完成分区、关键词和等级筛选后调用 `ATLAS.summarizeUpgrade()`。总汇展示目标等级、未达标人数、明鬼绳结、魂魄、成长值、装备数量和“14级后不再获得成长值”说明；无未达标弟子时显示已全部达到目标等级。

- [ ] **Step 4: 渲染单条目标差额与实际装备**

`atlasItemHtml()` 调用 `ATLAS.upgradePlan()`：

- 达标：显示“已达到目标等级”；
- 未达标：显示绳结、魂魄、成长值与装备阶段列表；
- 若目标区间没有装备阶段：显示“该目标区间无需装备”。

图鉴的原有阶段装备列表使用目标等级上限过滤，避免显示高于目标的装备。

- [ ] **Step 5: 高亮所属图鉴名称与样式**

将元信息中的所属图鉴值改为：

```html
所属图鉴：<span class="atlas-group">非攻墨门</span>
```

新增目标等级输入、升级汇总、单卡升级摘要和 `.atlas-group` 的样式；高亮使用金色文字、半透明金色底和圆角标签，保持当前深色主题。

### Task 4: 阶段文本、说明与交付

**Files:**
- Modify: `js/forging.test.js`
- Modify: `js/progress.test.js`
- Modify: `README.md`

**Interfaces:**
- Documents: 图鉴目标等级与材料统计功能。

- [ ] **Step 1: 同步锻造测试夹具文案**

将所有测试夹具的 `0-1锻`、`9-10锻`、`10锻-红金` 等升级标签替换为对应箭头写法，保证测试样例和构建数据一致。

- [ ] **Step 2: 更新使用说明**

在 README 图鉴描述中加入：可设置目标等级、统计升至目标所需明鬼绳结/魂魄/装备/成长值，且 14 级后无成长值。

- [ ] **Step 3: 提交累计功能分支**

```powershell
git add -- tools/build_atlas.py tools/build_forging.py data/atlas.js data/forging.js js/atlas.js js/atlas.test.js js/app.js index.html css/style.css js/forging.test.js js/progress.test.js tests/test_build_atlas.py tests/test_build_forging.py README.md docs/superpowers/plans/2026-08-10-atlas-upgrade-target.md
git commit -m "feat: add atlas upgrade target summary"
```
