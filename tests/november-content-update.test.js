'use strict';
const assert = require('node:assert/strict');
const update = require('../data/2026-11-content-update.js');
const realms = require('../data/secret-realm.js');

const target = {
  SPECIAL_EQUIPMENT_DATA: { meta: {}, items: [] },
  FORGING_DATA: { meta: {}, items: [] },
  INSCRIPTION_DATA: { meta: {}, items: [] }
};
update.apply(target);
update.apply(target);
const equipment = target.SPECIAL_EQUIPMENT_DATA.items;
assert.equal(equipment.length, 1);
assert.equal(equipment[0].name, '楚心玲珑匣');
for (const tier of ['橙色', '橙金', '红色']) {
  assert.deepEqual(equipment[0].tiers[tier].map(t => [t.t, t.v]), [['暴伤', 5]]);
}
assert.deepEqual(equipment[0].tiers['红金'].map(t => [t.t, t.v]), [['暴伤', 5], ['穿透', 5]]);
assert.deepEqual(equipment[0].max, { '暴伤': 5, '穿透': 5 });
const recipes = target.FORGING_DATA.items;
assert.equal(recipes.length, 1);
assert.deepEqual(recipes[0].stages.map(s => s.tokens[0].n || null),
  [null, null, null, '驱虎令', '论语', '楚心玲珑匣', null, '白玉君子佩', '女神之泪', '神农令', '楚心玲珑匣']);
assert.deepEqual(recipes[0].stages.filter(s => s.tokens[0].n).map(s => s.tokens[0].q),
  ['紫', '紫', '橙', '橙', '橙', '橙', '橙']);
assert.deepEqual(target.INSCRIPTION_DATA.items, [{
  name: '雷豹英布', quality: '普通橙色', slots: [
    { tian: '天府', shield: '人遁' }, { tian: '天同', shield: '云遁' },
    { tian: '天梁', shield: '虎遁' }, { tian: '天相', shield: '地遁' }
  ]
}]);
assert.deepEqual(realms.realms.filter(r => !r.retired).map(r => r.id), ['gaoyue']);
assert.equal(realms.realms.find(r => r.id === 'guigu').retired, true);
