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
      calculatorDirty: false,
      calculatorSourceRevision: 0,
      progressRevision: 0,
      undo: [],
      error: ""
    };

    function syncCalculatorFromProgress() {
      state.calculatorDraft = clone(state.progress);
      state.calculatorResult = null;
      state.calculatorDirty = false;
      state.calculatorSourceRevision = state.progressRevision;
      return state.calculatorDraft;
    }

    function load() {
      var raw = null;
      try {
        raw = store && store.getItem ? store.getItem(STORE_KEY) : null;
        state.progress = core.normalizeProgress(raw ? JSON.parse(raw) : {}, data);
      } catch (error) {
        state.progress = core.normalizeProgress({}, data);
        state.error = "木人巷个人进度读取失败，已使用空白数据。";
      }
      state.progressRevision += 1;
      syncCalculatorFromProgress();
      return state.progress;
    }

    function save() {
      try {
        if (!store || !store.setItem) throw new Error("账号存储不可用");
        var saved = store.setItem(STORE_KEY, JSON.stringify(state.progress));
        if (saved === false) throw new Error("当前账号为只读状态");
        state.progressRevision += 1;
        if (!state.calculatorDirty) syncCalculatorFromProgress();
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
      var text = String(value == null ? "" : value).trim();
      var number = Number(text);
      if (text === "" || !Number.isFinite(number) || number < 0) {
        state.error = "礼包设置必须填写有效的非负整数。";
        return false;
      }
      state.progress.packages[id][field] = Math.floor(number);
      state.progress.packages[id] = core.normalizePackages((function () {
        var source = {}; source[id] = state.progress.packages[id]; return source;
      })(), { defaultPackages: data.defaultPackages.filter(function (item) { return item.id === id; }) })[id];
      return save();
    }

    function clearEvent() {
      if (!confirmAction("清空当前账号的全部木人巷数据？此操作无法撤销。")) return false;
      state.progress = core.normalizeProgress({}, data);
      state.calculatorDirty = false;
      state.undo = [];
      return save();
    }

    function setMode(mode) {
      if (["progress", "calculator", "reference"].indexOf(mode) !== -1) {
        if (mode === "calculator" && !state.calculatorDirty) syncCalculatorFromProgress();
        state.mode = mode;
      }
      return state.mode;
    }

    function setCalculatorDraft(draft) {
      state.calculatorDraft = core.normalizeProgress(draft, data);
      state.calculatorDirty = true;
      state.calculatorSourceRevision = state.progressRevision;
    }
    function reloadCalculator() {
      return syncCalculatorFromProgress();
    }
    function updateCalculator(field, value) {
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
      if (data.resourceKeys.indexOf(key) === -1) return false;
      state.calculatorDraft.resources[key] = core.nonNegativeInteger(value);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      return true;
    }
    function updateStageLimit(tierId, toolId, field, value) {
      var limits = state.calculatorDraft.calculator.stageLimits;
      if (!limits[tierId] || !limits[tierId][toolId]) return false;
      if (field === "allowed") limits[tierId][toolId].allowed = Boolean(value);
      if (field === "max") limits[tierId][toolId].max = value === "" || value === null ? null : core.nonNegativeInteger(value);
      state.calculatorResult = null;
      state.calculatorDirty = true;
      return true;
    }
    function calculate() {
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
      state.calculatorResult = calculator.direction === "reachable"
        ? planner.planReachable(input, data, core)
        : planner.planToTarget(input, data, core);
      return state.calculatorResult;
    }
    function saveCalculatorProgress() {
      if (state.calculatorSourceRevision !== state.progressRevision) {
        state.error = "个人进度已更新，请先从个人进度重新读取后再保存。";
        return false;
      }
      if (!confirmAction("使用计算器中的数据覆盖当前账号木人巷个人进度？")) return false;
      state.progress = core.normalizeProgress(state.calculatorDraft, data);
      state.calculatorDirty = false;
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
      reloadCalculator: reloadCalculator,
      updateCalculator: updateCalculator,
      setCalculatorResource: setCalculatorResource,
      updateStageLimit: updateStageLimit,
      calculate: calculate,
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
        (opened[index] ? '<span aria-hidden="true">✓</span><span class="sr-only">已击破</span>' : '<span>未击破</span>') + '</button>';
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

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: digits === undefined ? 2 : digits });
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
    if (!analysis || !analysis.recommendation) return "";
    var progress = active.state.calculatorDraft;
    var opened = {};
    var affected = {};
    progress.openedCells.forEach(function (cell) { opened[cell] = true; });
    analysis.recommendation.affectedCells.forEach(function (cell) { affected[cell] = true; });
    var cells = "";
    for (var index = 0; index < analysis.boardSize * analysis.boardSize; index += 1) {
      cells += '<span class="wooden-advice-cell' + (opened[index] ? " is-opened" : "") + (affected[index] ? " is-recommended" : "") + '">' + (opened[index] ? "✓" : "木") + '</span>';
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

  function packagePlanCard(title, plan) {
    if (!plan) return '<article class="wooden-purchase-card is-disabled"><strong>' + escapeHtml(title) + '</strong><span>开启“计入可购买礼包”后生成</span></article>';
    var packages = Object.keys(plan.packages || {}).map(function (id) { return id + "×" + plan.packages[id]; }).join("、") || "不购买礼包";
    return '<article class="wooden-purchase-card' + (plan.feasible ? " is-feasible" : " is-short") + '"><strong>' + escapeHtml(title) + '</strong>' +
      '<span>礼包：' + escapeHtml(packages) + '</span><span>人民币：' + formatNumber(plan.rmb, 0) + '元</span>' +
      '<span>购买木剑：' + formatNumber(plan.swordsToBuy, 0) + '把</span><span>元宝：' + formatNumber(plan.ingotsRequired, 0) + '</span>' +
      '<span>秘匣：' + formatNumber(plan.mysteryBoxes, 0) + '个</span><b>' + (plan.feasible ? "资源可满足" : "仍缺元宝 " + formatNumber(plan.ingotShortage, 0)) + '</b></article>';
  }

  function forwardResult(root, result) {
    if (!result) return '<div class="wooden-result-empty">设置目标后点击“开始计算”。</div>';
    if (result.error) return '<div class="error wooden-result-error">' + escapeHtml(result.error) + '</div>';
    var selected = result.demand.risk;
    var riskCards = [["expected", "理论期望", result.demand.expected], ["conservative", "保守估计", result.demand.conservative], ["worst", "最坏情况", result.demand.worst]].map(function (item) {
      return '<article class="wooden-risk-card' + (selected === item[0] ? " is-selected" : "") + '"><span>' + item[1] + '</span><strong>' + formatNumber(item[2]) + '</strong><small>木剑需求</small></article>';
    }).join("");
    var advice = result.currentFloorAdvice && result.currentFloorAdvice.recommendation;
    return '<section class="wooden-result-summary"><div><span>目标</span><strong>完成第' + result.targetFloor + '层</strong></div><div><span>结论</span><strong class="' + (result.achievable ? "is-success" : "is-danger") + '">' + (result.achievable ? "资源可满足" : "资源不足") + '</strong></div><div><span>缺少木剑</span><strong class="' + (result.shortages.woodSword ? "is-danger" : "is-success") + '">' + formatNumber(result.shortages.woodSword, 0) + '</strong></div></section>' +
      '<div class="wooden-risk-grid">' + riskCards + '</div>' +
      (advice ? '<section class="panel wooden-advice"><div><span>当前层推荐</span><strong>' + escapeHtml(toolLabel(root, advice.toolId) + actionPosition(advice)) + '</strong><p>覆盖' + advice.affectedCells.length + '个尚未击破木人，立即命中概率' + formatNumber(advice.hitProbability * 100) + '%。</p></div>' + adviceBoard(root, result.currentFloorAdvice) + '</section>' : "") +
      '<section><h3>分阶段方案</h3>' + stageCards(root, result.stages) + '</section>' +
      '<section><h3>购买方案</h3><div class="wooden-purchase-grid">' + packagePlanCard("零付费方案", result.purchasePlans.zeroPaid) + packagePlanCard("最低人民币方案", result.purchasePlans.minimumRmb) + packagePlanCard("最低元宝方案", result.purchasePlans.minimumIngot) + '</div></section>';
  }

  function reverseResult(root, result) {
    if (!result) return '<div class="wooden-result-empty">设置现有资源后点击“开始计算”。</div>';
    return '<section class="wooden-result-summary"><div><span>最高完整完成</span><strong>' + result.completedFloor + '层</strong></div><div><span>下一层</span><strong>' + (result.nextFloor || "已全部完成") + '</strong></div><div><span>下一层预计可击破</span><strong>' + result.expectedBrokenOnNextFloor + '个</strong></div></section>' + stageCards(root, result.stages);
  }

  function renderStageLimits(root, draft) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var tools = data.tools.filter(function (tool) { return tool.id !== "woodSword"; });
    return data.tiers.map(function (tier) {
      return '<article class="wooden-limit-stage"><strong>' + tier.from + '–' + tier.to + '层</strong><div class="wooden-limit-grid">' + tools.map(function (tool) {
        var limit = draft.calculator.stageLimits[tier.id][tool.id];
        return '<div class="wooden-limit-row"><label><input type="checkbox" data-wooden-stage-allowed data-tier-id="' + tier.id + '" data-tool-id="' + tool.id + '"' + (limit.allowed ? " checked" : "") + '> ' + escapeHtml(tool.name) + '</label>' +
          '<label><span>最多</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-stage-max data-tier-id="' + tier.id + '" data-tool-id="' + tool.id + '" value="' + (limit.max === null ? "" : limit.max) + '" placeholder="不限"></label></div>';
      }).join("") + '</div></article>';
    }).join("");
  }

  function renderCalculator(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var draft = active.state.calculatorDraft;
    var calculator = draft.calculator;
    var resourceInputs = data.resourceKeys.filter(function (key) { return key !== "mysteryBoxes"; }).map(function (key) {
      return '<label class="wooden-field"><span>' + escapeHtml(resourceLabel(key)) + '</span><input type="number" min="0" step="1" inputmode="numeric" data-wooden-calc-resource="' + key + '" value="' + draft.resources[key] + '"></label>';
    }).join("");
    var targets = data.targets.map(function (target) {
      return '<button type="button" class="seg' + (calculator.targetFloor === target.floor ? " active" : "") + '" data-wooden-target="' + target.floor + '">' + target.floor + '</button>';
    }).join("");
    elements.calculator.innerHTML = '<section class="panel wooden-calculator-controls"><div class="filter-row"><span class="filter-label">计算方向</span><div class="segs"><button type="button" class="seg' + (calculator.direction === "target" ? " active" : "") + '" data-wooden-calc-direction="target">达到目标层</button><button type="button" class="seg' + (calculator.direction === "reachable" ? " active" : "") + '" data-wooden-calc-direction="reachable">现有资源能到哪层</button></div></div>' +
      (calculator.direction === "target" ? '<div class="wooden-target-row"><span>快捷目标</span><div class="segs">' + targets + '</div><label><span>任意目标层</span><input type="number" min="1" max="500" step="1" inputmode="numeric" data-wooden-target-input value="' + calculator.targetFloor + '"></label></div>' : "") +
      '<div class="filter-row"><span class="filter-label">风险档位</span><div class="segs"><button type="button" class="seg' + (calculator.risk === "expected" ? " active" : "") + '" data-wooden-risk="expected">理论期望</button><button type="button" class="seg' + (calculator.risk === "conservative" ? " active" : "") + '" data-wooden-risk="conservative">保守估计</button><button type="button" class="seg' + (calculator.risk === "worst" ? " active" : "") + '" data-wooden-risk="worst">最坏情况</button></div></div>' +
      '<label class="wooden-package-toggle"><input type="checkbox" data-wooden-include-packages' + (calculator.includePurchasablePackages ? " checked" : "") + '> 计入当前账号仍可购买的礼包</label>' +
      '<div class="panel-title">本次计算资源</div><p class="muted">临时修改不会写入个人进度。</p><div class="wooden-resource-grid">' + resourceInputs + '</div>' +
      '<details data-wooden-advanced class="wooden-advanced"><summary>高级设置：各阶段道具限制</summary><div class="wooden-limit-stages">' + renderStageLimits(root, draft) + '</div></details>' +
      '<div class="wooden-calculator-actions"><button type="button" class="seg" data-wooden-calc-action="reload">从个人进度重新读取</button><button type="button" class="seg active" data-wooden-calc-action="calculate">开始计算</button><button type="button" class="seg" data-wooden-calc-action="save">保存回个人进度</button></div></section>' +
      '<section class="wooden-calculation-result" id="wooden-calculation-result"><h2>计算结果</h2>' + (calculator.direction === "target" ? forwardResult(root, active.state.calculatorResult) : reverseResult(root, active.state.calculatorResult)) + '</section>';
  }

  function renderReference(root) {
    var data = root.WOODEN_MAN_ALLEY_DATA;
    var tierRows = data.tiers.map(function (tier) {
      return '<tr><td>' + tier.from + '–' + tier.to + '</td><td>' + tier.boardSize + '×' + tier.boardSize + '</td><td>' + tier.cellCount + '</td><td>' + tier.toolCosts.ironSword + '</td><td>' + tier.toolCosts.horizontalQi + '</td></tr>';
    }).join("");
    var tools = data.tools.map(function (tool) { return '<article><strong>' + escapeHtml(tool.name) + '</strong><span>' + escapeHtml(tool.effect) + '</span></article>'; }).join("");
    var targets = data.targets.map(function (target) { return '<article><strong>' + target.floor + '层</strong><span>' + escapeHtml(target.reward) + '</span></article>'; }).join("");
    var packages = data.defaultPackages.map(function (item) { return '<tr><td>' + escapeHtml(item.name) + '</td><td>' + item.price + '元</td><td>' + item.swords + '</td><td>' + item.mysteryBoxes + '</td><td>' + item.limit + '</td></tr>'; }).join("");
    elements.reference.innerHTML = '<section class="panel"><div class="panel-title">地图与消耗</div><div class="wooden-table-wrap"><table><thead><tr><th>层数</th><th>棋盘</th><th>木人</th><th>铁剑</th><th>横／纵／十字</th></tr></thead><tbody>' + tierRows + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-title">辅助道具</div><div class="wooden-reference-grid">' + tools + '</div></section>' +
      '<section class="panel"><div class="panel-title">快捷目标</div><div class="wooden-reference-grid">' + targets + '</div></section>' +
      '<section class="panel"><div class="panel-title">礼包默认模板</div><div class="wooden-table-wrap"><table><thead><tr><th>礼包</th><th>价格</th><th>木剑</th><th>秘匣</th><th>限购</th></tr></thead><tbody>' + packages + '</tbody></table></div></section>' +
      '<section class="panel wooden-method-notes"><div class="panel-title">计算口径</div><p><strong>理论期望：</strong>大奖在尚未击破木人中等概率分布且不放回。</p><p><strong>保守估计：</strong>汇总全部剩余期望后统一乘1.20并向上取整。</p><p><strong>最坏情况：</strong>大奖位于最后一个尚未击破的木人中。</p><p>秘匣内容暂未明确，只记录数量，不参与资源换算；木剑不会自动产出；不计算活动结束后的未使用道具退款。</p></section>';
  }

  function renderMode(root) {
    elements.modes.querySelectorAll("[data-wooden-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.woodenMode === active.state.mode);
    });
    elements.progress.hidden = active.state.mode !== "progress";
    elements.calculator.hidden = active.state.mode !== "calculator";
    elements.reference.hidden = active.state.mode !== "reference";
    if (active.state.mode === "progress") renderProgress(root);
    if (active.state.mode === "calculator") renderCalculator(root);
    if (active.state.mode === "reference") renderReference(root);
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
      var direction = event.target.closest("[data-wooden-calc-direction]");
      if (direction) { active.updateCalculator("direction", direction.dataset.woodenCalcDirection); renderMode(root); return; }
      var risk = event.target.closest("[data-wooden-risk]");
      if (risk) { active.updateCalculator("risk", risk.dataset.woodenRisk); renderMode(root); return; }
      var targetButton = event.target.closest("[data-wooden-target]");
      if (targetButton) { active.updateCalculator("targetFloor", targetButton.dataset.woodenTarget); renderMode(root); return; }
      var calcAction = event.target.closest("[data-wooden-calc-action]");
      if (calcAction) {
        if (calcAction.dataset.woodenCalcAction === "reload") active.reloadCalculator();
        if (calcAction.dataset.woodenCalcAction === "calculate") active.calculate();
        if (calcAction.dataset.woodenCalcAction === "save") active.saveCalculatorProgress();
        renderMode(root);
        if (calcAction.dataset.woodenCalcAction === "calculate") {
          var result = root.document.getElementById("wooden-calculation-result");
          if (result) result.scrollIntoView({ block: "start", behavior: "smooth" });
        }
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
      if (target.matches("[data-wooden-floor]")) active.setFloor(target.value);
      else if (target.matches("[data-wooden-end-date]")) active.setActivityEndDate(target.value);
      else if (target.matches("[data-wooden-resource]")) active.setResource(target.dataset.woodenResource, target.value);
      else if (target.matches("[data-wooden-package]")) active.setPackageField(target.dataset.woodenPackage, target.dataset.packageField, target.value);
      else if (target.matches("[data-wooden-target-input]")) active.updateCalculator("targetFloor", target.value);
      else if (target.matches("[data-wooden-include-packages]")) active.updateCalculator("includePurchasablePackages", target.checked);
      else if (target.matches("[data-wooden-calc-resource]")) active.setCalculatorResource(target.dataset.woodenCalcResource, target.value);
      else if (target.matches("[data-wooden-stage-allowed]")) active.updateStageLimit(target.dataset.tierId, target.dataset.toolId, "allowed", target.checked);
      else if (target.matches("[data-wooden-stage-max]")) active.updateStageLimit(target.dataset.tierId, target.dataset.toolId, "max", target.value);
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
