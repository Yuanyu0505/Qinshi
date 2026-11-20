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
    referenceCostInvalidInputs: {},
    referenceCostRequirements: {},
    progressSchoolId: "hegemonic",
    referenceBeastSchoolId: "hegemonic",
    referenceStageSchoolId: "hegemonic",
    searches: { progress: "", calculator: "", reference: "" },
    composingSearch: { progress: false, calculator: false, reference: false }
  };
  // Presentation only: never included in saved beasts/referenceCost records.
  var presentation = { disclosures: {}, progressQuality: "all", stockedOnly: false };
  // Result-bound decode/DOM cache is deliberately excluded from captureView().
  var equivalentPages = {};
  var restoringPresentation = false;
  var el = {};
  var rendered = { progress: false, calculator: false, reference: false };
  var searchRefresh = {};
  var pendingSearches = {};
  var calculationRunners = {};
  var calculationProgressContexts = {};
  var calculationSequence = 0;
  var calculating = false;
  var calculatingKind = null;
  var lastCostRenderKey = "";

  function setCalculating(busy) {
    calculating = busy;
    if (!el.calculatorResult) return;
    if (busy) el.calculatorResult.setAttribute("aria-busy", "true");
    else el.calculatorResult.removeAttribute("aria-busy");
    el.calculator.querySelectorAll('[data-machine-action="calculate"], [data-machine-action="calculate-school"]').forEach(function (button) {
      button.disabled = busy;
    });
    el.calculator.querySelectorAll('[data-machine-action="cancel-calculation"]').forEach(function (button) {
      button.hidden = !busy;
      button.disabled = !busy;
    });
    el.calculator.querySelectorAll('[data-machine-calculating-status]').forEach(function (status) {
      status.hidden = !busy;
      status.textContent = busy ? '正在后台计算…' : '';
    });
  }

  function cancelCalculation(invalidate) {
    calculationSequence += 1;
    if (invalidate) equivalentPages = {};
    else Object.keys(equivalentPages).forEach(function (key) {
      var page = equivalentPages[key];
      page.sequence = calculationSequence;
      page.busy = false;
      var button = page.container && page.container.querySelector('[data-machine-action="more-equivalents"]');
      if (button) {
        button.removeAttribute('aria-busy');
        button.setAttribute('aria-disabled', String(!page.hasMore));
      }
    });
    Object.keys(calculationRunners).forEach(function (key) { calculationRunners[key].cancel(); });
    if (calculating && el.calculatorResult) el.calculatorResult.hidden = true;
    setCalculating(false);
    if (invalidate) {
      state.calcResult = null;
      state.schoolResult = null;
      if (el.calculatorResult) el.calculatorResult.hidden = true;
    }
    updateResultLinks();
  }

  function runCalculation(kind, payload) {
    cancelCalculation(true);
    calculatingKind = kind;
    var sequence = calculationSequence;
    var account = ACCOUNT_STORAGE.currentAccount && ACCOUNT_STORAGE.currentAccount();
    var accountId = account && account.id;
    function fallback(input) {
      return kind === "beast-single" ? CORE.calculateInvestmentPlan(DATA, beastById(input.beastId), input.progress, input.options)
        : PLANNER.calculateSchoolPlans(DATA, input.schoolId, input.progressByBeast, input.options);
    }
    calculationProgressContexts[kind] = { sequence: sequence, accountId: accountId };
    if (!calculationRunners[kind] && window.QinshiCalculationRunner) {
      calculationRunners[kind] = window.QinshiCalculationRunner.create({ kind: kind, fallback: fallback, onProgress: function (progress) {
        var active = calculationProgressContexts[kind], current = ACCOUNT_STORAGE.currentAccount && ACCOUNT_STORAGE.currentAccount();
        if (!active || active.sequence !== calculationSequence || (current && current.id) !== active.accountId || !calculating || calculatingKind !== kind) return;
        var labels = { 'candidate-preparation': '正在准备候选…', 'school-combine': '正在组合流派方案…', 'equivalent-graph': '正在统计同等方案…' };
        if (!progress || !labels[progress.phase]) return;
        el.calculator.querySelectorAll('[data-machine-calculating-status]').forEach(function (status) { status.textContent = labels[progress.phase]; });
      } });
    }
    setCalculating(true);
    el.calculatorResult.hidden = true;
    el.calculatorResult.innerHTML = '';
    var task = calculationRunners[kind] ? calculationRunners[kind].run(payload) : Promise.reject(new Error('当前环境无法启动后台计算，已停止本次机关兽计算，请更新浏览器后重试。'));
    task.then(function (result) {
      var current = ACCOUNT_STORAGE.currentAccount && ACCOUNT_STORAGE.currentAccount();
      if (sequence !== calculationSequence || (current && current.id) !== accountId) return;
      setCalculating(false);
      if (kind === "beast-single") { state.calcResult = result; renderCalculatorResult(result); }
      else { state.schoolResult = result; renderSchoolCalculatorResult(result); }
    }).catch(function (error) {
      if (sequence !== calculationSequence || error.name === "AbortError") return;
      setCalculating(false);
      el.calculatorResult.hidden = true;
      showError(error.message || "计算失败，请调整输入后重试。", error);
    });
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatNumber(value) {
    return window.QinshiNumberFormat ? window.QinshiNumberFormat.format(value || 0) : String(value || 0);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function rememberDisclosures(container) {
    if (!container || restoringPresentation) return;
    container.querySelectorAll('details[data-detail-key]').forEach(function (node) {
      presentation.disclosures[node.dataset.detailKey] = node.open;
    });
  }

  function controlIdentity(node) {
    var details = node.closest('details[data-detail-key]');
    return JSON.stringify([node.tagName, node.id, node.getAttribute("type"), node.type === 'radio' ? [node.name, node.value] : null, details && details.dataset.detailKey, Object.keys(node.dataset).sort().map(function (key) { return [key, node.dataset[key]]; })]);
  }

  function rememberPresentation(container) {
    if (restoringPresentation) return null;
    rememberDisclosures(container);
    var active = document.activeElement;
    if (!active || !container.contains(active)) return null;
    var focused = { identity: controlIdentity(active), top: active.getBoundingClientRect().top };
    try { focused.start = active.selectionStart; focused.end = active.selectionEnd; } catch (_) { /* Number inputs have no selection API. */ }
    return focused;
  }

  function restorePresentation(container, focused) {
    container.querySelectorAll('details[data-detail-key]').forEach(function (node) {
      if (Object.prototype.hasOwnProperty.call(presentation.disclosures, node.dataset.detailKey)) node.open = presentation.disclosures[node.dataset.detailKey];
    });
    if (!focused) return;
    var replacement = Array.from(container.querySelectorAll('input,select,textarea,button,a,summary')).find(function (node) { return controlIdentity(node) === focused.identity; });
    if (!replacement || replacement.disabled || !replacement.getClientRects().length) return;
    replacement.focus({ preventScroll: true });
    try { if (focused.start != null) replacement.setSelectionRange(focused.start, focused.end); } catch (_) { /* Native control does not support text selection. */ }
    var delta = replacement.getBoundingClientRect().top - focused.top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
  }

  function disclosure(key, title, body, className) {
    return '<details class="machine-disclosure ' + (className || '') + '" data-detail-key="' + escapeHtml(key) + '"><summary>' + title + '</summary><div class="machine-disclosure-body">' + body + '</div></details>';
  }

  function jumpTo(id) {
    var target = document.getElementById(id);
    if (!target) return;
    for (var node = target; node && node !== el.partition; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  function resultNavigation() {
    return '<nav class="machine-result-navigation" aria-label="计算结果操作"><a href="#machine-beast-calculator-controls" data-machine-jump>返回设置／调整后重算</a></nav>';
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

  var planTierOrder = ["蓝色", "紫色", "橙一", "橙二", "橙三", "橙四", "橙五"];

  function comparePlanForms(left, right) {
    return Number(right.rank) - Number(left.rank) ||
      DATA.modifications.findIndex(function (mod) { return mod.id === right.modificationId; }) -
      DATA.modifications.findIndex(function (mod) { return mod.id === left.modificationId; });
  }

  function planBeastOrder(rows, details) {
    var bestByBeast = new Map();
    (details || rows).forEach(function (row) {
      (row.items || []).forEach(function (form) {
        var best = bestByBeast.get(row.beastId);
        if (!best || comparePlanForms(form, best) < 0) bestByBeast.set(row.beastId, form);
      });
    });
    return rows.slice().sort(function (left, right) {
      var leftModel = beastById(left.beastId), rightModel = beastById(right.beastId);
      var quality = planTierOrder.indexOf(rightModel && rightModel.tier) - planTierOrder.indexOf(leftModel && leftModel.tier);
      var empty = { rank: -1 };
      return quality || comparePlanForms(bestByBeast.get(left.beastId) || empty, bestByBeast.get(right.beastId) || empty);
    });
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
    return '<label class="machine-search-bar"><span>' + (scope === 'reference' ? '搜索机关兽归属与效果' : '搜索机关兽') + '</span><input type="search" autocomplete="off" data-machine-search="' + scope + '" value="' +
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
    state.referenceCostInvalidInputs = {};
    // UI compatibility only: historical nulls keep their stored/API meaning.
    // Loading an account must never migrate its saved settings.
    restoreBlankReferenceDefaults();
    state.referenceCostDirty = false;
  }

  function saveProgress(beasts, referenceCost) {
    try {
      var serialized = JSON.stringify({ beasts: beasts || state.beasts, referenceCost: referenceCost || state.referenceCost });
      if ((!ACCOUNT_STORAGE.isReadOnly || !ACCOUNT_STORAGE.isReadOnly()) && ACCOUNT_STORAGE.getItem(STORE_KEY) === serialized) return true;
      var saved = ACCOUNT_STORAGE.setItem(STORE_KEY, serialized);
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
    if (Object.keys(state.referenceCostInvalidInputs).length) return "参考单价必须为非负有限数，请修正无效输入。";
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

  function referencePriceSummary() {
    var draft = state.referenceCostDraft, error = referenceCostInputError();
    return error || '神图 ' + draft.awakeningBlueprintPrice + ' 元宝／张 · 已有 ' + draft.awakeningBlueprintStock + ' 张' + (draft.useAwakeningBlueprintStock ? '（计入抵扣）' : '（不抵扣）');
  }

  function referenceCostControls() {
    var draft = state.referenceCostDraft;
    var rules = DATA.referenceCostRules || {};
    var presets = rules.blueprintPrices || [{ label: "奇遇", price: 64 }, { label: "元宝商城", price: 70 }, { label: "商城", price: 134 }];
    var selected = presets.some(function (preset) { return Number(draft.awakeningBlueprintPrice) === preset.price && draft.awakeningBlueprintPrice !== "" && draft.awakeningBlueprintPrice !== null; });
    return '<details id="machine-price-settings" class="panel machine-reference-cost-settings machine-disclosure" data-detail-key="reference-cost:settings"><summary><span>参考成本设置（当前账号共用）</span><small data-reference-price-summary>' + escapeHtml(referencePriceSummary()) + '</small></summary><div class="machine-disclosure-body">' +
      '<div class="machine-reference-cost-grid"><label><span>已有觉醒神图</span><input type="number" min="0" step="1" inputmode="numeric" data-reference-cost-field="awakeningBlueprintStock" value="' + escapeHtml(draft.awakeningBlueprintStock) + '"></label>' +
      '<label class="machine-reference-cost-check"><input type="checkbox" data-reference-cost-field="useAwakeningBlueprintStock"' + (draft.useAwakeningBlueprintStock ? ' checked' : '') + '>使用已有神图库存</label>' +
      '<label><span>神图价格来源</span><select data-reference-blueprint-preset>' + presets.map(function (preset) {
        return '<option value="' + preset.price + '"' + (selected && Number(draft.awakeningBlueprintPrice) === preset.price ? ' selected' : '') + '>' + escapeHtml(preset.label) + ' · ' + preset.price + '元宝</option>';
      }).join("") + '<option value="custom"' + (!selected ? ' selected' : '') + '>自定义</option></select></label>' +
      '<label><span>神图单价（元宝／张，可自定义）</span><input type="number" min="0" step="any" inputmode="decimal" data-reference-cost-field="awakeningBlueprintPrice" value="' + escapeHtml(draft.awakeningBlueprintPrice) + '"></label></div>' +
      '<details class="machine-reference-beast-prices" data-detail-key="reference-cost:beast-prices"><summary>非贡献兑换机关兽每只参考价（橙五默认' + formatNumber(45000) + '；蓝紫价格仅用于单兽估算）</summary><div class="machine-reference-cost-grid">' + DATA.beasts.filter(function (beast) { return beast.contributionPerFragment == null; }).map(function (beast) {
        return '<label><span>' + escapeHtml(beast.name) + '（' + escapeHtml(beast.tier) + '）</span><input type="number" min="0" step="any" inputmode="decimal" placeholder="未设置，不计为免费" data-reference-beast-price="' + beast.id + '" value="' + escapeHtml(draft.beastPrices[beast.id]) + '"></label>';
      }).join("") + '</div></details><p class="muted-tip">只估算觉醒神图与缺少的机关兽；不含机关破片、改造及突破等其他材料。贡献÷2.7折算元宝并向上取整；缺少碎片按折算只数计价，不额外凑整只，也不代表实际购买包装。各备选方案独立抵扣一次同一神图库存，不消耗真实库存。' + (state.calculatorMode === "school" ? '当前价格与神图库存参与流派优化；修改后需重新计算。流派方案不计蓝紫本体获取成本，未知价格不代表免费。' : '单兽参考价格不参与最优解与排序。') + '</p>' +
      '<p class="machine-reference-cost-save-status" data-reference-cost-save-status role="status">' + escapeHtml(referenceCostInputError() || (ACCOUNT_STORAGE.isReadOnly && ACCOUNT_STORAGE.isReadOnly() ? '当前账号只读；可调整参考成本临时计算，不写入个人设置。' : state.referenceCostDirty ? '当前参考成本修改未保存。' : '参考成本设置按当前账号保存。')) + '</p>' +
      '<button type="button" class="seg" data-machine-action="save-reference-cost">保存／重试保存参考成本设置</button></div></details>';
  }

  function referenceCostPanel(requirements, school) {
    var error = referenceCostInputError();
    if (error) return '<h3>参考成本</h3><p class="machine-reference-cost-error" role="alert">' + escapeHtml(error) + ' 已隐藏旧总价，请修正设置。</p>';
    var cost = school ? CORE.calculateSchoolReferenceCost(DATA, requirements, state.referenceCostDraft) : CORE.calculateReferenceCost(DATA, requirements, state.referenceCostDraft);
    var blueprints = cost.blueprints;
    var beastYuan = cost.beasts.reduce(function (total, beast) { return total + (beast.yuan === null ? 0 : beast.yuan); }, 0);
    return '<h3>' + (school ? '已计价参考元宝明细' : '参考成本（元宝）') + '</h3><div class="machine-reference-cost-breakdown" tabindex="0" role="region" aria-label="参考成本明细，可横向滚动"><span>神图需求 <b>' + formatNumber(blueprints.required) + '</b></span>' +
      '<span>使用已有 <b data-reference-blueprint-stock>' + formatNumber(blueprints.usedStock) + '</b></span><span>神图缺口 <b data-reference-blueprint-missing>' + formatNumber(blueprints.missing) + '</b></span>' +
      '<span>神图费用 <b>' + formatNumber(blueprints.yuan) + '</b>（单价 ' + formatNumber(blueprints.unitPrice) + '）</span><span>机关兽已知费用 <b>' + formatNumber(beastYuan) + '</b></span></div>' +
      (cost.beasts.length ? '<ul class="machine-reference-cost-beasts">' + cost.beasts.map(function (beast) {
        var model = beastById(beast.beastId);
        if (school && model && (model.quality === 'blue' || model.quality === 'purple')) return '<li>' + escapeHtml(beast.beastName) + '：缺少碎片 ' + formatNumber(beast.fragments) + '，蓝紫本体获取成本未计入（未知，不代表免费）。</li>';
        return '<li>' + escapeHtml(beast.beastName) + '：缺少碎片 ' + formatNumber(beast.fragments) + '，折算 ' + formatNumber(beast.bodyEquivalent) + '只' +
          (beast.contribution === null ? '，每只参考价 ' + (beast.unitPrice === null ? '未设置' : formatNumber(beast.unitPrice)) : '，贡献 ' + formatNumber(beast.contribution) + '÷2.7') +
          '，费用 ' + (beast.yuan === null ? '未设置，暂不可计入总价' : formatNumber(beast.yuan)) + '</li>';
      }).join("") + '</ul>' : '') +
      (cost.complete ? '<p class="machine-reference-cost-total">' + (school ? '已计价参考元宝' : '参考总价') + ' <b data-reference-cost-total>' + formatNumber(cost.totalYuan) + '</b> 元宝</p>' :
        '<p class="machine-reference-cost-error">成本不完整，已知小计 <b>' + formatNumber(cost.knownYuan) + '</b> 元宝；未设置单价：' + cost.missingPrices.map(function (beast) { return escapeHtml(beast.beastName); }).join('、') + '。缺价不等于免费，不显示完整总价。</p>') +
      '<p class="muted-tip">' + (school ? '已计价金额用于方案比较，不是完整实际总成本。未计价：蓝紫本体获取成本、机关破片获取成本、高阶制作及改造制作成本；不扣减真实库存。' : '仅含神图和新增机关兽的碎片缺口，按折算只数估价；不改变推荐方案，不扣减真实库存。') + '</p>';
  }

  function costSlot(key, requirements) {
    state.referenceCostRequirements[key] = requirements;
    return '<section class="machine-reference-cost-panel" data-reference-cost-panel="' + key + '">' + referenceCostPanel(requirements, key.indexOf('school-') === 0) + '</section>';
  }

  function refreshReferenceCosts() {
    var renderKey = JSON.stringify([state.referenceCostDraft, state.referenceCostDirty, state.referenceCostRequirements, referenceCostInputError()]);
    if (renderKey === lastCostRenderKey) return;
    lastCostRenderKey = renderKey;
    el.calculatorResult.querySelectorAll('[data-reference-cost-panel]').forEach(function (panel) {
      var requirements = state.referenceCostRequirements[panel.dataset.referenceCostPanel];
      if (requirements) panel.innerHTML = referenceCostPanel(requirements, panel.dataset.referenceCostPanel.indexOf('school-') === 0);
    });
    var status = el.calculatorControls.querySelector('[data-reference-cost-save-status]');
    if (status) status.textContent = referenceCostInputError() || (ACCOUNT_STORAGE.isReadOnly && ACCOUNT_STORAGE.isReadOnly() ? '当前账号只读；当前参考成本仅用于临时计算，不写入个人设置。' : state.referenceCostDirty ? '当前参考成本修改未保存，请修正输入或重试保存。' : '参考成本设置已按当前账号保存。');
    var summary = el.calculatorControls.querySelector('[data-reference-price-summary]');
    if (summary) summary.textContent = referencePriceSummary();
    if (state.calculatorMode === 'single' && state.referenceCostRequirements.single) {
      var singleCost = referenceCostInputError() ? null : CORE.calculateReferenceCost(DATA, state.referenceCostRequirements.single, state.referenceCostDraft);
      var blueprintSummary = el.calculatorResult.querySelector('[data-single-priority-blueprints]');
      var yuanSummary = el.calculatorResult.querySelector('[data-single-priority-yuan]');
      if (blueprintSummary) blueprintSummary.textContent = singleCost ? formatNumber(singleCost.blueprints.missing) : '请修正参考设置';
      if (yuanSummary) yuanSummary.textContent = singleCost && singleCost.complete ? formatNumber(singleCost.totalYuan) : '费用未完整计价';
    }
  }

  function restoreBlankReferenceDefaults(target) {
    var defaults = CORE.normalizeReferenceCostSettings(DATA, {});
    var draft = state.referenceCostDraft;
    function restore(key, value, input) {
      if (value !== null && value !== undefined && String(value).trim() !== '') return;
      if (state.referenceCostInvalidInputs[key]) return;
      var fallback = key === 'awakeningBlueprintPrice' ? defaults.awakeningBlueprintPrice : defaults.beastPrices[key];
      if (key === 'awakeningBlueprintPrice') draft.awakeningBlueprintPrice = fallback;
      else draft.beastPrices[key] = fallback;
      if (input) input.value = fallback == null ? '' : fallback;
    }
    if (!target || target.matches('[data-reference-cost-field="awakeningBlueprintPrice"]')) {
      restore('awakeningBlueprintPrice', draft.awakeningBlueprintPrice, el.calculatorControls && el.calculatorControls.querySelector('[data-reference-cost-field="awakeningBlueprintPrice"]'));
    }
    DATA.beasts.forEach(function (beast) {
      if (beast.contributionPerFragment != null) return;
      if (!target || target.dataset.referenceBeastPrice === beast.id) restore(beast.id, draft.beastPrices[beast.id], el.calculatorControls && el.calculatorControls.querySelector('[data-reference-beast-price="' + beast.id + '"]'));
    });
  }

  function updateReferenceCost(target, commit, all) {
    var draft = state.referenceCostDraft;
    var inputKey = target.dataset.referenceBeastPrice || target.dataset.referenceCostField;
    if (inputKey) {
      if (target.validity && target.validity.badInput) state.referenceCostInvalidInputs[inputKey] = true;
      else delete state.referenceCostInvalidInputs[inputKey];
    }
    if (target.matches('[data-reference-beast-price]')) draft.beastPrices[target.dataset.referenceBeastPrice] = target.value;
    else if (target.matches('[data-reference-cost-field]')) draft[target.dataset.referenceCostField] = target.type === 'checkbox' ? target.checked : target.value;
    else if (target.matches('[data-reference-blueprint-preset]')) {
      if (target.value === 'custom') return;
      draft.awakeningBlueprintPrice = target.value;
      delete state.referenceCostInvalidInputs.awakeningBlueprintPrice;
      el.calculatorControls.querySelector('[data-reference-cost-field="awakeningBlueprintPrice"]').value = target.value;
    } else return;
    if (commit) restoreBlankReferenceDefaults(all ? null : target);
    // Price and shared stock now affect school search, not merely presentation.
    // Keep single-beast plans valid: their optimization objective is unchanged.
    if (calculating && calculatingKind === 'beast-school') cancelCalculation(false);
    state.schoolResult = null;
    if (state.calculatorMode === 'school') {
      el.calculatorResult.hidden = true;
      state.referenceCostRequirements = {};
    }
    updateResultLinks();
    if (all || target.matches('[data-reference-cost-field="awakeningBlueprintPrice"]')) {
      var preset = el.calculatorControls.querySelector('[data-reference-blueprint-preset]');
      var option = Array.from(preset.options).find(function (item) { return item.value !== 'custom' && draft.awakeningBlueprintPrice !== '' && draft.awakeningBlueprintPrice !== null && Number(item.value) === Number(draft.awakeningBlueprintPrice); });
      preset.value = option ? option.value : 'custom';
    }
    state.referenceCostDirty = true;
    var blankDraft = draft.awakeningBlueprintPrice === '' || DATA.beasts.some(function (beast) { return draft.beastPrices[beast.id] === ''; });
    // Empty text is an editing draft, not a request to persist a missing price.
    // Explicit commit may retain null only for beasts with no defined default.
    if (!blankDraft && !referenceCostInputError() && (!ACCOUNT_STORAGE.isReadOnly || !ACCOUNT_STORAGE.isReadOnly())) {
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
      '<label><span>当前研发等级</span><strong data-edit-current-level>' + currentLevel + '级</strong></label>' +
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
    var stockCount = Object.keys(progress.inventory).reduce(function (total, mod) { return total + Object.keys(progress.inventory[mod]).reduce(function (sum, rank) { return sum + progress.inventory[mod][rank]; }, 0); }, 0);
    return '<article class="machine-beast-card ' + qualityClass(beast) + (matched ? ' machine-search-match' : '') + '" data-progress-card="' + beast.id + '">' +
      '<div class="machine-beast-head"><div><span class="machine-quality-badge">' + escapeHtml(beast.tier) + '</span><strong>' + escapeHtml(beast.name) + '</strong></div>' +
      (editing ? "" : '<button type="button" class="seg" data-machine-action="edit-progress" data-beast-id="' + beast.id + '">编辑</button>') + '</div>' +
      (editing ? '' : '<div class="machine-card-primary"><b>' + level + '/' + beast.maxLevel + '级</b><span>完整库存 ' + formatNumber(stockCount) + '只</span><span>碎片 ' + formatNumber(progress.fragments) + '</span></div>') +
      (editing ? beastEditor(beast, state.editDraft) :
        '<div class="machine-beast-summary"><div><span>累计研发度</span><b>' + formatNumber(progress.research) + '</b></div>' +
        '<div class="machine-active-effect"><span>当前最高生效效果</span><b>' + (active ? active.level + "级 · " + escapeHtml(active.text) : "尚未激活档位效果") + '</b></div></div>') +
      disclosure('progress:' + beast.id + ':source-stock', '来源与完整库存明细', '<p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p><p class="machine-inventory-summary">' + escapeHtml(inventorySummary(beast, progress)) + '</p>') +
      "</article>";
  }

  function renderProgress() {
    var focused = rememberPresentation(el.progressContent);
    var progressMap = {};
    DATA.beasts.forEach(function (beast) { progressMap[beast.id] = getProgress(beast); });
    var school = schoolById(state.progressSchoolId);
    var snapshot = CORE.schoolSnapshot(school, progressMap, DATA);
    var stageCopy = snapshot.currentStage ? snapshot.currentStage + "阶已达成" : "尚未达成1阶";
    var progressCopy = snapshot.progressStage + "阶进度：" + snapshot.progressCurrent + "/" + snapshot.progressTarget +
      (snapshot.progressRemaining ? "，还差" + snapshot.progressRemaining : "");
    var query = state.searches.progress;
    var visibleIds = school.beastIds.filter(function (id) {
      var beast = beastById(id), progress = getProgress(beast);
      var hasStock = progress.fragments > 0 || Object.keys(progress.inventory).some(function (mod) { return Object.keys(progress.inventory[mod]).some(function (rank) { return progress.inventory[mod][rank] > 0; }); });
      return (!query || isSearchMatch(beast, 'progress')) && (presentation.progressQuality === 'all' || beast.quality === presentation.progressQuality) && (!presentation.stockedOnly || hasStock);
    });
    var cards = visibleIds.length
      ? visibleIds.map(function (id) { return beastCard(beastById(id), Boolean(query)); }).join("")
      : '<p class="machine-search-empty">当前流派没有符合条件的机关兽</p>';
    el.progressContent.innerHTML = '<div class="machine-progress-toolbar">' + schoolSwitcher("progress", school.id) + '<label>品质<select data-progress-quality><option value="all">全部品质</option>' + [['blue','蓝色'],['purple','紫色'],['orange','橙色']].map(function (pair) { return '<option value="' + pair[0] + '"' + (presentation.progressQuality === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>'; }).join('') + '</select></label><label class="machine-check"><input type="checkbox" data-progress-stocked' + (presentation.stockedOnly ? ' checked' : '') + '>只看有库存或碎片</label><span class="muted-tip">显示 ' + visibleIds.length + '／' + school.beastIds.length + '只</span></div>' +
      '<section class="machine-school panel">' +
      '<div class="machine-school-head"><div><h2>' + escapeHtml(school.name) + '</h2><span>当前流派累计觉醒等级</span><strong>' + snapshot.totalLevel + '</strong></div>' +
      '<div class="machine-stage-one"><b>' + stageCopy + '</b><span>' + progressCopy + '</span><small>各阶累计觉醒等级要求：45／90／135／180／225</small></div></div>' +
      '<div class="machine-effect-grid">' + effectBlock("当前生效", snapshot.currentEffects, "尚未达成1阶") + effectBlock("下一阶预览", snapshot.nextStage, "已达到当前最高阶") + '</div>' +
      '<div class="machine-beast-list">' + cards + '</div></section>';
    rendered.progress = true;
    restorePresentation(el.progressContent, focused);
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
    return entries.sort(comparePlanForms);
  }

  function inventoryLimit(entry, policy, enabled) {
    if (!enabled) return 0;
    var limits = policy.limits[entry.modificationId];
    return limits && Object.prototype.hasOwnProperty.call(limits, entry.rank)
      ? Math.min(entry.count, CORE.integer(limits[entry.rank])) : entry.count;
  }

  function calculatorInventorySelector(beast, progress, policy, scope, showGlobal) {
    var entries = inventoryEntries(beast, progress);
    var global = showGlobal ? '<label class="machine-owned-global"><input type="checkbox" data-owned-global data-owned-scope="' + scope + '"' + (policy.useOwnedInventory ? ' checked' : '') + '>使用已有库存</label>' : '';
    var rows = entries.map(function (entry) {
      var limit = inventoryLimit(entry, policy, true);
      var enabled = limit > 0;
      return '<div class="machine-owned-inventory-row" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '">' +
        '<label class="machine-owned-toggle"><input type="checkbox" data-machine-owned-enabled data-owned-scope="' + scope + '" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '"' + (enabled ? ' checked' : '') + (policy.useOwnedInventory ? '' : ' disabled') + '>使用<span class="machine-owned-form">' + escapeHtml(combinedRankLabel(entry.modificationName, entry.rank)) + '</span></label>' +
        '<span class="machine-owned-stock">已有×' + formatNumber(entry.count) + '</span>' +
        '<label class="machine-owned-quantity"><span>最多使用</span><input type="number" min="0" max="' + entry.count + '" step="1" value="' + limit + '" data-machine-owned-limit data-owned-scope="' + scope + '" data-beast-id="' + entry.beastId + '" data-mod="' + entry.modificationId + '" data-rank="' + entry.rank + '"' + (enabled && policy.useOwnedInventory ? '' : ' disabled') + '></label></div>';
    }).join("");
    return '<section class="machine-owned-inventory"><div class="machine-owned-head"><strong>本次使用库存</strong>' + global + '</div>' +
      (rows ? '<div class="machine-owned-inventory-grid">' + rows + '</div>' : '<p class="muted-tip">暂无可用库存</p>') + '</section>';
  }

  function newRankModeSelector(scope, selected) {
    var name = "machine-" + scope + "-new-rank-mode";
    return '<div class="machine-new-rank-mode"><span>本体与库存加工</span>' +
      '<label><input type="radio" name="' + name + '" value="zero" data-new-rank-mode-scope="' + scope + '"' + (selected === "zero" ? " checked" : "") + '>仅0阶</label>' +
      '<label><input type="radio" name="' + name + '" value="zeroToSeven" data-new-rank-mode-scope="' + scope + '"' + (selected !== "zero" ? " checked" : "") + '>0–7阶</label><small>' +
      (selected === "zero" ? '仅新增0阶；不额外投入升阶材料。库存可直投、降阶或拆解；返料升阶待核实。' : '可新增0–7阶，库存可在0–7阶自由升降。') + '</small></div>';
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
      html += '<option value="' + level + '"' + (level === selected ? " selected" : "") + '>' + level + '级</option>';
    }
    return html;
  }

  function calcTargetPicker(beast, selected, currentLevel) {
    var first = Math.max(1, currentLevel);
    // size=1 would switch back to an operating-system popup rather than a list.
    var rows = Math.max(2, Math.min(10, beast.maxLevel - first + 1));
    return '<div class="machine-target-field"><span id="machine-calc-target-label">目标研发等级</span><details class="machine-target-picker" data-calc-target-picker>' +
      '<summary aria-labelledby="machine-calc-target-label machine-calc-target-value"><span id="machine-calc-target-value" data-calc-target-value>' + selected + '级</span></summary>' +
      '<select data-calc-target size="' + rows + '" aria-labelledby="machine-calc-target-label">' + calcTargetOptions(beast, selected, currentLevel) + '</select></details></div>';
  }

  function closeTargetPicker(focusSummary) {
    var picker = el.calculatorControls.querySelector('[data-calc-target-picker][open]');
    if (!picker) return;
    picker.open = false;
    if (focusSummary) picker.querySelector('summary').focus({ preventScroll: true });
  }

  function renderSingleCalculatorControls() {
    if (!state.calcDraft) resetCalculator();
    var beast = beastById(state.calcBeastId);
    var currentLevel = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beast.maxLevel);
    el.calculatorControls.innerHTML = '<section class="panel machine-calculator-panel' + (isSearchMatch(beast, "calculator") ? ' machine-search-match' : '') + '"><h2>单只机关兽培养目标</h2><div class="machine-calculator-top">' +
      '<label><span>选择机关兽</span><select data-calc-beast>' + DATA.schools.map(function (school) {
        return '<optgroup label="' + escapeHtml(school.name) + '">' + school.beastIds.map(function (id) {
          var item = beastById(id);
          return '<option value="' + item.id + '"' + (item.id === beast.id ? " selected" : "") + '>' + escapeHtml(item.name) + '（' + item.tier + '）</option>';
        }).join("") + '</optgroup>';
      }).join("") + '</select></label>' +
      '<label><span>当前累计研发度</span><input type="number" min="0" step="1" inputmode="numeric" value="' + state.calcDraft.research + '" data-calc-field="research"></label>' +
      '<label class="machine-current-level-field"><span>当前研发等级</span><strong data-calc-current-level>' + currentLevel + '级</strong></label>' +
      calcTargetPicker(beast, state.calcTargetLevel, currentLevel) +
      '</div><p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p></section>' +
      '<section class="panel machine-calculator-panel"><h2>材料与库存范围</h2><label class="machine-fragment-field"><span>当前机关兽碎片</span><input type="number" min="0" step="1" inputmode="numeric" value="' + state.calcDraft.fragments + '" data-calc-field="fragments"></label>' +
      '<details class="machine-temporary-inventory" data-detail-key="inventory:single:' + beast.id + '"><summary>临时调整当前库存</summary>' + inventoryEditor(beast, state.calcDraft, "calculator") + '</details>' +
      calculatorInventorySelector(beast, state.calcDraft, state.singleInventoryPolicy, "single", true) + newRankModeSelector("single", state.singleNewRankMode) + '</section><div data-machine-cost-slot></div>' +
      '<div class="machine-calculator-actions machine-calc-actionbar"><button type="button" class="seg" data-machine-action="reload-calculator">从个人进度重新读取</button><button type="button" class="seg active" data-machine-action="calculate">计算方案</button><button type="button" class="seg" data-machine-action="cancel-calculation" hidden disabled>取消计算</button><a href="#machine-beast-calculator-result" data-machine-jump data-machine-result-link hidden>查看计算结果</a><span role="status" data-machine-calculating-status hidden></span></div>';
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
    var fields = '<div class="machine-school-beast-fields"><label><span>当前累计研发度</span><input type="number" min="0" step="1" value="' + progress.research + '" data-school-field="research" data-beast-id="' + beast.id + '"></label>' +
      '<label><span>当前等级</span><b data-school-level>' + level + '/' + beast.maxLevel + '级</b></label>' +
      '<label><span>机关兽碎片</span><input type="number" min="0" step="1" value="' + progress.fragments + '" data-school-field="fragments" data-beast-id="' + beast.id + '"></label></div>' +
      '<details class="machine-temporary-inventory" data-detail-key="inventory:school:' + beast.id + '"><summary>临时库存与本次使用</summary><p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p>' + inventoryEditor(beast, progress, "school") + calculatorInventorySelector(beast, progress, policy, "school", false) + '</details>';
    return '<article class="machine-school-beast-control ' + (participating ? '' : 'is-excluded') + (matched ? ' machine-search-match' : '') + '" data-school-card="' + beast.id + '"><header><div><span class="machine-quality-badge ' + qualityClass(beast) + '">' + escapeHtml(beast.tier) + '</span><strong>' + escapeHtml(beast.name) + '</strong></div><label><input type="checkbox" data-school-participant data-beast-id="' + beast.id + '"' + (participating ? ' checked' : '') + '>参与后续培养</label></header>' +
      (participating ? fields : '<p class="machine-excluded-summary">当前 <span data-school-level>' + level + '/' + beast.maxLevel + '级</span> · 本次不继续培养，原等级仍计入累计</p>' + disclosure('school:' + beast.id + ':excluded', '查看或调整当前进度与库存', fields)) + '</article>';
  }

  function refreshSchoolOverview() {
    var draft = state.schoolDraft, school = schoolById(draft.schoolId);
    var total = CORE.schoolSnapshot(school, draft.progressByBeast, DATA).totalLevel;
    var current = el.calculatorControls.querySelector('[data-school-current]');
    var remaining = el.calculatorControls.querySelector('[data-school-remaining]');
    var count = el.calculatorControls.querySelector('[data-school-participant-count]');
    if (current) current.textContent = total;
    if (remaining) remaining.textContent = Math.max(0, school.stages[draft.targetStage - 1].requiredTotalLevel - total) + '级';
    if (count) count.textContent = school.beastIds.filter(function (id) { return draft.participating[id]; }).length;
  }

  function refreshSchoolCard(beastId) {
    var old = Array.from(el.calculatorControls.querySelectorAll('[data-school-card]')).find(function (node) { return node.dataset.schoolCard === beastId; });
    if (!old) return;
    var focused = rememberPresentation(old), template = document.createElement('template');
    template.innerHTML = renderSchoolBeastControl(beastById(beastId), state.schoolDraft, isSearchMatch(beastById(beastId), 'calculator'));
    var replacement = template.content.firstElementChild;
    old.replaceWith(replacement);
    restorePresentation(replacement, focused);
    refreshSchoolOverview();
  }

  function refreshInventoryUsage(scope, beastId) {
    var container = scope === 'school' ? Array.from(el.calculatorControls.querySelectorAll('[data-school-card]')).find(function (node) { return node.dataset.schoolCard === beastId; }) : el.calculatorControls;
    if (!container) return;
    var old = container.querySelector('.machine-owned-inventory');
    if (!old) return;
    var beast = beastById(scope === 'school' ? beastId : state.calcBeastId);
    var progress = scope === 'school' ? state.schoolDraft.progressByBeast[beastId] : state.calcDraft;
    var policy = scope === 'school' ? Object.assign({}, state.schoolDraft.ownedPoliciesByBeast[beastId], { useOwnedInventory: state.schoolDraft.useOwnedInventory }) : state.singleInventoryPolicy;
    var focused = rememberPresentation(old), template = document.createElement('template');
    template.innerHTML = calculatorInventorySelector(beast, progress, policy, scope, scope === 'single');
    var replacement = template.content.firstElementChild;
    old.replaceWith(replacement);
    restorePresentation(replacement, focused);
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
    el.calculatorControls.innerHTML = '<section class="panel machine-school-calculator"><h2>目标与等级差额</h2><div class="machine-school-calculator-grid">' +
      '<label><span>机关术流派</span><select data-school-calc-school>' + DATA.schools.map(function (item) { return '<option value="' + item.id + '"' + (item.id === school.id ? ' selected' : '') + '>' + escapeHtml(item.name) + '</option>'; }).join("") + '</select></label>' +
      '<label><span>目标流派阶数</span><select data-school-target>' + schoolStageOptions(school, draft.targetStage) + '</select></label>' +
      '<div><span>当前累计觉醒等级</span><b data-school-current>' + snapshot.totalLevel + '</b></div><div><span>距离目标</span><b data-school-remaining>' + Math.max(0, targetTotal - snapshot.totalLevel) + '级</b></div></div>' +
      '</section><section class="panel machine-school-strategy"><h2>策略与价格</h2>' +
      '<div class="machine-school-options"><label><input type="checkbox" data-school-option="useOwnedInventory"' + (draft.useOwnedInventory ? ' checked' : '') + '>使用已有库存</label>' +
      '<label><input type="checkbox" data-reference-cost-field="bluePurpleInventoryOnly"' + (state.referenceCostDraft.bluePurpleInventoryOnly !== false ? ' checked' : '') + '>蓝紫本体仅使用库存</label>' +
      '<label><input type="checkbox" data-school-option="allowNewHighRanks"' + (draft.allowNewHighRanks ? ' checked' : '') + '>' + (draft.newRankMode === "zero" ? '允许库存重组8–10阶' : '允许加工及新增8–10阶') + '</label>' +
      '<label><input type="checkbox" data-school-option="allowNewModifications"' + (draft.allowNewModifications ? ' checked' : '') + '>允许额外改造神核（未计价）</label></div>' +
      newRankModeSelector("school", draft.newRankMode) +
      disclosure('school:rules', '查看库存限制、比较规则与完整说明', '<p class="muted-tip">蓝紫限制开启后，只允许使用已保存的完整蓝紫库存及指定阶数使用上限，不会通过碎片补出新本体；关闭使用已有库存时，蓝紫不能新增投入。蓝紫本体获取成本未计入，神图等其他消耗正常计价。</p><p class="muted-tip">两套方案都必须精确达到目标累计等级，不得超额培养；已达到或超过目标则不再投入。投入最小方案：已计价元宝最少 → 新增效果节点最多 → 等级内研发度溢出最少 → 神图总消耗最少。最多效果档位方案：新增效果节点最多 → 已计价元宝最少 → 溢出最少 → 神图总消耗最少。允许改造参与时，两套目标均先比较改造本体折算投入数量（已有与新增均计入），再按上述顺序比较；实质指标完全相同时保留全部同等最优组合，稳定键仅决定主展示顺序，其他组合在培养材料中查看。新增节点按实际effects统计；高档替换低档，最终仅生效最高已解锁档位。</p>') +
      '<div data-machine-cost-slot></div></section><div class="machine-calculator-actions machine-calc-actionbar"><button type="button" class="seg" data-machine-action="reload-school-calculator">从个人进度重新读取</button><button type="button" class="seg active" data-machine-action="calculate-school">计算流派方案</button><button type="button" class="seg" data-machine-action="cancel-calculation" hidden disabled>取消计算</button><a href="#machine-school-participants" data-machine-jump>参与兽与临时库存</a><a href="#machine-beast-calculator-result" data-machine-jump data-machine-result-link hidden>查看结果</a><span role="status" data-machine-calculating-status hidden></span></div>' +
      '<section class="panel" id="machine-school-participants"><h2>参与兽与临时库存 <small>已选 <span data-school-participant-count>' + school.beastIds.filter(function (id) { return draft.participating[id]; }).length + '</span>／' + school.beastIds.length + '</small></h2><p class="muted-tip">未参与者的现有等级仍计入累计。</p><div class="machine-school-beast-controls">' + orderedBeastIds.map(function (beastId) {
        var beast = beastById(beastId);
        return renderSchoolBeastControl(beast, draft, Boolean(calculatorQuery) && isSearchMatch(beast, "calculator"));
      }).join("") + '</div></section>';
  }

  function renderCalculatorControls() {
    var focused = rememberPresentation(el.calculatorControls);
    if (state.calculatorMode === "school") renderSchoolCalculatorControls();
    else renderSingleCalculatorControls();
    el.calculatorControls.querySelector('[data-machine-cost-slot]').innerHTML = referenceCostControls();
    el.calculatorModes.querySelectorAll('[data-machine-calculator-mode]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.machineCalculatorMode === state.calculatorMode);
    });
    var result = state.calculatorMode === "school" ? state.schoolResult : state.calcResult;
    if (result) {
      if (state.calculatorMode === "school") renderSchoolCalculatorResult(result, false);
      else renderCalculatorResult(result, false);
    } else if (!calculating) el.calculatorResult.hidden = true;
    rendered.calculator = true;
    setCalculating(calculating);
    restorePresentation(el.calculatorControls, focused);
    updateResultLinks();
  }

  function updateResultLinks() {
    if (!el.calculatorControls) return;
    el.calculatorControls.querySelectorAll('[data-machine-result-link]').forEach(function (link) { link.hidden = el.calculatorResult.hidden; });
  }

  function itemLabel(item) {
    return itemRequirementLabel(item) + '，单只' + formatNumber(item.researchEach) + '研发度';
  }

  function itemRequirementLabel(item) {
    var equivalent = item.rank > 7 ? '（折合7阶×' + formatNumber(Math.pow(2, item.rank - 7) * item.count) + '）' : '';
    return combinedRankLabel(modificationName(item.modificationId), item.rank) + '×' + formatNumber(item.count) + equivalent;
  }

  function groupInvestmentItems(items) {
    var groups = new Map();
    items.forEach(function (item) {
      var key = [item.rank, item.modificationId, item.researchEach].join('/');
      if (!groups.has(key)) groups.set(key, Object.assign({}, item, { count: 0, mixedCount: 0, ownedBaseBodies: 0, newBaseBodies: 0 }));
      var group = groups.get(key);
      group.count += item.count;
      if (item.ownedBaseBodies && item.newBaseBodies) {
        group.mixedCount += item.count;
        group.ownedBaseBodies += item.ownedBaseBodies;
        group.newBaseBodies += item.newBaseBodies;
      }
    });
    return Array.from(groups.values()).sort(comparePlanForms);
  }

  function rankMaterialsNote(unverified) {
    return unverified ? '<p class="muted-tip">返料升阶的材料可行性无法确认：降阶返还与转用规则尚未核实，仅比较无需库存升阶的方案。</p>' : '';
  }

  function schoolRankMaterialsUnverified(result) {
    result = result || {};
    if (result.rankMaterialsUnverified != null) return result.rankMaterialsUnverified;
    return Boolean(state.schoolDraft && state.schoolDraft.newRankMode === "zero") ||
      (result.plans || []).some(function (plan) { return plan.beasts.some(function (detail) { return detail.inventoryConversion && detail.inventoryConversion.rankMaterialsUnverified; }); });
  }

  function investmentInventoryLimits(key, beast, progress, policy, enabled, remainingItems) {
    if (!beast || !progress || !policy) return '';
    var entries = inventoryEntries(beast, progress);
    if (!entries.length) return '';
    var title = remainingItems ? '原库存、使用上限及预计剩余' : '原库存与使用上限';
    return disclosure(key + ':inventory-limits', title, '<ul>' + entries.map(function (entry) {
      var allowed = inventoryLimit(entry, policy, enabled);
      return '<li>' + escapeHtml(combinedRankLabel(entry.modificationName, entry.rank)) + '：库存 ' +
        formatNumber(entry.count) + '只／最多使用 ' + formatNumber(allowed) + '只</li>';
    }).join('') + '</ul>' + (remainingItems ? '<h4>预计剩余库存</h4>' + itemList(remainingItems, '无剩余库存') : ''));
  }

  function itemList(items, empty, emphasizeRequirement) {
    return items.length ? '<ul>' + groupInvestmentItems(items).map(function (item) {
      if (!emphasizeRequirement) return '<li>' + escapeHtml(itemLabel(item)) + '</li>';
      var emphasisClass = emphasizeRequirement === "owned" ? "machine-owned-investment" : "machine-investment-demand";
      var mixed = item.mixedCount ? '（其中' + formatNumber(item.mixedCount) + '只混合投入：库存' + formatNumber(item.ownedBaseBodies) + '＋新增' + formatNumber(item.newBaseBodies) + '个折算本体）' : '';
      return '<li><strong class="' + emphasisClass + '">' + escapeHtml(itemRequirementLabel(item)) + '</strong><span>，单只' + formatNumber(item.researchEach) + '研发度'+mixed+'</span></li>';
    }).join("") + '</ul>' : '<p class="muted-tip">' + escapeHtml(empty) + '</p>';
  }

  function investmentLists(ownedItems, newItems, conversion, school, inventoryDetails) {
    var mixed = newItems.some(function (item) { return item.ownedBaseBodies > 0; });
    var reclaimed = conversion && conversion.sources.some(function (source) { return source.returnedCores > 0; });
    var empty = mixed ? '库存本体用于混合投入' : reclaimed ? '库存仅用于返还神核' : '未使用库存';
    var attributes = school ? ' class="machine-school-plan-material"' : '';
    return '<article' + attributes + '><h3>使用已有库存</h3>' + itemList(ownedItems, empty, 'owned') + (inventoryDetails || '') +
      '</article><article' + attributes + '><h3>' + (mixed ? '含新增本体的投入' : '新增投入') + '</h3>' + itemList(newItems, '无需新增机关兽', true) + '</article>';
  }

  function conversionSummary(conversion, cores, key, items) {
    var sources = conversion && conversion.sources || [];
    var hasCores = cores && (cores.looseOwned || cores.returned || cores.spent || cores.externalDeficit || cores.remaining);
    if (!sources.length && !hasCores) return '';
    function forms(list) {
      return list.map(function (form) {
        var mod = form.modificationId === 'none' ? '' : '（' + modificationName(form.modificationId) + '）';
        var mixed = form.mixedCount ? '（' + formatNumber(form.mixedCount) + '只含新增本体）' : '';
        return '<span>' + escapeHtml(mod) + form.rank + '阶×' + formatNumber(form.count) + mixed + '</span>';
      }).join('');
    }
    function line(label, content) {
      return '<div><dt>' + label + '</dt><dd>' + content + '</dd></div>';
    }
    var body = '';
    if (sources.length) {
      var inputs = sources.map(function (source) {
        return { rank: source.originRank == null ? source.rank : source.originRank, modificationId: source.originModificationId || source.modificationId, count: source.originCount == null ? source.count : source.originCount };
      });
      var outputs = groupInvestmentItems((items || []).filter(function (item) { return item.converted && (item.source === 'owned' || item.ownedBaseBodies); }));
      var remaining = sources.filter(function (source) { return source.remainingBaseBodies > 0; }).map(function (source) {
        return { rank: Math.min(source.rank, 7), modificationId: 'none', count: source.remainingBaseBodies };
      });
      body = '<dl class="machine-conversion-flow">' + line('加工前', forms(groupInvestmentItems(inputs))) +
        line('加工投入', outputs.length ? forms(outputs) : '无') +
        (remaining.length ? line('加工剩余', forms(groupInvestmentItems(remaining))) : '') + '</dl>';
      var paths = sources.map(function (source, index) {
        return { origin: inputs[index], targets: source.bodyTargets };
      }).filter(function (path) { return path.targets && path.targets.length; }).sort(function (left, right) {
        return comparePlanForms(left.origin, right.origin);
      });
      if (paths.length) body += '<dl class="machine-conversion-flow">' +
        paths.map(function (path) {
          return line(forms([path.origin]), path.targets.slice().sort(comparePlanForms).map(function (target) {
            return '<span>供' + target.rank + '阶投入 · ' + formatNumber(target.bodies) + '份折算本体</span>';
          }).join(''));
        }).join('') + '</dl>';
    }
    if (hasCores) {
      body += '<dl class="machine-core-ledger">' + [
        ['已有散装神核', cores.looseOwned], ['返还', cores.returned], ['改造分配', cores.spent],
        ['复用', cores.reused], ['外部缺口', cores.externalDeficit], ['剩余', cores.remaining]
      ].filter(function (row) { return row[1] > 0; }).map(function (row) { return line(row[0], formatNumber(row[1])); }).join('') + '</dl>';
      if (cores.externalDeficit > 0) body += '<p>外部缺口经验估算：约' + formatNumber(cores.estimatedBoxes) + '箱（非保底）。</p>';
    }
    var title = sources.length ? (hasCores ? '库存转换与改造神核' : '库存加工明细') : '改造神核';
    return disclosure((key || 'conversion') + ':cores', title + (cores && cores.externalDeficit > 0 ? ' · 改造神核未计价' : ''), body, 'machine-inventory-conversion');
  }

  function renderCalculatorResult(result, scroll) {
    var focused = rememberPresentation(el.calculatorResult);
    state.referenceCostRequirements = {};
    el.calculatorResult.hidden = false;
    var unverified = result.rankMaterialsUnverified != null ? result.rankMaterialsUnverified :
      Boolean(result.inventoryConversion && result.inventoryConversion.rankMaterialsUnverified || !result.valid && state.singleNewRankMode === "zero");
    if (!result.valid) {
      el.calculatorResult.innerHTML = '<section class="panel machine-result is-error"><h2>' + (unverified ? '暂无可确认方案' : '无法计算') + '</h2><ul>' + result.errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul>' + rankMaterialsNote(unverified) + resultNavigation() + '</section>';
      finishResultRender(focused, scroll);
      return;
    }
    var requirements = { awakeningBlueprints: result.totals.awakeningBlueprints, beasts: [{ beastId: state.calcBeastId, fragments: result.shortage.fragments }] };
    var reference = referenceCostInputError() ? null : CORE.calculateReferenceCost(DATA, requirements, state.referenceCostDraft);
    var detailKey = 'result:single:' + state.calcBeastId + ':' + result.target.level;
    var finalEffect = CORE.activeBeastEffect(beastById(state.calcBeastId), result.totals.projectedLevel);
    var newPhysical = result.selected.newItems.reduce(function (total, item) { return total + item.count; }, 0);
    var exchange = result.exchange.available
      ? '<div><span>仍需贡献</span><b>' + formatNumber(result.exchange.contribution) + '</b></div><div><span>约需元宝</span><b>' + formatNumber(result.exchange.yuan) + '</b></div>'
      : '<div class="machine-no-exchange"><span>贡献兑换</span><b>该档次不可通过贡献兑换碎片</b></div>';
    el.calculatorResult.innerHTML = '<section class="panel machine-result"><div class="machine-result-head"><div><h2>' + escapeHtml(beastById(state.calcBeastId).name) + '升至' + result.target.level + '级</h2></div><b>计算结果</b></div>' +
      resultNavigation() + rankMaterialsNote(unverified) + '<p class="machine-exact-target">当前 ' + result.current.level + '级 → 目标 ' + result.target.level + '级</p><div class="machine-summary-priority machine-single-priority"><div><span>预计达到</span><b>' + result.totals.projectedLevel + '级</b></div><div><span>'+(result.inventoryConversion?'新增0阶本体需求':'新增完整机关兽需求')+'</span><b>' + (result.inventoryConversion?result.totals.newInvestedCount:newPhysical) + '只</b></div><div><span>神图缺口</span><b data-single-priority-blueprints>' + (reference ? formatNumber(reference.blueprints.missing) : '请修正参考设置') + '</b></div><div><span>参考元宝（不参与单兽排序）</span><b class="machine-money" data-single-priority-yuan>' + (reference && reference.complete ? formatNumber(reference.totalYuan) : '费用未完整计价') + '</b></div></div>' +
      disclosure(detailKey + ':metrics', '研发度、投入与全部资源指标', '<div class="machine-result-metrics"><div><span>当前等级</span><b>' + result.current.level + '级</b></div><div><span>当前研发度</span><b>' + formatNumber(result.current.research) + '</b></div>' +
      '<div><span>目标研发度</span><b>' + formatNumber(result.target.research) + '</b></div><div><span>仍缺研发度</span><b>' + formatNumber(result.target.deficit) + '</b></div>' +
      '<div><span>'+(result.inventoryConversion?'0阶本体折算投入':'投入总只数')+'</span><b>' + result.totals.investedCount + '</b></div><div><span>投入研发度</span><b>' + formatNumber(result.totals.research) + '</b></div>' +
      '<div><span>溢出研发度</span><b>' + formatNumber(result.totals.overflow) + '</b></div><div><span>预计达到</span><b>' + result.totals.projectedLevel + '级</b></div></div>' +
      '<div class="machine-result-metrics machine-resource-metrics"><div><span>觉醒神图</span><b>' + formatNumber(result.totals.awakeningBlueprints) + '</b></div><div><span>机关破片</span><b>' + formatNumber(result.totals.organPieces) + '</b></div>' +
      '<div><span>本体缺口</span><b>' + result.shortage.bodyEquivalent + '本体</b></div><div><span>机关兽碎片缺口</span><b>' + formatNumber(result.shortage.fragments) + '</b></div>' + exchange + '</div>') +
      '<div class="machine-result-columns">' + investmentLists(result.selected.ownedItems, result.selected.newItems, result.inventoryConversion, false) + '</div>' + conversionSummary(result.inventoryConversion, result.modificationCores, detailKey, result.selected.ownedItems.concat(result.selected.newItems)) +
      investmentInventoryLimits(detailKey, beastById(state.calcBeastId), state.calcDraft, state.singleInventoryPolicy, state.singleInventoryPolicy && state.singleInventoryPolicy.useOwnedInventory) +
      '<p class="machine-final-effect">最终最高生效效果：' + (finalEffect ? finalEffect.level + '级档位 · ' + escapeHtml(finalEffect.text) : '尚未解锁效果') + '</p>' +
      disclosure(detailKey + ':cost', '参考成本明细', costSlot("single", requirements)) +
      '<details class="machine-unused machine-disclosure" data-detail-key="' + detailKey + ':unused"><summary>预计剩余库存（' + formatNumber(result.unused.reduce(function (total, item) { return total + item.count; }, 0)) + '只）</summary>' + itemList(result.unused, "无剩余库存") + '</details></section>';
    finishResultRender(focused, scroll);
  }

  function finishResultRender(focused, scroll) {
    restorePresentation(el.calculatorResult, focused);
    updateResultLinks();
    if (scroll !== false) jumpTo('machine-beast-calculator-result');
  }

  function schoolPlanTitle(kind, unverified) {
    if (unverified && kind === "cost") return "投入优先方案";
    if (unverified && kind === "effects") return "效果优先方案";
    if (kind === "cost") return "投入最小方案";
    if (kind === "effects") return "最多效果档位方案";
    return "两种目标得到相同方案";
  }

  function schoolResourceValue(value) {
    return value === null ? "存在不可贡献兑换的碎片缺口" : formatNumber(value);
  }

  function renderSchoolBeastPlan(detail) {
    var ownedItems = detail.items.filter(function (item) { return item.source === "owned"; });
    var newItems = detail.items.filter(function (item) { return item.source === "new"; });
    var detailKey = 'school:beast:' + detail.beastId + ':' + detail.endLevel + ':' + detail.items.map(function (item) {
      return item.source + '/' + item.modificationId + '/' + item.rank + '/' + item.count;
    }).join(';');
    var draft = state.schoolDraft;
    var inventoryDetails = draft && draft.progressByBeast && draft.ownedPoliciesByBeast
      ? investmentInventoryLimits(detailKey, beastById(detail.beastId), draft.progressByBeast[detail.beastId], draft.ownedPoliciesByBeast[detail.beastId], draft.useOwnedInventory, detail.inventoryConversion && detail.inventoryConversion.remainingItems) : '';
    return '<article class="machine-school-plan-beast"><header><strong>' + escapeHtml(detail.beastName) + '</strong><b>' + detail.startLevel + '级 → ' + detail.endLevel + '级</b></header>' +
      '<div class="machine-card-primary machine-plan-primary" tabindex="0" role="region" aria-label="效果节点与已有新增投入，可横向滚动"><span>新增效果节点 <b>' + formatNumber(detail.unlockedEffects) + '</b></span><span class="machine-owned-investment">' + (detail.inventoryConversion ? '库存折算' : '已有投入') + ' <b>' + formatNumber(detail.inventoryConversion ? detail.ownedInvestedCount : ownedItems.reduce(function (sum, item) { return sum + item.count; }, 0)) + '只</b></span><span class="machine-investment-demand">' + (detail.inventoryConversion ? '新增折算' : '新增投入') + ' <b>' + formatNumber(detail.inventoryConversion ? detail.newInvestedCount : newItems.reduce(function (sum, item) { return sum + item.count; }, 0)) + '只</b></span></div>' +
      investmentLists(ownedItems, newItems, detail.inventoryConversion, true, inventoryDetails) + conversionSummary(detail.inventoryConversion, detail.modificationCores, detailKey, detail.items) +
      '<div class="machine-school-plan-beast-metrics" tabindex="0" role="region" aria-label="研发度增长与溢出，可横向滚动"><span>研发度 ' + formatNumber(detail.startResearch) + ' → ' + formatNumber(detail.endResearch) + '</span><span>增加 ' + formatNumber(detail.addedResearch) + '</span><span>溢出 ' + formatNumber(detail.overflowResearch) + '</span></div>' +
      '<div class="machine-school-plan-resources"><span>折算投入 <b>' + detail.investedCount + '只</b></span><span>新增效果节点 <b>' + formatNumber(detail.unlockedEffects) + '</b></span><span>最终生效档位 <b>' + (detail.finalEffect ? detail.finalEffect.level + '级' : '尚未解锁') + '</b></span><span>机关兽碎片缺口 <b>' + formatNumber(detail.resources.fragments) + '</b></span><span>神图总消耗 <b>' + formatNumber(detail.resources.awakeningBlueprints) + '</b></span><span>机关破片 <b>' + formatNumber(detail.resources.organPieces) + '</b></span><span>改造本体折算投入 <b>' + formatNumber(detail.modifiedInvestedCount) + '</b>（已有 ' + formatNumber(detail.ownedModifiedInvestedCount) + '／新增 ' + formatNumber(detail.newModifiedInvestedCount) + '）</span></div></article>';
  }

  function schoolComparison(result) {
    var unverified = schoolRankMaterialsUnverified(result);
    var costName = unverified ? '投入优先' : '投入最小';
    var effectsName = unverified ? '效果优先' : '最多效果';
    var rows = [
      ["current", "当前累计等级", function () { return result.current.totalLevel; }],
      ["target", "目标累计等级", function () { return result.target.totalLevel; }],
      ["final", "推荐最终等级", function (p) { return p.totals.projectedTotalLevel; }],
      ["gain", "新增研发等级", function (p) { return p.totals.projectedTotalLevel - result.current.totalLevel; }],
      ["nodes", "新增效果节点", function (p) { return p.totals.unlockedEffects; }],
      ["yuan", "已计价参考元宝", function (p) { return formatNumber(p.totals.pricedYuan); }],
      ["materials", "主要材料需求", schoolMaterialSummary]
    ];
    var cost = result.plans.find(function (p) { return p.kind === 'cost'; }), effects = result.plans.find(function (p) { return p.kind === 'effects'; });
    var difference = '';
    if (cost && effects) {
      var yuanDelta = effects.totals.pricedYuan - cost.totals.pricedYuan, nodeDelta = effects.totals.unlockedEffects - cost.totals.unlockedEffects;
      difference = '<p class="machine-plan-difference">' + effectsName + '相对' + costName + '：已计价参考元宝 ' + (yuanDelta > 0 ? '+' : '') + formatNumber(yuanDelta) + '；新增节点 ' + (nodeDelta > 0 ? '+' : '') + nodeDelta + '。未计价部分不在差值内。</p>';
      var effectRows = new Map((effects.finalEffects || []).map(function (row) { return [row.beastId, row]; }));
      var costCultivated = new Set(cost.beasts.map(function (row) { return row.beastId; }));
      var effectsCultivated = new Set(effects.beasts.map(function (row) { return row.beastId; }));
      var beastDifferences = planBeastOrder(cost.finalEffects || [], cost.beasts.concat(effects.beasts)).map(function (row) {
        var other = effectRows.get(row.beastId);
        if (!other || (row.level === other.level && costCultivated.has(row.beastId) === effectsCultivated.has(row.beastId))) return '';
        var only = costCultivated.has(row.beastId) !== effectsCultivated.has(row.beastId) ? '；仅' + (costCultivated.has(row.beastId) ? costName : effectsName) + '方案培养' : '';
        return '<li data-plan-difference-beast="' + escapeHtml(row.beastId) + '"><b>' + escapeHtml(row.beastName) + '</b><span>' + costName + ' ' + row.level + '级／' + effectsName + ' ' + other.level + '级' + only + '</span></li>';
      }).join('');
      if (beastDifferences) difference += '<section class="machine-beast-differences"><h3>方案差异 · 机关兽培养</h3><ul>' + beastDifferences + '</ul></section>';
    }
    return '<section class="panel machine-school-comparison" id="machine-school-comparison"><h2>精确达标方案对照</h2>' + resultNavigation() + rankMaterialsNote(unverified) +
      '<p class="machine-exact-target">当前 ' + result.current.totalLevel + ' → 目标 ' + result.target.totalLevel + '级 · 本次增长额度 ' + result.target.remaining + '级</p>' +
      '<div class="machine-school-mobile-summaries">' + result.plans.map(function (p, index) {
        return '<article><h3>' + escapeHtml(schoolPlanTitle(p.kind, unverified)) + '</h3>' + schoolPriority(p, result) + '<nav><a href="#' + schoolPlanAnchor(p) + '" data-machine-jump>查看方案明细</a><a href="#machine-school-final-effects-' + index + '" data-machine-jump>最终生效效果</a></nav></article>';
      }).join('') + '</div><table class="machine-school-desktop-comparison"><thead><tr><th scope="col">指标</th>' + result.plans.map(function (p) {
      return '<th scope="col">' + escapeHtml(schoolPlanTitle(p.kind, unverified)) + '</th>';
    }).join("") + '</tr></thead><tbody>' + rows.map(function (row) {
      return '<tr data-school-metric="' + row[0] + '"><th scope="row">' + row[1] + '</th>' + result.plans.map(function (p) { return '<td>' + row[2](p) + '</td>'; }).join("") + '</tr>';
    }).join("") + '<tr><th scope="row">最终生效效果</th>' + result.plans.map(function (_, index) {
      return '<td><a href="#machine-school-final-effects-' + index + '" data-machine-jump>查看逐兽最高档位</a></td>';
    }).join("") + '</tr></tbody></table>' + difference + '<nav class="machine-result-navigation" aria-label="跳转方案">' + result.plans.map(function (p) { return '<a href="#' + schoolPlanAnchor(p) + '" data-machine-jump>' + escapeHtml(schoolPlanTitle(p.kind, unverified)) + '</a>'; }).join('') + '</nav><p class="muted-tip">新增节点用于方案排序，不代表低档效果仍在叠加生效。蓝紫本体、机关破片及制作成本未计入参考元宝。</p></section>';
  }

  function schoolPlanAnchor(plan) { return 'machine-school-plan-' + (plan.kind === 'cost' ? 'cost' : plan.kind === 'effects' ? 'effects' : 'merged'); }

  function schoolMaterialSummary(plan) {
    var converted = plan.beasts.some(function (detail) { return detail.inventoryConversion; });
    var totals = plan.totals;
    return (converted ? '折算本体：库存 ' : '库存 ') + formatNumber(converted ? totals.ownedInvestedCount : totals.ownedPhysicalCount) +
      '只／新增 ' + formatNumber(converted ? totals.newInvestedCount : totals.newPhysicalCount) + '只 · 神图 ' + formatNumber(totals.awakeningBlueprints);
  }

  function schoolPriority(plan, result) {
    return '<div class="machine-summary-priority"><div><span>推荐最终等级／目标等级</span><b>' + plan.totals.projectedTotalLevel + '／' + result.target.totalLevel + '</b></div><div><span>已计价参考元宝</span><b class="machine-money">' + formatNumber(plan.totals.pricedYuan) + '</b></div><div><span>新增效果节点</span><b>' + plan.totals.unlockedEffects + '</b></div></div><p class="machine-material-summary">主要材料：' + schoolMaterialSummary(plan) + '</p>';
  }

  function schoolFinalEffects(plan, index) {
    return '<details class="machine-school-final-effects machine-disclosure" id="machine-school-final-effects-' + index + '" data-detail-key="' + schoolPlanAnchor(plan) + ':' + state.schoolDraft.schoolId + ':' + state.schoolDraft.targetStage + ':effects"><summary>' + (plan.equivalents && BigInt(plan.equivalents.count)>1n ? '主展示组合 · ' : '') + '最终生效效果 · 全部机关兽最高档位</summary><div class="machine-disclosure-body"><dl>' + planBeastOrder(plan.finalEffects || [], plan.beasts).map(function (row) {
      return '<div data-final-beast="' + escapeHtml(row.beastId) + '"><dt>' + escapeHtml(row.beastName) + ' · ' + row.level + '级' + (row.changed ? '' : '<small>原等级不变</small>') + '</dt><dd data-active-effect>' + (row.effect ? '<b>' + row.effect.level + '级档位</b> ' + escapeHtml(row.effect.text) : '尚未解锁效果') + '</dd></div>';
    }).join("") + '</dl></div></details>';
  }

  function renderSchoolPlan(plan, result, index) {
    var unverified = schoolRankMaterialsUnverified(result);
    var totals = plan.totals;
    var orderedBeasts = planBeastOrder(plan.beasts);
    var physical = { owned: 0, new: 0 };
    plan.beasts.forEach(function (detail) { detail.items.forEach(function (item) { physical[item.source] += item.count; }); });
    var anchor = schoolPlanAnchor(plan), detailKey = anchor + ':' + state.schoolDraft.schoolId + ':' + result.target.stage;
    return '<section class="panel machine-result machine-school-plan" id="' + anchor + '"><div class="machine-result-head"><div><h2>' + escapeHtml(schoolPlanTitle(plan.kind, unverified)) + '</h2></div><b>' + result.target.stage + '阶 · 累计' + result.target.totalLevel + '级</b></div>' +
      '<nav class="machine-result-navigation"><a href="#machine-school-comparison" data-machine-jump>返回方案对照</a><a href="#machine-beast-calculator-controls" data-machine-jump>调整设置</a></nav>' + schoolPriority(plan, result) +
      disclosure(detailKey + ':metrics', '研发度、折算投入与全部资源指标', '<div class="machine-school-plan-summary"><div><span>当前累计等级</span><b>' + result.current.totalLevel + '</b></div><div><span>目标累计等级</span><b>' + result.target.totalLevel + '</b></div><div><span>推荐最终等级</span><b>' + totals.projectedTotalLevel + '</b></div><div><span>新增研发等级</span><b>' + (totals.projectedTotalLevel - result.current.totalLevel) + '</b></div>' +
      '<div><span>折算投入总只数</span><b>' + totals.investedCount + '</b></div><div><span>'+(plan.beasts.some(function(b){return b.inventoryConversion;})?'库存0阶本体投入':'已有完整机关兽消耗')+'</span><b>' + (plan.beasts.some(function(b){return b.inventoryConversion;})?totals.ownedInvestedCount:physical.owned) + '只</b><span>折算 ' + totals.ownedInvestedCount + '只</span></div><div><span>'+(plan.beasts.some(function(b){return b.inventoryConversion;})?'新增0阶本体需求':'新增完整机关兽需求')+'</span><b>' + (plan.beasts.some(function(b){return b.inventoryConversion;})?totals.newInvestedCount:physical.new) + '只</b><span>折算 ' + totals.newInvestedCount + '只</span></div>' +
      '<div><span>新增效果节点</span><b>' + formatNumber(totals.unlockedEffects) + '</b></div><div><span>研发度溢出</span><b>' + formatNumber(totals.overflowResearch) + '</b></div><div><span>觉醒神图总消耗</span><b>' + formatNumber(totals.awakeningBlueprints) + '</b></div>' +
      '<div><span>机关破片</span><b>' + formatNumber(totals.organPieces) + '</b></div><div><span>机关兽碎片缺口</span><b>' + formatNumber(totals.fragments) + '</b></div><div><span>已计价参考元宝' + (plan.cost && !plan.cost.complete ? '（已知小计）' : '') + '</span><b>' + formatNumber(plan.cost ? plan.cost.knownYuan : totals.pricedYuan) + '</b></div>' +
      '<div><span>改造本体折算投入</span><b>' + formatNumber(totals.modifiedInvestedCount) + '</b><span>已有 ' + formatNumber(totals.ownedModifiedInvestedCount) + '／新增 ' + formatNumber(totals.newModifiedInvestedCount) + '</span></div></div>') +
      disclosure(detailKey + ':cost', '费用明细 · 神图需求 ' + formatNumber(totals.awakeningBlueprints), costSlot("school-" + index, { awakeningBlueprints: totals.awakeningBlueprints, beasts: orderedBeasts.map(function (detail) { return { beastId: detail.beastId, fragments: detail.resources.fragments }; }) })) +
      disclosure(detailKey + ':materials', '培养材料' + (plan.equivalents && BigInt(plan.equivalents.count) > 1n ? (unverified ? ' · 同等组合共' : ' · 同等最优共') + formatNumber(BigInt(plan.equivalents.count)) + '套' : ''), '<div class="machine-cultivation-layout">' + (orderedBeasts.length ? '<div class="machine-school-plan-beasts">' + orderedBeasts.map(renderSchoolBeastPlan).join("") + '</div>' : '<p class="machine-school-complete">目标已达成，无需新增投入。</p>') + equivalentMaterials(plan, index) + '</div>') + schoolFinalEffects(plan, index) + '</section>';
  }

  function equivalentPageKey(plan) {
    return schoolPlanAnchor(plan) + ':' + state.schoolDraft.schoolId + ':' + state.schoolDraft.targetStage + ':' + plan.stableKey + ':' + [plan.totals.pricedYuan,plan.totals.awakeningBlueprints,plan.totals.overflowResearch,plan.equivalents.count].join('/');
  }

  function equivalentMaterials(plan, index) {
    if (!plan.equivalents || BigInt(plan.equivalents.count) <= 1n) return '';
    var key = equivalentPageKey(plan), pages = equivalentPages;
    var account = ACCOUNT_STORAGE.currentAccount && ACCOUNT_STORAGE.currentAccount(), accountId = account && account.id;
    var page = pages[key];
    if (!page || page.plan !== plan || page.result !== state.schoolResult || page.accountId !== accountId || page.sequence !== calculationSequence) {
      page = pages[key] = { plan: plan, result: state.schoolResult, accountId: accountId, sequence: calculationSequence,
        nextOffset: '0', hasMore: true, count: 0, busy: false, batches: [], container: null };
    }
    var title = schoolRankMaterialsUnverified(state.schoolResult) ? '其他同等组合' : '其他同等最优组合';
    return '<section class="machine-equivalent-materials" data-equivalent-index="' + index + '"><h3>' + title + ' · 另' + formatNumber(BigInt(plan.equivalents.count)-1n) + '套</h3><p class="muted-tip">各组合互相替代，请勿叠加投入。</p><div data-equivalent-items>' + page.batches.join('') + '</div><p class="muted-tip" data-equivalent-count>' + equivalentCountText(page) + '</p><button type="button" class="seg" data-machine-action="more-equivalents" data-plan-index="' + index + '"' + (page.hasMore ? '' : ' hidden') + '>' + (page.count ? '继续显示其他组合（每次10套）' : '加载首批其他组合') + '</button></section>';
  }

  function equivalentCountText(page) {
    return '已列出其他组合 ' + formatNumber(page.count) + '／' + formatNumber(BigInt(page.plan.equivalents.count)-1n);
  }

  function renderEquivalentAlternatives(alternatives, key, start) {
    return alternatives.map(function (alternative, position) {
      var orderedBeasts = planBeastOrder(alternative.beasts);
      var title = '其他组合 ' + (start+position+1) + ' · ' + orderedBeasts.map(function (b) { return b.beastName + ' ' + b.startLevel + '→' + b.endLevel + '级'; }).join('、');
      var effects = '<dl class="machine-equivalent-effects">' + orderedBeasts.map(function (b) { return '<div><dt>' + escapeHtml(b.beastName) + '最终最高生效效果</dt><dd>' + (b.finalEffect ? b.finalEffect.level + '级 · ' + escapeHtml(b.finalEffect.text) : '尚未解锁') + '</dd></div>'; }).join('') + '</dl>';
      return disclosure(key + ':alternative:' + alternative.stableKey, escapeHtml(title), '<p>' + schoolMaterialSummary(alternative) + '</p><div class="machine-school-plan-beasts">' + orderedBeasts.map(renderSchoolBeastPlan).join('') + '</div>' + effects, 'machine-equivalent-combination');
    }).join('');
  }

  function showMoreEquivalentMaterials(index) {
    var plan = state.schoolResult && state.schoolResult.plans && state.schoolResult.plans[index];
    if (!plan || !plan.equivalents || calculating) return;
    var old = el.calculatorResult.querySelector('[data-equivalent-index="' + index + '"]');
    if (!old) return;
    var key = equivalentPageKey(plan), page = equivalentPages[key];
    if (!page || page.busy || !page.hasMore) return;
    var button = old.querySelector('[data-machine-action="more-equivalents"]');
    var items = old.querySelector('[data-equivalent-items]');
    var sequence = calculationSequence;
    page.container = old;
    function current() {
      var account = ACCOUNT_STORAGE.currentAccount && ACCOUNT_STORAGE.currentAccount();
      return equivalentPages[key] === page &&
        page.plan === plan && page.result === state.schoolResult && sequence === calculationSequence && page.sequence === sequence &&
        (account && account.id) === page.accountId && old.isConnected &&
        el.calculatorResult.querySelector('[data-equivalent-index="' + index + '"]') === old;
    }
    if (!current()) return;
    page.busy = true;
    button.setAttribute('aria-disabled', 'true');
    button.setAttribute('aria-busy', 'true');
    var nextOffset = page.nextOffset, hasMore = page.hasMore, parts = [];
    // One exact alternative per task: yield between graph decodes and allow cancellation.
    function decodeNext() {
      if (!current()) {
        // A newer task may already own this same DOM after a navigation round trip.
        if (page.sequence === sequence) { page.busy = false; button.removeAttribute('aria-disabled'); button.removeAttribute('aria-busy'); }
        return;
      }
      try {
        var next = PLANNER.equivalentPlansPage(DATA, plan, nextOffset, 1);
        nextOffset = next.nextOffset; hasMore = next.hasMore;
        if(next.plans.length)parts.push(renderEquivalentAlternatives(next.plans, key, page.count + parts.length));
        if (hasMore && parts.length < 10) { setTimeout(decodeNext, 0); return; }
        var html = parts.join('');
        items.insertAdjacentHTML('beforeend', html);
        page.batches.push(html); page.count += parts.length; page.nextOffset = nextOffset; page.hasMore = hasMore;
        old.querySelector('[data-equivalent-count]').textContent = equivalentCountText(page);
        // Keep the final focused button in the DOM rather than removing its focus target.
        button.hidden = !hasMore && document.activeElement !== button;
        button.setAttribute('aria-disabled', String(!hasMore));
        button.textContent = hasMore ? '继续显示其他组合（每次10套）' : '已显示全部其他组合';
        button.removeAttribute('aria-busy');
        page.busy = false;
      } catch (error) {
        page.busy = false; button.removeAttribute('aria-disabled'); button.removeAttribute('aria-busy');
        showError(error.message || '同等方案加载失败，请重新计算。', error);
      }
    }
    setTimeout(decodeNext, 0);
  }

  function prepareFirstEquivalentPages() {
    if(state.mode!=='calculator'||state.calculatorMode!=='school'||!state.schoolResult||el.calculatorResult.hidden)return;
    (state.schoolResult.plans||[]).forEach(function(plan,index){
      if(!plan.equivalents||BigInt(plan.equivalents.count)<=1n)return;
      var page=equivalentPages[equivalentPageKey(plan)];
      if(page&&!page.count)showMoreEquivalentMaterials(index);
    });
  }

  function renderSchoolCalculatorResult(result, scroll) {
    var focused = rememberPresentation(el.calculatorResult);
    state.referenceCostRequirements = {};
    el.calculatorResult.hidden = false;
    if (!result.valid) {
      var unverified = schoolRankMaterialsUnverified(result);
      el.calculatorResult.innerHTML = '<section class="panel machine-result is-error"><h2>' + (unverified ? '暂无可确认方案' : '无法计算') + '</h2><ul>' + result.errors.map(function (error) { return '<li>' + escapeHtml(error) + '</li>'; }).join("") + '</ul>' + rankMaterialsNote(unverified) + resultNavigation() + '</section>';
      finishResultRender(focused, scroll);
      return;
    }
    if (result.alreadyReached) {
      el.calculatorResult.innerHTML = '<section class="panel machine-result"><h2>目标已达成，无需新增投入</h2><p>当前累计等级 ' + result.current.totalLevel + '，目标累计等级 ' + result.target.totalLevel + '。不再为新增效果继续培养。</p>' + resultNavigation() + '</section>';
    } else {
      el.calculatorResult.innerHTML = schoolComparison(result) + result.plans.map(function (plan, index) { return renderSchoolPlan(plan, result, index); }).join("");
    }
    finishResultRender(focused, scroll);
    prepareFirstEquivalentPages();
  }

  function thresholdReference() {
    return '<section class="panel" id="machine-reference-thresholds"><h2>研发等级累计研发度</h2><div class="machine-threshold-groups">' +
      Array.from({ length: 5 }, function (_, group) {
        return '<section><h3>' + (group * 5 + 1) + '—' + (group * 5 + 5) + '级</h3><div class="machine-reference-grid machine-threshold-grid">' + Array.from({ length: 5 }, function (_, index) {
        var level = group * 5 + index + 1;
        return '<article class="machine-reference-pair ' + (DATA.effectLevels.includes(level) ? "is-milestone" : "") + '"><span>' + level + '级</span><b>' + formatNumber(DATA.researchThresholds[level]) + '</b></article>';
        }).join('') + '</div></section>';
      }).join("") + '</div></section>';
  }

  function researchReference() {
    var coreRules = DATA.modificationCoreRules;
    var coreMaterials = coreRules ? '<section class="machine-modification-core-reference"><h3>改造神核材料</h3><div class="machine-core-table-scroll"><table><thead><tr><th scope="col">改造阶段</th><th scope="col">本阶段所需神核</th><th scope="col">累计神核</th><th scope="col">所需神核箱子预估（按10出2计算）</th></tr></thead><tbody>' + DATA.modifications.filter(function (mod) { return mod.id !== 'none'; }).map(function (mod) {
      return '<tr><th scope="row">' + escapeHtml(mod.name) + '</th><td>' + formatNumber(coreRules.incremental[mod.id]) + '</td><td>' + formatNumber(coreRules.cumulative[mod.id]) + '</td><td aria-label="约' + coreRules.incremental[mod.id] * coreRules.estimatedBoxesPerCore + '箱，经验估计，非保底">' + formatNumber(coreRules.incremental[mod.id] * coreRules.estimatedBoxesPerCore) + '</td></tr>';
    }).join('') + '</tbody></table></div></section>' : '';
    function qualityCards(quality, title, includeModifications) {
      var cards = Object.keys(DATA.researchValues[quality]).sort(function (a, b) { return Number(a) - Number(b); }).map(function (rank) {
        var values = includeModifications ? DATA.modifications.map(function (mod) {
          return '<div><dt>' + escapeHtml(mod.name) + '</dt><dd>' + formatNumber(DATA.researchValues[quality][rank][mod.id]) + '</dd></div>';
        }).join("") : '<div><dt>研发度</dt><dd>' + formatNumber(DATA.researchValues[quality][rank].none) + '</dd></div>';
        return '<article class="machine-reference-card machine-research-card">' + disclosure('reference:values:' + quality + ':' + rank, rank + '阶研发度', '<dl>' + values + '</dl>') + '</article>';
      }).join("");
      var columns = includeModifications ? DATA.modifications : [{ id: 'none', name: '研发度' }];
      var emptyCount = DATA.modifications.length - columns.length;
      var matrix = '<div class="machine-research-matrix-scroll" data-quality="' + quality + '" tabindex="0" role="region" aria-label="' + title + '研发度对照表，可横向滚动"><table><caption>' + title + '各阶研发度</caption><colgroup><col class="machine-research-rank-column"><col span="' + DATA.modifications.length + '"></colgroup><thead><tr><th scope="col">阶数</th>' + columns.map(function (mod) { return '<th scope="col">' + escapeHtml(mod.name) + '</th>'; }).join('') + Array.from({length:emptyCount},function () { return '<th class="machine-research-empty" aria-hidden="true"></th>'; }).join('') + '</tr></thead><tbody>' + Object.keys(DATA.researchValues[quality]).sort(function (a,b) { return Number(a)-Number(b); }).map(function (rank) {
        return '<tr><th scope="row">' + rank + '阶</th>' + columns.map(function (mod) { var value = DATA.researchValues[quality][rank][mod.id]; return '<td>' + (value == null ? '—' : formatNumber(value)) + '</td>'; }).join('') + Array.from({length:emptyCount},function () { return '<td class="machine-research-empty" aria-hidden="true"></td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
      return '<section class="machine-reference-group"><h3>' + title + '</h3>' + matrix + '<div class="machine-reference-grid machine-research-card-grid machine-reference-mobile-only">' + cards + '</div></section>';
    }
    return '<section class="panel" id="machine-reference-values"><h2>不同阶数与改造研发度</h2>' + coreMaterials + '<section class="machine-research-quick"><h3>研发度按阶速查</h3><div class="machine-research-quick-controls"><label>品质<select data-research-quality>' + [['orange','橙色机关兽'],['purple','紫色机关兽'],['blue','蓝色机关兽']].map(function (entry) { return '<option value="' + entry[0] + '"' + ((presentation.researchQuality || 'orange') === entry[0] ? ' selected' : '') + '>' + entry[1] + '</option>'; }).join('') + '</select></label><label>突破阶数<select data-research-rank></select></label></div><div data-research-quick-result aria-live="polite"></div></section>' + qualityCards("orange", "橙色机关兽", true) + qualityCards("purple", "紫色机关兽", false) + qualityCards("blue", "蓝色机关兽", false) + '</section>';
  }

  function updateResearchQuickLookup() {
    var qualitySelect = el.referenceContent.querySelector('[data-research-quality]');
    if (!qualitySelect) return;
    var quality = qualitySelect.value, ranks = Object.keys(DATA.researchValues[quality]).sort(function (a, b) { return Number(a) - Number(b); });
    var rank = String(presentation.researchRank == null ? '0' : presentation.researchRank);
    if (!ranks.includes(rank)) rank = ranks[0];
    presentation.researchQuality = quality;
    presentation.researchRank = rank;
    var rankSelect = el.referenceContent.querySelector('[data-research-rank]');
    rankSelect.innerHTML = ranks.map(function (value) { return '<option value="' + value + '"' + (value === rank ? ' selected' : '') + '>' + value + '阶</option>'; }).join('');
    var values = DATA.researchValues[quality][rank];
    var columns = quality === 'orange' ? DATA.modifications : DATA.modifications.filter(function (mod) { return mod.id === 'none'; });
    el.referenceContent.querySelector('[data-research-quick-result]').innerHTML = '<dl class="machine-research-quick-values">' + columns.map(function (mod) { return '<div><dt>' + escapeHtml(mod.name) + '</dt><dd>' + (values[mod.id] == null ? '—' : formatNumber(values[mod.id])) + '</dd></div>'; }).join('') + '</dl>';
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
        var source = '<p class="machine-beast-source">获取来源：' + escapeHtml(sourceText(beast)) + '</p>';
        var list = '<dl class="machine-effect-reference-list">' + effects + '</dl>';
        return '<article class="machine-reference-card machine-beast-reference-card' + (query ? ' machine-search-match' : '') + '"><header><span class="machine-name-token ' + qualityClass(beast) + '">' + escapeHtml(beast.name) + '</span><span>' + escapeHtml(school.name) + ' · ' + beast.tier + ' · 上限' + beast.maxLevel + '级</span></header><div class="machine-reference-desktop-only">' + source + list + '</div>' + disclosure('reference:effects:' + beast.id, '查看来源与全部档位效果', source + list, 'machine-reference-mobile-only') + '</article>';
      }).join("");
    return '<section class="panel" id="machine-reference-effects"><h2>机关兽归属与研发效果</h2>' + schoolSwitcher("reference-beasts", school.id) +
      '<div class="machine-reference-grid machine-beast-reference-grid">' + (cards || '<p class="machine-search-empty">当前流派没有符合条件的机关兽</p>') + '</div></section>';
  }

  function schoolReference() {
    var school = schoolById(state.referenceStageSchoolId);
    return '<section class="panel" id="machine-reference-schools"><h2>霸道／非攻机关术阶数效果研发</h2>' + schoolSwitcher("reference-stages", school.id) +
      '<div class="machine-reference-grid machine-school-stage-grid">' + school.stages.map(function (stage) {
        return '<article class="machine-reference-card machine-school-stage-card"><header><h3>' + stage.stage + '阶</h3><span>' + (stage.requiredTotalLevel === null ? '升阶要求：数据待补充' : '累计觉醒等级' + stage.requiredTotalLevel) + '</span></header><dl><div><dt>流派加成</dt><dd>' + escapeHtml(stage.factionBonus) + '</dd></div><div><dt>阵容特效</dt><dd>' + escapeHtml(stage.formationEffect) + '</dd></div><div><dt>机关兽特效</dt><dd>' + escapeHtml(stage.beastEffect) + '</dd></div></dl></article>';
      }).join("") + '</div></section>';
  }

  function materialReference() {
    return '<section class="panel" id="machine-reference-materials" data-machine-material-sources><h2>材料获取与设计图关卡查询</h2><div class="machine-reference-grid machine-material-source-grid">' + (DATA.materialSources || []).map(function (material) {
      var description = material.stages && material.stages.length ? '<p class="machine-material-stages">主线关卡' + material.stages.map(function (stage) {
        return '<span>' + escapeHtml(stage) + '</span>';
      }).join('、') + '掉落</p>' : '<p>' + escapeHtml((material.sources || []).join('、')) + '</p>';
      return '<article class="machine-reference-card"><h3>' + escapeHtml(material.name) + '</h3>' + description + '</article>';
    }).join('') + '</div><p class="machine-treasurebox-note">' + escapeHtml((DATA.referenceCostRules || {}).treasureBoxNote || '') + '</p></section>';
  }

  function blueprintGuideReference() {
    var guide = DATA.blueprintGuide;
    if (!guide) return '';
    var levelNotes = { 10: '（蓝色）', 15: '（紫色）', 20: '（一代橙色）', 25: '（二代橙色）' };
    return '<section class="panel machine-blueprint-guide" id="machine-reference-blueprints" data-machine-blueprint-guide><h2>机关兽研发材料参考（用图纸版）</h2>' +
      '<div class="machine-blueprint-guide-scroll" tabindex="0" role="region" aria-label="机关兽研发材料参考表，可横向滚动"><table class="machine-blueprint-guide-table"><thead><tr><th scope="col">材料</th>' + guide.levels.map(function (level) {
        return '<th scope="col">' + escapeHtml(level) + '级' + escapeHtml(levelNotes[level] || '') + '</th>';
      }).join('') + '</tr></thead><tbody><tr data-blueprint-guide-plan><th scope="row">投入方案</th>' + guide.plans.map(function (plan) {
        return '<td>' + escapeHtml(plan) + '</td>';
      }).join('') + '</tr>' + guide.resources.map(function (resource) {
        return '<tr data-blueprint-guide-resource><th scope="row">' + escapeHtml(resource.name) + '</th>' + resource.values.map(function (value) {
          return '<td' + (value === null ? ' class="machine-blueprint-guide-missing" aria-label="资料未提供"' : '') + '>' + (value === null ? '—' : escapeHtml(value)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function breakthroughGuideReference() {
    var guide = DATA.breakthroughGuide;
    if (!guide) return '';
    return '<section class="panel machine-blueprint-guide" id="machine-reference-breakthrough" data-machine-breakthrough-guide><h2>机关兽突破材料参考（0—10阶）</h2>' +
      '<h3>逐阶段所需成品材料</h3><div class="machine-blueprint-guide-scroll" tabindex="0" role="region" aria-label="机关兽突破成品材料表，可横向滚动"><table class="machine-blueprint-guide-table machine-breakthrough-stage-table"><thead><tr><th scope="col">突破阶段</th><th scope="col">成品材料</th></tr></thead><tbody>' +
      guide.stages.map(function (stage) {
        return '<tr data-breakthrough-stage><th scope="row">' + escapeHtml(stage.from) + '→' + escapeHtml(stage.to) + '阶</th><td>' + stage.materials.map(function (material) {
          return escapeHtml(material.name) + ' × ' + escapeHtml(material.quantity);
        }).join('、') + '</td></tr>';
      }).join('') + '</tbody></table></div><h3>从0阶升至7／8／9／10阶累计材料</h3>' +
      '<div class="machine-blueprint-guide-scroll" tabindex="0" role="region" aria-label="机关兽突破累计材料表，可横向滚动"><table class="machine-blueprint-guide-table"><thead><tr><th scope="col">材料</th>' +
      guide.ranks.map(function (rank) { return '<th scope="col">' + escapeHtml(rank) + '阶</th>'; }).join('') + '</tr></thead><tbody>' +
      guide.resources.map(function (resource) {
        return '<tr data-breakthrough-resource><th scope="row">' + escapeHtml(resource.name) + '</th>' + resource.values.map(function (value) { return '<td>' + escapeHtml(value) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function renderReference() {
    var focused = rememberPresentation(el.referenceContent);
    var groups = [['机关兽与流派', [['effects','归属与效果'],['schools','流派效果']]], ['材料与突破', [['materials','材料来源'],['blueprints','研发材料'],['breakthrough','突破材料']]], ['等级与研发数值', [['thresholds','等级门槛'],['values','阶数与改造']]]];
    el.referenceContent.innerHTML = '<nav class="machine-reference-index" id="machine-reference-index" aria-label="机关兽资料目录">' + groups.map(function (group) { return '<div class="machine-reference-index-group"><b>' + group[0] + '</b><div>' + group[1].map(function (entry) { return '<a href="#machine-reference-' + entry[0] + '" data-machine-jump>' + entry[1] + '</a>'; }).join('') + '</div></div>'; }).join('') + '</nav>' + beastReference() + schoolReference() + materialReference() + blueprintGuideReference() + breakthroughGuideReference() + thresholdReference() + researchReference();
    updateResearchQuickLookup();
    el.referenceContent.querySelectorAll(':scope > section.panel').forEach(addReferenceReturn);
    rendered.reference = true;
    restorePresentation(el.referenceContent, focused);
  }

  function addReferenceReturn(section) {
    var heading = section.querySelector('h2');
    if (heading) {
      var header = document.createElement('div');
      header.className = 'machine-reference-section-head';
      heading.before(header);
      header.appendChild(heading);
      header.insertAdjacentHTML('beforeend', '<a class="seg machine-reference-return" href="#machine-reference-index" data-machine-jump>返回资料目录</a>');
    }
  }

  function replaceReferenceSection(id, html) {
    var old = document.getElementById(id);
    if (!old) { renderReference(); return; }
    var focused = rememberPresentation(old), template = document.createElement('template');
    template.innerHTML = html;
    var replacement = template.content.firstElementChild;
    addReferenceReturn(replacement);
    old.replaceWith(replacement);
    restorePresentation(replacement, focused);
  }

  function setMode(mode) {
    if (state.mode !== mode) cancelCalculation(false);
    state.mode = mode;
    applySearchContext(mode);
    el.modes.querySelectorAll("[data-machine-beast-mode]").forEach(function (button) { button.classList.toggle("active", button.dataset.machineBeastMode === mode); });
    el.progress.hidden = mode !== "progress";
    el.calculator.hidden = mode !== "calculator";
    el.reference.hidden = mode !== "reference";
    if (mode === "progress" && !rendered.progress) renderProgress();
    if (mode === "calculator" && !rendered.calculator) renderCalculatorControls();
    if (mode === "calculator") prepareFirstEquivalentPages();
    if (mode === "reference" && !rendered.reference) renderReference();
  }

  function captureView() {
    rememberDisclosures(el.partition);
    return {
      presentation: clone(presentation),
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
      schoolResult: clone(state.schoolResult),
      schoolReferenceCostKey: JSON.stringify(state.referenceCostDraft)
    };
  }

  function restoreView(view) {
    cancelCalculation(false);
    var saved = view || {};
    if (saved.presentation) presentation = Object.assign({ disclosures: {}, progressQuality: 'all', stockedOnly: false }, clone(saved.presentation));
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
    state.schoolResult = saved.schoolResult == null || (saved.schoolReferenceCostKey != null && saved.schoolReferenceCostKey !== JSON.stringify(state.referenceCostDraft)) ? null : clone(saved.schoolResult);
    // Hidden regions are rendered lazily too. Remove their stale DOM now so
    // a later tab switch cannot snapshot old open states over this view.
    [el.progressContent, el.calculatorControls, el.calculatorResult, el.referenceContent].forEach(function (node) { node.innerHTML = ''; });
    el.calculatorResult.hidden = true;
    state.referenceCostRequirements = {};
    rendered = { progress: false, calculator: false, reference: false };
    restoringPresentation = true;
    try { setMode(saved.mode || "progress"); }
    finally { restoringPresentation = false; }
  }

  function applyNavigationQuery(name) {
    var query = String(name == null ? "" : name).trim();
    Object.keys(searchRefresh).forEach(function (scope) { searchRefresh[scope].cancel(); });
    ["progress", "calculator", "reference"].forEach(function (scope) {
      state.searches[scope] = query;
      pendingSearches[scope] = query;
    });
    presentation.progressQuality = 'all';
    presentation.stockedOnly = false;
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
    } else if (scope === "calculator") {
      if (state.calculatorMode === "single") {
        if (!matches.some(function (beast) { return beast.id === state.calcBeastId; })) {
          cancelCalculation(true);
          resetCalculator(matches[0].id);
        }
      } else if (!schoolHasMatch(state.schoolDraft.schoolId, matches)) {
        cancelCalculation(true);
        resetSchoolCalculator(matches[0].schoolId);
      }
    }
  }

  function renderSearchResults(scope) {
    if (scope === "progress") renderProgress();
    else if (scope === "calculator") renderCalculatorControls();
    else if (scope === "reference") replaceReferenceSection('machine-reference-effects', beastReference());
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
    if (event.target.matches("[data-edit-field]")) {
      state.editDraft[event.target.dataset.editField] = CORE.integer(event.target.value);
      var level = el.progressContent.querySelector('[data-edit-current-level]');
      if (level) level.textContent = CORE.levelForResearch(state.editDraft.research, DATA.researchThresholds, beastById(state.editingId).maxLevel) + '级';
    }
    if (event.target.matches("[data-edit-inventory]")) updateInventory(state.editDraft, event.target);
  }

  function handleProgressChange(event) {
    if (event.target.matches('[data-progress-quality], [data-progress-stocked]')) {
      if (event.target.matches('[data-progress-quality]')) presentation.progressQuality = event.target.value;
      else presentation.stockedOnly = event.target.checked;
      renderProgress();
      return;
    }
    if (!state.editDraft || !event.target.matches("[data-edit-flag]")) return;
    state.editDraft[event.target.dataset.editFlag] = event.target.checked;
    renderProgress();
  }

  function handleCalculatorClick(event) {
    var modeButton = event.target.closest("[data-machine-calculator-mode]");
    if (modeButton) {
      cancelCalculation(true);
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
    if(action === 'cancel-calculation'){
      if(!calculating)return;
      var canceledKind=calculatingKind;
      cancelCalculation(true);
      var calculateButton=el.calculator.querySelector('[data-machine-action="'+(canceledKind==='beast-school'?'calculate-school':'calculate')+'"]');
      if(calculateButton)calculateButton.focus({preventScroll:true});
      return;
    }
    if (action === 'more-equivalents') {
      showMoreEquivalentMaterials(CORE.integer(button.dataset.planIndex));
    } else if (action === "save-reference-cost") {
      updateReferenceCost(el.calculatorControls.querySelector('[data-reference-cost-field="awakeningBlueprintStock"]'), true, true);
    } else if (action === "reload-calculator") {
      cancelCalculation(true);
      resetCalculator(beast.id);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (action === "calculate") {
      runCalculation("beast-single", { beastId: beast.id, progress: state.calcDraft, options: {
        targetLevel: state.calcTargetLevel,
        includeHighRanks: state.calcDraft.showHighRanks,
        includeMods: state.calcDraft.showMods,
        useOwnedInventory: state.singleInventoryPolicy.useOwnedInventory,
        ownedLimits: state.singleInventoryPolicy.limits,
        newRankMode: state.singleNewRankMode,
        convertOwnedInventory:true,
        prioritizeOwnedInventory: true,
        preferOwnedOnTie: true
      } });
    } else if (action === "reload-school-calculator") {
      cancelCalculation(true);
      resetSchoolCalculator(state.schoolDraft.schoolId);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (action === "calculate-school") {
      var draft = state.schoolDraft;
      var school = DATA.schools.find(function (item) { return item.id === draft.schoolId; });
      var target = school.stages.find(function (stage) { return stage.stage === draft.targetStage; });
      if (target && CORE.schoolSnapshot(school, draft.progressByBeast, DATA).totalLevel >= target.requiredTotalLevel) {
        cancelCalculation(false);
        clearError();
        state.schoolResult = PLANNER.calculateSchoolPlans(DATA, school, draft.progressByBeast, { targetStage: draft.targetStage });
        renderSchoolCalculatorResult(state.schoolResult);
        return;
      }
      var costError = referenceCostInputError();
      if (costError) {
        cancelCalculation(false);
        showError(costError + ' 请修正后重新计算流派方案。');
        jumpTo('machine-price-settings');
        return;
      }
      clearError();
      var participatingIds = school.beastIds.filter(function (beastId) { return draft.participating[beastId]; });
      var limits = {};
      school.beastIds.forEach(function (beastId) { limits[beastId] = draft.ownedPoliciesByBeast[beastId].limits; });
      runCalculation("beast-school", { schoolId: school.id, progressByBeast: draft.progressByBeast, options: {
        targetStage: draft.targetStage,
        participatingBeastIds: participatingIds,
        useOwnedInventory: draft.useOwnedInventory,
        ownedLimitsByBeast: limits,
        allowNewHighRanks: draft.allowNewHighRanks,
        allowNewModifications: draft.allowNewModifications,
        newRankMode: draft.newRankMode,
        convertOwnedInventory:true,
        bluePurpleInventoryOnly: state.referenceCostDraft.bluePurpleInventoryOnly !== false,
        referenceCostSettings: CORE.normalizeReferenceCostSettings(DATA, state.referenceCostDraft)
      } });
    }
  }

  function handleCalculatorInput(event) {
    var target = event.target;
    if (target.matches('[data-reference-blueprint-preset]')) return;
    if (target.matches('[data-reference-cost-field], [data-reference-beast-price]')) {
      updateReferenceCost(target);
      return;
    }
    if (target.matches('[data-machine-search="calculator"]')) {
      if (event.isComposing || state.composingSearch.calculator) return;
      scheduleSearchInput("calculator", target.value);
      return;
    }
    cancelCalculation(true);
    if (target.matches("[data-calc-field]")) {
      state.calcDraft[target.dataset.calcField] = CORE.integer(target.value);
      var singleLevel = el.calculatorControls.querySelector('[data-calc-current-level]');
      if (singleLevel) singleLevel.textContent = CORE.levelForResearch(state.calcDraft.research, DATA.researchThresholds, beastById(state.calcBeastId).maxLevel) + '级';
    }
    if (target.matches("[data-calc-inventory]")) {
      var oldSingle = CORE.integer((state.calcDraft.inventory[target.dataset.mod] || {})[target.dataset.rank]);
      updateInventory(state.calcDraft, target);
      var singleLimits = state.singleInventoryPolicy.limits[target.dataset.mod] || (state.singleInventoryPolicy.limits[target.dataset.mod] = {});
      if (CORE.integer(singleLimits[target.dataset.rank]) >= oldSingle) singleLimits[target.dataset.rank] = CORE.integer(target.value);
    }
    if (target.matches("[data-school-field]")) {
      state.schoolDraft.progressByBeast[target.dataset.beastId][target.dataset.schoolField] = CORE.integer(target.value);
      refreshSchoolOverview();
      var card = target.closest('[data-school-card]'), beast = beastById(target.dataset.beastId);
      if (card) card.querySelectorAll('[data-school-level]').forEach(function (label) { label.textContent = CORE.levelForResearch(state.schoolDraft.progressByBeast[beast.id].research, DATA.researchThresholds, beast.maxLevel) + '/' + beast.maxLevel + '级'; });
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
      var usageToggle = target.closest('.machine-owned-inventory-row').querySelector('[data-machine-owned-enabled]');
      if (usageToggle) usageToggle.checked = policyLimits[target.dataset.rank] > 0;
    }
  }

  function handleCalculatorChange(event) {
    var target = event.target;
    if (target.matches('[data-machine-search="calculator"]')) return;
    if (target.matches('[data-reference-cost-field], [data-reference-beast-price], [data-reference-blueprint-preset]')) {
      updateReferenceCost(target, true);
      return;
    }
    cancelCalculation(true);
    if (target.matches("[data-calc-beast]")) {
      resetCalculator(target.value);
      el.calculatorResult.hidden = true;
      renderCalculatorControls();
    } else if (target.matches("[data-calc-target]")) {
      state.calcTargetLevel = CORE.integer(target.value);
      el.calculatorControls.querySelector('[data-calc-target-value]').textContent = target.value + '级';
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
      if (target.dataset.ownedScope === 'school') refreshSchoolCard(target.dataset.beastId);
      else renderCalculatorControls();
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
      }
      renderCalculatorControls();
    } else if (target.matches("[data-school-participant]")) {
      state.schoolDraft.participating[target.dataset.beastId] = target.checked;
      refreshSchoolCard(target.dataset.beastId);
    } else if (target.matches("[data-school-flag]")) {
      state.schoolDraft.progressByBeast[target.dataset.beastId][target.dataset.schoolFlag] = target.checked;
      refreshSchoolCard(target.dataset.beastId);
    } else if (target.matches('[data-school-inventory]')) {
      refreshInventoryUsage('school', target.dataset.beastId);
    } else if (target.matches('[data-calc-inventory]')) {
      refreshInventoryUsage('single');
    }
  }

  function handleReferenceClick(event) {
    var button = event.target.closest("[data-machine-school-scope]");
    if (!button) return;
    if (button.dataset.machineSchoolScope === "reference-beasts") state.referenceBeastSchoolId = button.dataset.schoolId;
    if (button.dataset.machineSchoolScope === "reference-stages") state.referenceStageSchoolId = button.dataset.schoolId;
    if (button.dataset.machineSchoolScope === 'reference-beasts') replaceReferenceSection('machine-reference-effects', beastReference());
    else if (button.dataset.machineSchoolScope === 'reference-stages') replaceReferenceSection('machine-reference-schools', schoolReference());
  }

  function handleReferenceInput(event) {
    if (!event.target.matches('[data-machine-search="reference"]')) return;
    if (event.isComposing || state.composingSearch.reference) return;
    scheduleSearchInput("reference", event.target.value);
  }

  function validDependencies() {
    return DATA && CORE && PLANNER && PERFORMANCE && typeof PERFORMANCE.createRefreshQueue === "function" && Array.isArray(DATA.beasts) && typeof CORE.searchBeasts === "function" && typeof CORE.calculateInvestmentPlan === "function" &&
      typeof PLANNER.calculateSchoolPlans === "function" && typeof PLANNER.defaultTargetStage === "function" && typeof PLANNER.equivalentPlansPage === 'function' &&
      typeof CORE.normalizeReferenceCostSettings === "function" && typeof CORE.calculateReferenceCost === "function" && typeof CORE.calculateSchoolReferenceCost === "function";
  }

  function init() {
    var partition = document.getElementById("partition-machine-beasts");
    if (!partition || partition.dataset.machineInitialized === "true") return;
    el.partition = partition;
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
      showError("机关兽数据加载失败，请确认 data/machine-beasts.js、js/machine-beasts.js、js/machine-beast-equivalents.js 与 js/machine-beast-school-planner.js 存在。");
      return;
    }
    loadProgress();
    partition.dataset.machineInitialized = "true";
    partition.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-machine-jump]');
      if (!link) return;
      event.preventDefault();
      jumpTo(link.getAttribute('href').slice(1));
    });
    partition.addEventListener('toggle', function (event) {
      if (event.target.matches('details[data-detail-key]')) presentation.disclosures[event.target.dataset.detailKey] = event.target.open;
    }, true);
    resetCalculator(DATA.beasts[0].id);
    resetSchoolCalculator(DATA.schools[0].id);
    el.progressSearch.innerHTML = searchBar("progress", "搜索名称、品质、流派、研发效果或获取来源");
    el.calculatorSearch.innerHTML = searchBar("calculator", "搜索名称、品质、流派、研发效果或获取来源");
    el.referenceSearch.innerHTML = searchBar("reference", "仅搜索机关兽名称、品质、流派、效果或获取来源");
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
    el.calculator.addEventListener("toggle", function (event) {
      var picker = event.target;
      if (!picker.matches('[data-calc-target-picker]') || !picker.open) return;
      var select = picker.querySelector('[data-calc-target]');
      var bounds = picker.getBoundingClientRect();
      var listHeight = select.offsetHeight;
      picker.classList.toggle('is-above', window.innerHeight - bounds.bottom < listHeight && bounds.top > listHeight);
      select.focus({ preventScroll: true });
      select.scrollTop = Math.max(0, select.selectedIndex - Math.floor(select.size / 2)) * select.scrollHeight / select.options.length;
    }, true);
    el.calculator.addEventListener("click", function (event) {
      var select = event.target.closest('[data-calc-target]');
      if (!select || event.button !== 0) return;
      // A click on the scrollbar must keep the list open for further scrolling.
      if (event.clientX >= select.getBoundingClientRect().left + select.clientWidth) return;
      closeTargetPicker(true);
    });
    el.calculator.addEventListener("keydown", function (event) {
      if (!event.target.closest('[data-calc-target-picker][open]')) return;
      if (event.key === 'Escape' || (event.key === 'Enter' && event.target.matches('[data-calc-target]'))) {
        event.preventDefault();
        event.stopPropagation();
        closeTargetPicker(true);
      }
    });
    el.calculator.addEventListener("focusout", function (event) {
      var picker = event.target.closest('[data-calc-target-picker]');
      if (picker && event.relatedTarget && !picker.contains(event.relatedTarget)) closeTargetPicker(false);
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest('[data-calc-target-picker]')) closeTargetPicker(false);
    });
    el.calculator.addEventListener("focusout", function (event) {
      if (event.target.matches('[data-reference-cost-field], [data-reference-beast-price]') && state.referenceCostDirty) updateReferenceCost(event.target, true);
    });
    el.reference.addEventListener("click", handleReferenceClick);
    el.reference.addEventListener("input", handleReferenceInput);
    el.reference.addEventListener("change", function (event) {
      if (!event.target.matches('[data-research-quality], [data-research-rank]')) return;
      if (event.target.matches('[data-research-rank]')) presentation.researchRank = event.target.value;
      updateResearchQuickLookup();
    });
    [el.progress, el.calculator, el.reference].forEach(function (container) {
      container.addEventListener("compositionstart", handleSearchCompositionStart);
      container.addEventListener("compositionend", handleSearchCompositionEnd);
    });
    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "machine-beasts")) {
        cancelCalculation(false);
        Object.keys(calculationRunners).forEach(function (key) { calculationRunners[key].dispose(); });
        calculationRunners = {};
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
