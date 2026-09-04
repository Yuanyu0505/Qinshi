(function () {
  "use strict";

  var DATA = window.BATTLE_BOX_PILL_POUCH_DATA;
  var CORE = window.BATTLE_BOX_PILL_POUCH_CORE;
  var ATLAS_DATA = window.ATLAS_DATA;
  var EQUIPMENT_DATA = window.SPECIAL_EQUIPMENT_DATA;
  var STORE_KEY = "qinshi_battle_box_pill_pouch_v1";
  var state = {
    mode: "progress",
    account: null,
    disciples: [],
    editingId: null,
    editDraft: null,
    search: "",
    calcOrder: [],
    calcById: {},
    calcResult: null,
    referenceKind: "battle",
    referenceView: "nearby",
    referenceDiscipleId: ""
  };
  var el = {};

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("zh-CN");
  }

  function normalizedSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s·•・]/g, "");
  }

  function uniqueId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function emptyDisciple(source) {
    return CORE.normalizeDisciple({
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      atlasId: source.atlasId || null,
      battle: { currentLevel: 0, targetLevel: 0, slots: [] },
      pouch: { currentLevel: 0, targetLevel: 0, slots: [] }
    }, DATA);
  }

  function showError(message, error) {
    if (!el.error) return;
    el.error.textContent = message;
    el.error.hidden = false;
    if (error && window.console) console.error(error);
  }

  function clearError() {
    if (el.error) el.error.hidden = true;
  }

  function loadState() {
    var raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch (error) {
      showError("战匣丹囊个人进度读取失败，已使用空白数据。", error);
    }
    state.account = CORE.normalizeAccount(raw.account, DATA);
    state.disciples = (Array.isArray(raw.disciples) ? raw.disciples : [])
      .map(function (disciple) { return CORE.normalizeDisciple(disciple, DATA); })
      .filter(function (disciple) { return disciple.id && disciple.name; });
    var seen = {};
    state.disciples = state.disciples.filter(function (disciple) {
      var key = disciple.sourceType === "atlas" ? "atlas:" + disciple.atlasId : "name:" + disciple.name;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
    state.calcOrder = state.disciples.map(function (disciple) { return disciple.id; });
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        version: 1,
        account: state.account,
        disciples: state.disciples
      }));
      clearError();
      return true;
    } catch (error) {
      showError("战匣丹囊个人进度保存失败，请检查浏览器存储空间。", error);
      return false;
    }
  }

  function discipleById(id) {
    return state.disciples.find(function (disciple) { return disciple.id === id; });
  }

  function qualityOptions(names, selected, allowEmpty) {
    var html = allowEmpty ? '<option value="">空槽</option>' : "";
    Object.keys(names).forEach(function (key) {
      html += '<option value="' + key + '"' + (selected === key ? " selected" : "") + ">" +
        escapeHtml(names[key]) + "</option>";
    });
    return html;
  }

  function accountPanel() {
    return '<section class="panel battle-pouch-account-panel"><div class="panel-title">账号共用设置</div>' +
      '<div class="battle-pouch-account-grid">' +
      numberField("玩家等级", "playerLevel", state.account.playerLevel, 0) +
      numberField("沧海珠库存", "pearls", state.account.inventory.pearls, 0) +
      numberField("玄龟甲库存", "shells", state.account.inventory.shells, 0) +
      '</div><p class="muted-tip">玩家46级解锁战匣与丹囊；库存由所有弟子共用。</p></section>';
  }

  function numberField(label, field, value, minimum, scope) {
    var attr = scope ? ' data-' + scope + '-field="' + field + '"' : ' data-account-field="' + field + '"';
    return '<label class="battle-pouch-field"><span>' + escapeHtml(label) + '</span><input type="number" min="' +
      minimum + '" step="1" inputmode="numeric" value="' + value + '"' + attr + '></label>';
  }

  function capLabel(snapshot) {
    if (!snapshot.unlocked) return '<span class="battle-pouch-status is-locked">未解锁</span>';
    return '<span class="battle-pouch-status"' + (snapshot.overCap ? ' title="当前等级超过实际上限，不能继续升级"' : '') +
      '><span class="battle-pouch-level-row"><span>当前等级</span><span><b class="battle-pouch-level-current">' + snapshot.currentLevel +
      '</b>级</span></span><span class="battle-pouch-level-row"><span>实际上限</span><span><b class="battle-pouch-level-effective">' +
      snapshot.effectiveCap + '</b>级</span></span><span class="battle-pouch-level-row"><span>玩家上限</span><span><b class="battle-pouch-level-player">' +
      snapshot.playerCap + '</b>级</span></span></span>';
  }

  function equipmentCatalog(definition) {
    return (EQUIPMENT_DATA && Array.isArray(EQUIPMENT_DATA.items) ? EQUIPMENT_DATA.items : [])
      .filter(function (item) { return definition.categories.indexOf(item.cat) !== -1; });
  }

  function equipmentSlotEditor(definition, slot) {
    var listId = "battle-pouch-equipment-" + definition.id;
    return '<article class="battle-pouch-equipment-slot"><div class="battle-pouch-slot-title"><strong>' +
      escapeHtml(definition.name) + '</strong><span>+' + DATA.battleQualityCaps[slot.quality] +
      '级上限</span></div><label><span>装备名称（选填）</span><input type="search" autocomplete="off" aria-controls="' + listId +
      '" value="' + escapeHtml(slot.itemName) + '" data-edit-equipment="' + definition.id +
      '" placeholder="可留空，输入关键词匹配装备"></label><div id="' + listId +
      '" class="battle-pouch-equipment-matches" role="group" aria-label="装备匹配结果" hidden></div><label><span>品质（必填）</span><select required data-edit-equipment-quality="' + definition.id + '">' +
      qualityOptions(DATA.battleQualityNames, slot.quality, false) +
      '</select></label></article>';
  }

  function hideEquipmentMatches() {
    el.progressList.querySelectorAll(".battle-pouch-equipment-matches").forEach(function (list) {
      list.hidden = true;
      list.innerHTML = "";
    });
  }

  function renderEquipmentMatches(input) {
    hideEquipmentMatches();
    var query = normalizedSearch(input.value);
    if (!query || !state.editDraft) return;
    var definition = DATA.equipmentSlots.find(function (slot) { return slot.id === input.dataset.editEquipment; });
    if (!definition) return;
    var matches = equipmentCatalog(definition).filter(function (item) {
      return normalizedSearch(item.name).indexOf(query) !== -1;
    });
    var list = input.closest(".battle-pouch-equipment-slot").querySelector(".battle-pouch-equipment-matches");
    list.innerHTML = matches.slice(0, 8).map(function (item) {
      return '<button type="button" class="seg" data-pick-battle-equipment="' + escapeHtml(item.name) + '">' +
        escapeHtml(item.name) + '</button>';
    }).join("") + (!matches.length ? '<span class="muted-tip">未找到匹配装备，可直接保留输入的名称。</span>' :
      matches.length > 8 ? '<span class="muted-tip">仅显示前8项，请继续输入以缩小范围。</span>' : "");
    list.hidden = false;
  }

  function pouchSlotEditor(slot, index) {
    return '<label class="battle-pouch-pill-slot quality-' + escapeHtml(slot.quality || "empty") + '"><span>内丹槽位' +
      (index + 1) + '</span><select data-edit-pouch-quality="' + index + '">' +
      qualityOptions(DATA.pouchQualityNames, slot.quality, true) + '</select><small>+' +
      (slot.quality ? DATA.pouchQualityCaps[slot.quality] : 0) + '级上限</small></label>';
  }

  function capSummary(title, snapshot) {
    return '<div class="battle-pouch-cap-summary"><strong>' + title + '</strong><span>玩家上限：' +
      (snapshot.playerCap === null ? "未解锁" : snapshot.playerCap + "级") + '</span><span>物品上限：' +
      snapshot.itemCap + '级</span><span>实际等级上限：' +
      (snapshot.effectiveCap === null ? "未解锁" : snapshot.effectiveCap + "级") + '</span>' +
      (snapshot.overCap ? '<b class="error-text">当前进度已超限，记录将保留，但不能继续升级。</b>' : "") + '</div>';
  }

  function discipleEditor(draft) {
    var caps = CORE.effectiveCaps(state.account.playerLevel, draft, DATA);
    return '<div class="battle-pouch-editor" role="dialog" aria-modal="false" aria-label="编辑' + escapeHtml(draft.name) + '">' +
      '<div class="battle-pouch-editor-head"><div><strong>编辑 · ' + escapeHtml(draft.name) + '</strong><span>' +
      (draft.sourceType === "atlas" ? "来自图鉴弟子库" : "自由新增弟子") +
      '</span></div><button type="button" class="link-btn" data-battle-pouch-action="cancel-edit">关闭</button></div>' +
      '<div class="battle-pouch-editor-columns"><section><h3>战匣</h3>' +
      numberField("当前战匣等级", "battleLevel", draft.battle.currentLevel, 0, "edit") +
      capSummary("战匣等级上限", caps.battle) + '<p class="muted-tip">固定槽位：武器、防具、饰品、典籍。名称选填，品质必填；仅按品质计算上限。</p><div class="battle-pouch-equipment-slots">' +
      DATA.equipmentSlots.map(function (definition, index) {
        return equipmentSlotEditor(definition, draft.battle.slots[index]);
      }).join("") + '</div></section><section><h3>丹囊</h3>' +
      numberField("当前丹囊等级", "pouchLevel", draft.pouch.currentLevel, 0, "edit") +
      capSummary("丹囊等级上限", caps.pouch) +
      '<p class="muted-tip">八个内丹槽位只记录品质；新放入时默认橙色。</p><div class="battle-pouch-pill-slots">' +
      draft.pouch.slots.map(pouchSlotEditor).join("") + '</div></section></div>' +
      '<div class="battle-pouch-editor-actions"><button type="button" class="seg active" data-battle-pouch-action="save-edit">保存</button>' +
      '<button type="button" class="seg" data-battle-pouch-action="cancel-edit">取消</button></div></div>';
  }

  function discipleCard(disciple) {
    if (state.editingId === disciple.id && state.editDraft) return discipleEditor(state.editDraft);
    var caps = CORE.effectiveCaps(state.account.playerLevel, disciple, DATA);
    return '<article class="panel battle-pouch-disciple-card"><div class="battle-pouch-disciple-head"><div><strong>' +
      escapeHtml(disciple.name) + '</strong><span>' + (disciple.sourceType === "atlas" ? "图鉴弟子" : "自由弟子") +
      '</span></div><div class="battle-pouch-card-actions"><button type="button" class="seg" data-battle-pouch-action="add-to-plan" data-disciple-id="' +
      escapeHtml(disciple.id) + '">加入计算</button><button type="button" class="seg" data-battle-pouch-action="edit" data-disciple-id="' +
      escapeHtml(disciple.id) + '">编辑</button><button type="button" class="link-btn" data-battle-pouch-action="delete" data-disciple-id="' +
      escapeHtml(disciple.id) + '">删除</button></div></div><div class="battle-pouch-disciple-summary"><div><b>战匣</b>' +
      capLabel(caps.battle) + '</div><div><b>丹囊</b>' + capLabel(caps.pouch) + '</div></div></article>';
  }

  function renderProgress() {
    el.account.innerHTML = accountPanel();
    el.progressList.innerHTML = state.disciples.length
      ? state.disciples.map(discipleCard).join("")
      : '<section class="panel empty"><p>尚未添加弟子。请先从图鉴弟子库搜索，或自由输入弟子名称。</p></section>';
  }

  function refreshEditorStatus() {
    var editor = el.progressList.querySelector(".battle-pouch-editor");
    if (!editor || !state.editDraft) return;
    var draft = state.editDraft;
    var caps = CORE.effectiveCaps(state.account.playerLevel, draft, DATA);
    var summaries = editor.querySelectorAll(".battle-pouch-cap-summary");
    summaries[0].outerHTML = capSummary("战匣等级上限", caps.battle);
    summaries[1].outerHTML = capSummary("丹囊等级上限", caps.pouch);
    editor.querySelector('[data-edit-field="battleLevel"]').value = draft.battle.currentLevel;
    editor.querySelector('[data-edit-field="pouchLevel"]').value = draft.pouch.currentLevel;
    editor.querySelectorAll(".battle-pouch-equipment-slot").forEach(function (node, index) {
      var slot = draft.battle.slots[index];
      node.querySelector(".battle-pouch-slot-title span").textContent = "+" + DATA.battleQualityCaps[slot.quality] + "级上限";
      var quality = node.querySelector("[data-edit-equipment-quality]");
      quality.value = slot.quality;
    });
    editor.querySelectorAll(".battle-pouch-pill-slot").forEach(function (node, index) {
      var quality = draft.pouch.slots[index].quality;
      node.className = "battle-pouch-pill-slot quality-" + (quality || "empty");
      node.querySelector("small").textContent = "+" + (quality ? DATA.pouchQualityCaps[quality] : 0) + "级上限";
    });
  }

  function atlasMatches(query) {
    var keyword = normalizedSearch(query);
    if (!keyword || !ATLAS_DATA || !Array.isArray(ATLAS_DATA.items)) return [];
    return ATLAS_DATA.items.filter(function (item) {
      return normalizedSearch(item.name).indexOf(keyword) !== -1;
    }).slice(0, 12);
  }

  function renderSuggestions() {
    var query = state.search.trim();
    if (!query) {
      el.suggestions.hidden = true;
      el.suggestions.innerHTML = "";
      return;
    }
    var matches = atlasMatches(query);
    var html = matches.map(function (item) {
      return '<button type="button" data-add-atlas-id="' + escapeHtml(item.id) + '"><strong>' +
        escapeHtml(item.name) + '</strong><span>从图鉴弟子库添加</span></button>';
    }).join("");
    if (!matches.length) {
      html = '<button type="button" data-add-custom-name="' + escapeHtml(query) + '"><strong>' +
        escapeHtml(query) + '</strong><span>没有搜索结果，以此名称新增</span></button>';
    }
    el.suggestions.innerHTML = html;
    el.suggestions.hidden = false;
  }

  function ensureCalcEntry(disciple) {
    if (!state.calcById[disciple.id]) {
      state.calcById[disciple.id] = {
        selected: false,
        battleEnabled: true,
        battleTarget: disciple.battle.targetLevel,
        pouchEnabled: true,
        pouchTarget: disciple.pouch.targetLevel,
        systemPriority: state.account.systemPriority
      };
    }
    if (state.calcOrder.indexOf(disciple.id) === -1) state.calcOrder.push(disciple.id);
    return state.calcById[disciple.id];
  }

  function calcRow(disciple, index) {
    var entry = ensureCalcEntry(disciple);
    var caps = CORE.effectiveCaps(state.account.playerLevel, disciple, DATA);
    return '<article class="battle-pouch-plan-row" draggable="true" data-plan-row="' + escapeHtml(disciple.id) + '">' +
      '<div class="battle-pouch-plan-head"><label><input type="checkbox" data-calc-select="' + escapeHtml(disciple.id) + '"' +
      (entry.selected ? " checked" : "") + '><strong>' + escapeHtml(disciple.name) + '</strong></label><div>' +
      '<button type="button" class="link-btn" data-plan-move="up" data-disciple-id="' + escapeHtml(disciple.id) + '"' +
      (index === 0 ? " disabled" : "") + '>上移</button><button type="button" class="link-btn" data-plan-move="down" data-disciple-id="' +
      escapeHtml(disciple.id) + '"' + (index === state.calcOrder.length - 1 ? " disabled" : "") + '>下移</button></div></div>' +
      '<div class="battle-pouch-plan-fields"><label><span>分区优先</span><select data-calc-field="systemPriority" data-disciple-id="' + escapeHtml(disciple.id) + '">' +
      '<option value="battle"' + (entry.systemPriority === "battle" ? " selected" : "") + '>战匣优先</option>' +
      '<option value="pouch"' + (entry.systemPriority === "pouch" ? " selected" : "") + '>丹囊优先</option></select></label>' +
      planTarget("战匣", "battle", disciple, entry, caps.battle) + planTarget("丹囊", "pouch", disciple, entry, caps.pouch) +
      '</div></article>';
  }

  function planTarget(label, kind, disciple, entry, cap) {
    var enabledKey = kind + "Enabled";
    var targetKey = kind + "Target";
    var disabled = !cap.unlocked || cap.overCap;
    return '<div class="battle-pouch-plan-target"><label><input type="checkbox" data-calc-field="' + enabledKey +
      '" data-disciple-id="' + escapeHtml(disciple.id) + '"' + (entry[enabledKey] ? " checked" : "") +
      (disabled ? " disabled" : "") + '><span>' + label + '</span></label><input type="number" min="' +
      disciple[kind].currentLevel + '" max="' + (cap.effectiveCap === null ? disciple[kind].currentLevel : cap.effectiveCap) +
      '" step="1" inputmode="numeric" value="' + entry[targetKey] + '" data-calc-field="' + targetKey +
      '" data-disciple-id="' + escapeHtml(disciple.id) + '"' + (disabled ? " disabled" : "") + '><small>' +
      (!cap.unlocked ? "未解锁" : cap.overCap ? "当前进度超限" : "当前" + disciple[kind].currentLevel + "／上限" + cap.effectiveCap) +
      '</small></div>';
  }

  function renderPurchaseSettings() {
    return '<section class="panel battle-pouch-purchase-settings"><div class="panel-title">购买补足设置</div><div class="battle-pouch-purchase-grid">' +
      purchaseFields("沧海珠", "pearls", state.account.purchase.pearls) +
      purchaseFields("玄龟甲", "shells", state.account.purchase.shells) + '</div></section>';
  }

  function purchaseFields(name, key, setting) {
    return '<fieldset><legend>' + name + '</legend>' +
      numberField("每包数量", key + "PackSize", setting.packSize, 1, "purchase") +
      numberField("每包元宝", key + "PackPrice", setting.packPrice, 0, "purchase") + '</fieldset>';
  }

  function selectedForCore() {
    return state.calcOrder.map(function (id) {
      var disciple = discipleById(id);
      var entry = state.calcById[id];
      if (!disciple || !entry || !entry.selected) return null;
      return Object.assign({ disciple: disciple }, entry);
    }).filter(Boolean);
  }

  function attributeText(kind, delta) {
    if (kind === "pouch") return '基础属性加成 +' + delta.bonusPercent + '%';
    return '攻击 +' + formatNumber(delta.attack) + '、防御 +' + formatNumber(delta.defense) + '、血量 +' +
      formatNumber(delta.health) + '、玩家对战免伤 +' + delta.pvpMitigation;
  }

  function renderCalcResult(result) {
    if (!result) return "";
    if (!result.items.length) return '<section class="panel empty"><p>请至少选择一位弟子和一个计算分区。</p></section>';
    var full = result.fullTarget;
    var rows = result.allocations.map(function (item) {
      return '<article class="battle-pouch-result-item"><div><strong>' + escapeHtml(item.discipleName) + ' · ' +
        (item.kind === "battle" ? "战匣" : "丹囊") + '</strong><span>' + item.currentLevel + '级 → 目标' + item.targetLevel +
        '级</span></div>' + (item.valid ? '<p>现有共享库存可达到 <b>' + item.reachableLevel +
        '级</b>' + (item.shortageAt ? '，从' + item.shortageAt + '级开始材料不足' : '，目标可完成') + '</p><p>完整目标需要：沧海珠' +
        formatNumber(item.required.pearls) + '、玄龟甲' + formatNumber(item.required.shells) + '</p><p>目标属性提升：' +
        attributeText(item.kind, item.targetDelta) + '</p>' : '<p class="error-text">' + escapeHtml(item.errors.join("；")) + '</p>') + '</article>';
    }).join("");
    return '<section class="panel battle-pouch-result-overview"><div class="panel-title">共享库存与完整目标总览</div>' +
      '<div class="battle-pouch-result-grid"><div><span>沧海珠总需求</span><b>' + formatNumber(full.totals.pearls) +
      '</b><small>缺少' + formatNumber(full.shortage.pearls) + '</small></div><div><span>玄龟甲总需求</span><b>' +
      formatNumber(full.totals.shells) + '</b><small>缺少' + formatNumber(full.shortage.shells) + '</small></div><div><span>分配后剩余</span><b>' +
      formatNumber(result.remaining.pearls) + '／' + formatNumber(result.remaining.shells) + '</b><small>沧海珠／玄龟甲</small></div><div><span>购买补足</span><b>' +
      formatNumber(full.purchase.totalPrice) + '元宝</b><small>沧海珠' + full.purchase.pearls.packs + '包，玄龟甲' +
      full.purchase.shells.packs + '包</small></div></div></section><section class="battle-pouch-result-list">' + rows + '</section>';
  }

  function renderCalculator() {
    state.calcOrder = state.calcOrder.filter(function (id) { return Boolean(discipleById(id)); });
    state.disciples.forEach(ensureCalcEntry);
    var ordered = state.calcOrder.map(discipleById).filter(Boolean);
    el.calculator.innerHTML = '<section class="panel battle-pouch-plan-toolbar"><div class="panel-title">选择弟子并设置目标</div>' +
      '<p class="muted-tip">按当前顺序分配共享库存；同一弟子再按战匣优先或丹囊优先。</p>' +
      '<button type="button" class="seg" data-battle-pouch-action="targets-to-cap">一键全部设为各自实际等级上限</button></section>' +
      '<div class="battle-pouch-plan-list">' + (ordered.length ? ordered.map(calcRow).join("") :
        '<section class="panel empty"><p>请先在个人进度中添加弟子。</p></section>') + '</div>' +
      renderPurchaseSettings() + '<div class="battle-pouch-calculate-actions"><button type="button" class="seg active" data-battle-pouch-action="calculate">计算目标</button></div>' +
      '<div id="battle-pouch-calculation-result">' + renderCalcResult(state.calcResult) + '</div>';
  }

  function referenceRows(kind, view, disciple) {
    var levels = kind === "battle" ? DATA.battleLevels : DATA.pouchLevels;
    if (view === "all") return levels.slice(1);
    if (view === "key") return CORE.keyReferenceRows(levels);
    var current = disciple ? disciple[kind].currentLevel : 1;
    var start = Math.max(1, current - 3);
    var end = Math.min(90, current + 3);
    return levels.slice(start, end + 1);
  }

  function rowClasses(row, kind, disciple, caps) {
    if (!disciple || !caps) return "";
    var classes = [];
    if (row.level === disciple[kind].currentLevel) classes.push("is-current");
    if (row.level === disciple[kind].targetLevel) classes.push("is-target");
    if (row.level === caps[kind].effectiveCap) classes.push("is-cap");
    return classes.join(" ");
  }

  function referenceTable(kind, rows, disciple, caps, view) {
    var headers = kind === "battle"
      ? ["等级", "攻击", "防御", "血量", "PVP免伤", "沧海珠", "玄龟甲"]
      : ["等级", "基础属性加成", "沧海珠", "玄龟甲"];
    var body = rows.map(function (row) {
      var cells = kind === "battle"
        ? [row.level + "级", formatNumber(row.attack), formatNumber(row.defense), formatNumber(row.health), row.pvpMitigation, formatNumber(row.pearls), formatNumber(row.shells)]
        : [row.level + "级", row.bonusPercent + "%", formatNumber(row.pearls), formatNumber(row.shells)];
      return '<tr class="' + rowClasses(row, kind, disciple, caps) + '">' + cells.map(function (cell, index) {
        return '<td data-label="' + escapeHtml(headers[index]) + '">' + cell + '</td>';
      }).join("") + '</tr>';
    }).join("");
    var materialHint = view === "key"
      ? "材料含义：上一关键节点升至本关键节点的累计消耗。"
      : "材料含义：上一等级升至本等级所需。";
    return '<p class="muted-tip">' + materialHint + '</p><div class="battle-pouch-reference-table"><table><thead><tr>' +
      headers.map(function (header) { return '<th>' + header + '</th>'; }).join("") + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function rulesTable(title, names, caps) {
    return '<section class="panel battle-pouch-rule-card"><h3>' + title + '</h3><div class="battle-pouch-rule-grid">' +
      Object.keys(names).map(function (key) {
        return '<span class="quality-' + key + '"><b>' + escapeHtml(names[key]) + '</b><small>增加' + caps[key] + '级上限</small></span>';
      }).join("") + '</div></section>';
  }

  function renderReference() {
    var disciple = discipleById(state.referenceDiscipleId);
    var caps = disciple ? CORE.effectiveCaps(state.account.playerLevel, disciple, DATA) : null;
    var rows = referenceRows(state.referenceKind, state.referenceView, disciple);
    el.reference.innerHTML = '<section class="panel battle-pouch-reference-toolbar"><div class="segs">' +
      '<button type="button" class="seg' + (state.referenceKind === "battle" ? " active" : "") + '" data-reference-kind="battle">战匣等级表</button>' +
      '<button type="button" class="seg' + (state.referenceKind === "pouch" ? " active" : "") + '" data-reference-kind="pouch">丹囊等级表</button></div>' +
      '<div class="segs"><button type="button" class="seg' + (state.referenceView === "nearby" ? " active" : "") + '" data-reference-view="nearby">当前附近</button>' +
      '<button type="button" class="seg' + (state.referenceView === "key" ? " active" : "") + '" data-reference-view="key">关键节点</button>' +
      '<button type="button" class="seg' + (state.referenceView === "all" ? " active" : "") + '" data-reference-view="all">全部等级</button></div>' +
      '<label><span>参照弟子</span><select data-reference-disciple><option value="">不选择弟子</option>' +
      state.disciples.map(function (item) { return '<option value="' + escapeHtml(item.id) + '"' +
        (item.id === state.referenceDiscipleId ? " selected" : "") + '>' + escapeHtml(item.name) + '</option>'; }).join("") +
      '</select></label></section><section class="panel">' + referenceTable(state.referenceKind, rows, disciple, caps, state.referenceView) + '</section>' +
      '<div class="battle-pouch-rules">' + rulesTable("战匣装备品质上限", DATA.battleQualityNames, DATA.battleQualityCaps) +
      rulesTable("丹囊内丹品质上限", DATA.pouchQualityNames, DATA.pouchQualityCaps) +
      '<section class="panel battle-pouch-rule-card"><h3>等级与槽位规则</h3><p>玩家46级解锁战匣与丹囊；实际等级上限取玩家上限与物品上限中的较小值。</p>' +
      '<p class="muted-tip">槽位分级解锁规则待准确数据补充；当前版本在46级后开放全部槽位。</p></section></div>';
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-battle-pouch-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.battlePouchMode === mode);
    });
    el.progress.hidden = mode !== "progress";
    el.calculator.hidden = mode !== "calculator";
    el.reference.hidden = mode !== "reference";
    if (mode === "calculator") renderCalculator();
    if (mode === "reference") renderReference();
  }

  function addDisciple(source) {
    var name = String(source.name || "").trim();
    var duplicate = state.disciples.some(function (disciple) {
      if (source.sourceType === "atlas") return disciple.sourceType === "atlas" && disciple.atlasId === source.atlasId;
      return disciple.name === name;
    });
    if (duplicate) {
      showError("该弟子已经存在，不能重复添加。")
      return;
    }
    var disciple = emptyDisciple(source);
    state.disciples.push(disciple);
    state.calcOrder.push(disciple.id);
    saveState();
    state.search = "";
    el.search.value = "";
    renderSuggestions();
    renderProgress();
  }

  function movePlan(id, direction) {
    var index = state.calcOrder.indexOf(id);
    var next = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || next < 0 || next >= state.calcOrder.length) return;
    var moved = state.calcOrder.splice(index, 1)[0];
    state.calcOrder.splice(next, 0, moved);
    renderCalculator();
  }

  function updateAccountField(field, value) {
    if (field === "playerLevel") state.account.playerLevel = CORE.integer(value);
    if (field === "pearls" || field === "shells") state.account.inventory[field] = CORE.integer(value);
    saveState();
  }

  function updatePurchaseField(field, value) {
    var match = /^(pearls|shells)(PackSize|PackPrice)$/.exec(field);
    if (!match) return;
    var key = match[1];
    var prop = match[2] === "PackSize" ? "packSize" : "packPrice";
    var minimum = prop === "packSize" ? 1 : 0;
    state.account.purchase[key][prop] = Math.max(minimum, CORE.integer(value, minimum));
    saveState();
  }

  function bindEvents() {
    el.progressList.addEventListener("input", function (event) {
      if (event.target.matches("[data-edit-equipment]") && !event.isComposing) renderEquipmentMatches(event.target);
    });
    el.progressList.addEventListener("compositionstart", function (event) {
      if (event.target.matches("[data-edit-equipment]")) hideEquipmentMatches();
    });
    el.progressList.addEventListener("compositionend", function (event) {
      if (event.target.matches("[data-edit-equipment]")) renderEquipmentMatches(event.target);
    });
    el.progressList.addEventListener("keydown", function (event) {
      if (event.key === "Escape") hideEquipmentMatches();
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest("[data-edit-equipment], .battle-pouch-equipment-matches")) hideEquipmentMatches();
    });
    document.getElementById("battle-pouch-modes").addEventListener("click", function (event) {
      var button = event.target.closest("[data-battle-pouch-mode]");
      if (button) setMode(button.dataset.battlePouchMode);
    });
    el.search.addEventListener("input", function () {
      state.search = el.search.value;
      renderSuggestions();
    });
    el.suggestions.addEventListener("click", function (event) {
      var atlasButton = event.target.closest("[data-add-atlas-id]");
      var customButton = event.target.closest("[data-add-custom-name]");
      if (atlasButton) {
        var item = ATLAS_DATA.items.find(function (candidate) { return String(candidate.id) === atlasButton.dataset.addAtlasId; });
        if (item) addDisciple({ id: "atlas-" + item.id, name: item.name, sourceType: "atlas", atlasId: String(item.id) });
      } else if (customButton) {
        addDisciple({ id: uniqueId("custom"), name: customButton.dataset.addCustomName, sourceType: "custom" });
      }
    });
    document.getElementById("partition-battle-box-pill-pouch").addEventListener("change", function (event) {
      var target = event.target;
      if (target.dataset.accountField) {
        updateAccountField(target.dataset.accountField, target.value);
        renderProgress();
        if (state.mode === "calculator") renderCalculator();
        if (state.mode === "reference") renderReference();
      } else if (target.dataset.purchaseField) {
        updatePurchaseField(target.dataset.purchaseField, target.value);
      } else if (target.dataset.editField && state.editDraft) {
        if (target.dataset.editField === "battleLevel") state.editDraft.battle.currentLevel = CORE.integer(target.value, 0, 90);
        if (target.dataset.editField === "pouchLevel") state.editDraft.pouch.currentLevel = CORE.integer(target.value, 0, 90);
        refreshEditorStatus();
      } else if (target.dataset.editEquipment && state.editDraft) {
        var definition = DATA.equipmentSlots.find(function (slot) { return slot.id === target.dataset.editEquipment; });
        var slot = state.editDraft.battle.slots.find(function (item) { return item.slotId === definition.id; });
        var name = target.value.trim();
        var catalog = equipmentCatalog(definition).find(function (item) { return item.name === name; });
        slot.itemName = name;
        slot.itemId = catalog ? String(catalog.id) : null;
        slot.sourceType = catalog ? "catalog" : name ? "custom" : null;
        slot.quality = slot.quality || DATA.defaults.defaultQuality;
        refreshEditorStatus();
      } else if (target.dataset.editEquipmentQuality && state.editDraft) {
        var equipment = state.editDraft.battle.slots.find(function (item) { return item.slotId === target.dataset.editEquipmentQuality; });
        equipment.quality = target.value;
        refreshEditorStatus();
      } else if (target.dataset.editPouchQuality !== undefined && state.editDraft) {
        state.editDraft.pouch.slots[Number(target.dataset.editPouchQuality)].quality = target.value || null;
        refreshEditorStatus();
      } else if (target.dataset.calcSelect) {
        ensureCalcEntry(discipleById(target.dataset.calcSelect)).selected = target.checked;
        state.calcResult = null;
      } else if (target.dataset.calcField) {
        var entry = state.calcById[target.dataset.discipleId];
        if (!entry) return;
        if (/Enabled$/.test(target.dataset.calcField)) entry[target.dataset.calcField] = target.checked;
        else if (/Target$/.test(target.dataset.calcField)) entry[target.dataset.calcField] = CORE.integer(target.value, 0, 90);
        else entry[target.dataset.calcField] = target.value;
        state.calcResult = null;
      } else if (target.dataset.referenceDisciple !== undefined) {
        state.referenceDiscipleId = target.value;
        renderReference();
      }
    });
    document.getElementById("partition-battle-box-pill-pouch").addEventListener("click", function (event) {
      var equipmentChoice = event.target.closest("[data-pick-battle-equipment]");
      if (equipmentChoice && state.editDraft) {
        var equipmentInput = equipmentChoice.closest(".battle-pouch-equipment-slot").querySelector("[data-edit-equipment]");
        equipmentInput.value = equipmentChoice.dataset.pickBattleEquipment;
        equipmentInput.dispatchEvent(new Event("change", { bubbles: true }));
        hideEquipmentMatches();
        equipmentInput.focus({ preventScroll: true });
        return;
      }
      var action = event.target.closest("[data-battle-pouch-action]");
      var move = event.target.closest("[data-plan-move]");
      var referenceKind = event.target.closest("[data-reference-kind]");
      var referenceView = event.target.closest("[data-reference-view]");
      if (move) return movePlan(move.dataset.discipleId, move.dataset.planMove);
      if (referenceKind) {
        state.referenceKind = referenceKind.dataset.referenceKind;
        renderReference();
        return;
      }
      if (referenceView) {
        state.referenceView = referenceView.dataset.referenceView;
        renderReference();
        return;
      }
      if (!action) return;
      var id = action.dataset.discipleId;
      if (action.dataset.battlePouchAction === "edit") {
        state.editingId = id;
        state.editDraft = clone(discipleById(id));
        renderProgress();
      } else if (action.dataset.battlePouchAction === "cancel-edit") {
        if (state.editDraft && JSON.stringify(state.editDraft) !== JSON.stringify(discipleById(state.editingId)) &&
            !window.confirm("存在未保存的修改，确定放弃吗？")) return;
        state.editingId = null;
        state.editDraft = null;
        renderProgress();
      } else if (action.dataset.battlePouchAction === "save-edit") {
        var invalidQuality = Array.from(el.progressList.querySelectorAll("[data-edit-equipment-quality]"))
          .find(function (control) { return !control.validity.valid; });
        if (invalidQuality) { invalidQuality.reportValidity(); return; }
        var index = state.disciples.findIndex(function (disciple) { return disciple.id === state.editingId; });
        if (index >= 0) state.disciples[index] = CORE.normalizeDisciple(state.editDraft, DATA);
        state.editingId = null;
        state.editDraft = null;
        saveState();
        renderProgress();
      } else if (action.dataset.battlePouchAction === "delete") {
        var disciple = discipleById(id);
        if (!disciple || !window.confirm("删除“" + disciple.name + "”的战匣丹囊进度？此操作无法撤销。")) return;
        state.disciples = state.disciples.filter(function (item) { return item.id !== id; });
        state.calcOrder = state.calcOrder.filter(function (itemId) { return itemId !== id; });
        delete state.calcById[id];
        saveState();
        renderProgress();
      } else if (action.dataset.battlePouchAction === "add-to-plan") {
        ensureCalcEntry(discipleById(id)).selected = true;
        setMode("calculator");
      } else if (action.dataset.battlePouchAction === "targets-to-cap") {
        state.calcOrder.forEach(function (discipleId) {
          var disciple = discipleById(discipleId);
          var entry = ensureCalcEntry(disciple);
          var caps = CORE.effectiveCaps(state.account.playerLevel, disciple, DATA);
          if (caps.battle.unlocked && !caps.battle.overCap) entry.battleTarget = caps.battle.effectiveCap;
          if (caps.pouch.unlocked && !caps.pouch.overCap) entry.pouchTarget = caps.pouch.effectiveCap;
        });
        state.calcResult = null;
        renderCalculator();
      } else if (action.dataset.battlePouchAction === "calculate") {
        state.calcResult = CORE.calculatePlan(selectedForCore(), state.account, DATA);
        renderCalculator();
      }
    });
    document.getElementById("partition-battle-box-pill-pouch").addEventListener("wheel", function (event) {
      if (event.target.matches('input[type="number"]') && document.activeElement === event.target) event.preventDefault();
    }, { passive: false });
    var draggedId = null;
    el.calculator.addEventListener("dragstart", function (event) {
      var row = event.target.closest("[data-plan-row]");
      if (row) draggedId = row.dataset.planRow;
    });
    el.calculator.addEventListener("dragover", function (event) {
      if (event.target.closest("[data-plan-row]")) event.preventDefault();
    });
    el.calculator.addEventListener("drop", function (event) {
      var row = event.target.closest("[data-plan-row]");
      if (!row || !draggedId || row.dataset.planRow === draggedId) return;
      event.preventDefault();
      var from = state.calcOrder.indexOf(draggedId);
      var to = state.calcOrder.indexOf(row.dataset.planRow);
      state.calcOrder.splice(from, 1);
      state.calcOrder.splice(to, 0, draggedId);
      draggedId = null;
      renderCalculator();
    });
    window.addEventListener("beforeunload", function (event) {
      if (!state.editDraft || JSON.stringify(state.editDraft) === JSON.stringify(discipleById(state.editingId))) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  function init() {
    if (!DATA || !CORE) return;
    el.error = document.getElementById("battle-pouch-error");
    el.progress = document.getElementById("battle-pouch-progress");
    el.account = document.getElementById("battle-pouch-account");
    el.search = document.getElementById("battle-pouch-disciple-search");
    el.suggestions = document.getElementById("battle-pouch-disciple-suggestions");
    el.progressList = document.getElementById("battle-pouch-progress-list");
    el.calculator = document.getElementById("battle-pouch-calculator");
    el.reference = document.getElementById("battle-pouch-reference");
    if (!el.progress || !el.account || !el.calculator || !el.reference) return;
    loadState();
    bindEvents();
    renderProgress();
    renderCalculator();
    renderReference();
    setMode("progress");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
