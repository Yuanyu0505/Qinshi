// User-run isolated browser regression. No production APIs or user browser data.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
const KEY = 'qinshi_secret_realms_v1';
let server, browser, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function scenario(width, separate, run) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });
  try {
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.clock.setFixedTime(new Date('2026-11-06T12:00:00+08:00'));
    await openApp(page, origin + '/#secret-realm');
    await page.locator('#secret-realm-content').waitFor();
    await page.evaluate(({ key, separate }) => {
      const state = window.SECRET_REALM_CORE.createDefault(window.SECRET_REALM_DATA);
      state.settings.platformId = 'gamefan'; state.settings.vouchers = 0;
      state.realms.gaoyue.target = separate ? 10 : 1992;
      for (let n = 2; n <= 6; n++) for (const [id, record] of Object.entries(state.realms.gaoyue.periods[n].sources)) {
        record.enabled = separate ? (n === 2 && id === 'pack6') || (n === 3 && id === 'daily-free') : n <= 4 && id !== 'pack648';
      }
      window.QinshiAccounts.setItem(key, JSON.stringify(state));
    }, { key: KEY, separate });
    await page.locator('[data-realm-action="reload"]').click();
    await page.locator('[data-realm-id="gaoyue"]').click();
    await page.locator('[data-realm-mode="planner"]').click();
    const before = await page.evaluate(key => window.QinshiAccounts.getItem(key), KEY);
    await page.locator('[data-realm-calculate]').click();
    await page.waitForFunction(() => document.querySelector('.realm-plan') && document.querySelector('#secret-realm-content').getAttribute('aria-busy') === 'false');
    await run(page);
    assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), KEY), before, 'calculation and detail toggles must not change actual account records');
  } finally { await page.close(); }
}

for (const width of [320, 390, 820, 1280]) test(width + ': period cash is identical and details default closed with local expand/collapse', async () => {
  await scenario(width, false, async page => {
    const plan = page.locator('.realm-plan');
    assert.equal(await plan.count(), 1);
    assert.equal(await plan.locator('.realm-period-result').count(), 3);
    assert.equal(await plan.locator('.realm-period-result[open]').count(), 0);
    assert.deepEqual(await plan.locator('summary [data-realm-metric="period-draws"]').allTextContents(), ['664', '664', '664']);
    assert.deepEqual(await plan.locator('summary [data-realm-metric="cash"]').allTextContents(), ['¥776.58', '¥776.58', '¥776.58']);
    assert.doesNotMatch(await plan.innerText(), /折后金额合计|预算取整差额/);
    const budget = plan.locator('.realm-budget');
    assert.doesNotMatch(await budget.innerText(), /向上取整/);
    assert.match(await budget.innerText(), /^总计折后预算\s*¥2,330$/);
    assert.equal(await budget.evaluate(node => getComputedStyle(node).whiteSpace), 'nowrap');
    assert.equal(await budget.evaluate(node => {
      const label = document.createRange(); label.selectNode(node.firstChild);
      const amount = node.querySelector('[data-realm-metric="cash"]').getBoundingClientRect(), text = label.getBoundingClientRect();
      return text.top < amount.bottom && amount.top < text.bottom;
    }), true, 'budget label and amount occupy the same line');
    // Inspect the accepted calculation result, not removed UI labels. Exact
    // per-period cash is 1806 * 4.3 / 10 = 776.58; 3 periods total 2329.74,
    // while the budget remains ceil(2329.74) = 2330.
    const computed = await page.evaluate(() => {
      const result = window.SECRET_REALM_UI.init(window).result;
      return { valid: result.valid, plans: [result.fastest, result.cheapest].map(value => ({
        cash: value.discountedCash, adjustment: value.roundingAdjustment, budget: value.totalAfter,
        periods: value.periods.map(period => [period.number, period.plannedDraws, period.before, period.discountedCash])
      })) };
    });
    assert.equal(computed.valid, true);
    for (const value of computed.plans) assert.deepEqual(value, {
      cash: 2329.74, adjustment: 0.26, budget: 2330,
      periods: [[2, 664, 1806, 776.58], [3, 664, 1806, 776.58], [4, 664, 1806, 776.58]]
    });
    const raw = await page.evaluate(key => window.QinshiAccounts.getItem(key), KEY);
    const toggle = plan.locator('[data-realm-toggle-periods]');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    const controlled = await toggle.getAttribute('aria-controls');
    assert.equal(await plan.locator('#' + controlled).count(), 1);
    await toggle.click();
    assert.equal(await plan.locator('.realm-period-result[open]').count(), 3);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await plan.locator('.realm-period-result summary').first().click();
    await page.waitForFunction(() => document.querySelector('[data-realm-toggle-periods]').getAttribute('aria-expanded') === 'false');
    await toggle.click();
    assert.equal(await plan.locator('.realm-period-result[open]').count(), 3);
    await toggle.click();
    assert.equal(await plan.locator('.realm-period-result[open]').count(), 0);
    assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), KEY), raw);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });
});

test('fastest and cheapest scheme detail toggles do not change each other', async () => {
  await scenario(390, true, async page => {
    const plans = page.locator('.realm-plan');
    assert.equal(await plans.count(), 2);
    assert.equal(await plans.locator('.realm-period-result[open]').count(), 0);
    await plans.nth(0).locator('[data-realm-toggle-periods]').click();
    assert.equal(await plans.nth(0).locator('.realm-period-result[open]').count(), 1);
    assert.equal(await plans.nth(1).locator('.realm-period-result[open]').count(), 0);
    await plans.nth(1).locator('[data-realm-toggle-periods]').click();
    assert.equal(await plans.nth(1).locator('.realm-period-result[open]').count(), 2);
    await plans.nth(0).locator('[data-realm-toggle-periods]').click();
    assert.equal(await plans.nth(0).locator('.realm-period-result[open]').count(), 0);
    assert.equal(await plans.nth(1).locator('.realm-period-result[open]').count(), 2);
  });
});
