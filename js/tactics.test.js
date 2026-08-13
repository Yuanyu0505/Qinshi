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
    standardMantra("command", "统", "PVP速"),
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

const startAt5 = { rank: 5, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const targetAt8 = { rank: 8, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const startInactive = { rank: 3, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const targetMantra3 = { rank: 3, rehearsalSpent: 0, mantras: { ling: 3, chan: -1, command: -1, extreme: -1 } };
const extremeAt0 = { rank: 15, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: 0 } };
const extremeAt5 = { rank: 15, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: 5 } };
const startAt4 = { rank: 4, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const startAt4ZeroSpent = { rank: 4, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const targetAt4 = { rank: 4, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };
const targetAt5 = { rank: 5, rehearsalSpent: 0, mantras: { ling: -1, chan: -1, command: -1, extreme: -1 } };

test("defaultProgress：六种真言均从未激活开始", () => {
  assert.deepStrictEqual(T.defaultProgress(forest), {
    rank: 0,
    rehearsalSpent: 0,
    mantras: { ling: -1, chan: -1, command: -1, extreme: -1 }
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
    mantras: { ling: 9, chan: -1, command: -1, extreme: -1 }
  });
});

test("changeRank：兵法阶数变化重置本阶号角并收缩真言", () => {
  const changed = T.changeRank(forest, {
    rank: 15, rehearsalSpent: 250,
    mantras: { ling: 9, chan: 9, command: 9, extreme: 5 }
  }, 8);
  assert.strictEqual(changed.rehearsalSpent, 0);
  assert.deepStrictEqual(changed.mantras, { ling: 8, chan: 8, command: 8, extreme: -1 });
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

test("rehearsal：950阈值、单次7按952实际消耗", () => {
  const result = T.calculatePlan(windRank4Fixture, startAt4ZeroSpent, targetAt4);
  assert.deepStrictEqual(result.rehearsal, {
    rank: 4, proficiency: { min: 5.6, max: 7.5 }, singleHorn: 7,
    guaranteeHorn: 950, carriedSpent: 0, remainingRuns: 136, actualAdditionalHorn: 952
  });
});

test("rehearsal：升至新阶时不继承旧阶号角", () => {
  const result = T.calculatePlan(wind, { ...startAt4, rehearsalSpent: 945 }, targetAt5);
  assert.strictEqual(result.rehearsal.carriedSpent, 0);
  assert.strictEqual(result.rehearsal.actualAdditionalHorn, 1800);
});
