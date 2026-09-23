const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ContentUpdate = require("../data/2026-09-content-update.js");
const Query = require("./query.js");

function loadData() {
  const context = { window: {} };
  ["inscription.js", "special-equipment.js", "forging.js"].forEach((name) => {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "data", name), "utf8"), context);
  });
  ContentUpdate.apply(context.window);
  return context.window;
}

test("九月增量资料：重复应用保持幂等", () => {
  const data = loadData();
  ContentUpdate.apply(data);
  assert.strictEqual(data.INSCRIPTION_DATA.items.filter((item) => item.name === "神隐虎季布").length, 1);
  assert.strictEqual(data.SPECIAL_EQUIPMENT_DATA.items.filter((item) => item.name === "神兵影虎").length, 1);
  assert.strictEqual(data.FORGING_DATA.items.filter((item) => item.name === "影虎").length, 1);
});

test("九月增量资料：神隐虎季布使用五个正确遁位", () => {
  const item = loadData().INSCRIPTION_DATA.items.find((entry) => entry.name === "神隐虎季布");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(item.slots)), [
    { tian: "天府", shield: "云遁" },
    { tian: "天相", shield: "龙遁" },
    { tian: "天同", shield: "地遁" },
    { tian: "天梁", shield: "风遁" },
    { tian: "天机", shield: "云遁" }
  ]);
  assert.ok(loadData().INSCRIPTION_DATA.items.every((entry) => entry.slots.every((slot) => !slot.shield.endsWith("盾"))));
});

test("九月增量资料：神兵影虎只录入红金副属性", () => {
  const item = loadData().SPECIAL_EQUIPMENT_DATA.items.find((entry) => entry.name === "神兵影虎");
  assert.strictEqual(item.main, "攻");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(item.tiers)), {
    橙色: [], 橙金: [], 红色: [],
    红金: [
      { t: "技免", v: 15, raw: "15%技免" },
      { t: "穿透", v: 10, raw: "10%穿透" }
    ]
  });
  assert.deepStrictEqual(Query.queryItems([item], { search: "神兵·影虎", filters: [] }).map((entry) => entry.name), ["神兵影虎"]);
});

test("九月增量资料：影虎锻造链完整", () => {
  const item = loadData().FORGING_DATA.items.find((entry) => entry.name === "影虎");
  assert.deepStrictEqual(item.stages.map((stage) => stage.tokens.map((token) => token.n || "—")), [
    ["号钟琴"], ["乱神"], ["水寒"], ["凌虚", "木剑"], ["庄子"], ["影虎"],
    ["—"], ["巨阙"], ["太阿"], ["寒蝉"], ["影虎"]
  ]);
});
