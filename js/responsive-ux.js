(function () {
  'use strict';
  // Presentation only: no progress, account or business data is written here.
  function init() {
    var tabs = Array.from(document.querySelectorAll('.tabs .tab[data-partition]'));
    var jump = document.createElement('label');
    jump.className = 'responsive-partition-jump';
    jump.append(document.createTextNode('快速切换分区'));
    var select = document.createElement('select');
    select.setAttribute('aria-label', '快速切换分区');
    tabs.forEach(function (tab) { select.add(new Option(tab.textContent.trim(), tab.dataset.partition)); });
    select.addEventListener('change', function () {
      var tab = tabs.find(function (item) { return item.dataset.partition === select.value; });
      if (tab) tab.click();
    });
    function updateJump() {
      var active = tabs.find(function (tab) { return tab.classList.contains('active'); });
      if (active) select.value = active.dataset.partition;
    }
    jump.append(select);
    document.querySelector('header.top').append(jump);
    updateJump();
    document.addEventListener('qinshi:partitionchange', updateJump);

    document.querySelectorAll('#partition-atlas > .panel, #partition-equipment > .panel:not(.equipment-compare-panel)').forEach(function (panel, index) {
      var body = document.createElement('div');
      body.id = 'responsive-filter-body-' + index;
      body.className = 'responsive-filter-body';
      while (panel.firstChild) body.append(panel.firstChild);
      var toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'seg responsive-filter-toggle';
      toggle.setAttribute('aria-controls', body.id);
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = '收起筛选，查看更多结果';
      toggle.addEventListener('click', function () {
        var collapsed = panel.classList.toggle('responsive-filters-collapsed');
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.textContent = collapsed ? '展开筛选（条件已保留）' : '收起筛选，查看更多结果';
      });
      panel.prepend(toggle, body);
    });

    var top = document.createElement('button');
    top.type = 'button'; top.className = 'seg responsive-back-top';
    top.textContent = '返回顶部'; top.hidden = true;
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'instant' });
      var heading = document.querySelector('h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    });
    document.body.append(top);
    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return; queued = true;
      requestAnimationFrame(function () { queued = false; top.hidden = window.scrollY < 600; });
    }, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
