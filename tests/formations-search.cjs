// 设置 PLAYWRIGHT_MODULE 后运行：node --test tests/formations-search.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem } = require('./browser-test-helpers.cjs');

const STORE_KEY = 'qinshi_formation_progress_v1';
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

async function openFormations(width = 900) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await page.addInitScript(() => {
    let data;
    Object.defineProperty(window, 'FORMATIONS_DATA', {
      get() { return data; },
      set(value) {
        const source = value.items[0];
        const candidate = { id: 'candidate-shared', name: '神·同门', level1: { attack: 100, health: 200, defense: 30 }, officialPosition: null };
        value.items = [
          Object.assign({}, source, { id: 'search-a', name: '同门甲阵', candidates: [candidate] }),
          Object.assign({}, source, { id: 'search-b', name: '同门乙阵', candidates: [candidate] }),
          Object.assign({}, source, { id: 'search-c', name: '独行阵', candidates: [Object.assign({}, candidate, { id: 'candidate-other', name: '独行弟子' })] }),
        ];
        value.meta.order = ['search-a', 'search-b', 'search-c'];
        data = value;
      },
    });
  });
  await openApp(page, url, { waitUntil: 'load' });
  await page.locator('.tab[data-partition="formations"]').click();
  return page;
}

test('阵名和弟子名列出全部匹配，不自动选阵、不写存档；无结果及清空可恢复', async () => {
  const page = await openFormations();
  try {
    const before = await getAccountItem(page, STORE_KEY);
    await page.locator('#formation-search').fill('同门');
    assert.deepEqual(await page.locator('#formation-search-results button[data-formation-id] strong').allTextContents(), ['同门甲阵', '同门乙阵']);
    assert.equal(await page.locator('#formation-workspace').isHidden(), true);
    await page.locator('#formation-search').fill('神 同门');
    assert.equal(await page.locator('#formation-search-results button[data-formation-id]').count(), 2);
    assert.match(await page.locator('#formation-search-results').innerText(), /命中弟子：神·同门/);
    await page.locator('#formation-search').fill('不存在的合阵');
    assert.equal(await page.locator('#formation-search-results button[data-formation-id]').count(), 0);
    assert.match(await page.locator('#formation-search-results').innerText(), /未找到/);
    await page.locator('#formation-search-results [data-formation-search-clear]').click();
    assert.equal(await page.locator('#formation-search').inputValue(), '');
    assert.equal(await page.locator('#formation-search-results').isHidden(), true);
    assert.equal(await page.locator('#formation-selector button[data-formation-id]').count(), 3);
    assert.equal(await getAccountItem(page, STORE_KEY), before);
  } finally { await page.close(); }
});

for (const width of [390, 900]) test(width + '：键盘选择合阵，取消切换保留草稿，确认后只切换工作区', async () => {
  const page = await openFormations(width);
  try {
    const before = await getAccountItem(page, STORE_KEY);
    await page.locator('#formation-search').fill('同门');
    await page.locator('#formation-search').press('Enter');
    assert.equal(await page.locator('#formation-workspace').isHidden(), true);
    await page.locator('#formation-search').press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.formation-official h2').innerText(), '同门乙阵');
    await page.locator('#formation-workspace [data-action="edit-progress"]').click();
    await page.locator('#formation-workspace [data-scope="progress"][data-role="owned"]').check();
    await page.locator('#formation-workspace [data-scope="progress"][data-member-field="attack"]').fill('54321');
    await page.locator('#formation-search').fill('独行');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#formation-search-results [data-formation-id="search-c"]').click();
    assert.equal(await page.locator('.formation-official h2').innerText(), '同门乙阵');
    assert.equal(await page.locator('#formation-workspace [data-scope="progress"][data-member-field="attack"]').inputValue(), '54321');
    assert.equal(await page.locator('#formation-workspace [data-action="save-progress"]').count(), 2);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#formation-search-results [data-formation-id="search-c"]').click();
    assert.equal(await page.locator('.formation-official h2').innerText(), '独行阵');
    assert.equal(await getAccountItem(page, STORE_KEY), before);
  } finally { await page.close(); }
});

test('原合阵按钮同样保护自由计算，点当前合阵不重置临时值', async () => {
  const page = await openFormations();
  try {
    const before = await getAccountItem(page, STORE_KEY);
    await page.locator('#formation-selector [data-formation-id="search-a"]').click();
    await page.locator('#formation-workspace [data-scope="calculator"][data-role="owned"]').check();
    await page.locator('#formation-workspace [data-scope="calculator"][data-member-field="attack"]').fill('invalid-draft');
    await page.locator('#formation-selector [data-formation-id="search-a"]').click();
    assert.equal(await page.locator('#formation-workspace [data-scope="calculator"][data-member-field="attack"]').inputValue(), 'invalid-draft');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#formation-selector [data-formation-id="search-b"]').click();
    assert.equal(await page.locator('.formation-official h2').innerText(), '同门甲阵');
    assert.equal(await page.locator('#formation-workspace [data-scope="calculator"][data-member-field="attack"]').inputValue(), 'invalid-draft');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#formation-selector [data-formation-id="search-b"]').click();
    assert.equal(await page.locator('.formation-official h2').innerText(), '同门乙阵');
    assert.equal(await getAccountItem(page, STORE_KEY), before);
  } finally { await page.close(); }
});

test('搜索结果转义阵名和弟子名，Escape 清空并返回输入框', async () => {
  const page = await openFormations();
  try {
    await page.evaluate(() => {
      window.FORMATIONS_DATA.items[0].name = '<img src=x onerror="window.searchInjected=true">';
      window.FORMATIONS_DATA.items[0].candidates = [Object.assign({}, window.FORMATIONS_DATA.items[0].candidates[0], { name: '<svg onload="window.searchInjected=true">' })];
    });
    await page.locator('#formation-search').fill('on');
    assert.equal(await page.locator('#formation-search-results button[data-formation-id]').count(), 1);
    assert.equal(await page.locator('#formation-search-results img, #formation-search-results svg').count(), 0);
    assert.match(await page.locator('#formation-search-results').innerText(), /<img src=x/);
    assert.equal(await page.evaluate(() => Boolean(window.searchInjected)), false);
    await page.locator('#formation-search').press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#formation-search').inputValue(), '');
    assert.equal(await page.locator('#formation-search-results').isHidden(), true);
    assert.equal(await page.locator('#formation-search').evaluate(input => input === document.activeElement), true);
  } finally { await page.close(); }
});
