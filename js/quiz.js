(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QUIZ = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function hasQuery(query) {
    return normalize(query) !== "";
  }

  function search(items, query) {
    var keyword = normalize(query);
    if (!keyword) return (items || []).slice();
    return (items || []).filter(function (item) {
      return normalize(item.question).indexOf(keyword) !== -1;
    });
  }

  function mergeItems(defaults, saved) {
    var defaultItems = Array.isArray(defaults) ? defaults : [];
    var savedItems = Array.isArray(saved) ? saved : [];
    var merged = [];
    var existingIds = {};

    savedItems.forEach(function (item, index) {
      var id = item.id || "custom-migrated-" + index;
      if (existingIds[id]) return;
      existingIds[id] = true;
      merged.push({ id: id, question: item.question, answer: item.answer });
    });

    defaultItems.forEach(function (item, index) {
      var id = "default-" + index;
      if (existingIds[id]) return;
      existingIds[id] = true;
      merged.push({ id: id, question: item.question, answer: item.answer });
    });

    return merged;
  }

  return { hasQuery: hasQuery, search: search, mergeItems: mergeItems };
});
