(function () {
  "use strict";

  var DATA = window.MACHINE_BEAST_DATA;
  var CORE = window.MACHINE_BEAST_CORE;
  var STORE_KEY = "qinshi_machine_beasts_progress_v1";
  var state = {
    mode: "progress",
    beasts: {},
    editingId: null,
    editDraft: null,
    calcBeastId: null,
    calcDraft: null,
    calcTargetLevel: null,
    calcResult: null
  };
  var el = {};

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function beastById(id) {
    return DATA.beasts.find(function (beast) { return beast.id === id; });
  }

  function modificationName(id) {
    var modification = DATA.modifications.find(function (item) { return item.id === id; });
    return modification ? modification.name : id;
  }

  function qualityClass(beast) {
    return "machine-quality-" + beast.quality;
  }

  function getProgress(beast) {
    return CORE.normalizeBeastProgress(beast, state.beasts[beast.id], DATA);
  }

  function loadProgress() {
    var raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (error) {
      showError("机关兽个人进度读取失败，已使用空白数据。", error);
    }
    var beasts = raw.beasts && typeof raw.beasts === "object" ? raw.beasts : raw;
    DATA.beasts.forEach(function (beast) {
      if (beasts[beast.id]) state.beasts[beast.id] = CORE.normalizeBeastProgress(beast, beasts[beast.id], DATA);
    });
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ beasts: state.beasts }));
      return true;
    } catch (error) {
      showError("机关兽个人进度保存失败，请检查浏览器存储空间。", error);
      return false;
    }
  }

  function showError(message, error) {
    if (!el.error) return;
    el.error.textContent = message;
    el.error.hidden = false;
    if (error && window.console) console.error(error);
  }

  function clearError() {
    if (el.error) el.error.hidden = true;
  }

  function inventorySummary(beast, progress) {
    var parts = [];
    DATA.modifications.forEach(function (modification) {
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (rank) {
        if (ranks[rank]) parts.push(modification.name + " " + rank + "阶×" + ranks[rank]);
      });
    });
    if (progress.fragments) parts.push("机关兽碎片×" + progress.fragments);
    return parts.length ? parts.join("、") : "暂无库存记录";
  }

  function effectBlock(title, stage, emptyText) {
    if (!stage) return '<div class="machine-effect-card is-empty"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(emptyText) + "</span></div>";
    var requirement = stage.requiredTotalLevel === null ? "升阶等级要求：数据待补充" : "升阶要求：累计觉醒等级" + stage.requiredTotalLevel;
    return '<article class="machine-effect-card">' +
      '<div class="machine-effect-head"><strong>' + escapeHtml(title) + " · " + stage.stage + '阶</strong><span>' + escapeHtml(requirement) + "</span></div>" +
      '<dl><div><dt>流派加成</dt><dd>' + escapeHtml(stage.factionBonus) + '</dd></div>' +
      '<div><dt>阵容特效</dt><dd>' + escapeHtml(stage.formationEffect) + '</dd></div>' +
      '<div><dt>机关兽特效</dt><dd>' + escapeHtml(stage.beastEffect) + "</dd></div></dl></article>";
  }

  function rankOptions(maxLevel, selected) {
    var html = "";
    for (var level = 0; level <= maxLevel; level += 1) {
      html += '<option value="' + level + '"' + (level === selected ? " selected" : "") + ">" + level + "级</option>";
    }
    return html;
  }

  function visibleRanks(beast, draft) {
    var upper = Math.min(7, beast.maxRank);
    var ranks = [];
    for (var rank = 0; rank <= upper; rank += 1) ranks.push(rank);
    if (draft.showHighRanks) {
      for (var high = 8; high <= beast.maxRank; high += 1) ranks.push(high);
    }
    return ranks;
  }

  function inventoryEditor(beast, draft, scope) {
    var ranks = visibleRanks(beast, draft);
    var modifications = beast.quality === "orange" && draft.showMods ? DATA.modifications : [DATA.modifications[0]];
    var flagPrefix = scope === "progress" ? "edit" : "calc";
    var html = '<div class="machine-inventory-options">';
    if (beast.maxRank >= 8) {
      html += '<label><input type="checkbox" data-' + flagPrefix + '-flag="showHighRanks"' + (draft.showHighRanks ? " checked" : "") + '>显示8–10阶库存</label>';
    }
    if (beast.quality === "orange") {
      html += '<label><input type="checkbox" data-' + flagPrefix + '-flag="showMods"' + (draft.showMods ? " checked" : "") + '>显示改造库存</label>';
    }
    html += "</div><div class=\"machine-inventory-groups\">";
    modifications.forEach(function (modification) {
      html += '<fieldset class="machine-inventory-group"><legend>' + escapeHtml(modification.name) + '</legend><div class="machine-rank-inputs">';
      ranks.forEach(function (rank) {
        var value = (draft.inventory[modification.id] || {})[String(rank)] || 0;
        html += '<label><span>' + rank + '阶</span><input type="number" min="0" step="1" inputmode="numeric" value="' + value + '" data-' + flagPrefix + '-inventory data-mod="' + modification.id + '" data-rank="' + rank + '"></label>';
      });
      html += "</div></fieldset>";
    });
    html += "</div>";
    return html;
  }

  function beastEditor(beast, draft) {
    var currentLevel = CORE.levelForResearch(draft.research, DATA.researchThresholds, beast.maxLevel);
    return '<div class="machine-beast-editor">' +
      '<div class="machine-editor-grid">' +
      '<label><span>累计研发度</span><input type="number" min="0" step="1" inputmode="numeric" value="' + draft.research + '" data-edit-field="research"></label>' +
      '<label><span>当前研发等级</span><strong>' + currentLevel + '级</strong></label>' +
      '<label><span>按等级最低研发度填入</span><span class="machine-inline-control"><select data-edit-level>' + rankOptions(beast.maxLevel, currentLevel) + '</select><button type="button" class="seg" data-machine-action="fill-research">填入</button></span></label>' +
      '<label><span>机关兽碎片</span><input type="number" min="0" step="1" inputmode="numeric" value="' + draft.fragments + '" data-edit-field="fragments"></label>' +
      '</div>' + inventoryEditor(beast, draft, "progress") +
      '<div class="machine-editor-actions"><button type="button" class="seg active" data-machine-action="save-progress" data-beast-id="' + beast.id + '">保存</button>' +
      '<button type="button" class="seg" data-machine-action="cancel-progress">取消</button></div></div>';
  }

  function beastCard(beast) {
    var progress = getProgress(beast);
    var level = CORE.levelForResearch(progress.research, DATA.researchThresholds, beast.maxLevel);
    var active = CORE.activeBeastEffect(beast, level);
    var editing = state.editingId === beast.id;
    return '<article class="machine-beast-card ' + qualityClass(beast) + '">' +
      '<div class="machine-beast-head"><div><span class="machine-quality-badge">' + escapeHtml(beast.tier) + '</span><strong>' + escapeHtml(beast.name) + '</strong></div>' +
      (editing ? "" : '<button type="button" class="seg" data-machine-action="edit-progress" data-beast-id="' + beast.id + '">编辑</button>') + '</div>' +
      (editing ? beastEditor(beast, state.editDraft) :
        '<div class="machine-beast-summary"><div><span>研发等级</span><b>' + level + '/' + beast.maxLevel + '级</b></div>' +
        '<div><span>累计研发度</span><b>' + formatNumber(progress.research) + '</b></div>' +
        '<div class="machine-active-effect"><span>当前效果</span><b>' + (active ? active.level + "级 · " + escapeHtml(active.text) : "尚未激活档位效果") + '</b></div></div>' +
        '<p class="machine-inventory-summary">' + escapeHtml(inventorySummary(beast, progress)) + '</p>') +
      "</article>";
  }

  function renderProgress() {
    var progressMap = {};
    DATA.beasts.forEach(function (beast) { progressMap[beast.id] = getProgress(beast); });
    el.progress.innerHTML = DATA.schools.map(function (school) {
      var snapshot = CORE.schoolSnapshot(school, progressMap, DATA);
      var stageCopy = snapshot.currentStage ? snapshot.currentStage + "阶已达成" : "尚未达成1阶";
      return '<section class="machine-school panel">' +
        '<div class="machine-school-head"><div><h2>' + escapeHtml(school.name) + '</h2><span>当前流派累计觉醒等级</span><strong>' + snapshot.totalLevel + '</strong></div>' +
        '<div class="machine-stage-one"><b>' + stageCopy + '</b><span>1阶进度：' + snapshot.stageOneCurrent + '/45' + (snapshot.stageOneRemaining ? "，还差" + snapshot.stageOneRemaining : "") + '</span><small>2–5阶升阶等级要求：数据待补充</small></div></div>' +
        '<div class="machine-effect-grid">' + effectBlock("当前生效", snapshot.currentEffects, "尚未达成1阶") + effectBlock("下一阶预览", snapshot.nextStage, "已达到当前最高阶") + '</div>' +
        '<div class="machine-beast-list">' + school.beastIds.map(function (id) { return beastCard(beastById(id)); }).join("") + '</div></section>';
    }).join("");
  }

  function resetCalculator(beastId) {
    var beast = beastById(beastId || state.calcBeastId || DATA.beasts[0].id);
    state.calcBeastId = beast.id;
    state.calcDraft = clone(getProgress(beast));
    var currentLevel = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beast.maxLevel);
    state.calcTargetLevel = CORE.nextEffectLevel(beast, currentLevel);
    state.calcResult = null;
  }

  function calcTargetOptions(beast, selected, currentLevel) {
    var html = "";
    for (var level = Math.max(1, currentLevel); level <= beast.maxLevel; level += 1) {
      html += '<option value="' + level + '"' + (level === selected ? " selected" : "") + '>' + level + '级（' + formatNumber(DATA.researchThresholds[level]) + '研发度）</option>';
    }
    return html;
  }

  function renderCalculatorControls() {
    if (!state.calcDraft) resetCalculator();
    var beast = beastById(state.calcBeastId);
    var currentLevel = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beast.maxLevel);
    el.calculatorControls.innerHTML = '<section class="panel machine-calculator-panel"><div class="machine-calculator-top">' +
      '<label><span>选择机关兽</span><select data-calc-beast>' + DATA.schools.map(function (school) {
        return '<optgroup label="' + escapeHtml(school.name) + '">' + school.beastIds.map(function (id) {
          var item = beastById(id);
          return '<option value="' + item.id + '"' + (item.id === beast.id ? " selected" : "") + '>' + escapeHtml(item.name) + '（' + item.tier + '）</option>';
        }).join("") + '</optgroup>';
      }).join("") + '</select></label>' +
      '<label><span>当前累计研发度</span><input type="number" min="0" step="1" inputmode="numeric" value="' + state.calcDraft.research + '" data-calc-field="research"></label>' +
      '<label><span>当前研发等级</span><strong>' + currentLevel + '级</strong></label>' +
      '<label><span>目标研发等级</span><select data-calc-target>' + calcTargetOptions(beast, state.calcTargetLevel, currentLevel) + '</select></label>' +
      '<label><span>当前机关兽碎片</span><input type="number" min="0" step="1" inputmode="numeric" value="' + state.calcDraft.fragments + '" data-calc-field="fragments"></label>' +
      '</div><div class="machine-calculator-actions"><button type="button" class="seg" data-machine-action="reload-calculator">从个人进度重新读取</button>' +
      '<button type="button" class="seg" data-machine-action="save-calculator">保存回个人进度</button>' +
      '<button type="button" class="seg active" data-machine-action="calculate">计算最优方案</button></div>' +
      inventoryEditor(beast, state.calcDraft, "calculator") + '</section>';
  }

  function itemLabel(item) {
    var equivalent = item.rank > 7 ? '（折合7阶×' + item.sevenRankEquivalent * item.count + '）' : '';
    return modificationName(item.modificationId) + ' ' + item.rank + '阶×' + item.count + equivalent + '，单只' + formatNumber(item.researchEach) + '研发度';
  }

  function itemRequirementLabel(item) {
    var equivalent = item.rank > 7 ? '（折合7阶×' + item.sevenRankEquivalent * item.count + '）' : '';
    return modificationName(item.modificationId) + ' ' + item.rank + '阶×' + item.count + equivalent;
  }

  function itemList(items, empty, emphasizeRequirement) {
    return items.length ? '<ul>' + items.map(function (item) {
      if (!emphasizeRequirement) return '<li>' + escapeHtml(itemLabel(item)) + '</li>';
      return '<li><strong class="machine-investment-demand">' + escapeHtml(itemRequirementLabel(item)) + '</strong><span>，单只' + formatNumber(item.researchEach) + '研发度</span></li>';
    }).join("") + '</ul>' : '<p class="muted-tip">' + escapeHtml(empty) + '</p>';
  }

  function renderCalculatorResult(result) {
    el.calculatorResult.hidden = false;
    if (!result.valid) {
      el.calculatorResult.innerHTML = '<section class="panel machine-result is-error"><h2>无法计算</h2><ul>' + result.errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul></section>';
      return;
    }
    var exchange = result.exchange.available
      ? '<div><span>仍需贡献</span><b>' + formatNumber(result.exchange.contribution) + '</b></div><div><span>约需元宝</span><b>' + formatNumber(result.exchange.yuan) + '</b></div>'
      : '<div class="machine-no-exchange"><span>贡献兑换</span><b>该档次不可通过贡献兑换碎片</b></div>';
    el.calculatorResult.innerHTML = '<section class="panel machine-result"><div class="machine-result-head"><div><span>最优方案</span><h2>' + escapeHtml(beastById(state.calcBeastId).name) + '升至' + result.target.level + '级</h2></div><b>计算结果</b></div>' +
      '<div class="machine-result-metrics"><div><span>当前等级</span><b>' + result.current.level + '级</b></div><div><span>当前研发度</span><b>' + formatNumber(result.current.research) + '</b></div>' +
      '<div><span>目标研发度</span><b>' + formatNumber(result.target.research) + '</b></div><div><span>仍缺研发度</span><b>' + formatNumber(result.target.deficit) + '</b></div>' +
      '<div><span>投入总只数</span><b>' + result.totals.investedCount + '</b></div><div><span>投入研发度</span><b>' + formatNumber(result.totals.research) + '</b></div>' +
      '<div><span>溢出研发度</span><b>' + formatNumber(result.totals.overflow) + '</b></div><div><span>预计达到</span><b>' + result.totals.projectedLevel + '级</b></div></div>' +
      '<div class="machine-result-columns"><article><h3>使用已有库存</h3>' + itemList(result.selected.ownedItems, "不使用已有完整机关兽") + '</article>' +
      '<article><h3>新增投入</h3>' + itemList(result.selected.newItems, "无需新增机关兽", true) + '</article></div>' +
      '<div class="machine-result-metrics machine-resource-metrics"><div><span>觉醒神图</span><b>' + formatNumber(result.totals.awakeningBlueprints) + '</b></div><div><span>机关破片</span><b>' + formatNumber(result.totals.organPieces) + '</b></div>' +
      '<div><span>本体缺口</span><b>' + result.shortage.bodyEquivalent + '本体</b></div><div><span>机关兽碎片缺口</span><b>' + formatNumber(result.shortage.fragments) + '</b></div>' + exchange + '</div>' +
      '<details class="machine-unused"><summary>查看未使用库存（' + result.unused.reduce(function (total, item) { return total + item.count; }, 0) + '只）</summary>' + itemList(result.unused.map(function (item) { return Object.assign({ source: "owned", sevenRankEquivalent: item.rank > 7 ? Math.pow(2, item.rank - 7) : 1 }, item); }), "无未使用库存") + '</details></section>';
    el.calculatorResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function thresholdReference() {
    return '<section class="panel"><h2>研发等级累计研发度</h2><div class="machine-reference-grid machine-threshold-grid">' +
      Array.from({ length: 25 }, function (_, index) {
        var level = index + 1;
        return '<article class="machine-reference-pair ' + (DATA.effectLevels.includes(level) ? "is-milestone" : "") + '"><span>' + level + '级</span><b>' + formatNumber(DATA.researchThresholds[level]) + '</b></article>';
      }).join("") + '</div></section>';
  }

  function researchReference() {
    function qualityCards(quality, title, includeModifications) {
      var cards = Object.keys(DATA.researchValues[quality]).sort(function (a, b) { return Number(a) - Number(b); }).map(function (rank) {
        var values = includeModifications ? DATA.modifications.map(function (mod) {
          return '<div><dt>' + escapeHtml(mod.name) + '</dt><dd>' + formatNumber(DATA.researchValues[quality][rank][mod.id]) + '</dd></div>';
        }).join("") : '<div><dt>研发度</dt><dd>' + formatNumber(DATA.researchValues[quality][rank].none) + '</dd></div>';
        return '<article class="machine-reference-card machine-research-card"><h4>' + rank + '阶</h4><dl>' + values + '</dl></article>';
      }).join("");
      return '<section class="machine-reference-group"><h3>' + title + '</h3><div class="machine-reference-grid machine-research-card-grid">' + cards + '</div></section>';
    }
    return '<section class="panel"><h2>不同阶数与改造研发度</h2>' + qualityCards("orange", "橙色机关兽", true) + qualityCards("purple", "紫色机关兽", false) + qualityCards("blue", "蓝色机关兽", false) + '</section>';
  }

  function beastReference() {
    var groups = DATA.schools.map(function (school) {
      var cards = DATA.beasts.filter(function (beast) { return beast.schoolId === school.id; }).map(function (beast) {
        var effects = DATA.effectLevels.map(function (level) {
          var effect = beast.effects.find(function (item) { return item.level === level; });
          return '<div><dt>' + level + '级效果</dt><dd>' + (effect ? escapeHtml(effect.text) : '—') + '</dd></div>';
        }).join("");
        return '<article class="machine-reference-card machine-beast-reference-card"><header><span class="machine-name-token ' + qualityClass(beast) + '">' + escapeHtml(beast.name) + '</span><span>' + escapeHtml(school.name) + ' · ' + beast.tier + ' · 上限' + beast.maxLevel + '级</span></header><dl class="machine-effect-reference-list">' + effects + '</dl></article>';
      }).join("");
      return '<section class="machine-reference-group machine-beast-school-group"><h3>' + escapeHtml(school.name) + '</h3><div class="machine-reference-grid machine-beast-reference-grid">' + cards + '</div></section>';
    }).join("");
    return '<section class="panel"><h2>机关兽归属与研发效果</h2>' + groups + '</section>';
  }

  function schoolReference() {
    return DATA.schools.map(function (school) {
      return '<section class="panel"><h2>' + escapeHtml(school.name) + '阶数效果</h2><div class="machine-reference-grid machine-school-stage-grid">' + school.stages.map(function (stage) {
        return '<article class="machine-reference-card machine-school-stage-card"><header><h3>' + stage.stage + '阶</h3><span>' + (stage.requiredTotalLevel === null ? '升阶要求：数据待补充' : '累计觉醒等级' + stage.requiredTotalLevel) + '</span></header><dl><div><dt>流派加成</dt><dd>' + escapeHtml(stage.factionBonus) + '</dd></div><div><dt>阵容特效</dt><dd>' + escapeHtml(stage.formationEffect) + '</dd></div><div><dt>机关兽特效</dt><dd>' + escapeHtml(stage.beastEffect) + '</dd></div></dl></article>';
      }).join("") + '</div></section>';
    }).join("");
  }

  function renderReference() {
    el.reference.innerHTML = thresholdReference() + researchReference() + beastReference() + schoolReference();
  }

  function setMode(mode) {
    state.mode = mode;
    el.modes.querySelectorAll("[data-machine-beast-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.machineBeastMode === mode); });
    el.progress.hidden = mode !== "progress";
    el.calculator.hidden = mode !== "calculator";
    el.reference.hidden = mode !== "reference";
    if (mode === "calculator") renderCalculatorControls();
    if (mode === "reference" && !el.reference.innerHTML) renderReference();
  }

  function updateInventory(draft, target) {
    var modificationId = target.dataset.mod;
    var rank = target.dataset.rank;
    var value = CORE.integer(target.value);
    if (!draft.inventory[modificationId]) draft.inventory[modificationId] = {};
    if (value) draft.inventory[modificationId][rank] = value;
    else delete draft.inventory[modificationId][rank];
  }

  function handleProgressClick(event) {
    var button = event.target.closest("[data-machine-action]");
    if (!button) return;
    var action = button.dataset.machineAction;
    var beast;
    if (action === "edit-progress") {
      beast = beastById(button.dataset.beastId);
      state.editingId = beast.id;
      state.editDraft = clone(getProgress(beast));
      renderProgress();
    } else if (action === "cancel-progress") {
      state.editingId = null;
      state.editDraft = null;
      renderProgress();
    } else if (action === "fill-research") {
      beast = beastById(state.editingId);
      var levelSelect = el.progress.querySelector("[data-edit-level]");
      state.editDraft.research = CORE.thresholdForLevel(levelSelect.value, DATA.researchThresholds);
      renderProgress();
    } else if (action === "save-progress") {
      beast = beastById(button.dataset.beastId);
      state.beasts[beast.id] = CORE.normalizeBeastProgress(beast, state.editDraft, DATA);
      if (saveProgress()) {
        state.editingId = null;
        state.editDraft = null;
        clearError();
        renderProgress();
        if (state.calcBeastId === beast.id) resetCalculator(beast.id);
      }
    }
  }

  function handleProgressInput(event) {
    if (!state.editDraft) return;
    if (event.target.matches("[data-edit-field]")) state.editDraft[event.target.dataset.editField] = CORE.integer(event.target.value);
    if (event.target.matches("[data-edit-inventory]")) updateInventory(state.editDraft, event.target);
  }

  function handleProgressChange(event) {
    if (!state.editDraft || !event.target.matches("[data-edit-flag]")) return;
    state.editDraft[event.target.dataset.editFlag] = event.target.checked;
    renderProgress();
  }

  function handleCalculatorClick(event) {
    var button = event.target.closest("[data-machine-action]");
    if (!button) return;
    var action = button.dataset.machineAction;
    var beast = beastById(state.calcBeastId);
    if (action === "reload-calculator") {
      resetCalculator(beast.id);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (action === "save-calculator") {
      state.beasts[beast.id] = CORE.normalizeBeastProgress(beast, state.calcDraft, DATA);
      if (saveProgress()) {
        clearError();
        renderProgress();
      }
    } else if (action === "calculate") {
      state.calcResult = CORE.calculateInvestmentPlan(DATA, beast, state.calcDraft, {
        targetLevel: state.calcTargetLevel,
        includeHighRanks: state.calcDraft.showHighRanks,
        includeMods: state.calcDraft.showMods
      });
      renderCalculatorResult(state.calcResult);
    }
  }

  function handleCalculatorInput(event) {
    if (!state.calcDraft) return;
    if (event.target.matches("[data-calc-field]")) state.calcDraft[event.target.dataset.calcField] = CORE.integer(event.target.value);
    if (event.target.matches("[data-calc-inventory]")) updateInventory(state.calcDraft, event.target);
  }

  function handleCalculatorChange(event) {
    if (event.target.matches("[data-calc-beast]")) {
      resetCalculator(event.target.value);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (event.target.matches("[data-calc-target]")) {
      state.calcTargetLevel = CORE.integer(event.target.value);
    } else if (event.target.matches("[data-calc-flag]")) {
      state.calcDraft[event.target.dataset.calcFlag] = event.target.checked;
      renderCalculatorControls();
    }
  }

  function validDependencies() {
    return DATA && CORE && Array.isArray(DATA.beasts) && typeof CORE.calculateInvestmentPlan === "function";
  }

  function init() {
    var partition = document.getElementById("partition-machine-beasts");
    if (!partition) return;
    el.modes = document.getElementById("machine-beast-modes");
    el.error = document.getElementById("machine-beast-error");
    el.progress = document.getElementById("machine-beast-progress");
    el.calculator = document.getElementById("machine-beast-calculator");
    el.calculatorResult = document.getElementById("machine-beast-calculator-result");
    el.calculatorControls = document.getElementById("machine-beast-calculator-controls");
    el.reference = document.getElementById("machine-beast-reference");
    if (!validDependencies()) {
      showError("机关兽数据加载失败，请确认 data/machine-beasts.js 与 js/machine-beasts.js 存在。");
      return;
    }
    loadProgress();
    resetCalculator(DATA.beasts[0].id);
    renderProgress();
    renderCalculatorControls();
    el.modes.addEventListener("click", function (event) {
      var button = event.target.closest("[data-machine-beast-mode]");
      if (button) setMode(button.dataset.machineBeastMode);
    });
    el.progress.addEventListener("click", handleProgressClick);
    el.progress.addEventListener("input", handleProgressInput);
    el.progress.addEventListener("change", handleProgressChange);
    el.calculator.addEventListener("click", handleCalculatorClick);
    el.calculator.addEventListener("input", handleCalculatorInput);
    el.calculator.addEventListener("change", handleCalculatorChange);
    setMode("progress");
  }

  window.MACHINE_BEAST_UI = { init: init };
  document.addEventListener("DOMContentLoaded", init);
})();
