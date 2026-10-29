const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, setAccountItem } = require('./browser-test-helpers.cjs');

const KEY = 'qinshi_inscription_progress_v2';
const NAME = '神鬼谷盖聂';
const ITEM_KEY = '红色神将\u0000' + NAME;
let browser, server, url;
const scriptErrors = [];
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
afterEach(() => assert.deepEqual(scriptErrors.splice(0), [], 'No uncaught browser script errors'));

async function openInscription(page) {
  await page.locator('.tab[data-partition="inscription"]').click();
  await page.locator('[data-mode="progress"]').click();
}
async function pageFor() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => scriptErrors.push(error.message));
  await page.route('**/*', route => {
    const requested = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(requested.hostname) || ['data:', 'file:'].includes(requested.protocol) ? route.continue() : route.abort();
  });
  await openApp(page, url, { waitUntil: 'load' });
  await openInscription(page);
  return page;
}
async function savedSlot(page, tian = '天同') {
  const card = page.locator('#ins-progress-list .ins-progress-card').filter({ hasText: NAME });
  await card.scrollIntoViewIfNeeded();
  return card.locator('.ins-saved-slot').filter({ has: page.locator('.ins-saved-core b').filter({ hasText: tian + ' ·' }) });
}
async function currentValues(page) {
  await page.locator('[data-mode="query"]').click();
  await page.locator('#ins-search').fill(NAME);
  const slot = page.locator('.ins-query-card').filter({ hasText: NAME }).locator('.ins-query-slot').filter({ has: page.locator('.ins-slot-title').filter({ hasText: '天同 ·' }) });
  await slot.locator('.ins-current-sub-tag').first().waitFor();
  return slot.locator('.ins-current-sub-tag').allTextContents();
}
function rawRecord(slot) {
  return JSON.stringify({ [ITEM_KEY]: { name: NAME, quality: '红色神将', slots: [Object.assign({ tian: '天同', shield: '地遁', quality: '橙色', star: '2' }, slot)] } });
}

test('saving and reloading groups display only; editor slots, values, tiers and raw storage remain unchanged', async () => {
  const page = await pageFor();
  try {
    await page.locator('#ins-progress-search').fill(NAME);
    await page.locator('#ins-progress-suggestions button').first().click();
    const row = page.locator('.ins-editor-slot[data-tian="天同"]');
    for (const [index, value] of ['技能穿透:M', '暴击:M', '技能穿透:H'].entries()) await row.locator('.ins-edit-sub').nth(index).selectOption(value);
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const raw = await getAccountItem(page, KEY);
    const stored = JSON.parse(raw)[ITEM_KEY].slots.find(slot => slot.tian === '天同');
    assert.deepEqual(stored.subs, ['技能穿透', '暴击', '技能穿透']);
    assert.deepEqual(stored.subValues, ['+5%', '+5%', '+6%']);
    assert.deepEqual(stored.subTiers, ['M', 'M', 'H']);
    const expected = ['6%技能穿透（高档）', '5%技能穿透（中档）', '5%暴击（中档）'];
    let slot = await savedSlot(page);
    assert.deepEqual(await slot.locator('.ins-saved-sub .ins-term').allTextContents(), expected);
    assert.deepEqual(await slot.locator('.ins-saved-sub small').allTextContents(), ['副属性1', '副属性2', '副属性3']);
    assert.deepEqual(await currentValues(page), expected);
    await page.reload({ waitUntil: 'load' }); await openInscription(page);
    slot = await savedSlot(page);
    assert.deepEqual(await slot.locator('.ins-saved-sub .ins-term').allTextContents(), expected);
    assert.equal(await getAccountItem(page, KEY), raw);
    await page.locator('#ins-progress-list [data-edit-key]').first().click();
    assert.deepEqual(await row.locator('.ins-edit-sub').evaluateAll(els => els.map(el => el.value)), ['技能穿透:M', '暴击:M', '技能穿透:H']);
    assert.deepEqual(await currentValues(page), expected);
    assert.equal(await getAccountItem(page, KEY), raw);
  } finally { await page.close(); }
});

for (const quality of ['b1', 'b2']) test(quality + ' indistinguishable tiers display the progress-rule value without rewriting history', async () => {
  const page = await pageFor();
  try {
    const attr = quality === 'b1' ? '技能穿透' : 'PVP速';
    const value = quality === 'b1' ? '+1%' : '+1';
    const expected = quality === 'b1' ? '1%技能穿透（档位不可辨）' : '1PVP速（档位不可辨）';
    const raw = rawRecord({ quality: '蓝色', star: quality.charAt(1), subs: [attr], subValues: [value], subTiers: ['?'] });
    await setAccountItem(page, KEY, raw); await page.reload({ waitUntil: 'load' }); await openInscription(page);
    const slot = await savedSlot(page);
    assert.deepEqual(await slot.locator('.ins-saved-sub .ins-term').allTextContents(), [expected]);
    assert.equal(await slot.locator('.craft-legacy-warning').count(), 0);
    assert.deepEqual(await currentValues(page), [expected]);
    assert.equal(await getAccountItem(page, KEY), raw);
  } finally { await page.close(); }
});

test('invalid historical combinations retain original order, exact raw text and warnings in both displays', async () => {
  const page = await pageFor();
  try {
    const raw = rawRecord({ subs: ['技能穿透', '暴击', '技能穿透'], subValues: ['+5%', '旧备注<保留>', '+99%'], subTiers: ['M', '', ''] });
    await setAccountItem(page, KEY, raw); await page.reload({ waitUntil: 'load' }); await openInscription(page);
    const slot = await savedSlot(page);
    assert.deepEqual(await slot.locator('.ins-saved-sub > span').allTextContents(), ['5%技能穿透（中档）', '暴击旧备注<保留>', '技能穿透+99%']);
    assert.match(await slot.textContent(), /历史记录警告/);
    assert.deepEqual(await currentValues(page), ['5%技能穿透（中档）', '暴击旧备注<保留>', '技能穿透+99%']);
    assert.equal(await page.locator('#ins-results .craft-legacy-warning').count(), 1);
    assert.equal(await getAccountItem(page, KEY), raw);
  } finally { await page.close(); }
});
