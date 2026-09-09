(function () {
  "use strict";

  var data = window.ZHULU_DATA;
  var core = window.ZHULU;
  var refreshQueue = window.UI_PERFORMANCE && window.UI_PERFORMANCE.createRefreshQueue;
  var initialized = false;
  var rendered = false;
  var activeBook = "";
  var actionTrigger = null;
  var state = {
    tab: "progress",
    progressQuery: "",
    seasonFilters: { year: null, month: null, query: "", quality: null, progress: null },
    progressScrollY: 0,
    seasonScrollY: 0
  };
  var elements = {};

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function number(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function qualityClass(quality) {
    if (quality === "紫") return "zhulu-quality-purple";
    if (quality === "红") return "zhulu-quality-red";
    return "zhulu-quality-orange";
  }

  function formatMonth(season) {
    return season.year + "年" + season.month + "月";
  }

  function setError(message) {
    if (!elements.error) return;
    elements.error.textContent = message || "";
    elements.error.hidden = !message;
  }

  function syncTabs() {
    elements.tabs.querySelectorAll("[data-zhulu-tab]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.zhuluTab === state.tab);
    });
    elements.progressView.hidden = state.tab !== "progress";
    elements.seasonView.hidden = state.tab !== "seasons";
  }

  function progressItemHtml(item, highlighted) {
    var reward = item.seasonTier
      ? '<button type="button" class="zhulu-progress-book-link" data-zhulu-tier-link="' + item.seasonTier + '">' + escapeHtml(item.item) + "</button>"
      : '<span class="zhulu-progress-item-name">' + escapeHtml(item.item) + "</span>";
    return '<tr class="' + (highlighted ? "is-located" : "") + '">' +
      '<td data-label="进度"><strong>' + number(item.progress) + "</strong></td>" +
      '<td data-label="奖励">' + reward + "</td>" +
      '<td data-label="数量">×' + number(item.quantity) + "</td>" +
      "</tr>";
  }

  function renderProgress() {
    var result = core.locateProgressRewards(data.progressRewards, state.progressQuery);
    elements.progressNotice.textContent = result.message || "共 40 个进度奖励节点；点击典籍奖励可查看各赛季对应典籍。";
    if (!result.items.length) {
      elements.progressResults.innerHTML = '<div class="empty"><p>未找到匹配的逐鹿奖励</p><button type="button" class="link-btn" data-zhulu-clear-progress>清除查询</button></div>';
      return;
    }
    var highlighted = result.mode !== "all";
    elements.progressResults.innerHTML = '<section class="panel zhulu-progress-panel"><div class="zhulu-progress-table-wrap"><table class="zhulu-progress-table">' +
      "<thead><tr><th>进度要求</th><th>奖励道具</th><th>数量</th></tr></thead><tbody>" +
      result.items.map(function (item) { return progressItemHtml(item, highlighted); }).join("") +
      "</tbody></table></div></section>";
  }

  function rewardHtml(entry) {
    return '<article class="zhulu-reward ' + qualityClass(entry.quality) + '">' +
      '<div class="zhulu-reward-head"><strong>' + number(entry.progress) + '进度</strong><span>' + escapeHtml(entry.quality) + "色</span></div>" +
      '<button type="button" class="zhulu-book-name ' + qualityClass(entry.quality) + '" data-zhulu-book="' + escapeHtml(entry.book) + '">' + escapeHtml(entry.book) + "</button>" +
      '<div class="zhulu-yuanbao">' + (entry.yuanbao ? "消耗 " + number(entry.yuanbao) + " 元宝" : "无需元宝") + "</div>" +
      "</article>";
  }

  function seasonHtml(season, badge) {
    var predicted = Boolean(season.predicted);
    var badgeHtml = badge ? '<span class="zhulu-season-badge ' + (predicted ? "is-predicted" : "") + '">' + escapeHtml(badge) + "</span>" : "";
    return '<article class="panel zhulu-season-card' + (badge === "当前赛季" ? " is-current" : "") + '">' +
      '<header class="zhulu-season-card-head"><h3>' + formatMonth(season) + "</h3>" + badgeHtml + "</header>" +
      '<div class="zhulu-reward-grid">' + season.matches.map(rewardHtml).join("") + "</div>" +
      "</article>";
  }

  function groupHtml(title, items, badge) {
    if (!items || !items.length) return "";
    return '<section class="zhulu-season-group"><h2 class="mode-title">' + escapeHtml(title) + '<span class="drop-count">' + items.length + " 个赛季</span></h2>" +
      items.map(function (season) { return seasonHtml(season, badge || (season.predicted ? "预测" : "")); }).join("") + "</section>";
  }

  function hasSeasonFilters() {
    var filters = state.seasonFilters;
    return filters.year !== null || filters.month !== null || Boolean(filters.query || filters.quality || filters.progress);
  }

  function renderSeasons() {
    var html = "";
    if (hasSeasonFilters()) {
      var result = core.querySeasons(data, state.seasonFilters, new Date());
      html += groupHtml("明确资料", result.explicit, "明确资料");
      html += groupHtml("预测资料", result.predicted, "预测");
      if (!html) html = '<div class="empty"><p>未找到符合条件的赛季典籍</p><button type="button" class="link-btn" data-zhulu-clear-season>清除全部条件</button></div>';
    } else {
      var groups = core.groupDefaultSeasons(data, new Date());
      html += groupHtml("当前赛季", groups.current, groups.current.some(function (item) { return item.predicted; }) ? "预测" : "当前赛季");
      html += groupHtml("后续赛季", groups.upcoming, "后续赛季");
      html += groupHtml("未来预测", groups.predicted, "预测");
      html += groupHtml("历史赛季", groups.history, "");
    }
    elements.seasonResults.innerHTML = html;
  }

  function syncSeasonControls() {
    elements.year.value = state.seasonFilters.year == null ? "" : String(state.seasonFilters.year);
    elements.month.value = state.seasonFilters.month == null ? "" : String(state.seasonFilters.month);
    elements.seasonSearch.value = state.seasonFilters.query || "";
    elements.quality.querySelectorAll("[data-zhulu-quality]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.zhuluQuality === (state.seasonFilters.quality || ""));
    });
    elements.tier.querySelectorAll("[data-zhulu-tier]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.zhuluTier === (state.seasonFilters.progress == null ? "" : String(state.seasonFilters.progress)));
    });
  }

  function renderCurrent() {
    syncTabs();
    if (state.tab === "progress") renderProgress();
    else {
      syncSeasonControls();
      renderSeasons();
    }
  }

  function switchTab(tab) {
    if (tab !== "progress" && tab !== "seasons") return;
    if (state.tab === tab) return;
    if (state.tab === "progress") state.progressScrollY = window.scrollY;
    else state.seasonScrollY = window.scrollY;
    state.tab = tab;
    closeActionMenu();
    renderCurrent();
    requestAnimationFrame(function () {
      window.scrollTo({ top: tab === "progress" ? state.progressScrollY : state.seasonScrollY, behavior: "auto" });
    });
  }

  function resetSeasonFilters() {
    state.seasonFilters = { year: null, month: null, query: "", quality: null, progress: null };
    syncSeasonControls();
    renderSeasons();
  }

  function openActionMenu(button) {
    activeBook = button.dataset.zhuluBook || "";
    actionTrigger = button;
    elements.actionTitle.textContent = activeBook;
    elements.actionMenu.hidden = false;
    var rect = button.getBoundingClientRect();
    var width = Math.min(300, window.innerWidth - 24);
    var left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    var top = rect.bottom + 8;
    elements.actionMenu.style.width = width + "px";
    elements.actionMenu.style.left = left + "px";
    elements.actionMenu.style.top = Math.min(top, window.innerHeight - elements.actionMenu.offsetHeight - 12) + "px";
    var first = elements.actionMenu.querySelector("[data-zhulu-action]");
    if (first) first.focus();
  }

  function closeActionMenu(restoreFocus) {
    if (!elements.actionMenu || elements.actionMenu.hidden) return;
    elements.actionMenu.hidden = true;
    elements.actionMenu.style.left = "";
    elements.actionMenu.style.top = "";
    if (restoreFocus && actionTrigger && typeof actionTrigger.focus === "function") actionTrigger.focus();
    actionTrigger = null;
  }

  function captureView() {
    if (state.tab === "progress") state.progressScrollY = window.scrollY;
    else state.seasonScrollY = window.scrollY;
    return clone(state);
  }

  function restoreView(view) {
    var saved = view || {};
    state.tab = saved.tab === "seasons" ? "seasons" : "progress";
    state.progressQuery = saved.progressQuery || "";
    state.seasonFilters = Object.assign({ year: null, month: null, query: "", quality: null, progress: null }, saved.seasonFilters || {});
    state.progressScrollY = Number(saved.progressScrollY) || 0;
    state.seasonScrollY = Number(saved.seasonScrollY) || 0;
    elements.progressSearch.value = state.progressQuery;
    renderCurrent();
    requestAnimationFrame(function () {
      window.scrollTo({ top: state.tab === "progress" ? state.progressScrollY : state.seasonScrollY, behavior: "auto" });
    });
  }

  function fillSelects() {
    var firstYear = Number(String(data.meta.firstSeason).slice(0, 4));
    var maxYear = Math.max(new Date().getFullYear() + 100, Number(String(data.meta.lastSeason).slice(0, 4)) + 100);
    var yearHtml = '<option value="">全部年份</option>';
    for (var year = firstYear; year <= maxYear; year += 1) yearHtml += '<option value="' + year + '">' + year + "年</option>";
    elements.year.innerHTML = yearHtml;
    var monthHtml = '<option value="">全部月份</option>';
    for (var month = 1; month <= 12; month += 1) monthHtml += '<option value="' + month + '">' + month + "月</option>";
    elements.month.innerHTML = monthHtml;
  }

  function bindEvents() {
    var progressRefresh = refreshQueue ? refreshQueue(renderProgress) : { schedule: renderProgress };
    var seasonRefresh = refreshQueue ? refreshQueue(renderSeasons) : { schedule: renderSeasons };

    elements.tabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-zhulu-tab]");
      if (button) switchTab(button.dataset.zhuluTab);
    });
    elements.progressSearch.addEventListener("input", function () {
      state.progressQuery = elements.progressSearch.value;
      progressRefresh.schedule();
    });
    elements.progressClear.addEventListener("click", function () {
      state.progressQuery = "";
      elements.progressSearch.value = "";
      renderProgress();
      elements.progressSearch.focus();
    });
    elements.progressResults.addEventListener("click", function (event) {
      var clear = event.target.closest("[data-zhulu-clear-progress]");
      if (clear) {
        state.progressQuery = "";
        elements.progressSearch.value = "";
        renderProgress();
        return;
      }
      var link = event.target.closest("[data-zhulu-tier-link]");
      if (!link) return;
      state.seasonFilters = { year: null, month: null, query: "", quality: null, progress: Number(link.dataset.zhuluTierLink) };
      switchTab("seasons");
    });
    elements.year.addEventListener("change", function () {
      state.seasonFilters.year = elements.year.value ? Number(elements.year.value) : null;
      renderSeasons();
    });
    elements.month.addEventListener("change", function () {
      state.seasonFilters.month = elements.month.value ? Number(elements.month.value) : null;
      renderSeasons();
    });
    elements.seasonSearch.addEventListener("input", function () {
      state.seasonFilters.query = elements.seasonSearch.value;
      seasonRefresh.schedule();
    });
    elements.quality.addEventListener("click", function (event) {
      var button = event.target.closest("[data-zhulu-quality]");
      if (!button) return;
      state.seasonFilters.quality = button.dataset.zhuluQuality || null;
      syncSeasonControls();
      renderSeasons();
    });
    elements.tier.addEventListener("click", function (event) {
      var button = event.target.closest("[data-zhulu-tier]");
      if (!button) return;
      state.seasonFilters.progress = button.dataset.zhuluTier ? Number(button.dataset.zhuluTier) : null;
      syncSeasonControls();
      renderSeasons();
    });
    elements.seasonClear.addEventListener("click", resetSeasonFilters);
    elements.seasonResults.addEventListener("click", function (event) {
      var clear = event.target.closest("[data-zhulu-clear-season]");
      if (clear) {
        resetSeasonFilters();
        return;
      }
      var book = event.target.closest("[data-zhulu-book]");
      if (book) openActionMenu(book);
    });
    elements.actionClose.addEventListener("click", function () { closeActionMenu(true); });
    elements.actionMenu.addEventListener("click", function (event) {
      var button = event.target.closest("[data-zhulu-action]");
      if (!button || !activeBook) return;
      var action = button.dataset.zhuluAction;
      var bookName = activeBook;
      closeActionMenu(false);
      if (action === "seasons") {
        state.tab = "seasons";
        state.seasonFilters = { year: null, month: null, query: bookName, quality: null, progress: null };
        renderCurrent();
        elements.seasonSearch.focus();
        return;
      }
      document.dispatchEvent(new CustomEvent("qinshi:zhulu-navigate", {
        detail: { target: action, bookName: bookName, zhuluView: captureView() }
      }));
    });
    document.addEventListener("click", function (event) {
      if (elements.actionMenu.hidden) return;
      if (!event.target.closest("#zhulu-action-menu") && !event.target.closest("[data-zhulu-book]")) closeActionMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeActionMenu(true);
    });
    window.addEventListener("resize", function () { closeActionMenu(false); });
    window.addEventListener("scroll", function () { closeActionMenu(false); }, true);
    document.addEventListener("qinshi:partitionchange", function (event) {
      if (!event.detail || event.detail.name !== "zhulu") return;
      if (!rendered) {
        rendered = true;
        renderCurrent();
      }
    });
  }

  function init() {
    if (initialized) return window.ZHULU_UI;
    initialized = true;
    elements = {
      partition: document.getElementById("partition-zhulu"),
      tabs: document.getElementById("zhulu-tabs"),
      error: document.getElementById("zhulu-error"),
      progressView: document.getElementById("zhulu-progress-view"),
      progressSearch: document.getElementById("zhulu-progress-search"),
      progressClear: document.getElementById("zhulu-progress-clear"),
      progressNotice: document.getElementById("zhulu-progress-notice"),
      progressResults: document.getElementById("zhulu-progress-results"),
      seasonView: document.getElementById("zhulu-season-view"),
      year: document.getElementById("zhulu-season-year"),
      month: document.getElementById("zhulu-season-month"),
      seasonSearch: document.getElementById("zhulu-season-search"),
      quality: document.getElementById("zhulu-quality-filter"),
      tier: document.getElementById("zhulu-tier-filter"),
      seasonClear: document.getElementById("zhulu-season-clear"),
      seasonResults: document.getElementById("zhulu-season-results"),
      actionMenu: document.getElementById("zhulu-action-menu"),
      actionTitle: document.getElementById("zhulu-action-title"),
      actionClose: document.getElementById("zhulu-action-close")
    };
    if (!data || !core || !elements.partition) {
      setError("逐鹿资料加载失败，请确认数据和脚本文件存在。");
      return window.ZHULU_UI;
    }
    fillSelects();
    bindEvents();
    syncTabs();
    if (!elements.partition.hidden) {
      rendered = true;
      renderCurrent();
    }
    return window.ZHULU_UI;
  }

  window.ZHULU_UI = {
    init: init,
    captureView: captureView,
    restoreView: restoreView,
    showError: setError
  };

  init();
})();
