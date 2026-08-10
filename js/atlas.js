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

  /** 需要装备的阶段：当前等级以下、目标等级以内的阶段才需要 */
  function neededStages(item, level, targetLevel) {
    var target = targetLevel == null ? Infinity : Number(targetLevel);
    return item.stages.filter(function (st) {
      return level < st.end && st.end <= target;
    });
  }

  function upgradePlan(item, currentLevel, targetLevel, upgradeStages) {
    var current = Math.max(0, Number(currentLevel) || 0);
    var target = Math.max(1, Number(targetLevel) || 1);
    var reached = current >= target;
    var costs = (upgradeStages || []).filter(function (stage) {
      return current < stage.to && stage.to <= target;
    });
    var equipmentEnds = {};
    costs.forEach(function (stage) {
      if (stage.needsEquipment) equipmentEnds[stage.to] = true;
    });
    var equipmentStages = neededStages(item, current, target).filter(function (stage) {
      return equipmentEnds[stage.end] && stage.items && stage.items.length;
    });
    return {
      currentLevel: current,
      targetLevel: target,
      reached: reached,
      knots: costs.reduce(function (sum, stage) { return sum + (Number(stage.knots) || 0); }, 0),
      souls: costs.reduce(function (sum, stage) { return sum + (Number(stage.souls) || 0); }, 0),
      growth: costs.reduce(function (sum, stage) {
        return sum + (stage.to <= 14 ? (Number(stage.growth) || 0) : 0);
      }, 0),
      equipmentStages: equipmentStages
    };
  }

  function summarizeUpgrade(items, levels, targetLevel, upgradeStages) {
    var summary = {
      targetLevel: Number(targetLevel) || 1,
      total: 0,
      pending: 0,
      knots: 0,
      souls: 0,
      growth: 0,
      equipment: []
    };
    var equipmentMap = {};
    (items || []).forEach(function (item) {
      summary.total += 1;
      var plan = upgradePlan(item, levelOf(item, levels), targetLevel, upgradeStages);
      if (plan.reached) return;
      summary.pending += 1;
      summary.knots += plan.knots;
      summary.souls += plan.souls;
      summary.growth += plan.growth;
      plan.equipmentStages.forEach(function (stage) {
        (stage.items || []).forEach(function (token) {
          var key = (token.n || "") + "\u0000" + (token.q || "橙");
          if (!equipmentMap[key]) equipmentMap[key] = { n: token.n, q: token.q || "橙", count: 0 };
          equipmentMap[key].count += 1;
        });
      });
    });
    summary.equipment = Object.keys(equipmentMap).map(function (key) { return equipmentMap[key]; })
      .sort(function (a, b) {
        var qualityOrder = (a.q === "紫" ? 0 : 1) - (b.q === "紫" ? 0 : 1);
        return qualityOrder || a.n.localeCompare(b.n, "zh-Hans-CN");
      });
    return summary;
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
    upgradePlan: upgradePlan,
    summarizeUpgrade: summarizeUpgrade,
    searchAtlas: searchAtlas
  };
});
