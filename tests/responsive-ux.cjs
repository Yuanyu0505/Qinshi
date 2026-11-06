const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let server, browser, url;
const artifacts = path.resolve('test-results/responsive-interactions');
before(async () => {
 fs.mkdirSync(artifacts, { recursive: true });
 server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
 url = 'http://127.0.0.1:' + server.address().port;
 browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });
for (const [width, height] of [[320,568],[390,844],[600,800],[820,1180],[1024,768],[1280,720],[1920,1080]]) {
 test(`${width}x${height}: responsive presentation preserves filters, reference data and navigation`, async () => {
  const p = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block' });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => new URL(r.request().url()).origin === url ? r.continue() : r.abort());
  try {
   await openApp(p, url);
   if (width < 768) {
    const search = p.locator('#atlas-search'); await search.fill('攻');
    await p.locator('#partition-atlas .responsive-filter-toggle').click();
    assert.equal(await search.isVisible(), false);
    await p.locator('#partition-atlas .responsive-filter-toggle').click();
    assert.equal(await search.inputValue(), '攻');
   }
   if (width >= 768 && width <= 1366) await p.locator('.responsive-partition-jump select').selectOption('tactics');
   else await p.evaluate(() => document.querySelector('.tab[data-partition="tactics"]').click());
   await p.locator('[data-tactic-id="wind"]').click();
   await p.locator('[data-reference-mode="all"]').click();
   const table = p.locator('.tactics-reference-table');
   if (width >= 768) assert.equal(await p.locator('.tactics-calculator-grid').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length), 2);
   const rows = await table.locator('tbody tr').count(); assert.equal(rows, 16);
   const cards = p.locator('.tactics-reference-card'); assert.equal(await cards.count(), rows);
   if (width <= 600) {
    assert.equal(await table.isVisible(), false);
    await cards.nth(5).locator('summary').click();
    assert.match(await cards.nth(5).innerText(), /进阶材料.*功勋/s);
    await p.locator('[data-reference-presentation]').click(); assert.equal(await table.isVisible(), true);
    await p.locator('[data-reference-presentation]').click(); assert.equal(await cards.first().isVisible(), true);
   } else assert.equal(await table.isVisible(), true);
   await p.screenshot({ path: path.join(artifacts, width + '-tactics.png') });
   if (width < 768) {
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.locator('.responsive-back-top').click();
    assert.ok(await p.evaluate(() => scrollY) < 5);
    assert.equal(await p.evaluate(() => document.activeElement.tagName), 'H1');
   }
   const geometry = await p.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, escaped:[...document.querySelectorAll('body *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>innerWidth+1;}).slice(0,10).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width})) }));
   geometry.details = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(n=>n.clientWidth&&n.scrollWidth>n.clientWidth+2&&getComputedStyle(n).overflowX==='visible').slice(0,18).map(n=>({tag:n.tagName,id:n.id,cls:n.className,w:n.clientWidth,s:n.scrollWidth,text:n.textContent.slice(0,35)})));
   await p.screenshot({path:path.join(artifacts,width+'-final.png')});
   assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
   assert.deepEqual(errors, []);
  } finally { await p.close(); }
 });
}
