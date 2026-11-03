const { test } = require('node:test');
const assert = require('node:assert/strict');
let DATA, CORE;
try { DATA = require('../data/pilots.js'); CORE = require('./pilots.js'); } catch (_) {}

test('pilot reference preserves all four image sources and 47 complete breakthrough records', () => {
  assert.ok(DATA, 'pilot reference data must exist');
  assert.equal(DATA.sources.length, 4);
  assert.equal(DATA.disciples.filter(d => d.effects.some(e => e.kind === 'breakthrough')).length, 47);
  assert.equal(DATA.disciples.flatMap(d => d.effects).filter(e => e.kind === 'breakthrough').length, 141);
  assert.equal(DATA.disciples.flatMap(d => d.effects).filter(e => e.kind === 'pilot').length, 34);
  assert.deepEqual(DATA.categories.map(c => DATA.disciples.filter(d => d.pilotCategories.includes(c.id)).length), [8, 10, 16]);
  assert.deepEqual(['breakthrough-1', 'breakthrough-2', 'breakthrough-3'].map(id =>
    DATA.disciples.filter(d => d.effects.some(e => e.sourceId === id)).length), [16, 19, 12]);
  for (const disciple of DATA.disciples) {
    assert.equal(new Set(disciple.effects.map(e => e.id)).size, disciple.effects.length);
    for (const effect of disciple.effects) {
      assert.ok(effect.text);
      assert.ok(DATA.sources.some(source => source.id === effect.sourceId));
    }
    if (disciple.effects.some(e => e.kind === 'breakthrough')) {
      assert.deepEqual(disciple.effects.filter(e => e.kind === 'breakthrough').map(e => e.rank), [15, 20, 25]);
    }
  }
});

test('classification applies to the whole disciple and retains overlapping pilot identities', () => {
  assert.ok(CORE, 'pilot query core must exist');
  assert.equal(CORE.filterDisciples(DATA, { type: 'all', query: '' }).length, 60);
  const pilots = CORE.filterDisciples(DATA, { type: 'pilot' });
  assert.ok(pilots.find(d => d.name === '神·田仲').effects.some(e => e.rank === 15));
  assert.ok(CORE.filterDisciples(DATA, { type: 'nonPilot' }).every(d => !d.pilotCategories.length));
  const backpack = CORE.filterDisciples(DATA, { type: 'pilot', category: 'backpack' });
  const traditional = CORE.filterDisciples(DATA, { type: 'pilot', category: 'traditional' });
  assert.ok(backpack.some(d => d.name === '神·典庆'));
  assert.ok(traditional.some(d => d.name === '神·典庆'));
  assert.ok(traditional.some(d => d.name === '神·英布' && d.effects.some(e => e.category === 'traditional' && e.text.includes('狼王'))));
});

test('nonpilot rank filter and multiword search inspect names conditions and effects', () => {
  assert.ok(CORE, 'pilot query core must exist');
  const result = CORE.filterDisciples(DATA, { type: 'nonPilot', rank: 20, query: '神朱家 暴击率' });
  assert.deepEqual(result.map(d => d.name), ['神·朱家']);
  assert.deepEqual(CORE.visibleEffects(result[0], { type: 'nonPilot', rank: 20 }).map(e => e.rank), [20]);
  assert.ok(CORE.filterDisciples(DATA, { query: '夜之信条' }).some(d => d.name === '神·季布'));
  assert.ok(CORE.filterDisciples(DATA, { query: '不存在的资料' }).length === 0);
});

test('normal god and mirror disciples remain distinct and contradictions stay contextual', () => {
  assert.ok(DATA, 'pilot reference data must exist');
  assert.ok(DATA.disciples.some(d => d.name === '王翦'));
  assert.ok(DATA.disciples.some(d => d.name === '神·王翦'));
  assert.ok(DATA.disciples.some(d => d.name === '神·端木蓉'));
  assert.ok(DATA.disciples.some(d => d.name === '神·镜仙端木蓉'));
  const dragon = DATA.disciples.find(d => d.name === '神·龙且');
  assert.ok(dragon.effects.some(e => e.kind === 'pilot' && e.text.includes('30%')));
  assert.ok(dragon.effects.some(e => e.kind === 'breakthrough' && e.rank === 15 && e.text.includes('50%')));
  assert.deepEqual(dragon.notes, []);
  assert.equal(DATA.costumes.length, 9);
  assert.ok(DATA.costumes.every(c => !Object.hasOwn(c, 'effect')));
});
