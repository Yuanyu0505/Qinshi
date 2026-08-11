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

  var CAT_ORDER = ["武器", "盔甲", "首饰", "典籍"];

  function normalizeSearch(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

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

  function compareMaterialTokens(a, b) {
    var aMissing = !a || !a.n;
    var bMissing = !b || !b.n;
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : (aMissing ? 1 : -1);
    var qualityOrder = (a.q === "紫" ? 0 : 1) - (b.q === "紫" ? 0 : 1);
    return qualityOrder || a.n.localeCompare(b.n, "zh-Hans-CN");
  }

  function sortMaterialTokens(tokens) {
    return (Array.isArray(tokens) ? tokens : []).slice().sort(compareMaterialTokens);
  }

  /** 汇总一组阶段的所有材料（横杠除外），紫色优先，同品质按名称拼音升序 */
  function aggregateMaterials(stageList) {
    var map = {};
    (stageList || []).forEach(function (st) {
      (st.tokens || []).forEach(function (tk) {
        if (!tk.n) return;
        if (!map[tk.n]) map[tk.n] = { n: tk.n, q: tk.q || "橙", count: 0 };
        map[tk.n].count += 1;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(compareMaterialTokens);
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

  function orderedProgressItems(items) {
    return (Array.isArray(items) ? items : []).map(function (item, index) {
      return { item: item, index: index };
    }).sort(function (a, b) {
      var ai = CAT_ORDER.indexOf(a.item && a.item.cat);
      var bi = CAT_ORDER.indexOf(b.item && b.item.cat);
      if (ai === -1) ai = CAT_ORDER.length;
      if (bi === -1) bi = CAT_ORDER.length;
      return ai - bi || a.index - b.index;
    }).map(function (entry) {
      return entry.item;
    });
  }

  /**
   * 跨全部弟子搜索个人进度中的装备关系。
   * owned：弟子直接持有的装备；required：未完成阶段中的材料需求。
   */
  function searchEquipment(data, disciples, keyword) {
    var q = normalizeSearch(keyword);
    var result = { owned: [], required: [] };
    if (!q) return result;

    (Array.isArray(disciples) ? disciples : []).forEach(function (disciple) {
      if (!disciple || typeof disciple !== "object") return;
      orderedProgressItems(disciple.items).forEach(function (progressItem) {
        if (!progressItem || typeof progressItem !== "object") return;
        var savedName = String(progressItem.name == null ? "" : progressItem.name);
        if (!savedName) return;

        var item = findItem(data, savedName);
        if (normalizeSearch(savedName).indexOf(q) !== -1) {
          result.owned.push({
            disciple: disciple,
            progressItem: progressItem,
            item: item
          });
        }

        if (!item || !Array.isArray(item.stages)) return;
        var progress = Math.max(0, Math.min(progressItem.progress | 0, item.stages.length));
        var hits = [];
        for (var si = progress; si < item.stages.length; si++) {
          var stage = item.stages[si] || {};
          var tokenHits = [];
          (Array.isArray(stage.tokens) ? stage.tokens : []).forEach(function (token, tokenIdx) {
            if (token && token.n && normalizeSearch(token.n).indexOf(q) !== -1) {
              tokenHits.push({ tokenIdx: tokenIdx, token: token });
            }
          });
          if (tokenHits.length) {
            hits.push({
              stageIdx: si,
              stage: stage.stage || "",
              tokens: tokenHits
            });
          }
        }
        if (hits.length) {
          result.required.push({
            disciple: disciple,
            progressItem: progressItem,
            item: item,
            hits: hits
          });
        }
      });
    });

    return result;
  }

  return {
    findItem: findItem,
    remainingStages: remainingStages,
    nextStage: nextStage,
    sortMaterialTokens: sortMaterialTokens,
    aggregateMaterials: aggregateMaterials,
    discipleSummary: discipleSummary,
    overallSummary: overallSummary,
    searchEquipment: searchEquipment
  };
});
