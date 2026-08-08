/**
 * 橙装锻造 · 个人进度核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.PROGRESS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PROGRESS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function findItem(data, name) {
    var items = data && data.items;
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].name === name) return items[i];
    }
    return null;
  }

  /** progress = 已完成阶段数（0..stages.length）；返回剩余阶段（含下一阶段） */
  function remainingStages(item, progress) {
    if (!item || !item.stages) return [];
    var p = Math.max(0, Math.min(progress | 0, item.stages.length));
    return item.stages.slice(p);
  }

  function nextStage(item, progress) {
    var rem = remainingStages(item, progress);
    return rem.length ? rem[0] : null;
  }

  /** 汇总一组阶段的所有材料（横杠除外），按数量倒序、名称升序 */
  function aggregateMaterials(stageList) {
    var map = {};
    (stageList || []).forEach(function (st) {
      (st.tokens || []).forEach(function (tk) {
        if (!tk.n) return;
        if (!map[tk.n]) map[tk.n] = { n: tk.n, q: tk.q || "橙", count: 0 };
        map[tk.n].count += 1;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.count - a.count || a.n.localeCompare(b.n); });
  }

  function discipleSummary(data, disciple) {
    var stages = [];
    (disciple.items || []).forEach(function (it) {
      stages = stages.concat(remainingStages(findItem(data, it.name), it.progress));
    });
    return { id: disciple.id, name: disciple.name, materials: aggregateMaterials(stages) };
  }

  function overallSummary(data, disciples) {
    var stages = [];
    (disciples || []).forEach(function (d) {
      stages = stages.concat(discipleSummary(data, d).materials.map(function (m) {
        var arr = [];
        for (var i = 0; i < m.count; i++) arr.push({ stage: "", tokens: [{ n: m.n, q: m.q }] });
        return arr;
      }));
    });
    var flat = [];
    stages.forEach(function (a) { flat = flat.concat(a); });
    return aggregateMaterials(flat);
  }

  return {
    findItem: findItem,
    remainingStages: remainingStages,
    nextStage: nextStage,
    aggregateMaterials: aggregateMaterials,
    discipleSummary: discipleSummary,
    overallSummary: overallSummary
  };
});
