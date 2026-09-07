const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');

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

async function mobilePage(partition) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(name => document.querySelector('.tab[data-partition="' + name + '"]').click(), partition);
  return page;
}

async function assertNoPageOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(sizes.page <= sizes.viewport, label + ' 出现横向页面溢出：' + JSON.stringify(sizes));
}

test('390 宽度装备筛选完整显示副属性，页面无横向溢出', async () => {
  const page = await mobilePage('equipment');
  try {
    assert.equal(await page.locator('#partition-equipment').isVisible(), true);
    await page.locator('#equipment-advanced-toggle').click();
    const chips = page.locator('#partition-equipment #chips .chip');
    assert.ok(await chips.count() >= 14);
    assert.equal(await page.locator('#partition-equipment #chips').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3);
    assert.ok(parseFloat(await chips.first().evaluate(node => getComputedStyle(node).fontSize)) >= 14);
    assert.equal(await chips.first().locator('.equipment-chip-full').isVisible(), true);
    assert.equal(await chips.first().locator('.equipment-chip-short').isVisible(), false);
    await assertNoPageOverflow(page, '装备属性');
    await page.screenshot({ path: path.join(os.tmpdir(), 'qinshi-mobile-equipment.png'), fullPage: true });
  } finally { await page.close(); }
});

test('390 宽度锻造查询和材料总览使用纵向布局', async () => {
  const page = await mobilePage('forging');
  try {
    await page.locator('#forge-search').fill('墨眉');
    await page.waitForTimeout(250);
    assert.ok(await page.locator('#forge-results .forge-h-table tr').count());
    assert.equal(await page.locator('#forge-results .forge-h-table').evaluate(node => getComputedStyle(node).display), 'block');
    assert.equal(await page.locator('#forge-results .mobile-scroll-hint').isVisible(), false);
    assert.ok(await page.locator('#forge-results .forge-scroll').evaluate(node => node.scrollWidth <= node.clientWidth));
    const summaryRow = page.locator('.forging-summary-table-wrap tbody tr').first();
    assert.equal(await summaryRow.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 1);
    assert.ok(parseFloat(await summaryRow.locator('td').nth(1).evaluate(node => getComputedStyle(node).fontSize)) >= 15);
    await assertNoPageOverflow(page, '橙装锻造');
    await page.screenshot({ path: path.join(os.tmpdir(), 'qinshi-mobile-forging.png'), fullPage: true });
  } finally { await page.close(); }
});

test('390 宽度主要分区均不产生整页横向溢出', async () => {
  const page = await mobilePage('atlas');
  try {
    for (const partition of ['atlas', 'forging', 'equipment', 'inscription', 'tactics', 'formations', 'machine-beasts', 'battle-box-pill-pouch']) {
      await page.evaluate(name => document.querySelector('.tab[data-partition="' + name + '"]').click(), partition);
      await assertNoPageOverflow(page, partition);
    }
  } finally { await page.close(); }
});
