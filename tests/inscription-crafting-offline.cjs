// Real local PWA and actual released 1.0.61 upgrade. Only isolated test accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, ensureTestAccount, currentAppVersion } = require('./browser-test-helpers.cjs');
const OLD = 'df997cdf1fc37a099ce965c03225426b991d7563';
const ASSETS = ['js/inscription-rules.js', 'js/inscription-paths.js', 'js/inscription-crafting-state.js', 'js/inscription-crafting-ui.js', 'css/inscription-crafting.css'];

async function openServer() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

test('crafting PWA restores pending offline and commits once without changing actual inventory', { timeout: 120000 }, async () => {
  const { server, url } = await openServer();
  let browser, context;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openApp(page, url);
    assert.equal(await page.evaluate(() => Boolean(window.InscriptionRules && window.InscriptionPaths && window.InscriptionCraftingState && window.InscriptionCraftingUI)), true, 'offline crafting runtime must actually be loaded');
    const before = await page.evaluate(() => {
      const store = window.InscriptionCraftingState.createStore(window.QinshiAccounts);
      const material = (quality, origin, terms) => ({ prefix: '天同', dun: '地遁', quality, origin, terms: terms.map(([attr, tier]) => ({ attr, tier })) });
      store.setActual(material('b2', 'wash', [['技能穿透', 'M']]), 7);
      const id = store.saveGoal({ name: '离线三穿', prefix: '天同', dun: '地遁', quality: 'o2', attrs: ['技能穿透', '技能穿透', '技能穿透'] });
      store.copyActual(id);
      const left = material('p2', 'wash', [['技能穿透', 'L'], ['技能穿透', 'H']]);
      const right = material('p2', 'crafted', [['技能穿透', 'M'], ['技能穿透', 'H']]);
      store.addVirtual(id, left, 2);
      store.addVirtual(id, right, 2);
      store.setStage(id, 'p2');
      store.setSelection(id, [window.InscriptionRules.signature(left), window.InscriptionRules.signature(right)]);
      store.roll(id, () => 0);
      const state = store.snapshot();
      return { id, actual: state.actual, pending: state.workspaces[id].pending };
    });
    assert.ok(before.pending);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const cached = await page.evaluate(async assets => {
      const names = await caches.keys();
      const cache = await caches.open(names.find(name => name.startsWith('qinshi-site-')));
      return Promise.all(assets.map(async asset => Boolean(await cache.match(new URL(asset, location.href).href))));
    }, ASSETS);
    assert.deepEqual(cached, [true, true, true, true, true]);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'networkidle' });
    const after = await page.evaluate(id => {
      const store = window.InscriptionCraftingState.createStore(window.QinshiAccounts);
      const restored = store.snapshot();
      const beforeVirtual = JSON.stringify(restored.workspaces[id].inventory);
      store.retry(id, () => 0);
      const retried = store.snapshot();
      const retryUnchanged = JSON.stringify(retried.workspaces[id].inventory) === beforeVirtual;
      const token = retried.workspaces[id].pending.id;
      store.commitPending(id, 'next', token);
      let rejected = false;
      try { store.commitPending(id, 'next', token); } catch (_) { rejected = true; }
      const final = store.snapshot();
      return { restoredPending: restored.workspaces[id].pending, retryUnchanged, rejected,
        actual: final.actual, stage: final.workspaces[id].stage,
        output: final.workspaces[id].inventory.filter(entry => entry.material.quality === 'o1') };
    }, before.id);
    assert.deepEqual(after.restoredPending, before.pending);
    assert.equal(after.retryUnchanged, true);
    assert.equal(after.rejected, true);
    assert.deepEqual(after.actual, before.actual);
    assert.equal(after.stage, 'o1');
    assert.equal(after.output.length, 1);
    assert.equal(after.output[0].quantity, 1);
    assert.deepEqual(after.output[0].material.terms.map(term => [term.attr, term.tier]).sort(), [['技能穿透', 'H'], ['技能穿透', 'L'], ['技能穿透', 'M']]);
  } finally {
    await context?.close();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('installed actual 1.0.61 upgrades to crafting release preserving legacy values and loads new assets offline', { timeout: 120000 }, async () => {
  const old = new Map();
  for (const file of ['index.html', 'service-worker.js', 'version.json', 'js/pwa.js', 'js/partition-loader.js', 'js/inscription.js', 'js/inscription-performance.js']) {
    old.set('/' + file, execFileSync('git', ['-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek', 'show', OLD + ':' + file], { maxBuffer: 16 * 1024 * 1024 }));
  }
  const { server, url } = await openServer();
  const serve = server.listeners('request')[0];
  server.removeListener('request', serve);
  let oldMode = true, browser, context;
  server.on('request', (request, response) => {
    const pathname = new URL(request.url, url).pathname;
    const key = pathname === '/' ? '/index.html' : pathname;
    if (!oldMode || !old.has(key)) return serve(request, response);
    response.writeHead(200, { 'Content-Type': key.endsWith('.js') ? 'text/javascript; charset=utf-8' : key.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(old.get(key));
  });
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await ensureTestAccount(page);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.equal(await page.locator('#pwa-version').innerText(), '1.0.61');
    const legacy = await page.evaluate(() => {
      const raw = JSON.stringify({ '红色神将\u0000神鬼谷盖聂': { name: '神鬼谷盖聂', quality: '红色神将', slots: [
        { tian: '天府', shield: '人遁', quality: '紫色', star: '2', subs: ['技能穿透', '技能穿透', '技能穿透'], subValues: ['+99%', '旧备注', ''] }
      ] } });
      window.QinshiAccounts.setItem('qinshi_inscription_progress_v2', raw);
      window.QinshiAccounts.setItem('qinshi_atlas_target_level_v1', '17');
      return { raw, id: window.QinshiAccounts.currentAccount().id };
    });
    oldMode = false;
    await page.evaluate(() => window.QinshiPWA.checkForUpdate());
    await page.locator('#pwa-update-notice').waitFor({ state: 'visible', timeout: 30000 });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('#pwa-apply-update').click()]);
    assert.equal(await page.locator('#pwa-version').innerText(), currentAppVersion());
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), legacy.id);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_inscription_progress_v2')), legacy.raw);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_atlas_target_level_v1')), '17');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => Boolean(window.InscriptionRules && window.InscriptionPaths && window.InscriptionCraftingState && window.InscriptionCraftingUI)), true);
    const outcomes = await page.evaluate(() => {
      const m = () => ({ prefix: '天机', dun: '鬼遁', quality: 'b2', origin: 'wash', terms: [{ attr: '速', tier: '?' }] });
      return window.InscriptionRules.preview([m(), m()]).outcomes;
    });
    assert.equal(outcomes.length, 9);
    assert.ok(outcomes.every(outcome => outcome.probability === 1 / 9));
    assert.equal(await page.evaluate(() => window.QinshiAccounts.getItem('qinshi_inscription_progress_v2')), legacy.raw);
    const names = await page.evaluate(() => caches.keys());
    assert.ok(names.includes('qinshi-site-' + currentAppVersion()));
    assert.equal(names.includes('qinshi-site-1.0.61'), false);
  } finally {
    await context?.close();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
