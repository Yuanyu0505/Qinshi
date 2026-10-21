/* 十月锻造资料增量：以2026-10-21用户确认的四类锻造表为准。 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) api.apply(root);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var STAGE_NAMES = [
    "0→1锻", "1→2锻", "2→3锻", "3→4锻", "4→5锻", "5→6锻",
    "6→7锻", "7→8锻", "8→9锻", "9→10锻", "10锻→红金"
  ];

  function materialTokens(names, quality) {
    if (!names) return [{ dash: true }];
    return (Array.isArray(names) ? names : [names]).map(function (name) {
      return { n: name, q: quality };
    });
  }

  function recipe(id, cat, name, names, purpleThrough) {
    return {
      id: id,
      cat: cat,
      name: name,
      quality: "橙",
      stages: STAGE_NAMES.map(function (stage, index) {
        return { stage: stage, tokens: materialTokens(names[index], index <= purpleThrough ? "紫" : "橙") };
      })
    };
  }

  function newRecipes() {
    return [
      recipe("f-202610-01", "武器", "夜阑灯", [
        "雪霁", "灭魂", "水寒", ["凌虚", "木剑"], "庄子", "夜阑灯",
        null, "千面", "虎魄", "衍天星际", "夜阑灯"
      ], 4),
      recipe("f-202610-02", "盔甲", "映月橘裳", [
        "星云法衣", "天河霓裳", "升雪凌霄衣", ["真龙黑袍", "文曲服"], "神行符", "映月橘裳",
        null, "圣贤服", "藏刃衣", "纵横战袍", "映月橘裳"
      ], 4),
      recipe("f-202610-03", "首饰", "泷星", [
        null, null, null, "冰魄戒", "左传", "泷星",
        null, "金乌神饰", "女神之泪", "传国玉玺", "泷星"
      ], 3),
      recipe("f-202610-04", "典籍", "幻音天章", [
        null, null, "凤鸣", "上农", "罡星戒", "幻音天章",
        null, "吕氏春秋", "鬼谷子", "尚书", "幻音天章"
      ], 3)
    ];
  }

  function insertAfterCategory(items, item) {
    if (items.some(function (entry) { return entry.name === item.name; })) return;
    var lastIndex = -1;
    items.forEach(function (entry, index) {
      if (entry.cat === item.cat) lastIndex = index;
    });
    items.splice(lastIndex + 1, 0, item);
  }

  function replaceMaterial(data, name, stageName, material, quality) {
    var item = data.items.find(function (entry) { return entry.name === name; });
    var stage = item && item.stages && item.stages.find(function (entry) { return entry.stage === stageName; });
    if (stage) stage.tokens = materialTokens(material, quality);
  }

  function updateForging(data) {
    if (!data || !Array.isArray(data.items)) return;
    newRecipes().forEach(function (item) { insertAfterCategory(data.items, item); });

    replaceMaterial(data, "破阵弓", "7→8锻", "太阿", "橙");
    replaceMaterial(data, "破阵弓", "8→9锻", "寒蝉", "橙");
    replaceMaterial(data, "破阵弓", "9→10锻", "百战穿甲弩", "橙");
    replaceMaterial(data, "虎头鞋", "7→8锻", "苍云甲", "橙");
    replaceMaterial(data, "虎头鞋", "8→9锻", "纵横战袍", "橙");
    replaceMaterial(data, "虎头鞋", "9→10锻", "月华战袍", "橙");
    replaceMaterial(data, "虎头鞋", "10锻→红金", "虎头鞋", "橙");
    replaceMaterial(data, "三十六计", "9→10锻", "孙子兵法", "紫");
    replaceMaterial(data, "晏子春秋", "9→10锻", "孙子兵法", "紫");
    replaceMaterial(data, "南华真经", "8→9锻", "商君书", "橙");
    replaceMaterial(data, "南华真经", "9→10锻", "鬼谷子", "橙");

    if (data.meta) {
      data.meta.total = data.items.length;
      data.meta.version = "20261021";
      data.meta.contentUpdatedAt = "2026-10-21";
      data.meta.contentSource = "2026年10月橙色装备锻造表（用户确认）";
    }
  }

  function apply(target) {
    if (target) updateForging(target.FORGING_DATA);
  }

  return { apply: apply, updateForging: updateForging };
});
