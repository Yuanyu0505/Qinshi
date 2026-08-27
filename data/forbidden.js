(function (root, factory) {
  var data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  root.FORBIDDEN_DATA = data;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function template(contribution5, contribution10, rankingRows, equipmentFragments, machineBeasts, nuclei, orangeDrops) {
    return {
      contribution: { "5W": contribution5, "10W": contribution10 },
      rankingRows: rankingRows,
      equipmentFragments: equipmentFragments,
      machineBeasts: machineBeasts,
      nuclei: nuclei,
      orangeDrops: orangeDrops
    };
  }

  function disciple(name, base, divine) {
    return { name: name, base: base || "", divine: divine || "" };
  }

  var templates = {
    white_snow: template(
      ["链蛇软剑", "雪霁", "蚩尤"],
      ["共工戟", "道经师宝玉"],
      [
        ["尚书", "左传", "奇门遁甲"],
        ["女神之泪", "冰魄戒"],
        ["醉梦罗裳", "升雪凌霄衣", "无极黑袍", "管事服"]
      ],
      ["链蛇软剑", "雪霁", "蚩尤", "醉梦罗裳", "升雪凌霄衣", "管事服", "无极黑袍", "女神之泪", "冰魄戒", "道经师宝玉", "共工戟"],
      ["王蛇", "玄武", "朱雀", "蜃楼", "兵魔神", "年兽", "白虎", "南瓜", "九头", "青龙", "元兽"],
      ["蜃楼", "兵魔神", "年兽", "九头", "南瓜", "元兽", "青龙", "白虎", "玄武", "朱雀", "王蛇"],
      ["链蛇软剑", "蚩尤", "醉梦罗裳", "升雪凌霄衣"]
    ),
    soul_gathering: template(
      ["衍天星迹", "渊虹", "凤鸣白舞"],
      ["礼经"],
      [
        ["左传", "奇门遁甲"],
        ["金乌神饰"],
        ["醉梦罗裳", "万象法袍", "幽兰素裳", "纵横战袍"]
      ],
      ["衍天星迹", "渊虹", "凤鸣白舞", "醉梦罗裳", "万象法袍", "幽兰素裳", "纵横战袍", "金乌神饰", "白玉君子佩"],
      ["王蛇", "玄武", "朱雀", "白虎", "青龙", "元兽", "蜃楼", "兵魔神", "年兽", "南瓜怪人", "九头勾玉"],
      ["蜃楼", "兵魔神", "年兽", "九头", "南瓜", "元兽", "青龙", "白虎", "玄武", "朱雀", "王蛇"],
      ["衍天星迹", "凤鸣白舞", "醉梦罗裳", "万象法袍"]
    ),
    yin_yang: template(
      ["衍天星迹", "真刚", "秋骊"],
      ["道经师宝玉", "星云法衣", "幽兰素裳", "藏刃衣", "万象法袍"],
      [
        ["左传", "列子"],
        ["金乌神饰", "百鸟信物"],
        ["星云法衣", "幽兰素裳", "藏刃衣", "万象法袍"]
      ],
      ["衍天星迹", "真刚", "秋骊", "星云法衣", "幽兰素裳", "藏刃衣", "万象法袍", "金乌神饰", "百鸟信物", "道经师宝玉"],
      ["破土三郎", "王蛇", "玄武", "元兽", "青龙", "零号白虎", "神龙", "蜃楼"],
      ["元兽", "青龙", "零号", "神龙", "蜃楼", "三郎", "玄武", "王蛇"],
      ["衍天星迹", "真刚", "秋骊", "万象法袍"]
    ),
    life_and_death: template(
      ["女神之泪"],
      ["道经师宝玉", "碧海珊瑚樽", "神农令"],
      [
        ["左传", "尚书"],
        ["巨阙", "寒蝉", "百战穿甲弩", "蚩尤"],
        ["七海蛟龙甲", "管事服", "月华战袍"]
      ],
      ["巨阙", "寒蝉", "百战穿甲弩", "蚩尤", "七海蛟龙甲", "管事服", "月华战袍", "道经师宝玉", "碧海珊瑚樽", "女神之泪"],
      ["破土三郎", "零号白虎", "神龙", "蜃楼", "兵魔神", "年兽", "九头勾玉", "南瓜怪人"],
      ["三郎", "零号", "神龙", "蜃楼", "兵魔神", "年兽", "九头", "南瓜"],
      ["巨阙", "寒蝉", "管事服", "七海蛟龙甲"]
    ),
    observe_the_depths: template(
      ["潜蛟", "赤霄", "惊鲵", "撼地镰"],
      ["道经师宝玉", "金乌神饰"],
      [
        ["吕氏春秋"],
        ["神农令", "金乌神饰"],
        ["管事服", "藏刃衣", "月狼锦纱"]
      ],
      ["赤霄", "潜蛟", "惊鲵", "撼地镰", "管事服", "藏刃衣", "月狼锦纱", "神农令", "金乌神饰"],
      ["铜人", "朱雀", "破土三郎", "青龙", "零号白虎", "元兽", "神龙", "兵魔神", "年兽", "南瓜怪人", "九头勾玉"],
      ["元兽", "青龙", "零号", "神龙", "兵魔神", "年兽", "九头", "南瓜", "朱雀", "铜人", "三郎"],
      ["赤霄", "潜蛟", "惊鲵", "撼地镰"]
    ),
    shadow_hunt: template(
      ["秋骊", "龙骧"],
      ["碧海珊瑚樽", "道经师宝玉"],
      [
        ["吕氏春秋"],
        ["碧海珊瑚樽", "道经师宝玉"],
        ["藏刃衣", "幽兰素裳"]
      ],
      ["秋骊", "龙骧", "幽兰素裳", "藏刃衣", "道经师宝玉", "碧海珊瑚樽"],
      ["王蛇", "玄武", "朱雀", "蜃楼", "兵魔神", "年兽"],
      ["兵魔神", "年兽", "朱雀", "蜃楼", "玄武", "王蛇"],
      ["秋骊", "龙骧", "幽兰素裳", "藏刃衣"]
    ),
    song_dance: template(
      ["链蛇软剑", "号钟琴"],
      ["金乌神饰"],
      [
        ["南华真经"],
        ["金乌神饰", "女神之泪"],
        ["幽兰素裳", "醉梦罗裳"]
      ],
      ["号钟琴", "链蛇软剑", "幽兰素裳", "醉梦罗裳", "金乌神饰", "女神之泪"],
      ["青龙", "元兽", "王蛇", "玄武", "蜃楼"],
      ["元兽", "青龙", "蜃楼", "玄武", "王蛇"],
      ["号钟琴", "链蛇软剑", "幽兰素裳", "醉梦罗裳"]
    ),
    dragon_might: template(
      ["非攻·九变", "君临霸王枪"],
      ["三军虎符"],
      [
        ["吕氏春秋", "南华真经"],
        ["鬼谷戒", "三军虎符"],
        ["圣贤服", "七海蛟龙甲"]
      ],
      ["非攻·九变", "君临霸王枪", "圣贤服", "七海蛟龙甲"],
      ["破土三郎", "零号白虎", "神龙", "朱雀", "兵魔神", "年兽"],
      ["兵魔神", "年兽", "零号", "神龙", "朱雀", "三郎"],
      ["非攻·九变", "君临霸王枪", "圣贤服", "七海蛟龙甲"]
    ),
    no_two_suns: template(
      ["虎魄", "凤鸣白舞"],
      ["碧海珊瑚樽"],
      [
        ["吕氏春秋"],
        ["花间雾", "碧海珊瑚樽"],
        ["醉梦罗裳", "管事服"]
      ],
      ["虎魄", "凤鸣白舞", "管事服", "醉梦罗裳", "碧海珊瑚樽", "花间雾"],
      ["青龙", "元兽", "零号白虎", "神龙"],
      ["元兽", "青龙", "零号", "神龙"],
      ["虎魄", "凤鸣白舞", "醉梦罗裳", "管事服"]
    ),
    wind_forest_fire_mountain: template(
      ["腾龙枪", "破阵弓"],
      ["三军虎符"],
      [
        ["鬼谷子", "南华真经"],
        ["三军虎符"],
        ["七海蛟龙甲"]
      ],
      ["腾龙枪", "破阵弓", "月华战袍", "七海蛟龙甲", "白玉君子佩", "影虎", "黄金牡丹"],
      ["王蛇", "玄武", "朱雀", "蜃楼", "兵魔神", "年兽"],
      ["兵魔神", "年兽", "蜃楼", "玄武", "朱雀", "王蛇"],
      ["腾龙枪", "破阵弓", "月华战袍", "七海蛟龙甲", "影虎", "白玉君子佩", "黄金牡丹"]
    )
  };

  var groups = {
    song_dance: [disciple("兰轩紫女", "防", "攻"), disciple("凤吟弄玉", "", "防")],
    yin_yang: [disciple("极诣星魂", "内"), disciple("素华少司命", "血"), disciple("肃杀真刚", "防", "防"), disciple("天宗晓梦", "血")],
    dragon_might: [disciple("侠道天明", "", "血"), disciple("王道少羽", "", "防")],
    life_and_death: [disciple("巨阙陈胜", "攻"), disciple("寒蝉吴旷", "防"), disciple("兵家王翦", "内", "血"), disciple("龙魂小黎", "血")],
    no_two_suns: [disciple("荼蘼田蜜", "血", "血"), disciple("霸道田虎", "血", "攻")],
    observe_the_depths: [disciple("潜蛟韩信", "血", "血"), disciple("赤霄刘季", "防", "血"), disciple("惊鲵田言", "攻", "攻"), disciple("梅三娘", "内", "防")],
    wind_forest_fire_mountain: [disciple("将威龙且"), disciple("贯侯钟离昧"), disciple("隐虎季布")],
    white_snow: [disciple("红莲赤练", "内", "血"), disciple("墨家雪女", "攻", "血"), disciple("人宗逍遥子", "血"), disciple("蚩魔卫庄", "内", "攻")],
    shadow_hunt: [disciple("秋水晓梦", "血", "攻"), disciple("龙骧章邯", "攻", "血")],
    soul_gathering: [disciple("太虚月神", "攻", "攻"), disciple("森罗大司命", "防", "攻"), disciple("镜仙端木蓉", "防"), disciple("渊虹盖聂", "攻")]
  };

  function occurrence(id, start, end, size, templateId) {
    return {
      id: id,
      start: start,
      end: end,
      size: size,
      templateId: templateId,
      disciples: groups[templateId]
    };
  }

  var occurrences = [
    occurrence("2026-07-30_song_dance", "2026-07-30", "2026-08-02", "大", "song_dance"),
    occurrence("2026-08-03_yin_yang", "2026-08-03", "2026-08-05", "小", "yin_yang"),
    occurrence("2026-08-06_dragon_might", "2026-08-06", "2026-08-09", "大", "dragon_might"),
    occurrence("2026-08-10_life_and_death", "2026-08-10", "2026-08-12", "小", "life_and_death"),
    occurrence("2026-08-13_no_two_suns", "2026-08-13", "2026-08-16", "大", "no_two_suns"),
    occurrence("2026-08-17_observe_the_depths", "2026-08-17", "2026-08-19", "小", "observe_the_depths"),
    occurrence("2026-08-20_wind_forest_fire_mountain", "2026-08-20", "2026-08-23", "大", "wind_forest_fire_mountain"),
    occurrence("2026-08-24_white_snow", "2026-08-24", "2026-08-26", "小", "white_snow"),
    occurrence("2026-08-27_shadow_hunt", "2026-08-27", "2026-08-30", "大", "shadow_hunt"),
    occurrence("2026-08-31_soul_gathering", "2026-08-31", "2026-09-02", "小", "soul_gathering"),
    occurrence("2026-09-03_song_dance", "2026-09-03", "2026-09-06", "大", "song_dance"),
    occurrence("2026-09-07_yin_yang", "2026-09-07", "2026-09-09", "小", "yin_yang"),
    occurrence("2026-09-10_dragon_might", "2026-09-10", "2026-09-13", "大", "dragon_might"),
    occurrence("2026-09-14_life_and_death", "2026-09-14", "2026-09-16", "小", "life_and_death"),
    occurrence("2026-09-17_wind_forest_fire_mountain", "2026-09-17", "2026-09-20", "大", "wind_forest_fire_mountain"),
    occurrence("2026-09-21_observe_the_depths", "2026-09-21", "2026-09-23", "小", "observe_the_depths"),
    occurrence("2026-09-24_no_two_suns", "2026-09-24", "2026-09-27", "大", "no_two_suns"),
    occurrence("2026-09-28_white_snow", "2026-09-28", "2026-09-30", "小", "white_snow"),
    occurrence("2026-10-01_shadow_hunt", "2026-10-01", "2026-10-04", "大", "shadow_hunt"),
    occurrence("2026-10-05_soul_gathering", "2026-10-05", "2026-10-07", "小", "soul_gathering"),
    occurrence("2026-10-08_song_dance", "2026-10-08", "2026-10-11", "大", "song_dance"),
    occurrence("2026-10-12_yin_yang", "2026-10-12", "2026-10-14", "小", "yin_yang")
  ];

  return {
    meta: { year: 2026, firstDate: "2026-07-30", lastDate: "2026-10-14" },
    templates: templates,
    occurrences: occurrences
  };
});
