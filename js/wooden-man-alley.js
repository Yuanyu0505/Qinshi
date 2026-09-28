(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WOODEN_MAN_ALLEY_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function nonNegativeInteger(value, fallback) {
    var number = Number(value);
    if (value === "" || value === null || value === undefined || !Number.isFinite(number) || number < 0) {
      return fallback === undefined ? 0 : fallback;
    }
    return Math.floor(number);
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(minimum, Math.min(maximum, Math.floor(number)));
  }

  function tierForFloor(floor, data) {
    var normalized = Number(floor);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > data.maxFloor) {
      throw new RangeError("木人巷层数必须在1至" + data.maxFloor + "之间。");
    }
    var tier = data.tiers.find(function (item) { return normalized >= item.from && normalized <= item.to; });
    if (!tier) throw new RangeError("未找到层数规则。");
    return tier;
  }

  function boardCellCount(floor, data) {
    return tierForFloor(floor, data).cellCount;
  }

  function normalizeResources(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var keys = data && data.resourceKeys ? data.resourceKeys : [
      "woodSword", "ironSword", "horizontalQi", "verticalQi", "crossQi", "bomb", "mirror", "discountCoupon", "ingots", "mysteryBoxes"
    ];
    var normalized = {};
    keys.forEach(function (key) { normalized[key] = nonNegativeInteger(source[key]); });
    return normalized;
  }

  function normalizePackages(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var normalized = {};
    data.defaultPackages.forEach(function (defaults) {
      var item = source[defaults.id] && typeof source[defaults.id] === "object" ? source[defaults.id] : {};
      var limit = nonNegativeInteger(item.limit, defaults.limit);
      normalized[defaults.id] = {
        id: defaults.id,
        name: defaults.name,
        price: nonNegativeInteger(item.price, defaults.price),
        swords: nonNegativeInteger(item.swords, defaults.swords),
        mysteryBoxes: nonNegativeInteger(item.mysteryBoxes, defaults.mysteryBoxes),
        limit: limit,
        purchased: Math.min(limit, nonNegativeInteger(item.purchased, defaults.purchased))
      };
    });
    return normalized;
  }

  function normalizeStageLimits(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var result = {};
    data.tiers.forEach(function (tier) {
      var tierSource = source[tier.id] && typeof source[tier.id] === "object" ? source[tier.id] : {};
      result[tier.id] = {};
      data.tools.filter(function (tool) { return tool.id !== "woodSword"; }).forEach(function (tool) {
        var item = tierSource[tool.id] && typeof tierSource[tool.id] === "object" ? tierSource[tool.id] : {};
        result[tier.id][tool.id] = {
          allowed: item.allowed !== false,
          max: item.max === "" || item.max === null || item.max === undefined ? null : nonNegativeInteger(item.max)
        };
      });
    });
    return result;
  }

  function normalizeOpenedCells(raw, count) {
    var seen = {};
    return (Array.isArray(raw) ? raw : []).map(function (value) { return Number(value); }).filter(function (value) {
      if (!Number.isInteger(value) || value < 0 || value >= count || seen[value]) return false;
      seen[value] = true;
      return true;
    }).sort(function (left, right) { return left - right; });
  }

  function normalizeProgress(raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var floor = boundedInteger(source.currentFloor, 1, data.maxFloor, 1);
    var completed = floor === data.maxFloor && source.completedAllFloors === true;
    var calculatorSource = source.calculator && typeof source.calculator === "object" ? source.calculator : {};
    var risk = ["expected", "conservative", "worst"].indexOf(calculatorSource.risk) === -1 ? "conservative" : calculatorSource.risk;
    return {
      schemaVersion: data.schemaVersion,
      activityEndDate: typeof source.activityEndDate === "string" ? source.activityEndDate.trim() : "",
      currentFloor: floor,
      completedAllFloors: completed,
      openedCells: completed ? [] : normalizeOpenedCells(source.openedCells, boardCellCount(floor, data)),
      resources: normalizeResources(source.resources, data),
      packages: normalizePackages(source.packages, data),
      calculator: {
        direction: calculatorSource.direction === "reachable" ? "reachable" : "target",
        targetFloor: boundedInteger(calculatorSource.targetFloor, 1, data.maxFloor, 75),
        risk: risk,
        includePurchasablePackages: Boolean(calculatorSource.includePurchasablePackages),
        stageLimits: normalizeStageLimits(calculatorSource.stageLimits, data)
      }
    };
  }

  function advanceFloor(progress, data) {
    var normalized = normalizeProgress(progress, data);
    normalized.openedCells = [];
    if (normalized.currentFloor >= data.maxFloor) {
      normalized.currentFloor = data.maxFloor;
      normalized.completedAllFloors = true;
      return normalized;
    }
    normalized.currentFloor += 1;
    normalized.completedAllFloors = false;
    return normalized;
  }

  function remainingDays(endDate, now) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endDate || ""));
    if (!match) return null;
    var end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(end.getTime()) || end.getFullYear() !== Number(match[1]) || end.getMonth() !== Number(match[2]) - 1 || end.getDate() !== Number(match[3])) return null;
    var current = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    var start = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  }

  function toolById(data, id) {
    return data.tools.find(function (tool) { return tool.id === id; }) || { id: id, preserveRank: 99 };
  }

  function toolCost(toolId, tier) {
    if (toolId === "ironSword" || toolId === "horizontalQi" || toolId === "verticalQi" || toolId === "crossQi") {
      return tier.toolCosts[toolId];
    }
    return 1;
  }

  function compactness(cells, size) {
    if (!cells.length) return 0;
    var rows = Array(size).fill(0);
    var columns = Array(size).fill(0);
    cells.forEach(function (cell) {
      rows[Math.floor(cell / size)] += 1;
      columns[cell % size] += 1;
    });
    return Math.max.apply(Math, rows) + Math.max.apply(Math, columns);
  }

  function makeAction(toolId, affectedCells, position, context) {
    var unique = affectedCells.filter(function (cell, index, list) { return list.indexOf(cell) === index; });
    var remainingAfter = Math.max(0, context.remaining - unique.length);
    var hitProbability = context.remaining ? unique.length / context.remaining : 1;
    var continuation = remainingAfter ? (remainingAfter + 1) / 2 : 0;
    var expectedAfterAction = (1 - hitProbability) * continuation;
    var cost = toolCost(toolId, context.tier);
    var expectedSwordSaving = context.pureSwordExpected - expectedAfterAction - (toolId === "woodSword" ? 1 : 0);
    var failureCells = context.unopened.filter(function (cell) { return unique.indexOf(cell) === -1; });
    return {
      toolId: toolId,
      cost: cost,
      affectedCells: unique,
      hitProbability: hitProbability,
      expectedSwordSaving: Math.max(0, expectedSwordSaving),
      position: position,
      random: toolId === "bomb",
      efficiency: cost ? Math.max(0, expectedSwordSaving) / cost : 0,
      failureCompactness: compactness(failureCells, context.size),
      preserveRank: toolById(context.data, toolId).preserveRank
    };
  }

  function positionOrder(action, size) {
    if (!action.position) return size * size + 100;
    var row = action.position.row === null || action.position.row === undefined ? size : action.position.row;
    var column = action.position.column === null || action.position.column === undefined ? size : action.position.column;
    return row * size + column;
  }

  function compareActions(left, right, size) {
    if (left.efficiency !== right.efficiency) return right.efficiency - left.efficiency;
    if (left.expectedSwordSaving !== right.expectedSwordSaving) return right.expectedSwordSaving - left.expectedSwordSaving;
    if (left.preserveRank !== right.preserveRank) return left.preserveRank - right.preserveRank;
    if (left.failureCompactness !== right.failureCompactness) return right.failureCompactness - left.failureCompactness;
    if (left.affectedCells.length !== right.affectedCells.length) return right.affectedCells.length - left.affectedCells.length;
    if (left.toolId !== right.toolId) return left.toolId.localeCompare(right.toolId);
    return positionOrder(left, size) - positionOrder(right, size);
  }

  function analyzeCurrentBoard(input, data) {
    var source = input && typeof input === "object" ? input : {};
    var floor = boundedInteger(source.floor, 1, data.maxFloor, 1);
    var tier = tierForFloor(floor, data);
    var size = tier.boardSize;
    var opened = normalizeOpenedCells(source.openedCells, tier.cellCount);
    var openedLookup = {};
    opened.forEach(function (cell) { openedLookup[cell] = true; });
    var unopened = [];
    for (var cell = 0; cell < tier.cellCount; cell += 1) {
      if (!openedLookup[cell]) unopened.push(cell);
    }
    var remaining = unopened.length;
    var pureSwordExpected = remaining ? (remaining + 1) / 2 : 0;
    var resources = normalizeResources(source.resources, data);
    var allowed = source.allowedTools && typeof source.allowedTools === "object" ? source.allowedTools : {};
    var context = { tier: tier, size: size, remaining: remaining, pureSwordExpected: pureSwordExpected, unopened: unopened, data: data };
    var actions = [];

    function canUse(toolId) {
      return allowed[toolId] !== false && resources[toolId] >= toolCost(toolId, tier) && remaining > 0;
    }

    if (canUse("woodSword")) actions.push(makeAction("woodSword", unopened.slice(0, 1), null, context));
    if (canUse("mirror")) actions.push(makeAction("mirror", unopened.slice(0, 1), null, context));
    if (canUse("ironSword")) actions.push(makeAction("ironSword", unopened.slice(), null, context));
    if (canUse("bomb")) actions.push(makeAction("bomb", unopened.slice(0, Math.min(5, remaining)), null, context));

    if (canUse("horizontalQi")) {
      for (var row = 0; row < size; row += 1) {
        var rowCells = unopened.filter(function (candidate) { return Math.floor(candidate / size) === row; });
        if (rowCells.length) actions.push(makeAction("horizontalQi", rowCells, { type: "row", row: row, column: null }, context));
      }
    }
    if (canUse("verticalQi")) {
      for (var column = 0; column < size; column += 1) {
        var columnCells = unopened.filter(function (candidate) { return candidate % size === column; });
        if (columnCells.length) actions.push(makeAction("verticalQi", columnCells, { type: "column", row: null, column: column }, context));
      }
    }
    if (canUse("crossQi")) {
      for (var crossRow = 0; crossRow < size; crossRow += 1) {
        for (var crossColumn = 0; crossColumn < size; crossColumn += 1) {
          var crossCells = unopened.filter(function (candidate) {
            return Math.floor(candidate / size) === crossRow || candidate % size === crossColumn;
          });
          if (crossCells.length) actions.push(makeAction("crossQi", crossCells, { type: "cross", row: crossRow, column: crossColumn }, context));
        }
      }
    }

    actions.sort(function (left, right) { return compareActions(left, right, size); });
    actions.forEach(function (action) {
      delete action.efficiency;
      delete action.failureCompactness;
      delete action.preserveRank;
    });
    return {
      floor: floor,
      boardSize: size,
      remaining: remaining,
      pureSwordExpected: pureSwordExpected,
      actions: actions,
      recommendation: actions.length ? clone(actions[0]) : null
    };
  }

  return {
    clone: clone,
    nonNegativeInteger: nonNegativeInteger,
    tierForFloor: tierForFloor,
    boardCellCount: boardCellCount,
    normalizeResources: normalizeResources,
    normalizePackages: normalizePackages,
    normalizeStageLimits: normalizeStageLimits,
    normalizeProgress: normalizeProgress,
    advanceFloor: advanceFloor,
    remainingDays: remainingDays,
    analyzeCurrentBoard: analyzeCurrentBoard
  };
});
