const { test } = require("node:test");
const assert = require("node:assert/strict");
const DATA = require("../data/machine-beasts.js");
const CORE = require("./machine-beasts.js");

const orangeOne = DATA.beasts.find(beast => beast.tier === "橙一");
const orangeFive = DATA.beasts.find(beast => beast.tier === "橙五");
const blue = DATA.beasts.find(beast => beast.tier === "蓝色");
const purple = DATA.beasts.find(beast => beast.tier === "紫色");

test("school cost: blue-purple inventory restriction defaults on and preserves an explicit opt-out", () => {
  assert.equal(CORE.normalizeReferenceCostSettings(DATA, {}).bluePurpleInventoryOnly, true);
  assert.equal(CORE.normalizeReferenceCostSettings(DATA, { bluePurpleInventoryOnly: false }).bluePurpleInventoryOnly, false);
});

test("school cost: nine orange-one bodies merge before rounding to 80000 yuan", () => {
  const result = CORE.calculateSchoolReferenceCost(DATA, {
    beasts: Array.from({ length: 9 }, () => ({ beastId: orangeOne.id, fragments: 40 }))
  });
  assert.equal(result.complete, true);
  assert.equal(result.beasts.length, 1);
  assert.equal(result.beasts[0].contribution, 216000);
  assert.equal(result.totalYuan, 80000);
});

test("school cost: a body with thirty saved fragments charges only the ten-fragment deficit", () => {
  // The caller subtracts its saved thirty fragments before passing resource deficits.
  const result = CORE.calculateSchoolReferenceCost(DATA, {
    beasts: [{ beastId: orangeOne.id, fragments: 10 }]
  });
  assert.equal(result.beasts[0].fragments, 10);
  assert.equal(result.totalYuan, 2223);
});

test("school cost: 192 blueprints share a single stock deduction of 100", () => {
  const settings = { awakeningBlueprintStock: 100 };
  const result = CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: 192 }, settings);
  assert.deepEqual(result.blueprints, { required: 192, usedStock: 100, missing: 92, unitPrice: 70, yuan: 6440 });
  assert.equal(result.totalYuan, 6440);
  assert.equal(settings.awakeningBlueprintStock, 100);
});

test("school cost: orange-five partial bodies use actual fragment deficits and personal prices", () => {
  const requirements = { beasts: [{ beastId: orangeFive.id, fragments: 20 }] };
  assert.equal(CORE.calculateSchoolReferenceCost(DATA, requirements).totalYuan, 22500);
  assert.equal(CORE.calculateSchoolReferenceCost(DATA, requirements, {
    beastPrices: { [orangeFive.id]: 30001 }
  }).totalYuan, 15001);
});

test("school cost: blue-purple acquisition stays unpriced while blueprints remain payable", () => {
  const result = CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: 48, beasts: [
    { beastId: blue.id, fragments: 10 }, { beastId: purple.id, fragments: 40 }
  ] }, { beastPrices: { [blue.id]: 99999, [purple.id]: 88888 } });
  assert.equal(result.complete, true);
  assert.equal(result.totalYuan, 3360);
  assert.equal(result.knownYuan, 3360);
  assert.deepEqual(result.missingPrices, []);
  assert.deepEqual(result.beasts.map(beast => beast.yuan), [null, null]);
  assert.deepEqual(result.unpricedResources.map(resource => resource.beastId), [blue.id, purple.id]);
  assert.ok(result.unpricedResources.every(resource => resource.reason === "蓝紫本体获取成本未计入"));
});

test("school cost: huge ignored blue-purple prices cannot erase small blueprint charges", () => {
  const result = CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: 1, beasts: [
    { beastId: blue.id, fragments: 10 }, { beastId: purple.id, fragments: 20 }
  ] }, { beastPrices: { [blue.id]: 1e20, [purple.id]: 1e20 } });
  assert.equal(result.knownYuan, 70);
  assert.equal(result.totalYuan, 70);
  assert.equal(result.blueprints.yuan, 70);
  assert.equal(result.unpricedResources.length, 2);
});

test("school cost: missing orange-five or blueprint prices stay incomplete rather than zero", () => {
  const result = CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: 1, beasts: [
    { beastId: orangeFive.id, fragments: 20 }, { beastId: blue.id, fragments: 10 }
  ] }, { beastPrices: { [orangeFive.id]: null } });
  assert.equal(result.complete, false);
  assert.equal(result.totalYuan, null);
  assert.equal(result.knownYuan, 70);
  assert.equal(result.beasts.find(beast => beast.beastId === orangeFive.id).yuan, null);
  assert.deepEqual(result.missingPrices, [{ beastId: orangeFive.id, beastName: orangeFive.name }]);
  const missingBlueprint = CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: 1 }, {
    awakeningBlueprintPrice: null
  });
  assert.equal(missingBlueprint.complete, false);
  assert.equal(missingBlueprint.blueprints.yuan, null);
});

test("school cost: decimal contribution factors do not introduce a spurious yuan", () => {
  const data = { ...DATA, beasts: [{ ...orangeOne, contributionPerFragment: 0.1 }],
    referenceCostRules: { ...DATA.referenceCostRules, contributionPerYuan: 0.1 } };
  assert.equal(CORE.calculateSchoolReferenceCost(data, {
    beasts: [{ beastId: orangeOne.id, fragments: 3 }]
  }).totalYuan, 3);
});

test("school cost: exact decimal and tiny positive prices retain the real fractional yuan", () => {
  for (const [count, price, expected] of [[100, 1.1, 110], [1, 1e-20, 1], [1, 1.0000000000000002, 2]]) {
    assert.equal(CORE.calculateSchoolReferenceCost(DATA, { awakeningBlueprints: count }, {
      awakeningBlueprintPrice: price
    }).totalYuan, expected);
  }
  assert.equal(CORE.calculateSchoolReferenceCost(DATA, {
    beasts: [{ beastId: orangeFive.id, fragments: 1 }]
  }, { beastPrices: { [orangeFive.id]: 1e-20 } }).totalYuan, 1);
});

test("school cost: zero deficits do not report unpriced resources or mutate caller inputs", () => {
  const requirements = { awakeningBlueprints: 0, beasts: [{ beastId: blue.id, fragments: 0 }] };
  const settings = { beastPrices: { [blue.id]: 123 }, bluePurpleInventoryOnly: false };
  const before = JSON.stringify({ requirements, settings, data: DATA });
  const result = CORE.calculateSchoolReferenceCost(DATA, requirements, settings);
  assert.deepEqual(result.unpricedResources, []);
  assert.equal(result.totalYuan, 0);
  assert.equal(JSON.stringify({ requirements, settings, data: DATA }), before);
});

test("school cost: legacy single-beast cost still charges explicit blue-purple body prices", () => {
  const requirements = { beasts: [{ beastId: blue.id, fragments: 10 }] };
  assert.equal(CORE.calculateReferenceCost(DATA, requirements, { beastPrices: { [blue.id]: 123 } }).totalYuan, 123);
  assert.equal(CORE.calculateReferenceCost(DATA, requirements).complete, false);
  assert.equal(CORE.calculateSchoolReferenceCost(DATA, requirements).complete, true);
});
