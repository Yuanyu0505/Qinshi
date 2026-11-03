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

test('partition navigation sets its scroll position before yielding a frame', async () => scenario(async page => {
  const result = await page.evaluate(() => {
    for (const name of ['atlas', 'drops']) {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.getElementById('partition-' + name).appendChild(spacer);
    }
    window.scrollTo(0, 900);
    document.querySelector('[data-partition="drops"]').click();
    return { top: window.scrollY, visible: !document.getElementById('partition-drops').hidden };
  });
  assert.equal(result.visible, true);
  assert.equal(result.top, 0, 'new partition must not spend a frame at the old scroll position');
}));

test('a completed partition switch cannot reset a later user scroll', async () => scenario(async page => {
  const top = await page.evaluate(async () => {
    const spacer = document.createElement('div');
    spacer.style.height = '3000px';
    document.getElementById('partition-drops').appendChild(spacer);
    document.querySelector('[data-partition="drops"]').click();
    window.scrollTo(0, 500);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.scrollY;
  });
  assert.equal(top, 500, 'no queued navigation callback may pull the viewport back');
}));

test('lazy loading feedback does not resize the visible page', async () => scenario(async page => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/js/tactics-ui.js*', async route => { await gate; await route.continue(); });
  try {
    const dimensions = await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.getElementById('partition-atlas').appendChild(spacer);
      window.scrollTo(0, 600);
      const before = document.documentElement.scrollHeight;
      document.querySelector('[data-partition="tactics"]').click();
      return { before, after: document.documentElement.scrollHeight, top: window.scrollY };
    });
    assert.equal(dimensions.after, dimensions.before);
    assert.equal(dimensions.top, 600);
    assert.equal(await page.locator('#partition-atlas').isVisible(), true);
  } finally { release(); }
}));

test('closing the mobile menu cancels its queued focus move', async () => scenario(async page => {
  const focused = await page.evaluate(async () => {
    const toggle = document.getElementById('mobile-more-toggle');
    toggle.focus({ preventScroll: true });
    toggle.click();
    document.getElementById('mobile-more-close').click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return document.activeElement.id;
  });
  assert.equal(focused, 'mobile-more-toggle');
}));

test('selecting a mobile menu partition restores a visible keyboard focus without scrolling', async () => scenario(async page => {
  await page.locator('#mobile-more-toggle').focus();
  await page.keyboard.press('Enter');
  const item = page.locator('#mobile-more-layer [data-partition="inscription"]');
  await item.focus();
  await page.keyboard.press('Enter');
  await page.locator('#partition-inscription').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mobile-more-toggle');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
}));

test('history back and forward restore partition positions without a queued reset', async () => scenario(async page => {
  await page.evaluate(() => {
    for (const name of ['atlas', 'drops']) {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.getElementById('partition-' + name).appendChild(spacer);
    }
    window.scrollTo(0, 700);
    document.querySelector('[data-partition="drops"]').click();
    window.scrollTo(0, 400);
  });
  await page.goBack();
  await page.waitForFunction(() => !document.getElementById('partition-atlas').hidden);
  assert.equal(await page.evaluate(() => window.scrollY), 700);
  await page.goForward();
  await page.waitForFunction(() => !document.getElementById('partition-drops').hidden);
  assert.equal(await page.evaluate(() => window.scrollY), 400);
}));
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
