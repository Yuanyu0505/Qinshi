const { test } = require("node:test");
const assert = require("node:assert");
const A = require("./atlas.js");

const fixture = [
  {
    id: "t-0001", atlas: "攻", name: "琴师高渐离",
    stages: [
      { key: "5--6", end: 6, items: [{ n: "号钟琴", q: "紫" }] },
      { key: "7--8", end: 8, items: [{ n: "水寒", q: "紫" }] },
      { key: "9--10", end: 10, items: [{ n: "残虹", q: "橙" }] }
    ],
    acquire: "棋阵/招募", group: "非攻墨门", level: 19
  },
  {
    id: "t-0002", atlas: "攻", name: "星魂",
    stages: [
      { key: "5--6", end: 6, items: [{ n: "星云法衣", q: "紫" }] },
      { key: "7--8", end: 8, items: [{ n: "阴符经", q: "紫" }] },
      { key: "9--10", end: 10, items: [{ n: "罡星戒", q: "橙" }] }
    ],
    acquire: "庄园", group: "阴阳轮转", level: 19
  },
  {
    id: "t-0003", atlas: "防", name: "医仙端木蓉",
    stages: [
      { key: "5--6", end: 6, items: [{ n: "冰魄戒", q: "紫" }] },
      { key: "7--8", end: 8, items: [{ n: "墨眉", q: "橙" }] },
      { key: "9--10", end: 10, items: [{ n: "黄帝内经", q: "橙" }] }
    ],
    acquire: "千抽", group: "非攻墨门", level: 5
  }
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

test("neededStages：按当前等级显示所需阶段", () => {
  assert.deepStrictEqual(A.neededStages(fixture[2], 9).map(s => s.key), ["9--10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 5).map(s => s.key), ["5--6", "7--8", "9--10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 10), []);
  assert.deepStrictEqual(A.neededStages(fixture[2], 19), []);
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
