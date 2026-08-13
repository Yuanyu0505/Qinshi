#!/usr/bin/env python3
"""解析“新兵法”工作表，生成浏览器使用的兵法数据。"""
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
BOOK_NAME = "秦时相关（更新贯侯钟离昧）20260618.xlsx"


def default_xlsx(root=ROOT):
    """返回仓库主目录的默认 Excel；隔离工作树不使用自己的副本。"""
    main_root = root.parent.parent if root.parent.name == ".worktrees" else root
    return main_root / BOOK_NAME


DEFAULT_XLSX = default_xlsx()
OUT_JS = ROOT / "data" / "tactics.js"

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

STANDARD_MANTRAS = {
    "forest": (("ling", "灵"), ("chan", "禅"), ("tong", "统")),
    "mountain": (("lie", "裂"), ("qia", "洽"), ("tong", "统")),
    "wind": (("qi", "齐"), ("biao", "镖"), ("tong", "统")),
    "fire": (("xin", "心"), ("jie", "解"), ("tong", "统")),
}
PARENTHESIS_ATTRIBUTE = re.compile(r"[（(]([^）)]+)[）)]")


def number(value, coordinate):
    """将 Excel 数值标准化为 JSON 友好的 int 或 float。"""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"数值无法识别：{coordinate}={value!r}")
    return int(value) if float(value).is_integer() else float(value)


def displayed_percent(value, coordinate):
    if isinstance(value, str) and value.endswith("%"):
        return float(value[:-1])
    if isinstance(value, (int, float)):
        return float(value) * 100
    raise ValueError(f"百分比无法识别：{coordinate}={value!r}")


def extreme_value(mantra_rank):
    return (mantra_rank + 1) * 10


def attribute_name(value, coordinate):
    if value is None:
        raise ValueError(f"属性名称缺失：{coordinate}")
    name = str(value).strip()
    if not name:
        raise ValueError(f"属性名称缺失：{coordinate}")
    return name


def mantra_attribute(value, coordinate):
    text = attribute_name(value, coordinate)
    match = PARENTHESIS_ATTRIBUTE.search(text)
    if match:
        return match.group(1).strip()
    return text


def parse_proficiency(value, coordinate):
    if not isinstance(value, str):
        raise ValueError(f"熟练度无法识别：{coordinate}={value!r}")
    parts = value.strip().split("-", 1)
    if len(parts) != 2:
        raise ValueError(f"熟练度无法识别：{coordinate}={value!r}")
    try:
        return {"min": float(parts[0]), "max": float(parts[1])}
    except ValueError as error:
        raise ValueError(f"熟练度无法识别：{coordinate}={value!r}") from error


def cell_number_or_zero(ws, row, column):
    value = ws.cell(row, column).value
    return 0 if value is None else number(value, ws.cell(row, column).coordinate)


def parse_standard_block(ws, tactic_id, block):
    start_row, end_row = block["range"]
    start_col = block["start_col"]
    name = block["name"]
    header_row = start_row + 2
    data_start = start_row + 3
    base_names = [
        attribute_name(ws.cell(header_row, start_col + offset).value, ws.cell(header_row, start_col + offset).coordinate)
        for offset in range(1, 5)
    ]

    ranks = []
    for row in range(data_start, end_row + 1):
        rank = number(ws.cell(row, start_col).value, ws.cell(row, start_col).coordinate)
        base_attributes = []
        for offset, base_name in enumerate(base_names, start=1):
            value = ws.cell(row, start_col + offset).value
            if value is not None:
                base_attributes.append({
                    "name": base_name,
                    "value": number(value, ws.cell(row, start_col + offset).coordinate),
                    "unit": "flat",
                })
        ranks.append({
            "rank": rank,
            "baseAttributes": base_attributes,
            "extraAttributes": [],
            "proficiency": parse_proficiency(
                ws.cell(row, start_col + 5).value,
                ws.cell(row, start_col + 5).coordinate,
            ),
            "advance": {
                "mark": cell_number_or_zero(ws, row, start_col + 6),
                "merit": cell_number_or_zero(ws, row, start_col + 7),
                "horn": 0,
            },
            "rehearsal": {
                "singleHorn": cell_number_or_zero(ws, row, start_col + 8),
                "guaranteeHorn": cell_number_or_zero(ws, row, start_col + 9),
            },
        })

    mantras = []
    for offset, (mantra_id, mantra_name) in enumerate(STANDARD_MANTRAS[tactic_id], start=10):
        header = ws.cell(header_row, start_col + offset)
        mantras.append({
            "id": mantra_id,
            "name": mantra_name,
            "attribute": mantra_attribute(header.value, header.coordinate),
            "unit": "flat" if mantra_name == "统" else "percent",
            "materialName": f"{mantra_name}真言碎片",
            "unlockTacticRank": 0,
            "maxRank": 9,
            "stages": [
                {
                    "rank": tactic_rank,
                    "tacticRank": tactic_rank,
                    "value": number(
                        ws.cell(data_start + tactic_rank, start_col + offset).value,
                        ws.cell(data_start + tactic_rank, start_col + offset).coordinate,
                    ),
                    "fragments": cell_number_or_zero(ws, data_start + tactic_rank, start_col + 14),
                }
                for tactic_rank in range(10)
            ],
        })

    mantras.append({
        "id": "extreme",
        "name": "极",
        "attribute": mantra_attribute(
            ws.cell(header_row, start_col + 13).value,
            ws.cell(header_row, start_col + 13).coordinate,
        ),
        "unit": "percent",
        "materialName": "极真言碎片",
        "unlockTacticRank": 10,
        "maxRank": 5,
        "stages": [
            {
                "rank": mantra_rank,
                "tacticRank": mantra_rank + 10,
                "value": extreme_value(mantra_rank),
                "fragments": cell_number_or_zero(ws, data_start + mantra_rank + 10, start_col + 14),
            }
            for mantra_rank in range(6)
        ],
    })
    return {
        "id": tactic_id,
        "name": f"{name}兵法",
        "kind": "standard",
        "markName": f"{name}之印记",
        "ranks": ranks,
        "mantras": mantras,
    }


def parse_special_block(ws, tactic_id, block):
    start_row, end_row = block["range"]
    start_col = block["start_col"]
    name = block["name"]
    header_row = start_row + 2
    data_start = start_row + 3
    base_names = [
        attribute_name(ws.cell(header_row, start_col + offset).value, ws.cell(header_row, start_col + offset).coordinate)
        for offset in range(1, 5)
    ]
    shield_name = attribute_name(ws.cell(header_row, start_col + 5).value, ws.cell(header_row, start_col + 5).coordinate)
    extra_percent_name = attribute_name(ws.cell(header_row, start_col + 6).value, ws.cell(header_row, start_col + 6).coordinate)

    ranks = []
    for row in range(data_start, end_row + 1):
        rank = number(ws.cell(row, start_col).value, ws.cell(row, start_col).coordinate)
        base_value = displayed_percent(ws.cell(row, start_col + 1).value, ws.cell(row, start_col + 1).coordinate)
        base_attributes = [
            {"name": base_name, "value": number(base_value, ws.cell(row, start_col + 1).coordinate), "unit": "percent"}
            for base_name in base_names
        ]
        ranks.append({
            "rank": rank,
            "baseAttributes": base_attributes,
            "extraAttributes": [
                {
                    "name": shield_name,
                    "value": cell_number_or_zero(ws, row, start_col + 5),
                    "unit": "flat",
                },
                {
                    "name": extra_percent_name,
                    "value": number(
                        displayed_percent(
                            ws.cell(row, start_col + 6).value,
                            ws.cell(row, start_col + 6).coordinate,
                        ),
                        ws.cell(row, start_col + 6).coordinate,
                    ),
                    "unit": "percent",
                },
            ],
            "advance": {
                "mark": cell_number_or_zero(ws, row, start_col + 7),
                "merit": cell_number_or_zero(ws, row, start_col + 8),
                "horn": cell_number_or_zero(ws, row, start_col + 9),
            },
        })

    mantra_name = attribute_name(ws.cell(header_row, start_col + 11).value, ws.cell(header_row, start_col + 11).coordinate)
    mantra_attribute_name = attribute_name(ws.cell(header_row, start_col + 10).value, ws.cell(header_row, start_col + 10).coordinate)
    return {
        "id": tactic_id,
        "name": f"{name}兵法",
        "kind": "special",
        "markName": f"{name}之印记",
        "ranks": ranks,
        "mantras": [{
            "id": "shang" if tactic_id == "yin" else "sheng",
            "name": mantra_name,
            "attribute": mantra_attribute_name,
            "unit": "percent",
            "materialName": f"{mantra_name}真言碎片",
            "unlockTacticRank": 0,
            "maxRank": 15,
            "stages": [
                {
                    "rank": tactic_rank,
                    "tacticRank": tactic_rank,
                    "value": number(
                        displayed_percent(
                            ws.cell(data_start + tactic_rank, start_col + 10).value,
                            ws.cell(data_start + tactic_rank, start_col + 10).coordinate,
                        ),
                        ws.cell(data_start + tactic_rank, start_col + 10).coordinate,
                    ),
                    "fragments": cell_number_or_zero(ws, data_start + tactic_rank, start_col + 11),
                }
                for tactic_rank in range(16)
            ],
        }],
    }


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


def parse_sheet(path):
    workbook = load_workbook(path, data_only=True, read_only=True)
    try:
        sheet = workbook["新兵法"]
        parsed = {
            "wind": parse_standard_block(sheet, "wind", STANDARD_BLOCKS["wind"]),
            "forest": parse_standard_block(sheet, "forest", STANDARD_BLOCKS["forest"]),
            "fire": parse_standard_block(sheet, "fire", STANDARD_BLOCKS["fire"]),
            "mountain": parse_standard_block(sheet, "mountain", STANDARD_BLOCKS["mountain"]),
            "yin": parse_special_block(sheet, "yin", SPECIAL_BLOCKS["yin"]),
            "thunder": parse_special_block(sheet, "thunder", SPECIAL_BLOCKS["thunder"]),
        }
    finally:
        workbook.close()
    payload = {"meta": {"order": ORDER}, "items": [parsed[key] for key in ("wind", "forest", "fire", "mountain", "yin", "thunder")]}
    validate_payload(payload)
    return payload


def build_data(path=DEFAULT_XLSX, out_path=OUT_JS):
    payload = parse_sheet(path)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        "/* 由 tools/build_tactics.py 自动生成，请勿手改 */\n"
        "window.TACTICS_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"generated {len(payload['items'])} tactics from {path}")
    return payload


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    build_data(source)
