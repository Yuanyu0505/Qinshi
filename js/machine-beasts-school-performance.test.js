const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const DATA = require('../data/machine-beasts.js');

// These are resource-safety guards for isolated diagnostic processes, not a
// claim that a 30-second calculation is an acceptable interactive experience.
const TIMEOUT_MS = 30000;
const LOG = path.join(__dirname, '..', 'test-results', 'school-1088-performance.log');
const CASES = DATA.schools.flatMap(school => [
  { id: `${school.id}-default`, schoolId: school.id, stock: 0, price: 70, inventory: false },
  { id: `${school.id}-heterogeneous-high-inventory`, schoolId: school.id, stock: 10000, price: 70, inventory: true },
  { id: `${school.id}-fractional-shared-stock`, schoolId: school.id, stock: 18000, price: 69.125, inventory: true }
]);

function makeInput(spec) {
  const school = DATA.schools.find(s => s.id === spec.schoolId);
  const progress = {}, ownedLimitsByBeast = {};
  school.beastIds.forEach((id, index) => {
    const beast = DATA.beasts.find(b => b.id === id);
    if (!spec.inventory) return;
    const inventory = {}, limits = {};
    for (const mod of DATA.modifications) {
      if (mod.id !== 'none' && beast.quality !== 'orange') continue;
      inventory[mod.id] = {}; limits[mod.id] = {};
      for (let rank = 0; rank <= beast.maxRank; rank++) {
        inventory[mod.id][rank] = 1000 + index * 13 + rank;
        limits[mod.id][rank] = 200 + index + rank;
      }
    }
    // Distinct, non-threshold progress deliberately prevents material-cache
    // sharing between same-quality beasts, including the orange-five group.
    progress[id] = { research: 5000 + index * 7919, fragments: index % 40,
      showHighRanks: true, showMods: true, inventory };
    ownedLimitsByBeast[id] = limits;
  });
  return { school, progress, options: {
    targetStage: spec.inventory ? 5 : 1,
    participatingBeastIds: school.beastIds.slice(), useOwnedInventory: true,
    bluePurpleInventoryOnly: true, allowNewHighRanks: Boolean(spec.inventory),
    allowNewModifications: Boolean(spec.inventory), ownedLimitsByBeast,
    referenceCostSettings: { awakeningBlueprintStock: spec.stock,
      useAwakeningBlueprintStock: true, awakeningBlueprintPrice: spec.price }
  } };
}

function assertLegal(result, input) {
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.plans.length >= 1 && result.plans.length <= 2);
  for (const plan of result.plans) {
    assert.ok(plan.totals.projectedTotalLevel >= result.target.totalLevel);
    assert.equal(plan.totals.pricedYuan, plan.cost.totalYuan);
    assert.ok(Number.isSafeInteger(plan.totals.pricedYuan));
    assert.equal(plan.totals.modifiedInvestedCount, 0);
    let blueprints = 0, effects = 0, overflow = 0, bodyYuan = 0;
    let level = result.current.totalLevel;
    for (const entry of plan.beasts) {
      const beast = DATA.beasts.find(b => b.id === entry.beastId);
      let research = 0, newEquivalent = 0;
      assert.ok(entry.endLevel <= beast.maxLevel);
      for (const item of entry.items) {
        assert.ok(Number.isInteger(item.count) && item.count > 0);
        assert.ok(item.rank >= 0 && item.rank <= beast.maxRank);
        assert.equal(item.modificationId, 'none');
        if (beast.quality !== 'orange') assert.equal(item.source, 'owned');
        const value = DATA.researchValues[beast.quality][item.rank].none;
        research += value * item.count;
        blueprints += Math.ceil(value / DATA.resourceRules.blueprintDivisor) * item.count;
        if (item.source === 'owned') {
          const recorded = input.progress[beast.id]?.inventory.none[item.rank] || 0;
          const limit = input.options.ownedLimitsByBeast[beast.id]?.none[item.rank] ?? recorded;
          assert.ok(item.count <= Math.min(recorded, limit));
        } else newEquivalent += item.count * (item.rank > 7 ? 2 ** (item.rank - 7) : 1);
      }
      assert.equal(entry.endResearch, entry.startResearch + research);
      assert.equal(entry.addedResearch, research);
      let calculatedLevel = 0;
      for (let l = 1; l <= beast.maxLevel; l++) if (entry.endResearch >= DATA.researchThresholds[l]) calculatedLevel = l;
      assert.equal(entry.endLevel, calculatedLevel);
      assert.equal(entry.newInvestedCount, newEquivalent);
      effects += beast.effects.filter(e => entry.startLevel < e.level && e.level <= entry.endLevel).length;
      overflow += entry.endResearch - DATA.researchThresholds[entry.endLevel];
      level += entry.endLevel - entry.startLevel;
      const missing = Math.max(0, newEquivalent * beast.fragmentsPerBody - (input.progress[beast.id]?.fragments || 0));
      if (beast.quality === 'orange' && missing) bodyYuan += beast.contributionPerFragment === null ?
        Math.ceil(missing * DATA.referenceCostRules.orangeFiveBodyPrice / beast.fragmentsPerBody) :
        Math.ceil(missing * beast.contributionPerFragment / DATA.referenceCostRules.contributionPerYuan);
    }
    assert.equal(plan.totals.projectedTotalLevel, level);
    assert.equal(plan.totals.awakeningBlueprints, blueprints);
    assert.equal(plan.totals.unlockedEffects, effects);
    assert.equal(plan.totals.overflowResearch, overflow);
    const stock = input.options.referenceCostSettings.awakeningBlueprintStock;
    assert.equal(plan.cost.blueprints.usedStock, Math.min(stock, blueprints));
    assert.equal(plan.cost.blueprints.missing, Math.max(0, blueprints - stock));
    // Prices chosen above are exactly representable binary fractions.
    const expectedCost = bodyYuan + Math.ceil(Math.max(0, blueprints - stock) * input.options.referenceCostSettings.awakeningBlueprintPrice);
    assert.equal(plan.totals.pricedYuan, expectedCost);
  }
}

function worker(id) {
  const spec = CASES.find(c => c.id === id);
  assert.ok(spec, `Unknown performance case: ${id}`);
  const planner = require('./machine-beast-school-planner.js');
  const input = makeInput(spec);
  const start = performance.now();
  const result = planner.calculateSchoolPlans(DATA, spec.schoolId, input.progress, input.options);
  const solverMs = performance.now() - start;
  assertLegal(result, input);
  console.log('SCHOOL_PERF_RESULT ' + JSON.stringify({ id, solverMs,
    heapUsedMiB: process.memoryUsage().heapUsed / 1024 ** 2,
    peakRssMiB: process.resourceUsage().maxRSS / 1024,
    participantCount: input.school.beastIds.length, distinctResearchCount: new Set(Object.values(input.progress).map(p => p.research)).size,
    results: result.plans.map(p => ({ kind: p.kind, yuan: p.totals.pricedYuan,
      effects: p.totals.unlockedEffects, totalLevel: p.totals.projectedTotalLevel,
      blueprints: p.totals.awakeningBlueprints, newBluePurpleBodies: 0 })) }));
}

if (process.argv[2] === '--candidate') {
  const spec = CASES.find(c => c.id === process.argv[3]);
  assert.ok(spec, 'Unknown candidate diagnostic case');
  const input = makeInput(spec);
  const beast = DATA.beasts.find(b => b.id === process.argv[4]);
  assert.ok(beast && input.school.beastIds.includes(beast.id));
  const start = performance.now();
  const candidates = require('./machine-beast-school-planner.js').machineBeastCandidates(DATA, beast,
    input.progress[beast.id], { ...input.options, ownedLimits: input.options.ownedLimitsByBeast[beast.id] });
  console.log('SCHOOL_PERF_RESULT ' + JSON.stringify({ id: spec.id, beastId: beast.id,
    candidateCount: candidates.length, solverMs: performance.now() - start,
    heapUsedMiB: process.memoryUsage().heapUsed / 1024 ** 2,
    peakRssMiB: process.resourceUsage().maxRSS / 1024 }));
} else if (process.argv[2] === '--worker') {
  worker(process.argv[3]);
} else {
  const filter = process.env.SCHOOL_PERF_CASE;
  const cases = CASES.filter(c => !filter || c.id.includes(filter));
  assert.ok(cases.length, `No performance cases match ${filter}`);
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `\nRUN ${new Date().toISOString()} node=${process.version} timeoutMs=${TIMEOUT_MS}\n`);
  for (const spec of cases) test(`isolated school performance: ${spec.id}`, { timeout: TIMEOUT_MS + 5000 }, () => {
    const start = performance.now();
    const child = spawnSync(process.execPath, ['--max-old-space-size=768', '--trace-gc', __filename, '--worker', spec.id], {
      encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 ** 2, windowsHide: true
    });
    const wallMs = performance.now() - start;
    // Native GC output can share a line with console output on Windows.
    const match = child.stdout.match(/SCHOOL_PERF_RESULT (\{[^\r\n]*\})/);
    const beforeGc = Array.from((child.stdout + child.stderr).matchAll(/(?:Scavenge|Mark-Compact|Mark-sweep|Minor Mark-Sweep)[^\d\n]*(\d+(?:\.\d+)?) \(/g), m => Number(m[1]));
    const metrics = match ? JSON.parse(match[1]) : {};
    const record = { id: spec.id, wallMs, ...metrics,
      // Synchronous solver execution prevents JS interval sampling. This is an
      // observed lower bound from all GC pre-collection readings + final heap;
      // peak RSS above is the OS process high-water mark, not heap allocation.
      heapPeakObservedMiB: Math.max(0, metrics.heapUsedMiB || 0, ...beforeGc),
      status: child.status, signal: child.signal, error: child.error?.code || null };
    fs.appendFileSync(LOG, JSON.stringify(record) + '\n');
    if (child.status !== 0 || !match) fs.appendFileSync(LOG, child.stdout.slice(-12000) + '\n' + child.stderr.slice(-12000) + '\n');
    console.log(JSON.stringify(record));
    assert.equal(child.error?.code, undefined, `${spec.id}: ${child.error?.code}; see ${LOG}`);
    assert.equal(child.status, 0, `${spec.id}: ${child.stderr.slice(-1500)}; see ${LOG}`);
    assert.ok(match, `${spec.id}: missing worker result; see ${LOG}`);
  });
}
