/* Fixed independent enumeration supplied on 2026-11-25; never regenerate from CORE. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CORE = require('../js/formations.js');
const ADAPTER = require('../js/formation-limit-adapter.js');
const reference = require('../data/formation-max-reference.js');
const golden = require('./fixtures/formation-weighted-golden-20261125.json');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/formations.js'), 'utf8'), context);
// JSON transport intentionally gives the browser data ordinary Node prototypes.
const formations = JSON.parse(JSON.stringify(context.window.FORMATIONS_DATA.items));
const sourceKeys = { '攻': 'attack', '血': 'health', '防': 'defense' };
const clone = value => JSON.parse(JSON.stringify(value));
const normalize = value => String(value).replace(/[·•・\s]+/g, '');
const order = assignments => assignments.slice().sort((a, b) => a.position - b.position);
const signature = names => names.map(normalize).join('|');

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function fixture() {
  return {
    formation: { id: 'fixture', name: '测试阵', candidates: [
      { id: 'first', name: '神·甲' }, { id: 'second', name: '乙' }
    ], slots: [{ position: 1, sourceAttribute: '血', ratePercent: 6, targetAttribute: '全体血' }] },
    reference: { name: '测试阵', source: 'fixture', members: [
      { name: '神 甲', attack: 12, defense: 10, hp: 101, position: 1, trainAttribute: '血', gainAttribute: '血' },
      { name: '乙', attack: 8, defense: 0, hp: 5, position: null, trainAttribute: null, gainAttribute: null }
    ] }
  };
}

// A positional-order assumption, hp/health mix-up, or floor-after-summing bug breaks this.
test('limit adapter maps exact normalized names and source positions without modifying either input', () => {
  const input = fixture();
  input.formation.candidates.reverse();
  deepFreeze(input);
  const result = ADAPTER.buildLimitProgress(input.formation, input.reference);
  assert.equal(result.progress.mainId, null);
  assert.equal(result.progress.source, 'limit');
  assert.equal(result.progress.virtual, true);
  assert.deepEqual(Object.keys(result.progress.members).sort(), ['first', 'second']);
  assert.deepEqual(result.progress.members.first, {
    owned: true, level: 300, attack: 12, defense: 10, health: 101,
    usesReference: false, source: 'limit', virtual: true
  });
  assert.equal(result.progress.members.second.defense, 0);
  assert.deepEqual(result.originalAssignments.map(item => [item.position, item.candidateId, item.sourceValue, item.value]), [[1, 'first', 101, 6]]);
  assert.equal(result.originalAssignments[0].rawGainAttribute, '血');
  assert.equal(result.originalAssignments[0].targetAttribute, '全体血');
  assert.deepEqual(result.conflicts, []);
});

// An unsafe fallback to partial/ambiguous source data must never produce a recommendation.
test('limit adapter rejects missing, duplicated or mismatched names and candidate IDs', () => {
  const mutations = [
    input => input.reference.members.pop(),
    input => { input.reference.members[1].name = '不存在'; },
    input => { input.reference.members[1].name = '神•甲'; },
    input => { input.formation.candidates[1].name = '神甲'; },
    input => { input.formation.candidates[1].id = 'first'; },
    input => { input.formation.candidates[1].id = ''; },
    input => { input.reference.name = '其他阵'; },
    input => { input.reference.members.push(clone(input.reference.members[0])); }
  ];
  mutations.forEach(mutate => {
    const input = fixture();
    mutate(input);
    assert.throws(() => ADAPTER.buildLimitProgress(input.formation, input.reference), /极限资料/);
  });
});

test('limit adapter rejects unsafe or missing stats including members not used by the source arrangement', () => {
  [null, undefined, '', '8', -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].forEach(bad => {
    ['attack', 'defense', 'hp'].forEach(key => {
      const input = fixture();
      input.reference.members[1][key] = bad;
      assert.throws(() => ADAPTER.buildLimitProgress(input.formation, input.reference), /极限资料/);
    });
  });
});

test('limit adapter fails closed for incomplete, duplicate or unknown original positions', () => {
  const mutations = [
    input => { input.reference.members[0].position = null; },
    input => { input.reference.members[1].position = 1; },
    input => { input.reference.members[1].position = 2; },
    input => { input.reference.members[0].position = '1'; },
    input => { input.formation.slots.push(clone(input.formation.slots[0])); },
    input => { input.formation.slots[0].sourceAttribute = '未知'; },
    input => { input.formation.slots[0].ratePercent = Infinity; }
  ];
  mutations.forEach(mutate => {
    const input = fixture();
    mutate(input);
    assert.throws(() => ADAPTER.buildLimitProgress(input.formation, input.reference), /极限资料/);
  });
});

test('limit source retains both disputed labels while calculating from actual base-slot rules', () => {
  [['胜友如云', '全体内力', 14422], ['云布雨施', '全体护盾', 175549]].forEach(([name, target, value]) => {
    const formation = formations.find(item => item.name === name);
    const source = reference.formations.find(item => item.name === name);
    const before = JSON.stringify(source);
    const result = ADAPTER.buildLimitProgress(formation, source);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].position, 4);
    assert.equal(result.conflicts[0].rawGainAttribute, '追加伤害');
    assert.equal(result.conflicts[0].targetAttribute, target);
    assert.equal(result.conflicts[0].status, '待核实');
    const assignment = result.originalAssignments.find(item => item.position === 4);
    assert.equal(assignment.rawGainAttribute, '追加伤害');
    assert.equal(assignment.targetAttribute, target);
    assert.equal(assignment.value, value);
    assert.equal(JSON.stringify(source), before);
  });
});

test('browser UMD adapter uses the same pure CORE without storage access', () => {
  const sandbox = { FORMATIONS: CORE };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/formation-limit-adapter.js'), 'utf8'), sandbox);
  const input = fixture();
  const result = sandbox.FORMATION_LIMIT_ADAPTER.buildLimitProgress(input.formation, input.reference);
  assert.equal(result.originalAssignments[0].value, 6);
  assert.equal(result.progress.source, 'limit');
});

test('supplied golden fixture remains the independent 19-formation / 871440 complete-assignment baseline', () => {
  assert.deepEqual(golden.attributes, ['全体攻', '全体血', '全体护盾', '追加伤害', '全体内力', '全体防']);
  assert.deepEqual(golden.integerCoefficients, [144, 15, 10, 32, 18, 12]);
  assert.equal(golden.scoreMultiplier, 12);
  assert.equal(golden.results.length, 19);
  assert.equal(golden.results.reduce((sum, item) => sum + item.count, 0), 871440);
  assert.equal(golden.results.reduce((sum, item) => sum + item.ties.length, 0), 20);
  assert.equal(formations.length, 19);
  assert.equal(reference.formations.reduce((sum, item) => sum + item.members.length, 0), 144);
});

function assertPositions(actual, expected, formation, progress) {
  const sorted = order(actual);
  assert.equal(sorted.length, expected.positions.length);
  assert.deepEqual(sorted.map(item => normalize(item.name)), expected.names.map(normalize));
  sorted.forEach((assignment, index) => {
    const fixed = expected.positions[index];
    const slot = formation.slots.find(item => item.position === fixed.position);
    const candidate = formation.candidates.find(item => item.id === assignment.candidateId);
    assert.ok(candidate, 'snapshot mismatch: unknown candidate ID');
    assert.equal(assignment.position, fixed.position);
    assert.equal(normalize(candidate.name), normalize(fixed.name));
    assert.equal(assignment.name, candidate.name);
    assert.equal(`${slot.ratePercent}%${slot.sourceAttribute}→${slot.targetAttribute}`, fixed.rule);
    assert.equal(assignment.sourceAttribute, slot.sourceAttribute);
    assert.equal(assignment.ratePercent, slot.ratePercent);
    assert.equal(assignment.targetAttribute, slot.targetAttribute);
    assert.equal(progress.members[candidate.id][sourceKeys[slot.sourceAttribute]], fixed.sourceValue,
      'source snapshot differs from independently supplied golden values');
    assert.equal(assignment.sourceValue, fixed.sourceValue);
    assert.equal(assignment.value, fixed.gain);
    // Independent formula, not CORE.calculateCell / scorer.
    assert.equal(assignment.value, Number(BigInt(fixed.sourceValue) * BigInt(slot.ratePercent) / 100n));
  });
  assert.equal(new Set(sorted.map(item => item.candidateId)).size, sorted.length);
}

golden.results.forEach(expected => {
  test(`weighted golden: ${expected.name} scores, every optimal support arrangement, mains and raw source comparison`, () => {
    const formation = formations.find(item => item.name === expected.name);
    const source = reference.formations.find(item => item.name === expected.name);
    assert.ok(formation && source, 'formation snapshot mismatch');
    const sourceBefore = JSON.stringify(source);
    const formationBefore = JSON.stringify(formation);
    const { progress, originalAssignments } = ADAPTER.buildLimitProgress(formation, source);
    const result = CORE.recommendFormation(formation, progress);
    assert.equal(result.exactScore, String(expected.score));
    assert.equal(result.scoreDenominator, '12');
    assert.equal(result.tieCount, String(expected.ties.length));
    assert.equal(result.combinationCount, String(expected.ties.reduce((sum, tie) => sum + tie.main.length, 0)));
    assert.equal(result.ties.length, expected.ties.length, 'golden ties must not be silently truncated');
    const expectedByNames = new Map(expected.ties.map(tie => [signature(tie.names), tie]));
    const observed = new Set();
    result.ties.forEach(tie => {
      const key = signature(order(tie.assignments).map(item => item.name));
      const fixed = expectedByNames.get(key);
      assert.ok(fixed, 'unexpected optimal support arrangement');
      assert.ok(!observed.has(key), 'same support arrangement counted once per main');
      observed.add(key);
      assertPositions(tie.assignments, fixed, formation, progress);
      assert.deepEqual(golden.attributes.map(attribute => tie.totals[attribute] || 0), fixed.vector);
      assert.deepEqual(tie.mainOptions.map(item => normalize(item.name)).sort(), fixed.main.map(normalize).sort());
      tie.mainOptions.forEach(main => {
        assert.equal(formation.candidates.find(item => item.id === main.candidateId).name, main.name);
        assert.ok(!tie.assignments.some(item => item.candidateId === main.candidateId));
      });
    });
    assert.equal(observed.size, expectedByNames.size);
    assertPositions(originalAssignments, expected.original, formation, progress);
    const originalVector = golden.attributes.map(attribute => originalAssignments.reduce((sum, item) =>
      sum + (item.targetAttribute === attribute ? item.value : 0), 0));
    assert.deepEqual(originalVector, expected.original.vector);
    const originalScore = originalVector.reduce((sum, value, index) =>
      sum + BigInt(value) * BigInt(golden.integerCoefficients[index]), 0n);
    assert.equal(originalScore.toString(), String(expected.original_score));
    assert.equal((BigInt(result.exactScore) - originalScore).toString(), String(expected.delta));
    assert.equal(JSON.stringify(source), sourceBefore);
    assert.equal(JSON.stringify(formation), formationBefore);
  });
});
