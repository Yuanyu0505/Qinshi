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
