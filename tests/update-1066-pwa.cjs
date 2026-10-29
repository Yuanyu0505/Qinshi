// Real Pages artifacts on an isolated loopback origin; no production data or APIs.
// PLAYWRIGHT_MODULE=<playwright path> node --test --test-concurrency=1 tests/update-1066-pwa.cjs
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { ensureTestAccount } = require('./browser-test-helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
// Default preserves the original regression; later releases can exercise the
// immediately preceding real artifact without duplicating the entire harness.
const OLD_COMMIT = process.env.QINSHI_PWA_BASE_REF || '46ece3c';
const OLD_VERSION = JSON.parse(git(['show', OLD_COMMIT + ':version.json']).toString('utf8')).version;
const PREFIX = 'qinshi-site-';
const PROGRESS = 'qinshi_inscription_progress_v2';
const CRAFTING = 'qinshi_inscription_crafting_v1';
const FAVORITES = 'qinshi_inscription_route_favorites_v1';
const NEW_ASSETS = [
  'css/formation-search.css', 'css/inscription-route-favorites.css',
  'data/2026-10-inscription-update.js', 'js/inscription-progress-rules.js',
  'js/inscription-route-favorites.js', 'js/inscription-flow-model.js'
];
let artifacts;

function git(args) {
  return execFileSync('git', ['-c', 'safe.directory=' + ROOT.replaceAll('\\', '/'), ...args], {
    cwd: ROOT, maxBuffer: 32 * 1024 * 1024
  });
}

function buildPages(directory, commit) {
  const workflow = commit ? git(['show', commit + ':.github/workflows/pages.yml']).toString('utf8')
    : fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  for (const line of workflow.split(/\r?\n/).filter(value => /^\s*cp\s/.test(value))) {
    const parts = line.trim().split(/\s+/), destination = parts.pop();
    assert.match(destination, /^_site\//);
    const target = path.join(directory, destination.slice('_site/'.length));
    fs.mkdirSync(target, { recursive: true });
    for (const source of parts.slice(1).filter(value => !value.startsWith('-'))) {
      if (!commit) {
        fs.cpSync(path.join(ROOT, source), path.join(target, path.posix.basename(source)), { recursive: parts.includes('-R') || parts.includes('-r') });
        continue;
      }
      const files = git(['ls-tree', '-r', '--name-only', '-z', commit, '--', source]).toString('utf8').split('\0').filter(Boolean);
      assert.ok(files.length, 'Historical Pages source must exist: ' + source);
      for (const file of files) {
        const relative = file === source ? path.posix.basename(source)
          : path.posix.join(path.posix.basename(source), path.posix.relative(source, file));
        const output = path.join(target, relative);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, git(['show', commit + ':' + file]));
      }
    }
  }
}

function releases() {
  if (artifacts) return artifacts;
  const parent = path.join(ROOT, 'test-results', '1066-site');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'run-'));
  const current = path.join(directory, 'current'), old = path.join(directory, 'old');
  buildPages(current);
  buildPages(old, OLD_COMMIT);
  const version = JSON.parse(fs.readFileSync(path.join(current, 'version.json'), 'utf8')).version;
  assert.notEqual(version, OLD_VERSION, 'The release version must change before upgrade acceptance');
  assert.equal(JSON.parse(fs.readFileSync(path.join(old, 'version.json'), 'utf8')).version, OLD_VERSION);
  artifacts = { directory, current, old, version };
  console.log('1066 Pages artifacts:', directory, OLD_VERSION + ' -> ' + version);
  return artifacts;
}

function artifactServer(sites, initialMode) {
  let mode = initialMode;
  const requests = [];
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp' };
  const server = http.createServer((request, response) => {
    let relative = request.url;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const root = sites[mode], file = path.resolve(root, relative), within = path.relative(root, file);
      if (!['GET', 'HEAD'].includes(request.method) || pathname.includes('\\') || pathname.includes('\0') ||
          within.startsWith('..') || path.isAbsolute(within)) {
        requests.push({ mode, relative, status: 403 }); response.writeHead(403).end(); return;
      }
      // No repository fallback: absent artifact files are real deployment failures.
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        requests.push({ mode, relative, status: 404 }); response.writeHead(404).end(); return;
      }
      requests.push({ mode, relative, status: 200 });
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(file));
    } catch (error) {
      requests.push({ mode, relative, status: 500, error: error.message }); response.writeHead(500).end();
    }
  });
  return { server, requests, current() { mode = 'current'; } };
}

async function installed(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
}

async function assertPrecached(page, sites) {
  const contents = await page.evaluate(async ({ name, assets }) => {
    const cache = await caches.open(name), result = {};
    for (const asset of assets) {
      // Exact unversioned keys prove install-time caching, not a warmed ?v= runtime response.
      const response = await cache.match(new URL(asset, location.href).href);
      result[asset] = response ? await response.text() : null;
    }
    return result;
  }, { name: PREFIX + sites.version, assets: NEW_ASSETS });
  for (const asset of NEW_ASSETS) assert.equal(contents[asset], fs.readFileSync(path.join(sites.current, asset), 'utf8'), 'Actual artifact must be precached before feature entry: ' + asset);
}

async function enter(page, partition) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="' + partition + '"]').click();
  } else await page.locator('.tab[data-partition="' + partition + '"]').click();
  await page.locator('#partition-' + partition).waitFor({ state: 'visible' });
}

async function offlineFeatures(page, beforeCount) {
  const weapons = await page.evaluate(() => window.SPECIAL_EQUIPMENT_DATA.items
    .filter(item => ['神兵焚天钺', '神兵青岚刀', '神兵听潮笛'].includes(item.name))
    .map(item => item.name).sort());
  assert.deepEqual(weapons, ['神兵听潮笛', '神兵焚天钺', '神兵青岚刀'].sort(), 'New weapons remain available offline after installation/upgrade');
  assert.equal(await page.evaluate(() => Boolean(window.InscriptionProgressRules && window.InscriptionRouteFavorites)), true);
  assert.equal(await page.evaluate(() => window.INSCRIPTION_DATA.items.filter(item => item.name === '神镜仙端木蓉').length), 1);
  await enter(page, 'inscription');
  await page.locator('[data-mode="progress"]').click();
  await page.locator('#ins-progress-search').fill('神镜仙端木蓉');
  await page.locator('#ins-progress-suggestions .ins-suggestion').filter({ hasText: '神镜仙端木蓉' }).waitFor();
  await page.locator('[data-mode="crafting-favorites"]').click();
  const favorites = page.locator('#inscription-crafting-favorites');
  await favorites.locator('[data-favorite-count]').waitFor();
  assert.equal(await favorites.locator('.craft-favorite-route').count(), beforeCount);
  await page.locator('[data-mode="crafting-paths"]').click();
  const query = page.locator('#inscription-crafting-paths');
  await query.locator('[data-craft-field="quality"]').selectOption('p1');
  await query.locator('[data-craft-field="dun"]').selectOption('鬼遁');
  for (let index = 0; index < 2; index++) await query.locator('[data-craft-field="attr"]').nth(index).selectOption('速');
  await query.locator('[data-craft-action="generate"]').click();
  await query.locator('.craft-strategy').first().waitFor();
  await query.locator('[data-craft-action="toggle-favorite"]').first().click();
  await page.waitForFunction(({ key, count }) => JSON.parse(window.QinshiAccounts.getItem(key)).entries.length === count, { key: FAVORITES, count: beforeCount + 1 });
  await page.locator('[data-mode="crafting-favorites"]').click();
  assert.equal(await favorites.locator('.craft-favorite-route').count(), beforeCount + 1);
  assert.equal(await favorites.locator('.craft-favorite-invalid').count(), 0);
  await favorites.locator('.craft-favorite-route summary').first().click();
  await favorites.locator('[data-flow-viewer] svg').first().waitFor({ state: 'visible' });
  await enter(page, 'formations');
  const formation = await page.evaluate(() => ({ name: window.FORMATIONS_DATA.items[0].name, id: window.FORMATIONS_DATA.items[0].id }));
  await page.locator('#formation-search').fill(formation.name);
  await page.locator('#formation-search-results [data-formation-id]').filter({ hasText: formation.name }).first().waitFor();
  assert.ok(await page.locator('#formation-search-results [data-formation-id]').count());
  await page.locator('#formation-search-results [data-formation-id]').first().click();
  await page.locator('#formation-workspace').waitFor({ state: 'visible' });
  return page.evaluate(key => window.QinshiAccounts.getItem(key), FAVORITES);
}

async function seedOldData(page) {
  return page.evaluate(({ progressKey, craftingKey, favoriteKey }) => {
    const accounts = window.QinshiAccounts, id = accounts.currentAccount().id;
    const raw = JSON.stringify({ '红色神将\u0000神鬼谷盖聂': { name: '神鬼谷盖聂', quality: '红色神将', slots: [
      { tian: '天府', shield: '人遁', quality: '紫色', star: '2', subs: ['技能穿透', '技能穿透', '技能穿透'], subValues: ['+99%', '1066旧备注', ''] }
    ] } });
    accounts.setItem(progressKey, raw);
    const store = window.InscriptionCraftingState.createStore(accounts);
    const goalId = store.saveGoal({ name: '1066保留旧目标', prefix: '天同', dun: '地遁', quality: 'o2', attrs: ['技能穿透', '技能穿透', '技能穿透'] });
    store.setActual({ prefix: '天府', dun: '鬼遁', quality: 'b2', origin: 'wash', terms: [{ attr: '速', tier: '?' }] }, 7);
    store.copyActual(goalId);
    const stamp = '2026-10-28T12:00:00.000Z';
    // Preload an account-scoped raw record and prove the upgrade preserves it.
    const favorite = JSON.stringify({ schemaVersion: 1, accountId: id, revision: 3, updatedAt: stamp, entries: [{
      id: '1066-preserved-raw-favorite', createdAt: stamp, updatedAt: stamp, rulesVersion: 'pre-release-fixture',
      owner: { discipleKey: '', tian: '', dun: '地遁', quality: 'o1', attrs: ['技能穿透', '技能穿透', '闪避'] }, xAttr: '招架',
      route: { kind: 'deterministic', tree: { kind: 'wash', promotion: null, children: [], material: {
        prefix: '天府', dun: '地遁', quality: 'o1', origin: 'wash', terms: [{ attr: '技能穿透', tier: 'H' }, { attr: '技能穿透', tier: 'L' }, { attr: '闪避', tier: 'U' }]
      } }, reuse: [] }
    }] });
    accounts.setItem(favoriteKey, favorite);
    return { id, raw, favorite, crafting: accounts.getItem(craftingKey), snapshot: store.snapshot() };
  }, { progressKey: PROGRESS, craftingKey: CRAFTING, favoriteKey: FAVORITES });
}

async function scenario(label, initialMode, width, exercise) {
  const sites = releases(), local = artifactServer(sites, initialMode);
  const evidence = { label, version: sites.version, pagesArtifact: sites.current, requests: local.requests, pageErrors: [], failedAssets: [], phase: 'starting' };
  let browser, context, page;
  try {
    await new Promise((resolve, reject) => { local.server.once('error', reject); local.server.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + local.server.address().port;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({ viewport: { width, height: 1024 }, serviceWorkers: 'allow', timezoneId: 'Asia/Shanghai' });
    context.setDefaultTimeout(20000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
    page = await context.newPage();
    page.on('pageerror', error => evidence.pageErrors.push(error.message));
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (/\.(?:js|css|html|webmanifest)$/.test(url.pathname) && !url.pathname.endsWith('/service-worker.js')) evidence.failedAssets.push({ url: url.pathname, error: request.failure()?.errorText });
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await installed(page);
    await exercise({ sites, local, page, context, evidence });
    assert.deepEqual(evidence.pageErrors, [], 'No runtime errors on old, new, or offline pages');
    assert.deepEqual(evidence.failedAssets, [], 'Offline feature assets must be served successfully');
    assert.deepEqual(local.requests.filter(request => request.status >= 400 && request.relative !== 'favicon.ico'), [], 'Artifact-only server must not hide missing release files');
    evidence.phase = 'passed';
  } catch (error) {
    evidence.error = error.stack;
    if (page && !page.isClosed()) {
      evidence.worker = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { active: registration?.active?.state, waiting: registration?.waiting?.state, installing: registration?.installing?.state, caches: await caches.keys() };
      }).catch(diagnostic => ({ error: diagnostic.message }));
      await page.screenshot({ path: path.join(sites.directory, label + '-failure.png'), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await context?.close();
    await browser?.close();
    if (local.server.listening) await new Promise(resolve => local.server.close(resolve));
    const file = path.join(sites.directory, label + '-evidence.json');
    fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
    console.log(label + ' evidence:', file, 'phase=' + evidence.phase);
  }
}

test('fresh Pages PWA precaches new assets before first feature entry and runs new features offline on mobile', { timeout: 180000 }, async () => {
  await scenario('fresh-mobile', 'current', 390, async ({ sites, page, context, evidence }) => {
    evidence.phase = 'cold-install-cache';
    await assertPrecached(page, sites); // Before account creation/reload or entry into any new feature.
    await ensureTestAccount(page);
    await context.setOffline(true);
    evidence.phase = 'first-offline-entry';
    const response = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(response.fromServiceWorker(), true);
    const saved = await offlineFeatures(page, 0);
    const reloaded = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(reloaded.fromServiceWorker(), true);
    assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), FAVORITES), saved, 'Offline-created favorite persists after reload');
    assert.deepEqual(await page.evaluate(() => caches.keys()).then(names => names.filter(name => name.startsWith(PREFIX))), [PREFIX + sites.version]);
  });
});

test('actual '+OLD_VERSION+' Pages installation upgrades to the current artifact preserving account raw data and offline favorites', { timeout: 180000 }, async () => {
  await scenario('upgrade-tablet', 'old', 900, async ({ sites, local, page, context, evidence }) => {
    await ensureTestAccount(page);
    const oldResponse = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(oldResponse.fromServiceWorker(), true);
    assert.equal(await page.evaluate(() => window.QinshiPWA.version), OLD_VERSION);
    const old = await seedOldData(page);
    evidence.phase = 'real-upgrade';
    local.current();
    await page.evaluate(() => window.QinshiPWA.checkForUpdate());
    await page.locator('#pwa-update-notice').waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
    await assertPrecached(page, sites); // New worker install, before activation can warm any query URLs.
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.locator('#pwa-apply-update').click()]);
    assert.equal(await page.evaluate(() => window.QinshiPWA.version), sites.version);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), old.id);
    for (const [key, raw] of [[PROGRESS, old.raw], [CRAFTING, old.crafting], [FAVORITES, old.favorite]]) {
      assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), key), raw, 'Upgrade must preserve raw account value: ' + key);
    }
    await page.waitForFunction(name => caches.keys().then(names => names.filter(value => value.startsWith('qinshi-site-')).join(',') === name), PREFIX + sites.version);
    for (const mode of ['old', 'current']) for (const asset of ['index.html', 'service-worker.js', 'version.json', 'js/inscription.js']) {
      assert.ok(local.requests.some(request => request.mode === mode && request.relative === asset && request.status === 200), mode + ' must really serve ' + asset);
    }
    await context.setOffline(true);
    evidence.phase = 'upgraded-offline-features';
    const response = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(response.fromServiceWorker(), true);
    const saved = await offlineFeatures(page, 1);
    assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), PROGRESS), old.raw);
    const current = await page.evaluate(() => window.InscriptionCraftingState.createStore(window.QinshiAccounts).snapshot());
    for (const key of ['goals', 'actual', 'workspaces']) assert.deepEqual(current[key], old.snapshot[key], 'Offline queries must retain legacy ' + key);
    assert.deepEqual(JSON.parse(saved).entries.find(entry => entry.id === '1066-preserved-raw-favorite'), JSON.parse(old.favorite).entries[0]);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(key => window.QinshiAccounts.getItem(key), FAVORITES), saved);
    assert.deepEqual(await page.evaluate(() => caches.keys()).then(names => names.filter(name => name.startsWith(PREFIX))), [PREFIX + sites.version]);
  });
});
