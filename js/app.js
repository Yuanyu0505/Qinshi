/**
 * 特殊属性装备 · 页面渲染与交互
 * 依赖：window.SPECIAL_EQUIPMENT_DATA（数据）、window.QSQuery（查询核心）
 */
(function () {
  "use strict";

  const DATA = window.SPECIAL_EQUIPMENT_DATA;
  const Q = window.QSQuery;
  const FDATA = window.FORGING_DATA;
  const FORG = window.FORGING;
  const DROP_DATA = window.DROP_DATA;
  const DROPS = window.DROPS;
  const PROG = window.PROGRESS;
  const PROG_STORE_KEY = "qinshi_forging_progress_v1";
  const ATLAS_DATA = window.ATLAS_DATA;
  const ATLAS = window.ATLAS;
  const QUIZ_DATA = window.QUIZ_DATA;
  const QUIZ = window.QUIZ;
  const ATLAS_LEVELS_KEY = "qinshi_atlas_levels_v1";
  const ATLAS_TARGET_LEVEL_KEY = "qinshi_atlas_target_level_v1";
  const QUIZ_STORE_KEY = "qinshi_quiz_items_v1";

  const state = { search: "", category: "", main: "", filters: [], sortAttr: null, valueSource: "max" };
  const forgeState = { mode: "main", query: "" };

  const el = {
    search: document.getElementById("search"),
    categoryBtns: document.getElementById("category-filter"),
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
    error: document.getElementById("data-error"),
    forgeMode: document.getElementById("forge-mode"),
    forgeSearch: document.getElementById("forge-search"),
    forgeResults: document.getElementById("forge-results"),
    forgeSummaryHead: document.getElementById("forging-summary-head"),
    forgeSummary: document.getElementById("forging-summary"),
    dropSearch: document.getElementById("drop-search"),
    dropResults: document.getElementById("drop-results"),
    forgeView: document.getElementById("forge-view"),
    forgeQuery: document.getElementById("forge-query"),
    forgeProgress: document.getElementById("forge-progress"),
    progAddDisciple: document.getElementById("prog-add-disciple"),
    progSaveTip: document.getElementById("prog-save-tip"),
    progSearch: document.getElementById("prog-search"),
    progSearchResults: document.getElementById("prog-search-results"),
    progPager: document.getElementById("prog-pager"),
    progPrev: document.getElementById("prog-prev"),
    progNext: document.getElementById("prog-next"),
    progPageTitle: document.getElementById("prog-page-title"),
    progOverall: document.getElementById("prog-overall"),
    progDisciples: document.getElementById("prog-disciples"),
    atlasTabs: document.getElementById("atlas-tabs"),
    atlasSearch: document.getElementById("atlas-search"),
    atlasLevelFilter: document.getElementById("atlas-level-filter"),
    atlasTargetLevel: document.getElementById("atlas-target-level"),
    atlasUpgradeSummary: document.getElementById("atlas-upgrade-summary"),
    atlasResults: document.getElementById("atlas-results"),
    quizSearch: document.getElementById("quiz-search"),
    quizCount: document.getElementById("quiz-count"),
    quizResults: document.getElementById("quiz-results"),
    quizAddQuestion: document.getElementById("quiz-add-question"),
    quizAddAnswer: document.getElementById("quiz-add-answer"),
    quizAdd: document.getElementById("quiz-add")
  };

  const progState = {
    view: "query",
    page: 0,
    query: "",
    disciples: loadProgress()
  };
  const PROG_CAT_ORDER = ["武器", "盔甲", "首饰", "典籍"];
  const atlasState = {
    tab: "攻",
    query: "",
    levelFilter: "",
    targetLevel: loadAtlasTargetLevel(),
    levels: loadAtlasLevels()
  };
  const quizState = { query: "", items: loadQuizItems() };

  function init() {
    bindTabs();
    initForging();
    initDrops();
    initProgress();
    initAtlas();
    initQuiz();
    if (!DATA || !Q) {
      el.error.hidden = false;
      return;
    }
    el.version.textContent = DATA.meta.version;
    renderCategoryButtons();
    renderChips();
    bindEvents();
    apply();
  }

  function bindTabs() {
    const tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
    const parts = {
      equipment: document.getElementById("partition-equipment"),
      loulan: document.getElementById("partition-loulan"),
      forging: document.getElementById("partition-forging"),
      drops: document.getElementById("partition-drops"),
      atlas: document.getElementById("partition-atlas"),
      quiz: document.getElementById("partition-quiz"),
      inscription: document.getElementById("partition-inscription")
    };
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.partition;
        tabs.forEach((b) => b.classList.toggle("active", b === btn));
        Object.keys(parts).forEach((key) => {
          parts[key].hidden = key !== name;
        });
      });
    });
  }

  function initForging() {
    if (!FDATA || !FORG) return;
    renderForgingSummary();
    bindForging();
    applyForging();
  }

  function initDrops() {
    if (!DROP_DATA || !DROPS) return;
    el.dropSearch.addEventListener("input", () => {
      applyDrops();
    });
    applyDrops();
  }

  function loadAtlasLevels() {
    try {
      const raw = localStorage.getItem(ATLAS_LEVELS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveAtlasLevels() {
    try {
      localStorage.setItem(ATLAS_LEVELS_KEY, JSON.stringify(atlasState.levels));
    } catch (e) {
      // 忽略存储失败
    }
  }

  function atlasMaxLevel() {
    return Number(ATLAS_DATA && ATLAS_DATA.meta && ATLAS_DATA.meta.maxLevel) || 20;
  }

  function defaultAtlasTargetLevel() {
    const raw = Number(ATLAS_DATA && ATLAS_DATA.meta && ATLAS_DATA.meta.defaultTargetLevel) || 19;
    return Math.max(1, Math.min(raw, atlasMaxLevel()));
  }

  function normalizeAtlasTargetLevel(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > atlasMaxLevel()) return defaultAtlasTargetLevel();
    return n;
  }

  function loadAtlasTargetLevel() {
    try {
      return normalizeAtlasTargetLevel(localStorage.getItem(ATLAS_TARGET_LEVEL_KEY));
    } catch (e) {
      return defaultAtlasTargetLevel();
    }
  }

  function saveAtlasTargetLevel() {
    try {
      localStorage.setItem(ATLAS_TARGET_LEVEL_KEY, String(atlasState.targetLevel));
    } catch (e) {
      // 忽略存储失败
    }
  }

  function initAtlas() {
    if (!ATLAS_DATA || !ATLAS) return;
    el.atlasTargetLevel.min = "1";
    el.atlasTargetLevel.max = String(atlasMaxLevel());
    el.atlasTargetLevel.value = String(atlasState.targetLevel);
    el.atlasTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-atlas]");
      if (!btn) return;
      atlasState.tab = btn.dataset.atlas;
      applyAtlas();
    });
    el.atlasSearch.addEventListener("input", () => {
      atlasState.query = el.atlasSearch.value;
      applyAtlas();
    });
    el.atlasLevelFilter.addEventListener("change", () => {
      atlasState.levelFilter = el.atlasLevelFilter.value;
      applyAtlas();
    });
    el.atlasTargetLevel.addEventListener("change", () => {
      atlasState.targetLevel = normalizeAtlasTargetLevel(el.atlasTargetLevel.value);
      el.atlasTargetLevel.value = String(atlasState.targetLevel);
      saveAtlasTargetLevel();
      applyAtlas();
    });
    el.atlasResults.addEventListener("change", (e) => {
      if (e.target.classList.contains("atlas-level")) {
        atlasState.levels[e.target.dataset.id] = parseInt(e.target.value, 10) || 0;
        saveAtlasLevels();
        applyAtlas();
      }
    });
    applyAtlas();
  }

  function atlasItemHtml(item) {
    const L = ATLAS.levelOf(item, atlasState.levels);
    const plan = ATLAS.upgradePlan(item, L, atlasState.targetLevel, ATLAS_DATA.meta.upgradeStages);
    const equipmentHtml = plan.equipmentStages.length
      ? `<div class="atlas-equipment-stage-list">${plan.equipmentStages.map((st) => `<div class="atlas-equipment-stage">
          <span class="atlas-stage-key">${st.key}</span>
          <span class="atlas-equipment-items">${st.items.map((tk) => `<span class="mat ${tk.q === "紫" ? "mat-purple" : "mat-orange"}">${escapeHtml(tk.n)}</span>`).join("") || '<span class="mat-dash">无</span>'}</span>
        </div>`).join("")}</div>`
      : '<div class="muted-tip">该目标区间无需装备</div>';
    const upgradeHtml = plan.reached
      ? `<div class="atlas-upgrade done">已达到目标等级（${plan.currentLevel} / ${plan.targetLevel}级）</div>`
      : `<div class="atlas-upgrade">
          <div class="atlas-upgrade-title">升至 ${plan.targetLevel} 级</div>
          <div class="atlas-upgrade-cost">
            <span>明鬼绳结 <b>${plan.knots}</b></span>
            <span>魂魄 <b>${plan.souls}</b></span>
            <span>成长值 <b>+${plan.growth}</b></span>
          </div>
          <div class="muted-tip">14级后不再获得成长值</div>
          <div class="atlas-upgrade-equipment"><div class="atlas-equipment-title">所需装备</div>${equipmentHtml}</div>
        </div>`;
    return `<div class="atlas-item">
      <div class="atlas-head">
        <span class="q-badge q-orange">${item.atlas}图鉴</span>
        <span class="forge-name">${escapeHtml(item.name)}</span>
        <label class="atlas-level-label">图鉴等级
          <input type="number" class="atlas-level" data-id="${item.id}" value="${L}" min="0">
        </label>
      </div>
      <div class="atlas-meta">
        <span>获取途径：${escapeHtml(item.acquire) || "—"}</span>
        <span>所属图鉴：${item.group ? `<span class="atlas-group">${escapeHtml(item.group)}</span>` : "—"}</span>
      </div>
      ${upgradeHtml}
    </div>`;
  }

  function initQuiz() {
    if (!QUIZ_DATA || !QUIZ) return;
    el.quizSearch.addEventListener("input", function () {
      quizState.query = el.quizSearch.value;
      applyQuiz();
    });
    el.quizAdd.addEventListener("click", addQuizItem);
    el.quizResults.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-quiz-action]");
      if (!btn) return;
      var item = quizState.items.find(function (entry) { return entry.id === btn.dataset.id; });
      if (!item) return;
      if (btn.dataset.quizAction === "delete") {
        quizState.items = quizState.items.filter(function (entry) { return entry.id !== item.id; });
      } else {
        var card = btn.closest(".quiz-item");
        var question = card.querySelector(".quiz-edit-question").value.trim();
        var answer = card.querySelector(".quiz-edit-answer").value.trim();
        if (!question || !answer) return;
        item.question = question;
        item.answer = answer;
      }
      saveQuizItems();
      applyQuiz();
    });
    applyQuiz();
  }

  function loadQuizItems() {
    var defaults = QUIZ_DATA && QUIZ_DATA.items ? QUIZ_DATA.items : [];
    var saved;
    try { saved = JSON.parse(localStorage.getItem(QUIZ_STORE_KEY) || "null"); } catch (error) { saved = null; }
    return QUIZ.mergeItems(defaults, saved);
  }

  function saveQuizItems() {
    localStorage.setItem(QUIZ_STORE_KEY, JSON.stringify(quizState.items));
  }

  function addQuizItem() {
    var question = el.quizAddQuestion.value.trim();
    var answer = el.quizAddAnswer.value.trim();
    if (!question || !answer) return;
    quizState.items.unshift({ id: "custom-" + Date.now(), question: question, answer: answer });
    el.quizAddQuestion.value = "";
    el.quizAddAnswer.value = "";
    saveQuizItems();
    applyQuiz();
  }

  function applyQuiz() {
    var items = QUIZ.search(quizState.items, quizState.query);
    el.quizCount.textContent = "共 " + items.length + " 题";
    el.quizResults.innerHTML = items.length
      ? items.map(function (item) {
          return `<article class="quiz-item">
            <div class="quiz-question">${escapeHtml(item.question)}</div>
            <div class="quiz-answer"><span>正确答案</span>${escapeHtml(item.answer)}</div>
            <div class="quiz-editor-row">
              <input class="quiz-edit-question" type="text" value="${escapeHtml(item.question)}" aria-label="编辑题目">
              <input class="quiz-edit-answer" type="text" value="${escapeHtml(item.answer)}" aria-label="编辑正确答案">
              <button type="button" class="seg" data-quiz-action="save" data-id="${item.id}">保存</button>
              <button type="button" class="link-btn quiz-delete" data-quiz-action="delete" data-id="${item.id}">删除</button>
            </div>
          </article>`;
        }).join("")
      : '<div class="empty"><p>未找到匹配的题目</p></div>';
  }

  function atlasUpgradeSummaryHtml(summary) {
    if (summary.pending === 0) {
      return `<div class="atlas-upgrade-summary"><div class="drop-item-title">当前结果升至 ${summary.targetLevel} 级汇总</div><div class="muted-tip">当前结果已全部达到目标等级</div></div>`;
    }
    const equipment = summary.equipment.length
      ? summary.equipment.map((item) => `<span class="mat ${item.q === "紫" ? "mat-purple" : "mat-orange"}">${escapeHtml(item.n)} ×${item.count}</span>`).join("")
      : '<span class="muted-tip">无需装备</span>';
    return `<div class="atlas-upgrade-summary">
      <div class="drop-item-title">当前结果升至 ${summary.targetLevel} 级汇总<span class="drop-count">${summary.pending}/${summary.total} 名未达标</span></div>
      <div class="atlas-upgrade-cost">
        <span>明鬼绳结 <b>${summary.knots}</b></span>
        <span>魂魄 <b>${summary.souls}</b></span>
        <span>成长值 <b>+${summary.growth}</b></span>
      </div>
      <div class="atlas-summary-equipment"><div class="atlas-equipment-title">所需装备</div><div class="atlas-summary-equipment-list">${equipment}</div></div>
      <div class="muted-tip">14级后不再获得成长值</div>
    </div>`;
  }

  function applyAtlas() {
    el.atlasTabs.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.atlas === atlasState.tab);
    });
    const inTab = ATLAS_DATA.items.filter((i) => i.atlas === atlasState.tab);
    let items = inTab;
    if (atlasState.levelFilter) {
      const n = Number(atlasState.levelFilter);
      items = items.filter((i) => ATLAS.levelOf(i, atlasState.levels) < n);
    }
    items = ATLAS.searchAtlas(items, atlasState.query, atlasState.levels);
    el.atlasUpgradeSummary.innerHTML = atlasUpgradeSummaryHtml(
      ATLAS.summarizeUpgrade(items, atlasState.levels, atlasState.targetLevel, ATLAS_DATA.meta.upgradeStages)
    );
    el.atlasResults.innerHTML = items.length
      ? items.map(atlasItemHtml).join("")
      : '<div class="empty"><p>未找到匹配的图鉴弟子</p></div>';
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROG_STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.disciples) ? parsed.disciples : [];
    } catch (e) {
      return [];
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(PROG_STORE_KEY, JSON.stringify({ disciples: progState.disciples }));
      el.progSaveTip.textContent = "已保存 " + new Date().toLocaleTimeString();
    } catch (e) {
      el.progSaveTip.textContent = "保存失败：浏览器本地存储不可用";
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function findDisciple(id) {
    return progState.disciples.find((d) => d.id === id);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function initProgress() {
    if (!PROG || !FDATA) return;
    el.forgeView.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view]");
      if (!btn) return;
      progState.view = btn.dataset.view;
      applyForgeView();
    });
    el.progAddDisciple.addEventListener("click", () => {
      progState.disciples.push({ id: uid(), name: "弟子" + (progState.disciples.length + 1), items: [] });
      progState.page = progState.disciples.length;
      saveProgress();
      renderProgress();
    });
    el.progSearch.addEventListener("input", () => {
      progState.query = el.progSearch.value;
      renderProgress();
    });
    el.progPrev.addEventListener("click", () => {
      if (progState.page > 0) {
        progState.page -= 1;
        renderProgress();
      }
    });
    el.progNext.addEventListener("click", () => {
      if (progState.page < progState.disciples.length) {
        progState.page += 1;
        renderProgress();
      }
    });
    el.progDisciples.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "pick-item") {
        const form = btn.closest("[data-add-form]");
        if (form) {
          form.querySelector(".prog-item-search").value = btn.dataset.name;
          form.dataset.selected = btn.dataset.name;
          form.querySelector(".prog-item-list").hidden = true;
          const tip = form.querySelector(".prog-add-tip");
          if (tip) tip.textContent = "";
        }
        return;
      }
      const dId = btn.dataset.disciple;
      const d = findDisciple(dId);
      if (!d) return;
      if (act === "set-stage") {
        const it = d.items.find((x) => x.id === btn.dataset.item);
        if (it) {
          it.progress = Number(btn.dataset.idx);
          saveProgress();
          renderProgress();
        }
      } else if (act === "toggle-add") {
        const form = el.progDisciples.querySelector(`[data-add-form="${dId}"]`);
        if (form) {
          form.hidden = !form.hidden;
          if (!form.hidden) renderItemOptions(form, "");
        }
      } else if (act === "add-item") {
        const form = el.progDisciples.querySelector(`[data-add-form="${dId}"]`);
        const raw = (form.dataset.selected || form.querySelector(".prog-item-search").value || "").trim();
        const item = FDATA.items.find((i) => i.name === raw);
        const tip = form.querySelector(".prog-add-tip");
        if (!item) {
          if (tip) tip.textContent = "未找到该橙装，请从匹配列表中选择";
          return;
        }
        d.items.push({ id: uid(), name: item.name, cat: item.cat, progress: 0 });
        resetAddForm(form);
        saveProgress();
        renderProgress();
      } else if (act === "remove-item") {
        if (confirm("确定移除该装备？")) {
          d.items = d.items.filter((x) => x.id !== btn.dataset.item);
          saveProgress();
          renderProgress();
        }
      } else if (act === "remove-disciple") {
        if (confirm("确定移除该弟子及其全部装备？")) {
          progState.disciples = progState.disciples.filter((x) => x.id !== dId);
          saveProgress();
          renderProgress();
        }
      }
    });
    el.progDisciples.addEventListener("input", (e) => {
      if (e.target.classList.contains("prog-item-search")) {
        const form = e.target.closest("[data-add-form]");
        if (form) {
          form.dataset.selected = "";
          renderItemOptions(form, e.target.value);
        }
      }
    });
    el.progDisciples.addEventListener("change", (e) => {
      if (e.target.classList.contains("prog-name")) {
        const d = findDisciple(e.target.dataset.disciple);
        if (d) {
          d.name = e.target.value.trim() || d.name;
          saveProgress();
          renderProgress();
        }
      }
    });
    applyForgeView();
  }

  function applyForgeView() {
    el.forgeView.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === progState.view);
    });
    el.forgeQuery.hidden = progState.view !== "query";
    el.forgeProgress.hidden = progState.view !== "progress";
    if (progState.view === "progress") renderProgress();
  }

  function matchOrangeItems(keyword) {
    const q = keyword.trim().toLowerCase();
    return FDATA.items
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .slice(0, 20);
  }

  function renderItemOptions(form, keyword) {
    const list = form.querySelector(".prog-item-list");
    const matches = matchOrangeItems(keyword);
    list.innerHTML = matches.map((i) =>
      `<button type="button" class="prog-item-opt" data-act="pick-item" data-name="${escapeHtml(i.name)}">${escapeHtml(i.name)}（${i.cat}·${i.quality}色）</button>`
    ).join("");
    list.hidden = matches.length === 0;
  }

  function resetAddForm(form) {
    form.querySelector(".prog-item-search").value = "";
    form.querySelector(".prog-item-list").innerHTML = "";
    form.querySelector(".prog-item-list").hidden = true;
    form.dataset.selected = "";
    const tip = form.querySelector(".prog-add-tip");
    if (tip) tip.textContent = "";
  }

  function stageTokensHtml(tokens) {
    return tokens.map((tk) => forgingTokenHtml(tk, false, true)).join("");
  }

  function progressSummaryHtml(materials) {
    return `<div class="prog-material-grid">${materials.map((material) => {
      const q = material.q === "紫" ? "mat-purple" : "mat-orange";
      return `<span class="mat material-token ${q}">${escapeHtml(material.n)} ×${material.count}</span>`;
    }).join("")}</div>`;
  }

  function equipmentHtml(d, it, options) {
    const opts = options || {};
    const hitStageIndexes = opts.hitStageIndexes || new Set();
    const readOnly = opts.readOnly === true;
    const item = PROG.findItem(FDATA, it.name);
    if (!item) {
      return `<div class="prog-equip"><span class="forge-name">${escapeHtml(it.name)}</span><span class="muted">（锻造数据缺失）</span></div>`;
    }
    const chips = item.stages.map((st, i) => {
      let cls = "prog-stage";
      if (i < it.progress) cls += " done";
      if (i === it.progress) cls += " next";
      if (hitStageIndexes.has(i)) cls += " search-hit";
      return `<button type="button" class="${cls}" data-act="set-stage" data-disciple="${d.id}" data-item="${it.id}" data-idx="${i}" title="${readOnly ? st.stage : `点击设为当前锻造阶段：${st.stage}`}"${readOnly ? " disabled" : ""}>${st.stage}</button>`;
    }).join("") + `<button type="button" class="prog-stage done-all${it.progress >= item.stages.length ? " next" : ""}" data-act="set-stage" data-disciple="${d.id}" data-item="${it.id}" data-idx="${item.stages.length}" title="${readOnly ? "全部完成" : "点击设为全部完成"}"${readOnly ? " disabled" : ""}>全部完成</button>`;
    const next = PROG.nextStage(item, it.progress);
    const remaining = PROG.remainingStages(item, it.progress);
    const nextHtml = next ? `${next.stage}：${stageTokensHtml(next.tokens)}` : "全部锻造完成";
    const remRows = remaining.map((st) => `<tr><td>${st.stage}</td><td>${stageTokensHtml(st.tokens)}</td></tr>`).join("");
    return `<div class="prog-equip">
      <div class="prog-equip-head">
        <span class="cat">${item.cat}</span>
        <span class="forge-name">${escapeHtml(item.name)}</span>
        <span class="q-badge ${item.quality === "紫" ? "q-purple" : "q-orange"}">${item.quality}色</span>
        <span class="muted">${it.progress}/${item.stages.length} 阶段</span>
        ${readOnly ? "" : `<button type="button" class="seg danger" data-act="remove-item" data-disciple="${d.id}" data-item="${it.id}">移除</button>`}
      </div>
      <div class="prog-stages">${chips}</div>
      <div class="prog-next">下一阶段：${nextHtml}</div>
      <table class="mini-table prog-material-table">
        <colgroup><col class="prog-stage-col"><col class="prog-material-col"></colgroup>
        <tbody>${remRows || '<tr><td colspan="2">已完成全部阶段</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  function discipleHtml(d) {
    const itemsHtml = d.items.slice().sort((a, b) => {
      const ia = PROG_CAT_ORDER.indexOf(a.cat);
      const ib = PROG_CAT_ORDER.indexOf(b.cat);
      return (ia === -1 ? PROG_CAT_ORDER.length : ia) - (ib === -1 ? PROG_CAT_ORDER.length : ib);
    }).map((it) => equipmentHtml(d, it)).join("");
    const summary = PROG.discipleSummary(FDATA, d);
    return `<div class="prog-disciple" data-disciple="${d.id}">
      <div class="prog-disciple-head">
        <input class="prog-name" data-disciple="${d.id}" value="${escapeHtml(d.name)}">
        <button type="button" class="seg" data-act="toggle-add" data-disciple="${d.id}">+ 添加装备</button>
        <button type="button" class="seg danger" data-act="remove-disciple" data-disciple="${d.id}">移除弟子</button>
      </div>
      <div class="prog-add-form" data-add-form="${d.id}" hidden>
        <div class="prog-pick">
          <input class="prog-item-search" placeholder="输入关键词自动匹配橙装（无需选分区）…" autocomplete="off">
          <div class="prog-item-list" hidden></div>
        </div>
        <button type="button" class="seg" data-act="add-item" data-disciple="${d.id}">添加</button>
        <span class="prog-add-tip muted-tip"></span>
      </div>
      ${itemsHtml || '<div class="muted-tip">该弟子还没有装备</div>'}
      <div class="prog-summary">
        <h4 class="drop-title">该弟子剩余材料汇总<span class="drop-count">${summary.materials.length} 种</span></h4>
        ${summary.materials.length ? progressSummaryHtml(summary.materials) : '<div class="muted-tip">无</div>'}
      </div>
    </div>`;
  }

  function renderOverallSummary() {
    const mats = PROG.overallSummary(FDATA, progState.disciples);
    el.progOverall.innerHTML = `<div class="drop-item-title">全体弟子剩余材料汇总（${progState.disciples.length} 名弟子）</div>` +
      (mats.length
        ? progressSummaryHtml(mats)
        : '<div class="muted-tip">暂无数据，添加弟子和装备后自动汇总</div>');
  }

  function progressSearchSection(title, count, body, emptyText) {
    return `<section class="prog-search-section">
      <h3 class="drop-title">${title}<span class="drop-count">${count} 条</span></h3>
      ${body || `<div class="muted-tip">${emptyText}</div>`}
    </section>`;
  }

  function renderProgressSearch() {
    const result = PROG.searchEquipment(FDATA, progState.disciples, progState.query);
    if (!result.owned.length && !result.required.length) {
      el.progSearchResults.innerHTML = '<div class="empty"><p>未找到匹配装备</p></div>';
      return;
    }

    const ownedHtml = result.owned.map((entry) => `<div class="prog-search-relation">
      <div class="prog-search-context">${escapeHtml(entry.disciple.name || "未命名弟子")} · 直接持有</div>
      ${equipmentHtml(entry.disciple, entry.progressItem, { readOnly: true })}
    </div>`).join("");

    const requiredHtml = result.required.map((entry) => {
      const hitsHtml = entry.hits.map((hit) => `<span class="prog-search-hit">
        <b>${escapeHtml(hit.stage)}</b>
        ${hit.tokens.map((tokenHit) => forgingTokenHtml(tokenHit.token, true)).join("")}
      </span>`).join("");
      return `<div class="prog-search-relation">
        <div class="prog-search-context">${escapeHtml(entry.disciple.name || "未命名弟子")} · ${escapeHtml(entry.item.name)}需要该材料</div>
        <div class="prog-search-hits">${hitsHtml}</div>
        ${equipmentHtml(entry.disciple, entry.progressItem, {
          readOnly: true,
          hitStageIndexes: new Set(entry.hits.map((hit) => hit.stageIdx))
        })}
      </div>`;
    }).join("");

    el.progSearchResults.innerHTML =
      progressSearchSection("弟子直接持有", result.owned.length, ownedHtml, "没有弟子直接持有匹配装备") +
      progressSearchSection("尚未完成的锻造材料需求", result.required.length, requiredHtml, "没有尚未完成的材料需求");
  }

  function renderProgress() {
    const total = progState.disciples.length;
    if (progState.page > total) progState.page = total;
    if (progState.page < 0) progState.page = 0;
    const page = progState.page;
    const searching = progState.query.trim() !== "";
    el.progPager.hidden = searching;
    el.progSearchResults.hidden = !searching;
    if (searching) {
      el.progOverall.hidden = true;
      el.progDisciples.hidden = true;
      el.progOverall.innerHTML = "";
      el.progDisciples.innerHTML = "";
      renderProgressSearch();
      return;
    }
    el.progSearchResults.innerHTML = "";
    el.progPageTitle.textContent = page === 0
      ? "全体弟子剩余材料汇总"
      : (progState.disciples[page - 1] ? progState.disciples[page - 1].name : "弟子");
    el.progPrev.disabled = page === 0;
    el.progNext.disabled = page >= total;
    el.progOverall.hidden = page !== 0;
    el.progDisciples.hidden = page === 0;
    if (page === 0) {
      renderOverallSummary();
      el.progDisciples.innerHTML = "";
    } else {
      const d = progState.disciples[page - 1];
      el.progOverall.innerHTML = "";
      el.progDisciples.innerHTML = d ? discipleHtml(d) : "";
    }
  }

  function dropSectionHtml(title, entries, fmt) {
    const body = entries.length
      ? entries.map(fmt).join("")
      : '<span class="mat-dash">未找到</span>';
    return `<div class="drop-block">
      <h3 class="drop-title">${title}<span class="drop-count">${entries.length} 处</span></h3>
      <div class="drop-pos">${body}</div>
    </div>`;
  }

  function dropItemHtml(g) {
    const fmtStage = (e) => `<span class="drop-chip">${e.chapter}-${e.stage}</span>`;
    const fmtReward = (e) => `<span class="drop-chip">第${e.chapter}章</span>`;
    return `<div class="drop-item">
      <h3 class="drop-item-title">${g.item}</h3>
      ${dropSectionHtml("普通关卡", g.normal, fmtStage)}
      ${dropSectionHtml("英雄关卡", g.hero, fmtStage)}
      ${dropSectionHtml("声望奖励", g.reward, fmtReward)}
    </div>`;
  }

  function applyDrops() {
    const q = DROPS.normalize(el.dropSearch.value);
    if (!q) {
      el.dropResults.innerHTML = '<div class="empty"><p>输入道具关键字开始查询</p></div>';
      return;
    }
    const groups = DROPS.groupDrops(DROP_DATA, q);
    el.dropResults.innerHTML = groups.length
      ? groups.map(dropItemHtml).join("")
      : '<div class="empty"><p>未找到匹配道具</p></div>';
  }

  function renderForgingSummary() {
    el.forgeSummaryHead.innerHTML = "<tr><th>装备名称</th>" +
      FDATA.meta.stageNames.map((s) => `<th>${s}</th>`).join("") +
      "<th>合计</th></tr>";
    el.forgeSummary.innerHTML = FDATA.summary.map((s) => "<tr><td class=\"cat\">" + s.cat + "</td>" +
      s.stages.map((v) => `<td>${FORG.splitMaterials(v).map((p) => `<div class="mat-line">${p}</div>`).join("")}</td>`).join("") +
      `<td class="badge">${s.total}</td></tr>`).join("");
  }

  function bindForging() {
    el.forgeMode.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-mode]");
      if (!btn) return;
      forgeState.mode = btn.dataset.mode;
      applyForging();
    });
    el.forgeSearch.addEventListener("input", () => {
      forgeState.query = el.forgeSearch.value;
      applyForging();
    });
  }

  function forgingTokenHtml(tk, hit, materialMode) {
    if (tk.dash) return '<span class="mat-dash">—</span>';
    const q = tk.q === "紫" ? "mat-purple" : "mat-orange";
    return `<span class="mat ${q}${materialMode ? " material-token" : ""}${hit ? " hit" : ""}">${tk.n}</span>`;
  }

  function forgingRowHtml(item, hits) {
    const eqClass = item.quality === "紫" ? "eq-purple" : "eq-orange";
    const materialMode = Array.isArray(hits);
    const stageHit = hits ? new Set(hits.map((h) => h.stageIdx)) : null;
    const tokenHit = hits ? new Map(hits.map((h) => [`${h.stageIdx}:${h.tokenIdx}`, true])) : null;
    return `<tr${stageHit ? ' class="hit-row"' : ""}>
      <td class="forge-eq">
        <span class="eq-block ${eqClass}">${item.cat}-${item.name}</span>
      </td>
      ${item.stages.map((st, si) => {
        const cellHit = stageHit ? stageHit.has(si) : false;
        return `<td${cellHit ? ' class="hit-cell"' : ""}>${st.tokens.map((tk, ti) => {
          const hit = tokenHit ? tokenHit.has(`${si}:${ti}`) : false;
          return `<div class="mat-line">${forgingTokenHtml(tk, hit, materialMode)}</div>`;
        }).join("")}</td>`;
      }).join("")}
    </tr>`;
  }

  function applyForging() {
    const q = FORG.normalizeName(forgeState.query);
    const tableHead = `<tr><th>装备</th>${FDATA.meta.stageNames.map((s) => `<th>${s}</th>`).join("")}</tr>`;
    el.forgeMode.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === forgeState.mode);
    });
    if (!q) {
      el.forgeResults.innerHTML = '<div class="empty"><p>输入装备名开始查询</p></div>';
      return;
    }
    if (forgeState.mode === "main") {
      const items = FORG.findMain(FDATA.items, q);
      el.forgeResults.innerHTML = items.length
        ? `<div class="forge-scroll"><table class="forge-h-table"><thead>${tableHead}</thead><tbody>${items.map((i) => forgingRowHtml(i, null)).join("")}</tbody></table></div>`
        : '<div class="empty"><p>未找到该主锻造装备</p></div>';
    } else {
      const found = FORG.findAsMaterial(FDATA.items, q);
      el.forgeResults.innerHTML = found.length
        ? `<div class="forge-scroll"><table class="forge-h-table"><thead>${tableHead}</thead><tbody>${found.map((r) => forgingRowHtml(r.item, r.hits)).join("")}</tbody></table></div>`
        : '<div class="empty"><p>未找到使用该素材的主锻造装备</p></div>';
    }
  }

  function renderChips() {
    el.chips.innerHTML = DATA.meta.attrTypes
      .map((a) => `<button type="button" class="chip" data-attr="${a}">${a}</button>`)
      .join("");
  }

  function renderCategoryButtons() {
    const categories = Array.isArray(DATA.meta.categories) ? DATA.meta.categories : [];
    el.categoryBtns.innerHTML = '<button type="button" class="seg" data-category="">不限</button>' +
      categories.map((category) => `<button type="button" class="seg" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  }

  function bindEvents() {
    el.search.addEventListener("input", () => {
      state.search = el.search.value;
      apply();
    });
    el.categoryBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-category]");
      if (!btn) return;
      state.category = btn.dataset.category;
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
      state.category = "";
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
      category: state.category,
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
    el.categoryBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.category === state.category);
    });
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
