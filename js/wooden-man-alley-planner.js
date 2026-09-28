(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WOODEN_MAN_ALLEY_PLANNER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function applyRisk(expectedTotal, worstTotal, risk, multiplier) {
    if (risk === "worst") return Math.ceil(Math.max(0, worstTotal));
    if (risk === "conservative") return Math.ceil(Math.max(0, expectedTotal) * (multiplier || 1.2));
    return Math.max(0, expectedTotal);
  }

  function actionExpectedSaving(remaining, affected) {
    if (!remaining || !affected) return 0;
    var covered = Math.min(remaining, affected);
    var pure = (remaining + 1) / 2;
    var after = remaining - covered;
    var continuation = after ? (after + 1) / 2 : 0;
    return pure - (1 - covered / remaining) * continuation;
  }

  function toolCost(toolId, tier) {
    return tier.toolCosts[toolId] || 1;
  }

  function toolCoverage(toolId, tier, remaining) {
    if (toolId === "ironSword") return remaining;
    if (toolId === "horizontalQi" || toolId === "verticalQi") return Math.min(remaining, tier.boardSize);
    if (toolId === "crossQi") return Math.min(remaining, tier.boardSize * 2 - 1);
    if (toolId === "bomb") return Math.min(remaining, 5);
    if (toolId === "mirror") return Math.min(remaining, 1);
    return 0;
  }

  function buildFloorStates(progress, targetFloor, data, core) {
    if (progress.completedAllFloors) return [];
    var states = [];
    for (var floor = progress.currentFloor; floor <= targetFloor; floor += 1) {
      var tier = core.tierForFloor(floor, data);
      var remaining = tier.cellCount;
      var expected = (remaining + 1) / 2;
      if (floor === progress.currentFloor) {
        remaining = tier.cellCount - progress.openedCells.length;
        expected = remaining ? (remaining + 1) / 2 : 0;
      }
      states.push({
        floor: floor,
        tier: tier,
        initialRemaining: remaining,
        expectedBase: expected,
        worstBase: remaining,
        expectedRemaining: expected,
        worstRemaining: remaining,
        tools: {}
      });
    }
    return states;
  }

  function maxUses(toolId, state) {
    if (toolId === "ironSword") return 1;
    if (toolId === "horizontalQi" || toolId === "verticalQi" || toolId === "crossQi") return state.tier.boardSize;
    if (toolId === "bomb") return Math.ceil(state.initialRemaining / 5);
    if (toolId === "mirror") return state.initialRemaining;
    return 0;
  }

  function planStages(progress, targetFloor, resources, stageLimits, data, core) {
    var states = buildFloorStates(progress, targetFloor, data, core);
    var remainingResources = clone(resources);
    var tierUsage = {};
    var candidates = [];
    var auxiliaryIds = ["ironSword", "horizontalQi", "verticalQi", "crossQi", "bomb", "mirror"];

    states.forEach(function (state) {
      auxiliaryIds.forEach(function (toolId) {
        var cost = toolCost(toolId, state.tier);
        var coverage = toolCoverage(toolId, state.tier, state.initialRemaining);
        var expectedSaving = toolId === "ironSword" ? state.expectedBase : actionExpectedSaving(state.initialRemaining, coverage);
        var uses = maxUses(toolId, state);
        for (var index = 0; index < uses; index += 1) {
          candidates.push({
            state: state,
            toolId: toolId,
            cost: cost,
            expectedSaving: expectedSaving,
            worstSaving: coverage,
            value: cost ? expectedSaving / cost : 0,
            order: index
          });
        }
      });
    });

    candidates.sort(function (left, right) {
      if (left.value !== right.value) return right.value - left.value;
      if (left.state.floor !== right.state.floor) return right.state.floor - left.state.floor;
      var toolOrder = { mirror: 0, horizontalQi: 1, verticalQi: 2, bomb: 3, crossQi: 4, ironSword: 5 };
      if (toolOrder[left.toolId] !== toolOrder[right.toolId]) return toolOrder[left.toolId] - toolOrder[right.toolId];
      return left.order - right.order;
    });

    candidates.forEach(function (candidate) {
      var tierId = candidate.state.tier.id;
      var limit = stageLimits[tierId] && stageLimits[tierId][candidate.toolId];
      if (limit && limit.allowed === false) return;
      var used = tierUsage[tierId] && tierUsage[tierId][candidate.toolId] || 0;
      if (limit && limit.max !== null && used + candidate.cost > limit.max) return;
      if ((remainingResources[candidate.toolId] || 0) < candidate.cost) return;
      if (candidate.state.expectedRemaining <= 0) return;
      var expectedSaving = Math.min(candidate.state.expectedRemaining, candidate.expectedSaving);
      var worstSaving = Math.min(candidate.state.worstRemaining, candidate.worstSaving);
      if (expectedSaving <= 0) return;
      candidate.state.expectedRemaining -= expectedSaving;
      candidate.state.worstRemaining -= worstSaving;
      remainingResources[candidate.toolId] -= candidate.cost;
      candidate.state.tools[candidate.toolId] = (candidate.state.tools[candidate.toolId] || 0) + candidate.cost;
      if (!tierUsage[tierId]) tierUsage[tierId] = {};
      tierUsage[tierId][candidate.toolId] = used + candidate.cost;
    });

    var stageMap = {};
    states.forEach(function (state) {
      var id = state.tier.id;
      if (!stageMap[id]) {
        stageMap[id] = {
          tierId: id,
          from: state.floor,
          to: state.floor,
          expectedBase: 0,
          expectedAfterTools: 0,
          worstBase: 0,
          worstAfterTools: 0,
          tools: {}
        };
      }
      var stage = stageMap[id];
      stage.to = state.floor;
      stage.expectedBase += state.expectedBase;
      stage.expectedAfterTools += state.expectedRemaining;
      stage.worstBase += state.worstBase;
      stage.worstAfterTools += state.worstRemaining;
      Object.keys(state.tools).forEach(function (toolId) {
        stage.tools[toolId] = (stage.tools[toolId] || 0) + state.tools[toolId];
      });
    });

    return {
      states: states,
      stages: Object.keys(stageMap).map(function (id) { return stageMap[id]; }),
      resources: remainingResources,
      expected: states.reduce(function (sum, state) { return sum + state.expectedRemaining; }, 0),
      worst: states.reduce(function (sum, state) { return sum + state.worstRemaining; }, 0)
    };
  }

  function swordPurchaseCost(count, coupons, data) {
    var total = Math.max(0, Math.ceil(count));
    var discounted = Math.min(total, Math.max(0, Math.floor(coupons || 0)));
    return {
      swords: total,
      couponsUsed: discounted,
      ingotsRequired: discounted * data.discountedSwordIngotPrice + (total - discounted) * data.swordIngotPrice
    };
  }

  function packageCombinations(packages) {
    var ids = Object.keys(packages);
    var results = [];
    function visit(index, counts) {
      if (index >= ids.length) {
        results.push(clone(counts));
        return;
      }
      var item = packages[ids[index]];
      var remaining = Math.max(0, item.limit - item.purchased);
      for (var count = 0; count <= remaining; count += 1) {
        if (count) counts[item.id] = count;
        else delete counts[item.id];
        visit(index + 1, counts);
      }
      delete counts[item.id];
    }
    visit(0, {});
    return results;
  }

  function comparePlans(left, right, primary, secondary) {
    if (!right) return -1;
    if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
    if (left[primary] !== right[primary]) return left[primary] - right[primary];
    if (left[secondary] !== right[secondary]) return left[secondary] - right[secondary];
    return JSON.stringify(left.packages).localeCompare(JSON.stringify(right.packages));
  }

  function planPurchases(shortage, input, data) {
    var source = input && typeof input === "object" ? input : {};
    var progress = source.progress || {};
    var resources = Object.assign({}, progress.resources || {}, source.resources || {});
    var ingots = Math.max(0, Math.floor(Number(resources.ingots) || 0));
    var coupons = Math.max(0, Math.floor(Number(resources.discountCoupon) || 0));
    var needed = Math.max(0, Math.ceil(Number(shortage) || 0));
    var zeroCost = swordPurchaseCost(needed, coupons, data);
    var zeroPaid = {
      type: "zeroPaid",
      packages: {},
      rmb: 0,
      swordsFromPackages: 0,
      mysteryBoxes: 0,
      swordsToBuy: zeroCost.swords,
      couponsUsed: zeroCost.couponsUsed,
      ingotsRequired: zeroCost.ingotsRequired,
      ingotShortage: Math.max(0, zeroCost.ingotsRequired - ingots),
      feasible: zeroCost.ingotsRequired <= ingots
    };
    if (!source.includePurchasablePackages) {
      return { packagesIncluded: false, zeroPaid: zeroPaid, minimumRmb: null, minimumIngot: null };
    }

    var packages = source.packages || progress.packages || {};
    var bestRmb = null;
    var bestIngot = null;
    packageCombinations(packages).forEach(function (counts) {
      var swords = 0;
      var boxes = 0;
      var rmb = 0;
      Object.keys(counts).forEach(function (id) {
        var item = packages[id];
        swords += item.swords * counts[id];
        boxes += item.mysteryBoxes * counts[id];
        rmb += item.price * counts[id];
      });
      var purchase = swordPurchaseCost(Math.max(0, needed - swords), coupons, data);
      var candidate = {
        packages: counts,
        rmb: rmb,
        swordsFromPackages: swords,
        mysteryBoxes: boxes,
        swordsToBuy: purchase.swords,
        couponsUsed: purchase.couponsUsed,
        ingotsRequired: purchase.ingotsRequired,
        ingotShortage: Math.max(0, purchase.ingotsRequired - ingots),
        feasible: purchase.ingotsRequired <= ingots
      };
      if (comparePlans(candidate, bestRmb, "rmb", "ingotsRequired") < 0) bestRmb = clone(candidate);
      if (comparePlans(candidate, bestIngot, "ingotsRequired", "rmb") < 0) bestIngot = clone(candidate);
    });
    if (bestRmb) bestRmb.type = "minimumRmb";
    if (bestIngot) bestIngot.type = "minimumIngot";
    return { packagesIncluded: true, zeroPaid: zeroPaid, minimumRmb: bestRmb, minimumIngot: bestIngot };
  }

  function planToTarget(input, data, core) {
    var source = input && typeof input === "object" ? input : {};
    var progress = core.normalizeProgress(source.progress, data);
    var targetFloor = Math.max(1, Math.min(data.maxFloor, Math.floor(Number(source.targetFloor) || progress.calculator.targetFloor)));
    if (!progress.completedAllFloors && targetFloor < progress.currentFloor) {
      return { error: "目标层不能低于当前所在层。", achievable: false, targetFloor: targetFloor };
    }
    if (progress.completedAllFloors) {
      return {
        achievable: true,
        targetFloor: data.maxFloor,
        demand: { expected: 0, conservative: 0, worst: 0, selected: 0, risk: source.risk || "conservative" },
        shortages: { woodSword: 0 },
        remaining: clone(progress.resources),
        stages: [],
        currentFloorAdvice: null,
        purchasePlans: planPurchases(0, source, data)
      };
    }

    var resources = core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    var stageLimits = core.normalizeStageLimits(source.stageLimits || progress.calculator.stageLimits, data);
    var allocation = planStages(progress, targetFloor, resources, stageLimits, data, core);
    var expected = allocation.expected;
    var worst = allocation.worst;
    var conservative = applyRisk(expected, worst, "conservative", data.conservativeMultiplier);
    var risk = ["expected", "conservative", "worst"].indexOf(source.risk) === -1 ? progress.calculator.risk : source.risk;
    var selected = applyRisk(expected, worst, risk, data.conservativeMultiplier);
    var integerDemand = Math.ceil(selected);
    var ownedSwords = resources.woodSword;
    var shortage = Math.max(0, integerDemand - ownedSwords);
    var remaining = clone(allocation.resources);
    remaining.woodSword = Math.max(0, ownedSwords - integerDemand);
    var purchaseInput = Object.assign({}, source, { progress: progress, resources: resources, packages: source.packages || progress.packages });
    var purchases = planPurchases(shortage, purchaseInput, data);
    var possiblePlans = [purchases.zeroPaid, purchases.minimumRmb, purchases.minimumIngot].filter(Boolean);
    var achievable = shortage === 0 || possiblePlans.some(function (plan) { return plan.feasible; });
    var advice = core.analyzeCurrentBoard({
      floor: progress.currentFloor,
      openedCells: progress.openedCells,
      resources: resources
    }, data);
    return {
      achievable: achievable,
      targetFloor: targetFloor,
      demand: { expected: expected, conservative: conservative, worst: Math.ceil(worst), selected: selected, risk: risk },
      shortages: { woodSword: shortage },
      remaining: remaining,
      stages: allocation.stages,
      currentFloorAdvice: advice,
      purchasePlans: purchases
    };
  }

  function maximumBuyableSwords(ingots, coupons, data) {
    var remainingIngots = Math.max(0, Math.floor(ingots || 0));
    var discounted = Math.min(Math.max(0, Math.floor(coupons || 0)), Math.floor(remainingIngots / data.discountedSwordIngotPrice));
    remainingIngots -= discounted * data.discountedSwordIngotPrice;
    return discounted + Math.floor(remainingIngots / data.swordIngotPrice);
  }

  function planReachable(input, data, core) {
    var source = input && typeof input === "object" ? input : {};
    var progress = core.normalizeProgress(source.progress, data);
    if (progress.completedAllFloors) {
      return { completedFloor: data.maxFloor, nextFloor: null, expectedBrokenOnNextFloor: 0, remaining: clone(progress.resources), stages: [] };
    }
    var low = progress.currentFloor;
    var high = data.maxFloor;
    var best = progress.currentFloor - 1;
    var bestPlan = null;
    while (low <= high) {
      var middle = Math.floor((low + high) / 2);
      var candidate = planToTarget(Object.assign({}, source, { targetFloor: middle }), data, core);
      if (candidate.achievable) {
        best = middle;
        bestPlan = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best >= data.maxFloor) {
      return { completedFloor: data.maxFloor, nextFloor: null, expectedBrokenOnNextFloor: 0, remaining: bestPlan ? bestPlan.remaining : clone(progress.resources), stages: bestPlan ? bestPlan.stages : [] };
    }
    var nextFloor = best + 1;
    var resourceSource = core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    var packageSwords = 0;
    if (source.includePurchasablePackages) {
      var packages = source.packages || progress.packages;
      Object.keys(packages).forEach(function (id) {
        var item = packages[id];
        packageSwords += Math.max(0, item.limit - item.purchased) * item.swords;
      });
    }
    var directCapacity = resourceSource.woodSword + packageSwords + maximumBuyableSwords(resourceSource.ingots, resourceSource.discountCoupon, data);
    var spentEstimate = bestPlan ? Math.ceil(bestPlan.demand.selected) : 0;
    var partial = Math.max(0, directCapacity - spentEstimate);
    var nextCells = core.boardCellCount(nextFloor, data);
    return {
      completedFloor: best,
      nextFloor: nextFloor,
      expectedBrokenOnNextFloor: Math.min(nextCells - 1, partial),
      remaining: bestPlan ? bestPlan.remaining : clone(progress.resources),
      stages: bestPlan ? bestPlan.stages : []
    };
  }

  return {
    applyRisk: applyRisk,
    planStages: planStages,
    planPurchases: planPurchases,
    planToTarget: planToTarget,
    planReachable: planReachable
  };
});
