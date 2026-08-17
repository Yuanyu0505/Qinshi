# 数据错别字标准化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图鉴和橙装锻造无论读取当前还是未来含错字的工作簿，都只生成“墨眉”和“惊鲵”。

**Architecture:** 在两个数据生成器入口增加小范围显式映射，所有名称字段复用同一标准化函数，再由生成器重建运行时数据。工作簿保持只读，测试直接验证源文件含错字时输出仍正确。

**Tech Stack:** Python 3、openpyxl、unittest、静态 JavaScript 数据文件

## Global Constraints

- 不修改 `秦时相关（更新贯侯钟离昧）20260618.xlsx`。
- 不提交用户的 `答题.jpg`。
- 不更新 PWA、Service Worker 或 GitHub Pages，不推送 GitHub。
- AI 按项目约定不运行测试、lint、格式化或浏览器验证；计划中的命令仅列为用户手动验证建议。
- 完成后提交并快进合并到本地 `master`。

---

### Task 1: 为两个生成器增加错别字回归契约

**Files:**
- Modify: `tests/test_build_atlas.py`
- Modify: `tests/test_build_forging.py`

**Interfaces:**
- Consumes: `tools.build_atlas.normalize_text(value)`、`tools.build_forging.normalize_text(value)`。
- Produces: 两个生成器的固定标准化契约和运行数据无错字断言。

- [ ] **Step 1: 增加图鉴标准化测试**

```python
from tools.build_atlas import normalize_text, parse_sheet

def test_typo_normalization(self):
    self.assertEqual(normalize_text(" 墨梅 "), "墨眉")
    self.assertEqual(normalize_text("墨眉"), "墨眉")
    self.assertFalse(any(
        token["n"] == "墨梅"
        for item in self.items
        for stage in item["stages"]
        for token in stage["items"]
    ))
    item = next(item for item in self.items if item["name"] == "神·侠道天明")
    self.assertEqual(item["stages"][2]["items"][0]["n"], "墨眉")
```

- [ ] **Step 2: 增加锻造标准化测试**

```python
from tools.build_forging import normalize_text, parse_sheet

def test_typo_normalization(self):
    self.assertEqual(normalize_text(" 惊倪 "), "惊鲵")
    self.assertEqual(normalize_text("惊鲵"), "惊鲵")
    self.assertFalse(any(
        token.get("n") == "惊倪"
        for item in self.items
        for stage in item["stages"]
        for token in stage["tokens"]
    ))
```

- [ ] **Step 3: 记录用户手动验证命令**

```powershell
& $python -m unittest tests.test_build_atlas tests.test_build_forging -v
```

预期：新增契约覆盖“墨梅→墨眉”和“惊倪→惊鲵”。AI 不执行该命令。

### Task 2: 在生成器入口统一标准化文本

**Files:**
- Modify: `tools/build_atlas.py`
- Modify: `tools/build_forging.py`

**Interfaces:**
- Produces: `normalize_text(value) -> str`，负责去除首尾空白和两个已确认错别字映射。

- [ ] **Step 1: 在两个生成器定义相同的显式映射**

```python
TYPO_FIXES = {
    "墨梅": "墨眉",
    "惊倪": "惊鲵",
}


def normalize_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    return TYPO_FIXES.get(text, text)
```

图鉴生成器保留 `cell_text` 作为兼容别名或将所有调用改为 `normalize_text`；锻造生成器的主装备名、汇总文字和 `parse_tokens` 输出名称统一调用该函数。

- [ ] **Step 2: 确保拆分后的每个装备 token 单独标准化**

```python
return [
    {"n": normalize_text(part), "q": quality}
    for part in SPLIT_RE.split(s)
    if normalize_text(part)
]
```

- [ ] **Step 3: 记录用户手动验证命令**

```powershell
& $python -m unittest tests.test_build_atlas tests.test_build_forging -v
```

### Task 3: 重建运行数据并清理错误示例

**Files:**
- Modify: `data/atlas.js`
- Modify: `data/forging.js`
- Modify: `docs/superpowers/plans/2026-08-10-atlas-equipment-order-layout.md`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: 已标准化的两个生成器。
- Produces: 不含 `墨梅` 或 `惊倪` 的运行时数据。

- [ ] **Step 1: 使用现有工作簿重新生成数据**

```powershell
& $python tools/build_atlas.py
& $python tools/build_forging.py
```

- [ ] **Step 2: 将历史计划中的数据示例“墨梅”改为“墨眉”**

只改示例文字，不改历史设计结论。

- [ ] **Step 3: 在 HANDOVER 数据生成规则中记录标准化映射**

明确工作簿保持原样、生成器输出统一名称。

- [ ] **Step 4: 建议用户手动检查错误写法已消失**

```powershell
rg -n --hidden -g '!*.xlsx' -g '!.git/**' -g '!.worktrees/**' "墨梅|惊倪" data tools tests js index.html HANDOVER.md docs
```

预期：没有运行时、生成器、测试或用户文档匹配。

- [ ] **Step 5: 提交并合并**

```powershell
git add tools/build_atlas.py tools/build_forging.py tests/test_build_atlas.py tests/test_build_forging.py data/atlas.js data/forging.js docs/superpowers/plans/2026-08-10-atlas-equipment-order-layout.md HANDOVER.md
git commit -m "fix: normalize atlas and forging names"
git -C C:\Users\pghyl\Desktop\deepseek merge --ff-only codex/atlas-tactics-planning
```
