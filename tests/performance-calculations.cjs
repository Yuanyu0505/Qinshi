const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });
async function scenario(run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await openApp(page, origin);
    await page.evaluate(async () => {
      if (window.QinshiPartitionLoader) await window.QinshiPartitionLoader.ensure('machine-beasts');
      document.querySelector('[data-partition="machine-beasts"]').click();
    });
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

test('unchanged cost settings skip persistence while failed writes remain retryable', async () => scenario(async page => {
  const price = page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]');
  await price.fill('64');
  await page.evaluate(() => {
    const set = window.QinshiAccounts.setItem;
    window.__costWrites = 0;
    window.__rejectCost = false;
    window.QinshiAccounts.setItem = function (key, value) {
      if (key === 'qinshi_machine_beasts_progress_v1') {
        window.__costWrites++;
        if (window.__rejectCost) return false;
      }
      return set.call(this, key, value);
    };
  });
  await price.fill('64');
  await page.locator('[data-machine-action="save-reference-cost"]').click();
  assert.equal(await page.evaluate(() => window.__costWrites), 0);
  await page.evaluate(() => { window.__rejectCost = true; });
  await price.fill('65');
  assert.match(await page.locator('[data-reference-cost-save-status]').textContent(), /未保存/);
  await page.evaluate(() => { window.__rejectCost = false; });
  await page.locator('[data-machine-action="save-reference-cost"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(window.QinshiAccounts.getItem('qinshi_machine_beasts_progress_v1')).referenceCost.awakeningBlueprintPrice), 65);
}));

test('real beast workers return exactly the existing single and school calculation results', async () => scenario(async page => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const measured = await page.evaluate(async () => {
    const data = window.MACHINE_BEAST_DATA, core = window.MACHINE_BEAST_CORE;
    const cases = [
      { kind: 'beast-single', payload: { beastId: 'potu-qilang', progress: { research: 1000 }, options: { targetLevel: 10, newRankMode: 'zeroToSeven', preferOwnedOnTie: true } } },
      { kind: 'beast-school', payload: { schoolId: 'nonAttack', progressByBeast: {}, options: { targetStage: 5, useOwnedInventory: false, newRankMode: 'zeroToSeven' } } }
    ];
    const results = [];
    for (const entry of cases) {
      const fallback = x => entry.kind === 'beast-single'
        ? core.calculateInvestmentPlan(data, data.beasts.find(b => b.id === x.beastId), x.progress, x.options)
        : window.MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans(data, x.schoolId, x.progressByBeast, x.options);
      const start = performance.now(); const expected = fallback(entry.payload); const syncMs = performance.now() - start;
      const runner = window.QinshiCalculationRunner.create({ kind: entry.kind, fallback() { throw Error('A real worker is required for this test'); } });
      await new Promise(resolve => setTimeout(resolve, 50));
      for (let sample = 0; sample < 3; sample++) {
        const longTasks = [];
        const observer = new PerformanceObserver(list => list.getEntries().forEach(task => longTasks.push(task.duration)));
        observer.observe({ type: 'longtask', buffered: false });
        let ticks = 0; const timer = setInterval(() => ticks++, 5);
        const workerStart = performance.now();
        const actual = await runner.run(entry.payload);
        const workerMs = performance.now() - workerStart;
        clearInterval(timer);
        await new Promise(resolve => setTimeout(resolve, 30)); observer.disconnect();
        results.push({ kind: entry.kind, sample, equal: JSON.stringify(actual) === JSON.stringify(expected), valid: actual.valid, syncMs, workerMs, ticks, longTasks });
      }
      runner.dispose();
    }
    return results;
  });
  console.log('BEAST_MEASUREMENTS CPU4x desktop simulation; worker thread rate may differ ' + JSON.stringify(measured));
  assert.ok(measured.every(row => row.equal && row.valid));
}));

test('beast UI starts a cancellable background task and never installs results for edited inputs', async () => scenario(async page => {
  await page.locator('[data-calc-beast]').selectOption('war-demon');
  await page.locator('[data-calc-target]').selectOption('1');
  const immediate = await page.evaluate(() => {
    document.querySelector('[data-machine-action="calculate"]').click();
    const busy = document.querySelector('#machine-beast-calculator-result').getAttribute('aria-busy');
    const target = document.querySelector('[data-calc-target]');
    target.value = '2'; target.dispatchEvent(new Event('change', { bubbles: true }));
    return { busy, result: window.MACHINE_BEAST_UI.captureView().calcResult };
  });
  assert.equal(immediate.busy, 'true');
  assert.equal(immediate.result, null);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), null);
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult), null);
  await page.locator('[data-machine-action="calculate"]').click();
  await page.locator('[data-reference-cost-panel="single"]').waitFor();
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult.target.level), 2);
}));

for (const mode of ['single', 'school']) {
  test(mode + ' reload cannot accept a result calculated from the preceding draft', async () => scenario(async page => {
    if (mode === 'school') await page.locator('[data-machine-calculator-mode="school"]').click();
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      window.__heldDeliveries = [];
      window.Worker = class {
        constructor(url) {
          this.worker = new NativeWorker(url);
          this.worker.onmessage = event => window.__heldDeliveries.push(() => { if (this.onmessage) this.onmessage(event); });
          this.worker.onerror = event => { if (this.onerror) this.onerror(event); };
        }
        postMessage(value) { this.worker.postMessage(value); }
        terminate() { this.worker.terminate(); }
      };
    });
    const calculate = mode === 'single' ? 'calculate' : 'calculate-school';
    const reload = mode === 'single' ? 'reload-calculator' : 'reload-school-calculator';
    await page.locator('[data-machine-action="' + calculate + '"]').click();
    await page.waitForFunction(() => window.__heldDeliveries.length > 0);
    await page.locator('[data-machine-action="' + reload + '"]').click();
    await page.evaluate(() => window.__heldDeliveries.splice(0).forEach(deliver => deliver()));
    await page.waitForTimeout(50);
    const result = await page.evaluate(mode => {
      const state = window.MACHINE_BEAST_UI.captureView();
      return mode === 'single' ? state.calcResult : state.schoolResult;
    }, mode);
    assert.equal(result, null);
    assert.equal(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), null);
  }));
}
