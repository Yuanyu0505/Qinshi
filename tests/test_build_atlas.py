import os
import unittest
from collections import Counter

from tools.build_atlas import parse_sheet

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
            {"key": "5--6", "end": 6, "items": ["号钟琴"]},
            {"key": "7--8", "end": 8, "items": ["水寒"]},
            {"key": "9--10", "end": 10, "items": ["残虹"]},
        ])
        self.assertEqual(item["acquire"], "棋阵/招募")
        self.assertEqual(item["group"], "非攻墨门")
        self.assertEqual(item["level"], 19)

    def test_defense_sample(self):
        item = next(i for i in self.items if i["name"] == "医仙端木蓉")
        self.assertEqual(item["atlas"], "防")
        self.assertEqual(item["level"], 5)
        self.assertEqual(item["stages"][2]["items"], ["黄帝内经"])

    def test_inner_sample(self):
        item = next(i for i in self.items if i["name"] == "燕丹")
        self.assertEqual(item["atlas"], "内力")
        self.assertEqual(item["level"], 7)
        self.assertEqual([st["items"] for st in item["stages"]], [["非攻"], ["墨眉"], ["独黑斗篷"]])

    def test_blood_sample(self):
        item = next(i for i in self.items if i["name"] == "木剑盖聂")
        self.assertEqual(item["atlas"], "血")
        self.assertEqual(item["group"], "非攻墨门")
        self.assertEqual(item["level"], 19)


if __name__ == "__main__":
    unittest.main()
