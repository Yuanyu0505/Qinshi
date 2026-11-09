// UI-only regressions for user-run acceptance. Not executed by the implementation agent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem } = require('./browser-test-helpers.cjs');
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function scenario(run, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openApp(page, origin);
    if (await page.locator('#mobile-more-toggle').isVisible()) {
      await page.locator('#mobile-more-toggle').click(); await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
    } else await page.locator('.tab[data-partition="machine-beasts"]').click();
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('red-serpent');
    await run(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
test('calculator controls precede result in actual DOM and viewport reading order', async () => scenario(async page => {
  assert.equal(await page.evaluate(() => Boolean(document.getElementById('machine-beast-calculator-controls').compareDocumentPosition(document.getElementById('machine-beast-calculator-result')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
}));
test('inventory flags retain open state and identity; radio restoration distinguishes both values', async () => scenario(async page => {
  const inventory = page.locator('.machine-temporary-inventory');
  await inventory.locator('summary').click();
  await page.locator('[data-calc-flag="showHighRanks"]').check();
  assert.equal(await inventory.evaluate(node => node.open), true);
  await page.locator('[data-calc-flag="showMods"]').check();
  assert.equal(await inventory.evaluate(node => node.open), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.calcFlag), 'showMods');
  await page.locator('[data-new-rank-mode-scope="single"][value="zero"]').check();
  await page.locator('[data-new-rank-mode-scope="single"][value="zeroToSeven"]').check();
  assert.equal(await page.evaluate(() => document.activeElement.value), 'zeroToSeven');
}));
test('return restores hidden calculator disclosure state without rereading stale hidden DOM', async () => scenario(async page => {
  const inventory = page.locator('.machine-temporary-inventory');
  await inventory.locator('summary').click();
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.evaluate(() => { window.__savedLayoutView = window.MACHINE_BEAST_UI.captureView(); });
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  await inventory.locator('summary').click();
  assert.equal(await inventory.evaluate(node => node.open), false);
  await page.evaluate(() => window.MACHINE_BEAST_UI.restoreView(window.__savedLayoutView));
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  assert.equal(await inventory.evaluate(node => node.open), true);
}));
test('same-object search retains real busy Worker and disabled button; switching object invalidates result', async () => scenario(async page => {
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { requested = resolve; });
  await page.route('**/calculation-worker.js*', async route => { requested(); await gate; await route.continue().catch(() => {}); });
  try {
    await page.locator('[data-machine-action="calculate"]').click(); await seen;
    await page.locator('[data-machine-search="calculator"]').fill('赤练王蛇');
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().searches.calculator === '赤练王蛇');
    assert.equal(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('[data-machine-action="calculate"]').isDisabled(), true);
    assert.equal(await page.locator('[data-machine-calculating-status]').isVisible(), true);
    release();
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().calcResult != null);
    await page.locator('[data-machine-search="calculator"]').fill('兵魔神');
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().calcBeastId === 'war-demon');
    assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult), null);
  } finally { release(); }
}));
test('reference search preserves unrelated sections and independent stage school state', async () => scenario(async page => {
  await page.locator('[data-machine-beast-mode="reference"]').click();
  await page.locator('[data-machine-school-scope="reference-stages"][data-school-id="nonAttack"]').click();
  await page.evaluate(() => { window.__referenceMaterials = document.getElementById('machine-reference-materials'); });
  await page.locator('[data-machine-search="reference"]').fill('赤练王蛇');
  await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().searches.reference === '赤练王蛇');
  assert.equal(await page.evaluate(() => window.__referenceMaterials === document.getElementById('machine-reference-materials')), true);
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().referenceStageSchoolId), 'nonAttack');
  assert.equal(await page.locator('.machine-reference-index a').count(), 7);
  await page.locator('a[href="#machine-reference-values"]').first().click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'machine-reference-values');
}));
test('presentation filters do not save inventory and explicit navigation can reveal an unstocked blue beast', async () => scenario(async page => {
  const before = await getAccountItem(page, 'qinshi_machine_beasts_progress_v1');
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.locator('[data-progress-quality]').selectOption('orange');
  await page.locator('[data-progress-stocked]').check();
  await page.evaluate(() => window.MACHINE_BEAST_UI.applyNavigationQuery('机关蛇'));
  assert.equal(await page.locator('[data-progress-quality]').inputValue(), 'all');
  assert.equal(await page.locator('[data-progress-stocked]').isChecked(), false);
  assert.match(await page.locator('[data-progress-card]').allTextContents().then(items => items.join(' ')), /机关蛇/);
  assert.equal(await getAccountItem(page, 'qinshi_machine_beasts_progress_v1'), before);
}));
for (const width of [320, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1920]) {
  test(`${width}px module containers keep full controls and seven references without whole-page horizontal overflow`, async () => scenario(async page => {
    for (const mode of ['progress', 'calculator', 'reference']) {
      await page.locator('[data-machine-beast-mode="' + mode + '"]').click();
      if (mode === 'reference') {
        assert.equal(await page.locator('#machine-beast-reference-content > section.panel').count(), 7);
        for (const href of await page.locator('.machine-reference-index a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) assert.equal(await page.locator(href).count(), 1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width} ${mode}`);
    }
  }, width));
}
