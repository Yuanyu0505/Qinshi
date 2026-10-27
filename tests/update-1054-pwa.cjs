// Isolated local acceptance test. No production account or external API is used.
// Run: node --test --test-concurrency=1 tests/update-1054-pwa.cjs
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { ensureTestAccount, getAccountItem, getAccountJson } = require('./browser-test-helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const OLD_COMMIT = 'd2736ff';
const NEW_COMMIT = 'a875bdb';
const OLD_VERSION = '1.0.53';
const NEW_VERSION = '1.0.54';
const CACHE_PREFIX = 'qinshi-site-';
const UNRELATED_CACHE = 'update-1054-unrelated-cache';
const PROGRESS_KEY = 'qinshi_six_halls_progress_v1';
const RELEASE_FILES = [
  'index.html', 'js/pwa.js', 'js/inscription.js', 'service-worker.js', 'version.json',
  'data/forbidden.js', 'js/six-halls-ui.js', 'css/six-halls.css'
];
const CACHED_RELEASE_FILES = [
  'index.html', 'js/pwa.js', 'data/forbidden.js', 'js/six-halls-ui.js', 'css/six-halls.css'
];
const NEW_PERIODS = [
  ['2026-11-05_shadow_hunt', '2026-11-05', '2026-11-08', '大', 'shadow_hunt'],
  ['2026-11-09_soul_gathering', '2026-11-09', '2026-11-11', '小', 'soul_gathering'],
  ['2026-11-12_wind_forest_fire_mountain', '2026-11-12', '2026-11-15', '大', 'wind_forest_fire_mountain'],
  ['2026-11-16_yin_yang', '2026-11-16', '2026-11-18', '小', 'yin_yang'],
  ['2026-11-19_song_dance', '2026-11-19', '2026-11-22', '大', 'song_dance'],
  ['2026-11-23_life_and_death', '2026-11-23', '2026-11-25', '小', 'life_and_death'],
  ['2026-11-26_dragon_might', '2026-11-26', '2026-11-29', '大', 'dragon_might'],
  ['2026-11-30_observe_the_depths', '2026-11-30', '2026-12-02', '小', 'observe_the_depths'],
  ['2026-12-03_no_two_suns', '2026-12-03', '2026-12-06', '大', 'no_two_suns']
];

function releaseSnapshots() {
  const old = new Map();
  const current = new Map();
  for (const relative of RELEASE_FILES) {
    old.set(relative, execFileSync('git', [
      '-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek',
      'show', `${OLD_COMMIT}:${relative}`
    ], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
    // This is a historical 1.0.54 regression, not an assertion about today's release.
    current.set(relative, execFileSync('git', [
      '-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek',
      'show', `${NEW_COMMIT}:${relative}`
    ], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
  }
  assert.equal(JSON.parse(old.get('version.json').toString('utf8')).version, OLD_VERSION);
  assert.equal(JSON.parse(current.get('version.json').toString('utf8')).version, NEW_VERSION);
  return { old, current };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml'
  }[extension] || 'application/octet-stream';
}

function localReleaseServer(snapshots) {
  let mode = 'old';
  const requests = [];
  const rootRealPath = fs.realpathSync(ROOT);
  const server = http.createServer((request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) {
        response.writeHead(403).end();
        return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(ROOT, relative);
      const resolvedRelative = path.relative(ROOT, filePath);
      if (!resolvedRelative || resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative) ||
          !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const realRelative = path.relative(rootRealPath, fs.realpathSync(filePath));
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
        response.writeHead(403).end();
        return;
      }
      const servedMode = mode;
      const body = snapshots[servedMode].get(relative) || fs.readFileSync(filePath);
      if (RELEASE_FILES.includes(relative)) requests.push({ relative, mode: servedMode });
      response.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': relative === 'service-worker.js' ? 'no-store' : 'max-age=600'
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 500).end();
    }
  });
  return { server, requests, serveCurrent() { mode = 'current'; } };
}

async function enterPartition(page, name) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator(`#mobile-more-layer [data-partition="${name}"]`).click();
  } else {
    await page.locator(`.tab[data-partition="${name}"]`).click();
  }
  await page.locator(`#partition-${name}`).waitFor({ state: 'visible' });
}

async function sixHallsMode(page, mode) {
  await page.locator(`[data-six-halls-mode="${mode}"]`).click();
  await page.locator(`#six-halls-${mode}`).waitFor({ state: 'visible' });
}

async function forbiddenSnapshot(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.FORBIDDEN_DATA)));
}

function assertNewForbiddenData(data, oldData) {
  assert.equal(data.meta.lastDate, '2026-12-06');
  assert.equal(data.occurrences.length, oldData.occurrences.length + 9);
  assert.deepEqual(data.occurrences.slice(0, oldData.occurrences.length), oldData.occurrences,
    'The update must retain every historical period');
  const added = data.occurrences.slice(oldData.occurrences.length);
  assert.deepEqual(added.map(item => [item.id, item.start, item.end, item.size, item.templateId]), NEW_PERIODS);
  for (const item of added) {
    assert.ok(data.templates[item.templateId], `Missing reward template: ${item.id}`);
    assert.ok(item.disciples.length > 0, `Missing disciples: ${item.id}`);
  }
  assert.deepEqual(added[0].disciples, [
    { name: '秋水晓梦', base: '血', divine: '攻' },
    { name: '龙骧章邯', base: '攻', divine: '攻' }
  ]);
}

async function assertNewSixHalls(page, savedProgress) {
  await enterPartition(page, 'six-halls');
  assert.equal(await page.locator('#partition-six-halls .six-halls-heading').count(), 0);
  assert.equal(await page.locator('#partition-six-halls .six-halls-eyebrow').count(), 0);
  assert.equal(await page.locator('#partition-six-halls h2').count(), 0);
  assert.equal(await page.locator('[data-six-halls-mode]').count(), 3);
  await sixHallsMode(page, 'progress');
  assert.equal(await page.locator('[data-six-halls-progress="herbs"]').inputValue(), '321');
  await sixHallsMode(page, 'planner');
  await page.locator('[data-six-halls-select="kuiwei"]').check();
  await page.locator('[data-six-halls-quick="10"][data-hall-id="kuiwei"]').click();
  await page.locator('[data-six-halls-result-row="kuiwei"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-six-halls-herbs="stock"]').innerText(), '321');
  await sixHallsMode(page, 'reference');
  assert.equal(await page.locator('#six-halls-reference-content tbody tr').count(), 50);
  await sixHallsMode(page, 'progress');
  assert.equal(await getAccountItem(page, PROGRESS_KEY), savedProgress,
    'Switching pages and calculating must not rewrite persisted progress');
}

async function assertCachedRelease(page, snapshots) {
  await page.waitForFunction(async ({ prefix, expected, unrelated }) => {
    const names = await caches.keys();
    const appNames = names.filter(name => name.startsWith(prefix));
    return appNames.length === 1 && appNames[0] === expected && names.includes(unrelated);
  }, { prefix: CACHE_PREFIX, expected: CACHE_PREFIX + NEW_VERSION, unrelated: UNRELATED_CACHE });
  const stored = await page.evaluate(async ({ cacheName, files, unrelated }) => {
    const cache = await caches.open(cacheName);
    const filesByName = {};
    for (const file of files) {
      const response = await cache.match(new URL(file, location.href).href, { ignoreSearch: true });
      filesByName[file] = response ? await response.text() : null;
    }
    const unrelatedCache = await caches.open(unrelated);
    const sentinel = await unrelatedCache.match(new URL('pwa-test-sentinel', location.href).href);
    return { filesByName, sentinel: sentinel ? await sentinel.text() : null };
  }, { cacheName: CACHE_PREFIX + NEW_VERSION, files: CACHED_RELEASE_FILES, unrelated: UNRELATED_CACHE });
  for (const file of CACHED_RELEASE_FILES) {
    assert.equal(stored.filesByName[file], snapshots.current.get(file).toString('utf8'),
      `New offline cache must contain the actual 1.0.54 file: ${file}`);
  }
  assert.equal(stored.sentinel, 'keep-unrelated-cache');
}

test('真实 1.0.53 升级到 1.0.54 后更新禁地与六堂，并离线保留进度', { timeout: 120000 }, async () => {
  const snapshots = releaseSnapshots();
  const local = localReleaseServer(snapshots);
  let browser;
  let context;
  try {
    await new Promise((resolve, reject) => {
      local.server.once('error', reject);
      local.server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${local.server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    context = await browser.newContext({
      serviceWorkers: 'allow', timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1000 }
    });
    context.setDefaultTimeout(15000);
    // Only this fresh local origin is allowed; no real account or cloud endpoint is reachable.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-22T04:00:00.000Z'));
    await page.goto(origin, { waitUntil: 'networkidle' });
    await ensureTestAccount(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const oldReload = await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.equal(oldReload.fromServiceWorker(), true);
    assert.equal(await page.locator('#pwa-version').textContent(), OLD_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiPWA.version), OLD_VERSION);
    assert.deepEqual(await page.evaluate(async () => (await caches.keys())
      .filter(name => name.startsWith('qinshi-site-'))), [CACHE_PREFIX + OLD_VERSION]);
    await page.evaluate(async name => {
      const cache = await caches.open(name);
      await cache.put(new URL('pwa-test-sentinel', location.href).href, new Response('keep-unrelated-cache'));
    }, UNRELATED_CACHE);

    await enterPartition(page, 'six-halls');
    assert.equal(await page.locator('#partition-six-halls .six-halls-heading').count(), 1);
    assert.match(await page.locator('#partition-six-halls .six-halls-eyebrow').innerText(), /SIX\s+HALLS/);
    assert.equal(await page.locator('#partition-six-halls .six-halls-heading h2').innerText(), '六堂');
    await page.locator('[data-six-halls-progress="herbs"]').fill('321');
    await page.waitForFunction(key => {
      const raw = window.QinshiAccounts.getItem(key);
      return raw !== null && JSON.parse(raw).herbs === 321;
    }, PROGRESS_KEY);
    const savedProgress = await getAccountItem(page, PROGRESS_KEY);
    const accountId = await page.evaluate(() => window.QinshiAccounts.currentAccount().id);
    assert.equal((await getAccountJson(page, PROGRESS_KEY)).herbs, 321);
    const oldData = await forbiddenSnapshot(page);
    assert.equal(oldData.meta.lastDate, '2026-11-04');
    assert.equal(oldData.occurrences.length, 28);
    await enterPartition(page, 'forbidden');
    await page.locator('[data-forbidden-card="2026-10-22_wind_forest_fire_mountain"]')
      .waitFor({ state: 'visible' });

    local.serveCurrent();
    await page.evaluate(() => window.QinshiPWA.checkForUpdate());
    await page.locator('#pwa-update-notice').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('#pwa-version').textContent(), OLD_VERSION,
      'The old page must remain active until the real update button is clicked');
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state),
      'installed');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.locator('#pwa-apply-update').click()
    ]);
    await page.waitForFunction(version => window.QinshiPWA?.version === version &&
      document.querySelector('#pwa-version')?.textContent === version, NEW_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), accountId);
    const updatedData = await forbiddenSnapshot(page);
    assertNewForbiddenData(updatedData, oldData);
    await assertNewSixHalls(page, savedProgress);
    await enterPartition(page, 'forbidden');
    await page.locator('#forbidden-search').fill('12.3');
    const finalCard = page.locator('[data-forbidden-card="2026-12-03_no_two_suns"]');
    await finalCard.waitFor({ state: 'visible' });
    await finalCard.locator('[data-forbidden-expand]').click();
    assert.ok(await finalCard.locator('.forbidden-reward-section').count() > 0);
    await assertCachedRelease(page, snapshots);
    for (const relative of RELEASE_FILES) {
      assert.ok(local.requests.some(item => item.relative === relative && item.mode === 'old'),
        `The old release file must really be served: ${relative}`);
      assert.ok(local.requests.some(item => item.relative === relative && item.mode === 'current'),
        `The current release file must really be served: ${relative}`);
    }

    await context.setOffline(true);
    const offlineReload = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(offlineReload.fromServiceWorker(), true, 'Offline navigation must come from the installed SW');
    await page.waitForFunction(version => window.QinshiPWA?.version === version, NEW_VERSION);
    assert.equal(await page.locator('#pwa-version').textContent(), NEW_VERSION);
    assert.equal(await page.evaluate(() => window.QinshiAccounts.currentAccount().id), accountId);
    const offlineData = await forbiddenSnapshot(page);
    assertNewForbiddenData(offlineData, oldData);
    assert.deepEqual(offlineData, updatedData);
    await assertNewSixHalls(page, savedProgress);
    await enterPartition(page, 'forbidden');
    await page.locator('#forbidden-search').fill('11.5');
    await page.locator('[data-forbidden-card="2026-11-05_shadow_hunt"]').waitFor({ state: 'visible' });
    await assertCachedRelease(page, snapshots);
    assert.deepEqual(pageErrors, [], 'Old, updated and offline pages must not throw runtime errors');
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    if (local.server.listening) await new Promise(resolve => local.server.close(resolve));
  }
});
