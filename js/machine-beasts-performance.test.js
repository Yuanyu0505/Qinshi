const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const DATA = require('../data/machine-beasts.js');

test('低阶机关兽的高目标计算不枚举必然不足的投入数量', () => {
  // 只在测试沙箱计数真实枚举调用，不向产品暴露诊断接口。
  const source = fs.readFileSync(require.resolve('./machine-beasts.js'), 'utf8');
  const counts = [];
  const context = { module: { exports: {} }, count: n => counts.push(n) };
  vm.runInNewContext(source.replace(
    'function buildExactUnlimitedStates(types, exactCount, minimumNeeded, limit, data) {',
    'function buildExactUnlimitedStates(types, exactCount, minimumNeeded, limit, data) { count(exactCount);'
  ), context);
  const result = context.module.exports.calculateInvestmentPlan(DATA,
    DATA.beasts.find(b => b.id === 'potu-qilang'), { research: 1000 },
    { targetLevel: 10, newRankMode: 'zeroToSeven', preferOwnedOnTie: true });
  assert.equal(result.valid, true);
  assert.equal(result.totals.investedCount, 273);
  assert.equal(result.totals.overflow, 40);
  assert.deepEqual(counts, [273], '空库存时仅需生成最少可达投入数的候选');
});

test('新增机关兽候选使用实际最低缺口，避免生成不可能达标的中间组合', () => {
  const source = fs.readFileSync(require.resolve('./machine-beasts.js'), 'utf8');
  const bounds = [];
  const context = { module: { exports: {} }, bound: n => bounds.push(n) };
  vm.runInNewContext(source.replace(
    'function buildExactUnlimitedStates(types, exactCount, minimumNeeded, limit, data) {',
    'function buildExactUnlimitedStates(types, exactCount, minimumNeeded, limit, data) { bound(minimumNeeded);'
  ), context);
  const result = context.module.exports.calculateInvestmentPlan(DATA,
    DATA.beasts.find(b => b.id === 'potu-qilang'), { research: 1000 }, { targetLevel: 10 });
  assert.equal(result.totals.research, 316740);
  assert.deepEqual(bounds, [316700]);
});
