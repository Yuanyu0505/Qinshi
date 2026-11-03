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
async function scenario(run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openApp(page, origin);
    await page.evaluate(() => document.querySelector('[data-partition="inscription"]').click());
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
async function waitComplete(page) {
  await page.waitForFunction(() => document.getElementById('ins-results').getAttribute('aria-busy') === 'false');
}

test('first query yields bounded batches, preserves complete result order and reuses clean DOM', async () => scenario(async page => {
  const first = await page.evaluate(() => {
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    return { count: document.querySelectorAll('#ins-results .ins-query-card').length, busy: document.getElementById('ins-results').getAttribute('aria-busy') };
  });
  assert.ok(first.count > 0 && first.count <= 12, JSON.stringify(first));
  assert.equal(first.busy, 'true');
  await waitComplete(page);
  const result = await page.evaluate(() => {
    const expected = INSCRIPTION_DATA.items.filter(item => item.quality === '红色神将');
    expected.sort((a, b) => Number(b.name === '神千泷高月') - Number(a.name === '神千泷高月') || a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }));
    return { expected: expected.map(item => item.quality + '\u0000' + item.name), actual: Array.from(document.querySelectorAll('#ins-results .ins-query-card'), card => decodeURIComponent(card.dataset.insQueryKey)) };
  });
  assert.deepEqual(result.actual, result.expected);
  assert.equal(await page.evaluate(() => {
    const card = document.querySelector('#ins-results .ins-query-card');
    document.querySelector('#inscription-modes [data-mode="reference"]').click();
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    return card === document.querySelector('#ins-results .ins-query-card');
  }), true);
}));

for (const destination of ['mode', 'partition']) test('leaving query by ' + destination + ' cancels incomplete work and completes on return', async () => scenario(async page => {
  const initial = await page.evaluate(destination => {
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    const count = document.querySelectorAll('#ins-results .ins-query-card').length;
    document.querySelector(destination === 'mode' ? '#inscription-modes [data-mode="progress"]' : '[data-partition="atlas"]').click();
    return count;
  }, destination);
  assert.ok(initial <= 12);
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#ins-results .ins-query-card').count(), initial);
  await page.evaluate(destination => document.querySelector(destination === 'mode' ? '#inscription-modes [data-mode="query"]' : '[data-partition="inscription"]').click(), destination);
  await waitComplete(page);
  assert.ok(await page.locator('#ins-results .ins-query-card').count() > initial);
}));

test('new search cancels previous batches before debounce and empty results clear previous cards', async () => scenario(async page => {
  const expected = await page.evaluate(() => {
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    const item = INSCRIPTION_DATA.items.find(item => item.quality === '红色神将');
    const input = document.getElementById('ins-search');
    input.value = item.name; input.dispatchEvent(new Event('input', { bubbles: true }));
    return item.name;
  });
  await page.waitForTimeout(50);
  assert.ok(await page.locator('#ins-results .ins-query-card').count() <= 12);
  await page.waitForFunction(name => {
    const cards = document.querySelectorAll('#ins-results .ins-query-card');
    return cards.length === 1 && cards[0].textContent.includes(name) && document.getElementById('ins-results').getAttribute('aria-busy') === 'false';
  }, expected);
  assert.equal(await page.locator('#ins-results .ins-query-card').count(), 1);
  assert.ok((await page.locator('#ins-results').textContent()).includes(expected));
  await page.locator('#ins-search').fill('no-such-inscription-disciple');
  await page.waitForFunction(() => !document.querySelector('#ins-results .ins-query-card') && document.getElementById('ins-results').textContent.includes('未找到匹配弟子'));
  assert.equal(await page.locator('#ins-results .ins-query-card').count(), 0);
  assert.ok((await page.locator('#ins-results').textContent()).includes('未找到匹配弟子'));
}));

test('account identity change prevents queued old-account cards from appending', async () => scenario(async page => {
  const count = await page.evaluate(() => {
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    const count = document.querySelectorAll('#ins-results .ins-query-card').length;
    const second = QinshiAccounts.createAccount({ name: '分批隔离账号', server: '测试服' });
    QinshiAccounts.bindAccount(second.id);
    return count;
  });
  assert.ok(count <= 12);
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#ins-results .ins-query-card').count(), count);
  assert.equal(await page.locator('#ins-results').getAttribute('aria-busy'), 'false');
}));

test('changing common priority during batching preserves cards and correct complete order', async () => scenario(async page => {
  await page.evaluate(() => {
    document.querySelector('#inscription-modes [data-mode="query"]').click();
    window.commonBatchCard = document.querySelector('#ins-results .ins-query-card');
    document.querySelector('#ins-results [data-ins-common-key]').click();
  });
  await waitComplete(page);
  assert.equal(await page.evaluate(() => window.commonBatchCard.isConnected), true);
  const result = await page.evaluate(() => ({
    actual: Array.from(document.querySelectorAll('#ins-results .ins-query-card'), card => decodeURIComponent(card.dataset.insQueryKey)),
    expected: INSCRIPTION_DATA.items.filter(item => item.quality === '红色神将').slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' }))
      .map(item => item.quality + '\u0000' + item.name)
  }));
  assert.deepEqual(result.actual, result.expected);
}));

test('query sorting does not rebuild locale comparison options for every pair', async () => scenario(async page => {
  const measured = await page.evaluate(() => {
    const compare = String.prototype.localeCompare;
    let calls = 0;
    String.prototype.localeCompare = function (...args) { calls += 1; return compare.apply(this, args); };
    try {
      document.querySelector('#inscription-modes [data-mode="query"]').click();
      return { calls, count: INSCRIPTION_DATA.items.filter(item => item.quality === '红色神将').length };
    } finally { String.prototype.localeCompare = compare; }
  });
  assert.ok(measured.calls < measured.count, JSON.stringify(measured));
  await waitComplete(page);
}));
