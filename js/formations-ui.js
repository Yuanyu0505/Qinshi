(function (root) {
  "use strict";

  var DATA = root.FORMATIONS_DATA;
  var NUMBER_FORMAT = root.QinshiNumberFormat || (typeof require === "function" ? require("./number-format.js") : null);
  var CORE = root.FORMATIONS;
  var ACCOUNT_STORAGE = root.QinshiAccounts;
  var STORE_KEY = "qinshi_formation_progress_v1";
  var initialized = false;
  var progressStore;
  var appliedOptions;
  var recommendationRevision = 0;
  var limitRevision = 0;
  var limitResult = null;
  var limitContext = null;
  var el = {};
  var state = {
    selectedId: null,
    stored: {},
    editing: false,
    draft: null,
    progressError: "",
    storageError: "",
    sortPosition: null,
    mobilePosition: 1,
    recommendation: null,
    view: "main",
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formations() {
    if (!DATA || !Array.isArray(DATA.items)) return [];
    var byId = DATA.items.reduce(function (map, item) { map[item.id] = item; return map; }, {});
    var order = DATA.meta && Array.isArray(DATA.meta.order) ? DATA.meta.order : [];
    return order.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function selectedFormation() {
    return formations().find(function (item) { return item.id === state.selectedId; }) || null;
  }

  function candidateById(formation, candidateId) {
    return (formation.candidates || []).find(function (candidate) { return candidate.id === candidateId; }) || null;
  }

  function formatNumber(value) {
    return NUMBER_FORMAT.format(value || 0);
  }

  // Reference inputs use a separate virtual progress object and never enter saved progress.
  function maxReferenceRows(filters) {
    filters = filters || {};
    var reference = root.FORMATION_MAX_REFERENCE_DATA;
    var query = String(filters.query || '').replace(/[\s·]/g, '').toLocaleLowerCase();
    var rows = [];
    (reference && reference.formations || []).forEach(function (formation) {
      if (filters.formation && filters.formation !== formation.name) return;
      formation.members.forEach(function (member) {
        var searchable = (formation.name + member.name).replace(/[\s·]/g, '').toLocaleLowerCase();
        if (!query || searchable.includes(query)) rows.push(Object.assign({ formation: formation.name, stones: formation.stones }, member));
      });
    });
    if (['attack', 'defense', 'hp'].includes(filters.sort)) rows.sort(function (a, b) { return b[filters.sort] - a[filters.sort]; });
    return rows;
  }

  function mountMaxReference() {
    var reference = root.FORMATION_MAX_REFERENCE_DATA;
    if (!reference || !el.workspace || document.getElementById('formation-max-reference')) return;
    var panel = document.createElement('section');
    panel.id = 'formation-max-reference';
    panel.className = 'panel formation-max-reference';
    panel.hidden = true;
    panel.innerHTML = '<h2>合阵弟子极限属性</h2><p class="formation-max-condition">' + escapeHtml(reference.meta.conditions) + '</p>' +
      '<div class="formation-max-controls"><select data-max-formation aria-label="极限属性合阵"><option value="">全部合阵</option>' +
      reference.formations.map(function (formation) { return '<option value="' + escapeHtml(formation.name) + '">' + escapeHtml(formation.name) + '</option>'; }).join('') +
      '</select><select data-max-sort aria-label="极限属性排序"><option value="source">资料顺序</option><option value="attack">攻击降序</option><option value="defense">防御降序</option><option value="hp">血量降序</option></select>' +
      '<input class="formation-max-query" type="search" data-max-query aria-label="搜索极限属性" placeholder="搜索合阵或弟子名称" autocomplete="off"></div><div data-limit-recommendation></div><div data-max-results aria-live="polite"></div>';
    el.workspace.parentNode.insertBefore(panel, el.workspace);
    function refresh() {
      var rows = maxReferenceRows({formation: panel.querySelector('[data-max-formation]').value, query: panel.querySelector('[data-max-query]').value, sort: panel.querySelector('[data-max-sort]').value});
      var results = panel.querySelector('[data-max-results]');
      if (!rows.length) { results.innerHTML = '<p role="status">未找到匹配资料。</p>'; return; }
      function position(row) { return row.position == null ? '—' : String(row.position); }
      results.innerHTML = '<div class="formation-max-table" tabindex="0" role="region" aria-label="合阵弟子极限属性，可横向滚动"><table><thead><tr>' +
        ['阵眼石','合阵','弟子','攻','防','血','建议位置','培养属性','提升属性'].map(function (label) { return '<th scope="col">' + label + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + row.stones + '</td><td>' + escapeHtml(row.formation) + '</td><th scope="row">' + escapeHtml(row.name) + '</th><td>' +
          formatNumber(row.attack) + '</td><td>' + formatNumber(row.defense) + '</td><td>' + formatNumber(row.hp) + '</td><td>' + position(row) + '</td><td>' + escapeHtml(row.trainAttribute || '—') + '</td><td>' + escapeHtml(row.gainAttribute || '—') + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="formation-max-cards">' + rows.map(function (row) { return '<article><h3>' + escapeHtml(row.name) + '</h3><p>' + escapeHtml(row.formation) + ' · 阵眼石 ' + row.stones + '</p><dl>' +
          [['攻',formatNumber(row.attack)],['防',formatNumber(row.defense)],['血',formatNumber(row.hp)],['建议位置',position(row)],['培养属性',row.trainAttribute || '—'],['提升属性',row.gainAttribute || '—']].map(function (entry) { return '<div><dt>' + entry[0] + '</dt><dd>' + escapeHtml(entry[1]) + '</dd></div>'; }).join('') + '</dl></article>'; }).join('') + '</div>';
    }
    panel.addEventListener('input', function (event) { if (event.target.matches('[data-max-query]')) refresh(); });
    panel.addEventListener('change', function (event) { if (event.target.matches('[data-max-formation],[data-max-sort]')) refresh(); if(event.target.matches('[data-max-formation]'))mountLimitRecommendation(); });
    refresh();
    mountLimitRecommendation();
  }

  function cancelRecommendations() {
    recommendationRevision += 1; limitRevision += 1;
    root.FORMATION_RECOMMENDATION_UI.cancel('personal');
    root.FORMATION_RECOMMENDATION_UI.cancel('limit');
  }

  function mountLimitRecommendation() {
    var host=document.querySelector('[data-limit-recommendation]');
    if(!host)return;
    limitRevision+=1; root.FORMATION_RECOMMENDATION_UI.cancel('limit'); limitResult=null;limitContext=null;
    var name=document.querySelector('[data-max-formation]').value;
    if(!name){host.innerHTML='<div class="formation-limit-overview">'+formations().map(function(f){return '<button type="button" class="seg" data-limit-select="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+' · '+f.candidates.length+'名弟子</button>';}).join('')+'</div>';return;}
    try {
      var matches=formations().filter(function(f){return f.name===name;});
      if(matches.length!==1)throw new Error('合阵映射不是唯一，无法推荐。');
      var formation=matches[0];
      var reference=root.FORMATION_MAX_REFERENCE_DATA.formations.find(function(r){return r.name===name;});
      var adapted=root.FORMATION_LIMIT_ADAPTER.buildLimitProgress(formation,reference);
      limitContext={formation:formation,adapted:adapted};
      host.innerHTML='<div data-limit-settings></div><div data-limit-output aria-live="polite"></div>';
      bindLimitSettings();
      generateLimit();
    } catch(error){host.textContent=error.message;}
  }

  function applyOptions(next) {
    cancelRecommendations();appliedOptions=clone(next);state.recommendation=null;limitResult=null;
    var output=document.querySelector('[data-limit-output]');if(output)output.textContent='参数已更新，请重新生成。';
    renderWorkspace(true);
    bindLimitSettings();
  }

  function bindLimitSettings(){
    var host=document.querySelector('[data-limit-settings]');if(!host||!limitContext)return;
    root.FORMATION_RECOMMENDATION_UI.bindSettings(host,appliedOptions,limitContext.formation,function(next){applyOptions(next);generateLimit();},function(){limitRevision+=1;root.FORMATION_RECOMMENDATION_UI.cancel('limit');var output=document.querySelector('[data-limit-output]');if(output)output.textContent='计算已取消';});
  }

  function originalComparison(formation,adapted,result) {
    var totals=CORE.summarizeTargets(adapted.originalAssignments);
    var differences=root.FORMATION_RECOMMENDATION_UI.targets.map(function(t){var delta=(result.totals[t]||0)-(totals[t]||0);return '<span>'+escapeHtml(t)+'：原 '+formatNumber(totals[t]||0)+' → '+formatNumber(result.totals[t]||0)+'（'+(delta>0?'+':'')+formatNumber(delta)+'）</span>';}).join('');
    var originalScore=CORE.scoreTotals(formation,totals,appliedOptions);
    var equal=appliedOptions.mode!=='legacy'&&appliedOptions.mode!=='target'&&String(originalScore.exactScore)===String(result.exactScore);
    return '<details open><summary>原资料方案对照</summary><div class="formation-comparison">'+differences+'</div><p>原资料评分（非战力）：'+escapeHtml(originalScore.exactScore)+' / '+escapeHtml(originalScore.scoreDenominator)+'</p>'+(equal?'<p>当前权重下原资料已最优'+(BigInt(result.tieCount)>1n?'，存在并列方案':'')+'。</p>':'')+'<p>'+escapeHtml(adapted.originalAssignments.map(function(a){return '助阵'+a.position+' '+a.name;}).join('、'))+'</p></details>'+(adapted.conflicts.length?'<p class="formation-warning">'+escapeHtml(adapted.conflicts.map(function(c){return '助阵'+c.position+' 原资料“'+c.rawGainAttribute+'”，基础规则“'+c.targetAttribute+'”，待核实（保留原文）。';}).join('；'))+'</p>':'');
  }

  function generateLimit(offset) {
    if(!limitContext)return;
    var context=limitContext,revision=++limitRevision,account=ACCOUNT_STORAGE.currentAccount&&ACCOUNT_STORAGE.currentAccount();
    var output=document.querySelector('[data-limit-output]');output.textContent='精确计算中…';
    var options=Object.assign({},appliedOptions,{offset:offset||'0',limit:20});
    root.FORMATION_RECOMMENDATION_UI.run('limit',context.formation,context.adapted.progress,options).then(function(result){
      if(revision!==limitRevision||context!==limitContext||!progressStore.isCurrent()||JSON.stringify(account)!==JSON.stringify(ACCOUNT_STORAGE.currentAccount&&ACCOUNT_STORAGE.currentAccount()))return;
      result.offset=options.offset;limitResult=result;
      output.innerHTML=root.FORMATION_RECOMMENDATION_UI.resultHtml(context.formation,result)+originalComparison(context.formation,context.adapted,result)+tieNavigation(result,'limit');
    }).catch(function(error){if(revision===limitRevision&&progressStore.isCurrent()){var current=document.querySelector('[data-limit-output]');if(current)current.textContent=error.message;}});
  }

  function tieNavigation(result,scope){
    var offset=BigInt(result.offset||0),count=BigInt(result.tieCount||0);
    return '<div class="formation-actions">'+(offset>0n?'<button type="button" class="seg" data-tie-scope="'+scope+'" data-tie-offset="'+(offset>20n?offset-20n:0n)+'">上一页并列</button>':'')+(offset+20n<count?'<button type="button" class="seg" data-tie-scope="'+scope+'" data-tie-offset="'+(offset+20n)+'">下一页并列</button>':'')+'</div>';
  }

  function percentText(value) {
    return Number(value) + "%";
  }

  function loadStored() {
    progressStore=root.FORMATION_PROGRESS_STORE.create(ACCOUNT_STORAGE,formations(),CORE);
    var loaded=progressStore.read();
    state.stored=loaded.stored||{};
    state.storageError=loaded.error||'';
    state.storageStatus=loaded.status;
  }

  function savedProgress(formation) {
    return CORE.normalizeProgress(formation, state.stored[formation.id]);
  }

  function resetCalculator() {
    var formation = selectedFormation();
    state.sortPosition = null;
    state.mobilePosition = formation && formation.slots.length ? formation.slots[0].position : 1;
    state.recommendation = null;
  }

  function searchText(value) {
    return CORE.normalizeName(value).toLocaleLowerCase("zh-CN");
  }

  function renderSearchResults() {
    if (!el.search || !el.searchResults) return;
    var query = searchText(el.search.value);
    el.searchResults.hidden = !query;
    if (!query) {
      el.searchResults.innerHTML = "";
      el.searchResults._formationSearchMarkup = "";
      return;
    }
    var matches = formations().map(function (formation) {
      return {
        formation: formation,
        nameMatches: searchText(formation.name).indexOf(query) !== -1,
        candidates: (formation.candidates || []).filter(function (candidate) {
          return searchText(candidate.name).indexOf(query) !== -1;
        }),
      };
    }).filter(function (match) { return match.nameMatches || match.candidates.length; });
    var status = matches.length ? "找到 " + matches.length + " 个合阵，请选择" : "未找到匹配合阵或弟子，请更换关键词。";
    var markup = '<div class="formation-search-head"><p role="status">' + escapeHtml(status) +
      '</p><button type="button" class="link-btn" data-formation-search-clear>清空</button></div>' +
      (matches.length ? '<ul class="formation-search-list">' + matches.map(function (match) {
        var formation = match.formation;
        var detail = match.candidates.length ? '<span class="formation-search-match">命中弟子：' + match.candidates.map(function (candidate) {
          return '<b class="formation-search-match-name">' + escapeHtml(candidate.name) + '</b>';
        }).join("、") + '</span>' : '<span>合阵名称匹配</span>';
        return '<li><button type="button" class="formation-search-result' + (formation.id === state.selectedId ? " is-selected" : "") +
          '" data-formation-id="' + escapeHtml(formation.id) + '" aria-pressed="' + (formation.id === state.selectedId) + '"><strong>' +
          escapeHtml(formation.name) + '</strong>' + detail + '<small>' + escapeHtml(formation.stone) +
          ' 阵眼石' + (formation.id === state.selectedId ? " · 当前合阵" : "") + '</small></button></li>';
      }).join("") + '</ul>' : "");
    // Enter in a native search field may emit a delayed `search` after input.
    // Replacing identical results would remove the button currently focused by
    // ArrowDown and make the next Enter miss its intended formation.
    if (el.searchResults._formationSearchMarkup !== markup) {
      el.searchResults.innerHTML = markup;
      el.searchResults._formationSearchMarkup = markup;
    }
  }

  function clearSearch() {
    el.search.value = "";
    renderSearchResults();
    el.search.focus();
  }

  function handleSearchKeydown(event) {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) === -1 || el.searchResults.hidden) return;
    if (event.target === el.search && (event.key === "Home" || event.key === "End")) return;
    var buttons = Array.prototype.slice.call(el.searchResults.querySelectorAll("button[data-formation-id]"));
    if (!buttons.length) return;
    var current = buttons.indexOf(event.target);
    if (current === -1 && event.target !== el.search) return;
    var next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "ArrowDown") next = current === -1 ? 0 : (current + 1) % buttons.length;
    else next = current === -1 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next].focus();
  }

  function renderSelector() {
    if (!el.selector) return;
    var groups = {};
    formations().forEach(function (formation) {
      var key = String(formation.stone);
      if (!groups[key]) groups[key] = [];
      groups[key].push(formation);
    });
    el.selector.innerHTML = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); }).map(function (stone) {
      return '<div class="formation-stone-group"><strong>' + escapeHtml(stone) + ' 阵眼石</strong><div class="segs">' +
        groups[stone].map(function (formation) {
          return '<button type="button" class="seg' + (formation.id === state.selectedId ? " active" : "") +
            '" data-formation-id="' + escapeHtml(formation.id) + '">' + escapeHtml(formation.name) + '</button>';
        }).join("") + '</div></div>';
    }).join("");
  }

  function officialSlotsHtml(formation) {
    return '<div class="formation-slot-grid">' + formation.slots.map(function (slot) {
      return '<article class="formation-slot-card"><div><b>助阵' + slot.position + '</b><span>' +
        escapeHtml(slot.officialDisciple) + '</span></div><strong>' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
        '</strong></article>';
    }).join("") + '</div>';
  }

  function candidateReferenceHtml(formation) {
    var rows = formation.candidates.map(function (candidate) {
      return '<tr><th scope="row">' + escapeHtml(candidate.name) + '</th><td>' + formatNumber(candidate.level1.attack) +
        '</td><td>' + formatNumber(candidate.level1.health) + '</td><td>' + formatNumber(candidate.level1.defense) + '</td><td>' +
        (candidate.officialPosition ? "助阵" + candidate.officialPosition : '<span class="muted-tip">未推荐初始助阵</span>') + '</td></tr>';
    }).join("");
    var cards = formation.candidates.map(function (candidate) {
      return '<article class="formation-reference-card"><strong>' + escapeHtml(candidate.name) + '</strong><span>攻 ' +
        formatNumber(candidate.level1.attack) + '</span><span>血 ' + formatNumber(candidate.level1.health) + '</span><span>防 ' +
        formatNumber(candidate.level1.defense) + '</span><em>' + (candidate.officialPosition ? "助阵" + candidate.officialPosition : "未推荐初始助阵") + '</em></article>';
    }).join("");
    return '<details class="formation-reference"><summary>候选弟子1级属性（' + formation.candidates.length + '人）</summary>' +
      '<div class="formation-reference-table"><table><thead><tr><th>弟子</th><th>攻</th><th>血</th><th>防</th><th>官方位置</th></tr></thead><tbody>' + rows +
      '</tbody></table></div><div class="formation-reference-cards">' + cards + '</div></details>';
  }

  function officialHtml(formation) {
    return '<section class="panel formation-official"><div class="formation-section-head"><div><span class="panel-title">官方资料</span><h2>' +
      escapeHtml(formation.name) + '</h2></div><div class="formation-official-meta"><span>阵眼石 <b>' + formatNumber(formation.stone) +
      '</b></span><span>推荐主将 <b>' + escapeHtml(formation.officialMain) + '</b></span></div></div>' +
      officialSlotsHtml(formation) + candidateReferenceHtml(formation) + '</section>';
  }

  function memberStatusText(member) {
    var status = CORE.memberStatus(member);
    if (status.errors.length) return '<span class="formation-invalid">' + escapeHtml(status.errors.join("；")) + '</span>';
    if (status.missing.length) return '<span class="formation-incomplete">缺少：' + escapeHtml(status.missing.join("、")) + '</span>';
    return '<span class="formation-complete">数据完整</span>';
  }

  function progressSummaryHtml(formation, progress) {
    var ids = Object.keys(progress.members);
    if (!ids.length) return '<div class="empty formation-empty"><p>尚未保存参与合阵的弟子。</p></div>';
    var cards = formation.candidates.filter(function (candidate) { return progress.members[candidate.id]; }).map(function (candidate) {
      var member = progress.members[candidate.id];
      return '<article class="formation-progress-card' + (progress.mainId === candidate.id ? " is-main" : "") + '"><div><strong>' +
        escapeHtml(candidate.name) + '</strong>' + (progress.mainId === candidate.id ? '<span class="formation-main-badge">主将</span>' : "") +
        '</div><div class="formation-stat-line"><span>等级 ' + escapeHtml(member.level == null ? "未填写" : member.level) + '</span><span>攻 ' +
        escapeHtml(member.attack == null ? "未填写" : formatNumber(member.attack)) + '</span><span>血 ' +
        escapeHtml(member.health == null ? "未填写" : formatNumber(member.health)) + '</span><span>防 ' +
        escapeHtml(member.defense == null ? "未填写" : formatNumber(member.defense)) + '</span></div><div class="formation-progress-foot"><span class="' +
        (member.usesReference ? "formation-reference-badge" : "formation-actual-badge") + '">' +
        (member.usesReference ? "使用1级参考值" : "个人实际数据") + '</span>' + memberStatusText(member) + '</div></article>';
    }).join("");
    return '<div class="formation-progress-list">' + cards + '</div>';
  }

  function mainOptionsHtml(formation, progress) {
    var options = ['<option value="">未指定（由工具推荐）</option>'];
    formation.candidates.forEach(function (candidate) {
      if (!progress.members[candidate.id]) return;
      options.push('<option value="' + escapeHtml(candidate.id) + '"' + (progress.mainId === candidate.id ? " selected" : "") + '>' +
        escapeHtml(candidate.name) + '</option>');
    });
    return options.join("");
  }

  function fieldInput(candidate, member, scope, field, label) {
    var value = member && member[field] != null ? member[field] : "";
    return '<label><span>' + label + '</span><input type="text" inputmode="numeric" autocomplete="off" data-scope="' + scope +
      '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-member-field="' + field + '" value="' + escapeHtml(value) + '"></label>';
  }

  function memberEditorCard(candidate, member, scope) {
    var owned = Boolean(member && member.owned);
    var status = owned ? memberStatusText(member) : '<span class="muted-tip">不参与计算</span>';
    return '<article class="formation-member-editor' + (owned ? " is-owned" : "") + '"><div class="formation-member-head"><label class="formation-owned-toggle">' +
      '<input type="checkbox" data-scope="' + scope + '" data-candidate-id="' + escapeHtml(candidate.id) + '" data-role="owned"' +
      (owned ? " checked" : "") + '><span>' + escapeHtml(candidate.name) + '</span></label><em>' +
      (candidate.officialPosition ? "官方助阵" + candidate.officialPosition : "未推荐初始助阵") + '</em></div>' +
      (owned ? '<div class="formation-member-fields">' + fieldInput(candidate, member, scope, "level", "等级") +
        fieldInput(candidate, member, scope, "attack", "攻") + fieldInput(candidate, member, scope, "health", "血") +
        fieldInput(candidate, member, scope, "defense", "防") + '</div><div class="formation-member-actions"><span class="' +
        (member.usesReference ? "formation-reference-badge" : "formation-actual-badge") + '">' +
        (member.usesReference ? "使用1级参考值" : "个人实际数据") + '</span>' + status +
        '<button type="button" class="link-btn" data-action="restore-reference" data-scope="' + scope + '" data-candidate-id="' +
        escapeHtml(candidate.id) + '">恢复1级参考值</button></div>' : '<div class="formation-member-actions">' + status + '</div>') + '</article>';
  }

  function memberEditorHtml(formation, progress, scope) {
    return '<div class="formation-main-select"><label><span>指定主将</span><select data-role="main" data-scope="' + scope + '">' +
      mainOptionsHtml(formation, progress) + '</select></label><p class="muted-tip">主将不会参与助阵排序和转换计算。</p></div><div class="formation-member-grid">' +
      formation.candidates.map(function (candidate) {
        return memberEditorCard(candidate, progress.members[candidate.id], scope);
      }).join("") + '</div>';
  }

  function personalHtml(formation) {
    var progress = savedProgress(formation);
    var html = '<section class="panel formation-personal"><div class="formation-section-head"><div><span class="panel-title">个人进度</span><h2>' +
      escapeHtml(formation.name) + '</h2></div>' + (state.editing
        ? '<div class="formation-actions"><button type="button" class="seg active" data-action="save-progress">保存</button><button type="button" class="seg" data-action="cancel-progress">取消</button></div>'
        : '<button type="button" class="seg" data-action="edit-progress">编辑</button>') + '</div>';
    if (state.storageError) html += '<div class="error" role="alert">' + escapeHtml(state.storageError) + '</div>';
    if (state.progressError) html += '<div class="error" role="alert">' + escapeHtml(state.progressError) + '</div>';
    if (state.editing && state.draft) html += memberEditorHtml(formation, state.draft, "progress") +
      '<div class="formation-actions formation-actions-bottom"><button type="button" class="seg active" data-action="save-progress">保存</button><button type="button" class="seg" data-action="cancel-progress">取消</button></div>';
    else html += progressSummaryHtml(formation, progress);
    return html + '</section>';
  }

  function rankMaps(formation, rows) {
    var maps = {};
    formation.slots.forEach(function (slot) {
      maps[slot.position] = CORE.rankColumn(rows, slot.position).reduce(function (map, item) {
        map[item.candidateId] = item.rankClass;
        return map;
      }, {});
    });
    return maps;
  }

  function sortedMatrixRows(matrix) {
    if (!state.sortPosition) return matrix.rows.slice();
    return CORE.rankColumn(matrix.rows, state.sortPosition).map(function (item) { return item.row; });
  }

  function matrixHtml(formation, matrix) {
    var ranks = rankMaps(formation, matrix.rows);
    var rows = sortedMatrixRows(matrix).map(function (row) {
      return '<tr><th scope="row">' + escapeHtml(row.name) + '</th>' + formation.slots.map(function (slot) {
        var rankClass = ranks[slot.position][row.candidateId];
        return '<td class="' + (rankClass ? "is-" + rankClass : "") + '"><span>' + formatNumber(row.values[slot.position]) +
          '</span><small>' + escapeHtml(slot.targetAttribute) + '</small></td>';
      }).join("") + '</tr>';
    }).join("");
    return '<div class="formation-desktop-matrix"><table class="formation-matrix"><thead><tr><th>弟子</th>' + formation.slots.map(function (slot) {
      return '<th><button type="button" data-action="sort-position" data-position="' + slot.position + '" aria-pressed="' +
        (state.sortPosition === slot.position) + '">助阵' + slot.position + '<small>' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
        '</small></button></th>';
    }).join("") + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function mobileRankingHtml(formation, matrix) {
    var position = formation.slots.some(function (slot) { return slot.position === state.mobilePosition; })
      ? state.mobilePosition : formation.slots[0].position;
    var slot = formation.slots.find(function (item) { return item.position === position; });
    var ranking = CORE.rankColumn(matrix.rows, position);
    return '<div class="formation-mobile-ranking"><div class="formation-position-tabs segs">' + formation.slots.map(function (item) {
      return '<button type="button" class="seg' + (item.position === position ? " active" : "") + '" data-action="mobile-position" data-position="' +
        item.position + '">助阵' + item.position + '</button>';
    }).join("") + '</div><div class="formation-mobile-rule">' + escapeHtml(percentText(slot.ratePercent) + slot.sourceAttribute + "→" + slot.targetAttribute) +
      '</div><div class="formation-ranking-list">' + (ranking.length ? ranking.map(function (item, index) {
        return '<article class="' + (item.rankClass ? "is-" + item.rankClass : "") + '"><span>' + item.rank + '</span><strong>' +
          escapeHtml(item.name) + '</strong><b>' + formatNumber(item.value) + '</b></article>';
      }).join("") : '<p class="muted-tip">暂无数据完整且可参与的弟子。</p>') + '</div></div>';
  }

  function excludedHtml(matrix) {
    if (!matrix.excluded.length) return "";
    return '<div class="formation-excluded"><b>以下弟子数据不完整，未参与计算：</b>' + matrix.excluded.map(function (item) {
      var details = item.errors.length ? item.errors.join("、") : "缺少" + item.missing.join("、");
      return '<span>' + escapeHtml(item.name + "（" + details + "）") + '</span>';
    }).join("") + '</div>';
  }

  function calculatorHtml(formation) {
    var matrix = CORE.buildMatrix(formation, savedProgress(formation));
    return '<section class="panel formation-calculator"><div class="formation-section-head"><div><span class="panel-title">自由计算</span><h2>位置转换排行榜</h2></div>' +
      '</div>' +
      excludedHtml(matrix) + matrixHtml(formation, matrix) + mobileRankingHtml(formation, matrix) + '</section>';
  }

  function recommendationHtml(formation) {
    var result = state.recommendation;
    var header='<section class="panel formation-recommendation"><h2>主将与助阵方案</h2><div data-personal-settings></div><div data-personal-output aria-live="polite">';
    if(result)return header+root.FORMATION_RECOMMENDATION_UI.resultHtml(formation,result)+tieNavigation(result,'personal')+'</div></section>';
    return header+'<p>读取已保存的个人进度。</p></div></section>';
  }

  function renderWorkspace(preserveEditor) {
    var formation = selectedFormation();
    if (!el.workspace) return;
    el.workspace.hidden = !formation;
    if (!formation) {
      el.workspace.innerHTML = "";
      return;
    }
    var editor=preserveEditor&&state.editing?el.workspace.querySelector('.formation-personal'):null;
    var content=recommendationHtml(formation) + calculatorHtml(formation) + officialHtml(formation);
    if(editor){
      Array.from(el.workspace.children).forEach(function(child){if(child!==editor)child.remove();});
      editor.insertAdjacentHTML('afterend',content);
    }else el.workspace.innerHTML=personalHtml(formation)+content;
    root.FORMATION_RECOMMENDATION_UI.bindSettings(el.workspace.querySelector('[data-personal-settings]'),appliedOptions,formation,function(next){applyOptions(next);generatePersonal();},function(){recommendationRevision+=1;root.FORMATION_RECOMMENDATION_UI.cancel('personal');el.workspace.querySelector('[data-personal-output]').textContent='计算已取消';});
    if(state.view==='reference')el.workspace.hidden=true;
  }

  function generatePersonal(offset){
    var formation=selectedFormation();if(!formation||!progressStore.isCurrent())return;
    if(state.storageStatus==='invalid'||state.storageStatus==='read-error'){state.storageError='存档读取异常，不能生成可靠的个人推荐。';renderWorkspace(true);return;}
    var revision=++recommendationRevision,options=Object.assign({},appliedOptions,{offset:offset||'0',limit:20});
    var output=el.workspace.querySelector('[data-personal-output]');output.textContent='精确计算中…';
    root.FORMATION_RECOMMENDATION_UI.run('personal',formation,savedProgress(formation),options).then(function(result){
      if(revision!==recommendationRevision||formation!==selectedFormation()||!progressStore.isCurrent())return;
      result.offset=options.offset;state.recommendation=result;renderWorkspace(true);
    }).catch(function(error){if(revision===recommendationRevision&&progressStore.isCurrent()){var current=el.workspace.querySelector('[data-personal-output]');if(current)current.textContent=error.message;}});
  }

  function hasUnsavedChanges() {
    return Boolean(state.editing || state.draft);
  }

  function selectFormation(id) {
    if (!formations().some(function (formation) { return formation.id === id; })) return false;
    if (id === state.selectedId) return true;
    if (hasUnsavedChanges() && !root.confirm("当前合阵有未保存的个人进度。切换后将放弃这些内容，是否继续？")) return false;
    recommendationRevision+=1;root.FORMATION_RECOMMENDATION_UI.cancel('personal');
    state.selectedId = id;
    state.editing = false;
    state.draft = null;
    state.progressError = "";
    resetCalculator();
    renderSelector();
    renderWorkspace();
    renderSearchResults();
    return true;
  }

  function progressForScope(scope) {
    return scope === "progress" ? state.draft : null;
  }

  function setOwned(scope, candidateId, owned) {
    var formation = selectedFormation();
    var progress = progressForScope(scope);
    var candidate = formation && candidateById(formation, candidateId);
    if (!formation || !progress || !candidate) return;
    if (owned) progress.members[candidateId] = CORE.referenceMember(candidate);
    else {
      delete progress.members[candidateId];
      if (progress.mainId === candidateId) progress.mainId = null;
    }
    renderWorkspace();
  }

  function restoreReference(scope, candidateId) {
    var formation = selectedFormation();
    var progress = progressForScope(scope);
    var candidate = formation && candidateById(formation, candidateId);
    if (!formation || !progress || !candidate || !progress.members[candidateId]) return;
    progress.members[candidateId] = CORE.referenceMember(candidate);
    renderWorkspace();
  }

  function saveProgress() {
    var formation = selectedFormation();
    if (!formation || !state.draft) return;
    var errors = [];
    Object.keys(state.draft.members).forEach(function (candidateId) {
      var candidate = candidateById(formation, candidateId);
      var status = CORE.memberStatus(state.draft.members[candidateId]);
      status.errors.forEach(function (message) { errors.push((candidate ? candidate.name : candidateId) + "：" + message); });
    });
    if (errors.length) {
      state.progressError = errors.join("；");
      renderWorkspace();
      return;
    }
    var saved=progressStore.save(formation.id,CORE.normalizeProgress(formation,state.draft));
    if (!saved.ok) {
      state.storageError=saved.error;
      renderWorkspace();
      return;
    }
    state.stored=saved.stored;state.storageError='';state.storageStatus='valid';
    recommendationRevision+=1;root.FORMATION_RECOMMENDATION_UI.cancel('personal');
    state.editing = false;
    state.draft = null;
    state.progressError = "";
    resetCalculator();
    renderWorkspace();
  }

  function handleClick(event) {
    var clearButton = event.target.closest("button[data-formation-search-clear]");
    if (clearButton && el.searchResults && el.searchResults.contains(clearButton)) {
      clearSearch();
      return;
    }
    var formationButton = event.target.closest("button[data-formation-id]");
    if (formationButton && (el.selector.contains(formationButton) || (el.searchResults && el.searchResults.contains(formationButton)))) {
      var fromSearch = el.searchResults && el.searchResults.contains(formationButton);
      if (selectFormation(formationButton.dataset.formationId) && fromSearch) {
        el.workspace.setAttribute("tabindex", "-1");
        el.workspace.focus({ preventScroll: true });
        el.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    var button = event.target.closest("button[data-action]");
    if (!button || !el.workspace.contains(button)) return;
    var action = button.dataset.action;
    if (action === "edit-progress") {
      var formation = selectedFormation();
      state.editing = true;
      state.draft = clone(savedProgress(formation));
      state.progressError = "";
      renderWorkspace();
    } else if (action === "cancel-progress") {
      state.editing = false;
      state.draft = null;
      state.progressError = "";
      renderWorkspace();
    } else if (action === "save-progress") {
      saveProgress();
    } else if (action === "restore-reference") {
      restoreReference(button.dataset.scope, button.dataset.candidateId);
    } else if (action === "generate-recommendation") {
      generatePersonal();
    } else if (action === "sort-position") {
      state.sortPosition = Number(button.dataset.position);
      renderWorkspace(true);
    } else if (action === "mobile-position") {
      state.mobilePosition = Number(button.dataset.position);
      renderWorkspace(true);
    }
  }

  function handleChange(event) {
    var target = event.target;
    var scope = target.dataset && target.dataset.scope;
    if (!scope) return;
    var progress = progressForScope(scope);
    if (!progress) return;
    if (target.dataset.role === "owned") {
      setOwned(scope, target.dataset.candidateId, target.checked);
      return;
    }
    if (target.dataset.role === "main") {
      progress.mainId = target.value || null;
      return;
    }
    if (target.dataset.memberField && progress.members[target.dataset.candidateId]) {
      var member = progress.members[target.dataset.candidateId];
      member[target.dataset.memberField] = target.value;
      if (target.dataset.memberField !== "level") member.usesReference = false;
      var card=target.closest('.formation-member-editor');
      if(card){var badge=card.querySelector('.formation-reference-badge');if(badge&&target.dataset.memberField!=='level'){badge.className='formation-actual-badge';badge.textContent='个人实际数据';}}
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    el.selector = document.getElementById("formation-selector");
    el.workspace = document.getElementById("formation-workspace");
    el.search = document.getElementById("formation-search");
    el.searchResults = document.getElementById("formation-search-results");
    el.partition = document.getElementById("partition-formations");
    if (!el.selector || !el.workspace) return;
    if (!DATA || !CORE) {
      el.selector.innerHTML = '<div class="error">合阵数据加载失败。</div>';
      return;
    }
    appliedOptions=root.FORMATION_RECOMMENDATION_UI.defaults();
    loadStored();
    el.selector.addEventListener("click", handleClick);
    el.workspace.addEventListener("click", handleClick);
    el.workspace.addEventListener("change", handleChange);
    if (el.search && el.searchResults) {
      el.search.setAttribute("aria-controls", "formation-search-results");
      el.search.addEventListener("input", renderSearchResults);
      el.search.addEventListener("search", renderSearchResults);
      el.search.addEventListener("keydown", handleSearchKeydown);
      el.searchResults.addEventListener("click", handleClick);
      el.searchResults.addEventListener("keydown", handleSearchKeydown);
      renderSearchResults();
    }
    renderSelector();
    mountMaxReference();
    el.partition.addEventListener("click", function (event) {
      var limitSelect=event.target.closest('[data-limit-select]');
      if(limitSelect){var select=el.partition.querySelector('[data-max-formation]');select.value=limitSelect.dataset.limitSelect;select.dispatchEvent(new Event('change',{bubbles:true}));return;}
      var tie=event.target.closest('[data-tie-offset]');
      if(tie){if(tie.dataset.tieScope==='limit')generateLimit(tie.dataset.tieOffset);else generatePersonal(tie.dataset.tieOffset);return;}
      var tab = event.target.closest("[data-formation-view]");
      if (!tab || !el.partition.contains(tab)) return;
      state.view = tab.dataset.formationView;
      el.partition.querySelectorAll("[data-formation-view]").forEach(function (item) {
        var active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      el.partition.querySelector(".formation-selector-panel").hidden = state.view === "reference";
      el.partition.querySelector("#formation-max-reference").hidden = state.view !== "reference";
      if (state.view === "reference") el.workspace.hidden = true;
      else renderWorkspace(true);
    });
  }

  root.FORMATIONS_UI = { init: init, storeKey: STORE_KEY, maxReferenceRows: maxReferenceRows };
})(typeof window !== "undefined" ? window : globalThis);
