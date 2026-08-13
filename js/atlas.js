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

  function equipmentQualityRank(item) {
    return item && item.q === "紫" ? 0 : 1;
  }

  function sortEquipment(items) {
    return (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
      return equipmentQualityRank(a) - equipmentQualityRank(b) ||
        normalize(a && a.n).localeCompare(normalize(b && b.n), "zh-Hans-CN");
    });
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
    summary.equipment = sortEquipment(Object.keys(equipmentMap).map(function (key) { return equipmentMap[key]; }));
    return summary;
  }

  function matchesLevelQuery(level, query) {
    var parsed = parseLevelQuery(query);
    if (parsed) {
      if (parsed.op === "lt") return level < parsed.n;
      if (parsed.op === "ge") return level >= parsed.n;
      return level === parsed.n;
    }
    var text = normalize(query).replace(/级$/, "");
    return /^\d+$/.test(text) && level === Number(text);
  }

  function equipmentContains(item, query, currentLevel, targetLevel) {
    return neededStages(item, currentLevel, targetLevel).some(function (stage) {
      return (stage.items || []).some(function (token) {
        return normalize(token && token.n).indexOf(query) !== -1;
      });
    });
  }

  /** 关键词搜索：可限定名称/获取途径/所属图鉴/装备/等级 */
  function searchAtlas(items, query, levels, field, targetLevel) {
    var q = normalize(query);
    if (!q) return items.slice();
    var scope = normalize(field) || "all";
    var target = targetLevel == null ? Infinity : Number(targetLevel);
    return items.filter(function (item) {
      var L = levelOf(item, levels);
      var discipleMatch = normalize(item.name).indexOf(q) !== -1;
      var atlasMatch = normalize(item.group).indexOf(q) !== -1 || normalize(item.atlas + "图鉴").indexOf(q) !== -1;
      var equipmentMatch = equipmentContains(item, q, L, target);
      var acquireMatch = normalize(item.acquire).indexOf(q) !== -1;
      var levelMatch = matchesLevelQuery(L, q);
      if (scope === "disciple") return discipleMatch;
      if (scope === "atlas") return atlasMatch;
      if (scope === "equipment") return equipmentMatch;
      if (scope === "acquire") return acquireMatch;
      if (scope === "level") return levelMatch;
      return discipleMatch || atlasMatch || equipmentMatch || acquireMatch || levelMatch;
    });
  }

  function filterAtlas(items, options) {
    var opts = options || {};
    var category = opts.category || "全部";
    var minLevel = opts.minLevel == null ? 0 : Number(opts.minLevel);
    var maxLevel = opts.maxLevel == null ? Infinity : Number(opts.maxLevel);
    var result = (Array.isArray(items) ? items : []).filter(function (item) {
      var level = levelOf(item, opts.levels);
      var categoryMatch = category === "全部" || category === "" || item.atlas === category;
      return categoryMatch && level >= minLevel && level <= maxLevel;
    });
    if (minLevel > maxLevel) return [];
    return searchAtlas(result, opts.query, opts.levels, opts.field, opts.targetLevel);
  }

  return {
    normalize: normalize,
    parseLevelQuery: parseLevelQuery,
    levelOf: levelOf,
    sortEquipment: sortEquipment,
    neededStages: neededStages,
    upgradePlan: upgradePlan,
    summarizeUpgrade: summarizeUpgrade,
    searchAtlas: searchAtlas,
    filterAtlas: filterAtlas
  };
});
