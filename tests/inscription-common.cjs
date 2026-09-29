// 设置 PLAYWRIGHT_MODULE 后运行：node --test tests/inscription-common.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountJson, setAccountJson } = require('./browser-test-helpers.cjs');
let browser, server, url;
const COMMON_KEY = 'qinshi_inscription_common_v1';
const PROGRESS_KEY = 'qinshi_inscription_progress_v2';
const key = name => '红色神将\u0000' + name;
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
async function queryPage(width = 900) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await openApp(page, url, { waitUntil: 'load' });
  await openQuery(page);
  return page;
}
async function openQuery(page) {
  await page.evaluate(() => document.querySelector('.tab[data-partition="inscription"]').click());
  await page.locator('#inscription-modes [data-mode="query"]').click();
}
function commonButton(page, name) {
  return page.locator('#ins-results [data-ins-common-key="' + encodeURIComponent(key(name)) + '"]');
}

test('首次不自动加入常用弟子且默认红色品质，切换页签不覆盖品质筛选', async () => {
  const page = await queryPage();
  try {
    assert.equal(await page.locator('#ins-quality').inputValue(), '红色神将');
    const stored = await getAccountJson(page, COMMON_KEY);
    assert.deepEqual(stored.keys, []);
    assert.equal(await page.locator('#ins-results .ins-quality.orange').count(), 0);
    await page.locator('#ins-quality').selectOption('普通橙色');
    await page.locator('#inscription-modes [data-mode="reference"]').click();
    await page.locator('#inscription-modes [data-mode="query"]').click();
    assert.equal(await page.locator('#ins-quality').inputValue(), '普通橙色');
  } finally { await page.close(); }
});

test('个人进度优先于常用，重叠不重复，搜索及天位遁位仍限制结果', async () => {
  const page = await queryPage();
  try {
    const progress = Object.fromEntries(['神东皇太一', '神霸道田虎'].map(name => [key(name), { name, quality: '红色神将', slots: [] }]));
    await setAccountJson(page, PROGRESS_KEY, progress);
    await page.reload();
    await openQuery(page);
    const rows = await page.locator('#ins-results .ins-query-card').evaluateAll(cards => cards.map(card => ({
      name: card.querySelector('.ins-card-head b').textContent,
      saved: card.classList.contains('saved'),
      common: card.querySelector('[data-ins-common-key]').getAttribute('aria-pressed') === 'true'
    })));
    assert.equal(new Set(rows.map(r => r.name)).size, rows.length);
    assert.ok(rows.slice(0, 2).every(r => r.saved));
    assert.ok(rows.slice(2).every(r => !r.common && !r.saved));
    await page.locator('#ins-tian').selectOption('天府');
    await page.locator('#ins-shield').selectOption('鬼遁');
    await page.locator('#ins-search').fill('田虎');
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#ins-results .ins-query-card').count(), 1);
    assert.deepEqual(await page.locator('#ins-results .ins-card-head b').allTextContents(), ['神霸道田虎']);
    assert.ok((await page.locator('#ins-results .ins-slot-title').allTextContents()).every(text => text.startsWith('天府 · 鬼遁')));
  } finally { await page.close(); }
});

for (const width of [390, 900, 1440]) test(width + ' 常用切换保留卡片及个人进度，刷新不恢复已取消项', async () => {
  const page = await queryPage(width);
  try {
    await page.evaluate(k => {
      window.progressBefore = window.QinshiAccounts.getItem(k);
      window.cardBefore = document.querySelector('#ins-results .ins-query-card');
    }, PROGRESS_KEY);
    await commonButton(page, '神逍遥子').click();
    assert.equal(await commonButton(page, '神逍遥子').getAttribute('aria-pressed'), 'true');
    await commonButton(page, '神东皇太一').click();
    assert.equal(await commonButton(page, '神东皇太一').getAttribute('aria-pressed'), 'true');
    await commonButton(page, '神逍遥子').click();
    assert.equal(await commonButton(page, '神逍遥子').getAttribute('aria-pressed'), 'false');
    assert.ok(await page.evaluate(k => window.cardBefore.isConnected && window.QinshiAccounts.getItem(k) === window.progressBefore, PROGRESS_KEY));
    await page.reload();
    await openQuery(page);
    assert.equal(await commonButton(page, '神逍遥子').getAttribute('aria-pressed'), 'false');
    assert.equal(await commonButton(page, '神东皇太一').getAttribute('aria-pressed'), 'true');
    await setAccountJson(page, COMMON_KEY, { version: 1, keys: [] });
    await page.reload();
    await openQuery(page);
    assert.equal(await page.locator('#ins-results [data-ins-common-key][aria-pressed="true"]').count(), 0);
  } finally { await page.close(); }
});

test('常用保存失败时保留原标记并提示，不虚报保存成功', async () => {
  const page = await queryPage();
  try {
    await page.evaluate(k => {
      const original = window.QinshiAccounts.setItem;
      window.QinshiAccounts.setItem = function (name, value) {
        if (name === k) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(window.QinshiAccounts, name, value);
      };
    }, COMMON_KEY);
    await commonButton(page, '神逍遥子').click();
    assert.equal(await commonButton(page, '神逍遥子').getAttribute('aria-pressed'), 'false');
    assert.ok(await page.locator('#ins-common-status').isVisible());
    assert.match(await page.locator('#ins-common-status').innerText(), /保存.*失败/);
  } finally { await page.close(); }
});
