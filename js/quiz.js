(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QUIZ = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function search(items, query) {
    var keyword = normalize(query);
    if (!keyword) return (items || []).slice();
    return (items || []).filter(function (item) {
      return normalize(item.question).indexOf(keyword) !== -1;
    });
  }

  return { search: search };
});
