/**
 * 特殊属性装备 · 页面渲染与交互
 * 依赖：window.SPECIAL_EQUIPMENT_DATA（数据）、window.QSQuery（查询核心）
 */
(function () {
  "use strict";

  const DATA = window.SPECIAL_EQUIPMENT_DATA;
  const Q = window.QSQuery;

  const state = { search: "", main: "", filters: [], sortAttr: null, valueSource: "max" };

  const el = {
    search: document.getElementById("search"),
    mainBtns: document.getElementById("main-filter"),
    chips: document.getElementById("chips"),
    sortPanel: document.getElementById("sort-panel"),
    sortAttrBtns: document.getElementById("sort-attr"),
    sortTierBtns: document.getElementById("sort-tier"),
    count: document.getElementById("count"),
    version: document.getElementById("version"),
    results: document.getElementById("results"),
    tableHead: document.getElementById("table-head"),
    tableBody: document.getElementById("table-body"),
    cards: document.getElementById("cards"),
    empty: document.getElementById("empty"),
    clearAll: document.getElementById("clear-all"),
    emptyClear: document.getElementById("empty-clear"),
    error: document.getElementById("data-error")
  };

  function init() {
    if (!DATA || !Q) {
      el.error.hidden = false;
      return;
    }
    el.version.textContent = DATA.meta.version;
    renderChips();
    bindEvents();
    apply();
  }

  function renderChips() {
    el.chips.innerHTML = DATA.meta.attrTypes
      .map((a) => `<button type="button" class="chip" data-attr="${a}">${a}</button>`)
      .join("");
  }

  function bindEvents() {
    el.search.addEventListener("input", () => {
      state.search = el.search.value;
      apply();
    });
    el.mainBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-main]");
      if (!btn) return;
      state.main = btn.dataset.main;
      apply();
    });
    el.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn || btn.disabled) return;
      const attr = btn.dataset.attr;
      const idx = state.filters.indexOf(attr);
      if (idx >= 0) {
        state.filters.splice(idx, 1);
      } else if (state.filters.length < 2) {
        state.filters.push(attr);
      }
      state.sortAttr = state.filters.length ? state.filters[0] : null;
      apply();
    });
    el.sortAttrBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-attr]");
      if (!btn) return;
      state.sortAttr = btn.dataset.attr;
      apply();
    });
    el.sortTierBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tier]");
      if (!btn) return;
      state.valueSource = btn.dataset.tier;
      apply();
    });
    const clear = () => {
      state.search = "";
      state.main = "";
      state.filters = [];
      state.sortAttr = null;
      state.valueSource = "max";
      el.search.value = "";
      apply();
    };
    el.clearAll.addEventListener("click", clear);
    el.emptyClear.addEventListener("click", clear);
  }

  function apply() {
    const items = Q.queryItems(DATA.items, {
      search: state.search,
      main: state.main,
      filters: state.filters,
      sortAttr: state.sortAttr,
      valueSource: state.valueSource
    });
    renderControls();
    renderTable(items);
    renderCards(items);
    el.count.textContent = `共 ${items.length} 件`;
    const isEmpty = items.length === 0;
    el.results.hidden = isEmpty;
    el.empty.hidden = !isEmpty;
  }

  function renderControls() {
    el.mainBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.main === state.main);
    });
    document.querySelectorAll(".chip").forEach((btn) => {
      const attr = btn.dataset.attr;
      const active = state.filters.indexOf(attr) >= 0;
      btn.classList.toggle("active", active);
      btn.disabled = !active && state.filters.length >= 2;
    });
    const hasFilter = state.filters.length > 0;
    el.sortPanel.hidden = !hasFilter;
    el.sortAttrBtns.innerHTML = state.filters
      .map((a) => `<button type="button" class="seg${state.sortAttr === a ? " active" : ""}" data-attr="${a}">${a}</button>`)
      .join("");
    el.sortTierBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tier === state.valueSource);
    });
  }

  function tokenHtml(tokens) {
    if (!tokens || tokens.length === 0) return '<span class="tier-none">—</span>';
    return tokens.map((tk) => {
      if (tk.s) return `<span class="tier-status">${tk.s}</span>`;
      const hit = state.filters.indexOf(tk.t) >= 0;
      return `<span class="tier-attr${hit ? " hit" : ""}">${tk.raw}</span>`;
    }).join('<span class="plus"> + </span>');
  }

  function sortBadge(item) {
    if (state.filters.length === 0) return "";
    const v = Q.sortValue(item, state.sortAttr, state.valueSource);
    return v === null ? "—" : `${state.sortAttr} ${v}%`;
  }

  function renderTable(items) {
    const hasFilter = state.filters.length > 0;
    el.tableHead.innerHTML = `<tr>
      <th>分类</th><th>装备名</th><th>主属性</th><th>橙色</th><th>橙金</th><th>红色</th><th>红金</th>
      ${hasFilter ? '<th class="badge">排序值</th>' : ""}
    </tr>`;
    el.tableBody.innerHTML = items.map((item) => `<tr>
      <td><span class="cat">${item.cat}</span></td>
      <td class="name">${item.name}</td>
      <td class="main">${item.main}</td>
      <td>${tokenHtml(item.tiers["橙色"])}</td>
      <td>${tokenHtml(item.tiers["橙金"])}</td>
      <td>${tokenHtml(item.tiers["红色"])}</td>
      <td>${tokenHtml(item.tiers["红金"])}</td>
      ${hasFilter ? `<td class="badge">${sortBadge(item)}</td>` : ""}
    </tr>`).join("");
  }

  function renderCards(items) {
    const hasFilter = state.filters.length > 0;
    el.cards.innerHTML = items.map((item) => {
      const badge = hasFilter ? sortBadge(item) : "";
      return `<div class="card">
        <div class="card-head">
          <span class="cat">${item.cat}</span>
          <span class="name">${item.name}</span>
          ${badge ? `<span class="badge">${badge}</span>` : ""}
        </div>
        <div class="card-main">主属性：<b>${item.main}</b></div>
        ${Q.TIER_ORDER.map((t) => `<div class="card-tier"><span class="tier-label">${t}</span>${tokenHtml(item.tiers[t])}</div>`).join("")}
      </div>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
