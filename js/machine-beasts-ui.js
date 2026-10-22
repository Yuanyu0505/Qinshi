(function () {
  "use strict";

  var DATA = window.MACHINE_BEAST_DATA;
  var CORE = window.MACHINE_BEAST_CORE;
  var PLANNER = window.MACHINE_BEAST_SCHOOL_PLANNER;
  var PERFORMANCE = window.UI_PERFORMANCE;
  var ACCOUNT_STORAGE = window.QinshiAccounts;
  var STORE_KEY = "qinshi_machine_beasts_progress_v1";
  var state = {
    mode: "progress",
    beasts: {},
    editingId: null,
    editDraft: null,
    calculatorMode: "single",
    calcBeastId: null,
    calcDraft: null,
    calcTargetLevel: null,
    calcResult: null,
    singleInventoryPolicy: null,
    singleNewRankMode: "zeroToSeven",
    schoolDraft: null,
    schoolResult: null,
    referenceCost: null,
    referenceCostDraft: null,
    referenceCostDirty: false,
    referenceCostRequirements: {},
    progressSchoolId: "hegemonic",
    referenceBeastSchoolId: "hegemonic",
    referenceStageSchoolId: "hegemonic",
    searches: { progress: "", calculator: "", reference: "" },
    composingSearch: { progress: false, calculator: false, reference: false }
  };
  var el = {};
  var rendered = { progress: false, calculator: false, reference: false };
  var searchRefresh = {};
  var pendingSearches = {};

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

  function schoolById(id) {
    return DATA.schools.find(function (school) { return school.id === id; }) || DATA.schools[0];
  }

  function searchMatches(scope) {
    return CORE.searchBeasts(DATA, state.searches[scope] || "");
  }

  function isSearchMatch(beast, scope) {
    if (!state.searches[scope]) return false;
    return searchMatches(scope).some(function (item) { return item.id === beast.id; });
  }

  function searchBar(scope, placeholder) {
    return '<label class="machine-search-bar"><span>搜索机关兽</span><input type="search" autocomplete="off" data-machine-search="' + scope + '" value="' +
      escapeHtml(state.searches[scope]) + '" placeholder="' + escapeHtml(placeholder) + '"></label>';
  }

  function schoolSwitcher(scope, selectedId) {
    return '<div class="segs machine-school-switcher" aria-label="切换机关术流派">' + DATA.schools.map(function (school) {
      return '<button type="button" class="seg' + (school.id === selectedId ? ' active' : '') + '" data-machine-school-scope="' + scope +
        '" data-school-id="' + school.id + '">' + escapeHtml(school.name) + '</button>';
    }).join("") + '</div>';
  }

  function getProgress(beast) {
    return CORE.normalizeBeastProgress(beast, state.beasts[beast.id], DATA);
  }

  function loadProgress() {
    var raw = {};
    try {
      raw = JSON.parse(ACCOUNT_STORAGE.getItem(STORE_KEY) || "{}") || {};
    } catch (error) {
      showError("机关兽个人进度读取失败，已使用空白数据。", error);
    }
    var beasts = raw.beasts && typeof raw.beasts === "object" ? raw.beasts : raw;
    state.beasts = {};
    DATA.beasts.forEach(function (beast) {
      if (beasts[beast.id]) state.beasts[beast.id] = CORE.normalizeBeastProgress(beast, beasts[beast.id], DATA);
    });
    state.referenceCost = CORE.normalizeReferenceCostSettings(DATA, raw.referenceCost);
    state.referenceCostDraft = clone(state.referenceCost);
    state.referenceCostDirty = false;
  }

  function saveProgress(beasts, referenceCost) {
    try {
      var saved = ACCOUNT_STORAGE.setItem(STORE_KEY, JSON.stringify({ beasts: beasts || state.beasts, referenceCost: referenceCost || state.referenceCost }));
      if (saved === false) {
        showError("机关兽个人进度或参考成本保存失败，当前修改尚未保存。");
        return false;
      }
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

  function combinedRankLabel(modification, rank) {
    return "（" + modification + "）" + rank + "阶";
  }

  function sourceText(beast) {
    return (beast.sources || []).join("、") || "来源待补充";
  }

  function referenceCostInputError() {
    var draft = state.referenceCostDraft;
    var stock = Number(draft.awakeningBlueprintStock);
    if (String(draft.awakeningBlueprintStock).trim() === "" || !Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) return "已有觉醒神图必须为非负整数。";
    var price = Number(draft.awakeningBlueprintPrice);
    if (draft.awakeningBlueprintPrice === null || String(draft.awakeningBlueprintPrice).trim() === "" || !Number.isFinite(price) || price < 0) return "觉醒神图单价必须为非负有限数。";
    var invalidBeast = DATA.beasts.find(function (beast) {
      if (beast.contributionPerFragment != null) return false;
      var value = draft.beastPrices[beast.id];
      return value != null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0);
    });
    return invalidBeast ? invalidBeast.name + "每只参考价必须为非负有限数，或留空表示未设置。" : "";
  }

  function referenceCostControls() {
    var draft = state.referenceCostDraft;
    var rules = DATA.referenceCostRules || {};
    var presets = rules.blueprintPrices || [{ label: "奇遇", price: 64 }, { label: "元宝商城", price: 70 }, { label: "商城", price: 134 }];
    var selected = presets.some(function (preset) { return Number(draft.awakeningBlueprintPrice) === preset.price && draft.awakeningBlueprintPrice !== "" && draft.awakeningBlueprintPrice !== null; });
    return '<section class="panel machine-reference-cost-settings"><h2>参考成本设置（当前账号共用）</h2>' +
      '<div class="machine-reference-cost-grid"><label><span>已有觉醒神图</span><input type="number" min="0" step="1" inputmode="numeric" data-reference-cost-field="awakeningBlueprintStock" value="' + escapeHtml(draft.awakeningBlueprintStock) + '"></label>' +
      '<label class="machine-reference-cost-check"><input type="checkbox" data-reference-cost-field="useAwakeningBlueprintStock"' + (draft.useAwakeningBlueprintStock ? ' checked' : '') + '>使用已有神图库存</label>' +
      '<label><span>神图价格来源</span><select data-reference-blueprint-preset>' + presets.map(function (preset) {
        return '<option value="' + preset.price + '"' + (selected && Number(draft.awakeningBlueprintPrice) === preset.price ? ' selected' : '') + '>' + escapeHtml(preset.label) + ' · ' + preset.price + '元宝</option>';
      }).join("") + '<option value="custom"' + (!selected ? ' selected' : '') + '>自定义</option></select></label>' +
      '<label><span>神图单价（元宝／张，可自定义）</span><input type="number" min="0" step="any" inputmode="decimal" data-reference-cost-field="awakeningBlueprintPrice" value="' + escapeHtml(draft.awakeningBlueprintPrice) + '"></label></div>' +
      '<details class="machine-reference-beast-prices"><summary>非贡献兑换机关兽每只参考价（橙五默认45,000，蓝紫请填写）</summary><div class="machine-reference-cost-grid">' + DATA.beasts.filter(function (beast) { return beast.contributionPerFragment == null; }).map(function (beast) {
        return '<label><span>' + escapeHtml(beast.name) + '（' + escapeHtml(beast.tier) + '）</span><input type="number" min="0" step="any" inputmode="decimal" placeholder="未设置，不计为免费" data-reference-beast-price="' + beast.id + '" value="' + escapeHtml(draft.beastPrices[beast.id]) + '"></label>';
      }).join("") + '</div></details><p class="muted-tip">只估算觉醒神图与缺少的机关兽；不含机关破片、改造及突破等其他材料。贡献÷2.7折算元宝并向上取整；缺少碎片按折算只数计价，不额外凑整只，也不代表实际购买包装。各备选方案独立抵扣一次同一神图库存，不消耗真实库存；价格不参与最优解与排序。</p>' +
      '<p class="machine-reference-cost-save-status" data-reference-cost-save-status role="status">' + escapeHtml(referenceCostInputError() || (state.referenceCostDirty ? '当前参考成本修改未保存。' : '参考成本设置按当前账号保存。')) + '</p>' +
      '<button type="button" class="seg" data-machine-action="save-reference-cost">保存／重试保存参考成本设置</button></section>';
  }

  function referenceCostPanel(requirements) {
    var error = referenceCostInputError();
    if (error) return '<h3>参考成本</h3><p class="machine-reference-cost-error" role="alert">' + escapeHtml(error) + ' 已隐藏旧总价，请修正设置。</p>';
    var cost = CORE.calculateReferenceCost(DATA, requirements, state.referenceCostDraft);
    var blueprints = cost.blueprints;
    var beastYuan = cost.beasts.reduce(function (total, beast) { return total + (beast.yuan === null ? 0 : beast.yuan); }, 0);
    return '<h3>参考成本（元宝）</h3><div class="machine-reference-cost-breakdown"><span>神图需求 <b>' + formatNumber(blueprints.required) + '</b></span>' +
      '<span>使用已有 <b data-reference-blueprint-stock>' + formatNumber(blueprints.usedStock) + '</b></span><span>神图缺口 <b data-reference-blueprint-missing>' + formatNumber(blueprints.missing) + '</b></span>' +
      '<span>神图费用 <b>' + formatNumber(blueprints.yuan) + '</b>（单价 ' + formatNumber(blueprints.unitPrice) + '）</span><span>机关兽已知费用 <b>' + formatNumber(beastYuan) + '</b></span></div>' +
      (cost.beasts.length ? '<ul class="machine-reference-cost-beasts">' + cost.beasts.map(function (beast) {
        return '<li>' + escapeHtml(beast.beastName) + '：缺少碎片 ' + formatNumber(beast.fragments) + '，折算 ' + formatNumber(beast.bodyEquivalent) + '只' +
          (beast.contribution === null ? '，每只参考价 ' + (beast.unitPrice === null ? '未设置' : formatNumber(beast.unitPrice)) : '，贡献 ' + formatNumber(beast.contribution) + '÷2.7') +
          '，费用 ' + (beast.yuan === null ? '未设置，暂不可计入总价' : formatNumber(beast.yuan)) + '</li>';
      }).join("") + '</ul>' : '') +
      (cost.complete ? '<p class="machine-reference-cost-total">参考总价 <b data-reference-cost-total>' + formatNumber(cost.totalYuan) + '</b> 元宝</p>' :
        '<p class="machine-reference-cost-error">成本不完整，已知小计 <b>' + formatNumber(cost.knownYuan) + '</b> 元宝；未设置单价：' + cost.missingPrices.map(function (beast) { return escapeHtml(beast.beastName); }).join('、') + '。缺价不等于免费，不显示完整总价。</p>') +
      '<p class="muted-tip">仅含神图和新增机关兽的碎片缺口，按折算只数估价；不改变推荐方案，不扣减真实库存。</p>';
  }

  function costSlot(key, requirements) {
    state.referenceCostRequirements[key] = requirements;
    return '<section class="machine-reference-cost-panel" data-reference-cost-panel="' + key + '">' + referenceCostPanel(requirements) + '</section>';
  }

  function refreshReferenceCosts() {
    el.calculatorResult.querySelectorAll('[data-reference-cost-panel]').forEach(function (panel) {
      var requirements = state.referenceCostRequirements[panel.dataset.referenceCostPanel];
      if (requirements) panel.innerHTML = referenceCostPanel(requirements);
    });
    var status = el.calculatorControls.querySelector('[data-reference-cost-save-status]');
    if (status) status.textContent = referenceCostInputError() || (state.referenceCostDirty ? '当前参考成本修改未保存，请修正输入或重试保存。' : '参考成本设置已按当前账号保存。');
  }

  function updateReferenceCost(target) {
    var draft = state.referenceCostDraft;
    if (target.matches('[data-reference-beast-price]')) draft.beastPrices[target.dataset.referenceBeastPrice] = target.value === '' ? null : target.value;
    else if (target.matches('[data-reference-cost-field]')) draft[target.dataset.referenceCostField] = target.type === 'checkbox' ? target.checked : target.value;
    else if (target.matches('[data-reference-blueprint-preset]')) {
      if (target.value === 'custom') return;
      draft.awakeningBlueprintPrice = target.value;
      el.calculatorControls.querySelector('[data-reference-cost-field="awakeningBlueprintPrice"]').value = target.value;
    } else return;
    if (target.matches('[data-reference-cost-field="awakeningBlueprintPrice"]')) {
      var preset = el.calculatorControls.querySelector('[data-reference-blueprint-preset]');
      var option = Array.from(preset.options).find(function (item) { return item.value !== 'custom' && target.value !== '' && Number(item.value) === Number(target.value); });
      preset.value = option ? option.value : 'custom';
    }
    state.referenceCostDirty = true;
    if (!referenceCostInputError()) {
      var normalized = CORE.normalizeReferenceCostSettings(DATA, draft);
      if (saveProgress(state.beasts, normalized)) {
        state.referenceCost = normalized;
        state.referenceCostDirty = false;
        clearError();
      }
    }
    refreshReferenceCosts();
  }

  function inventorySummary(beast, progress) {
    var parts = [];
    DATA.modifications.forEach(function (modification) {
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (rank) {
        if (ranks[rank]) parts.push(combinedRankLabel(modification.name, rank) + "×" + ranks[rank]);
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
    var flagPrefix = scope === "progress" ? "edit" : scope === "school" ? "school" : "calc";
    var beastData = scope === "school" ? ' data-beast-id="' + beast.id + '"' : '';
    var html = '<div class="machine-inventory-options">';
    if (beast.maxRank >= 8) {
      html += '<label><input type="checkbox" data-' + flagPrefix + '-flag="showHighRanks"' + beastData + (draft.showHighRanks ? " checked" : "") + '>显示8–10阶库存</label>';
    }
    if (beast.quality === "orange") {
      html += '<label><input type="checkbox" data-' + flagPrefix + '-flag="showMods"' + beastData + (draft.showMods ? " checked" : "") + '>显示改造库存</label>';
    }
    html += "</div><div class=\"machine-inventory-groups\">";
    modifications.forEach(function (modification) {
      html += '<fieldset class="machine-inventory-group"><legend>' + escapeHtml(modification.name) + '</legend><div class="machine-rank-inputs">';
      ranks.forEach(function (rank) {
        var value = (draft.inventory[modification.id] || {})[String(rank)] || 0;
        html += '<label><span>' + rank + '阶</span><input type="number" min="0" step="1" inputmode="numeric" value="' + value + '" data-' + flagPrefix + '-inventory' + beastData + ' data-mod="' + modification.id + '" data-rank="' + rank + '"></label>';
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

  function beastCard(beast, matched) {
    var progress = getProgress(beast);
    var level = CORE.levelForResearch(progress.research, DATA.researchThresholds, beast.maxLevel);
    var active = CORE.activeBeastEffect(beast, level);
    var editing = state.editingId === beast.id;
    return '<article class="machine-beast-card ' + qualityClass(beast) + (matched ? ' machine-search-match' : '') + '">' +
      '<div class="machine-beast-head"><div><span class="machine-quality-badge">' + escapeHtml(beast.tier) + '</span><strong>' + escapeHtml(beast.name) + '</strong></div>' +
      (editing ? "" : '<button type="button" class="seg" data-machine-action="edit-progress" data-beast-id="' + beast.id + '">编辑</button>') + '</div>' +
      '<p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p>' +
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
    var school = schoolById(state.progressSchoolId);
    var snapshot = CORE.schoolSnapshot(school, progressMap, DATA);
    var stageCopy = snapshot.currentStage ? snapshot.currentStage + "阶已达成" : "尚未达成1阶";
    var progressCopy = snapshot.progressStage + "阶进度：" + snapshot.progressCurrent + "/" + snapshot.progressTarget +
      (snapshot.progressRemaining ? "，还差" + snapshot.progressRemaining : "");
    var query = state.searches.progress;
    var visibleIds = query ? school.beastIds.filter(function (id) { return isSearchMatch(beastById(id), "progress"); }) : school.beastIds;
    var cards = visibleIds.length
      ? visibleIds.map(function (id) { return beastCard(beastById(id), Boolean(query)); }).join("")
      : '<p class="machine-search-empty">当前流派没有符合条件的机关兽</p>';
    el.progressContent.innerHTML = schoolSwitcher("progress", school.id) +
      '<section class="machine-school panel">' +
      '<div class="machine-school-head"><div><h2>' + escapeHtml(school.name) + '</h2><span>当前流派累计觉醒等级</span><strong>' + snapshot.totalLevel + '</strong></div>' +
      '<div class="machine-stage-one"><b>' + stageCopy + '</b><span>' + progressCopy + '</span><small>各阶累计觉醒等级要求：45／90／135／180／225</small></div></div>' +
      '<div class="machine-effect-grid">' + effectBlock("当前生效", snapshot.currentEffects, "尚未达成1阶") + effectBlock("下一阶预览", snapshot.nextStage, "已达到当前最高阶") + '</div>' +
      '<div class="machine-beast-list">' + cards + '</div></section>';
    rendered.progress = true;
  }

  function inventoryPolicy(progress) {
    var limits = {};
    DATA.modifications.forEach(function (modification) {
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).forEach(function (rank) {
        if (!limits[modification.id]) limits[modification.id] = {};
        limits[modification.id][rank] = CORE.integer(ranks[rank]);
      });
    });
    return { useOwnedInventory: true, limits: limits };
  }

  function inventoryEntries(beast, progress) {
    var entries = [];
    DATA.modifications.forEach(function (modification) {
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).sort(function (left, right) { return Number(right) - Number(left); }).forEach(function (rank) {
        var count = CORE.integer(ranks[rank]);
        if (count) entries.push({ beastId: beast.id, modificationId: modification.id, modificationName: modification.name, rank: rank, count: count });
      });
    });
    return entries;
  }

  function calculatorInventorySelector(beast, progress, policy, scope, showGlobal) {
    var entries = inventoryEntries(beast, progress);
    var global = showGlobal ? '<label class="machine-owned-global"><input type="checkbox" data-owned-global data-owned-scope="' + scope + '"' + (policy.useOwnedInventory ? ' checked' : '') + '>使用已有库存</label>' : '';
    var rows = entries.map(function (entry) {
      var modificationLimits = policy.limits[entry.modificationId] || {};
      var enabled = CORE.integer(modificationLimits[entry.rank]) > 0;
      var limit = enabled ? Math.min(entry.count, CORE.integer(modificationLimits[entry.rank])) : 0;
      return '<div class="machine-owned-inventory-row" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '">' +
        '<input type="checkbox" data-machine-owned-enabled data-owned-scope="' + scope + '" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '"' + (enabled ? ' checked' : '') + (policy.useOwnedInventory ? '' : ' disabled') + '>' +
        '<span>' + escapeHtml(combinedRankLabel(entry.modificationName, entry.rank)) + '</span><span>已有×' + entry.count + '</span>' +
        '<label><span>最多使用</span><input type="number" min="0" max="' + entry.count + '" step="1" value="' + limit + '" data-machine-owned-limit data-owned-scope="' + scope + '" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '"' + (enabled && policy.useOwnedInventory ? '' : ' disabled') + '></label></div>';
    }).join("");
    return '<section class="machine-owned-inventory"><div class="machine-owned-head"><strong>本次使用库存</strong>' + global + '</div>' +
      (rows ? '<div class="machine-owned-inventory-grid">' + rows + '</div>' : '<p class="muted-tip">暂无可用库存</p>') + '</section>';
  }

  function newRankModeSelector(scope, selected) {
    var name = "machine-" + scope + "-new-rank-mode";
    return '<div class="machine-new-rank-mode"><span>新增机关兽阶数范围</span>' +
      '<label><input type="radio" name="' + name + '" value="zero" data-new-rank-mode-scope="' + scope + '"' + (selected === "zero" ? " checked" : "") + '>仅0阶</label>' +
      '<label><input type="radio" name="' + name + '" value="zeroToSeven" data-new-rank-mode-scope="' + scope + '"' + (selected !== "zero" ? " checked" : "") + '>0–7阶</label></div>';
  }

  function resetCalculator(beastId) {
    rendered.calculator = false;
    var beast = beastById(beastId || state.calcBeastId || DATA.beasts[0].id);
    state.calcBeastId = beast.id;
    state.calcDraft = clone(getProgress(beast));
    state.singleInventoryPolicy = inventoryPolicy(state.calcDraft);
    var currentLevel = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beast.maxLevel);
    state.calcTargetLevel = CORE.nextEffectLevel(beast, currentLevel);
    state.calcResult = null;
  }

  function resetSchoolCalculator(schoolId) {
    rendered.calculator = false;
    var school = DATA.schools.find(function (item) { return item.id === (schoolId || (state.schoolDraft && state.schoolDraft.schoolId)); }) || DATA.schools[0];
    var progressByBeast = {};
    var participating = {};
    var ownedPoliciesByBeast = {};
    school.beastIds.forEach(function (beastId) {
      var beast = beastById(beastId);
      progressByBeast[beastId] = clone(getProgress(beast));
      participating[beastId] = true;
      ownedPoliciesByBeast[beastId] = inventoryPolicy(progressByBeast[beastId]);
    });
    state.schoolDraft = {
      schoolId: school.id,
      targetStage: PLANNER.defaultTargetStage(DATA, school, progressByBeast),
      progressByBeast: progressByBeast,
      participating: participating,
      useOwnedInventory: true,
      ownedPoliciesByBeast: ownedPoliciesByBeast,
      newRankMode: "zeroToSeven",
      allowNewHighRanks: false,
      allowNewModifications: false
    };
    state.schoolResult = null;
  }

  function calcTargetOptions(beast, selected, currentLevel) {
    var html = "";
    for (var level = Math.max(1, currentLevel); level <= beast.maxLevel; level += 1) {
      html += '<option value="' + level + '"' + (level === selected ? " selected" : "") + '>' + level + '级（' + formatNumber(DATA.researchThresholds[level]) + '研发度）</option>';
    }
    return html;
  }

  function renderSingleCalculatorControls() {
    if (!state.calcDraft) resetCalculator();
    var beast = beastById(state.calcBeastId);
    var currentLevel = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beast.maxLevel);
    el.calculatorControls.innerHTML = '<section class="panel machine-calculator-panel' + (isSearchMatch(beast, "calculator") ? ' machine-search-match' : '') + '"><div class="machine-calculator-top">' +
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
      '</div><p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p><div class="machine-calculator-actions"><button type="button" class="seg" data-machine-action="reload-calculator">从个人进度重新读取</button>' +
      '<button type="button" class="seg active" data-machine-action="calculate">计算最优方案</button></div>' +
      newRankModeSelector("single", state.singleNewRankMode) +
      '<details class="machine-temporary-inventory"><summary>临时调整当前库存</summary>' + inventoryEditor(beast, state.calcDraft, "calculator") + '</details>' +
      calculatorInventorySelector(beast, state.calcDraft, state.singleInventoryPolicy, "single", true) + '</section>';
  }

  function schoolStageOptions(school, selected) {
    return school.stages.map(function (stage) {
      return '<option value="' + stage.stage + '"' + (stage.stage === selected ? ' selected' : '') + '>' + stage.stage + '阶（累计' + stage.requiredTotalLevel + '级）</option>';
    }).join("");
  }

  function renderSchoolBeastControl(beast, draft, matched) {
    var progress = draft.progressByBeast[beast.id];
      var policy = Object.assign({}, draft.ownedPoliciesByBeast[beast.id], { useOwnedInventory: draft.useOwnedInventory });
    var level = CORE.levelForResearch(progress.research, DATA.researchThresholds, beast.maxLevel);
    var participating = draft.participating[beast.id];
    return '<article class="machine-school-beast-control ' + (participating ? '' : 'is-excluded') + (matched ? ' machine-search-match' : '') + '">' +
      '<header><div><span class="machine-quality-badge ' + qualityClass(beast) + '">' + escapeHtml(beast.tier) + '</span><strong>' + escapeHtml(beast.name) + '</strong></div>' +
      '<label><input type="checkbox" data-school-participant data-beast-id="' + beast.id + '"' + (participating ? ' checked' : '') + '>参与后续培养</label></header>' +
      '<p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p>' +
      '<div class="machine-school-beast-fields"><label><span>当前累计研发度</span><input type="number" min="0" step="1" value="' + progress.research + '" data-school-field="research" data-beast-id="' + beast.id + '"></label>' +
      '<label><span>当前等级</span><b>' + level + '/' + beast.maxLevel + '级</b></label>' +
      '<label><span>机关兽碎片</span><input type="number" min="0" step="1" value="' + progress.fragments + '" data-school-field="fragments" data-beast-id="' + beast.id + '"></label></div>' +
      (participating ? '<details class="machine-temporary-inventory"><summary>临时库存与本次使用</summary>' + inventoryEditor(beast, progress, "school") + calculatorInventorySelector(beast, progress, policy, "school", false) + '</details>' : '<p class="muted-tip">现有等级仍计入流派累计等级，但不会继续投入。</p>') + '</article>';
  }

  function renderSchoolCalculatorControls() {
    if (!state.schoolDraft) resetSchoolCalculator();
    var draft = state.schoolDraft;
    var school = DATA.schools.find(function (item) { return item.id === draft.schoolId; });
    var snapshot = CORE.schoolSnapshot(school, draft.progressByBeast, DATA);
    var targetTotal = school.stages[draft.targetStage - 1].requiredTotalLevel;
    var calculatorQuery = state.searches.calculator;
    var orderedBeastIds = school.beastIds.slice().sort(function (left, right) {
      return Number(isSearchMatch(beastById(right), "calculator")) - Number(isSearchMatch(beastById(left), "calculator"));
    });
    el.calculatorControls.innerHTML = '<section class="panel machine-school-calculator"><div class="machine-school-calculator-grid">' +
      '<label><span>机关术流派</span><select data-school-calc-school>' + DATA.schools.map(function (item) { return '<option value="' + item.id + '"' + (item.id === school.id ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>'; }).join("") + '</select></label>' +
      '<label><span>目标流派阶数</span><select data-school-target>' + schoolStageOptions(school, draft.targetStage) + '</select></label>' +
      '<div><span>当前累计觉醒等级</span><b>' + snapshot.totalLevel + '</b></div><div><span>距离目标</span><b>' + Math.max(0, targetTotal - snapshot.totalLevel) + '级</b></div></div>' +
      '<div class="machine-school-options"><label><input type="checkbox" data-school-option="useOwnedInventory"' + (draft.useOwnedInventory ? ' checked' : '') + '>使用已有库存</label>' +
      '<label><input type="checkbox" data-school-option="allowNewHighRanks"' + (draft.allowNewHighRanks ? ' checked' : '') + (draft.newRankMode === "zero" ? ' disabled' : '') + '>允许新增8–10阶</label>' +
      '<label><input type="checkbox" data-school-option="allowNewModifications"' + (draft.allowNewModifications ? ' checked' : '') + '>允许新增改造机关兽</label></div>' +
      newRankModeSelector("school", draft.newRankMode) +
      '<div class="machine-calculator-actions"><button type="button" class="seg" data-machine-action="reload-school-calculator">从个人进度重新读取</button><button type="button" class="seg active" data-machine-action="calculate-school">计算两套最优方案</button></div>' +
      '<p class="muted-tip">效果档位方案仅在折算投入总数和新增投入数相同时，优先选择更多10、15、20、25级效果档位。</p>' +
      '<div class="machine-school-beast-controls">' + orderedBeastIds.map(function (beastId) {
        var beast = beastById(beastId);
        return renderSchoolBeastControl(beast, draft, Boolean(calculatorQuery) && isSearchMatch(beast, "calculator"));
      }).join("") + '</div></section>';
  }

  function renderCalculatorControls() {
    if (state.calculatorMode === "school") renderSchoolCalculatorControls();
    else renderSingleCalculatorControls();
    el.calculatorControls.insertAdjacentHTML("beforeend", referenceCostControls());
    el.calculatorModes.querySelectorAll('[data-machine-calculator-mode]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.machineCalculatorMode === state.calculatorMode);
    });
    var result = state.calculatorMode === "school" ? state.schoolResult : state.calcResult;
    if (result) {
      if (state.calculatorMode === "school") renderSchoolCalculatorResult(result, false);
      else renderCalculatorResult(result, false);
    } else el.calculatorResult.hidden = true;
    rendered.calculator = true;
  }

  function itemLabel(item) {
    var equivalent = item.rank > 7 ? '（折合7阶×' + item.sevenRankEquivalent * item.count + '）' : '';
    return combinedRankLabel(modificationName(item.modificationId), item.rank) + '×' + item.count + equivalent + '，单只' + formatNumber(item.researchEach) + '研发度';
  }

  function itemRequirementLabel(item) {
    var equivalent = item.rank > 7 ? '（折合7阶×' + item.sevenRankEquivalent * item.count + '）' : '';
    return combinedRankLabel(modificationName(item.modificationId), item.rank) + '×' + item.count + equivalent;
  }

  function itemList(items, empty, emphasizeRequirement) {
    return items.length ? '<ul>' + items.map(function (item) {
      if (!emphasizeRequirement) return '<li>' + escapeHtml(itemLabel(item)) + '</li>';
      var emphasisClass = emphasizeRequirement === "owned" ? "machine-owned-investment" : "machine-investment-demand";
      return '<li><strong class="' + emphasisClass + '">' + escapeHtml(itemRequirementLabel(item)) + '</strong><span>，单只' + formatNumber(item.researchEach) + '研发度</span></li>';
    }).join("") + '</ul>' : '<p class="muted-tip">' + escapeHtml(empty) + '</p>';
  }

  function renderCalculatorResult(result, scroll) {
    state.referenceCostRequirements = {};
    el.calculatorResult.hidden = false;
    if (!result.valid) {
      el.calculatorResult.innerHTML = '<section class="panel machine-result is-error"><h2>无法计算</h2><ul>' + result.errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul></section>';
      return;
    }
    var exchange = result.exchange.available
      ? '<div><span>仍需贡献</span><b>' + formatNumber(result.exchange.contribution) + '</b></div><div><span>约需元宝</span><b>' + formatNumber(result.exchange.yuan) + '</b></div>'
      : '<div class="machine-no-exchange"><span>贡献兑换</span><b>该档次不可通过贡献兑换碎片</b></div>';
    el.calculatorResult.innerHTML = '<section class="panel machine-result"><div class="machine-result-head"><div><h2>' + escapeHtml(beastById(state.calcBeastId).name) + '升至' + result.target.level + '级</h2></div><b>计算结果</b></div>' +
      '<div class="machine-result-metrics"><div><span>当前等级</span><b>' + result.current.level + '级</b></div><div><span>当前研发度</span><b>' + formatNumber(result.current.research) + '</b></div>' +
      '<div><span>目标研发度</span><b>' + formatNumber(result.target.research) + '</b></div><div><span>仍缺研发度</span><b>' + formatNumber(result.target.deficit) + '</b></div>' +
      '<div><span>投入总只数</span><b>' + result.totals.investedCount + '</b></div><div><span>投入研发度</span><b>' + formatNumber(result.totals.research) + '</b></div>' +
      '<div><span>溢出研发度</span><b>' + formatNumber(result.totals.overflow) + '</b></div><div><span>预计达到</span><b>' + result.totals.projectedLevel + '级</b></div></div>' +
      '<div class="machine-result-columns"><article><h3>使用已有库存</h3>' + itemList(result.selected.ownedItems, "不使用已有完整机关兽", "owned") + '</article>' +
      '<article><h3>新增投入</h3>' + itemList(result.selected.newItems, "无需新增机关兽", true) + '</article></div>' +
      '<div class="machine-result-metrics machine-resource-metrics"><div><span>觉醒神图</span><b>' + formatNumber(result.totals.awakeningBlueprints) + '</b></div><div><span>机关破片</span><b>' + formatNumber(result.totals.organPieces) + '</b></div>' +
      '<div><span>本体缺口</span><b>' + result.shortage.bodyEquivalent + '本体</b></div><div><span>机关兽碎片缺口</span><b>' + formatNumber(result.shortage.fragments) + '</b></div>' + exchange + '</div>' +
      costSlot("single", { awakeningBlueprints: result.totals.awakeningBlueprints, beasts: [{ beastId: state.calcBeastId, fragments: result.shortage.fragments }] }) +
      '<details class="machine-unused"><summary>查看未使用库存（' + result.unused.reduce(function (total, item) { return total + item.count; }, 0) + '只）</summary>' + itemList(result.unused.map(function (item) { return Object.assign({ source: "owned", sevenRankEquivalent: item.rank > 7 ? Math.pow(2, item.rank - 7) : 1 }, item); }), "无未使用库存") + '</details></section>';
    if (scroll !== false) el.calculatorResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function schoolPlanTitle(kind) {
    if (kind === "free") return "自由等级方案";
    if (kind === "milestone") return "效果档位方案（同等投入优先）";
    return "同时满足自由等级与同等投入效果档位优化";
  }

  function schoolResourceValue(value) {
    return value === null ? "存在不可贡献兑换的碎片缺口" : formatNumber(value);
  }

  function renderSchoolBeastPlan(detail) {
    var ownedItems = detail.items.filter(function (item) { return item.source === "owned"; });
    var newItems = detail.items.filter(function (item) { return item.source === "new"; });
    return '<article class="machine-school-plan-beast"><header><strong>' + escapeHtml(detail.beastName) + '</strong><b>' + detail.startLevel + '级 → ' + detail.endLevel + '级</b></header>' +
      '<div class="machine-school-plan-beast-metrics"><span>研发度 ' + formatNumber(detail.startResearch) + ' → ' + formatNumber(detail.endResearch) + '</span><span>增加 ' + formatNumber(detail.addedResearch) + '</span><span>溢出 ' + formatNumber(detail.overflowResearch) + '</span></div>' +
      '<div class="machine-result-columns"><article><h3>使用已有库存</h3>' + itemList(ownedItems, "不使用已有完整机关兽", "owned") + '</article><article><h3>新增投入</h3>' + itemList(newItems, "无需新增机关兽", true) + '</article></div>' +
      '<div class="machine-school-plan-resources"><span>折算投入 <b>' + detail.investedCount + '只</b></span><span>机关兽碎片缺口 <b>' + formatNumber(detail.resources.fragments) + '</b></span><span>贡献 <b>' + schoolResourceValue(detail.resources.contribution) + '</b></span><span>元宝 <b>' + schoolResourceValue(detail.resources.yuan) + '</b></span></div></article>';
  }

  function renderSchoolPlan(plan, result, index) {
    var totals = plan.totals;
    return '<section class="panel machine-result machine-school-plan"><div class="machine-result-head"><div><h2>' + escapeHtml(schoolPlanTitle(plan.kind)) + '</h2></div><b>' + result.target.stage + '阶 · 累计' + result.target.totalLevel + '级</b></div>' +
      '<div class="machine-school-plan-summary"><div><span>当前累计等级</span><b>' + result.current.totalLevel + '</b></div><div><span>推荐后累计等级</span><b>' + totals.projectedTotalLevel + '</b></div>' +
      '<div><span>折算投入总只数</span><b>' + totals.investedCount + '</b></div><div><span>使用已有库存</span><b>' + totals.ownedInvestedCount + '</b></div><div><span>新增机关兽</span><b>' + totals.newInvestedCount + '</b></div>' +
      '<div><span>效果档位数量</span><b>' + totals.milestoneCount + '</b></div><div><span>研发度溢出</span><b>' + formatNumber(totals.overflowResearch) + '</b></div><div><span>觉醒神图</span><b>' + formatNumber(totals.awakeningBlueprints) + '</b></div>' +
      '<div><span>机关破片</span><b>' + formatNumber(totals.organPieces) + '</b></div><div><span>机关兽碎片缺口</span><b>' + formatNumber(totals.fragments) + '</b></div><div><span>贡献合计</span><b>' + schoolResourceValue(totals.contribution) + '</b></div><div><span>元宝合计</span><b>' + schoolResourceValue(totals.yuan) + '</b></div></div>' +
      costSlot("school-" + index, { awakeningBlueprints: totals.awakeningBlueprints, beasts: plan.beasts.map(function (detail) { return { beastId: detail.beastId, fragments: detail.resources.fragments }; }) }) +
      (plan.beasts.length ? '<div class="machine-school-plan-beasts">' + plan.beasts.map(renderSchoolBeastPlan).join("") + '</div>' : '<p class="machine-school-complete">目标已达成，无需新增投入。</p>') + '</section>';
  }

  function renderSchoolCalculatorResult(result, scroll) {
    state.referenceCostRequirements = {};
    el.calculatorResult.hidden = false;
    if (!result.valid) {
      el.calculatorResult.innerHTML = '<section class="panel machine-result is-error"><h2>无法计算</h2><ul>' + result.errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul></section>';
      return;
    }
    el.calculatorResult.innerHTML = result.plans.map(function (plan, index) { return renderSchoolPlan(plan, result, index); }).join("");
    if (scroll !== false) el.calculatorResult.scrollIntoView({ behavior: "smooth", block: "start" });
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
    var school = schoolById(state.referenceBeastSchoolId);
    var query = state.searches.reference;
    var beasts = DATA.beasts.filter(function (beast) {
      return beast.schoolId === school.id && (!query || isSearchMatch(beast, "reference"));
    });
    var cards = beasts.map(function (beast) {
        var effects = DATA.effectLevels.map(function (level) {
          var effect = beast.effects.find(function (item) { return item.level === level; });
          return '<div><dt>' + level + '级效果</dt><dd>' + (effect ? escapeHtml(effect.text) : '—') + '</dd></div>';
        }).join("");
        return '<article class="machine-reference-card machine-beast-reference-card' + (query ? ' machine-search-match' : '') + '"><header><span class="machine-name-token ' + qualityClass(beast) + '">' + escapeHtml(beast.name) + '</span><span>' + escapeHtml(school.name) + ' · ' + beast.tier + ' · 上限' + beast.maxLevel + '级</span></header><p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p><dl class="machine-effect-reference-list">' + effects + '</dl></article>';
      }).join("");
    return '<section class="panel"><h2>机关兽归属与研发效果</h2>' + schoolSwitcher("reference-beasts", school.id) +
      '<div class="machine-reference-grid machine-beast-reference-grid">' + (cards || '<p class="machine-search-empty">当前流派没有符合条件的机关兽</p>') + '</div></section>';
  }

  function schoolReference() {
    var school = schoolById(state.referenceStageSchoolId);
    return '<section class="panel"><h2>霸道／非攻机关术阶数效果研发</h2>' + schoolSwitcher("reference-stages", school.id) +
      '<div class="machine-reference-grid machine-school-stage-grid">' + school.stages.map(function (stage) {
        return '<article class="machine-reference-card machine-school-stage-card"><header><h3>' + stage.stage + '阶</h3><span>' + (stage.requiredTotalLevel === null ? '升阶要求：数据待补充' : '累计觉醒等级' + stage.requiredTotalLevel) + '</span></header><dl><div><dt>流派加成</dt><dd>' + escapeHtml(stage.factionBonus) + '</dd></div><div><dt>阵容特效</dt><dd>' + escapeHtml(stage.formationEffect) + '</dd></div><div><dt>机关兽特效</dt><dd>' + escapeHtml(stage.beastEffect) + '</dd></div></dl></article>';
      }).join("") + '</div></section>';
  }

  function materialReference() {
    return '<section class="panel" data-machine-material-sources><h2>材料获取与设计图关卡查询</h2><div class="machine-reference-grid machine-material-source-grid">' + (DATA.materialSources || []).map(function (material) {
      return '<article class="machine-reference-card"><h3>' + escapeHtml(material.name) + '</h3><p>获取来源：' + escapeHtml((material.sources || []).join('、')) + '</p>' +
        (material.stages && material.stages.length ? '<p class="machine-material-stages">掉落关卡：' + material.stages.map(function (stage) { return '<span>' + escapeHtml(stage) + '</span>'; }).join('、') + '</p>' : '') + '</article>';
    }).join('') + '</div><p class="muted-tip">关卡编号为来源查询说明，未变更现有掉落资料。</p><p class="machine-treasurebox-note">' + escapeHtml((DATA.referenceCostRules || {}).treasureBoxNote || '') + '</p></section>';
  }

  function renderReference() {
    el.referenceContent.innerHTML = beastReference() + materialReference() + schoolReference() + thresholdReference() + researchReference();
    rendered.reference = true;
  }

  function setMode(mode) {
    state.mode = mode;
    applySearchContext(mode);
    el.modes.querySelectorAll("[data-machine-beast-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.machineBeastMode === mode); });
    el.progress.hidden = mode !== "progress";
    el.calculator.hidden = mode !== "calculator";
    el.reference.hidden = mode !== "reference";
    if (mode === "progress" && !rendered.progress) renderProgress();
    if (mode === "calculator" && !rendered.calculator) renderCalculatorControls();
    if (mode === "reference" && !rendered.reference) renderReference();
  }

  function captureView() {
    return {
      mode: state.mode,
      searches: clone(state.searches),
      progressSchoolId: state.progressSchoolId,
      referenceBeastSchoolId: state.referenceBeastSchoolId,
      referenceStageSchoolId: state.referenceStageSchoolId,
      calculatorMode: state.calculatorMode,
      calcBeastId: state.calcBeastId,
      calcDraft: clone(state.calcDraft),
      calcTargetLevel: state.calcTargetLevel,
      calcResult: clone(state.calcResult),
      singleInventoryPolicy: clone(state.singleInventoryPolicy),
      singleNewRankMode: state.singleNewRankMode,
      schoolDraft: clone(state.schoolDraft),
      schoolResult: clone(state.schoolResult)
    };
  }

  function restoreView(view) {
    var saved = view || {};
    Object.keys(searchRefresh).forEach(function (scope) { searchRefresh[scope].cancel(); });
    state.searches = Object.assign({ progress: "", calculator: "", reference: "" }, saved.searches || {});
    Object.keys(state.searches).forEach(function (scope) { pendingSearches[scope] = state.searches[scope]; });
    state.progressSchoolId = saved.progressSchoolId || state.progressSchoolId;
    state.referenceBeastSchoolId = saved.referenceBeastSchoolId || state.referenceBeastSchoolId;
    state.referenceStageSchoolId = saved.referenceStageSchoolId || state.referenceStageSchoolId;
    state.calculatorMode = saved.calculatorMode || state.calculatorMode;
    if (saved.calcBeastId && beastById(saved.calcBeastId)) state.calcBeastId = saved.calcBeastId;
    if (saved.calcDraft) state.calcDraft = clone(saved.calcDraft);
    if (saved.calcTargetLevel != null) state.calcTargetLevel = saved.calcTargetLevel;
    state.calcResult = saved.calcResult == null ? null : clone(saved.calcResult);
    if (saved.singleInventoryPolicy) state.singleInventoryPolicy = clone(saved.singleInventoryPolicy);
    state.singleNewRankMode = saved.singleNewRankMode || state.singleNewRankMode;
    if (saved.schoolDraft) state.schoolDraft = clone(saved.schoolDraft);
    state.schoolResult = saved.schoolResult == null ? null : clone(saved.schoolResult);
    rendered = { progress: false, calculator: false, reference: false };
    setMode(saved.mode || "progress");
  }

  function applyNavigationQuery(name) {
    var query = String(name == null ? "" : name).trim();
    Object.keys(searchRefresh).forEach(function (scope) { searchRefresh[scope].cancel(); });
    ["progress", "calculator", "reference"].forEach(function (scope) {
      state.searches[scope] = query;
      pendingSearches[scope] = query;
    });
    rendered = { progress: false, calculator: false, reference: false };
    setMode("progress");
    return captureView();
  }

  function updateInventory(draft, target) {
    var modificationId = target.dataset.mod;
    var rank = target.dataset.rank;
    var value = CORE.integer(target.value);
    if (!draft.inventory[modificationId]) draft.inventory[modificationId] = {};
    if (value) draft.inventory[modificationId][rank] = value;
    else delete draft.inventory[modificationId][rank];
  }

  function schoolHasMatch(schoolId, matches) {
    return matches.some(function (beast) { return beast.schoolId === schoolId; });
  }

  function applySearchContext(scope) {
    var query = state.searches[scope];
    if (!query) return;
    var matches = searchMatches(scope);
    if (!matches.length) return;
    if (scope === "progress") {
      if (!schoolHasMatch(state.progressSchoolId, matches)) state.progressSchoolId = matches[0].schoolId;
    } else if (scope === "reference") {
      if (!schoolHasMatch(state.referenceBeastSchoolId, matches)) state.referenceBeastSchoolId = matches[0].schoolId;
      if (!schoolHasMatch(state.referenceStageSchoolId, matches)) state.referenceStageSchoolId = matches[0].schoolId;
    } else if (scope === "calculator") {
      if (state.calculatorMode === "single") {
        if (!matches.some(function (beast) { return beast.id === state.calcBeastId; })) resetCalculator(matches[0].id);
      } else if (!schoolHasMatch(state.schoolDraft.schoolId, matches)) {
        resetSchoolCalculator(matches[0].schoolId);
      }
    }
  }

  function renderSearchResults(scope) {
    if (scope === "progress") renderProgress();
    else if (scope === "calculator") renderCalculatorControls();
    else if (scope === "reference") renderReference();
  }

  function applySearchInput(scope, value) {
    if (!Object.prototype.hasOwnProperty.call(state.searches, scope) || state.searches[scope] === value) return;
    state.searches[scope] = value;
    applySearchContext(scope);
    renderSearchResults(scope);
  }

  function scheduleSearchInput(scope, value) {
    pendingSearches[scope] = value;
    searchRefresh[scope].schedule();
  }

  function handleSearchCompositionStart(event) {
    var scope = event.target && event.target.dataset ? event.target.dataset.machineSearch : "";
    if (scope && Object.prototype.hasOwnProperty.call(state.composingSearch, scope)) {
      state.composingSearch[scope] = true;
      searchRefresh[scope].cancel();
    }
  }

  function handleSearchCompositionEnd(event) {
    var scope = event.target && event.target.dataset ? event.target.dataset.machineSearch : "";
    if (!scope || !Object.prototype.hasOwnProperty.call(state.composingSearch, scope)) return;
    state.composingSearch[scope] = false;
    scheduleSearchInput(scope, event.target.value);
  }

  function handleProgressClick(event) {
    var schoolButton = event.target.closest('[data-machine-school-scope="progress"]');
    if (schoolButton) {
      state.progressSchoolId = schoolButton.dataset.schoolId;
      renderProgress();
      return;
    }
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
      var updatedBeasts = Object.assign({}, state.beasts);
      updatedBeasts[beast.id] = CORE.normalizeBeastProgress(beast, state.editDraft, DATA);
      if (saveProgress(updatedBeasts)) {
        state.beasts = updatedBeasts;
        state.editingId = null;
        state.editDraft = null;
        clearError();
        renderProgress();
        if (state.calcBeastId === beast.id) resetCalculator(beast.id);
      }
    }
  }

  function handleProgressInput(event) {
    if (event.target.matches('[data-machine-search="progress"]')) {
      if (event.isComposing || state.composingSearch.progress) return;
      scheduleSearchInput("progress", event.target.value);
      return;
    }
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
    var modeButton = event.target.closest("[data-machine-calculator-mode]");
    if (modeButton) {
      state.calculatorMode = modeButton.dataset.machineCalculatorMode;
      el.calculatorModes.querySelectorAll("[data-machine-calculator-mode]").forEach(function (button) {
        button.classList.toggle("active", button === modeButton);
      });
      el.calculatorResult.hidden = true;
      applySearchContext("calculator");
      renderCalculatorControls();
      return;
    }
    var button = event.target.closest("[data-machine-action]");
    if (!button) return;
    var action = button.dataset.machineAction;
    var beast = beastById(state.calcBeastId);
    if (action === "save-reference-cost") {
      updateReferenceCost(el.calculatorControls.querySelector('[data-reference-cost-field="awakeningBlueprintStock"]'));
    } else if (action === "reload-calculator") {
      resetCalculator(beast.id);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (action === "calculate") {
      state.calcResult = CORE.calculateInvestmentPlan(DATA, beast, state.calcDraft, {
        targetLevel: state.calcTargetLevel,
        includeHighRanks: state.calcDraft.showHighRanks,
        includeMods: state.calcDraft.showMods,
        useOwnedInventory: state.singleInventoryPolicy.useOwnedInventory,
        ownedLimits: state.singleInventoryPolicy.limits,
        newRankMode: state.singleNewRankMode,
        preferOwnedOnTie: true
      });
      renderCalculatorResult(state.calcResult);
    } else if (action === "reload-school-calculator") {
      resetSchoolCalculator(state.schoolDraft.schoolId);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (action === "calculate-school") {
      var draft = state.schoolDraft;
      var school = DATA.schools.find(function (item) { return item.id === draft.schoolId; });
      var participatingIds = school.beastIds.filter(function (beastId) { return draft.participating[beastId]; });
      var limits = {};
      school.beastIds.forEach(function (beastId) { limits[beastId] = draft.ownedPoliciesByBeast[beastId].limits; });
      state.schoolResult = PLANNER.calculateSchoolPlans(DATA, school, draft.progressByBeast, {
        targetStage: draft.targetStage,
        participatingBeastIds: participatingIds,
        useOwnedInventory: draft.useOwnedInventory,
        ownedLimitsByBeast: limits,
        allowNewHighRanks: draft.allowNewHighRanks,
        allowNewModifications: draft.allowNewModifications,
        newRankMode: draft.newRankMode
      });
      renderSchoolCalculatorResult(state.schoolResult);
    }
  }

  function handleCalculatorInput(event) {
    var target = event.target;
    if (target.matches('[data-reference-cost-field], [data-reference-beast-price]')) {
      updateReferenceCost(target);
      return;
    }
    if (target.matches('[data-machine-search="calculator"]')) {
      if (event.isComposing || state.composingSearch.calculator) return;
      scheduleSearchInput("calculator", target.value);
      return;
    }
    if (target.matches("[data-calc-field]")) state.calcDraft[target.dataset.calcField] = CORE.integer(target.value);
    if (target.matches("[data-calc-inventory]")) {
      var oldSingle = CORE.integer((state.calcDraft.inventory[target.dataset.mod] || {})[target.dataset.rank]);
      updateInventory(state.calcDraft, target);
      var singleLimits = state.singleInventoryPolicy.limits[target.dataset.mod] || (state.singleInventoryPolicy.limits[target.dataset.mod] = {});
      if (CORE.integer(singleLimits[target.dataset.rank]) >= oldSingle) singleLimits[target.dataset.rank] = CORE.integer(target.value);
    }
    if (target.matches("[data-school-field]")) {
      state.schoolDraft.progressByBeast[target.dataset.beastId][target.dataset.schoolField] = CORE.integer(target.value);
    }
    if (target.matches("[data-school-inventory]")) {
      var schoolProgress = state.schoolDraft.progressByBeast[target.dataset.beastId];
      var oldSchool = CORE.integer((schoolProgress.inventory[target.dataset.mod] || {})[target.dataset.rank]);
      updateInventory(schoolProgress, target);
      var schoolPolicy = state.schoolDraft.ownedPoliciesByBeast[target.dataset.beastId];
      var schoolLimits = schoolPolicy.limits[target.dataset.mod] || (schoolPolicy.limits[target.dataset.mod] = {});
      if (CORE.integer(schoolLimits[target.dataset.rank]) >= oldSchool) schoolLimits[target.dataset.rank] = CORE.integer(target.value);
    }
    if (target.matches("[data-machine-owned-limit]")) {
      var policy = target.dataset.ownedScope === "single" ? state.singleInventoryPolicy : state.schoolDraft.ownedPoliciesByBeast[target.dataset.beastId];
      var policyLimits = policy.limits[target.dataset.mod] || (policy.limits[target.dataset.mod] = {});
      policyLimits[target.dataset.rank] = CORE.integer(target.value);
    }
  }

  function handleCalculatorChange(event) {
    var target = event.target;
    if (target.matches('[data-reference-cost-field], [data-reference-beast-price], [data-reference-blueprint-preset]')) {
      updateReferenceCost(target);
      return;
    }
    if (target.matches("[data-calc-beast]")) {
      resetCalculator(target.value);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (target.matches("[data-calc-target]")) {
      state.calcTargetLevel = CORE.integer(target.value);
    } else if (target.matches("[data-calc-flag]")) {
      state.calcDraft[target.dataset.calcFlag] = target.checked;
      renderCalculatorControls();
    } else if (target.matches("[data-owned-global]")) {
      if (target.dataset.ownedScope === "single") state.singleInventoryPolicy.useOwnedInventory = target.checked;
      else state.schoolDraft.useOwnedInventory = target.checked;
      renderCalculatorControls();
    } else if (target.matches("[data-machine-owned-enabled]")) {
      var policy = target.dataset.ownedScope === "single" ? state.singleInventoryPolicy : state.schoolDraft.ownedPoliciesByBeast[target.dataset.beastId];
      var progress = target.dataset.ownedScope === "single" ? state.calcDraft : state.schoolDraft.progressByBeast[target.dataset.beastId];
      var limits = policy.limits[target.dataset.mod] || (policy.limits[target.dataset.mod] = {});
      limits[target.dataset.rank] = target.checked ? CORE.integer((progress.inventory[target.dataset.mod] || {})[target.dataset.rank]) : 0;
      renderCalculatorControls();
    } else if (target.matches("[data-school-calc-school]")) {
      resetSchoolCalculator(target.value);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (target.matches("[data-school-target]")) {
      state.schoolDraft.targetStage = CORE.integer(target.value);
      renderCalculatorControls();
    } else if (target.matches("[data-school-option]")) {
      state.schoolDraft[target.dataset.schoolOption] = target.checked;
      renderCalculatorControls();
    } else if (target.matches("[data-new-rank-mode-scope]")) {
      if (target.dataset.newRankModeScope === "single") {
        state.singleNewRankMode = target.value;
      } else {
        state.schoolDraft.newRankMode = target.value;
        if (target.value === "zero") state.schoolDraft.allowNewHighRanks = false;
      }
      renderCalculatorControls();
    } else if (target.matches("[data-school-participant]")) {
      state.schoolDraft.participating[target.dataset.beastId] = target.checked;
      renderCalculatorControls();
    } else if (target.matches("[data-school-flag]")) {
      state.schoolDraft.progressByBeast[target.dataset.beastId][target.dataset.schoolFlag] = target.checked;
      renderCalculatorControls();
    } else if (target.matches("[data-school-field], [data-school-inventory], [data-calc-inventory]")) {
      renderCalculatorControls();
    }
  }

  function handleReferenceClick(event) {
    var button = event.target.closest("[data-machine-school-scope]");
    if (!button) return;
    if (button.dataset.machineSchoolScope === "reference-beasts") state.referenceBeastSchoolId = button.dataset.schoolId;
    if (button.dataset.machineSchoolScope === "reference-stages") state.referenceStageSchoolId = button.dataset.schoolId;
    renderReference();
  }

  function handleReferenceInput(event) {
    if (!event.target.matches('[data-machine-search="reference"]')) return;
    if (event.isComposing || state.composingSearch.reference) return;
    scheduleSearchInput("reference", event.target.value);
  }

  function validDependencies() {
    return DATA && CORE && PLANNER && PERFORMANCE && typeof PERFORMANCE.createRefreshQueue === "function" && Array.isArray(DATA.beasts) && typeof CORE.searchBeasts === "function" && typeof CORE.calculateInvestmentPlan === "function" &&
      typeof PLANNER.calculateSchoolPlans === "function" && typeof PLANNER.defaultTargetStage === "function" &&
      typeof CORE.normalizeReferenceCostSettings === "function" && typeof CORE.calculateReferenceCost === "function";
  }

  function init() {
    var partition = document.getElementById("partition-machine-beasts");
    if (!partition) return;
    el.modes = document.getElementById("machine-beast-modes");
    el.error = document.getElementById("machine-beast-error");
    el.progress = document.getElementById("machine-beast-progress");
    el.progressSearch = document.getElementById("machine-beast-progress-search");
    el.progressContent = document.getElementById("machine-beast-progress-content");
    el.calculator = document.getElementById("machine-beast-calculator");
    el.calculatorModes = document.getElementById("machine-calculator-modes");
    el.calculatorSearch = document.getElementById("machine-beast-calculator-search");
    el.calculatorResult = document.getElementById("machine-beast-calculator-result");
    el.calculatorControls = document.getElementById("machine-beast-calculator-controls");
    el.reference = document.getElementById("machine-beast-reference");
    el.referenceSearch = document.getElementById("machine-beast-reference-search");
    el.referenceContent = document.getElementById("machine-beast-reference-content");
    if (!validDependencies()) {
      showError("机关兽数据加载失败，请确认 data/machine-beasts.js、js/machine-beasts.js 与 js/machine-beast-school-planner.js 存在。");
      return;
    }
    loadProgress();
    resetCalculator(DATA.beasts[0].id);
    resetSchoolCalculator(DATA.schools[0].id);
    el.progressSearch.innerHTML = searchBar("progress", "搜索名称、品质、流派、研发效果或获取来源");
    el.calculatorSearch.innerHTML = searchBar("calculator", "搜索名称、品质、流派、研发效果或获取来源");
    el.referenceSearch.innerHTML = searchBar("reference", "搜索名称、品质、流派、研发效果或获取来源");
    ["progress", "calculator", "reference"].forEach(function (scope) {
      pendingSearches[scope] = state.searches[scope];
      searchRefresh[scope] = PERFORMANCE.createRefreshQueue(function () {
        applySearchInput(scope, pendingSearches[scope]);
      }, 120);
    });
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
    el.reference.addEventListener("click", handleReferenceClick);
    el.reference.addEventListener("input", handleReferenceInput);
    [el.progress, el.calculator, el.reference].forEach(function (container) {
      container.addEventListener("compositionstart", handleSearchCompositionStart);
      container.addEventListener("compositionend", handleSearchCompositionEnd);
    });
    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "machine-beasts")) {
        Object.keys(searchRefresh).forEach(function (scope) { searchRefresh[scope].cancel(); });
        return;
      }
      setMode(state.mode);
    }
    document.addEventListener("qinshi:partitionchange", activatePartition);
    if (!partition.hidden) activatePartition();
  }

  window.MACHINE_BEAST_UI = {
    init: init,
    captureView: captureView,
    restoreView: restoreView,
    applyNavigationQuery: applyNavigationQuery
  };
  document.addEventListener("DOMContentLoaded", init);
})();
