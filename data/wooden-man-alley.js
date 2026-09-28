(function (root, factory) {
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  if (root) root.WOODEN_MAN_ALLEY_DATA = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  return deepFreeze({
    schemaVersion: 1,
    maxFloor: 500,
    swordIngotPrice: 200,
    discountedSwordIngotPrice: 100,
    conservativeMultiplier: 1.2,
    tiers: [
      { id: "floor-1-50", from: 1, to: 50, boardSize: 3, cellCount: 9, toolCosts: { ironSword: 1, horizontalQi: 1, verticalQi: 1, crossQi: 1 } },
      { id: "floor-51-130", from: 51, to: 130, boardSize: 4, cellCount: 16, toolCosts: { ironSword: 2, horizontalQi: 1, verticalQi: 1, crossQi: 1 } },
      { id: "floor-131-230", from: 131, to: 230, boardSize: 5, cellCount: 25, toolCosts: { ironSword: 3, horizontalQi: 2, verticalQi: 2, crossQi: 2 } },
      { id: "floor-231-330", from: 231, to: 330, boardSize: 6, cellCount: 36, toolCosts: { ironSword: 4, horizontalQi: 2, verticalQi: 2, crossQi: 2 } },
      { id: "floor-331-500", from: 331, to: 500, boardSize: 6, cellCount: 36, toolCosts: { ironSword: 4, horizontalQi: 2, verticalQi: 2, crossQi: 2 } }
    ],
    tools: [
      { id: "woodSword", name: "木剑", effect: "击破1个木人", preserveRank: 0 },
      { id: "ironSword", name: "铁剑", effect: "直接完成当前层并取得最终大奖", preserveRank: 6 },
      { id: "horizontalQi", name: "横剑气", effect: "清除一整行木人", preserveRank: 3 },
      { id: "verticalQi", name: "纵剑气", effect: "清除一整列木人", preserveRank: 3 },
      { id: "crossQi", name: "十字剑气", effect: "清除一整行与一整列，交点只计一次", preserveRank: 5 },
      { id: "bomb", name: "炸药", effect: "随机清除最多5个尚未击破的木人", preserveRank: 4 },
      { id: "mirror", name: "铜镜", effect: "作用等同于1把木剑", preserveRank: 1 }
    ],
    resourceKeys: ["woodSword", "ironSword", "horizontalQi", "verticalQi", "crossQi", "bomb", "mirror", "discountCoupon", "ingots", "mysteryBoxes"],
    targets: [
      { floor: 75, reward: "灵宝四选一 ×4" },
      { floor: 180, reward: "木人常驻称号" },
      { floor: 230, reward: "灵宝四选一 ×12" },
      { floor: 300, reward: "木人限时称号" },
      { floor: 330, reward: "灵宝四选一 ×20" },
      { floor: 500, reward: "最高层完成" }
    ],
    defaultPackages: [
      { id: "small", name: "小补礼包", price: 68, swords: 30, mysteryBoxes: 3, limit: 1, purchased: 0 },
      { id: "value", name: "超值礼包", price: 98, swords: 40, mysteryBoxes: 5, limit: 1, purchased: 0 },
      { id: "pioneer", name: "破木先锋", price: 128, swords: 50, mysteryBoxes: 6, limit: 1, purchased: 0 },
      { id: "luxury", name: "豪华礼包", price: 328, swords: 100, mysteryBoxes: 20, limit: 1, purchased: 0 }
    ]
  });
});
