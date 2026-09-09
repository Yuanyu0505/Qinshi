#!/usr/bin/env python3
"""从“逐鹿”工作表 I～S 列生成站点只读资料。"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import openpyxl


TIERS = [
    {"progress": 1000, "quality": "紫", "yuanbao": 0, "column": "N"},
    {"progress": 1200, "quality": "橙", "yuanbao": 7000, "column": "O"},
    {"progress": 1400, "quality": "紫", "yuanbao": 0, "column": "P"},
    {"progress": 1800, "quality": "橙", "yuanbao": 7000, "column": "Q"},
    {"progress": 2200, "quality": "红", "yuanbao": 20000, "column": "R"},
    {"progress": 2500, "quality": "橙", "yuanbao": 0, "column": "S"},
]
SEASON_ROWS = [
    *range(5, 35),
    *range(39, 51),
    *range(55, 67),
    *range(71, 83),
]


def normalize_name(value: object) -> str:
    text = str(value or "").strip().replace("伍德终始", "五德终始")
    return re.sub(r"（(?:紫|橙|红)）$", "", text)


def parse_season(value: object) -> tuple[int, int]:
    text = str(value).strip()
    match = re.fullmatch(r"(\d{4})[.年/-](\d{1,2})(?:月)?", text)
    if not match:
        raise ValueError(f"无法识别赛季月份：{value!r}")
    year, month = int(match.group(1)), int(match.group(2))
    if not 1 <= month <= 12:
        raise ValueError(f"赛季月份超出范围：{value!r}")
    return year, month


def build_data(workbook_path: Path) -> dict:
    workbook = openpyxl.load_workbook(workbook_path, data_only=True, read_only=True)
    sheet = workbook["逐鹿"]

    progress_rewards = []
    tier_progress = {tier["progress"] for tier in TIERS}
    for row in range(3, 43):
        progress = int(sheet[f"I{row}"].value)
        progress_rewards.append(
            {
                "progress": progress,
                "item": normalize_name(sheet[f"J{row}"].value),
                "quantity": int(sheet[f"K{row}"].value),
                "seasonTier": progress if progress in tier_progress else None,
            }
        )

    seasons = []
    for row in SEASON_ROWS:
        year, month = parse_season(sheet[f"M{row}"].value)
        rewards = {
            str(tier["progress"]): normalize_name(sheet[f"{tier['column']}{row}"].value)
            for tier in TIERS
        }
        seasons.append({"year": year, "month": month, "rewards": rewards})

    return {
        "progressRewards": progress_rewards,
        "seasonTiers": [
            {key: tier[key] for key in ("progress", "quality", "yuanbao")}
            for tier in TIERS
        ],
        "seasons": seasons,
        "meta": {
            "sourceSheet": "逐鹿",
            "sourceRanges": ["I2:K42", "M2:S82"],
            "firstSeason": "2021-07",
            "lastSeason": "2026-12",
            "predictionAnchor": "2024-03",
            "predictionCycleLength": 10,
        },
    }


def write_module(data: dict, output_path: Path) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    module = """(function (root, factory) {
  var data = factory();
  if (typeof module === \"object\" && module.exports) module.exports = data;
  root.ZHULU_DATA = data;
})(typeof self !== \"undefined\" ? self : this, function () {
  \"use strict\";
  return %s;
});
""" % payload
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(module, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", required=True, type=Path)
    parser.add_argument("--output", default=Path("data/zhulu.js"), type=Path)
    args = parser.parse_args()
    write_module(build_data(args.workbook), args.output)


if __name__ == "__main__":
    main()
