import os
import unittest

from tools.build_tactics import parse_sheet


WORKTREE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_ROOT = os.path.dirname(os.path.dirname(WORKTREE_ROOT)) if os.path.basename(os.path.dirname(WORKTREE_ROOT)) == ".worktrees" else WORKTREE_ROOT
XLSX = os.path.join(MAIN_ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestBuildTactics(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
