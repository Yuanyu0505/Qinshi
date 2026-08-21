const { test } = require("node:test");
const assert = require("node:assert");
const F = require("./formations.js");


function fixture() {
  return {
    id: "formation-test",
    name: "测试合阵",
    officialMain: "甲",
    slots: [
      { position: 1, sourceAttribute: "攻", ratePercent: 100, targetAttribute: "全体攻", officialDisciple: "甲" },
      { position: 2, sourceAttribute: "防", ratePercent: 100, targetAttribute: "全体防", officialDisciple: "丙" },
    ],
    candidates: [
      { id: "a", name: "甲", level1: { attack: 100, health: 1000, defense: 1 }, officialPosition: 1 },
      { id: "b", name: "乙", level1: { attack: 90, health: 900, defense: 90 }, officialPosition: null },
      { id: "c", name: "丙", level1: { attack: 1, health: 800, defense: 100 }, officialPosition: 2 },
      { id: "d", name: "丁", level1: { attack: 1, health: 700, defense: 1 }, officialPosition: null },
    ],
  };
}


function member(candidate, overrides) {
  return Object.assign({
    owned: true,
    level: 1,
    attack: candidate.level1.attack,
    health: candidate.level1.health,
    defense: candidate.level1.defense,
    usesReference: true,
  }, overrides || {});
}


function progressFor(formation, options) {
  const members = {};
  formation.candidates.forEach(candidate => { members[candidate.id] = member(candidate); });
  return Object.assign({ mainId: null, members }, options || {});
}


test("normalizeName：神弟子名称忽略中点和空格", () => {
  assert.strictEqual(F.normalizeName(" 神·扶苏 "), "神扶苏");
});

test("parseIntegerInput：接受逗号空格并区分缺失和无效", () => {
  assert.deepStrictEqual(F.parseIntegerInput(" 24, 967 ", 0), { valid: true, missing: false, value: 24967 });
  assert.deepStrictEqual(F.parseIntegerInput("", 0), { valid: false, missing: true, value: null });
  assert.deepStrictEqual(F.parseIntegerInput("1.5", 0), { valid: false, missing: false, value: null });
  assert.deepStrictEqual(F.parseIntegerInput("0", 1), { valid: false, missing: false, value: null });
});

test("normalizeProgress：只保留候选弟子字段并在主将未拥有时清空", () => {
  const formation = fixture();
  const normalized = F.normalizeProgress(formation, {
    mainId: "a",
    members: {
      a: { owned: false, level: 99, attack: 999, unknown: true },
      b: { owned: true, level: 2, attack: 123, health: null, defense: 45, usesReference: false },
      unknown: { owned: true, level: 1, attack: 1, health: 1, defense: 1 },
    },
    unknown: true,
  });
  assert.strictEqual(normalized.mainId, null);
  assert.deepStrictEqual(normalized.members, {
    b: { owned: true, level: 2, attack: 123, health: null, defense: 45, usesReference: false },
  });
});

test("calculateCell：向下取整且等级不参与", () => {
  assert.strictEqual(
    F.calculateCell({ attack: 24967, health: 0, defense: 0 }, { sourceAttribute: "攻", ratePercent: 6 }),
    1498,
  );
});

test("buildMatrix：排除主将并列出数据不完整的弟子", () => {
  const formation = fixture();
  const progress = progressFor(formation, { mainId: "a" });
  progress.members.b.health = null;
  const matrix = F.buildMatrix(formation, progress);
  assert.deepStrictEqual(matrix.rows.map(row => row.candidateId), ["c", "d"]);
  assert.deepStrictEqual(matrix.excluded, [{ candidateId: "b", name: "乙", missing: ["血"], errors: [] }]);
});

test("rankColumn：最高不同数值档标红、第二档标黄且并列保留", () => {
  const rows = [
    { candidateId: "a", name: "甲", values: { 1: 100 } },
    { candidateId: "b", name: "乙", values: { 1: 100 } },
    { candidateId: "c", name: "丙", values: { 1: 80 } },
    { candidateId: "d", name: "丁", values: { 1: 70 } },
  ];
  assert.deepStrictEqual(
    F.rankColumn(rows, 1).map(item => [item.candidateId, item.rankClass]),
    [["a", "highest"], ["b", "highest"], ["c", "second"], ["d", null]],
  );
  assert.deepStrictEqual(
    F.rankColumn(rows.slice(0, 2).map(row => Object.assign({}, row, { values: { 1: 0 } })), 1)
      .map(item => item.rankClass),
    ["highest", "highest"],
  );
});

test("recommendFormation：未指定主将时选择机会成本最低者并且弟子不重复", () => {
  const formation = fixture();
  const result = F.recommendFormation(formation, progressFor(formation));
  assert.strictEqual(result.mainId, "d");
  assert.strictEqual(result.filled, 2);
  assert.strictEqual(new Set(result.assignments.map(item => item.candidateId)).size, 2);
  assert.deepStrictEqual(result.assignments.map(item => [item.position, item.candidateId]), [[1, "a"], [2, "c"]]);
});

test("recommendFormation：指定主将固定排除且优先填满位置", () => {
  const formation = fixture();
  const result = F.recommendFormation(formation, progressFor(formation, { mainId: "a" }));
  assert.strictEqual(result.mainId, "a");
  assert.strictEqual(result.filled, 2);
  assert.ok(result.assignments.every(item => item.candidateId !== "a"));
});

test("recommendFormation：弟子不足时返回部分方案和缺少位置数", () => {
  const formation = fixture();
  const progress = progressFor(formation);
  progress.members.b.owned = false;
  progress.members.c.owned = false;
  progress.members.d.owned = false;
  const result = F.recommendFormation(formation, progress);
  assert.strictEqual(result.mainId, "a");
  assert.strictEqual(result.filled, 0);
  assert.strictEqual(result.missingPositions, 2);
});

test("summarizeTargets：相同目标属性相加", () => {
  assert.deepStrictEqual(F.summarizeTargets([
    { targetAttribute: "全体攻", value: 10 },
    { targetAttribute: "全体攻", value: 20 },
    { targetAttribute: "追加伤害", value: 5 },
  ]), { "全体攻": 30, "追加伤害": 5 });
});
