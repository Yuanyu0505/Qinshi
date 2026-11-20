const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/wooden-man-alley.js");
const CORE = require("./wooden-man-alley.js");
const PLANNER = require("./wooden-man-alley-planner.js");

function progress(overrides = {}) {
  return CORE.normalizeProgress(Object.assign({ currentFloor: 1 }, overrides), DATA);
}

test("a non-greedy line order covers all five remaining cells", () => {
  const saved = progress({ openedCells: [1, 3, 5, 7], resources: { horizontalQi: 1, verticalQi: 2 } });
  const result = PLANNER.planToTarget({ progress: saved, targetFloor: 1, risk: "worst" }, DATA, CORE);
  assert.strictEqual(result.achievable, true);
  assert.strictEqual(result.demand.worst, 0);
  assert.strictEqual(result.currentFloorAdvice.recommendation.position.row, 1);
});

test("bomb first branches on all 126 four-cell remainders; line first is better", () => {
  const input = { progress: progress({ resources: { bomb: 1, horizontalQi: 1 } }), risk: "worst" };
  let sum = 0, worst = 0, cases = 0;
  for (let a=0;a<9;a++) for (let b=a+1;b<9;b++) for (let c=b+1;c<9;c++) for (let d=c+1;d<9;d++) {
    const counts = [0,0,0];
    [a,b,c,d].forEach(cell => counts[Math.floor(cell/3)]++);
    const remain = 4 - Math.max(...counts);
    sum += remain / 9 * (remain + 1) / 2;
    worst = Math.max(remain,worst);
    cases++;
  }
  assert.strictEqual(cases,126);
  assert.ok(Math.abs(sum/cases-19/63)<1e-12);
  const bombFirst = PLANNER.evaluateSmallBoardPolicy({ ...input, firstToolId:"bomb" }, DATA, CORE);
  const lineFirst = PLANNER.evaluateSmallBoardPolicy({ ...input, firstToolId:"horizontalQi" }, DATA, CORE);
  assert.ok(Math.abs(bombFirst.expected-sum/cases)<1e-12);
  assert.strictEqual(bombFirst.worst,worst);
  assert.strictEqual(lineFirst.worst,1);
  assert.ok(Math.abs(lineFirst.expected-1/9)<1e-12);
  const result = PLANNER.planToTarget({ ...input, targetFloor:1 }, DATA, CORE);
  assert.strictEqual(result.currentFloorAdvice.recommendation.toolId,"horizontalQi");
  assert.strictEqual(result.usesBombModel,true);
});

test("scope caps also constrain the official current-floor recommendation", () => {
  for (const limit of [{ allowed:false }, { max:0 }]) {
    const result=PLANNER.planToTarget({ progress:progress({resources:{horizontalQi:1}}),targetFloor:1,
      stageLimits:{"floor-1-50":{horizontalQi:limit}} }, DATA, CORE);
    assert.ok(!result.currentFloorAdvice.actions.some(action=>action.toolId==="horizontalQi"));
    assert.strictEqual(result.currentFloorAdvice.recommendation,null);
    assert.strictEqual(result.stages[0].tools.horizontalQi,undefined);
  }
});

test("an exhaustively solved bomb model can certify a shortage that a loose coverage bound misses", () => {
  const result = PLANNER.planToTarget({
    progress: progress({currentFloor:51,openedCells:[0,4,8,12],resources:{bomb:1,horizontalQi:1,woodSword:3}}),
    targetFloor:51,risk:"worst"
  }, DATA, CORE);
  assert.strictEqual(result.planningMethod,"exact");
  assert.strictEqual(result.usesBombModel,true);
  assert.strictEqual(result.demand.worst,4);
  assert.strictEqual(result.demand.lowerBound,4);
  assert.strictEqual(result.feasibilityStatus,"insufficient");
  assert.strictEqual(result.achievable,false);
});

test("an exhausted stage cap is not reset when reporting partial next-floor progress", () => {
  const result=PLANNER.planReachable({progress:progress({resources:{horizontalQi:2,woodSword:6}}),risk:"worst",
      stageLimits:{"floor-1-50":{horizontalQi:{max:1}}}}, DATA, CORE);
  assert.strictEqual(result.completedFloor,1);
  assert.strictEqual(result.brokenOnNextFloor,0);
  assert.strictEqual(result.remaining.horizontalQi,1);
  assert.strictEqual(result.upperBoundFloor,1);
});

// Independent benchmark: try each physical tool use on the remaining set,
// without using the production planner's row/column pairing theorem.
function coverageOracle(size) {
  const memo = new Map();
  function solve(cells, h, v, cross) {
    const key = [cells.join("."),h,v,cross].join("/");
    if (memo.has(key)) return memo.get(key);
    let answer = cells.length;
    function take(remainder, a, b, c) {
      if (remainder.length < cells.length) answer = Math.min(answer,solve(remainder,a,b,c));
    }
    for (let i=0;i<size&&answer;i++) {
      if (h) take(cells.filter(cell=>Math.floor(cell/size)!==i),h-1,v,cross);
      if (v) take(cells.filter(cell=>cell%size!==i),h,v-1,cross);
      if (cross) for (let j=0;j<size&&answer;j++) {
        take(cells.filter(cell=>Math.floor(cell/size)!==i&&cell%size!==j),h,v,cross-1);
      }
    }
    memo.set(key,answer);
    return answer;
  }
  return solve;
}

test("deterministic covering agrees with independent 3x3 exhaustive and 4x4 sampled physical search", () => {
  for (const [size,floor,samples] of [[3,1,512],[4,51,64]]) {
    const solve=coverageOracle(size);
    const all=Array.from({length:size*size},(_,i)=>i);
    for (let seed=0;seed<samples;seed++) {
      const sample=size===3?seed:Math.imul(seed+1,0x9e37)&0xffff;
      const unopened=all.filter(i=>sample&(1<<i));
      const H=seed%3,V=(seed>>2)%3,X=(seed>>4)%3;
      const expected=solve(unopened,H,V,X);
      const p=progress({currentFloor:floor,openedCells:all.filter(i=>!(sample&(1<<i))),
        resources:{horizontalQi:H,verticalQi:V,crossQi:X}});
      const result=PLANNER.planToTarget({progress:p,targetFloor:floor,risk:"worst"},DATA,CORE);
      assert.strictEqual(result.demand.worst,expected,`size ${size}, mask ${sample}, H${H} V${V} X${X}`);
      assert.strictEqual(result.planningMethod,"exact");
    }
  }
});

test("a bounded multi-floor witness failure is not reported as proof of infeasibility", () => {
  const saved=progress({resources:{verticalQi:3,crossQi:1,woodSword:4}});
  const result=PLANNER.planToTarget({progress:saved,targetFloor:2,risk:"worst"},DATA,CORE);
  // One cross plus four swords clear floor 1 while all three vertical
  // actions can independently clear floor 2. The current witness misses it.
  assert.strictEqual(result.demand.worst,5);
  assert.strictEqual(result.demand.lowerBound,4);
  assert.strictEqual(result.achievable,null);
  assert.strictEqual(result.feasibilityStatus,"undetermined");
  const range=PLANNER.planReachable({progress:saved,risk:"worst"},DATA,CORE);
  assert.strictEqual(range.completedFloor,1);
  assert.strictEqual(range.upperBoundFloor,2);
  assert.strictEqual(range.exact,false);
});

test("reverse planning cannot cross an adjacent floor with one missing sword", () => {
  for (const [stock,completed] of [[24,49],[25,50],[40,50],[41,51]]) {
    const input={progress:progress({currentFloor:49,resources:{woodSword:stock-7}}),risk:"worst"};
    const result=PLANNER.planReachable(input,DATA,CORE);
    assert.strictEqual(result.completedFloor,completed);
    assert.strictEqual(result.upperBoundFloor,completed);
  }
});

test("applies all risk modes and rounds conservative demand once", () => {
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "expected"), 12.2);
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "conservative"), 15);
  assert.strictEqual(PLANNER.applyRisk(12.2, 25, "worst"), 25);
  assert.strictEqual(PLANNER.applyRisk(4.1 + 4.1, 18, "conservative"), 10);
});

test('conservative demand never exceeds the same tool plan worst case',()=>{
  assert.strictEqual(PLANNER.applyRisk(1,1,'conservative'),1);
  assert.strictEqual(PLANNER.applyRisk(0,0,'conservative'),0);
  assert.strictEqual(PLANNER.applyRisk(5,5,'conservative'),5);
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
  assert.strictEqual(result.demand.conservative, 1);
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
