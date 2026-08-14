(function (root) {
  "use strict";

  var DATA = root.FORMATIONS_DATA;
  var CORE = root.FORMATIONS;
  var STORE_KEY = "qinshi_formation_progress_v1";
  var initialized = false;
  var el = {};
  var state = {
    selectedId: null,
    stored: {},
    editing: false,
    draft: null,
    calculator: null,
    progressError: "",
    storageError: "",
    sortPosition: null,
    mobilePosition: 1,
    recommendation: null,
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formations() {
    if (!DATA || !Array.isArray(DATA.items)) return [];
    var byId = DATA.items.reduce(function (map, item) { map[item.id] = item; return map; }, {});
    var order = DATA.meta && Array.isArray(DATA.meta.order) ? DATA.meta.order : [];
    return order.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function selectedFormation() {
    return formations().find(function (item) { return item.id === state.selectedId; }) || null;
  }

  function candidateById(formation, candidateId) {
    return (formation.candidates || []).find(function (candidate) { return candidate.id === candidateId; }) || null;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function percentText(value) {
    return Number(value) + "%";
  }

  function loadStored() {
    var parsed = {};
    try {
      parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch (error) {
      parsed = {};
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
    formations().forEach(function (formation) {
      var normalized = CORE.normalizeProgress(formation, parsed[formation.id]);
      if (Object.keys(normalized.members).length || normalized.mainId) state.stored[formation.id] = normalized;
    });
  }

  function saveStored() {
    var cleaned = {};
    formations().forEach(function (formation) {
      var progress = CORE.normalizeProgress(formation, state.stored[formation.id]);
      if (Object.keys(progress.members).length || progress.mainId) cleaned[formation.id] = progress;
    });
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cleaned));
      state.stored = cleaned;
      state.storageError = "";
      return true;
    } catch (error) {
      state.storageError = "保存合阵个人进度失败，请检查浏览器存储权限。";
      return false;
    }
  }

  function savedProgress(formation) {
    return CORE.normalizeProgress(formation, state.stored[formation.id]);
  }

  function resetCalculator() {
    var formation = selectedFormation();
    state.calculator = formation ? clone(savedProgress(formation)) : null;
    state.sortPosition = null;
    state.mobilePosition = formation && formation.slots.length ? formation.slots[0].position : 1;
    state.recommendation = null;
  }

  function renderSelector() {
    if (!el.selector) return;
    var groups = {};
    formations().forEach(function (formation) {
      var key = String(formation.stone);
      if (!groups[key]) groups[key] = [];
      groups[key].push(formation);
    });
    el.selector.innerHTML = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).map(function (stone) {
      return '<div class="formation-stone-group"><strong>' + escapeHtml(stone) + ' 阵眼石</strong><div class="segs">' +
        groups[stone].map(function (formation) {
          return '<button type="button" class="seg' + (formation.id === state.selectedId ? " active" : "") +
            '" data-formation-id="' + escapeHtml(formation.id) + '">' + escapeHtml(formation.name) + '</button>';
        }).join("") + '</div></div>';
    }).join("");
  }

  function officialSlotsHtml(formation) {
    return '<div class="formation-slot-grid">' + formation.slots.map(function (slot) {
      return '<article class="formation-slot-card"><div><b>助阵' + slot.position + '</b><span>' +
        escapeHtml(slot.officialDisciple) + '</span></div><strong>' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
        '</strong></article>';
    }).join("") + '</div>';
  }

  function candidateReferenceHtml(formation) {
    var rows = formation.candidates.map(function (candidate) {
      return '<tr><th scope="row">' + escapeHtml(candidate.name) + '</th><td>' + formatNumber(candidate.level1.attack) +
        '</td><td>' + formatNumber(candidate.level1.health) + '</td><td>' + formatNumber(candidate.level1.defense) + '</td><td>' +
        (candidate.officialPosition ? "助阵" + candidate.officialPosition : '<span class="muted-tip">未推荐初始助阵</span>') + '</td></tr>';
    }).join("");
    var cards = formation.candidates.map(function (candidate) {
      return '<article class="formation-reference-card"><strong>' + escapeHtml(candidate.name) + '</strong><span>攻 ' +
        formatNumber(candidate.level1.attack) + '</span><span>血 ' + formatNumber(candidate.level1.health) + '</span><span>防 ' +
        formatNumber(candidate.level1.defense) + '</span><em>' + (candidate.officialPosition ? "助阵" + candidate.officialPosition : "未推荐初始助阵") + '</em></article>';
    }).join("");
    return '<details class="formation-reference"><summary>候选弟子1级属性（' + formation.candidates.length + '人）</summary>' +
      '<div class="formation-reference-table"><table><thead><tr><th>弟子</th><th>攻</th><th>血</th><th>防</th><th>官方位置</th></tr></thead><tbody>' + rows +
      '</tbody></table></div><div class="formation-reference-cards">' + cards + '</div></details>';
  }

  function officialHtml(formation) {
    return '<section class="panel formation-official"><div class="formation-section-head"><div><span class="panel-title">官方资料</span><h2>' +
      escapeHtml(formation.name) + '</h2></div><div class="formation-official-meta"><span>阵眼石 <b>' + formatNumber(formation.stone) +
      '</b></span><span>推荐主将 <b>' + escapeHtml(formation.officialMain) + '</b></span></div></div>' +
      officialSlotsHtml(formation) + candidateReferenceHtml(formation) + '</section>';
  }

  function memberStatusText(member) {
    var status = CORE.memberStatus(member);
    if (status.errors.length) return '<span class="formation-invalid">' + escapeHtml(status.errors.join("；")) + '</span>';
    if (status.missing.length) return '<span class="formation-incomplete">缺少：' + escapeHtml(status.missing.join("、")) + '</span>';
    return '<span class="formation-complete">数据完整</span>';
  }

  function progressSummaryHtml(formation, progress) {
    var ids = Object.keys(progress.members);
    if (!ids.length) return '<div class="empty formation-empty"><p>尚未保存参与合阵的弟子。</p></div>';
    var cards = formation.candidates.filter(function (candidate) { return progress.members[candidate.id]; }).map(function (candidate) {
      var member = progress.members[candidate.id];
      return '<article class="formation-progress-card' + (progress.mainId === candidate.id ? " is-main" : "") + '"><div><strong>' +
        escapeHtml(candidate.name) + '</strong>' + (progress.mainId === candidate.id ? '<span class="formation-main-badge">主将</span>' : "") +
        '</div><div class="formation-stat-line"><span>等级 ' + escapeHtml(member.level == null ? "未填写" : member.level) + '</span><span>攻 ' +
        escapeHtml(member.attack == null ? "未填写" : formatNumber(member.attack)) + '</span><span>血 ' +
        escapeHtml(member.health == null ? "未填写" : formatNumber(member.health)) + '</span><span>防 ' +
        escapeHtml(member.defense == null ? "未填写" : formatNumber(member.defense)) + '</span></div><div class="formation-progress-foot"><span class="' +
        (member.usesReference ? "formation-reference-badge" : "formation-actual-badge") + '">' +
        (member.usesReference ? "使用1级参考值" : "个人实际数据") + '</span>' + memberStatusText(member) + '</div></article>';
    }).join("");
    return '<div class="formation-progress-list">' + cards + '</div>';
  }

  function mainOptionsHtml(formation, progress) {
    var options = ['<option value="">未指定（由工具推荐）</option>'];
    formation.candidates.forEach(function (candidate) {
      if (!progress.members[candidate.id]) return;
      options.push('<option value="' + escapeHtml(candidate.id) + '"' + (progress.mainId === candidate.id ? " selected" : "") + '>' +
        escapeHtml(candidate.name) + '</option>');
    });
    return options.join("");
  }

  function fieldInput(candidate, member, scope, field, label) {
    var value = member && member[field] != null ? member[field] : "";
    return '<label><span>' + label + '</span><input type="text" inputmode="numeric" autocomplete="off" data-scope="' + scope +
      '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-member-field="' + field + '" value="' + escapeHtml(value) + '"></label>';
  }

  function memberEditorCard(candidate, member, scope) {
    var owned = Boolean(member && member.owned);
    var status = owned ? memberStatusText(member) : '<span class="muted-tip">不参与计算</span>';
    return '<article class="formation-member-editor' + (owned ? " is-owned" : "") + '"><div class="formation-member-head"><label class="formation-owned-toggle">' +
      '<input type="checkbox" data-scope="' + scope + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-role="owned"' +
      (owned ? " checked" : "") + '><span>' + escapeHtml(candidate.name) + '</span></label><em>' +
      (candidate.officialPosition ? "官方助阵" + candidate.officialPosition : "未推荐初始助阵") + '</em></div>' +
      (owned ? '<div class="formation-member-fields">' + fieldInput(candidate, member, scope, "level", "等级") +
        fieldInput(candidate, member, scope, "attack", "攻") + fieldInput(candidate, member, scope, "health", "血") +
        fieldInput(candidate, member, scope, "defense", "防") + '</div><div class="formation-member-actions"><span class="' +
        (member.usesReference ? "formation-reference-badge" : "formation-actual-badge") + '">' +
        (member.usesReference ? "使用1级参考值" : "个人实际数据") + '</span>' + status +
        '<button type="button" class="link-btn" data-action="restore-reference" data-scope="' + scope + '" data-candidate-id="' +
        escapeHtml(candidate.id) + '">恢复1级参考值</button></div>' : '<div class="formation-member-actions">' + status + '</div>') + '</article>';
  }

  function memberEditorHtml(formation, progress, scope) {
    return '<div class="formation-main-select"><label><span>指定主将</span><select data-role="main" data-scope="' + scope + '">' +
      mainOptionsHtml(formation, progress) + '</select></label><p class="muted-tip">主将不会参与助阵排序和转换计算。</p></div><div class="formation-member-grid">' +
      formation.candidates.map(function (candidate) {
        return memberEditorCard(candidate, progress.members[candidate.id], scope);
      }).join("") + '</div>';
  }

  function personalHtml(formation) {
    var progress = savedProgress(formation);
    var html = '<section class="panel formation-personal"><div class="formation-section-head"><div><span class="panel-title">个人进度</span><h2>' +
      escapeHtml(formation.name) + '</h2></div>' + (state.editing
        ? '<div class="formation-actions"><button type="button" class="seg active" data-action="save-progress">保存</button><button type="button" class="seg" data-action="cancel-progress">取消</button></div>'
        : '<button type="button" class="seg" data-action="edit-progress">编辑</button>') + '</div>';
    if (state.storageError) html += '<div class="error" role="alert">' + escapeHtml(state.storageError) + '</div>';
    if (state.progressError) html += '<div class="error" role="alert">' + escapeHtml(state.progressError) + '</div>';
    if (state.editing && state.draft) html += memberEditorHtml(formation, state.draft, "progress") +
      '<div class="formation-actions formation-actions-bottom"><button type="button" class="seg active" data-action="save-progress">保存</button><button type="button" class="seg" data-action="cancel-progress">取消</button></div>';
    else html += progressSummaryHtml(formation, progress);
    return html + '</section>';
  }

  function rankMaps(formation, rows) {
    var maps = {};
    formation.slots.forEach(function (slot) {
      maps[slot.position] = CORE.rankColumn(rows, slot.position).reduce(function (map, item) {
        map[item.candidateId] = item.rankClass;
        return map;
      }, {});
    });
    return maps;
  }

  function sortedMatrixRows(matrix) {
    if (!state.sortPosition) return matrix.rows.slice();
    return CORE.rankColumn(matrix.rows, state.sortPosition).map(function (item) { return item.row; });
  }

  function matrixHtml(formation, matrix) {
    var ranks = rankMaps(formation, matrix.rows);
    var rows = sortedMatrixRows(matrix).map(function (row) {
      return '<tr><th scope="row">' + escapeHtml(row.name) + '</th>' + formation.slots.map(function (slot) {
        var rankClass = ranks[slot.position][row.candidateId];
        return '<td class="' + (rankClass ? "is-" + rankClass : "") + '"><span>' + formatNumber(row.values[slot.position]) +
          '</span><small>' + escapeHtml(slot.targetAttribute) + '</small></td>';
      }).join("") + '</tr>';
    }).join("");
    return '<div class="formation-desktop-matrix"><table class="formation-matrix"><thead><tr><th>弟子</th>' + formation.slots.map(function (slot) {
      return '<th><button type="button" data-action="sort-position" data-position="' + slot.position + '" aria-pressed="' +
        (state.sortPosition === slot.position) + '">助阵' + slot.position + '<small>' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
        '</small></button></th>';
    }).join("") + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function mobileRankingHtml(formation, matrix) {
    var position = formation.slots.some(function (slot) { return slot.position === state.mobilePosition; })
      ? state.mobilePosition : formation.slots[0].position;
    var slot = formation.slots.find(function (item) { return item.position === position; });
    var ranking = CORE.rankColumn(matrix.rows, position);
    return '<div class="formation-mobile-ranking"><div class="formation-position-tabs segs">' + formation.slots.map(function (item) {
      return '<button type="button" class="seg' + (item.position === position ? " active" : "") + '" data-action="mobile-position" data-position="' +
        item.position + '">助阵' + item.position + '</button>';
    }).join("") + '</div><div class="formation-mobile-rule">' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
      '</div><div class="formation-ranking-list">' + (ranking.length ? ranking.map(function (item, index) {
        return '<article class="' + (item.rankClass ? "is-" + item.rankClass : "") + '"><span>' + (index + 1) + '</span><strong>' +
          escapeHtml(item.name) + '</strong><b>' + formatNumber(item.value) + '</b></article>';
      }).join("") : '<p class="muted-tip">暂无数据完整且可参与的弟子。</p>') + '</div></div>';
  }

  function excludedHtml(matrix) {
    if (!matrix.excluded.length) return "";
    return '<div class="formation-excluded"><b>以下弟子数据不完整，未参与计算：</b>' + matrix.excluded.map(function (item) {
      var details = item.errors.length ? item.errors.join("、") : "缺少" + item.missing.join("、");
      return '<span>' + escapeHtml(item.name + "（" + details + "）") + '</span>';
    }).join("") + '</div>';
  }

  function calculatorHtml(formation) {
    var progress = state.calculator || savedProgress(formation);
    var matrix = CORE.buildMatrix(formation, progress);
    return '<section class="panel formation-calculator"><div class="formation-section-head"><div><span class="panel-title">自由计算</span><h2>位置转换排行榜</h2></div>' +
      '<div class="formation-actions"><button type="button" class="seg" data-action="restore-calculator">恢复为个人进度</button><button type="button" class="seg active" data-action="generate-recommendation">生成推荐方案</button></div></div>' +
      '<details class="formation-calculator-inputs" open><summary>临时参与弟子与属性</summary>' + memberEditorHtml(formation, progress, "calculator") + '</details>' +
      excludedHtml(matrix) + matrixHtml(formation, matrix) + mobileRankingHtml(formation, matrix) + '</section>';
  }

  function recommendationHtml(formation) {
    var result = state.recommendation;
    if (!result) {
      return '<section class="panel formation-recommendation"><div class="formation-section-head"><div><span class="panel-title">自动推荐</span><h2>主将与助阵方案</h2></div></div>' +
        '<div class="empty formation-empty"><p>点击“生成推荐方案”后展示综合最优安排。</p></div></section>';
    }
    var assignments = formation.slots.map(function (slot) {
      var assignment = result.assignments.find(function (item) { return item.position === slot.position; });
      if (!assignment) return '<article class="formation-recommend-card is-missing"><b>助阵' + slot.position + '</b><strong>缺少可用弟子</strong></article>';
      return '<article class="formation-recommend-card"><b>助阵' + assignment.position + '</b><strong>' + escapeHtml(assignment.name) +
        '</strong><span>' + escapeHtml(formatNumber(assignment.sourceValue) + " × " + percentText(assignment.ratePercent)) + '</span><em>向下取整 = ' +
        formatNumber(assignment.value) + ' ' + escapeHtml(assignment.targetAttribute) + '</em>' + (assignment.official ? '<small>官方推荐位置</small>' : "") + '</article>';
    }).join("");
    var totalOrder = ["全体攻", "全体血", "全体防", "全体内力", "全体护盾", "追加伤害"];
    var totals = totalOrder.filter(function (key) { return Object.prototype.hasOwnProperty.call(result.totals, key); }).map(function (key) {
      return '<span><b>' + escapeHtml(key) + '</b>' + formatNumber(result.totals[key]) + '</span>';
    }).join("");
    var warnings = [];
    if (result.missingPositions) warnings.push("当前可用弟子不足，还缺" + result.missingPositions + "个助阵位置");
    if (result.referenceCount) warnings.push("方案中有" + result.referenceCount + "名弟子使用1级参考值");
    if (result.excluded.length) warnings.push("有" + result.excluded.length + "名弟子因数据不完整未参与");
    return '<section class="panel formation-recommendation"><div class="formation-section-head"><div><span class="panel-title">自动推荐</span><h2>主将与助阵方案</h2></div></div>' +
      '<div class="formation-main-result"><span>推荐主将</span><strong>' + escapeHtml(result.mainName || "暂无") + '</strong><em>' +
      (result.manualMain ? "使用玩家指定主将" : "按助阵机会成本联合推荐") + '</em></div><div class="formation-recommend-grid">' + assignments +
      '</div>' + (totals ? '<div class="formation-total-grid">' + totals + '</div>' : "") + (warnings.length ? '<div class="formation-warning">' +
        warnings.map(function (warning) { return '<span>' + escapeHtml(warning) + '</span>'; }).join("") + '</div>' : "") + '</section>';
  }

  function renderWorkspace() {
    var formation = selectedFormation();
    renderSelector();
    if (!el.workspace) return;
    el.workspace.hidden = !formation;
    if (!formation) {
      el.workspace.innerHTML = "";
      return;
    }
    el.workspace.innerHTML = officialHtml(formation) + personalHtml(formation) + calculatorHtml(formation) + recommendationHtml(formation);
  }

  function selectFormation(id) {
    if (!formations().some(function (formation) { return formation.id === id; })) return;
    state.selectedId = id;
    state.editing = false;
    state.draft = null;
    state.progressError = "";
    resetCalculator();
    renderWorkspace();
  }

  function progressForScope(scope) {
    return scope === "progress" ? state.draft : state.calculator;
  }

  function setOwned(scope, candidateId, owned) {
    var formation = selectedFormation();
    var progress = progressForScope(scope);
    var candidate = formation && candidateById(formation, candidateId);
    if (!formation || !progress || !candidate) return;
    if (owned) progress.members[candidateId] = CORE.referenceMember(candidate);
    else {
      delete progress.members[candidateId];
      if (progress.mainId === candidateId) progress.mainId = null;
    }
    if (scope === "calculator") state.recommendation = null;
    renderWorkspace();
  }

  function restoreReference(scope, candidateId) {
    var formation = selectedFormation();
    var progress = progressForScope(scope);
    var candidate = formation && candidateById(formation, candidateId);
    if (!formation || !progress || !candidate || !progress.members[candidateId]) return;
    progress.members[candidateId] = CORE.referenceMember(candidate);
    if (scope === "calculator") state.recommendation = null;
    renderWorkspace();
  }

  function saveProgress() {
    var formation = selectedFormation();
    if (!formation || !state.draft) return;
    var errors = [];
    Object.keys(state.draft.members).forEach(function (candidateId) {
      var candidate = candidateById(formation, candidateId);
      var status = CORE.memberStatus(state.draft.members[candidateId]);
      status.errors.forEach(function (message) { errors.push((candidate ? candidate.name : candidateId) + "：" + message); });
    });
    if (errors.length) {
      state.progressError = errors.join("；");
      renderWorkspace();
      return;
    }
    state.stored[formation.id] = CORE.normalizeProgress(formation, state.draft);
    if (!saveStored()) {
      renderWorkspace();
      return;
    }
    state.editing = false;
    state.draft = null;
    state.progressError = "";
    resetCalculator();
    renderWorkspace();
  }

  function handleClick(event) {
    var formationButton = event.target.closest("button[data-formation-id]");
    if (formationButton && el.selector.contains(formationButton)) {
      selectFormation(formationButton.dataset.formationId);
      return;
    }
    var button = event.target.closest("button[data-action]");
    if (!button || !el.workspace.contains(button)) return;
    var action = button.dataset.action;
    if (action === "edit-progress") {
      var formation = selectedFormation();
      state.editing = true;
      state.draft = clone(savedProgress(formation));
      state.progressError = "";
      renderWorkspace();
    } else if (action === "cancel-progress") {
      state.editing = false;
      state.draft = null;
      state.progressError = "";
      renderWorkspace();
    } else if (action === "save-progress") {
      saveProgress();
    } else if (action === "restore-reference") {
      restoreReference(button.dataset.scope, button.dataset.candidateId);
    } else if (action === "restore-calculator") {
      resetCalculator();
      renderWorkspace();
    } else if (action === "generate-recommendation") {
      var selected = selectedFormation();
      state.recommendation = CORE.recommendFormation(selected, state.calculator);
      renderWorkspace();
    } else if (action === "sort-position") {
      state.sortPosition = Number(button.dataset.position);
      renderWorkspace();
    } else if (action === "mobile-position") {
      state.mobilePosition = Number(button.dataset.position);
      renderWorkspace();
    }
  }

  function handleChange(event) {
    var target = event.target;
    var scope = target.dataset && target.dataset.scope;
    if (!scope) return;
    var progress = progressForScope(scope);
    if (!progress) return;
    if (target.dataset.role === "owned") {
      setOwned(scope, target.dataset.candidateId, target.checked);
      return;
    }
    if (target.dataset.role === "main") {
      progress.mainId = target.value || null;
      if (scope === "calculator") state.recommendation = null;
      renderWorkspace();
      return;
    }
    if (target.dataset.memberField && progress.members[target.dataset.candidateId]) {
      var member = progress.members[target.dataset.candidateId];
      member[target.dataset.memberField] = target.value;
      if (target.dataset.memberField !== "level") member.usesReference = false;
      if (scope === "calculator") state.recommendation = null;
      renderWorkspace();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    el.selector = document.getElementById("formation-selector");
    el.workspace = document.getElementById("formation-workspace");
    if (!el.selector || !el.workspace) return;
    if (!DATA || !CORE) {
      el.selector.innerHTML = '<div class="error">合阵数据加载失败。</div>';
      return;
    }
    loadStored();
    el.selector.addEventListener("click", handleClick);
    el.workspace.addEventListener("click", handleClick);
    el.workspace.addEventListener("change", handleChange);
    renderSelector();
  }

  root.FORMATIONS_UI = { init: init, storeKey: STORE_KEY };
})(typeof window !== "undefined" ? window : globalThis);
