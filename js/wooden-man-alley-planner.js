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

  function toolCost(toolId, tier) {
    return tier.toolCosts[toolId] || 1;
  }

  function buildFloorStates(progress, targetFloor, data, core) {
    if (progress.completedAllFloors) return [];
    var states = [];
    for (var floor = progress.currentFloor; floor <= targetFloor; floor += 1) {
      var tier = core.tierForFloor(floor, data);
      var openedLookup = {};
      if (floor === progress.currentFloor) progress.openedCells.forEach(function (cell) { openedLookup[cell] = true; });
      var unopenedCells = [];
      for (var cell = 0; cell < tier.cellCount; cell += 1) {
        if (!openedLookup[cell]) unopenedCells.push(cell);
      }
      var remaining = unopenedCells.length;
      var expected = remaining ? (remaining + 1) / 2 : 0;
      states.push({
        floor: floor,
        tier: tier,
        unopenedCells: unopenedCells,
        survivalProbability: 1,
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

  function compareActions(left, right) {
    if (!right) return -1;
    if (left.value !== right.value) return right.value - left.value;
    if (left.state.floor !== right.state.floor) return right.state.floor - left.state.floor;
    var toolOrder = { mirror: 0, horizontalQi: 1, verticalQi: 2, bomb: 3, crossQi: 4, ironSword: 5 };
    if (toolOrder[left.toolId] !== toolOrder[right.toolId]) return toolOrder[left.toolId] - toolOrder[right.toolId];
    if (left.coverage !== right.coverage) return right.coverage - left.coverage;
    return left.positionOrder - right.positionOrder;
  }

  function actionCandidate(state, toolId, cells, positionOrder, cost) {
    if (!cells.length || !state.unopenedCells.length) return null;
    var affectedLookup = {};
    cells.forEach(function (cell) { affectedLookup[cell] = true; });
    var unique = state.unopenedCells.filter(function (cell) { return affectedLookup[cell]; });
    if (!unique.length) return null;
    var remaining = state.unopenedCells.length;
    var after = remaining - unique.length;
    var nextSurvival = remaining ? state.survivalProbability * after / remaining : 0;
    var nextExpected = after ? nextSurvival * (after + 1) / 2 : 0;
    var saving = Math.max(0, state.expectedRemaining - nextExpected);
    return {
      state: state,
      toolId: toolId,
      cost: cost,
      affectedCells: unique,
      coverage: unique.length,
      nextSurvival: nextSurvival,
      nextExpected: nextExpected,
      expectedSaving: saving,
      value: cost ? saving / cost : 0,
      positionOrder: positionOrder || 0
    };
  }

  function bestActionForState(state, remainingResources, stageLimits, tierUsage) {
    if (!state.unopenedCells.length) return null;
    var tierId = state.tier.id;
    var size = state.tier.boardSize;
    var unopened = state.unopenedCells;
    var candidates = [];

    function canUse(toolId) {
      var cost = toolCost(toolId, state.tier);
      var limit = stageLimits[tierId] && stageLimits[tierId][toolId];
      var used = tierUsage[tierId] && tierUsage[tierId][toolId] || 0;
      return (!limit || limit.allowed !== false) &&
        (limit === undefined || limit.max === null || used + cost <= limit.max) &&
        (remainingResources[toolId] || 0) >= cost;
    }

    function add(toolId, cells, order) {
      if (!canUse(toolId)) return;
      var candidate = actionCandidate(state, toolId, cells, order, toolCost(toolId, state.tier));
      if (candidate) candidates.push(candidate);
    }

    add("ironSword", unopened, 0);
    add("bomb", unopened.slice(0, Math.min(5, unopened.length)), 0);
    add("mirror", unopened.slice(0, 1), 0);
    if (canUse("horizontalQi")) {
      for (var row = 0; row < size; row += 1) {
        add("horizontalQi", unopened.filter(function (cell) { return Math.floor(cell / size) === row; }), row);
      }
    }
    if (canUse("verticalQi")) {
      for (var column = 0; column < size; column += 1) {
        add("verticalQi", unopened.filter(function (cell) { return cell % size === column; }), column);
      }
    }
    if (canUse("crossQi")) {
      for (var crossRow = 0; crossRow < size; crossRow += 1) {
        for (var crossColumn = 0; crossColumn < size; crossColumn += 1) {
          add("crossQi", unopened.filter(function (cell) {
            return Math.floor(cell / size) === crossRow || cell % size === crossColumn;
          }), crossRow * size + crossColumn);
        }
      }
    }
    candidates.sort(compareActions);
    return candidates[0] || null;
  }

  function planStages(progress, targetFloor, resources, stageLimits, data, core) {
    var states = buildFloorStates(progress, targetFloor, data, core);
    var remainingResources = clone(resources);
    var tierUsage = {};
    states.forEach(function (state) {
      state.bestAction = bestActionForState(state, remainingResources, stageLimits, tierUsage);
    });

    while (true) {
      var candidate = null;
      states.forEach(function (state) {
        if (state.bestAction && compareActions(state.bestAction, candidate) < 0) candidate = state.bestAction;
      });
      if (!candidate) break;
      var tierId = candidate.state.tier.id;
      var used = tierUsage[tierId] && tierUsage[tierId][candidate.toolId] || 0;
      var affected = {};
      candidate.affectedCells.forEach(function (cell) { affected[cell] = true; });
      candidate.state.unopenedCells = candidate.state.unopenedCells.filter(function (cell) { return !affected[cell]; });
      candidate.state.survivalProbability = candidate.nextSurvival;
      candidate.state.expectedRemaining = candidate.nextExpected;
      candidate.state.worstRemaining = candidate.state.unopenedCells.length;
      remainingResources[candidate.toolId] -= candidate.cost;
      candidate.state.tools[candidate.toolId] = (candidate.state.tools[candidate.toolId] || 0) + candidate.cost;
      if (!tierUsage[tierId]) tierUsage[tierId] = {};
      tierUsage[tierId][candidate.toolId] = used + candidate.cost;
      candidate.state.bestAction = bestActionForState(candidate.state, remainingResources, stageLimits, tierUsage);

      states.forEach(function (state) {
        var cached = state.bestAction;
        if (!cached || state === candidate.state) return;
        var limit = stageLimits[state.tier.id] && stageLimits[state.tier.id][cached.toolId];
        var cachedUsed = tierUsage[state.tier.id] && tierUsage[state.tier.id][cached.toolId] || 0;
        if ((remainingResources[cached.toolId] || 0) < cached.cost ||
            (limit && limit.max !== null && cachedUsed + cached.cost > limit.max)) {
          state.bestAction = bestActionForState(state, remainingResources, stageLimits, tierUsage);
        }
      });
    }

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

  function validPackageInteger(value, fallback) {
    if (value === "" || value === null || value === undefined) return fallback;
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
  }

  function normalizePlanningPackages(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var normalized = {};
    data.defaultPackages.forEach(function (defaults) {
      var item = source[defaults.id] && typeof source[defaults.id] === "object" ? source[defaults.id] : {};
      var limit = validPackageInteger(item.limit, defaults.limit);
      normalized[defaults.id] = {
        id: defaults.id,
        name: defaults.name,
        price: validPackageInteger(item.price, defaults.price),
        swords: validPackageInteger(item.swords, defaults.swords),
        mysteryBoxes: validPackageInteger(item.mysteryBoxes, defaults.mysteryBoxes),
        limit: limit,
        purchased: Math.min(limit, validPackageInteger(item.purchased, defaults.purchased))
      };
    });
    return normalized;
  }

  function packageStates(packages, needed) {
    var states = new Map();
    states.set(0, { swords: 0, rmb: 0, mysteryBoxes: 0, packages: {} });
    Object.keys(packages).forEach(function (id) {
      var item = packages[id];
      var available = Math.max(0, item.limit - item.purchased);
      var useful = item.swords > 0 && needed > 0 ? Math.min(available, Math.ceil(needed / item.swords)) : 0;
      var chunkSize = 1;
      while (useful > 0) {
        var quantity = Math.min(chunkSize, useful);
        var snapshot = Array.from(states.entries());
        snapshot.forEach(function (entry) {
          var state = entry[1];
          var swords = state.swords + item.swords * quantity;
          var key = Math.min(needed, swords);
          var counts = clone(state.packages);
          counts[id] = (counts[id] || 0) + quantity;
          var candidate = {
            swords: swords,
            rmb: state.rmb + item.price * quantity,
            mysteryBoxes: state.mysteryBoxes + item.mysteryBoxes * quantity,
            packages: counts
          };
          var current = states.get(key);
          if (!current || candidate.rmb < current.rmb ||
              (candidate.rmb === current.rmb && candidate.swords > current.swords)) states.set(key, candidate);
        });
        useful -= quantity;
        chunkSize *= 2;
      }
    });
    return Array.from(states.values());
  }

  function affordableSwordPurchase(maxCount, ingots, coupons, data) {
    var needed = Math.max(0, Math.floor(maxCount || 0));
    var money = Math.max(0, Math.floor(ingots || 0));
    var discounted = Math.min(needed, Math.max(0, Math.floor(coupons || 0)), Math.floor(money / data.discountedSwordIngotPrice));
    money -= discounted * data.discountedSwordIngotPrice;
    var full = Math.min(needed - discounted, Math.floor(money / data.swordIngotPrice));
    return {
      swords: discounted + full,
      couponsUsed: discounted,
      ingotsRequired: discounted * data.discountedSwordIngotPrice + full * data.swordIngotPrice
    };
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
      var affordable = affordableSwordPurchase(needed, ingots, coupons, data);
      return {
        packagesIncluded: false,
        zeroPaid: zeroPaid,
        minimumRmb: null,
        minimumIngot: null,
        maximumProgress: {
          type: "maximumProgress",
          packages: {},
          rmb: 0,
          swordsFromPackages: 0,
          mysteryBoxes: 0,
          swordsToBuy: affordable.swords,
          couponsUsed: affordable.couponsUsed,
          ingotsRequired: affordable.ingotsRequired,
          ingotShortage: 0,
          feasible: affordable.swords >= needed,
          progressSwords: affordable.swords
        }
      };
    }

    var packages = normalizePlanningPackages(source.packages || progress.packages || {}, data);
    var bestRmb = null;
    var bestIngot = null;
    var maximumProgress = null;
    packageStates(packages, needed).forEach(function (state) {
      var purchase = swordPurchaseCost(Math.max(0, needed - state.swords), coupons, data);
      var candidate = {
        packages: state.packages,
        rmb: state.rmb,
        swordsFromPackages: state.swords,
        mysteryBoxes: state.mysteryBoxes,
        swordsToBuy: purchase.swords,
        couponsUsed: purchase.couponsUsed,
        ingotsRequired: purchase.ingotsRequired,
        ingotShortage: Math.max(0, purchase.ingotsRequired - ingots),
        feasible: purchase.ingotsRequired <= ingots
      };
      if (comparePlans(candidate, bestRmb, "rmb", "ingotsRequired") < 0) bestRmb = clone(candidate);
      if (comparePlans(candidate, bestIngot, "ingotsRequired", "rmb") < 0) bestIngot = clone(candidate);
      var affordable = affordableSwordPurchase(Math.max(0, needed - state.swords), ingots, coupons, data);
      var progressCandidate = {
        type: "maximumProgress",
        packages: clone(state.packages),
        rmb: state.rmb,
        swordsFromPackages: state.swords,
        mysteryBoxes: state.mysteryBoxes,
        swordsToBuy: affordable.swords,
        couponsUsed: affordable.couponsUsed,
        ingotsRequired: affordable.ingotsRequired,
        ingotShortage: 0,
        feasible: state.swords + affordable.swords >= needed,
        progressSwords: Math.min(needed, state.swords + affordable.swords)
      };
      if (!maximumProgress || progressCandidate.progressSwords > maximumProgress.progressSwords ||
          (progressCandidate.progressSwords === maximumProgress.progressSwords && progressCandidate.rmb < maximumProgress.rmb) ||
          (progressCandidate.progressSwords === maximumProgress.progressSwords && progressCandidate.rmb === maximumProgress.rmb && progressCandidate.ingotsRequired < maximumProgress.ingotsRequired)) {
        maximumProgress = progressCandidate;
      }
    });
    if (bestRmb) bestRmb.type = "minimumRmb";
    if (bestIngot) bestIngot.type = "minimumIngot";
    return { packagesIncluded: true, zeroPaid: zeroPaid, minimumRmb: bestRmb, minimumIngot: bestIngot, maximumProgress: maximumProgress };
  }

  function selectPurchasePlan(purchases, preference, shortage) {
    if (shortage <= 0) return purchases.zeroPaid;
    var preferred = preference === "minimumIngot" ? purchases.minimumIngot : purchases.minimumRmb;
    if (preferred && preferred.feasible) return preferred;
    if (purchases.zeroPaid && purchases.zeroPaid.feasible) return purchases.zeroPaid;
    if (purchases.minimumIngot && purchases.minimumIngot.feasible) return purchases.minimumIngot;
    if (purchases.minimumRmb && purchases.minimumRmb.feasible) return purchases.minimumRmb;
    return null;
  }

  function settlePlan(resources, packages, requiredSwords, purchasePlan, data) {
    var remaining = clone(resources);
    var normalizedPackages = normalizePlanningPackages(packages, data);
    if (!purchasePlan) {
      remaining.woodSword = Math.max(0, remaining.woodSword - requiredSwords);
      return { resources: remaining, packages: normalizedPackages };
    }
    var totalSwords = remaining.woodSword + purchasePlan.swordsFromPackages + purchasePlan.swordsToBuy;
    remaining.woodSword = Math.max(0, totalSwords - requiredSwords);
    remaining.ingots = Math.max(0, remaining.ingots - purchasePlan.ingotsRequired);
    remaining.discountCoupon = Math.max(0, remaining.discountCoupon - purchasePlan.couponsUsed);
    remaining.mysteryBoxes += purchasePlan.mysteryBoxes;
    Object.keys(purchasePlan.packages).forEach(function (id) {
      if (normalizedPackages[id]) {
        normalizedPackages[id].purchased = Math.min(normalizedPackages[id].limit, normalizedPackages[id].purchased + purchasePlan.packages[id]);
      }
    });
    return { resources: remaining, packages: normalizedPackages };
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
    var purchaseInput = Object.assign({}, source, { progress: progress, resources: resources, packages: source.packages || progress.packages });
    var purchases = planPurchases(shortage, purchaseInput, data);
    var possiblePlans = [purchases.zeroPaid, purchases.minimumRmb, purchases.minimumIngot].filter(Boolean);
    var achievable = shortage === 0 || possiblePlans.some(function (plan) { return plan.feasible; });
    var selectedPurchasePlan = selectPurchasePlan(purchases, source.purchasePreference, shortage);
    var settled = settlePlan(allocation.resources, source.packages || progress.packages, integerDemand, selectedPurchasePlan, data);
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
      remaining: settled.resources,
      remainingPackages: settled.packages,
      stages: allocation.stages,
      currentFloorAdvice: advice,
      purchasePlans: purchases,
      selectedPurchasePlan: selectedPurchasePlan
    };
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
      var candidate = planToTarget(Object.assign({}, source, { targetFloor: middle, purchasePreference: "minimumIngot" }), data, core);
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
    var resourceSource = bestPlan
      ? core.normalizeResources(bestPlan.remaining, data)
      : core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    var packageSource = bestPlan && bestPlan.remainingPackages
      ? bestPlan.remainingPackages
      : normalizePlanningPackages(source.packages || progress.packages, data);
    var partialProgress = core.normalizeProgress({
      currentFloor: nextFloor,
      openedCells: nextFloor === progress.currentFloor ? progress.openedCells : [],
      resources: resourceSource,
      packages: packageSource,
      calculator: progress.calculator
    }, data);
    var stageLimits = core.normalizeStageLimits(source.stageLimits || progress.calculator.stageLimits, data);
    var partialAllocation = planStages(partialProgress, nextFloor, resourceSource, stageLimits, data, core);
    var state = partialAllocation.states[0];
    var alreadyBroken = core.boardCellCount(nextFloor, data) - state.initialRemaining;
    var auxiliaryBroken = state.initialRemaining - state.worstRemaining;
    var swordRoom = Math.max(0, state.worstRemaining - 1);
    var ownedForPartial = partialAllocation.resources.woodSword;
    var partialShortage = Math.max(0, swordRoom - ownedForPartial);
    var partialPurchases = planPurchases(partialShortage, {
      progress: partialProgress,
      resources: partialAllocation.resources,
      packages: packageSource,
      includePurchasablePackages: source.includePurchasablePackages
    }, data);
    var partialPurchase = partialPurchases.maximumProgress;
    var swordsAvailable = ownedForPartial + (partialPurchase ? partialPurchase.progressSwords : 0);
    var swordsUsed = Math.min(swordRoom, swordsAvailable);
    var partialSettled = settlePlan(partialAllocation.resources, packageSource, swordsUsed, partialPurchase, data);
    return {
      completedFloor: best,
      nextFloor: nextFloor,
      expectedBrokenOnNextFloor: alreadyBroken + auxiliaryBroken + swordsUsed,
      remaining: partialSettled.resources,
      remainingPackages: partialSettled.packages,
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
