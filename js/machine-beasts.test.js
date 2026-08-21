const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/machine-beasts.js");

test("machine beast data: detailed names, schools and stage effects stay complete", () => {
  assert.strictEqual(DATA.beasts.length, 27);
  assert.strictEqual(new Set(DATA.beasts.map(item => item.id)).size, 27);
  assert.strictEqual(new Set(DATA.beasts.map(item => item.name)).size, 27);
  assert.deepStrictEqual(DATA.schools.map(item => item.id), ["hegemonic", "nonAttack"]);
  DATA.schools.forEach(school => {
    assert.strictEqual(school.stages.length, 5);
    assert.strictEqual(school.stages[0].requiredTotalLevel, 45);
    assert.deepStrictEqual(school.stages.slice(1).map(stage => stage.requiredTotalLevel), [null, null, null, null]);
    school.stages.forEach(stage => {
      assert.ok(stage.factionBonus);
      assert.ok(stage.formationEffect);
      assert.ok(stage.beastEffect);
    });
  });
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
