const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/machine-beasts.js');

test('breakthrough image reference includes all ten finished-material stages without changing research rules', () => {
  const guide = DATA.breakthroughGuide;
  assert.ok(guide, 'breakthrough materials image reference must exist');
  assert.deepEqual(guide.stages.map(row => [row.from, row.to]), [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10]]);
  assert.deepEqual(guide.stages[0].materials, [
    { name: '青铜关节', quantity: 1 }, { name: '青铜底座', quantity: 1 },
    { name: '青铜线圈', quantity: 1 }, { name: '青铜螺栓', quantity: 1 }
  ]);
  assert.deepEqual(guide.stages.slice(7).map(row => row.materials), [
    [{ name: '同名7阶机关兽', quantity: 1 }], [{ name: '同名7阶机关兽', quantity: 2 }], [{ name: '同名7阶机关兽', quantity: 4 }]
  ]);
  assert.match(guide.source.name, /满阶机关兽突破所需材料表/);
  assert.equal(DATA.resourceRules.blueprintDivisor, 500);
  assert.equal(DATA.resourceRules.organPieceDivisor, 100);
});

test('breakthrough reference preserves all 7 through 10 cumulative quantities literally', () => {
  const guide = DATA.breakthroughGuide;
  assert.ok(guide, 'breakthrough materials image reference must exist');
  assert.deepEqual(guide.ranks, [7, 8, 9, 10]);
  assert.deepEqual(guide.resources.map(row => [row.name, ...row.values]), [
    ['青铜螺栓设计图', 22,44,88,176], ['精钢底座设计图', 24,48,96,192],
    ['精钢管设计图', 24,48,96,192], ['玄铁外壳设计图', 25,50,100,200],
    ['玄铁关节设计图', 25,50,100,200], ['玄铁箱设计图', 5,10,20,40],
    ['铅块', 482,964,1928,3856], ['青铜', 333,666,1332,2664],
    ['精钢', 156,312,624,1248], ['玄铁', 94,188,376,752]
  ]);
});
