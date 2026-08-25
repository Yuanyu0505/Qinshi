(function (root, factory) {
  var query = root && root.QSQuery;
  if (typeof module === "object" && module.exports) query = require("./query.js");
  var api = factory(query);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QSEquipmentCompare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Q) {
  "use strict";

  var ATTRIBUTE_ORDER = [
    "攻", "血", "防", "攻防血", "穿透", "暴击", "暴伤", "技免", "抗暴", "速",
    "闪避", "招架", "敌方减攻", "敌方减防", "敌方减血"
  ];
  var CATEGORY_GROUPS = {
    "武器": "武器", "神兵武器": "武器",
    "防具": "防具", "神兵防具": "防具",
    "饰品": "饰品", "神兵饰品": "饰品",
    "典籍": "典籍", "神兵典籍": "典籍"
  };
  var CORE_STATS = ["攻", "血", "防"];

  function numberText(value) {
    return String(Number(value));
  }

  function groupForCategory(category) {
    return CATEGORY_GROUPS[category] || null;
  }

  function tokensForTier(item, tier) {
    if (!item || !tier) return null;
    if (item.bookGroup) {
      var finalStage = Q.finalBookStage(item, tier);
      return finalStage ? finalStage.tokens.filter(function (token) { return typeof token.v === "number"; }) : null;
    }
    if (!item.tiers || !Object.prototype.hasOwnProperty.call(item.tiers, tier)) return null;
    return (item.tiers[tier] || []).filter(function (token) { return typeof token.v === "number"; });
  }

  function tokenDimensions(token) {
    if (!token || typeof token.v !== "number") return [];
    if (token.t === "攻防血") return ["攻", "血", "防", "攻防血"];
    return ATTRIBUTE_ORDER.indexOf(token.t) >= 0 ? [token.t] : [];
  }

  function availableDimensions(items, tier) {
    var found = Object.create(null);
    (items || []).forEach(function (item) {
      var tokens = tokensForTier(item, tier);
      (tokens || []).forEach(function (token) {
        tokenDimensions(token).forEach(function (dimension) { found[dimension] = true; });
      });
    });
    return ATTRIBUTE_ORDER.filter(function (dimension) { return found[dimension]; });
  }

  function dimensionValue(item, tier, dimension) {
    var tokens = tokensForTier(item, tier);
    if (tokens === null) return { available: false, value: null };
    var value = tokens.reduce(function (total, token) {
      if (dimension === "攻防血") return total + (token.t === "攻防血" ? token.v : 0);
      if (CORE_STATS.indexOf(dimension) >= 0) {
        return total + (token.t === dimension || token.t === "攻防血" ? token.v : 0);
      }
      return total + (Q.tokenMatches(token, dimension) ? token.v : 0);
    }, 0);
    return { available: true, value: value };
  }

  function valueDisplay(value, dimension) {
    var text = numberText(value);
    if (dimension === "速") return text + "速";
    if (dimension.indexOf("敌方减") === 0) return "敌方-" + text + "%" + dimension.slice(3);
    return text + "%";
  }

  function differenceDisplay(value, dimension) {
    if (!value) return "";
    return "-" + numberText(Math.abs(value)) + (dimension === "速" ? "速" : "%");
  }

  function compareItems(items, tier, dimensions) {
    var selectedDimensions = (dimensions || []).filter(function (dimension) {
      return ATTRIBUTE_ORDER.indexOf(dimension) >= 0;
    });
    var rawRows = (items || []).map(function (item) {
      var available = tokensForTier(item, tier) !== null;
      var rawValues = {};
      if (available) selectedDimensions.forEach(function (dimension) {
        rawValues[dimension] = dimensionValue(item, tier, dimension).value;
      });
      return { item: item, available: available, rawValues: rawValues };
    });
    var maxima = {};
    selectedDimensions.forEach(function (dimension) {
      var values = rawRows.filter(function (row) { return row.available; }).map(function (row) { return row.rawValues[dimension]; });
      maxima[dimension] = values.length ? Math.max.apply(null, values) : null;
    });
    return {
      tier: tier,
      dimensions: selectedDimensions,
      maxima: maxima,
      rows: rawRows.map(function (row) {
        var values = {};
        if (row.available) selectedDimensions.forEach(function (dimension) {
          var value = row.rawValues[dimension];
          var maximum = maxima[dimension];
          var difference = maximum === null ? 0 : value - maximum;
          values[dimension] = {
            value: value,
            isMax: maximum !== null && value === maximum,
            difference: difference,
            display: valueDisplay(value, dimension),
            differenceDisplay: differenceDisplay(difference, dimension)
          };
        });
        return { item: row.item, available: row.available, values: values };
      })
    };
  }

  return {
    ATTRIBUTE_ORDER: ATTRIBUTE_ORDER,
    groupForCategory: groupForCategory,
    tokensForTier: tokensForTier,
    availableDimensions: availableDimensions,
    dimensionValue: dimensionValue,
    compareItems: compareItems
  };
});
