const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/wooden-man-alley.js");
const CORE = require("./wooden-man-alley.js");

test("resolves every floor boundary", () => {
  const cases = [
    [1, 3, 9, 1, 1], [50, 3, 9, 1, 1],
    [51, 4, 16, 2, 1], [130, 4, 16, 2, 1],
    [131, 5, 25, 3, 2], [230, 5, 25, 3, 2],
    [231, 6, 36, 4, 2], [330, 6, 36, 4, 2],
    [331, 6, 36, 4, 2], [500, 6, 36, 4, 2]
  ];
  cases.forEach(([floor, size, cells, iron, qi]) => {
    const tier = CORE.tierForFloor(floor, DATA);
    assert.strictEqual(tier.boardSize, size);
    assert.strictEqual(CORE.boardCellCount(floor, DATA), cells);
    assert.strictEqual(tier.toolCosts.ironSword, iron);
    assert.strictEqual(tier.toolCosts.horizontalQi, qi);
    assert.strictEqual(tier.toolCosts.verticalQi, qi);
    assert.strictEqual(tier.toolCosts.crossQi, qi);
  });
  assert.throws(() => CORE.tierForFloor(0, DATA), /1.*500/);
  assert.throws(() => CORE.tierForFloor(501, DATA), /1.*500/);
});

test("normalizes corrupt progress safely", () => {
  const normalized = CORE.normalizeProgress({
    currentFloor: "bad",
    openedCells: [0, 0, 8, 9, -1, "2"],
    resources: { woodSword: -5, ironSword: "4.8", ingots: "1000" },
    packages: { small: { price: -1, swords: "31", mysteryBoxes: "3", limit: 2, purchased: 1 } },
    calculator: { risk: "worst" }
  }, DATA);
  assert.strictEqual(normalized.schemaVersion, 1);
  assert.strictEqual(normalized.currentFloor, 1);
  assert.deepStrictEqual(normalized.openedCells, [0, 2, 8]);
  assert.strictEqual(normalized.resources.woodSword, 0);
  assert.strictEqual(normalized.resources.ironSword, 4);
  assert.strictEqual(normalized.resources.ingots, 1000);
  assert.strictEqual(normalized.packages.small.price, 0);
  assert.strictEqual(normalized.packages.small.swords, 31);
  assert.strictEqual(normalized.packages.value.swords, 40);
  assert.strictEqual(normalized.calculator.risk, "worst");
});

test("clamps package purchase counts", () => {
  const normalized = CORE.normalizeProgress({
    packages: {
      small: { limit: 1, purchased: 5 },
      value: { limit: -2, purchased: 1 },
      pioneer: null
    }
  }, DATA);
  assert.strictEqual(normalized.packages.small.purchased, 1);
  assert.strictEqual(normalized.packages.value.limit, 0);
  assert.strictEqual(normalized.packages.value.purchased, 0);
  assert.strictEqual(normalized.packages.pioneer.limit, 1);
});

test("advances and resets a completed floor", () => {
  const current = CORE.normalizeProgress({ currentFloor: 50, openedCells: [0, 1, 2], resources: { woodSword: 12 } }, DATA);
  const next = CORE.advanceFloor(current, DATA);
  assert.strictEqual(next.currentFloor, 51);
  assert.deepStrictEqual(next.openedCells, []);
  assert.strictEqual(next.completedAllFloors, false);
  assert.strictEqual(next.resources.woodSword, 12);
});

test("stops after floor 500", () => {
  const completed = CORE.advanceFloor(CORE.normalizeProgress({ currentFloor: 500, openedCells: [0] }, DATA), DATA);
  assert.strictEqual(completed.currentFloor, 500);
  assert.strictEqual(completed.completedAllFloors, true);
  assert.deepStrictEqual(completed.openedCells, []);
});

test("remaining days tolerates invalid dates", () => {
  assert.strictEqual(CORE.remainingDays("", new Date("2026-09-28T00:00:00+08:00")), null);
  assert.strictEqual(CORE.remainingDays("invalid", new Date("2026-09-28T00:00:00+08:00")), null);
  assert.strictEqual(CORE.remainingDays("2026-09-30", new Date("2026-09-28T12:00:00+08:00")), 2);
});
