import os
import unittest
from collections import Counter

from tools.build_special_equipment import parse_book_cell, parse_cell, parse_sheet

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

    def test_damage_reduction_normalize(self):
        expected = {"t": "技免", "v": 20.0, "raw": "20%技免"}
        self.assertEqual(parse_cell("20%减伤"), expected)
        self.assertEqual(parse_cell("20%减免"), expected)
        self.assertEqual(parse_cell("20%技能减免"), expected)
        self.assertEqual(parse_cell("20%技伤减免"), expected)


class TestParseBookCell(unittest.TestCase):
    def test_speed(self):
        self.assertEqual(parse_book_cell("130速"), [{"t": "速", "v": 130.0, "raw": "130速"}])

    def test_enemy_reduction(self):
        self.assertEqual(
            parse_book_cell("敌方-3.6%防"),
            [{"t": "敌方减防", "v": 3.6, "raw": "敌方-3.6%防"}],
        )

    def test_compound_attr(self):
        self.assertEqual(
            parse_book_cell("10%攻防血"),
            [{
                "t": "攻防血",
                "v": 10.0,
                "raw": "10%攻防血",
                "matches": ["攻", "防", "血", "攻防血"],
            }],
        )

    def test_multiline_and_damage_reduction(self):
        self.assertEqual(
            parse_book_cell("12%攻防血\n25%减伤"),
            [
                {"t": "攻防血", "v": 12.0, "raw": "12%攻防血", "matches": ["攻", "防", "血", "攻防血"]},
                {"t": "技免", "v": 25.0, "raw": "25%技免"},
            ],
        )


class TestParseSheet(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items, cls.anomalies = parse_sheet(XLSX)

    def test_total(self):
        self.assertEqual(len(self.items), 175)

    def test_category_counts(self):
        c = Counter(i["cat"] for i in self.items)
        self.assertEqual(c["武器"], 11)
        self.assertEqual(c["防具"], 13)
        self.assertEqual(c["饰品"], 13)
        self.assertEqual(c["神兵武器"], 44)
        self.assertEqual(c["神兵防具"], 21)
        self.assertEqual(c["神兵饰品"], 21)
        self.assertEqual(c["典籍"], 39)
        self.assertEqual(c["神兵典籍"], 13)

    def test_no_anomalies(self):
        self.assertEqual(self.anomalies, [])

    def test_ids_unique(self):
        ids = [i["id"] for i in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_main_attrs(self):
        for i in self.items:
            if i["cat"] in {"典籍", "神兵典籍"}:
                continue
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

    def test_divine_equipment_name_normalization(self):
        names = {item["name"] for item in self.items}
        self.assertIn("神兵月狼锦纱", names)
        self.assertIn("神兵月华袍", names)
        self.assertIn("神兵火魅耳环", names)
        self.assertNotIn("神兵月狼", names)
        self.assertNotIn("神兵月华", names)
        self.assertNotIn("神兵火魅", names)

    def test_new_divine_equipment_tiers(self):
        bow = next(i for i in self.items if i["name"] == "神兵破阵弓")
        robe = next(i for i in self.items if i["name"] == "神兵月华袍")
        self.assertEqual(
            [[t["raw"] for t in bow["tiers"][tier]] for tier in ("橙色", "橙金", "红色", "红金")],
            [["5%暴伤", "10%抗暴"], ["10%暴伤", "10%抗暴"], ["10%暴伤", "10%抗暴"], ["15%暴伤", "10%抗暴"]],
        )
        self.assertEqual(
            [[t["raw"] for t in robe["tiers"][tier]] for tier in ("橙色", "橙金", "红色", "红金")],
            [["6%穿透", "6%暴伤"], ["8%穿透", "8%暴伤"], ["10%穿透", "10%暴伤"], ["10%穿透", "15%暴伤"]],
        )

    def test_status_token(self):
        item = next(i for i in self.items if i["name"] == "秦时周年历")
        self.assertEqual(item["tiers"]["橙色"], [{"s": "暂未开放"}])

    def test_book_groups_and_tiers(self):
        purple = next(i for i in self.items if i["name"] == "三十六计")
        orange = next(i for i in self.items if i["name"] == "黄石天书")
        divine = next(i for i in self.items if i["name"] == "神兵列子")
        self.assertEqual(purple["bookGroup"], "初始紫色典籍")
        self.assertEqual(list(purple["stages"]), ["紫色", "橙色", "橙金", "红色", "红金"])
        self.assertEqual(orange["bookGroup"], "初始橙色典籍")
        self.assertNotIn("紫色", orange["stages"])
        self.assertEqual(divine["bookGroup"], "神兵典籍")
        self.assertNotIn("紫色", divine["stages"])

    def test_book_stage_counts(self):
        book = next(i for i in self.items if i["name"] == "三十六计")
        self.assertEqual([s["stage"] for s in book["stages"]["紫色"]], [0, 5, 10])
        self.assertEqual([s["stage"] for s in book["stages"]["橙色"]], [0, 5, 10])
        self.assertEqual([s["stage"] for s in book["stages"]["橙金"]], [0, 5, 10, 15])

    def test_book_main_attributes(self):
        book = next(i for i in self.items if i["name"] == "管子")
        self.assertEqual(book["main"], "防、内力")
        self.assertEqual(book["mainKey"], "防")

    def test_book_source_order(self):
        books = [i for i in self.items if i["cat"] in {"典籍", "神兵典籍"}]
        self.assertEqual([i["sourceOrder"] for i in books], list(range(52)))

    def test_book_max_uses_final_cumulative_value(self):
        book = next(i for i in self.items if i["name"] == "神兵鬼谷子")
        self.assertEqual(book["max"]["暴击"], 41.0)
        self.assertEqual(book["max"]["抗暴"], 35.0)

    def test_divine_rites_red_stage_15_uses_corrected_attributes(self):
        book = next(i for i in self.items if i["name"] == "神兵礼经")
        stage = next(row for row in book["stages"]["红色"] if row["stage"] == 15)
        self.assertEqual(
            [token["raw"] for token in stage["tokens"]],
            ["25%攻防血", "22%技免", "25%暴击"],
        )


if __name__ == "__main__":
    unittest.main()
