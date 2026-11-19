// Isolated local contexts only; no external requests or real accounts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountJson, setAccountJson } = require('./browser-test-helpers.cjs');
const KEY = 'qinshi_machine_beasts_progress_v1';
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function enter(page) {
  await page.locator('.tab[data-partition="machine-beasts"]').click();
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  await page.locator('#machine-price-settings > summary').click();
  await page.locator('.machine-reference-beast-prices summary').click();
}
async function scenario(run) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  try { await openApp(page, origin); await enter(page); await run(page); } finally { await context.close(); }
}
const beast = id => '[data-reference-beast-price="' + id + '"]';
const blueprint = '[data-reference-cost-field="awakeningBlueprintPrice"]';
async function commit(page, selector) { await page.locator(selector).dispatchEvent('change'); }

test('orange blank remains an unsaved draft then blur restores default without replacing other settings', async () => scenario(async page => {
  await page.locator(beast('mechanical-bear')).fill('60000');
  await page.locator(beast('mechanical-kunpeng')).fill('55000');
  const saved = await getAccountJson(page, KEY);
  const input = page.locator(beast('mechanical-bear'));
  await input.fill('');
  assert.equal(await input.inputValue(), '');
  assert.deepEqual(await getAccountJson(page, KEY), saved, 'input must not persist a null override');
  await input.blur();
  assert.equal(await input.inputValue(), '45000');
  const restored = await getAccountJson(page, KEY);
  assert.equal(restored.referenceCost.beastPrices['mechanical-bear'], 45000);
  assert.equal(restored.referenceCost.beastPrices['mechanical-kunpeng'], 55000);
  assert.deepEqual(restored.beasts, saved.beasts);
  await page.reload({ waitUntil: 'networkidle' }); await enter(page);
  assert.equal(await page.locator(beast('mechanical-bear')).inputValue(), '45000');
  await page.locator(beast('mechanical-bear')).fill('55000');
  assert.equal((await getAccountJson(page, KEY)).referenceCost.beastPrices['mechanical-bear'], 55000);
}));

test('blueprint presets and clearing through change or explicit save restore the data default', async () => scenario(async page => {
  for (const preset of ['64', '134']) {
    await page.locator('[data-reference-blueprint-preset]').selectOption(preset);
    assert.equal(await page.locator(blueprint).inputValue(), preset);
    assert.equal((await getAccountJson(page, KEY)).referenceCost.awakeningBlueprintPrice, Number(preset));
  }
  await page.locator(blueprint).fill('81.25');
  await page.locator(blueprint).fill('');
  await commit(page, blueprint);
  assert.equal(await page.locator(blueprint).inputValue(), '70');
  assert.equal(await page.locator('[data-reference-blueprint-preset]').inputValue(), '70');
  await page.locator(beast('mechanical-bear')).fill('');
  await page.locator('[data-machine-action="save-reference-cost"]').dispatchEvent('click');
  assert.equal(await page.locator(beast('mechanical-bear')).inputValue(), '45000');
}));

test('zero, tiny decimals, blue-purple unset, negative and native badInput keep distinct meanings', async () => scenario(async page => {
  for (const value of ['0', '0.000000001']) {
    await page.locator(beast('mechanical-bear')).fill(value); await commit(page, beast('mechanical-bear'));
    assert.equal((await getAccountJson(page, KEY)).referenceCost.beastPrices['mechanical-bear'], Number(value));
  }
  await page.locator(beast('mechanical-wing')).fill('12.5');
  await page.locator(beast('mechanical-wing')).fill(''); await commit(page, beast('mechanical-wing'));
  assert.equal((await getAccountJson(page, KEY)).referenceCost.beastPrices['mechanical-wing'], null);
  const saved = await getAccountJson(page, KEY);
  await page.locator(beast('mechanical-bear')).fill('-1'); await commit(page, beast('mechanical-bear'));
  assert.deepEqual(await getAccountJson(page, KEY), saved);
  await page.locator(beast('mechanical-bear')).fill('2');
  const valid = await getAccountJson(page, KEY);
  await page.locator(beast('mechanical-bear')).fill('');
  await page.locator(beast('mechanical-bear')).press('e');
  assert.equal(await page.locator(beast('mechanical-bear')).evaluate(node => node.validity.badInput), true);
  await commit(page, beast('mechanical-bear'));
  assert.deepEqual(await getAccountJson(page, KEY), valid);
  assert.match(await page.locator('[data-reference-cost-save-status]').textContent(), /非负有限数/);
}));

for (const mode of ['false', 'throw', 'readonly']) test('default restore stays temporary on storage ' + mode, async () => scenario(async page => {
  await page.locator(beast('mechanical-bear')).fill('60000');
  const saved = await getAccountJson(page, KEY);
  await page.evaluate(mode => {
    window.__oldSet = window.QinshiAccounts.setItem;
    window.__oldRead = window.QinshiAccounts.isReadOnly;
    if (mode === 'readonly') window.QinshiAccounts.isReadOnly = () => true;
    else window.QinshiAccounts.setItem = () => { if (mode === 'throw') throw Error('test unavailable'); return false; };
  }, mode);
  await page.locator(beast('mechanical-bear')).fill(''); await commit(page, beast('mechanical-bear'));
  assert.equal(await page.locator(beast('mechanical-bear')).inputValue(), '45000');
  assert.deepEqual(await getAccountJson(page, KEY), saved);
  assert.match(await page.locator('[data-reference-cost-save-status]').textContent(), mode === 'readonly' ? /只读/ : /未保存/);
  await page.evaluate(() => { window.QinshiAccounts.setItem = window.__oldSet; window.QinshiAccounts.isReadOnly = window.__oldRead; });
  await page.locator('[data-machine-action="save-reference-cost"]').click();
  assert.equal((await getAccountJson(page, KEY)).referenceCost.beastPrices['mechanical-bear'], 45000);
}));

test('historical null defaults are effective only and loading never migrates the account record', async () => scenario(async page => {
  const raw = { beasts: {}, referenceCost: { awakeningBlueprintPrice: null, awakeningBlueprintStock: 17, useAwakeningBlueprintStock: false, beastPrices: { 'mechanical-bear': null, 'mechanical-kunpeng': 55000, 'mechanical-wing': 12.5 } } };
  await setAccountJson(page, KEY, raw);
  await page.reload({ waitUntil: 'networkidle' }); await enter(page);
  assert.equal(await page.locator(blueprint).inputValue(), '70');
  assert.equal(await page.locator(beast('mechanical-bear')).inputValue(), '45000');
  assert.equal(await page.locator(beast('mechanical-kunpeng')).inputValue(), '55000');
  assert.deepEqual(await getAccountJson(page, KEY), raw);
}));

test('clearing resolves current data rules rather than frozen UI constants', async () => scenario(async page => {
  await page.evaluate(() => {
    window.MACHINE_BEAST_DATA.referenceCostRules.orangeFiveBodyPrice = 46001;
    window.MACHINE_BEAST_DATA.referenceCostRules.blueprintPrice = 71;
  });
  await page.locator(beast('mechanical-bear')).fill(''); await commit(page, beast('mechanical-bear'));
  await page.locator(blueprint).fill(''); await commit(page, blueprint);
  assert.equal(await page.locator(beast('mechanical-bear')).inputValue(), '46001');
  assert.equal(await page.locator(blueprint).inputValue(), '71');
  assert.equal(await page.locator('[data-reference-blueprint-preset]').inputValue(), 'custom');
}));
