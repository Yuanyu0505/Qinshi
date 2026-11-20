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
  var NUMBER_FORMAT = (typeof globalThis !== "undefined" && globalThis.QinshiNumberFormat) || (typeof require === "function" ? require("./number-format.js") : null);
  var editingInputs = new WeakSet();

  function nodeKey(node) {
    if (!node || node.nodeType !== 1) return "";
    var explicit = node.getAttribute("data-wooden-key") || node.id;
    if (explicit) return node.nodeName + ":" + explicit;
    var identity = Array.prototype.filter.call(node.attributes, function (attribute) {
      return /^data-(wooden-(?:resource|calc-resource|package|floor|end-date|target-input|quick-target|cell|stage-allowed|stage-max|limit-stage|action|calc-action|calc-direction|risk|target|advanced|include-packages|error-slot)|tier-id|tool-id|package-field)$/.test(attribute.name);
    }).map(function (attribute) { return [attribute.name, attribute.value]; })
      .sort(function (left, right) { return left[0].localeCompare(right[0]); });
    return identity.length ? node.nodeName + ":" + JSON.stringify(identity) : "";
  }

  // Reconcile only changed DOM, keeping live inputs, focus and details state intact.
  function updateMarkup(container, markup) {
    if (!container.firstChild) { container.innerHTML = markup; return; }
    var doc = container.ownerDocument;
    var focused = doc.activeElement;
    var hadFocus = focused && container.contains(focused);
    var selection = hadFocus && focused.selectionStart != null
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    var template = doc.createElement("template");
    template.innerHTML = markup;
    function patch(parent, source) {
      var incoming = Array.prototype.slice.call(source.childNodes);
      incoming.forEach(function (next, index) {
        var current = parent.childNodes[index];
        if (!current) { parent.appendChild(next.cloneNode(true)); return; }
        var key = nodeKey(next);
        var currentKey = nodeKey(current);
        if (key !== currentKey) {
          var matching = key && Array.prototype.find.call(parent.childNodes, function (child, childIndex) {
            return childIndex > index && nodeKey(child) === key;
          });
          if (!matching) { parent.insertBefore(next.cloneNode(true), current); return; }
          if (typeof parent.moveBefore === "function") parent.moveBefore(matching, current);
          else parent.insertBefore(matching, current);
          current = matching;
        }
        if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
          parent.replaceChild(next.cloneNode(true), current); return;
        }
        if (next.nodeType === 3) {
          if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
          return;
        }
        if (next.nodeType !== 1) return;
        Array.prototype.slice.call(current.attributes).forEach(function (attribute) {
          if (current.nodeName === "DETAILS" && attribute.name === "open") return;
          if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        });
        var liveInput = next.nodeName === "INPUT" && focused === current && editingInputs.has(current);
        Array.prototype.slice.call(next.attributes).forEach(function (attribute) {
          if (liveInput && attribute.name === "value" || current.nodeName === "DETAILS" && attribute.name === "open") return;
          if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        });
        if (next.nodeName === "INPUT") {
          if (!liveInput && current.value !== next.value) current.value = next.value;
          if (current.checked !== next.checked) current.checked = next.checked;
        }
        patch(current, next);
        if (next.nodeName === "SELECT" && current.value !== next.value) current.value = next.value;
      });
      while (parent.childNodes.length > incoming.length) parent.removeChild(parent.lastChild);
    }
    patch(container, template.content);
    if (hadFocus && doc.activeElement !== focused && container.contains(focused)) {
      focused.focus({ preventScroll: true });
      if (selection) focused.setSelectionRange(selection[0], selection[1], selection[2]);
    }
  }

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
    var calculationRevision = 0;
    var loadedAccount;
    var progressReadFailed = false;
    var state = {
      mode: "progress",
      progress: core.normalizeProgress({}, data),
      calculatorDraft: null,
      calculatorResult: null,
      calculatorBusy: false,
      calculatorDirty: false,
      calculatorSourceRevision: 0,
      progressRevision: 0,
      undo: [],
      error: ""
    };

    function cancelCalculation() {
      calculationRevision += 1;
      state.calculatorBusy = false;
      if (options.runner) options.runner.cancel();
    }

    function syncCalculatorFromProgress() {
      cancelCalculation();
      state.calculatorDraft = clone(state.progress);
      state.calculatorResult = null;
      state.calculatorDirty = false;
      state.calculatorSourceRevision = state.progressRevision;
      return state.calculatorDraft;
    }

    function accountId() {
      var current = store && store.currentAccount ? store.currentAccount() : null;
      return current && current.id != null ? current.id : null;
    }

    function load() {
      var raw = null;
      state.error = "";
      state.undo = [];
      progressReadFailed = false;
      loadedAccount = accountId();
      try {
        raw = store && store.getItem ? store.getItem(STORE_KEY) : null;
        state.progress = core.normalizeProgress(raw ? JSON.parse(raw) : {}, data);
      } catch (error) {
        progressReadFailed = true;
        state.progress = core.normalizeProgress({}, data);
        state.error = "木人巷个人进度读取失败，暂显示空白数据。原记录未修改。";
      }
      state.progressRevision += 1;
      syncCalculatorFromProgress();
      return state.progress;
    }

    function ensureAccount() {
      if (loadedAccount !== accountId()) {
        load();
        return false;
      }
      if (store && store.isCurrentContext && !store.isCurrentContext()) {
        cancelCalculation();
        state.calculatorResult = null;
        state.error = "账号选择已变更，请重新加载工具后重试。";
        return false;
      }
      return true;
    }

    function commit(progress, undo, resetCalculator, confirmedClear) {
      if (!ensureAccount()) return false;
      if (progressReadFailed && !confirmedClear) {
        state.error = "木人巷原记录未成功读取，暂不能保存。请先重新加载页面。";
        return false;
      }
      try {
        if (!store || !store.setItem) throw new Error("账号存储不可用");
        var saved = store.setItem(STORE_KEY, JSON.stringify(progress));
        if (saved === false) throw new Error("当前账号为只读状态");
      } catch (error) {
        state.error = "木人巷个人进度保存失败，请检查账号状态或浏览器存储空间。";
        return false;
      }
      state.progress = progress;
      progressReadFailed = false;
      state.undo = undo;
      state.progressRevision += 1;
      if (resetCalculator || !state.calculatorDirty) syncCalculatorFromProgress();
      else {
        cancelCalculation();
        state.calculatorResult = null;
      }
      state.error = "";
      return true;
    }

    function save() {
      return commit(state.progress, state.undo, false);
    }

    function editProgress(edit) {
      if (!ensureAccount()) return false;
      var draft = { progress: clone(state.progress), undo: state.undo.slice() };
      if (edit(draft) === false) return false;
      return commit(draft.progress, draft.undo, false);
    }

    function pushUndo(draft) {
      var progress = draft.progress;
      draft.undo.push({ currentFloor: progress.currentFloor, completedAllFloors: progress.completedAllFloors, openedCells: progress.openedCells.slice() });
      if (draft.undo.length > 20) draft.undo.shift();
    }

    function toggleCell(index) {
      if (!ensureAccount()) return false;
      if (state.progress.completedAllFloors) return false;
      var count = core.boardCellCount(state.progress.currentFloor, data);
      var cell = Number(index);
      if (!Number.isInteger(cell) || cell < 0 || cell >= count) return false;
      return editProgress(function (draft) {
        pushUndo(draft);
        var opened = draft.progress.openedCells;
        var position = opened.indexOf(cell);
        if (position === -1) opened.push(cell);
        else opened.splice(position, 1);
        opened.sort(function (left, right) { return left - right; });
        if (opened.length === count && confirmAction("本层所有木人均已击破，是否确认已取得最终大奖并进入下一层？")) {
          draft.progress = core.advanceFloor(draft.progress, data);
        }
      });
    }

    function undoBoard() {
      return editProgress(function (draft) {
        var previous = draft.undo.pop();
        if (!previous) return false;
        draft.progress.currentFloor = previous.currentFloor;
        draft.progress.completedAllFloors = previous.completedAllFloors;
        draft.progress.openedCells = previous.openedCells.slice();
      });
    }

    function clearBoard() {
      if (!ensureAccount()) return false;
      if (!state.progress.openedCells.length) return true;
      return editProgress(function (draft) {
        if (!confirmAction("清空当前层所有已击破记录？")) return false;
        pushUndo(draft);
        draft.progress.openedCells = [];
      });
    }

    function completeFloor() {
      return editProgress(function (draft) {
        if (draft.progress.completedAllFloors) return false;
        if (!confirmAction("确认已取得第" + draft.progress.currentFloor + "层最终大奖？确认后将进入下一层。")) return false;
        pushUndo(draft);
        draft.progress = core.advanceFloor(draft.progress, data);
      });
    }

    function setFloor(value) {
      if (!ensureAccount()) return false;
      if (String(value == null ? "" : value).trim() === "" || !Number.isFinite(Number(value))) {
        state.error = "请输入有效的层数。";
        return false;
      }
      var floor = Math.max(1, Math.min(data.maxFloor, Math.floor(Number(value))));
      if (floor === state.progress.currentFloor) return true;
      return editProgress(function (draft) {
        if (!confirmAction("更改当前层数将清空本层格子记录，是否继续？")) return false;
        pushUndo(draft);
        draft.progress.currentFloor = floor;
        draft.progress.completedAllFloors = false;
        draft.progress.openedCells = [];
      });
    }

    function setActivityEndDate(value) {
      return editProgress(function (draft) { draft.progress.activityEndDate = String(value || "").trim(); });
    }

    function setResource(key, value) {
      if (data.resourceKeys.indexOf(key) === -1) return false;
      return editProgress(function (draft) { draft.progress.resources[key] = core.nonNegativeInteger(value); });
    }

    function setPackageField(id, field, value) {
      if (!state.progress.packages[id] || ["price", "swords", "mysteryBoxes", "limit", "purchased"].indexOf(field) === -1) return false;
      var text = String(value == null ? "" : value).trim();
      var number = Number(text);
      if (text === "" || !Number.isFinite(number) || number < 0) {
        state.error = "礼包设置必须填写有效的非负整数。";
        return false;
      }
      return editProgress(function (draft) {
        var source = {};
        source[id] = draft.progress.packages[id];
        source[id][field] = Math.floor(number);
        draft.progress.packages[id] = core.normalizePackages(source, {
          defaultPackages: data.defaultPackages.filter(function (item) { return item.id === id; })
        })[id];
      });
    }

    function clearEvent() {
      if (!ensureAccount() || !confirmAction("清空当前账号的全部木人巷数据？此操作无法撤销。")) return false;
      return commit(core.normalizeProgress({}, data), [], true, true);
    }

    function setMode(mode) {
      ensureAccount();
      if (mode !== "calculator") cancelCalculation();
      if (["progress", "calculator", "reference"].indexOf(mode) !== -1) {
        if (mode === "calculator" && !state.calculatorDirty) syncCalculatorFromProgress();
        state.mode = mode;
      }
      return state.mode;
    }

    function setCalculatorDraft(draft) {
      if (!ensureAccount()) return;
      cancelCalculation();
      state.calculatorDraft = core.normalizeProgress(draft, data);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      state.calculatorSourceRevision = state.progressRevision;
    }
    function reloadCalculator() {
      if (!ensureAccount()) return state.calculatorDraft;
      state.error = "";
      return syncCalculatorFromProgress();
    }
    function updateCalculator(field, value) {
      if (!ensureAccount()) return false;
      cancelCalculation();
      var calculator = state.calculatorDraft.calculator;
      if (field === "direction") calculator.direction = value === "reachable" ? "reachable" : "target";
      else if (field === "targetFloor") calculator.targetFloor = Math.max(1, Math.min(data.maxFloor, Math.floor(Number(value) || 1)));
      else if (field === "risk" && ["expected", "conservative", "worst"].indexOf(value) !== -1) calculator.risk = value;
      else if (field === "includePurchasablePackages") calculator.includePurchasablePackages = Boolean(value);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      return calculator;
    }
    function setCalculatorResource(key, value) {
      if (!ensureAccount()) return false;
      cancelCalculation();
      if (data.resourceKeys.indexOf(key) === -1) return false;
      state.calculatorDraft.resources[key] = core.nonNegativeInteger(value);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      return true;
    }
    function updateStageLimit(tierId, toolId, field, value) {
      if (!ensureAccount()) return false;
      cancelCalculation();
      var limits = state.calculatorDraft.calculator.stageLimits;
      if (!limits[tierId] || !limits[tierId][toolId]) return false;
      if (field === "allowed") limits[tierId][toolId].allowed = Boolean(value);
      if (field === "max") limits[tierId][toolId].max = value === "" || value === null ? null : core.nonNegativeInteger(value);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      return true;
    }
    function calculationPayload() {
      var calculator = state.calculatorDraft.calculator;
      var input = {
        progress: state.calculatorDraft,
        resources: state.calculatorDraft.resources,
        packages: state.calculatorDraft.packages,
        includePurchasablePackages: calculator.includePurchasablePackages,
        stageLimits: calculator.stageLimits,
        targetFloor: calculator.targetFloor,
        risk: calculator.risk
      };
      return { direction: calculator.direction, input: clone(input) };
    }
    function executeCalculation(payload) {
      return payload.direction === "reachable"
        ? planner.planReachable(payload.input, data, core)
        : planner.planToTarget(payload.input, data, core);
    }
    function calculate() {
      if (!ensureAccount()) return null;
      cancelCalculation();
      state.calculatorResult = executeCalculation(calculationPayload());
      return state.calculatorResult;
    }
    function calculateAsync() {
      if (!ensureAccount()) return Promise.resolve(null);
      cancelCalculation();
      var revision = calculationRevision;
      var payload = calculationPayload();
      state.calculatorBusy = true;
      state.calculatorResult = null;
      state.error = "";
      var pending;
      try {
        pending = options.runner ? options.runner.run(payload) : Promise.reject(new Error("后台计算不可用"));
      } catch (error) { pending = Promise.reject(error); }
      return Promise.resolve(pending).then(function (result) {
        if (revision !== calculationRevision || !ensureAccount()) return null;
        state.calculatorBusy = false;
        state.calculatorResult = result;
        return result;
      }, function (error) {
        if (revision !== calculationRevision || !ensureAccount()) return null;
        state.calculatorBusy = false;
        if (!error || error.name !== "AbortError") {
          state.error = !options.runner || error && error.name === "WorkerUnavailableError"
            ? "木人巷计算未完成，后台计算不可用或已中断。请重试；若仍失败，请更新浏览器。"
            : "木人巷计算失败，请重试。";
        }
        return null;
      });
    }
    function saveCalculatorProgress() {
      if (!ensureAccount() || !state.calculatorDirty) return false;
      if (state.calculatorSourceRevision !== state.progressRevision) {
        state.error = "个人进度已更新，请先从个人进度重新读取后再保存。";
        return false;
      }
      if (!confirmAction("使用计算器中的数据覆盖当前账号木人巷个人进度？")) return false;
      return commit(core.normalizeProgress(state.calculatorDraft, data), [], true);
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
      ensureAccount: ensureAccount,
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
      reloadCalculator: reloadCalculator,
      updateCalculator: updateCalculator,
      setCalculatorResource: setCalculatorResource,
      updateStageLimit: updateStageLimit,
      calculate: calculate,
      calculateAsync: calculateAsync,
      cancelCalculation: cancelCalculation,
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
      var position = "第" + (Math.floor(index / tier.boardSize) + 1) + "行第" + (index % tier.boardSize + 1) + "列";
      cells += '<button type="button" class="wooden-cell' + (opened[index] ? " is-opened" : "") + '" data-wooden-cell="' + index + '" aria-label="' + position + '" aria-pressed="' + String(Boolean(opened[index])) + '">' +
        '<span aria-hidden="true">' + (opened[index] ? "✓" : '<img class="wooden-dummy-icon" src="images/wooden-training-dummy.png" alt="" draggable="false">') + '</span></button>';
    }
    return '<div class="wooden-board" style="--wooden-board-size:' + tier.boardSize + '" aria-label="第' + progress.currentFloor + '层木人棋盘">' + cells + '</div>';
  }

  function resourceFields(data, resources, calculator) {
    var currencies = ["discountCoupon", "ingots", "mysteryBoxes"];
    return [
      ["道具", data.resourceKeys.filter(function (key) { return currencies.indexOf(key) === -1; })],
      ["货币与其他", currencies.filter(function (key) { return !calculator || key !== "mysteryBoxes"; })]
    ].map(function (group) {
      return '<fieldset class="wooden-resource-group" data-wooden-key="resource:' + group[1][0] + '"><legend>' + group[0] + '</legend><div class="wooden-resource-grid">' +
        group[1].map(function (key) {
          return '<label class="wooden-field"><span>' + escapeHtml(resourceLabel(key)) + '</span><input type="number" min="0" step="1" inputmode="numeric" ' + (calculator ? 'data-wooden-calc-resource' : 'data-wooden-resource') + '="' + key + '" value="' + resources[key] + '"></label>';
        }).join("") + '</div></fieldset>';
    }).join("");
  }

  function renderProgress(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var core = root.WOODEN_MAN_ALLEY_CORE;
    var progress = active.state.progress;
    var days = core.remainingDays(progress.activityEndDate);
    var packages = data.defaultPackages.map(function (defaults) {
      var item = progress.packages[defaults.id];
      return '<article class="wooden-package-card" data-wooden-key="package:' + item.id + '"><h4>' + escapeHtml(item.name) + '</h4><div class="wooden-package-fields">' +
        [["price", "价格（元）"], ["swords", "木剑"], ["mysteryBoxes", "秘匣"], ["limit", "限购"], ["purchased", "已购买"]].map(function (entry) {
          return '<label><span>' + entry[1] + '</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-package="' + item.id + '" data-package-field="' + entry[0] + '" value="' + item[entry[0]] + '"></label>';
        }).join("") + '</div></article>';
    }).join("");
    updateMarkup(elements.progress, '<section class="panel wooden-account-panel"><div><span>当前游戏账号</span><strong>' + escapeHtml(active.accountLabel()) + '</strong></div>' +
      '<label class="wooden-end-date"><span>活动结束时间</span><input type="date" data-wooden-end-date value="' + escapeHtml(progress.activityEndDate) + '"></label>' +
      '<div><span>剩余时间</span><strong>' + (days === null ? "未设置" : days + "天") + '</strong></div></section><div class="error" role="alert" data-wooden-error-slot></div>' +
      '<section class="panel wooden-current-panel"><div class="wooden-section-head"><div><span>当前进度</span><strong>' + (progress.completedAllFloors ? "500层已全部完成" : "第" + progress.currentFloor + "层") + '</strong></div>' +
      '<label><span>当前层数</span><input type="number" min="1" max="500" step="1" inputmode="numeric" data-wooden-floor value="' + progress.currentFloor + '"' + (progress.completedAllFloors ? " disabled" : "") + '></label></div>' +
      '<div class="wooden-board-layout"><div class="wooden-board-scroll">' + renderBoard(data, core, progress) + '</div><aside class="wooden-board-actions"><strong>已击破 ' + progress.openedCells.length + ' / ' + core.boardCellCount(progress.currentFloor, data) + '</strong>' +
      '<button type="button" class="seg active" data-wooden-action="complete"' + (progress.completedAllFloors ? " disabled" : "") + '>已取得本层最终大奖</button>' +
      '<button type="button" class="seg" data-wooden-action="undo"' + (!active.state.undo.length ? " disabled" : "") + '>撤销</button>' +
      '<button type="button" class="seg wooden-clear-board" data-wooden-action="clear-board"' + (!progress.openedCells.length ? " disabled" : "") + '>清空本层记录</button></aside></div></section>' +
      '<section class="panel"><h2 class="panel-title">当前资源</h2>' + resourceFields(data, progress.resources, false) + '</section>' +
      '<details class="panel wooden-package-settings" data-wooden-package-settings><summary>礼包设置</summary><p class="muted">秘匣仅记录数量，不参与资源换算。</p><div class="wooden-package-grid">' + packages + '</div></details>' +
      '<div class="wooden-danger-actions"><button type="button" class="seg" data-wooden-action="clear-event">清空当前账号木人巷数据</button></div>');
  }

  function formatNumber(value, digits) {
    return NUMBER_FORMAT.format(value || 0, { maximumFractionDigits: digits === undefined ? 2 : digits });
  }

  function toolLabel(root, toolId) {
    var tool = root.WOODEN_MAN_ALLEY_DATA.tools.find(function (item) { return item.id === toolId; });
    return tool ? tool.name : toolId;
  }

  function actionPosition(action) {
    if (!action || !action.position) return "";
    if (action.position.type === "row") return " · 第" + (action.position.row + 1) + "行";
    if (action.position.type === "column") return " · 第" + (action.position.column + 1) + "列";
    return " · 第" + (action.position.row + 1) + "行第" + (action.position.column + 1) + "列交点";
  }

  function adviceBoard(root, analysis) {
    if (!analysis || !analysis.recommendation || analysis.recommendation.random || analysis.recommendation.toolId === "bomb") return "";
    var progress = active.state.calculatorDraft;
    var opened = {};
    var affected = {};
    progress.openedCells.forEach(function (cell) { opened[cell] = true; });
    analysis.recommendation.affectedCells.forEach(function (cell) { affected[cell] = true; });
    var cells = "";
    for (var index = 0; index < analysis.boardSize * analysis.boardSize; index += 1) {
      cells += '<span class="wooden-advice-cell' + (opened[index] ? " is-opened" : "") + (affected[index] ? " is-recommended" : "") + '">' + (opened[index] ? "✓" : '<img class="wooden-dummy-icon" src="images/wooden-training-dummy.png" alt="" draggable="false">') + '</span>';
    }
    return '<div class="wooden-advice-board" style="--wooden-board-size:' + analysis.boardSize + '">' + cells + '</div>';
  }

  function stageCards(root, stages) {
    if (!stages || !stages.length) return "";
    return '<div class="wooden-stage-grid">' + stages.map(function (stage) {
      var tools = Object.keys(stage.tools || {}).filter(function (id) { return stage.tools[id] > 0; }).map(function (id) {
        return '<span>' + escapeHtml(toolLabel(root, id)) + ' ×' + stage.tools[id] + '</span>';
      }).join("") || '<span class="muted">不使用辅助道具</span>';
      return '<article class="wooden-stage-card"><strong>' + stage.from + '–' + stage.to + '层</strong><div>' + tools + '</div>' +
        '<p>期望木剑：' + formatNumber(stage.expectedBase) + ' → <b>' + formatNumber(stage.expectedAfterTools) + '</b></p>' +
        '<p>最坏情况：' + formatNumber(stage.worstBase, 0) + ' → <b>' + formatNumber(stage.worstAfterTools, 0) + '</b></p></article>';
    }).join("") + '</div>';
  }

  function packagePlanCard(root, title, plan, shortage) {
    if (!plan) return "";
    var packages = Object.keys(plan.packages || {}).map(function (id) {
      var item = root.WOODEN_MAN_ALLEY_DATA.defaultPackages.find(function (entry) { return entry.id === id; });
      return (item ? item.name : id) + "×" + plan.packages[id];
    }).join("、") || "不购买礼包";
    var verdict = plan.feasible ? "可补足本方案缺口" : plan.type === "maximumProgress"
      ? "仍缺木剑 " + formatNumber(Math.max(0, shortage - plan.progressSwords), 0) + "把"
      : "仍缺元宝 " + formatNumber(plan.ingotShortage, 0);
    return '<article class="wooden-purchase-card' + (plan.feasible ? " is-feasible" : " is-short") + '"><strong>' + escapeHtml(title) + '</strong>' +
      '<span>礼包：' + escapeHtml(packages) + '</span><span>人民币：' + formatNumber(plan.rmb, 0) + '元</span>' +
      (plan.swordsFromPackages ? '<span>礼包木剑：' + formatNumber(plan.swordsFromPackages, 0) + '把</span>' : '') +
      '<span>元宝购剑：' + formatNumber(plan.swordsToBuy, 0) + '把 · ' + formatNumber(plan.ingotsRequired, 0) + '元宝</span>' +
      (plan.couponsUsed ? '<span>使用半价券：' + formatNumber(plan.couponsUsed, 0) + '张</span>' : '') +
      (plan.mysteryBoxes ? '<span>秘匣：' + formatNumber(plan.mysteryBoxes, 0) + '个</span>' : '') + '<b>' + verdict + '</b></article>';
  }

  function forwardResult(root, result) {
    if (!result) return '<div class="wooden-result-empty">设置目标后点击“开始计算”。</div>';
    if (result.error) return '<div class="error wooden-result-error">' + escapeHtml(result.error) + '</div>';
    var selected = result.demand.risk;
    var riskCards = [["expected", "理论期望", result.demand.expected], ["conservative", "保守估计", result.demand.conservative], ["worst", "模型最坏", result.demand.worst]].map(function (item) {
      return '<article class="wooden-risk-card' + (selected === item[0] ? " is-selected" : "") + '"><span>' + item[1] + '</span><strong>' + formatNumber(item[2]) + '</strong><small>把木剑</small></article>';
    }).join("");
    var advice = result.currentFloorAdvice && result.currentFloorAdvice.recommendation;
    var status = result.feasibilityStatus || (result.achievable ? "feasible" : "undetermined");
    var verdict = status === "feasible" ? (selected === "worst" ? "找到可行方案" : "按所选口径可达") : status === "insufficient" ? "按所选口径资源不足" : "尚不能判断可达性";
    var scope = result.planningMethod === "bounded" ? '分阶段为已找到的方案，不代表全局最优。' : '';
    if (selected !== "worst") scope += '理论期望与保守估计都不保证通关。';
    if (result.usesBombModel) scope += '炸药模型假设各格等概率、不放回，一次清除5格（不足5格则全清）；实际抽样机制未核实。';
    var purchases = result.purchasePlans;
    var cards = [["零人民币", purchases.zeroPaid], ["最低人民币", purchases.minimumRmb], ["最低元宝", purchases.minimumIngot], ["最多进度", purchases.maximumProgress]];
    return '<section class="wooden-result-summary"><div><span>目标</span><strong>完成第' + result.targetFloor + '层</strong></div><div><span>结论</span><strong class="' + (status === "feasible" ? "is-success" : status === "insufficient" ? "is-danger" : "") + '">' + verdict + '</strong></div><div><span>本方案木剑缺口</span><strong>' + formatNumber(result.shortages.woodSword, 0) + '</strong></div></section>' +
      (scope ? '<p class="wooden-result-note muted">' + scope + '</p>' : '') +
      '<div class="wooden-risk-grid">' + riskCards + '</div>' +
      (advice ? '<section class="panel wooden-advice"><div><span>当前层推荐</span><strong>' + escapeHtml(toolLabel(root, advice.toolId) + actionPosition(advice)) + '</strong><p>' + (advice.random || advice.toolId === 'bomb' ? '随机影响最多5格；使用后按剩余木人调整。' : '覆盖' + advice.affectedCells.length + '个尚未击破木人，立即命中概率' + formatNumber(advice.hitProbability * 100) + '%。') + '</p></div>' + adviceBoard(root, result.currentFloorAdvice) + '</section>' : "") +
      '<section><h3>分阶段方案</h3>' + stageCards(root, result.stages) + '</section>' +
      (result.shortages.woodSword ? '<section><h3>本方案购买选项</h3><div class="wooden-purchase-grid">' + cards.map(function (card) {
        return packagePlanCard(root, card[0], card[1], result.shortages.woodSword);
      }).join("") + '</div></section>' : '');
  }

  function reverseResult(root, result) {
    if (!result) return '<div class="wooden-result-empty">设置现有资源后点击“开始计算”。</div>';
    if (result.error) return '<div class="error wooden-result-error">' + escapeHtml(result.error) + '</div>';
    var range = result.exact === false ? '（该口径上界 ' + result.upperBoundFloor + '层）' : '';
    var risk = result.risk === "expected" ? "理论期望" : result.risk === "conservative" ? "保守估计" : "最坏情况";
    var title = result.exact === false ? "已找到方案至" : "可完成层数";
    var partial = result.brokenOnNextFloor == null ? result.expectedBrokenOnNextFloor : result.brokenOnNextFloor;
    return '<section class="wooden-result-summary"><div><span>' + risk + ' · ' + title + '</span><strong>' + result.completedFloor + '层' + range + '</strong></div><div><span>下一层</span><strong>' + (result.nextFloor || "已全部完成") + '</strong></div><div><span>下一层本方案可击破</span><strong>' + (result.nextFloor && partial != null ? partial + '个' : '—') + '</strong></div></section>' +
      (result.risk !== "worst" ? '<p class="wooden-result-note muted">所选统计口径不保证通关。</p>' : '') +
      (result.usesBombModel ? '<p class="wooden-result-note muted">炸药模型假设各格等概率、不放回，一次清除5格（不足5格则全清）；实际抽样机制未核实。</p>' : '') + stageCards(root, result.stages);
  }

  function renderStageLimits(root, draft) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var tools = data.tools.filter(function (tool) { return tool.id !== "woodSword"; });
    return data.tiers.map(function (tier, index) {
      return '<details class="wooden-limit-stage" data-wooden-limit-stage="' + tier.id + '"' + (index === 0 ? ' open' : '') + '><summary>' + tier.from + '–' + tier.to + '层</summary><div class="wooden-limit-grid">' + tools.map(function (tool) {
        var limit = draft.calculator.stageLimits[tier.id][tool.id];
        return '<div class="wooden-limit-row"><label><input type="checkbox" data-wooden-stage-allowed data-tier-id="' + tier.id + '" data-tool-id="' + tool.id + '"' + (limit.allowed ? " checked" : "") + '> ' + escapeHtml(tool.name) + '</label>' +
          '<label><span>最多</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-stage-max data-tier-id="' + tier.id + '" data-tool-id="' + tool.id + '" value="' + (limit.max === null ? "" : limit.max) + '" placeholder="不限"></label></div>';
      }).join("") + '</div></details>';
    }).join("");
  }

  function renderCalculator(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var draft = active.state.calculatorDraft;
    var calculator = draft.calculator;
    var targets = data.targets.map(function (target) {
      return '<option value="' + target.floor + '"' + (calculator.targetFloor === target.floor ? ' selected' : '') + '>' + target.floor + '层 · ' + escapeHtml(target.reward) + '</option>';
    }).join("");
    updateMarkup(elements.calculator, '<section class="panel wooden-calculator-controls"><div class="filter-row"><span class="filter-label">计算方向</span><div class="segs"><button type="button" class="seg' + (calculator.direction === "target" ? " active" : "") + '" data-wooden-calc-direction="target">达到目标层</button><button type="button" class="seg' + (calculator.direction === "reachable" ? " active" : "") + '" data-wooden-calc-direction="reachable">现有资源能到哪层</button></div></div>' +
      '<div class="wooden-target-row"' + (calculator.direction === "target" ? "" : " hidden") + '><label><span>快捷目标</span><select data-wooden-quick-target><option value="">选择奖励层</option>' + targets + '</select></label><label><span>任意目标层</span><input type="number" min="1" max="500" step="1" inputmode="numeric" data-wooden-target-input value="' + calculator.targetFloor + '"></label></div>' +
      '<div class="filter-row"><span class="filter-label">风险档位</span><div class="segs"><button type="button" class="seg' + (calculator.risk === "expected" ? " active" : "") + '" data-wooden-risk="expected">理论期望</button><button type="button" class="seg' + (calculator.risk === "conservative" ? " active" : "") + '" data-wooden-risk="conservative">保守估计</button><button type="button" class="seg' + (calculator.risk === "worst" ? " active" : "") + '" data-wooden-risk="worst">最坏情况</button></div></div>' +
      '<label class="wooden-package-toggle"><input type="checkbox" data-wooden-include-packages' + (calculator.includePurchasablePackages ? " checked" : "") + '> 计入当前账号仍可购买的礼包</label>' +
      '<h2 class="panel-title">本次计算资源</h2>' + resourceFields(data, draft.resources, true) +
      '<details data-wooden-advanced class="wooden-advanced"><summary>高级设置：各阶段道具限制</summary><div class="wooden-limit-stages">' + renderStageLimits(root, draft) + '</div></details>' +
      '<div class="wooden-calculator-actions"><button type="button" class="seg" data-wooden-calc-action="reload">从个人进度重新读取</button><button type="button" class="seg active" data-wooden-calc-action="calculate">开始计算</button><button type="button" class="seg" data-wooden-calc-action="save">保存回个人进度</button></div></section>' +
      '<div class="error" role="alert" data-wooden-error-slot></div><section class="wooden-calculation-result" id="wooden-calculation-result"><h2>计算结果</h2>' + (calculator.direction === "target" ? forwardResult(root, active.state.calculatorResult) : reverseResult(root, active.state.calculatorResult)) + '</section>');
  }

  function renderReference(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    function cells(labels, values) {
      return values.map(function (value, index) {
        return '<td><span class="wooden-table-label" aria-hidden="true">' + escapeHtml(labels[index]) + '</span><span>' + escapeHtml(value) + '</span></td>';
      }).join("");
    }
    var tierRows = data.tiers.map(function (tier) {
      return '<tr>' + cells(['层数', '棋盘', '木人', '铁剑', '横／纵／十字'], [tier.from + '–' + tier.to, tier.boardSize + '×' + tier.boardSize, tier.cellCount, tier.toolCosts.ironSword, tier.toolCosts.horizontalQi]) + '</tr>';
    }).join("");
    var tools = data.tools.map(function (tool) { return '<article><strong>' + escapeHtml(tool.name) + '</strong><span>' + escapeHtml(tool.effect) + '</span></article>'; }).join("");
    var targets = data.targets.map(function (target) { return '<article><strong>' + target.floor + '层</strong><span>' + escapeHtml(target.reward) + '</span></article>'; }).join("");
    var packages = data.defaultPackages.map(function (item) { return '<tr>' + cells(['礼包', '价格', '木剑', '秘匣', '限购'], [item.name, item.price + '元', item.swords, item.mysteryBoxes, item.limit]) + '</tr>'; }).join("");
    var guideRows = [[75,850,119000],[180,2980,417200],[230,4230,592200],[330,7830,1096200],[500,16160,2262400]].map(function(row){return '<tr>' + cells(['完成层数', '全清木人数', '攻略估价（元宝）'], [row[0], row[1], formatNumber(row[2], 0)]) + '</tr>';}).join('');
    elements.reference.innerHTML = '<section class="panel"><div class="panel-title">地图与消耗</div><div class="wooden-table-wrap"><table><thead><tr><th>层数</th><th>棋盘</th><th>木人</th><th>铁剑</th><th>横／纵／十字</th></tr></thead><tbody>' + tierRows + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-title">辅助道具</div><div class="wooden-reference-grid">' + tools + '</div></section>' +
      '<section class="panel"><div class="panel-title">快捷目标</div><div class="wooden-reference-grid">' + targets + '</div></section>' +
      '<section class="panel"><div class="panel-title">礼包默认模板</div><div class="wooden-table-wrap"><table><thead><tr><th>礼包</th><th>价格</th><th>木剑</th><th>秘匣</th><th>限购</th></tr></thead><tbody>' + packages + '</tbody></table></div></section>' +
      '<section class="panel wooden-method-notes"><div class="panel-title">计算口径</div><p><strong>理论期望：</strong>大奖在尚未击破木人中等概率分布且不放回，取得大奖即进入下一层。</p><p><strong>保守估计：</strong>汇总全部剩余期望后统一乘1.20并向上取整，但不超过同一道具方案的最坏需求；并非成功率保证。</p><p><strong>最坏情况：</strong>大奖位于最后一个尚未击破的木人中。</p><p>秘匣内容暂未明确，只记录数量，不参与资源换算；木剑不会自动产出；不计算活动结束后的未使用道具退款。</p></section>' +
      '<section class="panel wooden-method-notes"><div class="panel-title">攻略对照参考（从第1层开始）</div><p>图片按全清木人数×200元宝×0.7估价；0.7依据未说明，不是工具采用的购剑折扣。以下仅为攻略参考，不参与计算。实际规划按概率、风险档位、辅助道具、已有库存和半价券计算。</p><div class="wooden-table-wrap"><table><thead><tr><th>完成层数</th><th>全清木人数</th><th>攻略估价（元宝）</th></tr></thead><tbody>'+guideRows+'</tbody></table></div><p>331–500层均为7×7、49个木人。75／230／330层奖励图片有“灵媒／灵宝”不同字样，工具暂沿用“灵宝四选一”简称。</p></section>';
  }

  function renderFeedback() {
    var target = elements[active.state.mode];
    var local = target && target.querySelector("[data-wooden-error-slot]");
    [elements.progress, elements.calculator].forEach(function (section) {
      var slot = section.querySelector("[data-wooden-error-slot]");
      if (!slot) return;
      if (!slot.hasAttribute("role")) slot.setAttribute("role", "alert");
      var message = slot === local ? active.state.error : "";
      slot.hidden = !message;
      if (slot.textContent !== message) slot.textContent = message;
    });
    var general = local ? "" : active.state.error;
    elements.error.hidden = !general;
    if (elements.error.textContent !== general) elements.error.textContent = general;
  }

  function renderMode(root) {
    if (!active.ensureAccount()) editingInputs = new WeakSet();
    elements.modes.querySelectorAll("[data-wooden-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.woodenMode === active.state.mode);
    });
    elements.progress.hidden = active.state.mode !== "progress";
    elements.calculator.hidden = active.state.mode !== "calculator";
    elements.reference.hidden = active.state.mode !== "reference";
    if (active.state.mode === "progress") renderProgress(root);
    if (active.state.mode === "calculator") renderCalculator(root);
    if (active.state.mode === "reference") renderReference(root);
    var calculateButton = elements.calculator.querySelector('[data-wooden-calc-action="calculate"]');
    if (calculateButton) {
      calculateButton.disabled = active.state.calculatorBusy;
      calculateButton.textContent = active.state.calculatorBusy ? "正在计算…" : "开始计算";
    }
    elements.calculator.setAttribute("aria-busy", String(active.state.calculatorBusy));
    renderFeedback();
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
      runner: root.QinshiCalculationRunner ? root.QinshiCalculationRunner.create({ kind: "wooden" }) : null,
      confirm: function (message) { return root.confirm(message); }
    });
    partition.dataset.woodenInitialized = "true";
    partition.addEventListener("input", function (event) {
      if (!event.target.matches("input")) return;
      if (!active.ensureAccount()) { editingInputs = new WeakSet(); renderMode(root); return; }
      editingInputs.add(event.target);
      active.cancelCalculation();
      active.state.calculatorResult = null;
      var result = root.document.getElementById("wooden-calculation-result");
      if (result) updateMarkup(result, '<h2>计算结果</h2>' + (active.state.calculatorDraft.calculator.direction === "target" ? forwardResult(root, null) : reverseResult(root, null)));
      var button = elements.calculator.querySelector('[data-wooden-calc-action="calculate"]');
      if (button) { button.disabled = false; button.textContent = "开始计算"; }
      elements.calculator.setAttribute("aria-busy", "false");
    });
    partition.addEventListener("click", function (event) {
      var mode = event.target.closest("[data-wooden-mode]");
      if (mode) { active.setMode(mode.dataset.woodenMode); renderMode(root); return; }
      var direction = event.target.closest("[data-wooden-calc-direction]");
      if (direction) { active.updateCalculator("direction", direction.dataset.woodenCalcDirection); renderMode(root); return; }
      var risk = event.target.closest("[data-wooden-risk]");
      if (risk) { active.updateCalculator("risk", risk.dataset.woodenRisk); renderMode(root); return; }
      var targetButton = event.target.closest("[data-wooden-target]");
      if (targetButton) { active.updateCalculator("targetFloor", targetButton.dataset.woodenTarget); renderMode(root); return; }
      var calcAction = event.target.closest("[data-wooden-calc-action]");
      if (calcAction) {
        if (calcAction.dataset.woodenCalcAction === "reload") active.reloadCalculator();
        if (calcAction.dataset.woodenCalcAction === "calculate") {
          var accountRevision = active.state.progressRevision;
          active.calculateAsync().then(function (calculation) {
            if (!calculation) {
              if (accountRevision !== active.state.progressRevision && !partition.hidden) {
                editingInputs = new WeakSet();
                renderMode(root);
              } else renderFeedback();
              var button = elements.calculator.querySelector('[data-wooden-calc-action="calculate"]');
              if (button && !active.state.calculatorBusy) { button.disabled = false; button.textContent = "开始计算"; }
              elements.calculator.setAttribute("aria-busy", String(active.state.calculatorBusy));
              return;
            }
            renderMode(root);
            var result = root.document.getElementById("wooden-calculation-result");
            if (calculation && result) result.scrollIntoView({ block: "start", behavior: "smooth" });
          });
        }
        if (calcAction.dataset.woodenCalcAction === "save") active.saveCalculatorProgress();
        renderMode(root);
        return;
      }
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
      editingInputs.delete(target);
      if (target.matches("[data-wooden-floor]")) active.setFloor(target.value);
      else if (target.matches("[data-wooden-end-date]")) active.setActivityEndDate(target.value);
      else if (target.matches("[data-wooden-resource]")) active.setResource(target.dataset.woodenResource, target.value);
      else if (target.matches("[data-wooden-package]")) active.setPackageField(target.dataset.woodenPackage, target.dataset.packageField, target.value);
      else if (target.matches("[data-wooden-target-input]")) active.updateCalculator("targetFloor", target.value);
      else if (target.matches("[data-wooden-quick-target]")) {
        if (target.value) active.updateCalculator("targetFloor", target.value);
      }
      else if (target.matches("[data-wooden-include-packages]")) active.updateCalculator("includePurchasablePackages", target.checked);
      else if (target.matches("[data-wooden-calc-resource]")) active.setCalculatorResource(target.dataset.woodenCalcResource, target.value);
      else if (target.matches("[data-wooden-stage-allowed]")) active.updateStageLimit(target.dataset.tierId, target.dataset.toolId, "allowed", target.checked);
      else if (target.matches("[data-wooden-stage-max]")) active.updateStageLimit(target.dataset.tierId, target.dataset.toolId, "max", target.value);
      renderMode(root);
    });
    root.document.addEventListener("qinshi:partitionchange", function (event) {
      if (event.detail && event.detail.name === "wooden-man-alley") renderMode(root);
      else active.cancelCalculation();
    });
    if (typeof root.addEventListener === "function") root.addEventListener("pagehide", active.cancelCalculation);
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
