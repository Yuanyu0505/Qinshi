const assert = require("assert");
const DATA = require("../data/forbidden.js");
const F = require("./forbidden.js");

const current = DATA.occurrences.find(item => item.id === "2026-08-27_shadow_hunt");
const wind = DATA.occurrences.find(item => item.id === "2026-09-17_wind_forest_fire_mountain");
const windResolved = F.resolveTemplate(DATA, wind);
const finalOccurrence = DATA.occurrences[DATA.occurrences.length - 1];

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
assert.strictEqual(DATA.meta.lastDate, "2026-12-06");
assert.deepStrictEqual(
  [finalOccurrence.id, finalOccurrence.start, finalOccurrence.end, finalOccurrence.templateId],
  ["2026-12-03_no_two_suns", "2026-12-03", "2026-12-06", "no_two_suns"]
);
assert.deepStrictEqual(
  DATA.occurrences.filter(item => item.start >= "2026-10-22").map(item => [item.id, item.start, item.end, item.size, item.templateId]),
  [
    ["2026-10-22_wind_forest_fire_mountain", "2026-10-22", "2026-10-25", "大", "wind_forest_fire_mountain"],
    ["2026-10-26_observe_the_depths", "2026-10-26", "2026-10-28", "小", "observe_the_depths"],
    ["2026-10-29_no_two_suns", "2026-10-29", "2026-11-01", "大", "no_two_suns"],
    ["2026-11-02_white_snow", "2026-11-02", "2026-11-04", "小", "white_snow"],
    ["2026-11-05_shadow_hunt", "2026-11-05", "2026-11-08", "大", "shadow_hunt"],
    ["2026-11-09_soul_gathering", "2026-11-09", "2026-11-11", "小", "soul_gathering"],
    ["2026-11-12_wind_forest_fire_mountain", "2026-11-12", "2026-11-15", "大", "wind_forest_fire_mountain"],
    ["2026-11-16_yin_yang", "2026-11-16", "2026-11-18", "小", "yin_yang"],
    ["2026-11-19_song_dance", "2026-11-19", "2026-11-22", "大", "song_dance"],
    ["2026-11-23_life_and_death", "2026-11-23", "2026-11-25", "小", "life_and_death"],
    ["2026-11-26_dragon_might", "2026-11-26", "2026-11-29", "大", "dragon_might"],
    ["2026-11-30_observe_the_depths", "2026-11-30", "2026-12-02", "小", "observe_the_depths"],
    ["2026-12-03_no_two_suns", "2026-12-03", "2026-12-06", "大", "no_two_suns"]
  ]
);

const novemberShadowHunt = DATA.occurrences.find(item => item.id === "2026-11-05_shadow_hunt");
assert.deepStrictEqual(novemberShadowHunt.disciples, [
  { name: "秋水晓梦", base: "血", divine: "攻" },
  { name: "龙骧章邯", base: "攻", divine: "攻" }
]);
["2026-08-27_shadow_hunt", "2026-10-01_shadow_hunt"].forEach(id => {
  assert.deepStrictEqual(DATA.occurrences.find(item => item.id === id).disciples, [
    { name: "秋水晓梦", base: "血", divine: "攻" },
    { name: "龙骧章邯", base: "攻", divine: "血" }
  ]);
});
assert.strictEqual(F.getDefaultView(DATA.occurrences, "2026-11-04").next.id, "2026-11-05_shadow_hunt");
const finalDayView = F.getDefaultView(DATA.occurrences, "2026-12-06");
assert.strictEqual(finalDayView.current.id, "2026-12-03_no_two_suns");
assert.strictEqual(finalDayView.next, null);
assert.strictEqual(finalDayView.afterSchedule, false);
const afterScheduleView = F.getDefaultView(DATA.occurrences, "2026-12-07");
assert.strictEqual(afterScheduleView.current, null);
assert.strictEqual(afterScheduleView.next, null);
assert.strictEqual(afterScheduleView.latestHistory.id, "2026-12-03_no_two_suns");
assert.strictEqual(afterScheduleView.afterSchedule, true);
assert.strictEqual(DATA.occurrences.some(item => item.end > "2026-12-06"), false);

assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 12, y: 13 }, ""), true);
assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 25, y: 10 }, ""), false);
assert.strictEqual(F.shouldToggleToken({ x: 10, y: 10 }, { x: 10, y: 10 }, "秋骊"), false);

const needs = F.normalizeNeeds({
  [wind.id]: { disciples: ["隐虎季布", "隐虎季布"], items: ["影虎", "影虎"] }
}, DATA);
assert.deepStrictEqual(needs[wind.id], { disciples: ["隐虎季布"], items: ["影虎"] });
assert.strictEqual(F.filterOccurrences(DATA, { selectedOnly: true, needs }).length, 1);

const migrated = F.normalizeNeedsV2(null, {
  [wind.id]: { disciples: ["兵家王翦"], items: ["影虎碎片"] }
}, DATA);
assert.deepStrictEqual(migrated.events[wind.id].disciples, ["兵家王翦"]);
assert.deepStrictEqual(migrated.events[wind.id].rewards["equipment:影虎碎片"].purposes, []);

const bodyIdentity = F.rewardIdentity("orangeDrops", "影虎", "影虎");
const fragmentIdentity = F.rewardIdentity("equipmentFragments", "影虎", "影虎");
assert.strictEqual(bodyIdentity.familyKey, fragmentIdentity.familyKey);
assert.strictEqual(fragmentIdentity.name, "影虎碎片");
assert.deepStrictEqual(F.discipleAtlasTargets(DATA, "兵家王翦"), ["兵家王翦", "神·王翦"]);
assert.deepStrictEqual(F.discipleAtlasTargets(DATA, "隐虎季布"), []);
assert.strictEqual(F.machineBeastTarget("王蛇"), "赤练王蛇");
assert.deepStrictEqual(F.rewardIdentity("machineBeasts", "零号"), {
  key: "machine-beast:零号白虎碎片",
  name: "零号白虎碎片",
  rawName: "零号白虎",
  baseName: "零号白虎",
  sectionKey: "machineBeasts",
  category: "machine-beast",
  familyKey: "machine-beast:零号白虎"
});
assert.strictEqual(F.rewardIdentity("nuclei", "零号").name, "零号白虎神核");
assert.deepStrictEqual(F.defaultPurposes("machine-beast"), ["machine-lineup"]);
assert.deepStrictEqual(F.defaultPurposes("nucleus"), ["machine-modification"]);
assert.deepStrictEqual(F.cleanPurposes(["machine-beasts"], "machine-beast"), ["machine-lineup"]);
assert.deepStrictEqual(F.cleanPurposes(["machine-beasts"], "nucleus"), ["machine-modification"]);

const datedNeeds = F.normalizeNeedsV2({
  version: 2,
  events: {
    [current.id]: { disciples: ["龙骧章邯"], rewards: {} },
    [wind.id]: { disciples: ["隐虎季布"], rewards: {} }
  }
}, null, DATA);
assert.deepStrictEqual(F.clearHistoricalNeeds(datedNeeds, DATA.occurrences, "2026-09-17"), [current.id]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(datedNeeds.events, current.id), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(datedNeeds.events, wind.id), true);

const forbiddenText = JSON.stringify(DATA.templates);
assert.strictEqual(forbiddenText.includes("共工戟"), false);
assert.strictEqual(forbiddenText.includes("共工戒"), true);
assert.strictEqual(F.rewardIdentity("contribution10", "共工戟").name, "共工戒");
assert.strictEqual(F.rewardIdentity("equipmentFragments", "共工戟").name, "共工戒碎片");

F.setRewardSelection(migrated, wind.id, fragmentIdentity, true, ["atlas", "forging", "machine-beasts"]);
assert.deepStrictEqual(migrated.events[wind.id].rewards[fragmentIdentity.key].purposes, ["atlas", "forging"]);
assert.strictEqual(F.matchesPurpose(migrated, wind.id, "atlas"), true);
assert.strictEqual(F.matchesPurpose(migrated, wind.id, "machine-beasts"), false);

console.log("forbidden core tests passed");
