const { test } = require("node:test");
const assert = require("node:assert");
const D = require("./drops.js");

const fixture = {
  normal: [
    { chapter: 56, stage: 10, item: "高级招募券" },
    { chapter: 40, stage: 10, item: "高级招募券" },
    { chapter: 53, stage: 7, item: "苍云甲" },
    { chapter: 30, stage: 7, item: "玄铁甲" },
    { chapter: 15, stage: 9, item: "银针" }
  ],
  hero: [
    { chapter: 35, stage: 5, item: "獬豸锦袍" },
    { chapter: 20, stage: 2, item: "苍云甲" },
    { chapter: 34, stage: 1, item: "银针" }
  ],
  reward: [
    { chapter: 56, item: "赤霄" },
    { chapter: 55, item: "河图" }
  ]
};

test("findDrops：关键字命中三个区域各自合并", () => {
  const r = D.findDrops(fixture, "银针");
  assert.deepStrictEqual(r.normal.map(e => `${e.chapter}-${e.stage}`), ["15-9"]);
  assert.deepStrictEqual(r.hero.map(e => `${e.chapter}-${e.stage}`), ["34-1"]);
  assert.deepStrictEqual(r.reward, []);
});

test("findDrops：普通关卡子串匹配", () => {
  const r = D.findDrops(fixture, "玄铁");
  assert.strictEqual(r.normal.length, 1);
  assert.strictEqual(r.hero.length, 0);
  assert.strictEqual(r.reward.length, 0);
});

test("findDrops：声望奖励匹配", () => {
  const r = D.findDrops(fixture, "赤霄");
  assert.deepStrictEqual(r.reward.map(e => e.chapter), [56]);
  assert.strictEqual(r.normal.length, 0);
});

test("findDrops：空查询与无结果返回空", () => {
  assert.deepStrictEqual(D.findDrops(fixture, ""), { normal: [], hero: [], reward: [] });
  assert.deepStrictEqual(D.findDrops(fixture, "   "), { normal: [], hero: [], reward: [] });
  assert.deepStrictEqual(D.findDrops(fixture, "不存在"), { normal: [], hero: [], reward: [] });
});

test("groupDrops：按道具分组，先道具后关卡", () => {
  const r = D.groupDrops(fixture, "银针");
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].item, "银针");
  assert.deepStrictEqual(r[0].normal, [{ chapter: 15, stage: 9 }]);
  assert.deepStrictEqual(r[0].hero, [{ chapter: 34, stage: 1 }]);
  assert.deepStrictEqual(r[0].reward, []);
});

test("groupDrops：同一道具多掉落合并", () => {
  const r = D.groupDrops(fixture, "招募券");
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].item, "高级招募券");
  assert.deepStrictEqual(r[0].normal, [{ chapter: 56, stage: 10 }, { chapter: 40, stage: 10 }]);
});

test("groupDrops：多个道具按出现顺序分组", () => {
  const r = D.groupDrops(fixture, "甲");
  assert.deepStrictEqual(r.map(g => g.item), ["苍云甲", "玄铁甲"]);
  assert.deepStrictEqual(r[0].normal, [{ chapter: 53, stage: 7 }]);
  assert.deepStrictEqual(r[0].hero, [{ chapter: 20, stage: 2 }]);
  assert.deepStrictEqual(r[1].normal, [{ chapter: 30, stage: 7 }]);
});

test("groupDrops：空查询与无结果返回空数组", () => {
  assert.deepStrictEqual(D.groupDrops(fixture, ""), []);
  assert.deepStrictEqual(D.groupDrops(fixture, "不存在"), []);
});

test("resolveNavigationTarget：四个入口映射到正确的查询分区与模式", () => {
  assert.deepStrictEqual(D.resolveNavigationTarget("atlas", "苍云甲"), {
    target: "atlas", partition: "atlas", item: "苍云甲", view: "query", mode: null
  });
  assert.deepStrictEqual(D.resolveNavigationTarget("forging-progress", "苍云甲"), {
    target: "forging-progress", partition: "forging", item: "苍云甲", view: "progress", mode: null
  });
  assert.deepStrictEqual(D.resolveNavigationTarget("forging-main", "苍云甲"), {
    target: "forging-main", partition: "forging", item: "苍云甲", view: "query", mode: "main"
  });
  assert.deepStrictEqual(D.resolveNavigationTarget("forging-material", "苍云甲"), {
    target: "forging-material", partition: "forging", item: "苍云甲", view: "query", mode: "material"
  });
  assert.strictEqual(D.resolveNavigationTarget("unknown", "苍云甲"), null);
  assert.strictEqual(D.resolveNavigationTarget("atlas", "  "), null);
});

test("createNavigationSession：目标状态未改变时允许恢复跳转前状态", () => {
  const sourceView = { query: "甲", scrollY: 618 };
  const targetView = { tab: "全部", query: "天问" };
  const appliedTargetView = { tab: "全部", query: "苍云甲" };
  const session = D.createNavigationSession("atlas", sourceView, targetView, appliedTargetView);

  assert.deepStrictEqual(session.sourceView, sourceView);
  assert.deepStrictEqual(session.targetView, targetView);
  assert.strictEqual(D.shouldRestoreNavigationTarget(session, { query: "苍云甲", tab: "全部" }), true);
});

test("shouldRestoreNavigationTarget：用户改动目标页后不恢复跳转前状态", () => {
  const session = D.createNavigationSession(
    "forging-main",
    { query: "甲", scrollY: 618 },
    { view: "query", mode: "material", query: "墨眉" },
    { view: "query", mode: "main", query: "苍云甲" }
  );

  assert.strictEqual(D.shouldRestoreNavigationTarget(session, {
    view: "query", mode: "main", query: "天问"
  }), false);
});
