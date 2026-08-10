import json
from pathlib import Path

from openpyxl import load_workbook


WORKTREE_ROOT = Path(__file__).resolve().parents[1]
BOOK_NAME = "秦时相关（更新贯侯钟离昧）20260618.xlsx"
MAIN_ROOT = WORKTREE_ROOT.parents[1] if WORKTREE_ROOT.parent.name == ".worktrees" else WORKTREE_ROOT
BOOK_CANDIDATES = [path for path in (WORKTREE_ROOT / BOOK_NAME, MAIN_ROOT / BOOK_NAME) if path.exists()]
BOOK = max(BOOK_CANDIDATES, key=lambda path: path.stat().st_mtime)
OUT = WORKTREE_ROOT / "data" / "inscription.js"

TIANS = ["天府", "天相", "天同", "天梁", "天机"]
SOURCE_SHIELDS = ["天遁", "地遁", "人遁", "风遁", "云遁", "龙遁", "虎遁", "神遁", "鬼遁"]
DISPLAY_SHIELDS = [name.replace("遁", "盾") for name in SOURCE_SHIELDS]
EXCLUDED_NAMES = set(SOURCE_SHIELDS + DISPLAY_SHIELDS)


def read_area(ws, start_row, end_row, quality, allowed_tians):
    records = []
    current_tian = None
    for row in range(start_row, end_row + 1):
        label = ws.cell(row, 2).value
        if label in allowed_tians:
            current_tian = label
        if current_tian is None:
            continue

        for index, shield in enumerate(DISPLAY_SHIELDS):
            for column in (3 + index * 2, 4 + index * 2):
                raw_name = ws.cell(row, column).value
                if raw_name is None:
                    continue
                name = str(raw_name).strip()
                if not name or name in EXCLUDED_NAMES:
                    continue
                records.append({"name": name, "quality": quality, "tian": current_tian, "shield": shield})
    return records


workbook = load_workbook(BOOK, data_only=True, read_only=True)
sheet = workbook["铭文"]
records = read_area(sheet, 2, 67, "普通橙色", TIANS[:4]) + read_area(sheet, 73, 133, "红色神将", TIANS)

disciples = {}
for record in records:
    key = record["quality"] + "\0" + record["name"]
    disciple = disciples.setdefault(key, {"name": record["name"], "quality": record["quality"], "slots": []})
    slot = {"tian": record["tian"], "shield": record["shield"]}
    if slot not in disciple["slots"]:
        disciple["slots"].append(slot)

tian_order = {name: index for index, name in enumerate(TIANS)}
data = sorted(disciples.values(), key=lambda item: (0 if item["quality"] == "普通橙色" else 1, item["name"]))
for disciple in data:
    disciple["slots"].sort(key=lambda slot: tian_order[slot["tian"]])

payload = {"meta": {"source": BOOK.name, "ordinarySlots": 4, "divineSlots": 5}, "items": data}
OUT.write_text("window.INSCRIPTION_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"generated {len(data)} disciples from {BOOK}")
