'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let server, browser, url;
const key = 'qinshi_forbidden_needs_v2';
const out = 'outputs/forbidden-soul-ui-1.1.13';
before(async () => {
  fs.mkdirSync(out, { recursive: true });
  server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { await browser?.close(); await new Promise(r => server.close(r)); });
async function setup(width = 1366, height = 768) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', error => { throw error; });
  await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
  await openApp(page, url + '/#forbidden');
  return { context, page };
}
const current = '[data-forbidden-card="2026-11-16_yin_yang"]';
for (const [width, height] of [[320,568],[390,844],[820,1180],[1366,768],[1920,1080]]) {
  test(`${width}: real layout and reward identities`, async () => {
    const { context, page } = await setup(width, height);
    try {
      const phase = process.env.UI_BASELINE ? 'before' : 'after';
      const identities = await page.locator(current + ' [data-forbidden-select]').evaluateAll(nodes => nodes.map(n => ({ ...n.dataset, pressed: n.getAttribute('aria-pressed') })));
      const toolbarHeight = await page.locator('.forbidden-toolbar').evaluate(n => n.getBoundingClientRect().height);
      await page.screenshot({ path: `${out}/${phase}-${width}-forbidden.png`, fullPage: true });
      if (!process.env.UI_BASELINE) {
        await page.locator(current + ' .forbidden-reward-section [data-forbidden-select]').first().click();
        await page.locator(current + ' .forbidden-reward-section [data-forbidden-purpose-edit]').first().click();
        await page.screenshot({ path: `${out}/${phase}-${width}-purpose.png` });
        await page.keyboard.press('Escape');
      }
      if (!process.env.UI_BASELINE) {
        if (fs.existsSync(`${out}/before-${width}.json`)) {
          const baseline = JSON.parse(fs.readFileSync(`${out}/before-${width}.json`));
          assert.deepEqual(identities, baseline.identities);
        }
        assert.ok(await page.locator(current + ' .forbidden-choice-label').count() >= 5);
      }
      await page.locator('[data-forbidden-module="soul-shop"]').click();
      await page.screenshot({ path: `${out}/${phase}-${width}-soul.png`, fullPage: true });
      if (!process.env.UI_BASELINE) {
        await page.locator('[data-soul-settings]').first().click();
        await page.screenshot({ path: `${out}/${phase}-${width}-soul-editor.png` });
        await page.keyboard.press('Escape');
      }
      const soulRows = await page.locator('[data-soul-results] tbody tr').allTextContents();
      assert.equal(soulRows.length, 8);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      fs.writeFileSync(`${out}/${phase}-${width}.json`, JSON.stringify({ identities, toolbarHeight, soulRows }, null, 2));
      if (!process.env.UI_BASELINE && fs.existsSync(`${out}/before-${width}.json`)) assert.deepEqual(soulRows, JSON.parse(fs.readFileSync(`${out}/before-${width}.json`)).soulRows);
      if (!process.env.UI_BASELINE) {
        const wrapped = await page.locator('[data-soul-settings]').evaluateAll(nodes => nodes.some(n => { const r = document.createRange(); r.selectNodeContents(n); return r.getClientRects().length > 1; }));
        assert.equal(wrapped, false, 'settings button text must stay on one line');
      }
    } finally { await context.close(); }
  });
}
if (!process.env.UI_BASELINE) {
  test('purpose save waits for a later incremental card before restoring focus', async () => {
    const { context, page } = await setup();
    try {
      await page.locator('#forbidden-schedule-toggle').click(); await page.clock.runFor(200);
      await page.locator('#forbidden-expand-all').click(); await page.clock.runFor(200);
      for (let i=0;i<3;i++) await page.locator('[data-forbidden-card]').nth(i).locator('.forbidden-rewards [data-forbidden-select]').first().click();
      const id = await page.locator('[data-forbidden-card]').nth(2).getAttribute('data-forbidden-card');
      await page.locator('#forbidden-selected-only').check(); await page.clock.runFor(200);
      await page.locator('[data-forbidden-card]').nth(2).locator('.forbidden-needs [data-forbidden-purpose-edit]').first().click();
      await page.locator('[data-forbidden-purpose-save]').click(); await page.clock.runFor(200);
      assert.equal(await page.evaluate(() => document.activeElement.closest('[data-forbidden-card]')?.dataset.forbiddenCard), id);
    } finally { await context.close(); }
  });
  test('mobile purpose dialog is not obstructed by the page back-to-top control', async () => {
    const { context, page } = await setup(320,568);
    try {
      await page.locator(current + ' .forbidden-rewards [data-forbidden-select]').first().click();
      await page.locator(current + ' .forbidden-rewards [data-forbidden-purpose-edit]').first().click();
      assert.equal(await page.locator('.responsive-back-top').isVisible(), false);
      const button=page.locator('[data-forbidden-purpose-save]');
      assert.equal(await button.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
    } finally { await context.close(); }
  });
  test('unchanged editing lease renewal must not discard an open purpose draft', async () => {
    const { context, page } = await setup();
    try {
      await page.locator(current + ' .forbidden-reward-section [data-forbidden-select]').first().click();
      await page.locator(current + ' .forbidden-reward-section [data-forbidden-purpose-edit]').first().click();
      await page.clock.runFor(101000);
      assert.equal(await page.locator('#forbidden-purpose-editor').isVisible(), true);
    } finally { await context.close(); }
  });
  test('transition widths and low-height dialogs remain inside their actual content container', async () => {
    const { context, page } = await setup();
    try {
      for (const width of [360, 520, 599, 600, 640, 767, 900, 1024, 1199, 1200, 1280, 1536]) {
        await page.setViewportSize({ width, height: 568 });
        await page.locator('[data-forbidden-module="soul-shop"]').click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: soul page overflow`);
        await page.locator('[data-soul-settings]').first().click();
        const bounds = await page.locator('.soul-editor').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 569);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-soul-settings')), true);
        await page.locator('[data-forbidden-module="forbidden"]').click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: forbidden page overflow`);
      }
    } finally { await context.close(); }
  });
  test('forbidden local selection, future family sync, cancellation and cross-year boundary preserve contracts', async () => {
    const { context, page } = await setup(820, 1180);
    try {
      const reward = page.locator(current + ' .forbidden-reward-section [data-forbidden-select]').first();
      await reward.click();
      let stored = await page.evaluate(k => JSON.parse(window.QinshiAccounts.getItem(k)), key);
      assert.deepEqual(Object.keys(stored.events), ['2026-11-16_yin_yang']);
      await page.locator(current + ' .forbidden-reward-section [data-forbidden-purpose-edit]').first().click();
      assert.equal(await page.locator('input[name="forbidden-purpose-scope"][value="event"]').isChecked(), true);
      await page.locator('input[name="forbidden-purpose-scope"][value="family"]').check();
      await page.locator('[data-forbidden-purpose-save]').click();
      stored = await page.evaluate(k => JSON.parse(window.QinshiAccounts.getItem(k)), key);
      assert.ok(Object.keys(stored.events).length > 1);
      assert.ok(Object.keys(stored.events).every(id => id >= '2026-11-16'));
      assert.equal(await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_soul_shop_needs_v1')), null);
      await page.locator(current + ' .forbidden-reward-section [data-forbidden-purpose-edit]').first().click();
      assert.equal(await page.locator('input[name="forbidden-purpose-scope"][value="event"]').isChecked(), true);
      await page.keyboard.press('Escape');
      assert.deepEqual(await page.evaluate(k => JSON.parse(window.QinshiAccounts.getItem(k)), key), stored);
      for (let i=0;i<2;i++) await page.clock.fastForward(20*86400000);
      await page.clock.fastForward(4*86400000);
      await page.locator('[data-forbidden-module="soul-shop"]').click();
      assert.equal(await page.locator('[data-soul-period="2026-12-31"]').count(), 1);
      await page.clock.fastForward(4*86400000);
      assert.equal(await page.locator('[data-soul-period="2026-12-31"]').count(), 0);
      assert.equal(await page.locator('[data-soul-period="2027-01-04"]').count(), 1);
    } finally { await context.close(); }
  });
  for (const mode of ['false', 'throw', 'readonly']) test(`forbidden ${mode}: failed writes restore selection and preserve other needs`, async () => {
    const { context, page } = await setup();
    try {
      const buttons = page.locator(current + ' .forbidden-disciples [data-forbidden-select]');
      await buttons.nth(0).click();
      const saved = await page.evaluate(k => window.QinshiAccounts.getItem(k), key);
      await page.evaluate(mode => {
        const accounts = window.QinshiAccounts, original = accounts.setItem;
        accounts.setItem = function (k, v) { if (k === 'qinshi_forbidden_needs_v2') { if (mode === 'throw') throw new Error('isolated write failure'); return false; } return original.call(this, k, v); };
        if (mode === 'readonly') accounts.isReadOnly = () => true;
      }, mode);
      await buttons.nth(1).click();
      assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'false');
      assert.equal(await buttons.nth(0).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(k => window.QinshiAccounts.getItem(k), key), saved);
      assert.equal(await page.locator('#forbidden-error').isVisible(), true);
    } finally { await context.close(); }
  });
  test('forbidden purpose failure keeps draft, success restores focus; keyboard stays inside dialog', async () => {
    const { context, page } = await setup(390, 844);
    try {
      const reward = page.locator(current + ' .forbidden-reward-section [data-forbidden-select]').first();
      await reward.click();
      const edit = page.locator(current + ' .forbidden-reward-section [data-forbidden-purpose-edit]').first();
      await edit.click();
      const saved = await page.evaluate(k => window.QinshiAccounts.getItem(k), key);
      await page.evaluate(() => { const a = window.QinshiAccounts; window.testOriginalSet = a.setItem; a.setItem = () => false; });
      await page.locator('[data-forbidden-purpose-save]').click();
      assert.equal(await page.locator('#forbidden-purpose-editor').isVisible(), true);
      assert.equal(await page.evaluate(k => window.QinshiAccounts.getItem(k), key), saved);
      await page.locator('[data-forbidden-purpose-save]').focus(); await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.forbidden-purpose-dialog')), true);
      await page.evaluate(() => { window.QinshiAccounts.setItem = window.testOriginalSet; });
      await page.locator('[data-forbidden-purpose-save]').click();
      assert.equal(await page.locator('#forbidden-purpose-editor').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-forbidden-purpose-edit')), true);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.forbidden-rewards')), true, 'restore the original reward location, not its duplicate in the needs summary');
    } finally { await context.close(); }
  });
  test('selected-only failed deselection preserves original button focus', async () => {
    const { context, page } = await setup();
    try {
      await page.locator(current + ' .forbidden-disciples [data-forbidden-select]').first().click();
      await page.locator('#forbidden-selected-only').check();
      await page.evaluate(() => { window.QinshiAccounts.setItem = () => false; });
      await page.locator(current + ' .forbidden-disciples [data-forbidden-select]').first().click();
      await page.clock.runFor(200);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.forbidden-disciples') && document.activeElement.getAttribute('aria-pressed') === 'true'), true);
    } finally { await context.close(); }
  });
  test('soul search composition defers redraw and module switching cancels pending render', async () => {
    const { context, page } = await setup();
    try {
      await page.locator('[data-forbidden-module="soul-shop"]').click();
      await page.evaluate(() => {
        window.testRow = document.querySelector('[data-soul-results] tr');
        const input = document.querySelector('[data-soul-query]');
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        input.value = '徐'; input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
        input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      });
      assert.equal(await page.evaluate(() => window.testRow.isConnected), true);
      await page.clock.runFor(200);
      assert.equal(await page.locator('[data-soul-name="徐福"]').count(), 3);
      await page.locator('[data-soul-query]').fill('太子');
      await page.locator('[data-forbidden-module="forbidden"]').click();
      await page.clock.runFor(200);
      assert.equal(await page.locator('#soul-shop-panel').isVisible(), false);
      await page.locator('[data-forbidden-module="soul-shop"]').click();
      assert.equal(await page.locator('[data-soul-name="徐福"]').count(), 0);
    } finally { await context.close(); }
  });
}
