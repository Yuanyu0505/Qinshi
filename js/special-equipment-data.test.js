const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadEquipmentItems() {
  const context = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, "..", "data", "special-equipment.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.window.SPECIAL_EQUIPMENT_DATA.items;
}

test("装备属性数据统一使用五德终始的正确名称", () => {
  const names = loadEquipmentItems().map((item) => item.name);
  assert.ok(names.includes("五德终始"));
  assert.ok(!names.includes("伍德终始"));
});

test("孙子兵法归入初始紫色典籍", () => {
  const item = loadEquipmentItems().find((entry) => entry.cat === "典籍" && entry.name === "孙子兵法");

  assert.ok(item);
  assert.strictEqual(item.bookGroup, "初始紫色典籍");
  assert.ok(Object.prototype.hasOwnProperty.call(item.tiers, "紫色"));
});
