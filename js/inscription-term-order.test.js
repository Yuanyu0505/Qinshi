const test = require('node:test');
const assert = require('node:assert/strict');
const Terms = require('./inscription-terms.js');

test('same attribute stays grouped even when another attribute ties the lower value', () => {
  const input = [{ attr: '技能穿透', tier: 'H' }, { attr: '暴击', tier: 'M' }, { attr: '技能穿透', tier: 'M' }];
  const before = JSON.stringify(input);
  assert.deepEqual(Terms.sortTerms(input, 'o2'), [input[0], input[2], input[1]]);
  assert.equal(JSON.stringify(input), before);
});

test('speed group uses its highest actual value and descending values within the group', () => {
  const input = [{ attr: '速', tier: 'L' }, { attr: '暴击', tier: 'L' }, { attr: '速', tier: 'H' }, { attr: '速', tier: 'M' }];
  assert.deepEqual(Terms.sortTerms(input, 'o2'), [input[2], input[3], input[0], input[1]]);
});

test('equal group maxima use Chinese attribute name ordering independent of input order', () => {
  const input = [{ attr: '技能穿透', tier: 'M' }, { attr: '暴击', tier: 'M' }, { attr: '技能穿透', tier: 'L' }, { attr: '暴击', tier: 'L' }];
  const expected = [input[1], input[3], input[0], input[2]];
  assert.deepEqual(Terms.sortTerms(input, 'o2'), expected);
  assert.deepEqual(Terms.sortTerms(input.slice().reverse(), 'o2'), expected);
});

test('known-value entry sorting preserves original indexes and does not mutate source entries', () => {
  const input = Object.freeze([
    Object.freeze({ attr: '技能穿透', value: 5, index: 0 }),
    Object.freeze({ attr: '暴击', value: 5, index: 1 }),
    Object.freeze({ attr: '技能穿透', value: 6, index: 2 })
  ]);
  assert.equal(typeof Terms.sortEntries, 'function');
  assert.deepEqual(Terms.sortEntries(input).map(entry => entry.index), [2, 0, 1]);
  assert.deepEqual(input.map(entry => entry.index), [0, 1, 2]);
  assert.notEqual(Terms.sortEntries(input), input);
});

test('empty display inputs produce a separate empty array', () => {
  const input = [];
  assert.deepEqual(Terms.sortTerms(input, 'o2'), []);
  assert.notEqual(Terms.sortTerms(input, 'o2'), input);
});
