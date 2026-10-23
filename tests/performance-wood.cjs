const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');
let browser, server, url;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function fixture(withRunner = false, width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await page.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
  await page.goto(url + '/version.json');
  await page.setContent('<div id="partition-wooden-man-alley"><div id="wooden-man-modes"><button data-wooden-mode="progress"></button><button data-wooden-mode="calculator"></button></div><div id="wooden-man-error"></div><div id="wooden-man-progress"></div><div id="wooden-man-calculator"></div><div id="wooden-man-reference"></div></div>');
  await page.evaluate(() => {
    const values = {};
    window.QinshiAccounts = { currentAccount: () => ({ name: '测试', server: '本地' }), getItem: key => values[key], setItem: (key, value) => { values[key] = value; return true; } };
    window.confirm = () => true;
  });
  for (const file of ['data/wooden-man-alley.js', 'js/wooden-man-alley.js', 'js/wooden-man-alley-planner.js', ...(withRunner ? ['js/calculation-runner.js'] : []), 'js/wooden-man-alley-ui.js']) await page.addScriptTag({ url: url + '/' + file });
  await page.evaluate(() => { window.woodControl = WOODEN_MAN_ALLEY_UI.init(window); });
  return page;
}
test('wood planner CPU4x desktop simulation raw measurements', async () => {
  const page = await fixture();
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const values = await page.evaluate(async () => {
      const longTasks = [];
      const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)));
      observer.observe({ type: 'longtask', buffered: false });
      const progress = WOODEN_MAN_ALLEY_CORE.normalizeProgress({ currentFloor: 42, openedCells: [0, 2, 4], resources: { woodSword: 3000, ironSword: 20, horizontalQi: 10, verticalQi: 10, crossQi: 5, bomb: 3, mirror: 2, discountCoupon: 4, ingots: 1000 } }, WOODEN_MAN_ALLEY_DATA);
      const input = { progress, resources: progress.resources, packages: progress.packages, targetFloor: 500, risk: 'conservative', includePurchasablePackages: true, stageLimits: progress.calculator.stageLimits };
      const samples = [];
      for (const direction of ['planToTarget', 'planReachable']) {
        let expected;
        for (let n = 0; n < 3; n++) {
          await new Promise(resolve => setTimeout(resolve, 0));
          const start = performance.now();
          const result = WOODEN_MAN_ALLEY_PLANNER[direction](input, WOODEN_MAN_ALLEY_DATA, WOODEN_MAN_ALLEY_CORE);
          const serialized = JSON.stringify(result);
          if (expected && expected !== serialized) throw new Error('Non-deterministic result');
          expected = serialized;
          samples.push({ direction, ms: performance.now() - start, resultLength: serialized.length });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 50));
      observer.disconnect();
      return { samples, longTasks };
    });
    console.log(JSON.stringify({ browser: browser.version(), viewport: '390x844', cpu: 'desktop simulation 4x', ...values }));
  } finally { await page.close(); }
});

test('wood worker matches synchronous results and leaves the UI event loop responsive', { skip: process.env.WOOD_BASELINE === '1' }, async () => {
  const page = await fixture(true);
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const samples = await page.evaluate(async () => {
      const samples = [];
      for (const direction of ['target', 'reachable']) {
        const draft = WOODEN_MAN_ALLEY_CORE.normalizeProgress({ currentFloor: 42, openedCells: [0, 2, 4], resources: { woodSword: 3000, ironSword: 20, horizontalQi: 10, verticalQi: 10, crossQi: 5, bomb: 3, mirror: 2, discountCoupon: 4, ingots: 1000 } }, WOODEN_MAN_ALLEY_DATA);
        draft.calculator.targetFloor = 500;
        draft.calculator.direction = direction;
        draft.calculator.includePurchasablePackages = true;
        woodControl.setCalculatorDraft(draft);
        const expected = JSON.stringify(woodControl.calculate());
        for (let n = 0; n < 3; n++) {
          await new Promise(resolve => setTimeout(resolve, 30));
          const longTasks = [];
          const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)));
          observer.observe({ type: 'longtask', buffered: false });
          let ticks = 0;
          const timer = setInterval(() => ticks++, 10);
          const start = performance.now();
          const result = await woodControl.calculateAsync();
          const ms = performance.now() - start;
          clearInterval(timer);
          await new Promise(resolve => setTimeout(resolve, 30));
          observer.disconnect();
          if (JSON.stringify(result) !== expected) throw new Error('Worker changed planner result');
          samples.push({ direction, ms, ticks, longTasks });
        }
      }
      return samples;
    });
    console.log(JSON.stringify({ workerSamples: samples, cpu: 'desktop page CPU4x simulation; worker thread rate may differ' }));
    for (const sample of samples) assert.ok(sample.ticks > 0, 'UI timer must run during calculation');
  } finally { await page.close(); }
});
[360, 390, 768, 1100].forEach(width => test('wood edits preserve live controls focus and advanced expansion at ' + width, { skip: process.env.WOOD_BASELINE === '1' }, async () => {
  const page = await fixture(false, width);
  try {
    const outcome = await page.evaluate(() => {
      const change = (selector, value) => {
        const node = document.querySelector(selector);
        node.focus(); node.value = value;
        node.dispatchEvent(new Event('change', { bubbles: true }));
        return node === document.querySelector(selector) && document.activeElement === node;
      };
      const cell = document.querySelector('[data-wooden-cell="0"]');
      cell.focus(); cell.click();
      const board = cell === document.querySelector('[data-wooden-cell="0"]') && document.activeElement === cell && cell.getAttribute('aria-pressed') === 'true';
      const resource = change('[data-wooden-resource="woodSword"]', '18');
      document.querySelector('[data-wooden-mode="calculator"]').click();
      const details = document.querySelector('[data-wooden-advanced]'); details.open = true;
      const calcResource = change('[data-wooden-calc-resource="woodSword"]', '20');
      const stage = change('[data-wooden-stage-max]', '3');
      return { board, resource, calcResource, stage, details: details.isConnected && details.open };
    });
    assert.deepEqual(outcome, { board: true, resource: true, calcResource: true, stage: true, details: true });
  } finally { await page.close(); }
}));

test('typing while calculating immediately invalidates pending UI output', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async () => {
      document.querySelector('[data-wooden-mode="calculator"]').click();
      const pending = woodControl.calculateAsync();
      const input = document.querySelector('[data-wooden-calc-resource="woodSword"]');
      input.focus(); input.value = '321';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await pending;
      return { output: woodControl.state.calculatorResult, busy: woodControl.state.calculatorBusy, value: input.value, connected: input.isConnected };
    });
    assert.deepEqual(result, { output: null, busy: false, value: '321', connected: true });
  } finally { await page.close(); }
});

test('wood calculator loads through real app navigation and calculates', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await page.route('**/*', route => route.request().url().startsWith(url + '/') ? route.continue() : route.abort());
  try {
    await openApp(page, url);
    await page.evaluate(() => document.querySelector('.tab[data-partition="wooden-man-alley"]').click());
    await page.waitForFunction(() => document.querySelector('#partition-wooden-man-alley').dataset.woodenInitialized === 'true');
    await page.locator('[data-wooden-mode="calculator"]').click();
    await page.locator('[data-wooden-calc-action="calculate"]').click();
    await page.waitForFunction(() => document.querySelector('#wooden-man-calculator').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#wooden-calculation-result').innerText(), /木剑/);
  } finally { await page.close(); }
});
