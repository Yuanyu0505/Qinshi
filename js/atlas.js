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

  var ELEMENT_DISCIPLES = {
    "金": ["神王道少羽", "神霸道田虎", "神赤霄刘季", "神极诣星魂", "神寒蝉吴旷", "神真刚", "神嬴政", "神紫女", "神云中君", "神伏念", "神胡姬", "神虞姬", "神白凤", "神典庆", "神季布", "神司徒万里", "神韩信", "神月神"],
    "木": ["神兰轩紫女", "神荼蘼田蜜", "神潜蛟韩信", "神素华少司命", "神镜仙端木蓉", "神逍遥子", "神扶苏", "神韩非", "神颜路", "神燕丹", "神项羽", "神高月", "神墨鸦", "神吴旷", "神田蜜", "神英布", "神田言", "神端木蓉", "神少司命"],
    "水": ["瑶瑶", "神鬼谷盖聂", "神凤吟弄玉", "神秋水晓梦", "神天泽", "神墨家雪女", "神水寒高渐离", "神渊虹盖聂", "神天宗晓梦", "神小黎", "神丽姬", "神湘夫人", "神张良", "神赵高", "神诺敏", "神白亦非", "神荆天明", "神田仲", "神钟离昧", "神田虎", "神刘邦", "神盖聂", "神雪女", "神高渐离"],
    "火": ["神将威龙且", "神侠道天明", "神龙骧章邯", "神黑龙天", "神惊鲵田言", "神森罗大司命", "神红莲赤练", "神大铁锤", "神黑白玄翦", "神王翦", "神田光", "神焰灵姬", "神蒙恬", "神掩日", "神东皇太一", "神焱妃", "神龙且", "神胜七", "神朱家", "神晓梦", "神卫庄", "神大司命"],
    "土": ["神鲨齿卫庄", "神逆天而行", "神梅三娘", "神太虚月神", "神巨阙陈胜", "神蚩魔卫庄", "神李斯", "神荆轲", "神湘君", "神李牧", "神胡亥", "神王离", "神惊鲵", "神田赐", "神章邯", "神赤练", "神星魂"]
  };
  var ELEMENT_BY_DISCIPLE = {};

  function normalizeDiscipleName(name) {
    return normalize(name).replace(/[\s·•・]/g, "");
  }

  Object.keys(ELEMENT_DISCIPLES).forEach(function (element) {
    ELEMENT_DISCIPLES[element].forEach(function (name) {
      ELEMENT_BY_DISCIPLE[normalizeDiscipleName(name)] = element;
    });
  });

  function elementOfDisciple(name) {
    return ELEMENT_BY_DISCIPLE[normalizeDiscipleName(name)] || "";
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

  function isFavorite(item, favorites) {
    var id = normalize(item && item.id);
    if (!id) return false;
    if (Array.isArray(favorites)) {
      return favorites.some(function (favoriteId) { return normalize(favoriteId) === id; });
    }
    return Boolean(favorites && favorites[id]);
  }

  function favoriteFirst(items, favorites) {
    var favoriteItems = [];
    var regularItems = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      (isFavorite(item, favorites) ? favoriteItems : regularItems).push(item);
    });
    return favoriteItems.concat(regularItems);
  }

  function equipmentRecordKey(stageKey, index) {
    var position = Math.max(0, Math.trunc(Number(index) || 0));
    return String(stageKey == null ? "" : stageKey) + "|" + position;
  }

  function inventoryInteger(value) {
    if (value === "" || value == null) return null;
    var n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function soulInventoryStatus(requiredInput, ownedInput) {
    var required = Math.max(0, inventoryInteger(requiredInput) || 0);
    var owned = inventoryInteger(ownedInput);
    if (required === 0) return { state: "enough", owned: owned, missing: 0 };
    if (owned == null) return { state: "unset", owned: null, missing: required };
    var missing = Math.max(0, required - owned);
    return {
      state: missing > 0 ? "short" : "enough",
      owned: owned,
      missing: missing
    };
  }

  function normalizeInventoryRecord(record) {
    var source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    var rawEquipment = source.equipment && typeof source.equipment === "object" && !Array.isArray(source.equipment)
      ? source.equipment
      : {};
    var equipment = {};
    Object.keys(rawEquipment).forEach(function (key) {
      var value = rawEquipment[key];
      if (!key || !value || typeof value !== "object" || Array.isArray(value)) return;
      var name = String(value.name == null ? "" : value.name).trim();
      if (!name) return;
      equipment[key] = {
        name: name,
        owned: value.owned === true,
        note: String(value.note == null ? "" : value.note).trim()
      };
    });
    return {
      soulsOwned: inventoryInteger(source.soulsOwned),
      equipment: equipment
    };
  }

  var NOTE_SOURCE_ORDER = ["禁地", "碎片", "碎片/禁地", "主线", "聚宝盆", "楼兰"];

  function detectNoteSources(notes) {
    var found = {};
    (Array.isArray(notes) ? notes : []).forEach(function (note) {
      var text = normalize(note).replace(/\s+/g, "").replace(/／/g, "/");
      if (!text) return;
      var standaloneText = text.replace(/禁地\/碎片|碎片\/禁地/g, function () {
        found["碎片/禁地"] = true;
        return "";
      });
      if (standaloneText.indexOf("禁地") !== -1) found["禁地"] = true;
      if (standaloneText.indexOf("碎片") !== -1) found["碎片"] = true;
      if (standaloneText.indexOf("主线") !== -1) found["主线"] = true;
      if (standaloneText.indexOf("聚宝盆") !== -1) found["聚宝盆"] = true;
      if (standaloneText.indexOf("楼兰") !== -1) found["楼兰"] = true;
    });
    return NOTE_SOURCE_ORDER.filter(function (source) { return found[source]; });
  }

  function equipmentInventoryStatus(plan, recordInput) {
    var stages = plan && Array.isArray(plan.equipmentStages) ? plan.equipmentStages : [];
    if (!stages.length) return { state: "owned", missingNotes: [], noteSources: [] };
    var record = normalizeInventoryRecord(recordInput);
    var missingNotes = [];
    var unset = false;
    stages.forEach(function (stage) {
      (stage.items || []).forEach(function (token, index) {
        var key = equipmentRecordKey(stage.key, index);
        var saved = record.equipment[key];
        if (!saved || saved.name !== token.n) {
          unset = true;
          return;
        }
        if (!saved.owned) missingNotes.push(saved.note || "");
      });
    });
    if (unset) return { state: "unset", missingNotes: [], noteSources: [] };
    return {
      state: missingNotes.length ? "missing" : "owned",
      missingNotes: missingNotes,
      noteSources: detectNoteSources(missingNotes)
    };
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

  function deriveAtlasState(item, options) {
    var opts = options || {};
    var id = String(!item || item.id == null ? "" : item.id);
    var plan = upgradePlan(
      item,
      levelOf(item, opts.levels),
      opts.targetLevel,
      opts.upgradeStages
    );
    var inventory = opts.inventory && typeof opts.inventory === "object" ? opts.inventory : {};
    var favorite = isFavorite(item, opts.favorites);
    var record = normalizeInventoryRecord(favorite ? inventory[id] : null);
    var equipment = equipmentInventoryStatus(plan, record);
    return {
      item: item,
      plan: plan,
      soulState: soulInventoryStatus(plan.souls, record.soulsOwned),
      equipmentState: equipment.state,
      noteSources: equipment.noteSources,
      favorite: favorite,
      pinned: favorite && isFavorite(item, opts.pins)
    };
  }

  function compareText(a, b) {
    return normalize(a).localeCompare(normalize(b), "zh-Hans-CN");
  }

  function compareDisciple(a, b) {
    return compareText(a.item && a.item.name, b.item && b.item.name);
  }

  function stableSort(states, comparator) {
    return states.map(function (state, index) { return { state: state, index: index }; })
      .sort(function (a, b) { return comparator(a.state, b.state) || a.index - b.index; })
      .map(function (entry) { return entry.state; });
  }

  function ordinaryComparator(options) {
    var opts = options || {};
    var field = normalize(opts.sortField) || "default";
    var direction = normalize(opts.sortDirection) === "desc" ? -1 : 1;
    if (field === "knots") {
      return function (a, b) {
        return direction * (a.plan.knots - b.plan.knots) || compareDisciple(a, b);
      };
    }
    if (field === "souls") {
      var soulRank = { enough: 0, short: 1, unset: 2 };
      return function (a, b) {
        var rankDifference = soulRank[a.soulState.state] - soulRank[b.soulState.state];
        if (rankDifference) return rankDifference;
        if (a.soulState.state === "short") {
          var gapDifference = direction * (a.soulState.missing - b.soulState.missing);
          if (gapDifference) return gapDifference;
        }
        return compareDisciple(a, b);
      };
    }
    if (field === "disciple") return compareDisciple;
    if (field === "group") {
      return function (a, b) {
        return compareText(a.item && a.item.group, b.item && b.item.group) || compareDisciple(a, b);
      };
    }
    return function () { return 0; };
  }

  function pinnedComparator(a, b) {
    var atlasRank = { "攻": 0, "血": 1, "内力": 2, "防": 3 };
    var equipmentRank = { owned: 0, missing: 1, unset: 2 };
    var typeDifference = (atlasRank[a.item.atlas] == null ? 99 : atlasRank[a.item.atlas]) -
      (atlasRank[b.item.atlas] == null ? 99 : atlasRank[b.item.atlas]);
    if (typeDifference) return typeDifference;
    var equipmentDifference = equipmentRank[a.equipmentState] - equipmentRank[b.equipmentState];
    if (equipmentDifference) return equipmentDifference;
    return a.plan.knots - b.plan.knots || compareDisciple(a, b);
  }

  function matchesSelectedSources(state, selectedSources) {
    if (!selectedSources.length) return true;
    return selectedSources.some(function (source) {
      return state.noteSources.indexOf(source) !== -1;
    });
  }

  function filterAtlas(items, options) {
    var opts = options || {};
    var category = opts.category || "全部";
    var minLevel = opts.minLevel == null ? 0 : Number(opts.minLevel);
    var maxLevel = opts.maxLevel == null ? Infinity : Number(opts.maxLevel);
    var result = (Array.isArray(items) ? items : []).filter(function (item) {
      var level = levelOf(item, opts.levels);
      var categoryMatch = category === "已收藏"
        ? isFavorite(item, opts.favorites)
        : category === "全部" || category === "" || item.atlas === category;
      return categoryMatch && level >= minLevel && level <= maxLevel;
    });
    if (minLevel > maxLevel) return [];
    var states = searchAtlas(result, opts.query, opts.levels, opts.field, opts.targetLevel)
      .map(function (item) { return deriveAtlasState(item, opts); });
    if (category === "已收藏" && opts.favoriteType && opts.favoriteType !== "all") {
      states = states.filter(function (state) { return state.item.atlas === opts.favoriteType; });
    }
    if (opts.soulFilter && opts.soulFilter !== "all") {
      states = states.filter(function (state) { return state.soulState.state === opts.soulFilter; });
    }
    if (opts.equipmentFilter && opts.equipmentFilter !== "all") {
      states = states.filter(function (state) { return state.equipmentState === opts.equipmentFilter; });
    }
    var selectedSources = Array.isArray(opts.noteSources) ? opts.noteSources.filter(function (source) {
      return NOTE_SOURCE_ORDER.indexOf(source) !== -1;
    }) : [];
    if (opts.equipmentFilter === "missing" && selectedSources.length) {
      states = states.filter(function (state) { return matchesSelectedSources(state, selectedSources); });
    }
    var pinned = [];
    var favorites = [];
    var regular = [];
    states.forEach(function (state) {
      if (state.pinned) pinned.push(state);
      else if (state.favorite) favorites.push(state);
      else regular.push(state);
    });
    var comparator = ordinaryComparator(opts);
    return stableSort(pinned, pinnedComparator)
      .concat(stableSort(favorites, comparator), stableSort(regular, comparator))
      .map(function (state) { return state.item; });
  }

  return {
    normalize: normalize,
    elementOfDisciple: elementOfDisciple,
    parseLevelQuery: parseLevelQuery,
    levelOf: levelOf,
    isFavorite: isFavorite,
    favoriteFirst: favoriteFirst,
    equipmentRecordKey: equipmentRecordKey,
    soulInventoryStatus: soulInventoryStatus,
    normalizeInventoryRecord: normalizeInventoryRecord,
    detectNoteSources: detectNoteSources,
    equipmentInventoryStatus: equipmentInventoryStatus,
    deriveAtlasState: deriveAtlasState,
    sortEquipment: sortEquipment,
    neededStages: neededStages,
    upgradePlan: upgradePlan,
    summarizeUpgrade: summarizeUpgrade,
    searchAtlas: searchAtlas,
    filterAtlas: filterAtlas
  };
});
