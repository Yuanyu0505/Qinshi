const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/six-halls.js');
const CORE = require('./six-halls.js');

// Literal oracle transcribed from the user-approved image, not derived from production data.
const APPROVED = [
  [3, 1], [6, 1], [9, 1], [12, 1], [15, 1],
  [12, 2], [15, 2], [18, 2], [21, 2], [10, 6],
  [6, 4], [10, 4], [14, 4], [18, 4], [22, 4],
  [12, 5], [16, 5], [20, 5], [16, 6], [10, 11],
  [20, 6], [12, 7], [16, 7], [20, 7], [12, 8],
  [16, 8], [20, 8], [12, 9], [16, 9], [12, 15],
  [18, 10], [22, 10], [26, 10], [18, 11], [22, 11],
  [26, 11], [18, 12], [22, 12], [26, 12], [15, 20],
  [24, 14], [28, 14], [32, 14], [24, 15], [28, 15],
  [32, 15], [24, 16], [28, 16], [32, 16], [18, 26]
];
const IDS = ['kuiwei', 'chiyou', 'lieshan', 'siyue', 'gonggong', 'shennong'];
const GATES = new Map([[10, 50], [20, 59], [30, 69], [40, 79], [50, 89]]);

function cost(from, to) {
  return APPROVED.slice(from, to).reduce((total, pair) =>
    [total[0] + pair[0], total[1] + pair[1]], [0, 0]);
}

function progress(playerLevel, herbs = 0) {
  return {
    version: 1, playerLevel, herbs,
    halls: Object.fromEntries(IDS.map(id => [id, { level: 0, tokens: 0 }]))
  };
}

function cap(player) {
  if (player === null) return null;
  if (player < 50) return 9;
  if (player < 59) return 19;
  if (player < 69) return 29;
  if (player < 79) return 39;
  if (player < 89) return 49;
  return 50;
}

test('all fifty upgrade rows and all cumulative rows match the approved literal reference', () => {
  assert.equal(DATA.steps.length, 50);
  const reference = CORE.referenceRows(DATA);
  for (let index = 0; index < 50; index++) {
    assert.deepEqual(DATA.steps[index], {
      from: index, to: index + 1,
      herbs: APPROVED[index][0], tokens: APPROVED[index][1],
      playerLevel: GATES.get(index + 1) ?? null
    });
    const total = cost(0, index + 1);
    assert.equal(reference[index].cumulativeHerbs, total[0]);
    assert.equal(reference[index].cumulativeTokens, total[1]);
  }
  assert.deepEqual(cost(0, 50), [904, 435]);
});

test('all 1326 valid upgrade intervals use only their remaining approved steps', () => {
  let intervals = 0;
  for (let from = 0; from <= 50; from++) {
    for (let to = from; to <= 50; to++) {
      const result = CORE.calculateCost(from, to, DATA);
      assert.deepEqual([result.herbs, result.tokens], cost(from, to), from + ' -> ' + to);
      assert.deepEqual(result.steps.map(row => row.to),
        Array.from({ length: to - from }, (_, index) => from + index + 1));
      intervals++;
    }
  }
  assert.equal(intervals, 1326);
});

test('all 64 hall subsets with empty, exact, excess and maximum inventories keep resource scopes', () => {
  for (let mask = 0; mask < 64; mask++) {
    const selected = IDS.filter((id, index) => mask & (1 << index));
    const current = progress(89);
    const targets = Object.fromEntries(IDS.map(id => [id, 50]));
    IDS.forEach((id, index) => { current.halls[id].level = [0, 9, 19, 29, 39, 50][index]; });
    const total = selected.reduce((sum, id) => sum + cost(current.halls[id].level, 50)[0], 0);
    for (const [stockCase, stock] of [0, total, total + 1, Number.MAX_SAFE_INTEGER].entries()) {
      current.herbs = stock;
      IDS.forEach((id, index) => {
        const need = cost(current.halls[id].level, 50)[1];
        current.halls[id].tokens = [0, need, need + 1, Number.MAX_SAFE_INTEGER][(index + stockCase) % 4];
      });
      const before = JSON.stringify(current);
      const result = CORE.calculatePlan(current, { selected, targets }, DATA);
      assert.equal(result.valid, true);
      assert.equal(result.selectedCount, selected.length);
      assert.equal(result.rows.length, selected.length);
      assert.deepEqual(result.rows.map(row => row.id), selected);
      assert.deepEqual(result.herbs, {
        need: total, stock, missing: Math.max(0, total - stock), remaining: Math.max(0, stock - total)
      });
      for (const row of result.rows) {
        const need = cost(current.halls[row.id].level, 50);
        const ownStock = current.halls[row.id].tokens;
        assert.deepEqual([row.herbs, row.tokens, row.tokenStock, row.tokenMissing, row.tokenRemaining],
          [need[0], need[1], ownStock, Math.max(0, need[1] - ownStock), Math.max(0, ownStock - need[1])]);
      }
      assert.equal(JSON.stringify(current), before);
    }
  }
});

test('every player level 0 to 100 and all current-level boundaries retain independent unlock semantics', () => {
  for (const player of [null, ...Array.from({ length: 101 }, (_, index) => index)]) {
    for (const level of [0, 9, 10, 19, 20, 29, 30, 39, 40, 49, 50]) {
      for (const target of [...new Set([level, 10, 20, 30, 40, 50])].filter(value => value >= level)) {
        const current = progress(player, 9999);
        current.halls.kuiwei = { level, tokens: 9999 };
        const result = CORE.calculatePlan(current, { selected: ['kuiwei'], targets: { kuiwei: target } }, DATA);
        const row = result.rows[0];
        assert.equal(result.valid, true);
        assert.equal(result.playerCap, cap(player));
        assert.equal(row.locked, player !== null && target > Math.max(level, cap(player)));
        assert.equal(row.progressConflict, player !== null && level > cap(player));
        const required = [...GATES].filter(([hallLevel]) => hallLevel <= target).at(-1);
        assert.equal(row.requiredPlayerLevel, required ? required[1] : null);
        assert.equal(result.herbs.missing, 0);
        assert.equal(row.tokenMissing, 0);
        assert.deepEqual([row.herbs, row.tokens], cost(level, target));
        assert.equal(current.halls.kuiwei.level, level);
      }
    }
  }
});
