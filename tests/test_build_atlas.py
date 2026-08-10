import os
import unittest
from collections import Counter

import openpyxl

from tools.build_atlas import parse_sheet, parse_upgrade_stages

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestAtlas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = parse_sheet(XLSX)

    def test_total_and_counts(self):
        self.assertEqual(len(self.items), 177)
        c = Counter(i["atlas"] for i in self.items)
        self.assertEqual(c["攻"], 50)
        self.assertEqual(c["血"], 63)
        self.assertEqual(c["内力"], 29)
        self.assertEqual(c["防"], 35)

    def test_ids_unique(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_attack_sample(self):
        item = next(i for i in self.items if i["name"] == "琴师高渐离")
        self.assertEqual(item["atlas"], "攻")
        self.assertEqual(item["stages"], [
            {"key": "5→6", "end": 6, "items": [{"n": "号钟琴", "q": "紫"}]},
            {"key": "7→8", "end": 8, "items": [{"n": "水寒", "q": "紫"}]},
            {"key": "9→10", "end": 10, "items": [{"n": "残虹", "q": "橙"}]},
        ])
        self.assertEqual(item["acquire"], "棋阵/招募")
        self.assertEqual(item["group"], "非攻墨门")
        self.assertEqual(item["level"], 19)

    def test_defense_sample(self):
        item = next(i for i in self.items if i["name"] == "医仙端木蓉")
        self.assertEqual(item["atlas"], "防")
        self.assertEqual(item["level"], 5)
        self.assertEqual(item["stages"][2]["items"], [{"n": "黄帝内经", "q": "橙"}])

    def test_inner_sample(self):
        item = next(i for i in self.items if i["name"] == "燕丹")
        self.assertEqual(item["atlas"], "内力")
        self.assertEqual(item["level"], 7)
        self.assertEqual([st["items"] for st in item["stages"]], [
            [{"n": "非攻", "q": "紫"}],
            [{"n": "墨眉", "q": "橙"}],
            [{"n": "独黑斗篷", "q": "橙"}],
        ])

    def test_blood_sample(self):
        item = next(i for i in self.items if i["name"] == "木剑盖聂")
        self.assertEqual(item["atlas"], "血")
        self.assertEqual(item["group"], "非攻墨门")
        self.assertEqual(item["level"], 19)

    def test_quality_counts(self):
        from collections import Counter
        c = Counter((i["atlas"], tk["q"]) for i in self.items for st in i["stages"] for tk in st["items"])
        self.assertEqual(c[("攻", "紫")], 88)
        self.assertEqual(c[("攻", "橙")], 62)
        self.assertEqual(c[("血", "紫")], 113)
        self.assertEqual(c[("血", "橙")], 76)
        self.assertEqual(c[("内力", "紫")], 43)
        self.assertEqual(c[("内力", "橙")], 44)
        self.assertEqual(c[("防", "紫")], 61)
        self.assertEqual(c[("防", "橙")], 44)

    def test_upgrade_stages(self):
        wb = openpyxl.load_workbook(XLSX, data_only=True)
        stages = parse_upgrade_stages(wb["图鉴汇总"])
        self.assertEqual(len(stages), 19)
        self.assertEqual(stages[0], {
            "key": "1→2", "from": 1, "to": 2,
            "knots": 35, "souls": 20, "needsEquipment": False, "growth": 1,
        })
        self.assertEqual(stages[4]["key"], "5→6")
        self.assertTrue(stages[4]["needsEquipment"])
        self.assertEqual(stages[13]["growth"], 0)
        self.assertEqual(stages[-1]["key"], "19→20")


if __name__ == "__main__":
    unittest.main()
