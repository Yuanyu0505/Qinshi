const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, setAccountJson, getAccountItem } = require('./browser-test-helpers.cjs');
const KEY = 'qinshi_inscription_progress_v2';
let browser, server, url;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel:'msedge', headless:true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function pageFor(width) {
  const page = await browser.newPage({ viewport:{ width, height:950 }, serviceWorkers:'block' });
  page.setDefaultTimeout(5000);
  await page.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await openApp(page, url, {waitUntil:'load'});
  await page.evaluate(() => document.querySelector('.tab[data-partition="inscription"]').click());
  return page;
}
for (const width of [390,768,1440]) test(width + ' reference selects quality and all qualities without global overflow or stored progress changes', async () => {
  const page = await pageFor(width);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const beforeProgress = await getAccountItem(page, KEY);
    await page.locator('#inscription-modes [data-mode="reference"]').click();
    const reference = page.locator('#inscription-reference');
    assert.equal(await reference.locator('[data-ref-quality]').count(), 1);
    assert.equal(await reference.locator('[data-ref-quality]').inputValue(), 'o2');
    assert.equal(await reference.locator('.ins-ref-section').count(), 1);
    const firstColumnWidth = await reference.locator('.ins-ref-matrix tbody th').first().evaluate(node => node.getBoundingClientRect().width);
    assert.ok(firstColumnWidth <= (width < 600 ? 150 : Math.max(200,width/4)), 'attribute label column must leave initial viewport room for the actual values: ' + firstColumnWidth);
    await page.screenshot({path:'test-results/1080-reference-' + width + '.png'});
    assert.match(await reference.innerText(), /天遁（极致：攻、暴击伤害）/);
    await reference.locator('[data-ref-dun]').selectOption('云遁');
    assert.match(await reference.innerText(), /云遁（极致：护盾、技免）/);
    await reference.locator('[data-ref-tab="wash"]').click();
    const wash = reference.locator('[data-ref-wash-dun="天遁"]');
    assert.doesNotMatch(await wash.innerText(), /高档/);
    assert.match(await wash.innerText(), /攻.*4%/s);
    assert.doesNotMatch(await wash.innerText(), /中档/);
    await reference.locator('[data-ref-tab="current"]').click();
    await reference.locator('[data-ref-quality]').selectOption('g1');
    assert.match(await reference.locator('[data-ref-current]').innerText(), /绿一副属性.*未知/);
    await reference.locator('[data-ref-all]').check();
    assert.equal(await reference.locator('[data-ref-current] [data-ref-quality-panel]').count(), 7);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    assert.ok(await reference.locator('.ins-ref-scroll').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).overflowX === 'auto')));
    await reference.locator('[data-ref-tab="foundation"]').click();
    await reference.locator('[data-ref-main-quality]').selectOption('g1');
    assert.match(await reference.locator('[data-ref-foundation]').innerText(), /25600护盾/);
    await reference.locator('.ins-ref-overview summary').click();
    const scrollable = reference.locator('.ins-ref-overview .ins-ref-scroll');
    if (width < 1000) assert.ok(await scrollable.evaluate(node => node.scrollWidth > node.clientWidth), 'wide main table scrolls locally');
    await reference.locator('[data-ref-tab="upgrade"]').click();
    await reference.locator('[data-ref-upgrade-dun]').selectOption('鬼遁');
    await reference.locator('[data-ref-upgrade-from]').selectOption('b2');
    const speed = reference.locator('[data-ref-upgrade-row="速:?"]');
    assert.match(await speed.innerText(), /2.*高档/s);
    assert.match(await speed.innerText(), /1.*中档/s);
    assert.doesNotMatch(await speed.innerText(), /概率|50%/);
    assert.equal(await getAccountItem(page, KEY), beforeProgress);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('progress main stats render blue and purple in saved/query/editor views without rewriting history or exposing green progress', async () => {
  const page = await pageFor(900);
  try {
    const fixture = await page.evaluate(() => {
      const item = window.INSCRIPTION_DATA.items.find(entry => entry.quality === '红色神将' && entry.slots.some(slot => slot.tian === '天机'));
      const slot = item.slots.find(entry => entry.tian === '天机');
      return { key:item.quality + '\u0000' + item.name, name:item.name, quality:item.quality, slot };
    });
    const history = { [fixture.key]: {name:fixture.name,quality:fixture.quality,slots:[{...fixture.slot,quality:'蓝色',star:'1',subs:[],subValues:[],custom:'preserved'}]} };
    await setAccountJson(page, KEY, history);
    await page.reload();
    await page.evaluate(() => document.querySelector('.tab[data-partition="inscription"]').click());
    const before = await getAccountItem(page, KEY);
    assert.match(await page.locator('#ins-progress-list').innerText(), /43200护盾/);
    assert.match(await page.locator('#ins-progress-list').innerText(), /2700内力/);
    await page.locator('#inscription-modes [data-mode="query"]').click();
    await page.locator('#ins-search').fill(fixture.name);
    await page.waitForTimeout(200);
    assert.match(await page.locator('#ins-results').innerText(), /43200护盾/);
    await page.locator('#inscription-modes [data-mode="progress"]').click();
    await page.locator('[data-edit-key="' + encodeURIComponent(fixture.key) + '"]').click();
    const editor = page.locator('.ins-editor-slot[data-tian="天机"]');
    assert.equal(await editor.locator('.ins-edit-quality option[value="g1"]').count(), 0);
    await editor.locator('.ins-edit-quality').selectOption('p2');
    assert.match(await editor.locator('.ins-main-preview').innerText(), /208800护盾/);
    assert.match(await editor.locator('.ins-main-preview').innerText(), /13050内力/);
    assert.equal(await getAccountItem(page, KEY), before);
  } finally { await page.close(); }
});
