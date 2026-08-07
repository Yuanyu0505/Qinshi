import os
import unittest
from collections import Counter

from tools.build_forging import parse_sheet

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestForgingSummary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.summary, cls.items = parse_sheet(XLSX)

    def test_summary_len(self):
        self.assertEqual(len(self.summary), 4)

    def test_summary_cats(self):
        self.assertEqual([s["cat"] for s in self.summary], ["武器", "盔甲", "首饰", "典籍"])

    def test_summary_weapon(self):
        weapon = self.summary[0]
        self.assertEqual(len(weapon["stages"]), 11)
        self.assertEqual(weapon["stages"][0], "10紫石2橙石")
        self.assertEqual(weapon["stages"][-1], "12橙石10红石")
        self.assertEqual(weapon["total"], "50紫石54橙石24红石")

    def test_total_items(self):
        self.assertEqual(len(self.items), 156)

    def test_category_counts(self):
        c = Counter(i["cat"] for i in self.items)
        self.assertEqual(c["武器"], 60)
        self.assertEqual(c["盔甲"], 29)
        self.assertEqual(c["首饰"], 27)
        self.assertEqual(c["典籍"], 40)

    def test_ids_unique(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_main_quality_orange(self):
        for name in ("雷神锤", "水寒", "星云法衣", "胡非子", "神兵鬼谷子"):
            item = next(i for i in self.items if i["name"] == name)
            self.assertEqual(item["quality"], "橙")

    def test_material_quality_purple(self):
        item = next(i for i in self.items if i["name"] == "雷神锤")
        self.assertEqual(item["stages"][0]["tokens"], [{"n": "非攻", "q": "紫"}])
        self.assertEqual(item["stages"][3]["tokens"], [{"n": "凌虚", "q": "紫"}, {"n": "木剑", "q": "紫"}])

    def test_material_quality_orange(self):
        item = next(i for i in self.items if i["name"] == "雷神锤")
        self.assertEqual(item["stages"][7]["tokens"], [{"n": "鲨齿", "q": "橙"}])

    def test_dash_stage(self):
        item = next(i for i in self.items if i["name"] == "雷神锤")
        self.assertEqual(item["stages"][6]["tokens"], [{"dash": True}])

    def test_empty_stage_as_dash(self):
        item = next(i for i in self.items if i["name"] == "破阵弓")
        dash_count = sum(1 for st in item["stages"] if st["tokens"] == [{"dash": True}])
        self.assertGreater(dash_count, 0)

    def test_stage_labels(self):
        item = next(i for i in self.items if i["name"] == "雷神锤")
        self.assertEqual(item["stages"][0]["stage"], "0-1锻")
        self.assertEqual(item["stages"][10]["stage"], "10锻-红金")


if __name__ == "__main__":
    unittest.main()
