const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/machine-beasts.js');
const PLANNER = require('./machine-beast-school-planner.js');

function tiny({ target = 1, normal = 6, modified = 4, effects = [1, 2, 3] } = {}) {
  const b = { ...DATA.beasts.find(b => b.quality === 'orange'), id: 'tiny', name: 'Tiny', maxLevel: 3,
    maxRank: 0, effects: effects.map(level => ({ level, text: 'tier ' + level })) };
  return { ...DATA, beasts: [b], researchThresholds: { 0: 0, 1: 4, 2: 6, 3: 10 },
    researchValues: { orange: { 0: { none: normal, initial: modified } } },
    modifications: [{ id: 'none' }, { id: 'initial' }],
    schools: [{ id: 'test', beastIds: ['tiny'], stages: [{ stage: 1, requiredTotalLevel: target }] }] };
}
function solve(data, progress = {}, options = {}) {
  return PLANNER.calculateSchoolPlans(data, data.schools[0], progress, { targetStage: 1, newRankMode: 'zero', ...options });
}
function plan(result, mode) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  return result.plans.find(p => p.kind === mode || p.kind === 'merged');
}

test('exact target: skip-over materials cannot masquerade as reaching level one', () => {
  const r = solve(tiny());
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /当前条件下无法精确达到目标/);
});
test('exact target: already reached or exceeded stops before price validation and participant search', () => {
  for (const research of [4, 6, 10]) {
    const r = solve(tiny(), { tiny: { research } }, { participatingBeastIds: [], referenceCostSettings: { awakeningBlueprintPrice: null } });
    assert.equal(r.valid, true); assert.equal(r.alreadyReached, true); assert.deepEqual(r.plans, []);
  }
});
test('exact target: modification can be required when ordinary materials skip the target level', () => {
  const r = solve(tiny(), {}, { allowNewModifications: true });
  const p = plan(r, 'cost');
  assert.equal(p.totals.projectedTotalLevel, 1);
  assert.equal(p.totals.modifiedInvestedCount, 1);
  assert.equal(p.beasts[0].items[0].modificationId, 'initial');
});
test('exact target: owned modifications obey visibility, per-rank limits and global inventory policy', () => {
  const d = tiny();
  const progress = { tiny: { showMods: true, inventory: { initial: { 0: 1 } } } };
  assert.equal(plan(solve(d, progress), 'cost').totals.ownedModifiedInvestedCount, 1);
  assert.equal(solve(d, progress, { useOwnedInventory: false }).valid, false);
  assert.equal(solve(d, progress, { ownedLimitsByBeast: { tiny: { initial: { 0: 0 } } } }).valid, false);
  assert.equal(solve(d, { tiny: { inventory: { initial: { 0: 1 } } } }).valid, false);
});
test('exact target: actual 97 to 135 allows only turtle and tiger and preserves all other levels', () => {
  const school = DATA.schools.find(s => s.id === 'nonAttack');
  const turtle = DATA.beasts.find(b => b.name === '机关玄武');
  const tiger = DATA.beasts.find(b => b.name === '机关白虎');
  assert.ok(turtle && tiger);
  const progress = {}; let remaining = 97;
  for (const id of school.beastIds) {
    const b = DATA.beasts.find(b => b.id === id);
    const level = [turtle.id, tiger.id].includes(id) ? 0 : Math.min(remaining, b.maxLevel);
    remaining -= level;
    progress[id] = { research: DATA.researchThresholds[level] };
  }
  assert.equal(remaining, 0);
  const before = JSON.stringify(progress);
  for (const ids of [[turtle.id, tiger.id], school.beastIds]) {
    const r = PLANNER.calculateSchoolPlans(DATA, school, progress, { targetStage: 3, participatingBeastIds: ids });
    for (const p of r.plans || []) {
      assert.equal(p.totals.projectedTotalLevel, 135);
      assert.equal(p.beasts.reduce((sum, b) => sum + b.endLevel - b.startLevel, 0), 38);
      assert.ok(p.beasts.every(b => ids.includes(b.beastId)));
      assert.equal(p.finalEffects.length, school.beastIds.length);
    }
    assert.ok(plan(r, 'effects').totals.unlockedEffects >= 5);
  }
  assert.equal(JSON.stringify(progress), before);
});
test('exact target: 0 to 20 counts three nodes but final effect replaces earlier tiers', () => {
  const beast = DATA.beasts.find(b => b.id === 'war-demon');
  const d = { ...DATA, beasts: [beast], schools: [{ id: 'test', beastIds: [beast.id], stages: [{ stage: 1, requiredTotalLevel: 20 }] }] };
  for (const p of solve(d).plans || []) {
    assert.equal(p.totals.unlockedEffects, 3);
    assert.equal(p.finalEffects.length, 1);
    assert.equal(p.finalEffects[0].effect.level, 20);
    assert.equal(p.beasts[0].finalEffect.level, 20);
  }
  assert.equal(solve(d).valid, true);
});
test('exact target: node counts use nonuniform actual effects, and highest active tier is independent', () => {
  const d = tiny({ target: 2, normal: 4, effects: [1, 3] });
  const p = plan(solve(d), 'effects');
  assert.equal(p.totals.projectedTotalLevel, 2);
  assert.equal(p.totals.unlockedEffects, 1);
  assert.equal(p.finalEffects[0].effect.level, 1);
  const cs = PLANNER.machineBeastCandidates(d, d.beasts[0], {}, { maxAddedLevel: 1 });
  assert.ok(cs.every(c => c.endLevel - c.startLevel <= 1));
});

test('exact target: equal node and yuan totals compare overflow before blueprints in both plans', () => {
  const d = tiny({ normal: 4 });
  d.beasts[0].maxRank = 1; d.beasts[0].contributionPerFragment = 0;
  d.researchValues.orange[1] = { none: 5 };
  for (const p of solve(d, {}, { newRankMode: 'zeroToSeven', referenceCostSettings: { awakeningBlueprintPrice: 0 } }).plans) {
    assert.equal(p.totals.unlockedEffects, 1); assert.equal(p.totals.pricedYuan, 0);
    assert.equal(p.totals.overflowResearch, 0); assert.equal(p.beasts[0].endResearch, 4);
  }
});
test('exact target: after equal nodes, yuan and overflow, fewer blueprints wins', () => {
  const d = tiny({ normal: 2 });
  d.beasts[0].maxRank = 1; d.beasts[0].contributionPerFragment = 0;
  d.researchValues.orange[1] = { none: 4 }; d.resourceRules = { blueprintDivisor: 4, organPieceDivisor: 1 };
  const p = plan(solve(d, {}, { newRankMode: 'zeroToSeven', referenceCostSettings: { awakeningBlueprintPrice: 0 } }), 'effects');
  assert.equal(p.totals.overflowResearch, 0); assert.equal(p.totals.awakeningBlueprints, 1);
  assert.equal(p.beasts[0].items[0].rank, 1);
});
test('exact target: high-rank modified inventory uses its folded quantity in the first objective', () => {
  const d = tiny(); d.beasts[0].maxRank = 8; d.researchValues.orange[8] = { none: 6, initial: 4 };
  const p = plan(solve(d, { tiny: { showMods: true, inventory: { initial: { 8: 1 } } } }), 'cost');
  assert.equal(p.totals.modifiedInvestedCount, 2); assert.equal(p.totals.ownedModifiedInvestedCount, 2);
  assert.equal(p.totals.projectedTotalLevel, 1);
});

test('exact target: literal crossed-node examples never stack replaced effect tiers', () => {
  const beast = DATA.beasts.find(b => b.id === 'war-demon');
  for (const [start, end, nodes, active] of [[0, 20, 3, 20], [0, 18, 2, 15], [10, 20, 2, 20], [9, 11, 1, 10]]) {
    const d = { ...DATA, beasts: [beast], schools: [{ id: 'test', beastIds: [beast.id], stages: [{ stage: 1, requiredTotalLevel: end }] }] };
    const p = plan(solve(d, { [beast.id]: { research: DATA.researchThresholds[start] } }), 'effects');
    assert.equal(p.totals.projectedTotalLevel, end);
    assert.equal(p.totals.unlockedEffects, nodes);
    assert.equal(p.finalEffects[0].effect.level, active);
  }
});
