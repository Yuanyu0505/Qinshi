const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let browser, server, origin;
const baselineCss = execFileSync('git', ['-c', 'safe.directory=C:/Users/pghyl/Desktop/deepseek', 'show', 'd4fca26900a76a498124eee42c3935078a183288:css/style.css'], { maxBuffer: 4 * 1024 * 1024 });
before(async () => {
  server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

for (const width of [360, 768]) {
  test(width + ' real long equipment list scrolling compares old and current CSS under page CPU4x', async () => {
    const rows = [];
    for (const baseline of [true, false]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      if (baseline) await context.route('**/css/style.css*', route => route.fulfill({ contentType: 'text/css', body: baselineCss }));
      const page = await context.newPage();
      try {
        await openApp(page, origin);
        await page.evaluate(() => document.querySelector('[data-partition="equipment"]').click());
        await page.locator('#category-filter button[data-category="神兵武器"]').click();
        assert.ok(await page.locator('#cards .card').count() > 20);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const measured = await page.evaluate(async () => {
          const samples = [];
          for (let sample = 0; sample < 3; sample++) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const frames = [], positions = [], longTasks = [];
            const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)));
            observer.observe({ type: 'longtask', buffered: false });
            let previous;
            await new Promise(resolve => {
              function frame(now) {
                if (previous !== undefined) frames.push(now - previous);
                previous = now;
                window.scrollBy({ top: 160, behavior: 'instant' }); positions.push(window.scrollY);
                if (frames.length >= 30) resolve(); else requestAnimationFrame(frame);
              }
              requestAnimationFrame(frame);
            });
            await new Promise(resolve => setTimeout(resolve, 30)); observer.disconnect();
            samples.push({ frames, positions, longTasks });
          }
          return { attachment: getComputedStyle(document.body).backgroundAttachment, scrollHeight: document.documentElement.scrollHeight, samples };
        });
        assert.ok(measured.samples.every(sample => new Set(sample.positions).size > 10), 'measurement must actually scroll a long list');
        if (!baseline) assert.ok(measured.attachment.split(',').every(value => value.trim() === 'scroll'));
        rows.push({ baseline, ...measured });
      } finally { await context.close(); }
    }
    console.log('SCROLL_MEASUREMENTS ' + JSON.stringify({ browser: browser.version(), width, cpu: 'desktop page CPU4x; not mobile hardware', rows }));
  });
}
