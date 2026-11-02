const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
before(async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); });
after(async () => { if (browser) await browser.close(); });

for (const width of [375, 768, 1280]) {
  test('pilot standalone controls, escaping and responsive layout at ' + width + 'px', async () => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.setContent('<style>body{margin:0;background:#171a1d;font-family:sans-serif}</style><section id="partition-pilots"></section>');
      await page.addStyleTag({ path: path.join(__dirname, '../css/pilots.css') });
      for (const file of ['data/pilots.js', 'js/pilots.js', 'js/pilots-ui.js']) {
        await page.addScriptTag({ path: path.join(__dirname, '..', file) });
      }
      await page.evaluate(() => { window.PILOTS_UI.init(); window.PILOTS_UI.init(); });
      assert.equal(await page.locator('.pilots-workbench').count(), 1);
      assert.equal(await page.locator('.pilots-card').count(), 60);
      await page.locator('[data-pilots-type="nonPilot"]').click();
      await page.locator('[data-pilots-rank="20"]').click();
      await page.locator('#pilots-search').fill('神朱家 暴击率');
      assert.equal(await page.locator('.pilots-card').count(), 1);
      assert.equal(await page.locator('.pilots-effect-title').textContent(), '20阶突破');
      assert.equal(await page.locator('[data-pilots-categories]').isVisible(), false);
      await page.locator('[data-pilots-type="pilot"]').click();
      await page.locator('#pilots-search').fill('神典庆 80%');
      await page.locator('[data-pilots-category="traditional"]').click();
      assert.equal(await page.locator('.pilots-card').count(), 1);
      assert.match(await page.locator('.pilots-card').textContent(), /15阶突破/);
      assert.match(await page.locator('.pilots-card').textContent(), /80%/);
      assert.equal(await page.locator('[data-pilots-ranks]').isVisible(), false);
      await page.locator('#pilots-search').fill('不应存在的关键词');
      assert.equal(await page.locator('.pilots-card').count(), 0);
      assert.match(await page.locator('.pilots-empty').textContent(), /没有符合条件/);
      await page.locator('[data-pilots-type="all"]').click();
      await page.locator('#pilots-search').fill('');
      assert.equal(await page.locator('.pilots-card').count(), 60);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
