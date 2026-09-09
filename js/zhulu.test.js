"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const DATA = require("../data/zhulu.js");
const CORE = require("./zhulu.js");

test("逐鹿进度奖励完整覆盖 5 至 2500 的 40 个节点", () => {
  assert.strictEqual(DATA.progressRewards.length, 40);
  assert.deepStrictEqual(DATA.progressRewards[0], {
    progress: 5, item: "烤山鸡", quantity: 5, seasonTier: null
  });
  assert.deepStrictEqual(DATA.progressRewards.at(-1), {
    progress: 2500, item: "紫/橙色典籍2", quantity: 1, seasonTier: 2500
  });
});

test("赛季档位固定映射进度、品质与元宝", () => {
  assert.deepStrictEqual(DATA.seasonTiers, [
    { progress: 1000, quality: "紫", yuanbao: 0 },
    { progress: 1200, quality: "橙", yuanbao: 7000 },
    { progress: 1400, quality: "紫", yuanbao: 0 },
    { progress: 1800, quality: "橙", yuanbao: 7000 },
    { progress: 2200, quality: "红", yuanbao: 20000 },
    { progress: 2500, quality: "橙", yuanbao: 0 }
  ]);
});

test("明确赛季从 2021 年 7 月连续保存到 2026 年 12 月", () => {
  assert.strictEqual(DATA.seasons.length, 66);
  assert.deepStrictEqual([DATA.seasons[0].year, DATA.seasons[0].month], [2021, 7]);
  assert.deepStrictEqual([DATA.seasons.at(-1).year, DATA.seasons.at(-1).month], [2026, 12]);
  assert.strictEqual(DATA.seasons.find((item) => item.year === 2026 && item.month === 9).rewards[2200], "三十六计");
});

test("派生数据统一使用五德终始", () => {
  assert.ok(DATA.seasons.some((season) => Object.values(season.rewards).includes("五德终始")));
  assert.ok(DATA.seasons.every((season) => !Object.values(season.rewards).includes("伍德终始")));
});

test("数字查询定位准确节点或前后节点", () => {
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "160").items.map((item) => item.progress), [160]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "150").items.map((item) => item.progress), [140, 160]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "1").items.map((item) => item.progress), [5]);
  assert.deepStrictEqual(CORE.locateProgressRewards(DATA.progressRewards, "3000").items.map((item) => item.progress), [2500]);
});

test("道具查询返回全部匹配节点", () => {
  const result = CORE.locateProgressRewards(DATA.progressRewards, "元宝");
  assert.strictEqual(result.mode, "item");
  assert.deepStrictEqual(result.items.map((item) => item.progress), [10, 100, 450, 900]);
});

test("2027 年预测延续 2024 年 3 月开始的十个月循环", () => {
  const predicted = CORE.predictSeason(DATA, 2027, 1);
  assert.strictEqual(predicted.predicted, true);
  assert.deepStrictEqual(predicted.rewards, DATA.seasons.find((item) => item.year === 2024 && item.month === 7).rewards);
});

test("明确资料优先且预测不回填历史月份", () => {
  assert.strictEqual(CORE.predictSeason(DATA, 2026, 12), null);
  assert.strictEqual(CORE.predictSeason(DATA, 2023, 4), null);
});

test("组合筛选同时约束年月、典籍、品质和进度", () => {
  const result = CORE.querySeasons(DATA, {
    year: 2026, month: null, query: "三十六计", quality: "红", progress: 2200
  }, new Date(2026, 8, 8));
  assert.ok(result.explicit.length > 0);
  assert.ok(result.explicit.every((season) => season.year === 2026));
  assert.ok(result.explicit.every((season) => season.matches.every((item) => item.progress === 2200 && item.quality === "红")));
});

test("筛选结果依次展示本月、未来月份和过去月份", () => {
  const groups = CORE.groupFilteredSeasons(DATA, { progress: 1000 }, new Date(2026, 8, 9));

  assert.deepStrictEqual(groups.current.map(CORE.seasonKey), ["2026-09"]);
  assert.deepStrictEqual(groups.future.slice(0, 3).map(CORE.seasonKey), ["2026-10", "2026-11", "2026-12"]);
  assert.ok(groups.future.some((season) => season.predicted && CORE.seasonKey(season) === "2027-01"));
  assert.deepStrictEqual(groups.history.slice(0, 3).map(CORE.seasonKey), ["2026-08", "2026-07", "2026-06"]);
});

test("典籍初始品质以装备属性中的典籍分组为准", () => {
  const equipment = [
    { cat: "典籍", name: "六韬", bookGroup: "初始紫色典籍" },
    { cat: "典籍", name: "黄石天书", bookGroup: "初始橙色典籍" },
    { cat: "武器", name: "六韬", bookGroup: "初始橙色典籍" }
  ];

  assert.strictEqual(CORE.resolveInitialBookQuality(equipment, "六韬"), "紫");
  assert.strictEqual(CORE.resolveInitialBookQuality(equipment, "黄石天书"), "橙");
  assert.strictEqual(CORE.resolveInitialBookQuality(equipment, "不存在的典籍"), null);
});

test("目标页未改动时恢复旧状态，改动后不恢复", () => {
  const session = CORE.createJumpSession(
    "atlas",
    { tab: "seasons", query: "孟子", scrollY: 320 },
    { query: "韩非子", category: "红色神将" },
    { query: "孟子", category: "全部" }
  );
  assert.strictEqual(CORE.shouldRestoreJumpTarget(session, { query: "孟子", category: "全部" }), true);
  assert.strictEqual(CORE.shouldRestoreJumpTarget(session, { query: "孟子", category: "红色神将" }), false);
});
