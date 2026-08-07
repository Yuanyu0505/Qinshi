const { test } = require("node:test");
const assert = require("node:assert");
const D = require("./drops.js");

const fixture = {
  normal: [
    { chapter: 56, stage: 10, item: "高级招募券" },
    { chapter: 53, stage: 7, item: "苍云甲" },
    { chapter: 15, stage: 9, item: "银针" }
  ],
  hero: [
    { chapter: 35, stage: 5, item: "獬豸锦袍" },
    { chapter: 34, stage: 1, item: "银针" }
  ],
  reward: [
    { chapter: 56, item: "赤霄" },
    { chapter: 55, item: "河图" }
  ]
};

test("findDrops：关键字命中三个区域各自合并", () => {
  const r = D.findDrops(fixture, "银针");
  assert.deepStrictEqual(r.normal.map(e => `${e.chapter}-${e.stage}`), ["15-9"]);
  assert.deepStrictEqual(r.hero.map(e => `${e.chapter}-${e.stage}`), ["34-1"]);
  assert.deepStrictEqual(r.reward, []);
});

test("findDrops：普通关卡子串匹配", () => {
  const r = D.findDrops(fixture, "苍云");
  assert.strictEqual(r.normal.length, 1);
  assert.strictEqual(r.hero.length, 0);
  assert.strictEqual(r.reward.length, 0);
});

test("findDrops：声望奖励匹配", () => {
  const r = D.findDrops(fixture, "赤霄");
  assert.deepStrictEqual(r.reward.map(e => e.chapter), [56]);
  assert.strictEqual(r.normal.length, 0);
});

test("findDrops：空查询与无结果返回空", () => {
  assert.deepStrictEqual(D.findDrops(fixture, ""), { normal: [], hero: [], reward: [] });
  assert.deepStrictEqual(D.findDrops(fixture, "   "), { normal: [], hero: [], reward: [] });
  assert.deepStrictEqual(D.findDrops(fixture, "不存在"), { normal: [], hero: [], reward: [] });
});
