/* 三绝神兵：2026-10-29图片及用户确认。仅红金满锻副属性已知。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) api.apply(root);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STAGES = ['0→1锻', '1→2锻', '2→3锻', '3→4锻', '4→5锻', '5→6锻',
    '6→7锻', '7→8锻', '8→9锻', '9→10锻', '10锻→红金'];
  var WEAPONS = [
    {
      name: '焚天钺', values: [['攻', 25], ['穿透', 15]],
      effect: '开场提升10%攻击，3回合；每拥有1把满锻神兵·焚天钺（背包中生效），全队暴击伤害提升1.5%，最多10层。',
      materials: ['乱神', '破阵霸王枪', '真刚', ['凌虚', '木剑'], '刺客列传', '焚天钺',
        null, '掩日', '天罡斧', '蚩尤', '焚天钺']
    },
    {
      name: '青岚刀', values: [['血', 25], ['技免', 15]],
      effect: '开场获得总血量15%的化劲；每拥有1把满锻神兵·青岚刀（背包中生效），全队抗暴击提升1.5%，最多10层。',
      materials: ['双剑魍魉', '非攻', '断水', ['凌虚', '木剑'], '五德终始', '青岚刀',
        null, '镇岳', '撼地镰', '镇天刃', '青岚刀']
    },
    {
      name: '听潮笛', values: [['攻', 20], ['血', 20]],
      effect: '开场提升15%暴击，3回合；每拥有1把满锻神兵·听潮笛（背包中生效），全队攻击提升1%，最多10层。',
      materials: ['水寒', '羽刃', '号钟琴', ['凌虚', '木剑'], '乐经', '听潮笛',
        null, '怒涛', '天问', '凤鸟自舞', '听潮笛']
    }
  ];
  function insert(items, item) {
    if (items.some(function (entry) { return entry.id === item.id || entry.cat === item.cat && entry.name === item.name; })) return;
    var last = -1;
    items.forEach(function (entry, index) { if (entry.cat === item.cat) last = index; });
    items.splice(last + 1, 0, item);
  }
  function metadata(data) {
    data.meta = data.meta || {};
    data.meta.total = data.items.length;
    data.meta.version = '20261029';
    data.meta.contentUpdatedAt = '2026-10-29';
    data.meta.contentSource = '既有资料及2026-10-29三绝神兵图片、用户确认';
  }
  function updateEquipment(data) {
    if (!data || !Array.isArray(data.items)) return;
    WEAPONS.forEach(function (weapon, index) {
      var tokens = weapon.values.map(function (value) { return { t: value[0], v: value[1], raw: value[1] + '%' + value[0] }; });
      var max = {};
      tokens.forEach(function (token) { max[token.t] = token.v; });
      insert(data.items, {
        id: 'eq-20261029-0' + (index + 1), cat: '神兵武器', name: '神兵' + weapon.name, main: '攻',
        tiers: { '橙色': [], '橙金': [], '红色': [], '红金': tokens }, max: max,
        unknownTiers: ['橙色', '橙金', '红色'], exclusiveEffect: weapon.effect,
        searchAliases: [weapon.name, '神兵·' + weapon.name]
      });
    });
    metadata(data);
  }
  function updateForging(data) {
    if (!data || !Array.isArray(data.items)) return;
    WEAPONS.forEach(function (weapon, index) {
      insert(data.items, {
        id: 'f-20261029-0' + (index + 1), cat: '武器', name: weapon.name, quality: '橙',
        stages: STAGES.map(function (stage, step) {
          var material = weapon.materials[step];
          return { stage: stage, tokens: material ? [].concat(material).map(function (name) {
            return { n: name, q: step <= 4 ? '紫' : '橙' };
          }) : [] };
        })
      });
    });
    metadata(data);
  }
  function apply(target) {
    if (!target) return;
    updateEquipment(target.SPECIAL_EQUIPMENT_DATA);
    updateForging(target.FORGING_DATA);
  }
  return { apply: apply, updateEquipment: updateEquipment, updateForging: updateForging };
});
