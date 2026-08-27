const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/machine-beasts.js");
const CORE = require("./machine-beasts.js");
const PLANNER = require("./machine-beast-school-planner.js");

test("machine beast data: detailed names, schools and stage effects stay complete", () => {
  assert.strictEqual(DATA.beasts.length, 27);
  assert.strictEqual(new Set(DATA.beasts.map(item => item.id)).size, 27);
  assert.strictEqual(new Set(DATA.beasts.map(item => item.name)).size, 27);
  assert.deepStrictEqual(DATA.schools.map(item => item.id), ["hegemonic", "nonAttack"]);
  DATA.schools.forEach(school => {
    assert.strictEqual(school.stages.length, 5);
    assert.deepStrictEqual(school.stages.map(stage => stage.requiredTotalLevel), [45, 90, 135, 180, 225]);
    school.stages.forEach(stage => {
      assert.ok(stage.factionBonus);
      assert.ok(stage.formationEffect);
      assert.ok(stage.beastEffect);
    });
  });
});

test("searchBeasts: matches name, tier, school and research effects without changing source order", () => {
  assert.deepStrictEqual(
    CORE.searchBeasts(DATA, "白虎").map(item => item.id),
    ["mechanical-white-tiger", "zero-white-tiger"]
  );
  assert.deepStrictEqual(
    CORE.searchBeasts(DATA, "斩杀").map(item => item.id),
    ["war-demon"]
  );
  assert.ok(CORE.searchBeasts(DATA, "橙五").every(item => item.tier === "橙五"));
  assert.deepStrictEqual(
    CORE.searchBeasts(DATA, "霸道机关术").map(item => item.id),
    DATA.schools.find(item => item.id === "hegemonic").beastIds
  );
  assert.deepStrictEqual(CORE.searchBeasts(DATA, ""), DATA.beasts);
});

test("machine beast data: quality limits and corrected orange-five records", () => {
  const byName = Object.fromEntries(DATA.beasts.map(item => [item.name, item]));
  assert.deepStrictEqual(
    [byName["机关炎傀"], byName["机关岳獠"]].map(item => [item.tier, item.maxLevel, item.contributionPerFragment]),
    [["橙五", 25, null], ["橙五", 25, null]]
  );
  DATA.beasts.forEach(beast => {
    assert.ok(DATA.qualityRules[beast.tier]);
    assert.strictEqual(beast.maxLevel, DATA.qualityRules[beast.tier].maxLevel);
    beast.effects.forEach(effect => assert.ok(effect.level <= beast.maxLevel));
  });
});

test("machine beast data: research tables preserve spreadsheet values", () => {
  assert.strictEqual(DATA.researchThresholds[1], 22800);
  assert.strictEqual(DATA.researchThresholds[25], 1136800);
  assert.strictEqual(DATA.researchValues.orange["7"]["none"], 75252);
  assert.strictEqual(DATA.researchValues.orange["10"]["fullDivine"], 833016);
  assert.strictEqual(DATA.researchValues.purple["6"].none, 35064);
  assert.strictEqual(DATA.researchValues.blue["2"].none, 1162);
  assert.deepStrictEqual(DATA.resourceRules, {
    blueprintDivisor: 500,
    organPieceDivisor: 100,
    yuanPerContribution: 0.5
  });
});

test("levelForResearch: cumulative research reaches exact thresholds without resetting", () => {
  assert.strictEqual(CORE.levelForResearch(0, DATA.researchThresholds, 25), 0);
  assert.strictEqual(CORE.levelForResearch(22799, DATA.researchThresholds, 25), 0);
  assert.strictEqual(CORE.levelForResearch(22800, DATA.researchThresholds, 25), 1);
  assert.strictEqual(CORE.levelForResearch(405100, DATA.researchThresholds, 25), 12);
  assert.strictEqual(CORE.levelForResearch(9999999, DATA.researchThresholds, 15), 15);
});

test("progress: normalization, next milestone and highest active effect", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const normalized = CORE.normalizeBeastProgress(beast, {
    research: 405100,
    fragments: -3,
    showHighRanks: 1,
    showMods: true,
    inventory: { none: { 0: 2.9, 7: 3, 99: 9 }, saint: { 7: 1 } }
  }, DATA);
  assert.strictEqual(normalized.research, 405100);
  assert.strictEqual(normalized.fragments, 0);
  assert.strictEqual(normalized.inventory.none["0"], 2);
  assert.strictEqual(normalized.inventory.none["7"], 3);
  assert.strictEqual(normalized.inventory.none["99"], undefined);
  assert.strictEqual(normalized.inventory.saint["7"], 1);
  assert.strictEqual(CORE.nextEffectLevel(beast, 12), 15);
  assert.strictEqual(CORE.nextEffectLevel(beast, 25), 25);
  assert.deepStrictEqual(CORE.activeBeastEffect(beast, 19), beast.effects[1]);
});

test("schoolSnapshot: calculates all five school stages from cumulative level", () => {
  const school = DATA.schools[0];
  const first = DATA.beasts.find(item => item.id === school.beastIds[0]);
  const second = DATA.beasts.find(item => item.id === school.beastIds[1]);
  const progress = {};
  progress[first.id] = { research: DATA.researchThresholds[10] };
  progress[second.id] = { research: DATA.researchThresholds[15] };
  let snapshot = CORE.schoolSnapshot(school, progress, DATA);
  assert.strictEqual(snapshot.totalLevel, 25);
  assert.strictEqual(snapshot.currentStage, 0);
  assert.strictEqual(snapshot.progressStage, 1);
  assert.strictEqual(snapshot.progressCurrent, 25);
  assert.strictEqual(snapshot.progressTarget, 45);
  assert.strictEqual(snapshot.progressRemaining, 20);
  assert.strictEqual(snapshot.nextStage.stage, 1);
  assert.ok(snapshot.nextStage.formationEffect);

  school.beastIds.slice(2, 4).forEach(id => { progress[id] = { research: DATA.researchThresholds[10] }; });
  snapshot = CORE.schoolSnapshot(school, progress, DATA);
  assert.strictEqual(snapshot.totalLevel, 45);
  assert.strictEqual(snapshot.currentStage, 1);
  assert.strictEqual(snapshot.progressStage, 2);
  assert.strictEqual(snapshot.progressCurrent, 45);
  assert.strictEqual(snapshot.progressTarget, 90);
  assert.strictEqual(snapshot.progressRemaining, 45);
  assert.strictEqual(snapshot.nextStage.stage, 2);
  assert.strictEqual(snapshot.nextStage.requiredTotalLevel, 90);
  assert.ok(snapshot.nextStage.beastEffect);

  school.beastIds.slice(0, 9).forEach(id => { progress[id] = { research: DATA.researchThresholds[25] }; });
  snapshot = CORE.schoolSnapshot(school, progress, DATA);
  assert.strictEqual(snapshot.totalLevel, 225);
  assert.strictEqual(snapshot.currentStage, 5);
  assert.strictEqual(snapshot.progressStage, 5);
  assert.strictEqual(snapshot.progressCurrent, 225);
  assert.strictEqual(snapshot.progressTarget, 225);
  assert.strictEqual(snapshot.progressRemaining, 0);
  assert.strictEqual(snapshot.currentEffects.stage, 5);
  assert.strictEqual(snapshot.nextStage, null);
});

test("investment optimizer: minimizes invested count before using owned low ranks", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const progress = CORE.normalizeBeastProgress(beast, {
    research: 0,
    fragments: 0,
    inventory: { none: { 0: 20 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, { targetLevel: 10 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totals.investedCount, 5);
  assert.strictEqual(result.selected.newItems.reduce((total, item) => total + item.count, 0), 5);
  assert.strictEqual(result.selected.ownedItems.length, 0);
});

test("investment optimizer: can ignore all owned inventory for a temporary calculation", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const progress = CORE.normalizeBeastProgress(beast, {
    inventory: { none: { 7: 5 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, {
    targetLevel: 10,
    useOwnedInventory: false
  });
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.selected.ownedItems, []);
  assert.ok(result.selected.newItems.length > 0);
});

test("investment optimizer: respects per-rank owned inventory limits", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const progress = CORE.normalizeBeastProgress(beast, {
    inventory: { none: { 7: 5 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, {
    targetLevel: 15,
    useOwnedInventory: true,
    ownedLimits: { none: { "7": 1 } }
  });
  const used = result.selected.ownedItems.reduce((total, item) => total + item.count, 0);
  assert.ok(used <= 1);
});

test("investment optimizer: prefers checked inventory before overflow when total bodies tie", () => {
  const beast = DATA.beasts.find(item => item.name === "零号白虎");
  const progress = CORE.normalizeBeastProgress(beast, {
    research: 225756,
    fragments: 0,
    inventory: { none: { 6: 1 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, {
    targetLevel: 10,
    useOwnedInventory: true,
    ownedLimits: { none: { "6": 1 } },
    newRankMode: "zeroToSeven",
    preferOwnedOnTie: true
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.selected.ownedItems.some(item => item.rank === 6 && item.count === 1));
  assert.strictEqual(result.totals.investedCount, 2);
  assert.strictEqual(result.totals.newInvestedCount, 1);
});

test("investment optimizer: new rank mode limits new beasts to zero or zero through seven", () => {
  const beast = DATA.beasts.find(item => item.name === "零号白虎");
  const progress = CORE.normalizeBeastProgress(beast, {}, DATA);
  const zeroOnly = CORE.calculateInvestmentPlan(DATA, beast, progress, {
    targetLevel: 10,
    useOwnedInventory: false,
    newRankMode: "zero"
  });
  const zeroToSeven = CORE.calculateInvestmentPlan(DATA, beast, progress, {
    targetLevel: 10,
    useOwnedInventory: false,
    newRankMode: "zeroToSeven"
  });
  assert.ok(zeroOnly.selected.newItems.length > 0);
  assert.ok(zeroOnly.selected.newItems.every(item => item.rank === 0));
  assert.ok(zeroToSeven.selected.newItems.every(item => item.rank >= 0 && item.rank <= 7));
  assert.ok(zeroToSeven.selected.newItems.some(item => item.rank > 0));
});

test("investment optimizer: builds one reusable frontier for all target levels", () => {
  const beast = DATA.beasts.find(item => item.name === "零号白虎");
  const progress = CORE.normalizeBeastProgress(beast, {}, DATA);
  const results = CORE.calculateInvestmentCandidates(DATA, beast, progress, {
    useOwnedInventory: false,
    newRankMode: "zeroToSeven"
  });
  assert.ok(results.length > 1);
  assert.deepStrictEqual(results.map(result => result.target.level),
    Array.from({ length: beast.maxLevel }, (_, index) => index + 1));
  assert.ok(results.every(result => result.valid));
});

test("investment optimizer: folds high ranks for display and uses actual final-item resources", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const progress = CORE.normalizeBeastProgress(beast, {
    research: 0,
    fragments: 0,
    showHighRanks: true,
    inventory: { none: { 10: 1 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, { targetLevel: 15, includeHighRanks: true });
  const high = result.selected.ownedItems.find(item => item.rank === 10);
  assert.ok(high);
  assert.strictEqual(high.sevenRankEquivalent, 8);
  assert.strictEqual(result.totals.investedCount, 1);
  assert.strictEqual(result.totals.awakeningBlueprints, Math.ceil(DATA.researchValues.orange["10"].none / 500));
  assert.strictEqual(result.totals.organPieces, Math.ceil(DATA.researchValues.orange["10"].none / 100));
});

test("investment optimizer: uses modified inventory actual values but only adds zero-mod beasts", () => {
  const beast = DATA.beasts.find(item => item.name === "机关炎傀");
  const progress = CORE.normalizeBeastProgress(beast, {
    research: 0,
    fragments: 0,
    showMods: true,
    inventory: { fullDivine: { 7: 1 } }
  }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, { targetLevel: 15, includeMods: true });
  assert.ok(result.selected.ownedItems.some(item => item.modificationId === "fullDivine"));
  assert.ok(result.selected.newItems.every(item => item.modificationId === "none" && item.rank <= 7));
});

test("investment optimizer: contribution tiers and no-exchange tiers are explicit", () => {
  const orangeThree = DATA.beasts.find(item => item.name === "零号白虎");
  const orangeFive = DATA.beasts.find(item => item.name === "机关鲲鹏");
  const orangeResult = CORE.calculateInvestmentPlan(DATA, orangeThree, CORE.normalizeBeastProgress(orangeThree, {}, DATA), { targetLevel: 1 });
  assert.strictEqual(orangeResult.exchange.available, true);
  assert.strictEqual(orangeResult.exchange.contribution, orangeResult.shortage.fragments * 800);
  assert.strictEqual(orangeResult.exchange.yuan, Math.ceil(orangeResult.exchange.contribution * 0.5));
  const orangeFiveResult = CORE.calculateInvestmentPlan(DATA, orangeFive, CORE.normalizeBeastProgress(orangeFive, {}, DATA), { targetLevel: 1 });
  assert.strictEqual(orangeFiveResult.exchange.available, false);
  assert.ok(orangeFiveResult.shortage.fragments > 0);
});

test("investment optimizer: completed targets produce a zero-cost plan", () => {
  const beast = DATA.beasts.find(item => item.name === "零号白虎");
  const progress = CORE.normalizeBeastProgress(beast, { research: DATA.researchThresholds[10] }, DATA);
  const result = CORE.calculateInvestmentPlan(DATA, beast, progress, { targetLevel: 10 });
  assert.strictEqual(result.totals.investedCount, 0);
  assert.strictEqual(result.totals.research, 0);
  assert.strictEqual(result.shortage.fragments, 0);
});

test("school planner: defaults to the next school stage", () => {
  const school = DATA.schools.find(item => item.id === "hegemonic");
  const progress = {};
  assert.strictEqual(PLANNER.defaultTargetStage(DATA, school, progress), 1);
  progress[school.beastIds[0]] = { research: DATA.researchThresholds[25] };
  progress[school.beastIds[1]] = { research: DATA.researchThresholds[20] };
  assert.strictEqual(PLANNER.defaultTargetStage(DATA, school, progress), 2);
});

test("school planner: maps target stages and keeps excluded beasts in the baseline", () => {
  const school = DATA.schools.find(item => item.id === "hegemonic");
  const progress = {};
  progress[school.beastIds[0]] = { research: DATA.researchThresholds[10] };
  const participating = school.beastIds.slice(1, 4);
  const result = PLANNER.calculateSchoolPlans(DATA, school, progress, {
    targetStage: 1,
    participatingBeastIds: participating,
    useOwnedInventory: false
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.current.totalLevel, 10);
  assert.strictEqual(result.target.totalLevel, 45);
  result.plans.forEach(plan => {
    assert.ok(plan.totals.projectedTotalLevel >= 45);
    assert.ok(!plan.beasts.some(item => item.beastId === school.beastIds[0]));
  });
});

test("school planner: an achieved target returns one merged zero-cost plan", () => {
  const school = DATA.schools.find(item => item.id === "nonAttack");
  const progress = {};
  progress[school.beastIds[0]] = { research: DATA.researchThresholds[25] };
  progress[school.beastIds[1]] = { research: DATA.researchThresholds[20] };
  const result = PLANNER.calculateSchoolPlans(DATA, school, progress, { targetStage: 1 });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.plans.length, 1);
  assert.strictEqual(result.plans[0].kind, "merged");
  assert.strictEqual(result.plans[0].totals.investedCount, 0);
});

test("school planner: high-rank inventory uses seven-rank body equivalents", () => {
  const school = DATA.schools.find(item => item.id === "hegemonic");
  const beastId = school.beastIds.find(id => DATA.beasts.find(item => item.id === id).maxRank >= 10);
  const progress = {};
  progress[beastId] = { inventory: { none: { 10: 1 } }, showHighRanks: true };
  const result = PLANNER.calculateSchoolPlans(DATA, school, progress, {
    targetStage: 1,
    participatingBeastIds: [beastId],
    ownedLimitsByBeast: { [beastId]: { none: { "10": 1 } } },
    allowNewHighRanks: false
  });
  assert.strictEqual(result.valid, false);
  assert.match(result.errors.join(""), /无法达到/);

  const direct = PLANNER.machineBeastCandidates(DATA, DATA.beasts.find(item => item.id === beastId), progress[beastId], {
    useOwnedInventory: true,
    ownedLimits: { none: { "10": 1 } }
  });
  const highRankPlan = direct.find(item => item.items.some(entry => entry.source === "owned" && entry.rank === 10));
  assert.ok(highRankPlan);
  assert.strictEqual(highRankPlan.investedCount, 8);
});

test("school planner: forwards the chosen new-beast rank range", () => {
  const school = DATA.schools.find(item => item.id === "hegemonic");
  const beastId = school.beastIds[0];
  const beast = DATA.beasts.find(item => item.id === beastId);
  const candidates = PLANNER.machineBeastCandidates(DATA, beast, {}, {
    useOwnedInventory: false,
    newRankMode: "zero"
  });
  candidates.forEach(candidate => {
    assert.ok(candidate.items.filter(item => item.source === "new").every(item => item.rank === 0));
  });
});
