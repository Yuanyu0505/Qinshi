(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QinshiCalculationRunner = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  var script = root.document && root.document.currentScript;
  var source = script && script.src;
  var workerUrl = source ? new root.URL("calculation-worker.js", source) : null;
  if (workerUrl) workerUrl.search = new root.URL(source).search;

  function abortError() { var error = new Error("计算已取消"); error.name = "AbortError"; return error; }
  function create(options) {
    var worker = null, pending = null, sequence = 0, unavailable = false;
    function stopWorker() {
      if (worker) worker.terminate();
      worker = null;
    }
    function cancel() {
      if (!pending) return;
      var job = pending;
      pending = null;
      if (job.timer !== null) root.clearTimeout(job.timer);
      stopWorker();
      job.reject(abortError());
    }
    function settle(job, error, result) {
      if (pending !== job) return;
      pending = null;
      if (error) job.reject(error); else job.resolve(result);
    }
    function fallback(job) {
      if (pending !== job) return;
      // These exact solvers can run for seconds. A timer does not make their
      // synchronous fallback interruptible; fail safely instead of freezing UI.
      if (options.kind === "beast-single" || options.kind === "beast-school") {
        settle(job, new Error("当前环境无法启动后台计算，已停止本次机关兽计算，可重新计算；若仍失败，请更新浏览器后重试。"));
        return;
      }
      job.timer = root.setTimeout(function () {
        job.timer = null;
        if (pending !== job) return;
        try { settle(job, null, options.fallback(job.input)); }
        catch (error) { settle(job, error); }
      }, 0);
    }
    function run(input) {
      cancel();
      return new Promise(function (resolve, reject) {
        var snapshot;
        try { snapshot = typeof root.structuredClone === "function" ? root.structuredClone(input) : JSON.parse(JSON.stringify(input)); }
        catch (error) { reject(error); return; }
        var job = { id: ++sequence, input: snapshot, resolve: resolve, reject: reject, timer: null };
        pending = job;
        // Beast failures end this run only: the next explicit run may create one
        // fresh Worker. Other calculators retain their permanent fallback policy.
        var retryWorker = options.kind === "beast-single" || options.kind === "beast-school";
        if ((unavailable && !retryWorker) || !workerUrl || typeof root.Worker !== "function" || (root.location && root.location.protocol === "file:")) {
          fallback(job); return;
        }
        try {
          if (!worker) worker = new root.Worker(workerUrl.href);
          worker.onmessage = function (event) {
            if (pending !== job || !event.data || event.data.id !== job.id) return;
            if (event.data.error) settle(job, new Error(event.data.error));
            else settle(job, null, event.data.result);
          };
          worker.onerror = function (event) {
            if (event.preventDefault) event.preventDefault();
            if (pending !== job) return;
            unavailable = true;
            stopWorker();
            fallback(job);
          };
          worker.postMessage({ id: job.id, kind: options.kind, input: snapshot });
        } catch (error) {
          unavailable = true;
          stopWorker();
          fallback(job);
        }
      });
    }
    return { run: run, cancel: cancel, dispose: function () { cancel(); stopWorker(); } };
  }
  return { create: create };
});
