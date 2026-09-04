(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.UI_PERFORMANCE = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function createRefreshQueue(render, delay) {
    var pending = null;
    function cancel() {
      if (pending !== null) clearTimeout(pending);
      pending = null;
    }
    function flush() {
      cancel();
      render();
    }
    function schedule() {
      cancel();
      pending = setTimeout(flush, delay == null ? 120 : delay);
    }
    return { schedule: schedule, cancel: cancel, flush: flush };
  }

  function bindInput(element, update, queue) {
    var composing = false;
    element.addEventListener("compositionstart", function () {
      composing = true;
      queue.cancel();
    });
    element.addEventListener("input", function (event) {
      update(event);
      if (!composing && !event.isComposing) queue.schedule();
    });
    element.addEventListener("compositionend", function (event) {
      composing = false;
      update(event);
      queue.schedule();
    });
  }

  return { createRefreshQueue: createRefreshQueue, bindInput: bindInput };
});
