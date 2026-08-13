import os
import unittest
from pathlib import Path

from openpyxl import load_workbook

from tools.build_tactics import BOOK_NAME, default_xlsx, parse_sheet, parse_worksheet


WORKTREE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_ROOT = os.path.dirname(os.path.dirname(WORKTREE_ROOT)) if os.path.basename(os.path.dirname(WORKTREE_ROOT)) == ".worktrees" else WORKTREE_ROOT
XLSX = os.path.join(MAIN_ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestBuildTactics(unittest.TestCase):
    def test_default_source_uses_main_repository_outside_worktree(self):
        worktree_root = Path(r"C:\repo\.worktrees\tactics-section")
        self.assertEqual(
            default_xlsx(worktree_root),
            Path(r"C:\repo") / BOOK_NAME,
        )

    @classmethod
    def setUpClass(cls):
        cls.payload = parse_sheet(XLSX)
        cls.items = {item["id"]: item for item in cls.payload["items"]}

    def test_order_and_rank_continuity(self):
        self.assertEqual(self.payload["meta"]["order"], ["风", "林", "火", "山", "阴", "雷"])
        self.assertEqual(set(self.items), {"wind", "forest", "fire", "mountain", "yin", "thunder"})
        for item in self.items.values():
            self.assertEqual([row["rank"] for row in item["ranks"]], list(range(16)))

    def test_confirmed_source_corrections(self):
        fire = self.items["fire"]
        wind = self.items["wind"]
        self.assertEqual(fire["markName"], "火之印记")
        self.assertIn(
            {"name": "防", "value": 240, "unit": "flat"},
            wind["ranks"][6]["baseAttributes"],
        )
        wind_mantras = {item["id"]: item for item in wind["mantras"]}
        self.assertEqual(wind_mantras["qi"]["attribute"], "防")
        self.assertEqual(wind_mantras["biao"]["attribute"], "攻")

    def test_forest_mantra_mapping(self):
        forest = self.items["forest"]
        ling = next(item for item in forest["mantras"] if item["id"] == "ling")
        extreme = next(item for item in forest["mantras"] if item["id"] == "extreme")
        self.assertEqual(ling["stages"][3], {
            "rank": 3, "tacticRank": 3, "value": 4, "fragments": 70,
        })
        self.assertEqual(extreme["stages"][0], {
            "rank": 0, "tacticRank": 10, "value": 10, "fragments": 50,
        })
        self.assertEqual(extreme["stages"][5], {
            "rank": 5, "tacticRank": 15, "value": 60, "fragments": 250,
        })

    def test_yin_and_thunder_percent_groups(self):
        yin = self.items["yin"]
        thunder = self.items["thunder"]
        self.assertEqual(
            [item["value"] for item in yin["ranks"][0]["baseAttributes"]],
            [10, 10, 10, 10],
        )
        self.assertEqual(yin["mantras"][0]["name"], "殇")
        self.assertEqual(yin["mantras"][0]["materialName"], "殇真言碎片")
        self.assertEqual(thunder["mantras"][0]["name"], "盛")
        self.assertEqual(thunder["mantras"][0]["materialName"], "盛真言碎片")

    def test_rank_zero_advance_material_blanks_are_legal_zeroes(self):
        for tactic_id in ("wind", "forest", "fire", "mountain", "yin", "thunder"):
            with self.subTest(tactic_id=tactic_id):
                self.assertEqual(
                    self.items[tactic_id]["ranks"][0]["advance"],
                    {"mark": 0, "merit": 0, "horn": 0},
                )

    def assert_sheet_error(self, coordinate, replacement, expected_parts):
        workbook = load_workbook(XLSX, data_only=True)
        try:
            sheet = workbook["新兵法"]
            sheet[coordinate] = replacement
            with self.assertRaises(ValueError) as raised:
                parse_worksheet(sheet)
        finally:
            workbook.close()
        message = str(raised.exception)
        self.assertIn(coordinate, message)
        for expected in expected_parts:
            self.assertIn(expected, message)

    def test_required_numeric_blanks_report_excel_coordinates(self):
        cases = [
            ("H49", None, ["风兵法", "进阶印记"]),
            ("J48", "", ["风兵法", "单次演练号角"]),
            ("K48", None, ["风兵法", "保底号角"]),
            ("P48", None, ["风兵法", "真言碎片"]),
            ("AB6", None, ["阴兵法", "进阶号角"]),
            ("AD5", " ", ["阴兵法", "真言碎片"]),
        ]
        for coordinate, replacement, expected_parts in cases:
            with self.subTest(coordinate=coordinate):
                self.assert_sheet_error(coordinate, replacement, expected_parts)

    def test_block_identity_key_headers_and_mantra_names_are_checked(self):
        cases = [
            ("B45", "林兵法", ["风兵法", "数据块标题"]),
            ("J46", "号角", ["风兵法", "单次演练号角表头"]),
            ("P46", None, ["风兵法", "真言碎片材料列"]),
            ("L47", "灵（防御）", ["风兵法", "齐真言名称"]),
            ("H68", "山之印记", ["火兵法", "进阶印记材料列"]),
            ("AD4", "盛", ["阴兵法", "殇真言名称"]),
            ("AD26", "殇", ["雷兵法", "盛真言名称"]),
        ]
        for coordinate, replacement, expected_parts in cases:
            with self.subTest(coordinate=coordinate):
                self.assert_sheet_error(coordinate, replacement, expected_parts)


if __name__ == "__main__":
    unittest.main()
