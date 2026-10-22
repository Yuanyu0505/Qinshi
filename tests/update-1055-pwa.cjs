// Fixed historical 1.0.54 -> 1.0.55 regression, using an isolated local origin only.
// node --test --test-concurrency=1 tests/update-1055-pwa.cjs
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { ensureTestAccount, getAccountItem, getAccountJson } = require('./browser-test-helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const OLD_COMMIT = 'a875bdb';
const NEW_COMMIT = '8f0d9c7';
const OLD_VERSION = '1.0.54';
const NEW_VERSION = '1.0.55';
const KEY = 'qinshi_machine_beasts_progress_v1';
const PREFIX = 'qinshi-site-';
const UNRELATED = 'update-1055-unrelated-cache';
const BUSINESS_FILES = [
  'data/machine-beasts.js', 'js/machine-beasts.js', 'js/machine-beasts-ui.js',
  'js/machine-beast-school-planner.js', 'css/style.css'
];
const RELEASE_FILES = ['index.html', 'js/pwa.js', 'service-worker.js', 'version.json', ...BUSINESS_FILES];

function releaseSnapshots() {
  const old = new Map();
  const current = new Map();
  for (const relative of RELEASE_FILES) {
    old.set(relative, execFileSync('git', [
      '-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek', 'show', `${OLD_COMMIT}:${relative}`
    ], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
    current.set(relative, execFileSync('git', [
      '-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek', 'show', `${NEW_COMMIT}:${relative}`
    ], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
  }
  assert.equal(JSON.parse(old.get('version.json').toString('utf8')).version, OLD_VERSION);
  assert.equal(JSON.parse(current.get('version.json').toString('utf8')).version, NEW_VERSION);
  return { old, current };
}

function localReleaseServer(snapshots) {
  let mode = 'old';
  const requests = [];
  const rootRealPath = fs.realpathSync(ROOT);
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'
  };
  const server = http.createServer((request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
        response.writeHead(403).end(); return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(ROOT, relative);
      const resolvedRelative = path.relative(ROOT, filePath);
      if (!resolvedRelative || resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative) ||
          !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404).end(); return;
      }
      const realRelative = path.relative(rootRealPath, fs.realpathSync(filePath));
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        response.writeHead(403).end(); return;
      }
      const servedMode = mode;
      const body = snapshots[servedMode].get(relative) || fs.readFileSync(filePath);
      if (RELEASE_FILES.includes(relative)) requests.push({ relative, mode: servedMode });
      response.writeHead(200, {
        'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': relative === 'service-worker.js' ? 'no-store' : 'max-age=600'
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) { response.writeHead(error instanceof URIError ? 400 : 500).end(); }
  });
  return { server, requests, serveCurrent() { mode = 'current'; } };
}

async function enterBeasts(page) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
  } else await page.locator('.tab[data-partition="machine-beasts"]').click();
  await page.locator('#partition-machine-beasts').waitFor({ state: 'visible' });
}

async function assertProgressUI(page) {
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.locator('[data-machine-action="edit-progress"][data-beast-id="war-demon"]').click();
  assert.equal(await page.locator('[data-edit-field="research"]').inputValue(), '12345');
  assert.equal(await page.locator('[data-edit-field="fragments"]').inputValue(), '13');
  await page.locator('[data-machine-action="cancel-progress"]').click();
}

async function assertNewUI(page) {
  await enterBeasts(page);
  await page.locator('[data-machine-beast-mode="reference"]').click();
  assert.match(await page.locator('[data-machine-material-sources]').textContent(), /青铜螺栓设计图[\s\S]*53-9/);
  assert.match(await page.locator('[data-machine-material-sources]').textContent(), /幻音宝盒[\s\S]*不参与计算/);
  assert.match((await page.locator('.machine-beast-source').allTextContents()).join(' '), /获取来源/);
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').waitFor({ state: 'visible' });
}

async function assertCache(page, snapshots) {
  await page.waitForFunction(async ({ prefix, expected, unrelated }) => {
    const names = await caches.keys();
    const app = names.filter(name => name.startsWith(prefix));
    return app.length === 1 && app[0] === expected && names.includes(unrelated);
  }, { prefix: PREFIX, expected: PREFIX + NEW_VERSION, unrelated: UNRELATED });
  const cached = await page.evaluate(async ({ name, files, unrelated }) => {
    const cache = await caches.open(name);
    const bodies = {};
    for (const file of files) {
      const response = await cache.match(new URL(file, location.href).href, { ignoreSearch: true });
      bodies[file] = response ? await response.text() : null;
    }
    const other = await caches.open(unrelated);
    const sentinel = await other.match(new URL('pwa-test-sentinel', location.href).href);
    return { bodies, sentinel: sentinel ? await sentinel.text() : null };
  }, { name: PREFIX + NEW_VERSION, files: BUSINESS_FILES, unrelated: UNRELATED });
  for (const file of BUSINESS_FILES) {
    assert.equal(cached.bodies[file], snapshots.current.get(file).toString('utf8'), `Actual working release cache: ${file}`);
  }
  assert.equal(cached.sentinel, 'keep-unrelated-cache');
}

test('真实 1.0.54 升级至 1.0.55 后机关兽来源与成本可用，账号及新旧进度离线保留', { timeout: 120000 }, async () => {
  const snapshots = releaseSnapshots();
  const local = localReleaseServer(snapshots);
  let browser, context;
  try {
    await new Promise((resolve, reject) => {
      local.server.once('error', reject);
      local.server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${local.server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1440, height: 1000 } });
    context.setDefaultTimeout(15000);
    // Fresh context, temporary local account, no production service or external origin.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    await ensureTestAccount(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const oldReload = await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.equal(oldReload.fromServiceWorker(), true);
    assert.equal(await page.locator('#pwa-version').textContent(), OLD_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiPWA.version), OLD_VERSION);
    assert.deepEqual(await page.evaluate(async prefix => (await caches.keys()).filter(name => name.startsWith(prefix)), PREFIX), [PREFIX + OLD_VERSION]);
    await enterBeasts(page);
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    assert.equal(await page.locator('[data-reference-cost-field]').count(), 0, 'Historical UI must not already have new cost controls');
    await page.locator('[data-machine-beast-mode="progress"]').click();
    await page.locator('[data-machine-action="edit-progress"][data-beast-id="war-demon"]').click();
    await page.locator('[data-edit-field="research"]').fill('12345');
    await page.locator('[data-edit-field="fragments"]').fill('13');
    await page.locator('[data-machine-action="save-progress"][data-beast-id="war-demon"]').click();
    await page.waitForFunction(key => JSON.parse(window.QinshiAccounts.getItem(key) || '{}').beasts?.['war-demon']?.research === 12345, KEY);
    const oldRaw = await getAccountItem(page, KEY);
    const oldBeasts = (await getAccountJson(page, KEY)).beasts;
    const accountId = await page.evaluate(() => window.QinshiAccounts.currentAccount().id);
    await page.evaluate(async name => {
      const cache = await caches.open(name);
      await cache.put(new URL('pwa-test-sentinel', location.href).href, new Response('keep-unrelated-cache'));
    }, UNRELATED);

    local.serveCurrent();
    await page.evaluate(() => window.QinshiPWA.checkForUpdate());
    await page.locator('#pwa-update-notice').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('#pwa-version').textContent(), OLD_VERSION);
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state), 'installed');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.locator('#pwa-apply-update').click()
    ]);
    await page.waitForFunction(version => window.QinshiPWA?.version === version &&
      document.querySelector('#pwa-version')?.textContent === version, NEW_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), accountId);
    assert.equal(await getAccountItem(page, KEY), oldRaw, 'Upgrade alone must not rewrite old progress');
    await assertNewUI(page);
    await assertProgressUI(page);
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('11');
    await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
    await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').uncheck();
    await page.locator('.machine-reference-beast-prices summary').click();
    await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('123.5');
    await page.locator('[data-machine-action="save-reference-cost"]').click();
    const saved = await getAccountJson(page, KEY);
    assert.deepEqual(saved.beasts, oldBeasts, 'New settings save must retain every historical beast field');
    assert.equal(saved.referenceCost.awakeningBlueprintStock, 11);
    assert.equal(saved.referenceCost.awakeningBlueprintPrice, 64);
    assert.equal(saved.referenceCost.useAwakeningBlueprintStock, false);
    assert.equal(saved.referenceCost.beastPrices['mechanical-wing'], 123.5);
    await page.locator('[data-calc-beast]').selectOption('war-demon');
    await page.locator('[data-calc-target]').selectOption('1');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.locator('[data-reference-cost-panel="single"] [data-reference-cost-total]').waitFor({ state: 'visible' });
    await assertCache(page, snapshots);
    for (const relative of RELEASE_FILES) {
      for (const mode of ['old', 'current']) assert.ok(local.requests.some(item => item.relative === relative && item.mode === mode), `${mode} release really served ${relative}`);
    }

    await context.setOffline(true);
    const offlineReload = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(offlineReload.fromServiceWorker(), true);
    assert.equal(await page.locator('#pwa-version').textContent(), NEW_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiPWA.version), NEW_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), accountId);
    assert.deepEqual(await getAccountJson(page, KEY), saved);
    await assertNewUI(page);
    assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').inputValue(), '11');
    assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '64');
    assert.equal(await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').isChecked(), false);
    await page.locator('.machine-reference-beast-prices summary').click();
    assert.equal(await page.locator('[data-reference-beast-price="mechanical-wing"]').inputValue(), '123.5');
    await assertProgressUI(page);
    await assertCache(page, snapshots);
    assert.deepEqual(await getAccountJson(page, KEY), saved);
    assert.deepEqual(errors, []);
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (local.server.listening) await new Promise(resolve => local.server.close(resolve));
  }
});
