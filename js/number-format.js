(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QinshiNumberFormat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Intl retains rounding, fraction padding and BigInt precision; only the
  // presentation grouping changes. No values or global formatters are mutated.
  var formatters = new Map();
  function format(value, options) {
    var settings = Object.assign({}, options, { useGrouping: false });
    var key = JSON.stringify(settings);
    var formatter = formatters.get(key);
    if (!formatter) {
      formatter = new Intl.NumberFormat("zh-CN", settings);
      formatters.set(key, formatter);
    }
    return formatter.formatToParts(value).map(function (part) {
      return part.type === "integer" && (!options || options.useGrouping !== false)
        ? part.value.replace(/\B(?=(\d{4})+(?!\d))/g, ",")
        : part.value;
    }).join("");
  }

  // Reference cells contain literal numeric text, sometimes mixed with units.
  // Regroup digits directly so neither large integers nor decimal tails round.
  function formatText(value) {
    return String(value == null ? "" : value).replace(/\d+(?:,\d+)*(?:\.\d+)?/g, function (token) {
      if (token.indexOf(",") !== -1 && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(token) && !/^\d{1,4}(?:,\d{4})+(?:\.\d+)?$/.test(token)) return token;
      var parts = token.replace(/,/g, "").split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{4})+(?!\d))/g, ",");
      return parts.join(".");
    });
  }

  return { format: format, formatText: formatText };
});
