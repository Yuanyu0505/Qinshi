'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('optional currency goal counts new draws and direct gifts, never historical draws',()=>{
  const input={cumulative:1000,inventory:0,target:0,targetEnabled:false,currency:0,currencyTargetEnabled:true,currencyTarget:45,discount:10,vouchers:0,useVouchers:true,periods:[{number:2,sources:[{id:'pack98',name:'98礼包',draws:30,price:98,maxPurchases:1,availableDraws:0,purchaseCurrency:15,availableCurrency:0}]}]};
  const r=planner.plan(input);assert.equal(r.valid,true);assert.equal(r.cheapest.totalBefore,98);assert.equal(r.cheapest.plannedDraws,30);assert.equal(r.cheapest.currencyBalance,45);assert.equal(r.cheapest.remainingTickets,0);
  const both=planner.plan({...input,targetEnabled:true,target:1031});assert.equal(both.cheapest,null);assert.equal(both.shortfall,1);
});

test('surplus all is postprocessing and never adds purchases or unselected sources',()=>{
  const input={cumulative:0,inventory:0,target:100,currency:4,currencyTargetEnabled:false,discount:4,vouchers:0,useVouchers:true,periods:[{number:6,sources:[{id:'pack',name:'礼包',draws:105,price:100,maxPurchases:1,availableDraws:0,purchaseCurrency:15}]}]};
  const stop=planner.plan({...input,drawMode:'stop'}).cheapest,all=planner.plan({...input,drawMode:'all'}).cheapest;
  assert.equal(stop.plannedDraws,100);assert.equal(stop.remainingTickets,5);assert.equal(stop.currencyBalance,119);
  assert.equal(all.plannedDraws,105);assert.equal(all.remainingTickets,0);assert.equal(all.currencyBalance,124);
  assert.deepEqual(all.periods[0].rows.map(r=>r.purchases),stop.periods[0].rows.map(r=>r.purchases));assert.equal(all.totalBefore,stop.totalBefore);
});

test('joint targets choose currency-rich packs and unlimited supplementation without target-sized arrays',()=>{
  const base={cumulative:0,inventory:0,target:20,targetEnabled:true,currency:0,currencyTargetEnabled:true,currencyTarget:45,discount:10,vouchers:0,useVouchers:true,periods:[{number:2,sources:[{id:'cheap',name:'便宜券',draws:30,price:30,maxPurchases:1,availableDraws:0,purchaseCurrency:0},{id:'rich',name:'道具礼包',draws:30,price:40,maxPurchases:1,availableDraws:0,purchaseCurrency:15}]}]};
  const r=planner.plan(base);assert.equal(r.cheapest.totalBefore,40);assert.equal(r.cheapest.plannedDraws,30);assert.equal(r.cheapest.currencyBalance,45);
  const big=planner.plan({...base,targetEnabled:false,currencyTarget:1000000000000,periods:[{number:6,sources:[{id:'pack648',name:'648',draws:130,price:648,maxPurchases:null,availableDraws:0,purchaseCurrency:110}]}]});
  assert.equal(big.valid,true);assert.equal(big.cheapest.periods[0].rows[0].purchases,4166666667);assert.equal(big.cheapest.plannedDraws,541666666630);assert.equal(big.cheapest.currencyBalance,1000000000000);
});

test('existing unused tickets may satisfy only the currency goal with zero new cost',()=>{
  const r=planner.plan({cumulative:500,inventory:10,target:0,targetEnabled:false,currency:3,currencyTargetEnabled:true,currencyTarget:8,drawMode:'stop',discount:4,vouchers:0,useVouchers:true,periods:[]});
  assert.equal(r.valid,true);assert.equal(r.cheapest.plannedDraws,5);assert.equal(r.cheapest.remainingTickets,5);assert.equal(r.cheapest.currencyBalance,8);
});

test('joint currency optimization agrees with an independent exhaustive purchase oracle',()=>{
  let seed=2781;const next=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let fixture=0;fixture<100;fixture++){
    const value={cumulative:next(4),inventory:next(4),currency:next(4),target:4+next(12),targetEnabled:!!next(2),currencyTargetEnabled:true,currencyTarget:4+next(16),discount:[0.0001,4.3,10][next(3)],vouchers:next(3),useVouchers:!!next(2),periods:Array.from({length:1+next(2)},(_,i)=>({number:i+2,sources:Array.from({length:3},(_,j)=>({id:'s'+j,name:'s'+j,draws:1+next(4),price:1+next(6),maxPurchases:next(3),availableDraws:next(3),availableCurrency:next(3),purchaseCurrency:next(4)}))}))};
    const candidates=[];const target=value.targetEnabled?value.target:value.cumulative;
    const enough=(tickets,gifts)=>tickets>=target-value.cumulative&&tickets+gifts+value.currency>=value.currencyTarget;
    if(enough(value.inventory,0))candidates.push([null,0,0,value.cumulative+value.inventory-target]);
    else for(let last=0;last<value.periods.length;last++){
      const rows=value.periods.slice(0,last+1).flatMap(p=>p.sources);
      const free=rows.reduce((n,s)=>n+s.availableDraws,0),gift=rows.reduce((n,s)=>n+s.availableCurrency,0);
      const walk=(i,t,g,cost)=>{if(i===rows.length){if(!enough(value.inventory+free+t,gift+g))return;const v=value.useVouchers?Math.min(cost,value.vouchers):0;candidates.push([value.periods[last].number,Math.round((cost-v)*100*value.discount/10),v*100,value.cumulative+value.inventory+free+t-target]);return;}const s=rows[i];for(let n=0;n<=s.maxPurchases;n++)walk(i+1,t+n*s.draws,g+n*s.purchaseCurrency,cost+n*s.price);};walk(0,0,0,0);
    }
    const best=keys=>candidates.slice().sort((a,b)=>{for(const k of keys)if(a[k]!==b[k])return a[k]-b[k];return 0;})[0]||null;
    const r=planner.plan(value);assert.equal(r.valid,true,JSON.stringify(value));assert.deepEqual(tuple(r.fastest),best([0,1,2,3]),'fast '+JSON.stringify(value));assert.deepEqual(tuple(r.cheapest),best([1,2,0,3]),'cheap '+JSON.stringify(value));
    for(const p of [r.fastest,r.cheapest].filter(Boolean)){assert.ok(p.currencyBalance>=value.currencyTarget);assert.ok(!value.targetEnabled||p.finalCumulative>=value.target);assert.equal(p.currencyBalance,value.currency+p.directCurrency+p.plannedDraws);assert.equal(p.remainingTickets,p.availableTotal-value.cumulative-p.plannedDraws);}
  }
});
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plannerPath = path.join(__dirname, 'secret-realm-planner.js');
const planner = fs.existsSync(plannerPath) ? require(plannerPath) : {};
const source = (id, draws, price, maxPurchases, availableDraws = 0) =>
  ({ id, name: id, draws, price, maxPurchases, availableDraws });
const input = (periods = [], overrides = {}) =>
  ({ cumulative: 0, inventory: 0, target: 10, discount: 10, vouchers: 0,
    useVouchers: true, periods, ...overrides });
const cents = value => Math.round(value * 100);

// This oracle enumerates purchase vectors, not draws/cost DP states. Its tiny
// bounded universe and independent tuple ordering expose optimizer shortcuts.
function oracle(value) {
  const base = value.cumulative + value.inventory;
  if (base >= value.target) return { fastest: [null, 0, 0, base - value.target],
    cheapest: [null, 0, 0, base - value.target] };
  const candidates = [];
  for (let last = 0; last < value.periods.length; last++) {
    const rows = value.periods.slice(0, last + 1).flatMap(period => period.sources);
    const free = rows.reduce((sum, row) => sum + row.availableDraws, 0);
    function visit(index, draws, before) {
      if (index === rows.length) {
        if (base + free + draws < value.target) return;
        const voucher = value.useVouchers ? Math.min(cents(value.vouchers), before) : 0;
        const cash = Math.round((before - voucher) * value.discount / 10);
        candidates.push([value.periods[last].number, cash, voucher,
          base + free + draws - value.target]);
        return;
      }
      const row = rows[index];
      const limit = row.maxPurchases === null
        ? Math.ceil(Math.max(0, value.target - base - free) / row.draws)
        : row.maxPurchases;
      for (let count = 0; count <= limit; count++) {
        visit(index + 1, draws + count * row.draws, before + count * cents(row.price));
      }
    }
    visit(0, 0, 0);
  }
  function best(order) {
    return candidates.slice().sort((left, right) => {
      for (const index of order) if (left[index] !== right[index]) return left[index] - right[index];
      return 0;
    })[0] || null;
  }
  return { fastest: best([0, 1, 2, 3]), cheapest: best([1, 2, 0, 3]) };
}

function tuple(plan) {
  return plan && [plan.reachPeriod, cents(plan.totalAfter), cents(plan.voucherUsed), plan.surplus];
}

function checkAccounting(value, plan) {
  if (!plan) return;
  let totalDraws = value.cumulative + value.inventory;
  const sums = { before: 0, voucherUsed: 0, after: 0 };
  for (const period of plan.periods) {
    const original = value.periods.find(item => item.number === period.number);
    let draws = 0;
    for (const row of period.rows) {
      const model = original.sources.find(item => item.id === row.id);
      assert.equal(row.availableDraws, model.availableDraws);
      assert.equal(row.draws, row.availableDraws + row.purchases * model.draws);
      assert.equal(cents(row.before), row.purchases * cents(model.price));
      assert.ok(row.purchases >= 0 && Number.isSafeInteger(row.purchases));
      assert.ok(model.maxPurchases === null || row.purchases <= model.maxPurchases);
      assert.ok(row.after >= 0 && row.voucherUsed >= 0 && row.voucherUsed <= row.before);
      draws += row.draws;
    }
    assert.equal(period.draws, draws);
    totalDraws += draws;
    for (const key of Object.keys(sums)) {
      assert.equal(cents(period[key]), period.rows.reduce((sum, row) => sum + cents(row[key]), 0));
      sums[key] += cents(period[key]);
    }
  }
  assert.equal(cents(plan.totalBefore), sums.before);
  assert.equal(cents(plan.voucherUsed), sums.voucherUsed);
  assert.equal(cents(plan.totalAfter), sums.after);
  assert.equal(plan.availableTotal, totalDraws);
  assert.equal(plan.surplus, totalDraws - value.target);
}

test('exports the same pure JSON planner in CommonJS and the browser', () => {
  assert.equal(typeof planner.plan, 'function');
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(plannerPath, 'utf8'), sandbox);
  assert.equal(typeof sandbox.SECRET_REALM_PLANNER.plan, 'function');
});

test('already reached uses inventory once and buys nothing without periods', () => {
  const value = input([], { cumulative: 7, inventory: 4 });
  const result = planner.plan(value);
  assert.equal(result.valid, true);
  assert.deepEqual(tuple(result.fastest), [null, 0, 0, 1]);
  assert.equal(result.fastest.availableTotal, 11);
  assert.deepEqual(result.fastest.periods, []);
  assert.deepEqual(result.fastest, result.cheapest);
});

test('bounded combinations are exact rather than best-ratio greedy', () => {
  const value = input([{ number: 1, sources: [source('ratio', 6, 5, 2), source('fit', 5, 4.5, 2)] }]);
  const result = planner.plan(value);
  assert.deepEqual(tuple(result.cheapest), [1, 900, 0, 0]);
  assert.equal(result.cheapest.periods[0].rows[1].purchases, 2);
  checkAccounting(value, result.cheapest);
});

test('fastest and cheapest respect prefix free draws and each period unlimited permission', () => {
  const value = input([
    { number: 2, sources: [] },
    { number: 3, sources: [source('allowed-only-here', 130, 648, null)] },
    { number: 4, sources: [source('free-later', 1, 0, 0, 150)] }
  ], { target: 140 });
  const result = planner.plan(value);
  assert.deepEqual(tuple(result.fastest), [3, 129600, 0, 120]);
  assert.deepEqual(tuple(result.cheapest), [4, 0, 0, 10]);
  assert.deepEqual(result.fastest.periods.map(period => period.number), [2, 3]);
  assert.equal(result.maxReachable, null);
  checkAccounting(value, result.fastest);
  checkAccounting(value, result.cheapest);
});

test('prepaid available draws cost nothing; free prefix is not collected twice', () => {
  const value = input([
    { number: 1, sources: [source('prepaid', 88, 98, 0, 40)] },
    { number: 2, sources: [source('next-free', 1, 0, 0, 20)] }
  ], { cumulative: 10, inventory: 5, target: 70 });
  const result = planner.plan(value);
  assert.deepEqual(tuple(result.cheapest), [2, 0, 0, 5]);
  assert.equal(result.cheapest.availableTotal, 75);
  assert.equal(result.maxReachable, 75);
});

test('voucher ties prefer fewer vouchers; disabled vouchers do not affect ranking', () => {
  const value = input([{ number: 1, sources: [source('more', 11, 10, 1), source('exact', 10, 9, 1)] }],
    { vouchers: 100, discount: 4.3 });
  assert.deepEqual(tuple(planner.plan(value).cheapest), [1, 0, 900, 0]);
  assert.deepEqual(tuple(planner.plan({ ...value, useVouchers: false }).cheapest), [1, 387, 0, 0]);
});

test('cash rounding ties use least overshoot instead of least original price', () => {
  const value = input([{ number: 1, sources: [source('cheap-extra', 11, 0.01, 1), source('exact', 10, 0.02, 1)] }],
    { discount: 0.1 });
  assert.deepEqual(tuple(planner.plan(value).cheapest), [1, 0, 0, 0]);
});

test('fractional discount rounds once and allocates vouchers and residual cents chronologically', () => {
  const value = input([
    { number: 1, sources: [source('a', 1, 0.01, 1), source('b', 1, 0.01, 1)] },
    { number: 2, sources: [source('c', 1, 0.01, 1)] }
  ], { target: 3, vouchers: 0.01, discount: 3.333333 });
  const result = planner.plan(value);
  const rows = result.cheapest.periods.flatMap(period => period.rows);
  assert.deepEqual(rows.map(row => row.voucherUsed), [0.01, 0, 0]);
  assert.deepEqual(rows.map(row => row.after), [0, 0, 0.01]);
  assert.equal(result.cheapest.totalAfter, 0.01);
  checkAccounting(value, result.cheapest);
});

test('unreachable result reports finite maximum and missing draws, including empty periods', () => {
  assert.deepEqual(planner.plan(input()), { valid: true, error: null, fastest: null, cheapest: null,
    maxReachable: 0, shortfall: 10 });
  const result = planner.plan(input([{ number: 1, sources: [source('finite', 3, 1, 2, 1)] }]));
  assert.equal(result.maxReachable, 7);
  assert.equal(result.shortfall, 3);
  assert.equal(result.fastest, null);
});

test('a huge target uses mathematical unlimited counts rather than target-sized memory', () => {
  const value = input([{ number: 6, sources: [source('unlimited', 130, 648, null)] }], { target: 1_000_000_000_000 });
  const started = performance.now();
  const result = planner.plan(value);
  assert.equal(result.valid, true);
  assert.equal(result.cheapest.periods[0].rows[0].purchases, 7_692_307_693);
  assert.equal(result.cheapest.availableTotal, 1_000_000_000_090);
  assert.ok(performance.now() - started < 2000);
});

test('rejects invalid numeric inputs, duplicate sources, and safe-integer cost overflow explicitly', () => {
  const bad = [
    input([], { target: '' }), input([], { inventory: -1 }), input([], { cumulative: Infinity }),
    input([], { discount: 0 }), input([], { discount: NaN }), input([], { vouchers: 0.001 }),
    input([], { useVouchers: 'true' }), input([{ number: 1, sources: [source('a', 1, -1, 1)] }]),
    input([{ number: 1, sources: [source('a', 1, 1, 1), source('a', 1, 1, 1)] }]),
    input([{ number: 1, sources: [source('unlimited', 130, 648, null)] }], { target: Number.MAX_SAFE_INTEGER })
  ];
  for (const value of bad) {
    const result = planner.plan(value);
    assert.equal(result.valid, false, JSON.stringify(value));
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.equal(result.fastest, null);
    assert.equal(result.cheapest, null);
  }
});

test('does not mutate frozen input, current inventory, or voucher balance', () => {
  const value = input([{ number: 1, sources: [source('paid', 3, 6, 4, 1)] }], { inventory: 2, vouchers: 3 });
  const snapshot = JSON.stringify(value);
  function freeze(object) {
    for (const child of Object.values(object)) if (child && typeof child === 'object') freeze(child);
    return Object.freeze(object);
  }
  freeze(value);
  const result = planner.plan(value);
  assert.equal(result.valid, true);
  assert.equal(JSON.stringify(value), snapshot);
  checkAccounting(value, result.cheapest);
});

test('an overflowing fastest option is reported instead of silently replacing it with a later plan', () => {
  const value = input([
    { number: 1, sources: [source('huge-first', 130, 648, null)] },
    { number: 2, sources: [source('free-later', 1, 0, 0, 20_000_000_000_000)] }
  ], { target: 20_000_000_000_000 });
  const result = planner.plan(value);
  assert.equal(result.valid, false);
  assert.match(result.error, /安全整数/);
});

test('full six-period finite catalogs remain small independently of a trillion-draw target', () => {
  const catalog = [[88, 98, 1], [3, 6, 14], [10, 30, 6], [30, 98, 4], [55, 198, 2], [80, 328, 2]];
  const periods = Array.from({ length: 6 }, (_, index) => ({ number: index + 1,
    sources: [source('free', 1, 0, 0, 84),
      ...catalog.map(([draws, price, limit], row) => source(`pack${row}`, draws, price, limit)),
      source('big', 130, 648, null)] }));
  const value = input(periods, { target: 1_000_000_000_000, discount: 4.3, vouchers: 99.99 });
  const started = performance.now();
  const result = planner.plan(value);
  assert.equal(result.valid, true);
  assert.equal(result.fastest.reachPeriod, 1);
  assert.equal(result.cheapest.reachPeriod, 6);
  checkAccounting(value, result.fastest);
  checkAccounting(value, result.cheapest);
  assert.ok(performance.now() - started < 4000);
});

test('independent exhaustive oracle agrees on 160 deterministic small cross-period universes', () => {
  let seed = 93821;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let index = 0; index < 160; index++) {
    const periods = Array.from({ length: 1 + next(3) }, (_, period) => ({ number: period + 2,
      sources: Array.from({ length: 1 + next(2) }, (_, row) => source(`p${period}r${row}`,
        1 + next(5), next(8) / 100, next(3), next(4))) }));
    if (index % 4 === 0) periods[next(periods.length)].sources.push(source('unbounded', 4, 0.05, null));
    const value = input(periods, { target: 1 + next(20), cumulative: next(3), inventory: next(3),
      vouchers: next(8) / 100, useVouchers: !!next(2), discount: [0.1, 4.3, 10][next(3)] });
    const expected = oracle(value);
    const actual = planner.plan(value);
    assert.equal(actual.valid, true, JSON.stringify(value));
    assert.deepEqual(tuple(actual.fastest), expected.fastest, `fastest ${JSON.stringify(value)}`);
    assert.deepEqual(tuple(actual.cheapest), expected.cheapest, `cheapest ${JSON.stringify(value)}`);
    checkAccounting(value, actual.fastest);
    checkAccounting(value, actual.cheapest);
  }
});
