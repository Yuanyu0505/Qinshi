'use strict';
// Authored for isolated test contexts; not executed by the implementation agent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let server, browser, url;
test('missing soul-shop data reports an error and later clicks retry initialization once', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
    await page.route('**/data/soul-shop.js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.SOUL_SHOP_DATA = undefined;' }));
    await openApp(page, url + '/');
    await page.evaluate(() => { document.getElementById('partition-forbidden').hidden = false; });
    await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('#soul-shop-start-error').isVisible(), true);
    await page.evaluate(data => { window.SOUL_SHOP_DATA = data; }, require('../data/soul-shop.js'));
    await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('#soul-shop-start-error').count(), 0);
    for (let i = 0; i < 3; i++) await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('.soul-editor').count(), 1);
    await page.locator('[data-soul-period="2026-11-16"] [data-soul-select="丽姬"]').click();
    assert.equal(await page.locator('[data-soul-period="2026-11-16"] [data-soul-select="丽姬"]').isChecked(), true);
  } finally { await context.close(); }
});
test('soul shop binds independently when the app initializer is interrupted', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
    await page.route('**/js/app.js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("isolated startup failure");' }));
    await openApp(page, url + '/');
    await page.evaluate(() => { document.getElementById('partition-forbidden').hidden = false; });
    await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('#soul-shop-panel').isVisible(), true);
    assert.equal(await page.locator('.soul-card').count(), 2);
    assert.equal(await page.locator('#forbidden-main-panel').isVisible(), false);
  } finally { await context.close(); }
});
before(async () => { server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); url = 'http://127.0.0.1:' + server.address().port; browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });
for (const width of [320, 820, 1440]) test(width + ': independent soul shop selections, dialog and navigation', async () => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
    await openApp(page, url + '/#forbidden');
    await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('.soul-card').count(), 2);
    const current = page.locator('[data-soul-period="2026-11-16"]');
    assert.equal(await current.locator('tbody tr').count(), 4);
    assert.equal(await current.locator('table').evaluate(n => n.getBoundingClientRect().width <= n.parentElement.clientWidth), true);
    const oldForbidden = await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_forbidden_needs_v2'));
    await current.locator('[data-soul-select="太子燕丹"]').check();
    let saved = await page.evaluate(() => JSON.parse(window.QinshiAccounts.getItem('qinshi_soul_shop_needs_v1')));
    assert.deepEqual(Object.keys(saved.events), ['2026-11-16']);
    await current.locator('[data-soul-settings="太子燕丹"]').click();
    await page.locator('[data-soul-edit-future]').check();
    await page.locator('.soul-editor button[type=submit]').click();
    saved = await page.evaluate(() => JSON.parse(window.QinshiAccounts.getItem('qinshi_soul_shop_needs_v1')));
    assert.equal(Object.keys(saved.events).length, 3);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_forbidden_needs_v2')), oldForbidden);
    await current.locator('[data-soul-settings="太子燕丹"]').click();
    assert.equal(await page.locator('[data-soul-edit-future]').isChecked(), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.soul-editor').evaluate(n => n.open), false);
    await page.locator('[data-soul-query]').fill('太子燕丹');
    await page.locator('[data-forbidden-module="forbidden"]').click();
    await page.locator('[data-forbidden-module="soul-shop"]').click();
    assert.equal(await page.locator('[data-soul-query]').inputValue(), '太子燕丹');
    await current.locator('[data-soul-name="太子燕丹"]').click();
    await page.locator('#partition-atlas').waitFor({ state: 'visible' });
    await page.locator('#partition-atlas [data-item-navigation-back]').click();
    await page.locator('#soul-shop-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-soul-query]').inputValue(), '太子燕丹');
    await page.locator('[data-soul-clear]').click();
    await page.evaluate(() => { window.QinshiAccounts.setItem = () => false; });
    await current.locator('[data-soul-select="丽姬"]').click();
    assert.equal(await current.locator('[data-soul-select="丽姬"]').isChecked(), false);
    assert.equal(await page.locator('[data-soul-error]').isVisible(), true);
  } finally { await context.close(); }
});
test('existing malformed data stays untouched and editing access refreshes soul shop controls', async () => {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const a = await context.newPage(), b = await context.newPage();
  try {
    for (const page of [a, b]) await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
    await openApp(a, url + '/#forbidden');
    await a.locator('[data-forbidden-module="soul-shop"]').click();
    await openApp(b, url + '/#forbidden');
    await b.locator('[data-forbidden-module="soul-shop"]').click();
    await b.evaluate(() => window.QinshiAccounts.takeOverEditing());
    await b.waitForFunction(() => !document.querySelector('[data-soul-period="2026-11-16"] [data-soul-select]').disabled);
    await a.waitForFunction(() => document.querySelector('[data-soul-period="2026-11-16"] [data-soul-select]').disabled);
    await b.locator('[data-soul-period="2026-11-16"] [data-soul-select="丽姬"]').check();
    await a.evaluate(() => window.QinshiAccounts.takeOverEditing());
    await a.waitForFunction(() => !document.querySelector('[data-soul-period="2026-11-16"] [data-soul-select]').disabled);
    assert.equal(await a.locator('[data-soul-period="2026-11-16"] [data-soul-select="丽姬"]').isChecked(), true);
    for (const raw of ['', 'null', '{"version":2,"events":{}}']) {
      await a.evaluate(raw => window.QinshiAccounts.setItem('qinshi_soul_shop_needs_v1', raw), raw);
      await a.locator('[data-forbidden-module="forbidden"]').click();
      await a.locator('[data-forbidden-module="soul-shop"]').click();
      assert.equal(await a.locator('[data-soul-error]').isVisible(), true);
      assert.equal(await a.locator('[data-soul-period="2026-11-16"] [data-soul-select]').first().isDisabled(), true);
      assert.equal(await a.evaluate(() => window.QinshiAccounts.getItem('qinshi_soul_shop_needs_v1')), raw);
    }
  } finally { await context.close(); }
});
