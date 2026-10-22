const { test } = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../data/machine-beasts.js");

test("beast sources: all 27 beasts expose their exact acquisition channels", () => {
  const expected = {
    "mechanical-bear": ["聚宝盆"],
    "mechanical-qingluan": ["聚宝盆"],
    "mechanical-kunpeng": ["聚宝盆"],
    "mechanical-flame-puppet": ["聚宝盆"],
    "mechanical-yueliao": ["聚宝盆"],
    "war-demon": ["禁地", "流派自选宝箱"],
    "mirage-tower": ["禁地", "流派自选宝箱"],
    "nine-headed-jade": ["禁地", "流派自选宝箱"],
    "zero-white-tiger": ["禁地", "流派自选宝箱"],
    "pumpkin-monster": ["禁地", "流派自选宝箱"],
    "mechanical-divine-dragon": ["禁地", "流派自选宝箱"],
    "mechanical-yuan-beast": ["禁地", "流派自选宝箱"],
    "mechanical-year-beast": ["禁地", "流派自选宝箱"],
    "mechanical-black-tortoise": ["禁地", "流派自选宝箱"],
    "mechanical-vermilion-bird": ["禁地", "流派自选宝箱"],
    "mechanical-white-tiger": ["禁地", "流派自选宝箱"],
    "mechanical-azure-dragon": ["禁地", "流派自选宝箱", "每日登录"],
    "potu-sanlang": ["禁地", "流派自选宝箱", "庄园"],
    "red-serpent": ["禁地", "流派自选宝箱", "尚同墨方"],
    "mechanical-bronze-man": ["禁地", "流派自选宝箱", "尚同墨方", "论剑"],
    "mechanical-bat": ["43-10", "流派自选宝箱"],
    "eight-claw-centipede": ["41-10", "流派自选宝箱", "论剑", "千机楼"],
    "four-claw-spider": ["流派自选宝箱", "论剑", "千机楼"],
    "mechanical-sand-ship": ["流派自选宝箱"],
    "mechanical-snake": ["15-10"],
    "potu-qilang": ["12-10"],
    "mechanical-wing": ["尚同墨方"]
  };
  assert.equal(DATA.beasts.length, 27);
  assert.deepEqual(Object.fromEntries(DATA.beasts.map(beast => [beast.id, beast.sources])), expected);
  assert.equal(DATA.beasts.find(beast => beast.id === "mechanical-yueliao").name, "机关岳獠");
  assert.equal(DATA.beasts.find(beast => beast.id === "red-serpent").name, "赤练王蛇");
});

test("material sources: basic materials and all six design drop lists remain queryable", () => {
  assert.deepEqual(DATA.materialSources, [
    { id: "lead", name: "铅块", sources: ["好友副本", "聚宝盆"] },
    { id: "bronze", name: "青铜", sources: ["十章后普通黄色关卡"] },
    { id: "steel", name: "精钢", sources: ["十章后精英蓝色关卡"] },
    { id: "dark-iron", name: "玄铁", sources: ["十章后首领红色关卡"] },
    { id: "awakening-blueprint", name: "觉醒神图", sources: ["元宝商城", "商城", "奇遇"] },
    { id: "organ-piece", name: "机关破片", sources: ["元宝商城", "商城", "千机楼"] },
    { id: "bronze-bolt-design", name: "青铜螺栓设计图", sources: ["关卡掉落"], stages: ["53-9", "35-10", "24-10", "11-10"] },
    { id: "steel-base-design", name: "精钢底座设计图", sources: ["关卡掉落"], stages: ["54-9", "36-9", "25-9", "14-10"] },
    { id: "steel-pipe-design", name: "精钢管设计图", sources: ["关卡掉落"], stages: ["55-9", "36-10", "25-10", "16-10"] },
    { id: "dark-iron-shell-design", name: "玄铁外壳设计图", sources: ["关卡掉落"], stages: ["48-9", "37-10", "27-10"] },
    { id: "dark-iron-joint-design", name: "玄铁关节设计图", sources: ["关卡掉落"], stages: ["49-9", "38-10", "28-10"] },
    { id: "dark-iron-box-design", name: "玄铁箱设计图", sources: ["关卡掉落"], stages: ["50-9", "39-10", "29-10"] }
  ]);
  assert.equal(new Set(DATA.materialSources.map(material => material.id)).size, 12);
});

test("reference cost rules: expose price presets and contribution conversion without costing treasure boxes", () => {
  assert.deepEqual(DATA.referenceCostRules, {
    blueprintPrice: 70,
    blueprintPrices: [
      { label: "奇遇", price: 64 },
      { label: "元宝商城", price: 70 },
      { label: "商城", price: 134 }
    ],
    orangeFiveBodyPrice: 45000,
    contributionPerYuan: 2.7,
    treasureBoxNote: "幻音宝盒消耗30000元宝，以上六种设计图对应成品各1个，仅说明不参与计算。"
  });
  assert.equal(DATA.resourceRules.yuanPerContribution, 1 / 2.7);
  assert.equal(DATA.resourceRules.blueprintDivisor, 500);
  assert.equal(DATA.resourceRules.organPieceDivisor, 100);
});
