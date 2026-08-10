const { test } = require("node:test");
const assert = require("node:assert");
const P = require("./progress.js");

const item = {
  id: "f-0001", cat: "武器", name: "雷神锤", quality: "橙",
  stages: [
    { stage: "0→1锻", tokens: [{ n: "非攻", q: "紫" }] },
    { stage: "1→2锻", tokens: [{ n: "灭魂", q: "紫" }] },
    { stage: "2→3锻", tokens: [{ n: "水寒", q: "紫" }] },
    { stage: "3→4锻", tokens: [{ n: "凌虚", q: "紫" }, { n: "木剑", q: "紫" }] },
    { stage: "4→5锻", tokens: [{ n: "三略", q: "紫" }] },
    { stage: "5→6锻", tokens: [{ n: "墨眉", q: "橙" }] },
    { stage: "6→7锻", tokens: [{ dash: true }] },
    { stage: "7→8锻", tokens: [{ n: "鲨齿", q: "橙" }] },
    { stage: "8→9锻", tokens: [{ n: "秋骊", q: "橙" }] },
    { stage: "9→10锻", tokens: [{ n: "千面", q: "橙" }] },
    { stage: "10锻→红金", tokens: [{ n: "赤霄", q: "橙" }] }
  ]
};

const data = { items: [item] };

test("remainingStages：按已完成阶段数取剩余阶段", () => {
  assert.strictEqual(P.remainingStages(item, 0).length, 11);
  const r = P.remainingStages(item, 3);
  assert.strictEqual(r.length, 8);
  assert.strictEqual(r[0].stage, "3→4锻");
  assert.deepStrictEqual(P.remainingStages(item, 11), []);
  assert.deepStrictEqual(P.remainingStages(item, 99), []);
  assert.deepStrictEqual(P.remainingStages(null, 0), []);
});

test("nextStage：下一阶段及其材料", () => {
  assert.strictEqual(P.nextStage(item, 0).stage, "0→1锻");
  assert.deepStrictEqual(P.nextStage(item, 0).tokens, [{ n: "非攻", q: "紫" }]);
  assert.strictEqual(P.nextStage(item, 3).stage, "3→4锻");
  assert.strictEqual(P.nextStage(item, 11), null);
});

test("aggregateMaterials：汇总材料数量并按数量倒序", () => {
  const list = [item.stages[0], item.stages[3], item.stages[3]];
  const r = P.aggregateMaterials(list);
  assert.deepStrictEqual(r, [
    { n: "凌虚", q: "紫", count: 2 },
    { n: "木剑", q: "紫", count: 2 },
    { n: "非攻", q: "紫", count: 1 }
  ]);
});

test("aggregateMaterials：横杠不参与汇总", () => {
  const r = P.aggregateMaterials([item.stages[6]]);
  assert.deepStrictEqual(r, []);
});

test("discipleSummary：按弟子汇总剩余材料", () => {
  const disciple = {
    id: "d1", name: "弟子一",
    items: [
      { id: "i1", name: "雷神锤", cat: "武器", progress: 3 },
      { id: "i2", name: "雷神锤", cat: "武器", progress: 0 }
    ]
  };
  const r = P.discipleSummary(data, disciple);
  const nonAttack = r.materials.find(m => m.n === "非攻");
  const lingxu = r.materials.find(m => m.n === "凌虚");
  assert.strictEqual(nonAttack.count, 1);
  assert.strictEqual(lingxu.count, 2);
});

test("overallSummary：汇总所有弟子剩余材料", () => {
  const disciples = [
    { id: "d1", name: "弟子一", items: [{ id: "i1", name: "雷神锤", cat: "武器", progress: 0 }] },
    { id: "d2", name: "弟子二", items: [{ id: "i2", name: "雷神锤", cat: "武器", progress: 0 }] }
  ];
  const r = P.overallSummary(data, disciples);
  assert.strictEqual(r.find(m => m.n === "非攻").count, 2);
  assert.strictEqual(r.find(m => m.n === "赤霄").count, 2);
});
