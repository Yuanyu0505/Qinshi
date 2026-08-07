import os
import unittest
from collections import Counter

from tools.build_special_equipment import parse_cell, parse_sheet

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestParseCell(unittest.TestCase):
    def test_attr(self):
        self.assertEqual(parse_cell("5%血"), {"t": "血", "v": 5.0, "raw": "5%血"})

    def test_decimal(self):
        self.assertEqual(parse_cell("6.5%穿透")["v"], 6.5)

    def test_status(self):
        self.assertEqual(parse_cell("暂未开放"), {"s": "暂未开放"})
        self.assertEqual(parse_cell("无"), {"s": "无"})

    def test_blank(self):
        self.assertIsNone(parse_cell(None))
        self.assertIsNone(parse_cell("   "))

    def test_normalize(self):
        self.assertEqual(parse_cell("10%血量")["t"], "血")
        self.assertEqual(parse_cell("10%血量")["raw"], "10%血量")


class TestParseSheet(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items, cls.anomalies = parse_sheet(XLSX)

    def test_total(self):
        self.assertEqual(len(self.items), 123)

    def test_category_counts(self):
        c = Counter(i["cat"] for i in self.items)
        self.assertEqual(c["武器"], 11)
        self.assertEqual(c["防具"], 13)
        self.assertEqual(c["饰品"], 13)
        self.assertEqual(c["神兵武器"], 44)
        self.assertEqual(c["神兵防具"], 21)
        self.assertEqual(c["神兵饰品"], 21)

    def test_no_anomalies(self):
        self.assertEqual(self.anomalies, [])

    def test_ids_unique(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_main_attrs(self):
        for i in self.items:
            if i["cat"].endswith("武器"):
                self.assertEqual(i["main"], "攻")
            elif i["cat"].endswith("防具"):
                self.assertEqual(i["main"], "防")
            else:
                self.assertEqual(i["main"], "血")

    def test_sample_shuori(self):
        item = next(i for i in self.items if i["name"] == "朔日辉光")
        self.assertEqual(item["cat"], "武器")
        self.assertEqual(
            item["tiers"]["橙色"],
            [{"t": "血", "v": 5.0, "raw": "5%血"}, {"t": "穿透", "v": 5.0, "raw": "5%穿透"}],
        )
        self.assertEqual(item["max"]["血"], 10.0)
        self.assertEqual(item["max"]["穿透"], 15.0)

    def test_sample_empty_tiers(self):
        item = next(i for i in self.items if i["name"] == "神兵破阵弓")
        self.assertEqual(item["tiers"]["红金"], [])

    def test_status_token(self):
        item = next(i for i in self.items if i["name"] == "秦时周年历")
        self.assertEqual(item["tiers"]["橙色"], [{"s": "暂未开放"}])


if __name__ == "__main__":
    unittest.main()
