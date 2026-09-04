(function () {
  "use strict";

  var DATA = window.TACTICS_DATA;
  var CORE = window.TACTICS;
  var STORE_KEY = "qinshi_tactics_progress_v1";
  var COST_STORE_KEY = "qinshi_tactics_cost_calculator_v1";
  var state = {
    mode: "detail",
    selectedId: "",
    editing: false,
    referenceMode: "collapsed",
    progress: {},
    calculator: null,
    draft: null,
    storageError: "",
    progressError: "",
    cost: null,
    costOutcome: null,
    costError: ""
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

    var inputMaximum = CORE.actualMaximum(rehearsal);
    var spent = clamp(integer(progress && progress.rehearsalSpent, 0), 0, inputMaximum);
    var remainingRuns = Math.ceil(Math.max(0, guaranteeHorn - spent) / singleHorn);
    return {
      singleHorn: singleHorn,
      guaranteeHorn: guaranteeHorn,
      spent: spent,
      remainingRuns: remainingRuns,
      actualAdditionalHorn: remainingRuns * singleHorn,
      inputMaximum: inputMaximum,
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

  function saveProgress(progressById) {
    var source = progressById || state.progress;
    var stored = {};
    orderedTactics().forEach(function (tactic) {
      stored[tactic.id] = CORE.normalizeProgress(tactic, source[tactic.id]);
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

  function loadCostState() {
    var parsed = {};
    try {
      parsed = JSON.parse(localStorage.getItem(COST_STORE_KEY) || "{}");
    } catch (error) {
      parsed = {};
    }
    state.cost = CORE.normalizeCostState(orderedTactics(), parsed, state.progress);
  }

  function saveCostState() {
    try {
      localStorage.setItem(COST_STORE_KEY, JSON.stringify(state.cost));
      state.costError = "";
      return true;
    } catch (error) {
      state.costError = "保存兵法计算设置失败，请检查浏览器存储权限。";
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
    state.progressError = "";
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
    if (state.progressError) html += '<div class="error" role="alert">' + escapeHtml(state.progressError) + "</div>";
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
    state.progressError = "";
    if (nextRank === previous.rank) {
      var rehearsalErrors = CORE.validateRehearsalSpent(tactic, {
        rank: nextRank,
        rehearsalSpent: state.draft.rehearsalSpent
      });
      if (rehearsalErrors.length) {
        state.progressError = rehearsalErrors.join("；");
        renderProgress();
        return;
      }
    }
    var candidate = nextRank === previous.rank
      ? cloneProgress(tactic, previous)
      : CORE.changeRank(tactic, previous, nextRank);
    var automaticReductions = nextRank < previous.rank
      ? reductionsForSave(tactic, previous, candidate)
      : [];

    candidate.rank = nextRank;
    tactic.mantras.forEach(function (mantra) {
      candidate.mantras[mantra.id] = state.draft.mantras[mantra.id];
    });
    if (nextRank === previous.rank) candidate.rehearsalSpent = state.draft.rehearsalSpent;
    var next = CORE.normalizeProgress(tactic, candidate);
    var reductions = reductionsForSave(tactic, previous, next);
    var confirmation = automaticReductions.length
      ? "降低兵法阶数将调整：" + reductions.join("、") + "。是否保存？"
      : "真言阶数将调整：" + reductions.join("、") + "。是否保存？";
    if (reductions.length && !window.confirm(confirmation)) return;

    var progressCandidate = {};
    orderedTactics().forEach(function (item) {
      progressCandidate[item.id] = item.id === tactic.id ? next : state.progress[item.id];
    });
    if (!saveProgress(progressCandidate)) {
      renderProgress();
      return;
    }
    state.progress[tactic.id] = next;
    state.editing = false;
    state.draft = null;
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
      state.progressError = "";
      renderProgress();
    } else if (button.dataset.action === "cancel-edit") {
      state.editing = false;
      state.draft = null;
      state.progressError = "";
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
    state.progressError = "";
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

  function calculatorOutcome(tactic) {
    var plan = CORE.calculatePlan(tactic, state.calculator.start, state.calculator.target);
    return { plan: plan, errors: plan.valid ? [] : plan.errors.slice() };
  }

  function attributeDeltasHtml(plan) {
    var values = (plan.attributeDeltas || []).filter(function (item) { return item.delta !== 0; });
    if (!values.length) return "<p>当前没有属性变化。</p>";
    return "<ul>" + values.map(function (item) {
      var label = item.mantraName ? item.mantraName + "真言·" : "";
      return "<li>" + escapeHtml(label + formatAttribute({ name: item.name, value: item.delta, unit: item.unit })) + "</li>";
    }).join("") + "</ul>";
  }

  function stateSummaryHtml(tactic, progress) {
    var items = ["<li>兵法阶数：" + progress.rank + "阶</li>"];
    tactic.mantras.forEach(function (mantra) {
      items.push("<li>" + escapeHtml(mantra.name) + "真言：" + rankText(progress.mantras[mantra.id]) + "</li>");
    });
    if (isStandard(tactic)) {
      items.push("<li>本阶已消耗号角：" + formatNumber(progress.rehearsalSpent) + "</li>");
    }
    return "<ul>" + items.join("") + "</ul>";
  }

  function attributeSnapshotHtml(attributes) {
    if (!attributes || !attributes.length) return "<p>当前没有属性。</p>";
    return "<ul>" + attributes.map(function (item) {
      var prefix = item.mantraName ? item.mantraName + "真言·" : "";
      return "<li>" + escapeHtml(prefix + formatAttribute(item)) + "</li>";
    }).join("") + "</ul>";
  }

  function advanceStepsHtml(tactic, plan) {
    if (!plan.advance.steps.length) return "<p>无需进阶。</p>";
    var previousRank = plan.start.rank;
    return '<p class="muted-tip">逐阶段路径</p><ul>' + plan.advance.steps.map(function (step) {
      var advance = step.advance || {};
      var path = previousRank + "→" + step.rank + "阶";
      previousRank = step.rank;
      return "<li>" + path + "：" + escapeHtml(tactic.markName) + " " + formatNumber(advance.mark || 0) +
        "、功勋 " + formatNumber(advance.merit || 0) + "、号角 " + formatNumber(advance.horn || 0) + "</li>";
    }).join("") + "</ul>";
  }

  function materialsHtml(tactic, plan) {
    return advanceStepsHtml(tactic, plan) + '<p class="muted-tip">材料总计</p><ul>' +
      "<li>" + escapeHtml(tactic.markName) + "：" + formatNumber(plan.advance.mark) + "</li>" +
      "<li>功勋：" + formatNumber(plan.advance.merit) + "</li>" +
      "<li>进阶号角：" + formatNumber(plan.advance.horn) + "</li></ul>";
  }

  function hornTotalsHtml(plan) {
    var rehearsalHorn = plan.rehearsal ? plan.rehearsal.totalHorn : 0;
    return "<ul><li>进阶号角：" + formatNumber(plan.advance.horn) + "</li>" +
      "<li>进阶前逐阶演练号角：" + formatNumber(rehearsalHorn) + "</li>" +
      "<li>号角总计：" + formatNumber(plan.advance.horn + rehearsalHorn) + "</li></ul>";
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
    var rehearsal = plan.rehearsal || { steps: [], totalHorn: 0 };
    if (!rehearsal.steps.length) return "<p>当前不需要为进阶补充演练号角。</p>";
    return '<ul class="tactics-rehearsal-steps">' + rehearsal.steps.map(function (step) {
      return "<li>" + step.rank + "阶：已消耗" + formatNumber(step.spent) + "｜单次" + formatNumber(step.singleHorn) +
        "｜保底" + formatNumber(step.guaranteeHorn) + "｜剩余" + formatNumber(step.remainingRuns) +
        "次｜还需" + formatNumber(step.horn) + "号角</li>";
    }).join("") + "</ul><p><b>逐阶演练共需 " + formatNumber(rehearsal.totalHorn) + " 号角</b></p>";
  }

  function resultsHtml(tactic, plan) {
    return '<div class="tactics-result-grid"><article><h3>临时起点状态</h3>' + stateSummaryHtml(tactic, plan.start) + "</article>" +
      "<article><h3>目标状态</h3>" + stateSummaryHtml(tactic, plan.target) + "</article>" +
      "<article><h3>起点属性快照</h3>" + attributeSnapshotHtml(plan.startAttributes) + "</article>" +
      "<article><h3>目标属性快照</h3>" + attributeSnapshotHtml(plan.targetAttributes) + "</article>" +
      "<article><h3>属性变化</h3>" + attributeDeltasHtml(plan) + "</article>" +
      "<article><h3>兵法进阶材料</h3>" + materialsHtml(tactic, plan) + "</article>" +
      "<article><h3>真言碎片</h3>" + mantraPlanHtml(tactic, plan) + "</article>" +
      "<article><h3>进阶前逐阶演练</h3>" + rehearsalPlanHtml(plan) + "</article>" +
      "<article><h3>号角总计</h3>" + hornTotalsHtml(plan) + "</article></div>";
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
      renderReference();
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
        if (side === "target") renderReference();
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
    var button = event.target.closest("button[data-action=\"set-reference-mode\"]");
    if (!button || !el.reference.contains(button)) return;
    var mode = button.dataset.referenceMode;
    if (["collapsed", "current", "target", "all"].indexOf(mode) === -1) return;
    state.referenceMode = mode;
    renderReference();
  }

  function referenceRows(tactic) {
    if (state.referenceMode === "current") {
      return tactic.ranks.filter(function (row) { return row.rank === state.progress[tactic.id].rank; });
    }
    if (state.referenceMode === "target") {
      return tactic.ranks.filter(function (row) { return row.rank === state.calculator.target.rank; });
    }
    return state.referenceMode === "all" ? tactic.ranks : [];
  }

  function rankRowClass(rank, currentRank, targetRank) {
    if (rank === currentRank && rank === targetRank) return "is-current-target";
    if (rank === currentRank) return "is-current";
    if (rank === targetRank) return "is-target";
    return "";
  }

  function referenceAttributesHtml(attributes) {
    if (!Array.isArray(attributes) || !attributes.length) return '<span class="tactics-empty-value">—</span>';
    return attributes.map(function (attribute) {
      return "<div>" + escapeHtml(formatAttribute(attribute)) + "</div>";
    }).join("");
  }

  function referenceAdvanceHtml(tactic, row) {
    if (row.rank === 0) return "初始阶，无兵法进阶材料";
    var advance = row.advance || {};
    return "<div>" + escapeHtml(tactic.markName) + "：" + formatNumber(advance.mark) + "</div>" +
      "<div>功勋：" + formatNumber(advance.merit) + "</div>" +
      "<div>进阶号角：" + formatNumber(advance.horn) + "</div>";
  }

  function mantraStagesAtRank(tactic, rank) {
    var result = [];
    tactic.mantras.forEach(function (mantra) {
      mantra.stages.forEach(function (stage) {
        if (stage.tacticRank === rank) result.push({ mantra: mantra, stage: stage });
      });
    });
    return result;
  }

  function referenceMantraAttributesHtml(tactic, rank) {
    var stages = mantraStagesAtRank(tactic, rank);
    if (!stages.length) return '<span class="tactics-empty-value">—</span>';
    return stages.map(function (item) {
      var attribute = formatAttribute({
        name: item.mantra.attribute,
        value: item.stage.value,
        unit: item.mantra.unit
      });
      return "<div>" + escapeHtml(item.mantra.name + "真言：" + attribute) + "</div>";
    }).join("");
  }

  function referenceMantraFragmentsHtml(tactic, rank) {
    var stages = mantraStagesAtRank(tactic, rank);
    if (!stages.length) return '<span class="tactics-empty-value">—</span>';
    return stages.map(function (item) {
      var previousRank = item.stage.rank - 1;
      var path = rankText(previousRank) + "→" + rankText(item.stage.rank);
      return "<div>" + escapeHtml(item.mantra.materialName + "：" + path + " · " + formatNumber(item.stage.fragments) + "片") + "</div>";
    }).join("");
  }

  function referenceRankHtml(rank, currentRank, targetRank) {
    var badge = "";
    if (rank === currentRank && rank === targetRank) {
      badge = '<span class="tactics-rank-badge is-current-target"><span>当前</span>/<span>目标</span></span>';
    } else if (rank === currentRank) {
      badge = '<span class="tactics-rank-badge is-current">当前</span>';
    } else if (rank === targetRank) {
      badge = '<span class="tactics-rank-badge is-target">目标</span>';
    }
    return '<span class="tactics-rank-value">' + rank + "阶</span>" + badge;
  }

  function standardReferenceRowHtml(tactic, row, currentRank, targetRank) {
    var proficiency = row.proficiency && row.proficiency.min != null && row.proficiency.max != null
      ? formatNumber(row.proficiency.min) + "–" + formatNumber(row.proficiency.max)
      : '<span class="tactics-empty-value">—</span>';
    var rehearsal = row.rehearsal || {};
    var rowClass = rankRowClass(row.rank, currentRank, targetRank);
    return '<tr class="' + rowClass + '"><th scope="row">' + referenceRankHtml(row.rank, currentRank, targetRank) + "</th>" +
      "<td>" + referenceAttributesHtml(row.baseAttributes) + "</td>" +
      "<td>" + proficiency + "</td>" +
      "<td>" + referenceAdvanceHtml(tactic, row) + "</td>" +
      "<td>" + (rehearsal.singleHorn == null ? '<span class="tactics-empty-value">—</span>' : formatNumber(rehearsal.singleHorn)) + "</td>" +
      "<td>" + (rehearsal.guaranteeHorn == null ? '<span class="tactics-empty-value">—</span>' : formatNumber(rehearsal.guaranteeHorn)) + "</td>" +
      "<td>" + referenceMantraAttributesHtml(tactic, row.rank) + "</td>" +
      "<td>" + referenceMantraFragmentsHtml(tactic, row.rank) + "</td></tr>";
  }

  function specialReferenceRowHtml(tactic, row, currentRank, targetRank) {
    var rowClass = rankRowClass(row.rank, currentRank, targetRank);
    return '<tr class="' + rowClass + '"><th scope="row">' + referenceRankHtml(row.rank, currentRank, targetRank) + "</th>" +
      "<td>" + referenceAttributesHtml(row.baseAttributes) + "</td>" +
      "<td>" + referenceAttributesHtml(row.extraAttributes) + "</td>" +
      "<td>" + referenceAdvanceHtml(tactic, row) + "</td>" +
      "<td>" + referenceMantraAttributesHtml(tactic, row.rank) + "</td>" +
      "<td>" + referenceMantraFragmentsHtml(tactic, row.rank) + "</td></tr>";
  }

  function referenceButtonHtml(mode, label) {
    var active = state.referenceMode === mode;
    return '<button type="button" class="seg' + (active ? " active" : "") + '" data-action="set-reference-mode" data-reference-mode="' + mode + '" aria-pressed="' + active + '">' + label + "</button>";
  }

  function renderReference() {
    var tactic = selectedTactic();
    if (!tactic || !el.reference || !state.calculator) return;
    el.reference.dataset.referenceMode = state.referenceMode;
    var html = '<div class="tactics-reference-head"><div><div class="panel-title">资料查询</div><h2>' + escapeHtml(tactic.name) + " 0–15阶资料</h2></div>" +
      '<div class="tactics-reference-actions">' + referenceButtonHtml("current", "仅看当前阶") +
      referenceButtonHtml("target", "仅看目标阶") + referenceButtonHtml("all", "查看全部") +
      referenceButtonHtml("collapsed", "收起资料") + "</div></div>";
    if (state.referenceMode === "collapsed") {
      el.reference.innerHTML = html;
      return;
    }

    var currentRank = state.progress[tactic.id].rank;
    var targetRank = state.calculator.target.rank;
    var rows = referenceRows(tactic);
    var headings = isStandard(tactic)
      ? ["阶", "基础属性", "熟练度", "进阶材料", "单次演练号角", "完美保底阈值", "真言属性", "真言碎片"]
      : ["阶", "组合基础属性", "额外属性", "进阶材料", "真言属性", "真言碎片"];
    html += '<div class="tactics-table-scroll"><table class="tactics-reference-table"><thead><tr>' + headings.map(function (heading) {
      return '<th scope="col">' + heading + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (row) {
      return isStandard(tactic)
        ? standardReferenceRowHtml(tactic, row, currentRank, targetRank)
        : specialReferenceRowHtml(tactic, row, currentRank, targetRank);
    }).join("") + "</tbody></table></div>";
    el.reference.innerHTML = html;
  }

  function costMantraFieldsHtml(tactic, config, mantra) {
    return '<div class="tactics-cost-range-row"><div class="tactics-cost-range-name">' + escapeHtml(mantra.name) + '真言</div>' +
      '<label><span>起点</span><select data-cost-tactic-id="' + escapeHtml(tactic.id) +
      '" data-cost-side="start" data-cost-field="mantra" data-mantra-id="' + escapeHtml(mantra.id) + '">' +
      mantraOptions(tactic, mantra, config.start.rank, config.start.mantras[mantra.id]) + '</select></label>' +
      '<label><span>终点</span><select data-cost-tactic-id="' + escapeHtml(tactic.id) +
      '" data-cost-side="target" data-cost-field="mantra" data-mantra-id="' + escapeHtml(mantra.id) + '">' +
      mantraOptions(tactic, mantra, config.target.rank, config.target.mantras[mantra.id]) + '</select></label></div>';
  }

  function costTacticCardHtml(tactic) {
    var config = state.cost.configs[tactic.id];
    var selected = state.cost.selected[tactic.id] !== false;
    var row = findRank(tactic, config.start.rank);
    var rehearsal = row && row.rehearsal;
    var disclosureOpen = !window.matchMedia('(max-width: 767px), (max-width: 932px) and (max-height: 500px) and (orientation: landscape)').matches;
    var html = '<article class="tactics-cost-tactic' + (selected ? ' is-selected' : '') + '"><div class="tactics-cost-tactic-head">' +
      '<label class="tactics-cost-check"><input type="checkbox" data-cost-selected="' + escapeHtml(tactic.id) + '"' + (selected ? ' checked' : '') + '>参与合计</label>' +
      '<h3>' + escapeHtml(tactic.name) + '</h3></div><details class="tactics-cost-config-disclosure"' + (disclosureOpen ? ' open' : '') + '><summary>起止与真言设置</summary><div class="tactics-cost-config-grid">' +
      '<div class="tactics-cost-range-row"><div class="tactics-cost-range-name">兵法</div>' +
      '<label><span>起点</span><select data-cost-tactic-id="' + escapeHtml(tactic.id) + '" data-cost-side="start" data-cost-field="rank">' + rankOptions(config.start.rank) + '</select></label>' +
      '<label><span>终点</span><select data-cost-tactic-id="' + escapeHtml(tactic.id) + '" data-cost-side="target" data-cost-field="rank">' + rankOptions(config.target.rank) + '</select></label></div>';
    if (isStandard(tactic) && rehearsal) {
      html += '<div class="tactics-cost-range-row is-spent"><div class="tactics-cost-range-name"></div><label class="tactics-cost-spent"><span>起点阶已消耗号角</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="' + escapeHtml(config.start.rehearsalSpent) + '" data-cost-tactic-id="' +
        escapeHtml(tactic.id) + '" data-cost-side="start" data-cost-field="rehearsalSpent"></label></div>';
    }
    html += tactic.mantras.map(function (mantra) { return costMantraFieldsHtml(tactic, config, mantra); }).join('') + '</div></details></article>';
    return html;
  }

  function costMaterialRowHtml(material) {
    var value = state.cost.materials[material.key] || { stock: 0, packSize: null, packPrice: null };
    return '<div class="tactics-cost-material-row"><div class="tactics-cost-material-name"><b>' + escapeHtml(material.name) + '</b><span>' + escapeHtml(material.group) + '</span></div>' +
      '<label><span>库存</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="' + escapeHtml(value.stock) + '" data-cost-material="' + escapeHtml(material.key) + '" data-cost-material-field="stock"></label>' +
      '<label><span>每包数量</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="' + escapeHtml(value.packSize == null ? '' : value.packSize) + '" placeholder="未设置" data-cost-material="' + escapeHtml(material.key) + '" data-cost-material-field="packSize"></label>' +
      '<label><span>每包元宝</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="' + escapeHtml(value.packPrice == null ? '' : value.packPrice) + '" placeholder="未设置" data-cost-material="' + escapeHtml(material.key) + '" data-cost-material-field="packPrice"></label></div>';
  }

  function costRequirementHtml(item) {
    var tactic = item.tactic;
    var plan = item.plan;
    var mantraRows = tactic.mantras.map(function (mantra) {
      var value = plan.mantras[mantra.id];
      return '<li>' + escapeHtml(mantra.materialName || mantra.name + '真言碎片') + '：' + formatNumber(value && value.fragments) + '</li>';
    }).join('');
    var rehearsalRows = plan.rehearsal && plan.rehearsal.steps.length
      ? '<ul class="tactics-rehearsal-steps">' + plan.rehearsal.steps.map(function (step) {
          return '<li>' + step.rank + '阶：已消耗' + formatNumber(step.spent) + '，剩余' + formatNumber(step.remainingRuns) + '次，共' + formatNumber(step.horn) + '号角</li>';
        }).join('') + '</ul>'
      : '<p class="muted-tip">无需补充进阶前演练号角</p>';
    return '<div class="tactics-cost-requirements"><h4>材料需求</h4><ul><li>' + escapeHtml(tactic.markName) + '：' + formatNumber(plan.advance.mark) +
      '</li><li>功勋：' + formatNumber(plan.advance.merit) + '</li><li>表格进阶号角：' + formatNumber(plan.advance.horn) +
      '</li><li>逐阶演练号角：' + formatNumber(plan.rehearsal ? plan.rehearsal.totalHorn : 0) + '</li>' + mantraRows + '</ul><h4>逐阶演练</h4>' + rehearsalRows + '</div>';
  }

  function costPurchaseRowsHtml(purchase) {
    if (!purchase.rows.length) return '<p class="muted-tip">当前起点到终点无需额外材料。</p>';
    return '<div class="tactics-cost-purchase-list">' + purchase.rows.map(function (row) {
      var buying = row.priced
        ? '<span class="tactics-cost-buying">购买' + formatNumber(row.packs) + '包，' + formatNumber(row.yuan) + '元宝，购买后余' + formatNumber(row.leftover) + '</span>'
        : '<span class="tactics-cost-unpriced">价格未设置</span>';
      return '<div><b>' + escapeHtml(row.name) + '</b><span>需求' + formatNumber(row.demand) + '｜库存' + formatNumber(row.stock) + '｜缺口' + formatNumber(row.shortage) + '｜' + buying + '</span></div>';
    }).join('') + '</div>';
  }

  function costPriceSummaryHtml(purchase) {
    if (purchase.complete) {
      return '<div class="tactics-cost-price is-complete">预计消耗 <b>' + formatNumber(purchase.pricedSubtotal) + '</b> 元宝</div>';
    }
    var names = purchase.rows.filter(function (row) { return !row.priced; }).map(function (row) { return row.name; });
    return '<div class="tactics-cost-price is-incomplete"><b>总价未完整</b><span>已定价小计 ' + formatNumber(purchase.pricedSubtotal) + ' 元宝</span><span>未设置：' + escapeHtml(names.join('、')) + '</span></div>';
  }

  function costResultsHtml() {
    if (!state.costOutcome) return '<section class="panel tactics-cost-result-empty"><p>填写起止进度、库存和购买包价格后，点击“计算元宝”。</p></section>';
    var outcome = state.costOutcome;
    var individual = outcome.individual.length
      ? outcome.individual.map(function (item) {
          return '<article class="tactics-cost-result-card"><h3>' + escapeHtml(item.tactic.name) + '</h3><p class="muted-tip">该单项独立使用全部共享库存估算。</p>' +
            costRequirementHtml(item) + '<h4>按当前库存购买</h4>' + costPurchaseRowsHtml(item.purchase) + costPriceSummaryHtml(item.purchase) + '</article>';
        }).join('')
      : '<p class="muted-tip">尚未选择参与计算的兵法。</p>';
    return '<section class="tactics-cost-results"><h2>各兵法单独估算</h2><div class="tactics-cost-result-grid">' + individual + '</div>' +
      '<article class="tactics-cost-combined"><h2>所有已选兵法合计</h2><p class="muted-tip">合计先汇总全部需求，再对功勋、号角、统真言和极真言等共享库存各抵扣一次；不是各单项价格相加。</p>' +
      costPurchaseRowsHtml(outcome.combined.purchase) + costPriceSummaryHtml(outcome.combined.purchase) + '</article></section>';
  }

  function renderCostMode() {
    if (!el.costMode || !state.cost) return;
    var catalog = CORE.materialCatalog(orderedTactics());
    var disclosureOpen = !window.matchMedia('(max-width: 767px), (max-width: 932px) and (max-height: 500px) and (orientation: landscape)').matches;
    var tacticControls = '<section class="tactics-cost-tactics"><h2>六兵法起点与终点</h2><div class="tactics-cost-tactic-grid">' + orderedTactics().map(costTacticCardHtml).join('') + '</div></section>';
    var materialControls = '<details class="tactics-cost-material-disclosure"' + (disclosureOpen ? ' open' : '') + '><summary>库存与购买包价格</summary><section class="panel tactics-cost-materials"><div class="tactics-cost-material-head"><span>材料</span><span>库存</span><span>每包数量</span><span>每包元宝</span></div>' +
      catalog.map(costMaterialRowHtml).join('') + '</section></details>';
    var floatingCalculate = '<button type="button" class="seg active tactics-cost-floating-calculate" data-cost-action="calculate">计算元宝</button>';
    el.costMode.innerHTML = '<section class="panel tactics-cost-toolbar"><div><div class="panel-title">综合材料与元宝计算</div><p class="muted-tip">功勋、号角、统真言碎片、极真言碎片为共享库存；其他材料分别计算。</p></div>' +
      '<div class="tactics-cost-actions"><button type="button" class="seg" data-cost-action="select-all">全选</button><button type="button" class="seg" data-cost-action="clear-all">清空</button>' +
      '<button type="button" class="seg" data-cost-action="restore-progress">从个人进度重新读取</button><button type="button" class="seg active" data-cost-action="calculate">计算元宝</button></div>' +
      (state.costError ? '<div class="error" role="alert">' + escapeHtml(state.costError) + '</div>' : '') + '</section>' +
      (state.costOutcome ? costResultsHtml() + tacticControls + materialControls : tacticControls + materialControls + costResultsHtml()) + floatingCalculate;
  }

  function setTacticsMode(mode) {
    state.mode = mode === 'cost' ? 'cost' : 'detail';
    if (el.modes) {
      el.modes.querySelectorAll('[data-tactics-mode]').forEach(function (button) {
        button.classList.toggle('active', button.dataset.tacticsMode === state.mode);
      });
    }
    if (el.detailMode) el.detailMode.hidden = state.mode !== 'detail';
    if (el.costMode) el.costMode.hidden = state.mode !== 'cost';
    if (state.mode === 'cost') renderCostMode();
  }

  function saveAndRenderCost(materialControl) {
    var hadOutcome = Boolean(state.costOutcome);
    state.cost = CORE.normalizeCostState(orderedTactics(), state.cost, state.progress);
    state.costOutcome = null;
    saveCostState();
    if (materialControl && !hadOutcome) {
      var value = state.cost.materials[materialControl.dataset.costMaterial][materialControl.dataset.costMaterialField];
      materialControl.value = value == null ? "" : String(value);
      var error = el.costMode.querySelector(".tactics-cost-toolbar .error");
      if (error) error.remove();
      return;
    }
    renderCostMode();
  }

  function handleCostModeClick(event) {
    var actionButton = event.target.closest('[data-cost-action]');
    if (!actionButton || !state.cost) return;
    var action = actionButton.dataset.costAction;
    if (action === 'select-all' || action === 'clear-all') {
      orderedTactics().forEach(function (tactic) { state.cost.selected[tactic.id] = action === 'select-all'; });
      saveAndRenderCost();
    } else if (action === 'restore-progress') {
      state.cost = CORE.resetCostStartsFromProgress(orderedTactics(), state.cost, state.progress);
      state.costOutcome = null;
      saveCostState();
      renderCostMode();
    } else if (action === 'calculate') {
      state.costOutcome = CORE.aggregateCostPlans(orderedTactics(), state.cost, state.progress);
      renderCostMode();
      requestAnimationFrame(function () {
        var results = el.costMode && el.costMode.querySelector('.tactics-cost-results');
        if (results) results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function showCostError(message) {
    state.costError = message;
    if (!el.costMode) return;
    var toolbar = el.costMode.querySelector('.tactics-cost-toolbar');
    if (!toolbar) return;
    var error = toolbar.querySelector('.error');
    if (!error) {
      error = document.createElement('div');
      error.className = 'error';
      error.setAttribute('role', 'alert');
      toolbar.appendChild(error);
    }
    error.textContent = message;
  }

  function validCostInteger(value, allowBlank, positive) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return allowBlank ? null : 0;
    if (!/^\d+$/.test(text)) return false;
    var number = Number(text);
    if (positive && number <= 0) return false;
    return number;
  }

  function handleCostModeChange(event) {
    var control = event.target;
    if (!state.cost) return;
    if (control.matches('[data-cost-selected]')) {
      state.cost.selected[control.dataset.costSelected] = control.checked;
      saveAndRenderCost();
      return;
    }
    if (control.matches('[data-cost-material]')) {
      var materialKey = control.dataset.costMaterial;
      var materialField = control.dataset.costMaterialField;
      var value = validCostInteger(control.value, materialField !== 'stock', materialField === 'packSize');
      if (value === false) {
        showCostError(materialField === 'packSize' ? '每包数量必须为空或填写大于0的整数' : '库存和每包元宝必须填写非负整数');
        return;
      }
      var hadInputError = Boolean(state.costError);
      state.cost.materials[materialKey][materialField] = value;
      state.costError = '';
      saveAndRenderCost(hadInputError ? null : control);
      return;
    }
    if (!control.matches('[data-cost-tactic-id]')) return;
    var tactic = tacticById(control.dataset.costTacticId);
    if (!tactic) return;
    var config = state.cost.configs[tactic.id];
    var side = control.dataset.costSide;
    var field = control.dataset.costField;
    if (field === 'rank') {
      var nextRank = clamp(integer(control.value, config[side].rank), 0, 15);
      config[side] = CORE.changeRank(tactic, config[side], nextRank);
    } else if (field === 'mantra') {
      config[side].mantras[control.dataset.mantraId] = integer(control.value, -1);
    } else if (field === 'rehearsalSpent') {
      var errors = CORE.validateRehearsalSpent(tactic, { rank: config.start.rank, rehearsalSpent: control.value });
      if (errors.length) {
        showCostError(errors.join('；'));
        return;
      }
      config.start.rehearsalSpent = integer(control.value, 0);
    }
    state.costError = '';
    saveAndRenderCost();
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
      if (el.reference) el.reference.innerHTML = "";
      return;
    }
    if (el.workspace) el.workspace.hidden = false;
    renderProgress();
    renderCalculator();
    renderReference();
  }

  function validDependencies() {
    return DATA && Array.isArray(DATA.items) && CORE &&
      typeof CORE.normalizeProgress === "function" &&
      typeof CORE.changeRank === "function" &&
      typeof CORE.allowedMantraRank === "function" &&
      typeof CORE.actualMaximum === "function" &&
      typeof CORE.validateRehearsalSpent === "function" &&
      typeof CORE.attributeSnapshot === "function" &&
      typeof CORE.calculatePlan === "function" &&
      typeof CORE.normalizeCostState === "function" &&
      typeof CORE.aggregateCostPlans === "function";
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
    el.modes = document.getElementById("tactics-modes");
    el.detailMode = document.getElementById("tactics-detail-mode");
    el.costMode = document.getElementById("tactics-cost-mode");
    el.workspace = document.getElementById("tactics-workspace");
    el.progress = document.getElementById("tactics-progress");
    el.calculator = document.getElementById("tactics-calculator");
    el.reference = document.getElementById("tactics-reference");

    if (!el.selector || !el.modes || !el.detailMode || !el.costMode || !el.workspace || !el.progress || !el.calculator || !el.reference || !validDependencies()) {
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
    el.modes.addEventListener("click", function (event) {
      var button = event.target.closest("[data-tactics-mode]");
      if (button) setTacticsMode(button.dataset.tacticsMode);
    });
    el.costMode.addEventListener("click", handleCostModeClick);
    el.costMode.addEventListener("change", handleCostModeChange);

    loadProgress();
    loadCostState();
    renderAll();
    setTacticsMode("detail");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
