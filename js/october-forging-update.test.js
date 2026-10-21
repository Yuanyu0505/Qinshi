const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SeptemberUpdate = require("../data/2026-09-content-update.js");
const OctoberEquipmentUpdate = require("../data/2026-10-equipment-update.js");
const OctoberForgingUpdate = require("../data/2026-10-forging-update.js");
const Forging = require("./forging.js");
const Progress = require("./progress.js");
const EquipmentForging = require("./equipment-forging.js");

const STAGE_NAMES = [
  "0→1锻", "1→2锻", "2→3锻", "3→4锻", "4→5锻", "5→6锻",
  "6→7锻", "7→8锻", "8→9锻", "9→10锻", "10锻→红金"
];

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function readDataScript(filename) {
  return fs.readFileSync(path.join(__dirname, "..", "data", filename), "utf8");
}

function loadSeptemberData() {
  const context = { window: {} };
  vm.runInNewContext(readDataScript("forging.js"), context);
  vm.runInNewContext(readDataScript("special-equipment.js"), context);
  SeptemberUpdate.apply(context.window);
  OctoberEquipmentUpdate.apply(context.window);
  return context.window;
}

function loadOctoberData() {
  const target = loadSeptemberData();
  OctoberForgingUpdate.apply(target);
  return target;
}

function itemNamed(data, name) {
  const item = data.items.find((entry) => entry.name === name);
  assert.ok(item, `Missing forging item: ${name}`);
  return item;
}

const NEW_RECIPES = [
  {
    name: "夜阑灯", cat: "武器", tokens: [
      [{ n: "雪霁", q: "紫" }], [{ n: "灭魂", q: "紫" }], [{ n: "水寒", q: "紫" }],
      [{ n: "凌虚", q: "紫" }, { n: "木剑", q: "紫" }], [{ n: "庄子", q: "紫" }],
      [{ n: "夜阑灯", q: "橙" }], [{ dash: true }], [{ n: "千面", q: "橙" }],
      [{ n: "虎魄", q: "橙" }], [{ n: "衍天星际", q: "橙" }], [{ n: "夜阑灯", q: "橙" }]
    ]
  },
  {
    name: "映月橘裳", cat: "盔甲", tokens: [
      [{ n: "星云法衣", q: "紫" }], [{ n: "天河霓裳", q: "紫" }], [{ n: "升雪凌霄衣", q: "紫" }],
      [{ n: "真龙黑袍", q: "紫" }, { n: "文曲服", q: "紫" }], [{ n: "神行符", q: "紫" }],
      [{ n: "映月橘裳", q: "橙" }], [{ dash: true }], [{ n: "圣贤服", q: "橙" }],
      [{ n: "藏刃衣", q: "橙" }], [{ n: "纵横战袍", q: "橙" }], [{ n: "映月橘裳", q: "橙" }]
    ]
  },
  {
    name: "泷星", cat: "首饰", tokens: [
      [{ dash: true }], [{ dash: true }], [{ dash: true }], [{ n: "冰魄戒", q: "紫" }],
      [{ n: "左传", q: "橙" }], [{ n: "泷星", q: "橙" }], [{ dash: true }],
      [{ n: "金乌神饰", q: "橙" }], [{ n: "女神之泪", q: "橙" }],
      [{ n: "传国玉玺", q: "橙" }], [{ n: "泷星", q: "橙" }]
    ]
  },
  {
    name: "幻音天章", cat: "典籍", tokens: [
      [{ dash: true }], [{ dash: true }], [{ n: "凤鸣", q: "紫" }], [{ n: "上农", q: "紫" }],
      [{ n: "罡星戒", q: "橙" }], [{ n: "幻音天章", q: "橙" }], [{ dash: true }],
      [{ n: "吕氏春秋", q: "橙" }], [{ n: "鬼谷子", q: "橙" }],
      [{ n: "尚书", q: "橙" }], [{ n: "幻音天章", q: "橙" }]
    ]
  }
];

const OLD_RECIPE_PATCHES = [
  { name: "破阵弓", cells: [
    [7, [{ dash: true }], [{ n: "太阿", q: "橙" }]],
    [8, [{ dash: true }], [{ n: "寒蝉", q: "橙" }]],
    [9, [{ dash: true }], [{ n: "百战穿甲弩", q: "橙" }]]
  ] },
  { name: "虎头鞋", cells: [
    [7, [{ dash: true }], [{ n: "苍云甲", q: "橙" }]],
    [8, [{ dash: true }], [{ n: "纵横战袍", q: "橙" }]],
    [9, [{ dash: true }], [{ n: "月华战袍", q: "橙" }]],
    [10, [{ dash: true }], [{ n: "虎头鞋", q: "橙" }]]
  ] },
  { name: "三十六计", cells: [
    [9, [{ n: "孙子兵法", q: "橙" }], [{ n: "孙子兵法", q: "紫" }]]
  ] },
  { name: "晏子春秋", cells: [
    [9, [{ n: "孙子兵法", q: "橙" }], [{ n: "孙子兵法", q: "紫" }]]
  ] },
  { name: "南华真经", cells: [
    [8, [{ n: "鬼谷子", q: "橙" }], [{ n: "商君书", q: "橙" }]],
    [9, [{ n: "商君书", q: "橙" }], [{ n: "鬼谷子", q: "橙" }]]
  ] }
];

test("十月锻造增量：157条稳定增至161条，重复应用不增行且保留所有旧ID和无关配方", () => {
  const target = loadSeptemberData();
  const original = plain(target.FORGING_DATA);
  assert.equal(original.items.length, 157);
  assert.equal(original.meta.total, 157);

  OctoberForgingUpdate.apply(target);
  const once = plain(target.FORGING_DATA);
  OctoberForgingUpdate.apply(target);
  assert.deepEqual(plain(target.FORGING_DATA), once);
  assert.equal(once.items.length, 161);
  assert.equal(once.meta.total, 161);
  assert.equal(new Set(once.items.map((item) => item.id)).size, 161);
  assert.equal(new Set(once.items.map((item) => item.name)).size, 161);

  const changedNames = new Set(OLD_RECIPE_PATCHES.map((entry) => entry.name));
  original.items.forEach((before) => {
    const after = itemNamed(once, before.name);
    assert.equal(after.id, before.id, before.name);
    if (!changedNames.has(before.name)) assert.deepEqual(after, before, before.name);
  });
  const oldIds = new Set(original.items.map((item) => item.id));
  assert.deepEqual(
    once.items.filter((item) => !oldIds.has(item.id)).map((item) => item.name).sort(),
    ["夜阑灯", "映月橘裳", "泷星", "幻音天章"].sort()
  );
});

test("十月锻造增量：锻造石汇总、阶段顺序和已有来源信息保持不变", () => {
  const target = loadSeptemberData();
  const before = plain(target.FORGING_DATA);
  OctoberForgingUpdate.apply(target);
  const after = target.FORGING_DATA;
  assert.deepEqual(plain(after.summary), before.summary);
  assert.equal(after.meta.summaryTotal, before.meta.summaryTotal);
  assert.deepEqual(plain(after.meta.stageNames), STAGE_NAMES);
  assert.equal(after.meta.sourceFile, before.meta.sourceFile);
  assert.equal(after.meta.sourceSheet, before.meta.sourceSheet);
  after.items.forEach((item) => {
    assert.deepEqual(plain(item.stages.map((stage) => stage.stage)), STAGE_NAMES, item.name);
  });
});

test("十月锻造增量：updateForging直接调用与apply得到相同配方资料", () => {
  const direct = plain(loadSeptemberData().FORGING_DATA);
  OctoberForgingUpdate.updateForging(direct);
  const once = plain(direct);
  OctoberForgingUpdate.updateForging(direct);
  assert.deepEqual(direct, once);
  assert.deepEqual(direct, plain(loadOctoberData().FORGING_DATA));
});

for (const expected of NEW_RECIPES) {
  test(`十月新增锻造：${expected.name}完整11格材料、品质、双材料和横杠准确`, () => {
    const item = itemNamed(loadOctoberData().FORGING_DATA, expected.name);
    assert.equal(item.cat, expected.cat);
    assert.equal(item.quality, "橙");
    assert.deepEqual(plain(item.stages), expected.tokens.map((tokens, index) => ({
      stage: STAGE_NAMES[index], tokens
    })));
  });
}

for (const patch of OLD_RECIPE_PATCHES) {
  test(`十月旧配方更正：${patch.name}仅修改确认的材料格，其余整行保留`, () => {
    const target = loadSeptemberData();
    const expected = plain(itemNamed(target.FORGING_DATA, patch.name));
    patch.cells.forEach(([index, beforeTokens, afterTokens]) => {
      assert.deepEqual(expected.stages[index].tokens, beforeTokens, `${patch.name}/${STAGE_NAMES[index]} baseline`);
      expected.stages[index].tokens = afterTokens;
    });
    OctoberForgingUpdate.apply(target);
    assert.deepEqual(plain(itemNamed(target.FORGING_DATA, patch.name)), expected);
  });
}

test("十月旧配方保护：庄子紫色孙子兵法、潜蛟惊鲵和神兵鬼谷子完整行不变", () => {
  const target = loadSeptemberData();
  const before = plain(target.FORGING_DATA);
  OctoberForgingUpdate.apply(target);
  ["庄子", "潜蛟", "神兵鬼谷子"].forEach((name) => {
    assert.deepEqual(plain(itemNamed(target.FORGING_DATA, name)), itemNamed(before, name));
  });
  assert.deepEqual(plain(itemNamed(target.FORGING_DATA, "庄子").stages[9].tokens), [{ n: "孙子兵法", q: "紫" }]);
  assert.deepEqual(plain(itemNamed(target.FORGING_DATA, "潜蛟").stages[7].tokens), [{ n: "惊鲵", q: "橙" }]);
  assert.deepEqual(plain(itemNamed(target.FORGING_DATA, "神兵鬼谷子").stages.map((stage) => stage.tokens)), [
    [{ dash: true }], [{ dash: true }], [{ n: "龙啸", q: "紫" }], [{ n: "刺客列传", q: "紫" }],
    [{ n: "女神之泪", q: "橙" }], [{ n: "鬼谷子", q: "橙" }], [{ dash: true }],
    [{ n: "商君书", q: "橙" }], [{ n: "战国策", q: "橙" }],
    [{ n: "尚书", q: "橙" }], [{ n: "吕氏春秋", q: "橙" }]
  ]);
});

test("十月锻造查询：真实素材反查命中新材料、双素材及更正后的阶段和颜色", () => {
  const data = loadOctoberData().FORGING_DATA;
  const cases = [
    ["雪霁", "夜阑灯", 0, 0, "紫"], ["木剑", "夜阑灯", 3, 1, "紫"],
    ["文曲服", "映月橘裳", 3, 1, "紫"], ["左传", "泷星", 4, 0, "橙"],
    ["凤鸣", "幻音天章", 2, 0, "紫"], ["罡星戒", "幻音天章", 4, 0, "橙"],
    ["太阿", "破阵弓", 7, 0, "橙"], ["寒蝉", "破阵弓", 8, 0, "橙"],
    ["百战穿甲弩", "破阵弓", 9, 0, "橙"], ["苍云甲", "虎头鞋", 7, 0, "橙"],
    ["孙子兵法", "三十六计", 9, 0, "紫"], ["孙子兵法", "晏子春秋", 9, 0, "紫"],
    ["商君书", "南华真经", 8, 0, "橙"], ["鬼谷子", "南华真经", 9, 0, "橙"]
  ];
  cases.forEach(([query, name, stageIdx, tokenIdx, quality]) => {
    const result = Forging.findAsMaterial(data.items, query).find((entry) => entry.item.name === name);
    assert.ok(result, `${query} → ${name}`);
    assert.deepEqual(result.hits, [{ stageIdx, tokenIdx }], `${query} → ${name}`);
    assert.equal(result.item.stages[stageIdx].tokens[tokenIdx].q, quality, `${query} → ${name}`);
  });
  NEW_RECIPES.forEach(({ name }) => {
    assert.deepEqual(plain(Forging.findMain(data.items, name).map((item) => item.name)), [name]);
    const selfMaterial = Forging.findAsMaterial(data.items, name).find((entry) => entry.item.name === name);
    assert.ok(selfMaterial, name);
    assert.deepEqual(selfMaterial.hits, [{ stageIdx: 5, tokenIdx: 0 }, { stageIdx: 10, tokenIdx: 0 }]);
  });
  assert.deepEqual(Forging.findAsMaterial(data.items, "—"), []);
});

test("十月个人进度：新旧配方显示真实未完成需求，完成该阶段后不再命中或汇总", () => {
  const target = loadOctoberData();
  const data = target.FORGING_DATA;
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(data.items, target.SPECIAL_EQUIPMENT_DATA.items);
  const cases = [
    ["夜阑灯", "木剑", 3, 1, "紫"], ["夜阑灯", "衍天星际", 9, 0, "橙"],
    ["映月橘裳", "文曲服", 3, 1, "紫"], ["映月橘裳", "圣贤服", 7, 0, "橙"],
    ["泷星", "左传", 4, 0, "橙"], ["泷星", "金乌神饰", 7, 0, "橙"],
    ["幻音天章", "罡星戒", 4, 0, "橙"], ["幻音天章", "鬼谷子", 8, 0, "橙"],
    ["破阵弓", "太阿", 7, 0, "橙"], ["虎头鞋", "苍云甲", 7, 0, "橙"],
    ["三十六计", "孙子兵法", 9, 0, "紫"], ["晏子春秋", "孙子兵法", 9, 0, "紫"],
    ["南华真经", "商君书", 8, 0, "橙"], ["南华真经", "鬼谷子", 9, 0, "橙"]
  ];
  cases.forEach(([forgeName, material, stageIdx, tokenIdx, quality]) => {
    const option = catalog.find((entry) => entry.forgeName === forgeName && entry.preferred);
    assert.ok(option, forgeName);
    const progressItem = {
      id: "existing-item", forgeName, equipmentName: option.equipmentName,
      equipmentId: option.equipmentId, cat: option.cat, quality: "red", progress: stageIdx
    };
    const disciple = { id: "existing-disciple", name: "弟子", items: [progressItem] };
    const pending = Progress.searchEquipment(data, [disciple], material, catalog);
    assert.equal(pending.required.length, 1, `${forgeName}/${material}`);
    assert.deepEqual(plain(pending.required[0].hits), [{
      stageIdx, stage: STAGE_NAMES[stageIdx], tokens: [{ tokenIdx, token: { n: material, q: quality } }]
    }]);
    assert.deepEqual(Progress.discipleSummary(data, disciple).materials.find((token) => token.n === material), {
      n: material, q: quality, count: 1
    });

    const completed = { ...disciple, items: [{ ...progressItem, progress: stageIdx + 1 }] };
    assert.deepEqual(Progress.searchEquipment(data, [completed], material, catalog).required, []);
    assert.equal(Progress.discipleSummary(data, completed).materials.some((token) => token.n === material), false);
    assert.equal(progressItem.progress, stageIdx);
  });
});

test("十月个人进度：橙色只累计前6阶段，红金满锻排除全部需求且横杠不是材料", () => {
  const data = loadOctoberData().FORGING_DATA;
  NEW_RECIPES.forEach(({ name }) => {
    const item = itemNamed(data, name);
    assert.deepEqual(plain(Progress.remainingStages(item, 0, "orange").map((stage) => stage.stage)), STAGE_NAMES.slice(0, 6));
    assert.deepEqual(plain(Progress.remainingStages(item, 6, "orange")), []);
    assert.equal(Progress.nextStage(item, 11, "red"), null);
    assert.deepEqual(Progress.aggregateMaterials([item.stages[6]]), []);
    const disciple = { id: "d", name: "弟子", items: [{ forgeName: name, quality: "red", progress: 11 }] };
    assert.deepEqual(Progress.discipleSummary(data, disciple).materials, []);
    assert.deepEqual(Progress.searchEquipment(data, [disciple], name).required, []);
  });
});

test("十月装备锻造映射：四件普通名与神兵名都跳转真实配方，反向映射及进度目录优先神兵", () => {
  const target = loadOctoberData();
  const forgingItems = target.FORGING_DATA.items;
  const equipmentItems = target.SPECIAL_EQUIPMENT_DATA.items;
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  const pairs = [
    ["夜阑灯", "神兵夜阑灯"], ["映月橘裳", "神兵橘裳"],
    ["泷星", "神兵泷星"], ["幻音天章", "神兵幻音"]
  ];
  pairs.forEach(([ordinary, divine]) => {
    [ordinary, divine].forEach((name) => {
      assert.equal(EquipmentForging.resolveForgeTarget(name, forgingItems), ordinary, name);
      assert.deepEqual(EquipmentForging.buildForgeNavigation(name, forgingItems), {
        partition: "forging", view: "query", mode: "main", query: ordinary
      });
      assert.equal(EquipmentForging.resolveProgressFamily(catalog, name), ordinary, name);
      assert.deepEqual(
        EquipmentForging.searchProgressEquipmentCatalog(catalog, name).map((entry) => [entry.forgeName, entry.equipmentName]),
        [[ordinary, divine]]
      );
    });
    assert.equal(EquipmentForging.resolveEquipmentTarget(ordinary, equipmentItems, forgingItems).name, divine);
    assert.equal(EquipmentForging.resolveEquipmentTarget(divine, equipmentItems, forgingItems).name, divine);
  });
  assert.equal(EquipmentForging.resolveForgeTarget("神兵鬼谷子", forgingItems), "神兵鬼谷子");
  assert.equal(EquipmentForging.resolveProgressFamily(catalog, "鬼谷子"), "鬼谷子");
  assert.equal(EquipmentForging.resolveProgressFamily(catalog, "神兵鬼谷子"), "神兵鬼谷子");
});

test("十月锻造增量：不改装备属性，也不迁移或重写存量弟子及装备进度", () => {
  const target = loadSeptemberData();
  const beforeEquipment = plain(target.SPECIAL_EQUIPMENT_DATA);
  const oldCatalog = EquipmentForging.buildProgressEquipmentCatalog(target.FORGING_DATA.items, target.SPECIAL_EQUIPMENT_DATA.items);
  const savedStore = Progress.normalizeProgressStore({ version: 2, disciples: [
    { id: "disciple-1", name: "弟子甲", items: [
      { id: "record-bow", forgeName: "破阵弓", quality: "red", progress: 8 },
      { id: "record-book", forgeName: "三十六计", quality: "red", progress: 9 },
      { id: "record-ghost", forgeName: "神兵鬼谷子", quality: "red", progress: 10 }
    ] },
    { id: "disciple-2", name: "弟子乙", items: [
      { id: "record-shoes", forgeName: "虎头鞋", quality: "orange", progress: 6 },
      { id: "record-nanhua", forgeName: "南华真经", quality: "red", progress: 8 }
    ] }
  ] }, oldCatalog, target.FORGING_DATA.items);
  const beforeStore = plain(savedStore);
  const savedJSON = JSON.stringify(savedStore);
  const unexpectedStorageAccess = () => { throw new Error("Forging update must not access persisted progress"); };
  target.localStorage = {
    getItem: unexpectedStorageAccess, setItem: unexpectedStorageAccess,
    removeItem: unexpectedStorageAccess, clear: unexpectedStorageAccess
  };
  target.ACCOUNT_STORAGE = target.localStorage;
  target.PROGRESS_STORE = savedStore;

  OctoberForgingUpdate.apply(target);
  assert.deepEqual(plain(target.SPECIAL_EQUIPMENT_DATA), beforeEquipment);
  assert.strictEqual(target.PROGRESS_STORE, savedStore);
  assert.equal(JSON.stringify(savedStore), savedJSON);
  const newCatalog = EquipmentForging.buildProgressEquipmentCatalog(target.FORGING_DATA.items, target.SPECIAL_EQUIPMENT_DATA.items);
  assert.deepEqual(Progress.normalizeProgressStore(savedStore, newCatalog, target.FORGING_DATA.items), beforeStore);
  assert.deepEqual(savedStore.disciples.map((disciple) => disciple.items.map((item) => [item.id, item.progress, item.quality])), [
    [["record-bow", 8, "red"], ["record-book", 9, "red"], ["record-ghost", 10, "red"]],
    [["record-shoes", 6, "orange"], ["record-nanhua", 8, "red"]]
  ]);
});

test("十月锻造增量：浏览器脚本按九月增量后的加载顺序自动应用且重复加载幂等", () => {
  const target = loadSeptemberData();
  const beforeEquipment = plain(target.SPECIAL_EQUIPMENT_DATA);
  const context = { window: target, self: target };
  const script = readDataScript("2026-10-forging-update.js");
  vm.runInNewContext(script, context);
  assert.equal(target.FORGING_DATA.items.length, 161);
  NEW_RECIPES.forEach(({ name, tokens }) => {
    assert.deepEqual(plain(itemNamed(target.FORGING_DATA, name).stages.map((stage) => stage.tokens)), tokens);
  });
  const once = plain(target.FORGING_DATA);
  vm.runInNewContext(script, context);
  assert.deepEqual(plain(target.FORGING_DATA), once);
  assert.deepEqual(plain(target.SPECIAL_EQUIPMENT_DATA), beforeEquipment);
});
