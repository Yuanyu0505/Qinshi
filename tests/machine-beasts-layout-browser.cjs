// UI-only regressions using isolated local accounts and browser contexts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem } = require('./browser-test-helpers.cjs');
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function scenario(run, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openApp(page, origin);
    if (await page.locator('#mobile-more-toggle').isVisible()) {
      await page.locator('#mobile-more-toggle').click(); await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
    } else await page.locator('.tab[data-partition="machine-beasts"]').click();
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('red-serpent');
    await run(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
test('calculator controls precede result in actual DOM and viewport reading order', async () => scenario(async page => {
  assert.equal(await page.evaluate(() => Boolean(document.getElementById('machine-beast-calculator-controls').compareDocumentPosition(document.getElementById('machine-beast-calculator-result')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
}));
test('alignment: current level matches input text size and target follows without an empty column', async () => scenario(async page => {
  const layout = await page.evaluate(() => {
    const current = document.querySelector('[data-calc-current-level]'), research = document.querySelector('[data-calc-field="research"]'), target = document.querySelector('[data-calc-target]');
    return { currentSize:getComputedStyle(current).fontSize, inputSize:getComputedStyle(research).fontSize, gap:target.getBoundingClientRect().left-current.getBoundingClientRect().right };
  });
  assert.equal(layout.currentSize, layout.inputSize);
  assert.ok(layout.gap >= 0 && layout.gap <= 24);
}));
test('alignment: strategy and price disclosures share the same left edge', async () => scenario(async page => {
  await page.locator('[data-machine-calculator-mode="school"]').click();
  const rules = await page.locator('[data-detail-key="school:rules"] > summary').boundingBox();
  const price = await page.locator('#machine-price-settings > summary').boundingBox();
  assert.ok(Math.abs(rules.x-price.x)<=1);
}));
for (const width of [320,1280]) test(`alignment: ${width}px reference return buttons stay in section headers and stage data remains accessible`, async () => scenario(async page => {
  await page.locator('[data-machine-beast-mode="reference"]').click();
  for (const section of await page.locator('#machine-beast-reference-content > section.panel').all()) {
    const header = section.locator('.machine-reference-section-head'), button = header.locator('.machine-reference-return');
    const a = await header.boundingBox(), b = await button.boundingBox();
    assert.ok(Math.abs(b.y-a.y)<=2); assert.ok(b.x+b.width<=a.x+a.width+1);
    assert.equal(await button.evaluate(n=>getComputedStyle(n).textDecorationLine), 'none');
  }
  assert.equal(await page.getByRole('navigation',{name:'流派阶数定位'}).count(),0);
  assert.equal(await page.locator('.machine-school-stage-card').count(),5);
  if (width===1280) {
    const positions = await page.locator('.machine-research-matrix-scroll').evaluateAll(nodes=>nodes.map(n=>({left:n.querySelector('th').getBoundingClientRect().left,width:n.querySelector('table').getBoundingClientRect().width})));
    assert.ok(positions.slice(1).every(p=>Math.abs(p.left-positions[0].left)<=1 && p.width<=320));
  }
  await page.locator('.machine-reference-return').last().click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'machine-reference-index');
},width));
test('round2: excluded card stays compact, expanded fields and participation preserve drafts', async () => scenario(async page => {
  await page.locator('[data-machine-calculator-mode="school"]').click();
  const id = await page.locator('[data-school-card]').first().getAttribute('data-school-card');
  const card = page.locator('[data-school-card="' + id + '"]');
  await card.locator('[data-school-field="fragments"]').fill('37');
  await card.locator('[data-school-participant]').uncheck();
  assert.equal(await card.locator('[data-school-field="fragments"]').isVisible(), false);
  await card.locator('details > summary').first().click();
  assert.equal(await card.locator('[data-school-field="fragments"]').inputValue(), '37');
  await card.locator('[data-school-field="research"]').fill('22800');
  assert.match(await card.locator('.machine-excluded-summary').textContent(), /当前 1\//);
  await card.locator('[data-school-participant]').check();
  assert.equal(await card.locator('[data-school-field="fragments"]').inputValue(), '37');
}));
test('round2: single action follows material policy and price settings, without duplicates', async () => scenario(async page => {
  assert.equal(await page.locator('[data-machine-action="calculate"]').count(), 1);
  assert.equal(await page.evaluate(() => {
    const action = document.querySelector('[data-machine-action="calculate"]');
    return ['[data-calc-field="fragments"]','[data-owned-global]','[data-new-rank-mode-scope="single"]','#machine-price-settings'].every(selector =>
      Boolean(document.querySelector(selector).compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), true);
}));
test('round2: inline progress save and cancel retain account data and the primary card summary', async () => scenario(async page => {
  await page.locator('[data-machine-beast-mode="progress"]').click();
  const id = await page.locator('[data-progress-card]').first().getAttribute('data-progress-card');
  const card = page.locator('[data-progress-card="' + id + '"]');
  await card.locator('[data-machine-action="edit-progress"]').click();
  await card.locator('[data-edit-field="research"]').fill('22800');
  await card.locator('[data-edit-field="fragments"]').fill('27');
  await card.locator('[data-edit-inventory][data-mod="none"][data-rank="0"]').fill('9');
  await card.locator('[data-machine-action="save-progress"]').click();
  const raw = await getAccountItem(page, 'qinshi_machine_beasts_progress_v1');
  const progress = JSON.parse(raw).beasts[id];
  assert.equal(progress.research, 22800); assert.equal(progress.fragments, 27); assert.equal(progress.inventory.none['0'], 9);
  assert.match(await card.locator('.machine-card-primary').textContent(), /1\/10级.*完整库存 9只.*碎片 27/);
  await card.locator('[data-machine-action="edit-progress"]').click();
  await card.locator('[data-edit-field="fragments"]').fill('999');
  await card.locator('[data-machine-action="cancel-progress"]').click();
  assert.equal(await getAccountItem(page, 'qinshi_machine_beasts_progress_v1'), raw);
  await card.locator('[data-machine-action="edit-progress"]').click();
  await card.locator('[data-edit-field="fragments"]').fill('1000000000000000');
  await card.locator('[data-edit-inventory][data-mod="none"][data-rank="0"]').fill('1000000000000000');
  await card.locator('[data-machine-action="save-progress"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
}, 320));
test('round2: quality and rank quick lookup reads actual DATA and keeps full matrix intact', async () => scenario(async page => {
  const before = await getAccountItem(page, 'qinshi_machine_beasts_progress_v1');
  await page.locator('[data-machine-beast-mode="reference"]').click();
  const matrixRows = await page.locator('.machine-research-matrix-scroll tbody tr').count();
  await page.locator('[data-research-quality]').selectOption('orange');
  await page.locator('[data-research-rank]').selectOption('7');
  const expected = await page.evaluate(() => window.MACHINE_BEAST_DATA.modifications.map(m => [m.name,window.MACHINE_BEAST_DATA.researchValues.orange[7][m.id]]));
  for (const [name, value] of expected) assert.match(await page.locator('[data-research-quick-result]').textContent(), new RegExp(name + '[\\s\\S]*' + value.toLocaleString('zh-CN')));
  assert.equal(await page.locator('.machine-research-matrix-scroll tbody tr').count(), matrixRows);
  assert.equal(await getAccountItem(page, 'qinshi_machine_beasts_progress_v1'), before);
  for (const quality of ['orange','purple','blue']) {
    await page.locator('[data-research-quality]').selectOption(quality);
    const ranks = await page.evaluate(q => Object.keys(window.MACHINE_BEAST_DATA.researchValues[q]), quality);
    assert.deepEqual(await page.locator('[data-research-rank] option').evaluateAll(nodes => nodes.map(n => n.value)), ranks);
    for (const rank of ranks) {
      await page.locator('[data-research-rank]').selectOption(rank);
      const expected = await page.evaluate(({quality,rank}) => Object.values(window.MACHINE_BEAST_DATA.researchValues[quality][rank]).map(v => v == null ? '—' : v.toLocaleString('zh-CN')), {quality,rank});
      assert.deepEqual(await page.locator('[data-research-quick-result] dd').allTextContents(), expected);
    }
  }
  const saved = await page.evaluate(() => window.MACHINE_BEAST_UI.captureView());
  await page.locator('[data-research-quality]').selectOption('orange');
  await page.evaluate(view => window.MACHINE_BEAST_UI.restoreView(view), saved);
  assert.equal(await page.locator('[data-research-quality]').inputValue(), 'blue');
  assert.equal(await page.locator('[data-research-rank]').inputValue(), '2');
  assert.equal(await getAccountItem(page, 'qinshi_machine_beasts_progress_v1'), before);
}));
test('school actions scroll away instead of overlapping research and inventory fields', async () => scenario(async page => {
  await page.locator('[data-machine-calculator-mode="school"]').click();
  const input = page.locator('[data-school-card]').first().locator('[data-school-field="research"]');
  await input.scrollIntoViewIfNeeded();
  await input.evaluate(node => node.scrollIntoView({ block: 'start' }));
  const geometry = await page.evaluate(() => {
    const bar = document.querySelector('.machine-calc-actionbar'), input = document.querySelector('[data-school-field="research"]');
    const a = bar.getBoundingClientRect(), b = input.getBoundingClientRect();
    return { overlaps: a.top < b.bottom && b.top < a.bottom, background: getComputedStyle(bar).backgroundColor };
  });
  assert.equal(geometry.overlaps, false);
  assert.notEqual(geometry.background, 'rgba(0, 0, 0, 0)');
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.locator('[data-machine-action="edit-progress"]').first().click();
  assert.equal(await page.locator('.machine-editor-actions').evaluate(node => getComputedStyle(node).position), 'static');
}));
test('inventory flags retain open state and identity; radio restoration distinguishes both values', async () => scenario(async page => {
  const inventory = page.locator('.machine-temporary-inventory');
  await inventory.locator('summary').click();
  await page.locator('[data-calc-flag="showHighRanks"]').check();
  assert.equal(await inventory.evaluate(node => node.open), true);
  await page.locator('[data-calc-flag="showMods"]').check();
  assert.equal(await inventory.evaluate(node => node.open), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.calcFlag), 'showMods');
  await page.locator('[data-new-rank-mode-scope="single"][value="zero"]').check();
  await page.locator('[data-new-rank-mode-scope="single"][value="zeroToSeven"]').check();
  assert.equal(await page.evaluate(() => document.activeElement.value), 'zeroToSeven');
}));
test('return restores hidden calculator disclosure state without rereading stale hidden DOM', async () => scenario(async page => {
  const inventory = page.locator('.machine-temporary-inventory');
  await inventory.locator('summary').click();
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.evaluate(() => { window.__savedLayoutView = window.MACHINE_BEAST_UI.captureView(); });
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  await inventory.locator('summary').click();
  assert.equal(await inventory.evaluate(node => node.open), false);
  await page.evaluate(() => window.MACHINE_BEAST_UI.restoreView(window.__savedLayoutView));
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  assert.equal(await inventory.evaluate(node => node.open), true);
}));
test('same-object search retains real busy Worker and disabled button; switching object invalidates result', async () => scenario(async page => {
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { requested = resolve; });
  await page.route('**/calculation-worker.js*', async route => { requested(); await gate; await route.continue().catch(() => {}); });
  try {
    await page.locator('[data-machine-action="calculate"]').click(); await seen;
    await page.locator('[data-machine-search="calculator"]').fill('赤练王蛇');
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().searches.calculator === '赤练王蛇');
    assert.equal(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('[data-machine-action="calculate"]').isDisabled(), true);
    assert.equal(await page.locator('[data-machine-calculating-status]').isVisible(), true);
    release();
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().calcResult != null);
    await page.locator('[data-machine-search="calculator"]').fill('兵魔神');
    await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().calcBeastId === 'war-demon');
    assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult), null);
  } finally { release(); }
}));
test('reference search preserves unrelated sections and independent stage school state', async () => scenario(async page => {
  await page.locator('[data-machine-beast-mode="reference"]').click();
  await page.locator('[data-machine-school-scope="reference-stages"][data-school-id="nonAttack"]').click();
  await page.evaluate(() => { window.__referenceMaterials = document.getElementById('machine-reference-materials'); });
  await page.locator('[data-machine-search="reference"]').fill('赤练王蛇');
  await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().searches.reference === '赤练王蛇');
  assert.equal(await page.evaluate(() => window.__referenceMaterials === document.getElementById('machine-reference-materials')), true);
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().referenceStageSchoolId), 'nonAttack');
  assert.equal(await page.locator('.machine-reference-index a').count(), 7);
  await page.locator('a[href="#machine-reference-values"]').first().click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'machine-reference-values');
}));
test('presentation filters do not save inventory and explicit navigation can reveal an unstocked blue beast', async () => scenario(async page => {
  const before = await getAccountItem(page, 'qinshi_machine_beasts_progress_v1');
  await page.locator('[data-machine-beast-mode="progress"]').click();
  await page.locator('[data-progress-quality]').selectOption('orange');
  await page.locator('[data-progress-stocked]').check();
  await page.evaluate(() => window.MACHINE_BEAST_UI.applyNavigationQuery('机关蛇'));
  assert.equal(await page.locator('[data-progress-quality]').inputValue(), 'all');
  assert.equal(await page.locator('[data-progress-stocked]').isChecked(), false);
  assert.match(await page.locator('[data-progress-card]').allTextContents().then(items => items.join(' ')), /机关蛇/);
  assert.equal(await getAccountItem(page, 'qinshi_machine_beasts_progress_v1'), before);
}));
for (const width of [320, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1920]) {
  test(`${width}px module containers keep full controls and seven references without whole-page horizontal overflow`, async () => scenario(async page => {
    for (const mode of ['progress', 'calculator', 'reference']) {
      await page.locator('[data-machine-beast-mode="' + mode + '"]').click();
      if (mode === 'reference') {
        assert.equal(await page.locator('#machine-beast-reference-content > section.panel').count(), 7);
        for (const href of await page.locator('.machine-reference-index a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) assert.equal(await page.locator(href).count(), 1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${width} ${mode}`);
    }
  }, width));
}
