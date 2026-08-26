/**
 * 特殊属性装备 · 页面渲染与交互
 * 依赖：window.SPECIAL_EQUIPMENT_DATA（数据）、window.QSQuery（查询核心）、window.QSEquipmentCompare（装备对比）
 */
(function () {
  "use strict";

  const DATA = window.SPECIAL_EQUIPMENT_DATA;
  const Q = window.QSQuery;
  const EQUIP_COMPARE = window.QSEquipmentCompare;
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
  const ATLAS_FAVORITES_KEY = "qinshi_atlas_favorites_v1";
  const ATLAS_INVENTORY_KEY = "qinshi_atlas_inventory_v1";
  const ATLAS_PINS_KEY = "qinshi_atlas_pins_v1";
  const QUIZ_STORE_KEY = "qinshi_quiz_items_v1";
  const PARTITION_TITLES = {
    atlas: "图鉴",
    drops: "关卡掉落",
    equipment: "装备属性",
    forging: "橙装锻造",
    inscription: "铭文",
    "machine-beasts": "机关兽",
    tactics: "兵法",
    formations: "合阵",
    quiz: "答题",
    loulan: "楼兰棋阵",
    settings: "设置"
  };

  const state = {
    search: "", category: null, main: null, showMain: false, filters: [], sortAttr: null, valueSource: "max", activated: false,
    comparison: { itemIds: [], group: null, tier: "红金", dimensions: [], expanded: false, started: false }
  };
  const forgeState = { mode: "main", query: "" };
  let activeBookDetail = null;

  const el = {
    search: document.getElementById("search"),
    categoryBtns: document.getElementById("category-filter"),
    mainBtns: document.getElementById("main-filter"),
    showMain: document.getElementById("show-main-attribute"),
    chips: document.getElementById("chips"),
    sortPanel: document.getElementById("sort-panel"),
    sortAttrBtns: document.getElementById("sort-attr"),
    sortTierBtns: document.getElementById("sort-tier"),
    pageTitle: document.getElementById("page-title"),
    results: document.getElementById("results"),
    tableWrap: document.getElementById("table-wrap"),
    cards: document.getElementById("cards"),
    empty: document.getElementById("empty"),
    clearAll: document.getElementById("clear-all"),
    emptyClear: document.getElementById("empty-clear"),
    comparePanel: document.getElementById("equipment-compare-panel"),
    compareToggle: document.getElementById("equipment-compare-toggle"),
    compareBody: document.getElementById("equipment-compare-body"),
    compareSelected: document.getElementById("equipment-compare-selected"),
    compareControls: document.getElementById("equipment-compare-controls"),
    compareMessage: document.getElementById("equipment-compare-message"),
    compareResult: document.getElementById("equipment-compare-result"),
    bookDetailPopover: document.getElementById("book-detail-popover"),
    bookDetailTitle: document.getElementById("book-detail-popover-title"),
    bookDetailBody: document.getElementById("book-detail-popover-body"),
    bookDetailClose: document.querySelector(".book-detail-close"),
    error: document.getElementById("data-error"),
    forgeMode: document.getElementById("forge-mode"),
    forgeSearch: document.getElementById("forge-search"),
    forgeResults: document.getElementById("forge-results"),
    forgeSummaryHead: document.getElementById("forging-summary-head"),
    forgeSummary: document.getElementById("forging-summary"),
    dropSearch: document.getElementById("drop-search"),
    dropDefaultOrange: document.getElementById("drop-default-orange"),
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
    atlasSearchField: document.getElementById("atlas-search-field"),
    atlasSearch: document.getElementById("atlas-search"),
    atlasLevelMin: document.getElementById("atlas-level-min"),
    atlasLevelMax: document.getElementById("atlas-level-max"),
    atlasTargetLevel: document.getElementById("atlas-target-level"),
    atlasFavoriteTypeWrap: document.getElementById("atlas-favorite-type-wrap"),
    atlasFavoriteType: document.getElementById("atlas-favorite-type"),
    atlasSoulFilter: document.getElementById("atlas-soul-filter"),
    atlasEquipmentFilter: document.getElementById("atlas-equipment-filter"),
    atlasNoteFilter: document.getElementById("atlas-note-filter"),
    atlasNoteToggle: document.getElementById("atlas-note-toggle"),
    atlasNoteMenu: document.getElementById("atlas-note-menu"),
    atlasSortField: document.getElementById("atlas-sort-field"),
    atlasSortDirectionWrap: document.getElementById("atlas-sort-direction-wrap"),
    atlasSortDirection: document.getElementById("atlas-sort-direction"),
    atlasFilterClear: document.getElementById("atlas-filter-clear"),
    atlasUpgradeSummary: document.getElementById("atlas-upgrade-summary"),
    atlasResults: document.getElementById("atlas-results"),
    quizSearch: document.getElementById("quiz-search"),
    quizResults: document.getElementById("quiz-results")
  };

  const progState = {
    view: "query",
    page: 0,
    query: "",
    disciples: loadProgress()
  };
  const PROG_CAT_ORDER = ["武器", "盔甲", "首饰", "典籍"];
  const atlasState = {
    activated: false,
    tab: "全部",
    query: "",
    searchField: "all",
    levelMin: 0,
    levelMax: 20,
    targetLevel: loadAtlasTargetLevel(),
    favorites: loadAtlasFavorites(),
    pins: loadAtlasPins(),
    levels: loadAtlasLevels(),
    inventory: loadAtlasInventory(),
    favoriteType: "all",
    soulFilter: "all",
    equipmentFilter: "all",
    noteSources: [],
    sortField: "default",
    sortDirection: "asc",
    inventoryEditingId: "",
    inventoryDraft: null,
    inventoryError: ""
  };
  const quizState = { query: "", items: loadQuizItems() };

  function init() {
    bindTabs();
    initForging();
    initDrops();
    initProgress();
    initAtlas();
    initQuiz();
    if (window.FORMATIONS_UI) window.FORMATIONS_UI.init();
    if (!DATA || !Q || !EQUIP_COMPARE) {
      el.error.hidden = false;
      return;
    }
    renderCategoryButtons();
    renderChips();
    bindEvents();
    apply();
  }

  function bindTabs() {
    const partitionButtons = Array.prototype.slice.call(document.querySelectorAll("[data-partition]"));
    const mobileMoreToggle = document.getElementById("mobile-more-toggle");
    const mobileMoreLayer = document.getElementById("mobile-more-layer");
    const mobileMoreClose = document.getElementById("mobile-more-close");
    const secondaryPartitions = ["inscription", "machine-beasts", "tactics", "formations", "loulan", "quiz", "settings"];
    const parts = {
      equipment: document.getElementById("partition-equipment"),
      loulan: document.getElementById("partition-loulan"),
      forging: document.getElementById("partition-forging"),
      drops: document.getElementById("partition-drops"),
      atlas: document.getElementById("partition-atlas"),
      quiz: document.getElementById("partition-quiz"),
      inscription: document.getElementById("partition-inscription"),
      "machine-beasts": document.getElementById("partition-machine-beasts"),
      tactics: document.getElementById("partition-tactics"),
      formations: document.getElementById("partition-formations"),
      settings: document.getElementById("partition-settings")
    };

    function setMoreOpen(open) {
      if (!mobileMoreLayer || !mobileMoreToggle) return;
      mobileMoreLayer.hidden = !open;
      mobileMoreToggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("mobile-menu-open", open);
    }

    function setPartitionTitle(name) {
      const title = PARTITION_TITLES[name] || "图鉴";
      if (el.pageTitle) el.pageTitle.textContent = title;
      document.title = title;
    }

    function switchPartition(name) {
      if (!parts[name]) return;
      closeBookDetailPopover();
      setPartitionTitle(name);
      if (name === "equipment") resetEquipmentView();
      partitionButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.partition === name);
      });
      Object.keys(parts).forEach((key) => {
        parts[key].hidden = key !== name;
      });
      if (mobileMoreToggle) {
        mobileMoreToggle.classList.toggle("active", secondaryPartitions.includes(name));
      }
      setMoreOpen(false);
    }

    partitionButtons.forEach((button) => {
      button.addEventListener("click", () => switchPartition(button.dataset.partition));
    });
    if (mobileMoreToggle) {
      mobileMoreToggle.addEventListener("click", () => {
        setMoreOpen(mobileMoreToggle.getAttribute("aria-expanded") !== "true");
      });
    }
    if (mobileMoreClose) mobileMoreClose.addEventListener("click", () => setMoreOpen(false));
    if (mobileMoreLayer) {
      mobileMoreLayer.addEventListener("click", (event) => {
        if (event.target === mobileMoreLayer) setMoreOpen(false);
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMoreOpen(false);
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

  function normalizeAtlasFilterLevel(value, fallback) {
    const n = Number(value);
    if (!Number.isInteger(n)) return fallback;
    return Math.max(0, Math.min(n, atlasMaxLevel()));
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

  function loadAtlasFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ATLAS_FAVORITES_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean)));
    } catch (e) {
      return [];
    }
  }

  function saveAtlasFavorites() {
    try {
      localStorage.setItem(ATLAS_FAVORITES_KEY, JSON.stringify(atlasState.favorites));
    } catch (e) {
      // 忽略存储失败
    }
  }

  function loadAtlasPins() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ATLAS_PINS_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return Array.from(new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean)));
    } catch (e) {
      return [];
    }
  }

  function saveAtlasPins() {
    try {
      localStorage.setItem(ATLAS_PINS_KEY, JSON.stringify(atlasState.pins));
    } catch (e) {
      // 忽略存储失败
    }
  }

  function loadAtlasInventory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ATLAS_INVENTORY_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.keys(parsed).reduce((result, id) => {
        const cleanId = String(id || "").trim();
        if (cleanId) result[cleanId] = ATLAS.normalizeInventoryRecord(parsed[id]);
        return result;
      }, {});
    } catch (e) {
      return {};
    }
  }

  function saveAtlasInventory() {
    try {
      localStorage.setItem(ATLAS_INVENTORY_KEY, JSON.stringify(atlasState.inventory));
    } catch (e) {
      // 忽略存储失败
    }
  }

  function closeAtlasInventoryEditor() {
    atlasState.inventoryEditingId = "";
    atlasState.inventoryDraft = null;
    atlasState.inventoryError = "";
  }

  function atlasNoteSourceInputs() {
    return Array.prototype.slice.call(el.atlasNoteMenu.querySelectorAll("[data-atlas-note-source]"));
  }

  function closeAtlasNoteFilter() {
    el.atlasNoteMenu.hidden = true;
    el.atlasNoteToggle.setAttribute("aria-expanded", "false");
  }

  function syncAtlasFilterControls() {
    el.atlasFavoriteTypeWrap.hidden = atlasState.tab !== "已收藏";
    el.atlasFavoriteType.value = atlasState.favoriteType;
    el.atlasSoulFilter.value = atlasState.soulFilter;
    el.atlasEquipmentFilter.value = atlasState.equipmentFilter;
    el.atlasSortField.value = atlasState.sortField;
    el.atlasSortDirection.value = atlasState.sortDirection;
    const noteEnabled = atlasState.equipmentFilter === "missing";
    el.atlasNoteToggle.disabled = !noteEnabled;
    el.atlasNoteFilter.classList.toggle("is-disabled", !noteEnabled);
    el.atlasNoteToggle.textContent = noteEnabled
      ? (atlasState.noteSources.length ? atlasState.noteSources.join("、") : "全部来源")
      : "需先选择装备未齐全";
    atlasNoteSourceInputs().forEach((input) => {
      input.checked = atlasState.noteSources.includes(input.dataset.atlasNoteSource);
    });
    if (!noteEnabled) closeAtlasNoteFilter();
    el.atlasSortDirectionWrap.hidden = !["knots", "souls"].includes(atlasState.sortField);
  }

  function clearAtlasAdvancedFilters() {
    atlasState.favoriteType = "all";
    atlasState.soulFilter = "all";
    atlasState.equipmentFilter = "all";
    atlasState.noteSources = [];
    atlasState.sortField = "default";
    atlasState.sortDirection = "asc";
    closeAtlasNoteFilter();
  }

  function initAtlas() {
    if (!ATLAS_DATA || !ATLAS) return;
    atlasState.levelMax = atlasMaxLevel();
    el.atlasLevelMin.max = String(atlasMaxLevel());
    el.atlasLevelMax.max = String(atlasMaxLevel());
    el.atlasLevelMin.value = String(atlasState.levelMin);
    el.atlasLevelMax.value = String(atlasState.levelMax);
    el.atlasTargetLevel.min = "1";
    el.atlasTargetLevel.max = String(atlasMaxLevel());
    el.atlasTargetLevel.value = String(atlasState.targetLevel);
    el.atlasTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-atlas]");
      if (!btn) return;
      atlasState.activated = true;
      atlasState.tab = btn.dataset.atlas;
      applyAtlas();
    });
    el.atlasSearch.addEventListener("input", () => {
      atlasState.query = el.atlasSearch.value;
      if (atlasState.query.trim()) atlasState.activated = true;
      applyAtlas();
    });
    el.atlasSearchField.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.searchField = el.atlasSearchField.value;
      applyAtlas();
    });
    [el.atlasLevelMin, el.atlasLevelMax].forEach((input) => {
      input.addEventListener("input", () => {
        atlasState.activated = true;
        atlasState.levelMin = normalizeAtlasFilterLevel(el.atlasLevelMin.value, 0);
        atlasState.levelMax = normalizeAtlasFilterLevel(el.atlasLevelMax.value, atlasMaxLevel());
        applyAtlas();
      });
      input.addEventListener("change", () => {
        el.atlasLevelMin.value = String(atlasState.levelMin);
        el.atlasLevelMax.value = String(atlasState.levelMax);
      });
    });
    el.atlasTargetLevel.addEventListener("change", () => {
      closeAtlasInventoryEditor();
      atlasState.activated = true;
      atlasState.targetLevel = normalizeAtlasTargetLevel(el.atlasTargetLevel.value);
      el.atlasTargetLevel.value = String(atlasState.targetLevel);
      saveAtlasTargetLevel();
      applyAtlas();
    });
    el.atlasFavoriteType.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.favoriteType = el.atlasFavoriteType.value;
      applyAtlas();
    });
    el.atlasSoulFilter.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.soulFilter = el.atlasSoulFilter.value;
      applyAtlas();
    });
    el.atlasEquipmentFilter.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.equipmentFilter = el.atlasEquipmentFilter.value;
      applyAtlas();
    });
    el.atlasSortField.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.sortField = el.atlasSortField.value;
      applyAtlas();
    });
    el.atlasSortDirection.addEventListener("change", () => {
      atlasState.activated = true;
      atlasState.sortDirection = el.atlasSortDirection.value;
      applyAtlas();
    });
    el.atlasNoteToggle.addEventListener("click", () => {
      if (el.atlasNoteToggle.disabled) return;
      const open = el.atlasNoteToggle.getAttribute("aria-expanded") === "true";
      el.atlasNoteMenu.hidden = open;
      el.atlasNoteToggle.setAttribute("aria-expanded", String(!open));
    });
    el.atlasNoteMenu.addEventListener("change", (event) => {
      const input = event.target.closest("[data-atlas-note-source]");
      if (!input) return;
      atlasState.activated = true;
      atlasState.noteSources = atlasNoteSourceInputs()
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.dataset.atlasNoteSource);
      applyAtlas();
    });
    el.atlasFilterClear.addEventListener("click", () => {
      atlasState.activated = true;
      clearAtlasAdvancedFilters();
      applyAtlas();
    });
    document.addEventListener("click", (event) => {
      if (!el.atlasNoteFilter.contains(event.target)) closeAtlasNoteFilter();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAtlasNoteFilter();
    });
    el.atlasResults.addEventListener("change", (e) => {
      if (e.target.classList.contains("atlas-level")) {
        closeAtlasInventoryEditor();
        atlasState.levels[e.target.dataset.id] = parseInt(e.target.value, 10) || 0;
        saveAtlasLevels();
        applyAtlas();
        return;
      }
      if (e.target.matches("[data-atlas-inventory-owned]")) {
        const key = e.target.dataset.atlasInventoryOwned;
        if (atlasState.inventoryDraft && atlasState.inventoryDraft.equipment[key]) {
          atlasState.inventoryDraft.equipment[key].owned = e.target.value === "owned";
          if (atlasState.inventoryDraft.equipment[key].owned) atlasState.inventoryDraft.equipment[key].note = "";
          applyAtlas();
        }
      }
    });
    el.atlasResults.addEventListener("input", (e) => {
      if (!atlasState.inventoryDraft) return;
      if (e.target.matches("[data-atlas-inventory-souls]")) {
        atlasState.inventoryDraft.soulsOwned = e.target.value;
      } else if (e.target.matches("[data-atlas-inventory-note]")) {
        const key = e.target.dataset.atlasInventoryNote;
        if (atlasState.inventoryDraft.equipment[key]) atlasState.inventoryDraft.equipment[key].note = e.target.value;
      }
    });
    el.atlasResults.addEventListener("click", (e) => {
      const favoriteButton = e.target.closest("button[data-atlas-favorite]");
      if (favoriteButton) {
        const id = favoriteButton.dataset.atlasFavorite;
        const index = atlasState.favorites.indexOf(id);
        if (index >= 0) {
          atlasState.favorites.splice(index, 1);
          atlasState.pins = atlasState.pins.filter((pinId) => pinId !== id);
          saveAtlasPins();
          if (atlasState.inventoryEditingId === id) closeAtlasInventoryEditor();
        } else {
          atlasState.favorites.push(id);
        }
        saveAtlasFavorites();
        applyAtlas();
        return;
      }
      const pinButton = e.target.closest("button[data-atlas-pin]");
      if (pinButton) {
        const id = pinButton.dataset.atlasPin;
        if (!atlasState.favorites.includes(id)) return;
        const index = atlasState.pins.indexOf(id);
        if (index >= 0) atlasState.pins.splice(index, 1);
        else atlasState.pins.push(id);
        saveAtlasPins();
        applyAtlas();
        return;
      }
      const editButton = e.target.closest("button[data-atlas-inventory-edit]");
      if (editButton) {
        const id = editButton.dataset.atlasInventoryEdit;
        const item = ATLAS_DATA.items.find((candidate) => String(candidate.id) === id);
        if (!item || !atlasState.favorites.includes(id)) return;
        const plan = ATLAS.upgradePlan(item, ATLAS.levelOf(item, atlasState.levels), atlasState.targetLevel, ATLAS_DATA.meta.upgradeStages);
        atlasState.inventoryEditingId = id;
        atlasState.inventoryDraft = makeAtlasInventoryDraft(id, plan);
        atlasState.inventoryError = "";
        applyAtlas();
        return;
      }
      if (e.target.closest("button[data-atlas-inventory-cancel]")) {
        closeAtlasInventoryEditor();
        applyAtlas();
        return;
      }
      const saveButton = e.target.closest("button[data-atlas-inventory-save]");
      if (saveButton && atlasState.inventoryDraft) {
        const rawSouls = String(atlasState.inventoryDraft.soulsOwned == null ? "" : atlasState.inventoryDraft.soulsOwned).trim();
        if (rawSouls && !/^\d+$/.test(rawSouls)) {
          atlasState.inventoryError = "已有魂魄只能填写大于或等于 0 的整数";
          applyAtlas();
          return;
        }
        const id = saveButton.dataset.atlasInventorySave;
        atlasState.inventory[id] = ATLAS.normalizeInventoryRecord(atlasState.inventoryDraft);
        saveAtlasInventory();
        closeAtlasInventoryEditor();
        applyAtlas();
      }
    });
    el.atlasUpgradeSummary.addEventListener("click", (e) => {
      const button = e.target.closest(".atlas-summary-equipment-toggle");
      if (!button) return;
      const summaryCard = button.closest(".atlas-upgrade-summary");
      if (!summaryCard) return;
      const equipment = summaryCard.querySelector(".atlas-summary-equipment");
      if (!equipment) return;
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.textContent = expanded ? "展开所需装备" : "收起所需装备";
      equipment.classList.toggle("is-expanded", !expanded);
    });
    applyAtlas();
  }

  function atlasIndexedEquipment(items) {
    return ATLAS.sortEquipment((items || []).map((token, index) => ({ ...token, inventoryIndex: index })));
  }

  function makeAtlasInventoryDraft(itemId, plan) {
    const saved = ATLAS.normalizeInventoryRecord(atlasState.inventory[itemId]);
    const draft = {
      soulsOwned: saved.soulsOwned == null ? "" : String(saved.soulsOwned),
      equipment: {}
    };
    plan.equipmentStages.forEach((stage) => {
      (stage.items || []).forEach((token, index) => {
        const key = ATLAS.equipmentRecordKey(stage.key, index);
        const prior = saved.equipment[key];
        draft.equipment[key] = prior && prior.name === token.n
          ? { name: token.n, owned: prior.owned === true, note: prior.note || "" }
          : { name: token.n, owned: false, note: "" };
      });
    });
    return draft;
  }

  function atlasInventoryEquipmentStatus(itemId, stage, token, favorite) {
    if (!favorite) return "";
    const record = ATLAS.normalizeInventoryRecord(atlasState.inventory[itemId]);
    const key = ATLAS.equipmentRecordKey(stage.key, token.inventoryIndex);
    const saved = record.equipment[key];
    if (!saved || saved.name !== token.n) return "";
    if (saved.owned) return '<strong class="atlas-equipment-owned" title="已拥有">√</strong>';
    return `<span class="atlas-equipment-note">${escapeHtml(saved.note || "未拥有")}</span>`;
  }

  function atlasEquipmentHtml(itemId, plan, favorite) {
    if (!plan.equipmentStages.length) return '<div class="muted-tip">该目标区间无需装备</div>';
    return `<div class="atlas-equipment-stage-list">${plan.equipmentStages.map((stage) => `<div class="atlas-equipment-stage">
      <span class="atlas-stage-key">${escapeHtml(stage.key)}</span>
      <span class="atlas-equipment-items">${atlasIndexedEquipment(stage.items).map((token) => `<span class="atlas-equipment-entry"><span class="mat material-token ${token.q === "紫" ? "mat-purple" : "mat-orange"}">${escapeHtml(token.n)}</span>${atlasInventoryEquipmentStatus(itemId, stage, token, favorite)}</span>`).join("") || '<span class="mat-dash">无</span>'}</span>
    </div>`).join("")}</div>`;
  }

  function atlasInventoryEditorHtml(itemId, plan) {
    if (atlasState.inventoryEditingId !== itemId || !atlasState.inventoryDraft) return "";
    const draft = atlasState.inventoryDraft;
    const equipmentRows = plan.equipmentStages.flatMap((stage) => atlasIndexedEquipment(stage.items).map((token) => {
      const key = ATLAS.equipmentRecordKey(stage.key, token.inventoryIndex);
      const value = draft.equipment[key] || { name: token.n, owned: false, note: "" };
      draft.equipment[key] = value;
      return `<div class="atlas-inventory-equipment-row">
        <span class="atlas-stage-key">${escapeHtml(stage.key)}</span>
        <span class="mat material-token ${token.q === "紫" ? "mat-purple" : "mat-orange"}">${escapeHtml(token.n)}</span>
        <select data-atlas-inventory-owned="${escapeHtml(key)}" aria-label="${escapeHtml(token.n)}拥有状态">
          <option value="missing"${value.owned ? "" : " selected"}>未拥有</option>
          <option value="owned"${value.owned ? " selected" : ""}>已拥有</option>
        </select>
        <input type="text" data-atlas-inventory-note="${escapeHtml(key)}" value="${escapeHtml(value.note)}" placeholder="未拥有备注（可选）"${value.owned ? " hidden" : ""}>
      </div>`;
    })).join("");
    return `<div class="atlas-inventory-editor">
      <div class="atlas-inventory-title">个人库存</div>
      <label class="atlas-inventory-souls">已有魂魄
        <input type="number" min="0" step="1" data-atlas-inventory-souls value="${escapeHtml(draft.soulsOwned)}" placeholder="未填写">
      </label>
      <div class="atlas-inventory-equipment-list">${equipmentRows || '<span class="muted-tip">当前目标区间没有所需装备</span>'}</div>
      ${atlasState.inventoryError ? `<div class="atlas-inventory-error">${escapeHtml(atlasState.inventoryError)}</div>` : ""}
      <div class="atlas-inventory-actions">
        <button type="button" class="seg active" data-atlas-inventory-save="${escapeHtml(itemId)}">保存库存</button>
        <button type="button" class="seg" data-atlas-inventory-cancel>取消</button>
      </div>
    </div>`;
  }

  function atlasSoulHtml(itemId, souls, favorite) {
    const base = `魂魄 <b>${souls}</b>`;
    if (!favorite) return base;
    const record = ATLAS.normalizeInventoryRecord(atlasState.inventory[itemId]);
    const status = ATLAS.soulInventoryStatus(souls, record.soulsOwned);
    if (status.state === "unset") return base;
    if (status.state === "enough") return `${base}<span class="atlas-inventory-suffix">（库存达标）</span>`;
    return `${base}<span class="atlas-inventory-suffix">（已有${status.owned}，还差${status.missing}）</span>`;
  }

  function atlasItemHtml(item) {
    const L = ATLAS.levelOf(item, atlasState.levels);
    const itemId = String(item.id);
    const element = ATLAS.elementOfDisciple(item.name);
    const favorite = atlasState.favorites.includes(itemId);
    const pinned = favorite && atlasState.pins.includes(itemId);
    const plan = ATLAS.upgradePlan(item, L, atlasState.targetLevel, ATLAS_DATA.meta.upgradeStages);
    const equipmentHtml = atlasEquipmentHtml(itemId, plan, favorite);
    const upgradeHtml = plan.reached
      ? `<div class="atlas-upgrade done">已达到目标等级（${plan.currentLevel} / ${plan.targetLevel}级）</div>`
      : `<div class="atlas-upgrade">
          <div class="atlas-upgrade-title">升至 ${plan.targetLevel} 级</div>
          <div class="atlas-upgrade-cost">
            <span>明鬼绳结 <b>${plan.knots}</b></span>
            <span>${atlasSoulHtml(itemId, plan.souls, favorite)}</span>
            <span>成长值 <b>+${plan.growth}</b></span>
          </div>
          <div class="muted-tip">14级后不再获得成长值</div>
          <div class="atlas-upgrade-equipment"><div class="atlas-equipment-title">所需装备</div>${equipmentHtml}</div>
        </div>`;
    return `<div class="atlas-item${favorite ? " atlas-item-favorite" : ""}${pinned ? " atlas-item-pinned" : ""}" data-atlas-item="${escapeHtml(itemId)}">
      <div class="atlas-head">
        ${pinned ? '<span class="atlas-pin-badge">置顶</span>' : ""}
        <span class="q-badge q-orange">${item.atlas}图鉴</span>
        <span class="forge-name">${escapeHtml(item.name)}</span>
        <button type="button" class="atlas-favorite-toggle${favorite ? " is-favorite" : ""}" data-atlas-favorite="${escapeHtml(itemId)}" aria-pressed="${favorite}" title="${favorite ? "取消收藏" : "收藏图鉴"}" aria-label="${favorite ? "取消收藏" : "收藏图鉴"}">${favorite ? "★" : "☆"}</button>
        ${favorite ? `<button type="button" class="seg atlas-pin-toggle${pinned ? " is-pinned" : ""}" data-atlas-pin="${escapeHtml(itemId)}" aria-pressed="${pinned}">${pinned ? "取消置顶" : "置顶"}</button>` : ""}
        ${favorite ? `<button type="button" class="seg atlas-inventory-edit" data-atlas-inventory-edit="${escapeHtml(itemId)}">编辑库存</button>` : ""}
        <label class="atlas-level-label">图鉴等级
          <input type="number" class="atlas-level" data-id="${item.id}" value="${L}" min="0" max="${atlasMaxLevel()}">
        </label>
      </div>
      <div class="atlas-meta">
        <span>获取途径：${escapeHtml(item.acquire) || "—"}</span>
        <span>所属图鉴：${item.group ? `<span class="atlas-group">${escapeHtml(item.group)}</span>` : "—"}</span>
        ${element ? `<span>五行属性：<span class="atlas-element" data-element="${escapeHtml(element)}">${escapeHtml(element)}</span></span>` : ""}
      </div>
      ${upgradeHtml}
      ${atlasInventoryEditorHtml(itemId, plan)}
    </div>`;
  }

  function initQuiz() {
    if (!QUIZ_DATA || !QUIZ) return;
    el.quizSearch.addEventListener("input", function () {
      quizState.query = el.quizSearch.value;
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

  function applyQuiz() {
    if (!QUIZ.hasQuery(quizState.query)) {
      el.quizResults.innerHTML = "";
      el.quizResults.hidden = true;
      return;
    }
    el.quizResults.hidden = false;
    var items = QUIZ.search(quizState.items, quizState.query);
    el.quizResults.innerHTML = items.length
      ? items.map(function (item) {
          return `<article class="quiz-item">
            <div class="quiz-question">${escapeHtml(item.question)}</div>
            <div class="quiz-answer"><span>正确答案</span>${escapeHtml(item.answer)}</div>
          </article>`;
        }).join("")
      : '<div class="empty"><p>未找到匹配的题目</p></div>';
  }

  function atlasUpgradeSummaryHtml(summary) {
    if (summary.total === 0) {
      return '<div class="atlas-upgrade-summary"><div class="drop-item-title">当前筛选结果汇总</div><div class="muted-tip">当前条件下没有符合的图鉴</div></div>';
    }
    if (summary.pending === 0) {
      return `<div class="atlas-upgrade-summary"><div class="drop-item-title">当前结果升至 ${summary.targetLevel} 级汇总</div><div class="muted-tip">当前结果已全部达到目标等级</div></div>`;
    }
    const hasEquipment = summary.equipment.length > 0;
    const equipment = hasEquipment
      ? summary.equipment.map((item) => `<span class="mat material-token ${item.q === "紫" ? "mat-purple" : "mat-orange"}">${escapeHtml(item.n)} ×${item.count}</span>`).join("")
      : '<span class="muted-tip">无需装备</span>';
    return `<div class="atlas-upgrade-summary">
      <div class="drop-item-title">当前结果升至 ${summary.targetLevel} 级汇总<span class="drop-count">${summary.pending}/${summary.total} 名未达标</span></div>
      <div class="atlas-upgrade-cost">
        <span>明鬼绳结 <b>${summary.knots}</b></span>
        <span>魂魄 <b>${summary.souls}</b></span>
        <span>成长值 <b>+${summary.growth}</b></span>
      </div>
      ${hasEquipment ? '<button type="button" class="seg atlas-summary-equipment-toggle" aria-expanded="false">展开所需装备</button>' : ""}
      <div class="atlas-summary-equipment"><div class="atlas-equipment-title">所需装备</div><div class="atlas-summary-equipment-list">${equipment}</div></div>
      <div class="muted-tip">14级后不再获得成长值</div>
    </div>`;
  }

  function applyAtlas() {
    el.atlasTabs.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.atlas === atlasState.tab);
    });
    syncAtlasFilterControls();
    if (!atlasState.activated) {
      el.atlasUpgradeSummary.innerHTML = "";
      el.atlasResults.innerHTML = "";
      el.atlasUpgradeSummary.hidden = true;
      el.atlasResults.hidden = true;
      return;
    }
    el.atlasUpgradeSummary.hidden = false;
    el.atlasResults.hidden = false;
    const items = ATLAS.filterAtlas(ATLAS_DATA.items, {
      category: atlasState.tab,
      minLevel: atlasState.levelMin,
      maxLevel: atlasState.levelMax,
      query: atlasState.query,
      field: atlasState.searchField,
      targetLevel: atlasState.targetLevel,
      favorites: atlasState.favorites,
      pins: atlasState.pins,
      levels: atlasState.levels,
      inventory: atlasState.inventory,
      upgradeStages: ATLAS_DATA.meta.upgradeStages,
      favoriteType: atlasState.favoriteType,
      soulFilter: atlasState.soulFilter,
      equipmentFilter: atlasState.equipmentFilter,
      noteSources: atlasState.noteSources,
      sortField: atlasState.sortField,
      sortDirection: atlasState.sortDirection
    });
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
      const query = el.progSearch.value;
      const exact = PROG.searchDisciples(progState.disciples, query).find((entry) => entry.exact);
      if (exact) {
        openProgressDisciple(exact.index);
        return;
      }
      progState.query = query;
      renderProgress();
    });
    el.progSearchResults.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-prog-disciple-index]");
      if (!btn) return;
      openProgressDisciple(Number(btn.dataset.progDiscipleIndex));
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
    return PROG.sortMaterialTokens(tokens).map((tk) => forgingTokenHtml(tk, false, true)).join("");
  }

  function progressSummaryHtml(materials, overall) {
    return `<div class="prog-material-grid${overall ? " prog-material-grid-overall" : ""}">${materials.map((material) => {
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
    const remRows = remaining.map((st) => `<tr><td><div class="prog-stage-label">${st.stage}</div></td><td><div class="prog-stage-materials">${stageTokensHtml(st.tokens)}</div></td></tr>`).join("");
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
        ? progressSummaryHtml(mats, true)
        : '<div class="muted-tip">暂无数据，添加弟子和装备后自动汇总</div>');
  }

  function progressSearchSection(title, count, body, emptyText) {
    return `<section class="prog-search-section">
      <h3 class="drop-title">${title}<span class="drop-count">${count} 条</span></h3>
      ${body || `<div class="muted-tip">${emptyText}</div>`}
    </section>`;
  }

  function openProgressDisciple(index) {
    if (!Number.isInteger(index) || index < 0 || index >= progState.disciples.length) return;
    progState.query = "";
    el.progSearch.value = "";
    progState.page = index + 1;
    renderProgress();
  }

  function renderProgressSearch() {
    const disciples = PROG.searchDisciples(progState.disciples, progState.query);
    const result = PROG.searchEquipment(FDATA, progState.disciples, progState.query);
    if (!disciples.length && !result.owned.length && !result.required.length) {
      el.progSearchResults.innerHTML = '<div class="empty"><p>未找到匹配的弟子或装备</p></div>';
      return;
    }

    const discipleHtml = disciples.length ? `<section class="prog-search-section prog-disciple-results">
      <h3 class="drop-title">匹配弟子<span class="drop-count">${disciples.length} 名</span></h3>
      <div class="prog-disciple-matches">${disciples.map((entry) => `<button type="button" class="seg" data-prog-disciple-index="${entry.index}">${escapeHtml(entry.disciple.name || "未命名弟子")}</button>`).join("")}</div>
    </section>` : "";

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

    el.progSearchResults.innerHTML = discipleHtml +
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
    el.dropDefaultOrange.hidden = Boolean(q);
    if (!q) {
      el.dropResults.innerHTML = "";
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
      el.forgeResults.innerHTML = "";
      el.forgeResults.hidden = true;
      return;
    }
    el.forgeResults.hidden = false;
    if (forgeState.mode === "main") {
      const items = FORG.findMain(FDATA.items, q);
      el.forgeResults.innerHTML = items.length
        ? `<div class="forge-scroll forge-scroll-main"><table class="forge-h-table"><thead>${tableHead}</thead><tbody>${items.map((i) => forgingRowHtml(i, null)).join("")}</tbody></table></div>`
        : '<div class="empty"><p>未找到该主锻造装备</p></div>';
    } else {
      const found = FORG.findAsMaterial(FDATA.items, q);
      el.forgeResults.innerHTML = found.length
        ? `<div class="forge-scroll forge-scroll-material"><table class="forge-h-table"><thead>${tableHead}</thead><tbody>${found.map((r) => forgingRowHtml(r.item, r.hits)).join("")}</tbody></table></div>`
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
    el.categoryBtns.innerHTML = '<button type="button" class="seg" data-category="">除典籍外</button>' +
      categories.map((category) => `<button type="button" class="seg" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  }

  function bindEvents() {
    el.search.addEventListener("input", () => {
      state.search = el.search.value;
      state.activated = hasEquipmentConditions();
      apply();
    });
    el.categoryBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-category]");
      if (!btn) return;
      state.category = btn.dataset.category;
      state.activated = true;
      apply();
    });
    el.mainBtns.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-main]");
      if (!btn) return;
      state.main = btn.dataset.main;
      state.activated = true;
      apply();
    });
    el.showMain.addEventListener("change", () => {
      state.showMain = el.showMain.checked;
      apply();
    });
    el.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const attr = btn.dataset.attr;
      const idx = state.filters.indexOf(attr);
      if (idx >= 0) {
        state.filters.splice(idx, 1);
      } else {
        state.filters.push(attr);
      }
      if (state.filters.indexOf(state.sortAttr) === -1) {
        state.sortAttr = state.filters.length ? state.filters[0] : null;
      }
      state.activated = hasEquipmentConditions();
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
    el.clearAll.addEventListener("click", resetEquipmentView);
    el.emptyClear.addEventListener("click", resetEquipmentView);
    el.results.addEventListener("click", (event) => {
      const compareButton = event.target.closest("[data-compare-add]");
      if (compareButton) {
        toggleEquipmentComparison(compareButton.dataset.compareAdd);
        return;
      }
      const button = event.target.closest(".book-detail-toggle");
      if (!button) return;
      event.stopPropagation();
      toggleBookDetailPopover(button);
    });
    el.compareToggle.addEventListener("click", () => {
      state.comparison.expanded = !state.comparison.expanded;
      renderEquipmentComparison();
    });
    el.comparePanel.addEventListener("click", handleEquipmentCompareClick);
    el.comparePanel.addEventListener("change", handleEquipmentCompareChange);
    el.bookDetailClose.addEventListener("click", closeBookDetailPopover);
    el.bookDetailPopover.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".book-detail-toggle")) closeBookDetailPopover();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeBookDetailPopover();
    });
    window.addEventListener("resize", closeBookDetailPopover);
    window.addEventListener("scroll", closeBookDetailPopover, true);
  }

  function selectedComparisonItems() {
    return state.comparison.itemIds.map((id) => DATA.items.find((item) => item.id === id)).filter(Boolean);
  }

  function reconcileComparisonDimensions() {
    const available = EQUIP_COMPARE.availableDimensions(selectedComparisonItems(), state.comparison.tier);
    state.comparison.dimensions = state.comparison.dimensions.filter((dimension) => available.indexOf(dimension) >= 0);
    return available;
  }

  function toggleEquipmentComparison(itemId) {
    const item = DATA.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const next = EQUIP_COMPARE.toggleSelection(state.comparison.itemIds, state.comparison.group, item);
    if (!next.changed) return;
    state.comparison.itemIds = next.itemIds;
    state.comparison.group = next.group;
    if (next.selected) state.comparison.expanded = true;
    if (!next.itemIds.length) {
      state.comparison.dimensions = [];
      state.comparison.started = false;
    }
    reconcileComparisonDimensions();
    apply();
  }

  function removeEquipmentFromComparison(itemId) {
    state.comparison.itemIds = state.comparison.itemIds.filter((id) => id !== itemId);
    if (!state.comparison.itemIds.length) {
      state.comparison.group = null;
      state.comparison.dimensions = [];
      state.comparison.started = false;
    }
    reconcileComparisonDimensions();
    apply();
  }

  function clearEquipmentComparison() {
    state.comparison.itemIds = [];
    state.comparison.group = null;
    state.comparison.dimensions = [];
    state.comparison.started = false;
    state.comparison.expanded = false;
    apply();
  }

  function equipmentCompareActionHtml(item) {
    const action = EQUIP_COMPARE.selectionAction(state.comparison.itemIds, state.comparison.group, item);
    const title = action.incompatible ? ' title="仅可加入同一大类装备"' : action.selected ? ' title="再次点击取消加入"' : "";
    return `<button type="button" class="seg equipment-compare-add${action.selected ? " is-added" : ""}" data-compare-add="${escapeHtml(item.id)}"${action.disabled ? " disabled" : ""}${title}>${action.label}</button>`;
  }

  function compareCellValueHtml(row, dimension) {
    if (!row.available) return '<span class="equipment-compare-unavailable">该档位无数据</span>';
    const entry = row.values[dimension];
    if (!entry) return '<span class="equipment-compare-unavailable">—</span>';
    const value = `<span class="${entry.isMax ? "equipment-compare-highest" : "equipment-compare-value"}">${escapeHtml(entry.display)}</span>`;
    const difference = entry.differenceDisplay
      ? `（<span class="equipment-compare-difference">${escapeHtml(entry.differenceDisplay)}</span>）`
      : "";
    return value + difference;
  }

  function renderEquipmentComparisonResult(items) {
    if (!state.comparison.started) return "";
    if (items.length < 2) return '<div class="equipment-compare-empty">至少选择2件同类装备</div>';
    if (!state.comparison.dimensions.length) return '<div class="equipment-compare-empty">请选择一个或多个对比维度</div>';
    const model = EQUIP_COMPARE.compareItems(items, state.comparison.tier, state.comparison.dimensions);
    if (!model.rows.some((row) => row.available)) {
      return '<div class="equipment-compare-empty">所选装备在该档位均无属性数据</div>';
    }
    const desktop = `<div class="equipment-compare-table-wrap"><table class="equipment-compare-table"><thead><tr><th>对比维度</th>${model.rows.map((row) =>
      `<th>${equipmentNameHtml(row.item)}</th>`
    ).join("")}</tr></thead><tbody>${model.dimensions.map((dimension) => `<tr><th>${escapeHtml(dimension)}</th>${model.rows.map((row) =>
      `<td>${compareCellValueHtml(row, dimension)}</td>`
    ).join("")}</tr>`).join("")}</tbody></table></div>`;
    const mobile = `<div class="equipment-compare-cards">${model.rows.map((row) => `<article class="equipment-compare-card"><header>${equipmentNameHtml(row.item)}</header>${row.available
      ? `<dl>${model.dimensions.map((dimension) => `<div><dt>${escapeHtml(dimension)}</dt><dd>${compareCellValueHtml(row, dimension)}</dd></div>`).join("")}</dl>`
      : '<div class="equipment-compare-unavailable">该档位无数据</div>'}</article>`).join("")}</div>`;
    return desktop + mobile;
  }

  function renderEquipmentComparison() {
    const items = selectedComparisonItems();
    const availableDimensions = reconcileComparisonDimensions();
    el.comparePanel.classList.toggle("is-empty", items.length === 0);
    el.compareToggle.setAttribute("aria-expanded", String(state.comparison.expanded));
    el.compareToggle.innerHTML = `<span>装备对比（${items.length}）</span><span aria-hidden="true">${state.comparison.expanded ? "▾" : "▸"}</span>`;
    el.compareBody.hidden = !state.comparison.expanded;
    if (!state.comparison.expanded) return;
    el.compareSelected.innerHTML = items.length
      ? `<div class="equipment-compare-selected-head"><strong>${escapeHtml(state.comparison.group)}大类</strong><button type="button" class="link-btn" data-compare-action="clear-items">清空全部</button></div><div class="equipment-compare-selected-list">${items.map((item) =>
        `<span class="equipment-compare-selected-item">${equipmentNameHtml(item)}<button type="button" data-compare-remove="${escapeHtml(item.id)}" aria-label="移除${escapeHtml(item.name)}">×</button></span>`
      ).join("")}</div>`
      : '<p class="muted-tip">从下方搜索或筛选结果中加入同一大类装备。</p>';
    const tiers = ["紫色", "橙色", "橙金", "红色", "红金"];
    el.compareControls.innerHTML = items.length ? `<div class="equipment-compare-control-row"><label><span>对比档位</span><select data-compare-tier>${tiers.map((tier) =>
      `<option value="${tier}"${tier === state.comparison.tier ? " selected" : ""}>${tier}</option>`
    ).join("")}</select></label><div class="equipment-compare-dimension-actions"><button type="button" class="link-btn" data-compare-action="select-all">全选维度</button><button type="button" class="link-btn" data-compare-action="clear-dimensions">清空维度</button></div></div><div class="equipment-compare-dimensions">${availableDimensions.map((dimension) =>
      `<button type="button" class="chip${state.comparison.dimensions.indexOf(dimension) >= 0 ? " active" : ""}" data-compare-dimension="${escapeHtml(dimension)}">${escapeHtml(dimension)}</button>`
    ).join("") || '<span class="muted-tip">当前档位没有可比较的副属性</span>'}</div><button type="button" class="seg active equipment-compare-start" data-compare-action="start">开始对比</button>` : "";
    el.compareMessage.textContent = items.length < 2 ? "至少选择2件同类装备" : state.comparison.dimensions.length ? "" : "请选择一个或多个对比维度";
    el.compareResult.innerHTML = renderEquipmentComparisonResult(items);
  }

  function handleEquipmentCompareClick(event) {
    const removeButton = event.target.closest("[data-compare-remove]");
    if (removeButton) {
      removeEquipmentFromComparison(removeButton.dataset.compareRemove);
      return;
    }
    const dimensionButton = event.target.closest("[data-compare-dimension]");
    if (dimensionButton) {
      const dimension = dimensionButton.dataset.compareDimension;
      const index = state.comparison.dimensions.indexOf(dimension);
      if (index >= 0) state.comparison.dimensions.splice(index, 1);
      else state.comparison.dimensions.push(dimension);
      renderEquipmentComparison();
      return;
    }
    const actionButton = event.target.closest("[data-compare-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.compareAction;
    if (action === "clear-items") clearEquipmentComparison();
    else if (action === "select-all") {
      state.comparison.dimensions = EQUIP_COMPARE.availableDimensions(selectedComparisonItems(), state.comparison.tier);
      renderEquipmentComparison();
    } else if (action === "clear-dimensions") {
      state.comparison.dimensions = [];
      renderEquipmentComparison();
    } else if (action === "start") {
      state.comparison.started = true;
      renderEquipmentComparison();
    }
  }

  function handleEquipmentCompareChange(event) {
    if (!event.target.matches("[data-compare-tier]")) return;
    state.comparison.tier = event.target.value;
    reconcileComparisonDimensions();
    renderEquipmentComparison();
  }

  function hasEquipmentConditions() {
    return state.search.trim() !== "" || state.category !== null ||
      state.main !== null || state.filters.length > 0;
  }

  function resetEquipmentView() {
    state.search = "";
    state.category = null;
    state.main = null;
    state.showMain = false;
    state.filters = [];
    state.sortAttr = null;
    state.valueSource = "max";
    state.activated = false;
    el.search.value = "";
    apply();
  }

  function apply() {
    closeBookDetailPopover();
    renderControls();
    renderEquipmentComparison();
    if (!state.activated) {
      el.results.hidden = true;
      el.empty.hidden = true;
      return;
    }
    const items = Q.queryItems(DATA.items, {
      search: state.search,
      category: state.category,
      main: state.main == null ? "" : state.main,
      filters: state.filters,
      sortAttr: state.sortAttr,
      valueSource: state.valueSource
    });
    renderTable(items);
    renderCards(items);
    const isEmpty = items.length === 0;
    el.results.hidden = isEmpty;
    el.empty.hidden = !isEmpty;
  }

  function renderControls() {
    el.categoryBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", state.category !== null && btn.dataset.category === state.category);
    });
    el.mainBtns.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", state.main !== null && btn.dataset.main === state.main);
    });
    el.showMain.checked = state.showMain;
    document.querySelectorAll(".chip").forEach((btn) => {
      const attr = btn.dataset.attr;
      const active = state.filters.indexOf(attr) >= 0;
      btn.classList.toggle("active", active);
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

  function tokenHtml(tokens, separator) {
    if (!tokens || tokens.length === 0) return '<span class="tier-none">—</span>';
    const joiner = separator === undefined ? '<span class="plus"> + </span>' : separator;
    return tokens.map((tk) => {
      if (tk.s) return `<span class="tier-status">${tk.s}</span>`;
      const hit = state.filters.some((attr) => Q.tokenMatches(tk, attr));
      return `<span class="tier-attr${hit ? " hit" : ""}">${tk.raw}</span>`;
    }).join(joiner);
  }

  function sortBadge(item) {
    if (state.filters.length === 0) return "";
    const token = Q.sortToken(item, state.sortAttr, state.valueSource);
    if (!token) return "—";
    if (token.raw) return token.raw;
    return token.t === "速" ? `${token.v}速` : `${token.v}%${token.t}`;
  }

  function tableHeaderHtml(tiers, hasFilter) {
    const mainHeader = state.showMain ? '<th class="equipment-main-cell">主属性</th>' : "";
    return `<tr><th class="equipment-category-cell">分类</th><th class="equipment-name-cell">装备名</th>${mainHeader}${tiers.map((tier) => `<th class="equipment-tier-cell">${tier}</th>`).join("")}${hasFilter ? '<th class="badge equipment-sort-cell">排序值</th>' : ""}<th class="equipment-compare-action-head">对比</th></tr>`;
  }

  function bookPopoverStageRowsHtml(stages) {
    return `<div class="book-popover-stage-list">${stages.map((stage) =>
      `<div class="book-popover-stage-row"><span class="book-popover-stage-label">${stage.stage}阶：</span><span class="book-popover-stage-values">${tokenHtml(stage.tokens, "、")}</span></div>`
    ).join("")}</div>`;
  }

  function positionBookDetailPopover(trigger) {
    const margin = 12;
    const gap = 10;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = el.bookDetailPopover.getBoundingClientRect();
    let placement = "top";
    let top = triggerRect.top - popoverRect.height - gap;
    if (top < margin) {
      placement = "bottom";
      top = triggerRect.bottom + gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - popoverRect.height - margin));
    let left = triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin));
    const arrowLeft = Math.max(18, Math.min(triggerRect.left + triggerRect.width / 2 - left, popoverRect.width - 18));
    el.bookDetailPopover.dataset.placement = placement;
    el.bookDetailPopover.style.top = `${Math.round(top)}px`;
    el.bookDetailPopover.style.left = `${Math.round(left)}px`;
    el.bookDetailPopover.style.setProperty("--book-arrow-left", `${Math.round(arrowLeft)}px`);
  }

  function closeBookDetailPopover() {
    if (!el.bookDetailPopover) return;
    if (activeBookDetail && activeBookDetail.trigger) {
      activeBookDetail.trigger.textContent = "进阶详情";
      activeBookDetail.trigger.setAttribute("aria-expanded", "false");
    }
    activeBookDetail = null;
    el.bookDetailPopover.hidden = true;
    el.bookDetailPopover.style.visibility = "";
    el.bookDetailPopover.style.top = "";
    el.bookDetailPopover.style.left = "";
    el.bookDetailPopover.style.removeProperty("--book-arrow-left");
  }

  function openBookDetailPopover(button) {
    const item = DATA.items.find((entry) => entry.id === button.dataset.bookId);
    const tier = button.dataset.tier;
    if (!item || !tier) return;
    const stages = Q.cumulativeBookStages(item, tier);
    if (!stages.length) return;
    closeBookDetailPopover();
    activeBookDetail = { itemId: item.id, tier: tier, trigger: button };
    button.textContent = "收起";
    button.setAttribute("aria-expanded", "true");
    el.bookDetailTitle.textContent = `${item.name} · ${tier}`;
    el.bookDetailBody.innerHTML = bookPopoverStageRowsHtml(stages);
    el.bookDetailPopover.style.visibility = "hidden";
    el.bookDetailPopover.hidden = false;
    positionBookDetailPopover(button);
    el.bookDetailPopover.style.visibility = "visible";
  }

  function toggleBookDetailPopover(button) {
    if (activeBookDetail && activeBookDetail.trigger === button) {
      closeBookDetailPopover();
      return;
    }
    openBookDetailPopover(button);
  }

  function bookTierSummaryHtml(item, tier) {
    const finalStage = Q.finalBookStage(item, tier);
    if (!finalStage) return '<span class="tier-none">—</span>';
    return `<div class="book-tier-summary"><span class="book-tier-summary-label">${finalStage.stage}阶累计</span><span class="book-stage-values">${tokenHtml(finalStage.tokens, "")}</span></div>`;
  }

  function bookTierDetailsHtml(item, tier) {
    const stages = item.stages && item.stages[tier];
    if (!Array.isArray(stages) || !stages.length) return "";
    return `<button type="button" class="book-detail-toggle" data-book-id="${escapeHtml(item.id)}" data-tier="${escapeHtml(tier)}" aria-controls="book-detail-popover" aria-expanded="false">进阶详情</button>`;
  }

  function bookTierHtml(item, tier) {
    return `<div class="book-tier-block">${bookTierSummaryHtml(item, tier)}${bookTierDetailsHtml(item, tier)}</div>`;
  }

  function bookDisplayTiers(item) {
    const tiers = item.bookGroup === "初始紫色典籍"
      ? ["紫色"].concat(Q.TIER_ORDER)
      : Q.TIER_ORDER.slice();
    return tiers.filter((tier) => Array.isArray(item.stages && item.stages[tier]) && item.stages[tier].length);
  }

  function bookCardTiersHtml(item) {
    const tiers = bookDisplayTiers(item);
    return tiers.map((tier) => `<div class="book-card-tier">
      <div class="book-card-tier-label">${tier}</div>
      ${bookTierHtml(item, tier)}
    </div>`).join("");
  }

  function equipmentNameHtml(item) {
    const purple = item.bookGroup === "初始紫色典籍";
    return `<span class="equipment-name-badge ${purple ? "equipment-name-purple" : "equipment-name-orange"}">${escapeHtml(item.name)}</span>`;
  }

  function equipmentTableHtml(items, tiers, title) {
    const hasFilter = state.filters.length > 0;
    if (!items.length) return "";
    const body = items.map((item) => {
      return `<tr>
      <td class="equipment-category-cell"><span class="cat">${item.cat}</span></td>
      <td class="name equipment-name-cell">${equipmentNameHtml(item)}</td>
      ${state.showMain ? `<td class="main equipment-main-cell">${escapeHtml(item.main)}</td>` : ""}
      ${tiers.map((tier) => `<td class="equipment-tier-cell${item.bookGroup ? " book-tier-cell" : ""}">${item.bookGroup ? bookTierHtml(item, tier) : tokenHtml(item.tiers[tier])}</td>`).join("")}
      ${hasFilter ? `<td class="badge equipment-sort-cell">${sortBadge(item)}</td>` : ""}
      <td class="equipment-compare-action">${equipmentCompareActionHtml(item)}</td>
    </tr>`;
    }).join("");
    const tableClasses = `equipment-result-table ${state.showMain ? "show-main" : "hide-main"}${title ? " book-equipment-table" : ""}`;
    return `<section class="equipment-result-group${title ? " book-result-group" : ""}">${title ? `<h3 class="equipment-group-title">${title}<span>${items.length} 件</span></h3>` : ""}<div class="table-wrap"><table class="${tableClasses}"><thead>${tableHeaderHtml(tiers, hasFilter)}</thead><tbody>${body}</tbody></table></div></section>`;
  }

  function renderTable(items) {
    if (state.category === null) {
      const nonBooks = items.filter((item) => !item.bookGroup);
      const orangeBooks = items.filter((item) => item.bookGroup === "初始橙色典籍");
      const purpleBooks = items.filter((item) => item.bookGroup === "初始紫色典籍");
      const divineBooks = items.filter((item) => item.bookGroup === "神兵典籍");
      el.tableWrap.innerHTML = equipmentTableHtml(nonBooks, Q.TIER_ORDER, "") +
        equipmentTableHtml(orangeBooks, Q.TIER_ORDER, "初始橙色典籍") +
        equipmentTableHtml(purpleBooks, ["紫色"].concat(Q.TIER_ORDER), "初始紫色典籍") +
        equipmentTableHtml(divineBooks, Q.TIER_ORDER, "神兵典籍");
      return;
    }
    if (state.category === "典籍") {
      const orangeBooks = items.filter((item) => item.bookGroup === "初始橙色典籍");
      const purpleBooks = items.filter((item) => item.bookGroup === "初始紫色典籍");
      el.tableWrap.innerHTML = equipmentTableHtml(orangeBooks, Q.TIER_ORDER, "初始橙色典籍") +
        equipmentTableHtml(purpleBooks, ["紫色"].concat(Q.TIER_ORDER), "初始紫色典籍");
      return;
    }
    if (state.category === "神兵典籍") {
      el.tableWrap.innerHTML = equipmentTableHtml(items, Q.TIER_ORDER, "神兵典籍");
      return;
    }
    el.tableWrap.innerHTML = equipmentTableHtml(items, Q.TIER_ORDER, "");
  }

  function renderCards(items) {
    const hasFilter = state.filters.length > 0;
    el.cards.innerHTML = items.map((item) => {
      const badge = hasFilter ? sortBadge(item) : "";
      const tierHtml = item.bookGroup
        ? bookCardTiersHtml(item)
        : Q.TIER_ORDER.map((tier) => `<div class="card-tier"><span class="tier-label">${tier}</span>${tokenHtml(item.tiers[tier])}</div>`).join("");
      return `<div class="card${item.bookGroup ? " book-card" : ""}">
        <div class="card-head">
          <span class="cat">${item.cat}</span>
          ${equipmentNameHtml(item)}
          ${badge ? `<span class="badge">${badge}</span>` : ""}
        </div>
        ${state.showMain ? `<div class="card-main">主属性：<b>${escapeHtml(item.main)}</b></div>` : ""}
        ${tierHtml}
        <div class="equipment-compare-card-action">${equipmentCompareActionHtml(item)}</div>
      </div>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
