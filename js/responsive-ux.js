(function () {
  'use strict';
  // Presentation only: no progress, account or business data is written here.
  function init() {
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
