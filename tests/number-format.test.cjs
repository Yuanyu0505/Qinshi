const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const helperPath = path.join(__dirname, '../js/number-format.js');
// Falling back to the previous display behavior makes the missing feature fail
// on the grouping contract rather than on a missing-module error.
const api = fs.existsSync(helperPath) ? require(helperPath) : {
  format: (value, options) => new Intl.NumberFormat('zh-CN', options).format(value)
};

test('groups integer digits from the right in groups of four', () => {
  for (const [value, expected] of [[0, '0'], [9999, '9999'], [10000, '1,0000'], [2412304, '241,2304'], [123456789, '1,2345,6789'], [-2412304, '-241,2304']]) {
    assert.equal(api.format(value), expected);
  }
});

test('preserves BigInt precision without converting to Number', () => {
  assert.equal(api.format(123456789012345678901234567890n), '12,3456,7890,1234,5678,9012,3456,7890');
  assert.equal(api.format(-100000000000000000001n), '-1,0000,0000,0000,0000,0001');
});

test('retains decimal rounding, padding and sign options', () => {
  assert.equal(api.format(2412304.567, { maximumFractionDigits: 2 }), '241,2304.57');
  assert.equal(api.format(10000.5, { minimumFractionDigits: 3 }), '1,0000.500');
  assert.equal(api.format(10000.9, { maximumFractionDigits: 0 }), '1,0001');
  assert.equal(api.format(10000, { signDisplay: 'always' }), '+1,0000');
  assert.equal(api.format(-0), '-0');
  assert.equal(api.format(10000, { useGrouping: false }), '10000');
});

test('supports browser loading without changing Number or Intl globals', () => {
  assert.ok(fs.existsSync(helperPath), 'browser helper must exist');
  const sandbox = vm.createContext({});
  vm.runInContext('this.originalLocale = Number.prototype.toLocaleString; this.originalIntl = Intl.NumberFormat;', sandbox);
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), sandbox);
  assert.equal(vm.runInContext('QinshiNumberFormat.format(2412304)', sandbox), '241,2304');
  assert.equal(vm.runInContext('Number.prototype.toLocaleString === originalLocale && Intl.NumberFormat === originalIntl', sandbox), true);
});

test('retains non-finite display and leaves input data unchanged', () => {
  const values = [2412304, 12345678901234567890n];
  const before = values.slice();
  values.forEach(value => api.format(value));
  assert.deepEqual(values, before);
  assert.equal(api.format(NaN), 'NaN');
  assert.equal(api.format(Infinity), '∞');
  assert.equal(api.format(-Infinity), '-∞');
});

test('reformats reference display text without rounding decimals or changing dates', () => {
  assert.equal(typeof api.formatText, 'function');
  assert.equal(api.formatText('生命320,000，攻击40000，-123456.78900%'), '生命32,0000，攻击4,0000，-12,3456.78900%');
  assert.equal(api.formatText('2026-11-19 12:34:56，75×3=225，1234'), '2026-11-19 12:34:56，75×3=225，1234');
  assert.equal(api.formatText('123456789012345678901234567890.123400'), '12,3456,7890,1234,5678,9012,3456,7890.123400');
  assert.equal(api.formatText('1.123456，75,3，1,2345'), '1.123456，75,3，1,2345');
});
