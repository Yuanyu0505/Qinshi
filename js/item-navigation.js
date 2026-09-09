(function (root, factory) {
  var equipmentForging = typeof module === "object" && module.exports
    ? require("./equipment-forging.js")
    : root.EquipmentForging;
  var api = factory(equipmentForging);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ItemNavigation = api;
})(typeof self !== "undefined" ? self : this, function (equipmentForging) {
  "use strict";

  var ACTIONS = {
    equipment: [
      { id: "atlas", label: "前往图鉴分区查询" },
      { id: "forging", label: "前往橙装锻造分区查询" },
      { id: "drops", label: "前往关卡掉落分区查询" },
      { id: "forbidden", label: "前往禁地分区查询" }
    ],
    forging: [
      { id: "forging-progress", label: "前往个人进度查询" },
      { id: "atlas", label: "前往图鉴分区查询" },
      { id: "drops", label: "前往关卡掉落分区查询" },
      { id: "equipment", label: "前往装备属性分区查询" },
      { id: "forbidden", label: "前往禁地分区查询" },
      { id: "zhulu", label: "前往逐鹿分区查询" }
    ],
    drops: [
      { id: "atlas", label: "前往图鉴分区查询" },
      { id: "forging", label: "前往橙装锻造分区查询" },
      { id: "equipment", label: "前往装备属性分区查询" }
    ],
    zhulu: [
      { id: "seasons", label: "查看出现赛季" },
      { id: "forging", label: "前往橙装锻造分区查询" },
      { id: "atlas", label: "前往图鉴分区查询" },
      { id: "equipment", label: "前往装备属性分区查询" }
    ]
  };

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value == null ? "" : value).trim();
  }

  function findEquipment(name, equipmentItems) {
    return (Array.isArray(equipmentItems) ? equipmentItems : []).find(function (item) {
      return item && item.name === name;
    }) || null;
  }

  function resolveItem(clickedName, equipmentItems, forgingItems) {
    var name = normalize(clickedName);
    if (!name) return null;
    var forgeKey = equipmentForging.resolveForgeTarget(name, forgingItems) || name;
    var equipment = null;
    if (name === "鬼谷子" || name === "神兵鬼谷子") {
      equipment = findEquipment(name, equipmentItems);
    } else {
      equipment = equipmentForging.resolveEquipmentTarget(forgeKey, equipmentItems, forgingItems);
    }
    return {
      clickedName: name,
      forgeKey: forgeKey,
      equipmentName: equipment ? equipment.name : name,
      familyKey: forgeKey
    };
  }

  function actionsForSource(source) {
    return clone(ACTIONS[source] || []);
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce(function (result, key) {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function captureFingerprint(value) {
    return JSON.stringify(stableValue(value == null ? null : value));
  }

  function shouldRestoreDestination(frame, currentView) {
    return Boolean(frame && frame.destinationAppliedFingerprint &&
      frame.destinationAppliedFingerprint === captureFingerprint(currentView));
  }

  function createStack() {
    var frames = [];
    return {
      push: function (frame) {
        frames.push(clone(frame));
        return frames.length;
      },
      pop: function () {
        return frames.length ? clone(frames.pop()) : null;
      },
      peek: function () {
        return frames.length ? clone(frames[frames.length - 1]) : null;
      },
      clear: function () {
        frames = [];
      },
      size: function () {
        return frames.length;
      }
    };
  }

  return {
    resolveItem: resolveItem,
    actionsForSource: actionsForSource,
    captureFingerprint: captureFingerprint,
    shouldRestoreDestination: shouldRestoreDestination,
    createStack: createStack
  };
});
