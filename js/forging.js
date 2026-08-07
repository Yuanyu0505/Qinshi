/**
 * 橙装锻造 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.FORGING；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FORGING = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeName(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /** 拆分材料字符串（如 "10紫石2橙石"）为每类一行；无法识别时原样返回 */
  function splitMaterials(s) {
    var text = String(s == null ? "" : s).trim();
    if (!text) return [];
    var parts = text.match(/\d+(?:\.\d+)?(?:紫石|橙石|红石)/g);
    return parts ? parts : [text];
  }

  /** 作为主锻造装备：按名称（含分类无关）模糊匹配主行 */
  function findMain(items, query) {
    var q = normalizeName(query);
    if (!q) return [];
    return items.filter(function (item) {
      return item.name.toLowerCase().indexOf(q) !== -1;
    });
  }

  /** 作为素材装备：返回参与的主装备及命中阶段索引 */
  function findAsMaterial(items, query) {
    var q = normalizeName(query);
    if (!q) return [];
    var out = [];
    items.forEach(function (item) {
      var hits = [];
      item.stages.forEach(function (st, si) {
        st.tokens.forEach(function (tk) {
          if (tk.n && tk.n.toLowerCase().indexOf(q) !== -1) {
            hits.push(si);
          }
        });
      });
      if (hits.length) out.push({ item: item, hitStages: hits });
    });
    return out;
  }

  return {
    normalizeName: normalizeName,
    splitMaterials: splitMaterials,
    findMain: findMain,
    findAsMaterial: findAsMaterial
  };
});
