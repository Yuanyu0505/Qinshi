/* 十月装备资料增量：以2026-10-21用户确认及补充数值为准。 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) api.apply(root);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function tokensFor(values) {
    return values.map(function (value) {
      var token = { t: value[0], v: value[1], raw: value[1] + (value[0] === "速" ? "" : "%") + value[0] };
      if (value[0] === "攻防血") token.matches = ["攻", "防", "血", "攻防血"];
      return token;
    });
  }

  function maximums(tiers) {
    var result = {};
    Object.keys(tiers).forEach(function (tier) {
      var total = {};
      tiers[tier].forEach(function (token) {
        if (!token.t || typeof token.v !== "number") return;
        (token.matches || [token.t]).forEach(function (attr) {
          total[attr] = (total[attr] || 0) + token.v;
        });
      });
      Object.keys(total).forEach(function (attr) {
        result[attr] = Math.max(result[attr] || 0, total[attr]);
      });
    });
    return result;
  }

  function equipment(id, cat, name, main, values) {
    var tiers = {};
    ["橙色", "橙金", "红色", "红金"].forEach(function (tier, index) {
      tiers[tier] = tokensFor(values[index]);
    });
    return { id: id, cat: cat, name: name, main: main, tiers: tiers, max: maximums(tiers) };
  }

  function book(id, name, divine) {
    var red = divine ? [
      ["速", 145], ["抗暴", 35], ["攻防血", 51], ["技免", 60], ["暴击", 16], ["暴伤", 25], ["穿透", 20]
    ] : [
      ["速", 145], ["攻防血", 46], ["技免", 60], ["暴击", 15], ["暴伤", 15], ["穿透", 15]
    ];
    var redGold = red.map(function (value) { return value.slice(); });
    redGold[0][1] = divine ? 150 : 148;
    var tiers = { "橙色": [], "橙金": [], "红色": tokensFor(red), "红金": tokensFor(redGold) };
    var item = {
      id: id,
      cat: divine ? "神兵典籍" : "典籍",
      name: name,
      main: "攻、内力",
      mainKey: "攻",
      bookGroup: divine ? "神兵典籍" : "初始橙色典籍",
      sourceOrder: divine ? 53 : 52,
      tiers: tiers,
      // 已知的是累计端点，不是该阶新增属性；未知品质和中间阶保持缺失。
      stageSnapshots: {
        "红色": [{ stage: divine ? 0 : 15, tokens: tokensFor(red) }],
        "红金": [{ stage: 15, tokens: tokensFor(redGold) }]
      },
      stageDetailsIncomplete: true,
      max: maximums(tiers)
    };
    if (divine) item.summaryLabels = { "红色": "红色0锻", "红金": "红金满锻" };
    return item;
  }

  function newItems() {
    return [
      equipment("eq-202610-01", "武器", "夜阑灯", "攻", [
        [["暴击", 5]], [["暴击", 5]], [["暴击", 5]], [["暴击", 5], ["技免", 5]]
      ]),
      equipment("eq-202610-02", "防具", "映月橘裳", "防", [
        [["抗暴", 5]], [["抗暴", 5]], [["抗暴", 5]], [["抗暴", 5], ["穿透", 5]]
      ]),
      equipment("eq-202610-03", "饰品", "泷星", "血", [
        [["暴伤", 5]], [["暴伤", 5]], [["暴伤", 5]], [["暴伤", 5], ["穿透", 5]]
      ]),
      equipment("eq-202610-04", "神兵武器", "神兵夜阑灯", "攻", [
        [["暴击", 10], ["技免", 10]], [["暴击", 10], ["技免", 15]],
        [["暴击", 10], ["技免", 15]], [["暴击", 15], ["技免", 15]]
      ]),
      equipment("eq-202610-05", "神兵防具", "神兵橘裳", "防", [
        [["抗暴", 10], ["穿透", 10]], [["抗暴", 10], ["穿透", 15]],
        [["抗暴", 10], ["穿透", 15]], [["抗暴", 15], ["穿透", 15]]
      ]),
      equipment("eq-202610-06", "神兵饰品", "神兵泷星", "血", [
        [["暴伤", 10], ["穿透", 10]], [["暴伤", 15], ["穿透", 10]],
        [["暴伤", 15], ["穿透", 10]], [["暴伤", 15], ["穿透", 15]]
      ]),
      book("eq-202610-07", "幻音天章", false),
      book("eq-202610-08", "神兵幻音", true)
    ];
  }

  function insertOnce(items, item) {
    if (items.some(function (entry) {
      return entry.id === item.id || (entry.cat === item.cat && entry.name === item.name);
    })) return;
    var lastIndex = -1;
    items.forEach(function (entry, index) {
      if (entry.cat === item.cat) lastIndex = index;
    });
    items.splice(lastIndex + 1, 0, item);
  }

  function updateSpecialEquipment(data) {
    if (!data || !Array.isArray(data.items)) return;
    var correctedMains = { "公孙龙子": "防", "孟子": "血", "易经": "血", "胡非子": "攻", "墨子": "血" };
    data.items.forEach(function (item) {
      if (item.cat === "典籍" && correctedMains[item.name]) {
        item.main = correctedMains[item.name] + "、内力";
        item.mainKey = correctedMains[item.name];
      }
      if (item.cat === "典籍" && item.name === "春秋") {
        item.mainByTier = item.mainByTier || {};
        item.mainByTier["红金"] = "血、内力";
      }
      if (item.cat === "神兵武器" && item.name === "神兵影虎") {
        item.tiers["橙色"] = tokensFor([["技免", 10], ["穿透", 5]]);
        item.tiers["橙金"] = tokensFor([["技免", 10], ["穿透", 10]]);
        item.tiers["红色"] = tokensFor([["技免", 10], ["穿透", 10]]);
      }
      if (item.cat === "武器" && item.name === "南瓜灯笼") item.tiers["红金"] = [{ s: "暂未开放" }];
    });
    newItems().forEach(function (item) { insertOnce(data.items, item); });
    data.items.forEach(function (item) {
      if (item.name === "神兵橘裳") item.searchAliases = ["映月橘裳", "神兵映月橘裳"];
      if (item.name === "神兵幻音") item.searchAliases = ["幻音天章", "神兵幻音天章"];
    });
    data.meta = data.meta || {};
    data.meta.total = data.items.length;
    data.meta.version = "20261021";
    data.meta.contentUpdatedAt = "2026-10-21";
    data.meta.contentSource = "2026年10月装备资料对照图与2026-10-21用户确认及补充";
  }

  function apply(target) {
    if (!target) return;
    updateSpecialEquipment(target.SPECIAL_EQUIPMENT_DATA);
  }

  return { apply: apply, updateSpecialEquipment: updateSpecialEquipment };
});
