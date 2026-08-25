const { test } = require("node:test");
const assert = require("node:assert");
const C = require("./equipment-compare.js");

const weapon = {
  id: "w-1", cat: "武器", name: "普通武器", main: "攻",
  tiers: { 红金: [{ t: "攻防血", v: 10 }, { t: "攻", v: 5 }, { t: "暴击", v: 8 }] }
};
const divineWeapon = {
  id: "dw-1", cat: "神兵武器", name: "神兵武器", main: "攻",
  tiers: { 红金: [{ t: "攻", v: 12 }, { t: "暴击", v: 10 }, { t: "速", v: 150 }] }
};
const noCritical = {
  id: "w-2", cat: "武器", name: "无暴击武器", main: "攻",
  tiers: { 红金: [{ t: "血", v: 6 }] }
};
const missingTier = {
  id: "w-3", cat: "武器", name: "缺少档位", main: "攻",
  tiers: { 红色: [{ t: "暴击", v: 20 }] }
};
const book = {
  id: "b-1", cat: "典籍", name: "测试典籍", main: "攻、内力", bookGroup: "初始橙色典籍",
  stages: {
    红金: [
      { stage: 0, tokens: [{ t: "速", v: 150 }] },
      { stage: 5, tokens: [{ t: "攻防血", v: 10, matches: ["攻", "防", "血", "攻防血"] }] },
      { stage: 10, tokens: [{ t: "攻防血", v: 5, matches: ["攻", "防", "血", "攻防血"] }, { t: "暴击", v: 12 }] },
      { stage: 15, tokens: [{ t: "暴击", v: 8 }] }
    ]
  }
};

test("equipment comparison: maps normal and divine categories into four large groups", () => {
  assert.strictEqual(C.groupForCategory("武器"), "武器");
  assert.strictEqual(C.groupForCategory("神兵武器"), "武器");
  assert.strictEqual(C.groupForCategory("防具"), "防具");
  assert.strictEqual(C.groupForCategory("神兵防具"), "防具");
  assert.strictEqual(C.groupForCategory("饰品"), "饰品");
  assert.strictEqual(C.groupForCategory("神兵饰品"), "饰品");
  assert.strictEqual(C.groupForCategory("典籍"), "典籍");
  assert.strictEqual(C.groupForCategory("神兵典籍"), "典籍");
});

test("equipment comparison: uses the final cumulative book stage and distinguishes a missing tier", () => {
  const tokens = C.tokensForTier(book, "红金");
  assert.deepStrictEqual(tokens.map(token => [token.t, token.v]), [
    ["速", 150], ["攻防血", 15], ["暴击", 20]
  ]);
  assert.strictEqual(C.tokensForTier(missingTier, "红金"), null);
});

test("equipment comparison: generates only involved dimensions in the fixed order", () => {
  assert.deepStrictEqual(C.availableDimensions([weapon, divineWeapon], "红金"), [
    "攻", "血", "防", "攻防血", "暴击", "速"
  ]);
});

test("equipment comparison: expands attack-defense-health for single stats but keeps its own raw dimension", () => {
  assert.deepStrictEqual(C.dimensionValue(weapon, "红金", "攻"), { available: true, value: 15 });
  assert.deepStrictEqual(C.dimensionValue(weapon, "红金", "血"), { available: true, value: 10 });
  assert.deepStrictEqual(C.dimensionValue(weapon, "红金", "防"), { available: true, value: 10 });
  assert.deepStrictEqual(C.dimensionValue(weapon, "红金", "攻防血"), { available: true, value: 10 });
});

test("equipment comparison: marks tied maxima and formats zero and negative differences", () => {
  const tied = Object.assign({}, divineWeapon, {
    id: "dw-2", name: "并列武器", tiers: { 红金: [{ t: "暴击", v: 10 }] }
  });
  const result = C.compareItems([weapon, divineWeapon, tied, noCritical, missingTier], "红金", ["暴击"]);
  assert.strictEqual(result.maxima["暴击"], 10);
  assert.deepStrictEqual(result.rows.map(row => row.values["暴击"] && {
    value: row.values["暴击"].value,
    isMax: row.values["暴击"].isMax,
    differenceDisplay: row.values["暴击"].differenceDisplay
  }), [
    { value: 8, isMax: false, differenceDisplay: "-2%" },
    { value: 10, isMax: true, differenceDisplay: "" },
    { value: 10, isMax: true, differenceDisplay: "" },
    { value: 0, isMax: false, differenceDisplay: "-10%" },
    undefined
  ]);
  assert.strictEqual(result.rows[4].available, false);
});

test("equipment comparison: speed keeps flat units", () => {
  const slower = Object.assign({}, weapon, { id: "w-4", tiers: { 红金: [{ t: "速", v: 145 }] } });
  const result = C.compareItems([divineWeapon, slower], "红金", ["速"]);
  assert.strictEqual(result.rows[0].values["速"].display, "150速");
  assert.strictEqual(result.rows[1].values["速"].differenceDisplay, "-5速");
});
