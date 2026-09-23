(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) api.apply(root);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function dunName(value) {
    var text = String(value == null ? "" : value).trim();
    return text.endsWith("盾") ? text.slice(0, -1) + "遁" : text;
  }

  function insertAfterCategory(items, category, item) {
    var lastIndex = -1;
    items.forEach(function (entry, index) {
      if (entry.cat === category) lastIndex = index;
    });
    items.splice(lastIndex + 1, 0, item);
  }

  function updateInscription(data) {
    if (!data || !Array.isArray(data.items)) return;
    data.items.forEach(function (item) {
      (item.slots || []).forEach(function (slot) {
        slot.shield = dunName(slot.shield);
      });
    });
    if (data.items.some(function (item) { return item.name === "神隐虎季布"; })) return;
    var item = {
      name: "神隐虎季布",
      quality: "红色神将",
      slots: [
        { tian: "天府", shield: "云遁" },
        { tian: "天相", shield: "龙遁" },
        { tian: "天同", shield: "地遁" },
        { tian: "天梁", shield: "风遁" },
        { tian: "天机", shield: "云遁" }
      ]
    };
    var insertAt = data.items.findIndex(function (entry) {
      return entry.quality === "红色神将" && entry.name > item.name;
    });
    if (insertAt === -1) data.items.push(item);
    else data.items.splice(insertAt, 0, item);
  }

  function updateSpecialEquipment(data) {
    if (!data || !Array.isArray(data.items) || data.items.some(function (item) { return item.name === "神兵影虎"; })) return;
    insertAfterCategory(data.items, "神兵武器", {
      id: "w-0124",
      cat: "神兵武器",
      name: "神兵影虎",
      main: "攻",
      tiers: {
        "橙色": [],
        "橙金": [],
        "红色": [],
        "红金": [
          { t: "技免", v: 15.0, raw: "15%技免" },
          { t: "穿透", v: 10.0, raw: "10%穿透" }
        ]
      },
      max: { "技免": 15.0, "穿透": 10.0 }
    });
    if (data.meta) data.meta.total = data.items.length;
  }

  function updateForging(data) {
    if (!data || !Array.isArray(data.items) || data.items.some(function (item) { return item.name === "影虎"; })) return;
    var names = ["号钟琴", "乱神", "水寒", ["凌虚", "木剑"], "庄子", "影虎", null, "巨阙", "太阿", "寒蝉", "影虎"];
    var stages = (data.meta && data.meta.stageNames) || [
      "0→1锻", "1→2锻", "2→3锻", "3→4锻", "4→5锻", "5→6锻",
      "6→7锻", "7→8锻", "8→9锻", "9→10锻", "10锻→红金"
    ];
    insertAfterCategory(data.items, "武器", {
      id: "f-0157",
      cat: "武器",
      name: "影虎",
      quality: "橙",
      stages: stages.map(function (stage, index) {
        var value = names[index];
        if (!value) return { stage: stage, tokens: [{ dash: true }] };
        var values = Array.isArray(value) ? value : [value];
        return {
          stage: stage,
          tokens: values.map(function (name) {
            return { n: name, q: index <= 4 ? "紫" : "橙" };
          })
        };
      })
    });
    if (data.meta) data.meta.total = data.items.length;
  }

  function apply(target) {
    if (!target) return;
    updateInscription(target.INSCRIPTION_DATA);
    updateSpecialEquipment(target.SPECIAL_EQUIPMENT_DATA);
    updateForging(target.FORGING_DATA);
  }

  return {
    apply: apply,
    dunName: dunName,
    updateInscription: updateInscription,
    updateSpecialEquipment: updateSpecialEquipment,
    updateForging: updateForging
  };
});
