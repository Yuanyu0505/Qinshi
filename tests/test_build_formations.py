import os
import tempfile
import unittest
from pathlib import Path

from openpyxl import load_workbook

from tools.build_formations import (
    BOOK_NAME,
    default_xlsx,
    normalize_name,
    parse_rule,
    parse_sheet,
    parse_worksheet,
    write_output,
)


WORKTREE_ROOT = Path(__file__).resolve().parents[1]
MAIN_ROOT = (
    WORKTREE_ROOT.parents[1]
    if WORKTREE_ROOT.parent.name == ".worktrees"
    else WORKTREE_ROOT
)
XLSX = MAIN_ROOT / BOOK_NAME


class TestBuildFormations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = parse_sheet(XLSX)
        cls.items = {item["name"]: item for item in cls.payload["items"]}

    def test_default_source_uses_main_repository_outside_worktree(self):
        worktree_root = Path(r"C:\repo\.worktrees\formations-section")
        self.assertEqual(default_xlsx(worktree_root), Path(r"C:\repo") / BOOK_NAME)

    def test_fixed_counts_and_slot_distribution(self):
        self.assertEqual(self.payload["meta"]["formationCount"], 19)
        self.assertEqual(self.payload["meta"]["candidateCount"], 144)
        self.assertEqual(
            sorted(len(item["slots"]) for item in self.payload["items"]),
            [5] * 7 + [6] * 12,
        )

    def test_special_rules_are_preserved(self):
        expected = {
            ("旗开得胜", 4): ("血", 1, "全体内力"),
            ("胜友如云", 4): ("血", 1, "全体内力"),
            ("义薄云天", 4): ("血", 2, "全体内力"),
            ("天光云影", 4): ("血", 2, "追加伤害"),
            ("影形不离", 4): ("血", 2, "全体内力"),
        }
        actual = {}
        for item in self.payload["items"]:
            for slot in item["slots"]:
                key = (item["name"], slot["position"])
                if key in expected:
                    actual[key] = (
                        slot["sourceAttribute"],
                        slot["ratePercent"],
                        slot["targetAttribute"],
                    )
        self.assertEqual(actual, expected)

    def test_official_summary_matches_candidates_and_positions(self):
        for item in self.payload["items"]:
            candidate_names = {candidate["name"] for candidate in item["candidates"]}
            self.assertIn(item["officialMain"], candidate_names)
            self.assertEqual(
                [slot["position"] for slot in item["slots"]],
                list(range(1, len(item["slots"]) + 1)),
            )
            for slot in item["slots"]:
                self.assertIn(slot["officialDisciple"], candidate_names)

    def test_divine_names_drop_middle_dot_but_keep_source_name(self):
        raw_names = [
            candidate
            for item in self.payload["items"]
            for candidate in item["candidates"]
            if "·" in candidate["rawName"]
        ]
        self.assertTrue(raw_names)
        for candidate in raw_names:
            self.assertNotIn("·", candidate["name"])
        self.assertEqual(normalize_name(" 神·扶苏 "), "神扶苏")

    def test_parse_rule_reports_coordinate_for_invalid_source(self):
        with self.assertRaisesRegex(ValueError, "Q4"):
            parse_rule("无法识别", "Q4")

    def test_validation_failure_does_not_overwrite_existing_output(self):
        workbook = load_workbook(XLSX, data_only=True)
        try:
            sheet = workbook["合阵"]
            sheet["Q4"] = "无法识别"
            with self.assertRaisesRegex(ValueError, "Q4"):
                parse_worksheet(sheet)
        finally:
            workbook.close()

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "formations.js"
            output.write_text("完整旧数据", encoding="utf-8")
            with self.assertRaises(ValueError):
                write_output({"items": []}, output)
            self.assertEqual(output.read_text(encoding="utf-8"), "完整旧数据")


if __name__ == "__main__":
    unittest.main()
