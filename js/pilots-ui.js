(function (root, factory) {
  var core = typeof module === 'object' && module.exports ? require('./pilots.js') : root.PILOTS_CORE;
  var ui = factory(root, core);
  if (typeof module === 'object' && module.exports) module.exports = ui;
  if (root) root.PILOTS_UI = ui;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global, core) {
  'use strict';
  function escape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function categoryName(data, id) {
    var category = data.categories.find(function (item) { return item.id === id; });
    return category ? category.name : id;
  }
  function renderResults(data, filters) {
    filters = filters || {};
    var selected = core.filterDisciples(data, filters);
    if (!selected.length) return '<p class="pilots-empty">没有符合条件的资料，请调整分类、阶数或搜索关键词。</p>';
    return selected.map(function (disciple) {
      var badges = disciple.pilotCategories.length ? disciple.pilotCategories.map(function (id) {
        return '<span class="pilots-badge pilots-badge-' + escape(id) + '">' + escape(categoryName(data, id)) + '</span>';
      }).join('') : '<span class="pilots-badge pilots-badge-nonpilot">非机师</span>';
      return '<article class="pilots-card" data-pilot-id="' + escape(disciple.id) + '">' +
        '<header><h3>' + escape(disciple.name) + '</h3><div class="pilots-badges">' + badges + '</div></header>' +
        (disciple.notes.length ? '<div class="pilots-notes">' + disciple.notes.map(function (note) { return '<p>' + escape(note) + '</p>'; }).join('') + '</div>' : '') +
        '<ul class="pilots-effects">' + core.visibleEffects(disciple, filters).map(function (effect) {
          var title = effect.kind === 'breakthrough' ? effect.rank + '阶突破' : categoryName(data, effect.category);
          return '<li><h4 class="pilots-effect-title">' + escape(title) + '</h4>' +
            escape(effect.text).split(/(?=技能进化[：:]|猎人时装[：:]|时装(?:圣言|蛇姬|狼王)[：:])/).filter(Boolean).map(function (paragraph) {
              return '<p>' + paragraph + '</p>';
            }).join('') +
            (effect.note ? '<p class="pilots-warning">' + escape(effect.note) + '</p>' : '') + '</li>';
        }).join('') + '</ul></article>';
    }).join('');
  }
  function button(attribute, value, label, active) {
    return '<button type="button" class="seg' + (active ? ' active' : '') + '" ' + attribute + '="' + escape(value) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + escape(label) + '</button>';
  }
  function init(root) {
    root = root || global.document && global.document.getElementById('partition-pilots');
    if (!root || root.dataset.pilotsInitialized === 'true') return;
    var data = global.PILOTS_DATA;
    if (!data || !core) {
      root.innerHTML = '<p class="pilots-empty">机师资料暂未加载，请刷新重试。</p>';
      return;
    }
    root.dataset.pilotsInitialized = 'true';
    var state = { type: 'all', category: '', rank: '', query: '' };
    root.innerHTML = '<div class="pilots-workbench">' +
      '<div class="pilots-heading"><h2>机师与突破资料</h2>' +
      '<p>按弟子身份归类。任一机师身份的弟子，其全部突破资料均归入机师；机师类别可重叠。</p></div>' +
      '<div class="pilots-toolbar"><div class="pilots-filter-row" role="group" aria-label="弟子分类">' +
      button('data-pilots-type', 'all', '全部', true) + button('data-pilots-type', 'nonPilot', '非机师', false) + button('data-pilots-type', 'pilot', '机师', false) + '</div>' +
      '<div class="pilots-filter-row" data-pilots-categories role="group" aria-label="机师类别" hidden>' +
      button('data-pilots-category', '', '全部类别', true) + data.categories.map(function (category) {
        return button('data-pilots-category', category.id, category.name, false);
      }).join('') + '</div>' +
      '<div class="pilots-filter-row" data-pilots-ranks role="group" aria-label="非机师突破阶数" hidden>' +
      button('data-pilots-rank', '', '全部阶数', true) + [15, 20, 25].map(function (rank) { return button('data-pilots-rank', rank, rank + '阶', false); }).join('') + '</div>' +
      '<div class="pilots-search-field"><label class="pilots-search-label" for="pilots-search">搜索名字、条件或效果</label>' +
      '<input id="pilots-search" class="pilots-search" type="search" placeholder="如：端木蓉、护盾、夜之信条" autocomplete="off"></div>' +
      '<div class="pilots-category-notes" data-pilots-category-notes role="note" aria-label="机师类别生效说明" hidden>' +
      data.categories.map(function (category) {
        return '<p data-pilots-category-note="' + escape(category.id) + '"><strong>' + escape(category.name) + '：</strong>' + escape(category.condition) + '</p>';
      }).join('') + '</div></div>' +
      '<p class="pilots-result-count" role="status" aria-live="polite" aria-atomic="true"></p><div class="pilots-grid"></div>' +
      '<section class="pilots-reference"><h3>机师时装图名称</h3><div class="pilots-costumes">' +
      data.costumes.map(function (costume) { return '<span class="pilots-badge">' + escape(costume.name) + '</span>'; }).join('') + '</div></section></div>';
    var search = root.querySelector('#pilots-search');
    var results = root.querySelector('.pilots-grid');
    var count = root.querySelector('.pilots-result-count');
    function refresh() {
      var showResults = state.type !== 'all' || String(state.query).trim().length > 0;
      var selected = showResults ? core.filterDisciples(data, state) : [];
      var effectCount = selected.reduce(function (total, disciple) { return total + core.visibleEffects(disciple, state).length; }, 0);
      count.hidden = !showResults;
      results.hidden = !showResults;
      count.textContent = showResults ? selected.length + ' 位弟子 · ' + effectCount + ' 条资料' : '';
      results.innerHTML = showResults ? renderResults(data, state) : '';
      root.querySelector('[data-pilots-categories]').hidden = state.type !== 'pilot';
      root.querySelector('[data-pilots-category-notes]').hidden = state.type !== 'pilot';
      root.querySelector('[data-pilots-ranks]').hidden = state.type !== 'nonPilot';
      [['data-pilots-type', 'type'], ['data-pilots-category', 'category'], ['data-pilots-rank', 'rank']].forEach(function (pair) {
        root.querySelectorAll('[' + pair[0] + ']').forEach(function (element) {
          var active = element.getAttribute(pair[0]) === String(state[pair[1]]);
          element.setAttribute('aria-pressed', String(active));
          element.classList.toggle('active', active);
        });
      });
    }
    root.addEventListener('click', function (event) {
      var target = event.target.closest('button');
      if (!target || !root.contains(target)) return;
      if (target.hasAttribute('data-pilots-type')) {
        state.type = target.getAttribute('data-pilots-type');
        if (state.type !== 'pilot') state.category = '';
        if (state.type !== 'nonPilot') state.rank = '';
      }
      else if (target.hasAttribute('data-pilots-category')) state.category = target.getAttribute('data-pilots-category');
      else if (target.hasAttribute('data-pilots-rank')) state.rank = target.getAttribute('data-pilots-rank');
      else return;
      refresh();
    });
    var composing = false;
    search.addEventListener('compositionstart', function () { composing = true; });
    search.addEventListener('compositionend', function () { composing = false; state.query = search.value; refresh(); });
    search.addEventListener('input', function () { if (!composing) { state.query = search.value; refresh(); } });
    refresh();
  }
  return { init: init, renderResults: renderResults };
});
