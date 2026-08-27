const assert = require("assert");
const DATA = require("../data/forbidden.js");
const F = require("./forbidden.js");

const current = DATA.occurrences.find(item => item.id === "2026-08-27_shadow_hunt");
const wind = DATA.occurrences.find(item => item.id === "2026-09-17_wind_forest_fire_mountain");

assert.strictEqual(F.statusFor(current, "2026-08-27"), "current");
assert.strictEqual(F.statusFor(current, "2026-08-31"), "history");
assert.strictEqual(F.getDefaultView(DATA.occurrences, "2026-08-27").next.id, "2026-08-31_soul_gathering");
assert.ok(F.findMatches(DATA, current, "秋骊").includes("disciples"));
assert.ok(F.findMatches(DATA, current, "秋骊").includes("equipmentFragments"));
assert.deepStrictEqual(F.findMatches(DATA, current, "攻"), ["disciples"]);
assert.ok(F.resolveTemplate(DATA, wind).equipmentFragments.includes("影虎"));
assert.strictEqual(F.resolveTemplate(DATA, wind).equipmentFragments.filter(item => item === "白玉君子佩").length, 1);
assert.ok(F.resolveTemplate(DATA, wind).machineBeasts.includes("赤练王蛇"));
assert.ok(F.resolveTemplate(DATA, wind).nuclei.includes("机关玄武"));

const needs = F.normalizeNeeds({
  [wind.id]: { disciples: ["隐虎季布", "隐虎季布"], items: ["影虎", "影虎"] }
}, DATA);
assert.deepStrictEqual(needs[wind.id], { disciples: ["隐虎季布"], items: ["影虎"] });
assert.strictEqual(F.filterOccurrences(DATA, { selectedOnly: true, needs }).length, 1);

console.log("forbidden core tests passed");
