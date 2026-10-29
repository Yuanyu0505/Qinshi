(function () {
  "use strict";

  var DATA = window.INSCRIPTION_DATA;
  var PERFORMANCE = window.INSCRIPTION_PERFORMANCE;
  var RULES = window.InscriptionRules;
  var TERMS = window.InscriptionTerms;
  var PROGRESS_RULES = window.InscriptionProgressRules;
  var ACCOUNT_STORAGE = window.QinshiAccounts;
  var STORE_KEY = "qinshi_inscription_progress_v2";
  var COMMON_STORE_KEY = "qinshi_inscription_common_v1";
  var commonKeys = new Set();
  var commonDefaultApplied = false;
  var formationNames = new Set();
  var TIANS = ["天府", "天相", "天同", "天梁", "天机"];
  var SHIELDS = ["天遁", "地遁", "人遁", "神遁", "鬼遁", "龙遁", "虎遁", "风遁", "云遁"];
  var MAIN = {
    "天府": { "1": "攻+44300、防+22150", "2": "攻+75300、防+37650" },
    "天相": { "1": "内力+44300、攻击+22150", "2": "内力+75300、攻击+37650" },
    "天同": { "1": "血+354400、内力+22150", "2": "血+602400、内力+37650" },
    "天梁": { "1": "防+44300、血+177200", "2": "防+75300、血+301200" },
    "天机": { "1": "护盾+354400、内力+22150", "2": "护盾+602400、内力+37650" }
  };
  var COMMON_SUBS = ["闪避", "招架", "治疗效果"];
  var SUBS = {};
  RULES.duns.forEach(function (dun) {
    SUBS[dun.id] = dun.attrs.concat(COMMON_SUBS).map(function (name) { return { n:name, x:dun.high.indexOf(name) !== -1, common:COMMON_SUBS.indexOf(name) !== -1 }; });
  });
  var SHIELD_NOTES = {
    "龙遁": "PVP速支持高/中/低档；中档来自合成，蓝二为" + TERMS.html({attr:"PVP速",tier:"?"},"b2"),
    "鬼遁": "速支持高/中/低档；中档来自合成，蓝二为" + TERMS.html({attr:"速",tier:"?"},"b2"),
    "神遁": "PVP速无高档，橙二最高为" + TERMS.html({attr:"PVP速",tier:"L"},"o2") + "／" + TERMS.html({attr:"PVP速",tier:"M"},"o2") + "；中档来自合成",
    "地遁": "PVP速无高档，橙二最高为" + TERMS.html({attr:"PVP速",tier:"L"},"o2") + "／" + TERMS.html({attr:"PVP速",tier:"M"},"o2") + "；中档来自合成",
    "人遁": "血、抗暴击支持三档；技能穿透最多两档",
    "虎遁": "血、内力支持三档；同一种不分档属性每枚只能一条"
  };

  var progress = loadProgress();
  var editingKey = "";
  var el = {};
  var renderCoordinator;

  function init() {
    var partition = document.getElementById("partition-inscription");
    if (!DATA || !PERFORMANCE || !PROGRESS_RULES || !partition) return;
    // Content patches already normalize this; also guard direct/older data loads.
    DATA.items.forEach(function (item) {
      (item.slots || []).forEach(function (slot) { slot.shield = normalizeDunName(slot.shield); });
    });
    formationNames = PROGRESS_RULES.formationNames(window.FORMATIONS_DATA);
    el.modes = document.getElementById("inscription-modes");
    el.progressSearch = document.getElementById("ins-progress-search");
    el.suggestions = document.getElementById("ins-progress-suggestions");
    el.editor = document.getElementById("ins-progress-editor");
    el.progressList = document.getElementById("ins-progress-list");
    el.quality = document.getElementById("ins-quality");
    el.tian = document.getElementById("ins-tian");
    el.shield = document.getElementById("ins-shield");
    el.discipleGroup = document.getElementById("ins-disciple-group");
    el.search = document.getElementById("ins-search");
    el.results = document.getElementById("ins-results");
    el.reference = document.getElementById("inscription-reference");
    el.commonStatus = document.getElementById("ins-common-status");
    el.quality.value = "红色神将";
    loadCommonDisciples();

    el.modes.addEventListener("click", switchMode);
    document.getElementById("partition-inscription").addEventListener("click", handleCommonAction);
    el.progressSearch.addEventListener("input", renderSuggestions);
    el.suggestions.addEventListener("click", selectSuggestion);
    el.editor.addEventListener("click", handleEditorClick);
    el.editor.addEventListener("change", handleEditorChange);
    el.progressList.addEventListener("click", handleProgressAction);
    renderCoordinator = PERFORMANCE.createRenderCoordinator({
      renderers: {
        progress: renderProgressList,
        query: renderQuery,
        reference: renderReference,
        "crafting-paths": function () { window.InscriptionCraftingUI.activate("crafting-paths"); },
        "crafting-favorites": function () { window.InscriptionCraftingUI.activate("crafting-favorites"); },
        "crafting-simulator": function () { window.InscriptionCraftingUI.activate("crafting-simulator"); }
      },
      schedule: function (callback, delay) { return window.setTimeout(callback, delay); },
      cancel: function (id) { window.clearTimeout(id); },
      queryDelay: 120
    });
    [el.quality, el.tian, el.shield, el.discipleGroup].filter(Boolean).forEach(function (control) {
      control.addEventListener("change", function () { renderCoordinator.invalidate("query"); });
    });
    el.search.addEventListener("input", function () { renderCoordinator.scheduleQuery(); });

    function activatePartition(event) {
      if (event && (!event.detail || event.detail.name !== "inscription")) {
        renderCoordinator.cancelPendingQuery();
        return;
      }
      var activeButton = el.modes.querySelector("button.active[data-mode]");
      renderCoordinator.activate(activeButton ? activeButton.dataset.mode : "progress");
    }
    document.addEventListener("qinshi:partitionchange", activatePartition);
    if (!partition.hidden) activatePartition();
  }

  function keyOf(item) { return item.quality + "\u0000" + item.name; }
  function encodedKey(item) { return encodeURIComponent(keyOf(item)); }
  function itemByKey(key) { return DATA.items.find(function (item) { return keyOf(item) === key; }); }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function loadProgress() {
    try {
      var parsed = JSON.parse(ACCOUNT_STORAGE.getItem(STORE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      // Keep raw history intact. Normalize only at display/validation boundaries.
      return parsed;
    } catch (error) { return {}; }
  }
  function normalizeDunName(value) {
    return PROGRESS_RULES.normalizeDun(value);
  }
  function normalizeAttrName(shield, value) {
    shield = normalizeDunName(shield);
    value = PROGRESS_RULES.normalizeAttr(value);
    var attrs = SUBS[shield] || [];
    var normalized = RULES.normalizeAttr(value);
    var withoutThree = normalized.replace(/^3/, "");
    withoutThree = RULES.normalizeAttr(withoutThree);
    return attrs.some(function (attr) { return attr.n === withoutThree; }) ? withoutThree : normalized;
  }
  function saveProgress(key, record) {
    // Only the explicitly edited disciple changes. Historical aliases/text in other
    // records stay byte-equivalent JSON values, not this display-normalized copy.
    var latest = JSON.parse(ACCOUNT_STORAGE.getItem(STORE_KEY) || "{}");
    if (!latest || typeof latest !== "object" || Array.isArray(latest)) throw new Error("Invalid inscription progress data");
    if (record === undefined) delete latest[key]; else latest[key] = record;
    if (ACCOUNT_STORAGE.setItem(STORE_KEY, JSON.stringify(latest)) === false) throw new Error("Inscription progress was not saved");
    progress = loadProgress();
  }

  function commonStatus(message) {
    if (!el.commonStatus) return;
    el.commonStatus.textContent = message;
    el.commonStatus.hidden = !message;
  }
  function saveCommonDisciples(keys) {
    try {
      if (ACCOUNT_STORAGE.setItem(COMMON_STORE_KEY, JSON.stringify({ version: 1, keys: Array.from(keys), gaoyueDefaultApplied: commonDefaultApplied })) === false) throw new Error('Common disciples were not saved');
      commonStatus("");
      return true;
    } catch (error) {
      commonStatus("常用弟子保存失败，请检查浏览器存储权限或可用空间；本次更改未保存。");
      return false;
    }
  }
  function loadCommonDisciples() {
    try {
      var raw = ACCOUNT_STORAGE.getItem(COMMON_STORE_KEY);
      if (raw === null) {
        commonKeys = new Set();
        commonDefaultApplied = true;
        var gaoyue = DATA.items.find(function(item){return item.name === '神千泷高月' && item.quality === '红色神将';});
        if (gaoyue) commonKeys.add(keyOf(gaoyue));
        if (!saveCommonDisciples(commonKeys)) { commonKeys = new Set(); commonDefaultApplied = false; }
        return;
      }
      var stored = JSON.parse(raw);
      if (!stored || stored.version !== 1 || !Array.isArray(stored.keys)) throw new Error("Invalid common disciples");
      if (!stored.keys.every(function(key){return typeof key === 'string' && itemByKey(key);}) ||
          (Object.prototype.hasOwnProperty.call(stored,'gaoyueDefaultApplied') && typeof stored.gaoyueDefaultApplied !== 'boolean')) throw new Error('Invalid common disciples migration data');
      // 已保存的空名单同样有效，不再补回初始名单。
      commonKeys = new Set(stored.keys.filter(function (key) { return typeof key === "string" && itemByKey(key); }));
      commonDefaultApplied = stored.gaoyueDefaultApplied === true;
      if (!commonDefaultApplied) {
        var updated = new Set(commonKeys);
        var gaoyue = DATA.items.find(function(item){return item.name === '神千泷高月' && item.quality === '红色神将';});
        if (gaoyue) updated.add(keyOf(gaoyue));
        commonDefaultApplied = true;
        if (saveCommonDisciples(updated)) commonKeys = updated;
        else commonDefaultApplied = false;
      }
    } catch (error) {
      commonKeys = new Set();
      commonStatus("常用弟子读取失败，已保留原始记录；铭文个人进度不受影响。");
    }
  }
  function commonButtonHtml(item) {
    var common = commonKeys.has(keyOf(item));
    return '<button type="button" class="ins-common-toggle' + (common ? ' is-common' : '') +
      '" data-ins-common-key="' + encodedKey(item) + '" aria-pressed="' + common +
      '" aria-label="' + escapeHtml((common ? "取消常用：" : "设为常用：") + item.name) +
      '" title="' + (common ? "点击取消常用" : "设为常用") + '">' + (common ? "常用 · 取消" : "设为常用") + '</button>';
  }
  function handleCommonAction(event) {
    var button = event.target.closest("button[data-ins-common-key]");
    if (!button) return;
    var key = decodeURIComponent(button.dataset.insCommonKey);
    var item = itemByKey(key);
    if (!item) return;
    var next = new Set(commonKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (!saveCommonDisciples(next)) return;
    commonKeys = next;
    var common = commonKeys.has(key);
    document.querySelectorAll("#partition-inscription [data-ins-common-key]").forEach(function (control) {
      if (control.dataset.insCommonKey !== button.dataset.insCommonKey) return;
      control.classList.toggle("is-common", common);
      control.setAttribute("aria-pressed", String(common));
      control.setAttribute("aria-label", (common ? "取消常用：" : "设为常用：") + item.name);
      control.title = common ? "点击取消常用" : "设为常用";
      control.textContent = common ? "常用 · 取消" : "设为常用";
    });
    if (el.discipleGroup && (el.discipleGroup.value === "common" || el.discipleGroup.value === "other")) {
      renderCoordinator.invalidate("query");
      return;
    }
    // 只移动现有卡片，不重建铭文内容，也不清除正在输入的筛选条件。
    var cards = Array.from(el.results.querySelectorAll(".ins-query-card[data-ins-query-key]"));
    cards.sort(function (a, b) {
      return compareQueryItems(itemByKey(decodeURIComponent(a.dataset.insQueryKey)), itemByKey(decodeURIComponent(b.dataset.insQueryKey)));
    });
    var keepFocus = document.activeElement === button;
    cards.forEach(function (card, index) {
      if (el.results.children[index] !== card) el.results.insertBefore(card, el.results.children[index] || null);
    });
    if (keepFocus) button.focus({ preventScroll: true });
  }

  function switchMode(event) {
    var button = event.target.closest("button[data-mode]");
    if (!button) return;
    var rendered = renderCoordinator.activate(button.dataset.mode);
    if (!rendered && button.dataset.mode.indexOf("crafting-") === 0) window.InscriptionCraftingUI.activate(button.dataset.mode);
    el.modes.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); });
    ["progress", "query", "reference", "crafting-paths", "crafting-favorites", "crafting-simulator"].forEach(function (mode) {
      var panel = document.getElementById("inscription-" + mode);
      if (panel) panel.hidden = mode !== button.dataset.mode;
    });
  }

  function renderSuggestions() {
    var query = el.progressSearch.value.trim().toLowerCase();
    if (!query) { el.suggestions.innerHTML = ""; el.suggestions.hidden = true; return; }
    var matches = DATA.items.filter(function (item) { return item.name.toLowerCase().indexOf(query) !== -1; }).slice(0, 20);
    el.suggestions.innerHTML = matches.length ? matches.map(function (item) {
      return '<button type="button" class="ins-suggestion" data-key="' + encodedKey(item) + '"><span>' + escapeHtml(item.name) + '</span><small>' + item.quality + ' · ' + item.slots.length + '个天位</small></button>';
    }).join("") : '<div class="muted-tip">没有匹配弟子</div>';
    el.suggestions.hidden = false;
  }
  function selectSuggestion(event) {
    var button = event.target.closest("button[data-key]");
    if (!button) return;
    editingKey = decodeURIComponent(button.dataset.key);
    el.progressSearch.value = "";
    el.suggestions.innerHTML = "";
    el.suggestions.hidden = true;
    renderEditor(itemByKey(editingKey));
  }

  function renderEditor(item) {
    if (!item) { el.editor.innerHTML = ""; return; }
    var saved = progress[keyOf(item)];
    var rows = item.slots.map(function (slot) {
      var old = saved && Array.isArray(saved.slots) && saved.slots.find(function (entry) { return entry && entry.tian === slot.tian; });
      return { slot: slot, old: old || null, entries: old ? PROGRESS_RULES.entries(old) : [] };
    });
    el.editor.innerHTML = '<section class="ins-editor"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b>' + escapeHtml(item.name) + '</b></div><button type="button" class="link-btn" data-action="cancel">取消</button></div><div class="muted-tip ins-editor-tip">蓝色1条、紫色2条、橙色3条；直接选择完整词条，同属性同档不能重复，每枚最多2条高档。紫色以上中档来自合成，不能与仅洗练可得的档位混用。蓝一仅供记录；蓝色同值档位不猜测。全空位置存为草稿。未调整的历史异常原样保留，调整该位置后须选择合法组合。</div>' + rows.map(function (record) {
      var slot = record.slot, old = record.old, quality = old ? qualityId(old) : "o2";
      var selectedQuality = quality || "__legacy_quality__";
      var qualityOptions = (!quality ? '<option selected value="__legacy_quality__">' + escapeHtml(String(old.quality) + String(old.star || "") + '（历史未知品质）') + '</option>' : '') + PROGRESS_RULES.qualities.map(function (entry) {
        return '<option value="' + entry.id + '"' + (entry.id === selectedQuality ? ' selected' : '') + '>' + entry.label + '</option>';
      }).join("");
      var controls = [];
      for (var index = 0; index < Math.max(3, record.entries.length); index++) controls.push(subEditorHtml(slot.shield, quality, record.entries[index], index));
      return '<div class="ins-editor-slot" data-tian="' + escapeHtml(slot.tian) + '" data-shield="' + escapeHtml(slot.shield) + '" data-quality="' + selectedQuality + '"><div class="ins-slot-title">' + escapeHtml(slot.tian + ' · ' + slot.shield) + extremeNoteHtml(slot.shield) + '</div><div class="ins-editor-layout"><div class="ins-core-controls"><label><span>品质星级</span><select class="ins-edit-quality">' + qualityOptions + '</select></label><div class="ins-main-preview"></div></div><div class="ins-editor-controls">' + controls.join("") + '</div></div></div>';
    }).join("") + '<div class="ins-editor-actions"><button type="button" class="seg active" data-action="save">保存</button></div></section>';
    el.editor.querySelectorAll(".ins-editor-slot").forEach(function (row, index) {
      row._insOriginalSlot = rows[index].old;
      row._insLegacyEntries = rows[index].entries;
      row._insInitialValue = JSON.stringify(editorSlot(row));
    });
    refreshEditorMain();
  }
  function subOptionsHtml(shield, quality, selected, legacy) {
    return '<option value="">请选择词条</option>' + (selected === "__legacy__" ? '<option selected value="__legacy__">' + escapeHtml((legacy.attr || "") + (legacy.raw || "") + (legacy.tier ? "（历史档位：" + legacy.tier + "）" : "") + '（历史异常，待修正）') + '</option>' : '') + PROGRESS_RULES.termsFor(shield, quality).map(function (term) {
      var key = PROGRESS_RULES.identity(term);
      return '<option value="' + escapeHtml(key) + '"' + (key === selected ? " selected" : "") + '>' + escapeHtml(PROGRESS_RULES.plain(term, quality, shield)) + '</option>';
    }).join("");
  }
  function subEditorHtml(shield, quality, entry, index) {
    entry = entry || { attr: "", raw: "", tier: "" };
    var result = PROGRESS_RULES.resolve(normalizeAttrName(shield, entry.attr), entry.raw, entry.tier, shield, quality);
    var selected = result.term ? PROGRESS_RULES.identity(result.term) : entry.attr || entry.raw || entry.tier ? "__legacy__" : "";
    return '<label><span>副属性' + (index + 1) + '</span><select class="ins-edit-sub" data-index="' + index + '">' + subOptionsHtml(shield, quality, selected, entry) + '</select></label>';
  }
  function subDisplayHtml(slot, index) {
    var entry = PROGRESS_RULES.entries(slot)[index];
    if (!entry || !(entry.attr || entry.raw || entry.tier)) return "";
    var q = qualityId(slot), result = PROGRESS_RULES.resolve(normalizeAttrName(slot.shield, entry.attr), entry.raw, entry.tier, slot.shield, q);
    var description = result.term && PROGRESS_RULES.describe(result.term, q, slot.shield);
    return description ? '<span class="ins-term">' + TERMS.valueHtml(description.body, q) + '<span class="ins-term-tier">' + escapeHtml(description.suffix) + '</span></span>' : escapeHtml(entry.attr + entry.raw + (entry.tier ? '（历史档位：' + entry.tier + '）' : ''));
  }
  function subDisplayOrder(slot) {
    var parts = PROGRESS_RULES.entries(slot), validation = validateSlot(slot), quality = qualityId(slot);
    var entries = parts.map(function (part, index) { return { attr: part.attr, index: index }; });
    // Invalid history and drafts retain their original text, indexes and gaps.
    if (!validation.valid || validation.draft) return entries;
    return TERMS.sortEntries(entries.filter(function (entry) {
      var part = parts[entry.index];
      return part.attr || part.raw || part.tier;
    }).map(function (entry) {
      var part = parts[entry.index], term = PROGRESS_RULES.resolve(normalizeAttrName(slot.shield, part.attr), part.raw, part.tier, slot.shield, quality).term;
      return { attr: term.attr, index: entry.index, value: PROGRESS_RULES.value(term, quality, slot.shield) };
    }));
  }
  function qualityId(slot) { return PROGRESS_RULES.qualityId(slot); }
  function validateSlot(slot) {
    return PROGRESS_RULES.validateSlot(slot);
  }
  function slotWarningHtml(slot) {
    var result=validateSlot(slot);
    return result.valid && !result.draft ? "" : '<div class="craft-legacy-warning">' + (result.draft ? "草稿：" : "历史记录警告：") + escapeHtml(result.errors.join("；")) + '</div>';
  }
  function editorSlot(row) {
    var quality = row.querySelector(".ins-edit-quality").value;
    var fields = PROGRESS_RULES.qualityFields(quality) || row._insOriginalSlot || {};
    var slot = { tian: row.dataset.tian, shield: row.dataset.shield, quality: fields.quality, star: fields.star, subs: [], subValues: [], subTiers: [] };
    var pool = PROGRESS_RULES.termsFor(row.dataset.shield, quality);
    row.querySelectorAll(".ins-edit-sub").forEach(function (select, index) {
      var term = pool.find(function (candidate) { return PROGRESS_RULES.identity(candidate) === select.value; });
      var legacy = (row._insLegacyEntries || [])[index] || {};
      var meta = term && RULES.attributes.find(function (attr) { return attr.id === term.attr; });
      slot.subs.push(term ? term.attr : select.value === "__legacy__" ? legacy.attr || "" : "");
      slot.subValues.push(term ? "+" + PROGRESS_RULES.value(term, quality, row.dataset.shield) + meta.unit : select.value === "__legacy__" ? legacy.raw || "" : "");
      slot.subTiers.push(term ? term.tier : select.value === "__legacy__" ? legacy.tier || "" : "");
    });
    return slot;
  }
  function handleEditorChange(event) {
    var row = event.target.closest(".ins-editor-slot");
    if (!row) return;
    if (event.target.matches(".ins-edit-quality")) {
      var previous = row.dataset.quality, next = event.target.value;
      if (previous === next) return;
      var filled = Array.from(row.querySelectorAll(".ins-edit-sub")).some(function (select) { return Boolean(select.value); });
      if (filled && !window.confirm("切换品质星级将清空此位置的全部副属性（含历史内容），是否继续？取消会保持原品质和词条。")) {
        event.target.value = previous;
        return;
      }
      row.dataset.quality = next;
      row._insLegacyEntries = [];
      row.querySelector(".ins-editor-controls").innerHTML = [0, 1, 2].map(function (index) { return subEditorHtml(row.dataset.shield, next, null, index); }).join("");
    }
    refreshEditorMain();
  }
  function refreshEditorMain() {
    el.editor.querySelectorAll(".ins-editor-slot").forEach(function (row) {
      var quality = row.querySelector(".ins-edit-quality").value, info = PROGRESS_RULES.qualityInfo(quality);
      var main = /^o[12]$/.test(quality) && MAIN[row.dataset.tian] && MAIN[row.dataset.tian][quality.charAt(1)];
      row.querySelector(".ins-main-preview").innerHTML = main ? '主属性：' + mainStackHtml(main, quality) : "主属性：暂无此品质的已知数值";
      var selects = Array.from(row.querySelectorAll(".ins-edit-sub")), pool = PROGRESS_RULES.termsFor(row.dataset.shield, quality);
      var selected = selects.map(function (select) { return pool.find(function (term) { return PROGRESS_RULES.identity(term) === select.value; }) || null; });
      var count = info ? info.count : 3;
      row.querySelector(".ins-editor-controls").dataset.count = String(count);
      selects.forEach(function (select, currentIndex) {
        select.closest("label").hidden = currentIndex >= count && !select.value;
        Array.from(select.options).forEach(function (option) {
          if (!option.value || option.value === "__legacy__" || option.value === select.value) { option.disabled = false; return; }
          var candidate = pool.find(function (term) { return PROGRESS_RULES.identity(term) === option.value; });
          var others = selected.filter(function (term, index) { return term && index !== currentIndex && index < count; });
          option.disabled = currentIndex >= count || !candidate || !PROGRESS_RULES.canComplete(row.dataset.tian, row.dataset.shield, quality, others.concat([candidate]));
        });
      });
      var warning=row.querySelector(".craft-legacy-warning");if(warning)warning.remove();row.insertAdjacentHTML("beforeend",slotWarningHtml(editorSlot(row)));
    });
  }
  function handleEditorClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "cancel") { editingKey = ""; el.editor.innerHTML = ""; return; }
    var item = itemByKey(editingKey);
    if (!item) return;
    var original = progress[editingKey];
    if (original && !Array.isArray(original.slots)) { commonStatus("铭文未保存：历史记录结构异常，已保留原始内容，请先备份并修正该记录。"); return; }
    var rows = Array.from(el.editor.querySelectorAll(".ins-editor-slot"));
    var edited = rows.map(function (row) { return { row: row, slot: editorSlot(row) }; });
    var invalid = edited.filter(function (entry) {
      return (!entry.row._insOriginalSlot || JSON.stringify(entry.slot) !== entry.row._insInitialValue) && !validateSlot(entry.slot).valid;
    });
    if(invalid.length){refreshEditorMain();commonStatus("铭文未保存：请调整无效历史记录或非法数值/条数。");return;}
    var replacements = new Map();
    edited.forEach(function (entry) {
      var unchanged = entry.row._insOriginalSlot && JSON.stringify(entry.slot) === entry.row._insInitialValue;
      replacements.set(entry.slot.tian, unchanged ? entry.row._insOriginalSlot : Object.assign({}, entry.row._insOriginalSlot || {}, entry.slot));
    });
    // Preserve unknown/duplicate historical positions; only the visible first
    // occurrence for each current position is replaced by an explicit edit.
    var slots = original ? original.slots.map(function (slot) {
      if (!slot || !replacements.has(slot.tian)) return slot;
      var replacement = replacements.get(slot.tian);
      replacements.delete(slot.tian);
      return replacement;
    }) : [];
    replacements.forEach(function (slot) { slots.push(slot); });
    try { saveProgress(editingKey, Object.assign({}, original || {}, {name:item.name,quality:item.quality,slots:slots})); }
    catch(error){commonStatus("铭文保存失败："+error.message);return;}
    commonStatus("");
    editingKey = "";
    el.editor.innerHTML = "";
    renderCoordinator.invalidate("progress");
    renderCoordinator.markDirty("query");
  }

  function renderProgressList() {
    var entries = Object.keys(progress).map(function (key) { return { key: key, saved: progress[key], item: itemByKey(key) }; }).filter(function (entry) { return entry.item; });
    el.progressList.innerHTML = entries.length ? entries.map(function (entry) {
      var savedSlots = entry.saved && Array.isArray(entry.saved.slots) ? entry.saved.slots.map(savedSlotHtml).join("") : '<div class="craft-legacy-warning">历史记录结构异常，原始内容已保留；请先备份再修正。</div>';
      return '<article class="ins-progress-card"><div class="ins-card-head"><div><span class="ins-quality ' + (entry.item.quality === "红色神将" ? "red" : "orange") + '">' + entry.item.quality + '</span><b>' + escapeHtml(entry.item.name) + '</b>' + commonButtonHtml(entry.item) + '</div><div class="ins-progress-actions"><button type="button" class="seg" data-edit-key="' + encodeURIComponent(entry.key) + '">编辑</button><button type="button" class="seg danger" data-delete-key="' + encodeURIComponent(entry.key) + '">删除</button></div></div><div class="ins-saved-slots">' + savedSlots + '</div></article>';
    }).join("") : '<div class="empty ins-empty"><p>尚未保存弟子铭文</p></div>';
  }
  function savedSlotHtml(slot) {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return '<div class="craft-legacy-warning">历史位置结构异常，原始内容已保留。</div>';
    var quality = qualityId(slot), fields = PROGRESS_RULES.qualityFields(quality), info = PROGRESS_RULES.qualityInfo(quality);
    var main = /^o[12]$/.test(quality) && MAIN[slot.tian] && MAIN[slot.tian][quality.charAt(1)] || "暂无此品质的已知主属性";
    var parts = PROGRESS_RULES.entries(slot), order = subDisplayOrder(slot), displays = [];
    var count = Math.max(info ? info.count : 3, parts.reduce(function (last, entry, index) { return entry.attr || entry.raw || entry.tier ? index + 1 : last; }, 0));
    for (var index = 0; index < count; index++) {
      var sourceIndex = order[index] ? order[index].index : index;
      var part = parts[sourceIndex] || {}, display = subDisplayHtml(slot, sourceIndex);
      displays.push('<span class="ins-saved-sub' + (isExtremeAttr(slot.shield, part.attr) ? " extreme" : "") + '"><small>副属性' + (index + 1) + '</small><span>' + (display || "未设置") + '</span></span>');
    }
    return '<div class="ins-saved-slot"><div class="ins-saved-core"><b>' + escapeHtml(slot.tian + ' · ' + normalizeDunName(slot.shield)) + extremeNoteHtml(slot.shield) + '</b>' + starBadgeHtml(fields ? fields.quality : slot.quality, fields ? fields.star : slot.star) + mainStackHtml(main, quality) + '</div><div class="ins-saved-substats" data-count="' + count + '">' + displays.join("") + '</div>' + slotWarningHtml(slot) + '</div>';
  }
  function starBadgeHtml(quality, star) {
    var color = { "蓝色": "blue", "紫色": "purple", "橙色": "orange" }[quality];
    if (!color || !/^[12]$/.test(String(star))) return '<span class="ins-rank-unknown">未知品质星级</span>';
    var count = Number(star);
    var stars = Array(count + 1).join('<span class="ins-rank-star" aria-hidden="true">★</span>');
    return '<span class="ins-rank-stars ' + color + '" aria-label="' + quality + count + '星" title="' + quality + count + '星">' + stars + '</span>';
  }
  function mainStackHtml(main, quality) { return TERMS.mainHtml(main,quality); }
  function handleProgressAction(event) {
    var button = event.target.closest("button[data-edit-key],button[data-delete-key]");
    if (!button) return;
    if (button.dataset.deleteKey) {
      var deleteKey = decodeURIComponent(button.dataset.deleteKey);
      var item = itemByKey(deleteKey);
      if (!item || !window.confirm("确定删除“" + item.name + "”的铭文个人进度吗？")) return;
      try { saveProgress(deleteKey); } catch(error) { commonStatus("铭文删除未保存："+error.message);return; }
      if (editingKey === deleteKey) { editingKey = ""; el.editor.innerHTML = ""; }
      renderCoordinator.invalidate("progress");
      renderCoordinator.markDirty("query");
      return;
    }
    editingKey = decodeURIComponent(button.dataset.editKey);
    renderEditor(itemByKey(editingKey));
    el.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderQuery() {
    var query = el.search.value.trim().toLowerCase();
    var items = DATA.items.filter(function (item) {
      if (el.quality.value && item.quality !== el.quality.value) return false;
      var group = el.discipleGroup && el.discipleGroup.value, isFormation = formationNames.has(item.name), isCommon = commonKeys.has(keyOf(item));
      if (group === "formation" && !isFormation || group === "common" && !isCommon || group === "other" && (isFormation || isCommon)) return false;
      if (query && item.name.toLowerCase().indexOf(query) === -1) return false;
      return item.slots.some(slotMatchesFilter);
    });
    items.sort(compareQueryItems);
    el.results.innerHTML = items.length ? items.map(queryCardHtml).join("") : '<div class="empty"><p>未找到匹配弟子</p></div>';
  }
  function compareQueryItems(a, b) {
    var aGroup = progress[keyOf(a)] ? 0 : commonKeys.has(keyOf(a)) ? 1 : 2;
    var bGroup = progress[keyOf(b)] ? 0 : commonKeys.has(keyOf(b)) ? 1 : 2;
    if (aGroup !== bGroup) return aGroup - bGroup;
    var qualityDifference = Number(b.quality === "红色神将") - Number(a.quality === "红色神将");
    if (qualityDifference) return qualityDifference;
    return a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
  }
  function slotMatchesFilter(slot) {
    return (!el.tian.value || slot.tian === el.tian.value) && (!el.shield.value || normalizeDunName(slot.shield) === normalizeDunName(el.shield.value));
  }
  function queryCardHtml(item) {
    var savedProgress = progress[keyOf(item)];
    var saved = Boolean(savedProgress);
    var visibleSlots = item.slots.filter(slotMatchesFilter);
    return '<article class="ins-query-card' + (saved ? " saved" : "") + '" data-ins-query-key="' + encodedKey(item) + '"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b class="' + (saved ? "ins-saved-name" : "") + '">' + escapeHtml(item.name) + '</b>' + commonButtonHtml(item) + (saved ? '<span class="ins-saved-mark">个人进度已保存</span>' : "") + '</div></div><div class="ins-query-slots">' + visibleSlots.map(function (slot) {
      var savedSlot = savedProgress && Array.isArray(savedProgress.slots) && savedProgress.slots.find(function (entry) { return entry && entry.tian === slot.tian && normalizeDunName(entry.shield) === normalizeDunName(slot.shield); });
      return '<div class="ins-query-slot"><div class="ins-slot-title">' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</div>' + queryMainHtml(slot, savedSlot) + '<div class="ins-query-substats"><div class="ins-sub-list"><span class="ins-sub-label">支持副属性（含合成档）</span>' + SUBS[slot.shield].map(subTagHtml).join("") + '</div>' + currentSubstatsHtml(savedSlot) + '</div></div>';
    }).join("") + '</div></article>';
  }
  function queryMainHtml(slot, savedSlot) {
    var quality = savedSlot ? qualityId(savedSlot) : "o2", fields = PROGRESS_RULES.qualityFields(quality);
    var main = /^o[12]$/.test(quality) && MAIN[slot.tian] && MAIN[slot.tian][quality.charAt(1)] || "暂无此品质的已知主属性";
    return '<div class="ins-main-line"><span class="ins-main-rank">' + starBadgeHtml(fields ? fields.quality : "", fields ? fields.star : "") + '<small>主属性</small></span>' + mainStackHtml(main, quality) + '</div>';
  }
  function currentSubstatsHtml(savedSlot) {
    if (!savedSlot) return "";
    var current = subDisplayOrder(savedSlot).map(function (entry) { return subDisplayHtml(savedSlot,entry.index); }).filter(Boolean);
    var values = current.length ? current.map(function (value) { return '<span class="ins-current-sub-tag">' + value + '</span>'; }).join("") : '<span class="ins-current-sub-tag empty">未设置</span>';
    return '<div class="ins-current-substats"><span class="ins-current-sub-label">当前副属性</span>' + values + '</div>' + slotWarningHtml(savedSlot);
  }
  function subTagHtml(attr) { return '<span class="ins-sub-tag' + (attr.x ? " extreme" : "") + '">' + attr.n + (attr.x ? '<em>可三条</em>' : "") + '</span>'; }
  function isExtremeAttr(shield, name) { return (SUBS[normalizeDunName(shield)] || []).some(function (attr) { return attr.x && attr.n === normalizeAttrName(shield, name); }); }
  function extremeNoteHtml(shield) {
    var names = (SUBS[normalizeDunName(shield)] || []).filter(function (attr) { return attr.x; }).map(function (attr) { return attr.n; });
    return names.length ? '<span class="ins-extreme-note">（极致：' + names.join("、") + '）</span>' : "";
  }

  function renderReference() {
    el.reference.innerHTML = '<section class="ins-reference-block"><h3>天位主属性</h3><p class="mobile-scroll-hint" aria-hidden="true">左右滑动查看全部星级 →</p><div class="table-wrap mobile-scroll-region" tabindex="0" aria-label="天位主属性资料表，可左右滑动"><table class="ins-reference-table"><thead><tr><th>天位</th><th>' + starBadgeHtml("橙色", "1") + '</th><th>' + starBadgeHtml("橙色", "2") + '</th><th>紫色</th></tr></thead><tbody>' + TIANS.map(function (tian) { return '<tr><th>' + tian + '</th><td>' + mainStackHtml(MAIN[tian]["1"],"o1") + '</td><td>' + mainStackHtml(MAIN[tian]["2"],"o2") + '</td><td>暂不展示主属性</td></tr>'; }).join("") + '</tbody></table></div></section><section class="ins-reference-block"><h3>遁位副属性</h3><p class="mobile-scroll-hint" aria-hidden="true">左右滑动查看全部说明 →</p><div class="table-wrap mobile-scroll-region" tabindex="0" aria-label="遁位副属性资料表，可左右滑动"><table class="ins-reference-table"><thead><tr><th>遁位</th><th>支持副属性（含合成档）</th><th>备注</th></tr></thead><tbody>' + SHIELDS.map(function (shield) { return '<tr><th>' + shield + extremeNoteHtml(shield) + '</th><td><div class="ins-sub-list">' + SUBS[shield].map(subTagHtml).join("") + '</div></td><td class="ins-shield-note">' + (SHIELD_NOTES[shield] || "—") + '</td></tr>'; }).join("") + '</tbody></table></div><div class="muted-tip">“极致”表示该属性支持高/中/低三档，橙色可分别各选一条，并非可以洗出三条相同档位。紫色最多两条，紫色以上中档来自合成；同一种不分档属性仅一条。具体品质数值与来源见合成路径查询。</div></section>';
  }

  document.addEventListener("DOMContentLoaded", init);
})();
