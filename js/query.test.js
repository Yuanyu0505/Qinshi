const { test } = require("node:test");
const assert = require("node:assert");
const Q = require("./query.js");

const fixture = [
  { id: "w-0001", cat: "武器", name: "朔日辉光", main: "攻",
    tiers: {
      "橙色": [{ t: "血", v: 5 }, { t: "穿透", v: 5 }],
      "橙金": [{ t: "血", v: 8 }, { t: "穿透", v: 8 }],
      "红色": [{ t: "血", v: 10 }, { t: "穿透", v: 10 }],
      "红金": [{ t: "血", v: 10 }, { t: "穿透", v: 15 }]
    },
    max: { "血": 10, "穿透": 15 } },
  { id: "f-0001", cat: "防具", name: "吉祥如意", main: "防",
    tiers: { "橙色": [{ s: "无" }], "橙金": [{ s: "无" }], "红色": [{ s: "无" }], "红金": [{ s: "无" }] },
    max: {} },
  { id: "s-0001", cat: "饰品", name: "月光耳坠", main: "血",
    tiers: {
      "橙色": [{ t: "血", v: 10 }, { t: "暴击", v: 5 }],
      "橙金": [{ t: "血", v: 20 }, { t: "暴击", v: 5 }],
      "红色": [{ t: "血", v: 25 }, { t: "暴击", v: 5 }],
      "红金": [{ t: "血", v: 30 }, { t: "暴击", v: 8 }]
    },
    max: { "血": 30, "暴击": 8 } },
  { id: "w-0045", cat: "神兵武器", name: "神兵破阵弓", main: "攻",
    tiers: { "橙色": [], "橙金": [], "红色": [], "红金": [] },
    max: {} },
  { id: "s-0003", cat: "神兵饰品", name: "神兵月光", main: "血",
    tiers: {
      "橙色": [{ t: "血", v: 10 }, { t: "暴击", v: 6 }],
      "橙金": [{ t: "血", v: 20 }, { t: "暴击", v: 8 }],
      "红色": [{ t: "血", v: 25 }, { t: "暴击", v: 8 }],
      "红金": [{ t: "血", v: 30 }, { t: "暴击", v: 12 }]
    },
    max: { "血": 30, "暴击": 12 } },
  { id: "s-0002", cat: "神兵饰品", name: "测试饰品", main: "血",
    tiers: { "橙色": [{ s: "暂未开放" }], "橙金": [{ s: "暂未开放" }], "红色": [{ s: "暂未开放" }], "红金": [{ s: "暂未开放" }] },
    max: {} },
  { id: "f-0002", cat: "神兵防具", name: "测试防具", main: "防",
    tiers: { "橙色": [{ t: "血", v: 5 }], "橙金": [], "红色": [], "红金": [] },
    max: { "血": 5 } }
];

test("matchSearch：名称子串", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], "辉光"), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "不存在"), false);
});

test("matchSearch：分类关键词", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], "武器"), true);
  assert.strictEqual(Q.matchSearch(fixture[3], "武器"), true);
  assert.strictEqual(Q.matchSearch(fixture[3], "神兵"), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "神兵"), false);
});

test("matchSearch：空输入返回全部", () => {
  assert.strictEqual(Q.matchSearch(fixture[0], ""), true);
  assert.strictEqual(Q.matchSearch(fixture[0], "   "), true);
});

test("matchMain：主属性精确匹配，不限通过", () => {
  assert.strictEqual(Q.matchMain(fixture[0], "攻"), true);
  assert.strictEqual(Q.matchMain(fixture[0], "血"), false);
  assert.strictEqual(Q.matchMain(fixture[0], ""), true);
  assert.strictEqual(Q.matchMain(fixture[0], null), true);
});

test("hasSubAttr：只认副属性，主属性不算", () => {
  assert.strictEqual(Q.hasSubAttr(fixture[0], "穿透"), true);
  assert.strictEqual(Q.hasSubAttr(fixture[0], "攻"), false);
  assert.strictEqual(Q.hasSubAttr(fixture[2], "血"), true);
  assert.strictEqual(Q.hasSubAttr(fixture[6], "血"), true);
  assert.strictEqual(Q.hasSubAttr(fixture[5], "血"), false);
});

test("matchFilters：副属性 AND 语义", () => {
  assert.strictEqual(Q.matchFilters(fixture[0], ["血", "穿透"]), true);
  assert.strictEqual(Q.matchFilters(fixture[0], ["血", "暴击"]), false);
});

test("sortValue：最高值", () => {
  assert.strictEqual(Q.sortValue(fixture[0], "穿透", "max"), 15);
  assert.strictEqual(Q.sortValue(fixture[1], "攻", "max"), null);
  assert.strictEqual(Q.sortValue(fixture[6], "血", "max"), 5);
});

test("sortValue：红色/红金档", () => {
  assert.strictEqual(Q.sortValue(fixture[2], "血", "红色"), 25);
  assert.strictEqual(Q.sortValue(fixture[2], "血", "红金"), 30);
  assert.strictEqual(Q.sortValue(fixture[0], "穿透", "红色"), 10);
  assert.strictEqual(Q.sortValue(fixture[1], "攻", "红金"), null);
  assert.strictEqual(Q.sortValue(fixture[6], "血", "红色"), null);
});

test("queryItems：无筛选按分类顺序", () => {
  const r = Q.queryItems(fixture, {});
  assert.deepStrictEqual(r.map(i => i.name), ["朔日辉光", "吉祥如意", "月光耳坠", "神兵破阵弓", "测试防具", "测试饰品", "神兵月光"]);
});

test("queryItems：副属性筛选不包含仅主属性", () => {
  const r = Q.queryItems(fixture, { filters: ["攻"] });
  assert.deepStrictEqual(r.map(i => i.name), []);
});

test("queryItems：主属性筛选", () => {
  const r = Q.queryItems(fixture, { main: "血" });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "测试饰品", "神兵月光"]);
});

test("queryItems：主属性 + 副属性 AND", () => {
  const r = Q.queryItems(fixture, { main: "血", filters: ["血"] });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "神兵月光"]);
});

test("queryItems：筛选后按最高值倒序", () => {
  const r = Q.queryItems(fixture, { filters: ["血"] });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "神兵月光", "朔日辉光", "测试防具"]);
});

test("queryItems：红色档排序且无值排最后", () => {
  const r = Q.queryItems(fixture, { filters: ["血"], valueSource: "红色" });
  assert.deepStrictEqual(r.map(i => i.name), ["月光耳坠", "神兵月光", "朔日辉光", "测试防具"]);
});

test("queryItems：双筛选 + 切换排序属性", () => {
  const byCrit = Q.queryItems(fixture, { filters: ["血", "暴击"], sortAttr: "暴击" });
  assert.deepStrictEqual(byCrit.map(i => i.name), ["神兵月光", "月光耳坠"]);
  const byBlood = Q.queryItems(fixture, { filters: ["血", "暴击"], sortAttr: "血" });
  assert.deepStrictEqual(byBlood.map(i => i.name), ["月光耳坠", "神兵月光"]);
});
