(function (root) {
  'use strict';
  var initialized = false, host, panel, results, error, dialog, data, core, storage, timer, searchRefresh;
  var needs, readable = false, draft = null, moduleName = 'forbidden';
  var state = { query: '', attribute: '', selectedOnly: false, full: false };
  var scrolls = { forbidden: 0, 'soul-shop': 0 };
  var KEY = 'qinshi_soul_shop_needs_v1';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fail(message) { error.textContent = message; error.hidden = !message; }
  function load() {
    try { needs = core.parseStored(storage.getItem(KEY)); readable = true; fail(''); }
    catch (e) { needs = core.normalizeNeeds(null); readable = false; fail('魂店需求读取失败：' + e.message); }
  }
  function readOnly() { return !readable || Boolean(storage.isReadOnly && storage.isReadOnly()); }
  function persist(next) {
    if (readOnly()) { fail('当前无法保存魂店需求，请检查账号只读状态及数据。'); return false; }
    try {
      if (storage.setItem(KEY, JSON.stringify(next)) === false) throw new Error('账号为只读状态。');
      needs = next; fail(''); return true;
    } catch (e) { fail('魂店需求未保存：' + e.message); return false; }
  }
  function cleanup() {
    load();
    if (!readable) return;
    var next = core.clearHistory(data, needs, new Date());
    if (JSON.stringify(next) !== JSON.stringify(needs)) {
      if (!persist(next)) needs = next; // Never display expired selections, even in a read-only tab.
    }
  }
  function scheduleCleanup() {
    clearTimeout(timer);
    var now = new Date(), tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(function () { closeEditor(false); cleanup(); if (moduleName === 'soul-shop') render(); scheduleCleanup(); }, tomorrow - now);
  }
  function range(p) { return p.start.replace(/-/g, '.') + '—' + p.end.replace(/-/g, '.'); }
  function targets(name) {
    var existing = new Set((root.ATLAS_DATA && root.ATLAS_DATA.items || []).map(function (d) { return d.name; }));
    return [name, data.divineTargets[name]].filter(function (n) { return n && existing.has(n); });
  }
  function card(p, label) {
    var status = core.status(p, new Date()), historical = status === 'history', disabled = historical || readOnly();
    if (historical) return '';
    var shown = label || (historical ? '历史' : status === 'current' ? '本期' : '后续');
    return '<article class="soul-card panel" data-soul-period="' + esc(p.id) + '"><header><strong>' + esc(range(p)) + '</strong><span>' + (p.predicted ? '预测 · ' : '') + esc(shown) + '</span></header>' +
      '<table><thead><tr><th scope="col"><span class="soul-sr">勾选</span></th><th scope="col">弟子</th><th scope="col">普通弟子图鉴</th><th scope="col">神弟子图鉴</th><th scope="col"><span class="soul-sr">设置</span></th></tr></thead><tbody>' +
      core.matchingDisciples(p, state, needs).map(function (d) {
        var checked = !historical && core.selected(needs, p.id, d.name), links = targets(d.name);
        return '<tr><td><input type="checkbox" data-soul-select="' + esc(d.name) + '" aria-label="勾选' + esc(d.name) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '></td><th scope="row">' +
          (links.length ? '<button type="button" class="soul-name" data-soul-name="' + esc(d.name) + '">' + esc(d.name) + '</button>' : esc(d.name)) +
          '</th><td class="soul-atlas-cell" data-label="普通弟子图鉴">' + atlasText(d, false) + '</td><td class="soul-atlas-cell" data-label="神弟子图鉴">' + atlasText(d, true) + '</td><td><button type="button" class="seg" data-soul-settings="' + esc(d.name) + '" aria-label="设置' + esc(d.name) + '勾选"' + (disabled ? ' disabled' : '') + '>设置</button></td></tr>';
      }).join('') + '</tbody></table></article>';
  }
  function atlasText(d, divine) {
    var attribute = divine ? d.divine : d.base;
    if (!attribute) return '—';
    var name = divine ? data.divineTargets[d.name] : d.name;
    var item = (root.ATLAS_DATA && root.ATLAS_DATA.items || []).find(function (item) { return item.name === name; });
    return esc(attribute === '内' ? '内力' : attribute) + '（<strong>' + esc(item && item.group || '—') + '</strong>）';
  }
  function filtered() { return state.query.trim() || state.attribute || state.selectedOnly; }
  function render() {
    searchRefresh.cancel();
    var focused = root.document.activeElement, focusedPeriod = focused && focused.closest('[data-soul-period]');
    var focusKey = focused && ['soulSelect', 'soulSettings', 'soulName'].find(function (key) { return focused.dataset && focused.dataset[key]; });
    var focusId = focusedPeriod && focusedPeriod.dataset.soulPeriod, focusName = focusKey && focused.dataset[focusKey];
    var today = new Date(), all = state.full || filtered(), html = '';
    panel.querySelector('[data-soul-full]').textContent = state.full ? '收起完整排期' : '完整排期';
    panel.querySelector('[data-soul-full]').setAttribute('aria-pressed', String(state.full));
    if (all) {
      var list = data.occurrences.filter(function (p) { return core.status(p, today) !== 'history' && core.matches(p, state, needs); });
      html = '<div class="soul-cards">' + list.map(function (p) { return card(p); }).join('') + '</div>';
      if (!list.length) html = '<p role="status">未找到匹配期次。</p>';
    } else {
      var view = core.view(data, today);
      html = '<div class="soul-cards">' + (view.current ? card(view.current, '本期') : '') + (view.next ? card(view.next, '下一期') : '') + '</div>';
      if (view.afterSchedule) html += '<p role="status">暂无后续预测排期。</p>';
    }
    results.innerHTML = html;
    if (focusId && focusKey) {
      var replacement = Array.from(results.querySelectorAll('[data-soul-period]')).find(function (n) { return n.dataset.soulPeriod === focusId; });
      replacement = replacement && Array.from(replacement.querySelectorAll('button,input')).find(function (n) { return n.dataset[focusKey] === focusName; });
      (replacement || panel.querySelector('[data-soul-query]')).focus({ preventScroll: true });
    }
  }
  function fillControls() {
    panel.querySelector('[data-soul-query]').value = state.query;
    panel.querySelector('[data-soul-attribute]').value = state.attribute;
    panel.querySelector('[data-soul-selected]').checked = state.selectedOnly;
  }
  function closeEditor(focus) {
    if (!dialog.open) return;
    dialog.close();
    if (focus && draft) {
      var parent = Array.from(results.querySelectorAll('[data-soul-period]')).find(function (n) { return n.dataset.soulPeriod === draft.id; });
      var button = parent && Array.from(parent.querySelectorAll('[data-soul-settings]')).find(function (n) { return n.dataset.soulSettings === draft.name; });
      if (button) button.focus({ preventScroll: true });
      else panel.querySelector('[data-soul-query]').focus({ preventScroll: true });
    }
    draft = null;
  }
  function show(name, scroll) {
    searchRefresh.cancel();
    if (name !== 'soul-shop') name = 'forbidden';
    if (name !== moduleName) { scrolls[moduleName] = root.scrollY; closeEditor(false); }
    moduleName = name;
    if (name === 'soul-shop' && root.FORBIDDEN_UI && root.FORBIDDEN_UI.closePurposeEditor) root.FORBIDDEN_UI.closePurposeEditor();
    host.querySelector('#forbidden-main-panel').hidden = name !== 'forbidden';
    panel.hidden = name !== 'soul-shop';
    host.querySelectorAll('[data-forbidden-module]').forEach(function (b) { var active = b.dataset.forbiddenModule === name; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    if (name === 'soul-shop') { load(); cleanup(); render(); }
    if (scroll) root.scrollTo({ top: scrolls[name], behavior: 'auto' });
  }
  function init() {
    if (initialized) return;
    host = root.document.getElementById('partition-forbidden');
    panel = root.document.getElementById('soul-shop-panel');
    if (!host || !panel) return;
    if (!host.querySelector('#forbidden-main-panel')) throw new Error('禁地页面结构与脚本版本不一致，请重新加载页面。');
    if (!root.SOUL_SHOP || !root.SOUL_SHOP_DATA || !root.QinshiAccounts || !root.FORBIDDEN) throw new Error('魂店资源未完整加载，请重新加载页面或修复更新。');
    data = root.SOUL_SHOP_DATA; core = root.SOUL_SHOP; storage = root.QinshiAccounts;
    searchRefresh = root.UI_PERFORMANCE.createRefreshQueue(render);
    panel.innerHTML = '<section class="panel soul-toolbar"><label>搜索<input type="search" data-soul-query placeholder="搜索排期日期、弟子名或属性，如：8.27 / 神血 / 普通攻" autocomplete="off"></label><label>属性<select data-soul-attribute><option value="">全部属性</option><option>攻</option><option>防</option><option>血</option><option value="内">内力</option></select></label><label class="soul-check"><input type="checkbox" data-soul-selected>只看已勾选</label><button type="button" class="seg" data-soul-clear>清除筛选</button><button type="button" class="seg" data-soul-full aria-pressed="false">完整排期</button></section><div class="error" data-soul-error role="alert" hidden></div><div data-soul-results></div>';
    results = panel.querySelector('[data-soul-results]'); error = panel.querySelector('[data-soul-error]');
    dialog = root.document.createElement('dialog'); dialog.className = 'soul-editor'; dialog.setAttribute('aria-labelledby', 'soul-editor-title');
    dialog.innerHTML = '<form><h2 id="soul-editor-title"></h2><label><input type="checkbox" data-soul-edit-selected>勾选本期</label><label><input type="checkbox" data-soul-edit-future>同步之后各期</label><div class="soul-editor-actions"><button type="button" class="seg" data-soul-close>取消</button><button type="submit" class="seg">保存</button></div><p role="alert" data-soul-edit-error hidden></p></form>';
    root.document.body.appendChild(dialog);
    root.UI_PERFORMANCE.bindInput(panel.querySelector('[data-soul-query]'), function (e) { state.query = e.target.value; }, searchRefresh);
    panel.addEventListener('change', function (e) {
      if (e.target.hasAttribute('data-soul-attribute')) state.attribute = e.target.value;
      if (e.target.hasAttribute('data-soul-selected')) state.selectedOnly = e.target.checked;
      if (e.target.hasAttribute('data-soul-select')) {
        var p = e.target.closest('[data-soul-period]');
        // Re-read before a write so another tab or restored snapshot cannot be overwritten by stale state.
        load();
        if (readable) persist(core.changeSelection(data, needs, p.dataset.soulPeriod, e.target.dataset.soulSelect, e.target.checked, false, new Date()));
      }
      render();
    });
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-soul-clear')) { state.query = ''; state.attribute = ''; state.selectedOnly = false; fillControls(); render(); }
      if (b.hasAttribute('data-soul-full')) { state.full = !state.full; render(); }
      if (b.dataset.soulName) root.document.dispatchEvent(new CustomEvent('qinshi:forbidden-navigate', { detail: { kind: 'disciple', name: b.dataset.soulName, label: b.dataset.soulName, targets: targets(b.dataset.soulName), trigger: b } }));
      if (b.dataset.soulSettings) {
        load(); cleanup();
        var id = b.closest('[data-soul-period]').dataset.soulPeriod;
        if (readOnly() || core.status(data.occurrences.find(function (p) { return p.id === id; }), new Date()) === 'history') { render(); return; }
        draft = { id: id, name: b.dataset.soulSettings };
        dialog.querySelector('h2').textContent = draft.name;
        dialog.querySelector('[data-soul-edit-selected]').checked = core.selected(needs, id, draft.name);
        dialog.querySelector('[data-soul-edit-future]').checked = false;
        dialog.querySelector('[data-soul-edit-error]').hidden = true; dialog.showModal();
      }
    });
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); closeEditor(true); });
    dialog.querySelector('[data-soul-close]').addEventListener('click', function () { closeEditor(true); });
    dialog.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); if (!draft) return;
      load(); var p = data.occurrences.find(function (p) { return p.id === draft.id; });
      if (core.status(p, new Date()) === 'history') { closeEditor(false); cleanup(); render(); return; }
      var next = readable && core.changeSelection(data, needs, draft.id, draft.name, dialog.querySelector('[data-soul-edit-selected]').checked, dialog.querySelector('[data-soul-edit-future]').checked, new Date());
      if (next && persist(next)) { render(); closeEditor(true); }
      else { var message = dialog.querySelector('[data-soul-edit-error]'); message.textContent = '未保存，请检查账号只读状态及存储数据。'; message.hidden = false; }
    });
    root.document.addEventListener('qinshi:partitionchange', function (e) { searchRefresh.cancel(); closeEditor(false); if (e.detail && e.detail.name === 'forbidden' && moduleName === 'soul-shop') { load(); cleanup(); render(); } });
    function refresh() { if (root.document.hidden) return; load(); cleanup(); if (moduleName === 'soul-shop') render(); scheduleCleanup(); }
    var lastWritable = false;
    try { lastWritable = !(storage.isReadOnly && storage.isReadOnly()); }
    catch (e) { fail('账号状态读取失败：' + e.message); }
    if (storage.subscribeAccess) storage.subscribeAccess(function (access) {
      var account = storage.currentAccount();
      if (!account || account.id !== access.accountId || access.writable === lastWritable) return;
      lastWritable = access.writable;
      closeEditor(false); cleanup(); if (moduleName === 'soul-shop') render();
    });
    root.document.addEventListener('visibilitychange', refresh); root.addEventListener('pageshow', refresh);
    initialized = true;
    load(); cleanup(); scheduleCleanup();
  }
  root.SOUL_SHOP_UI = {
    init: init, show: show,
    active: function () { return moduleName === 'soul-shop'; },
    captureView: function () { return { soulShop: Object.assign({}, state), scrollY: root.scrollY }; },
    restoreView: function (view, done) { Object.assign(state, view.soulShop); show('soul-shop', false); fillControls(); render(); root.requestAnimationFrame(function () { root.scrollTo(0, Number(view.scrollY) || 0); if (done) done(); }); }
  };
  function reportStartupError(e) {
    var message = root.document.getElementById('soul-shop-start-error');
    if (!message) { message = root.document.createElement('div'); message.id = 'soul-shop-start-error'; message.className = 'error'; message.setAttribute('role', 'alert'); var parent = root.document.getElementById('partition-forbidden'); if (parent) parent.prepend(message); }
    message.textContent = '魂店启动失败：' + e.message;
  }
  function start() { try { init(); return initialized; } catch (e) { reportStartupError(e); return false; } }
  // Register independently of app.js, whose unrelated initialization can abort before soul-shop setup.
  root.document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-forbidden-module]'); if (!b) return;
    if (!start()) return;
    try {
      show(b.dataset.forbiddenModule, true);
      var message = root.document.getElementById('soul-shop-start-error'); if (message) message.remove();
    } catch (error) { reportStartupError(error); }
  });
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
