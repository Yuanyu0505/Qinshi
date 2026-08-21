(function (root, factory) {
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  if (root) root.MACHINE_BEAST_DATA = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var modifications = [
    { id: "none", name: "0改" },
    { id: "initial", name: "初改" },
    { id: "heaven", name: "天改" },
    { id: "immortal", name: "仙改" },
    { id: "saint", name: "圣改" },
    { id: "fullDivine", name: "满神改" }
  ];

  var researchThresholds = {
    0: 0, 1: 22800, 2: 47700, 3: 74500, 4: 103300, 5: 134000,
    6: 168800, 7: 201600, 8: 238300, 9: 277000, 10: 317700,
    11: 360400, 12: 405100, 13: 451800, 14: 500400, 15: 551000,
    16: 603700, 17: 658300, 18: 714900, 19: 773400, 20: 834000,
    21: 894600, 22: 955100, 23: 1015700, 24: 1076300, 25: 1136800
  };

  function orangeRank(values) {
    return {
      none: values[0], initial: values[1], heaven: values[2],
      immortal: values[3], saint: values[4], fullDivine: values[5]
    };
  }

  var researchValues = {
    orange: {
      "0": orangeRank([48000, 76200, 110700, 154500, 210000, 279000]),
      "1": orangeRank([48156, 76356, 110856, 154656, 210156, 279156]),
      "2": orangeRank([48558, 76758, 111258, 155058, 210558, 279558]),
      "3": orangeRank([49542, 77742, 112242, 156042, 211542, 280542]),
      "4": orangeRank([51534, 79734, 114234, 158034, 213534, 282534]),
      "5": orangeRank([56196, 84396, 118896, 162696, 218196, 287196]),
      "6": orangeRank([62904, 91104, 125604, 169404, 224904, 293904]),
      "7": orangeRank([75252, 103452, 137952, 181752, 237252, 306252]),
      "8": orangeRank([150504, 178704, 213204, 257004, 312504, 381504]),
      "9": orangeRank([301008, 329208, 363708, 407508, 463008, 532008]),
      "10": orangeRank([602016, 630216, 664716, 708516, 764016, 833016])
    },
    purple: {
      "0": { none: 12000 }, "1": { none: 12012 }, "2": { none: 12162 },
      "3": { none: 12564 }, "4": { none: 13938 }, "5": { none: 17532 },
      "6": { none: 35064 }
    },
    blue: {
      "0": { none: 1000 }, "1": { none: 1012 }, "2": { none: 1162 }
    }
  };

  var qualityRules = {
    "蓝色": { quality: "blue", maxLevel: 10, fragmentsPerBody: 10, contributionPerFragment: null, maxRank: 2 },
    "紫色": { quality: "purple", maxLevel: 15, fragmentsPerBody: 20, contributionPerFragment: null, maxRank: 6 },
    "橙一": { quality: "orange", maxLevel: 15, fragmentsPerBody: 40, contributionPerFragment: 600, maxRank: 10 },
    "橙二": { quality: "orange", maxLevel: 20, fragmentsPerBody: 40, contributionPerFragment: 600, maxRank: 10 },
    "橙三": { quality: "orange", maxLevel: 20, fragmentsPerBody: 40, contributionPerFragment: 800, maxRank: 10 },
    "橙四": { quality: "orange", maxLevel: 20, fragmentsPerBody: 40, contributionPerFragment: 1000, maxRank: 10 },
    "橙五": { quality: "orange", maxLevel: 25, fragmentsPerBody: 40, contributionPerFragment: null, maxRank: 10 }
  };

  function effects(level10, level15, level20, level25) {
    return [[10, level10], [15, level15], [20, level20], [25, level25]]
      .filter(function (item) { return Boolean(item[1]); })
      .map(function (item) { return { level: item[0], text: item[1] }; });
  }

  function beast(id, name, schoolId, tier, effectList) {
    var rule = qualityRules[tier];
    return {
      id: id,
      name: name,
      schoolId: schoolId,
      tier: tier,
      quality: rule.quality,
      maxLevel: rule.maxLevel,
      maxRank: rule.maxRank,
      fragmentsPerBody: rule.fragmentsPerBody,
      contributionPerFragment: rule.contributionPerFragment,
      effects: effectList
    };
  }

  var beasts = [
    beast("potu-qilang", "破土七郎", "hegemonic", "蓝色", effects("上阵弟子提升5%内力")),
    beast("eight-claw-centipede", "八爪铁蜈蚣", "hegemonic", "紫色", effects("上阵弟子提升9%防", "上阵弟子提升15%防")),
    beast("mechanical-bat", "机关蝙蝠", "hegemonic", "紫色", effects("上阵弟子提升3%暴击", "上阵弟子提升5%暴击")),
    beast("mechanical-sand-ship", "机关沙船", "hegemonic", "紫色", effects("上阵弟子提升7%血", "上阵弟子提升15%血")),
    beast("red-serpent", "赤练王蛇", "hegemonic", "橙一", effects("上阵弟子提升10%攻", "上阵弟子提升20%攻")),
    beast("potu-sanlang", "破土三郎", "hegemonic", "橙二", effects("上阵弟子提升4%暴击伤害", "上阵弟子提升7%暴击伤害", "上阵弟子提升11%暴击伤害")),
    beast("war-demon", "兵魔神", "hegemonic", "橙四", effects("机关兽行动后，有12%几率斩杀血量最少的目标", "机关兽行动后，有24%几率斩杀血量最少的目标", "机关兽行动后，有36%几率斩杀血量最少的目标")),
    beast("nine-headed-jade", "九头勾玉", "hegemonic", "橙四", effects("普通关卡产出8%概率翻倍", "普通关卡产出15%概率翻倍", "普通关卡产出25%概率翻倍")),
    beast("mirage-tower", "蜃楼", "hegemonic", "橙四", effects("大厅每日派遣上限提高3次", "大厅每日派遣上限提高6次", "大厅每日派遣上限提高10次")),
    beast("mechanical-yuan-beast", "机关元兽", "hegemonic", "橙四", effects("前排单位首次主动行动前，中级闪避提升8%", "前排单位首次主动行动前，中级闪避提升15%", "前排单位首次主动行动前，中级闪避提升25%")),
    beast("mechanical-divine-dragon", "机关神龙", "hegemonic", "橙四", effects("机关兽在场时，每有1个后排单位存活，全体后排加7%攻击的追伤", "机关兽在场时，每有1个后排单位存活，全体后排加13%攻击的追伤", "机关兽在场时，每有1个后排单位存活，全体后排加20%攻击的追伤")),
    beast("mechanical-bear", "机关熊罴", "hegemonic", "橙五", effects("后排单位主动行动后，使随机3名敌人抗暴下降5%，可叠加3层", "后排单位主动行动后，使随机3名敌人抗暴下降9%，可叠加3层", "后排单位主动行动后，使随机3名敌人抗暴下降14%，可叠加3层", "后排单位主动行动后，使随机3名敌人抗暴下降20%，可叠加3层")),
    beast("mechanical-flame-puppet", "机关炎傀", "hegemonic", "橙五", effects("机关兽行动后，使自身下回合伤害提升40%", "机关兽行动后，使自身下回合伤害提升70%", "机关兽行动后，使自身下回合伤害提升110%", "机关兽行动后，使自身下回合伤害提升150%")),
    beast("mechanical-yueliao", "机关岳獠", "hegemonic", "橙五", effects("上阵弟子提升2%真伤抵抗", "上阵弟子提升4%真伤抵抗", "上阵弟子提升7%真伤抵抗", "上阵弟子提升10%真伤抵抗")),

    beast("mechanical-snake", "机关蛇", "nonAttack", "蓝色", effects("上阵弟子提升3%抗暴击")),
    beast("mechanical-wing", "机关飞翼", "nonAttack", "蓝色", effects("上阵弟子提升3%技能穿透")),
    beast("four-claw-spider", "四爪铁蜘蛛", "nonAttack", "紫色", effects("上阵弟子提升3%技能减免", "上阵弟子提升5%技能减免")),
    beast("mechanical-bronze-man", "机关铜人", "nonAttack", "橙一", effects("上阵弟子提升4%暴击伤害减免", "上阵弟子提升7%暴击伤害减免")),
    beast("mechanical-azure-dragon", "机关青龙", "nonAttack", "橙三", effects("机关兽行动后，随机2名弟子解除负面状态", "机关兽行动后，随机3名弟子解除负面状态", "机关兽行动后，随机5名弟子解除负面状态")),
    beast("mechanical-white-tiger", "机关白虎", "nonAttack", "橙二", effects("我方弟子首次被清空神将护盾后，攻击、防御提升8%，内力下降5%", "我方弟子首次被清空神将护盾后，攻击、防御提升11%，内力下降5%", "我方弟子首次被清空神将护盾后，攻击、防御提升15%，内力下降5%")),
    beast("mechanical-vermilion-bird", "机关朱雀", "nonAttack", "橙二", effects("上阵弟子提升2%负面抵抗", "上阵弟子提升3%负面抵抗", "上阵弟子提升5%负面抵抗")),
    beast("mechanical-black-tortoise", "机关玄武", "nonAttack", "橙二", effects("贩卖鱼货时，每条额外获得2枚鱼币", "贩卖鱼货时，每条额外获得4枚鱼币", "贩卖鱼货时，每条额外获得6枚鱼币")),
    beast("zero-white-tiger", "零号白虎", "nonAttack", "橙三", effects("月卡每日领取的元宝提高50%", "月卡每日领取的元宝提高100%", "月卡每日领取的元宝提高150%")),
    beast("mechanical-year-beast", "机关年兽", "nonAttack", "橙四", effects("我方弟子主动行动后，技能穿透提升6%，可叠加3层", "我方弟子主动行动后，技能穿透提升10%，可叠加3层", "我方弟子主动行动后，技能穿透提升15%，可叠加3层")),
    beast("pumpkin-monster", "南瓜怪人", "nonAttack", "橙四", effects("每天魂道第1次失败不打断连胜", "每天魂道前2次失败不打断连胜", "每天魂道前4次失败不打断连胜")),
    beast("mechanical-qingluan", "机关青鸾", "nonAttack", "橙五", effects("机关兽在场时，每有1个前排单位存活，全体后排增加2%技能减免", "机关兽在场时，每有1个前排单位存活，全体后排增加4%技能减免", "机关兽在场时，每有1个前排单位存活，全体后排增加6%技能减免", "机关兽在场时，每有1个前排单位存活，全体后排增加9%技能减免")),
    beast("mechanical-kunpeng", "机关鲲鹏", "nonAttack", "橙五", effects("机关兽行动后，回复全体弟子8%神将护盾", "机关兽行动后，回复全体弟子15%神将护盾", "机关兽行动后，回复全体弟子24%神将护盾", "机关兽行动后，回复全体弟子33%神将护盾"))
  ];

  var schools = [
    {
      id: "hegemonic",
      name: "霸道机关术",
      beastIds: beasts.filter(function (item) { return item.schoolId === "hegemonic"; }).map(function (item) { return item.id; }),
      stages: [
        { stage: 1, requiredTotalLevel: 45, factionBonus: "总攻+2%", formationEffect: "以敌方初始攻击最低的后排单位为基准，使其他后排单位的初始攻击下降两者差值的12%", beastEffect: "我方弟子中的最高初始攻击和暴击，此两项属性高于上阵机关兽时，机关兽获得两者差值的14%" },
        { stage: 2, requiredTotalLevel: null, factionBonus: "总攻+4%", formationEffect: "以敌方初始攻击最低的后排单位为基准，使其他后排单位的初始攻击下降两者差值的24%", beastEffect: "我方弟子中的最高初始攻击和暴击，此两项属性高于上阵机关兽时，机关兽获得两者差值的28%" },
        { stage: 3, requiredTotalLevel: null, factionBonus: "总攻+6%", formationEffect: "以敌方初始攻击最低的后排单位为基准，使其他后排单位的初始攻击下降两者差值的36%", beastEffect: "我方弟子中的最高初始攻击和暴击，此两项属性高于上阵机关兽时，机关兽获得两者差值的42%" },
        { stage: 4, requiredTotalLevel: null, factionBonus: "总攻+8%", formationEffect: "以敌方初始攻击最低的后排单位为基准，使其他后排单位的初始攻击下降两者差值的48%", beastEffect: "我方弟子中的最高初始攻击和暴击，此两项属性高于上阵机关兽时，机关兽获得两者差值的56%" },
        { stage: 5, requiredTotalLevel: null, factionBonus: "总攻+10%", formationEffect: "以敌方初始攻击最低的后排单位为基准，使其他后排单位的初始攻击下降两者差值的60%", beastEffect: "我方弟子中的最高初始攻击和暴击，此两项属性高于上阵机关兽时，机关兽获得两者差值的70%" }
      ]
    },
    {
      id: "nonAttack",
      name: "非攻机关术",
      beastIds: beasts.filter(function (item) { return item.schoolId === "nonAttack"; }).map(function (item) { return item.id; }),
      stages: [
        { stage: 1, requiredTotalLevel: 45, factionBonus: "总血+3%", formationEffect: "以敌方初始技能减免最低的单位为基准，使其他单位的初始技能减免下降两者差值的8%", beastEffect: "我方弟子中的最高初始穿透和暴伤，此两项属性高于上阵机关兽时，机关兽获得两者差值的14%" },
        { stage: 2, requiredTotalLevel: null, factionBonus: "总血+6%", formationEffect: "以敌方初始技能减免最低的单位为基准，使其他单位的初始技能减免下降两者差值的16%", beastEffect: "我方弟子中的最高初始穿透和暴伤，此两项属性高于上阵机关兽时，机关兽获得两者差值的28%" },
        { stage: 3, requiredTotalLevel: null, factionBonus: "总血+9%", formationEffect: "以敌方初始技能减免最低的单位为基准，使其他单位的初始技能减免下降两者差值的24%", beastEffect: "我方弟子中的最高初始穿透和暴伤，此两项属性高于上阵机关兽时，机关兽获得两者差值的42%" },
        { stage: 4, requiredTotalLevel: null, factionBonus: "总血+12%", formationEffect: "以敌方初始技能减免最低的单位为基准，使其他单位的初始技能减免下降两者差值的32%", beastEffect: "我方弟子中的最高初始穿透和暴伤，此两项属性高于上阵机关兽时，机关兽获得两者差值的56%" },
        { stage: 5, requiredTotalLevel: null, factionBonus: "总血+15%", formationEffect: "以敌方初始技能减免最低的单位为基准，使其他单位的初始技能减免下降两者差值的40%", beastEffect: "我方弟子中的最高初始穿透和暴伤，此两项属性高于上阵机关兽时，机关兽获得两者差值的70%" }
      ]
    }
  ];

  return {
    modifications: modifications,
    researchThresholds: researchThresholds,
    researchValues: researchValues,
    qualityRules: qualityRules,
    resourceRules: { blueprintDivisor: 500, organPieceDivisor: 100, yuanPerContribution: 0.5 },
    effectLevels: [10, 15, 20, 25],
    beasts: beasts,
    schools: schools
  };
});
