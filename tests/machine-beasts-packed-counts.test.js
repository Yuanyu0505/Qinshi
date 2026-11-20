'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CORE = require('../js/machine-beasts.js');
const modifications = ['none', 'initial', 'heaven', 'immortal', 'saint', 'fullDivine'];

function fixture(maxRank, lastResearch = 1) {
  const beast = { id: 'packing', name: 'Packing', quality: 'orange', maxLevel: 1, maxRank, fragmentsPerBody: 4, effects: [] };
  const data = {
    modifications: modifications.map(id => ({ id })),
    researchThresholds: { 0: 0, 1: 257 },
    researchValues: { orange: Object.fromEntries(Array.from({ length: maxRank + 1 }, (_, rank) => [rank,
      Object.fromEntries(modifications.map(id => [id, id === 'fullDivine' ? lastResearch : 1]))])) },
    resourceRules: { blueprintDivisor: 500, organPieceDivisor: 100 }
  };
  return { beast, data, progress: { research: 0, fragments: 0, inventory: {}, showMods: true },
    options: { convertOwnedInventory: true, newRankMode: 'zeroToSeven', allowNewModifications: true } };
}

test('48 material types force BigInt packing without changing the literal stable final-rank allocation', () => {
  // 48 unlimited types, each research 1 and count bound 257: 9 bits each,
  // totaling 432 bits. An ordinary Number cannot encode this vector.
  const f = fixture(7), events = [];
  const rows = CORE.conversionCandidates(f.data, f.beast, f.progress, { ...f.options, onDiagnostic: event => events.push(event) }, 257, true);
  assert.equal(events.at(-1).typeCount, 48);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].research, 257);
  assert.equal(rows[0].modified, 0);
  assert.deepEqual(rows[0].rawItems, [{ source: 'new', rank: 7, modificationId: 'none', count: 257, researchEach: 1, sevenRankEquivalent: 1 }]);
  // Literal spec: ranks outermost, six modifications inside each rank; the
  // lexicographically smallest zero-mod vector uses slot 42, not an earlier rank.
  assert.equal(rows[0].stable, '0000000000000000'.repeat(42) + '0000000000000257' + '0000000000000000'.repeat(5));
});

test('exactly 53 packed bits retain the high-slot 257 count and low-slot mixed vectors', () => {
  // Six unlimited rank-zero types. Research-domain maximum is 258:
  // five research-1 types require 9 bits, research-2 fullDivine requires 8.
  // Total is exactly 53, exercising the inclusive Number boundary.
  const f = fixture(0, 2), rows = CORE.conversionCandidates(f.data, f.beast, f.progress, f.options, 257, true);
  const plain = rows.find(row => row.research === 257 && row.modified === 0);
  assert.ok(plain);
  assert.deepEqual(plain.rawItems, [{ source: 'new', rank: 0, modificationId: 'none', count: 257, researchEach: 1, sevenRankEquivalent: 1 }]);
  assert.equal(plain.stable, '0000000000000257' + '0000000000000000'.repeat(5));
  const mixed = rows.find(row => row.research === 257 && row.modified === 128);
  assert.ok(mixed);
  assert.deepEqual(mixed.rawItems, [
    { source: 'new', rank: 0, modificationId: 'none', count: 1, researchEach: 1, sevenRankEquivalent: 1 },
    { source: 'new', rank: 0, modificationId: 'fullDivine', count: 128, researchEach: 2, sevenRankEquivalent: 1 }
  ]);
  assert.equal(mixed.stable, '0000000000000001' + '0000000000000000'.repeat(4) + '0000000000000128');
});
