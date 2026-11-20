'use strict';
// Frozen correctness artifacts are separate from the timing/probe harness.
// No personal storage, accounts, network or production data are accessed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { load } = require('./machine-baseline-loader.cjs');
const root = path.resolve(__dirname, '..');
const specs = [
  { id: 'hegemonic-default', schoolId: 'hegemonic', stage: 1, mixed: false, stock: 0, price: 70 },
  { id: 'hegemonic-heterogeneous-high-inventory', schoolId: 'hegemonic', stage: 5, mixed: true, stock: 0, price: 70 },
  { id: 'nonAttack-fractional-shared-stock', schoolId: 'nonAttack', stage: 5, mixed: true, stock: 1000000000, price: 69.125 }
];
function input(data, spec) {
  const school = data.schools.find(s => s.id === spec.schoolId), progress = {};
  school.beastIds.forEach((id, index) => {
    const beast = data.beasts.find(b => b.id === id), inventory = {};
    if (spec.mixed) {
      if (beast.quality === 'orange') {
        inventory.none = { 0: 2 + index % 3, 7: 1, 8: 1, 9: index % 2, 10: index % 3 === 0 ? 1 : 0 };
        inventory.fullDivine = { 7: index % 2, 8: index % 3 === 0 ? 1 : 0 };
        inventory.initial = { 0: index % 2, 9: index % 4 === 0 ? 1 : 0 };
      } else inventory.none = { 0: Math.ceil(data.researchThresholds[beast.maxLevel] / data.researchValues[beast.quality][0].none), [beast.maxRank]: 2 };
    }
    progress[id] = { research: 0, fragments: index % 3, showHighRanks: true, showMods: true, inventory };
  });
  return { progress, options: { targetStage: spec.stage, newRankMode: 'zeroToSeven', convertOwnedInventory: true, allowNewModifications: false, allowNewHighRanks: false, bluePurpleInventoryOnly: true, referenceCostSettings: { awakeningBlueprintPrice: spec.price, useAwakeningBlueprintStock: true, awakeningBlueprintStock: spec.stock } } };
}
function capture(api, spec) {
  const { progress, options } = input(api.data, spec);
  const result = api.planner.calculateSchoolPlans(api.data, spec.schoolId, progress, options);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const pages = result.plans.map(plan => {
    const count = BigInt(plan.equivalents.count), decoded = [];
    // These three frozen scenarios have finite small equivalent sets. Refuse
    // an unexpected explosion, never silently truncate the comparison.
    assert.ok(count <= 10000n, 'Freeze needs explicit larger-page policy: ' + count);
    for (let offset = 0n; offset < count; offset += 10n) decoded.push(api.planner.equivalentPlansPage(api.data, plan, String(offset), 10));
    return decoded;
  });
  return { spec, input: { progress, options }, result, pages };
}
if (require.main === module) {
  const args = process.argv.slice(2), check = args.includes('--check'), at = args.indexOf('--revision');
  const revision = at >= 0 ? args[at + 1] : check ? null : 'd667c2b';
  const api = load(revision), directory = path.join(root, 'outputs', '1147-frozen');
  fs.mkdirSync(directory, { recursive: true });
  for (const spec of specs) {
    const start = performance.now(), value = capture(api, spec), json = JSON.stringify(value), filename = path.join(directory, spec.id + '.json');
    if (check) assert.equal(json, fs.readFileSync(filename, 'utf8'), 'Complete frozen JSON: ' + spec.id);
    else { assert.ok(!fs.existsSync(filename), 'Refusing to overwrite frozen baseline: ' + filename); fs.writeFileSync(filename, json); }
    console.log(JSON.stringify({ id: spec.id, revision: revision || 'worktree', mode: check ? 'identical' : 'frozen', elapsedMs: performance.now() - start, bytes: Buffer.byteLength(json), sha256: crypto.createHash('sha256').update(json).digest('hex'), equivalentCounts: value.result.plans.map(p => p.equivalents.count), pages: value.pages.map(p => p.length), node: process.version, peakRssMiB: process.resourceUsage().maxRSS / 1024 }));
  }
}
module.exports = { specs, input, capture };
