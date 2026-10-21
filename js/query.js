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
    return String(s == null ? "" : s).trim().toLowerCase().replace(/[·・]/g, "");
  }

  function matchSearch(item, query) {
    var q = normalizeInput(query);
    if (!q) return true;
    return normalizeInput(item.name).indexOf(q) !== -1 ||
           normalizeInput(item.cat).indexOf(q) !== -1 ||
           (Array.isArray(item.searchAliases) && item.searchAliases.some(function (name) {
             return normalizeInput(name).indexOf(q) !== -1;
           }));
  }

  function mainForTier(item, tier) {
    if (!item) return "";
    var overrides = item.mainByTier || {};
    return Object.prototype.hasOwnProperty.call(overrides, tier) ? overrides[tier] : item.main || "";
  }

  function hasTierData(item, tier) {
    return [item.tiers, item.stages, item.stageSnapshots].some(function (source) {
      return source && Array.isArray(source[tier]) && source[tier].length > 0;
    });
  }

  function availableTierNames(item) {
    var names = [];
    [item.tiers, item.stages, item.stageSnapshots].forEach(function (source) {
      Object.keys(source || {}).forEach(function (tier) {
        if (names.indexOf(tier) === -1 && hasTierData(item, tier)) names.push(tier);
      });
    });
    return names;
  }

  function mainKeyForTier(item, tier) {
    var overrides = item.mainByTier || {};
    if (!Object.prototype.hasOwnProperty.call(overrides, tier) && item.mainKey) return item.mainKey;
    return String(mainForTier(item, tier)).split(/[、，,]/)[0].trim();
  }

  function mainDisplay(item, valueSource) {
    if (valueSource && valueSource !== "max") return mainForTier(item, valueSource);
    var base = item.main || "";
    if (!item.mainByTier) return base;
    var groups = [];
    var hasBase = false;
    availableTierNames(item).forEach(function (tier) {
      var value = mainForTier(item, tier);
      if (value === base) {
        hasBase = true;
        return;
      }
      var group = groups.find(function (entry) { return entry.value === value; });
      if (group) group.tiers.push(tier);
      else groups.push({ value: value, tiers: [tier] });
    });
    if (!groups.length) return base;
    var labels = groups.map(function (group) { return group.tiers.join("、") + "：" + group.value; });
    if (hasBase) labels.push("其他品质：" + base);
    return labels.join("；");
  }

  /** 主属性筛选：main 为空/未提供表示不限；省略品质时兼容最高值模式。 */
  function matchMain(item, main, valueSource) {
    if (main == null || main === "") return true;
    if (valueSource && valueSource !== "max") {
      return hasTierData(item, valueSource) && mainKeyForTier(item, valueSource) === main;
    }
    if (!item.mainByTier) return mainKeyForTier(item) === main;
    return availableTierNames(item).some(function (tier) { return mainKeyForTier(item, tier) === main; });
  }

  /** 分类筛选：null/undefined 表示全部，空字符串表示“除典籍外” */
  function matchCategory(item, category) {
    if (category == null) return true;
    if (category === "") return BOOK_CATEGORIES.indexOf(item.cat) === -1;
    return item.cat === category;
  }

  function nextEquipmentCategoryState(currentState, selectedCategory, favoritesCategory) {
    currentState = currentState || {};
    var category = currentState.category == null ? null : currentState.category;
    var favoritesOnly = !!currentState.favoritesOnly;
    if (selectedCategory === favoritesCategory) {
      return { category: category, favoritesOnly: !favoritesOnly };
    }
    return {
      category: category === selectedCategory ? null : selectedCategory,
      favoritesOnly: favoritesOnly
    };
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
    var snapshots = item.stageSnapshots || {};
    return Object.keys(snapshots).some(function (tier) {
      return snapshots[tier].some(function (stage) {
        return (stage.tokens || []).some(function (token) { return tokenMatches(token, attr); });
      });
    });
  }

  function matchFilters(item, filters) {
    for (var i = 0; i < filters.length; i++) {
      if (!hasSubAttr(item, filters[i])) return false;
    }
    return true;
  }

  function numberText(value) {
    return String(Number(value));
  }

  function cumulativeRaw(token, value) {
    if (token.t === "速") return numberText(value) + "速";
    if (token.t.indexOf("敌方减") === 0) {
      return "敌方-" + numberText(value) + "%" + token.t.slice(3);
    }
    return numberText(value) + "%" + token.t;
  }

  /**
   * 返回典籍同一品质逐阶累计后的快照；源数据与不同品质均保持不变。
   * 仅数值词条参与累计，首次出现的词条顺序和复合属性 matches 会被保留。
   */
  function cumulativeBookStages(item, tier) {
    var snapshots = item && item.stageSnapshots && item.stageSnapshots[tier];
    if (Array.isArray(snapshots) && snapshots.length) return JSON.parse(JSON.stringify(snapshots));
    var source = item && item.stages && item.stages[tier] || [];
    var totals = Object.create(null);
    var order = [];
    return source.map(function (stage) {
      (stage.tokens || []).forEach(function (token) {
        if (!token.t || typeof token.v !== "number") return;
        if (!totals[token.t]) {
          totals[token.t] = Object.assign({}, token, { v: 0 });
          order.push(token.t);
        }
        totals[token.t].v += token.v;
        totals[token.t].raw = cumulativeRaw(totals[token.t], totals[token.t].v);
      });
      return {
        stage: stage.stage,
        tokens: order.map(function (key) { return Object.assign({}, totals[key]); })
      };
    });
  }

  function finalBookStage(item, tier) {
    var stages = cumulativeBookStages(item, tier);
    return stages.length ? stages[stages.length - 1] : null;
  }

  /** 返回用于排序的真实 token；无值返回 null。 */
  function sortToken(item, attr, valueSource) {
    if (item.bookGroup) {
      var stageTiers = item.stages || {};
      var snapshotTiers = item.stageSnapshots || {};
      var bookTierNames = valueSource === "max" ? Object.keys(stageTiers).concat(Object.keys(snapshotTiers)).filter(function (tier, index, names) {
        return names.indexOf(tier) === index;
      }) : [valueSource];
      var bookBest = null;
      for (var bookTierIndex = 0; bookTierIndex < bookTierNames.length; bookTierIndex++) {
        var finalStage = finalBookStage(item, bookTierNames[bookTierIndex]);
        var finalTokens = finalStage ? finalStage.tokens : [];
        for (var bookTokenIndex = 0; bookTokenIndex < finalTokens.length; bookTokenIndex++) {
          var bookToken = finalTokens[bookTokenIndex];
          if (tokenMatches(bookToken, attr) && typeof bookToken.v === "number" && (bookBest === null || bookToken.v > bookBest.v)) {
            bookBest = bookToken;
          }
        }
      }
      return bookBest;
    }

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
    var category = opts.category;
    var main = opts.main == null ? "" : opts.main;
    var filters = opts.filters || [];
    var sortAttr = opts.sortAttr || (filters.length ? filters[0] : null);
    var valueSource = opts.valueSource || "max";

    var result = [];
    for (var i = 0; i < items.length; i++) {
      if (matchSearch(items[i], search) && matchCategory(items[i], category) && matchMain(items[i], main, valueSource) && matchFilters(items[i], filters)) {
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
    nextEquipmentCategoryState: nextEquipmentCategoryState,
    mainForTier: mainForTier,
    mainDisplay: mainDisplay,
    matchMain: matchMain,
    hasSubAttr: hasSubAttr,
    tokenMatches: tokenMatches,
    matchFilters: matchFilters,
    cumulativeBookStages: cumulativeBookStages,
    finalBookStage: finalBookStage,
    sortToken: sortToken,
    sortValue: sortValue,
    queryItems: queryItems
  };
});
