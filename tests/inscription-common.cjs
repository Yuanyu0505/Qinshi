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
const LEIBAO_KEY = '普通橙色\u0000雷豹英布';
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
function commonButton(page, name, quality = '红色神将') {
  return page.locator('#ins-results [data-ins-common-key="' + encodeURIComponent(quality + '\u0000' + name) + '"]');
}

test('首次默认加入神千泷高月与雷豹英布，默认红色且切换页签不覆盖品质筛选，取消雷豹后不补回', async () => {
  const page = await queryPage();
  try {
    assert.equal(await page.locator('#ins-quality').inputValue(), '红色神将');
    const stored = await getAccountJson(page, COMMON_KEY);
    assert.deepEqual(stored, { version: 1, keys: [key('神千泷高月'), LEIBAO_KEY], gaoyueDefaultApplied: true, leibaoDefaultApplied: true });
    assert.equal(await page.locator('#ins-results .ins-quality.orange').count(), 0);
    await page.locator('#ins-quality').selectOption('普通橙色');
    await page.locator('#inscription-modes [data-mode="reference"]').click();
    await page.locator('#inscription-modes [data-mode="query"]').click();
    assert.equal(await page.locator('#ins-quality').inputValue(), '普通橙色');
    const leibao = commonButton(page, '雷豹英布', '普通橙色');
    assert.equal(await leibao.getAttribute('aria-pressed'), 'true');
    const slots = leibao.locator('xpath=ancestor::article').locator('.ins-slot-title');
    assert.equal(await slots.count(), 4);
    assert.deepEqual(new Set(await slots.evaluateAll(nodes => nodes.map(node => node.firstChild.textContent.trim()))),
      new Set(['天府 · 人遁', '天同 · 云遁', '天梁 · 虎遁', '天相 · 地遁']));
    await leibao.click();
    assert.equal(await leibao.getAttribute('aria-pressed'), 'false');
    await page.reload();
    await openQuery(page);
    await page.locator('#ins-quality').selectOption('普通橙色');
    assert.equal(await commonButton(page, '雷豹英布', '普通橙色').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await getAccountJson(page, COMMON_KEY),
      { version: 1, keys: [key('神千泷高月')], gaoyueDefaultApplied: true, leibaoDefaultApplied: true });
  } finally { await page.close(); }
});

test('旧常用名单仅迁移一次雷豹默认项，保留原名单和个人进度并记录迁移标记', async () => {
  const page = await queryPage();
  try {
    const originalKeys = [key('神逍遥子'), key('神千泷高月')];
    const progressBefore = await getAccountJson(page, PROGRESS_KEY);
    await setAccountJson(page, COMMON_KEY, { version: 1, keys: originalKeys, gaoyueDefaultApplied: true });
    await page.reload();
    await openQuery(page);
    const migrated = { version: 1, keys: [...originalKeys, LEIBAO_KEY], gaoyueDefaultApplied: true, leibaoDefaultApplied: true };
    assert.deepEqual(await getAccountJson(page, COMMON_KEY), migrated);
    await page.reload();
    await openQuery(page);
    assert.deepEqual(await getAccountJson(page, COMMON_KEY), migrated);
    await page.locator('#ins-quality').selectOption('普通橙色');
    await commonButton(page, '雷豹英布', '普通橙色').click();
    await page.reload();
    await openQuery(page);
    await page.locator('#ins-quality').selectOption('普通橙色');
    assert.equal(await commonButton(page, '雷豹英布', '普通橙色').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await getAccountJson(page, COMMON_KEY),
      { version: 1, keys: originalKeys, gaoyueDefaultApplied: true, leibaoDefaultApplied: true });
    assert.deepEqual(await getAccountJson(page, PROGRESS_KEY), progressBefore);
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
    assert.ok(rows.slice(2).every(r => !r.saved && (r.name === '神千泷高月' ? r.common : !r.common)));
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
    // Both defaults have already been applied; this is an intentional user clear,
    // not an old pre-Leibao list that still needs the one-time migration.
    await setAccountJson(page, COMMON_KEY, { version: 1, keys: [], gaoyueDefaultApplied:true, leibaoDefaultApplied:true });
    await page.reload();
    await openQuery(page);
    assert.equal(await page.locator('#ins-results [data-ins-common-key][aria-pressed="true"]').count(), 0);
    await page.locator('#ins-quality').selectOption('普通橙色');
    assert.equal(await page.locator('#ins-results [data-ins-common-key][aria-pressed="true"]').count(), 0);
    assert.deepEqual((await getAccountJson(page, COMMON_KEY)).keys, []);
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

test('常用保存返回false时保留原标记并提示未保存',async()=>{
  const page=await queryPage();try{
    const before=await getAccountJson(page,COMMON_KEY);await page.evaluate(()=>{window.QinshiAccounts.setItem=()=>false;});
    await commonButton(page,'神逍遥子').click();assert.equal(await commonButton(page,'神逍遥子').getAttribute('aria-pressed'),'false');
    assert.deepEqual(await getAccountJson(page,COMMON_KEY),before);assert.match(await page.locator('#ins-common-status').innerText(),/保存.*失败/);
  }finally{await page.close();}
});
