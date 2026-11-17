const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/soul-shop.js');
const S = require('./soul-shop.js');
test('Xu Fu explicitly maps to divine Yun Zhongjun', () => {
  assert.equal(DATA.divineTargets['徐福'], '神·云中君');
});
test('only missing storage is empty; malformed and unsupported data cannot be overwritten as empty', () => {
  assert.equal(Object.keys(S.parseStored(null).events).length, 0);
  for (const raw of ['', 'null', '[]', '{"version":2,"events":{}}', '{']) assert.throws(() => S.parseStored(raw));
});
test('source has sixteen contiguous four-disciple periods across the year boundary', () => {
  assert.equal(DATA.occurrences.length, 16);
  assert.equal(DATA.occurrences[0].start, '2026-11-12');
  assert.equal(DATA.occurrences.at(-1).end, '2027-01-06');
  DATA.occurrences.forEach((p, i) => {
    assert.equal(p.disciples.length, 4);
    if (i) { const next = new Date(DATA.occurrences[i - 1].end + 'T12:00:00'); next.setDate(next.getDate() + 1); assert.equal(S.dayKey(next), p.start); }
    assert.equal('theme' in p, false);
  });
  assert.deepEqual(DATA.occurrences[0].disciples.map(d => d.name), ['力士大铁锤', '水寒高渐离', '公子扶苏', '秦王嬴政']);
  assert.deepEqual(DATA.occurrences[2].disciples[0], { name: '舜', base: '攻', divine: '' });
});
test('selection defaults to one period and explicit sync only affects matching future periods', () => {
  const p = DATA.occurrences[1], empty = S.normalizeNeeds(null);
  const only = S.changeSelection(DATA, empty, p.id, '太子燕丹', true, false, '2026-11-17');
  assert.equal(Object.keys(empty.events).length, 0);
  assert.deepEqual(Object.keys(only.events), [p.id]);
  const synced = S.changeSelection(DATA, only, p.id, '太子燕丹', true, true, '2026-11-17');
  assert.equal(Object.values(synced.events).length, 3);
  assert.equal(S.changeSelection(DATA, synced, p.id, '李牧', true, true, '2026-11-17').events[p.id].includes('李牧'), false);
  assert.equal(Object.keys(S.clearHistory(DATA, synced, '2027-01-07').events).length, 0);
  assert.throws(() => S.normalizeNeeds({ version: 2, events: {} }));
});
test('searches combine dates, ordinary/divine attributes and selected disciples', () => {
  const p = DATA.occurrences[1], needs = S.normalizeNeeds(null);
  assert.equal(S.matches(DATA.occurrences[2], { query: '神血' }, needs), true);
  assert.equal(S.matches(p, { query: '11.16' }, needs), true);
  assert.equal(S.matches(p, { query: '太子燕丹', attribute: '内' }, needs), true);
  assert.equal(S.matches(p, { query: '太子燕丹', attribute: '防' }, needs), false);
  assert.equal(S.matches(p, { selectedOnly: true }, needs), false);
  assert.equal(S.view(DATA, '2026-11-17').current.id, p.id);
  assert.equal(S.view(DATA, '2027-01-07').next, null);
});
test('attribute filters return only matching disciples, including date searches and selected-only intersection', () => {
  const p = DATA.occurrences[1], empty = S.normalizeNeeds(null);
  assert.deepEqual(S.matchingDisciples(p, { attribute: '攻' }, empty).map(d => d.name), ['太子燕丹', '丽姬', '刺客荆轲']);
  assert.deepEqual(S.matchingDisciples(p, { query: '11.16', attribute: '内力' }, empty).map(d => d.name), ['太子燕丹']);
  const needs = S.changeSelection(DATA, empty, p.id, '东君焱妃', true, false, '2026-11-17');
  assert.equal(S.matchingDisciples(p, { attribute: '攻', selectedOnly: true }, needs).length, 0);
  assert.equal(S.matches(p, { attribute: '攻', selectedOnly: true }, needs), false);
  assert.equal(S.matchingDisciples(p, {}, empty).length, 4);
});
