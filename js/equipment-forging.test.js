const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const EquipmentForging = require("./equipment-forging.js");

function loadForgingItems() {
  const context = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, "..", "data", "forging.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.window.FORGING_DATA.items;
}

function loadEquipmentItems() {
  const context = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, "..", "data", "special-equipment.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.window.SPECIAL_EQUIPMENT_DATA.items;
}

const forgingItems = loadForgingItems();
const equipmentItems = loadEquipmentItems();

test("装备锻造跳转：普通装备与同名神兵使用现有锻造名称", () => {
  assert.strictEqual(EquipmentForging.resolveForgeTarget("墨眉", forgingItems), "墨眉");
  assert.strictEqual(EquipmentForging.resolveForgeTarget("神兵墨眉", forgingItems), "墨眉");
  assert.strictEqual(EquipmentForging.resolveForgeTarget("鬼谷子", forgingItems), "鬼谷子");
  assert.strictEqual(EquipmentForging.resolveForgeTarget("神兵鬼谷子", forgingItems), "神兵鬼谷子");
});

test("装备锻造跳转：所有已确认的非同名神兵使用明确对应名称", () => {
  const expected = {
    神兵霸王枪: "君临霸王枪",
    神兵玄翦: "黑白玄翦",
    神兵链蛇: "链蛇软剑",
    神兵衍天: "衍天星际",
    神兵凤鸟: "凤鸟自舞",
    神兵煞魂: "煞魂蛇噬",
    神兵穿甲弩: "百战穿甲弩",
    神兵霜血: "霜血双剑",
    神兵环刃: "淬毒环刃",
    神兵宝扇: "清风宝扇",
    神兵永夜: "永恒之夜",
    神兵辉光: "朔日辉光",
    神兵非攻: "非攻九变",
    神兵新渊: "重铸渊虹",
    神兵凌霄衣: "升雪凌霄衣",
    神兵醉梦: "醉梦罗裳",
    神兵万象: "万象法袍",
    神兵幽兰: "幽兰素裳",
    神兵蛟龙甲: "七海蛟龙甲",
    神兵星云: "星云法衣",
    神兵纵横: "纵横战袍",
    神兵白羽: "白羽绸衣",
    神兵魔铠: "地煞魔铠",
    神兵月华袍: "月华战袍",
    神兵珊瑚樽: "碧海珊瑚樽",
    神兵道宝玉: "道经师宝玉",
    神兵女神泪: "女神之泪",
    神兵金乌: "金乌神饰",
    神兵百鸟: "百鸟信物",
    神兵玉玺: "传国玉玺",
    神兵白玉: "白玉君子佩",
    神兵神座: "结晶神座",
    神兵牡丹: "黄金牡丹",
    神兵寒霜: "寒霜挂坠",
    神兵凶影: "暗夜凶影",
    神兵月光: "月光耳坠",
    神兵虎符: "三军虎符",
    神兵奇门: "奇门遁甲",
    神兵吕览: "吕氏春秋",
    神兵冥史: "冥界史诗",
    神兵百家: "百家杂记",
    神兵南华: "南华真经"
  };

  Object.entries(expected).forEach(([name, target]) => {
    assert.strictEqual(EquipmentForging.resolveForgeTarget(name, forgingItems), target, name);
  });
});

test("装备锻造跳转：没有锻造资料的装备不生成跳转目标", () => {
  assert.strictEqual(EquipmentForging.resolveForgeTarget("秦时周年历", forgingItems), null);
  assert.strictEqual(EquipmentForging.resolveForgeTarget("虎年勋章", forgingItems), null);
  assert.strictEqual(EquipmentForging.resolveForgeTarget("不存在的装备", forgingItems), null);
});

test("装备锻造跳转：生成查询页主锻造模式导航状态", () => {
  assert.deepStrictEqual(
    EquipmentForging.buildForgeNavigation("神兵墨眉", forgingItems),
    { partition: "forging", view: "query", mode: "main", query: "墨眉" }
  );
  assert.strictEqual(EquipmentForging.buildForgeNavigation("虎年勋章", forgingItems), null);
});

test("橙装锻造反向跳转：存在普通和神兵时优先返回神兵装备", () => {
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("非攻九变", equipmentItems, forgingItems).name, "神兵非攻");
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("韩非子", equipmentItems, forgingItems).name, "神兵韩非子");
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("霜血双剑", equipmentItems, forgingItems).name, "神兵霜血");
});

test("橙装锻造反向跳转：鬼谷子和神兵鬼谷子分别映射", () => {
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("鬼谷子", equipmentItems, forgingItems).name, "鬼谷子");
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("神兵鬼谷子", equipmentItems, forgingItems).name, "神兵鬼谷子");
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("五德终始", equipmentItems, forgingItems).name, "五德终始");
  assert.strictEqual(EquipmentForging.resolveEquipmentTarget("银针", equipmentItems, forgingItems), null);
});

test("橙装锻造返回会话：深拷贝装备视图并且只匹配有效的同名锻造结果", () => {
  const view = {
    search: "韩非子",
    filters: ["速"],
    comparison: { itemIds: ["b-1"], dimensions: ["速"] }
  };
  const session = EquipmentForging.createReturnSession("b-1", "韩非子", view, 640);

  view.filters.push("暴击");
  view.comparison.itemIds.push("b-2");

  assert.deepStrictEqual(session, {
    sourceItemId: "b-1",
    forgeName: "韩非子",
    equipmentView: {
      search: "韩非子",
      filters: ["速"],
      comparison: { itemIds: ["b-1"], dimensions: ["速"] }
    },
    scrollY: 640,
    valid: true
  });
  assert.strictEqual(EquipmentForging.matchesReturnSession(session, "韩非子"), true);
  assert.strictEqual(EquipmentForging.matchesReturnSession(session, "非攻九变"), false);
  session.valid = false;
  assert.strictEqual(EquipmentForging.matchesReturnSession(session, "韩非子"), false);
  assert.strictEqual(EquipmentForging.matchesReturnSession(null, "韩非子"), false);
});

test("橙装锻造反向跳转：清除命中条件但保留主属性显示和装备对比", () => {
  const current = {
    search: "旧关键词",
    category: "典籍",
    favoritesOnly: true,
    main: "攻",
    showMain: true,
    filters: ["速", "抗暴"],
    sortAttr: "速",
    valueSource: "红金",
    activated: true,
    comparison: { itemIds: ["b-1"], dimensions: ["速"], expanded: true }
  };

  const next = EquipmentForging.buildReverseEquipmentView(current, "神兵韩非子");

  assert.deepStrictEqual(next, {
    search: "神兵韩非子",
    category: null,
    favoritesOnly: false,
    main: null,
    showMain: true,
    filters: [],
    sortAttr: null,
    valueSource: "max",
    activated: true,
    comparison: { itemIds: ["b-1"], dimensions: ["速"], expanded: true }
  });
  assert.deepStrictEqual(current.filters, ["速", "抗暴"]);
});

test("个人进度目录：普通名和神兵名归一到首选神兵", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "墨眉").map((entry) => [entry.forgeName, entry.equipmentName]),
    [["墨眉", "神兵墨眉"]]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "神兵墨眉").map((entry) => [entry.forgeName, entry.equipmentName]),
    [["墨眉", "神兵墨眉"]]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "鬼谷子").map((entry) => [entry.forgeName, entry.equipmentName]),
    [["鬼谷子", "鬼谷子"], ["神兵鬼谷子", "神兵鬼谷子"]]
  );
});

test("个人进度目录：鬼谷子和神兵鬼谷子保留为两个独立装备族", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "鬼谷子"), "鬼谷子");
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "神兵鬼谷子"), "神兵鬼谷子");
});

test("个人进度目录：普通名、神兵名和唯一别名解析为同一装备族", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "月光耳坠"), "月光耳坠");
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "神兵月光"), "月光耳坠");
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "月光"), "月光耳坠");
  assert.strictEqual(EquipmentForging.resolveProgressFamily(catalog, "神兵"), null);
});

test("个人进度目录：四组稀缺装备保留普通和神兵两个选项", () => {
  const catalog = EquipmentForging.buildProgressEquipmentCatalog(forgingItems, equipmentItems);
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "魔铠").map((entry) => entry.equipmentName),
    ["地煞魔铠", "神兵魔铠"]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "月光").map((entry) => entry.equipmentName),
    ["月光耳坠", "神兵月光"]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "寒霜").map((entry) => entry.equipmentName),
    ["寒霜挂坠", "神兵寒霜"]
  );
  assert.deepStrictEqual(
    EquipmentForging.searchProgressEquipmentCatalog(catalog, "百家").map((entry) => entry.equipmentName),
    ["百家杂记", "神兵百家"]
  );
});

test("个人进度返回会话：深拷贝来源并只匹配有效同名装备", () => {
  const view = { page: 2, query: "墨眉", view: "progress" };
  const session = EquipmentForging.createProgressReturnSession(view, "神兵墨眉", "i1", 720);
  view.page = 4;
  assert.deepStrictEqual(session.progressView, { page: 2, query: "墨眉", view: "progress" });
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "神兵墨眉"), true);
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "墨眉"), false);
  session.valid = false;
  assert.strictEqual(EquipmentForging.matchesProgressReturnSession(session, "神兵墨眉"), false);
});
