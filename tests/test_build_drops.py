import os
import unittest

from tools.build_drops import parse_sheet

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "秦时相关（更新贯侯钟离昧）20260618.xlsx")


class TestDrops(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = parse_sheet(XLSX)

    def test_counts(self):
        self.assertEqual(len(self.data["normal"]), 197)
        self.assertEqual(len(self.data["hero"]), 128)
        self.assertEqual(len(self.data["reward"]), 28)

    def test_normal_chapter_stage(self):
        normal = self.data["normal"]
        self.assertEqual(
            [(e["chapter"], e["stage"]) for e in normal if e["item"] == "苍云甲"],
            [(53, 7), (48, 7)],
        )
        self.assertEqual(
            [(e["chapter"], e["stage"]) for e in normal if e["item"] == "银针"],
            [(22, 9), (19, 7), (15, 9)],
        )

    def test_hero_chapter_stage(self):
        hero = self.data["hero"]
        self.assertEqual(
            [(e["chapter"], e["stage"]) for e in hero if e["item"] == "獬豸锦袍"],
            [(35, 5), (31, 4), (25, 2), (23, 2), (19, 1), (16, 1), (4, 2)],
        )
        self.assertEqual(
            [(e["chapter"], e["stage"]) for e in hero if e["item"] == "青铜螺栓设计图"],
            [(25, 3), (14, 3), (1, 1)],
        )

    def test_reward_chapter(self):
        reward = self.data["reward"]
        self.assertEqual([e["chapter"] for e in reward if e["item"] == "赤霄"], [56])
        self.assertEqual([e["chapter"] for e in reward if e["item"] == "河图"], [55])

    def test_advanced_ticket_count(self):
        normal = self.data["normal"]
        self.assertEqual(sum(1 for e in normal if e["item"] == "高级招募券"), 20)


if __name__ == "__main__":
    unittest.main()
