(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.INSCRIPTION_PERFORMANCE = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var MODES = ["progress", "query", "reference"];

  function createRenderCoordinator(options) {
    options = options || {};
    var renderers = options.renderers || {};
    var schedule = options.schedule || function (callback, delay) { return setTimeout(callback, delay); };
    var cancel = options.cancel || function (id) { clearTimeout(id); };
    var queryDelay = Number(options.queryDelay) || 120;
    var activeMode = "";
    var pendingQuery = null;
    var rendered = { progress: false, query: false, reference: false };
    var dirty = { progress: true, query: true, reference: true };

    function assertMode(mode) {
      if (MODES.indexOf(mode) === -1) throw new Error("Unknown inscription mode: " + mode);
    }

    function renderMode(mode) {
      assertMode(mode);
      if (rendered[mode] && !dirty[mode]) return false;
      if (typeof renderers[mode] !== "function") return false;
      renderers[mode]();
      rendered[mode] = true;
      dirty[mode] = false;
      return true;
    }

    function cancelPendingQuery() {
      if (pendingQuery === null) return;
      cancel(pendingQuery);
      pendingQuery = null;
    }

    function activate(mode) {
      assertMode(mode);
      if (activeMode === "query" && mode !== "query") cancelPendingQuery();
      activeMode = mode;
      return renderMode(mode);
    }

    function markDirty(mode) {
      assertMode(mode);
      dirty[mode] = true;
    }

    function invalidate(mode) {
      markDirty(mode);
      return activeMode === mode ? renderMode(mode) : false;
    }

    function scheduleQuery() {
      markDirty("query");
      if (activeMode !== "query") return;
      cancelPendingQuery();
      pendingQuery = schedule(function () {
        pendingQuery = null;
        renderMode("query");
      }, queryDelay);
    }

    return {
      activate: activate,
      invalidate: invalidate,
      markDirty: markDirty,
      scheduleQuery: scheduleQuery,
      cancelPendingQuery: cancelPendingQuery
    };
  }

  return { createRenderCoordinator: createRenderCoordinator };
});
