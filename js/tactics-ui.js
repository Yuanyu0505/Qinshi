(function () {
  "use strict";

  var DATA = window.TACTICS_DATA;
  var CORE = window.TACTICS;
  var STORE_KEY = "qinshi_tactics_progress_v1";
  var state = {
    selectedId: "",
    editing: false,
    referenceMode: "collapsed",
    progress: {},
    calculator: null,
    draft: null,
    storageError: ""
  };
  var el = {};

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function integer(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatNumber(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(number);
  }

  function formatAttribute(item) {
    return item.name + "+" + formatNumber(item.value) + (item.unit === "percent" ? "%" : "");
  }

  function rankText(rank) {
    return Number(rank) < 0 ? "未激活" : rank + "阶";
  }

  function tacticById(id) {
    var items = DATA && Array.isArray(DATA.items) ? DATA.items : [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id === id) return items[i];
    }
    return null;
  }

  function selectedTactic() {
    return tacticById(state.selectedId);
  }

  function findRank(tactic, rank) {
    var ranks = tactic && Array.isArray(tactic.ranks) ? tactic.ranks : [];
    for (var i = 0; i < ranks.length; i++) {
      if (ranks[i] && ranks[i].rank === rank) return ranks[i];
    }
    return null;
  }

  function findMantraStage(mantra, rank) {
    var stages = mantra && Array.isArray(mantra.stages) ? mantra.stages : [];
    for (var i = 0; i < stages.length; i++) {
      if (stages[i] && stages[i].rank === rank) return stages[i];
    }
    return null;
  }

  function isStandard(tactic) {
    return tactic && tactic.kind === "standard";
  }

  function cloneProgress(tactic, progress) {
    return CORE.normalizeProgress(tactic, progress);
  }

  function orderedTactics() {
    var items = DATA && Array.isArray(DATA.items) ? DATA.items : [];
    var order = DATA && DATA.meta && Array.isArray(DATA.meta.order) ? DATA.meta.order : [];
    var result = [];

    order.forEach(function (name) {
      var found = items.find(function (item) {
        return item && item.name && item.name.charAt(0) === name;
      });
      if (found && result.indexOf(found) === -1) result.push(found);
    });
    items.forEach(function (item) {
      if (item && result.indexOf(item) === -1) result.push(item);
    });
    return result;
  }

  function rehearsalInfo(tactic, progress) {
    var row = findRank(tactic, integer(progress && progress.rank, 0));
    var rehearsal = row && row.rehearsal;
    if (!rehearsal) return null;

    var singleHorn = integer(rehearsal.singleHorn, 0);
    var guaranteeHorn = integer(rehearsal.guaranteeHorn, 0);
    if (!singleHorn || !guaranteeHorn) return null;

    var spent = clamp(integer(progress && progress.rehearsalSpent, 0), 0, guaranteeHorn);
    var remainingRuns = Math.ceil(Math.max(0, guaranteeHorn - spent) / singleHorn);
    return {
      singleHorn: singleHorn,
      guaranteeHorn: guaranteeHorn,
      spent: spent,
      remainingRuns: remainingRuns,
      actualAdditionalHorn: remainingRuns * singleHorn,
      inputMaximum: Math.ceil(guaranteeHorn / singleHorn) * singleHorn,
      proficiency: row.proficiency
    };
  }

  function loadProgress() {
    var parsed = {};
    try {
      parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch (error) {
      parsed = {};
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};

    orderedTactics().forEach(function (tactic) {
      state.progress[tactic.id] = CORE.normalizeProgress(tactic, parsed[tactic.id]);
    });
  }

  function saveProgress() {
    var stored = {};
    orderedTactics().forEach(function (tactic) {
      stored[tactic.id] = CORE.normalizeProgress(tactic, state.progress[tactic.id]);
    });

    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
      state.storageError = "";
      return true;
    } catch (error) {
      state.storageError = "保存个人进度失败，请检查浏览器存储权限。";
      return false;
    }
  }

  function resetCalculatorFromProgress() {
    var tactic = selectedTactic();
    if (!tactic) {
      state.calculator = null;
      return;
    }
    var progress = cloneProgress(tactic, state.progress[tactic.id]);
    var target = cloneProgress(tactic, progress);
    target.rehearsalSpent = 0;
    state.calculator = {
      start: cloneProgress(tactic, progress),
      target: target
    };
  }

  function selectTactic(id) {
    state.selectedId = id;
    state.editing = false;
    state.draft = null;
    state.referenceMode = "collapsed";
    resetCalculatorFromProgress();
    renderAll();
  }

  function rankOptions(selected) {
    var options = [];
    for (var rank = 0; rank <= 15; rank++) {
      options.push('<option value="' + rank + '"' + (rank === selected ? " selected" : "") + ">" + rank + "阶</option>");
    }
    return options.join("");
  }

  function mantraOptions(tactic, mantra, tacticRank, selected) {
    var allowed = CORE.allowedMantraRank(tactic, mantra.id, tacticRank);
    var value = clamp(integer(selected, -1), -1, allowed);
    var options = ['<option value="-1"' + (value === -1 ? " selected" : "") + ">未激活</option>"];
    for (var rank = 0; rank <= allowed; rank++) {
      options.push('<option value="' + rank + '"' + (rank === value ? " selected" : "") + ">" + rank + "阶</option>");
    }
    return options.join("");
  }

  function progressMantraHtml(tactic, progress, mantra) {
    var rank = progress.mantras[mantra.id];
    if (rank < 0) return '<span class="tactics-mantra"><b>' + escapeHtml(mantra.name) + "真言</b>：未激活</span>";
    var stage = findMantraStage(mantra, rank);
    var attribute = stage ? formatAttribute({ name: mantra.attribute, value: stage.value, unit: mantra.unit }) : "属性未知";
    return '<span class="tactics-mantra"><b>' + escapeHtml(mantra.name) + "真言</b>：" + rankText(rank) + " · " + escapeHtml(attribute) + "</span>";
  }

  function progressSummaryHtml(tactic, progress) {
    var attributes = CORE.attributeSnapshot(tactic, progress).filter(function (item) {
      return item.group !== "mantra";
    });
    var rehearsal = rehearsalInfo(tactic, progress);
    var basicAttributes = attributes.length ? attributes.map(function (item) {
      return escapeHtml(formatAttribute(item));
    }).join("、") : "无";
    var html = '<div class="tactics-progress-summary"><div><span class="muted-tip">兵法阶数</span><strong>' + progress.rank + "阶</strong></div>" +
      '<div><span class="muted-tip">基础属性</span><strong>' + basicAttributes + "</strong></div>" +
      '<div><span class="muted-tip">真言</span><div class="tactics-mantra-list">' + tactic.mantras.map(function (mantra) {
        return progressMantraHtml(tactic, progress, mantra);
      }).join("") + "</div></div>";
    if (isStandard(tactic) && rehearsal) {
      html += '<div><span class="muted-tip">本阶演练</span><strong>本阶已消耗 ' + formatNumber(rehearsal.spent) +
        "号角｜保底阈值" + formatNumber(rehearsal.guaranteeHorn) + "｜再演练" + formatNumber(rehearsal.remainingRuns) +
        "次｜实际还需" + formatNumber(rehearsal.actualAdditionalHorn) + "号角</strong></div>";
    }
    return html + "</div>";
  }

  function editorMantraHtml(tactic, draft, mantra) {
    return '<label><span>' + escapeHtml(mantra.name) + "真言</span><select data-progress-field=\"mantra\" data-mantra-id=\"" + escapeHtml(mantra.id) + "\">" +
      mantraOptions(tactic, mantra, draft.rank, draft.mantras[mantra.id]) + "</select></label>";
  }

  function progressEditorHtml(tactic, draft) {
    var rehearsal = rehearsalInfo(tactic, { rank: draft.rank, rehearsalSpent: 0 });
    var html = '<form class="tactics-editor" data-tactics-progress-form><div class="tactics-form-grid">' +
      '<label><span>兵法阶数</span><select data-progress-field="rank">' + rankOptions(draft.rank) + "</select></label>" +
      tactic.mantras.map(function (mantra) { return editorMantraHtml(tactic, draft, mantra); }).join("");
    if (isStandard(tactic) && rehearsal) {
      html += '<label><span>本阶已消耗号角</span><input type="number" min="0" step="' + rehearsal.singleHorn + '" max="' + rehearsal.inputMaximum +
        '" data-field="rehearsalSpent" data-progress-field="rehearsalSpent" value="' + escapeHtml(draft.rehearsalSpent) + '"></label>';
    }
    html += '</div><div class="tactics-editor-actions"><button type="button" class="seg active" data-action="save-progress">保存</button><button type="button" class="seg" data-action="cancel-edit">取消</button></div></form>';
    return html;
  }

  function renderProgress() {
    var tactic = selectedTactic();
    if (!tactic || !el.progress) return;
    var progress = cloneProgress(tactic, state.progress[tactic.id]);
    var html = '<section class="panel tactics-progress-panel"><div class="ins-card-head"><div><div class="panel-title">个人进度</div><h2>' + escapeHtml(tactic.name) + "</h2></div>" +
      '<button type="button" class="seg" data-action="edit-progress">编辑进度</button></div>';
    if (state.storageError) html += '<div class="error" role="alert">' + escapeHtml(state.storageError) + "</div>";
    html += progressSummaryHtml(tactic, progress);
    if (state.editing && state.draft) html += progressEditorHtml(tactic, state.draft);
    el.progress.innerHTML = html + "</section>";
  }

  function syncDraftFromForm() {
    var tactic = selectedTactic();
    var form = el.progress && el.progress.querySelector("[data-tactics-progress-form]");
    if (!tactic || !form || !state.draft) return;

    var rankControl = form.querySelector('[data-progress-field="rank"]');
    state.draft.rank = clamp(integer(rankControl && rankControl.value, state.draft.rank), 0, 15);
    tactic.mantras.forEach(function (mantra) {
      var control = form.querySelector('[data-progress-field="mantra"][data-mantra-id="' + mantra.id + '"]');
      if (control) state.draft.mantras[mantra.id] = integer(control.value, -1);
    });
    var rehearsalControl = form.querySelector('[data-progress-field="rehearsalSpent"]');
    if (rehearsalControl) state.draft.rehearsalSpent = rehearsalControl.value;
  }

  function clampDraftMantras(tactic) {
    tactic.mantras.forEach(function (mantra) {
      var allowed = CORE.allowedMantraRank(tactic, mantra.id, state.draft.rank);
      state.draft.mantras[mantra.id] = clamp(integer(state.draft.mantras[mantra.id], -1), -1, allowed);
    });
  }

  function reductionsForSave(tactic, previous, next) {
    return tactic.mantras.reduce(function (changes, mantra) {
      var before = integer(previous.mantras[mantra.id], -1);
      var after = integer(next.mantras[mantra.id], -1);
      if (after < before) changes.push(mantra.name + rankText(before) + "→" + rankText(after));
      return changes;
    }, []);
  }

  function saveEditedProgress() {
    var tactic = selectedTactic();
    if (!tactic || !state.draft) return;
    syncDraftFromForm();

    var previous = cloneProgress(tactic, state.progress[tactic.id]);
    var nextRank = clamp(integer(state.draft.rank, previous.rank), 0, 15);
    var candidate = nextRank === previous.rank
      ? cloneProgress(tactic, previous)
      : CORE.changeRank(tactic, previous, nextRank);

    candidate.rank = nextRank;
    tactic.mantras.forEach(function (mantra) {
      candidate.mantras[mantra.id] = state.draft.mantras[mantra.id];
    });
    if (nextRank === previous.rank) candidate.rehearsalSpent = state.draft.rehearsalSpent;
    var next = CORE.normalizeProgress(tactic, candidate);
    var reductions = reductionsForSave(tactic, previous, next);
    if (reductions.length && !window.confirm("降低兵法阶数将调整：" + reductions.join("、") + "。是否保存？")) return;

    state.progress[tactic.id] = next;
    state.editing = false;
    state.draft = null;
    saveProgress();
    resetCalculatorFromProgress();
    renderAll();
  }

  function handleProgressClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button || !el.progress.contains(button)) return;
    if (button.dataset.action === "edit-progress") {
      var tactic = selectedTactic();
      if (!tactic) return;
      state.editing = true;
      state.draft = cloneProgress(tactic, state.progress[tactic.id]);
      renderProgress();
    } else if (button.dataset.action === "cancel-edit") {
      state.editing = false;
      state.draft = null;
      renderProgress();
    } else if (button.dataset.action === "save-progress") {
      saveEditedProgress();
    }
  }

  function handleProgressChange(event) {
    if (!event.target.matches("[data-progress-field]")) return;
    syncDraftFromForm();
    if (event.target.dataset.progressField === "rank") {
      var tactic = selectedTactic();
      if (!tactic || !state.draft) return;
      clampDraftMantras(tactic);
      renderProgress();
    }
  }

  function handleProgressInput(event) {
    if (!event.target.matches("[data-progress-field=\"rehearsalSpent\"]")) return;
    syncDraftFromForm();
  }

  function calculatorMantraHtml(tactic, side, calculator, mantra) {
    return '<label><span>' + escapeHtml(mantra.name) + "真言</span><select data-calc-field=\"" + side + "-mantra\" data-mantra-id=\"" + escapeHtml(mantra.id) + "\">" +
      mantraOptions(tactic, mantra, calculator[side].rank, calculator[side].mantras[mantra.id]) + "</select></label>";
  }

  function calculatorSideHtml(tactic, side, calculator) {
    var sideName = side === "start" ? "起点" : "终点";
    var progress = calculator[side];
    var rehearsal = rehearsalInfo(tactic, { rank: progress.rank, rehearsalSpent: 0 });
    var html = '<div class="tactics-calculator-side"><h3>' + sideName + "</h3><div class=\"tactics-form-grid\">" +
      '<label><span>' + sideName + '兵法阶数</span><select data-calc-field="' + side + '-rank">' + rankOptions(progress.rank) + "</select></label>" +
      tactic.mantras.map(function (mantra) { return calculatorMantraHtml(tactic, side, calculator, mantra); }).join("");
    if (side === "start" && isStandard(tactic) && rehearsal) {
      html += '<label><span>本阶已消耗号角</span><input type="number" min="0" step="' + rehearsal.singleHorn + '" max="' + rehearsal.inputMaximum +
        '" data-calc-field="start-rehearsalSpent" value="' + escapeHtml(progress.rehearsalSpent) + '"></label>';
    }
    return html + "</div></div>";
  }

  function renderCalculator() {
    var tactic = selectedTactic();
    if (!tactic || !el.calculator) return;
    if (!state.calculator) resetCalculatorFromProgress();
    var html = '<section class="panel tactics-calculator-panel"><div class="ins-card-head"><div><div class="panel-title">目标计算</div><h2>自由调整起点与终点</h2></div>' +
      '<div class="tactics-calculator-actions"><button type="button" class="seg" data-action="restore-progress">恢复为个人进度</button><button type="button" class="seg active" data-action="maximize-target">一键升至允许上限</button></div></div>' +
      '<div class="tactics-calculator-grid">' + calculatorSideHtml(tactic, "start", state.calculator) + calculatorSideHtml(tactic, "target", state.calculator) +
      '</div><div data-tactics-result></div></section>';
    el.calculator.innerHTML = html;
    renderCalculatorResult();
  }

  function clampCalculatorMantras(tactic, side) {
    var sideState = state.calculator[side];
    tactic.mantras.forEach(function (mantra) {
      var allowed = CORE.allowedMantraRank(tactic, mantra.id, sideState.rank);
      sideState.mantras[mantra.id] = clamp(integer(sideState.mantras[mantra.id], -1), -1, allowed);
    });
  }

  function maximizeTargetMantras(tactic) {
    tactic.mantras.forEach(function (mantra) {
      state.calculator.target.mantras[mantra.id] = CORE.allowedMantraRank(
        tactic, mantra.id, state.calculator.target.rank
      );
    });
    renderCalculator();
  }

  function rehearsalInputError(tactic) {
    if (!isStandard(tactic)) return "";
    var progress = state.calculator.start;
    var info = rehearsalInfo(tactic, { rank: progress.rank, rehearsalSpent: 0 });
    if (!info) return "";
    var raw = progress.rehearsalSpent;
    var number = Number(raw);
    if (String(raw == null ? "" : raw).trim() === "" || !Number.isFinite(number) || Math.trunc(number) !== number || number < 0 || number > info.inputMaximum || number % info.singleHorn !== 0) {
      return "本阶已消耗号角必须为0至" + formatNumber(info.inputMaximum) + "的" + formatNumber(info.singleHorn) + "的倍数";
    }
    return "";
  }

  function calculatorOutcome(tactic) {
    var plan = CORE.calculatePlan(tactic, state.calculator.start, state.calculator.target);
    var errors = plan.valid ? [] : plan.errors.slice();
    var inputError = rehearsalInputError(tactic);
    if (inputError) errors.push(inputError);
    return { plan: plan, errors: errors };
  }

  function attributeDeltasHtml(plan) {
    var values = plan.attributeDeltas || [];
    if (!values.length) return "<p>当前没有属性变化。</p>";
    return "<ul>" + values.map(function (item) {
      var label = item.mantraName ? item.mantraName + "真言·" : "";
      return "<li>" + escapeHtml(label + formatAttribute({ name: item.name, value: item.delta, unit: item.unit })) + "</li>";
    }).join("") + "</ul>";
  }

  function materialsHtml(tactic, plan) {
    var rehearsalHorn = plan.rehearsal ? plan.rehearsal.actualAdditionalHorn : 0;
    var totalHorn = plan.advance.horn + rehearsalHorn;
    return "<ul>" +
      "<li>" + escapeHtml(tactic.markName) + "：" + formatNumber(plan.advance.mark) + "</li>" +
      "<li>功勋：" + formatNumber(plan.advance.merit) + "</li>" +
      "<li>进阶号角：" + formatNumber(plan.advance.horn) + "</li>" +
      "<li>演练号角：" + formatNumber(rehearsalHorn) + "</li>" +
      "<li>号角总计：" + formatNumber(totalHorn) + "</li></ul>";
  }

  function mantraPlanHtml(tactic, plan) {
    return "<ul>" + tactic.mantras.map(function (mantra) {
      var item = plan.mantras[mantra.id];
      if (!item || !item.steps.length) {
        return "<li>" + escapeHtml(mantra.name) + "真言：无需真言碎片，共0片</li>";
      }
      var previousRank = item.currentRank;
      var path = item.steps.map(function (step) {
        var text = rankText(previousRank) + "→" + rankText(step.rank) + " " + formatNumber(step.fragments);
        previousRank = step.rank;
        return text;
      }).join("、");
      return "<li>" + escapeHtml(mantra.name) + "真言：" + escapeHtml(path) + "，共" + formatNumber(item.fragments) + "片</li>";
    }).join("") + "</ul>";
  }

  function rehearsalPlanHtml(plan) {
    if (!plan.rehearsal) return "<p>该兵法无需目标阶演练。</p>";
    var rehearsal = plan.rehearsal;
    var proficiency = rehearsal.proficiency && rehearsal.proficiency.min != null && rehearsal.proficiency.max != null
      ? "（熟练度" + formatNumber(rehearsal.proficiency.min) + "–" + formatNumber(rehearsal.proficiency.max) + "）"
      : "";
    return "<p>目标" + rehearsal.rank + "阶" + proficiency + "</p><p>本阶已消耗 " + formatNumber(rehearsal.carriedSpent) +
      "号角｜保底阈值" + formatNumber(rehearsal.guaranteeHorn) + "｜再演练" + formatNumber(rehearsal.remainingRuns) +
      "次｜实际还需" + formatNumber(rehearsal.actualAdditionalHorn) + "号角</p>";
  }

  function resultsHtml(tactic, plan) {
    return '<div class="tactics-result-grid"><article><h3>属性提升</h3>' + attributeDeltasHtml(plan) + "</article>" +
      "<article><h3>兵法进阶材料</h3>" + materialsHtml(tactic, plan) + "</article>" +
      "<article><h3>真言碎片</h3>" + mantraPlanHtml(tactic, plan) + "</article>" +
      "<article><h3>目标阶演练</h3>" + rehearsalPlanHtml(plan) + "</article></div>";
  }

  function renderCalculatorResult() {
    var tactic = selectedTactic();
    var result = el.calculator && el.calculator.querySelector("[data-tactics-result]");
    if (!tactic || !result || !state.calculator) return;
    var outcome = calculatorOutcome(tactic);
    if (outcome.errors.length) {
      result.innerHTML = '<div class="error" role="alert">' + outcome.errors.map(function (error) {
        return "<div>" + escapeHtml(error) + "</div>";
      }).join("") + "</div>";
      return;
    }
    result.innerHTML = resultsHtml(tactic, outcome.plan);
  }

  function handleCalculatorClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button || !el.calculator.contains(button)) return;
    var tactic = selectedTactic();
    if (!tactic) return;
    if (button.dataset.action === "restore-progress") {
      resetCalculatorFromProgress();
      renderCalculator();
    } else if (button.dataset.action === "maximize-target") {
      maximizeTargetMantras(tactic);
    }
  }

  function handleCalculatorChange(event) {
    var control = event.target;
    var field = control.dataset.calcField;
    var tactic = selectedTactic();
    if (!field || !tactic || !state.calculator) return;
    var match = /^(start|target)-(rank|mantra)$/.exec(field);
    if (match) {
      var side = match[1];
      if (match[2] === "rank") {
        state.calculator[side].rank = clamp(integer(control.value, state.calculator[side].rank), 0, 15);
        clampCalculatorMantras(tactic, side);
        renderCalculator();
      } else {
        state.calculator[side].mantras[control.dataset.mantraId] = integer(control.value, -1);
        renderCalculatorResult();
      }
    } else if (field === "start-rehearsalSpent") {
      state.calculator.start.rehearsalSpent = control.value;
      renderCalculatorResult();
    }
  }

  function handleCalculatorInput(event) {
    if (event.target.dataset.calcField !== "start-rehearsalSpent" || !state.calculator) return;
    state.calculator.start.rehearsalSpent = event.target.value;
    renderCalculatorResult();
  }

  function handleSelectorClick(event) {
    var button = event.target.closest("button[data-tactic-id]");
    if (!button || !el.selector.contains(button) || !tacticById(button.dataset.tacticId)) return;
    selectTactic(button.dataset.tacticId);
  }

  function handleReferenceClick(event) {
    var button = event.target.closest("button[data-action=\"toggle-reference\"]");
    if (!button || !el.reference.contains(button)) return;
    state.referenceMode = state.referenceMode === "collapsed" ? "expanded" : "collapsed";
    el.reference.dataset.referenceMode = state.referenceMode;
  }

  function renderSelector() {
    if (!el.selector) return;
    el.selector.innerHTML = orderedTactics().map(function (tactic) {
      var active = tactic.id === state.selectedId;
      return '<button type="button" class="seg' + (active ? " active" : "") + '" data-tactic-id="' + escapeHtml(tactic.id) + '" aria-pressed="' + active + '">' +
        escapeHtml(tactic.name.charAt(0)) + "</button>";
    }).join("");
  }

  function renderAll() {
    renderSelector();
    if (!state.selectedId || !selectedTactic()) {
      if (el.workspace) el.workspace.hidden = true;
      if (el.progress) el.progress.innerHTML = "";
      if (el.calculator) el.calculator.innerHTML = "";
      return;
    }
    if (el.workspace) el.workspace.hidden = false;
    renderProgress();
    renderCalculator();
  }

  function validDependencies() {
    return DATA && Array.isArray(DATA.items) && CORE &&
      typeof CORE.normalizeProgress === "function" &&
      typeof CORE.changeRank === "function" &&
      typeof CORE.allowedMantraRank === "function" &&
      typeof CORE.attributeSnapshot === "function" &&
      typeof CORE.calculatePlan === "function";
  }

  function showDataError() {
    var message = "兵法数据加载失败，请确认 data/tactics.js 与 js/tactics.js 存在。";
    if (el.selector) el.selector.innerHTML = '<div class="error" role="alert">' + message + "</div>";
    if (el.workspace) el.workspace.hidden = true;
  }

  function init() {
    var partition = document.getElementById("partition-tactics");
    if (!partition) return;
    el.selector = document.getElementById("tactics-selector");
    el.workspace = document.getElementById("tactics-workspace");
    el.progress = document.getElementById("tactics-progress");
    el.calculator = document.getElementById("tactics-calculator");
    el.reference = document.getElementById("tactics-reference");

    if (!el.selector || !el.workspace || !el.progress || !el.calculator || !el.reference || !validDependencies()) {
      showDataError();
      return;
    }

    el.selector.addEventListener("click", handleSelectorClick);
    el.progress.addEventListener("click", handleProgressClick);
    el.progress.addEventListener("change", handleProgressChange);
    el.progress.addEventListener("input", handleProgressInput);
    el.calculator.addEventListener("click", handleCalculatorClick);
    el.calculator.addEventListener("change", handleCalculatorChange);
    el.calculator.addEventListener("input", handleCalculatorInput);
    el.reference.addEventListener("click", handleReferenceClick);

    loadProgress();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
