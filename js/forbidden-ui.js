(function () {
  "use strict";

  var STORE_KEY = "qinshi_forbidden_needs_v2";
  var LEGACY_STORE_KEY = "qinshi_forbidden_needs_v1";
  var initialized = false;
  var data = null;
  var core = null;
  var elements = {};
  var partitionRendered = false;
  var purposeDraft = null;
  var searchRefresh = window.UI_PERFORMANCE.createRefreshQueue(render);
  var state = {
    query: "",
    size: "",
    purpose: "",
    selectedOnly: false,
    showSchedule: false,
    expanded: {},
    needs: { version: 2, events: {} }
  };

  var SECTION_CONFIG = [
    { key: "contribution5", title: "贡献奖励 · 5W" },
    { key: "contribution10", title: "贡献奖励 · 10W" },
    { key: "rank1", rowsKey: "rank1Rows", title: "排名奖励 · 第1名（每行任选一项）" },
    { key: "rank2", rowsKey: "rank2Rows", title: "排名奖励 · 第2名（每行任选一项）" },
    { key: "rank3to10", rowsKey: "rank3to10Rows", title: "排名奖励 · 第3—10名（每行任选一项）" },
    { key: "equipmentFragments", rowsKey: "equipmentFragmentRows", rowLabels: ["武器", "防具", "首饰"], title: "装备碎片" },
    { key: "machineBeasts", title: "机关兽" },
    { key: "nuclei", title: "神核" },
    { key: "orangeDrops", title: "刷出橙装" }
  ];

  var PURPOSE_LABELS = {
    atlas: "图鉴",
    forging: "锻造",
    "machine-beasts": "机关兽"
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
      var value = localStorage.getItem(key);
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
      localStorage.setItem(STORE_KEY, JSON.stringify(state.needs));
    } catch (error) {
      showError("禁地需求未能保存到本机浏览器，本次页面内操作仍可继续。", true);
    }
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
    return sectionKey === "equipmentFragments" ? name + "碎片" : name;
  }

  function resolvedIdentity(sectionKey, name) {
    var initial = core.rewardIdentity(sectionKey, name);
    if (initial.category !== "equipment" || !window.ItemNavigation) return initial;
    var navigation = window.ItemNavigation.resolveItem(
      initial.baseName,
      window.SPECIAL_EQUIPMENT_DATA && window.SPECIAL_EQUIPMENT_DATA.items,
      window.FORGING_DATA && window.FORGING_DATA.items
    );
    return core.rewardIdentity(sectionKey, name, navigation && navigation.familyKey);
  }

  function eventNeeds(occurrence) {
    return core.eventNeeds(state.needs, occurrence.id);
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
    var identity = type === "reward" ? (savedIdentity || resolvedIdentity(sectionKey, name)) : null;
    var record = identity ? rewardRecord(occurrence, identity) : null;
    var isSelected = type === "disciple" ? discipleSelected(occurrence, name) : Boolean(record);
    var isSearchHit = tokenMatches(name, shownName);
    var className = "forbidden-token" + (isSelected ? " is-selected" : "") + (isSearchHit ? " is-search-hit" : "");
    if (state.purpose) className += purposeMatches(record) ? " is-purpose-match" : " is-purpose-muted";
    var dataAttributes = tokenData(occurrence, type, name, sectionKey);
    return '<span class="' + className + '" data-forbidden-token>' +
      '<button type="button" class="forbidden-token-check" data-forbidden-select' + dataAttributes +
      ' aria-pressed="' + String(isSelected) + '" aria-label="' + escapeHtml((isSelected ? "取消勾选" : "勾选") + shownName) + '">' +
      (isSelected ? '<span aria-hidden="true">✓</span>' : '<span aria-hidden="true">＋</span>') + "</button>" +
      '<button type="button" class="forbidden-token-name" data-forbidden-name-action' + dataAttributes + ">" + highlight(shownName) + "</button>" +
      (record ? '<span class="forbidden-purpose-badges">' + purposeBadgesHtml(record) + "</span>" +
        '<button type="button" class="forbidden-purpose-edit" data-forbidden-purpose-edit' + dataAttributes + '>设置用途</button>' : "") +
      "</span>";
  }

  function requirementSummaryHtml(occurrence) {
    var entry = eventNeeds(occurrence);
    var rewardKeys = Object.keys(entry.rewards);
    if (!entry.disciples.length && !rewardKeys.length) {
      return '<section class="forbidden-needs"><div class="forbidden-subtitle">本期需求</div><div class="muted-tip">本期暂无已勾选需求</div></section>';
    }
    var discipleTokens = entry.disciples.map(function (name) {
      return tokenHtml(occurrence, "disciple", name, name);
    }).join("");
    var itemTokens = rewardKeys.map(function (key) {
      var record = entry.rewards[key];
      return tokenHtml(occurrence, "reward", record.rawName || record.name, record.name, record.sectionKey || "legacy", record);
    }).join("");
    return '<section class="forbidden-needs"><div class="forbidden-subtitle">本期需求</div>' +
      (discipleTokens ? '<div class="forbidden-need-line"><span>需要的弟子</span><div class="forbidden-token-list">' + discipleTokens + "</div></div>" : "") +
      (itemTokens ? '<div class="forbidden-need-line"><span>需要的奖励道具</span><div class="forbidden-token-list">' + itemTokens + "</div></div>" : "") +
      "</section>";
  }

  function rewardSectionHtml(occurrence, resolved, config, matches) {
    var items = resolved[config.key] || [];
    var isMatch = matches.indexOf(config.key) !== -1;
    function renderTokens(row) {
      return (row || []).map(function (name) {
        return tokenHtml(occurrence, "reward", name, itemDisplayName(config.key, name), config.key);
      }).join("");
    }
    var body = '<div class="forbidden-token-list">' + (renderTokens(items) || '<span class="muted-tip">—</span>') + "</div>";
    if (config.rowsKey) {
      var rows = resolved[config.rowsKey] || [];
      body = '<div class="forbidden-reward-rows">' + rows.map(function (row, index) {
        var label = config.rowLabels && config.rowLabels[index]
          ? '<span class="forbidden-reward-row-label">' + escapeHtml(config.rowLabels[index]) + "</span>"
          : "";
        return '<div class="forbidden-reward-row' + (label ? " has-label" : "") + '">' + label + '<div class="forbidden-token-list">' + (renderTokens(row) || '<span class="muted-tip">—</span>') + "</div></div>";
      }).join("") + "</div>";
    }
    return '<section class="forbidden-reward-section' + (isMatch ? " is-match" : "") + '">' +
      '<div class="forbidden-subtitle">' + escapeHtml(config.title) + "</div>" + body + "</section>";
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
    var resolved = core.resolveTemplate(data, occurrence);
    if (!resolved) return "";
    var expanded = expandedFor(occurrence, matches, role);
    var discipleTokens = (occurrence.disciples || []).map(function (disciple) {
      return tokenHtml(occurrence, "disciple", disciple.name, formatDisciple(disciple));
    }).join("");
    var rewardSections = SECTION_CONFIG.map(function (config) {
      return rewardSectionHtml(occurrence, resolved, config, matches);
    }).join("");
    var hasMetaMatch = matches.indexOf("meta") !== -1;
    var hasDiscipleMatch = matches.indexOf("disciples") !== -1;
    return '<article class="forbidden-card' + (hasMetaMatch || hasDiscipleMatch ? " is-search-match" : "") + '" data-forbidden-card="' + escapeHtml(occurrence.id) + '">' +
      '<header class="forbidden-card-head"><div><span class="forbidden-status">' + escapeHtml(statusLabel(occurrence, role)) + "</span>" +
      '<strong class="forbidden-date">' + highlight(formatRange(occurrence)) + '</strong><span class="forbidden-size forbidden-size-' + escapeHtml(occurrence.size) + '">' + escapeHtml(occurrence.size + "禁地") + "</span></div>" +
      '<button type="button" class="seg forbidden-expand" data-forbidden-expand="' + escapeHtml(occurrence.id) + '" aria-expanded="' + String(expanded) + '">' + (expanded ? "收起奖励" : "展开奖励") + "</button></header>" +
      matchReasonHtml(matches) +
      '<section class="forbidden-disciples' + (hasDiscipleMatch ? " is-match" : "") + '"><div class="forbidden-subtitle">禁地弟子</div><div class="forbidden-token-list">' + discipleTokens + "</div></section>" +
      requirementSummaryHtml(occurrence) +
      '<div class="forbidden-rewards"' + (expanded ? "" : " hidden") + '><div class="forbidden-reward-grid">' + rewardSections + "</div></div></article>";
  }

  function noticeHtml(text) {
    return '<div class="forbidden-notice">' + escapeHtml(text) + "</div>";
  }

  function defaultHtml() {
    var view = core.getDefaultView(data.occurrences, new Date());
    var cards = [];
    var notice = "";
    if (view.current) cards.push(cardHtml(view.current, [], "current"));
    else if (view.beforeSchedule) notice = noticeHtml("当前暂无开放禁地，以下为首期预测。");
    else if (view.afterSchedule) notice = noticeHtml("暂无后续预测数据，以下为最近一期历史禁地。");
    else notice = noticeHtml("当前暂无开放禁地。");
    if (view.next) cards.push(cardHtml(view.next, [], "next"));
    if (!view.current && !view.next && view.latestHistory) cards.push(cardHtml(view.latestHistory, [], "latest"));
    return notice + '<div class="forbidden-featured-grid">' + cards.join("") + "</div>";
  }

  function listHtml() {
    var results = core.filterOccurrences(data, {
      query: state.query,
      size: state.size,
      purpose: state.purpose,
      selectedOnly: state.selectedOnly,
      needs: state.needs,
      today: new Date()
    });
    if (!results.length) return '<div class="forbidden-empty">未找到相关禁地信息</div>';
    var title = state.query ? "搜索结果" : state.purpose ? "用途筛选结果" : state.selectedOnly ? "已勾选禁地" : state.size ? state.size + "禁地" : "完整预测表";
    return '<div class="forbidden-list-head"><strong>' + escapeHtml(title) + '</strong><span>共 ' + results.length + " 期</span></div>" +
      '<div class="forbidden-list">' + results.map(function (result) {
        return cardHtml(result.occurrence, result.matches, "list");
      }).join("") + "</div>";
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

  function render() {
    searchRefresh.cancel();
    if (!elements.content) return;
    updateControls();
    var listMode = Boolean(state.query || state.size || state.purpose || state.selectedOnly || state.showSchedule);
    elements.content.innerHTML = listMode ? listHtml() : defaultHtml();
    partitionRendered = true;
  }

  function captureView() {
    return {
      query: state.query,
      size: state.size,
      purpose: state.purpose,
      selectedOnly: state.selectedOnly,
      showSchedule: state.showSchedule,
      expanded: clone(state.expanded)
    };
  }

  function restoreView(view) {
    var saved = view || {};
    state.query = String(saved.query || "");
    state.size = String(saved.size || "");
    state.purpose = String(saved.purpose || "");
    state.selectedOnly = Boolean(saved.selectedOnly);
    state.showSchedule = Boolean(saved.showSchedule);
    state.expanded = clone(saved.expanded);
    if (elements.search) elements.search.value = state.query;
    render();
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
    var occurrence = occurrenceById(control.dataset.forbiddenEvent);
    if (!occurrence) return;
    var type = control.dataset.forbiddenType;
    if (type === "disciple") {
      var selectedDisciple = discipleSelected(occurrence, control.dataset.forbiddenName);
      core.setDiscipleSelection(state.needs, occurrence.id, control.dataset.forbiddenName, !selectedDisciple);
    } else {
      var identity = identityFromControl(control);
      var selectedReward = rewardRecord(occurrence, identity);
      core.setRewardSelection(state.needs, occurrence.id, identity, !selectedReward, []);
    }
    saveNeeds();
    render();
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
    var occurrence = occurrenceById(control.dataset.forbiddenEvent);
    if (!occurrence) return;
    var identity = identityFromControl(control);
    var record = rewardRecord(occurrence, identity);
    if (!record) return;
    purposeDraft = {
      eventId: occurrence.id,
      identity: Object.assign({}, identity, record),
      purposes: (record.purposes || []).slice(),
      trigger: control
    };
    elements.purposeTitle.textContent = record.name;
    elements.purposeOptions.innerHTML = core.allowedPurposes(record.category).map(function (purpose) {
      return '<label class="forbidden-purpose-option is-' + escapeHtml(purpose) + '"><input type="checkbox" value="' + escapeHtml(purpose) + '"' +
        (purposeDraft.purposes.indexOf(purpose) !== -1 ? " checked" : "") + "><span>" + escapeHtml(PURPOSE_LABELS[purpose]) + "</span></label>";
    }).join("");
    var eventScope = elements.purposeEditor.querySelector('input[name="forbidden-purpose-scope"][value="event"]');
    if (eventScope) eventScope.checked = true;
    elements.purposeEditor.hidden = false;
    positionPurposeDialog(control);
    var first = elements.purposeOptions.querySelector("input");
    if (first) first.focus();
  }

  function closePurposeEditor(restoreFocus) {
    if (elements.purposeEditor.hidden) return;
    var trigger = purposeDraft && purposeDraft.trigger;
    elements.purposeEditor.hidden = true;
    purposeDraft = null;
    if (restoreFocus && trigger && document.contains(trigger)) trigger.focus();
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

  function applyFamilySelection(identity, selected, purposes) {
    (data.occurrences || []).forEach(function (occurrence) {
      core.occurrenceRewardIdentities(data, occurrence).forEach(function (candidate) {
        var resolved = resolvedIdentity(candidate.sectionKey, candidate.rawName);
        if (resolved.familyKey === identity.familyKey) {
          core.setRewardSelection(state.needs, occurrence.id, resolved, selected, purposes);
        }
      });
    });
  }

  function savePurposeEditor(selected) {
    if (!purposeDraft) return;
    var purposes = selected ? selectedPurposes() : [];
    if (purposeScope() === "family") applyFamilySelection(purposeDraft.identity, selected, purposes);
    else core.setRewardSelection(state.needs, purposeDraft.eventId, purposeDraft.identity, selected, purposes);
    saveNeeds();
    closePurposeEditor(false);
    render();
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
        render();
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
      content: document.getElementById("forbidden-content"),
      error: document.getElementById("forbidden-error"),
      purposeEditor: document.getElementById("forbidden-purpose-editor"),
      purposeTitle: document.getElementById("forbidden-purpose-title"),
      purposeOptions: document.getElementById("forbidden-purpose-options")
    };
    if (!data || !core || !elements.partition || !elements.content || !elements.purposeFilter || !elements.purposeEditor) {
      showError("禁地数据加载失败，请确认相关数据和脚本文件存在。", true);
      return;
    }
    state.needs = loadNeeds();
    saveNeeds();
    bindEvents();
    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "forbidden")) {
        searchRefresh.cancel();
        if (!elements.purposeEditor.hidden) closePurposeEditor(false);
        return;
      }
      if (!partitionRendered) render();
    }
    document.addEventListener("qinshi:partitionchange", activatePartition);
    if (!elements.partition.hidden) activatePartition();
  }

  window.FORBIDDEN_UI = {
    init: init,
    captureView: captureView,
    restoreView: restoreView,
    applyNavigationQuery: applyNavigationQuery
  };
})();
