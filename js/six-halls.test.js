const { test } = require('node:test');
const assert = require('node:assert/strict');

const DATA = require('../data/six-halls.js');
const CORE = require('./six-halls.js');

const HALL_IDS = ['kuiwei', 'chiyou', 'lieshan', 'siyue', 'gonggong', 'shennong'];

function progress(overrides = {}) {
  return Object.assign({
    version: 1,
    playerLevel: null,
    herbs: 0,
    halls: Object.fromEntries(HALL_IDS.map(id => [id, { level: 0, tokens: 0 }]))
  }, overrides);
}

function plan(selected = ['kuiwei'], targets = {}) {
  return {
    selected,
    targets: Object.assign(Object.fromEntries(HALL_IDS.map(id => [id, 50])), targets)
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('single-step and partial-range costs exclude completed levels', () => {
  const cases = [
    [0, 1, 3, 1, 1],
    [9, 10, 10, 6, 1],
    [0, 30, 421, 155, 30],
    [30, 50, 483, 280, 20],
    [0, 50, 904, 435, 50],
    [0, 0, 0, 0, 0],
    [30, 30, 0, 0, 0],
    [50, 50, 0, 0, 0]
  ];
  for (const [from, to, herbs, tokens, count] of cases) {
    const result = CORE.calculateCost(from, to, DATA);
    assert.equal(result.herbs, herbs, from + ' -> ' + to + ' herbs');
    assert.equal(result.tokens, tokens, from + ' -> ' + to + ' tokens');
    assert.equal(result.steps.length, count, from + ' -> ' + to + ' steps');
  }
});

test('cost calculation rejects reversed, out-of-range and unsafe levels', () => {
  for (const [from, to] of [
    [11, 9], [-1, 1], [0, 51], [0, 1.5], [NaN, 10], [0, Infinity],
    [0, Number.MAX_SAFE_INTEGER + 1], ['bad', 10]
  ]) {
    assert.throws(() => CORE.calculateCost(from, to, DATA), RangeError);
  }
});

test('reference rows preserve all fifty upgrades and literal milestone totals', () => {
  const rows = CORE.referenceRows(DATA);
  assert.equal(rows.length, 50);
  assert.deepEqual(DATA.halls.map(hall => [hall.id, hall.name]), [
    ['kuiwei', '魁隗'], ['chiyou', '蚩尤'], ['lieshan', '烈山'],
    ['siyue', '四岳'], ['gonggong', '共工'], ['shennong', '神农']
  ]);
  assert.deepEqual(rows.map(row => [row.from, row.to]),
    Array.from({ length: 50 }, (_, index) => [index, index + 1]));
  assert.deepEqual([rows[0].herbs, rows[0].tokens], [3, 1]);
  assert.deepEqual([rows[9].herbs, rows[9].tokens], [10, 6]);
  assert.deepEqual([rows[29].cumulativeHerbs, rows[29].cumulativeTokens], [421, 155]);
  assert.deepEqual([rows[49].cumulativeHerbs, rows[49].cumulativeTokens], [904, 435]);
  assert.deepEqual(rows.filter(row => row.playerLevel !== null)
    .map(row => [row.to, row.playerLevel]), [[10, 50], [20, 59], [30, 69], [40, 79], [50, 89]]);
});

test('integer parsing distinguishes an unknown player level from invalid input', () => {
  for (const input of ['', '   ', null, undefined]) {
    assert.deepEqual(CORE.parseInteger(input, 0, Number.MAX_SAFE_INTEGER, true), { valid: true, value: null });
  }
  for (const [input, expected] of [[0, 0], ['0', 0], ['50', 50], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) {
    assert.deepEqual(CORE.parseInteger(input, 0, Number.MAX_SAFE_INTEGER, false), { valid: true, value: expected });
  }
  for (const input of ['', 'bad', -1, '-1', 1.5, '1.5', NaN, Infinity, 'Infinity', Number.MAX_SAFE_INTEGER + 1, '9007199254740992', {}, true]) {
    assert.equal(CORE.parseInteger(input, 0, Number.MAX_SAFE_INTEGER, false).valid, false, String(input));
  }
  assert.equal(CORE.parseInteger(51, 0, 50, false).valid, false);
});

test('progress normalization retains only real account progress and no draft fields', () => {
  const raw = {
    version: 99, playerLevel: '89', herbs: '1000',
    halls: { kuiwei: { level: '30', tokens: '155' }, chiyou: { level: 50, tokens: 435 }, unknown: { level: 50, tokens: 99 } },
    selected: ['kuiwei'], targets: { kuiwei: 50 }, plan: { selected: ['chiyou'] }
  };
  const snapshot = JSON.stringify(raw);
  const normalized = CORE.normalizeProgress(raw, DATA);
  assert.deepEqual(normalized, {
    version: 1, playerLevel: 89, herbs: 1000,
    halls: {
      kuiwei: { level: 30, tokens: 155 }, chiyou: { level: 50, tokens: 435 },
      lieshan: { level: 0, tokens: 0 }, siyue: { level: 0, tokens: 0 },
      gonggong: { level: 0, tokens: 0 }, shennong: { level: 0, tokens: 0 }
    }
  });
  assert.equal(JSON.stringify(raw), snapshot);
  assert.deepEqual(CORE.normalizeProgress(null, DATA), progress());
  assert.deepEqual(CORE.normalizeProgress({ playerLevel: -1, herbs: Infinity, halls: { kuiwei: { level: 51, tokens: 'bad' } } }, DATA), progress());
});

test('new plans start unselected with separate editable targets for all halls', () => {
  const first = CORE.defaultPlan(DATA);
  assert.deepEqual(first, plan([]));
  first.selected.push('kuiwei');
  first.targets.kuiwei = 10;
  assert.deepEqual(CORE.defaultPlan(DATA), plan([]));
});

test('player caps switch only at all five required player-level boundaries', () => {
  const cases = [[0, 9], [49, 9], [50, 19], [58, 19], [59, 29], [68, 29], [69, 39], [78, 39], [79, 49], [88, 49], [89, 50], [100, 50]];
  for (const [level, expected] of cases) assert.equal(CORE.playerCap(level, DATA), expected, 'player level ' + level);
  assert.equal(CORE.playerCap(null, DATA), null);
});

test('planning unlocks milestone targets exactly at the corresponding player-level boundary', () => {
  const cases = [
    [49, 10, true, 9], [50, 10, false, 19],
    [58, 20, true, 19], [59, 20, false, 29],
    [68, 30, true, 29], [69, 30, false, 39],
    [78, 40, true, 39], [79, 40, false, 49],
    [88, 50, true, 49], [89, 50, false, 50]
  ];
  for (const [playerLevel, target, locked, cap] of cases) {
    const result = CORE.calculatePlan(progress({ playerLevel }), plan(['kuiwei'], { kuiwei: target }), DATA);
    assert.equal(result.valid, true);
    assert.equal(result.playerCap, cap);
    assert.equal(result.rows[0].locked, locked, 'player ' + playerLevel + ' / target ' + target);
    assert.equal(result.hasLocked, locked);
  }
});

test('six halls share one herbs deduction and never exchange dedicated tokens', () => {
  const current = progress({ playerLevel: 89, herbs: 1000 });
  current.halls.kuiwei.tokens = 1000;
  const result = CORE.calculatePlan(current, plan(HALL_IDS), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.selectedCount, 6);
  assert.deepEqual(result.herbs, { need: 5424, stock: 1000, missing: 4424, remaining: 0 });
  assert.deepEqual(result.rows.map(row => row.herbs), [904, 904, 904, 904, 904, 904]);
  assert.deepEqual(result.rows.map(row => row.tokens), [435, 435, 435, 435, 435, 435]);
  assert.deepEqual(result.rows.map(row => row.tokenMissing), [0, 435, 435, 435, 435, 435]);
  assert.deepEqual(result.rows.map(row => row.tokenRemaining), [565, 0, 0, 0, 0, 0]);
});

test('herbs surplus is deducted once without reducing per-hall raw requirements', () => {
  const result = CORE.calculatePlan(progress({ herbs: 6000 }), plan(HALL_IDS), DATA);
  assert.deepEqual(result.herbs, { need: 5424, stock: 6000, missing: 0, remaining: 576 });
  assert.deepEqual(result.rows.map(row => row.herbs), [904, 904, 904, 904, 904, 904]);
});

test('finished targets cost nothing and do not consume existing inventories', () => {
  const current = progress({ playerLevel: 89, herbs: 17 });
  current.halls.kuiwei = { level: 50, tokens: 12 };
  const result = CORE.calculatePlan(current, plan(['kuiwei']), DATA);
  assert.equal(result.valid, true);
  assert.deepEqual(result.herbs, { need: 0, stock: 17, missing: 0, remaining: 17 });
  assert.deepEqual([result.rows[0].herbs, result.rows[0].tokens, result.rows[0].tokenMissing, result.rows[0].tokenRemaining], [0, 0, 0, 12]);
  assert.equal(result.rows[0].locked, false);
});

test('unknown player level still calculates materials without guessing unlocks', () => {
  const result = CORE.calculatePlan(progress(), plan(['kuiwei']), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.playerLevelKnown, false);
  assert.equal(result.playerCap, null);
  assert.equal(result.hasLocked, false);
  assert.equal(result.rows[0].locked, false);
  assert.equal(result.rows[0].requiredPlayerLevel, 89);
  assert.equal(result.herbs.need, 904);
});

test('materials and player-level locks are independent even with sufficient stock', () => {
  const current = progress({ playerLevel: 49, herbs: 1000 });
  current.halls.kuiwei.tokens = 500;
  const result = CORE.calculatePlan(current, plan(['kuiwei']), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.herbs.missing, 0);
  assert.equal(result.rows[0].tokenMissing, 0);
  assert.equal(result.rows[0].locked, true);
  assert.equal(result.rows[0].requiredPlayerLevel, 89);
  assert.equal(result.hasLocked, true);
});

test('required player-level threshold follows target rather than raw current level', () => {
  for (const [target, required, locked] of [[9, null, false], [10, 50, true], [19, 50, true], [20, 59, true], [30, 69, true], [40, 79, true], [50, 89, true]]) {
    const result = CORE.calculatePlan(progress({ playerLevel: 49 }), plan(['kuiwei'], { kuiwei: target }), DATA);
    assert.equal(result.rows[0].requiredPlayerLevel, required, 'target ' + target);
    assert.equal(result.rows[0].locked, locked, 'target ' + target);
  }
});

test('saved level above player cap warns without lowering it or counting completed steps', () => {
  const current = progress({ playerLevel: 49 });
  current.halls.kuiwei.level = 30;
  const result = CORE.calculatePlan(current, plan(['kuiwei'], { kuiwei: 30 }), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.rows[0].current, 30);
  assert.equal(result.rows[0].progressConflict, true);
  assert.equal(result.rows[0].locked, false);
  assert.equal(result.herbs.need, 0);
  assert.equal(current.halls.kuiwei.level, 30);
});

test('repeated selected IDs are charged once', () => {
  const result = CORE.calculatePlan(progress(), plan(['kuiwei', 'kuiwei']), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.selectedCount, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.herbs.need, 904);
});

test('empty selection produces no upgrade charges', () => {
  const result = CORE.calculatePlan(progress({ herbs: 10 }), plan([]), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.selectedCount, 0);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.herbs, { need: 0, stock: 10, missing: 0, remaining: 10 });
});

test('unknown selected IDs report an error rather than silently omitting requested halls', () => {
  const result = CORE.calculatePlan(progress(), plan(['kuiwei', 'unknown']), DATA);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.hallId === 'unknown' && error.message));
  assert.deepEqual(result.rows, []);
  assert.equal(result.herbs, null);
});

test('unselected invalid targets cannot invalidate selected valid work', () => {
  const result = CORE.calculatePlan(progress(), plan(['kuiwei'], { chiyou: 'bad', lieshan: -1 }), DATA);
  assert.equal(result.valid, true);
  assert.equal(result.herbs.need, 904);
  assert.equal(result.rows.length, 1);
});

test('selected invalid or lowered targets suppress the old result', () => {
  const current = progress();
  current.halls.kuiwei.level = 11;
  for (const target of [9, 'bad', -1, 50.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const result = CORE.calculatePlan(current, plan(['kuiwei'], { kuiwei: target }), DATA);
    assert.equal(result.valid, false, String(target));
    assert.ok(result.errors.some(error => error.hallId === 'kuiwei' && error.message));
    assert.deepEqual(result.rows, []);
    assert.equal(result.herbs, null);
  }
});

test('calculating or reading reference rows never mutates progress, plan or shared data', () => {
  const current = freeze(progress({ playerLevel: 89, herbs: 1000 }));
  const draft = freeze(plan(HALL_IDS));
  const data = freeze(JSON.parse(JSON.stringify(DATA)));
  const before = JSON.stringify({ current, draft, data });
  CORE.calculatePlan(current, draft, data);
  CORE.calculateCost(30, 50, data);
  CORE.referenceRows(data);
  assert.equal(JSON.stringify({ current, draft, data }), before);
});
