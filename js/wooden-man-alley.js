(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WOODEN_MAN_ALLEY_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function nonNegativeInteger(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return fallback === undefined ? 0 : fallback;
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
    remainingDays: remainingDays
  };
});
