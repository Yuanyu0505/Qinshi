const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let browser, server, origin;
before(async () => {
  server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });
async function scenario(run, hash = '') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try { await openApp(page, origin + '/' + hash); await run(page); assert.deepEqual(errors, []); }
  finally { await context.close(); }
}
for (const [name, selector] of [
  ['machine-beasts', '#machine-beast-progress-content'], ['wooden-man-alley', '[data-wooden-cell]'],
  ['tactics', '[data-tactic-id]'], ['six-halls', '[data-six-halls-mode]'],
  ['battle-box-pill-pouch', '#battle-pouch-account'], ['formations', '[data-formation-id]'], ['loulan', '#partition-loulan img[src]']
]) {
  test('direct hash loads ' + name + ' and initializes without duplicate handlers', async () => scenario(async page => {
    await page.waitForFunction(name => !document.getElementById('partition-' + name).hidden && window.QinshiPartitionLoader.isReady(name), name);
    await page.locator(selector).first().waitFor();
    const first = await page.locator('#partition-' + name).innerHTML();
    await page.evaluate(name => Promise.all([window.QinshiPartitionLoader.ensure(name), window.QinshiPartitionLoader.ensure(name)]), name);
    assert.equal(await page.locator('#partition-' + name).innerHTML(), first);
  }, '#' + name));
}

test('quick navigation cannot let a late loaded partition replace the latest choice', async () => scenario(async page => {
  await page.route('**/js/tactics-ui.js*', async route => { await new Promise(r => setTimeout(r, 300)); await route.continue(); });
  await page.evaluate(() => {
    document.querySelector('[data-partition="tactics"]').click();
    document.querySelector('[data-partition="drops"]').click();
  });
  await page.waitForFunction(() => window.QinshiPartitionLoader.isReady('tactics'));
  assert.equal(await page.locator('#partition-drops').isVisible(), true);
  assert.equal(await page.locator('#partition-tactics').isVisible(), false);
  assert.equal(await page.locator('.partition-load-status').isVisible(), false);
}));

test('an unavailable partition shows retry feedback and succeeds when scripts recover', async () => scenario(async page => {
  let unavailable = true;
  await page.route('**/js/tactics-ui.js*', route => unavailable ? route.abort() : route.continue());
  await page.evaluate(() => document.querySelector('[data-partition="tactics"]').click());
  await page.locator('.partition-load-status').filter({ hasText: '加载失败' }).waitFor();
  assert.equal(await page.locator('#partition-atlas').isVisible(), true);
  unavailable = false;
  await page.evaluate(() => document.querySelector('[data-partition="tactics"]').click());
  await page.waitForFunction(() => !document.getElementById('partition-tactics').hidden && window.QinshiPartitionLoader.isReady('tactics'));
  assert.equal(await page.locator('.partition-load-status').isVisible(), false);
}));

for (const name of ['drops', 'quiz']) {
  test(name + ' applies the latest input when a cancelled search is revisited', async () => scenario(async page => {
    const expected = await page.evaluate(name => {
      document.querySelector('[data-partition="' + name + '"]').click();
      const input = document.getElementById(name === 'drops' ? 'drop-search' : 'quiz-search');
      const query = name === 'drops' ? '机关蛇' : window.QUIZ_DATA.items[0].question;
      input.value = query; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-partition="atlas"]').click();
      document.querySelector('[data-partition="' + name + '"]').click();
      return query;
    }, name);
    const result = page.locator(name === 'drops' ? '#drop-results' : '#quiz-results');
    assert.ok((await result.textContent()).includes(expected));
  }));
}

test('a newer lazy tab request supersedes an earlier forbidden item jump', async () => scenario(async page => {
  await page.route('**/js/machine-beasts-ui.js*', async route => { await new Promise(r => setTimeout(r, 100)); await route.continue(); });
  await page.route('**/js/wooden-man-alley-ui.js*', async route => { await new Promise(r => setTimeout(r, 350)); await route.continue(); });
  await page.evaluate(() => {
    document.querySelector('[data-partition="forbidden"]').click();
    document.dispatchEvent(new CustomEvent('qinshi:forbidden-navigate', { detail: {
      kind: 'machine-beast', name: '零号白虎', label: '零号白虎', trigger: document.getElementById('forbidden-content')
    } }));
    document.querySelector('[data-partition="wooden-man-alley"]').click();
  });
  await page.waitForFunction(() => window.QinshiPartitionLoader.isReady('machine-beasts') && window.QinshiPartitionLoader.isReady('wooden-man-alley'));
  assert.equal(await page.locator('#partition-wooden-man-alley').isVisible(), true);
  assert.equal(await page.locator('#partition-machine-beasts').isVisible(), false);
}));
