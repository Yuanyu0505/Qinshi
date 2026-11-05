const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Rules = require('./inscription-rules.js');
const modulePath = path.join(__dirname, 'inscription-reference.js');
const Reference = fs.existsSync(modulePath) ? require(modulePath) : {};

test('mainStats derives all seven known qualities without adding crafting or progress green', () => {
  assert.equal(typeof Reference.mainStats, 'function', 'Reference main stats API is available');
  const fixtures = [
    ['g1', 1600, 25600], ['b1', 2700, 43200], ['b2', 4550, 72800],
    ['p1', 7700, 123200], ['p2', 13050, 208800], ['o1', 22150, 354400], ['o2', 37650, 602400]
  ];
  for (const [quality, scalar, shield] of fixtures) {
    assert.deepEqual(Reference.mainStats('天机', quality), [{ attr: '内力', value: scalar }, { attr: '护盾', value: shield }]);
  }
  assert.deepEqual(Reference.mainStats('天相', 'p2'), [{ attr: '攻', value: 13050 }, { attr: '内力', value: 26100 }]);
  assert.deepEqual(Reference.mainStats('天同', 'b1'), [{ attr: '内力', value: 2700 }, { attr: '血', value: 43200 }]);
  assert.deepEqual(Reference.mainStats('天梁', 'p1'), [{ attr: '防', value: 15400 }, { attr: '血', value: 61600 }]);
  assert.deepEqual(Reference.mainStats('天府', 'o2'), [{ attr: '防', value: 37650 }, { attr: '攻', value: 75300 }]);
  assert.deepEqual(Reference.mainStats('天府', 'unknown'), []);
  assert.deepEqual(Reference.mainStats('unknown', 'o2'), []);
  assert.equal(Rules.qualities.some(q => q.id === 'g1'), false);
});

test('reference rows show scalar growth and stones without inventing green recast cost', () => {
  assert.equal(typeof Reference.tiers, 'function');
  const rows = Reference.tiers();
  assert.deepEqual(rows.map(r => [r.id, r.scalar, r.disassemble, r.recast]), [
    ['g1',1600,1,null], ['b1',2700,3,1], ['b2',4550,9,1], ['p1',7700,20,2],
    ['p2',13050,60,5], ['o1',22150,132,12], ['o2',37650,396,40]
  ]);
  rows[0].scalar = 999;
  assert.equal(Reference.tiers()[0].scalar, 1600, 'callers cannot change shared scalar data');
});

test('term rows reuse legal rules and keep purple two wash tiers separate from crafted tiers', () => {
  assert.equal(typeof Reference.termRows, 'function');
  const wash = Reference.termRows('天遁', 'p2', 'wash');
  assert.ok(wash.some(t => t.attr === '攻' && t.tier === 'H' && t.value === 8));
  assert.ok(wash.some(t => t.attr === '攻' && t.tier === 'L' && t.value === 4));
  assert.equal(wash.some(t => t.tier === 'M'), false);
  const rows = Reference.termRows('天遁', 'p2');
  assert.deepEqual(rows.filter(t => t.attr === '攻').map(t => [t.tier,t.value,t.origins]), [
    ['H',8,['wash','crafted']], ['M',6,['crafted']], ['L',4,['wash']]
  ]);
  assert.equal(Reference.termRows('神遁', 'o2').some(t => t.attr === 'PVP速' && t.tier === 'H'), false);
  assert.deepEqual(Reference.termRows('天遁', 'g1'), [], 'green substats are unknown');
  assert.ok(Reference.termRows('鬼遁', 'b1').some(t => t.attr === '速' && t.tier === '?' && t.value === 1));
  assert.deepEqual(Reference.termRows('missing', 'o2'), []);
});

test('upgrade rows preserve true tiers instead of picking the next larger value', () => {
  assert.equal(typeof Reference.upgradeRows, 'function');
  const rows = Reference.upgradeRows('天遁', 'p1');
  const medium = rows.find(r => r.attr === '攻' && r.tier === 'M');
  assert.equal(medium.value, 4);
  assert.equal(medium.toQuality, 'p2');
  assert.deepEqual(medium.possibilities, [{ tier: 'M', value: 6 }]);
  const low = Reference.upgradeRows('天遁', 'p2').find(r => r.attr === '攻' && r.tier === 'L');
  assert.deepEqual(low.possibilities, [{ tier: 'L', value: 6 }]);
  assert.deepEqual(Reference.upgradeRows('天遁', 'o2'), []);
  assert.deepEqual(Reference.upgradeRows('天遁', 'g1'), []);
});

test('purple two wash-only reminder excludes all tiers available through crafting', () => {
  for(const dun of Rules.duns){
    const rows=Reference.washOnlyRows(dun.id);
    assert.ok(rows.length>0);
    assert.ok(rows.every(row=>row.origins.includes('wash')&&!row.origins.includes('crafted')));
  }
  assert.deepEqual(Reference.washOnlyRows('天遁').filter(row=>row.attr==='攻').map(row=>row.tier),['L']);
});

test('blue two indistinguishable speed lists possible future tiers but never invents probability', () => {
  assert.equal(typeof Reference.upgradeRows, 'function');
  const ghost = Reference.upgradeRows('鬼遁', 'b2').find(r => r.attr === '速');
  assert.equal(ghost.tier, '?');
  assert.deepEqual(ghost.possibilities, [{ tier:'H', value:2 }, { tier:'M', value:1 }]);
  const god = Reference.upgradeRows('神遁', 'b2').find(r => r.attr === 'PVP速');
  assert.deepEqual(god.possibilities, [{ tier:'M', value:1 }]);
  assert.equal('probability' in ghost, false);
});

test('reference comparisons preserve unavailable cells and use percent signs or raw speed deltas',()=>{
 assert.equal(typeof Reference.compareRows,'function');
 const rows=Reference.compareRows('地遁','p2','地遁','o2');
 const high=rows.find(r=>r.attr==='技能穿透'&&r.tier==='H');assert.equal(high.left.value,4);assert.equal(high.right.value,6);assert.equal(high.delta,2);assert.equal(high.unit,'%');
 const speed=Reference.compareRows('鬼遁','p2','鬼遁','o2').find(r=>r.attr==='速'&&r.tier==='H');assert.equal(speed.delta,2);assert.equal(speed.unit,'');
 const absent=Reference.compareRows('人遁','o2','地遁','o2').find(r=>r.attr==='技能穿透'&&r.tier==='H');assert.equal(absent.left,null);assert.equal(absent.delta,null);
 const green=Reference.compareRows('天遁','g1','天遁','o2');assert.ok(green.every(r=>r.left===null&&r.delta===null));
 const blue=Reference.compareRows('鬼遁','b2','鬼遁','p1');assert.equal(blue.find(r=>r.attr==='速'&&r.tier==='?').delta,null);
});

test('higher-quality growth follows all reachable tiers and keeps blue speed ambiguity',()=>{
 const high=Reference.upgradeRows('地遁','p1','o2').find(r=>r.attr==='技能穿透'&&r.tier==='H');assert.equal(high.toQuality,'o2');assert.deepEqual(high.possibilities,[{tier:'H',value:6}]);
 const speed=Reference.upgradeRows('鬼遁','b2','o2').find(r=>r.attr==='速');assert.deepEqual(speed.possibilities,[{tier:'H',value:5},{tier:'M',value:4}]);assert.deepEqual(Reference.upgradeRows('鬼遁','p2','p1'),[]);
});
