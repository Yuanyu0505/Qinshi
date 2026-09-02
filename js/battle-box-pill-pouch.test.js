const { test } = require("node:test");
const assert = require("node:assert");

const DATA = require("../data/battle-box-pill-pouch.js");
const CORE = require("./battle-box-pill-pouch.js");

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

test("玩家等级上限覆盖全部边界", () => {
  assert.strictEqual(CORE.battlePlayerCap(45, DATA), null);
  assert.strictEqual(CORE.battlePlayerCap(46, DATA), 70);
  assert.strictEqual(CORE.battlePlayerCap(53, DATA), 70);
  assert.strictEqual(CORE.battlePlayerCap(54, DATA), 90);
  assert.strictEqual(CORE.pouchPlayerCap(45, DATA), null);
  assert.strictEqual(CORE.pouchPlayerCap(46, DATA), 40);
  assert.strictEqual(CORE.pouchPlayerCap(56, DATA), 40);
  assert.strictEqual(CORE.pouchPlayerCap(57, DATA), 50);
  assert.strictEqual(CORE.pouchPlayerCap(59, DATA), 50);
  assert.strictEqual(CORE.pouchPlayerCap(60, DATA), 60);
  assert.strictEqual(CORE.pouchPlayerCap(67, DATA), 70);
  assert.strictEqual(CORE.pouchPlayerCap(74, DATA), 80);
  assert.strictEqual(CORE.pouchPlayerCap(80, DATA), 90);
});

test("槽位品质从基础十级计算物品上限", () => {
  const orangeEquipment = DATA.equipmentSlots.map(slot => ({
    slotId: slot.id,
    itemName: slot.name + "甲",
    quality: "orange"
  }));
  const redGoldEquipment = orangeEquipment.map(item => ({ ...item, quality: "redGold" }));
  assert.strictEqual(CORE.battleItemCap([], DATA), 10);
  assert.strictEqual(CORE.battleItemCap(orangeEquipment, DATA), 42);
  assert.strictEqual(CORE.battleItemCap(redGoldEquipment, DATA), 90);
  assert.strictEqual(CORE.pouchItemCap([], DATA), 10);
  assert.strictEqual(CORE.pouchItemCap(Array(8).fill({ quality: "orange" }), DATA), 42);
  assert.strictEqual(CORE.pouchItemCap(Array(8).fill({ quality: "divine" }), DATA), 90);
});

test("降低品质保留当前等级并标记超限", () => {
  const disciple = CORE.normalizeDisciple({
    id: "atlas-t-0001",
    name: "测试弟子",
    sourceType: "atlas",
    atlasId: "t-0001",
    battle: {
      currentLevel: 80,
      slots: DATA.equipmentSlots.map(slot => ({
        slotId: slot.id,
        itemName: slot.name,
        quality: "orange"
      }))
    },
    pouch: {
      currentLevel: 50,
      slots: Array(8).fill({ quality: "orange" })
    }
  }, DATA);
  const caps = CORE.effectiveCaps(80, disciple, DATA);
  assert.strictEqual(disciple.battle.currentLevel, 80);
  assert.strictEqual(caps.battle.effectiveCap, 42);
  assert.strictEqual(caps.battle.overCap, true);
  assert.strictEqual(disciple.pouch.currentLevel, 50);
  assert.strictEqual(caps.pouch.effectiveCap, 42);
  assert.strictEqual(caps.pouch.overCap, true);
});

test("归一化账号保留共享库存和可编辑购买参数", () => {
  assert.deepStrictEqual(CORE.normalizeAccount({
    playerLevel: "80",
    inventory: { pearls: "123", shells: 45 },
    purchase: {
      pearls: { packSize: 50, packPrice: 18 },
      shells: { packSize: 6, packPrice: 280 }
    },
    systemPriority: "pouch"
  }, DATA), {
    playerLevel: 80,
    inventory: { pearls: 123, shells: 45 },
    purchase: {
      pearls: { packSize: 50, packPrice: 18 },
      shells: { packSize: 6, packPrice: 280 }
    },
    systemPriority: "pouch"
  });
});
