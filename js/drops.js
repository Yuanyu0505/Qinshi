/**
 * 关卡掉落 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.DROPS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DROPS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /** 按关键字统计三个区域（普通/英雄/声望）的掉落方式，保持原表顺序 */
  function findDrops(data, query) {
    var q = normalize(query);
    var out = { normal: [], hero: [], reward: [] };
    if (!q) return out;
    ["normal", "hero"].forEach(function (key) {
      data[key].forEach(function (e) {
        if (e.item.toLowerCase().indexOf(q) !== -1) out[key].push(e);
      });
    });
    data.reward.forEach(function (e) {
      if (e.item.toLowerCase().indexOf(q) !== -1) out.reward.push(e);
    });
    return out;
  }

  /** 按道具分组：先道具名，再给出该道具在普通/英雄/声望的关卡，保持首次出现顺序 */
  function groupDrops(data, query) {
    var r = findDrops(data, query);
    var order = [];
    var groups = {};
    function add(region, entries) {
      entries.forEach(function (e) {
        if (!groups[e.item]) {
          groups[e.item] = { item: e.item, normal: [], hero: [], reward: [] };
          order.push(e.item);
        }
        var g = groups[e.item];
        if (region === "normal") g.normal.push({ chapter: e.chapter, stage: e.stage });
        else if (region === "hero") g.hero.push({ chapter: e.chapter, stage: e.stage });
        else g.reward.push({ chapter: e.chapter });
      });
    }
    add("normal", r.normal);
    add("hero", r.hero);
    add("reward", r.reward);
    return order.map(function (k) { return groups[k]; });
  }

  // User-confirmed display names. These three machine-beast drops are fragments in every region.
  // Preserve archived source names/positions; never infer a body merely from an omitted suffix.
  var DISPLAY_ALIASES = {
    "醉梦": "醉梦罗裳", "升雪": "升雪凌霄衣", "星云": "星云法衣",
    "八爪铁蜈蚣": "八爪铁蜈蚣碎片", "机关蛇": "机关蛇碎片", "破土七郎": "破土七郎碎片"
  };
  function dropFamilyName(name) {
    var base = String(name == null ? "" : name).trim();
    return Object.prototype.hasOwnProperty.call(DISPLAY_ALIASES, base) ? DISPLAY_ALIASES[base] : base;
  }

  function groupRelatedDrops(data, query) {
    var q = normalize(query);
    if (!q) return [];
    var groups = new Map();
    ["normal", "hero", "reward"].forEach(function (region) {
      (data[region] || []).forEach(function (entry) {
        var family = dropFamilyName(entry.item);
        if (!groups.has(family)) groups.set(family, { item: family, items: [], normal: [], hero: [], reward: [] });
        var group = groups.get(family);
        if (group.items.indexOf(entry.item) === -1) group.items.push(entry.item);
        group[region].push(Object.assign({}, entry));
      });
    });
    return Array.from(groups.values()).filter(function (group) {
      return normalize(group.item).indexOf(q) !== -1 || group.items.some(function (name) { return normalize(name).indexOf(q) !== -1; });
    });
  }

  function resolveNavigationTarget(action, item) {
    var name = String(item == null ? "" : item).trim();
    if (!name) return null;
    var targets = {
      atlas: { target: "atlas", partition: "atlas", view: "query", mode: null },
      "forging-progress": { target: "forging-progress", partition: "forging", view: "progress", mode: null },
      "forging-main": { target: "forging-main", partition: "forging", view: "query", mode: "main" },
      "forging-material": { target: "forging-material", partition: "forging", view: "query", mode: "material" }
    };
    if (!targets[action]) return null;
    return Object.assign({}, targets[action], { item: name });
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce(function (result, key) {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function fingerprint(value) {
    return JSON.stringify(stableValue(value));
  }

  function createNavigationSession(target, sourceView, targetView, appliedTargetView) {
    return {
      target: target,
      sourceView: stableValue(sourceView || {}),
      targetView: stableValue(targetView || {}),
      appliedFingerprint: fingerprint(appliedTargetView || {})
    };
  }

  function shouldRestoreNavigationTarget(session, currentTargetView) {
    return Boolean(session && session.appliedFingerprint === fingerprint(currentTargetView || {}));
  }

  return {
    normalize: normalize,
    findDrops: findDrops,
    groupDrops: groupDrops,
    groupRelatedDrops: groupRelatedDrops,
    resolveNavigationTarget: resolveNavigationTarget,
    createNavigationSession: createNavigationSession,
    shouldRestoreNavigationTarget: shouldRestoreNavigationTarget
  };
});
