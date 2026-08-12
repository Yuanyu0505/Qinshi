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

  var CATEGORY_ORDER = ["武器", "防具", "饰品", "典籍", "神兵武器", "神兵防具", "神兵饰品", "神兵典籍"];
  var TIER_ORDER = ["橙色", "橙金", "红色", "红金"];
  var VALUE_SOURCES = ["max", "橙金", "红色", "红金"];
  var BOOK_CATEGORIES = ["典籍", "神兵典籍"];

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
    return main == null || main === "" || (item.mainKey || item.main) === main;
  }

  /** 分类筛选：为空/未提供表示“除典籍外” */
  function matchCategory(item, category) {
    if (category == null || category === "") return BOOK_CATEGORIES.indexOf(item.cat) === -1;
    return item.cat === category;
  }

  function tokenMatches(token, attr) {
    return token.t === attr || (Array.isArray(token.matches) && token.matches.indexOf(attr) !== -1);
  }

  /** 副属性命中：只查各档位 token，主属性不算 */
  function hasSubAttr(item, attr) {
    var tiers = item.tiers || {};
    var tierNames = Object.keys(tiers);
    for (var i = 0; i < tierNames.length; i++) {
      var tokens = tiers[tierNames[i]] || [];
      for (var j = 0; j < tokens.length; j++) {
        if (tokenMatches(tokens[j], attr)) return true;
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

  /** 返回用于排序的真实 token；无值返回 null。 */
  function sortToken(item, attr, valueSource) {
    var tiers = item.tiers || {};
    var tierNames = valueSource === "max" ? Object.keys(tiers) : [valueSource];
    var best = null;
    for (var i = 0; i < tierNames.length; i++) {
      var tokens = tiers[tierNames[i]] || [];
      for (var j = 0; j < tokens.length; j++) {
        var tk = tokens[j];
        if (tokenMatches(tk, attr) && typeof tk.v === "number" && (best === null || tk.v > best.v)) {
          best = tk;
        }
      }
    }
    return best;
  }

  /** valueSource: "max" | "橙金" | "红色" | "红金"；无值返回 null */
  function sortValue(item, attr, valueSource) {
    var token = sortToken(item, attr, valueSource);
    return token ? token.v : null;
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
      var orderA = typeof a.sourceOrder === "number" ? a.sourceOrder : null;
      var orderB = typeof b.sourceOrder === "number" ? b.sourceOrder : null;
      if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
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
    tokenMatches: tokenMatches,
    matchFilters: matchFilters,
    sortToken: sortToken,
    sortValue: sortValue,
    queryItems: queryItems
  };
});
