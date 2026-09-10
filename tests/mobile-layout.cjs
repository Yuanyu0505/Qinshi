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

async function mobilePage(partition, width = 390, height = 844) {
  const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
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

for (const width of [390, 768, 1024]) {
  test(width + ' 宽度近期改动分区均不产生整页横向溢出', async () => {
    const page = await mobilePage('atlas', width, width === 390 ? 844 : 1024);
    try {
      for (const partition of ['atlas', 'forging', 'equipment', 'drops', 'forbidden', 'machine-beasts', 'zhulu']) {
        await page.evaluate(name => document.querySelector('.tab[data-partition="' + name + '"]').click(), partition);
        await assertNoPageOverflow(page, partition + ' / ' + width);
      }
    } finally { await page.close(); }
  });

  test(width + ' 宽度禁地控件可触达且完整预测保持在页面内', async () => {
    const page = await mobilePage('forbidden', width, width === 390 ? 844 : 1024);
    try {
      const control = page.locator('#partition-forbidden .forbidden-control-row');
      const purposeFilter = page.locator('#forbidden-purpose-filter');
      const columns = await purposeFilter.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
      assert.equal(await control.evaluate(node => getComputedStyle(node).display), 'grid');
      assert.equal(columns, width === 390 ? 2 : 3);
      assert.ok((await page.locator('#forbidden-schedule-toggle').boundingBox()).height >= 44);
      assert.ok((await page.locator('#forbidden-expand-all').boundingBox()).height >= 44);

      const currentReward = page.locator('[data-forbidden-role="current"] .forbidden-reward-section .forbidden-token:not(.is-history-disabled)').first();
      assert.ok(await currentReward.count());
      for (const selector of ['.forbidden-token-check', '.forbidden-token-name']) {
        assert.ok((await currentReward.locator(selector).boundingBox()).height >= 44, selector + ' 触控高度不足');
      }
      await currentReward.locator('.forbidden-token-check').click();
      const selectedReward = page.locator('[data-forbidden-role="current"] .forbidden-token.is-selected').first();
      assert.ok((await selectedReward.locator('.forbidden-purpose-edit').boundingBox()).height >= 44);
      await selectedReward.locator('.forbidden-purpose-edit').click();
      const dialogBox = await page.locator('.forbidden-purpose-dialog').boundingBox();
      assert.ok(dialogBox.x >= 0 && dialogBox.y >= 0);
      assert.ok(dialogBox.x + dialogBox.width <= width + 1);
      assert.ok(dialogBox.y + dialogBox.height <= (width === 390 ? 844 : 1024) + 1);
      await page.screenshot({ path: path.join(os.tmpdir(), 'qinshi-forbidden-purpose-' + width + '.png') });
      await page.locator('[data-forbidden-purpose-close]').last().click();

      await page.locator('#forbidden-schedule-toggle').click();
      await page.locator('#forbidden-expand-all').click();
      await page.waitForTimeout(350);
      assert.equal(await page.locator('#forbidden-expand-all').getAttribute('aria-pressed'), 'true');
      assert.ok(await page.locator('[data-forbidden-card]').count() > 2);
      await assertNoPageOverflow(page, '禁地完整预测 / ' + width);
      await page.screenshot({ path: path.join(os.tmpdir(), 'qinshi-forbidden-' + width + '-viewport.png') });
      await page.screenshot({ path: path.join(os.tmpdir(), 'qinshi-forbidden-' + width + '.png'), fullPage: true });
    } finally { await page.close(); }
  });
}
