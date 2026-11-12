/* 2026-11-12用户提供的新装备、锻造材料与弟子铭文。 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) api.apply(root);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function insertOnce(data, item) {
    if (!data || !Array.isArray(data.items)) return;
    if (data.items.some(function (entry) { return entry.name === item.name; })) return;
    var index = -1;
    data.items.forEach(function (entry, i) { if (entry.cat === item.cat) index = i; });
    data.items.splice(index + 1, 0, item);
    if (data.meta) data.meta.total = data.items.length;
  }
  function apply(target) {
    if (!target) return;
    var tiers = {};
    ['橙色', '橙金', '红色', '红金'].forEach(function (tier) {
      tiers[tier] = [{ t: '暴伤', v: 5, raw: '5%暴伤' }];
    });
    tiers['红金'].push({ t: '穿透', v: 5, raw: '5%穿透' });
    insertOnce(target.SPECIAL_EQUIPMENT_DATA, {
      id: 'eq-202611-01', cat: '饰品', name: '楚心玲珑匣', main: '血',
      tiers: tiers, max: { '暴伤': 5, '穿透': 5 }
    });
    var stages = ['0→1锻', '1→2锻', '2→3锻', '3→4锻', '4→5锻', '5→6锻',
      '6→7锻', '7→8锻', '8→9锻', '9→10锻', '10锻→红金'];
    var materials = [null, null, null, '驱虎令', '论语', '楚心玲珑匣', null,
      '白玉君子佩', '女神之泪', '神农令', '楚心玲珑匣'];
    insertOnce(target.FORGING_DATA, {
      id: 'f-202611-01', cat: '首饰', name: '楚心玲珑匣', quality: '橙',
      stages: stages.map(function (stage, i) {
        return { stage: stage, tokens: materials[i] ? [{ n: materials[i], q: i <= 4 ? '紫' : '橙' }] : [{ dash: true }] };
      })
    });
    insertOnce(target.INSCRIPTION_DATA, {
      name: '雷豹英布', quality: '普通橙色', slots: [
        { tian: '天府', shield: '人遁' }, { tian: '天同', shield: '云遁' },
        { tian: '天梁', shield: '虎遁' }, { tian: '天相', shield: '地遁' }
      ]
    });
  }
  return { apply: apply };
});
