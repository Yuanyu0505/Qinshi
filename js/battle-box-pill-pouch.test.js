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

test("材料按上一等级升至本等级逐行累计", () => {
  assert.strictEqual(CORE.costBetween(DATA.battleLevels, 50, 51).pearls, 217);
  const expectedPearls = DATA.battleLevels.slice(51, 56)
    .reduce((sum, row) => sum + row.pearls, 0);
  const expectedShells = DATA.battleLevels.slice(51, 56)
    .reduce((sum, row) => sum + row.shells, 0);
  assert.deepStrictEqual(CORE.costBetween(DATA.battleLevels, 50, 55), {
    pearls: expectedPearls,
    shells: expectedShells
  });
  assert.deepStrictEqual(CORE.costBetween(DATA.pouchLevels, 0, 1), {
    pearls: DATA.pouchLevels[1].pearls,
    shells: DATA.pouchLevels[1].shells
  });
});

test("属性差值按当前与目标等级分别计算", () => {
  assert.deepStrictEqual(CORE.attributeDelta("battle", 50, 51, DATA), {
    attack: DATA.battleLevels[51].attack - DATA.battleLevels[50].attack,
    defense: DATA.battleLevels[51].defense - DATA.battleLevels[50].defense,
    health: DATA.battleLevels[51].health - DATA.battleLevels[50].health,
    pvpMitigation: DATA.battleLevels[51].pvpMitigation - DATA.battleLevels[50].pvpMitigation
  });
  assert.deepStrictEqual(CORE.attributeDelta("pouch", 40, 50, DATA), {
    bonusPercent: 50
  });
});

function plannerDisciple(id, battleLevel, pouchLevel) {
  return CORE.normalizeDisciple({
    id,
    name: id,
    battle: {
      currentLevel: battleLevel,
      slots: DATA.equipmentSlots.map(slot => ({
        slotId: slot.id,
        itemName: slot.name,
        quality: "redGold"
      }))
    },
    pouch: {
      currentLevel: pouchLevel,
      slots: Array(8).fill({ quality: "divine" })
    }
  }, DATA);
}

test("共享库存先满足排在前面的弟子", () => {
  const first = plannerDisciple("甲", 0, 0);
  const second = plannerDisciple("乙", 0, 0);
  const oneLevel = CORE.costBetween(DATA.battleLevels, 0, 1);
  const account = CORE.normalizeAccount({
    playerLevel: 80,
    inventory: oneLevel,
    systemPriority: "battle"
  }, DATA);
  const selections = [first, second].map(disciple => ({
    disciple,
    battleEnabled: true,
    battleTarget: 1,
    pouchEnabled: false,
    pouchTarget: 0
  }));
  const result = CORE.calculatePlan(selections, account, DATA);
  assert.deepStrictEqual(result.allocations.map(item => [item.discipleId, item.reachableLevel]), [
    ["甲", 1],
    ["乙", 0]
  ]);
  const reversed = CORE.calculatePlan(selections.slice().reverse(), account, DATA);
  assert.deepStrictEqual(reversed.allocations.map(item => [item.discipleId, item.reachableLevel]), [
    ["乙", 1],
    ["甲", 0]
  ]);
});

test("同一弟子内的战匣丹囊优先级决定材料分配", () => {
  const disciple = plannerDisciple("甲", 0, 0);
  const battleOne = CORE.costBetween(DATA.battleLevels, 0, 1);
  const account = CORE.normalizeAccount({
    playerLevel: 80,
    inventory: battleOne,
    systemPriority: "battle"
  }, DATA);
  const base = {
    disciple,
    battleEnabled: true,
    battleTarget: 1,
    pouchEnabled: true,
    pouchTarget: 1
  };
  const battleFirst = CORE.calculatePlan([{ ...base, systemPriority: "battle" }], account, DATA);
  assert.deepStrictEqual(battleFirst.allocations.map(item => [item.kind, item.reachableLevel]), [
    ["battle", 1],
    ["pouch", 0]
  ]);
  const pouchFirst = CORE.calculatePlan([{ ...base, systemPriority: "pouch" }], account, DATA);
  assert.strictEqual(pouchFirst.allocations[0].kind, "pouch");
  assert.strictEqual(pouchFirst.allocations[0].reachableLevel, 1);
});

test("完整目标缺口不受分配顺序影响并按整包购买", () => {
  const first = plannerDisciple("甲", 0, 0);
  const second = plannerDisciple("乙", 0, 0);
  const account = CORE.normalizeAccount({
    playerLevel: 80,
    inventory: { pearls: 1, shells: 0 }
  }, DATA);
  const selections = [first, second].map(disciple => ({
    disciple,
    battleEnabled: false,
    battleTarget: 0,
    pouchEnabled: true,
    pouchTarget: 1
  }));
  const result = CORE.calculatePlan(selections, account, DATA);
  const totalPearls = DATA.pouchLevels[1].pearls * 2;
  const totalShells = DATA.pouchLevels[1].shells * 2;
  assert.strictEqual(result.fullTarget.totals.pearls, totalPearls);
  assert.strictEqual(result.fullTarget.totals.shells, totalShells);
  assert.strictEqual(result.fullTarget.shortage.pearls, totalPearls - 1);
  assert.strictEqual(result.fullTarget.purchase.pearls.packs, Math.ceil((totalPearls - 1) / 5));
  assert.strictEqual(result.fullTarget.purchase.shells.packs, Math.ceil(totalShells / 10));
  assert.strictEqual(result.fullTarget.purchase.totalPrice,
    result.fullTarget.purchase.pearls.packs * 20 + result.fullTarget.purchase.shells.packs * 300);
});
