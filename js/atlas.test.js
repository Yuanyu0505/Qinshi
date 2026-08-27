const { test } = require("node:test");
const assert = require("node:assert");
const A = require("./atlas.js");

test("elementOfDisciple：按提供名单匹配五行并兼容神弟子中点", () => {
  const expected = {
    金: ["神王道少羽", "神霸道田虎", "神赤霄刘季", "神极诣星魂", "神寒蝉吴旷", "神真刚", "神嬴政", "神紫女", "神云中君", "神伏念", "神胡姬", "神虞姬", "神白凤", "神典庆", "神季布", "神司徒万里", "神韩信", "神月神"],
    木: ["神兰轩紫女", "神荼蘼田蜜", "神潜蛟韩信", "神素华少司命", "神镜仙端木蓉", "神逍遥子", "神扶苏", "神韩非", "神颜路", "神燕丹", "神项羽", "神高月", "神墨鸦", "神吴旷", "神田蜜", "神英布", "神田言", "神端木蓉", "神少司命"],
    水: ["瑶瑶", "神鬼谷盖聂", "神凤吟弄玉", "神秋水晓梦", "神天泽", "神墨家雪女", "神水寒高渐离", "神渊虹盖聂", "神天宗晓梦", "神小黎", "神丽姬", "神湘夫人", "神张良", "神赵高", "神诺敏", "神白亦非", "神荆天明", "神田仲", "神钟离昧", "神田虎", "神刘邦", "神盖聂", "神雪女", "神高渐离"],
    火: ["神将威龙且", "神侠道天明", "神龙骧章邯", "神黑龙天", "神惊鲵田言", "神森罗大司命", "神红莲赤练", "神大铁锤", "神黑白玄翦", "神王翦", "神田光", "神焰灵姬", "神蒙恬", "神掩日", "神东皇太一", "神焱妃", "神龙且", "神胜七", "神朱家", "神晓梦", "神卫庄", "神大司命"],
    土: ["神鲨齿卫庄", "神逆天而行", "神梅三娘", "神太虚月神", "神巨阙陈胜", "神蚩魔卫庄", "神李斯", "神荆轲", "神湘君", "神李牧", "神胡亥", "神王离", "神惊鲵", "神田赐", "神章邯", "神赤练", "神星魂"]
  };
  Object.keys(expected).forEach(element => {
    expected[element].forEach(name => assert.strictEqual(A.elementOfDisciple(name), element, name));
  });
  assert.strictEqual(A.elementOfDisciple("神·侠道天明"), "火");
  assert.strictEqual(A.elementOfDisciple(" 神 · 侠道天明 "), "火");
  assert.strictEqual(A.elementOfDisciple("琴师高渐离"), "");
});

const fixture = [
  {
    id: "t-0001", atlas: "攻", name: "琴师高渐离",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "号钟琴", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "水寒", q: "紫" }] },
      { key: "9→10", end: 10, items: [{ n: "残虹", q: "橙" }] }
    ],
    acquire: "棋阵/招募", group: "非攻墨门", level: 19
  },
  {
    id: "t-0002", atlas: "攻", name: "星魂",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "星云法衣", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "阴符经", q: "紫" }] },
      { key: "9→10", end: 10, items: [{ n: "罡星戒", q: "橙" }] }
    ],
    acquire: "庄园", group: "阴阳轮转", level: 19
  },
  {
    id: "t-0003", atlas: "防", name: "医仙端木蓉",
    stages: [
      { key: "5→6", end: 6, items: [{ n: "冰魄戒", q: "紫" }] },
      { key: "7→8", end: 8, items: [{ n: "墨眉", q: "橙" }] },
      { key: "9→10", end: 10, items: [{ n: "黄帝内经", q: "橙" }] }
    ],
    acquire: "千抽", group: "非攻墨门", level: 5
  }
];

const upgradeStages = [
  { key: "5→6", from: 5, to: 6, knots: 136, souls: 0, needsEquipment: true, growth: 2 },
  { key: "6→7", from: 6, to: 7, knots: 191, souls: 95, needsEquipment: false, growth: 2 },
  { key: "7→8", from: 7, to: 8, knots: 268, souls: 0, needsEquipment: true, growth: 3 },
  { key: "8→9", from: 8, to: 9, knots: 376, souls: 160, needsEquipment: false, growth: 3 },
  { key: "9→10", from: 9, to: 10, knots: 526, souls: 0, needsEquipment: true, growth: 5 },
  { key: "10→11", from: 10, to: 11, knots: 188, souls: 40, needsEquipment: false, growth: 5 },
  { key: "11→12", from: 11, to: 12, knots: 188, souls: 40, needsEquipment: false, growth: 6 },
  { key: "12→13", from: 12, to: 13, knots: 188, souls: 40, needsEquipment: false, growth: 6 },
  { key: "13→14", from: 13, to: 14, knots: 188, souls: 40, needsEquipment: false, growth: 7 },
  { key: "14→15", from: 14, to: 15, knots: 188, souls: 40, needsEquipment: false, growth: 0 }
];

test("parseLevelQuery：识别等级查询", () => {
  assert.deepStrictEqual(A.parseLevelQuery("10级以下"), { op: "lt", n: 10 });
  assert.deepStrictEqual(A.parseLevelQuery("9级"), { op: "eq", n: 9 });
  assert.deepStrictEqual(A.parseLevelQuery("5级以上"), { op: "ge", n: 5 });
  assert.strictEqual(A.parseLevelQuery("高渐离"), null);
});

test("levelOf：个人进度覆盖表内等级", () => {
  assert.strictEqual(A.levelOf(fixture[0], {}), 19);
  assert.strictEqual(A.levelOf(fixture[0], { "t-0001": 3 }), 3);
});

test("neededStages：按当前等级和目标等级显示所需阶段", () => {
  assert.deepStrictEqual(A.neededStages(fixture[2], 9).map(s => s.key), ["9→10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 5).map(s => s.key), ["5→6", "7→8", "9→10"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 5, 7).map(s => s.key), ["5→6"]);
  assert.deepStrictEqual(A.neededStages(fixture[2], 10), []);
  assert.deepStrictEqual(A.neededStages(fixture[2], 19), []);
});

test("upgradePlan：按目标等级汇总成本、装备与成长值", () => {
  const plan = A.upgradePlan(fixture[2], 5, 7, upgradeStages);
  assert.deepStrictEqual(plan.equipmentStages.map(s => s.key), ["5→6"]);
  assert.strictEqual(plan.knots, 327);
  assert.strictEqual(plan.souls, 95);
  assert.strictEqual(plan.growth, 4);
  assert.strictEqual(A.upgradePlan(fixture[2], 19, 19, upgradeStages).reached, true);
  assert.strictEqual(A.upgradePlan(fixture[2], 13, 19, upgradeStages).growth, 7);
});

test("summarizeUpgrade：聚合未达标弟子的实际装备", () => {
  const summary = A.summarizeUpgrade([fixture[2], fixture[2]], { "t-0003": 5 }, 7, upgradeStages);
  assert.strictEqual(summary.pending, 2);
  assert.strictEqual(summary.knots, 654);
  assert.strictEqual(summary.equipment.find(item => item.n === "冰魄戒").count, 2);
});

test("summarizeUpgrade：紫色优先且同色按装备名称拼音排序", () => {
  const summary = A.summarizeUpgrade(
    fixture,
    { "t-0001": 5, "t-0002": 5, "t-0003": 5 },
    10,
    upgradeStages
  );
  assert.deepStrictEqual(
    summary.equipment.map(item => `${item.q}:${item.n}`),
    ["紫:冰魄戒", "紫:号钟琴", "紫:水寒", "紫:星云法衣", "紫:阴符经", "橙:残虹", "橙:罡星戒", "橙:黄帝内经", "橙:墨眉"]
  );
});

test("sortEquipment：阶段装备按紫色优先、同色名称拼音升序", () => {
  const equipment = [
    { n: "鲨齿", q: "橙" },
    { n: "木剑", q: "紫" },
    { n: "墨眉", q: "橙" },
    { n: "凌虚", q: "紫" }
  ];
  assert.deepStrictEqual(
    A.sortEquipment(equipment).map(item => `${item.q}:${item.n}`),
    ["紫:凌虚", "紫:木剑", "橙:墨眉", "橙:鲨齿"]
  );
  assert.deepStrictEqual(equipment.map(item => item.n), ["鲨齿", "木剑", "墨眉", "凌虚"]);
});

test("searchAtlas：按名称/获取途径/所属图鉴/道具/等级搜索", () => {
  assert.deepStrictEqual(A.searchAtlas(fixture, "高渐离", {}).map(i => i.id), ["t-0001"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "庄园", {}).map(i => i.id), ["t-0002"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "非攻墨门", {}).map(i => i.id), ["t-0001", "t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "墨眉", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "6级以下", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "5级", {}).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "19级", {}).map(i => i.id), ["t-0001", "t-0002"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "5级以上", {}).map(i => i.id), ["t-0001", "t-0002", "t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "10级以下", {}).map(i => i.id), ["t-0003"]);
});

test("searchAtlas：空查询返回全部", () => {
  assert.strictEqual(A.searchAtlas(fixture, "", {}).length, 3);
  assert.strictEqual(A.searchAtlas(fixture, "   ", {}).length, 3);
});

test("searchAtlas：限定字段后只匹配对应信息", () => {
  assert.deepStrictEqual(A.searchAtlas(fixture, "高渐离", {}, "disciple").map(i => i.id), ["t-0001"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "非攻墨门", {}, "atlas").map(i => i.id), ["t-0001", "t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "墨眉", {}, "equipment").map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "庄园", {}, "acquire").map(i => i.id), ["t-0002"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "5", {}, "level").map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.searchAtlas(fixture, "非攻墨门", {}, "disciple"), []);
});

test("searchAtlas：装备只匹配当前等级到目标等级之间的剩余阶段", () => {
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "墨眉", { "t-0003": 8 }, "equipment", 8),
    [],
    "达到目标等级后不应再匹配历史装备"
  );
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "墨眉", { "t-0003": 8 }, "equipment", 10),
    [],
    "当前等级以下的已完成阶段不应匹配"
  );
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "墨眉", { "t-0003": 5 }, "equipment", 8).map(i => i.id),
    ["t-0003"],
    "当前等级到目标等级之间的装备应匹配"
  );
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "墨眉", { "t-0003": 5 }, "equipment", 7),
    [],
    "目标等级之后的未来阶段不应匹配"
  );
});

test("searchAtlas：全部字段保留非装备匹配，但装备使用剩余需求语义", () => {
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "医仙端木蓉", { "t-0003": 8 }, "all", 8).map(i => i.id),
    ["t-0003"]
  );
  assert.deepStrictEqual(
    A.searchAtlas(fixture, "墨眉", { "t-0003": 8 }, "all", 8),
    []
  );
});

test("filterAtlas：分区、等级闭区间和限定搜索共同生效", () => {
  const levels = { "t-0001": 19, "t-0002": 10, "t-0003": 5 };
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "攻",
    minLevel: 5,
    maxLevel: 10,
    query: "庄园",
    field: "acquire",
    levels
  }).map(i => i.id), ["t-0002"]);
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "全部",
    minLevel: 0,
    maxLevel: 5,
    levels
  }).map(i => i.id), ["t-0003"]);
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "全部",
    minLevel: 10,
    maxLevel: 5,
    levels
  }), []);
});

test("filterAtlas：已收藏分类只展示收藏项并继续叠加筛选", () => {
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "已收藏",
    minLevel: 0,
    maxLevel: 20,
    favorites: ["t-0001", "t-0003"]
  }).map(i => i.id), ["t-0001", "t-0003"]);
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "已收藏",
    minLevel: 0,
    maxLevel: 10,
    query: "墨眉",
    field: "equipment",
    targetLevel: 10,
    levels: { "t-0003": 5 },
    favorites: ["t-0001", "t-0003"]
  }).map(i => i.id), ["t-0003"]);
});

test("filterAtlas：所有分区中收藏项优先且组内顺序不变", () => {
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "全部",
    minLevel: 0,
    maxLevel: 20,
    favorites: ["t-0003", "t-0002"]
  }).map(i => i.id), ["t-0002", "t-0003", "t-0001"]);
  assert.deepStrictEqual(A.filterAtlas(fixture, {
    category: "全部",
    minLevel: 0,
    maxLevel: 20,
    query: "非攻墨门",
    field: "atlas",
    favorites: ["t-0003"]
  }).map(i => i.id), ["t-0003", "t-0001"]);
});

test("equipmentRecordKey：同名装备按阶段和位置独立保存", () => {
  assert.strictEqual(A.equipmentRecordKey("9→10", 0), "9→10|0");
  assert.notStrictEqual(A.equipmentRecordKey("7→8", 0), A.equipmentRecordKey("9→10", 0));
  assert.notStrictEqual(A.equipmentRecordKey("9→10", 0), A.equipmentRecordKey("9→10", 1));
});

test("soulInventoryStatus：区分未填写、还差和库存达标", () => {
  assert.deepStrictEqual(A.soulInventoryStatus(765, 760), { state: "short", owned: 760, missing: 5 });
  assert.deepStrictEqual(A.soulInventoryStatus(765, 765), { state: "enough", owned: 765, missing: 0 });
  assert.deepStrictEqual(A.soulInventoryStatus(765, 900), { state: "enough", owned: 900, missing: 0 });
  assert.deepStrictEqual(A.soulInventoryStatus(765, null), { state: "unset", owned: null, missing: 765 });
  assert.deepStrictEqual(A.soulInventoryStatus(765, ""), { state: "unset", owned: null, missing: 765 });
});

test("normalizeInventoryRecord：只保留合法魂魄和装备记录", () => {
  assert.deepStrictEqual(A.normalizeInventoryRecord({
    soulsOwned: "760",
    equipment: {
      "9→10|0": { name: " 墨眉 ", owned: true, note: " 已有一件 " },
      "9→10|1": { name: "鲨齿", owned: false, note: 123 },
      broken: null
    },
    ignored: true
  }), {
    soulsOwned: 760,
    equipment: {
      "9→10|0": { name: "墨眉", owned: true, note: "已有一件" },
      "9→10|1": { name: "鲨齿", owned: false, note: "123" }
    }
  });
  assert.deepStrictEqual(A.normalizeInventoryRecord({ soulsOwned: "", equipment: [] }), {
    soulsOwned: null,
    equipment: {}
  });
});

test("soulInventoryStatus：所需魂魄为零时无需录入也视为达标", () => {
  assert.deepStrictEqual(A.soulInventoryStatus(0, null), { state: "enough", owned: null, missing: 0 });
});

test("detectNoteSources：禁地、碎片和组合来源严格互斥并保留其他独立关键词", () => {
  assert.deepStrictEqual(
    A.detectNoteSources(["碎片/禁地", "禁地 / 碎片，楼兰", "主线聚宝盆"]),
    ["碎片/禁地", "主线", "聚宝盆", "楼兰"]
  );
  assert.deepStrictEqual(
    A.detectNoteSources(["禁地", "碎片", "碎片／禁地", "禁地／碎片"]),
    ["禁地", "碎片", "碎片/禁地"]
  );
});

test("deriveAtlasState：严格区分装备齐全、未齐全和未录入", () => {
  const common = {
    levels: { "t-0003": 5 },
    targetLevel: 8,
    upgradeStages,
    favorites: ["t-0003"]
  };
  const owned = A.deriveAtlasState(fixture[2], {
    ...common,
    inventory: {
      "t-0003": {
        equipment: {
          "5→6|0": { name: "冰魄戒", owned: true, note: "" },
          "7→8|0": { name: "墨眉", owned: true, note: "" }
        }
      }
    }
  });
  const missing = A.deriveAtlasState(fixture[2], {
    ...common,
    inventory: {
      "t-0003": {
        equipment: {
          "5→6|0": { name: "冰魄戒", owned: false, note: "禁地/碎片" },
          "7→8|0": { name: "墨眉", owned: true, note: "" }
        }
      }
    }
  });
  const unset = A.deriveAtlasState(fixture[2], {
    ...common,
    inventory: {
      "t-0003": {
        equipment: {
          "5→6|0": { name: "冰魄戒", owned: false, note: "禁地" }
        }
      }
    }
  });
  assert.strictEqual(owned.equipmentState, "owned");
  assert.strictEqual(missing.equipmentState, "missing");
  assert.deepStrictEqual(missing.noteSources, ["碎片/禁地"]);
  assert.strictEqual(unset.equipmentState, "unset");
});

test("deriveAtlasState：当前目标区间无需装备时自动视为全部拥有", () => {
  const state = A.deriveAtlasState(fixture[2], {
    levels: { "t-0003": 8 },
    targetLevel: 9,
    upgradeStages,
    inventory: {}
  });
  assert.strictEqual(state.equipmentState, "owned");
});

test("filterAtlas：库存筛选、来源 OR 和已收藏图鉴类型共同生效", () => {
  const inventory = {
    "t-0001": {
      soulsOwned: 0,
      equipment: {
        "5→6|0": { name: "号钟琴", owned: false, note: "禁地兑换" },
        "7→8|0": { name: "水寒", owned: true, note: "" },
        "9→10|0": { name: "残虹", owned: true, note: "" }
      }
    },
    "t-0003": {
      soulsOwned: 160,
      equipment: {
        "5→6|0": { name: "冰魄戒", owned: false, note: "楼兰碎片" },
        "7→8|0": { name: "墨眉", owned: true, note: "" },
        "9→10|0": { name: "黄帝内经", owned: true, note: "" }
      }
    }
  };
  const result = A.filterAtlas(fixture, {
    category: "已收藏",
    favoriteType: "防",
    favorites: ["t-0001", "t-0003"],
    levels: { "t-0001": 5, "t-0003": 5 },
    targetLevel: 10,
    upgradeStages,
    inventory,
    equipmentFilter: "missing",
    noteSources: ["禁地", "楼兰"]
  });
  assert.deepStrictEqual(result.map(item => item.id), ["t-0003"]);
});

test("filterAtlas：置顶、收藏、普通图鉴分组且置顶使用固定排序", () => {
  const result = A.filterAtlas(fixture, {
    category: "全部",
    favorites: ["t-0001", "t-0002", "t-0003"],
    pins: ["t-0001", "t-0003"],
    levels: { "t-0001": 5, "t-0002": 5, "t-0003": 5 },
    targetLevel: 10,
    upgradeStages,
    inventory: {},
    sortField: "disciple"
  });
  assert.deepStrictEqual(result.map(item => item.id), ["t-0001", "t-0003", "t-0002"]);
});

test("filterAtlas：魂魄排序已达标始终优先且未录入始终最后", () => {
  const inventory = {
    "t-0001": { soulsOwned: 1000, equipment: {} },
    "t-0002": { soulsOwned: 0, equipment: {} }
  };
  ["asc", "desc"].forEach(direction => {
    const result = A.filterAtlas(fixture, {
      category: "全部",
      levels: { "t-0001": 5, "t-0002": 5, "t-0003": 5 },
      targetLevel: 10,
      upgradeStages,
      inventory,
      favorites: ["t-0001", "t-0002", "t-0003"],
      sortField: "souls",
      sortDirection: direction
    });
    assert.strictEqual(result[0].id, "t-0001");
    assert.strictEqual(result[result.length - 1].id, "t-0003");
  });
});

test("filterAtlas：明鬼绳结和名称字段支持确认后的排序规则", () => {
  const common = {
    category: "全部",
    levels: { "t-0001": 5, "t-0002": 10, "t-0003": 5 },
    targetLevel: 10,
    upgradeStages
  };
  assert.deepStrictEqual(
    A.filterAtlas(fixture, { ...common, sortField: "knots", sortDirection: "asc" }).map(item => item.id),
    ["t-0002", "t-0001", "t-0003"]
  );
  assert.deepStrictEqual(
    A.filterAtlas(fixture, { ...common, sortField: "group" }).map(item => item.id),
    ["t-0001", "t-0003", "t-0002"]
  );
});
