# 特殊属性装备查询模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建离线本地「特殊属性装备」查询网页，支持名称/分类搜索、最多双属性筛选、按属性数值倒序（最高值/红色/红金），并提供同一局域网内手机访问。

**Architecture:** 纯静态多文件网页，`file://` 双击可用；Node 标准库静态服务支撑手机访问；Python 解析脚本一次性从 Excel 生成数据文件；查询/筛选/排序为无 DOM 依赖的纯函数模块（UMD），UI 层只做渲染与事件绑定。

**Tech Stack:** HTML + CSS + 原生 JS（零依赖零框架）；Node.js ≥ 18（本机 v24.16.0，内置 `node:test`）；Python 3 + openpyxl（仅开发与数据再生成用）。

## Global Constraints

- 数据源：`C:\Users\pghyl\Desktop\deepseek\秦时相关（更新贯侯钟离昧）20260618.xlsx`，Sheet「特殊属性装备」= `wb.worksheets[3]`
- 全部离线：不使用 CDN、外部字体、网络请求；字体只用系统字体栈
- 页面必须同时兼容 `file://` 双击打开与 `http://` 局域网访问；不使用 `fetch`，数据经 `<script src>` 加载
- 主属性只参与筛选，不产生排序数值；排序值只取副属性百分比
- 数据模型与查询规则严格遵循 `docs/superpowers/specs/2026-08-07-special-equipment-module-design.md`
- 系统 PATH 无 python，Python 命令一律使用 Codex 运行时：`C:\Users\pghyl\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`（下文简称 `$python`）
- git 写操作在沙箱内被拒：所有 `git add` / `git commit` 必须以 `require_escalated` 运行，并携带 `-c safe.directory=C:/Users/pghyl/Desktop/deepseek`
- 仓库本地身份已配置（pghyl <pghyl@local>）
- 设计规格中所有界面文案使用中文；代码、变量、提交信息用英文

## File Structure

| 文件 | 职责 |
| --- | --- |
| `tools/build_special_equipment.py` | 解析 Excel → 生成 `data/special-equipment.js`（可独立运行） |
| `tests/test_build_special_equipment.py` | 解析脚本的 Python 单元测试（unittest） |
| `data/special-equipment.js` | 生成数据：`window.SPECIAL_EQUIPMENT_DATA`（勿手改） |
| `js/query.js` | 查询/筛选/排序纯逻辑，UMD，浏览器暴露 `window.QSQuery` |
| `js/query.test.js` | query.js 单元测试（node:test） |
| `serve.js` | Node 静态服务：局域网手机访问、自动开浏览器 |
| `serve.test.js` | 静态服务测试（node:test） |
| `启动服务.bat` | 双击启动服务 |
| `index.html` | 页面骨架（深色水墨古风） |
| `css/style.css` | 全部样式 + 响应式（≤720px 卡片布局） |
| `js/app.js` | DOM 渲染与交互（表格/卡片、芯片、排序控件、空状态） |
| `README.md` | 使用说明与测试命令 |

---

## Task 1: Python 解析脚本与数据文件生成

**Files:**
- Create: `tools/build_special_equipment.py`
- Create: `tests/test_build_special_equipment.py`
- Produce: `data/special-equipment.js`

**Interfaces:**
- Consumes: 上述 xlsx（Sheet 索引 3）
- Produces:
  - `parse_cell(value) -> dict | None`：属性 token `{"t": str, "v": float, "raw": str}`、状态 token `{"s": str}`、空/空白 → None
  - `parse_sheet(path) -> (list[dict], list[dict])`：`(items, anomalies)`
  - `build_data(path, out_path) -> dict`：生成 JS 文件并返回 payload
  - item 结构：`{id, cat, name, main, tiers: {"橙色": [...], "橙金": [...], "红色": [...], "红金": [...]}, max: {attr: number}}`

- [ ] **Step 1: 写失败测试**

```python
import os
import unittest
from collections import Counter

from tools.build_special_equipment import parse_cell, parse_sheet

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestParseCell(unittest.TestCase):
    def test_attr(self):
        self.assertEqual(parse_cell("5%血"), {"t": "血", "v": 5.0, "raw": "5%血"})

    def test_decimal(self):
        self.assertEqual(parse_cell("6.5%穿透")["v"], 6.5)

    def test_status(self):
        self.assertEqual(parse_cell("暂未开放"), {"s": "暂未开放"})
        self.assertEqual(parse_cell("无"), {"s": "无"})

    def test_blank(self):
        self.assertIsNone(parse_cell(None))
        self.assertIsNone(parse_cell("   "))

    def test_normalize(self):
        self.assertEqual(parse_cell("10%血量")["t"], "血")
        self.assertEqual(parse_cell("10%血量")["raw"], "10%血量")


class TestParseSheet(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items, cls.anomalies = parse_sheet(XLSX)

    def test_total(self):
        self.assertEqual(len(self.items), 123)

    def test_category_counts(self):
        c = Counter(i["cat"] for i in self.items)
        self.assertEqual(c["武器"], 11)
        self.assertEqual(c["防具"], 13)
        self.assertEqual(c["饰品"], 13)
        self.assertEqual(c["神兵武器"], 44)
        self.assertEqual(c["神兵防具"], 21)
        self.assertEqual(c["神兵饰品"], 21)

    def test_no_anomalies(self):
        self.assertEqual(self.anomalies, [])

    def test_ids_unique(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_main_attrs(self):
        for i in self.items:
            if i["cat"].endswith("武器"):
                self.assertEqual(i["main"], "攻")
            elif i["cat"].endswith("防具"):
                self.assertEqual(i["main"], "防")
            else:
                self.assertEqual(i["main"], "血")

    def test_sample_shuori(self):
        item = next(i for i in self.items if i["name"] == "朔日辉光")
        self.assertEqual(item["cat"], "武器")
        self.assertEqual(
            item["tiers"]["橙色"],
            [{"t": "血", "v": 5.0, "raw": "5%血"}, {"t": "穿透", "v": 5.0, "raw": "5%穿透"}],
        )
        self.assertEqual(item["max"]["血"], 10.0)
        self.assertEqual(item["max"]["穿透"], 15.0)

    def test_sample_empty_tiers(self):
        item = next(i for i in self.items if i["name"] == "神兵破阵弓")
        self.assertEqual(item["tiers"]["红金"], [])

    def test_status_token(self):
        item = next(i for i in self.items if i["name"] == "秦时周年历")
        self.assertEqual(item["tiers"]["橙色"], [{"s": "暂未开放"}])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `& $python -m unittest discover -s tests -v`
Expected: FAIL，`ModuleNotFoundError: No module named 'tools'`

- [ ] **Step 3: 实现解析脚本**

```python
#!/usr/bin/env python3
"""解析《特殊属性装备》Sheet，生成 data/special-equipment.js。

用法：
    python tools/build_special_equipment.py [Excel路径]
默认使用项目根目录下的《秦时相关（更新贯侯钟离昧）20260618.xlsx》。
"""
import json
import os
import re
import sys
from collections import Counter
from datetime import date

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")
OUT_JS = os.path.join(ROOT, "data", "special-equipment.js")

# 每个区块 10 列：名称、主属性、4 档 × 2 列（1-based 列号）
BLOCKS = {
    "武器": {"name": 2, "main": 3, "tiers": {"橙色": [4, 5], "橙金": [6, 7], "红色": [8, 9], "红金": [10, 11]}},
    "防具": {"name": 13, "main": 14, "tiers": {"橙色": [15, 16], "橙金": [17, 18], "红色": [19, 20], "红金": [21, 22]}},
    "饰品": {"name": 24, "main": 25, "tiers": {"橙色": [26, 27], "橙金": [28, 29], "红色": [30, 31], "红金": [32, 33]}},
}
HEADER_NAMES = {"武器名称", "防具名称", "饰品名称", "神兵武器名称", "神兵防具名称", "神兵饰品名称"}
ATTR_PAT = re.compile(r"^(\d+(?:\.\d+)?)%\s*(.+)$")
NORMALIZE = {"血量": "血"}
STATUSES = {"无", "暂未开放"}
ATTR_ORDER = ["攻", "血", "防", "穿透", "暴击", "暴伤", "减伤", "抗暴", "减免"]
CATEGORY_ORDER = ["武器", "防具", "饰品", "神兵武器", "神兵防具", "神兵饰品"]


def parse_cell(value):
    """单个单元格 → token dict / None。"""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s in STATUSES:
        return {"s": s}
    m = ATTR_PAT.match(s)
    if not m:
        return {"raw": s}
    t = NORMALIZE.get(m.group(2).strip(), m.group(2).strip())
    return {"t": t, "v": float(m.group(1)), "raw": s}


def parse_sheet(path):
    """解析工作簿，返回 (items, anomalies)。"""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.worksheets[3]  # 特殊属性装备
    rows = list(ws.iter_rows(values_only=True))
    items = []
    anomalies = []
    for r in range(2, ws.max_row + 1):
        if r == 20:  # 神兵区块表头行
            continue
        row = rows[r - 1]
        for base, b in BLOCKS.items():
            raw_name = row[b["name"] - 1]
            if raw_name is None:
                continue
            name = str(raw_name).strip()
            if not name or name in HEADER_NAMES:
                continue
            main = str(row[b["main"] - 1]).strip() if row[b["main"] - 1] is not None else ""
            cat = "神兵" + base if r >= 21 else base
            tiers = {}
            max_map = {}
            for tier, cols in b["tiers"].items():
                tokens = []
                for c in cols:
                    tok = parse_cell(row[c - 1])
                    if tok is None:
                        continue
                    tokens.append(tok)
                    if "t" in tok:
                        max_map[tok["t"]] = max(max_map.get(tok["t"], 0), tok["v"])
                    elif "raw" in tok:
                        anomalies.append(
                            {"row": r, "cat": cat, "name": name, "tier": tier, "cell": tok["raw"]}
                        )
                tiers[tier] = tokens
            prefix = {"武器": "w", "防具": "f", "饰品": "s"}[base]
            items.append({
                "id": f"{prefix}-{len(items) + 1:04d}",
                "cat": cat,
                "name": name,
                "main": main,
                "tiers": tiers,
                "max": max_map,
            })
    return items, anomalies


def build_data(path, out_path):
    items, anomalies = parse_sheet(path)
    if anomalies:
        for a in anomalies:
            print("异常单元格:", a)
        raise SystemExit("存在无法解析的单元格，已中止生成。")
    observed = Counter()
    for item in items:
        observed.update(item["max"].keys())
    attr_types = [a for a in ATTR_ORDER if a in observed]
    attr_types += sorted(observed.keys() - set(ATTR_ORDER))
    m = re.search(r"(\d{8})", os.path.basename(path))
    payload = {
        "meta": {
            "sourceFile": os.path.basename(path),
            "sourceSheet": "特殊属性装备",
            "version": m.group(1) if m else "unknown",
            "generatedAt": date.today().isoformat(),
            "total": len(items),
            "attrTypes": attr_types,
            "categories": CATEGORY_ORDER,
        },
        "items": items,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    js = (
        "/* 由 tools/build_special_equipment.py 自动生成，请勿手改 */\n"
        "window.SPECIAL_EQUIPMENT_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)
    counts = Counter(i["cat"] for i in items)
    print(f"生成完成：{out_path}")
    print(f"装备总数：{len(items)}")
    for cat in CATEGORY_ORDER:
        print(f"  {cat}: {counts.get(cat, 0)}")
    print("属性类型：", "、".join(attr_types))
    return payload


if __name__ == "__main__":
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    build_data(xlsx, OUT_JS)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `& $python -m unittest discover -s tests -v`
Expected: PASS，`Ran 13 tests`

- [ ] **Step 5: 生成数据文件**

Run: `& $python tools/build_special_equipment.py`
Expected 输出：
```
生成完成：...\data\special-equipment.js
装备总数：123
  武器: 11
  防具: 13
  饰品: 13
  神兵武器: 44
  神兵防具: 21
  神兵饰品: 21
属性类型：攻、血、防、穿透、暴击、暴伤、减伤、抗暴、减免
```

- [ ] **Step 6: 验证数据文件可被 Node 加载**

Run:
```
node -e "global.window={}; require('./data/special-equipment.js'); const d=window.SPECIAL_EQUIPMENT_DATA; if(d.items.length!==123) throw new Error('bad total'); console.log('OK', d.meta.total, d.meta.attrTypes.join('/'));"
```
Expected: `OK 123 攻/血/防/穿透/暴击/暴伤/减伤/抗暴/减免`

- [ ] **Step 7: 提交（需 escalate）**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek add tools/build_special_equipment.py tests/test_build_special_equipment.py data/special-equipment.js
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek commit -m "feat(tools): special equipment data parser and generated data"
```

---

## Task 2: 查询核心 js/query.js

**Files:**
- Create: `js/query.js`
- Create: `js/query.test.js`

**Interfaces:**
- Consumes: Task 1 的 item 结构（`{id, cat, name, main, tiers, max}`）
- Produces（UMD 全局 `window.QSQuery` / `require("./query.js")`）：
  - `CATEGORY_ORDER: string[]`、`TIER_ORDER: string[]`、`VALUE_SOURCES: string[]`
  - `normalizeInput(s) -> string`
  - `matchSearch(item, query) -> boolean`
  - `hasAttr(item, attr) -> boolean`
  - `matchFilters(item, filters: string[]) -> boolean`
  - `sortValue(item, attr, valueSource: "max"|"红色"|"红金") -> number|null`
  - `queryItems(items, opts) -> item[]`，opts = `{search, filters, sortAttr, valueSource}`

- [ ] **Step 1: 写失败测试**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const Q = require("./query.js");

const fixture = [
  { id: "w-0001", cat: "武器", name: "朔日辉光", main: "攻",
    tiers: {
      "橙色": [{ t: "血", v: 5 }, { t: "穿透", v: 5 }],
      "橙金": [{ t: "血", v: 8 }, { t: "穿透", v: 8 }],
      "红色": [{ t: "血", v: 10 }, { t: "穿透", v: 10 }],
      "红金": [{ t: "血", v: 10 }, { t: "穿透", v: 15 }]
    },
    max: { "血": 10, "穿透": 15 } },
  { id: "f-0001", cat: "防具", name: "吉祥如意", main: "防",
    tiers: { "橙色": [{ s: "无" }], "橙金": [{ s: "无" }], "红色": [{ s: "无" }], "红金": [{ s: "无" }] },
    max: {} },
  { id: "s-0001", cat: "饰品", name: "月光耳坠", main: "血",
    tiers: {
      "橙色": [{ t: "血", v: 10 }, { t: "暴击", v: 5 }],
      "橙金": [{ t: "血", v: 20 }, { t: "暴击", v: 5 }],
      "红色": [{ t: "血", v: 25 }, { t: "暴击", v: 5 }],
      "红金": [{ t: "血", v: 30 }, { t: "暴击", v: 8 }]
    },
    max: { "血": 30, "暴击": 8 } },
  { id: "w-0045", cat: "神兵武器", name: "神兵破阵弓", main: "攻",
    tiers: { "橙色": [], "橙金": [], "红色": [], "红金": [] },
    max: {} },
  { id: "s-0003", cat: "神兵饰品", name: "神兵月光", main: "血",
    tiers: {
      "橙色": [{ t: "血", v: 10 }, { t: "暴击", v: 6 }],
      "橙金": [{ t: "血", v: 20 }, { t: "暴击", v: 8 }],
      "红色": [{ t: "血", v: 25 }, { t: "暴击", v: 8 }],
      "红金": [{ t: "血", v: 30 }, { t: "暴击", v: 12 }]
    },
    max: { "血": 30, "暴击": 12 } },
  { id: "s-0002", cat: "神兵饰品", name: "测试饰品", main: "血",
    tiers: { "橙色": [{ s: "暂未开放" }], "橙金": [{ s: "暂未开放" }], "红色": [{ s: "暂未开放" }], "红金": [{ s: "暂未开放" }] },
    max: {} }
];

test("matchSearch：名称子串", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], "辉光"), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "不存在"), false);
});

test("matchSearch：分类关键词", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], "武器"), true);
  assert.strictEqual(Q.matchSearch(fixture[3], "武器"), true);
  assert.strictEqual(Q.matchSearch(fixture[3], "神兵"), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "神兵"), false);
});

test("matchSearch：空输入返回全部", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], ""), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "   "), true);
});

test("hasAttr：主属性也算命中", () => {
  assert.strictEqual(Q.hasAttr(fixture[0], "攻"), true);
  assert.strictEqual(Q.hasAttr(fixture[2], "血"), true);
});

test("hasAttr：副属性命中、状态不命中", () => {
  assert.strictEqual(Q.hasAttr(fixture[0], "穿透"), true);
  assert.strictEqual(Q.hasAttr(fixture[1], "攻"), false);
});

test("matchFilters：AND 语义", () => {
  assert.strictEqual(Q.matchFilters(fixture[0], ["血", "穿透"]), true);
  assert.strictEqual(Q.matchFilters(fixture[0], ["血", "暴击"]), false);
});

test("sortValue：最高值", () => {
  assert.strictEqual(Q.sortValue(fixture[0], "穿透", "max"), 15);
  assert.strictEqual(Q.sortValue(fixture[1], "攻", "max"), null);
});

test("sortValue：红色/红金档", () => {
  assert.strictEqual(Q.sortValue(fixture[2], "血", "红色"), 25);
  assert.strictEqual(Q.sortValue(fixture[2], "血", "红金"), 30);
  assert.strictEqual(Q.sortValue(fixture[0], "穿透", "红色"), 10);
  assert.strictEqual(Q.sortValue(fixture[1], "攻", "红金"), null);
});

test("queryItems：无筛选按分类顺序", () => {
  const r = Q.queryItems(fixture, {});
  assert.deepStrictEqual(r.map(i => i.name), ["朔日辉光", "吉祥如意", "月光耳坠", "神兵破阵弓", "测试饰品", "神兵月光"]);
});

test("queryItems：筛选后按最高值倒序，无值排最后", () => {
  const r = Q.queryItems(fixture, { filters: ["血"] });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "神兵月光", "朔日辉光", "测试饰品"]);
});

test("queryItems：可切换取值档位", () => {
  const r = Q.queryItems(fixture, { filters: ["血"], valueSource: "红色" });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "神兵月光", "朔日辉光", "测试饰品"]);
});

test("queryItems：双筛选 + 切换排序属性", () => {
  const byCrit = Q.queryItems(fixture, { filters: ["血", "暴击"], sortAttr: "暴击" });
  assert.deepStrictEqual(byCrit.map(i => i.name), ["神兵月光", "月光耳坠"]);
  const byBlood = Q.queryItems(fixture, { filters: ["血", "暴击"], sortAttr: "血" });
  assert.deepStrictEqual(byBlood.map(i => i.name), ["月光耳坠", "神兵月光"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test js/query.test.js`
Expected: FAIL，`Cannot find module './query.js'`

- [ ] **Step 3: 实现 query.js**

```js
/**
 * 特殊属性装备 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.QSQuery；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QSQuery = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CATEGORY_ORDER = ["武器", "防具", "饰品", "神兵武器", "神兵防具", "神兵饰品"];
  var TIER_ORDER = ["橙色", "橙金", "红色", "红金"];
  var VALUE_SOURCES = ["max", "红色", "红金"];

  function normalizeInput(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function matchSearch(item, query) {
    var q = normalizeInput(query);
    if (!q) return true;
    return item.name.toLowerCase().indexOf(q) !== -1 ||
           item.cat.toLowerCase().indexOf(q) !== -1;
  }

  function hasAttr(item, attr) {
    if (item.main === attr) return true;
    for (var i = 0; i < TIER_ORDER.length; i++) {
      var tokens = item.tiers[TIER_ORDER[i]] || [];
      for (var j = 0; j < tokens.length; j++) {
        if (tokens[j].t === attr) return true;
      }
    }
    return false;
  }

  function matchFilters(item, filters) {
    for (var i = 0; i < filters.length; i++) {
      if (!hasAttr(item, filters[i])) return false;
    }
    return true;
  }

  /** valueSource: "max" | "红色" | "红金"；无值返回 null */
  function sortValue(item, attr, valueSource) {
    if (valueSource === "max") {
      var v = item.max && item.max[attr];
      return typeof v === "number" ? v : null;
    }
    var tokens = item.tiers[valueSource] || [];
    var best = null;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.t === attr && typeof tk.v === "number") {
        best = best === null ? tk.v : Math.max(best, tk.v);
      }
    }
    return best;
  }

  function catIndex(cat) {
    var i = CATEGORY_ORDER.indexOf(cat);
    return i === -1 ? CATEGORY_ORDER.length : i;
  }

  function queryItems(items, opts) {
    opts = opts || {};
    var search = opts.search || "";
    var filters = opts.filters || [];
    var sortAttr = opts.sortAttr || (filters.length ? filters[0] : null);
    var valueSource = opts.valueSource || "max";

    var result = [];
    for (var i = 0; i < items.length; i++) {
      if (matchSearch(items[i], search) && matchFilters(items[i], filters)) {
        result.push(items[i]);
      }
    }

    result.sort(function (a, b) {
      if (filters.length === 0) {
        return catIndex(a.cat) - catIndex(b.cat) || a.id.localeCompare(b.id);
      }
      var va = sortValue(a, sortAttr, valueSource);
      var vb = sortValue(b, sortAttr, valueSource);
      if (va !== null && vb !== null && va !== vb) return vb - va;
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      return catIndex(a.cat) - catIndex(b.cat) || a.id.localeCompare(b.id);
    });
    return result;
  }

  return {
    CATEGORY_ORDER: CATEGORY_ORDER,
    TIER_ORDER: TIER_ORDER,
    VALUE_SOURCES: VALUE_SOURCES,
    normalizeInput: normalizeInput,
    matchSearch: matchSearch,
    hasAttr: hasAttr,
    matchFilters: matchFilters,
    sortValue: sortValue,
    queryItems: queryItems
  };
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test js/query.test.js`
Expected: PASS（13 个 test）

- [ ] **Step 5: 提交（需 escalate）**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek add js/query.js js/query.test.js
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek commit -m "feat(js): query core with search filter sort"
```

---

## Task 3: 局域网静态服务

**Files:**
- Create: `serve.js`
- Create: `serve.test.js`
- Create: `启动服务.bat`
- Create: `README.md`
- Create: `index.html`（最小占位，Task 4 替换）

**Interfaces:**
- Consumes: Task 1 的 `data/special-equipment.js`
- Produces:
  - `createServer() -> http.Server`（静态文件服务，MIME 正确，防路径穿越）
  - `lanIPv4s() -> string[]`（非内部 IPv4，按 192.168 → 10 → 172.16-31 排序）
  - `startServer(onReady) -> http.Server`（8000-8010 找空闲端口，打印地址，win32 下自动开浏览器）

- [ ] **Step 1: 写失败测试**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const { createServer, lanIPv4s } = require("./serve.js");

function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const port = server.address().port;
      const done = () => server.close(() => resolve());
      fn(port).then(done, (err) => { server.close(() => reject(err)); });
    });
  });
}

function get(port, path, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: rawPath || path, method: "GET"
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("GET / 返回 index.html", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /text\/html/);
    assert.match(r.body, /特殊属性装备/);
  });
});

test("GET /data/special-equipment.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/special-equipment.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("GET /css/style.css 返回 200 且为 CSS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/css/style.css");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /text\/css/);
  });
});

test("不存在的文件返回 404", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/no-such-file.js");
    assert.strictEqual(r.status, 404);
  });
});

test("路径穿越返回 403", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/", "/..%2fserve.js");
    assert.strictEqual(r.status, 403);
  });
});

test("lanIPv4s 返回数组", () => {
  assert.ok(Array.isArray(lanIPv4s()));
});
```

注：`css/style.css` 断言在 Task 4 中才会通过；Task 3 运行时该用例处于失败属预期，Task 4 完成前不删除该用例。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test serve.test.js`
Expected: FAIL，`Cannot find module './serve.js'`

- [ ] **Step 3: 实现 serve.js**

```js
/**
 * 本地静态服务：电脑/手机访问特殊属性装备查询页。
 * 用法：node serve.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const ROOT = __dirname;
const PORT_START = 8000;
const PORT_END = 8010;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
      return;
    }
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, rel);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

function lanIPv4s() {
  const result = [];
  const ifaces = os.networkInterfaces();
  for (const key of Object.keys(ifaces)) {
    for (const info of ifaces[key] || []) {
      if (info.family === "IPv4" && !info.internal) result.push(info.address);
    }
  }
  result.sort((a, b) => score(a) - score(b));
  return result;
  function score(ip) {
    if (/^192\.168\./.test(ip)) return 0;
    if (/^10\./.test(ip)) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 3;
  }
}

function startServer(onReady) {
  const server = createServer();
  let port = PORT_START;
  const attempt = () => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && port < PORT_END) {
        port += 1;
        server.close();
        attempt();
      } else {
        console.error(`端口 ${port} 启动失败：${err.message}`);
        if (onReady) onReady(null);
      }
    });
    server.listen(port, () => {
      console.log("==========================================");
      console.log("  秦时 · 特殊属性装备 本地服务已启动");
      console.log(`  电脑访问：http://localhost:${port}/`);
      for (const ip of lanIPv4s()) {
        console.log(`  手机访问：http://${ip}:${port}/`);
      }
      console.log("  手机与电脑需连接同一 Wi-Fi");
      console.log("  按 Ctrl+C 停止服务");
      console.log("==========================================");
      if (process.platform === "win32") exec(`start http://localhost:${port}/`, () => {});
      if (onReady) onReady(port, server);
    });
  };
  attempt();
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createServer, lanIPv4s, startServer };
```

- [ ] **Step 4: 创建最小占位 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>秦时 · 特殊属性装备</title>
</head>
<body>
秦时 · 特殊属性装备（建设中）
</body>
</html>
```

- [ ] **Step 5: 创建启动服务.bat**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
node serve.js
pause
```

- [ ] **Step 6: 创建 README.md**

```markdown
# 秦时 · 特殊属性装备查询

离线本地查询工具，无需联网。

## 电脑使用

直接双击 `index.html` 打开。

## 手机访问

1. 双击 `启动服务.bat`（首次启动如遇 Windows 防火墙弹窗，选「允许」）
2. 手机连接与电脑相同的 Wi-Fi
3. 用手机浏览器打开窗口中显示的「手机访问」地址

## 查询功能

- 搜索：输入装备名或分类关键词（如：墨眉 / 武器 / 神兵饰品）
- 筛选：点击属性芯片，最多同时选 2 个（AND）
- 排序：选中属性后按数值倒序；可切换排序属性与取值档位（最高值 / 红色 / 红金）

## 重新生成数据（Excel 更新后）

需要 Python 3 + openpyxl：

```bash
python tools/build_special_equipment.py
```

## 测试

```bash
node --test js/query.test.js serve.test.js
python -m unittest discover -s tests -v
```
```

- [ ] **Step 7: 运行测试确认通过（css 用例除外）**

Run: `node --test serve.test.js`
Expected: 除 `GET /css/style.css` 外全部 PASS；该用例待 Task 4 通过。

- [ ] **Step 8: 提交（需 escalate）**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek add serve.js serve.test.js 启动服务.bat README.md index.html
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek commit -m "feat(serve): local static server and launch scripts"
```

---

## Task 4: 页面骨架与深色主题

**Files:**
- Create: `css/style.css`
- Modify: `index.html`（替换占位为完整骨架，仅引用 `data/special-equipment.js`）
- Modify: `serve.test.js`（追加 HTML 引用断言）

**Interfaces:**
- Consumes: Task 3 的 serve.js 与占位 index.html
- Produces: 完整 `index.html`（含 `#search`、`#chips`、`#sort-panel`、`#table-head`、`#table-body`、`#cards`、`#empty`、`#data-error`、`#count`、`#version`、`#clear-all`、`#empty-clear` 等 Task 5 依赖的节点 id）

- [ ] **Step 1: 追加失败测试**

在 `serve.test.js` 末尾追加：

```js
test("index.html 引用数据与样式", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /<script src="data\/special-equipment\.js"><\/script>/);
    assert.match(r.body, /<link rel="stylesheet" href="css\/style\.css">/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test serve.test.js`
Expected: 新增用例 FAIL（index.html 未引用）

- [ ] **Step 3: 重写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>秦时 · 特殊属性装备</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>秦时 · 特殊属性装备</h1>
    <div class="meta"><span id="count">加载中…</span> · 版本 <span id="version">—</span></div>
  </header>

  <div id="data-error" class="error" hidden>数据文件缺失或加载失败，请确认 data/special-equipment.js 存在。</div>

  <main id="app">
    <input id="search" type="search" placeholder="输入装备名或分类，如：墨眉 / 武器 / 神兵饰品" autocomplete="off">

    <section class="panel">
      <div class="panel-title">按属性筛选（最多 2 个）</div>
      <div id="chips" class="chips"></div>
      <div id="sort-panel" class="sort-panel" hidden>
        <div class="sort-row">
          <span>排序属性</span>
          <div id="sort-attr" class="segs"></div>
        </div>
        <div class="sort-row">
          <span>取值档位</span>
          <div id="sort-tier" class="segs">
            <button type="button" class="seg" data-tier="max">最高值</button>
            <button type="button" class="seg" data-tier="红色">红色</button>
            <button type="button" class="seg" data-tier="红金">红金</button>
          </div>
        </div>
      </div>
      <button id="clear-all" type="button" class="link-btn">清除全部条件</button>
    </section>

    <section id="results">
      <div id="table-wrap" class="table-wrap">
        <table>
          <thead id="table-head"></thead>
          <tbody id="table-body"></tbody>
        </table>
      </div>
      <div id="cards" class="cards"></div>
    </section>

    <div id="empty" class="empty" hidden>
      <p>未找到符合条件的装备</p>
      <button id="empty-clear" type="button" class="link-btn">清除全部条件</button>
    </div>
  </main>

  <footer class="foot">
    数据来源：秦时相关（更新贯侯钟离昧）20260618.xlsx · 特殊属性装备 · 本地离线运行
  </footer>
</div>

<script src="data/special-equipment.js"></script>
</body>
</html>
```

- [ ] **Step 4: 创建 css/style.css**

```css
/* 秦时 · 特殊属性装备 — 深色水墨古风 */
:root {
  --bg: #12100d;
  --bg2: #191611;
  --panel: #221d16;
  --line: #3a3125;
  --gold: #d4af37;
  --gold-dim: #9a7f2e;
  --red: #b03a2e;
  --text: #e8e0cf;
  --muted: #8f8572;
  --status: #6b6353;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
  line-height: 1.55;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 18px 16px 40px; }
h1 {
  margin: 0;
  font-family: "STKaiti", "KaiTi", "SimSun", serif;
  font-weight: 700;
  font-size: 26px;
  letter-spacing: 5px;
  color: var(--gold);
  text-shadow: 0 0 18px rgba(212, 175, 55, .25);
}
header.top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.meta { color: var(--muted); font-size: 13px; }
.error {
  background: rgba(176, 58, 46, .15);
  border: 1px solid var(--red);
  color: #f0c8c2;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 14px;
}
#search {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  background: var(--bg2);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 8px;
  outline: none;
}
#search:focus { border-color: var(--gold-dim); box-shadow: 0 0 0 2px rgba(212, 175, 55, .15); }
.panel {
  margin: 14px 0;
  padding: 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.panel-title { color: var(--muted); font-size: 13px; margin-bottom: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  background: var(--bg2);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 18px;
  font-size: 14px;
  cursor: pointer;
}
.chip:hover { border-color: var(--gold-dim); }
.chip.active { background: var(--gold); border-color: var(--gold); color: #1c1507; font-weight: 700; }
.chip:disabled { opacity: .35; cursor: not-allowed; }
.sort-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}
.sort-row { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.segs { display: inline-flex; gap: 4px; }
.seg {
  background: var(--bg2);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
}
.seg.active { background: var(--red); border-color: var(--red); color: #fff; font-weight: 700; }
.link-btn {
  background: none;
  border: none;
  color: var(--gold-dim);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  margin-top: 10px;
  text-decoration: underline;
}
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--bg2); }
table { width: 100%; border-collapse: collapse; min-width: 860px; }
thead th {
  position: sticky;
  top: 0;
  background: var(--panel);
  color: var(--gold-dim);
  font-weight: 600;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
tbody td { padding: 9px 12px; border-bottom: 1px solid rgba(58, 49, 37, .55); vertical-align: top; }
tbody tr:hover { background: rgba(212, 175, 55, .05); }
td.name { font-weight: 600; white-space: nowrap; }
.cat { color: var(--gold-dim); font-size: 13px; white-space: nowrap; }
.main { color: var(--red); font-weight: 600; }
.tier-attr { white-space: nowrap; }
.tier-attr.hit { color: var(--gold); font-weight: 700; }
.tier-status { color: var(--status); font-style: italic; }
.tier-none { color: var(--status); }
.plus { color: var(--status); margin: 0 2px; }
td.badge, th.badge { text-align: right; white-space: nowrap; color: var(--gold); font-weight: 600; }
.cards { display: none; }
.card {
  background: var(--bg2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card-head .name { font-weight: 700; font-size: 16px; }
.card .badge { margin-left: auto; color: var(--gold); font-weight: 700; }
.card-main { margin: 6px 0; color: var(--muted); font-size: 13px; }
.card-main b { color: var(--red); }
.card-tier {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px dashed rgba(58, 49, 37, .6);
  font-size: 14px;
}
.tier-label { color: var(--muted); min-width: 38px; }
.empty { text-align: center; padding: 48px 0; color: var(--muted); }
.empty p { font-size: 16px; }
.foot {
  margin-top: 22px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 720px) {
  .table-wrap { display: none; }
  .cards { display: block; }
}
@media (min-width: 721px) {
  .cards { display: none; }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test serve.test.js`
Expected: 全部 PASS（含 css 与 HTML 引用断言）

- [ ] **Step 6: 提交（需 escalate）**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek add index.html css/style.css serve.test.js
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek commit -m "feat(web): page shell and dark theme"
```

---

## Task 5: 渲染与交互 js/app.js

**Files:**
- Create: `js/app.js`
- Modify: `index.html`（body 末尾追加 `js/query.js`、`js/app.js` 两个 script 标签）

**Interfaces:**
- Consumes: `window.SPECIAL_EQUIPMENT_DATA`（Task 1）、`window.QSQuery`（Task 2）、Task 4 的 HTML 节点 id
- Produces: 无导出（浏览器端 IIFE）；页面完整交互

- [ ] **Step 1: 在 index.html 追加脚本引用**

在 `</body>` 前把：

```html
<script src="data/special-equipment.js"></script>
```

替换为：

```html
<script src="data/special-equipment.js"></script>
<script src="js/query.js"></script>
<script src="js/app.js"></script>
```

- [ ] **Step 2: 创建 js/app.js**

```js
/**
 * 特殊属性装备 · 页面渲染与交互
 * 依赖：window.SPECIAL_EQUIPMENT_DATA（数据）、window.QSQuery（查询核心）
 */
(function () {
  "use strict";

  const DATA = window.SPECIAL_EQUIPMENT_DATA;
  const Q = window.QSQuery;

  const state = { search: "", filters: [], sortAttr: null, valueSource: "max" };

  const el = {
    search: document.getElementById("search"),
    chips: document.getElementById("chips"),
    sortPanel: document.getElementById("sort-panel"),
    sortAttrBtns: document.getElementById("sort-attr"),
    sortTierBtns: document.getElementById("sort-tier"),
    count: document.getElementById("count"),
    version: document.getElementById("version"),
    results: document.getElementById("results"),
    tableHead: document.getElementById("table-head"),
    tableBody: document.getElementById("table-body"),
    cards: document.getElementById("cards"),
    empty: document.getElementById("empty"),
    clearAll: document.getElementById("clear-all"),
    emptyClear: document.getElementById("empty-clear"),
    error: document.getElementById("data-error")
  };

  function init() {
    if (!DATA || !Q) {
      el.error.hidden = false;
      return;
    }
    el.version.textContent = DATA.meta.version;
    renderChips();
    bindEvents();
    apply();
  }

  function renderChips() {
    el.chips.innerHTML = DATA.meta.attrTypes
      .map((a) => `<button type="button" class="chip" data-attr="${a}">${a}</button>`)
      .join("");
  }

  function bindEvents() {
    el.search.addEventListener("input", () => {
      state.search = el.search.value;
      apply();
    });
    el.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn || btn.disabled) return;
      const attr = btn.dataset.attr;
      const idx = state.filters.indexOf(attr);
      if (idx >= 0) {
        state.filters.splice(idx, 1);
      } else if (state.filters.length < 2) {
        state.filters.push(attr);
      }
      state.sortAttr = state.filters.length ? state.filters[0] : null;
      apply();
    });
    el.sortAttrBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-attr]");
      if (!btn) return;
      state.sortAttr = btn.dataset.attr;
      apply();
    });
    el.sortTierBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tier]");
      if (!btn) return;
      state.valueSource = btn.dataset.tier;
      apply();
    });
    const clear = () => {
      state.search = "";
      state.filters = [];
      state.sortAttr = null;
      state.valueSource = "max";
      el.search.value = "";
      apply();
    };
    el.clearAll.addEventListener("click", clear);
    el.emptyClear.addEventListener("click", clear);
  }

  function apply() {
    const items = Q.queryItems(DATA.items, {
      search: state.search,
      filters: state.filters,
      sortAttr: state.sortAttr,
      valueSource: state.valueSource
    });
    renderControls();
    renderTable(items);
    renderCards(items);
    el.count.textContent = `共 ${items.length} 件`;
    const isEmpty = items.length === 0;
    el.results.hidden = isEmpty;
    el.empty.hidden = !isEmpty;
  }

  function renderControls() {
    document.querySelectorAll(".chip").forEach((btn) => {
      const attr = btn.dataset.attr;
      const active = state.filters.indexOf(attr) >= 0;
      btn.classList.toggle("active", active);
      btn.disabled = !active && state.filters.length >= 2;
    });
    const hasFilter = state.filters.length > 0;
    el.sortPanel.hidden = !hasFilter;
    el.sortAttrBtns.innerHTML = state.filters
      .map((a) => `<button type="button" class="seg${state.sortAttr === a ? " active" : ""}" data-attr="${a}">${a}</button>`)
      .join("");
    el.sortTierBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tier === state.valueSource);
    });
  }

  function tokenHtml(tokens) {
    if (!tokens || tokens.length === 0) return '<span class="tier-none">—</span>';
    return tokens.map((tk) => {
      if (tk.s) return `<span class="tier-status">${tk.s}</span>`;
      const hit = state.filters.indexOf(tk.t) >= 0;
      return `<span class="tier-attr${hit ? " hit" : ""}">${tk.raw}</span>`;
    }).join('<span class="plus"> + </span>');
  }

  function sortBadge(item) {
    if (state.filters.length === 0) return "";
    const v = Q.sortValue(item, state.sortAttr, state.valueSource);
    return v === null ? "—" : `${state.sortAttr} ${v}%`;
  }

  function renderTable(items) {
    const hasFilter = state.filters.length > 0;
    el.tableHead.innerHTML = `<tr>
      <th>分类</th><th>装备名</th><th>主属性</th><th>橙色</th><th>橙金</th><th>红色</th><th>红金</th>
      ${hasFilter ? '<th class="badge">排序值</th>' : ""}
    </tr>`;
    el.tableBody.innerHTML = items.map((item) => `<tr>
      <td><span class="cat">${item.cat}</span></td>
      <td class="name">${item.name}</td>
      <td class="main">${item.main}</td>
      <td>${tokenHtml(item.tiers["橙色"])}</td>
      <td>${tokenHtml(item.tiers["橙金"])}</td>
      <td>${tokenHtml(item.tiers["红色"])}</td>
      <td>${tokenHtml(item.tiers["红金"])}</td>
      ${hasFilter ? `<td class="badge">${sortBadge(item)}</td>` : ""}
    </tr>`).join("");
  }

  function renderCards(items) {
    const hasFilter = state.filters.length > 0;
    el.cards.innerHTML = items.map((item) => {
      const badge = hasFilter ? sortBadge(item) : "";
      return `<div class="card">
        <div class="card-head">
          <span class="cat">${item.cat}</span>
          <span class="name">${item.name}</span>
          ${badge ? `<span class="badge">${badge}</span>` : ""}
        </div>
        <div class="card-main">主属性：<b>${item.main}</b></div>
        ${Q.TIER_ORDER.map((t) => `<div class="card-tier"><span class="tier-label">${t}</span>${tokenHtml(item.tiers[t])}</div>`).join("")}
      </div>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
```

- [ ] **Step 3: 运行全部自动化测试**

Run: `node --test js/query.test.js serve.test.js`
Expected: 全部 PASS

Run: `& $python -m unittest discover -s tests -v`
Expected: 全部 PASS（13 个测试）

- [ ] **Step 4: 浏览器手工验证清单**

使用系统默认浏览器打开 `index.html`（双击即可），逐项核对：

1. 标题「秦时 · 特殊属性装备」，计数「共 123 件」，版本「20260618」
2. 默认表格顺序：武器 11 → 防具 13 → 饰品 13 → 神兵武器 44 → 神兵防具 21 → 神兵饰品 21，且行内档位格正确显示（如朔日辉光橙色格显示「5%血 + 5%穿透」）
3. 搜索「墨眉」→ 仅 1 件「神兵墨眉」
4. 搜索「武器」→ 共 55 件（武器 + 神兵武器）
5. 搜索「神兵饰品」→ 共 21 件
6. 点击芯片「血」→ 表格按血最高值倒序，行尾出现排序值徽标；仅主属性为血（无百分比）的装备排最后；「血」相关数值金色高亮
7. 再点「穿透」→ AND 筛选；排序属性出现「血」「穿透」两个按钮；点「穿透」切换排序；点档位「红色」「红金」切换取值并刷新排序值
8. 已选 2 个属性时，其余芯片置灰不可点
9. 搜索不存在的词 → 空状态提示 + 「清除全部条件」恢复
10. 浏览器开发者工具切换手机视口（375×667）→ 显示卡片布局，控件竖排，无横向滚动

- [ ] **Step 5: 手机访问实测**

1. 双击 `启动服务.bat`，确认控制台打印本机地址与局域网地址，且默认浏览器自动打开
2. 同一 Wi-Fi 下手机访问局域网地址，重复执行上述手工清单第 1、3、6、7、10 项（以手机代替 DevTools 视口）
3. 实测完成后按 Ctrl+C 关闭服务

- [ ] **Step 6: 提交（需 escalate）**

```bash
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek add js/app.js index.html
git -c safe.directory=C:/Users/pghyl/Desktop/deepseek commit -m "feat(web): interactive search filter sort rendering"
```

---

## Final Verification

全部任务完成后运行：

```bash
node --test js/query.test.js serve.test.js
& $python -m unittest discover -s tests -v
```

全部 PASS，且 Task 5 Step 4/5 手工清单通过，即视为完成。
