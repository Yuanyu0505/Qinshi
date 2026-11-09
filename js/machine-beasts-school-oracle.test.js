const { test } = require("node:test");
const assert = require("node:assert/strict");
const PLANNER = require("./machine-beast-school-planner.js");

// This oracle deliberately does not import CORE: quantities, levels, effects,
// per-item resources, fragment charges and the final shared-stock deduction are
// enumerated independently, without product frontiers or dominance pruning.
function fixture(specs, target = 3) {
  const beasts = specs.map((spec, index) => ({
    id: `beast-${index}`, name: `Beast ${index}`, schoolId: "oracle",
    quality: spec.quality || "orange", tier: spec.tier || "橙一",
    maxLevel: spec.maxLevel || 4, maxRank: spec.maxRank === undefined ? 1 : spec.maxRank,
    fragmentsPerBody: spec.fragmentsPerBody || 4,
    contributionPerFragment: spec.contributionPerFragment === undefined ? 3 : spec.contributionPerFragment,
    effects: (spec.effects || [2, 4]).map(level => ({ level, text: `Effect ${level}` }))
  }));
  return {
    beasts,
    schools: [{ id: "oracle", name: "Oracle", beastIds: beasts.map(beast => beast.id),
      stages: Array.from({ length: 5 }, (_, index) => ({ stage: index + 1, requiredTotalLevel: target + index })) }],
    researchThresholds: { 0: 0, 1: 5, 2: 9, 3: 14, 4: 18, 5: 23, 6: 27, 7: 32 },
    researchValues: {
      orange: { 0: { none: 2, initial: 5 }, 1: { none: 3, initial: 5 } },
      blue: { 0: { none: 2 }, 1: { none: 3 } },
      purple: { 0: { none: 3 }, 1: { none: 5 } }
    },
    modifications: [{ id: "none", name: "Plain" }, { id: "initial", name: "Modified" }],
    resourceRules: { blueprintDivisor: 3, organPieceDivisor: 2 },
    referenceCostRules: { blueprintPrice: 7, orangeFiveBodyPrice: 45, contributionPerYuan: 3 }
  };
}

function level(data, beast, research) {
  let result = 0;
  for (let candidate = 1; candidate <= beast.maxLevel; candidate++) {
    if (research >= data.researchThresholds[candidate]) result = candidate;
  }
  return result;
}

function bruteBeast(data, beast, raw, options) {
  const progress = raw || {};
  const startResearch = progress.research || 0;
  const startLevel = level(data, beast, startResearch);
  const types = [];
  const inventory = progress.inventory || {};
  const limits = (options.ownedLimitsByBeast || {})[beast.id] || {};
  const maximumResearch = data.researchThresholds[beast.maxLevel] - startResearch;
  if (maximumResearch <= 0) return [{ addedLevel: 0, effects: 0, overflow: 0, blueprints: 0, bodyYuan: 0, modified: 0 }];
  if (options.useOwnedInventory !== false) {
    for (const mod of data.modifications) {
      if (mod.id !== "none" && beast.quality !== "orange") continue;
      // The school UI makes inventory limits the explicit selection of mods.
      if (mod.id !== "none" && !progress.showMods && !Object.keys(limits[mod.id] || {}).length) continue;
      for (const [rankText, available] of Object.entries(inventory[mod.id] || {})) {
        const rank = Number(rankText);
        if (rank > beast.maxRank) continue;
        const count = Object.hasOwn(limits[mod.id] || {}, rankText) ? Math.min(available, limits[mod.id][rankText]) : available;
        const row = data.researchValues[beast.quality][rank];
        const research = row && (row[mod.id] === undefined ? row.none : row[mod.id]);
        if (count > 0 && research > 0) types.push({ source: "owned", rank, modificationId: mod.id, research, count });
      }
    }
  }
  const settings = options.referenceCostSettings || {};
  const onlyInventory = options.bluePurpleInventoryOnly === undefined ? settings.bluePurpleInventoryOnly !== false : options.bluePurpleInventoryOnly;
  if (!(onlyInventory && (beast.quality === "blue" || beast.quality === "purple"))) {
    const maxRank = options.newRankMode === "zero" ? 0 : Math.min(7, beast.maxRank);
    for (let rank = 0; rank <= maxRank; rank++) {
      for (const mod of data.modifications) {
        if (mod.id !== "none" && (!options.allowNewModifications || beast.quality !== "orange")) continue;
        const row = data.researchValues[beast.quality][rank];
        const research = row && (row[mod.id] === undefined ? row.none : row[mod.id]);
        if (research > 0) types.push({ source: "new", rank, modificationId: mod.id, research, count: Infinity });
      }
    }
  }
  const maxItem = Math.max(0, ...types.map(type => type.research));
  const bound = maximumResearch + maxItem;
  const results = [];
  function enumerate(index, research, blueprints, newBodies, modified, largestUsed) {
    if (index < types.length) {
      const type = types[index];
      const cap = Math.min(type.count, Math.floor((bound - 1 - research) / type.research));
      const weight = type.rank <= 7 ? 1 : 2 ** (type.rank - 7);
      for (let count = 0; count <= cap; count++) enumerate(index + 1,
        research + count * type.research,
        blueprints + count * Math.ceil(type.research / data.resourceRules.blueprintDivisor),
        newBodies + (type.source === "new" ? count * weight : 0),
        modified + (type.modificationId === "none" ? 0 : count * weight),
        count ? Math.max(largestUsed, type.research) : largestUsed);
      return;
    }
    if (research >= maximumResearch && research - largestUsed >= maximumResearch) return;
    const endLevel = level(data, beast, startResearch + research);
    const missingFragments = Math.max(0, newBodies * beast.fragmentsPerBody - (progress.fragments || 0));
    let bodyYuan = 0;
    if (missingFragments && beast.quality === "orange") {
      if (beast.contributionPerFragment !== null) bodyYuan = Math.ceil(missingFragments * beast.contributionPerFragment / data.referenceCostRules.contributionPerYuan);
      else {
        const prices = settings.beastPrices || {};
        const price = Object.hasOwn(prices, beast.id) ? prices[beast.id] : data.referenceCostRules.orangeFiveBodyPrice;
        bodyYuan = price === null ? null : Math.ceil(missingFragments * price / beast.fragmentsPerBody);
      }
    }
    results.push({ addedLevel: endLevel - startLevel,
      effects: beast.effects.filter(effect => startLevel < effect.level && effect.level <= endLevel).length,
      overflow: research ? startResearch + research - data.researchThresholds[endLevel] : 0,
      blueprints, bodyYuan, modified });
  }
  enumerate(0, 0, 0, 0, 0, 0);
  return results;
}

function compare(left, right) {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function tuple(metrics, mode) {
  const yuan = metrics.pricedYuan === null ? Infinity : metrics.pricedYuan;
  return [metrics.modifiedInvestedCount].concat(
    mode === "cost" ? [yuan, -metrics.unlockedEffects] : [-metrics.unlockedEffects, yuan],
    [metrics.overflowResearch, metrics.awakeningBlueprints]);
}

function bruteSchool(data, progress, options) {
  const school = data.schools[0];
  const target = school.stages[0].requiredTotalLevel;
  const current = data.beasts.reduce((sum, beast) => sum + level(data, beast, (progress[beast.id] || {}).research || 0), 0);
  if (current >= target) return { reached: true };
  const sets = data.beasts.map(beast => bruteBeast(data, beast, progress[beast.id], options));
  const settings = options.referenceCostSettings || {};
  const best = { cost: null, effects: null };
  function combine(index, addedLevel, effects, bodyYuan, blueprints, overflow, modified) {
    if (index < sets.length) {
      for (const candidate of sets[index]) combine(index + 1, addedLevel + candidate.addedLevel,
        effects + candidate.effects, bodyYuan === null || candidate.bodyYuan === null ? null : bodyYuan + candidate.bodyYuan,
        blueprints + candidate.blueprints, overflow + candidate.overflow, modified + candidate.modified);
      return;
    }
    if (current + addedLevel !== target) return;
    const stock = settings.useAwakeningBlueprintStock === false ? 0 : (settings.awakeningBlueprintStock || 0);
    const price = Object.hasOwn(settings, "awakeningBlueprintPrice") ? settings.awakeningBlueprintPrice : data.referenceCostRules.blueprintPrice;
    const missing = Math.max(0, blueprints - stock);
    // These two literal decimal prices are generated below. Calculate their
    // rational charges independently, without binary multiplication or CORE.
    const blueprintYuan = missing && price === null ? null : price === 1.1 ? Math.ceil(missing * 11 / 10) :
      price === 1e-7 ? Math.ceil(missing / 10000000) : Math.ceil(missing * (price || 0));
    const metrics = { pricedYuan: bodyYuan === null || blueprintYuan === null ? null : bodyYuan + blueprintYuan,
      unlockedEffects: effects, awakeningBlueprints: blueprints, overflowResearch: overflow, modifiedInvestedCount: modified };
    for (const mode of ["cost", "effects"]) {
      const value = tuple(metrics, mode);
      if (!best[mode] || compare(value, best[mode]) < 0) best[mode] = value;
    }
  }
  combine(0, 0, 0, 0, 0, 0, 0);
  return best;
}

function checkAgainstOracle(data, progress, options, context) {
  const expected = bruteSchool(data, progress, options);
  const actual = PLANNER.calculateSchoolPlans(data, data.schools[0], progress, { targetStage: 1, ...options });
  if (expected.reached) {
    assert.equal(actual.valid, true, context);
    assert.equal(actual.alreadyReached, true, context);
    assert.deepEqual(actual.plans, [], context);
    return actual;
  }
  assert.equal(actual.valid, expected.cost !== null, `${context}: feasibility`);
  if (!actual.valid) return actual;
  for (const mode of ["cost", "effects"]) {
    const plan = actual.plans.find(candidate => candidate.kind === mode || candidate.kind === "merged");
    assert.ok(plan, `${context}: missing ${mode} plan`);
    assert.equal(plan.totals.projectedTotalLevel, data.schools[0].stages[0].requiredTotalLevel, context);
    assert.deepEqual(tuple(plan.totals, mode), expected[mode], `${context}: ${mode}`);
  }
  return actual;
}

test("school oracle: shared blueprint stock can reverse intermediate-state cost ordering", () => {
  // First beast: 96 saved small bodies cost zero and consume 96 blueprints;
  // one newly purchased large body costs 1000 and consumes one blueprint.
  // Second beast necessarily uses 96 saved small bodies. Local current-price
  // pruning prefers the first path, but the full plan must choose the second.
  const data = fixture([{ maxLevel: 1, contributionPerFragment: 750 },
    { maxLevel: 1, maxRank: 0, quality: "purple", tier: "紫色", contributionPerFragment: null }], 2);
  data.researchThresholds[1] = 96;
  data.researchValues.orange = { 0: { none: 1 }, 1: { none: 96 } };
  data.researchValues.purple = { 0: { none: 1 } };
  data.resourceRules.blueprintDivisor = 96;
  data.referenceCostRules.blueprintPrice = 70;
  const options = { newRankMode: "zeroToSeven", referenceCostSettings: { awakeningBlueprintStock: 100 } };
  const progress = { "beast-0": { inventory: { none: { 0: 96 } } }, "beast-1": { inventory: { none: { 0: 96 } } } };
  checkAgainstOracle(data, progress, options, "shared stock reversal");
  const expected = bruteSchool(data, progress, options);
  assert.equal(expected.cost[1], 1000);
  assert.equal(expected.cost[4], 97);
});

test("school oracle: blue-purple stock restrictions cannot be bypassed by saved fragments or disabled inventory", () => {
  const data = fixture([{ quality: "purple", tier: "紫色", contributionPerFragment: null }], 1);
  for (const count of [0, 1, 2]) {
    for (const useOwnedInventory of [true, false]) {
      const progress = { "beast-0": { fragments: 999, inventory: { none: { 0: count, 1: 1 } } } };
      checkAgainstOracle(data, progress, { useOwnedInventory, newRankMode: "zero", bluePurpleInventoryOnly: true,
        ownedLimitsByBeast: { "beast-0": { none: { 0: count, 1: 0 } } } }, `purple stock ${count}/${useOwnedInventory}`);
    }
  }
  checkAgainstOracle(data, {}, { bluePurpleInventoryOnly: false, newRankMode: "zero" }, "new unpriced purple allowed");
});

test("school oracle: zero and missing prices preserve their distinct acquisition semantics", () => {
  const data = fixture([{ tier: "橙五", contributionPerFragment: null }], 1);
  for (const price of [0, 45]) checkAgainstOracle(data, {}, { newRankMode: "zero",
    referenceCostSettings: { beastPrices: { "beast-0": price }, awakeningBlueprintStock: 4 } }, `orange-five price ${price}`);
  for (const settings of [{ beastPrices: { "beast-0": null } }, { awakeningBlueprintPrice: null }]) {
    const result = PLANNER.calculateSchoolPlans(data, data.schools[0], {}, { targetStage: 1,
      newRankMode: "zero", referenceCostSettings: settings });
    assert.equal(result.valid, false, "a missing required price must block optimization");
    assert.ok(result.errors.length > 0);
  }
});

test("school oracle: modified inventory quantities receive the formal highest priority", () => {
  const data = fixture([{}], 3);
  const progress = { "beast-0": { showMods: true, inventory: { initial: { 0: 3 } } } };
  checkAgainstOracle(data, progress, { newRankMode: "zero", allowNewModifications: true,
    ownedLimitsByBeast: { "beast-0": { initial: { 0: 3 } } } }, "modified inventory");
});

test("school oracle: an already-reached school target stops even when further effects cost nothing", () => {
  const data = fixture([{}], 1);
  const progress = { "beast-0": { research: 5 } };
  checkAgainstOracle(data, progress, { newRankMode: "zero" }, "already-reached target with payable effects");
  data.beasts[0].contributionPerFragment = 0;
  checkAgainstOracle(data, progress, { newRankMode: "zero", referenceCostSettings: {
    awakeningBlueprintPrice: 0
  } }, "already-reached target with free priced resources still prefers effects");
});

test('school oracle: exact gain budget trades cost against effects instead of maximizing every beast', () => {
  const data = fixture([{ effects: [1, 3], contributionPerFragment: 750 },
    { effects: [1, 2], contributionPerFragment: 0 }], 3);
  const options = { newRankMode: 'zero', referenceCostSettings: { awakeningBlueprintPrice: 0 } };
  checkAgainstOracle(data, {}, options, 'fixed three levels, different formal winners');
  const result = PLANNER.calculateSchoolPlans(data, 'oracle', {}, { targetStage: 1, ...options });
  const cheap = result.plans.find(p => p.kind === 'cost');
  const effects = result.plans.find(p => p.kind === 'effects');
  assert.equal(cheap.totals.pricedYuan, 0); assert.equal(cheap.totals.unlockedEffects, 2);
  assert.equal(effects.totals.pricedYuan, 3000); assert.equal(effects.totals.unlockedEffects, 3);
});

test('school oracle: sparse levels require modified materials and modification minimization still leads', () => {
  for (const owned of [false, true]) {
    const data = fixture([{ maxLevel: 3, maxRank: 0, effects: [1, 3] }], 1);
    data.researchThresholds = { 0: 0, 1: 4, 2: 6, 3: 10 };
    data.researchValues.orange = { 0: { none: 6, initial: 4 } };
    checkAgainstOracle(data, owned ? { 'beast-0': { showMods: true, inventory: { initial: { 0: 1 } } } } : {},
      { newRankMode: 'zero', allowNewModifications: !owned }, `sparse modified only ${owned}`);
  }
});

test('school oracle: randomized sparse research and modified stocks retain exact-level optima', () => {
  let seed = 1089;
  const random = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
  for (let index = 0; index < 80; index++) {
    const data = fixture([{ maxLevel: 3, maxRank: 0, effects: [1, 3] },
      { maxLevel: 3, maxRank: 0, effects: [2] }], 1 + random(6));
    data.researchValues.orange = { 0: { none: 2 + random(10), initial: 1 + random(8) } };
    data.resourceRules.blueprintDivisor = 1 + random(7);
    const progress = { 'beast-0': { research: random(5), showMods: true, inventory: { initial: { 0: random(3) } } },
      'beast-1': { research: random(5), fragments: random(6), inventory: { none: { 0: random(3) } } } };
    const options = { newRankMode: 'zero', allowNewModifications: true,
      referenceCostSettings: { awakeningBlueprintPrice: index % 3 ? 0 : 1.1, awakeningBlueprintStock: random(10) } };
    checkAgainstOracle(data, progress, options, `sparse seed1089 ${index}`);
  }
});

test("school oracle: 100 seeded random small instances match complete quantity enumeration and reversed traversal", () => {
  let seed = 1088;
  const random = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
  for (let index = 0; index < 100; index++) {
    const lowQuality = index % 4 === 0;
    const data = fixture([
      { maxLevel: 4 + random(4), effects: [2, 4, 6] },
      { maxLevel: 4 + random(4), effects: [1, 3, 5], ...(lowQuality ? { quality: "purple", tier: "紫色", contributionPerFragment: null } : {}) }
    ], 2 + random(5));
    data.beasts.forEach(beast => { beast.effects = beast.effects.filter(effect => effect.level <= beast.maxLevel); });
    const progress = {};
    const limits = {};
    for (const beast of data.beasts) {
      const counts = { 0: random(4), 1: random(4) };
      progress[beast.id] = { research: random(6), fragments: random(7), inventory: { none: counts } };
      limits[beast.id] = { none: { 0: random(counts[0] + 1), 1: random(counts[1] + 1) } };
    }
    const options = { newRankMode: index % 3 ? "zero" : "zeroToSeven", useOwnedInventory: index % 7 !== 0,
      bluePurpleInventoryOnly: index % 5 !== 0, ownedLimitsByBeast: limits,
      referenceCostSettings: { awakeningBlueprintStock: index % 11 === 0 ? 1000 : random(15),
        awakeningBlueprintPrice: index % 13 === 0 ? 1.1 : index % 17 === 0 ? 1e-7 : random(8),
        useAwakeningBlueprintStock: index % 9 !== 0 } };
    const forward = checkAgainstOracle(data, progress, options, `seed1088 case${index}`);
    const reversed = { ...data, beasts: data.beasts.slice().reverse(), modifications: data.modifications.slice().reverse(),
      schools: [{ ...data.schools[0], beastIds: data.schools[0].beastIds.slice().reverse() }] };
    const backward = checkAgainstOracle(reversed, progress, options, `seed1088 reversed case${index}`);
    assert.deepEqual(backward.plans?.map(p => [p.kind, p.stableKey]), forward.plans?.map(p => [p.kind, p.stableKey]), `stable traversal case${index}`);
  }
});
