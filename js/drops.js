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

  return {
    normalize: normalize,
    findDrops: findDrops,
    groupDrops: groupDrops
  };
});
