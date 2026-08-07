const { test } = require("node:test");
const assert = require("node:assert");
const F = require("./forging.js");

const fixture = [
  { id: "f-0001", cat: "武器", name: "雷神锤", quality: "橙", stages: [
    { stage: "0-1锻", tokens: [{ n: "非攻", q: "紫" }] },
    { stage: "3-4锻", tokens: [{ n: "凌虚", q: "紫" }, { n: "木剑", q: "紫" }] },
    { stage: "6-7锻", tokens: [{ dash: true }] },
    { stage: "7-8锻", tokens: [{ n: "鲨齿", q: "橙" }] }
  ] },
  { id: "f-0002", cat: "典籍", name: "胡非子", quality: "橙", stages: [
    { stage: "0-1锻", tokens: [{ dash: true }] },
    { stage: "3-4锻", tokens: [{ n: "非攻", q: "紫" }] }
  ] }
];

test("normalizeName：去除首尾空格", () => {
  assert.strictEqual(F.normalizeName("  雷神锤 "), "雷神锤");
  assert.strictEqual(F.normalizeName(""), "");
});

test("splitMaterials：每个种类拆为一行", () => {
  assert.deepStrictEqual(F.splitMaterials("10紫石2橙石"), ["10紫石", "2橙石"]);
  assert.deepStrictEqual(F.splitMaterials("12橙石5红石"), ["12橙石", "5红石"]);
  assert.deepStrictEqual(F.splitMaterials("50紫石54橙石24红石"), ["50紫石", "54橙石", "24红石"]);
  assert.deepStrictEqual(F.splitMaterials(""), []);
  assert.deepStrictEqual(F.splitMaterials("无"), ["无"]);
});

test("findMain：按名称模糊匹配主锻造装备", () => {
  const r = F.findMain(fixture, "雷神");
  assert.deepStrictEqual(r.map(i => i.name), ["雷神锤"]);
  const r2 = F.findMain(fixture, "非子");
  assert.deepStrictEqual(r2.map(i => i.name), ["胡非子"]);
});

test("findMain：空输入与无结果返回空数组", () => {
  assert.deepStrictEqual(F.findMain(fixture, ""), []);
  assert.deepStrictEqual(F.findMain(fixture, "   "), []);
  assert.deepStrictEqual(F.findMain(fixture, "不存在"), []);
});

test("findAsMaterial：找出作为素材参与的主装备及命中阶段", () => {
  const r = F.findAsMaterial(fixture, "非攻");
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0].item.name, "雷神锤");
  assert.deepStrictEqual(r[0].hitStages, [0]);
  assert.deepStrictEqual(r[1].item.name, "胡非子");
  assert.deepStrictEqual(r[1].hitStages, [1]);
});

test("findAsMaterial：多素材格命中正确阶段", () => {
  const r = F.findAsMaterial(fixture, "木剑");
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0].hitStages, [1]);
});

test("findAsMaterial：横杠不参与素材匹配", () => {
  const r = F.findAsMaterial(fixture, "-");
  assert.strictEqual(r.length, 0);
});

test("findAsMaterial：空输入与无结果返回空数组", () => {
  assert.deepStrictEqual(F.findAsMaterial(fixture, ""), []);
  assert.deepStrictEqual(F.findAsMaterial(fixture, "不存在"), []);
});
