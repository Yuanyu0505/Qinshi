const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/wooden-man-alley.js");
const CORE = require("./wooden-man-alley.js");
const PLANNER = require("./wooden-man-alley-planner.js");

function progress(overrides = {}) {
  return CORE.normalizeProgress(Object.assign({ currentFloor: 1 }, overrides), DATA);
}

test("applies all risk modes and rounds conservative demand once", () => {
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "expected"), 12.2);
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "conservative"), 15);
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "worst"), 25);
  assert.strictEqual(PLANNER.applyRisk(4.1 + 4.1, 18, "conservative"), 10);
});

test("plans every shortcut and arbitrary targets", () => {
  [75, 180, 230, 300, 330, 500, 222].forEach(targetFloor => {
    const result = PLANNER.planToTarget({ progress: progress(), targetFloor, risk: "expected" }, DATA, CORE);
    assert.strictEqual(result.targetFloor, targetFloor);
    assert.ok(result.demand.expected > 0);
    assert.ok(result.stages.length > 0);
  });
});

test("uses the actual partial board for the current floor", () => {
  const result = PLANNER.planToTarget({
    progress: progress({ currentFloor: 1, openedCells: [0, 1, 2, 3, 4, 5, 6, 7] }),
    targetFloor: 1,
    risk: "expected"
  }, DATA, CORE);
  assert.strictEqual(result.demand.expected, 1);
  assert.strictEqual(result.demand.conservative, 2);
  assert.strictEqual(result.demand.worst, 1);
});

test("current-floor line tools use the real unopened-cell geometry", () => {
  const result = PLANNER.planToTarget({
    progress: progress({
      currentFloor: 1,
      openedCells: [1, 2, 3, 5, 6, 7],
      resources: { horizontalQi: 1 }
    }),
    targetFloor: 1,
    risk: "expected"
  }, DATA, CORE);
  assert.strictEqual(result.demand.expected, 1);
  assert.strictEqual(result.demand.worst, 2);
});

test("repeated line tools use diminishing conditional benefit", () => {
  const result = PLANNER.planToTarget({
    progress: progress({ resources: { horizontalQi: 2 } }),
    targetFloor: 1,
    risk: "expected"
  }, DATA, CORE);
  assert.ok(Math.abs(result.demand.expected - (2 / 3)) < 1e-9);
  assert.strictEqual(result.demand.conservative, 1);
  assert.strictEqual(result.demand.worst, 3);
});

test("honors stage limits and places equal-value tools in higher floors", () => {
  const saved = progress({ resources: { mirror: 4, horizontalQi: 10 } });
  const limits = CORE.normalizeStageLimits({}, DATA);
  limits["floor-1-50"].horizontalQi.allowed = false;
  limits["floor-331-500"].mirror.max = 4;
  const result = PLANNER.planToTarget({
    progress: saved,
    targetFloor: 334,
    risk: "expected",
    stageLimits: limits
  }, DATA, CORE);
  const first = result.stages.find(stage => stage.tierId === "floor-1-50");
  const last = result.stages.find(stage => stage.tierId === "floor-331-500");
  assert.strictEqual(first.tools.horizontalQi || 0, 0);
  assert.strictEqual(last.tools.mirror, 4);
});

test("rejects a target below current progress and handles floor 500 complete", () => {
  const invalid = PLANNER.planToTarget({ progress: progress({ currentFloor: 100 }), targetFloor: 99 }, DATA, CORE);
  assert.match(invalid.error, /不能低于/);
  const complete = PLANNER.planToTarget({ progress: progress({ currentFloor: 500, completedAllFloors: true }), targetFloor: 500 }, DATA, CORE);
  assert.strictEqual(complete.achievable, true);
  assert.strictEqual(complete.demand.selected, 0);
});

test("reverse planning reports completed floor and partial next floor", () => {
  const result = PLANNER.planReachable({
    progress: progress({ resources: { woodSword: 1 } }),
    risk: "expected"
  }, DATA, CORE);
  assert.strictEqual(result.completedFloor, 0);
  assert.strictEqual(result.nextFloor, 1);
  assert.strictEqual(result.expectedBrokenOnNextFloor, 1);
});

test("purchase plans price coupons and obey package limits", () => {
  const saved = progress({
    resources: { ingots: 10000, discountCoupon: 1 },
    packages: {
      small: { limit: 1, purchased: 0 },
      value: { limit: 1, purchased: 0 },
      pioneer: { limit: 1, purchased: 0 },
      luxury: { limit: 1, purchased: 0 }
    }
  });
  const plans = PLANNER.planPurchases(50, {
    progress: saved,
    resources: saved.resources,
    packages: saved.packages,
    includePurchasablePackages: true
  }, DATA);
  assert.strictEqual(plans.zeroPaid.ingotsRequired, 9900);
  assert.strictEqual(plans.minimumRmb.rmb, 0);
  assert.strictEqual(plans.minimumIngot.ingotsRequired, 0);
  assert.deepStrictEqual(plans.minimumIngot.packages, { pioneer: 1 });
  assert.strictEqual(plans.minimumIngot.mysteryBoxes, 6);
});

test("packages are excluded by default and unknown boxes add no swords", () => {
  const saved = progress({ resources: { ingots: 0 }, packages: { luxury: { swords: 0, mysteryBoxes: 999, limit: 1, purchased: 0 } } });
  const plans = PLANNER.planPurchases(1, { progress: saved, includePurchasablePackages: false }, DATA);
  assert.strictEqual(plans.packagesIncluded, false);
  assert.strictEqual(plans.minimumRmb, null);
  assert.strictEqual(plans.zeroPaid.feasible, false);
});

test("purchase planning normalizes invalid package values", () => {
  const plans = PLANNER.planPurchases(1, {
    progress: progress({ resources: { ingots: 0 } }),
    packages: { small: { price: null, swords: "", limit: 1, purchased: 0 } },
    includePurchasablePackages: true
  }, DATA);
  assert.strictEqual(plans.minimumIngot.rmb, 68);
  assert.strictEqual(plans.minimumIngot.swordsFromPackages, 30);
});

test("large package limits are bounded by needed swords", () => {
  const packages = CORE.normalizePackages({
    small: { limit: 1000000, purchased: 0 },
    value: { limit: 0 }, pioneer: { limit: 0 }, luxury: { limit: 0 }
  }, DATA);
  const plans = PLANNER.planPurchases(61, {
    progress: progress({ resources: { ingots: 0 } }),
    packages,
    includePurchasablePackages: true
  }, DATA);
  assert.deepStrictEqual(plans.minimumIngot.packages, { small: 3 });
});

test("forward planning settles ingots and coupons for the selected purchase plan", () => {
  const result = PLANNER.planToTarget({
    progress: progress({ resources: { ingots: 1800 } }),
    targetFloor: 1,
    risk: "worst"
  }, DATA, CORE);
  assert.strictEqual(result.achievable, true);
  assert.strictEqual(result.remaining.ingots, 0);
  assert.strictEqual(result.remaining.woodSword, 0);
});

test("reverse planning includes auxiliary tools in partial progress", () => {
  const result = PLANNER.planReachable({
    progress: progress({ resources: { bomb: 1 } }),
    risk: "worst"
  }, DATA, CORE);
  assert.strictEqual(result.completedFloor, 0);
  assert.strictEqual(result.nextFloor, 1);
  assert.strictEqual(result.expectedBrokenOnNextFloor, 5);
});

test("reverse planning returns resources after completed-floor purchases", () => {
  const result = PLANNER.planReachable({
    progress: progress({ resources: { ingots: 1800 } }),
    risk: "worst"
  }, DATA, CORE);
  assert.strictEqual(result.completedFloor, 1);
  assert.strictEqual(result.remaining.ingots, 0);
});
