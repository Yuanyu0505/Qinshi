(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.WOODEN_MAN_ALLEY_UI = api;
    if (root.document) root.document.addEventListener("DOMContentLoaded", function () { api.init(root); });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORE_KEY = "qinshi_wooden_man_alley_progress_v1";

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function createController(options) {
    var data = options.data;
    var core = options.core;
    var planner = options.planner;
    var store = options.store;
    var confirmAction = options.confirm || function () { return true; };
    var state = {
      mode: "progress",
      progress: core.normalizeProgress({}, data),
      calculatorDraft: null,
      calculatorResult: null,
      undo: [],
      error: ""
    };

    function load() {
      var raw = null;
      try {
        raw = store && store.getItem ? store.getItem(STORE_KEY) : null;
        state.progress = core.normalizeProgress(raw ? JSON.parse(raw) : {}, data);
      } catch (error) {
        state.progress = core.normalizeProgress({}, data);
        state.error = "木人巷个人进度读取失败，已使用空白数据。";
      }
      state.calculatorDraft = clone(state.progress);
      return state.progress;
    }

    function save() {
      try {
        if (!store || !store.setItem) throw new Error("账号存储不可用");
        var saved = store.setItem(STORE_KEY, JSON.stringify(state.progress));
        if (saved === false) throw new Error("当前账号为只读状态");
        state.error = "";
        return true;
      } catch (error) {
        state.error = "木人巷个人进度保存失败，请检查账号状态或浏览器存储空间。";
        return false;
      }
    }

    function pushUndo() {
      state.undo.push({ currentFloor: state.progress.currentFloor, completedAllFloors: state.progress.completedAllFloors, openedCells: state.progress.openedCells.slice() });
      if (state.undo.length > 20) state.undo.shift();
    }

    function toggleCell(index) {
      if (state.progress.completedAllFloors) return false;
      var count = core.boardCellCount(state.progress.currentFloor, data);
      var cell = Number(index);
      if (!Number.isInteger(cell) || cell < 0 || cell >= count) return false;
      pushUndo();
      var position = state.progress.openedCells.indexOf(cell);
      if (position === -1) state.progress.openedCells.push(cell);
      else state.progress.openedCells.splice(position, 1);
      state.progress.openedCells.sort(function (left, right) { return left - right; });
      if (state.progress.openedCells.length === count && confirmAction("本层所有木人均已击破，是否确认已取得最终大奖并进入下一层？")) {
        state.progress = core.advanceFloor(state.progress, data);
      }
      save();
      return true;
    }

    function undoBoard() {
      var previous = state.undo.pop();
      if (!previous) return false;
      state.progress.currentFloor = previous.currentFloor;
      state.progress.completedAllFloors = previous.completedAllFloors;
      state.progress.openedCells = previous.openedCells;
      save();
      return true;
    }

    function clearBoard() {
      if (!state.progress.openedCells.length) return true;
      if (!confirmAction("清空当前层所有已击破记录？")) return false;
      pushUndo();
      state.progress.openedCells = [];
      return save();
    }

    function completeFloor() {
      if (state.progress.completedAllFloors) return false;
      if (!confirmAction("确认已取得第" + state.progress.currentFloor + "层最终大奖？确认后将进入下一层。")) return false;
      pushUndo();
      state.progress = core.advanceFloor(state.progress, data);
      return save();
    }

    function setFloor(value) {
      var floor = Math.max(1, Math.min(data.maxFloor, Math.floor(Number(value) || 1)));
      if (floor !== state.progress.currentFloor && !confirmAction("更改当前层数将清空本层格子记录，是否继续？")) return false;
      pushUndo();
      state.progress.currentFloor = floor;
      state.progress.completedAllFloors = false;
      state.progress.openedCells = [];
      return save();
    }

    function setActivityEndDate(value) {
      state.progress.activityEndDate = String(value || "").trim();
      return save();
    }

    function setResource(key, value) {
      if (data.resourceKeys.indexOf(key) === -1) return false;
      state.progress.resources[key] = core.nonNegativeInteger(value);
      return save();
    }

    function setPackageField(id, field, value) {
      if (!state.progress.packages[id] || ["price", "swords", "mysteryBoxes", "limit", "purchased"].indexOf(field) === -1) return false;
      state.progress.packages[id][field] = core.nonNegativeInteger(value);
      state.progress.packages[id] = core.normalizePackages((function () {
        var source = {}; source[id] = state.progress.packages[id]; return source;
      })(), { defaultPackages: data.defaultPackages.filter(function (item) { return item.id === id; }) })[id];
      return save();
    }

    function clearEvent() {
      if (!confirmAction("清空当前账号的全部木人巷数据？此操作无法撤销。")) return false;
      state.progress = core.normalizeProgress({}, data);
      state.calculatorDraft = clone(state.progress);
      state.calculatorResult = null;
      state.undo = [];
      return save();
    }

    function setMode(mode) {
      if (["progress", "calculator", "reference"].indexOf(mode) !== -1) state.mode = mode;
      return state.mode;
    }

    function setCalculatorDraft(draft) { state.calculatorDraft = core.normalizeProgress(draft, data); }
    function saveCalculatorProgress() {
      if (!confirmAction("使用计算器中的数据覆盖当前账号木人巷个人进度？")) return false;
      state.progress = core.normalizeProgress(state.calculatorDraft, data);
      return save();
    }
    function accountLabel() {
      var account = store && store.currentAccount ? store.currentAccount() : null;
      return account ? account.name + " · " + account.server : "尚未创建游戏账号";
    }
    function captureView() { return { mode: state.mode }; }
    function restoreView(view) { setMode(view && view.mode || "progress"); return captureView(); }

    load();
    return {
      state: state,
      load: load,
      save: save,
      toggleCell: toggleCell,
      undoBoard: undoBoard,
      clearBoard: clearBoard,
      completeFloor: completeFloor,
      setFloor: setFloor,
      setActivityEndDate: setActivityEndDate,
      setResource: setResource,
      setPackageField: setPackageField,
      clearEvent: clearEvent,
      setMode: setMode,
      setCalculatorDraft: setCalculatorDraft,
      saveCalculatorProgress: saveCalculatorProgress,
      accountLabel: accountLabel,
      captureView: captureView,
      restoreView: restoreView,
      planner: planner
    };
  }

  var active = null;
  var elements = null;

  function resourceLabel(key) {
    return {
      woodSword: "木剑", ironSword: "铁剑", horizontalQi: "横剑气", verticalQi: "纵剑气",
      crossQi: "十字剑气", bomb: "炸药", mirror: "铜镜", discountCoupon: "半价券",
      ingots: "可用元宝", mysteryBoxes: "秘匣"
    }[key] || key;
  }

  function renderBoard(data, core, progress) {
    if (progress.completedAllFloors) return '<div class="wooden-complete-state">500层已全部完成</div>';
    var tier = core.tierForFloor(progress.currentFloor, data);
    var opened = {};
    progress.openedCells.forEach(function (cell) { opened[cell] = true; });
    var cells = "";
    for (var index = 0; index < tier.cellCount; index += 1) {
      cells += '<button type="button" class="wooden-cell' + (opened[index] ? " is-opened" : "") + '" data-wooden-cell="' + index + '" aria-pressed="' + String(Boolean(opened[index])) + '">' +
        (opened[index] ? '<span aria-hidden="true">✓</span><span class="sr-only">已击破</span>' : '<span aria-hidden="true">木</span><span class="sr-only">未击破</span>') + '</button>';
    }
    return '<div class="wooden-board" style="--wooden-board-size:' + tier.boardSize + '" aria-label="第' + progress.currentFloor + '层木人棋盘">' + cells + '</div>';
  }

  function renderProgress(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var core = root.WOODEN_MAN_ALLEY_CORE;
    var progress = active.state.progress;
    var days = core.remainingDays(progress.activityEndDate);
    var resources = data.resourceKeys.map(function (key) {
      return '<label class="wooden-field"><span>' + escapeHtml(resourceLabel(key)) + '</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-resource="' + key + '" value="' + progress.resources[key] + '"></label>';
    }).join("");
    var packages = data.defaultPackages.map(function (defaults) {
      var item = progress.packages[defaults.id];
      return '<article class="wooden-package-card"><h4>' + escapeHtml(item.name) + '</h4><div class="wooden-package-fields">' +
        [["price", "价格（元）"], ["swords", "木剑"], ["mysteryBoxes", "秘匣"], ["limit", "限购"], ["purchased", "已购买"]].map(function (entry) {
          return '<label><span>' + entry[1] + '</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-package="' + item.id + '" data-package-field="' + entry[0] + '" value="' + item[entry[0]] + '"></label>';
        }).join("") + '</div></article>';
    }).join("");
    elements.progress.innerHTML = '<section class="panel wooden-account-panel"><div><span>当前游戏账号</span><strong>' + escapeHtml(active.accountLabel()) + '</strong></div>' +
      '<label class="wooden-end-date"><span>活动结束时间</span><input type="date" data-wooden-end-date value="' + escapeHtml(progress.activityEndDate) + '"></label>' +
      '<div><span>剩余时间</span><strong>' + (days === null ? "未设置" : days + "天") + '</strong></div></section>' +
      '<section class="panel wooden-current-panel"><div class="wooden-section-head"><div><span>当前进度</span><strong>' + (progress.completedAllFloors ? "500层已全部完成" : "第" + progress.currentFloor + "层") + '</strong></div>' +
      '<label><span>当前层数</span><input type="number" min="1" max="500" step="1" inputmode="numeric" data-wooden-floor value="' + progress.currentFloor + '"' + (progress.completedAllFloors ? " disabled" : "") + '></label></div>' +
      '<div class="wooden-board-layout"><div>' + renderBoard(data, core, progress) + '</div><aside class="wooden-board-actions"><strong>本层记录</strong><span>已击破 ' + progress.openedCells.length + ' / ' + core.boardCellCount(progress.currentFloor, data) + '</span>' +
      '<button type="button" class="seg active" data-wooden-action="complete"' + (progress.completedAllFloors ? " disabled" : "") + '>已取得本层最终大奖</button>' +
      '<button type="button" class="seg" data-wooden-action="undo"' + (!active.state.undo.length ? " disabled" : "") + '>撤销</button>' +
      '<button type="button" class="seg" data-wooden-action="clear-board"' + (!progress.openedCells.length ? " disabled" : "") + '>清空本层记录</button></aside></div></section>' +
      '<section class="panel"><div class="panel-title">当前资源</div><div class="wooden-resource-grid">' + resources + '</div></section>' +
      '<section class="panel"><div class="panel-title">礼包设置</div><p class="muted">秘匣内容暂未明确，只记录数量，不参与资源换算。</p><div class="wooden-package-grid">' + packages + '</div></section>' +
      '<div class="wooden-danger-actions"><button type="button" class="seg" data-wooden-action="clear-event">清空当前账号木人巷数据</button></div>';
  }

  function renderMode(root) {
    elements.modes.querySelectorAll("[data-wooden-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.woodenMode === active.state.mode);
    });
    elements.progress.hidden = active.state.mode !== "progress";
    elements.calculator.hidden = active.state.mode !== "calculator";
    elements.reference.hidden = active.state.mode !== "reference";
    if (active.state.mode === "progress") renderProgress(root);
    if (active.state.mode === "calculator" && !elements.calculator.innerHTML) elements.calculator.innerHTML = '<section class="panel"><div class="panel-title">目标计算</div><p class="muted">计算界面正在加载。</p></section>';
    if (active.state.mode === "reference" && !elements.reference.innerHTML) elements.reference.innerHTML = '<section class="panel"><div class="panel-title">资料图表</div><p class="muted">资料图表正在加载。</p></section>';
    elements.error.hidden = !active.state.error;
    elements.error.textContent = active.state.error;
  }

  function init(root) {
    if (!root || !root.document || !root.WOODEN_MAN_ALLEY_DATA || !root.WOODEN_MAN_ALLEY_CORE || !root.WOODEN_MAN_ALLEY_PLANNER || !root.QinshiAccounts) return null;
    var partition = root.document.getElementById("partition-wooden-man-alley");
    if (!partition || partition.dataset.woodenInitialized === "true") return active;
    elements = {
      partition: partition,
      modes: root.document.getElementById("wooden-man-modes"),
      error: root.document.getElementById("wooden-man-error"),
      progress: root.document.getElementById("wooden-man-progress"),
      calculator: root.document.getElementById("wooden-man-calculator"),
      reference: root.document.getElementById("wooden-man-reference")
    };
    active = createController({
      data: root.WOODEN_MAN_ALLEY_DATA,
      core: root.WOODEN_MAN_ALLEY_CORE,
      planner: root.WOODEN_MAN_ALLEY_PLANNER,
      store: root.QinshiAccounts,
      confirm: function (message) { return root.confirm(message); }
    });
    partition.dataset.woodenInitialized = "true";
    partition.addEventListener("click", function (event) {
      var mode = event.target.closest("[data-wooden-mode]");
      if (mode) { active.setMode(mode.dataset.woodenMode); renderMode(root); return; }
      var cell = event.target.closest("[data-wooden-cell]");
      if (cell) { active.toggleCell(cell.dataset.woodenCell); renderMode(root); return; }
      var action = event.target.closest("[data-wooden-action]");
      if (!action) return;
      if (action.dataset.woodenAction === "complete") active.completeFloor();
      if (action.dataset.woodenAction === "undo") active.undoBoard();
      if (action.dataset.woodenAction === "clear-board") active.clearBoard();
      if (action.dataset.woodenAction === "clear-event") active.clearEvent();
      renderMode(root);
    });
    partition.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches("[data-wooden-floor]")) active.setFloor(target.value);
      else if (target.matches("[data-wooden-end-date]")) active.setActivityEndDate(target.value);
      else if (target.matches("[data-wooden-resource]")) active.setResource(target.dataset.woodenResource, target.value);
      else if (target.matches("[data-wooden-package]")) active.setPackageField(target.dataset.woodenPackage, target.dataset.packageField, target.value);
      renderMode(root);
    });
    root.document.addEventListener("qinshi:partitionchange", function (event) {
      if (event.detail && event.detail.name === "wooden-man-alley") renderMode(root);
    });
    renderMode(root);
    return active;
  }

  function captureView() { return active ? active.captureView() : { mode: "progress" }; }
  function restoreView(view) {
    if (active) {
      active.restoreView(view);
      if (typeof window !== "undefined") renderMode(window);
    }
    return captureView();
  }

  return {
    STORE_KEY: STORE_KEY,
    createController: createController,
    init: init,
    captureView: captureView,
    restoreView: restoreView
  };
});
