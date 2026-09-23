/** Public deployment configuration only. Never put credentials here. */
(function (root) {
  "use strict";
  var config = Object.freeze({ enabled: true, apiBaseUrl: "https://qin-cloud-sync.qin-cloud-sync-worker.workers.dev" });
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.QinshiCloudSyncConfig = config;
})(typeof globalThis !== "undefined" ? globalThis : this);
