(function () {
  "use strict";

  var DATA = window.INSCRIPTION_DATA;
  var PERFORMANCE = window.INSCRIPTION_PERFORMANCE;
  var RULES = window.InscriptionRules;
  var ACCOUNT_STORAGE = window.QinshiAccounts;
  var STORE_KEY = "qinshi_inscription_progress_v2";
  var COMMON_STORE_KEY = "qinshi_inscription_common_v1";
  var commonKeys = new Set();
  var commonDefaultApplied = false;
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
    "龙遁": "PVP速支持高/中/低档；中档来自合成，蓝二速度1的档位不可辨识",
    "鬼遁": "速支持高/中/低档；中档来自合成，蓝二速度1的档位不可辨识",
    "神遁": "PVP速无高档，橙二最高低档3/中档4；中档来自合成",
    "地遁": "PVP速无高档，橙二最高低档3/中档4；中档来自合成",
    "人遁": "血、抗暴击支持三档；技能穿透最多两档",
    "虎遁": "血、内力支持三档；同一种不分档属性每枚只能一条"
  };

  var progress = loadProgress();
  var editingKey = "";
  var el = {};
  var renderCoordinator;

  function init() {
    var partition = document.getElementById("partition-inscription");
    if (!DATA || !PERFORMANCE || !partition) return;
    el.modes = document.getElementById("inscription-modes");
    el.progressSearch = document.getElementById("ins-progress-search");
    el.suggestions = document.getElementById("ins-progress-suggestions");
    el.editor = document.getElementById("ins-progress-editor");
    el.progressList = document.getElementById("ins-progress-list");
    el.quality = document.getElementById("ins-quality");
    el.tian = document.getElementById("ins-tian");
    el.shield = document.getElementById("ins-shield");
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
    el.editor.addEventListener("change", refreshEditorMain);
    el.progressList.addEventListener("click", handleProgressAction);
    renderCoordinator = PERFORMANCE.createRenderCoordinator({
      renderers: {
        progress: renderProgressList,
        query: renderQuery,
        reference: renderReference,
        "crafting-paths": function () { window.InscriptionCraftingUI.activate("crafting-paths"); },
        "crafting-simulator": function () { window.InscriptionCraftingUI.activate("crafting-simulator"); }
      },
      schedule: function (callback, delay) { return window.setTimeout(callback, delay); },
      cancel: function (id) { window.clearTimeout(id); },
      queryDelay: 120
    });
    [el.quality, el.tian, el.shield].forEach(function (control) {
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
      if (!parsed || typeof parsed !== "object") return {};
      Object.keys(parsed).forEach(function (key) {
        var saved = parsed[key];
        if (!saved || !Array.isArray(saved.slots)) { delete parsed[key]; return; }
        saved.slots.forEach(function (slot) {
          slot.shield = normalizeDunName(slot.shield);
          var values = Array.isArray(slot.subs) ? slot.subs.slice(0, 3) : [slot.sub || ""];
          while (values.length < 3) values.push("");
          slot.subs = values.map(function (value) { return normalizeAttrName(slot.shield, value); });
          var subValues = Array.isArray(slot.subValues) ? slot.subValues.slice(0, 3) : [];
          while (subValues.length < 3) subValues.push("");
          slot.subValues = subValues.map(function (value) { return String(value == null ? "" : value).trim(); });
          delete slot.sub;
        });
      });
      return parsed;
    } catch (error) { return {}; }
  }
  function normalizeDunName(value) {
    return RULES.normalizeDun(String(value || ""));
  }
  function normalizeAttrName(shield, value) {
    shield = normalizeDunName(shield);
    value = String(value || "");
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
    ["progress", "query", "reference", "crafting-paths", "crafting-simulator"].forEach(function (mode) {
      document.getElementById("inscription-" + mode).hidden = mode !== button.dataset.mode;
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
    el.editor.innerHTML = '<section class="ins-editor"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b>' + escapeHtml(item.name) + '</b></div><button type="button" class="link-btn" data-action="cancel">取消</button></div><div class="muted-tip ins-editor-tip">紫色每枚2条、橙色每枚3条；同一种不分档属性只允许1条，同属性同档不能重复，每枚最多2条高档。填写规则内精确数值（如+6%）；紫色以上中档来自合成。全空位置仅存为草稿。历史异常仅提示，调整后才保存。</div>' + item.slots.map(function (slot) {
      var old = saved && saved.slots && saved.slots.find(function (x) { return x.tian === slot.tian; });
      var quality = old ? old.quality : "橙色";
      var star = old ? old.star : "2";
      var subs = old && Array.isArray(old.subs) ? old.subs : ["", "", ""];
      var subValues = old && Array.isArray(old.subValues) ? old.subValues : ["", "", ""];
      return '<div class="ins-editor-slot" data-tian="' + slot.tian + '" data-shield="' + slot.shield + '"><div class="ins-slot-title">' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</div><div class="ins-editor-layout"><div class="ins-core-controls"><label>品质<select class="ins-edit-quality"><option' + (quality === "橙色" ? " selected" : "") + '>橙色</option><option' + (quality === "紫色" ? " selected" : "") + '>紫色</option></select></label><label>星级<select class="ins-edit-star"><option value="2"' + (star === "2" ? " selected" : "") + '>2星</option><option value="1"' + (star === "1" ? " selected" : "") + '>1星</option></select></label><div class="ins-main-preview"></div></div><div class="ins-editor-controls">' + [0, 1, 2].map(function (index) { return subEditorHtml(slot.shield, subs[index], subValues[index], index); }).join("") + '</div></div></div>';
    }).join("") + '<div class="ins-editor-actions"><button type="button" class="seg active" data-action="save">保存</button></div></section>';
    refreshEditorMain();
  }
  function subOptionsHtml(shield, selected) {
    return '<option value="">请选择</option>' + (selected && !SUBS[shield].some(function (a) { return a.n === selected; }) ? '<option selected value="' + escapeHtml(selected) + '">' + escapeHtml(selected) + '（历史不支持属性）</option>' : '') + SUBS[shield].map(function (attr) {
      return '<option value="' + escapeHtml(attr.n) + '"' + (attr.n === selected ? " selected" : "") + '>' + attr.n + (attr.x ? "（极致可三条）" : "") + '</option>';
    }).join("");
  }
  function subEditorHtml(shield, selected, value, index) {
    return '<label><span>副属性' + (index + 1) + '</span><span class="ins-sub-editor-fields"><select class="ins-edit-sub">' + subOptionsHtml(shield, selected) + '</select><input class="ins-edit-sub-value" type="text" value="' + escapeHtml(value || "") + '" placeholder="如：+6%" aria-label="副属性' + (index + 1) + '附加内容"></span></label>';
  }
  function subDisplayText(base, value) {
    return base ? base + String(value || "").trim() : "";
  }
  function qualityId(slot) { return (slot.quality === "紫色" ? "p" : "o") + (String(slot.star) === "1" ? "1" : "2"); }
  function validateSlot(slot) {
    var quality = qualityId(slot), required = RULES.qualities.find(function (q) { return q.id === quality; }).count;
    var subs = slot.subs || [], values = slot.subValues || [], errors = [];
    var nonempty = subs.filter(Boolean).length;
    if (!nonempty && !values.some(Boolean)) return { valid:true, draft:true, errors:["未填写草稿，不作为有效材料"] };
    if (nonempty !== required || subs.slice(required).some(Boolean) || values.slice(required).some(Boolean)) errors.push("此品质需恰好" + required + "条副属性，历史条数无效时请明确调整");
    var candidates = subs.slice(0, required).map(function (attr, i) {
      var raw = String(values[i] || "").trim();
      if (!attr || !/^\+?\d+(?:\.\d+)?%?$/.test(raw)) { errors.push("副属性" + (i+1) + "缺失或非标准数值：" + (raw || "未填写")); return []; }
      var amount = Number(raw.replace(/[+%]/g,""));
      var info=RULES.attributes.find(function(a){return a.id===RULES.normalizeAttr(attr);});
      if(raw.endsWith('%')&&info&&info.unit!=='%'){errors.push("副属性"+(i+1)+"不是百分比属性，不能填写百分号");return [];}
      var choices = RULES.termsFor(slot.shield, quality).filter(function (term) { return term.attr === RULES.normalizeAttr(attr) && RULES.value(term,quality) === amount; });
      if (!choices.length) errors.push("副属性" + (i+1) + "不支持此属性/数值：" + attr + raw);
      return choices;
    });
    if (errors.length) return { valid:false,errors:errors };
    var combinations = [[]];candidates.forEach(function (choices) { var next=[];combinations.forEach(function (terms) { choices.forEach(function (term) { next.push(terms.concat([term])); }); });combinations=next; });
    var valid = combinations.some(function (terms) { return ["wash","crafted"].some(function (origin) { return RULES.validate({prefix:slot.tian,dun:slot.shield,quality:quality,origin:origin,terms:terms}).valid; }); });
    return {valid:valid,errors:valid?[]:["词条组合无合法洗练/合成来源（同档或不分档重复、高档上限或来源不符）"]};
  }
  function slotWarningHtml(slot) {
    var result=validateSlot(slot);
    return result.valid && !result.draft ? "" : '<div class="craft-legacy-warning">' + (result.draft ? "草稿：" : "历史记录警告：") + escapeHtml(result.errors.join("；")) + '</div>';
  }
  function editorSlot(row) {
    var subs=Array.from(row.querySelectorAll(".ins-edit-sub")).map(function (select) { return select.value; });
    return {tian:row.dataset.tian,shield:row.dataset.shield,quality:row.querySelector(".ins-edit-quality").value,star:row.querySelector(".ins-edit-star").value,subs:subs,subValues:Array.from(row.querySelectorAll(".ins-edit-sub-value")).map(function (input,index) {return subs[index] ? input.value.trim() : "";})};
  }
  function refreshEditorMain() {
    // Do not silently erase invalid choices; show the reason until corrected.
    el.editor.querySelectorAll(".ins-editor-slot").forEach(function (row) {
      var quality = row.querySelector(".ins-edit-quality").value;
      var star = row.querySelector(".ins-edit-star").value;
      row.querySelector(".ins-main-preview").textContent = quality === "紫色" ? "主属性：暂不展示" : "主属性：" + MAIN[row.dataset.tian][star];
      var selects = Array.prototype.slice.call(row.querySelectorAll(".ins-edit-sub"));
      var selected = selects.map(function (select) { return select.value; });
      var count = quality === "紫色" ? 2 : 3;
      selects.forEach(function (select, currentIndex) {
        var label=select.closest("label"), input=label.querySelector(".ins-edit-sub-value");
        label.hidden=currentIndex>=count&&!select.value&&!input.value;
        Array.prototype.forEach.call(select.options, function (option) {
          if (!option.value) { option.disabled = false; return; }
          var attr = SUBS[row.dataset.shield].find(function (item) { return item.n === option.value; });
          var otherCount = selected.filter(function (value, index) { return index !== currentIndex && value === option.value; }).length;
          option.disabled = Boolean(attr && select.value !== option.value && otherCount >= (attr.common ? 1 : attr.x ? count : 2));
        });
        var listId="ins-values-"+row.dataset.tian+"-"+currentIndex, list=label.querySelector("datalist");
        if(!list){list=document.createElement("datalist");label.appendChild(list);}list.id=listId;input.setAttribute("list",listId);
        var qualityKey=(quality === "紫色" ? "p" : "o")+star;
        list.innerHTML=RULES.termsFor(row.dataset.shield,qualityKey).filter(function (t) {return t.attr===select.value;}).map(function(t){var meta=RULES.attributes.find(function(a){return a.id===t.attr;});return '<option value="+'+RULES.value(t,qualityKey)+meta.unit+'">'+({H:'高档',M:'中档',L:'低档',U:'不分档'}[t.tier])+'</option>';}).join("");
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
    var slots=Array.from(el.editor.querySelectorAll(".ins-editor-slot")).map(editorSlot);
    var invalid=slots.filter(function(slot){return !validateSlot(slot).valid;});
    if(invalid.length){refreshEditorMain();commonStatus("铭文未保存：请调整无效历史记录或非法数值/条数。");return;}
    try { saveProgress(editingKey,{name:item.name,quality:item.quality,slots:slots}); }
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
      return '<article class="ins-progress-card"><div class="ins-card-head"><div><span class="ins-quality ' + (entry.item.quality === "红色神将" ? "red" : "orange") + '">' + entry.item.quality + '</span><b>' + escapeHtml(entry.item.name) + '</b>' + commonButtonHtml(entry.item) + '</div><div class="ins-progress-actions"><button type="button" class="seg" data-edit-key="' + encodeURIComponent(entry.key) + '">编辑</button><button type="button" class="seg danger" data-delete-key="' + encodeURIComponent(entry.key) + '">删除</button></div></div><div class="ins-saved-slots">' + entry.saved.slots.map(savedSlotHtml).join("") + '</div></article>';
    }).join("") : '<div class="empty ins-empty"><p>尚未保存弟子铭文</p></div>';
  }
  function savedSlotHtml(slot) {
    var main = slot.quality === "紫色" ? "主属性暂不展示" : (MAIN[slot.tian] && MAIN[slot.tian][slot.star] || "未知主属性");
    var subs = Array.isArray(slot.subs) ? slot.subs : ["", "", ""];
    var subValues = Array.isArray(slot.subValues) ? slot.subValues : ["", "", ""];
    return '<div class="ins-saved-slot"><div class="ins-saved-core"><b>' + escapeHtml(slot.tian + ' · ' + slot.shield) + extremeNoteHtml(slot.shield) + '</b>' + starBadgeHtml(slot.quality, slot.star) + mainStackHtml(main) + '</div><div class="ins-saved-substats">' + subs.map(function (sub, index) { var display = subDisplayText(sub, subValues[index]); return '<span class="ins-saved-sub' + (isExtremeAttr(slot.shield, sub) ? " extreme" : "") + '"><small>副属性' + (index + 1) + '</small><strong>' + (display ? escapeHtml(display) : "未设置") + '</strong></span>'; }).join("") + '</div>' + slotWarningHtml(slot) + '</div>';
  }
  function starBadgeHtml(quality, star) {
    var normalizedQuality = quality === "紫色" ? "紫色" : "橙色";
    var count = String(star) === "1" ? 1 : 2;
    var stars = Array(count + 1).join('<span class="ins-rank-star" aria-hidden="true">★</span>');
    return '<span class="ins-rank-stars ' + (normalizedQuality === "紫色" ? "purple" : "orange") + '" aria-label="' + normalizedQuality + count + '星" title="' + normalizedQuality + count + '星">' + stars + '</span>';
  }
  function mainStackHtml(main) { return '<span class="ins-main-stack">' + main.split("、").map(function (part) { return '<span>' + escapeHtml(part.trim()) + '</span>'; }).join("") + '</span>'; }
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
    return (!el.tian.value || slot.tian === el.tian.value) && (!el.shield.value || slot.shield === el.shield.value);
  }
  function queryCardHtml(item) {
    var savedProgress = progress[keyOf(item)];
    var saved = Boolean(savedProgress);
    var visibleSlots = item.slots.filter(slotMatchesFilter);
    return '<article class="ins-query-card' + (saved ? " saved" : "") + '" data-ins-query-key="' + encodedKey(item) + '"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b class="' + (saved ? "ins-saved-name" : "") + '">' + escapeHtml(item.name) + '</b>' + commonButtonHtml(item) + (saved ? '<span class="ins-saved-mark">个人进度已保存</span>' : "") + '</div></div><div class="ins-query-slots">' + visibleSlots.map(function (slot) {
      var savedSlot = savedProgress && savedProgress.slots.find(function (entry) { return entry.tian === slot.tian && entry.shield === slot.shield; });
      return '<div class="ins-query-slot"><div class="ins-slot-title">' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</div>' + queryMainHtml(slot, savedSlot) + '<div class="ins-query-substats"><div class="ins-sub-list"><span class="ins-sub-label">支持副属性（含合成档）</span>' + SUBS[slot.shield].map(subTagHtml).join("") + '</div>' + currentSubstatsHtml(savedSlot) + '</div></div>';
    }).join("") + '</div></article>';
  }
  function queryMainHtml(slot, savedSlot) {
    var quality = savedSlot && savedSlot.quality === "紫色" ? "紫色" : "橙色";
    var star = savedSlot && String(savedSlot.star) === "1" ? "1" : "2";
    var main = quality === "紫色" ? "主属性暂不展示" : MAIN[slot.tian][star];
    return '<div class="ins-main-line"><span class="ins-main-rank">' + starBadgeHtml(quality, star) + '<small>主属性</small></span>' + mainStackHtml(main) + '</div>';
  }
  function currentSubstatsHtml(savedSlot) {
    if (!savedSlot) return "";
    var subs = Array.isArray(savedSlot.subs) ? savedSlot.subs : ["", "", ""];
    var subValues = Array.isArray(savedSlot.subValues) ? savedSlot.subValues : ["", "", ""];
    var current = subs.map(function (sub, index) { return subDisplayText(sub, subValues[index]); }).filter(Boolean);
    var values = current.length ? current.map(function (value) { return '<span class="ins-current-sub-tag">' + escapeHtml(value) + '</span>'; }).join("") : '<span class="ins-current-sub-tag empty">未设置</span>';
    return '<div class="ins-current-substats"><span class="ins-current-sub-label">当前副属性</span>' + values + '</div>' + slotWarningHtml(savedSlot);
  }
  function subTagHtml(attr) { return '<span class="ins-sub-tag' + (attr.x ? " extreme" : "") + '">' + attr.n + (attr.x ? '<em>可三条</em>' : "") + '</span>'; }
  function isExtremeAttr(shield, name) { return (SUBS[shield] || []).some(function (attr) { return attr.x && attr.n === name; }); }
  function extremeNoteHtml(shield) {
    var names = (SUBS[shield] || []).filter(function (attr) { return attr.x; }).map(function (attr) { return attr.n; });
    return names.length ? '<span class="ins-extreme-note">（极致：' + names.join("、") + '）</span>' : "";
  }

  function renderReference() {
    el.reference.innerHTML = '<section class="ins-reference-block"><h3>天位主属性</h3><p class="mobile-scroll-hint" aria-hidden="true">左右滑动查看全部星级 →</p><div class="table-wrap mobile-scroll-region" tabindex="0" aria-label="天位主属性资料表，可左右滑动"><table class="ins-reference-table"><thead><tr><th>天位</th><th>' + starBadgeHtml("橙色", "1") + '</th><th>' + starBadgeHtml("橙色", "2") + '</th><th>紫色</th></tr></thead><tbody>' + TIANS.map(function (tian) { return '<tr><th>' + tian + '</th><td>' + MAIN[tian]["1"] + '</td><td>' + MAIN[tian]["2"] + '</td><td>暂不展示主属性</td></tr>'; }).join("") + '</tbody></table></div></section><section class="ins-reference-block"><h3>遁位副属性</h3><p class="mobile-scroll-hint" aria-hidden="true">左右滑动查看全部说明 →</p><div class="table-wrap mobile-scroll-region" tabindex="0" aria-label="遁位副属性资料表，可左右滑动"><table class="ins-reference-table"><thead><tr><th>遁位</th><th>支持副属性（含合成档）</th><th>备注</th></tr></thead><tbody>' + SHIELDS.map(function (shield) { return '<tr><th>' + shield + extremeNoteHtml(shield) + '</th><td><div class="ins-sub-list">' + SUBS[shield].map(subTagHtml).join("") + '</div></td><td class="ins-shield-note">' + (SHIELD_NOTES[shield] || "—") + '</td></tr>'; }).join("") + '</tbody></table></div><div class="muted-tip">“极致”表示该属性支持高/中/低三档，橙色可分别各选一条，并非可以洗出三条相同档位。紫色最多两条，紫色以上中档来自合成；同一种不分档属性仅一条。具体品质数值与来源见合成路径查询。</div></section>';
  }

  document.addEventListener("DOMContentLoaded", init);
})();
