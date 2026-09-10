const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const P = require("./progress.js");
const EquipmentForging = require("./equipment-forging.js");

function loadWindowData(file, key) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  return context.window[key];
}

const forgingData = loadWindowData("data/forging.js", "FORGING_DATA");
const equipmentData = loadWindowData("data/special-equipment.js", "SPECIAL_EQUIPMENT_DATA");
const progressCatalog = EquipmentForging.buildProgressEquipmentCatalog(forgingData.items, equipmentData.items);

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

test("aggregateMaterials：汇总数量并按紫色优先、同色拼音升序排列", () => {
  const list = [item.stages[0], item.stages[3], item.stages[3], item.stages[5]];
  const r = P.aggregateMaterials(list);
  assert.deepStrictEqual(r, [
    { n: "非攻", q: "紫", count: 1 },
    { n: "凌虚", q: "紫", count: 2 },
    { n: "木剑", q: "紫", count: 2 },
    { n: "墨眉", q: "橙", count: 1 }
  ]);
});

test("sortMaterialTokens：阶段材料按紫色优先排序且横杠置后", () => {
  const tokens = [
    { n: "鲨齿", q: "橙" },
    { n: "木剑", q: "紫" },
    { dash: true },
    { n: "墨眉", q: "橙" },
    { n: "凌虚", q: "紫" }
  ];
  assert.deepStrictEqual(P.sortMaterialTokens(tokens), [
    { n: "凌虚", q: "紫" },
    { n: "木剑", q: "紫" },
    { n: "墨眉", q: "橙" },
    { n: "鲨齿", q: "橙" },
    { dash: true }
  ]);
  assert.strictEqual(tokens[0].n, "鲨齿");
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

test("品质换算：红色高锻压缩为橙金且橙金升红继承为6锻", () => {
  assert.deepStrictEqual(P.convertQuality({ id: "i1", forgeName: "墨眉", quality: "red", progress: 9 }, "orange"), {
    id: "i1", forgeName: "墨眉", quality: "orange", progress: 6
  });
  assert.deepStrictEqual(P.convertQuality({ id: "i1", forgeName: "墨眉", quality: "orange", progress: 6 }, "red"), {
    id: "i1", forgeName: "墨眉", quality: "red", progress: 6
  });
  assert.strictEqual(P.requiresQualityDowngradeConfirmation({ quality: "red", progress: 7 }, "orange"), true);
  assert.strictEqual(P.requiresQualityDowngradeConfirmation({ quality: "red", progress: 6 }, "orange"), false);
});

test("品质状态：满锻使用橙金或红金且普通进度显示锻数", () => {
  assert.deepStrictEqual(P.progressStatus({ quality: "orange", progress: 6 }), { label: "满锻", tier: "orange-gold" });
  assert.deepStrictEqual(P.progressStatus({ quality: "red", progress: 11 }), { label: "满锻", tier: "red-gold" });
  assert.deepStrictEqual(P.progressStatus({ quality: "red", progress: 5 }), { label: "5锻", tier: "red" });
});

test("旧进度迁移：默认红色、保留锻数并优先神兵", () => {
  const migrated = P.normalizeProgressStore({ disciples: [{ id: "d1", name: "弟子", items: [
    { id: "i1", name: "墨眉", cat: "武器", progress: 9 },
    { id: "i2", name: "地煞魔铠", cat: "盔甲", progress: 2 },
    { id: "i3", name: "鬼谷子", cat: "典籍", progress: 11 }
  ] }] }, progressCatalog, forgingData.items);
  assert.strictEqual(migrated.version, 2);
  assert.deepStrictEqual(migrated.disciples[0].items.map((entry) => [entry.forgeName, entry.equipmentName, entry.quality, entry.progress]), [
    ["墨眉", "神兵墨眉", "red", 9],
    ["地煞魔铠", "神兵魔铠", "red", 2],
    ["神兵鬼谷子", "神兵鬼谷子", "red", 11]
  ]);
});

test("橙色只统计前6段且红色统计完整11段", () => {
  assert.strictEqual(P.remainingStages(item, 0, "orange").length, 6);
  assert.deepStrictEqual(P.remainingStages(item, 6, "orange"), []);
  assert.strictEqual(P.remainingStages(item, 6, "red").length, 5);
  const orangeSummary = P.discipleSummary(data, { items: [{ forgeName: "雷神锤", quality: "orange", progress: 0 }] });
  assert.strictEqual(orangeSummary.materials.some((material) => material.n === "赤霄"), false);
});

test("个人进度搜索：普通名可命中已保存神兵", () => {
  const disciples = P.normalizeProgressStore({ disciples: [{ id: "d1", name: "弟子", items: [
    { id: "i1", name: "墨眉", cat: "武器", progress: 2 }
  ] }] }, progressCatalog, forgingData.items).disciples;
  const result = P.searchEquipment(forgingData, disciples, "墨眉", progressCatalog);
  assert.strictEqual(result.owned.length, 1);
  assert.strictEqual(result.owned[0].progressItem.equipmentName, "神兵墨眉");
});

test("个人进度搜索：精确装备族同时命中直接持有和待用素材并排除无关名称", () => {
  const catalog = [
    { forgeName: "月光耳坠", equipmentName: "月光耳坠", aliases: ["月光耳坠", "月光"], preferred: false },
    { forgeName: "月光耳坠", equipmentName: "神兵月光", aliases: ["月光耳坠", "神兵月光", "月光"], preferred: true },
    { forgeName: "月光战袍", equipmentName: "神兵月光战袍", aliases: ["月光战袍", "神兵月光战袍"], preferred: true },
    { forgeName: "主装备", equipmentName: "神兵主装备", aliases: ["主装备", "神兵主装备"], preferred: true }
  ];
  const fixture = { items: [
    { name: "月光耳坠", stages: [] },
    { name: "月光战袍", stages: [] },
    { name: "主装备", stages: [{ stage: "0→1锻", tokens: [
      { n: "月光耳坠", q: "橙" }, { n: "月光战袍", q: "橙" }
    ] }] }
  ] };
  const disciples = [{ id: "d1", name: "弟子", items: [
    { id: "i1", forgeName: "月光耳坠", equipmentName: "神兵月光", quality: "red", progress: 0 },
    { id: "i2", forgeName: "月光战袍", equipmentName: "神兵月光战袍", quality: "red", progress: 0 },
    { id: "i3", forgeName: "主装备", equipmentName: "神兵主装备", quality: "red", progress: 0 }
  ] }];

  const result = P.searchEquipment(fixture, disciples, "月光耳坠", catalog, "月光耳坠");
  assert.deepStrictEqual(result.owned.map((entry) => entry.progressItem.equipmentName), ["神兵月光"]);
  assert.deepStrictEqual(result.required.map((entry) => entry.progressItem.equipmentName), ["神兵主装备"]);
  assert.deepStrictEqual(result.required[0].hits[0].tokens.map((entry) => entry.token.n), ["月光耳坠"]);
});

test("个人进度搜索：鬼谷子和神兵鬼谷子精确装备族互不命中", () => {
  const catalog = [
    { forgeName: "鬼谷子", equipmentName: "鬼谷子", aliases: ["鬼谷子"], preferred: true },
    { forgeName: "神兵鬼谷子", equipmentName: "神兵鬼谷子", aliases: ["神兵鬼谷子"], preferred: true }
  ];
  const fixture = { items: [{ name: "鬼谷子", stages: [] }, { name: "神兵鬼谷子", stages: [] }] };
  const disciples = [{ name: "弟子", items: [
    { forgeName: "鬼谷子", equipmentName: "鬼谷子", quality: "red", progress: 0 },
    { forgeName: "神兵鬼谷子", equipmentName: "神兵鬼谷子", quality: "red", progress: 0 }
  ] }];

  assert.deepStrictEqual(
    P.searchEquipment(fixture, disciples, "鬼谷子", catalog, "鬼谷子").owned.map((entry) => entry.progressItem.equipmentName),
    ["鬼谷子"]
  );
  assert.deepStrictEqual(
    P.searchEquipment(fixture, disciples, "神兵鬼谷子", catalog, "神兵鬼谷子").owned.map((entry) => entry.progressItem.equipmentName),
    ["神兵鬼谷子"]
  );
});

test("个人进度搜索：宽泛关键词继续使用原有模糊匹配", () => {
  const catalog = [
    { forgeName: "月光耳坠", equipmentName: "神兵月光", aliases: ["月光耳坠", "神兵月光"], preferred: true },
    { forgeName: "月光战袍", equipmentName: "神兵月光战袍", aliases: ["月光战袍", "神兵月光战袍"], preferred: true }
  ];
  const fixture = { items: [{ name: "月光耳坠", stages: [] }, { name: "月光战袍", stages: [] }] };
  const disciples = [{ name: "弟子", items: [
    { forgeName: "月光耳坠", equipmentName: "神兵月光", quality: "red", progress: 0 },
    { forgeName: "月光战袍", equipmentName: "神兵月光战袍", quality: "red", progress: 0 }
  ] }];

  assert.deepStrictEqual(
    P.searchEquipment(fixture, disciples, "月光", catalog).owned.map((entry) => entry.progressItem.equipmentName),
    ["神兵月光", "神兵月光战袍"]
  );
});

test("直接持有展示：使用弟子名说明已佩戴该装备", () => {
  assert.strictEqual(P.buildOwnedSearchLabel({
    disciple: { id: "d1", name: "神·将威龙且" }
  }), "神·将威龙且 已佩戴该装备");
});

test("材料需求展示：使用方括号包裹实际持有装备名并保留命中阶段顺序", () => {
  const presentation = P.buildRequiredSearchPresentation({
    disciple: { id: "d1", name: "弄玉" },
    progressItem: { id: "i1", equipmentName: "神兵左传" },
    item: { name: "左传" },
    hits: [
      { stageIdx: 7, stage: "7→8锻", tokens: [{ tokenIdx: 0, token: { n: "黄石天书", q: "橙" } }] },
      { stageIdx: 9, stage: "9→10锻", tokens: [{ tokenIdx: 0, token: { n: "列子", q: "橙" } }] },
      { stageIdx: 7, stage: "7→8锻", tokens: [{ tokenIdx: 1, token: { n: "黄石天书", q: "橙" } }] }
    ]
  });

  assert.deepStrictEqual(presentation, {
    ownerLabel: "弄玉【神兵左传】",
    hitStageIndexes: [7, 9],
    segments: [
      { stageIdx: 7, stage: "7→8锻", tokens: [{ name: "黄石天书", quality: "橙" }] },
      { stageIdx: 9, stage: "9→10锻", tokens: [{ name: "列子", quality: "橙" }] },
      { stageIdx: 7, stage: "7→8锻", tokens: [{ name: "黄石天书", quality: "橙" }] }
    ]
  });
});

test("弟子顺序调整：交换完整记录且不修改原数组", () => {
  const disciples = [
    { id: "a", name: "弟子A", items: [{ id: "a-item" }] },
    { id: "b", name: "弟子B", items: [{ id: "b-item" }] },
    { id: "c", name: "弟子C", items: [{ id: "c-item" }] }
  ];

  const swapped = P.swapDisciples(disciples, "a", "c");

  assert.deepStrictEqual(swapped.map((disciple) => disciple.id), ["c", "b", "a"]);
  assert.strictEqual(swapped[0].items[0].id, "c-item");
  assert.deepStrictEqual(disciples.map((disciple) => disciple.id), ["a", "b", "c"]);
  assert.notStrictEqual(swapped, disciples);
});

test("弟子顺序调整：相同或无效弟子不会改变顺序", () => {
  const disciples = [{ id: "a" }, { id: "b" }];

  for (const [firstId, secondId] of [["a", "a"], ["a", "missing"], ["missing", "b"]]) {
    const result = P.swapDisciples(disciples, firstId, secondId);
    assert.deepStrictEqual(result.map((disciple) => disciple.id), ["a", "b"]);
    assert.notStrictEqual(result, disciples);
  }
});
