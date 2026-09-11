const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE;
const ROOT = path.resolve(__dirname, '..');

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

if (!playwrightPath) {
  test('PWA 真实浏览器升级验收需要 PLAYWRIGHT_MODULE', { skip: true }, () => {});
} else {
  const { chromium } = require(playwrightPath);

  test('已安装旧版能在当前页面发现、应用并切换到新版', async () => {
    let servedVersion = '1.0.37';
    const serverRequests = [];
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(ROOT, relative);
      if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404).end();
        return;
      }
      let body = fs.readFileSync(filePath);
      if (['index.html', 'js/pwa.js', 'service-worker.js'].includes(relative)) {
        body = Buffer.from(body.toString('utf8').replaceAll('1.0.38', servedVersion));
      }
      if (['index.html', 'js/pwa.js', 'service-worker.js'].includes(relative)) {
        serverRequests.push({ relative, servedVersion });
      }
      response.writeHead(200, {
        'Content-Type': contentType(filePath),
        'Cache-Control': relative === 'service-worker.js' ? 'no-store' : 'max-age=600'
      });
      response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const browserResponses = [];
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname === '/' || pathname.endsWith('/index.html') || pathname.endsWith('/js/pwa.js')) {
        browserResponses.push({ pathname, fromServiceWorker: response.fromServiceWorker() });
      }
    });
    try {
      await page.addInitScript(() => {
        sessionStorage.setItem('pwaTestLoads', String(Number(sessionStorage.getItem('pwaTestLoads') || 0) + 1));
        navigator.serviceWorker?.addEventListener('controllerchange', () => {
          sessionStorage.setItem('pwaTestControllerChanges', String(Number(sessionStorage.getItem('pwaTestControllerChanges') || 0) + 1));
        });
      });
      await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      assert.equal(await page.locator('#pwa-version').innerText(), '1.0.37');

      servedVersion = '1.0.38';
      await page.evaluate(() => window.QinshiPWA.checkForUpdate());
      await page.locator('#pwa-update-notice').waitFor({ state: 'visible' });
      await page.locator('#pwa-apply-update').click();
      await page.waitForTimeout(2000);
      const updateState = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          version: document.querySelector('#pwa-version')?.textContent,
          controller: navigator.serviceWorker.controller?.scriptURL || null,
          active: registration?.active?.state || null,
          waiting: registration?.waiting?.state || null,
          installing: registration?.installing?.state || null,
          caches: await caches.keys(),
          status: document.querySelector('#pwa-status')?.textContent,
          loads: sessionStorage.getItem('pwaTestLoads'),
          controllerChanges: sessionStorage.getItem('pwaTestControllerChanges'),
          navigation: performance.getEntriesByType('navigation').map(entry => ({ name: entry.name, type: entry.type }))
        };
      });
      assert.equal(updateState.version, '1.0.38', JSON.stringify({ updateState, serverRequests, browserResponses }));
    } finally {
      await context.close();
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
}
