/** Public deployment configuration only. Never put credentials here. */
(function (root) {
  "use strict";
  var config = Object.freeze({ enabled: false, apiBaseUrl: "" });
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.QinshiCloudSyncConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this);
