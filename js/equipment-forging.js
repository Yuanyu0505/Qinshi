(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EquipmentForging = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FORGE_NAME_ALIASES = {
    "神兵霸王枪": "君临霸王枪",
    "神兵玄翦": "黑白玄翦",
    "神兵链蛇": "链蛇软剑",
    "神兵衍天": "衍天星际",
    "神兵凤鸟": "凤鸟自舞",
    "神兵煞魂": "煞魂蛇噬",
    "神兵穿甲弩": "百战穿甲弩",
    "神兵霜血": "霜血双剑",
    "神兵环刃": "淬毒环刃",
    "神兵宝扇": "清风宝扇",
    "神兵永夜": "永恒之夜",
    "神兵辉光": "朔日辉光",
    "神兵非攻": "非攻九变",
    "神兵新渊": "重铸渊虹",
    "神兵凌霄衣": "升雪凌霄衣",
    "神兵醉梦": "醉梦罗裳",
    "神兵万象": "万象法袍",
    "神兵幽兰": "幽兰素裳",
    "神兵蛟龙甲": "七海蛟龙甲",
    "神兵星云": "星云法衣",
    "神兵纵横": "纵横战袍",
    "神兵白羽": "白羽绸衣",
    "神兵魔铠": "地煞魔铠",
    "神兵月华袍": "月华战袍",
    "神兵珊瑚樽": "碧海珊瑚樽",
    "神兵道宝玉": "道经师宝玉",
    "神兵女神泪": "女神之泪",
    "神兵金乌": "金乌神饰",
    "神兵百鸟": "百鸟信物",
    "神兵玉玺": "传国玉玺",
    "神兵白玉": "白玉君子佩",
    "神兵神座": "结晶神座",
    "神兵牡丹": "黄金牡丹",
    "神兵寒霜": "寒霜挂坠",
    "神兵凶影": "暗夜凶影",
    "神兵月光": "月光耳坠",
    "神兵虎符": "三军虎符",
    "神兵奇门": "奇门遁甲",
    "神兵吕览": "吕氏春秋",
    "神兵冥史": "冥界史诗",
    "神兵百家": "百家杂记",
    "神兵南华": "南华真经"
  };

  function resolveForgeTarget(name, forgingItems) {
    var sourceName = String(name == null ? "" : name).trim();
    if (!sourceName || !Array.isArray(forgingItems)) return null;
    var available = new Set(forgingItems.map(function (item) { return item.name; }));
    var alias = FORGE_NAME_ALIASES[sourceName];
    if (alias && available.has(alias)) return alias;
    if (available.has(sourceName)) return sourceName;
    if (sourceName.indexOf("神兵") === 0 && sourceName !== "神兵鬼谷子") {
      var normalName = sourceName.slice(2);
      if (available.has(normalName)) return normalName;
    }
    return null;
  }

  function buildForgeNavigation(name, forgingItems) {
    var target = resolveForgeTarget(name, forgingItems);
    if (!target) return null;
    return {
      partition: "forging",
      view: "query",
      mode: "main",
      query: target
    };
  }

  function resolveEquipmentTarget(forgeName, equipmentItems, forgingItems) {
    var targetName = String(forgeName == null ? "" : forgeName).trim();
    if (!targetName || !Array.isArray(equipmentItems) || !Array.isArray(forgingItems)) return null;
    if (targetName === "鬼谷子" || targetName === "神兵鬼谷子") {
      return equipmentItems.find(function (item) { return item.name === "神兵鬼谷子"; }) || null;
    }
    var candidates = equipmentItems.filter(function (item) {
      return resolveForgeTarget(item.name, forgingItems) === targetName;
    });
    return candidates.find(function (item) { return item.name.indexOf("神兵") === 0; }) ||
      candidates.find(function (item) { return item.name === targetName; }) ||
      candidates[0] || null;
  }

  function createReturnSession(sourceItemId, forgeName, equipmentView, scrollY) {
    return {
      sourceItemId: String(sourceItemId == null ? "" : sourceItemId),
      forgeName: String(forgeName == null ? "" : forgeName).trim(),
      equipmentView: JSON.parse(JSON.stringify(equipmentView || {})),
      scrollY: Number.isFinite(Number(scrollY)) ? Math.max(0, Number(scrollY)) : 0,
      valid: true
    };
  }

  function matchesReturnSession(session, forgeName) {
    return Boolean(session && session.valid === true && session.forgeName &&
      session.forgeName === String(forgeName == null ? "" : forgeName).trim());
  }

  return {
    FORGE_NAME_ALIASES: FORGE_NAME_ALIASES,
    resolveForgeTarget: resolveForgeTarget,
    buildForgeNavigation: buildForgeNavigation,
    resolveEquipmentTarget: resolveEquipmentTarget,
    createReturnSession: createReturnSession,
    matchesReturnSession: matchesReturnSession
  };
});
