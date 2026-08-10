/**
 * 特殊属性装备 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.QSQuery；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.QSQuery = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CATEGORY_ORDER = ["武器", "防具", "饰品", "神兵武器", "神兵防具", "神兵饰品"];
  var TIER_ORDER = ["橙色", "橙金", "红色", "红金"];
  var VALUE_SOURCES = ["max", "红色", "红金"];

  function normalizeInput(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function matchSearch(item, query) {
    var q = normalizeInput(query);
    if (!q) return true;
    return item.name.toLowerCase().indexOf(q) !== -1 ||
           item.cat.toLowerCase().indexOf(q) !== -1;
  }

  /** 主属性筛选：main 为空/未提供表示不限 */
  function matchMain(item, main) {
    return main == null || main === "" || item.main === main;
  }

  /** 分类筛选：为空/未提供表示不限 */
  function matchCategory(item, category) {
    return category == null || category === "" || item.cat === category;
  }

  /** 副属性命中：只查各档位 token，主属性不算 */
  function hasSubAttr(item, attr) {
    for (var i = 0; i < TIER_ORDER.length; i++) {
      var tokens = item.tiers[TIER_ORDER[i]] || [];
      for (var j = 0; j < tokens.length; j++) {
        if (tokens[j].t === attr) return true;
      }
    }
    return false;
  }

  function matchFilters(item, filters) {
    for (var i = 0; i < filters.length; i++) {
      if (!hasSubAttr(item, filters[i])) return false;
    }
    return true;
  }

  /** valueSource: "max" | "红色" | "红金"；无值返回 null */
  function sortValue(item, attr, valueSource) {
    if (valueSource === "max") {
      var v = item.max && item.max[attr];
      return typeof v === "number" ? v : null;
    }
    var tokens = item.tiers[valueSource] || [];
    var best = null;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (tk.t === attr && typeof tk.v === "number") {
        best = best === null ? tk.v : Math.max(best, tk.v);
      }
    }
    return best;
  }

  function catIndex(cat) {
    var i = CATEGORY_ORDER.indexOf(cat);
    return i === -1 ? CATEGORY_ORDER.length : i;
  }

  function queryItems(items, opts) {
    opts = opts || {};
    var search = opts.search || "";
    var category = opts.category == null ? "" : opts.category;
    var main = opts.main == null ? "" : opts.main;
    var filters = opts.filters || [];
    var sortAttr = opts.sortAttr || (filters.length ? filters[0] : null);
    var valueSource = opts.valueSource || "max";

    var result = [];
    for (var i = 0; i < items.length; i++) {
      if (matchSearch(items[i], search) && matchCategory(items[i], category) && matchMain(items[i], main) && matchFilters(items[i], filters)) {
        result.push(items[i]);
      }
    }

    result.sort(function (a, b) {
      if (filters.length === 0) {
        return catIndex(a.cat) - catIndex(b.cat) || a.id.localeCompare(b.id);
      }
      var va = sortValue(a, sortAttr, valueSource);
      var vb = sortValue(b, sortAttr, valueSource);
      if (va !== null && vb !== null && va !== vb) return vb - va;
      if (va === null && vb !== null) return 1;
      if (vb === null && va !== null) return -1;
      return catIndex(a.cat) - catIndex(b.cat) || a.id.localeCompare(b.id);
    });
    return result;
  }

  return {
    CATEGORY_ORDER: CATEGORY_ORDER,
    TIER_ORDER: TIER_ORDER,
    VALUE_SOURCES: VALUE_SOURCES,
    normalizeInput: normalizeInput,
    matchSearch: matchSearch,
    matchCategory: matchCategory,
    matchMain: matchMain,
    hasSubAttr: hasSubAttr,
    matchFilters: matchFilters,
    sortValue: sortValue,
    queryItems: queryItems
  };
});
