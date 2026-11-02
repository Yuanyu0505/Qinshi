const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
for (const width of [375, 768, 1280]) {
  test('breakthrough material reference is complete and contained at ' + width + 'px', async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await openApp(page, origin);
      if (await page.locator('#mobile-more-toggle').isVisible()) {
        await page.locator('#mobile-more-toggle').click();
        await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
      } else await page.locator('.tab[data-partition="machine-beasts"]').click();
      await page.locator('[data-machine-beast-mode="reference"]').click();
      const panel = page.locator('[data-machine-breakthrough-guide]');
      assert.equal(await panel.count(), 1);
      assert.equal(await panel.locator('[data-breakthrough-stage]').count(), 10);
      assert.equal(await panel.locator('[data-breakthrough-resource]').count(), 10);
      assert.match(await panel.textContent(), /不参与计算/);
      assert.match(await panel.textContent(), /玄铁工具箱/);
      assert.deepEqual(await panel.locator('[data-breakthrough-resource]').first().locator('td').allTextContents(), ['22','44','88','176']);
      assert.deepEqual(await panel.locator('[data-breakthrough-resource]').last().locator('td').allTextContents(), ['94','188','376','752']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });
}
