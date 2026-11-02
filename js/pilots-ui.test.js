const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/pilots.js');
let UI;
try { UI = require('./pilots-ui.js'); } catch (_) {}

test('pilot cards render every selected effect with source and conditional notes', () => {
  assert.ok(UI, 'pilot UI must exist');
  const html = UI.renderResults(DATA, { type: 'pilot', query: '夜之信条' });
  assert.match(html, /神·季布/);
  assert.match(html, /15阶/);
  assert.match(html, /夜之信条/);
  assert.match(html, /机师位助阵效果一览/);
  assert.doesNotMatch(html, /神·镜仙端木蓉/);
});

test('nonpilot rank filter renders only selected rank and empty search is informative', () => {
  assert.ok(UI, 'pilot UI must exist');
  const html = UI.renderResults(DATA, { type: 'nonPilot', rank: 20, query: '神朱家' });
  assert.match(html, /20阶/);
  assert.doesNotMatch(html, /15阶突破/);
  assert.doesNotMatch(html, /25阶突破/);
  assert.match(UI.renderResults(DATA, { query: '找不到这个人' }), /没有符合条件的资料/);
});

test('reference text is escaped instead of being interpreted as HTML', () => {
  assert.ok(UI, 'pilot UI must exist');
  const hostile = { sources: [{ id: 's', name: '<b>source</b>' }], categories: [], disciples: [
    { id: 'x', name: '<img src=x onerror=alert(1)>', pilotCategories: [], notes: [], effects: [
      { id: 'e', kind: 'breakthrough', rank: 15, text: '<script>bad()</script>', sourceId: 's', condition: 'a & b' }
    ] }
  ] };
  const html = UI.renderResults(hostile, {});
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /a &amp; b/);
});
