/* 六堂通用升级资料，按用户提供的50级材料表及2026-10-22确认规则录入。 */
(function (root, factory) {
  "use strict";
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  if (root) root.SIX_HALLS_DATA = data;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  var materials = [
    [3, 1], [6, 1], [9, 1], [12, 1], [15, 1],
    [12, 2], [15, 2], [18, 2], [21, 2], [10, 6],
    [6, 4], [10, 4], [14, 4], [18, 4], [22, 4],
    [12, 5], [16, 5], [20, 5], [16, 6], [10, 11],
    [20, 6], [12, 7], [16, 7], [20, 7], [12, 8],
    [16, 8], [20, 8], [12, 9], [16, 9], [12, 15],
    [18, 10], [22, 10], [26, 10], [18, 11], [22, 11],
    [26, 11], [18, 12], [22, 12], [26, 12], [15, 20],
    [24, 14], [28, 14], [32, 14], [24, 15], [28, 15],
    [32, 15], [24, 16], [28, 16], [32, 16], [18, 26]
  ];
  var milestones = [
    { hallLevel: 10, playerLevel: 50 },
    { hallLevel: 20, playerLevel: 59 },
    { hallLevel: 30, playerLevel: 69 },
    { hallLevel: 40, playerLevel: 79 },
    { hallLevel: 50, playerLevel: 89 }
  ];
  return {
    meta: { source: "六堂升级所需材料一览（更新至六堂50级）", confirmedAt: "2026-10-22" },
    maxLevel: 50,
    halls: [
      { id: "kuiwei", name: "魁隗" },
      { id: "chiyou", name: "蚩尤" },
      { id: "lieshan", name: "烈山" },
      { id: "siyue", name: "四岳" },
      { id: "gonggong", name: "共工" },
      { id: "shennong", name: "神农" }
    ],
    milestones: milestones,
    fullCost: { herbs: 904, tokens: 435 },
    steps: materials.map(function (cost, index) {
      var milestone = milestones.find(function (entry) { return entry.hallLevel === index + 1; });
      return { from: index, to: index + 1, herbs: cost[0], tokens: cost[1], playerLevel: milestone ? milestone.playerLevel : null };
    })
  };
});
