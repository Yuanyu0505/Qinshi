(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SIX_HALLS_UI = api;
    if (root.document) {
      if (root.document.readyState === "loading") {
        root.document.addEventListener("DOMContentLoaded", function () { api.init(root); });
      } else {
        api.init(root);
      }
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STORE_KEY = "qinshi_six_halls_progress_v1";
  var modes = ["progress", "planner", "reference"];
  var contexts = [];

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function numberText(value) { return Number(value).toLocaleString("zh-CN"); }
  function fieldKey(field, hallId) { return hallId ? hallId + ":" + field : field; }

  function createController(options) {
    var data = options.data;
    var core = options.core;
    var store = options.store;
    var listeners = [];
    var accountId;
    var unsubscribeAccess = null;
    var state = {
      progress: core.normalizeProgress({}, data),
      plan: core.defaultPlan(data),
      mode: "progress",
      error: "",
      fieldErrors: {},
      targetErrors: {},
      loadError: "",
      accessError: ""
    };

    function hallById(id) {
      return data.halls.find(function (hall) { return hall.id === id; });
    }
    function currentAccountId() {
      if (!store || typeof store.currentAccount !== "function") return null;
      var account = store.currentAccount();
      return account ? account.id : null;
    }
    function notify(type) {
      listeners.slice().forEach(function (listener) { listener(state, type); });
    }
    function refreshError() {
      var errors = Object.keys(state.fieldErrors).map(function (key) { return state.fieldErrors[key]; });
      state.plan.selected.forEach(function (id) {
        if (state.targetErrors[id]) errors.push(state.targetErrors[id]);
      });
      if (state.loadError) errors.unshift(state.loadError);
      if (state.accessError) errors.unshift(state.accessError);
      state.error = errors.join(" ");
    }
    function validateTarget(id) {
      var hall = hallById(id);
      if (!hall) return "未知堂口，无法设置升级目标。";
      var parsed = core.parseInteger(state.plan.targets[id], 0, data.maxLevel, false);
      if (!parsed.valid) return hall.name + "目标等级必须是0～" + data.maxLevel + "的整数。";
      if (parsed.value < state.progress.halls[id].level) return hall.name + "目标等级不能低于当前等级。";
      return "";
    }
    function updateTargetErrors() {
      data.halls.forEach(function (hall) {
        var message = validateTarget(hall.id);
        if (message) state.targetErrors[hall.id] = message;
        else delete state.targetErrors[hall.id];
      });
    }
    function readProgress() {
      var raw = store && typeof store.getItem === "function" ? store.getItem(core.STORE_KEY || STORE_KEY) : null;
      if (raw === null || raw === undefined) return core.normalizeProgress({}, data);
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid progress data");
      return core.normalizeProgress(parsed, data);
    }
    function protectReadFailure() {
      state.loadError = "六堂个人进度读取失败，原存储未被改写；为保护数据已暂停进度编辑与规划计算。请到设置恢复备份后刷新页面，升级资料仍可查看。";
    }
    function refreshProgress() {
      try {
        state.progress = readProgress();
        state.loadError = "";
        state.accessError = "";
        updateTargetErrors();
      } catch (error) {
        protectReadFailure();
      }
      refreshError();
    }
    function load() {
      state.progress = core.normalizeProgress({}, data);
      state.plan = core.defaultPlan(data);
      state.mode = "progress";
      state.fieldErrors = {};
      state.targetErrors = {};
      state.loadError = "";
      state.accessError = "";
      try {
        accountId = currentAccountId();
        state.progress = readProgress();
      } catch (error) {
        protectReadFailure();
      }
      refreshError();
      notify("load");
      return state.progress;
    }
    function ensureAccount() {
      var nextId;
      try { nextId = currentAccountId(); } catch (error) { return; }
      if (nextId !== accountId) load();
    }
    function isReadOnly() {
      ensureAccount();
      try { return Boolean(store && typeof store.isReadOnly === "function" && store.isReadOnly()); }
      catch (error) { return true; }
    }
    function setProgress(field, value, hallId) {
      ensureAccount();
      if (state.loadError) { refreshError(); notify("error"); return false; }
      var key = fieldKey(field, hallId);
      var hall = hallId ? hallById(hallId) : null;
      var sharedField = field === "playerLevel" || field === "herbs";
      if ((!sharedField && (field !== "level" && field !== "tokens")) || (!sharedField && !hall) || (sharedField && hallId)) {
        state.fieldErrors[key] = "未知的六堂进度字段。";
        refreshError(); notify("error"); return false;
      }
      var parsed = core.parseInteger(value, 0, field === "level" ? data.maxLevel : Number.MAX_SAFE_INTEGER, field === "playerLevel");
      if (!parsed.valid) {
        state.fieldErrors[key] = field === "level"
          ? hall.name + "当前等级必须是0～" + data.maxLevel + "的整数。"
          : (field === "playerLevel" ? "玩家等级" : field === "herbs" ? "七星珠草库存" : hall.name + "信物库存") + "必须是非负安全整数" + (field === "playerLevel" ? "，也可留空。" : "。");
        refreshError(); notify("error"); return false;
      }
      if (isReadOnly()) {
        state.accessError = "当前账号为只读状态，进度未保存；仍可按已保存的进度进行临时升级规划。";
        refreshError(); notify("error"); return false;
      }
      var candidate;
      try {
        // A lease handoff can leave this page behind the account's latest saved snapshot.
        candidate = readProgress();
      } catch (error) {
        protectReadFailure();
        refreshError(); notify("error"); return false;
      }
      if (sharedField) candidate[field] = parsed.value;
      else candidate.halls[hallId][field] = parsed.value;
      try {
        if (!store || typeof store.setItem !== "function") throw new Error("Account storage unavailable");
        if (store.setItem(core.STORE_KEY || STORE_KEY, JSON.stringify(candidate)) === false) throw new Error("Progress save rejected");
        state.progress = candidate;
        delete state.fieldErrors[key];
        state.accessError = "";
        updateTargetErrors();
        refreshError(); notify("progress"); return true;
      } catch (error) {
        state.fieldErrors[key] = "六堂进度保存失败，原进度未改变。请检查账号编辑权或浏览器存储空间后重试。";
        refreshError(); notify("error"); return false;
      }
    }
    function toggleHall(id, selected) {
      ensureAccount();
      if (!hallById(id)) return false;
      var index = state.plan.selected.indexOf(id);
      var enabled = selected === undefined ? index === -1 : Boolean(selected);
      if (enabled && index === -1) state.plan.selected.push(id);
      if (!enabled && index !== -1) state.plan.selected.splice(index, 1);
      updateTargetErrors();
      refreshError(); notify("plan"); return true;
    }
    function setTarget(id, value) {
      ensureAccount();
      if (!hallById(id)) return false;
      var parsed = core.parseInteger(value, 0, data.maxLevel, false);
      state.plan.targets[id] = parsed.valid ? parsed.value : value;
      updateTargetErrors();
      refreshError(); notify("plan"); return !state.targetErrors[id];
    }
    function setMode(mode) {
      ensureAccount();
      if (modes.indexOf(mode) !== -1) { state.mode = mode; notify("mode"); }
      return state.mode;
    }
    function calculate() {
      ensureAccount();
      var errors = Object.keys(state.fieldErrors).map(function (key) {
        return { hallId: key.indexOf(":") === -1 ? null : key.split(":")[0], message: state.fieldErrors[key] };
      });
      if (state.loadError) errors.unshift({ hallId: null, message: "个人进度未能读取，无法根据空白替代值生成可靠规划。" });
      if (errors.length) {
        return { valid: false, errors: errors, rows: [], herbs: null, playerCap: core.playerCap(state.progress.playerLevel, data), playerLevelKnown: state.progress.playerLevel !== null, selectedCount: state.plan.selected.length, hasLocked: false };
      }
      return core.calculatePlan(state.progress, state.plan, data);
    }
    function subscribe(listener) {
      listeners.push(listener);
      return function () { listeners = listeners.filter(function (item) { return item !== listener; }); };
    }
    load();
    if (store && typeof store.subscribeAccess === "function") {
      unsubscribeAccess = store.subscribeAccess(function (access) {
        ensureAccount();
        if (access && access.accountId !== accountId) return;
        // Refresh persisted values only: same-account lease events must keep the planning draft.
        refreshProgress();
        notify("access");
      });
    }
    return {
      state: state, setProgress: setProgress, toggleHall: toggleHall, setTarget: setTarget,
      setMode: setMode, calculate: calculate, load: load, isReadOnly: isReadOnly,
      subscribe: subscribe,
      destroy: function () { if (typeof unsubscribeAccess === "function") unsubscribeAccess(); listeners = []; }
    };
  }

  function inputHtml(field, label, value, hallId, maximum, hint) {
    var key = fieldKey(field, hallId);
    var id = "six-halls-" + key.replace(":", "-");
    return '<div class="six-halls-field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
      '<input id="' + id + '" type="number" min="0" max="' + maximum + '" step="1" inputmode="numeric" data-six-halls-progress="' + field + '"' +
      (hallId ? ' data-hall-id="' + hallId + '"' : "") + ' value="' + escapeHtml(value) + '" aria-describedby="' + id + '-error' + (hint ? " " + id + "-hint" : "") + '">' +
      (hint ? '<small id="' + id + '-hint" class="six-halls-muted">' + escapeHtml(hint) + '</small>' : "") +
      '<p id="' + id + '-error" class="six-halls-inline-error" data-six-halls-field-error="' + key + '" hidden></p></div>';
  }
  function buildMarkup(context) {
    var data = context.root.SIX_HALLS_DATA;
    var progress = context.controller.state.progress;
    var progressCards = data.halls.map(function (hall, index) {
      var saved = progress.halls[hall.id];
      return '<article class="six-halls-card"><div class="six-halls-card-heading"><span class="six-halls-order" aria-hidden="true">' + (index + 1) + '</span><h3>' + escapeHtml(hall.name) + '</h3></div>' +
        '<div class="six-halls-fields">' + inputHtml("level", "当前等级", saved.level, hall.id, data.maxLevel) +
        inputHtml("tokens", hall.name + "信物库存", saved.tokens, hall.id, Number.MAX_SAFE_INTEGER) + '</div>' +
        '<p class="six-halls-progress-status" data-six-halls-progress-status="' + hall.id + '"></p></article>';
    }).join("");
    var planCards = data.halls.map(function (hall) {
      return '<article class="six-halls-card" data-six-halls-plan-card="' + hall.id + '"><label class="six-halls-select-label"><input type="checkbox" data-six-halls-select="' + hall.id + '"><strong>' + escapeHtml(hall.name) + '</strong><span>加入规划</span></label>' +
        '<p class="six-halls-muted" data-six-halls-current="' + hall.id + '"></p><div class="six-halls-field"><label for="six-halls-target-' + hall.id + '">目标等级</label>' +
        '<input id="six-halls-target-' + hall.id + '" type="number" min="0" max="' + data.maxLevel + '" step="1" inputmode="numeric" data-six-halls-target="' + hall.id + '" value="50" aria-describedby="six-halls-target-error-' + hall.id + '">' +
        '<p id="six-halls-target-error-' + hall.id + '" class="six-halls-inline-error" data-six-halls-target-error="' + hall.id + '" hidden></p></div>' +
        '<div class="six-halls-quick" aria-label="' + escapeHtml(hall.name) + '目标等级快捷设置">' + [10, 20, 30, 40, 50].map(function (level) {
          return '<button type="button" class="seg" data-six-halls-quick="' + level + '" data-hall-id="' + hall.id + '">' + level + '级</button>';
        }).join("") + '</div></article>';
    }).join("");
    context.partition.innerHTML = '<nav class="six-halls-modes" aria-label="六堂子页">' + [["progress", "个人进度"], ["planner", "升级规划"], ["reference", "升级资料"]].map(function (entry) {
        return '<button type="button" class="seg" data-six-halls-mode="' + entry[0] + '" aria-controls="six-halls-' + entry[0] + '">' + entry[1] + '</button>';
      }).join("") + '</nav>' +
      '<p id="six-halls-readonly" class="six-halls-notice" role="status" hidden>当前账号为只读状态，个人进度不能保存；仍可调整临时规划。</p>' +
      '<p id="six-halls-error" class="six-halls-error" role="alert" hidden></p>' +
      '<section id="six-halls-progress" class="six-halls-page" aria-label="个人进度"><div class="panel six-halls-shared"><div class="six-halls-section-heading"><h3>玩家与共用库存</h3><span id="six-halls-account" class="six-halls-muted"></span></div>' +
      '<div class="six-halls-shared-fields">' + inputHtml("playerLevel", "玩家等级", progress.playerLevel, null, Number.MAX_SAFE_INTEGER, "可留空；留空时只计算材料，不判断等级限制。") +
      inputHtml("herbs", "七星珠草库存（六堂共用）", progress.herbs, null, Number.MAX_SAFE_INTEGER, "规划时只在合计中抵扣一次。") + '</div><p id="six-halls-cap" class="six-halls-notice"></p></div>' +
      '<p class="six-halls-muted">输入后自动保存。修改等级不会自动扣除或返还库存；计算也不会改写进度。</p><div class="six-halls-grid">' + progressCards + '</div></section>' +
      '<section id="six-halls-planner" class="six-halls-page" aria-label="升级规划" hidden><div class="six-halls-section-heading"><div><h3>选择本次升级目标</h3><p class="six-halls-muted">初始不勾选，目标均为50级。切换子页或分区保留草稿，刷新或换账号后重置。</p></div>' +
      '<button type="button" class="seg" data-six-halls-action="calculate">计算材料</button></div><div class="six-halls-grid">' + planCards + '</div><div id="six-halls-result" class="six-halls-result" aria-live="polite" aria-atomic="true"></div></section>' +
      '<section id="six-halls-reference" class="six-halls-page" aria-label="升级资料" hidden><div class="panel"><h3>通用升级资料</h3><p class="six-halls-muted">六堂使用同一份升级消耗表，每堂0→50级共需七星珠草904、该堂信物435。累计从0级开始计算；“—”表示该步骤未单列玩家等级门槛。</p>' +
      '<div class="six-halls-reference-filter"><div class="six-halls-field"><label for="six-halls-reference-min">目标等级起点</label><input id="six-halls-reference-min" type="number" min="1" max="50" step="1" inputmode="numeric" data-six-halls-reference-bound="min" value="1"></div>' +
      '<span aria-hidden="true">至</span><div class="six-halls-field"><label for="six-halls-reference-max">目标等级终点</label><input id="six-halls-reference-max" type="number" min="1" max="50" step="1" inputmode="numeric" data-six-halls-reference-bound="max" value="50"></div><button type="button" class="seg" data-six-halls-action="reference-reset">全部等级</button></div>' +
      '<p id="six-halls-reference-status" class="six-halls-muted" role="status"></p><div id="six-halls-reference-content"></div></div></section>';
    var doc = context.root.document;
    context.elements = {
      error: doc.getElementById("six-halls-error"), readonly: doc.getElementById("six-halls-readonly"),
      account: doc.getElementById("six-halls-account"), cap: doc.getElementById("six-halls-cap"),
      result: doc.getElementById("six-halls-result"), reference: doc.getElementById("six-halls-reference-content"),
      referenceStatus: doc.getElementById("six-halls-reference-status")
    };
  }

  function updateInput(context, input, value, error) {
    input.setAttribute("aria-invalid", error ? "true" : "false");
    if (context.root.document.activeElement !== input && !error) input.value = value == null ? "" : String(value);
  }
  function showText(element, message) {
    element.textContent = message || "";
    element.hidden = !message;
  }
  function capText(controller, data, core) {
    var level = controller.state.progress.playerLevel;
    if (level === null) return "未填写玩家等级：仍可计算材料，但无法判断升级限制。";
    return "玩家等级" + numberText(level) + "级，当前堂口可升上限为" + core.playerCap(level, data) + "级。未来目标仍可规划。";
  }
  function metric(label, value, className, attribute) {
    return '<div' + (className ? ' class="' + className + '"' : "") + '><dt>' + label + '</dt><dd' + (attribute ? " " + attribute : "") + '>' + numberText(value) + '</dd></div>';
  }
  function renderResult(context) {
    var controller = context.controller;
    var result = controller.calculate();
    var data = context.root.SIX_HALLS_DATA;
    var core = context.root.SIX_HALLS;
    if (!result.valid) {
      context.elements.result.innerHTML = '<div class="six-halls-error" role="alert"><h3>本次规划无法计算</h3><p>请修正输入或保存问题；未展示旧的有效结果。</p><ul>' + result.errors.map(function (error) {
        return '<li>' + escapeHtml(error.message) + '</li>';
      }).join("") + '</ul></div>';
      return;
    }
    if (!result.selectedCount) {
      context.elements.result.innerHTML = '<div class="panel six-halls-empty"><h3>尚未选择堂口</h3><p>勾选需要升级的堂口后，查看共用七星珠草和各堂信物缺口。</p></div>';
      return;
    }
    var materialsMissing = result.herbs.missing > 0 || result.rows.some(function (row) { return row.tokenMissing > 0; });
    var rows = result.rows.map(function (row) {
      var cost = core.calculateCost(row.current, row.target, data);
      var lockedSteps = row.locked ? cost.steps.filter(function (step) { return step.to > Math.max(row.current, row.currentCap); }) : [];
      var gate = row.current === row.target ? "目标已达成，不含新增升级步骤。" : !result.playerLevelKnown ? "玩家等级未填写，无法判断升级限制。" : row.locked
        ? "目标尚未解锁：当前可升上限" + row.currentCap + "级，目标所需玩家等级" + row.requiredPlayerLevel + "级。"
        : "等级限制：本次目标已解锁。";
      var stepsMarkup = lockedSteps.length ? '<details class="six-halls-locked-steps"><summary>查看未解锁步骤（' + lockedSteps.length + '步）</summary><ol>' + lockedSteps.map(function (step) {
        return '<li>' + step.from + '→' + step.to + '级：七星珠草' + step.herbs + '、信物' + step.tokens + (step.playerLevel == null ? "" : '；玩家等级需' + step.playerLevel + '级') + '</li>';
      }).join("") + '</ol></details>' : "";
      return '<article class="six-halls-card six-halls-result-card" data-six-halls-result-row="' + row.id + '"><div class="six-halls-section-heading"><h3>' + escapeHtml(row.name) + '</h3><span>' + row.current + ' → ' + row.target + '级</span></div>' +
        (row.current === row.target ? '<p class="six-halls-enough">目标已达成，无新增消耗。</p>' : "") +
        '<p class="six-halls-herb-need">七星珠草需求 <strong>' + numberText(row.herbs) + '</strong><small>原始需求，未在本堂抵扣共享库存</small></p>' +
        '<h4>本堂信物（独立库存）</h4><dl class="six-halls-metrics">' + metric("需求", row.tokens) + metric("库存", row.tokenStock) + metric("缺口", row.tokenMissing, row.tokenMissing > 0 ? "six-halls-shortage" : "six-halls-enough") + metric("剩余", row.tokenRemaining) + '</dl>' +
        '<p class="' + (row.tokenMissing > 0 ? "six-halls-shortage" : "six-halls-enough") + '">' + (row.tokenMissing > 0 ? "本堂信物不足，缺" + numberText(row.tokenMissing) : "本堂信物充足，缺口0") + '</p>' +
        '<div class="six-halls-level-status"><h4>等级解锁状态</h4><p class="' + (row.locked ? "six-halls-warning" : "six-halls-muted") + '">' + escapeHtml(gate) + '</p>' +
        (row.progressConflict ? '<p class="six-halls-warning">已保存的当前等级高于玩家等级可升上限；仅提示，不会自动降低当前等级。</p>' : "") + stepsMarkup + '</div></article>';
    }).join("");
    context.elements.result.innerHTML = '<section class="panel six-halls-total"><div class="six-halls-section-heading"><h3>七星珠草合计</h3><span>已选' + result.selectedCount + '堂</span></div><p class="six-halls-muted">六堂共用库存，仅在此处抵扣一次；各堂信物不能互抵。</p>' +
      '<dl class="six-halls-metrics">' + metric("总需求", result.herbs.need, "", 'data-six-halls-herbs="need"') + metric("共享库存", result.herbs.stock, "", 'data-six-halls-herbs="stock"') + metric("总缺口", result.herbs.missing, result.herbs.missing > 0 ? "six-halls-shortage" : "six-halls-enough", 'data-six-halls-herbs="missing"') + metric("剩余库存", result.herbs.remaining, "", 'data-six-halls-herbs="remaining"') + '</dl>' +
      '<p class="' + (materialsMissing ? "six-halls-shortage" : "six-halls-enough") + '">材料状态：' + (materialsMissing ? "仍有材料缺口，请分别查看七星珠草及各堂信物。" : "本次目标材料充足，全部缺口为0。") + '</p>' +
      '<div class="six-halls-level-status"><h4>等级解锁状态</h4><p class="six-halls-muted">' + escapeHtml(capText(controller, data, core)) + '</p>' +
      (result.hasLocked ? '<p class="six-halls-warning">规划包含尚未解锁的升级步骤；材料仍按完整目标计算，不表示现在可全部升级。</p>' : "") + '</div></section><div class="six-halls-grid">' + rows + '</div>';
  }
  function renderReference(context) {
    var core = context.root.SIX_HALLS;
    var min = core.parseInteger(context.referenceBounds.min, 1, 50, false);
    var max = core.parseInteger(context.referenceBounds.max, 1, 50, false);
    var valid = min.valid && max.valid && min.value <= max.value;
    context.partition.querySelectorAll("[data-six-halls-reference-bound]").forEach(function (input) {
      input.setAttribute("aria-invalid", valid ? "false" : "true");
    });
    context.elements.referenceStatus.classList.toggle("six-halls-inline-error", !valid);
    if (!valid) {
      context.elements.referenceStatus.textContent = "筛选起止等级必须为1～50的整数，且起点不能大于终点。";
      context.elements.reference.innerHTML = "";
      return;
    }
    var rows = core.referenceRows(context.root.SIX_HALLS_DATA).filter(function (row) { return row.to >= min.value && row.to <= max.value; });
    context.elements.referenceStatus.textContent = "当前展示目标等级" + min.value + "～" + max.value + "级，共" + rows.length + "步；累计消耗始终从0级计。";
    context.elements.reference.innerHTML = '<table class="six-halls-reference-table"><caption>六堂通用升级消耗与玩家等级门槛</caption><thead><tr><th scope="col">起点 → 终点</th><th scope="col">单次七星珠草</th><th scope="col">单次信物</th><th scope="col">累计七星珠草</th><th scope="col">累计信物</th><th scope="col">玩家等级门槛</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><th scope="row" data-label="升级步骤">' + row.from + ' → ' + row.to + '级</th><td data-label="单次七星珠草">' + row.herbs + '</td><td data-label="单次信物">' + row.tokens + '</td><td data-label="累计七星珠草">' + row.cumulativeHerbs + '</td><td data-label="累计信物">' + row.cumulativeTokens + '</td><td data-label="玩家等级门槛">' + (row.playerLevel == null ? "—" : row.playerLevel + "级") + '</td></tr>';
    }).join("") + '</tbody></table>';
  }
  function renderUpdates(context) {
    if (!context.visible || context.partition.hidden || !context.controller) return;
    var controller = context.controller;
    var state = controller.state;
    var core = context.root.SIX_HALLS;
    var data = context.root.SIX_HALLS_DATA;
    var readonly = controller.isReadOnly();
    var currentCap = core.playerCap(state.progress.playerLevel, data);
    context.partition.querySelectorAll("[data-six-halls-mode]").forEach(function (button) {
      var active = button.dataset.sixHallsMode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    modes.forEach(function (mode) { context.root.document.getElementById("six-halls-" + mode).hidden = mode !== state.mode; });
    showText(context.elements.error, state.error);
    context.elements.readonly.hidden = !readonly;
    context.elements.cap.textContent = state.loadError ? "个人进度未能读取；请到设置恢复备份后刷新页面。" : capText(controller, data, core);
    var account = null;
    try { account = context.root.QinshiAccounts.currentAccount ? context.root.QinshiAccounts.currentAccount() : null; }
    catch (error) { account = null; }
    context.elements.account.textContent = account ? account.name + " · " + account.server : "当前游戏账号";
    context.partition.querySelectorAll("[data-six-halls-progress]").forEach(function (input) {
      var field = input.dataset.sixHallsProgress;
      var id = input.dataset.hallId;
      var error = state.fieldErrors[fieldKey(field, id)];
      input.disabled = readonly || Boolean(state.loadError);
      updateInput(context, input, state.loadError ? "" : id ? state.progress.halls[id][field] : state.progress[field], error);
    });
    context.partition.querySelectorAll("[data-six-halls-field-error]").forEach(function (element) { showText(element, state.fieldErrors[element.dataset.sixHallsFieldError]); });
    context.partition.querySelectorAll("[data-six-halls-progress-status]").forEach(function (element) {
      var level = state.progress.halls[element.dataset.sixHallsProgressStatus].level;
      var conflict = currentCap !== null && level > currentCap;
      element.textContent = state.loadError ? "个人进度未能读取，暂不显示替代等级。" : conflict ? "当前等级高于玩家等级可升上限，仅提示，不会自动调整。" : level === data.maxLevel ? "已满级，后续规划不会重复计入已完成消耗。" : "当前" + level + " / " + data.maxLevel + "级，信物仅用于本堂。";
      element.classList.toggle("six-halls-warning", conflict);
    });
    data.halls.forEach(function (hall) {
      var saved = state.progress.halls[hall.id];
      var selected = state.plan.selected.indexOf(hall.id) !== -1;
      var checkbox = context.partition.querySelector('[data-six-halls-select="' + hall.id + '"]');
      checkbox.checked = selected;
      context.partition.querySelector('[data-six-halls-plan-card="' + hall.id + '"]').classList.toggle("is-selected", selected);
      context.partition.querySelector('[data-six-halls-current="' + hall.id + '"]').textContent = state.loadError ? "个人进度未能读取，规划计算已暂停。" : "当前" + saved.level + "级 · 本堂信物库存" + numberText(saved.tokens);
      updateInput(context, context.partition.querySelector('[data-six-halls-target="' + hall.id + '"]'), state.plan.targets[hall.id], state.targetErrors[hall.id]);
      showText(context.partition.querySelector('[data-six-halls-target-error="' + hall.id + '"]'), state.targetErrors[hall.id]);
    });
    context.partition.querySelectorAll("[data-six-halls-quick]").forEach(function (button) {
      var level = Number(button.dataset.sixHallsQuick);
      var id = button.dataset.hallId;
      button.disabled = level < state.progress.halls[id].level;
      button.classList.toggle("active", state.plan.targets[id] === level);
    });
    if (state.mode === "planner") renderResult(context);
    if (state.mode === "reference") {
      context.partition.querySelectorAll("[data-six-halls-reference-bound]").forEach(function (input) {
        if (context.root.document.activeElement !== input) input.value = context.referenceBounds[input.dataset.sixHallsReferenceBound];
      });
      renderReference(context);
    }
  }

  function fallbackQueue(root, render) {
    var pending = null;
    function cancel() { if (pending !== null) root.clearTimeout(pending); pending = null; }
    function flush() { cancel(); render(); }
    return { schedule: function () { cancel(); pending = root.setTimeout(flush, 80); }, cancel: cancel, flush: flush };
  }
  function mount(context) {
    if (context.controller) return;
    var root = context.root;
    context.controller = createController({ data: root.SIX_HALLS_DATA, core: root.SIX_HALLS, store: root.QinshiAccounts });
    context.referenceBounds = { min: "1", max: "50" };
    context.queue = root.UI_PERFORMANCE && root.UI_PERFORMANCE.createRefreshQueue
      ? root.UI_PERFORMANCE.createRefreshQueue(function () { renderUpdates(context); }, 80)
      : fallbackQueue(root, function () { renderUpdates(context); });
    buildMarkup(context);
    context.partition.dataset.sixHallsInitialized = "true";
    context.controller.subscribe(function (state, type) {
      if (type === "load") {
        context.referenceBounds = { min: "1", max: "50" };
      }
      if (context.visible) context.queue.schedule();
    });
    context.partition.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button || !context.partition.contains(button) || button.disabled) return;
      if (button.hasAttribute("data-six-halls-mode")) context.controller.setMode(button.dataset.sixHallsMode);
      else if (button.hasAttribute("data-six-halls-quick")) context.controller.setTarget(button.dataset.hallId, button.dataset.sixHallsQuick);
      else if (button.dataset.sixHallsAction === "reference-reset") {
        context.referenceBounds = { min: "1", max: "50" };
        context.partition.querySelectorAll("[data-six-halls-reference-bound]").forEach(function (input) { input.value = context.referenceBounds[input.dataset.sixHallsReferenceBound]; });
      } else if (button.dataset.sixHallsAction !== "calculate") return;
      context.queue.flush();
    });
    context.partition.addEventListener("input", function (event) {
      var input = event.target;
      if (event.isComposing) return;
      // Number inputs may expose an empty value for unfinished numbers, not just a genuine clear.
      var value = input.validity && input.validity.badInput ? NaN : input.value;
      if (input.hasAttribute("data-six-halls-progress")) context.controller.setProgress(input.dataset.sixHallsProgress, value, input.dataset.hallId);
      else if (input.hasAttribute("data-six-halls-target")) context.controller.setTarget(input.dataset.sixHallsTarget, value);
      else if (input.hasAttribute("data-six-halls-reference-bound")) context.referenceBounds[input.dataset.sixHallsReferenceBound] = value;
      else return;
      if (context.controller.state.mode === "planner") context.elements.result.innerHTML = '<p class="six-halls-muted">输入已变化，正在更新规划…</p>';
      context.queue.schedule();
    });
    context.partition.addEventListener("change", function (event) {
      var input = event.target;
      if (!input.hasAttribute("data-six-halls-select")) return;
      context.controller.toggleHall(input.dataset.sixHallsSelect, input.checked);
      context.queue.flush();
    });
  }
  function init(root) {
    if (!root || !root.document || !root.SIX_HALLS_DATA || !root.SIX_HALLS || !root.QinshiAccounts) return null;
    var partition = root.document.getElementById("partition-six-halls");
    if (!partition) return null;
    var existing = contexts.find(function (context) { return context.partition === partition; });
    if (existing) return existing.controller;
    var context = { root: root, partition: partition, controller: null, visible: false, queue: null };
    contexts.push(context);
    function activate(event) {
      var active = event ? event.detail && event.detail.name === "six-halls" : !partition.hidden;
      context.visible = Boolean(active && !partition.hidden);
      if (!context.visible) { if (context.queue) context.queue.cancel(); return; }
      mount(context);
      context.queue.flush();
    }
    root.document.addEventListener("qinshi:partitionchange", activate);
    activate();
    return context.controller;
  }

  return { STORE_KEY: STORE_KEY, createController: createController, init: init };
});
