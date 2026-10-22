const { test } = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../data/machine-beasts.js");
const CORE = require("./machine-beasts.js");

const orangeOne = DATA.beasts.find(beast => beast.tier === "橙一");
const orangeFive = DATA.beasts.find(beast => beast.tier === "橙五");
const blue = DATA.beasts.find(beast => beast.tier === "蓝色");
const purple = DATA.beasts.find(beast => beast.tier === "紫色");
const data = {
  ...DATA,
  beasts: [orangeOne, orangeFive, blue, purple],
  referenceCostRules: {
    blueprintPrice: 70,
    orangeFiveBodyPrice: 45000,
    contributionPerYuan: 2.7
  }
};

test("reference settings: legacy data receives safe defaults for non-contribution beasts", () => {
  const legacy = { ...data };
  delete legacy.referenceCostRules;
  assert.deepEqual(CORE.normalizeReferenceCostSettings(legacy), {
    awakeningBlueprintStock: 0,
    useAwakeningBlueprintStock: true,
    awakeningBlueprintPrice: 70,
    beastPrices: { [orangeFive.id]: 45000, [blue.id]: null, [purple.id]: null }
  });
});

test("reference settings: data rules provide prices and contribution conversion", () => {
  const configured = { ...data, referenceCostRules: {
    blueprintPrice: 64, orangeFiveBodyPrice: 40000, contributionPerYuan: 3
  } };
  const result = CORE.calculateReferenceCost(configured, {
    awakeningBlueprints: 1,
    beasts: [{ beastId: orangeOne.id, fragments: 1 }, { beastId: orangeFive.id, fragments: 20 }]
  });
  assert.equal(result.blueprints.unitPrice, 64);
  assert.equal(result.beasts[0].yuan, 200);
  assert.equal(result.beasts[1].yuan, 20000);
  assert.equal(result.totalYuan, 20264);
});

test("reference settings: accepts zero and numeric inputs, floors stock, excludes unrelated keys", () => {
  const result = CORE.normalizeReferenceCostSettings(data, {
    awakeningBlueprintStock: "5.9",
    useAwakeningBlueprintStock: false,
    awakeningBlueprintPrice: "0",
    beastPrices: { [blue.id]: "12.5", [orangeFive.id]: 0, [orangeOne.id]: 10, missing: 20 },
    unrelated: true
  });
  assert.deepEqual(result, {
    awakeningBlueprintStock: 5,
    useAwakeningBlueprintStock: false,
    awakeningBlueprintPrice: 0,
    beastPrices: { [orangeFive.id]: 0, [blue.id]: 12.5, [purple.id]: null }
  });
});

test("reference settings: invalid prices remain missing rather than free or default orange-five", () => {
  for (const price of [null, "", " ", -1, Infinity, NaN, "invalid", true, {}, []]) {
    const normalized = CORE.normalizeReferenceCostSettings(data, {
      awakeningBlueprintStock: -5,
      beastPrices: { [orangeFive.id]: price, [blue.id]: price }
    });
    assert.equal(normalized.awakeningBlueprintStock, 0);
    assert.equal(normalized.beastPrices[orangeFive.id], null);
    assert.equal(normalized.beastPrices[blue.id], null);
  }
  for (const stock of [Infinity, NaN, "invalid", null, true, {}, []]) {
    assert.equal(CORE.normalizeReferenceCostSettings(data, { awakeningBlueprintStock: stock }).awakeningBlueprintStock, 0);
  }
});

test("reference cost: default blueprints cost 70 each without stock", () => {
  assert.deepEqual(CORE.calculateReferenceCost(data, { awakeningBlueprints: 3, beasts: [] }), {
    complete: true,
    totalYuan: 210,
    knownYuan: 210,
    blueprints: { required: 3, usedStock: 0, missing: 3, unitPrice: 70, yuan: 210 },
    beasts: [],
    missingPrices: []
  });
});

test("reference cost: uses stock once per alternative without consuming the saved stock", () => {
  const settings = { awakeningBlueprintStock: 2, awakeningBlueprintPrice: 64 };
  const first = CORE.calculateReferenceCost(data, { awakeningBlueprints: 3 }, settings);
  const second = CORE.calculateReferenceCost(data, { awakeningBlueprints: 5 }, settings);
  assert.deepEqual(first.blueprints, { required: 3, usedStock: 2, missing: 1, unitPrice: 64, yuan: 64 });
  assert.deepEqual(second.blueprints, { required: 5, usedStock: 2, missing: 3, unitPrice: 64, yuan: 192 });
  assert.equal(settings.awakeningBlueprintStock, 2);
});

test("reference cost: disabling stock leaves the whole blueprint requirement payable", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 3 }, {
    awakeningBlueprintStock: 8, useAwakeningBlueprintStock: false
  });
  assert.deepEqual(result.blueprints, { required: 3, usedStock: 0, missing: 3, unitPrice: 70, yuan: 210 });
});

test("reference cost: surplus stock never creates a negative deficit or cost", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 3 }, { awakeningBlueprintStock: 8 });
  assert.deepEqual(result.blueprints, { required: 3, usedStock: 3, missing: 0, unitPrice: 70, yuan: 0 });
  assert.equal(result.totalYuan, 0);
});

test("reference cost: custom blueprint prices round payable yuan upward", () => {
  const preset = CORE.calculateReferenceCost(data, { awakeningBlueprints: 2 }, { awakeningBlueprintPrice: 134 });
  const custom = CORE.calculateReferenceCost(data, { awakeningBlueprints: 2 }, { awakeningBlueprintPrice: 1.2 });
  assert.equal(preset.totalYuan, 268);
  assert.equal(custom.totalYuan, 3);
});

test("reference cost: decimal blueprint prices preserve exact whole-yuan boundaries", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 100 }, { awakeningBlueprintPrice: 1.1 });
  assert.equal(result.blueprints.yuan, 110);
  assert.equal(result.totalYuan, 110);
});

test("reference cost: decimal rounding never discards a genuine fractional yuan", () => {
  const blueprint = CORE.calculateReferenceCost(data, { awakeningBlueprints: 1 }, {
    awakeningBlueprintPrice: 1.0000000000000002
  });
  assert.equal(blueprint.blueprints.yuan, 2);
  const partialBody = CORE.calculateReferenceCost(data, {
    beasts: [{ beastId: orangeFive.id, fragments: 11 }]
  }, { beastPrices: { [orangeFive.id]: 45001 } });
  assert.equal(partialBody.beasts[0].yuan, 12376);
  const manual = CORE.calculateReferenceCost(data, {
    beasts: [{ beastId: blue.id, fragments: 10 }]
  }, { beastPrices: { [blue.id]: 1.0000000000000002 } });
  assert.equal(manual.beasts[0].yuan, 2);
});

test("reference cost: scientific-notation prices use the same exact decimal rounding", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 10000000 }, {
    awakeningBlueprintPrice: 1e-7
  });
  assert.equal(result.totalYuan, 1);
});

test("reference cost: invalid blueprint prices remain incomplete unless stock covers the deficit", () => {
  for (const price of [null, "", -1, Infinity, "invalid"]) {
    const missing = CORE.calculateReferenceCost(data, { awakeningBlueprints: 2 }, { awakeningBlueprintPrice: price });
    assert.equal(missing.complete, false);
    assert.equal(missing.blueprints.unitPrice, null);
    assert.equal(missing.blueprints.yuan, null);
    assert.equal(missing.totalYuan, null);
    assert.equal(missing.knownYuan, 0);
    const covered = CORE.calculateReferenceCost(data, { awakeningBlueprints: 2 }, {
      awakeningBlueprintPrice: price, awakeningBlueprintStock: 2
    });
    assert.equal(covered.complete, true);
    assert.equal(covered.totalYuan, 0);
  }
});

test("reference cost: 600 contribution becomes 223 yuan, not 300", () => {
  const legacy = { ...data };
  delete legacy.referenceCostRules;
  const result = CORE.calculateReferenceCost(legacy, { beasts: [{ beastId: orangeOne.id, fragments: 1 }] });
  assert.deepEqual(result.beasts[0], {
    beastId: orangeOne.id, beastName: orangeOne.name, fragments: 1,
    bodyEquivalent: 0.025, unitPrice: null, contribution: 600, yuan: 223
  });
  assert.equal(result.totalYuan, 223);
});

test("reference cost: whole-yuan contribution boundaries do not gain an extra yuan", () => {
  const result = CORE.calculateReferenceCost(data, { beasts: [{ beastId: orangeOne.id, fragments: 27 }] });
  assert.equal(result.beasts[0].contribution, 16200);
  assert.equal(result.beasts[0].yuan, 6000);
  assert.equal(result.totalYuan, 6000);
});

test("reference cost: full and partial orange-five deficits use the body price without rounding bodies", () => {
  for (const [fragments, bodyEquivalent, yuan] of [[40, 1, 45000], [20, 0.5, 22500]]) {
    const result = CORE.calculateReferenceCost(data, { beasts: [{ beastId: orangeFive.id, fragments }] });
    assert.deepEqual(result.beasts[0], {
      beastId: orangeFive.id, beastName: orangeFive.name, fragments,
      bodyEquivalent, unitPrice: 45000, contribution: null, yuan
    });
    assert.equal(result.totalYuan, yuan);
  }
});

test("reference cost: 11 orange-five fragments cost exactly 12375 yuan", () => {
  const result = CORE.calculateReferenceCost(data, { beasts: [{ beastId: orangeFive.id, fragments: 11 }] });
  assert.equal(result.beasts[0].bodyEquivalent, 0.275);
  assert.equal(result.beasts[0].yuan, 12375);
  assert.equal(result.totalYuan, 12375);
});

test("reference cost: explicit zero prices are valid and missing manual prices keep a known subtotal", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 2, beasts: [
    { beastId: orangeFive.id, fragments: 40 },
    { beastId: blue.id, fragments: 5 },
    { beastId: purple.id, fragments: 20 }
  ] }, { awakeningBlueprintPrice: 0, beastPrices: { [orangeFive.id]: 0, [purple.id]: 101 } });
  assert.equal(result.complete, false);
  assert.equal(result.totalYuan, null);
  assert.equal(result.knownYuan, 101);
  assert.equal(result.beasts[0].yuan, 0);
  assert.equal(result.beasts[1].unitPrice, null);
  assert.equal(result.beasts[1].yuan, null);
  assert.deepEqual(result.missingPrices, [{ beastId: blue.id, beastName: blue.name }]);
});

test("reference cost: an explicitly cleared orange-five price does not restore the default", () => {
  const result = CORE.calculateReferenceCost(data, { beasts: [{ beastId: orangeFive.id, fragments: 1 }] }, {
    beastPrices: { [orangeFive.id]: null }
  });
  assert.equal(result.complete, false);
  assert.equal(result.beasts[0].unitPrice, null);
  assert.equal(result.beasts[0].yuan, null);
  assert.equal(result.totalYuan, null);
});

test("reference cost: duplicate deficits aggregate before contribution and manual-price rounding", () => {
  const result = CORE.calculateReferenceCost(data, { beasts: [
    { beastId: orangeOne.id, fragments: 1 },
    { beastId: blue.id, fragments: 1 },
    { beastId: orangeOne.id, fragments: 1 },
    { beastId: blue.id, fragments: 1 }
  ] }, { beastPrices: { [blue.id]: 1 } });
  assert.equal(result.beasts.length, 2);
  assert.equal(result.beasts[0].fragments, 2);
  assert.equal(result.beasts[0].contribution, 1200);
  assert.equal(result.beasts[0].yuan, 445);
  assert.equal(result.beasts[1].bodyEquivalent, 0.2);
  assert.equal(result.beasts[1].yuan, 1);
  assert.equal(result.totalYuan, 446);
});

test("reference cost: zero deficits need no beast price", () => {
  const result = CORE.calculateReferenceCost(data, { beasts: [
    { beastId: blue.id, fragments: 0 }, { beastId: orangeFive.id, fragments: 0 }
  ] }, { beastPrices: { [orangeFive.id]: null } });
  assert.equal(result.complete, true);
  assert.equal(result.totalYuan, 0);
  assert.deepEqual(result.missingPrices, []);
  assert.deepEqual(result.beasts.map(beast => beast.yuan), [0, 0]);
});

test("reference cost: unknown beast deficits are identifiable and never counted as free", () => {
  const result = CORE.calculateReferenceCost(data, { awakeningBlueprints: 1, beasts: [
    { beastId: "unknown-beast", fragments: 10 }
  ] }, { beastPrices: { "unknown-beast": 100 } });
  assert.equal(result.complete, false);
  assert.equal(result.totalYuan, null);
  assert.equal(result.knownYuan, 70);
  assert.equal(result.beasts[0].yuan, null);
  assert.deepEqual(result.missingPrices, [{ beastId: "unknown-beast", beastName: "unknown-beast" }]);
});

test("reference cost: negative and nonfinite requirements cannot create negative or nonfinite costs", () => {
  for (const value of [-2, Infinity, NaN, "invalid", null, true, {}, []]) {
    const result = CORE.calculateReferenceCost(data, {
      awakeningBlueprints: value, beasts: [{ beastId: blue.id, fragments: value }]
    });
    assert.equal(result.totalYuan, 0);
    assert.equal(result.blueprints.required, 0);
    assert.equal(result.beasts[0].fragments, 0);
  }
  assert.equal(CORE.calculateReferenceCost(data, null).totalYuan, 0);
});

test("reference cost: neither normalization nor calculations mutate data, settings, or requirements", () => {
  const requirements = { awakeningBlueprints: 3, beasts: [
    { beastId: orangeFive.id, fragments: 20 }, { beastId: blue.id, fragments: 2 }
  ] };
  const settings = { awakeningBlueprintStock: 2, beastPrices: { [blue.id]: 120 } };
  const before = JSON.stringify({ data, settings, requirements });
  const normalized = CORE.normalizeReferenceCostSettings(data, settings);
  normalized.beastPrices[blue.id] = 1;
  CORE.calculateReferenceCost(data, requirements, settings);
  CORE.calculateReferenceCost(data, requirements, settings);
  assert.equal(JSON.stringify({ data, settings, requirements }), before);
});
