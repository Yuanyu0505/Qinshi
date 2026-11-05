const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountJson } = require('./browser-test-helpers.cjs');
const KEY = 'qinshi_forbidden_needs_v2';
let server, browser, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function scenario(width, run) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });
  try {
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.clock.setFixedTime(new Date('2026-11-05T12:00:00+08:00'));
    await openApp(page, origin);
    await run(page);
  } finally { await page.close(); }
}
test('reference filters stay on one row, including the keyword, at desktop and phone widths', async () => {
  for (const width of [1200, 390]) await scenario(width, async page => {
    await page.evaluate(() => document.querySelector('.tab[data-partition="inscription"]').click());
    await page.locator('[data-mode="reference"]').click();
    const row = page.locator('#inscription-reference .is-single-row');
    const bounds = await row.locator('select, input[type="search"]').evaluateAll(nodes => nodes.map(n => ({ y: n.getBoundingClientRect().top, h: n.getBoundingClientRect().height })));
    assert.ok(bounds.length >= 5);
    assert.ok(bounds.every(b => Math.abs(b.y - bounds[0].y) < 2 && b.h >= 44));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1);
  });
});
test('waking across a period boundary updates the current card even without expired selections', async () => {
  await scenario(1200, async page => {
    await page.evaluate(() => document.querySelector('.tab[data-partition="forbidden"]').click());
    await page.locator('[data-forbidden-card="2026-11-05_shadow_hunt"]').waitFor({ state: 'visible' });
    assert.deepEqual((await getAccountJson(page, KEY)).events, {});
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00+08:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.locator('[data-forbidden-card="2026-11-09_soul_gathering"][data-forbidden-role="current"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-forbidden-card="2026-11-05_shadow_hunt"]').count(), 0);
  });
});
test('equipment, beast fragments and nuclei default to this period, with explicit future-only family sync', async () => {
  await scenario(1200, async page => {
    await page.evaluate(() => document.querySelector('.tab[data-partition="forbidden"]').click());
    const card = page.locator('[data-forbidden-card="2026-11-05_shadow_hunt"]');
    const toggle = card.locator('[data-forbidden-expand]');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    for (const section of ['equipmentFragments', 'machineBeasts', 'nuclei']) {
      await card.locator('[data-forbidden-select][data-forbidden-section="' + section + '"]').first().click();
      assert.deepEqual(Object.keys((await getAccountJson(page, KEY)).events), ['2026-11-05_shadow_hunt']);
      await card.locator('[data-forbidden-purpose-edit][data-forbidden-section="' + section + '"]').first().click();
      assert.equal(await page.locator('input[name="forbidden-purpose-scope"][value="event"]').isChecked(), true);
      await page.locator('[data-forbidden-purpose-close]').last().click();
    }
    await card.locator('[data-forbidden-purpose-edit][data-forbidden-section="machineBeasts"]').first().click();
    await page.locator('input[name="forbidden-purpose-scope"][value="family"]').check();
    await page.locator('[data-forbidden-purpose-save]').click();
    const synced = (await getAccountJson(page, KEY)).events;
    assert.ok(Object.keys(synced).length > 1);
    assert.ok(Object.keys(synced).every(id => id.slice(0, 10) >= '2026-11-05'));
    await page.clock.setFixedTime(new Date('2026-11-09T12:00:00+08:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    const after = (await getAccountJson(page, KEY)).events;
    assert.equal(Object.hasOwn(after, '2026-11-05_shadow_hunt'), false);
    assert.ok(Object.keys(after).every(id => id.slice(0, 10) >= '2026-11-09'));
  });
});
