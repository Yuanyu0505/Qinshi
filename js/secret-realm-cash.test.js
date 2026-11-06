// Regression cases for user execution; not run by the assistant (AGENTS.md).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Planner = require('./secret-realm-planner.js');
const source = (price = 1806, draws = 664) => ({ id: 'same-pack', name: '相同礼包组合', price, draws, maxPurchases: 1, availableDraws: 0 });
const fixture = (periods, target, changes = {}) => ({ cumulative: 0, inventory: 0, target, discount: 4.3, vouchers: 0, useVouchers: true, periods, ...changes });

test('identical period purchases display identical cash without chronological budget allocation', () => {
  const result = Planner.plan(fixture([2, 3, 4].map(number => ({ number, sources: [source()] })), 1992));
  assert.equal(result.valid, true);
  for (const plan of [result.fastest, result.cheapest]) {
    assert.deepEqual(plan.periods.map(p => p.discountedCash), [776.58, 776.58, 776.58]);
    assert.deepEqual(plan.periods.flatMap(p => p.rows.map(r => r.discountedCash)), [776.58, 776.58, 776.58]);
    assert.equal(plan.discountedCash, 2329.74);
    assert.equal(plan.roundingAdjustment, 0.26);
    assert.equal(plan.totalAfter, 2330); // The original budget/ranking rule is unchanged.
  }
});

test('separate sources use their own payable cash while the plan retains one total budget ceiling', () => {
  const result = Planner.plan(fixture([{ number: 2, sources: [source(98, 1), { ...source(98, 1), id: 'second' }] }], 2));
  assert.equal(result.valid, true);
  const p = result.cheapest;
  assert.deepEqual(p.periods[0].rows.map(r => r.discountedCash), [42.14, 42.14]);
  assert.equal(p.periods[0].discountedCash, 84.28);
  assert.equal(p.discountedCash, 84.28);
  assert.equal(p.totalAfter, 85);
  assert.equal(p.roundingAdjustment, 0.72);
});

test('voucher cash is deducted before discount and is not rounded to a whole yuan in details', () => {
  const value = fixture([{ number: 2, sources: [source(6, 3)] }], 3, { vouchers: 1.23 });
  const p = Planner.plan(value).cheapest;
  assert.equal(p.voucherUsed, 1.23);
  assert.equal(p.periods[0].rows[0].discountedCash, 2.05);
  assert.equal(p.periods[0].discountedCash, 2.05);
  assert.equal(p.totalAfter, 3);
  assert.equal(p.roundingAdjustment, 0.95);
  assert.equal(Planner.plan({ ...value, useVouchers: false }).cheapest.discountedCash, 2.58);
});

test('currency-only planning has the same unallocated cash breakdown', () => {
  const value = fixture([2, 3].map(number => ({ number, sources: [{ ...source(98, 30), purchaseCurrency: 15 }] })), 0,
    { targetEnabled: false, currencyTargetEnabled: true, currencyTarget: 90, currency: 0 });
  const result = Planner.plan(value);
  assert.equal(result.valid, true);
  for (const p of [result.fastest, result.cheapest]) {
    assert.deepEqual(p.periods.map(row => row.discountedCash), [42.14, 42.14]);
    assert.equal(p.discountedCash, 84.28);
    assert.equal(p.roundingAdjustment, 0.72);
  }
});

test('already reached and voucher-covered plans have zero cash and no invented rounding fee', () => {
  for (const changes of [{ cumulative: 3 }, { vouchers: 6 }]) {
    const result = Planner.plan(fixture([{ number: 2, sources: [source(6, 3)] }], 3, changes));
    assert.equal(result.valid, true);
    assert.equal(result.cheapest.discountedCash, 0);
    assert.equal(result.cheapest.roundingAdjustment, 0);
    assert.ok(result.cheapest.periods.every(p => p.discountedCash === 0));
  }
});

test('sub-cent custom discounts use exact decimal rounding independently of budget allocation', () => {
  const result = Planner.plan(fixture([2, 3].map(number => ({ number, sources: [source(0.01, 1)] })), 2, { discount: 5 }));
  assert.equal(result.valid, true);
  assert.deepEqual(result.cheapest.periods.map(p => p.discountedCash), [0.01, 0.01]);
  assert.equal(result.cheapest.discountedCash, 0.01); // Total uses unrounded costs, not displayed subtotals.
  assert.equal(result.cheapest.roundingAdjustment, 0.99);
  assert.equal(result.cheapest.totalAfter, 1);
});
