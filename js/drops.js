/**
 * 关卡掉落 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.DROPS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DROPS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /** 按关键字统计三个区域（普通/英雄/声望）的掉落方式，保持原表顺序 */
  function findDrops(data, query) {
    var q = normalize(query);
    var out = { normal: [], hero: [], reward: [] };
    if (!q) return out;
    ["normal", "hero"].forEach(function (key) {
      data[key].forEach(function (e) {
        if (e.item.toLowerCase().indexOf(q) !== -1) out[key].push(e);
      });
    });
    data.reward.forEach(function (e) {
      if (e.item.toLowerCase().indexOf(q) !== -1) out.reward.push(e);
    });
    return out;
  }

  return {
    normalize: normalize,
    findDrops: findDrops
  };
});
