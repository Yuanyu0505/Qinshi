'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, setAccountJson } = require('./browser-test-helpers.cjs');

const base = process.env.WOOD_REVIEW_BASELINE;
const artifact = process.env.WOOD_REVIEW_OUTPUT && path.resolve(process.env.WOOD_REVIEW_OUTPUT);
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), ...args], { cwd: root });
const changed = ['/', '/index.html', '/version.json', '/css/style.css', '/css/responsive-ux.css',
  '/js/wooden-man-alley-ui.js', '/js/wooden-man-alley.js', '/js/wooden-man-alley-planner.js',
  '/js/calculation-runner.js', '/js/calculation-worker.js', '/js/partition-loader.js'];
const modes = '[data-wooden-mode]';
const screen = '#partition-wooden-man-alley';
const calc = '#wooden-man-calculator';
const runButton = '[data-wooden-calc-action="calculate"]';
const resultSelector = '#wooden-calculation-result';
const board = '.wooden-board';
const testKey = 'qinshi_wooden_man_alley_progress_v1';
const sizes = [[320, 568], [390, 844], [820, 1180], [1366, 768], [1920, 1080]];
const baseline = new Map();
let browser, server, url;

before(async () => {
  if (artifact) fs.mkdirSync(artifact, { recursive: true });
  if (base) for (const name of changed) baseline.set(name, git(['show', base + ':' + (name === '/' ? 'index.html' : name.slice(1))]));
  server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).on('error', reject));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function fixture(viewport, { floor = 331, worker = 'normal', zoom = 1 } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', deviceScaleFactor: 1,
    isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await context.route('**/*', async route => {
    const request = new URL(route.request().url());
    if (request.origin !== url) return route.abort();
    const name = request.pathname;
    if (name.endsWith('/calculation-worker.js')) {
      if (worker === 'fail') return route.fulfill({ status: 503, contentType: 'text/javascript', body: '' });
      if (worker === 'delay') await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!baseline.has(name)) return route.continue();
    const contentType = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.json') ? 'application/json' : 'text/html';
    return route.fulfill({ body: baseline.get(name), contentType: contentType + '; charset=utf-8' });
  });
  const page = await context.newPage();
  await openApp(page, url);
  await setAccountJson(page, testKey, {
    currentFloor: floor, openedCells: [0, 2, 4],
    resources: { woodSword: floor === 42 ? 3000 : 300, horizontalQi: 8, verticalQi: 6, ironSword: 6, bomb: 2, mirror: 2, ingots: 1000, discountCoupon: 4 },
    calculator: { targetFloor: floor === 42 ? 500 : 333, risk: 'conservative' }
  });
  await page.evaluate(() => document.querySelector('.tab[data-partition="wooden-man-alley"]').click());
  await page.waitForFunction(() => document.querySelector('#partition-wooden-man-alley').dataset.woodenInitialized === 'true');
  if (zoom !== 1) await page.evaluate(value => { document.documentElement.style.zoom = String(value); }, zoom);
  return page;
}

function mode(page, name) { return page.locator(modes + '[data-wooden-mode="' + name + '"]'); }
function screenshot(page, name, selector = screen) {
  return artifact ? page.locator(selector).screenshot({ path: path.join(artifact, name + '.png'), animations: 'disabled', timeout: 20000 }) : Promise.resolve();
}
function metrics(page) {
  return page.evaluate(() => {
    const partition = document.querySelector('#partition-wooden-man-alley');
    const view = document.documentElement;
    const cells = [...partition.querySelectorAll('.wooden-board [data-wooden-cell]')];
    const box = cells[0]?.getBoundingClientRect();
    const lastCell = cells[cells.length - 1]?.getBoundingClientRect();
    const board = partition.querySelector('.wooden-board')?.getBoundingClientRect();
    const actions = partition.querySelector('.wooden-board-actions')?.getBoundingClientRect();
    const labels = cells.map(node => node.getAttribute('aria-label'));
    let scrollContainer = cells[0]?.parentElement;
    while (scrollContainer && scrollContainer !== partition && !/^auto|scroll$/.test(getComputedStyle(scrollContainer).overflowX)) scrollContainer = scrollContainer.parentElement;
    return { viewport: window.innerWidth, client: view.clientWidth, scroll: view.scrollWidth,
      partitionClient: partition.clientWidth, partitionScroll: partition.scrollWidth,
      cells: cells.length, cellWidth: box?.width, cellHeight: box?.height, uniqueCellLabels: new Set(labels.filter(Boolean)).size,
      boardWidth: board?.width, lastCellWithinBoard: (lastCell?.right ?? 0) <= (board?.right ?? 0) + 1,
      lastCellVisibleOrScrollable: (lastCell?.right ?? 0) <= partition.getBoundingClientRect().right + 1 ||
        Boolean(scrollContainer !== partition && scrollContainer && scrollContainer.scrollWidth > scrollContainer.clientWidth),
      sideBySide: Math.abs((board?.top ?? 0) - (actions?.top ?? 0)) < 20 && actions?.left >= board?.right - 2 };
  });
}
async function runAndWait(page) {
  await page.locator(runButton).click();
  await page.waitForFunction(sel => document.querySelector(sel).getAttribute('aria-busy') === 'false', calc, { timeout: 30000 });
}
function noOverflow(stats) {
  assert.ok(stats.scroll <= stats.client + 1, JSON.stringify(stats));
  assert.ok(stats.partitionScroll <= stats.partitionClient + 1, JSON.stringify(stats));
}

for (const [width, height] of sizes) test('three surfaces at ' + width + '×' + height, async () => {
  const page = await fixture({ width, height });
  const name = width + 'x' + height;
  try {
    const progress = await metrics(page);
    assert.equal(progress.cells, 49);
    await screenshot(page, name + '-progress');
    if (!base) {
      noOverflow(progress);
      assert.ok(Math.abs(progress.cellWidth - progress.cellHeight) <= 1, JSON.stringify(progress));
      assert.ok(progress.cellWidth >= 24, JSON.stringify(progress));
      assert.equal(progress.uniqueCellLabels, 49);
      assert.equal(progress.lastCellWithinBoard, true);
      assert.equal(progress.lastCellVisibleOrScrollable, true);
      if (width >= 820) assert.equal(progress.sideBySide, true);
      const surfaces=await page.locator('#wooden-man-progress > .panel:not(.wooden-activity-panel)').evaluateAll(nodes=>nodes.map(node=>{
        const style=getComputedStyle(node);
        return [style.borderTopWidth,style.backgroundColor,style.backgroundImage];
      }));
      surfaces.forEach(style=>assert.deepEqual(style,['1px','rgba(0, 0, 0, 0)','none']));
      assert.equal(await page.getByText('当前游戏账号',{exact:true}).count(),0);
      const activity=page.locator('.wooden-activity-panel');
      const account=await activity.boundingBox();
      const date=await activity.locator('[data-wooden-end-date]').boundingBox();
      const remaining=await activity.locator('.wooden-remaining-time').boundingBox();
      assert.ok(Math.abs(date.y-remaining.y)<=1 && Math.abs(date.height-remaining.height)<=1,'date and remaining time align at equal height');
      assert.ok(Math.abs(date.width-remaining.width)<=1,'date and remaining time have matching widths');
      const current=await page.locator('.wooden-current-panel').boundingBox();
      assert.ok(current.y-account.y-account.height>=32,'activity and progress need additional spacing');
      const firstCell=await page.locator('[data-wooden-cell="0"]').boundingBox();
      const floorTitle=await page.locator('.wooden-section-head strong').boundingBox();
      assert.ok(Math.abs(firstCell.x-floorTitle.x)<=1,'board starts at the floor title left edge');
      const clearBoard=await page.locator('[data-wooden-action="clear-board"]').boundingBox();
      const clearEvent=await page.locator('[data-wooden-action="clear-event"]').boundingBox();
      assert.ok(clearEvent.y>=clearBoard.y+clearBoard.height,'account reset follows floor reset');
      assert.ok(Math.abs(clearBoard.width-clearEvent.width)<=1 && Math.abs(clearBoard.height-clearEvent.height)<=1,'reset buttons share dimensions');
      const packages = page.locator('details[data-wooden-package-settings]');
      if (await packages.getAttribute('open') === null) await packages.locator('summary').click();
      assert.equal(await packages.locator('[data-wooden-package]').count(), 20);
      const cell = page.locator(board + ' [data-wooden-cell="1"]');
      await cell.focus();
      await page.keyboard.press('Space');
      assert.equal(await cell.getAttribute('aria-pressed'), 'true');
      assert.equal(await cell.evaluate(el => el === document.activeElement), true);
    }
    await mode(page, 'calculator').click();
    if (!base) {
      const quick = page.locator('select[data-wooden-quick-target]');
      assert.equal(await quick.locator('option').count(), 14);
      const command=page.locator('.wooden-calculator-command');
      assert.equal(await command.locator(runButton).count(),1);
      if(width>=768){
        const target=await command.locator('[data-wooden-target-input]').boundingBox();
        const calculate=await command.locator(runButton).boundingBox();
        assert.ok(Math.abs(target.y+target.height-calculate.y-calculate.height)<=1,'target and calculate align on one row');
        const row=await command.boundingBox();
        assert.ok(Math.abs(row.x+row.width-calculate.x-calculate.width)<=1,'calculation row fills the available width');
      }
      const advanced = page.locator('[data-wooden-advanced]');
      await advanced.locator(':scope > summary').click();
      assert.equal(await advanced.locator('details[data-wooden-limit-stage]').count(), 5);
      assert.equal(await advanced.locator('[data-wooden-stage-max]').count(), 30);
      const input = advanced.locator('[data-wooden-stage-max]').first();
      await input.focus();
      await input.fill('3');
      await input.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
      assert.equal(await advanced.getAttribute('open'), '');
      await advanced.locator(':scope > summary').click();
    }
    await screenshot(page, name + '-calculator');
    await runAndWait(page);
    assert.match(await page.locator(resultSelector).innerText(), /木剑/);
    const result = await metrics(page);
    if (!base) noOverflow(result);
    await screenshot(page, name + '-result', resultSelector);
    await mode(page, 'reference').click();
    const reference = await metrics(page);
    if (!base) {
      noOverflow(reference);
      assert.equal(await page.locator('#wooden-man-reference h2.panel-title').count(),6);
      assert.equal(await page.locator('.wooden-table-wrap table').first().evaluate(node=>getComputedStyle(node).fontSize),'15px');
      if (width < 768) {
        const labels = await page.locator('.wooden-table-wrap').evaluateAll(tables => tables.flatMap(table => [...table.querySelectorAll('tbody td')].map(td => td.dataset.label || td.querySelector('[aria-hidden="true"]')?.textContent || '')));
        assert.ok(labels.length > 0 && labels.every(Boolean), 'mobile card lost its field labels');
      }
    }
    await screenshot(page, name + '-reference');
    console.log(JSON.stringify({ revision: base || 'candidate', shape: name, progress, result, reference }));
  } finally { await page.context().close(); }
});

test('200 percent rendering zoom stays usable', { skip: Boolean(base) }, async () => {
  // Chromium local browser CSS zoom checks reflow at a 640px window. It is
  // separate from OS/browser-UI accessibility settings on a real device.
  const page = await fixture({ width: 640, height: 1000 }, { zoom: 2 });
  try {
    const stats = await metrics(page);
    assert.equal(stats.cells, 49);
    noOverflow(stats);
    await screenshot(page, '200pct-progress');
    await mode(page, 'calculator').click();
    noOverflow(await metrics(page));
  } finally { await page.context().close(); }
});

function percentile(values, fraction) { return values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]; }
for (const [width, height] of sizes.slice(0, 2)) for (const worker of ['normal', 'fail']) test('CPU4x × ' + width + ' worker ' + worker, async () => {
  const page = await fixture({ width, height }, { floor: 42, worker });
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.woodPerfLongTasks = [];
      window.woodPerfTicks = 0;
      setInterval(() => window.woodPerfTicks++, 16);
      new PerformanceObserver(list => list.getEntries().forEach(entry => window.woodPerfLongTasks.push(entry.duration))).observe({ type: 'longtask' });
    });
    await mode(page, 'calculator').click();
    const samples = [];
    for (const direction of ['target', 'reachable']) {
      await page.locator('[data-wooden-calc-direction="' + direction + '"]').click();
      for (let index = 0; index < 5; index++) {
        await page.evaluate(() => { window.woodPerfStart = performance.now(); window.woodPerfTicks = 0; window.woodPerfLongTasks = []; });
        await runAndWait(page);
        const sample = await page.evaluate(() => {
          const alert = document.querySelector('#wooden-man-calculator [data-wooden-error-slot]') || document.querySelector('#wooden-man-error');
          return { ms: performance.now() - window.woodPerfStart, ticks: window.woodPerfTicks,
            longTasks: window.woodPerfLongTasks.slice(), error: alert.hidden ? '' : alert.textContent,
            rendered: Boolean(document.querySelector('.wooden-result-summary')) };
        });
        const measure = (await cdp.send('Performance.getMetrics')).metrics.find(x => x.name === 'JSHeapUsedSize');
        samples.push({ direction, ...sample, rendererHeapMiB: measure && Math.round(measure.value / 1024 / 1024 * 100) / 100 });
      }
    }
    const durations = samples.map(row => row.ms);
    console.log(JSON.stringify({ revision: base || 'candidate', cpu: 'desktop renderer 4x', browser: browser.version(),
      shape: width + 'x' + height, worker, n: samples.length, p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95), samples }));
    if (!base && worker === 'fail') {
      assert.ok(samples.every(s => /后台|不可用|重试/.test(s.error) && !s.rendered), 'Worker failure must not generate a main-thread answer');
    } else {
      assert.ok(samples.every(s => !s.error), 'normal jobs should not show a worker error');
    }
  } finally { await page.context().close(); }
});

test('changing input and leaving the partition cancels stale worker jobs', { skip: Boolean(base) }, async () => {
  const page = await fixture({ width: 390, height: 844 }, { floor: 42, worker: 'delay' });
  try {
    await mode(page, 'calculator').click();
    const start = page.locator(runButton);
    const input = page.locator('[data-wooden-calc-resource="woodSword"]');
    await start.click();
    await input.fill('321');
    assert.equal(await page.locator(calc).getAttribute('aria-busy'), 'false');
    assert.equal(await input.inputValue(), '321');
    await start.click();
    await mode(page, 'progress').click();
    await mode(page, 'calculator').click();
    await page.waitForTimeout(550); // drives the fault-injected delayed response through navigation
    assert.equal(await page.locator(calc).getAttribute('aria-busy'), 'false');
    assert.equal(await page.locator('.wooden-result-summary').count(), 0);
  } finally { await page.context().close(); }
});

test('reverse expected mode labels the bound as a planning estimate, not a guarantee', { skip: Boolean(base) }, async () => {
  const page = await fixture({ width: 390, height: 844 }, { floor: 1 });
  try {
    await mode(page, 'calculator').click();
    await page.locator('[data-wooden-calc-direction="reachable"]').click();
    await page.locator('[data-wooden-risk="expected"]').click();
    await runAndWait(page);
    const text = await page.locator(resultSelector).innerText();
    assert.match(text, /理论期望/);
    assert.match(text, /不保证通关/);
    assert.doesNotMatch(text, /最高完整完成/);
  } finally { await page.context().close(); }
});

test('failed writes and real account reload do not mix wooden man data', { skip: Boolean(base) }, async () => {
  const page = await fixture({ width: 390, height: 844 });
  try {
    const resource = page.locator('[data-wooden-resource="woodSword"]');
    assert.equal(await resource.inputValue(), '300');
    await page.evaluate(() => {
      window.restoreWoodStorageWriter = QinshiAccounts.setItem;
      QinshiAccounts.setItem = () => false;
    });
    await resource.fill('17');
    await resource.press('Tab');
    assert.equal(await resource.inputValue(), '300');
    assert.match(await page.locator('[role="alert"]').filter({ hasText: /木人巷.*保存/ }).last().textContent(), /保存/);
    await page.evaluate(() => { QinshiAccounts.setItem = window.restoreWoodStorageWriter; });
    const identity = await page.evaluate(() => ({ first: QinshiAccounts.currentAccount().id,
      second: QinshiAccounts.createAccount({ name: '木人巷合成帐号乙', server: '测试服' }).id }));
    await mode(page, 'calculator').click();
    const draftInput = page.locator('[data-wooden-calc-resource="woodSword"]');
    await draftInput.fill('250');
    await draftInput.press('Tab');
    async function switchFromPage(id) {
      await Promise.all([
        page.waitForEvent('load'),
        page.evaluate(accountId => QinshiAccounts.switchAccount(accountId, { partition: 'wooden-man-alley' }), id)
      ]);
      await page.waitForFunction(() => document.querySelector('#partition-wooden-man-alley').dataset.woodenInitialized === 'true');
    }
    await switchFromPage(identity.second);
    await mode(page, 'calculator').click();
    assert.equal(await draftInput.inputValue(), '0');
    assert.equal(await page.evaluate(key => QinshiAccounts.getItem(key), testKey), null);
    await switchFromPage(identity.first);
    await mode(page, 'calculator').click();
    assert.equal(await draftInput.inputValue(), '300');
    assert.equal(await page.evaluate(key => JSON.parse(QinshiAccounts.getItem(key)).resources.woodSword, testKey), 300);
  } finally { await page.context().close(); }
});
