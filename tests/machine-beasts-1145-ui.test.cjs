'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = { document: { addEventListener() {} } };
context.window = context;
vm.createContext(context);
for (const file of ['data/machine-beasts.js', 'js/machine-beasts.js', 'js/number-format.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const source = fs.readFileSync(path.join(root, 'js/machine-beasts-ui.js'), 'utf8');
vm.runInContext(source.replace('window.MACHINE_BEAST_UI = {',
  'window.testUI = { calcTargetOptions, calcTargetPicker, calculatorInventorySelector, conversionSummary, researchReference, formatNumber }; window.MACHINE_BEAST_UI = {'), context);
const ui = context.window.testUI;

test('UI number formatting preserves BigInt precision and uses four-digit groups', () => {
  assert.equal(ui.formatNumber(123456789), '1,2345,6789');
  assert.equal(ui.formatNumber(123456789123456789123456789n), '123,4567,8912,3456,7891,2345,6789');
});

test('target options retain values and selection without research labels', () => {
  assert.equal(ui.calcTargetOptions({ maxLevel: 3 }, 2, 1), '<option value="1">1级</option><option value="2" selected>2级</option><option value="3">3级</option>');
});

test('target picker limits visible rows without removing later levels', () => {
  const html = ui.calcTargetPicker({ maxLevel: 25 }, 25, 0);
  assert.match(html, /size="10"/);
  assert.match(html, /value="25" selected>25级/);
  assert.equal((html.match(/<option /g) || []).length, 25);
  assert.match(ui.calcTargetPicker({ maxLevel: 3 }, 2, 1), /size="3"/);
});

test('inventory row keeps usage cap and disabled state together', () => {
  const html = ui.calculatorInventorySelector({ id: 'war-demon' }, { inventory: { none: { 7: 3 } } }, { useOwnedInventory: false, limits: { none: { 7: 2 } } }, 'single', true);
  assert.match(html, /max="3" step="1" value="2"/);
  assert.match(html, /data-machine-owned-limit[^>]+ disabled/);
  assert.match(html, /class="machine-owned-quantity"/);
  assert.match(html, /class="machine-owned-stock"/);
});

test('conversion disclosure shows original source and separate unpriced core deficit', () => {
  const html = ui.conversionSummary({ sources: [{ rank: 7, modificationId: 'fullDivine', count: 1, baseBodies: 128, returnedCores: 145 }], usedBaseBodies: 64, remainingBaseBodies: 64 }, { returned: 145, spent: 160, reused: 145, externalDeficit: 15, remaining: 0, looseOwned: 0, estimatedBoxes: 75, unpriced: true }, 'test');
  assert.match(html, /<details/);
  for (const text of ['库存转换与改造神核', '返还', '145', '分配', '160', '缺口', '15', '剩余', '约75箱', '非保底', '改造神核未计价']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /NaN|undefined|神核[^<]*元宝/);
});

test('loose cores remain visible without converted bodies', () => {
  const html = ui.conversionSummary(null, { returned: 0, spent: 40, reused: 40, externalDeficit: 0, remaining: 5, looseOwned: 45, estimatedBoxes: 0, unpriced: false }, 'loose');
  assert.match(html.replace(/<[^>]*>/g, ''), /已有散装神核45/);
  assert.doesNotMatch(html, /改造神核未计价/);
});

test('research reference estimates boxes from each stage without changing core requirements', () => {
  const html = ui.researchReference();
  const table = html.match(/<table>[\s\S]*?<\/table>/)[0];
  assert.deepEqual(Array.from(table.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>(\d+)<\/td><td>(\d+)<\/td><td[^>]*>(\d+)<\/td><\/tr>/g), match => match.slice(1)), [
    ['升神', '40', '40', '200'], ['天改', '15', '55', '75'], ['仙改', '20', '75', '100'], ['圣改', '30', '105', '150'], ['神改', '40', '145', '200']
  ]);
  for (const text of ['改造阶段', '本阶段所需神核', '所需神核箱子预估（按10出2计算）']) assert.ok(table.includes(text), text);
});
