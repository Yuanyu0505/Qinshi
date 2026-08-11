(function () {
  "use strict";

  var DATA = window.INSCRIPTION_DATA;
  var STORE_KEY = "qinshi_inscription_progress_v2";
  var TIANS = ["天府", "天相", "天同", "天梁", "天机"];
  var SHIELDS = ["天盾", "地盾", "人盾", "神盾", "鬼盾", "龙盾", "虎盾", "风盾", "云盾"];
  var MAIN = {
    "天府": { "1": "攻+44300、防+22150", "2": "攻+75300、防+37650" },
    "天相": { "1": "内力+44300、攻击+22150", "2": "内力+75300、攻击+37650" },
    "天同": { "1": "血+354400、内力+22150", "2": "血+602400、内力+37650" },
    "天梁": { "1": "防+44300、血+177200", "2": "防+75300、血+301200" },
    "天机": { "1": "护盾+354400、内力+22150", "2": "护盾+602400、内力+37650" }
  };
  var COMMON_SUBS = ["闪避", "招架", "治疗效果"];
  var SUBS = {
    "天盾": [{ n: "攻", x: true }, { n: "暴击伤害" }, { n: "技能减免" }, { n: "内力" }, { n: "追加伤害" }],
    "地盾": [{ n: "PVP速" }, { n: "暴击" }, { n: "PVP免伤" }, { n: "技能穿透", x: true }, { n: "防御" }],
    "人盾": [{ n: "血", x: true }, { n: "抗暴击" }, { n: "PVP伤害" }, { n: "技能穿透" }, { n: "防御" }],
    "神盾": [{ n: "PVP速" }, { n: "攻", x: true }, { n: "PVP伤害", x: true }, { n: "技能穿透" }, { n: "内力" }],
    "鬼盾": [{ n: "速", x: true }, { n: "血" }, { n: "护盾" }, { n: "暴击伤害" }, { n: "防御" }],
    "龙盾": [{ n: "PVP速", x: true }, { n: "血" }, { n: "暴击", x: true }, { n: "PVP伤害" }, { n: "技能减免" }],
    "虎盾": [{ n: "血", x: true }, { n: "暴击伤害" }, { n: "抗暴击" }, { n: "内力", x: true }, { n: "追加伤害" }],
    "风盾": [{ n: "攻" }, { n: "暴击" }, { n: "护盾" }, { n: "PVP免伤", x: true }, { n: "追加伤害" }],
    "云盾": [{ n: "护盾", x: true }, { n: "抗暴击", x: true }, { n: "PVP免伤" }, { n: "技能减免", x: true }, { n: "防御" }]
  };
  SHIELDS.forEach(function (shield) {
    COMMON_SUBS.forEach(function (name) {
      if (!SUBS[shield].some(function (attr) { return attr.n === name; })) {
        SUBS[shield].push({ n: name });
      }
    });
  });
  var SHIELD_NOTES = {
    "龙盾": "可洗3/4/5速度；可洗血属性，最多双血",
    "鬼盾": "可洗3/4/5速度；可洗血属性，最多双血",
    "神盾": "二星橙色铭文最多3+4速",
    "地盾": "二星橙色铭文最多3+4速",
    "人盾": "可洗血属性；可三血",
    "虎盾": "可洗血属性；可三血"
  };

  var progress = loadProgress();
  var editingKey = "";
  var el = {};

  function init() {
    if (!DATA || !document.getElementById("partition-inscription")) return;
    el.modes = document.getElementById("inscription-modes");
    el.count = document.getElementById("inscription-count");
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

    el.modes.addEventListener("click", switchMode);
    el.progressSearch.addEventListener("input", renderSuggestions);
    el.suggestions.addEventListener("click", selectSuggestion);
    el.editor.addEventListener("click", handleEditorClick);
    el.editor.addEventListener("change", refreshEditorMain);
    el.progressList.addEventListener("click", handleProgressAction);
    [el.quality, el.tian, el.shield, el.search].forEach(function (control) {
      control.addEventListener("input", renderQuery);
      control.addEventListener("change", renderQuery);
    });

    renderProgressList();
    renderQuery();
    renderReference();
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
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object") return {};
      Object.keys(parsed).forEach(function (key) {
        var saved = parsed[key];
        if (!saved || !Array.isArray(saved.slots)) { delete parsed[key]; return; }
        saved.slots.forEach(function (slot) {
          var values = Array.isArray(slot.subs) ? slot.subs.slice(0, 3) : [slot.sub || ""];
          while (values.length < 3) values.push("");
          slot.subs = values.map(function (value) { return normalizeAttrName(slot.shield, value); });
          delete slot.sub;
        });
      });
      return parsed;
    } catch (error) { return {}; }
  }
  function normalizeAttrName(shield, value) {
    value = String(value || "");
    var attrs = SUBS[shield] || [];
    var withoutThree = value.replace(/^3/, "");
    return attrs.some(function (attr) { return attr.x && attr.n === withoutThree; }) ? withoutThree : value;
  }
  function saveProgress() { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); }

  function switchMode(event) {
    var button = event.target.closest("button[data-mode]");
    if (!button) return;
    el.modes.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); });
    ["progress", "query", "reference"].forEach(function (mode) {
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
    el.editor.innerHTML = '<section class="ins-editor"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b>' + escapeHtml(item.name) + '</b></div><button type="button" class="link-btn" data-action="cancel">取消</button></div><div class="muted-tip ins-editor-tip">每个位置分别选择三条副属性；普通属性最多选择两条相同，标记为“极致”的属性允许三条相同。</div>' + item.slots.map(function (slot) {
      var old = saved && saved.slots && saved.slots.find(function (x) { return x.tian === slot.tian; });
      var quality = old ? old.quality : "橙色";
      var star = old ? old.star : "2";
      var subs = old && Array.isArray(old.subs) ? old.subs : ["", "", ""];
      return '<div class="ins-editor-slot" data-tian="' + slot.tian + '" data-shield="' + slot.shield + '"><div class="ins-slot-title">' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</div><div class="ins-editor-layout"><div class="ins-core-controls"><label>品质<select class="ins-edit-quality"><option' + (quality === "橙色" ? " selected" : "") + '>橙色</option><option' + (quality === "紫色" ? " selected" : "") + '>紫色</option></select></label><label>星级<select class="ins-edit-star"><option value="2"' + (star === "2" ? " selected" : "") + '>2星</option><option value="1"' + (star === "1" ? " selected" : "") + '>1星</option></select></label><div class="ins-main-preview"></div></div><div class="ins-editor-controls">' + [0, 1, 2].map(function (index) { return '<label>副属性' + (index + 1) + '<select class="ins-edit-sub">' + subOptionsHtml(slot.shield, subs[index]) + '</select></label>'; }).join("") + '</div></div></div>';
    }).join("") + '<div class="ins-editor-actions"><button type="button" class="seg active" data-action="save">保存</button></div></section>';
    refreshEditorMain();
  }
  function subOptionsHtml(shield, selected) {
    return '<option value="">请选择</option>' + SUBS[shield].map(function (attr) {
      return '<option value="' + escapeHtml(attr.n) + '"' + (attr.n === selected ? " selected" : "") + '>' + attr.n + (attr.x ? "（极致可三条）" : "") + '</option>';
    }).join("");
  }
  function refreshEditorMain(event) {
    if (event && event.target.classList.contains("ins-edit-sub") && event.target.value) {
      var changedRow = event.target.closest(".ins-editor-slot");
      var changedAttr = SUBS[changedRow.dataset.shield].find(function (item) { return item.n === event.target.value; });
      var selectedCount = Array.prototype.filter.call(changedRow.querySelectorAll(".ins-edit-sub"), function (select) { return select.value === event.target.value; }).length;
      if (changedAttr && !changedAttr.x && selectedCount > 2) event.target.value = "";
    }
    el.editor.querySelectorAll(".ins-editor-slot").forEach(function (row) {
      var quality = row.querySelector(".ins-edit-quality").value;
      var star = row.querySelector(".ins-edit-star").value;
      row.querySelector(".ins-main-preview").textContent = quality === "紫色" ? "主属性：暂不展示" : "主属性：" + MAIN[row.dataset.tian][star];
      var selects = Array.prototype.slice.call(row.querySelectorAll(".ins-edit-sub"));
      var selected = selects.map(function (select) { return select.value; });
      selects.forEach(function (select, currentIndex) {
        Array.prototype.forEach.call(select.options, function (option) {
          if (!option.value) { option.disabled = false; return; }
          var attr = SUBS[row.dataset.shield].find(function (item) { return item.n === option.value; });
          var otherCount = selected.filter(function (value, index) { return index !== currentIndex && value === option.value; }).length;
          option.disabled = Boolean(attr && !attr.x && select.value !== option.value && otherCount >= 2);
        });
      });
    });
  }
  function handleEditorClick(event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "cancel") { editingKey = ""; el.editor.innerHTML = ""; return; }
    var item = itemByKey(editingKey);
    if (!item) return;
    progress[editingKey] = { name: item.name, quality: item.quality, slots: Array.prototype.map.call(el.editor.querySelectorAll(".ins-editor-slot"), function (row) {
      return { tian: row.dataset.tian, shield: row.dataset.shield, quality: row.querySelector(".ins-edit-quality").value, star: row.querySelector(".ins-edit-star").value, subs: Array.prototype.map.call(row.querySelectorAll(".ins-edit-sub"), function (select) { return select.value; }) };
    }) };
    saveProgress();
    editingKey = "";
    el.editor.innerHTML = "";
    renderProgressList();
    renderQuery();
  }

  function renderProgressList() {
    var entries = Object.keys(progress).map(function (key) { return { key: key, saved: progress[key], item: itemByKey(key) }; }).filter(function (entry) { return entry.item; });
    el.count.textContent = entries.length ? "已保存 " + entries.length + " 名弟子" : "";
    el.progressList.innerHTML = entries.length ? entries.map(function (entry) {
      return '<article class="ins-progress-card"><div class="ins-card-head"><div><span class="ins-quality ' + (entry.item.quality === "红色神将" ? "red" : "orange") + '">' + entry.item.quality + '</span><b>' + escapeHtml(entry.item.name) + '</b></div><div class="ins-progress-actions"><button type="button" class="seg" data-edit-key="' + encodeURIComponent(entry.key) + '">编辑</button><button type="button" class="seg danger" data-delete-key="' + encodeURIComponent(entry.key) + '">删除</button></div></div><div class="ins-saved-slots">' + entry.saved.slots.map(savedSlotHtml).join("") + '</div></article>';
    }).join("") : '<div class="empty ins-empty"><p>尚未保存弟子铭文</p></div>';
  }
  function savedSlotHtml(slot) {
    var main = slot.quality === "紫色" ? "主属性暂不展示" : MAIN[slot.tian][slot.star];
    var subs = Array.isArray(slot.subs) ? slot.subs : ["", "", ""];
    return '<div class="ins-saved-slot"><div class="ins-saved-core"><b>' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</b><span>' + slot.quality + ' ' + slot.star + '星</span>' + mainStackHtml(main) + '</div><div class="ins-saved-substats">' + subs.map(function (sub, index) { return '<span class="ins-saved-sub' + (isExtremeAttr(slot.shield, sub) ? " extreme" : "") + '"><small>副属性' + (index + 1) + '</small><strong>' + (sub ? escapeHtml(sub) : "未设置") + '</strong></span>'; }).join("") + '</div></div>';
  }
  function mainStackHtml(main) { return '<span class="ins-main-stack">' + main.split("、").map(function (part) { return '<span>' + escapeHtml(part.trim()) + '</span>'; }).join("") + '</span>'; }
  function handleProgressAction(event) {
    var button = event.target.closest("button[data-edit-key],button[data-delete-key]");
    if (!button) return;
    if (button.dataset.deleteKey) {
      var deleteKey = decodeURIComponent(button.dataset.deleteKey);
      var item = itemByKey(deleteKey);
      if (!item || !window.confirm("确定删除“" + item.name + "”的铭文个人进度吗？")) return;
      delete progress[deleteKey];
      saveProgress();
      if (editingKey === deleteKey) { editingKey = ""; el.editor.innerHTML = ""; }
      renderProgressList();
      renderQuery();
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
    var savedDifference = Number(Boolean(progress[keyOf(b)])) - Number(Boolean(progress[keyOf(a)]));
    if (savedDifference) return savedDifference;
    var qualityDifference = Number(b.quality === "红色神将") - Number(a.quality === "红色神将");
    if (qualityDifference) return qualityDifference;
    return a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
  }
  function slotMatchesFilter(slot) {
    return (!el.tian.value || slot.tian === el.tian.value) && (!el.shield.value || slot.shield === el.shield.value);
  }
  function queryCardHtml(item) {
    var saved = Boolean(progress[keyOf(item)]);
    var visibleSlots = item.slots.filter(slotMatchesFilter);
    return '<article class="ins-query-card' + (saved ? " saved" : "") + '"><div class="ins-card-head"><div><span class="ins-quality ' + (item.quality === "红色神将" ? "red" : "orange") + '">' + item.quality + '</span><b class="' + (saved ? "ins-saved-name" : "") + '">' + escapeHtml(item.name) + '</b>' + (saved ? '<span class="ins-saved-mark">个人进度已保存</span>' : "") + '</div></div><div class="ins-query-slots">' + visibleSlots.map(function (slot) {
      return '<div class="ins-query-slot"><div class="ins-slot-title">' + slot.tian + ' · ' + slot.shield + extremeNoteHtml(slot.shield) + '</div><div class="ins-main-line"><span>橙色二星主属性</span>' + MAIN[slot.tian]["2"] + '</div><div class="ins-sub-list"><span class="ins-sub-label">可洗练副属性</span>' + SUBS[slot.shield].map(subTagHtml).join("") + '</div></div>';
    }).join("") + '</div></article>';
  }
  function subTagHtml(attr) { return '<span class="ins-sub-tag' + (attr.x ? " extreme" : "") + '">' + attr.n + (attr.x ? '<em>可三条</em>' : "") + '</span>'; }
  function isExtremeAttr(shield, name) { return SUBS[shield].some(function (attr) { return attr.x && attr.n === name; }); }
  function extremeNoteHtml(shield) {
    var names = SUBS[shield].filter(function (attr) { return attr.x; }).map(function (attr) { return attr.n; });
    return names.length ? '<span class="ins-extreme-note">（极致：' + names.join("、") + '）</span>' : "";
  }

  function renderReference() {
    el.reference.innerHTML = '<section class="ins-reference-block"><h3>天位主属性</h3><div class="table-wrap"><table class="ins-reference-table"><thead><tr><th>天位</th><th>橙色一星</th><th>橙色二星</th><th>紫色</th></tr></thead><tbody>' + TIANS.map(function (tian) { return '<tr><th>' + tian + '</th><td>' + MAIN[tian]["1"] + '</td><td>' + MAIN[tian]["2"] + '</td><td>暂不展示主属性</td></tr>'; }).join("") + '</tbody></table></div></section><section class="ins-reference-block"><h3>盾位副属性</h3><div class="table-wrap"><table class="ins-reference-table"><thead><tr><th>盾位</th><th>可洗练副属性</th><th>备注</th></tr></thead><tbody>' + SHIELDS.map(function (shield) { return '<tr><th>' + shield + extremeNoteHtml(shield) + '</th><td><div class="ins-sub-list">' + SUBS[shield].map(subTagHtml).join("") + '</div></td><td class="ins-shield-note">' + (SHIELD_NOTES[shield] || "—") + '</td></tr>'; }).join("") + '</tbody></table></div><div class="muted-tip">“极致”表示该基础属性可同时出现在副属性1、副属性2、副属性3中，不是名为“3攻”或“3技能穿透”的单条属性。</div></section>';
  }

  document.addEventListener("DOMContentLoaded", init);
})();
