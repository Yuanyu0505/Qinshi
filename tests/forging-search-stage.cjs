// 设置 PLAYWRIGHT_MODULE 后运行：node --test tests/forging-search-stage.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const STORE_KEY = 'qinshi_forging_progress_v1';
let browser, server, url;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openSearch(page) {
  await page.evaluate(() => document.querySelector('.tab[data-partition="forging"]').click());
  await page.locator('#forge-view [data-view="progress"]').click();
  await page.locator('#prog-search').fill('墨眉');
  await page.waitForTimeout(180);
}

for (const [quality, maximum] of [['red', 11], ['orange', 6]]) {
  for (const width of [390, 900, 1440]) test(quality + ' / ' + width + '：搜索结果修改持有阶段并保存，不改变其他弟子', async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    try {
      await page.goto(url);
      await page.evaluate(({ storeKey, quality }) => {
        localStorage.setItem(storeKey, JSON.stringify({ version: 2, disciples: [
          { id: 'd1', name: '弟子甲', items: [{ id: 'i1', forgeName: '墨眉', equipmentName: '神兵墨眉', quality, progress: 5 }] },
          { id: 'd2', name: '弟子乙', items: [{ id: 'i2', forgeName: '墨眉', equipmentName: '神兵墨眉', quality, progress: 2 }] }
        ] }));
      }, { storeKey: STORE_KEY, quality });
      await page.reload();
      await openSearch(page);
      const ownedSection = page.locator('#prog-search-results .prog-search-section').filter({ hasText: '弟子直接持有' });
      const card = ownedSection.locator('.prog-equip').filter({
        has: page.locator('[data-act="set-stage"][data-disciple="d1"][data-item="i1"]:not([disabled])')
      });
      const stages = card.locator('[data-act="set-stage"][data-disciple="d1"][data-item="i1"]:not([disabled])');
      assert.equal(await stages.count(), maximum + 1);
      assert.equal(await page.locator('#prog-search-results [data-act="switch-quality"], #prog-search-results [data-act="remove-item"]').count(), 0);
      await card.locator('[data-act="set-stage"][data-item="i1"][data-idx="3"]:not([disabled])').click();
      assert.equal(await page.locator('#prog-search').inputValue(), '墨眉');
      let stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), STORE_KEY);
      assert.equal(stored.disciples[0].items[0].progress, 3);
      assert.equal(stored.disciples[1].items[0].progress, 2);
      assert.equal(await card.locator('.progress-forge-status').innerText(), '3锻');
      assert.match(await card.locator('.prog-next').innerText(), /3→4锻/);
      assert.equal(await card.locator('.prog-material-table tbody tr').count(), maximum - 3);
      await card.locator('[data-act="set-stage"][data-idx="' + maximum + '"]').click();
      assert.equal(await card.locator('.progress-forge-status').innerText(), '满锻');
      assert.match(await card.locator('.prog-next').innerText(), /全部锻造完成/);
      await page.reload();
      await openSearch(page);
      assert.equal(await card.locator('.progress-forge-status').innerText(), '满锻');
      stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), STORE_KEY);
      assert.equal(stored.disciples[0].items[0].progress, maximum);
      assert.equal(stored.disciples[1].items[0].progress, 2);
    } finally { await page.close(); }
  });
}
