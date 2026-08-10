const { test } = require("node:test");
const assert = require("node:assert");
const A = require("./atlas.js");

const fixture = [
  {
    id: "t-0001", atlas: "攻", name: "琴师高渐离",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "号钟琴", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "水寒", q: "紫" }] },
      { key: "9→10", end: 10, items: [{ n: "残虹", q: "橙" }] }
    ],
    acquire: "棋阵/招募", group: "非攻墨门", level: 19
  },
  {
    id: "t-0002", atlas: "攻", name: "星魂",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "星云法衣", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "阴符经", q: "紫" }] },
      { key: "9→10", end: 10, items: [{ n: "罡星戒", q: "橙" }] }
    ],
    acquire: "庄园", group: "阴阳轮转", level: 19
  },
  {
    id: "t-0003", atlas: "防", name: "医仙端木蓉",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "冰魄戒", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "墨眉", q: "橙" }] },
      { key: "9→10", end: 10, items: [{ n: "黄帝内经", q: "橙" }] }
    ],
    acquire: "千抽", group: "非攻墨门", level: 5
  }
];

const upgradeStages = [
  { key: "5→6", from: 5, to: 6, knots: 136, souls: 0, needsEquipment: true, growth: 2 },
  { key: "6→7", from: 6, to: 7, knots: 191, souls: 95, needsEquipment: false, growth: 2 },
  { key: "7→8", from: 7, to: 8, knots: 268, souls: 0, needsEquipment: true, growth: 3 },
  { key: "8→9", from: 8, to: 9, knots: 376, souls: 160, needsEquipment: false, growth: 3 },
  { key: "9→10", from: 9, to: 10, knots: 526, souls: 0, needsEquipment: true, growth: 5 },
  { key: "10→11", from: 10, to: 11, knots: 188, souls: 40, needsEquipment: false, growth: 5 },
  { key: "11→12", from: 11, to: 12, knots: 188, souls: 40, needsEquipment: false, growth: 6 },
  { key: "12→13", from: 12, to: 13, knots: 188, souls: 40, needsEquipment: false, growth: 6 },
  { key: "13→14", from: 13, to: 14, knots: 188, souls: 40, needsEquipment: false, growth: 7 },
  { key: "14→15", from: 14, to: 15, knots: 188, souls: 40, needsEquipment: false, growth: 0 }
];

test("parseLevelQuery：识别等级查询", () => {
  assert.deepStrictEqual(A.parseLevelQuery("10级以下"), { op: "lt", n: 10 });
  assert.deepStrictEqual(A.parseLevelQuery("9级"), { op: "eq", n: 9 });
  assert.deepStrictEqual(A.parseLevelQuery("5级以上"), { op: "ge", n: 5 });
  assert.strictEqual(A.parseLevelQuery("高渐离"), null);
});

test("levelOf：个人进度覆盖表内等级", () => {
  assert.strictEqual(A.levelOf(fixture[0], {}), 19);
  assert.strictEqual(A.levelOf(fixture[0], { "t-0001": 3 }), 3);
});

test("neededStages：按当前等级和目标等级显示所需阶段", () => {
  assert.deepStrictEqual(A.neededStages(fixture[2], 9).map(s => s.key), ["9→10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 5).map(s => s.key), ["5→6", "7→8", "9→10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 5, 7).map(s => s.key), ["5→6"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 10), []);
  assert.deepStrictEqual(A.neededStages(fixture[2], 19), []);
});

test("upgradePlan：按目标等级汇总成本、装备与成长值", () => {
  const plan = A.upgradePlan(fixture[2], 5, 7, upgradeStages);
  assert.deepStrictEqual(plan.equipmentStages.map(s => s.key), ["5→6"]);
  assert.strictEqual(plan.knots, 327);
  assert.strictEqual(plan.souls, 95);
  assert.strictEqual(plan.growth, 4);
  assert.strictEqual(A.upgradePlan(fixture[2], 19, 19, upgradeStages).reached, true);
  assert.strictEqual(A.upgradePlan(fixture[2], 13, 19, upgradeStages).growth, 7);
});

test("summarizeUpgrade：聚合未达标弟子的实际装备", () => {
  const summary = A.summarizeUpgrade([fixture[2], fixture[2]], { "t-0003": 5 }, 7, upgradeStages);
  assert.strictEqual(summary.pending, 2);
  assert.strictEqual(summary.knots, 654);
  assert.strictEqual(summary.equipment.find(item => item.n === "冰魄戒").count, 2);
});

test("summarizeUpgrade：紫色优先且同色按装备名称拼音排序", () => {
  const summary = A.summarizeUpgrade(
    fixture,
    { "t-0001": 5, "t-0002": 5, "t-0003": 5 },
    10,
    upgradeStages
  );
  assert.deepStrictEqual(
    summary.equipment.map(item => `${item.q}:${item.n}`),
    ["紫:冰魄戒", "紫:号钟琴", "紫:水寒", "紫:阴符经", "橙:残虹", "橙:罡星冠", "橙:黄帝内经", "橙:墨梅"]
  );
});

test("searchAtlas：按名称/获取途径/所属图鉴/道具/等级搜索", () => {
  assert.deepStrictEqual(A.searchAtlas(fixture, "高渐离", {}).map(i => i.id), ["t-0001"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "庄园", {}).map(i => i.id), ["t-0002"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "非攻墨门", {}).map(i => i.id), ["t-0001", "t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "墨眉", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "6级以下", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "5级", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "19级", {}).map(i => i.id), ["t-0001", "t-0002"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "5级以上", {}).map(i => i.id), ["t-0001", "t-0002", "t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "10级以下", {}).map(i => i.id), ["t-0003"]);
});

test("searchAtlas：空查询返回全部", () => {
  assert.strictEqual(A.searchAtlas(fixture, "", {}).length, 3);
  assert.strictEqual(A.searchAtlas(fixture, "   ", {}).length, 3);
});
