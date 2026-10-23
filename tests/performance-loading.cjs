const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
let browser, server, url;
let rejectGallery = false;
let legacyWorker = false;
let holdGallery = false;
let galleryStarted;
const heldGalleryResponses = new Set();
before(async () => {
  server = createServer();
  const serve = server.listeners('request')[0];
  server.removeListener('request', serve);
  server.on('request', (request, response) => {
    if (legacyWorker && request.url.startsWith('/service-worker.js')) {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(`
        self.addEventListener('install', event => event.waitUntil(caches.open('qinshi-site-1.0.56').then(cache => cache.addAll(['./index.html', './images/楼兰/楼兰 (1).png']))));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      `);
    } else if (holdGallery && /images\/(楼兰|棋阵)/.test(decodeURIComponent(request.url))) {
      heldGalleryResponses.add(response);
      if (galleryStarted) galleryStarted();
    } else if (rejectGallery && /images\/(楼兰|棋阵)/.test(decodeURIComponent(request.url))) {
      response.writeHead(503).end('Gallery temporarily unavailable');
    } else serve(request, response);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});

test('indefinitely pending gallery network cannot delay active core fetches', async () => {
  holdGallery = true;
  const context = await browser.newContext();
  const page = await context.newPage();
  let timeout;
  const started = new Promise(resolve => { galleryStarted = resolve; });
  try {
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await Promise.race([started,new Promise((_,reject) => { timeout = setTimeout(() => reject(Error('Gallery did not start')),15000); })]);
    clearTimeout(timeout);
    const result = await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then(async registration => {
        const active = registration.active;
        if (active.state !== 'activated') await new Promise(resolve => active.addEventListener('statechange', () => { if (active.state === 'activated') resolve(); }));
        return fetch('js/query.js').then(response => response.ok ? 'core-ready' : 'http-error');
      }),
      new Promise(resolve => setTimeout(() => resolve('blocked-by-gallery'),1500))
    ]));
    assert.equal(result,'core-ready');
  } finally {
    clearTimeout(timeout);
    holdGallery = false;
    galleryStarted = null;
    for (const response of heldGalleryResponses) response.writeHead(503).end('Released test request');
    heldGalleryResponses.clear();
    await context.close();
  }
});

test('real old-to-new worker update migrates gallery without weakening offline core installation', async () => {
  legacyWorker = true;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20000 });
    legacyWorker = false;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      const update = registration.waiting || registration.installing;
      if (!update) throw Error('Missing update worker');
      if (update.state !== 'installed') await new Promise((resolve, reject) => {
        update.addEventListener('statechange', () => {
          if (update.state === 'installed') resolve();
          if (update.state === 'redundant') reject(Error('Update installation failed'));
        });
      });
      await new Promise(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        update.postMessage({ type: 'SKIP_WAITING' });
      });
    });
    await page.waitForFunction(async () => !(await caches.keys()).includes('qinshi-site-1.0.56'));
    const ready = await page.evaluate(() => new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = event => resolve(event.data);
      navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_GALLERY' }, [channel.port2]);
    }));
    assert.equal(ready.status, 'ready');
    assert.equal(ready.cached, 16);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#partition-atlas').count(),1);
    assert.equal(await page.evaluate(async () => (await fetch('images/楼兰/楼兰 (1).png')).ok),true);
  } finally { legacyWorker = false; await context.close(); }
});

test('real worker installs despite gallery failure, retries full gallery and serves every image offline', async () => {
  rejectGallery = true;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20000 });
    const status = type => page.evaluate(type => new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(Error('Gallery response timeout')), 20000);
      channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
      navigator.serviceWorker.controller.postMessage({ type }, [channel.port2]);
    }), type);
    const partial = await status('PRECACHE_GALLERY');
    assert.equal(partial.status, 'partial');
    await page.waitForFunction(() => /重试/.test(document.getElementById('pwa-gallery-status').textContent));
    assert.match(await page.locator('#pwa-mode-status').textContent(), /核心可离线/);
    assert.doesNotMatch(await page.locator('#pwa-status').textContent(), /全部工具资源/);
    rejectGallery = false;
    const ready = await status('PRECACHE_GALLERY');
    assert.equal(ready.status, 'ready');
    assert.equal(ready.cached, 16);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => /图库.*离线/.test(document.getElementById('pwa-gallery-status').textContent));
    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const cache = await caches.open('qinshi-gallery-v1');
      const keys = await cache.keys();
      return Promise.all(keys.map(async request => (await fetch(request)).ok));
    });
    assert.equal(offline.length, 16);
    assert.ok(offline.every(Boolean));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#partition-atlas').count(), 1);
  } finally { rejectGallery = false; await context.close(); }
});

test('failed partition script can be retried without duplicate successful dependencies', async () => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let unavailable = true;
  await page.route('**/js/machine-beasts-ui.js*', route => unavailable ? route.abort() : route.continue());
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.QinshiPartitionLoader.ensure('machine-beasts').then(() => false, () => true)), true);
    unavailable = false;
    await page.evaluate(() => window.QinshiPartitionLoader.ensure('machine-beasts'));
    assert.equal(await page.locator('script[src*="js/machine-beasts.js"]').count(), 1);
    assert.equal(await page.locator('script[src*="js/machine-beasts-ui.js"]').count(), 1);
  } finally { await context.close(); }
});

test('double-click HTML can demand-load every independent partition without service workers', async () => {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href, { waitUntil: 'load' });
    for (const name of ['tactics', 'formations', 'six-halls', 'machine-beasts', 'battle-box-pill-pouch', 'wooden-man-alley', 'loulan']) {
      await page.evaluate(name => window.QinshiPartitionLoader.ensure(name),name);
    }
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('#partition-loulan img[src]').count(),16);
  } finally { await page.close(); }
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

test('cold start measurements and deferred independent partitions', async () => {
  for (const width of [390, 768, 1100]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    await page.goto(url, { waitUntil: 'networkidle' });
    const measured = await page.evaluate(async () => {
      const resources = performance.getEntriesByType('resource');
      const frames = []; let previous;
      await new Promise(resolve => {
        function frame(now) {
          if (previous) frames.push(now - previous);
          previous = now; window.scrollBy(0, 15);
          if (frames.length >= 30) resolve(); else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      return { resources: resources.length, transferBytes: resources.reduce((n,r) => n + r.transferSize, 0), domReadyMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd, frames, scripts: resources.filter(r => r.initiatorType === 'script').map(r => new URL(r.name).pathname), gallery: [...document.querySelectorAll('#partition-loulan img')].filter(i => i.hasAttribute('src')).length };
    });
    console.log(JSON.stringify({ width, browser: browser.version(), cpuThrottle: 1, samples: 1, ...measured }));
    if (!process.env.MEASURE_BASELINE) {
      assert.equal(measured.gallery, 0);
      assert.ok(!measured.scripts.includes('/js/machine-beasts-ui.js'));
      await page.evaluate(() => window.QinshiPartitionLoader.ensure('loulan'));
      assert.equal(await page.locator('#partition-loulan img[src]').count(), 16);
      await page.evaluate(() => Promise.all([window.QinshiPartitionLoader.ensure('machine-beasts'), window.QinshiPartitionLoader.ensure('machine-beasts')]));
      assert.equal(await page.locator('script[src*="machine-beasts-ui"]').count(), 1);
      if (width <= 1024) assert.ok(await page.evaluate(() => getComputedStyle(document.body).backgroundAttachment.split(',').every(value => value.trim() === 'scroll')));
    }
    await page.close();
  }
});

test('installed core demand-loads modules and executes real calculation workers while fully offline', async () => {
  const { openApp } = require('./browser-test-helpers.cjs');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await openApp(page, url);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('[data-partition="wooden-man-alley"]').click());
    await page.waitForFunction(() => window.QinshiPartitionLoader.isReady('wooden-man-alley'));
    await page.evaluate(() => { window.WOODEN_MAN_ALLEY_PLANNER.planToTarget = () => { throw Error('Main-thread fallback is not allowed by this offline-worker regression'); }; });
    await page.locator('[data-wooden-mode="calculator"]').click();
    await page.locator('[data-wooden-calc-action="calculate"]').click();
    await page.waitForFunction(() => document.querySelector('#wooden-man-calculator').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#wooden-calculation-result').innerText(), /木剑/);
    await page.evaluate(() => document.querySelector('[data-partition="machine-beasts"]').click());
    await page.waitForFunction(() => window.QinshiPartitionLoader.isReady('machine-beasts'));
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('war-demon');
    await page.locator('[data-calc-target]').selectOption('1');
    await page.evaluate(() => { window.MACHINE_BEAST_CORE.calculateInvestmentPlan = () => { throw Error('Main-thread fallback is not allowed by this offline-worker regression'); }; });
    await page.locator('[data-machine-action="calculate"]').click();
    await page.locator('[data-reference-cost-panel="single"]').waitFor();
    assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult.valid), true);
  } finally { await context.close(); }
});
