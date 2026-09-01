const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadEquipmentNames() {
  const context = { window: {} };
  const source = fs.readFileSync(path.join(__dirname, "..", "data", "special-equipment.js"), "utf8");
  vm.runInNewContext(source, context);
  return context.window.SPECIAL_EQUIPMENT_DATA.items.map((item) => item.name);
}

test("装备属性数据统一使用五德终始的正确名称", () => {
  const names = loadEquipmentNames();
  assert.ok(names.includes("五德终始"));
  assert.ok(!names.includes("伍德终始"));
});
