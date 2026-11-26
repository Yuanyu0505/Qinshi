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
  const result = F.recommendFormation(formation, progressFor(formation), { mode: "legacy" });
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

test("recommendFormation：严格按照攻血追加护盾内力防的顺序取舍", () => {
  const priorities = ["全体攻", "全体血", "追加伤害", "全体护盾", "全体内力", "全体防"];

  for (let index = 0; index < priorities.length - 1; index += 1) {
    const formation = {
      id: `priority-${index}`,
      name: "优先级测试",
      officialMain: "主将",
      slots: [
        { position: 1, sourceAttribute: "攻", ratePercent: 100, targetAttribute: priorities[index], officialDisciple: "高优先弟子" },
        { position: 2, sourceAttribute: "防", ratePercent: 100, targetAttribute: priorities[index + 1], officialDisciple: "低优先弟子" },
      ],
      candidates: [
        { id: "main", name: "主将", level1: { attack: 1, health: 1, defense: 1 }, officialPosition: null },
        { id: "high", name: "高优先弟子", level1: { attack: 100, health: 1, defense: 100 }, officialPosition: 1 },
        { id: "low", name: "低优先弟子", level1: { attack: 99, health: 1, defense: 1 }, officialPosition: 2 },
      ],
    };

    const result = F.recommendFormation(formation, progressFor(formation, { mainId: "main" }), { mode: "legacy" });
    const highPriorityAssignment = result.assignments.find(item => item.position === 1);
    assert.strictEqual(
      highPriorityAssignment.candidateId,
      "high",
      `${priorities[index]}应优先于${priorities[index + 1]}`,
    );
  }
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

test("weighted：综合权重不再用攻击字典序掩盖更高综合收益", () => {
  const formation = fixture();
  formation.candidates[0].level1.defense = 1000;
  formation.candidates[1].level1.attack = 99;
  formation.candidates[1].level1.defense = 1;
  const result = F.recommendFormation(formation, progressFor(formation, { mainId: "d" }));
  assert.deepStrictEqual(result.assignments.map(item => item.candidateId), ["b", "a"]);
  assert.strictEqual(result.exactScore, "26256");
  assert.strictEqual(result.scoreDenominator, "12");
  assert.strictEqual(result.mode, "weighted");
  assert.strictEqual(result.totals["全体护盾"], 0);
});

test("main：属性不完整的已拥有弟子可以自动担任主将，但不可助阵", () => {
  const formation = fixture();
  formation.candidates = formation.candidates.filter(item => item.id !== "b");
  const progress = progressFor(formation);
  progress.members.d.attack = null;
  const result = F.recommendFormation(formation, progress);
  assert.strictEqual(result.mainId, "d");
  assert.strictEqual(result.filled, 2);
  assert.ok(result.assignments.every(item => item.candidateId !== "d"));
  assert.deepStrictEqual(result.mainOptions.map(item => item.candidateId), ["d"]);
});

test("target：指定属性优先，阵内不存在的目标不能悄悄回退", () => {
  const formation = fixture();
  const result = F.recommendFormation(formation, progressFor(formation, { mainId: "d" }), { mode: "target", target: "全体防" });
  assert.strictEqual(result.totals["全体防"], 100);
  assert.throws(() => F.recommendFormation(formation, progressFor(formation), { mode: "target", target: "全体护盾" }), /本阵无/);
});

test("custom：有限小数精确计分；同分不同向量不能被代表方案规则删除", () => {
  const formation = fixture();
  formation.candidates = formation.candidates.filter(item => ["a", "b", "d"].includes(item.id));
  formation.candidates[0].level1 = { attack: 100, health: 1000, defense: 101 };
  formation.candidates[1].level1 = { attack: 99, health: 1000, defense: 100 };
  const options = { mode: "custom", weights: ["1.25", "0", "0", "0", "0", "1.25"], scales: ["1.5", "1", "1", "1", "1", "1.5"] };
  const result = F.recommendFormation(formation, progressFor(formation, { mainId: "d" }), options);
  assert.strictEqual(result.exactScore, "1000");
  assert.strictEqual(result.scoreDenominator, "6");
  assert.strictEqual(result.tieCount, "2");
  assert.strictEqual(result.combinationCount, "2");
  assert.deepStrictEqual(result.assignments.map(item => item.candidateId), ["a", "b"]);
  assert.deepStrictEqual(new Set(result.ties.map(item => item.totals["全体攻"])), new Set([99, 100]));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("custom：空值、负数、无限值、零比例及本阵有效权重全零均拒绝", () => {
  const formation = fixture();
  const defaults = { mode: "custom", weights: [12, 10, 5, 4, 3, 1], scales: [1, 8, 6, 1.5, 2, 1] };
  for (const bad of ["", null, -1, Infinity, "NaN", "0.001", "101"]) {
    assert.throws(() => F.recommendFormation(formation, progressFor(formation), { ...defaults, weights: [bad, 10, 5, 4, 3, 1] }));
  }
  assert.throws(() => F.recommendFormation(formation, progressFor(formation), { ...defaults, scales: [0, 8, 6, 1.5, 2, 1] }));
  assert.throws(() => F.recommendFormation(formation, progressFor(formation), { ...defaults, weights: [0, 10, 5, 4, 3, 0] }));
});

test("ties：零收益空位计数准确，分页不截断真实总数或重复主将", () => {
  const formation = fixture();
  formation.candidates = formation.candidates.slice(0, 3);
  formation.candidates.forEach(candidate => { candidate.level1 = { attack: 0, health: 0, defense: 0 }; });
  const progress = progressFor(formation);
  const result = F.recommendFormation(formation, progress, { limit: 2 });
  // empty + 2*3 one-support + 3*2 two-support arrangements; combinations 3 + 6*2 + 6.
  assert.strictEqual(result.tieCount, "13");
  assert.strictEqual(result.combinationCount, "21");
  assert.strictEqual(result.filled, 2);
  assert.strictEqual(result.ties.length, 2);
  const all = [];
  for (let offset = 0; offset < 13; offset += 2) {
    all.push(...F.recommendFormation(formation, progress, { offset: String(offset), limit: 2 }).ties);
  }
  assert.strictEqual(new Set(all.map(tie => JSON.stringify(tie.assignments.map(item => [item.position, item.candidateId])))).size, 13);
  assert.strictEqual(all.reduce((sum, tie) => sum + tie.mainOptions.length, 0), 21);
  assert.strictEqual(F.recommendFormation(formation, progress, { offset: "999999999999999999", limit: 2 }).ties.length, 0);
});

test("precision：收益以BigInt取整，溢出累计必须显式拒绝", () => {
  assert.strictEqual(F.calculateCell({ attack: Number.MAX_SAFE_INTEGER }, { sourceAttribute: "攻", ratePercent: 99 }), 8917127262193581);
  assert.throws(() => F.calculateCell({ attack: Number.MAX_SAFE_INTEGER }, { sourceAttribute: "攻", ratePercent: 200 }), /安全整数/);
  assert.throws(() => F.summarizeTargets([{ targetAttribute: "全体攻", value: Number.MAX_SAFE_INTEGER }, { targetAttribute: "全体攻", value: 1 }]), /安全整数/);
});

test("main：只有缺属性的主将时返回空助阵；无人拥有不伪造方案", () => {
  const formation = fixture();
  const progress = { members: { a: { owned: true } } };
  const result = F.recommendFormation(formation, progress);
  assert.strictEqual(result.mainId, "a");
  assert.strictEqual(result.filled, 0);
  assert.strictEqual(result.tieCount, "1");
  assert.strictEqual(F.recommendFormation(formation, {}).tieCount, "0");
});

test("scoreTotals：原资料对照使用同一精确口径，不执行阵容搜索", () => {
  const formation = fixture();
  assert.deepStrictEqual(F.scoreTotals(formation, { "全体攻": 100, "全体防": 100 }), { exactScore: "15600", scoreDenominator: "12" });
  assert.throws(() => F.scoreTotals(formation, { "全体攻": Number.MAX_SAFE_INTEGER + 1 }), /安全整数/);
  assert.strictEqual(F.validateOptions(formation, { mode: "custom", weights: [12, 10, 5, 4, 3, 1], scales: [1, 8, 6, 1.5, 2, 1] }).scoreDenominator, "12");
});

test("legality：重复ID与超出位宽的候选输入必须拒绝", () => {
  const formation = fixture();
  assert.throws(() => F.recommendFormation({ ...formation, candidates: formation.candidates.concat(formation.candidates[0]) }, progressFor(formation)), /重复/);
  const many = Array.from({ length: 31 }, (_, index) => ({ ...formation.candidates[0], id: `candidate-${index}` }));
  assert.throws(() => F.recommendFormation({ ...formation, candidates: many }, {}), /上限30/);
});

// Independent exhaustive oracle: enumerate mains first, then legal supports and
// empty positions. Deliberately do not use production parsing/scoring/comparators.
function exhaustiveOracle(formation, progress, options = {}) {
  const attributes = ["全体攻", "全体血", "全体护盾", "追加伤害", "全体内力", "全体防"];
  const legacy = [0, 1, 3, 2, 4, 5];
  const coefficients = options.mode === "custom" ? [5, 5, 5, 5, 5, 5] : [144, 15, 10, 32, 18, 12];
  const owned = formation.candidates.filter(candidate => progress.members[candidate.id]?.owned === true);
  const supports = owned.filter(candidate => ["level", "attack", "health", "defense"].every(key => {
    const value = progress.members[candidate.id][key];
    return Number.isSafeInteger(value) && value >= (key === "level" ? 1 : 0);
  }));
  const all = [];
  for (const main of owned.filter(candidate => !progress.mainId || progress.mainId === candidate.id)) {
    function visit(index, used, assignments, vector) {
      if (index === formation.slots.length) {
        const score = vector.reduce((sum, value, k) => sum + BigInt(value) * BigInt(coefficients[k]), 0n);
        all.push({ mainId: main.id, assignments: assignments.slice(), vector: vector.slice(), score });
        return;
      }
      visit(index + 1, used, assignments, vector);
      const slot = formation.slots[index];
      for (const support of supports) {
        if (used.has(support.id) || support.id === main.id) continue;
        const source = progress.members[support.id][{ "攻": "attack", "血": "health", "防": "defense" }[slot.sourceAttribute]];
        const value = Number(BigInt(source) * BigInt(slot.ratePercent) / 100n);
        const next = vector.slice();
        next[attributes.indexOf(slot.targetAttribute)] += value;
        used.add(support.id);
        assignments.push([slot.position, support.id]);
        visit(index + 1, used, assignments, next);
        assignments.pop();
        used.delete(support.id);
      }
    }
    visit(0, new Set(), [], [0, 0, 0, 0, 0, 0]);
  }
  function compare(a, b) {
    if (options.mode === "legacy") {
      for (const k of legacy) if (a.vector[k] !== b.vector[k]) return Math.sign(a.vector[k] - b.vector[k]);
      return Math.sign(a.assignments.length - b.assignments.length);
    }
    if (options.mode === "target") {
      const k = attributes.indexOf(options.target);
      if (a.vector[k] !== b.vector[k]) return Math.sign(a.vector[k] - b.vector[k]);
    }
    return a.score === b.score ? 0 : a.score > b.score ? 1 : -1;
  }
  let best = null;
  let optimal = [];
  for (const item of all) {
    const comparison = best ? compare(item, best) : 1;
    if (comparison > 0) { best = item; optimal = [item]; }
    else if (comparison === 0) optimal.push(item);
  }
  const arrangements = new Map();
  for (const item of optimal) {
    const key = JSON.stringify(item.assignments);
    if (!arrangements.has(key)) arrangements.set(key, []);
    arrangements.get(key).push(item.mainId);
  }
  return { best, optimal, arrangements, all };
}

test("oracle：固定seed随机小库存，四模式完整并列集合及主将均与独立穷举相同", () => {
  let seed = 20261125;
  function random(maximum) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % maximum; }
  for (let sample = 0; sample < 40; sample += 1) {
    const formation = fixture();
    formation.slots.push({ position: 3, sourceAttribute: "血", ratePercent: [33, 50, 100][random(3)], targetAttribute: "全体血" });
    const progress = progressFor(formation);
    formation.candidates.forEach(candidate => {
      progress.members[candidate.id] = { owned: random(5) !== 0, level: 1, attack: random(31), health: random(31), defense: random(31) };
      if (random(5) === 0) progress.members[candidate.id].attack = null;
    });
    if (sample % 3 === 0) progress.mainId = formation.candidates.find(candidate => progress.members[candidate.id].owned)?.id || null;
    for (const options of [
      { mode: "weighted" },
      { mode: "target", target: "全体防" },
      { mode: "legacy" },
      { mode: "custom", weights: [1.25, 1.25, 1.25, 1.25, 1.25, 1.25], scales: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5] },
    ]) {
      const expected = exhaustiveOracle(formation, progress, options);
      const actual = F.recommendFormation(formation, progress, { ...options, limit: 200 });
      assert.strictEqual(actual.tieCount, String(expected.arrangements.size), `sample ${sample} ${options.mode}`);
      assert.strictEqual(actual.combinationCount, String(expected.optimal.length));
      if (expected.best) assert.strictEqual(actual.exactScore, String(expected.best.score));
      assert.strictEqual(actual.ties.length, expected.arrangements.size);
      for (const tie of actual.ties) {
        const key = JSON.stringify(tie.assignments.map(item => [item.position, item.candidateId]));
        assert.deepStrictEqual(tie.mainOptions.map(main => main.candidateId).sort(), expected.arrangements.get(key).sort());
      }
      if (expected.best && options.mode !== "legacy" && options.mode !== "target") {
        for (const optimal of expected.optimal) {
          assert.ok(!expected.all.some(other => other.vector.every((value, index) => value >= optimal.vector[index]) && other.vector.some((value, index) => value > optimal.vector[index])));
        }
      }
    }
  }
});

test("properties：候选增加不降分、固定主将不超自动、统一缩放及输入顺序不改并列集合", () => {
  const formation = fixture();
  const progress = progressFor(formation);
  const auto = F.recommendFormation(formation, progress, { limit: 200 });
  const fixed = F.recommendFormation(formation, { ...progress, mainId: "a" });
  assert.ok(BigInt(fixed.exactScore) <= BigInt(auto.exactScore));
  const fewer = JSON.parse(JSON.stringify(progress));
  fewer.members.c.owned = false;
  assert.ok(BigInt(F.recommendFormation(formation, fewer).exactScore) <= BigInt(auto.exactScore));
  const reversed = F.recommendFormation({ ...formation, candidates: formation.candidates.slice().reverse(), slots: formation.slots.slice().reverse() }, progress, { limit: 200 });
  assert.deepStrictEqual(reversed, auto);
  const scaled = F.recommendFormation(formation, progress, { mode: "custom", weights: [24, 20, 10, 8, 6, 2], scales: [1, 8, 6, 1.5, 2, 1], limit: 200 });
  const signature = result => result.ties.map(tie => JSON.stringify([tie.assignments.map(item => [item.position, item.candidateId]), tie.mainOptions.map(main => main.candidateId)])).sort();
  assert.deepStrictEqual(signature(scaled), signature(auto));
});
