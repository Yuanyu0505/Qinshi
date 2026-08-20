const { test } = require("node:test");
const assert = require("node:assert");
const T = require("./tactics.js");

function rank(rank, mark, merit, options) {
  const config = options || {};
  return {
    rank,
    baseAttributes: config.baseAttributes || [],
    extraAttributes: config.extraAttributes || [],
    proficiency: config.proficiency,
    advance: { mark: mark || 0, merit: merit || 0, horn: config.horn || 0 },
    rehearsal: config.rehearsal
  };
}

function standardMantra(id, name, attribute) {
  return {
    id,
    name,
    attribute,
    unit: "percent",
    materialName: name + "真言碎片",
    unlockTacticRank: 0,
    maxRank: 9,
    stages: [
      { rank: 0, tacticRank: 0, value: 1, fragments: 40 },
      { rank: 1, tacticRank: 1, value: 2, fragments: 50 },
      { rank: 2, tacticRank: 2, value: 3, fragments: 60 },
      { rank: 3, tacticRank: 3, value: 4, fragments: 70 },
      { rank: 4, tacticRank: 4, value: 5, fragments: 80 },
      { rank: 5, tacticRank: 5, value: 6, fragments: 90 },
      { rank: 6, tacticRank: 6, value: 7, fragments: 100 },
      { rank: 7, tacticRank: 7, value: 8, fragments: 115 },
      { rank: 8, tacticRank: 8, value: 9, fragments: 130 },
      { rank: 9, tacticRank: 9, value: 10, fragments: 150 }
    ]
  };
}

const extreme = {
  id: "extreme",
  name: "极",
  attribute: "灵宝吸收率",
  unit: "percent",
  materialName: "极真言碎片",
  unlockTacticRank: 10,
  maxRank: 5,
  stages: [
    { rank: 0, tacticRank: 10, value: 10, fragments: 50 },
    { rank: 1, tacticRank: 11, value: 20, fragments: 70 },
    { rank: 2, tacticRank: 12, value: 30, fragments: 100 },
    { rank: 3, tacticRank: 13, value: 40, fragments: 140 },
    { rank: 4, tacticRank: 14, value: 50, fragments: 190 },
    { rank: 5, tacticRank: 15, value: 60, fragments: 250 }
  ]
};

const forest = {
  id: "forest",
  name: "林兵法",
  kind: "standard",
  markName: "林之印记",
  ranks: [
    rank(0, 0, 0, { baseAttributes: [{ name: "血", value: 240, unit: "flat" }], rehearsal: { singleHorn: 2, guaranteeHorn: 100 } }),
    rank(1, 20, 100, { rehearsal: { singleHorn: 3, guaranteeHorn: 150 } }),
    rank(2, 30, 200, { rehearsal: { singleHorn: 5, guaranteeHorn: 550 } }),
    rank(3, 40, 300, { rehearsal: { singleHorn: 6, guaranteeHorn: 750 } }),
    rank(4, 60, 400, { proficiency: { min: 5.6, max: 7.5 }, rehearsal: { singleHorn: 7, guaranteeHorn: 950 } }),
    rank(5, 100, 700, { rehearsal: { singleHorn: 10, guaranteeHorn: 1800 } }),
    rank(6, 150, 1100, { rehearsal: { singleHorn: 11, guaranteeHorn: 2100 } }),
    rank(7, 220, 1600, { rehearsal: { singleHorn: 12, guaranteeHorn: 2400 } }),
    rank(8, 400, 2800, { rehearsal: { singleHorn: 18, guaranteeHorn: 4500 } }),
    rank(9, 700, 4800, { rehearsal: { singleHorn: 20, guaranteeHorn: 5500 } }),
    rank(10, 1000, 6500, { rehearsal: { singleHorn: 25, guaranteeHorn: 6800 } }),
    rank(11, 1300, 8000, { rehearsal: { singleHorn: 30, guaranteeHorn: 8520 } }),
    rank(12, 1600, 9500, { rehearsal: { singleHorn: 35, guaranteeHorn: 9835 } }),
    rank(13, 1900, 11000, { rehearsal: { singleHorn: 40, guaranteeHorn: 10920 } }),
    rank(14, 2200, 12500, { rehearsal: { singleHorn: 45, guaranteeHorn: 12240 } }),
    rank(15, 2500, 14000, { baseAttributes: [{ name: "血", value: 1440, unit: "flat" }], rehearsal: { singleHorn: 50, guaranteeHorn: 13950 } })
  ],
  mantras: [
    standardMantra("ling", "灵", "内力"),
    standardMantra("chan", "禅", "血"),
    standardMantra("tong", "统", "PVP速"),
    extreme
  ]
};

const wind = {
  id: "wind",
  name: "风兵法",
  kind: "standard",
  markName: "风之印记",
  ranks: forest.ranks,
  mantras: forest.mantras
};
const windRank4Fixture = {
  id: "wind-rank-4",
  name: "风兵法",
  kind: "standard",
  markName: "风之印记",
  ranks: forest.ranks,
  mantras: forest.mantras
};

const specialAdvance = [
  [0, 0, 0], [20, 100, 2000], [30, 200, 2500], [40, 300, 3000],
  [60, 400, 3500], [100, 700, 4000], [150, 1100, 4500], [220, 1600, 5000],
  [400, 2800, 5500], [700, 4800, 6000], [1000, 6500, 6500], [1300, 8000, 7000],
  [1600, 9500, 7500], [1900, 11000, 8000], [2200, 12500, 8500], [2500, 14000, 9000]
];
const specialFragments = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];

function specialFixture(config) {
  return {
    id: config.id,
    name: config.name + "兵法",
    kind: "special",
    markName: config.name + "之印记",
    ranks: specialAdvance.map((advance, rank) => ({
      rank,
      baseAttributes: config.baseNames.map(name => ({ name, value: 10 + rank, unit: "percent" })),
      extraAttributes: [
        { name: "护盾", value: rank * 100, unit: "flat" },
        { name: config.extraName, value: rank, unit: "percent" }
      ],
      advance: { mark: advance[0], merit: advance[1], horn: advance[2] }
    })),
    mantras: [{
      id: config.mantraId,
      name: config.mantraName,
      attribute: config.mantraAttribute,
      unit: "percent",
      materialName: config.mantraName + "真言碎片",
      unlockTacticRank: 0,
      maxRank: 15,
      stages: specialFragments.map((fragments, rank) => ({
        rank,
        tacticRank: rank,
        value: rank + 1,
        fragments
      }))
    }]
  };
}

const yin = specialFixture({
  id: "yin",
  name: "阴",
  baseNames: ["攻", "防", "血", "追加伤害"],
  extraName: "暴伤减免",
  mantraId: "shang",
  mantraName: "殇",
  mantraAttribute: "真伤抵抗"
});
const thunder = specialFixture({
  id: "thunder",
  name: "雷",
  baseNames: ["攻", "防", "血", "内力"],
  extraName: "暴击伤害",
  mantraId: "sheng",
  mantraName: "盛",
  mantraAttribute: "中级闪避"
});

const emptyStandardMantras = { ling: -1, chan: -1, tong: -1, extreme: -1 };
const startAt5 = { rank: 5, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const targetAt8 = { rank: 8, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const startInactive = { rank: 3, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const targetMantra3 = { rank: 3, rehearsalSpent: 0, mantras: { ...emptyStandardMantras, ling: 3 } };
const extremeAt0 = { rank: 15, rehearsalSpent: 0, mantras: { ...emptyStandardMantras, extreme: 0 } };
const extremeAt5 = { rank: 15, rehearsalSpent: 0, mantras: { ...emptyStandardMantras, extreme: 5 } };
const startAt4 = { rank: 4, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const startAt4ZeroSpent = { rank: 4, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const targetAt4 = { rank: 4, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };
const targetAt5 = { rank: 5, rehearsalSpent: 0, mantras: { ...emptyStandardMantras } };

test("defaultProgress：六种真言均从未激活开始", () => {
  assert.deepStrictEqual(T.defaultProgress(forest), {
    rank: 0,
    rehearsalSpent: 0,
    mantras: { ling: -1, chan: -1, tong: -1, extreme: -1 }
  });
});

test("allowedMantraRank：普通真言和极真言按兵法阶数限制", () => {
  assert.strictEqual(T.allowedMantraRank(forest, "ling", 8), 8);
  assert.strictEqual(T.allowedMantraRank(forest, "ling", 15), 9);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 9), -1);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 10), 0);
  assert.strictEqual(T.allowedMantraRank(forest, "extreme", 15), 5);
});

test("normalizeProgress：容错补齐真言、丢弃未知字段并限制进度", () => {
  assert.deepStrictEqual(T.normalizeProgress(forest, {
    rank: 99,
    rehearsalSpent: 99999,
    mantras: { ling: 99, unexpected: 3 },
    unexpected: true
  }), {
    rank: 15,
    rehearsalSpent: 13950,
    mantras: { ling: 9, chan: -1, tong: -1, extreme: -1 }
  });
});

test("actualMaximum：按完整演练次数计算950/7和2100/11的实际最大消耗", () => {
  assert.strictEqual(T.actualMaximum({ singleHorn: 7, guaranteeHorn: 950 }), 952);
  assert.strictEqual(T.actualMaximum({ singleHorn: 11, guaranteeHorn: 2100 }), 2101);
});

test("normalizeProgress：旧数据安全归一化但保留合法的952与2101", () => {
  assert.strictEqual(T.normalizeProgress(forest, { rank: 4, rehearsalSpent: 952 }).rehearsalSpent, 952);
  assert.strictEqual(T.normalizeProgress(forest, { rank: 6, rehearsalSpent: 2101 }).rehearsalSpent, 2101);
  assert.strictEqual(T.normalizeProgress(forest, { rank: 4, rehearsalSpent: 950 }).rehearsalSpent, 945);
});

test("changeRank：兵法阶数变化重置本阶号角并收缩真言", () => {
  const changed = T.changeRank(forest, {
    rank: 15, rehearsalSpent: 250,
    mantras: { ling: 9, chan: 9, tong: 9, extreme: 5 }
  }, 8);
  assert.strictEqual(changed.rehearsalSpent, 0);
  assert.deepStrictEqual(changed.mantras, { ling: 8, chan: 8, tong: 8, extreme: -1 });
});

test("validateState：拒绝倒退的兵法或真言目标", () => {
  assert.deepStrictEqual(T.validateState(forest, targetAt5, startAt4), ["目标兵法阶数不能低于当前阶数"]);
  assert.deepStrictEqual(T.validateState(forest, targetMantra3, startInactive), ["真言“灵”的目标阶数不能低于当前阶数"]);
});

test("calculatePlan：5→8阶只累计6、7、8阶进阶材料", () => {
  const result = T.calculatePlan(wind, startAt5, targetAt8);
  assert.deepStrictEqual(result.advance.steps.map(step => step.rank), [6, 7, 8]);
  assert.strictEqual(result.advance.mark, 770);
  assert.strictEqual(result.advance.merit, 5500);
});

test("calculatePlan：真言未激活→3阶包含0、1、2、3阶碎片", () => {
  const result = T.calculatePlan(forest, startInactive, targetMantra3);
  assert.strictEqual(result.mantras.ling.fragments, 220);
});

test("calculatePlan：极真言0→5阶不重复计算激活碎片", () => {
  const result = T.calculatePlan(forest, extremeAt0, extremeAt5);
  assert.strictEqual(result.mantras.extreme.fragments, 750);
  assert.strictEqual(result.targetAttributes.find(item => item.key === "mantra:extreme").value, 60);
});

test("attributeSnapshot：输出稳定属性键并包含当前真言", () => {
  assert.deepStrictEqual(T.attributeSnapshot(forest, extremeAt5).find(item => item.key === "base:血:flat"), {
    key: "base:血:flat", group: "base", name: "血", value: 1440, unit: "flat"
  });
  assert.deepStrictEqual(T.attributeSnapshot(forest, targetMantra3).find(item => item.key === "mantra:ling"), {
    key: "mantra:ling", group: "mantra", name: "内力", value: 4, unit: "percent", mantraName: "灵"
  });
});

test("rehearsalAdvancePlan：950阈值、单次7按952实际消耗", () => {
  const result = T.rehearsalAdvancePlan(windRank4Fixture, 4, 5, 0);
  assert.deepStrictEqual(result, {
    steps: [{
      rank: 4, proficiency: { min: 5.6, max: 7.5 }, singleHorn: 7,
      guaranteeHorn: 950, actualMaximumHorn: 952, spent: 0,
      remainingRuns: 136, horn: 952
    }],
    totalHorn: 952
  });
});

test("rehearsalAdvancePlan：起点已消耗945后只需1次7号角，952时无需新增", () => {
  const at945 = T.rehearsalAdvancePlan(windRank4Fixture, 4, 5, 945);
  assert.strictEqual(at945.steps[0].spent, 945);
  assert.strictEqual(at945.steps[0].horn, 7);

  const at952 = T.rehearsalAdvancePlan(windRank4Fixture, 4, 5, 952);
  assert.strictEqual(at952.steps[0].spent, 952);
  assert.strictEqual(at952.steps[0].remainingRuns, 0);
  assert.strictEqual(at952.steps[0].horn, 0);
});

test("rehearsal：拒绝950、951和超过952的输入且不静默归一化", () => {
  [950, 951, 953].forEach(spent => {
    const result = T.calculatePlan(windRank4Fixture, { ...startAt4, rehearsalSpent: spent }, targetAt4);
    assert.strictEqual(result.valid, false, String(spent));
    assert.deepStrictEqual(result.errors, ["本阶已消耗号角必须为0至952的7的倍数"]);
  });
});

test("rehearsalAdvancePlan：风6阶允许实际最大消耗2101", () => {
  const result = T.rehearsalAdvancePlan(wind, 6, 7, 2101);
  assert.strictEqual(result.steps[0].actualMaximumHorn, 2101);
  assert.strictEqual(result.steps[0].spent, 2101);
  assert.strictEqual(result.steps[0].horn, 0);
});

test("rehearsalAdvancePlan：5到8阶累计5、6、7阶，只有起点继承已消耗", () => {
  const result = T.rehearsalAdvancePlan(wind, 5, 8, 10);
  assert.deepStrictEqual(result.steps.map(step => step.rank), [5, 6, 7]);
  assert.deepStrictEqual(result.steps.map(step => step.spent), [10, 0, 0]);
  assert.strictEqual(result.steps.some(step => step.rank === 8), false);
  assert.strictEqual(T.rehearsalAdvancePlan(wind, 8, 8, 0).totalHorn, 0);
});

test("attributeDeltas：过滤没有实际变化的属性", () => {
  const result = T.calculatePlan(forest, extremeAt5, extremeAt5);
  assert.deepStrictEqual(result.attributeDeltas, []);
});

test("阴雷：无演练计划且真言0–15阶与兵法一一对应", () => {
  [yin, thunder].forEach(tactic => {
    const mantra = tactic.mantras[0];
    assert.deepStrictEqual(mantra.stages.map(stage => [stage.rank, stage.tacticRank]),
      Array.from({ length: 16 }, (_, rank) => [rank, rank]));
    for (let rank = 0; rank <= 15; rank++) {
      assert.strictEqual(T.allowedMantraRank(tactic, mantra.id, rank), rank);
    }
    const initial = { rank: 0, rehearsalSpent: 0, mantras: { [mantra.id]: -1 } };
    assert.deepStrictEqual(T.calculatePlan(tactic, initial, initial).rehearsal, { steps: [], totalHorn: 0 });
  });
});

test("materialKeyForMantra：统和极共享，其余真言按兵法独立", () => {
  assert.strictEqual(T.materialKeyForMantra(wind, wind.mantras[2]), T.materialKeyForMantra(forest, forest.mantras[2]));
  assert.strictEqual(T.materialKeyForMantra(wind, extreme), T.materialKeyForMantra(forest, extreme));
  assert.notStrictEqual(T.materialKeyForMantra(wind, wind.mantras[0]), T.materialKeyForMantra(forest, forest.mantras[0]));
});

test("estimatePurchases：按整包向上取整并计算余量", () => {
  assert.deepStrictEqual(T.estimatePurchases(21, 0, { packSize: 10, packPrice: 80 }), {
    demand: 21, stock: 0, shortage: 21, packs: 3, yuan: 240, leftover: 9, priced: true
  });
  assert.strictEqual(T.estimatePurchases(21, 0, { packSize: 10, packPrice: "" }).priced, false);
});

test("aggregateCostPlans：单项各用完整共享库存，合计只扣一次", () => {
  const progress = { wind: T.defaultProgress(wind), forest: T.defaultProgress(forest) };
  const raw = T.normalizeCostState([wind, forest], {}, progress);
  raw.configs.wind.target.rank = 5;
  raw.configs.forest.target.rank = 5;
  raw.materials["shared:merit"] = { stock: 2000, packSize: 500, packPrice: 100 };
  raw.materials["shared:horn"] = { stock: 999999, packSize: 1, packPrice: 0 };
  raw.materials[T.materialKeyForMark(wind)] = { stock: 999999, packSize: 1, packPrice: 0 };
  raw.materials[T.materialKeyForMark(forest)] = { stock: 999999, packSize: 1, packPrice: 0 };
  const result = T.aggregateCostPlans([wind, forest], raw, progress);
  assert.strictEqual(result.individual.length, 2);
  assert.strictEqual(result.individual.every(item => item.purchase.rows.find(row => row.key === "shared:merit").shortage === 0), true);
  assert.strictEqual(result.combined.purchase.rows.find(row => row.key === "shared:merit").shortage, 1400);
});

test("阴雷：5→8阶累计进阶号角与各阶真言碎片", () => {
  [yin, thunder].forEach(tactic => {
    const mantraId = tactic.mantras[0].id;
    const result = T.calculatePlan(
      tactic,
      { rank: 5, rehearsalSpent: 0, mantras: { [mantraId]: 5 } },
      { rank: 8, rehearsalSpent: 0, mantras: { [mantraId]: 8 } }
    );
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.advance.steps.map(step => step.rank), [6, 7, 8]);
    assert.strictEqual(result.advance.horn, 15000);
    assert.deepStrictEqual(result.mantras[mantraId].steps.map(step => step.tacticRank), [6, 7, 8]);
    assert.strictEqual(result.mantras[mantraId].fragments, 360);
  });
});
