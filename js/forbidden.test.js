const assert = require("assert");
const DATA = require("../data/forbidden.js");
const F = require("./forbidden.js");

const current = DATA.occurrences.find(item => item.id === "2026-08-27_shadow_hunt");
const wind = DATA.occurrences.find(item => item.id === "2026-09-17_wind_forest_fire_mountain");
const windResolved = F.resolveTemplate(DATA, wind);

assert.strictEqual(F.statusFor(current, "2026-08-27"), "current");
assert.strictEqual(F.statusFor(current, "2026-08-31"), "history");
assert.strictEqual(F.getDefaultView(DATA.occurrences, "2026-08-27").next.id, "2026-08-31_soul_gathering");
assert.ok(F.findMatches(DATA, current, "龙骧").includes("disciples"));
assert.ok(F.findMatches(DATA, current, "龙骧").includes("equipmentFragments"));
assert.deepStrictEqual(F.findMatches(DATA, current, "攻"), ["disciples"]);
assert.ok(windResolved.equipmentFragments.includes("影虎"));
assert.strictEqual(windResolved.equipmentFragments.filter(item => item === "白玉君子佩").length, 1);
assert.ok(windResolved.machineBeasts.includes("赤练王蛇"));
assert.ok(windResolved.nuclei.includes("机关玄武"));
assert.deepStrictEqual(windResolved.rank1Rows, [
  ["鬼谷子", "南华真经"],
  ["三军虎符"]
]);
assert.deepStrictEqual(windResolved.rank2Rows, [
  ["三军虎符"],
  ["七海蛟龙甲"]
]);
assert.deepStrictEqual(windResolved.rank3to10Rows, [
  ["七海蛟龙甲"]
]);
assert.deepStrictEqual(windResolved.equipmentFragmentRows, [
  ["腾龙枪", "破阵弓", "影虎"],
  ["月华战袍", "七海蛟龙甲"],
  ["白玉君子佩", "黄金牡丹"]
]);

assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 12, y: 13 }, ""), true);
assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 25, y: 10 }, ""), false);
assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 10, y: 10 }, "秋骊"), false);

const needs = F.normalizeNeeds({
  [wind.id]: { disciples: ["隐虎季布", "隐虎季布"], items: ["影虎", "影虎"] }
}, DATA);
assert.deepStrictEqual(needs[wind.id], { disciples: ["隐虎季布"], items: ["影虎"] });
assert.strictEqual(F.filterOccurrences(DATA, { selectedOnly: true, needs }).length, 1);

console.log("forbidden core tests passed");
