(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WOODEN_MAN_ALLEY_PLANNER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var AUXILIARIES = ["ironSword", "horizontalQi", "verticalQi", "crossQi", "bomb", "mirror"];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function applyRisk(expectedTotal, worstTotal, risk, multiplier) {
    if (risk === "worst") return Math.ceil(Math.max(0, worstTotal));
    if (risk === "conservative") return Math.min(Math.ceil(Math.max(0, worstTotal)), Math.ceil(Math.max(0, expectedTotal) * (multiplier || 1.2)));
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
        initialRemaining: remaining,
        expectedBase: expected,
        worstBase: remaining,
        expectedRemaining: expected,
        worstRemaining: remaining,
        firstAction: null,
        tools: {}
      });
    }
    return states;
  }

  function toolBudgets(state, resources, limits, core) {
    return AUXILIARIES.map(function (id) {
      return Math.min(state.initialRemaining, core.availableToolUses(id, state.tier, resources, limits));
    });
  }

  function bitCount(mask) {
    var count = 0;
    while (mask) { mask &= mask - 1; count += 1; }
    return count;
  }

  function expectedRemainder(initial, remaining) {
    return initial && remaining ? remaining * (remaining + 1) / (2 * initial) : 0;
  }

  function policyOrder(left, right, risk) {
    if (!right) return -1;
    if (risk === "worst") return left.worst - right.worst || left.expected - right.expected;
    return left.expected - right.expected || left.worst - right.worst;
  }

  function deterministicFloorPolicy(state, budgets) {
    var size = state.tier.boardSize;
    var remaining = state.initialRemaining;
    if (!remaining) return { expected: 0, worst: 0, firstAction: null, uses: [0, 0, 0, 0, 0, 0] };
    if (budgets[0]) return { expected: 0, worst: 0, firstAction: { toolId: "ironSword", positionOrder: 0 }, uses: [1, 0, 0, 0, 0, 0] };
    var possibilities = 1 << size;
    var rowMasks = [], columnMasks = [];
    for (var mask = 0; mask < possibilities; mask += 1) {
      var count = bitCount(mask);
      if (count <= budgets[1] + budgets[3]) rowMasks.push({ mask: mask, count: count });
      if (count <= budgets[2] + budgets[3]) columnMasks.push({ mask: mask, count: count });
    }
    var best = null;
    rowMasks.forEach(function (rows) {
      columnMasks.forEach(function (columns) {
        // Each selected cross pairs one of the chosen rows with one of the
        // chosen columns. If a real cross repeats an axis, pairing distinct
        // axes (including additional axes if needed) only improves coverage.
        var crosses = Math.max(0, rows.count - budgets[1], columns.count - budgets[2]);
        if (crosses > Math.min(budgets[3], rows.count, columns.count)) return;
        var survivors = state.unopenedCells.filter(function (cell) {
          return (rows.mask & (1 << Math.floor(cell / size))) === 0 &&
            (columns.mask & (1 << (cell % size))) === 0;
        }).length;
        var mirror = Math.min(survivors, budgets[5]);
        var worst = survivors - mirror;
        var count = rows.count + columns.count - crosses + mirror;
        if (!best || worst < best.worst || worst === best.worst && count < best.count) {
          best = { worst: worst, count: count, rows: rows.mask, columns: columns.mask, crosses: crosses, mirror: mirror };
        }
      });
    });
    var firstRow = Math.log2(best.rows & -best.rows);
    var firstColumn = Math.log2(best.columns & -best.columns);
    var firstAction = best.crosses ? { toolId: "crossQi", positionOrder: firstRow * size + firstColumn }
      : best.rows ? { toolId: "horizontalQi", positionOrder: firstRow }
      : best.columns ? { toolId: "verticalQi", positionOrder: firstColumn }
      : best.mirror ? { toolId: "mirror", positionOrder: 0 } : null;
    return { expected: expectedRemainder(remaining, best.worst), worst: best.worst, firstAction: firstAction,
      uses: [0, bitCount(best.rows) - best.crosses, bitCount(best.columns) - best.crosses, best.crosses, 0, best.mirror] };
  }

  // The unverified game model is disclosed to callers: the bomb uniformly
  // samples exactly min(5, remaining) distinct cells, and a prize ends the
  // floor. When it misses, the observed remainder informs the next action.
  // This exact small-board search never returns a partially searched result.
  function smallBoardPolicy(state, budgets, risk, firstToolId) {
    var cells = state.unopenedCells, size = state.tier.boardSize;
    if (cells.length > 12) return null;
    var full = (1 << cells.length) - 1;
    var placements = [[], [], [], [], [], []];
    function add(tool, order, predicate) {
      var mask = cells.reduce(function (m, cell, index) { return predicate(cell, index) ? m | (1 << index) : m; }, 0);
      if (mask) placements[tool].push({ mask: mask, positionOrder: order });
    }
    if (budgets[0]) add(0, 0, function () { return true; });
    for (var row = 0; row < size; row += 1) {
      if (budgets[1]) add(1, row, function (cell) { return Math.floor(cell / size) === row; });
      if (budgets[2]) add(2, row, function (cell) { return cell % size === row; });
      if (budgets[3]) for (var col = 0; col < size; col += 1) {
        add(3, row * size + col, function (cell) { return Math.floor(cell / size) === row || cell % size === col; });
      }
    }
    if (budgets[4]) placements[4].push({ mask: full, positionOrder: 0 });
    if (budgets[5]) cells.forEach(function (_, index) {
      add(5, index, function (cell, position) { return position === index; });
    });
    var memo = new Map(), iterations = 0;
    var exhausted = {};
    function measure() { if (++iterations > 120000) throw exhausted; }
    function visit(mask, stock, forced) {
      var count = bitCount(mask);
      var key = mask + ":" + stock.join(",");
      if (!forced && memo.has(key)) return memo.get(key);
      var best = forced ? null : { expected: count ? (count + 1) / 2 : 0, worst: count,
        uses: [0, 0, 0, 0, 0, 0], firstAction: null };
      if (!count) return best;
      placements.forEach(function (options, tool) {
        if (!stock[tool] || forced && forced !== AUXILIARIES[tool]) return;
        var nextStock = stock.slice();
        nextStock[tool] -= 1;
        var seen = new Set();
        options.forEach(function (option) {
          var after = mask & ~option.mask;
          if (after === mask || seen.has(after)) return;
          seen.add(after);
          measure();
          var remaining = tool === 4 ? Math.max(0, count - 5) : bitCount(after);
          var expected = 0, worst = 0, branches = 0, uses = [0, 0, 0, 0, 0, 0];
          function settle(nextMask) {
            measure();
            var sub = visit(nextMask, nextStock, null);
            expected += sub.expected;
            worst = Math.max(worst, sub.worst);
            branches += 1;
            for (var i = 0; i < uses.length; i += 1) uses[i] = Math.max(uses[i], sub.uses[i]);
          }
          if (remaining && tool === 4) {
            // Enumerate equiprobable residual masks; conditional on missing
            // the prize all these masks still have the same probability.
            for (var subset = mask & (mask - 1); subset; subset = (subset - 1) & mask) {
              measure();
              if (bitCount(subset) === remaining) settle(subset);
            }
          } else if (remaining) settle(after);
          uses[tool] += 1;
          var candidate = { expected: branches ? expected / branches * (remaining / count) : 0,
            worst: worst, uses: uses, firstAction: { toolId: AUXILIARIES[tool], positionOrder: option.positionOrder } };
          if (tool === 5) candidate.firstAction.cell = cells[option.positionOrder];
          if (policyOrder(candidate, best, risk) < 0) best = candidate;
        });
      });
      if (!forced) memo.set(key, best);
      return best;
    }
    try { return visit(full, budgets, firstToolId); }
    catch (error) { if (error === exhausted) return null; throw error; }
  }

  function evaluateSmallBoardPolicy(input, data, core) {
    var source = input || {};
    var progress = core.normalizeProgress(source.progress, data);
    if (progress.completedAllFloors) return null;
    var state = buildFloorStates(progress, progress.currentFloor, data, core)[0];
    var resources = core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    var limits = core.normalizeStageLimits(source.stageLimits || progress.calculator.stageLimits, data);
    return smallBoardPolicy(state, toolBudgets(state, resources, limits, core), source.risk, source.firstToolId);
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
    var remaining = state.worstRemaining;
    var unique = cells;
    var coverage = toolId === "bomb" ? Math.min(5, remaining) : unique.length;
    if (!coverage) return null;
    var after = remaining - coverage;
    var nextExpected = expectedRemainder(state.initialRemaining, after);
    var saving = Math.max(0, state.expectedRemaining - nextExpected);
    return {
      state: state,
      toolId: toolId,
      cost: cost,
      affectedCells: unique,
      coverage: coverage,
      after: after,
      nextExpected: nextExpected,
      expectedSaving: saving,
      value: cost ? saving / cost : 0,
      positionOrder: positionOrder || 0
    };
  }

  function optimisticDemand(allocation, resources, limits, risk, data, core) {
    var states = allocation.states;
    if (allocation.exact) {
      return applyRisk(allocation.expected, allocation.worst, risk, data.conservativeMultiplier);
    }
    var expected = 0, worst = 0, initial = 0;
    var bestEfficiency = {};
    states.forEach(function (state) {
      var count = state.initialRemaining, covered = 0, size = state.tier.boardSize;
      if (!count) return;
      initial += count;
      var sizes = [count, size, size, size * 2 - 1, 5, 1];
      AUXILIARIES.forEach(function (tool, index) {
        var uses = core.availableToolUses(tool, state.tier, resources, limits);
        if (!uses) return;
        var perUse = Math.min(count, sizes[index]);
        covered += uses * perUse;
        bestEfficiency[tool] = Math.max(bestEfficiency[tool] || 0, perUse / toolCost(tool, state.tier));
      });
      var floorLower = Math.max(0, count - covered);
      expected += expectedRemainder(count, floorLower);
      worst += floorLower;
    });
    // Relax overlap, tier spend and tool placement. No legal allocation can
    // clear more than the sum of each unit's maximum across eligible floors.
    var upperCoverage = AUXILIARIES.reduce(function (sum, tool) {
      return sum + (resources[tool] || 0) * (bestEfficiency[tool] || 0);
    }, 0);
    worst = Math.max(worst, initial - Math.ceil(upperCoverage));
    // The per-floor optimistic expectation above remains a lower bound even
    // when other floors occasionally finish early and free shared tools.
    return applyRisk(expected, worst, risk, data.conservativeMultiplier);
  }

  function currentAdvice(allocation, progress, resources, stageLimits, data, core) {
    var advice = core.analyzeCurrentBoard({
      floor: progress.currentFloor, openedCells: progress.openedCells, resources: resources, stageLimits: stageLimits
    }, data);
    var first = allocation.states[0] && allocation.states[0].firstAction;
    var wanted = first ? first.toolId : "woodSword";
    advice.recommendation = advice.actions.find(function (action) {
      if (action.toolId !== wanted) return false;
      if (!action.position) return true;
      if (action.position.type === "row") return action.position.row === first.positionOrder;
      if (action.position.type === "column") return action.position.column === first.positionOrder;
      return action.position.row * advice.boardSize + action.position.column === first.positionOrder;
    }) || null;
    if (advice.recommendation && wanted === "mirror" && first.cell != null) {
      advice.recommendation = Object.assign({}, advice.recommendation, { affectedCells: [first.cell] });
    }
    return advice;
  }

  function bestActionForState(state, remainingResources, stageLimits, tierUsage, core, bombsOnly) {
    if (!state.worstRemaining) return null;
    var size = state.tier.boardSize;
    var unopened = state.unopenedCells;
    var candidates = [];

    function canUse(toolId) {
      return core.availableToolUses(toolId, state.tier, remainingResources, stageLimits, tierUsage) > 0;
    }

    function add(toolId, cells, order) {
      if (!canUse(toolId)) return;
      var candidate = actionCandidate(state, toolId, cells, order, toolCost(toolId, state.tier));
      if (candidate) candidates.push(candidate);
    }

    if (bombsOnly) {
      add("bomb", [], 0);
      return candidates[0] || null;
    }
    add("ironSword", unopened, 0);
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

  function planStages(progress, targetFloor, resources, stageLimits, data, core, risk) {
    var states = buildFloorStates(progress, targetFloor, data, core);
    var remainingResources = clone(resources);
    var tierUsage = {};
    var exact = !states.some(function (state) {
      return AUXILIARIES.some(function (id) { return core.availableToolUses(id, state.tier, resources, stageLimits) > 0; });
    });

    function allocate(bombsOnly) {
      states.forEach(function (state) {
        state.bestAction = bestActionForState(state, remainingResources, stageLimits, tierUsage, core, bombsOnly);
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
      if (!candidate.state.firstAction) candidate.state.firstAction = { toolId: candidate.toolId,
        positionOrder: candidate.positionOrder, cell: candidate.affectedCells[0] };
      candidate.state.unopenedCells = candidate.state.unopenedCells.filter(function (cell) { return !affected[cell]; });
      candidate.state.expectedRemaining = candidate.nextExpected;
      candidate.state.worstRemaining = candidate.after;
      remainingResources[candidate.toolId] -= candidate.cost;
      candidate.state.tools[candidate.toolId] = (candidate.state.tools[candidate.toolId] || 0) + candidate.cost;
      if (!tierUsage[tierId]) tierUsage[tierId] = {};
      tierUsage[tierId][candidate.toolId] = used + candidate.cost;
      candidate.state.bestAction = bestActionForState(candidate.state, remainingResources, stageLimits, tierUsage, core, bombsOnly);

      states.forEach(function (state) {
        var cached = state.bestAction;
        if (!cached || state === candidate.state) return;
        var limit = stageLimits[state.tier.id] && stageLimits[state.tier.id][cached.toolId];
        var cachedUsed = tierUsage[state.tier.id] && tierUsage[state.tier.id][cached.toolId] || 0;
        if ((remainingResources[cached.toolId] || 0) < cached.cost ||
            (limit && limit.max !== null && cachedUsed + cached.cost > limit.max)) {
          state.bestAction = bestActionForState(state, remainingResources, stageLimits, tierUsage, core, bombsOnly);
        }
      });
      }
    }

    if (states.length === 1) {
      var state = states[0], budgets = toolBudgets(state, resources, stageLimits, core);
      var policy = deterministicFloorPolicy(state, budgets);
      exact = !budgets[4] || !policy.worst;
      if (budgets[4] && policy.worst) {
        if (risk === "conservative") {
          var expectedPolicy = smallBoardPolicy(state, budgets, "expected");
          var worstPolicy = smallBoardPolicy(state, budgets, "worst");
          if (expectedPolicy && worstPolicy) {
            policy = applyRisk(expectedPolicy.expected, expectedPolicy.worst, risk, data.conservativeMultiplier) <=
              applyRisk(worstPolicy.expected, worstPolicy.worst, risk, data.conservativeMultiplier) ? expectedPolicy : worstPolicy;
            exact = true;
          }
        } else {
          var randomPolicy = smallBoardPolicy(state, budgets, risk);
          if (randomPolicy) { policy = randomPolicy; exact = true; }
        }
        if (!exact) {
          // Executable fallback: all known placements first, then use
          // bombs. Subsequent random hits never assume a fixed coordinate.
          policy.uses[4] = Math.min(budgets[4], Math.ceil(policy.worst / 5));
          policy.worst = Math.max(0, policy.worst - policy.uses[4] * 5);
          policy.expected = expectedRemainder(state.initialRemaining, policy.worst);
          if (!policy.firstAction) policy.firstAction = { toolId: "bomb", positionOrder: 0 };
        }
      }
      state.expectedRemaining = policy.expected;
      state.worstRemaining = policy.worst;
      state.firstAction = policy.firstAction;
      policy.uses.forEach(function (quantity, index) {
        if (!quantity) return;
        var id = AUXILIARIES[index], cost = quantity * toolCost(id, state.tier);
        state.tools[id] = cost;
        remainingResources[id] -= cost;
      });
    } else {
      allocate(false);
      allocate(true);
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
      exact: exact,
      mayUseBomb: states.some(function (state) { return core.availableToolUses("bomb", state.tier, resources, stageLimits) > 0; }),
      usesBombModel: states.some(function (state) { return !!state.tools.bomb; }),
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
      return { error: "目标层不能低于当前所在层。", achievable: null, targetFloor: targetFloor };
    }
    var risk = ["expected", "conservative", "worst"].indexOf(source.risk) === -1 ? progress.calculator.risk : source.risk;
    var resources = core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    var purchaseInput = Object.assign({}, source, { progress: progress, resources: resources, packages: source.packages || progress.packages });
    if (progress.completedAllFloors) {
      return {
        achievable: true,
        feasibilityStatus: "feasible",
        planningMethod: "exact",
        usesBombModel: false,
        targetFloor: data.maxFloor,
        demand: { expected: 0, conservative: 0, worst: 0, selected: 0, lowerBound: 0, risk: risk },
        shortages: { woodSword: 0 },
        remaining: resources,
        remainingPackages: normalizePlanningPackages(purchaseInput.packages, data),
        stages: [],
        currentFloorAdvice: null,
        purchasePlans: planPurchases(0, purchaseInput, data)
      };
    }

    var stageLimits = core.normalizeStageLimits(source.stageLimits || progress.calculator.stageLimits, data);
    var allocation = planStages(progress, targetFloor, resources, stageLimits, data, core, risk);
    var expected = allocation.expected;
    var worst = allocation.worst;
    var conservative = applyRisk(expected, worst, "conservative", data.conservativeMultiplier);
    var selected = applyRisk(expected, worst, risk, data.conservativeMultiplier);
    var lowerBound = optimisticDemand(allocation, resources, stageLimits, risk, data, core);
    var integerDemand = Math.ceil(selected);
    var ownedSwords = resources.woodSword;
    var shortage = Math.max(0, integerDemand - ownedSwords);
    var purchases = planPurchases(shortage, purchaseInput, data);
    var selectedPurchasePlan = selectPurchasePlan(purchases, source.purchasePreference, shortage);
    var settled = settlePlan(allocation.resources, source.packages || progress.packages, integerDemand, selectedPurchasePlan, data);
    var enoughForWitness = shortage === 0 || !!selectedPurchasePlan;
    var maxSwords = ownedSwords + purchases.maximumProgress.progressSwords;
    // A failed witness is not a proof. Only an optimistic requirement that
    // exceeds even the most favorable legal purchase can certify shortage.
    var feasibility = enoughForWitness ? "feasible" : maxSwords < Math.ceil(lowerBound) ? "insufficient" : "undetermined";
    return {
      achievable: feasibility === "undetermined" ? null : enoughForWitness,
      feasibilityStatus: feasibility,
      planningMethod: allocation.exact ? "exact" : "bounded",
      usesBombModel: allocation.usesBombModel || (allocation.exact && allocation.mayUseBomb && integerDemand > 0),
      targetFloor: targetFloor,
      demand: { expected: expected, conservative: conservative, worst: Math.ceil(worst), selected: selected, lowerBound: lowerBound, risk: risk },
      shortages: { woodSword: shortage },
      remaining: settled.resources,
      remainingPackages: settled.packages,
      stages: allocation.stages,
      currentFloorAdvice: currentAdvice(allocation, progress, resources, stageLimits, data, core),
      purchasePlans: purchases,
      selectedPurchasePlan: selectedPurchasePlan
    };
  }

  function planReachable(input, data, core) {
    var source = input && typeof input === "object" ? input : {};
    var progress = core.normalizeProgress(source.progress, data);
    var risk = ["expected", "conservative", "worst"].indexOf(source.risk) === -1 ? progress.calculator.risk : source.risk;
    var initialResources = core.normalizeResources(Object.assign({}, progress.resources, source.resources || {}), data);
    if (progress.completedAllFloors) {
      return { completedFloor: data.maxFloor, upperBoundFloor: data.maxFloor, exact: true, risk: risk,
        nextFloor: null, brokenOnNextFloor: 0, expectedBrokenOnNextFloor: 0, remaining: initialResources,
        remainingPackages: normalizePlanningPackages(source.packages || progress.packages, data), stages: [], usesBombModel: false };
    }
    var low = progress.currentFloor;
    var high = data.maxFloor;
    var proofUpper = high;
    var proofUsesBombModel = false;
    var best = progress.currentFloor - 1;
    var bestPlan = null;
    function probe(floor) {
      var candidate = planToTarget(Object.assign({}, source, { targetFloor: floor, purchasePreference: "minimumIngot" }), data, core);
      if (candidate.feasibilityStatus === "feasible") {
        best = floor;
        bestPlan = candidate;
        low = floor + 1;
      } else {
        if (candidate.feasibilityStatus === "insufficient" && floor - 1 < proofUpper) {
          proofUpper = floor - 1;
          proofUsesBombModel = candidate.usesBombModel;
        }
        // A failed witness directs the next probe only; it never decreases
        // the rigorous upper bound, which changes on a proof of shortage.
        high = floor - 1;
      }
    }
    probe(high);
    while (low <= high) {
      probe(Math.floor((low + high) / 2));
    }
    if (best >= data.maxFloor) {
      return { completedFloor: best, upperBoundFloor: best, exact: true, risk: risk, nextFloor: null,
        brokenOnNextFloor: 0, expectedBrokenOnNextFloor: 0, remaining: bestPlan.remaining,
        remainingPackages: bestPlan.remainingPackages, stages: bestPlan.stages, usesBombModel: bestPlan.usesBombModel };
    }
    var nextFloor = best + 1;
    var resourceSource = bestPlan
      ? core.normalizeResources(bestPlan.remaining, data)
      : initialResources;
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
    if (bestPlan) bestPlan.stages.forEach(function (stage) {
      Object.keys(stage.tools).forEach(function (tool) {
        var limit = stageLimits[stage.tierId][tool];
        if (limit && limit.max !== null) limit.max = Math.max(0, limit.max - stage.tools[tool]);
      });
    });
    var partialAllocation = planStages(partialProgress, nextFloor, resourceSource, stageLimits, data, core, "worst");
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
      upperBoundFloor: proofUpper,
      exact: best === proofUpper,
      risk: risk,
      nextFloor: nextFloor,
      brokenOnNextFloor: alreadyBroken + auxiliaryBroken + swordsUsed,
      expectedBrokenOnNextFloor: alreadyBroken + auxiliaryBroken + swordsUsed,
      remaining: partialSettled.resources,
      remainingPackages: partialSettled.packages,
      stages: bestPlan ? bestPlan.stages : [],
      usesBombModel: !!(proofUsesBombModel || partialAllocation.usesBombModel || bestPlan && bestPlan.usesBombModel)
    };
  }

  return {
    applyRisk: applyRisk,
    evaluateSmallBoardPolicy: evaluateSmallBoardPolicy,
    planStages: planStages,
    planPurchases: planPurchases,
    planToTarget: planToTarget,
    planReachable: planReachable
  };
});
