(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.INSCRIPTION_PERFORMANCE = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var MODES = ["progress", "query", "reference", "crafting-paths", "crafting-simulator", "crafting-favorites"];

  function createQueryBatchRenderer(options) {
    var schedule = options.schedule || function (callback) { return setTimeout(callback, 16); };
    var cancelJob = options.cancel || function (id) { clearTimeout(id); };
    var batchSize = options.batchSize || 12;
    var pending = null, generation = 0, running = false;
    function cancel() {
      if (!running) return false;
      generation += 1;
      if (pending !== null) cancelJob(pending);
      pending = null;
      running = false;
      if (options.onCancel) options.onCancel();
      return true;
    }
    function render(items) {
      cancel();
      var version = ++generation, index = 0;
      running = true;
      function append() {
        pending = null;
        if (version !== generation) return;
        if (options.isCurrent && !options.isCurrent()) { cancel(); return; }
        var end = Math.min(index + batchSize, items.length);
        options.renderBatch(items.slice(index, end), index === 0);
        index = end;
        if (index < items.length) pending = schedule(append, 16);
        else {
          running = false;
          if (options.onComplete) options.onComplete();
        }
      }
      append();
    }
    return { render: render, cancel: cancel };
  }

  function createRenderCoordinator(options) {
    options = options || {};
    var renderers = options.renderers || {};
    var schedule = options.schedule || function (callback, delay) { return setTimeout(callback, delay); };
    var cancel = options.cancel || function (id) { clearTimeout(id); };
    var queryDelay = Number(options.queryDelay) || 120;
    var activeMode = "";
    var pendingQuery = null;
    var rendered = {}, dirty = {};
    MODES.forEach(function (mode) { rendered[mode] = false; dirty[mode] = true; });

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
      if (pendingQuery !== null) {
        cancel(pendingQuery);
        pendingQuery = null;
      }
      if (options.cancelQueryRender && options.cancelQueryRender()) dirty.query = true;
    }

    function activate(mode) {
      assertMode(mode);
      if (activeMode === "query" && mode !== "query") cancelPendingQuery();
      activeMode = mode;
      return renderMode(mode);
    }

    function markDirty(mode) {
      assertMode(mode);
      if (mode === "query") cancelPendingQuery();
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

  return { createRenderCoordinator: createRenderCoordinator, createQueryBatchRenderer: createQueryBatchRenderer };
});
