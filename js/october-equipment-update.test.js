const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SeptemberUpdate = require("../data/2026-09-content-update.js");
const OctoberUpdate = require("../data/2026-10-equipment-update.js");
const Query = require("./query.js");
const Compare = require("./equipment-compare.js");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSeptemberData() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../data/special-equipment.js"), "utf8"), context);
  SeptemberUpdate.apply(context.window);
  return context.window;
}

function loadOctoberData() {
  const target = loadSeptemberData();
  OctoberUpdate.apply(target);
  return target.SPECIAL_EQUIPMENT_DATA;
}

function itemNamed(data, name) {
  const item = data.items.find((entry) => entry.name === name);
  assert.ok(item, `Missing equipment: ${name}`);
  return item;
}

function numericTokens(tokens) {
  return Object.fromEntries(tokens.filter((token) => token.t).map((token) => [token.t, token.v]));
}

test("十月增量：重复应用保留184条及既有ID、未涉及资料", () => {
  const target = loadSeptemberData();
  const original = plain(target.SPECIAL_EQUIPMENT_DATA);
  OctoberUpdate.apply(target);
  const once = plain(target.SPECIAL_EQUIPMENT_DATA);
  OctoberUpdate.apply(target);
  assert.deepEqual(plain(target.SPECIAL_EQUIPMENT_DATA), once);
  assert.equal(once.items.length, 184);
  assert.equal(once.meta.total, 184);
  assert.equal(once.meta.version, "20261021");
  assert.equal(once.meta.contentUpdatedAt, "2026-10-21");
  assert.equal(once.meta.sourceFile, original.meta.sourceFile);
  assert.equal(new Set(once.items.map((item) => item.id)).size, 184);
  const changedNames = new Set(["神兵影虎", "公孙龙子", "孟子", "易经", "胡非子", "墨子", "春秋", "南瓜灯笼"]);
  original.items.forEach((oldItem) => {
    const current = itemNamed(once, oldItem.name);
    assert.equal(current.id, oldItem.id);
    if (!changedNames.has(oldItem.name)) assert.deepEqual(current, oldItem);
  });
  assert.deepEqual(once.items.filter((item) => item.id.startsWith("eq-202610-")).map((item) => item.id).sort(), [
    "eq-202610-01", "eq-202610-02", "eq-202610-03", "eq-202610-04",
    "eq-202610-05", "eq-202610-06", "eq-202610-07", "eq-202610-08"
  ]);
});

test("十月增量：浏览器脚本在加载时自动应用", () => {
  const target = loadSeptemberData();
  const context = { self: target };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../data/2026-10-equipment-update.js"), "utf8"), context);
  assert.equal(target.SPECIAL_EQUIPMENT_DATA.items.length, 184);
  assert.equal(itemNamed(target.SPECIAL_EQUIPMENT_DATA, "神兵幻音").id, "eq-202610-08");
});

test("十月增量：六件装备逐品质采用用户确认数值", () => {
  const data = loadOctoberData();
  const expected = [
    ["夜阑灯", "武器", "攻", { 暴击: 5 }, { 暴击: 5 }, { 暴击: 5 }, { 暴击: 5, 技免: 5 }],
    ["映月橘裳", "防具", "防", { 抗暴: 5 }, { 抗暴: 5 }, { 抗暴: 5 }, { 抗暴: 5, 穿透: 5 }],
    ["泷星", "饰品", "血", { 暴伤: 5 }, { 暴伤: 5 }, { 暴伤: 5 }, { 暴伤: 5, 穿透: 5 }],
    ["神兵夜阑灯", "神兵武器", "攻", { 暴击: 10, 技免: 10 }, { 暴击: 10, 技免: 15 }, { 暴击: 10, 技免: 15 }, { 暴击: 15, 技免: 15 }],
    ["神兵橘裳", "神兵防具", "防", { 抗暴: 10, 穿透: 10 }, { 抗暴: 10, 穿透: 15 }, { 抗暴: 10, 穿透: 15 }, { 抗暴: 15, 穿透: 15 }],
    ["神兵泷星", "神兵饰品", "血", { 暴伤: 10, 穿透: 10 }, { 暴伤: 15, 穿透: 10 }, { 暴伤: 15, 穿透: 10 }, { 暴伤: 15, 穿透: 15 }]
  ];
  expected.forEach(([name, cat, main, ...tiers]) => {
    const item = itemNamed(data, name);
    assert.equal(item.cat, cat);
    assert.equal(item.main, main);
    ["橙色", "橙金", "红色", "红金"].forEach((tier, index) => {
      assert.deepEqual(numericTokens(item.tiers[tier]), tiers[index], `${name}/${tier}`);
    });
    assert.deepEqual(plain(item.max), tiers[3]);
  });
});

test("十月增量：神兵影虎补低品质并保留红金及其它字段", () => {
  const target = loadSeptemberData();
  const before = plain(itemNamed(target.SPECIAL_EQUIPMENT_DATA, "神兵影虎"));
  OctoberUpdate.apply(target);
  const item = itemNamed(target.SPECIAL_EQUIPMENT_DATA, "神兵影虎");
  assert.deepEqual(numericTokens(item.tiers.橙色), { 技免: 10, 穿透: 5 });
  assert.deepEqual(numericTokens(item.tiers.橙金), { 技免: 10, 穿透: 10 });
  assert.deepEqual(numericTokens(item.tiers.红色), { 技免: 10, 穿透: 10 });
  assert.deepEqual(plain(item.tiers.红金), before.tiers.红金);
  assert.deepEqual(plain(item.max), before.max);
  assert.equal(item.id, before.id);
  assert.equal(item.main, before.main);
});

test("十月增量：五本典籍全部品质更正主属性且保留原副属性与逐阶成长", () => {
  const target = loadSeptemberData();
  const before = plain(target.SPECIAL_EQUIPMENT_DATA);
  OctoberUpdate.apply(target);
  [["公孙龙子", "防"], ["孟子", "血"], ["易经", "血"], ["胡非子", "攻"], ["墨子", "血"]].forEach(([name, main]) => {
    const original = itemNamed(before, name);
    const current = itemNamed(target.SPECIAL_EQUIPMENT_DATA, name);
    assert.equal(current.main, `${main}、内力`);
    assert.equal(current.mainKey, main);
    assert.equal(current.mainByTier, undefined);
    assert.deepEqual(plain(current.tiers), original.tiers);
    assert.deepEqual(plain(current.stages), original.stages);
    assert.deepEqual(plain(current.max), original.max);
  });
});

test("十月增量：春秋只覆盖红金主属性，南瓜灯笼红金标注未开放", () => {
  const target = loadSeptemberData();
  const before = plain(target.SPECIAL_EQUIPMENT_DATA);
  OctoberUpdate.apply(target);
  const spring = itemNamed(target.SPECIAL_EQUIPMENT_DATA, "春秋");
  assert.equal(spring.main, "攻、内力");
  assert.equal(spring.mainKey, "攻");
  assert.deepEqual(plain(spring.mainByTier), { 红金: "血、内力" });
  assert.deepEqual(plain(spring.tiers), itemNamed(before, "春秋").tiers);
  assert.deepEqual(plain(spring.stages), itemNamed(before, "春秋").stages);
  assert.deepEqual(plain(itemNamed(target.SPECIAL_EQUIPMENT_DATA, "南瓜灯笼").tiers.红金), [{ s: "暂未开放" }]);
});

test("十月增量：幻音天章只保存已知累计端点，不伪造初始值或逐阶增量", () => {
  const item = itemNamed(loadOctoberData(), "幻音天章");
  assert.equal(item.main, "攻、内力");
  assert.equal(item.mainKey, "攻");
  assert.equal(item.bookGroup, "初始橙色典籍");
  assert.equal(item.stageDetailsIncomplete, true);
  assert.equal(item.stages, undefined);
  assert.deepEqual(Object.keys(item.stageSnapshots).sort(), ["红色", "红金"].sort());
  assert.deepEqual(plain(item.tiers.橙色), []);
  assert.deepEqual(plain(item.tiers.橙金), []);
  assert.deepEqual(item.stageSnapshots.红色.map((entry) => entry.stage), [15]);
  assert.deepEqual(item.stageSnapshots.红金.map((entry) => entry.stage), [15]);
  assert.deepEqual(numericTokens(item.stageSnapshots.红色[0].tokens), { 速: 145, 攻防血: 46, 技免: 60, 暴击: 15, 暴伤: 15, 穿透: 15 });
  assert.deepEqual(numericTokens(item.stageSnapshots.红金[0].tokens), { 速: 148, 攻防血: 46, 技免: 60, 暴击: 15, 暴伤: 15, 穿透: 15 });
  assert.deepEqual(plain(item.tiers.红色), plain(item.stageSnapshots.红色[0].tokens));
  assert.deepEqual(plain(item.tiers.红金), plain(item.stageSnapshots.红金[0].tokens));
  assert.deepEqual(plain(item.max), { 速: 148, 攻: 46, 防: 46, 血: 46, 攻防血: 46, 技免: 60, 暴击: 15, 暴伤: 15, 穿透: 15 });
});

test("十月增量：神兵幻音区分红色0锻和红金满锻累计端点", () => {
  const item = itemNamed(loadOctoberData(), "神兵幻音");
  assert.equal(item.main, "攻、内力");
  assert.equal(item.mainKey, "攻");
  assert.equal(item.bookGroup, "神兵典籍");
  assert.equal(item.stageDetailsIncomplete, true);
  assert.equal(item.stages, undefined);
  assert.deepEqual(plain(item.summaryLabels), { 红色: "红色0锻", 红金: "红金满锻" });
  assert.deepEqual(plain(item.tiers.橙色), []);
  assert.deepEqual(plain(item.tiers.橙金), []);
  assert.deepEqual(item.stageSnapshots.红色.map((entry) => entry.stage), [0]);
  assert.deepEqual(item.stageSnapshots.红金.map((entry) => entry.stage), [15]);
  assert.deepEqual(numericTokens(item.stageSnapshots.红色[0].tokens), { 速: 145, 抗暴: 35, 攻防血: 51, 技免: 60, 暴击: 16, 暴伤: 25, 穿透: 20 });
  assert.deepEqual(numericTokens(item.stageSnapshots.红金[0].tokens), { 速: 150, 抗暴: 35, 攻防血: 51, 技免: 60, 暴击: 16, 暴伤: 25, 穿透: 20 });
  assert.deepEqual(plain(item.tiers.红色), plain(item.stageSnapshots.红色[0].tokens));
  assert.deepEqual(plain(item.tiers.红金), plain(item.stageSnapshots.红金[0].tokens));
  assert.deepEqual(plain(item.max), { 速: 150, 抗暴: 35, 攻: 51, 防: 51, 血: 51, 攻防血: 51, 技免: 60, 暴击: 16, 暴伤: 25, 穿透: 20 });
});

test("十月资料查询：普通全名可找到神兵简称，未知品质对比不显示零", () => {
  const data = loadOctoberData();
  assert.ok(Query.queryItems(data.items, { search: "幻音天章" }).some((item) => item.name === "神兵幻音"));
  assert.ok(Query.queryItems(data.items, { search: "映月橘裳" }).some((item) => item.name === "神兵橘裳"));
  const divine = itemNamed(data, "神兵幻音");
  assert.equal(Query.sortValue(divine, "速", "max"), 150);
  assert.equal(Compare.dimensionValue(divine, "红色", "攻").value, 51);
  assert.deepEqual(Compare.dimensionValue(divine, "橙金", "攻"), { available: false, value: null });
  const spring = itemNamed(data, "春秋");
  assert.equal(Query.matchMain(spring, "攻", "红色"), true);
  assert.equal(Query.matchMain(spring, "血", "红金"), true);
  assert.equal(Query.matchMain(spring, "攻", "红金"), false);
});
