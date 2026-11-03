const { test } = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/pilots.js');
let UI;
try { UI = require('./pilots-ui.js'); } catch (_) {}

test('pilot cards retain effect text without auxiliary conditions or source lines', () => {
  assert.ok(UI, 'pilot UI must exist');
  const html = UI.renderResults(DATA, { type: 'pilot', query: '夜之信条' });
  assert.match(html, /神·季布/);
  assert.match(html, /15阶/);
  assert.match(html, /夜之信条/);
  assert.doesNotMatch(html, /机师位助阵效果一览|条件 \/ 语境|pilots-source|pilots-condition/);
  assert.match(html, /<p>技能进化：山之守护增加目标30%治疗效果（需夜之信条时装）。<\/p>/);
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
  assert.doesNotMatch(html, /a &amp; b|source/);
});

test('only the requested Yingbu and Longju notes are removed while other reference notes remain', () => {
  const yingbu = UI.renderResults(DATA, { query: '神英布' });
  assert.doesNotMatch(yingbu, /姓名误印|不属于林之庇佑/);
  assert.match(yingbu, /<p>时装狼王：开场我方全体提升5%技能伤害减免2回合。<\/p>/);
  assert.doesNotMatch(UI.renderResults(DATA, { query: '神龙且' }), /不同来源语境/);
  const dianqing = UI.renderResults(DATA, { query: '神典庆' });
  assert.match(dianqing, /勿直接相加/);
  assert.match(dianqing, /原图备注：典庆/);
  assert.match(UI.renderResults(DATA, { query: '神田赐' }), /文字疑有缺漏/);
});

test('evolution and named costume effects are independent escaped paragraphs without losing text', () => {
  for (const [query, segment] of [
    ['神诺敏', '技能进化：月狼之血效果提升至9%每回合转换3%（需黑寡妇时装）。'],
    ['典庆', '猎人时装：施加护盾内力提升量增加50%，并对前排单位也生效。'],
    ['范增', '时装圣言：效果提升至2回合。'],
    ['紫女', '时装蛇姬：血阵每次恢复生命后，该弟子额外提升5%暴击和暴击伤害1回合。']
  ]) assert.ok(UI.renderResults(DATA, { query }).includes('<p>' + segment + '</p>'), query);
  const fixture = { categories: [], disciples: [{ id: 'safe', name: 'safe', pilotCategories: [], notes: [], effects: [
    { kind: 'breakthrough', rank: 15, text: '<img src=x>。技能进化：<script>bad()</script>。猎人时装：a & b。' }
  ] }] };
  const html = UI.renderResults(fixture, { query: 'safe' });
  assert.match(html, /<p>技能进化：&lt;script&gt;bad\(\)&lt;\/script&gt;。<\/p>/);
  assert.match(html, /<p>猎人时装：a &amp; b。<\/p>/);
  assert.doesNotMatch(html, /<img|<script/);
});

test('pilot identity badges carry four stable category classes', () => {
  for (const [query, badge] of [['神朱家', 'nonpilot'], ['神端木蓉', 'backpack'], ['神赵高', 'god25'], ['范增', 'traditional']]) {
    assert.match(UI.renderResults(DATA, { query }), new RegExp('pilots-badge-' + badge));
  }
});
