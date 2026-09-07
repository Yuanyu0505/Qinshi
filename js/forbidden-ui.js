(function () {
  "use strict";

  var STORE_KEY = "qinshi_forbidden_needs_v1";
  var initialized = false;
  var data = null;
  var core = null;
  var elements = {};
  var tokenPointer = null;
  var partitionRendered = false;
  var searchRefresh = window.UI_PERFORMANCE.createRefreshQueue(render);
  var state = {
    query: "",
    size: "",
    selectedOnly: false,
    showSchedule: false,
    expanded: {},
    needs: {}
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

  function loadNeeds() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return core.normalizeNeeds(parsed, data);
    } catch (error) {
      return {};
    }
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

  function eventNeeds(occurrence) {
    return core.eventNeeds(state.needs, occurrence.id);
  }

  function selected(occurrence, type, name) {
    var entry = eventNeeds(occurrence);
    var list = type === "disciple" ? entry.disciples : entry.items;
    return list.indexOf(name) !== -1;
  }

  function tokenMatches(name, displayName) {
    var query = core.normalize(state.query);
    if (!query) return false;
    return core.normalize(name).indexOf(query) !== -1 || core.normalize(displayName).indexOf(query) !== -1;
  }

  function tokenHtml(occurrence, type, name, displayName) {
    var isSelected = selected(occurrence, type, name);
    var shownName = displayName == null ? name : displayName;
    var isSearchHit = tokenMatches(name, shownName);
    return '<span role="button" tabindex="0" class="forbidden-token' + (isSelected ? " is-selected" : "") + (isSearchHit ? " is-search-hit" : "") + '"' +
      ' data-forbidden-need-type="' + escapeHtml(type) + '"' +
      ' data-forbidden-need-name="' + escapeHtml(name) + '"' +
      ' data-forbidden-event="' + escapeHtml(occurrence.id) + '"' +
      ' aria-pressed="' + String(isSelected) + '">' +
      (isSelected ? '<span class="forbidden-checkmark" aria-hidden="true">✓</span>' : "") +
      highlight(shownName) + "</span>";
  }

  function requirementSummaryHtml(occurrence) {
    var entry = eventNeeds(occurrence);
    if (!entry.disciples.length && !entry.items.length) {
      return '<section class="forbidden-needs"><div class="forbidden-subtitle">本期需求</div><div class="muted-tip">本期暂无已勾选需求</div></section>';
    }
    var discipleTokens = entry.disciples.map(function (name) { return tokenHtml(occurrence, "disciple", name, name); }).join("");
    var itemTokens = entry.items.map(function (name) { return tokenHtml(occurrence, "item", name, name); }).join("");
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
        var displayName = itemDisplayName(config.key, name);
        return tokenHtml(occurrence, "item", displayName, displayName);
      }).join("");
    }
    var tokens = items.map(function (name) {
      var displayName = itemDisplayName(config.key, name);
      return tokenHtml(occurrence, "item", displayName, displayName);
    }).join("");
    var body = '<div class="forbidden-token-list">' + (tokens || '<span class="muted-tip">—</span>') + "</div>";
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
      '<div class="forbidden-subtitle">' + escapeHtml(config.title) + "</div>" +
      body + "</section>";
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
      selectedOnly: state.selectedOnly,
      needs: state.needs,
      today: new Date()
    });
    if (!results.length) return '<div class="forbidden-empty">未找到相关禁地信息</div>';
    var title = state.query ? "搜索结果" : state.selectedOnly ? "已勾选禁地" : state.size ? state.size + "禁地" : "完整预测表";
    return '<div class="forbidden-list-head"><strong>' + escapeHtml(title) + '</strong><span>共 ' + results.length + " 期</span></div>" +
      '<div class="forbidden-list">' + results.map(function (result) {
        return cardHtml(result.occurrence, result.matches, "list");
      }).join("") + "</div>";
  }

  function updateControls() {
    elements.sizeFilter.querySelectorAll("[data-forbidden-size]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.forbiddenSize === state.size);
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
    var listMode = Boolean(state.query || state.size || state.selectedOnly || state.showSchedule);
    elements.content.innerHTML = listMode ? listHtml() : defaultHtml();
    partitionRendered = true;
  }

  function toggleNeed(eventId, type, name) {
    var entry = core.eventNeeds(state.needs, eventId);
    var key = type === "disciple" ? "disciples" : "items";
    var index = entry[key].indexOf(name);
    if (index >= 0) entry[key].splice(index, 1);
    else entry[key].push(name);
    if (entry.disciples.length || entry.items.length) state.needs[eventId] = entry;
    else delete state.needs[eventId];
    saveNeeds();
    render();
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
    elements.selectedOnly.addEventListener("change", function () {
      state.selectedOnly = elements.selectedOnly.checked;
      render();
    });
    elements.scheduleToggle.addEventListener("click", function () {
      state.showSchedule = !state.showSchedule;
      render();
    });
    elements.content.addEventListener("pointerdown", function (event) {
      var token = event.target.closest("[data-forbidden-need-type]");
      tokenPointer = token ? { token: token, x: event.clientX, y: event.clientY } : null;
    });
    elements.content.addEventListener("click", function (event) {
      var needToken = event.target.closest("[data-forbidden-need-type]");
      if (needToken) {
        var selectionText = window.getSelection ? window.getSelection().toString() : "";
        var start = tokenPointer && tokenPointer.token === needToken ? tokenPointer : null;
        tokenPointer = null;
        if (!core.shouldToggleToken(start, { x: event.clientX, y: event.clientY }, selectionText)) return;
        toggleNeed(needToken.dataset.forbiddenEvent, needToken.dataset.forbiddenNeedType, needToken.dataset.forbiddenNeedName);
        return;
      }
      var expandButton = event.target.closest("[data-forbidden-expand]");
      if (expandButton) {
        var id = expandButton.dataset.forbiddenExpand;
        state.expanded[id] = expandButton.getAttribute("aria-expanded") !== "true";
        render();
      }
    });
    elements.content.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var token = event.target.closest("[data-forbidden-need-type]");
      if (!token) return;
      event.preventDefault();
      toggleNeed(token.dataset.forbiddenEvent, token.dataset.forbiddenNeedType, token.dataset.forbiddenNeedName);
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
      selectedOnly: document.getElementById("forbidden-selected-only"),
      scheduleToggle: document.getElementById("forbidden-schedule-toggle"),
      content: document.getElementById("forbidden-content"),
      error: document.getElementById("forbidden-error")
    };
    if (!data || !core || !elements.partition || !elements.content) {
      showError("禁地数据加载失败，请确认相关数据和脚本文件存在。", true);
      return;
    }
    state.needs = loadNeeds();
    bindEvents();
    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "forbidden")) {
        searchRefresh.cancel();
        return;
      }
      if (!partitionRendered) render();
    }
    document.addEventListener("qinshi:partitionchange", activatePartition);
    if (!elements.partition.hidden) activatePartition();
  }

  window.FORBIDDEN_UI = { init: init };
})();
