#!/usr/bin/env python3
"""解析《章节掉落新版》Sheet，生成 data/drops.js。

用法：
    python tools/build_drops.py [Excel路径]
"""
import json
import os
import re
import sys
from datetime import date

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")
OUT_JS = os.path.join(ROOT, "data", "drops.js")

CHAPTER_RE = re.compile(r"(\d+)")
CHAPTER_CN_RE = re.compile(r"第(\d+)章")


def cell_text(value):
    if value is None:
        return ""
    s = str(value).strip()
    return s


def parse_sheet(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.worksheets[0]  # 章节掉落新版
    rows = list(ws.iter_rows(values_only=True))
    normal = []
    stage_map = {}
    for r in range(2, 69):
        b = cell_text(rows[r - 1][1])
        m = CHAPTER_CN_RE.search(b)
        if m:
            chapter = int(m.group(1))
            for c, stage in stage_map.items():
                item = cell_text(rows[r - 1][c - 1])
                if item:
                    normal.append({"chapter": chapter, "stage": stage, "item": item})
        else:
            new_map = {}
            for c in range(3, 7):
                v = cell_text(rows[r - 1][c - 1])
                if v.isdigit():
                    new_map[c] = int(v)
            if new_map:
                stage_map = new_map
    hero = []
    stage_map = {}
    for r in range(70, 106):
        b = cell_text(rows[r - 1][1])
        if b.isdigit():
            chapter = int(b)
            for c, stage in stage_map.items():
                item = cell_text(rows[r - 1][c - 1])
                if item:
                    hero.append({"chapter": chapter, "stage": stage, "item": item})
        else:
            new_map = {}
            for c in range(3, 8):
                v = cell_text(rows[r - 1][c - 1])
                if v.isdigit():
                    new_map[c] = int(v)
            if new_map:
                stage_map = new_map
    reward = []
    for r in range(4, 60):
        j = cell_text(rows[r - 1][9])
        k = cell_text(rows[r - 1][10])
        if j.isdigit() and k:
            reward.append({"chapter": int(j), "item": k})
    return {"normal": normal, "hero": hero, "reward": reward}


def build_data(path, out_path):
    data = parse_sheet(path)
    m = re.search(r"(\d{8})", os.path.basename(path))
    payload = {
        "meta": {
            "sourceFile": os.path.basename(path),
            "sourceSheet": "章节掉落新版",
            "version": m.group(1) if m else "unknown",
            "generatedAt": date.today().isoformat(),
            "totalNormal": len(data["normal"]),
            "totalHero": len(data["hero"]),
            "totalReward": len(data["reward"]),
        },
        "normal": data["normal"],
        "hero": data["hero"],
        "reward": data["reward"],
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    js = (
        "/* 由 tools/build_drops.py 自动生成，请勿手改 */\n"
        "window.DROP_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"生成完成：{out_path}")
    print(f"普通关卡：{payload['meta']['totalNormal']}，英雄关卡：{payload['meta']['totalHero']}，声望奖励：{payload['meta']['totalReward']}")
    return payload


if __name__ == "__main__":
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    build_data(xlsx, OUT_JS)
