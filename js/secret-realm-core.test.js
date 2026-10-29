'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const data = require('../data/secret-realm.js');
const corePath = path.join(__dirname, 'secret-realm-core.js');
const core = fs.existsSync(corePath) ? require(corePath) : {};
const start = Date.parse('2026-10-01T00:00:00+08:00');
const day = 86400000;
function defaults() { assert.equal(typeof core.createDefault, 'function', 'state core must implement createDefault'); return core.createDefault(data); }
function scheduled(id = 'gaoyue', period = 2) { return core.setStartDate(defaults(), id, period, '2026-10-01', start - 1, data); }
function active(id = 'gaoyue', period = 2) { return core.advance(scheduled(id, period), start, data); }
function row(state, id, period, source) { return core.buildPlanningInput(state, id, start, data).periods.find(p => p.number === period).sources.find(s => s.id === source); }

test('v1 migration preserves real totals and derives fixed pack6 receipts without inventing currency', () => {
  const legacy = active(); legacy.schemaVersion = 1;
  for (const realm of Object.values(legacy.realms)) {
    for (const key of ['currency','targetEnabled','currencyTargetEnabled','currencyTarget','drawMode']) delete realm[key];
    for (const period of Object.values(realm.periods)) for (const record of Object.values(period.sources)) delete record.currencyObtained;
  }
  legacy.realms.gaoyue.cumulative = 20; legacy.realms.gaoyue.inventory = 7;
  Object.assign(legacy.realms.gaoyue.periods[2].sources.pack6, {purchased:1,obtained:1,todayPurchased:1,todayObtained:1,todayDate:'2026-10-01'});
  const next=core.normalize(legacy,data), realm=next.realms.gaoyue;
  assert.equal(next.schemaVersion,2); assert.equal(realm.cumulative,20);assert.equal(realm.inventory,7);assert.equal(realm.currency,0);
  assert.equal(realm.currencyTargetEnabled,false);assert.equal(realm.drawMode,'stop');
  assert.equal(realm.periods[2].sources.pack6.obtained,3);assert.equal(realm.periods[2].sources.pack6.todayObtained,0);
  assert.equal(legacy.realms.gaoyue.periods[2].sources.pack6.obtained,1);
  legacy.realms.gaoyue.periods[2].sources.pack6.obtained=4;
  assert.throws(()=>core.normalize(legacy,data));
});

test('currency targets and independently claimed rewards never repeat previous draws or purchased pack gifts',()=>{
  let state=active(); state=core.updateTotals(state,'gaoyue',{currency:50,targetEnabled:false,currencyTargetEnabled:true,currencyTarget:700,drawMode:'all'},data);
  state=core.updateSource(state,'gaoyue',2,'panda',{currencyObtained:20},start,data);
  state=core.updateSource(state,'gaoyue',2,'paid-pass',{purchased:1,currencyObtained:30},start,data);
  state=core.updateSource(state,'gaoyue',2,'pack98',{purchased:1,obtained:30},start,data);
  const input=core.buildPlanningInput(state,'gaoyue',start,data);
  assert.equal(input.currency,50);assert.equal(input.currencyTarget,700);assert.equal(input.targetEnabled,false);
  assert.equal(row(state,'gaoyue',2,'panda').availableCurrency,36);
  assert.equal(row(state,'gaoyue',2,'paid-pass').availableCurrency,40);
  assert.equal(row(state,'gaoyue',2,'paid-pass').purchaseCurrency,70);
  assert.equal(row(state,'gaoyue',2,'pack98').availableCurrency,0);
  assert.equal(row(state,'gaoyue',2,'pack98').purchaseCurrency,15);
  assert.throws(()=>core.updateSource(state,'gaoyue',2,'panda',{currencyObtained:57},start,data));
  assert.throws(()=>core.updateSource(defaults(),'gaoyue',2,'panda',{currencyObtained:1},start,data));
  assert.equal(core.advance(state,start+14*day,data).realms.gaoyue.currency,50);
});

test('fixed six-yuan purchases grant three tickets immediately and period totals limit remaining purchases',()=>{
  const state=core.updateSource(active(),'gaoyue',2,'pack6',{purchased:1,todayPurchased:1,todayDate:'2026-10-01'},start,data);
  assert.equal(state.realms.gaoyue.periods[2].sources.pack6.obtained,3);
  assert.equal(row(state,'gaoyue',2,'pack6').availableDraws,0);
  assert.equal(row(state,'gaoyue',2,'pack6').maxPurchases,13);
  assert.throws(()=>core.updateSource(state,'gaoyue',2,'pack6',{todayObtained:1},start,data));
});

test('deleting selected custom platform falls back to direct without changing balances or preset platforms',()=>{
  let state=core.updateSettings(defaults(),{platforms:[...data.platforms,{id:'custom-test',name:'私人平台',discount:3}],platformId:'custom-test',vouchers:20},data);
  state=core.deletePlatform(state,'custom-test',data);
  assert.equal(state.settings.platformId,'direct');assert.equal(state.settings.vouchers,20);
  assert.equal(state.settings.platforms.some(p=>p.id==='custom-test'),false);
  assert.throws(()=>core.deletePlatform(state,'x7',data));
});

test('defaults expose independent realms, locked history, shared settings and no first-only reward', () => {
  const state = defaults();
  assert.equal(state.realms.guigu.currentPeriod, 6);
  assert.equal(state.realms.gaoyue.currentPeriod, 2);
  assert.equal(state.realms.gaoyue.periods[1].ended, true);
  assert.equal(state.realms.gaoyue.periods[1].locked, true);
  assert.equal(state.settings.platformId, 'x7');
  assert.equal(state.settings.useVouchers, true);
  const input = core.buildPlanningInput(state, 'gaoyue', start, data);
  assert.equal(input.periods.length, 5);
  assert.equal(input.periods[0].sources.some(s => s.id === 'first-gift'), false);
  assert.equal(input.periods[0].sources.some(s => s.id === 'pack648'), false);
  assert.equal(input.periods[0].sources.find(s => s.id === 'free-pass').availableDraws, 11);
  assert.equal(input.periods[0].sources.find(s => s.id === 'paid-pass').maxPurchases, 1);
});

test('normalization initializes only absent storage and preserves a deleted empty realm map', () => {
  assert.deepEqual(core.normalize(null, data), defaults());
  const empty = defaults(); empty.realms = {};
  assert.deepEqual(core.normalize(empty, data).realms, {});
  assert.deepEqual(core.advance(empty, start, data).realms, {});
});

test('normalization rejects malformed JSON objects and corrupt numeric values rather than replacing them', () => {
  for (const value of ['', 'bad json', [], { schemaVersion: 3 }]) assert.throws(() => core.normalize(value, data));
  for (const value of ['', -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const state = defaults(); state.realms.gaoyue.cumulative = value;
    assert.throws(() => core.normalize(state, data));
  }
  const state = defaults(); state.realms.gaoyue.periods[2].sources.panda.obtained = -1;
  assert.throws(() => core.normalize(state, data));
});

test('status changes exactly at Beijing start and 14-day end, not UTC midnight', () => {
  const realm = scheduled().realms.gaoyue;
  assert.deepEqual(core.status(realm, 2, start - 1, data), { phase: 'upcoming', today: '2026-09-30', day: 0, endDate: '2026-10-15' });
  assert.deepEqual(core.status(realm, 2, start, data), { phase: 'active', today: '2026-10-01', day: 1, endDate: '2026-10-15' });
  assert.equal(core.status(realm, 2, start + 14 * day - 1, data).day, 14);
  assert.equal(core.status(realm, 2, start + 14 * day, data).phase, 'ended');
});

test('advance drops expired actuals, preserves totals and future configuration without predicted rewards', () => {
  let state = active();
  state = core.updateTotals(state, 'gaoyue', { cumulative: 100, inventory: 20 }, data);
  state = core.updateSource(state, 'gaoyue', 2, 'panda', { obtained: 30 }, start, data);
  state = core.setEnabled(state, 'gaoyue', 3, 'pack648', true, start, data);
  const next = core.advance(state, start + 14 * day, data);
  assert.equal(next.realms.gaoyue.currentPeriod, 3);
  assert.equal(next.realms.gaoyue.cumulative, 100);
  assert.equal(next.realms.gaoyue.inventory, 20);
  assert.deepEqual(next.realms.gaoyue.periods[2].sources, {});
  assert.equal(next.realms.gaoyue.periods[2].startDate, '2026-10-01');
  assert.equal(next.realms.gaoyue.periods[3].sources.pack648.enabled, true);
  assert.equal(next.realms.gaoyue.periods[3].startDate, null);
});

test('ended state and start lock are permanent even if the system clock moves backward', () => {
  const state = core.advance(active(), start + 14 * day, data);
  assert.equal(core.status(state.realms.gaoyue, 2, start - day, data).phase, 'ended');
  assert.throws(() => core.setStartDate(state, 'gaoyue', 2, '2026-11-01', start - day, data));
  const locked = active();
  assert.throws(() => core.setStartDate(locked, 'gaoyue', 2, '2026-11-01', start - day, data));
  assert.equal(core.status(locked.realms.gaoyue, 2, start - day, data).phase, 'active');
});

test('the sixth period finishes and only then deletion is permitted without recreation', () => {
  assert.throws(() => core.deleteRealm(defaults(), 'guigu', start, data));
  const ended = core.advance(scheduled('guigu', 6), start + 14 * day, data);
  assert.equal(ended.realms.guigu.finished, true);
  assert.deepEqual(core.buildPlanningInput(ended, 'guigu', start, data).periods, []);
  const removed = core.deleteRealm(ended, 'guigu', start, data);
  assert.equal(removed.realms.guigu, undefined);
  assert.equal(core.normalize(removed, data).realms.guigu, undefined);
  assert.deepEqual(removed.settings, ended.settings);
  assert.throws(() => core.buildPlanningInput(removed, 'guigu', start, data));
});

test('start dates reject impossible, expired, overlapping and reversed dates', () => {
  for (const date of ['2026-02-30', '', '2026-1-01', '2026-09-01']) assert.throws(() => core.setStartDate(defaults(), 'gaoyue', 2, date, start, data));
  let state = scheduled();
  assert.throws(() => core.setStartDate(state, 'gaoyue', 3, '2026-10-14', start - 1, data));
  assert.throws(() => core.setStartDate(state, 'gaoyue', 3, '2026-09-17', start - 20 * day, data));
  state = core.setStartDate(state, 'gaoyue', 3, '2026-10-15', start - 1, data);
  assert.equal(state.realms.gaoyue.periods[3].startDate, '2026-10-15');
});

test('actual records cannot be saved before active or into future and expired periods', () => {
  assert.throws(() => core.updateSource(defaults(), 'gaoyue', 2, 'panda', { obtained: 1 }, start, data));
  assert.throws(() => core.updateSource(active(), 'gaoyue', 3, 'panda', { obtained: 1 }, start, data));
  assert.throws(() => core.updateSource(active(), 'gaoyue', 2, 'panda', { obtained: 1 }, start + 14 * day, data));
});

test('source validation rejects paid overclaims, limit breaches, invalid daily rows and free purchases', () => {
  const state = active();
  for (const values of [{ purchased: 0, obtained: 1 }, { purchased: 2 }, { purchased: 1, obtained: 89 }, { purchased: '' }]) {
    assert.throws(() => core.updateSource(state, 'gaoyue', 2, 'paid-pass', values, start, data));
  }
  assert.throws(() => core.updateSource(state, 'gaoyue', 2, 'panda', { purchased: 1 }, start, data));
  assert.throws(() => core.updateSource(state, 'gaoyue', 2, 'daily-free', { todayDate: '2026-10-01', todayObtained: 2 }, start, data));
  assert.throws(() => core.updateSource(state, 'gaoyue', 2, 'daily-free', { obtained: 1, todayDate: '2026-09-30', todayObtained: 1 }, start, data));
});

test('partial paid pass is already paid and its unclaimed draws incur no second purchase', () => {
  const state = core.updateSource(active(), 'gaoyue', 2, 'paid-pass', { purchased: 1, obtained: 21 }, start, data);
  assert.deepEqual(row(state, 'gaoyue', 2, 'paid-pass'), { id: 'paid-pass', name: '付费通行证', draws: 88, price: 98, maxPurchases: 0, availableDraws: 67, availableCurrency:70, purchaseCurrency:70 });
  assert.equal(state.realms.gaoyue.cumulative, 0);
  assert.equal(state.realms.gaoyue.inventory, 0);
});

test('free source availability subtracts obtained draws and never represents a new paid purchase', () => {
  const state = core.updateSource(active(), 'gaoyue', 2, 'panda', { obtained: 7 }, start, data);
  assert.deepEqual(row(state, 'gaoyue', 2, 'panda'), { id: 'panda', name: '熊猫头', draws: 35, price: 0, maxPurchases: 0, availableDraws: 28, availableCurrency:56, purchaseCurrency:0 });
});

test('missed daily rewards expire but planning does not interpret legacy today flags', () => {
  let state = active();
  let input = core.buildPlanningInput(state, 'gaoyue', start + 9 * day, data);
  assert.equal(input.periods[0].sources.find(s => s.id === 'daily-free').availableDraws, 5);
  state = core.updateSource(state, 'gaoyue', 2, 'daily-free', { obtained: 2, todayDate: '2026-10-10', todayObtained: 1 }, start + 9 * day, data);
  input = core.buildPlanningInput(state, 'gaoyue', start + 9 * day, data);
  assert.equal(input.periods[0].sources.find(s => s.id === 'daily-free').availableDraws, 5);
  assert.equal(core.buildPlanningInput(state, 'gaoyue', start + 10 * day, data).periods[0].sources.find(s => s.id === 'daily-free').availableDraws, 4);
});

test('pack6 grants fixed tickets and remaining availability uses only period totals and days', () => {
  const now = start + 9 * day;
  let state = core.updateSource(active(), 'gaoyue', 2, 'pack6', { purchased: 2, todayDate: '2026-10-10', todayPurchased: 1 }, now, data);
  let source = core.buildPlanningInput(state, 'gaoyue', now, data).periods[0].sources.find(s => s.id === 'pack6');
  assert.equal(source.availableDraws, 0);
  assert.equal(source.maxPurchases, 5);
  state = core.updateSource(state, 'gaoyue', 2, 'pack6', { purchased: 2, todayDate: '2026-10-10', todayPurchased: 1 }, now, data);
  source = core.buildPlanningInput(state, 'gaoyue', now, data).periods[0].sources.find(s => s.id === 'pack6');
  assert.equal(source.availableDraws, 0);
  assert.equal(source.maxPurchases, 5);
});

test('every period retains its configuration and select-all never implicitly enables pack648', () => {
  let state = core.setAll(defaults(), 'gaoyue', 2, false, start, data);
  assert.equal(core.buildPlanningInput(state, 'gaoyue', start, data).periods[0].sources.length, 0);
  state = core.setEnabled(state, 'gaoyue', 2, 'pack648', true, start, data);
  assert.equal(row(state, 'gaoyue', 2, 'pack648').maxPurchases, null);
  state = core.setAll(state, 'gaoyue', 2, true, start, data);
  assert.equal(row(state, 'gaoyue', 2, 'pack648'), undefined);
  state = core.applyFollowing(state, 'gaoyue', 2, start, data);
  assert.equal(state.realms.gaoyue.periods[6].sources.pack648.enabled, false);
  assert.equal(state.realms.gaoyue.periods[6].sources.panda.enabled, true);
});

test('all configuration operations reject past and newly expired periods', () => {
  for (const operation of [
    s => core.setEnabled(s, 'gaoyue', 1, 'panda', false, start, data),
    s => core.setAll(s, 'gaoyue', 2, false, start + 14 * day, data),
    s => core.applyFollowing(s, 'gaoyue', 2, start + 14 * day, data)
  ]) assert.throws(() => operation(active()));
});

test('totals allow arbitrary safe targets but reject aggregate overflow and invalid values', () => {
  const state = core.updateTotals(defaults(), 'gaoyue', { cumulative: 9000, inventory: 2, target: 10000 }, data);
  assert.equal(state.realms.gaoyue.target, 10000);
  for (const values of [{ target: '' }, { inventory: -1 }, { cumulative: Infinity }, { cumulative: Number.MAX_SAFE_INTEGER, inventory: 1 }]) {
    assert.throws(() => core.updateTotals(state, 'gaoyue', values, data));
  }
});

test('settings are shared, persist custom platforms and use exact cent-valid currency', () => {
  const state = core.updateSettings(defaults(), { platformId: 'mine', platforms: [{ id: 'mine', name: '自定义', discount: 4.35 }], vouchers: 12.34, useVouchers: false }, data);
  for (const id of ['gaoyue', 'guigu']) {
    const input = core.buildPlanningInput(state, id, start, data);
    assert.equal(input.discount, 4.35);
    assert.equal(input.vouchers, 12.34);
    assert.equal(input.useVouchers, false);
  }
  for (const settings of [{ vouchers: '' }, { vouchers: NaN }, { vouchers: Infinity }, { vouchers: -1 }, { vouchers: 0.001 }, { vouchers: Number.MAX_SAFE_INTEGER }, { useVouchers: 1 }, { platformId: 'missing' }, { platforms: [{ id: 'x7', name: 'bad', discount: 0 }] }]) assert.throws(() => core.updateSettings(state, settings, data));
});

test('source arithmetic overflow is rejected before any planning multiplication', () => {
  assert.throws(() => core.updateSource(active(), 'gaoyue', 2, 'pack648', { purchased: Number.MAX_SAFE_INTEGER, obtained: 0 }, start, data));
});

test('all public state operations leave their input untouched and return independent objects', () => {
  const initial = defaults(); const snapshot = structuredClone(initial);
  const operations = [
    s => core.normalize(s, data), s => core.advance(s, start, data),
    s => core.setStartDate(s, 'gaoyue', 2, '2026-10-01', start - 1, data),
    s => core.updateTotals(s, 'gaoyue', { target: 8000 }, data),
    s => core.setEnabled(s, 'gaoyue', 2, 'panda', false, start, data),
    s => core.setAll(s, 'gaoyue', 2, false, start, data),
    s => core.applyFollowing(s, 'gaoyue', 2, start, data),
    s => core.updateSettings(s, { vouchers: 5 }, data)
  ];
  for (const operation of operations) { const result = operation(initial); assert.notEqual(result, initial); assert.notEqual(result.settings, initial.settings); assert.deepEqual(initial, snapshot); }
  const live = active(); const liveSnapshot = structuredClone(live);
  core.updateSource(live, 'gaoyue', 2, 'panda', { obtained: 1 }, start, data);
  core.buildPlanningInput(live, 'gaoyue', start, data);
  assert.deepEqual(live, liveSnapshot);
});

test('normalization rejects impossible lock metadata and actuals saved without an active lock', () => {
  const noDate = defaults(); noDate.realms.gaoyue.periods[2].locked = true;
  assert.throws(() => core.normalize(noDate, data));
  const premature = scheduled(); premature.realms.gaoyue.periods[2].sources.panda.obtained = 1;
  assert.throws(() => core.normalize(premature, data));
  const futureEnded = defaults(); futureEnded.realms.gaoyue.periods[3] = { startDate: null, ended: true, locked: true, sources: {} };
  assert.throws(() => core.normalize(futureEnded, data));
});

test('first-period gift is available once only when the data explicitly starts the realm at period one', () => {
  const firstData = structuredClone(data); firstData.realms[1].firstPeriod = 1;
  const state = core.createDefault(firstData);
  const periods = core.buildPlanningInput(state, 'gaoyue', start, firstData).periods;
  assert.deepEqual(periods[0].sources.find(s => s.id === 'first-gift'), { id: 'first-gift', name: '首期秘境赠送', draws: 19, price: 0, maxPurchases: 0, availableDraws: 19, availableCurrency:0, purchaseCurrency:0 });
  assert.equal(periods.slice(1).some(p => p.sources.some(s => s.id === 'first-gift')), false);
});

test('advance can cross multiple scheduled boundaries and never resets a future selection', () => {
  let state = scheduled();
  state = core.setStartDate(state, 'gaoyue', 3, '2026-10-15', start - 1, data);
  state = core.setEnabled(state, 'gaoyue', 4, 'pack30', false, start - 1, data);
  const advanced = core.advance(state, start + 28 * day, data);
  assert.equal(advanced.realms.gaoyue.currentPeriod, 4);
  assert.equal(advanced.realms.gaoyue.periods[3].ended, true);
  assert.equal(advanced.realms.gaoyue.periods[4].sources.pack30.enabled, false);
  assert.equal(advanced.realms.gaoyue.cumulative, 0);
});

test('mutators reject non-boolean configuration, unknown fields and invalid clock values', () => {
  const state = defaults();
  assert.throws(() => core.setEnabled(state, 'gaoyue', 2, 'panda', 'false', start, data));
  assert.throws(() => core.setAll(state, 'gaoyue', 2, 1, start, data));
  assert.throws(() => core.updateTotals(state, 'gaoyue', { target: 2, typo: 1 }, data));
  assert.throws(() => core.advance(state, NaN, data));
  assert.throws(() => core.advance(state, '2026-10-01', data));
  assert.throws(() => core.updateSource(active(), 'gaoyue', 2, 'panda', { enabled: false }, start, data));
});

test('a known later start advances past undated predecessors and permanently locks skipped history', () => {
  let state = core.setStartDate(defaults(), 'gaoyue', 3, '2026-10-01', start - 1, data);
  state = core.advance(state, start, data);
  assert.equal(state.realms.gaoyue.currentPeriod, 3);
  assert.equal(state.realms.gaoyue.periods[2].ended, true);
  assert.deepEqual(state.realms.gaoyue.periods[2].sources, {});
  assert.equal(state.realms.gaoyue.periods[3].locked, true);
  state = core.updateSource(state, 'gaoyue', 3, 'panda', { obtained: 1 }, start, data);
  assert.equal(state.realms.gaoyue.periods[3].sources.panda.obtained, 1);
  state = core.advance(state, start + 14 * day, data);
  assert.equal(state.realms.gaoyue.currentPeriod, 4);
  assert.equal(state.realms.gaoyue.periods[3].ended, true);
  assert.equal(core.status(state.realms.gaoyue, 3, start, data).phase, 'ended');
});
