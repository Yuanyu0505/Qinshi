// 设置 PLAYWRIGHT_MODULE 后运行：node --test tests/ui-result-layout.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

async function openPage(partition, width = 1440, progress) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  if (progress) await page.addInitScript(value => {
    localStorage.setItem('qinshi_tactics_progress_v1', JSON.stringify({ wind: value }));
  }, progress);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(name => document.querySelector('.tab[data-partition="' + name + '"]').click(), partition);
  return page;
}

// 防止默认终点继续复制落后的个人真言阶数，或越过兵法/极真言上限。
for (const [rank, tong, target, mantraTarget, extreme] of [[8, 7, 9, 9, -1], [9, 7, 10, 9, 0], [15, 7, 15, 9, 5]]) {
  test('兵法 ' + rank + ' 阶默认下一阶与对应真言上限', async () => {
    const page = await openPage('tactics', 1440, {
      rank, rehearsalSpent: 0, mantras: { qi: 8, biao: 8, tong, extreme: -1 }
    });
    try {
      await page.locator('#tactics-selector [data-tactic-id="wind"]').click();
      assert.equal(await page.locator('[data-calc-field="start-rank"]').inputValue(), String(rank));
      assert.equal(await page.locator('[data-calc-field="start-mantra"][data-mantra-id="tong"]').inputValue(), String(tong));
      assert.equal(await page.locator('[data-calc-field="target-rank"]').inputValue(), String(target));
      for (const id of ['qi', 'biao', 'tong']) {
        assert.equal(await page.locator('[data-calc-field="target-mantra"][data-mantra-id="' + id + '"]').inputValue(), String(mantraTarget));
      }
      assert.equal(await page.locator('[data-calc-field="target-mantra"][data-mantra-id="extreme"]').inputValue(), String(extreme));
      assert.equal(await page.locator('#tactics-result .error').count(), 0);
      assert.ok(await page.locator('#tactics-result .tactics-result-grid').isVisible());
      await page.locator('[data-calc-field="target-mantra"][data-mantra-id="tong"]').selectOption(String(tong));
      await page.locator('[data-reference-mode="all"]').click();
      assert.equal(await page.locator('[data-calc-field="target-mantra"][data-mantra-id="tong"]').inputValue(), String(tong));
      await page.locator('[data-action="restore-progress"]').click();
      assert.equal(await page.locator('[data-calc-field="target-mantra"][data-mantra-id="tong"]').inputValue(), String(mantraTarget));
    } finally { await page.close(); }
  });
}

for (const width of [390, 900, 1440]) {
  test(width + ' 宽度兵法结果前移且每项真言碎片单行', async () => {
    const page = await openPage('tactics', width);
    try {
      await page.locator('#tactics-selector [data-tactic-id="wind"]').click();
      assert.ok(await page.evaluate(() => {
        const progress = document.querySelector('#tactics-progress').getBoundingClientRect();
        const result = document.querySelector('#tactics-result').getBoundingClientRect();
        const calculator = document.querySelector('#tactics-calculator').getBoundingClientRect();
        return progress.bottom <= result.top && result.bottom <= calculator.top;
      }));
      await page.locator('[data-reference-mode="all"]').click();
      const lines = await page.locator('.tactics-mantra-fragment').evaluateAll(nodes => nodes.map(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return { text: node.textContent, lines: new Set(Array.from(range.getClientRects(), r => r.top)).size };
      }));
      assert.ok(lines.length > 0);
      for (const line of lines) {
        assert.equal(line.lines, 1, line.text);
        assert.match(line.text, /^[^：]+：(未激活|\d+阶)→\d+阶（[\d,]+片）$/);
        assert.ok(!line.text.includes('真言碎片'));
      }
    } finally { await page.close(); }
  });

  test(width + ' 宽度合阵结果保持原位置且排序仍可操作', async () => {
    const page = await openPage('formations', width);
    try {
      await page.locator('#formation-selector [data-formation-id]').first().click();
      await page.locator('[data-scope="calculator"][data-role="owned"]').first().check();
      const results = page.locator('.formation-calculator');
      assert.ok(await results.isVisible());
      assert.ok(await page.evaluate(() => {
        const personal = document.querySelector('.formation-personal').getBoundingClientRect();
        const result = document.querySelector('.formation-calculator').getBoundingClientRect();
        const official = document.querySelector('.formation-official').getBoundingClientRect();
        return official.bottom <= personal.top && personal.bottom <= result.top;
      }));
      if (width > 1024) {
        await results.locator('[data-action="sort-position"]').first().click();
        assert.equal(await results.locator('[data-action="sort-position"]').first().getAttribute('aria-pressed'), 'true');
        assert.ok(await results.locator('tbody tr').count() > 0);
      } else {
        await results.locator('[data-action="mobile-position"]').nth(1).click();
        assert.ok((await results.locator('[data-action="mobile-position"]').nth(1).getAttribute('class')).includes('active'));
        assert.ok(await results.locator('.formation-ranking-list article').count() > 0);
      }
      await page.locator('[data-action="generate-recommendation"]').click();
      assert.ok(await page.evaluate(() => document.querySelector('.formation-calculator').getBoundingClientRect().bottom <=
        document.querySelector('.formation-recommendation').getBoundingClientRect().top));
    } finally { await page.close(); }
  });
}

// 空余空间应扩展按钮，不再变成按钮之间的大段留白；窄屏不换行、不溢出。
for (const width of [320, 390, 768, 900, 1100, 1440]) {
  test(width + ' 宽度副属性按钮铺满一行并维持小间距', async () => {
    const page = await openPage('equipment', width);
    try {
      const layout = await page.locator('#chips').evaluate(container => ({
        rect: container.getBoundingClientRect().toJSON(),
        items: Array.from(container.children, node => ({
          rect: node.getBoundingClientRect().toJSON(), fits: node.scrollWidth <= node.clientWidth + 1
        }))
      }));
      assert.equal(layout.items.length, 15);
      for (const [index, item] of layout.items.entries()) {
        assert.ok(Math.abs(item.rect.top - layout.items[0].rect.top) < 1);
        assert.ok(item.fits);
        assert.ok(item.rect.right <= layout.rect.right + 1);
        if (index) assert.ok(item.rect.left - layout.items[index - 1].rect.right <= 7);
      }
      assert.ok(Math.abs(layout.items.at(-1).rect.right - layout.rect.right) < 1);
    } finally { await page.close(); }
  });
}
