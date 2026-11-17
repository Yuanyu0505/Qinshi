(function () {
  "use strict";

  var STORE_KEY = "qinshi_forbidden_needs_v2";
  var LEGACY_STORE_KEY = "qinshi_forbidden_needs_v1";
  var ACCOUNT_STORAGE = window.QinshiAccounts;
  var initialized = false;
  var data = null;
  var core = null;
  var elements = {};
  var partitionRendered = false;
  var purposeDraft = null;
  var identityCache = {};
  var occurrenceIdentityCache = {};
  var needsCache = {};
  var deferredRenderTimer = null;
  var historyCleanupTimer = null;
  var historyCleanupDay = "";
  var renderVersion = 0;
  var visibleCards = [];
  var searchRefresh = window.UI_PERFORMANCE.createRefreshQueue(render);
  var state = {
    query: "",
    size: "",
    purpose: "",
    selectedOnly: false,
    showSchedule: false,
    expanded: {},
    needsExpanded: {},
    needs: { version: 2, events: {} }
  };

  var SECTION_CONFIG = [
    { key: "contribution5", title: "贡献奖励 · 5W（任选1项）" },
    { key: "contribution10", title: "贡献奖励 · 10W（任选1项）" },
    { key: "rank1", rowsKey: "rank1Rows", choiceGroups: true, title: "排名奖励 · 第1名（每个分区任选1项）" },
    { key: "rank2", rowsKey: "rank2Rows", choiceGroups: true, title: "排名奖励 · 第2名（每个分区任选1项）" },
    { key: "rank3to10", rowsKey: "rank3to10Rows", choiceGroups: true, title: "排名奖励 · 第3—10名（每个分区任选1项）" },
    { key: "equipmentFragments", rowsKey: "equipmentFragmentRows", rowLabels: ["武器", "防具", "首饰"], title: "装备碎片" },
    { key: "machineBeasts", title: "机关兽碎片" },
    { key: "nuclei", title: "机关兽神核" },
    { key: "orangeDrops", title: "刷出橙装" }
  ];

  var PURPOSE_LABELS = {
    atlas: "图鉴",
    forging: "锻造",
    "machine-lineup": "上阵/流派",
    "machine-modification": "改造"
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? {} : value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function highlight(value) {
    var text = String(value == null ? "" : value);
    var query = String(state.query || "").trim();
    if (!query) return escapeHtml(text);
    var lower = text.toLowerCase();
    var needle = query.toLowerCase();
    var cursor = 0;
    var result = "";
    var index = lower.indexOf(needle);
    if (index < 0) return escapeHtml(text);
    while (index >= 0) {
      result += escapeHtml(text.slice(cursor, index));
      result += '<mark class="forbidden-match">' + escapeHtml(text.slice(index, index + query.length)) + "</mark>";
      cursor = index + query.length;
      index = lower.indexOf(needle, cursor);
    }
    result += escapeHtml(text.slice(cursor));
    return result;
  }

  function parseStored(key) {
    try {
      var value = ACCOUNT_STORAGE.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  function loadNeeds() {
    return core.normalizeNeedsV2(parseStored(STORE_KEY), parseStored(LEGACY_STORE_KEY), data);
  }

  function saveNeeds() {
    try {
      if (ACCOUNT_STORAGE.isReadOnly && ACCOUNT_STORAGE.isReadOnly()) throw new Error("当前账号为只读状态。");
      if (ACCOUNT_STORAGE.setItem(STORE_KEY, JSON.stringify(state.needs)) === false) throw new Error("当前账号不可写入。");
      showError("", false);
      return true;
    } catch (error) {
      showError("禁地需求未保存：" + error.message, true);
      return false;
    }
  }

  function writable() {
    return !(ACCOUNT_STORAGE.isReadOnly && ACCOUNT_STORAGE.isReadOnly());
  }

  function commitNeeds(previous) {
    if (saveNeeds()) return true;
    state.needs = previous;
    needsCache = {};
    return false;
  }

  function clearHistoricalSelections(today) {
    var removed = core.clearHistoricalNeeds(state.needs, data.occurrences, today || new Date());
    if (!removed.length) return false;
    invalidateNeeds(removed);
    saveNeeds();
    return true;
  }

  function scheduleHistoryCleanup() {
    if (historyCleanupTimer !== null) clearTimeout(historyCleanupTimer);
    var now = new Date();
    historyCleanupDay = now.toDateString();
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    historyCleanupTimer = setTimeout(function () {
      clearHistoricalSelections(new Date());
      if (elements.partition && !elements.partition.hidden) render();
      else partitionRendered = false;
      scheduleHistoryCleanup();
    }, Math.max(1000, tomorrow.getTime() - now.getTime()));
  }

  function captureScrollPosition() {
    var cards = elements.content
      ? Array.prototype.slice.call(elements.content.querySelectorAll("[data-forbidden-card]"))
      : [];
    var anchor = cards.reduce(function (closest, card) {
      var rect = card.getBoundingClientRect();
      var distance = Math.abs(rect.top);
      return !closest || distance < closest.distance
        ? { eventId: card.dataset.forbiddenCard, offset: rect.top, distance: distance }
        : closest;
    }, null);
    return {
      y: window.scrollY,
      eventId: anchor ? anchor.eventId : "",
      offset: anchor ? anchor.offset : 0
    };
  }

  function restoreScrollPosition(position, fallbackY) {
    var saved = position || {};
    function applyPosition() {
      var top = Number(saved.y);
      if (!Number.isFinite(top)) top = Number(fallbackY) || 0;
      if (saved.eventId && elements.content) {
        var anchor = Array.prototype.slice.call(elements.content.querySelectorAll("[data-forbidden-card]")).find(function (card) {
          return card.dataset.forbiddenCard === saved.eventId;
        });
        if (anchor) top = window.scrollY + anchor.getBoundingClientRect().top - (Number(saved.offset) || 0);
      }
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    }
    requestAnimationFrame(function () {
      applyPosition();
      requestAnimationFrame(applyPosition);
    });
  }

  function showError(message, visible) {
    if (!elements.error) return;
    elements.error.textContent = message || "";
    elements.error.hidden = !visible;
  }

  function dateParts(value) {
    var parts = String(value || "").split("-").map(Number);
    return { month: parts[1] || 0, day: parts[2] || 0 };
  }

  function formatRange(occurrence) {
    var start = dateParts(occurrence.start);
    var end = dateParts(occurrence.end);
    if (start.month === end.month) return start.month + "月" + start.day + "日—" + end.day + "日";
    return start.month + "月" + start.day + "日—" + end.month + "月" + end.day + "日";
  }

  function formatDisciple(disciple) {
    var attrs = [];
    if (disciple.base) attrs.push("本体" + disciple.base);
    if (disciple.divine) attrs.push("神" + disciple.divine);
    return disciple.name + (attrs.length ? "（" + attrs.join("／") + "）" : "");
  }

  function itemDisplayName(sectionKey, name) {
    return core.rewardDisplayName(sectionKey, name);
  }

  function resolvedIdentity(sectionKey, name) {
    var cacheKey = sectionKey + "\u0000" + name;
    if (identityCache[cacheKey]) return identityCache[cacheKey];
    var initial = core.rewardIdentity(sectionKey, name);
    if (initial.category !== "equipment" || !window.ItemNavigation) {
      identityCache[cacheKey] = initial;
      return initial;
    }
    var navigation = window.ItemNavigation.resolveItem(
      initial.baseName,
      window.SPECIAL_EQUIPMENT_DATA && window.SPECIAL_EQUIPMENT_DATA.items,
      window.FORGING_DATA && window.FORGING_DATA.items
    );
    identityCache[cacheKey] = core.rewardIdentity(sectionKey, name, navigation && navigation.familyKey);
    return identityCache[cacheKey];
  }

  function eventNeeds(occurrence) {
    if (!Object.prototype.hasOwnProperty.call(needsCache, occurrence.id)) {
      needsCache[occurrence.id] = core.eventNeeds(state.needs, occurrence.id);
    }
    return needsCache[occurrence.id];
  }

  function invalidateNeeds(eventIds) {
    (eventIds || []).forEach(function (eventId) { delete needsCache[eventId]; });
  }

  function resolvedOccurrenceIdentities(occurrence, category) {
    var cacheKey = occurrence.id + "\u0000" + category;
    if (!occurrenceIdentityCache[cacheKey]) {
      occurrenceIdentityCache[cacheKey] = core.occurrenceRewardIdentities(data, occurrence).filter(function (candidate) {
        return candidate.category === category;
      }).map(function (candidate) {
        return resolvedIdentity(candidate.sectionKey, candidate.rawName);
      });
    }
    return occurrenceIdentityCache[cacheKey];
  }

  function rewardRecord(occurrence, identity) {
    return eventNeeds(occurrence).rewards[identity.key] || null;
  }

  function discipleSelected(occurrence, name) {
    return eventNeeds(occurrence).disciples.some(function (item) {
      return core.normalize(item) === core.normalize(name);
    });
  }

  function tokenMatches(name, displayName) {
    var query = core.normalize(state.query);
    if (!query) return false;
    return core.normalize(name).indexOf(query) !== -1 || core.normalize(displayName).indexOf(query) !== -1;
  }

  function purposeMatches(record) {
    if (!state.purpose) return true;
    if (!record) return false;
    var purposes = record.purposes || [];
    return state.purpose === "unclassified" ? purposes.length === 0 : purposes.indexOf(state.purpose) !== -1;
  }

  function purposeBadgesHtml(record) {
    if (!record) return "";
    var purposes = record.purposes || [];
    if (!purposes.length) return '<span class="forbidden-purpose-badge is-unclassified">未分类</span>';
    return purposes.map(function (purpose) {
      return '<span class="forbidden-purpose-badge is-' + escapeHtml(purpose) + '">' + escapeHtml(PURPOSE_LABELS[purpose] || purpose) + "</span>";
    }).join("");
  }

  function tokenData(occurrence, type, name, sectionKey) {
    return ' data-forbidden-event="' + escapeHtml(occurrence.id) + '"' +
      ' data-forbidden-type="' + escapeHtml(type) + '"' +
      ' data-forbidden-name="' + escapeHtml(name) + '"' +
      (sectionKey ? ' data-forbidden-section="' + escapeHtml(sectionKey) + '"' : "");
  }

  function tokenHtml(occurrence, type, name, displayName, sectionKey, savedIdentity) {
    var shownName = displayName == null ? name : displayName;
    var selectable = core.statusFor(occurrence, new Date()) !== "history" && writable();
    var identity = type === "reward" ? (savedIdentity || resolvedIdentity(sectionKey, name)) : null;
    var record = identity ? rewardRecord(occurrence, identity) : null;
    var isSelected = type === "disciple" ? discipleSelected(occurrence, name) : Boolean(record);
    var isSearchHit = tokenMatches(name, shownName);
    var className = "forbidden-token" + (isSelected ? " is-selected" : "") + (isSearchHit ? " is-search-hit" : "") + (!selectable ? " is-history-disabled" : "");
    if (state.purpose) className += purposeMatches(record) ? " is-purpose-match" : " is-purpose-muted";
    var dataAttributes = tokenData(occurrence, type, name, sectionKey);
    return '<span class="' + className + '" data-forbidden-token>' +
      '<button type="button" class="forbidden-token-check" data-forbidden-select' + dataAttributes +
      ' aria-pressed="' + String(isSelected) + '" aria-label="' + escapeHtml((isSelected ? "取消勾选" : "勾选") + shownName) + '"' +
      (selectable ? "" : ' disabled') + '>' +
      (isSelected ? '<span aria-hidden="true">✓</span>' : '<span aria-hidden="true">＋</span>') + "</button>" +
      '<button type="button" class="forbidden-token-name" data-forbidden-name-action' + dataAttributes + ">" + highlight(shownName) + "</button>" +
      (record ? '<span class="forbidden-purpose-badges">' + purposeBadgesHtml(record) + "</span>" +
        '<button type="button" class="forbidden-purpose-edit" data-forbidden-purpose-edit' + dataAttributes + (selectable ? '' : ' disabled') + '>设置用途</button>' : "") +
      "</span>";
  }

  function requirementSummaryHtml(occurrence) {
    var entry = eventNeeds(occurrence);
    var rewardKeys = Object.keys(entry.rewards);
    if (!entry.disciples.length && !rewardKeys.length) {
      return '<section class="forbidden-needs is-empty"><span class="muted-tip">本期暂无已勾选需求</span></section>';
    }
    var discipleTokens = entry.disciples.map(function (name) {
      return tokenHtml(occurrence, "disciple", name, name);
    }).join("");
    var itemTokens = rewardKeys.map(function (key) {
      var record = entry.rewards[key];
      return tokenHtml(occurrence, "reward", record.rawName || record.name, record.name, record.sectionKey || "legacy", record);
    }).join("");
    return '<details class="forbidden-needs" data-forbidden-needs="' + escapeHtml(occurrence.id) + '"' + (state.needsExpanded[occurrence.id] ? ' open' : '') + '><summary><span>个人需求 · 弟子 ' + entry.disciples.length + ' · 奖励道具 ' + rewardKeys.length + '</span><span class="forbidden-needs-toggle">' + (state.needsExpanded[occurrence.id] ? '收起明细' : '查看明细') + '</span></summary><div class="forbidden-needs-detail">' +
      (discipleTokens ? '<div class="forbidden-need-line"><span>需要的弟子</span><div class="forbidden-token-list">' + discipleTokens + "</div></div>" : "") +
      (itemTokens ? '<div class="forbidden-need-line"><span>需要的奖励道具</span><div class="forbidden-token-list">' + itemTokens + "</div></div>" : "") +
      "</div></details>";
  }

  function rewardSectionHtml(occurrence, resolved, config, matches) {
    var items = resolved[config.key] || [];
    var isMatch = matches.indexOf(config.key) !== -1;
    function renderTokens(row) {
      return (row || []).map(function (name) {
        return tokenHtml(occurrence, "reward", name, itemDisplayName(config.key, name), config.key);
      }).join("");
    }
    var contribution = config.key === "contribution5" || config.key === "contribution10";
    var choiceLabel = '<span class="forbidden-choice-label">任选1项</span>';
    var body = '<div class="forbidden-token-list">' + (renderTokens(items) || '<span class="muted-tip">—</span>') + "</div>";
    if (config.rowsKey) {
      var rows = resolved[config.rowsKey] || [];
      body = '<div class="forbidden-reward-rows">' + rows.map(function (row, index) {
        var label = config.rowLabels && config.rowLabels[index]
          ? '<span class="forbidden-reward-row-label">' + escapeHtml(config.rowLabels[index]) + "</span>"
          : "";
        return '<div class="forbidden-reward-row' + (label ? " has-label" : "") + (config.choiceGroups ? " is-choice-group" : "") + '">' + label + (config.choiceGroups ? choiceLabel : '') + '<div class="forbidden-token-list">' + (renderTokens(row) || '<span class="muted-tip">—</span>') + "</div></div>";
      }).join("") + "</div>";
    }
    return '<section class="forbidden-reward-section' + (isMatch ? " is-match" : "") + '">' +
      '<div class="forbidden-subtitle">' + escapeHtml(config.title.replace(/（.*）$/, "").replace(/^(贡献奖励|排名奖励) · /, "")) + (contribution ? choiceLabel : '') + "</div>" + body + "</section>";
  }

  function rewardMatch(matches) {
    return SECTION_CONFIG.some(function (config) { return matches.indexOf(config.key) !== -1; });
  }

  function matchReasonHtml(matches) {
    if (!state.query || !matches.length) return "";
    var labels = [];
    if (matches.indexOf("meta") !== -1) labels.push("日期／类型");
    if (matches.indexOf("disciples") !== -1) labels.push("禁地弟子");
    SECTION_CONFIG.forEach(function (config) {
      if (matches.indexOf(config.key) !== -1) labels.push(config.title);
    });
    return '<div class="forbidden-match-reason"><span>匹配位置</span>' + escapeHtml(core.unique(labels).join("、")) + "</div>";
  }

  function expandedFor(occurrence, matches, role) {
    if (Object.prototype.hasOwnProperty.call(state.expanded, occurrence.id)) return state.expanded[occurrence.id];
    if (state.query && rewardMatch(matches)) return true;
    return role === "current";
  }

  function statusLabel(occurrence, role) {
    if (role === "next") return "下一期";
    if (role === "latest") return "最近一期";
    var status = core.statusFor(occurrence, new Date());
    if (status === "current") return "当前开放";
    if (status === "future") return "即将开放";
    return "历史";
  }

  function cardHtml(occurrence, matches, role) {
    if (core.statusFor(occurrence, new Date()) === 'history') return '';
    var resolved = core.resolveTemplate(data, occurrence);
    if (!resolved) return "";
    var expanded = expandedFor(occurrence, matches, role);
    var discipleTokens = (occurrence.disciples || []).map(function (disciple) {
      return tokenHtml(occurrence, "disciple", disciple.name, formatDisciple(disciple));
    }).join("");
    var rewardSections = expanded ? [SECTION_CONFIG.slice(0, 2), SECTION_CONFIG.slice(2, 5), SECTION_CONFIG.slice(5)].map(function (configs, index) {
      return '<section class="forbidden-reward-group"><h3>' + ["贡献奖励", "排名奖励", "材料与其他奖励"][index] + '</h3><div class="forbidden-reward-grid is-' + ["contribution", "ranking", "materials"][index] + '">' + configs.map(function (config) {
        return rewardSectionHtml(occurrence, resolved, config, matches);
      }).join("") + '</div></section>';
    }).join("") : "";
    var hasMetaMatch = matches.indexOf("meta") !== -1;
    var hasDiscipleMatch = matches.indexOf("disciples") !== -1;
    return '<article class="forbidden-card' + (hasMetaMatch || hasDiscipleMatch ? " is-search-match" : "") + '" data-forbidden-card="' + escapeHtml(occurrence.id) + '" data-forbidden-role="' + escapeHtml(role) + '">' +
      '<header class="forbidden-card-head"><div><h2 class="forbidden-date">' + highlight(formatRange(occurrence)) + '</h2><span class="forbidden-status">' + escapeHtml(statusLabel(occurrence, role)) + "</span>" +
      '<span class="forbidden-size forbidden-size-' + escapeHtml(occurrence.size) + '">' + escapeHtml(occurrence.size + "禁地") + "</span></div>" +
      '<button type="button" class="seg forbidden-expand" data-forbidden-expand="' + escapeHtml(occurrence.id) + '" aria-expanded="' + String(expanded) + '">' + (expanded ? "收起奖励" : "展开奖励") + "</button></header>" +
      matchReasonHtml(matches) +
      '<section class="forbidden-disciples' + (hasDiscipleMatch ? " is-match" : "") + '"><div class="forbidden-subtitle">禁地弟子</div><div class="forbidden-token-list">' + discipleTokens + "</div></section>" +
      (occurrence.note ? '<p class="muted-tip">' + escapeHtml(occurrence.note) + '</p>' : '') +
      requirementSummaryHtml(occurrence) +
      (expanded ? '<div class="forbidden-rewards">' + rewardSections + "</div>" : "") + "</article>";
  }

  function noticeHtml(text) {
    return '<div class="forbidden-notice">' + escapeHtml(text) + "</div>";
  }

  function defaultViewModel() {
    var view = core.getDefaultView(data.occurrences, new Date());
    var cards = [];
    var entries = [];
    var notice = "";
    if (view.current) entries.push({ occurrence: view.current, matches: [], role: "current" });
    else if (view.beforeSchedule) notice = noticeHtml("当前暂无开放禁地，以下为首期预测。");
    else if (view.afterSchedule) notice = noticeHtml("暂无后续预测数据。");
    else notice = noticeHtml("当前暂无开放禁地。");
    if (view.next) entries.push({ occurrence: view.next, matches: [], role: "next" });
    entries.forEach(function (entry) {
      cards.push(cardHtml(entry.occurrence, entry.matches, entry.role));
    });
    return {
      entries: entries,
      html: notice + '<div class="forbidden-featured-grid">' + cards.join("") + "</div>"
    };
  }

  function listResults() {
    var results = core.filterOccurrences(data, {
      query: state.query,
      size: state.size,
      purpose: state.purpose,
      selectedOnly: state.selectedOnly,
      needs: state.needs,
      today: new Date()
    });
    return results.filter(function (entry) { return core.statusFor(entry.occurrence, new Date()) !== 'history'; });
  }

  function listHeaderHtml(results) {
    var title = state.query ? "搜索结果" : state.purpose ? "用途筛选结果" : state.selectedOnly ? "已勾选禁地" : state.size ? state.size + "禁地" : "完整预测表";
    return '<div class="forbidden-list-head"><strong>' + escapeHtml(title) + '</strong><span>共 ' + results.length + " 期</span></div>";
  }

  function cancelDeferredRender() {
    renderVersion += 1;
    if (deferredRenderTimer !== null) clearTimeout(deferredRenderTimer);
    deferredRenderTimer = null;
  }

  function renderListIncrementally(results, onComplete) {
    if (!results.length) {
      elements.content.innerHTML = '<div class="forbidden-empty">未找到相关禁地信息</div>';
      if (typeof onComplete === "function") onComplete();
      return;
    }
    elements.content.innerHTML = listHeaderHtml(results) + '<div class="forbidden-list" data-forbidden-progressive-list></div>';
    var list = elements.content.querySelector("[data-forbidden-progressive-list]");
    var version = renderVersion;
    var index = 0;
    var batchSize = 2;
    function appendBatch() {
      if (version !== renderVersion || !list || !document.contains(list)) return;
      var end = Math.min(index + batchSize, results.length);
      var html = "";
      while (index < end) {
        html += cardHtml(results[index].occurrence, results[index].matches, "list");
        index += 1;
      }
      list.insertAdjacentHTML("beforeend", html);
      if (index < results.length) deferredRenderTimer = setTimeout(appendBatch, 0);
      else {
        deferredRenderTimer = null;
        if (typeof onComplete === "function") onComplete();
      }
    }
    appendBatch();
  }

  function updateControls() {
    elements.sizeFilter.querySelectorAll("[data-forbidden-size]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.forbiddenSize === state.size);
    });
    elements.purposeFilter.querySelectorAll("[data-forbidden-purpose]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.forbiddenPurpose === state.purpose);
    });
    elements.selectedOnly.checked = state.selectedOnly;
    elements.scheduleToggle.classList.toggle("active", state.showSchedule);
    elements.scheduleToggle.setAttribute("aria-pressed", String(state.showSchedule));
    elements.scheduleToggle.textContent = state.showSchedule ? "收起完整预测表" : "查看完整预测表";
  }

  function updateExpandAllControl() {
    if (!elements.expandAll) return;
    var hasCards = visibleCards.length > 0;
    var allExpanded = hasCards && visibleCards.every(function (entry) {
      return expandedFor(entry.occurrence, entry.matches, entry.role);
    });
    elements.expandAll.disabled = !hasCards;
    elements.expandAll.classList.toggle("active", allExpanded);
    elements.expandAll.setAttribute("aria-pressed", String(allExpanded));
    elements.expandAll.textContent = allExpanded ? "收起全部奖励" : "展开全部奖励";
  }

  function toggleAllVisibleRewards() {
    var expand = !visibleCards.every(function (entry) {
      return expandedFor(entry.occurrence, entry.matches, entry.role);
    });
    visibleCards.forEach(function (entry) {
      state.expanded[entry.occurrence.id] = expand;
    });
    render();
  }

  function render(onComplete) {
    searchRefresh.cancel();
    if (!elements.content) return;
    clearHistoricalSelections(new Date());
    cancelDeferredRender();
    needsCache = {};
    updateControls();
    var listMode = Boolean(state.query || state.size || state.purpose || state.selectedOnly || state.showSchedule);
    if (listMode) {
      var results = listResults();
      visibleCards = results.map(function (result) {
        return { occurrence: result.occurrence, matches: result.matches, role: "list" };
      });
      updateExpandAllControl();
      renderListIncrementally(results, onComplete);
    } else {
      var model = defaultViewModel();
      visibleCards = model.entries;
      updateExpandAllControl();
      elements.content.innerHTML = model.html;
      if (typeof onComplete === "function") onComplete();
    }
    partitionRendered = true;
  }

  function cardNode(html) {
    var template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function refreshOccurrenceCards(eventIds) {
    var focused = document.activeElement;
    var focusPosition = controlPosition(focused);
    var focusCard = focused && focused.closest("[data-forbidden-card]");
    var focusData = focusCard ? Object.assign({}, focused.dataset) : null;
    var focusEvent = focusCard && focusCard.dataset.forbiddenCard;
    var ids = core.unique(eventIds || []);
    if (!ids.length) return;
    invalidateNeeds(ids);
    Array.prototype.slice.call(elements.content.querySelectorAll("[data-forbidden-card]")).forEach(function (card) {
      if (ids.indexOf(card.dataset.forbiddenCard) === -1) return;
      var occurrence = occurrenceById(card.dataset.forbiddenCard);
      if (!occurrence) return;
      var matches = state.query ? core.findMatches(data, occurrence, state.query) : [];
      var replacement = cardNode(cardHtml(occurrence, matches, card.dataset.forbiddenRole || "list"));
      if (replacement) card.replaceWith(replacement);
    });
    if (focusData && !document.contains(focused)) restoreControlFocus(focusEvent, focusData, focusPosition);
  }

  function controlPosition(control) {
    if (!control || !control.closest) return '';
    return ['forbidden-needs', 'forbidden-rewards', 'forbidden-disciples'].find(function (name) { return control.closest('.' + name); }) || '';
  }

  function restoreControlFocus(eventId, attributes, position) {
    var controls = elements.content.querySelectorAll("button");
    var replacement = Array.prototype.find.call(controls, function (button) {
      var card = button.closest("[data-forbidden-card]");
      return card && card.dataset.forbiddenCard === eventId && (!position || button.closest('.' + position)) && Object.keys(attributes).every(function (key) { return button.dataset[key] === attributes[key]; });
    });
    (replacement || elements.search).focus({ preventScroll: true });
  }

  function refreshAfterNeedsChange(eventIds, onComplete) {
    if (state.purpose || state.selectedOnly) {
      var focused = document.activeElement, card = focused && focused.closest('[data-forbidden-card]');
      var attributes = card && Object.assign({}, focused.dataset), eventId = card && card.dataset.forbiddenCard;
      var position = controlPosition(focused);
      render(function () {
        if (typeof onComplete === 'function') onComplete();
        else if (attributes) restoreControlFocus(eventId, attributes, position);
      });
      return;
    }
    refreshOccurrenceCards(eventIds);
    if (typeof onComplete === 'function') onComplete();
  }

  function captureView() {
    return {
      query: state.query,
      size: state.size,
      purpose: state.purpose,
      selectedOnly: state.selectedOnly,
      showSchedule: state.showSchedule,
      expanded: clone(state.expanded),
      needsExpanded: clone(state.needsExpanded),
      scrollPosition: captureScrollPosition()
    };
  }

  function restoreView(view, onComplete) {
    var saved = view || {};
    state.query = String(saved.query || "");
    state.size = String(saved.size || "");
    state.purpose = String(saved.purpose || "");
    state.selectedOnly = Boolean(saved.selectedOnly);
    state.showSchedule = Boolean(saved.showSchedule);
    state.expanded = clone(saved.expanded);
    state.needsExpanded = clone(saved.needsExpanded);
    if (elements.search) elements.search.value = state.query;
    render(onComplete);
  }

  function applyNavigationQuery(name) {
    state.query = String(name == null ? "" : name).trim();
    state.size = "";
    state.purpose = "";
    state.selectedOnly = false;
    state.showSchedule = false;
    state.expanded = {};
    if (elements.search) elements.search.value = state.query;
    render();
    return captureView();
  }

  function occurrenceById(eventId) {
    return (data.occurrences || []).find(function (occurrence) { return occurrence.id === eventId; }) || null;
  }

  function identityFromControl(control) {
    return resolvedIdentity(control.dataset.forbiddenSection || "legacy", control.dataset.forbiddenName || "");
  }

  function toggleSelection(control) {
    if (!writable()) { showError("禁地需求未保存：当前账号为只读状态。", true); return; }
    var occurrence = occurrenceById(control.dataset.forbiddenEvent);
    if (!occurrence) return;
    if (core.statusFor(occurrence, new Date()) === "history") return;
    var type = control.dataset.forbiddenType;
    var changedEventIds = [occurrence.id];
    var previous = clone(state.needs);
    if (type === "disciple") {
      var selectedDisciple = discipleSelected(occurrence, control.dataset.forbiddenName);
      core.setDiscipleSelection(state.needs, occurrence.id, control.dataset.forbiddenName, !selectedDisciple);
    } else {
      var identity = identityFromControl(control);
      var selectedReward = rewardRecord(occurrence, identity);
      core.setRewardSelection(state.needs, occurrence.id, identity, !selectedReward, core.defaultPurposes(identity.category));
    }
    commitNeeds(previous);
    refreshAfterNeedsChange(changedEventIds);
  }

  function positionPurposeDialog(trigger) {
    var dialog = elements.purposeEditor.querySelector(".forbidden-purpose-dialog");
    dialog.style.left = "";
    dialog.style.top = "";
    dialog.style.width = "";
    dialog.style.transform = "";
    if (window.matchMedia("(max-width: 640px)").matches || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    var width = Math.min(430, window.innerWidth - 24);
    var left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    dialog.style.width = width + "px";
    dialog.style.left = left + "px";
    dialog.style.transform = "none";
    var top = Math.min(rect.bottom + 8, window.innerHeight - dialog.offsetHeight - 12);
    dialog.style.top = Math.max(12, top) + "px";
  }

  function openPurposeEditor(control) {
    if (!writable()) { showError("当前账号为只读状态。", true); return; }
    var occurrence = occurrenceById(control.dataset.forbiddenEvent);
    if (!occurrence || core.statusFor(occurrence, new Date()) === "history") return;
    var identity = identityFromControl(control);
    var record = rewardRecord(occurrence, identity);
    if (!record) return;
    purposeDraft = {
      eventId: occurrence.id,
      identity: Object.assign({}, identity, record),
      purposes: (record.purposes || []).slice(),
      position: controlPosition(control),
      trigger: control
    };
    elements.purposeTitle.textContent = record.name;
    elements.purposeOptions.innerHTML = core.allowedPurposes(record.category).map(function (purpose) {
      return '<label class="forbidden-purpose-option is-' + escapeHtml(purpose) + '"><input type="checkbox" value="' + escapeHtml(purpose) + '"' +
        (purposeDraft.purposes.indexOf(purpose) !== -1 ? " checked" : "") + "><span>" + escapeHtml(PURPOSE_LABELS[purpose]) + "</span></label>";
    }).join("");
    var eventScope = elements.purposeEditor.querySelector('input[name="forbidden-purpose-scope"][value="event"]');
    if (elements.purposeFamilyLabel) {
      elements.purposeFamilyLabel.textContent = record.category === "machine-beast"
        ? "本期及之后每一期（同机关兽系列）"
        : record.category === "nucleus"
          ? "本期及之后每一期（同机关兽神核系列）"
          : "本期及之后每一期（同装备系列）";
    }
    if (eventScope) eventScope.checked = true;
    elements.purposeEditor.querySelector('[data-forbidden-purpose-error]').hidden = true;
    elements.purposeEditor.hidden = false;
    positionPurposeDialog(control);
    var first = elements.purposeOptions.querySelector("input");
    if (first) first.focus();
  }

  function closePurposeEditor(restoreFocus) {
    if (!elements.purposeEditor || elements.purposeEditor.hidden) return;
    var trigger = purposeDraft && purposeDraft.trigger;
    var position = purposeDraft && purposeDraft.position;
    elements.purposeEditor.hidden = true;
    purposeDraft = null;
    if (restoreFocus && trigger && document.contains(trigger)) trigger.focus();
    else if (restoreFocus && trigger) restoreControlFocus(trigger.dataset.forbiddenEvent, trigger.dataset, position);
  }

  function purposeScope() {
    var selected = elements.purposeEditor.querySelector('input[name="forbidden-purpose-scope"]:checked');
    return selected ? selected.value : "event";
  }

  function selectedPurposes() {
    return Array.prototype.slice.call(elements.purposeOptions.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) {
      return input.value;
    });
  }

  function applyFamilySelection(identity, selected, purposes, sourceEventId) {
    var changedEventIds = [];
    var source = occurrenceById(sourceEventId);
    var today = new Date();
    (data.occurrences || []).forEach(function (occurrence) {
      if (!core.canSyncOccurrence(occurrence, source, today)) return;
      resolvedOccurrenceIdentities(occurrence, identity.category).forEach(function (resolved) {
        if (resolved.category === identity.category && resolved.familyKey === identity.familyKey) {
          core.setRewardSelection(state.needs, occurrence.id, resolved, selected, purposes);
          changedEventIds.push(occurrence.id);
        }
      });
    });
    return core.unique(changedEventIds);
  }

  function savePurposeEditor(selected) {
    if (!purposeDraft) return;
    var occurrence = occurrenceById(purposeDraft.eventId);
    if (!occurrence || core.statusFor(occurrence, new Date()) === "history") {
      closePurposeEditor(false);
      render();
      return;
    }
    var purposes = selected ? selectedPurposes() : [];
    var previous = clone(state.needs);
    var changedEventIds = [purposeDraft.eventId];
    if (purposeScope() === "family") changedEventIds = applyFamilySelection(purposeDraft.identity, selected, purposes, purposeDraft.eventId);
    else core.setRewardSelection(state.needs, purposeDraft.eventId, purposeDraft.identity, selected, purposes);
    if (!commitNeeds(previous)) {
      var message = elements.purposeEditor.querySelector('[data-forbidden-purpose-error]');
      message.textContent = elements.error.textContent;
      message.hidden = false;
      return;
    }
    var trigger = purposeDraft.trigger;
    var position = purposeDraft.position;
    closePurposeEditor(false);
    refreshAfterNeedsChange(changedEventIds, function () {
      restoreControlFocus(trigger.dataset.forbiddenEvent, trigger.dataset, position);
    });
  }

  function dispatchNavigation(control) {
    var type = control.dataset.forbiddenType;
    var name = control.dataset.forbiddenName || "";
    var detail;
    if (type === "disciple") {
      detail = {
        kind: "disciple",
        name: name,
        label: name,
        targets: core.discipleAtlasTargets(data, name),
        trigger: control
      };
    } else {
      var identity = identityFromControl(control);
      if (identity.category === "machine-beast" || identity.category === "nucleus") {
        detail = {
          kind: "machine-beast",
          name: core.machineBeastTarget(identity.rawName),
          label: identity.name,
          trigger: control
        };
      } else {
        detail = {
          kind: "equipment",
          name: identity.baseName,
          label: identity.name,
          trigger: control
        };
      }
    }
    document.dispatchEvent(new CustomEvent("qinshi:forbidden-navigate", { detail: detail }));
  }

  function bindEvents() {
    window.UI_PERFORMANCE.bindInput(elements.search, function () {
      state.query = elements.search.value;
      state.expanded = {};
    }, searchRefresh);
    elements.sizeFilter.addEventListener("click", function (event) {
      var button = event.target.closest("[data-forbidden-size]");
      if (!button) return;
      state.size = button.dataset.forbiddenSize || "";
      render();
    });
    elements.purposeFilter.addEventListener("click", function (event) {
      var button = event.target.closest("[data-forbidden-purpose]");
      if (!button) return;
      state.purpose = button.dataset.forbiddenPurpose || "";
      render();
    });
    elements.selectedOnly.addEventListener("change", function () {
      state.selectedOnly = elements.selectedOnly.checked;
      render();
    });
    elements.scheduleToggle.addEventListener("click", function () {
      state.showSchedule = !state.showSchedule;
      render();
    });
    elements.expandAll.addEventListener("click", toggleAllVisibleRewards);
    elements.content.addEventListener('toggle', function (event) {
      var details = event.target;
      if (!details.hasAttribute('data-forbidden-needs')) return;
      // Ignore replaced nodes whose queued toggle event no longer belongs to this view.
      if (!elements.content.contains(details)) return;
      state.needsExpanded[details.dataset.forbiddenNeeds] = details.open;
      details.querySelector('.forbidden-needs-toggle').textContent = details.open ? '收起明细' : '查看明细';
    }, true);
    elements.content.addEventListener("click", function (event) {
      var selectButton = event.target.closest("[data-forbidden-select]");
      if (selectButton) {
        toggleSelection(selectButton);
        return;
      }
      var purposeButton = event.target.closest("[data-forbidden-purpose-edit]");
      if (purposeButton) {
        openPurposeEditor(purposeButton);
        return;
      }
      var nameButton = event.target.closest("[data-forbidden-name-action]");
      if (nameButton) {
        dispatchNavigation(nameButton);
        return;
      }
      var expandButton = event.target.closest("[data-forbidden-expand]");
      if (expandButton) {
        var id = expandButton.dataset.forbiddenExpand;
        state.expanded[id] = expandButton.getAttribute("aria-expanded") !== "true";
        refreshOccurrenceCards([id]);
        updateExpandAllControl();
      }
    });
    elements.purposeEditor.addEventListener("click", function (event) {
      if (event.target.closest("[data-forbidden-purpose-save]")) {
        savePurposeEditor(true);
        return;
      }
      if (event.target.closest("[data-forbidden-purpose-remove]")) {
        savePurposeEditor(false);
        return;
      }
      if (event.target.closest("[data-forbidden-purpose-close]")) closePurposeEditor(true);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.purposeEditor.hidden) closePurposeEditor(true);
      if (event.key === "Tab" && !elements.purposeEditor.hidden) {
        var controls = elements.purposeEditor.querySelector('.forbidden-purpose-dialog').querySelectorAll('button:not(:disabled),input:not(:disabled)');
        var first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !elements.purposeEditor.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("resize", function () {
      if (purposeDraft && !elements.purposeEditor.hidden) positionPurposeDialog(purposeDraft.trigger);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    data = window.FORBIDDEN_DATA;
    core = window.FORBIDDEN;
    elements = {
      partition: document.getElementById("partition-forbidden"),
      search: document.getElementById("forbidden-search"),
      sizeFilter: document.getElementById("forbidden-size-filter"),
      purposeFilter: document.getElementById("forbidden-purpose-filter"),
      selectedOnly: document.getElementById("forbidden-selected-only"),
      scheduleToggle: document.getElementById("forbidden-schedule-toggle"),
      expandAll: document.getElementById("forbidden-expand-all"),
      content: document.getElementById("forbidden-content"),
      error: document.getElementById("forbidden-error"),
      purposeEditor: document.getElementById("forbidden-purpose-editor"),
      purposeTitle: document.getElementById("forbidden-purpose-title"),
      purposeOptions: document.getElementById("forbidden-purpose-options"),
      purposeFamilyLabel: document.getElementById("forbidden-purpose-family-label")
    };
    if (!data || !core || !elements.partition || !elements.content || !elements.purposeFilter || !elements.expandAll || !elements.purposeEditor) {
      showError("禁地数据加载失败，请确认相关数据和脚本文件存在。", true);
      return;
    }
    state.needs = loadNeeds();
    clearHistoricalSelections(new Date());
    saveNeeds();
    scheduleHistoryCleanup();
    bindEvents();
    elements.partition.addEventListener("click", function (event) {
      var button = event.target.closest('[data-forbidden-module]');
      if (!button) return;
      searchRefresh.cancel();
      cancelDeferredRender();
      partitionRendered = false;
      if (button.dataset.forbiddenModule === 'forbidden') render();
    });
    var lastWritable = writable();
    if (ACCOUNT_STORAGE.subscribeAccess) ACCOUNT_STORAGE.subscribeAccess(function (access) {
      var account = ACCOUNT_STORAGE.currentAccount();
      if (!account || account.id !== access.accountId || access.writable === lastWritable) return;
      lastWritable = access.writable;
      closePurposeEditor(false);
      if (!elements.partition.hidden && !document.getElementById('forbidden-main-panel').hidden) render();
      else partitionRendered = false;
    });
    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "forbidden")) {
        searchRefresh.cancel();
        cancelDeferredRender();
        partitionRendered = false;
        if (!elements.purposeEditor.hidden) closePurposeEditor(false);
        return;
      }
      clearHistoricalSelections(new Date());
      if (!partitionRendered) render();
    }
    document.addEventListener("qinshi:partitionchange", activatePartition);
    function refreshHistoricalSelections() {
      if (document.hidden) return;
      var now = new Date();
      var changedDay = historyCleanupDay !== now.toDateString();
      var removed = clearHistoricalSelections(now);
      if (removed || changedDay) {
        closePurposeEditor(false);
        if (!elements.partition.hidden) render();
        else partitionRendered = false;
      }
      scheduleHistoryCleanup();
    }
    document.addEventListener("visibilitychange", refreshHistoricalSelections);
    window.addEventListener("pageshow", refreshHistoricalSelections);
    if (!elements.partition.hidden) activatePartition();
  }

  window.FORBIDDEN_UI = {
    closePurposeEditor: function () { closePurposeEditor(false); },
    init: init,
    captureView: captureView,
    restoreView: restoreView,
    restoreScrollPosition: restoreScrollPosition,
    applyNavigationQuery: applyNavigationQuery
  };
})();
