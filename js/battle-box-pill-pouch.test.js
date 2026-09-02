const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/battle-box-pill-pouch.js");

test("战匣丹囊数据包含零级与一至九十级", () => {
  assert.strictEqual(DATA.battleLevels.length, 91);
  assert.strictEqual(DATA.pouchLevels.length, 91);
  assert.deepStrictEqual(DATA.battleLevels[0], {
    level: 0,
    pearls: 0,
    shells: 0,
    attack: 0,
    defense: 0,
    health: 0,
    pvpMitigation: 0
  });
  assert.deepStrictEqual(DATA.pouchLevels[0], {
    level: 0,
    pearls: 0,
    shells: 0,
    bonusPercent: 0
  });
});

test("战匣材料是单级需求并保留确认后的属性", () => {
  assert.strictEqual(DATA.battleLevels[51].pearls, 217);
  assert.strictEqual(DATA.battleLevels[51].attack, 49409);
  assert.strictEqual(DATA.battleLevels[51].defense, 49409);
  assert.strictEqual(DATA.battleLevels[51].health, 395276);
  assert.strictEqual(DATA.battleLevels[61].health, 557660);
});

test("品质上限和购买默认值与确认规则一致", () => {
  assert.deepStrictEqual(DATA.battleQualityCaps, {
    green: 2,
    blue: 3,
    purple: 5,
    orange: 8,
    orangeGold: 12,
    red: 15,
    redGold: 20
  });
  assert.deepStrictEqual(DATA.pouchQualityCaps, {
    green: 1,
    blue: 2,
    purple: 3,
    orange: 4,
    heaven: 5,
    immortal: 6,
    sacred: 8,
    divine: 10
  });
  assert.deepStrictEqual(DATA.defaults.purchase, {
    pearls: { packSize: 5, packPrice: 20 },
    shells: { packSize: 10, packPrice: 300 }
  });
});
