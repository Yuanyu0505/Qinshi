/**
 * 图鉴 · 查询核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.ATLAS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ATLAS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  /** 解析等级查询："N级以下" lt、"N级以上" ge、"N级" eq；否则 null */
  function parseLevelQuery(q) {
    var text = normalize(q);
    var m = text.match(/^(\d+)级以下$/);
    if (m) return { op: "lt", n: Number(m[1]) };
    m = text.match(/^(\d+)级以上$/);
    if (m) return { op: "ge", n: Number(m[1]) };
    m = text.match(/^(\d+)级$/);
    if (m) return { op: "eq", n: Number(m[1]) };
    return null;
  }

  /** 当前图鉴等级：个人进度覆盖优先，其次表内初始值 */
  function levelOf(item, levels) {
    var v = levels && levels[item.id];
    return typeof v === "number" ? v : item.level;
  }

  /** 需要装备的阶段：阶段结束等级 > 当前等级才需要 */
  function neededStages(item, level) {
    return item.stages.filter(function (st) {
      return level < st.end;
    });
  }

  /** 关键词搜索：名称/获取途径/所属图鉴/道具/等级条件 */
  function searchAtlas(items, query, levels) {
    var q = normalize(query);
    if (!q) return items.slice();
    var lvl = parseLevelQuery(q);
    return items.filter(function (item) {
      var L = levelOf(item, levels);
      if (lvl) {
        if (lvl.op === "lt") return L < lvl.n;
        if (lvl.op === "ge") return L >= lvl.n;
        return L === lvl.n;
      }
      if (item.name.toLowerCase().indexOf(q) !== -1) return true;
      if (item.acquire.toLowerCase().indexOf(q) !== -1) return true;
      if (item.group.toLowerCase().indexOf(q) !== -1) return true;
      return item.stages.some(function (st) {
        return st.items.some(function (n) {
          return n.n.toLowerCase().indexOf(q) !== -1;
        });
      });
    });
  }

  return {
    normalize: normalize,
    parseLevelQuery: parseLevelQuery,
    levelOf: levelOf,
    neededStages: neededStages,
    searchAtlas: searchAtlas
  };
});
