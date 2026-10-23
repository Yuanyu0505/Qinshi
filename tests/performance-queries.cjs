const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let server, browser, url;
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
async function open(part) {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  await page.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
  await openApp(page, url);
  await page.evaluate(name => document.querySelector('[data-partition="' + name + '"]').click(), part);
  return page;
}
for (const part of ['drops', 'quiz']) {
  const input = part === 'drops' ? '#drop-search' : '#quiz-search';
  const results = part === 'drops' ? '#drop-results' : '#quiz-results';
  test(part + ' IME中间态不刷新，提交与连续输入只刷新一次，离开取消队列', async () => {
    const page = await open(part);
    try {
      await page.evaluate(({ input, results }) => {
        window.queryRenders = 0;
        new MutationObserver(records => { window.queryRenders += records.length; }).observe(document.querySelector(results), { childList: true });
        const field = document.querySelector(input);
        field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        field.value = '秦';
        field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      }, { input, results });
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.queryRenders), 0);
      await page.evaluate(input => {
        const field = document.querySelector(input);
        field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
        field.value = '秦时';
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }, input);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.queryRenders), 1);
      await page.evaluate(input => {
        window.queryRenders = 0;
        document.querySelector(input).dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-partition="atlas"]').click();
      }, input);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.queryRenders), 0);
    } finally { await page.close(); }
  });
}
test('图鉴等级变化保留未编辑卡片并复用派生计划供卡片与汇总', async () => {
  const page = await open('atlas');
  try {
    await page.locator('#atlas-tabs [data-atlas="攻"]').click();
    const result = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-atlas-item]');
      const untouched = cards[1];
      const upgradePlan = ATLAS.upgradePlan;
      let duplicatePlans = 0;
      ATLAS.upgradePlan = function (...args) { duplicatePlans++; return upgradePlan(...args); };
      const field = cards[0].querySelector('.atlas-level');
      field.value = '20';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      ATLAS.upgradePlan = upgradePlan;
      return { retained: untouched.isConnected, duplicatePlans, reached: document.querySelector('[data-atlas-item]').textContent.includes('已达到目标等级') };
    });
    assert.equal(result.retained, true);
    assert.equal(result.duplicatePlans, 0);
    assert.equal(result.reached, true);
  } finally { await page.close(); }
});

test('收藏图鉴等级变化更新排序、汇总和筛选成员，保留完整结果', async () => {
  const page = await open('atlas');
  try {
    await page.evaluate(() => {
      ATLAS_DATA.items = [
        { id: 'perf-a', name: 'A', atlas: '攻', level: 0, stages: [] },
        { id: 'perf-b', name: 'B', atlas: '攻', level: 1, stages: [] }
      ];
      ATLAS_DATA.meta.upgradeStages = [{ to: 1, knots: 3, souls: 2 }, { to: 2, knots: 5, souls: 4 }];
      document.querySelector('#atlas-tabs [data-atlas="攻"]').click();
      document.querySelector('[data-atlas-favorite="perf-a"]').click();
      document.querySelector('[data-atlas-favorite="perf-b"]').click();
      document.querySelector('#atlas-tabs [data-atlas="已收藏"]').click();
    });
    await page.locator('#atlas-sort-field').selectOption('knots');
    assert.deepEqual(await page.locator('[data-atlas-item]').evaluateAll(cards => cards.map(card => card.dataset.atlasItem)), ['perf-b', 'perf-a']);
    await page.locator('[data-atlas-item="perf-a"] .atlas-level').fill('20');
    await page.locator('[data-atlas-item="perf-a"] .atlas-level').dispatchEvent('change');
    assert.deepEqual(await page.locator('[data-atlas-item]').evaluateAll(cards => cards.map(card => card.dataset.atlasItem)), ['perf-a', 'perf-b']);
    assert.equal(await page.locator('#atlas-upgrade-summary .atlas-cost-knots b').textContent(), '5');
    assert.match(await page.locator('#atlas-upgrade-summary').textContent(), /1\/2/);
    await page.locator('#atlas-level-min').fill('2');
    await page.locator('#atlas-level-min').dispatchEvent('change');
    assert.equal(await page.locator('[data-atlas-item]').count(), 1);
    await page.evaluate(() => {
      const level = document.querySelector('[data-atlas-item] .atlas-level');
      level.value = '1';
      level.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await page.locator('[data-atlas-item]').count(), 0);
    assert.match(await page.locator('#atlas-results').textContent(), /未找到/);
  } finally { await page.close(); }
});
