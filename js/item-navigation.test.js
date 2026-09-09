const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ItemNavigation = require("./item-navigation.js");

function loadWindowData(relativePath, key) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"), context);
  return context.window[key].items;
}

const forgingItems = loadWindowData("data/forging.js", "FORGING_DATA");
const equipmentItems = loadWindowData("data/special-equipment.js", "SPECIAL_EQUIPMENT_DATA");

test("名称模型：神兵月光使用普通锻造键并保留神兵装备名", () => {
  assert.deepStrictEqual(ItemNavigation.resolveItem("神兵月光", equipmentItems, forgingItems), {
    clickedName: "神兵月光",
    forgeKey: "月光耳坠",
    equipmentName: "神兵月光",
    familyKey: "月光耳坠"
  });
});

test("名称模型：普通月光耳坠反向映射到神兵月光", () => {
  assert.deepStrictEqual(ItemNavigation.resolveItem("月光耳坠", equipmentItems, forgingItems), {
    clickedName: "月光耳坠",
    forgeKey: "月光耳坠",
    equipmentName: "神兵月光",
    familyKey: "月光耳坠"
  });
});

test("名称模型：鬼谷子与神兵鬼谷子保持两个独立装备族", () => {
  assert.deepStrictEqual(ItemNavigation.resolveItem("鬼谷子", equipmentItems, forgingItems), {
    clickedName: "鬼谷子",
    forgeKey: "鬼谷子",
    equipmentName: "鬼谷子",
    familyKey: "鬼谷子"
  });
  assert.deepStrictEqual(ItemNavigation.resolveItem("神兵鬼谷子", equipmentItems, forgingItems), {
    clickedName: "神兵鬼谷子",
    forgeKey: "神兵鬼谷子",
    equipmentName: "神兵鬼谷子",
    familyKey: "神兵鬼谷子"
  });
});

test("名称模型：无锻造资料装备仍使用原名形成导航物品", () => {
  assert.deepStrictEqual(ItemNavigation.resolveItem("秦时周年历", equipmentItems, forgingItems), {
    clickedName: "秦时周年历",
    forgeKey: "秦时周年历",
    equipmentName: "秦时周年历",
    familyKey: "秦时周年历"
  });
});

test("操作菜单：四类来源返回确认后的动作和统一文案", () => {
  assert.deepStrictEqual(ItemNavigation.actionsForSource("equipment"), [
    { id: "atlas", label: "前往图鉴分区查询" },
    { id: "forging", label: "前往橙装锻造分区查询" },
    { id: "drops", label: "前往关卡掉落分区查询" },
    { id: "forbidden", label: "前往禁地分区查询" }
  ]);
  assert.deepStrictEqual(ItemNavigation.actionsForSource("forging"), [
    { id: "forging-progress", label: "前往个人进度查询" },
    { id: "atlas", label: "前往图鉴分区查询" },
    { id: "drops", label: "前往关卡掉落分区查询" },
    { id: "equipment", label: "前往装备属性分区查询" },
    { id: "forbidden", label: "前往禁地分区查询" },
    { id: "zhulu", label: "前往逐鹿分区查询" }
  ]);
  assert.deepStrictEqual(ItemNavigation.actionsForSource("drops"), [
    { id: "atlas", label: "前往图鉴分区查询" },
    { id: "forging", label: "前往橙装锻造分区查询" },
    { id: "equipment", label: "前往装备属性分区查询" }
  ]);
  assert.deepStrictEqual(ItemNavigation.actionsForSource("zhulu"), [
    { id: "seasons", label: "查看出现赛季" },
    { id: "forging", label: "前往橙装锻造分区查询" },
    { id: "atlas", label: "前往图鉴分区查询" },
    { id: "equipment", label: "前往装备属性分区查询" }
  ]);
});

test("导航栈：连续跳转后按后进先出逐级返回", () => {
  const stack = ItemNavigation.createStack();
  stack.push({ sourcePartition: "equipment", destinationPartition: "forging", sourceView: { query: "墨眉" } });
  stack.push({ sourcePartition: "forging", destinationPartition: "atlas", sourceView: { query: "墨眉" } });

  assert.strictEqual(stack.size(), 2);
  assert.strictEqual(stack.peek().sourcePartition, "forging");
  assert.strictEqual(stack.pop().sourcePartition, "forging");
  assert.strictEqual(stack.pop().sourcePartition, "equipment");
  assert.strictEqual(stack.pop(), null);
});

test("目标恢复：目标未改动时恢复旧状态，改动后保留新状态", () => {
  const frame = {
    destinationAppliedFingerprint: ItemNavigation.captureFingerprint({ query: "月光耳坠", mode: "main" })
  };
  assert.strictEqual(ItemNavigation.shouldRestoreDestination(frame, { mode: "main", query: "月光耳坠" }), true);
  assert.strictEqual(ItemNavigation.shouldRestoreDestination(frame, { mode: "material", query: "月光耳坠" }), false);
});

test("导航栈：帧和读取结果均为深拷贝", () => {
  const stack = ItemNavigation.createStack();
  const frame = { sourceView: { filters: ["速"] } };
  stack.push(frame);
  frame.sourceView.filters.push("抗暴");
  const saved = stack.peek();
  saved.sourceView.filters.push("暴击");
  assert.deepStrictEqual(stack.pop().sourceView.filters, ["速"]);
});
