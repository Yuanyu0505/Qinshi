// Local-only regression coverage; all requests are restricted to this test server.
// node --test --test-concurrency=1 tests/machine-beasts-reference-cost-browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, setAccountJson, getAccountJson } = require('./browser-test-helpers.cjs');

const KEY = 'qinshi_machine_beasts_progress_v1';
let browser, server, origin;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function scenario(run, width = 1100) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await openApp(page, origin);
    await enter(page);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function enter(page) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
  } else await page.locator('.tab[data-partition="machine-beasts"]').click();
  await page.locator('[data-machine-beast-mode="calculator"]').click();
}

async function waitForCalculation(page, resultKey) {
  await page.waitForFunction(key => {
    const panel = document.querySelector('#machine-beast-calculator-result');
    return window.MACHINE_BEAST_UI.captureView()[key] != null && panel && panel.getAttribute('aria-busy') !== 'true';
  }, resultKey);
}

async function calculateSingle(page) {
  await page.locator('[data-calc-beast]').selectOption('war-demon');
  await page.locator('[data-calc-target]').selectOption('1');
  await page.locator('[data-machine-action="calculate"]').click();
  await waitForCalculation(page, 'calcResult');
  await page.locator('[data-reference-cost-panel="single"] [data-reference-cost-total]').waitFor();
}

async function calculateFixedSingle(page) {
  await page.locator('[data-calc-beast]').selectOption('mechanical-white-tiger');
  await page.evaluate(() => {
    const view = window.MACHINE_BEAST_UI.captureView();
    Object.assign(view.calcDraft, { research: 750000, fragments: 13 });
    view.calcTargetLevel = 20;
    view.singleNewRankMode = 'zero';
    view.singleInventoryPolicy.useOwnedInventory = false;
    view.calcResult = null;
    window.MACHINE_BEAST_UI.restoreView(view);
  });
  await page.locator('[data-machine-action="calculate"]').click();
  await waitForCalculation(page, 'calcResult');
  const panel = page.locator('[data-reference-cost-panel="single"]');
  // Two zero-rank bodies: 192 blueprints * 70 + ceil(67 * 600 / 2.7).
  assert.equal(await panel.locator('[data-reference-cost-total]').textContent(), '28,329');
  assert.match(await panel.textContent(), /神图费用 13,440/);
  assert.match(await panel.locator('.machine-reference-cost-beasts').textContent(), /缺少碎片 67.*费用 14,889/);
  await assertReferenceCostPresentation(page);
}

async function calculateFixedSchool(page) {
  await page.locator('[data-machine-calculator-mode="school"]').click();
  await page.locator('[data-school-calc-school]').selectOption('nonAttack');
  await page.evaluate(() => {
    const view = window.MACHINE_BEAST_UI.captureView();
    const draft = view.schoolDraft;
    Object.keys(draft.participating).forEach(id => { draft.participating[id] = false; });
    for (const [id, fragments] of [['mechanical-white-tiger', 13], ['mechanical-vermilion-bird', 8]]) {
      Object.assign(draft.progressByBeast[id], { research: 750000, fragments });
      draft.participating[id] = true;
    }
    draft.progressByBeast['mechanical-bronze-man'].research = 168800;
    Object.assign(draft, { targetStage: 1, useOwnedInventory: false, newRankMode: 'zero' });
    view.schoolResult = null;
    window.MACHINE_BEAST_UI.restoreView(view);
  });
  await page.locator('[data-machine-action="calculate-school"]').click();
  await waitForCalculation(page, 'schoolResult');
  const result = await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult);
  assert.equal(result.valid, true);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].kind, 'merged');
  assert.deepEqual(result.plans[0].beasts.map(item => [item.beastId, item.endLevel, item.resources.fragments]), [
    ['mechanical-white-tiger', 20, 67], ['mechanical-vermilion-bird', 19, 32]
  ]);
  const panel = page.locator('[data-reference-cost-panel="school-0"]');
  // 288 blueprints * 70 + white tiger 14,889 + vermilion bird 7,112.
  assert.equal(await panel.locator('[data-reference-cost-total]').textContent(), '42,161');
  assert.match(await panel.textContent(), /神图费用 20,160/);
  assert.match(await panel.textContent(), /机关兽已知费用 22,001/);
  assert.deepEqual(await panel.locator('.machine-reference-cost-beasts li').allTextContents(), [
    '机关白虎：缺少碎片 67，折算 1.675只，贡献 40,200÷2.7，费用 14,889',
    '机关朱雀：缺少碎片 32，折算 0.8只，贡献 19,200÷2.7，费用 7,112'
  ]);
  await assertReferenceCostPresentation(page);
  return result;
}

async function assertReferenceCostPresentation(page) {
  const totals = await page.locator('[data-reference-cost-total]').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  assert.ok(totals.length > 0, 'complete plans must expose a reference total');
  assert.deepEqual(totals, totals.map(() => 'rgb(255, 107, 99)'));
  const breakdowns = await page.locator('.machine-reference-cost-breakdown').evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      wrap: style.flexWrap,
      items: Array.from(node.children, item => {
        const range = document.createRange();
        range.selectNodeContents(item);
        const rects = Array.from(range.getClientRects());
        const box = item.getBoundingClientRect();
        const parent = node.getBoundingClientRect();
        return {
          text: item.textContent,
          whiteSpace: getComputedStyle(item).whiteSpace,
          lineTops: rects.map(rect => Math.round(rect.top)),
          inside: box.left >= parent.left - 1 && box.right <= parent.right + 1,
          numberColors: Array.from(item.querySelectorAll('b'), value => getComputedStyle(value).color)
        };
      })
    };
  }));
  for (const breakdown of breakdowns) {
    assert.equal(breakdown.display, 'flex');
    assert.equal(breakdown.wrap, 'wrap');
    assert.equal(breakdown.items.length, 5);
    assert.match(breakdown.items[3].text, /^神图费用 .+（单价 .+）$/);
    for (const item of breakdown.items) {
      assert.equal(item.whiteSpace, 'nowrap', item.text);
      assert.ok(item.inside, item.text + ' must stay inside its cost panel');
      assert.ok(Math.max(...item.lineTops) - Math.min(...item.lineTops) <= 3, item.text + ' must occupy one line');
      assert.ok(item.numberColors.every(color => color !== 'rgb(255, 107, 99)'), 'only totals are red');
    }
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
}

async function assertVisibleWithoutOverflow(page, selector) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  assert.equal(await locator.isVisible(), true, selector + ' must be visible');
  const dimensions = await locator.evaluate(node => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    left: node.getBoundingClientRect().left,
    right: node.getBoundingClientRect().right,
    scroll: node.scrollWidth,
    client: node.clientWidth
  }));
  assert.ok(dimensions.page <= dimensions.viewport, JSON.stringify(dimensions));
  assert.ok(dimensions.left >= -1 && dimensions.right <= dimensions.viewport + 1, JSON.stringify(dimensions));
  assert.ok(dimensions.scroll <= dimensions.client + 1, JSON.stringify(dimensions));
}

test('real single plan includes exact blueprint and fragment deficit fees', async () => scenario(calculateFixedSingle));

test('real multi-beast school fees update without rerunning or changing the chosen plan', async () => scenario(async page => {
  const before = await calculateFixedSchool(page);
  await page.evaluate(() => {
    window.__schoolSolveCount = 0;
    const solve = window.MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans;
    window.MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans = function (...args) {
      window.__schoolSolveCount++;
      return solve.apply(this, args);
    };
  });
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('10');
  const panel = page.locator('[data-reference-cost-panel="school-0"]');
  assert.equal(await panel.locator('[data-reference-blueprint-missing]').textContent(), '278');
  assert.equal(await panel.locator('[data-reference-cost-total]').textContent(), '39,793');
  await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').uncheck();
  assert.equal(await panel.locator('[data-reference-cost-total]').textContent(), '40,433');
  assert.deepEqual(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), before);
  assert.equal(await page.evaluate(() => window.__schoolSolveCount), 0);
}));

for (const width of [360, 390, 768, 1100]) {
  test(width + 'px expanded prices and real single/school results remain visible without overflow', async () => scenario(async page => {
    await page.locator('.machine-reference-beast-prices summary').click();
    await assertVisibleWithoutOverflow(page, '.machine-reference-beast-prices');
    await assertVisibleWithoutOverflow(page, '[data-reference-beast-price="mechanical-wing"]');
    await calculateFixedSingle(page);
    await assertVisibleWithoutOverflow(page, '[data-reference-cost-panel="single"]');
    await assertVisibleWithoutOverflow(page, '.machine-result');
    await calculateFixedSchool(page);
    await assertVisibleWithoutOverflow(page, '[data-reference-cost-panel="school-0"]');
    await assertVisibleWithoutOverflow(page, '.machine-school-plan');
    await assertVisibleWithoutOverflow(page, '.machine-school-plan-beast:last-child');
  }, width));
}

test('360px long valid blueprint prices stay on one line in a keyboard-accessible local scroller', async () => scenario(async page => {
  await calculateFixedSingle(page);
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('123456789012345');
  const breakdown = page.locator('[data-reference-cost-panel="single"] .machine-reference-cost-breakdown');
  assert.equal(await page.locator('[data-reference-cost-total]').count(), 1, 'a finite nonnegative long price must remain valid');
  assert.equal(await breakdown.getAttribute('tabindex'), '0');
  assert.equal(await breakdown.getAttribute('role'), 'region');
  assert.equal(await breakdown.getAttribute('aria-label'), '参考成本明细，可横向滚动');
  await breakdown.focus();
  assert.equal(await breakdown.evaluate(node => document.activeElement === node), true);
  const dimensions = await breakdown.evaluate(node => {
    const box = node.getBoundingClientRect();
    const fee = node.children[3];
    const range = document.createRange();
    range.selectNodeContents(fee);
    const style = getComputedStyle(node);
    return {
      overflow: style.overflowX,
      wrap: style.flexWrap,
      scroll: node.scrollWidth,
      client: node.clientWidth,
      itemWidth: fee.getBoundingClientRect().width,
      whiteSpace: getComputedStyle(fee).whiteSpace,
      lineTops: Array.from(range.getClientRects(), rect => Math.round(rect.top)),
      insideViewport: box.left >= -1 && box.right <= document.documentElement.clientWidth + 1,
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    };
  });
  assert.equal(dimensions.overflow, 'auto');
  assert.equal(dimensions.wrap, 'wrap');
  assert.equal(dimensions.whiteSpace, 'nowrap');
  assert.ok(Math.max(...dimensions.lineTops) - Math.min(...dimensions.lineTops) <= 3, 'the complete fee including its unit price must occupy one line');
  assert.ok(dimensions.itemWidth > dimensions.client, 'the fixture must exercise an item wider than the panel');
  assert.ok(dimensions.scroll > dimensions.client, 'overflow must be confined to the cost breakdown');
  assert.equal(dimensions.insideViewport, true);
  assert.equal(dimensions.pageFits, true);
  const end = await breakdown.evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    return {
      left: node.scrollLeft,
      max: node.scrollWidth - node.clientWidth,
      feeRight: node.children[3].getBoundingClientRect().right,
      right: node.getBoundingClientRect().right,
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    };
  });
  assert.ok(end.left > 0, 'the local scroller must move');
  assert.ok(Math.abs(end.left - end.max) <= 1, 'the local scroller must reach its end');
  assert.ok(end.feeRight <= end.right + 1, 'the end of the long fee must be accessible');
  assert.equal(end.pageFits, true);
}, 360));

test('editing stock and price updates the cached single cost without rerunning or detaching inputs', async () => scenario(async page => {
  await calculateSingle(page);
  await page.evaluate(() => {
    window.__solveCount = 0;
    const solve = window.MACHINE_BEAST_CORE.calculateInvestmentPlan;
    window.MACHINE_BEAST_CORE.calculateInvestmentPlan = function (...args) { window.__solveCount++; return solve.apply(this, args); };
  });
  const input = page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]');
  await input.evaluate(node => { window.__priceInput = node; });
  await input.fill('64');
  await input.press('End');
  await input.press('0');
  assert.equal(await input.inputValue(), '640');
  assert.equal(await input.evaluate(node => node === window.__priceInput && document.activeElement === node), true);
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('999999');
  assert.equal(await page.locator('[data-reference-cost-panel="single"] [data-reference-blueprint-missing]').textContent(), '0');
  const saved = await getAccountJson(page, KEY);
  assert.equal(saved.referenceCost.awakeningBlueprintPrice, 640);
  assert.equal(saved.referenceCost.awakeningBlueprintStock, 999999);
  await page.locator('[data-machine-calculator-mode="school"]').click();
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '640');
  assert.equal(await page.evaluate(() => window.__solveCount), 0);
}));

test('invalid stock or price replaces old totals and missing manual prices are not free', async () => scenario(async page => {
  await calculateSingle(page);
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('1.5');
  assert.equal(await page.locator('[data-reference-cost-total]').count(), 0);
  assert.match(await page.locator('[data-reference-cost-panel="single"]').textContent(), /非负整数/);
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('0');
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('');
  assert.equal(await page.locator('[data-reference-cost-total]').count(), 0);
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('70');
  await page.locator('[data-calc-beast]').selectOption('mechanical-wing');
  await page.locator('[data-calc-target]').selectOption('1');
  await page.locator('[data-machine-action="calculate"]').click();
  await waitForCalculation(page, 'calcResult');
  assert.match(await page.locator('[data-reference-cost-panel="single"]').textContent(), /未设置.*机关飞翼|机关飞翼.*未设置/);
  assert.equal(await page.locator('[data-reference-cost-total]').count(), 0);
  assert.notEqual(await page.locator('[data-reference-cost-panel="single"] .machine-reference-cost-error b').evaluate(node => getComputedStyle(node).color), 'rgb(255, 107, 99)');
  await page.locator('.machine-reference-beast-prices summary').click();
  await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('0');
  assert.equal(await page.locator('[data-reference-cost-total]').count(), 1);
}));

test('each school alternative deducts the same stock once from its own aggregated need', async () => scenario(async page => {
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('10');
  await page.evaluate(() => {
    const view = window.MACHINE_BEAST_UI.captureView();
    function plan(kind, required) {
      return { kind, totals: { projectedTotalLevel: 45, investedCount: 0, ownedInvestedCount: 0, newInvestedCount: 0, milestoneCount: 0, overflowResearch: 0, awakeningBlueprints: required, organPieces: 0, fragments: 0, contribution: 0, yuan: 0 }, beasts: [] };
    }
    view.calculatorMode = 'school';
    view.schoolResult = { valid: true, current: { totalLevel: 0 }, target: { stage: 1, totalLevel: 45 }, plans: [plan('free', 25), plan('milestone', 30)] };
    window.MACHINE_BEAST_UI.restoreView(view);
  });
  assert.deepEqual(await page.locator('[data-reference-blueprint-stock]').allTextContents(), ['10', '10']);
  assert.deepEqual(await page.locator('[data-reference-blueprint-missing]').allTextContents(), ['15', '20']);
  assert.deepEqual(await page.locator('[data-reference-cost-total]').allTextContents(), ['1,050', '1,400']);
  await assertReferenceCostPresentation(page);
  assert.equal((await getAccountJson(page, KEY)).referenceCost.awakeningBlueprintStock, 10);
  await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').uncheck();
  assert.deepEqual(await page.locator('[data-reference-blueprint-stock]').allTextContents(), ['0', '0']);
  assert.deepEqual(await page.locator('[data-reference-cost-total]').allTextContents(), ['1,750', '2,100']);
  await assertReferenceCostPresentation(page);
}));

for (const failure of ['false', 'throw']) {
  test('storage ' + failure + ' is visible and preserves previous account data', async () => scenario(async page => {
    await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('7');
    const saved = await getAccountJson(page, KEY);
    await page.evaluate(failureMode => {
      const original = window.QinshiAccounts.setItem;
      window.__originalAccountSetItem = original;
      window.QinshiAccounts.setItem = function (key, value) {
        if (key === 'qinshi_machine_beasts_progress_v1') {
          if (failureMode === 'throw') throw new Error('test storage unavailable');
          return false;
        }
        return original.call(this, key, value);
      };
    }, failure);
    await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('8');
    assert.match(await page.locator('#machine-beast-error').textContent(), /保存失败/);
    assert.match(await page.locator('[data-reference-cost-save-status]').textContent(), /未保存/);
    assert.deepEqual(await getAccountJson(page, KEY), saved);
    await page.locator('[data-machine-beast-mode="progress"]').click();
    await page.locator('[data-machine-action="edit-progress"][data-beast-id="war-demon"]').click();
    await page.locator('[data-edit-field="research"]').fill('123');
    await page.locator('[data-machine-action="save-progress"][data-beast-id="war-demon"]').click();
    assert.equal(await page.locator('[data-edit-field="research"]').inputValue(), '123');
    await page.locator('[data-machine-action="cancel-progress"]').click();
    await page.evaluate(() => { window.QinshiAccounts.setItem = window.__originalAccountSetItem; });
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-machine-action="save-reference-cost"]').click();
    const recovered = await getAccountJson(page, KEY);
    assert.equal(recovered.referenceCost.awakeningBlueprintStock, 8);
    assert.deepEqual(recovered.beasts, saved.beasts, 'a failed beast save must not leak into a later settings save');
  }));
}

test('legacy bare inventory survives settings save and combined labels use fullwidth parentheses', async () => scenario(async page => {
  await setAccountJson(page, KEY, { 'war-demon': { research: 0, fragments: 3, inventory: { none: { 7: 13 } } } });
  await page.reload({ waitUntil: 'networkidle' });
  await enter(page);
  await page.locator('[data-calc-beast]').selectOption('war-demon');
  assert.match(await page.locator('.machine-owned-inventory').textContent(), /（0改）7阶/);
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  assert.equal((await getAccountJson(page, KEY)).beasts['war-demon'].fragments, 3);
  await page.reload({ waitUntil: 'networkidle' });
  await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '64');
}));

test('material sources and source search are readable without narrow-screen overflow', async () => scenario(async page => {
  await page.locator('[data-machine-beast-mode="reference"]').click();
  assert.match(await page.locator('[data-machine-material-sources]').textContent(), /青铜螺栓设计图[\s\S]*53-9/);
  assert.match(await page.locator('[data-machine-material-sources]').textContent(), /幻音宝盒[\s\S]*不参与计算/);
  const sources = page.locator('[data-machine-material-sources]');
  assert.doesNotMatch(await sources.textContent(), /获取来源：|关卡掉落|掉落关卡：|关卡编号为来源查询说明，未变更现有掉落资料。/);
  assert.deepEqual(await sources.locator('.machine-reference-card').filter({ has: page.getByRole('heading', { name: '铅块', exact: true }) }).locator('p').allTextContents(), ['好友副本、聚宝盆']);
  assert.deepEqual(await sources.locator('.machine-reference-card').filter({ has: page.getByRole('heading', { name: '青铜螺栓设计图', exact: true }) }).locator('p').allTextContents(), ['主线关卡53-9、35-10、24-10、11-10掉落']);
  await assertVisibleWithoutOverflow(page, '[data-machine-material-sources]');
  const search = page.locator('[data-machine-search="reference"]');
  assert.match(await search.getAttribute('placeholder'), /来源/);
  await search.fill('尚同墨方');
  await page.waitForFunction(() => document.querySelector('#machine-beast-reference-content').textContent.includes('赤练王蛇') && !document.querySelector('#machine-beast-reference-content').textContent.includes('破土七郎'));
  await page.locator('[data-machine-school-scope="reference-beasts"][data-school-id="nonAttack"]').click();
  assert.match(await page.locator('.machine-beast-reference-card').allTextContents().then(parts => parts.join(' ')), /机关飞翼[\s\S]*尚同墨方/);
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
}, 360));

for (const width of [360, 1100]) {
  test(width + 'px blueprint guide preserves all source figures and confines horizontal scrolling', async () => scenario(async page => {
    await page.locator('[data-machine-beast-mode="reference"]').click();
    const guide = page.locator('[data-machine-blueprint-guide]');
    assert.equal(await guide.locator('h2').textContent(), '机关兽研发材料参考（用图纸版）');
    assert.match(await guide.textContent(), /单只机关兽.*研发等级.*非.*流派阶数/);
    assert.match(await guide.textContent(), /图片参考.*不参与计算.*取整/);
    assert.deepEqual(await guide.locator('thead th').allTextContents(), ['材料', '10级（蓝色）', '15级（紫色）', '20级（一代橙色）', '25级（二代橙色）']);
    assert.equal(await guide.locator('tbody tr').count(), 13);
    assert.deepEqual(await guide.locator('[data-blueprint-guide-plan] > *').allTextContents(), ['投入方案', '270只2阶＋4只0阶', '16只6阶', '9只7阶＋1只6阶＋2只0阶', '13只7阶＋1只6阶＋2只0阶']);
    assert.deepEqual(await guide.locator('[data-blueprint-guide-resource]').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent))), [
      ['青铜螺栓设计图', '540', '224', '212', '300'],
      ['精钢底座设计图', '—（资料未提供）', '288', '234', '330'],
      ['精钢管设计图', '—（资料未提供）', '240', '231', '327'],
      ['玄铁外壳设计图', '—（资料未提供）', '240', '240', '340'],
      ['玄铁关节设计图', '—（资料未提供）', '160', '235', '335'],
      ['玄铁箱设计图', '—（资料未提供）', '80', '50', '70'],
      ['铅块', '5400', '4592', '4625', '6553'],
      ['青铜', '7290', '3648', '3225', '4557'],
      ['精钢', '—（资料未提供）', '1648', '1507', '2131'],
      ['玄铁', '—（资料未提供）', '992', '908', '1284'],
      ['觉醒神图', '636', '1123', '1673', '2275'],
      ['机关破片', '3178', '5611', '8362', '11372']
    ]);
    await assertVisibleWithoutOverflow(page, '[data-machine-blueprint-guide]');
    const dimensions = await guide.locator('.machine-blueprint-guide-scroll').evaluate(node => ({
      overflow: getComputedStyle(node).overflowX, scroll: node.scrollWidth, client: node.clientWidth
    }));
    assert.equal(dimensions.overflow, 'auto');
    if (width === 360) assert.ok(dimensions.scroll > dimensions.client, 'the table should scroll inside its own container');
    await guide.locator('.machine-blueprint-guide-scroll').evaluate(node => { node.scrollLeft = node.scrollWidth; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    assert.equal(await page.locator('[data-machine-material-sources]').evaluate(node => node.nextElementSibling.hasAttribute('data-machine-blueprint-guide')), true);
  }, width));
}

test('account switching keeps reference prices and stock isolated under the existing account key', async () => scenario(async page => {
  const firstId = await page.evaluate(() => window.QinshiAccounts.currentAccount().id);
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('11');
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').uncheck();
  await page.locator('.machine-reference-beast-prices summary').click();
  await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('123.5');
  const secondId = await page.evaluate(() => window.QinshiAccounts.createAccount({ name: '另一测试账号', server: '本地测试服' }).id);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.evaluate(id => window.QinshiAccounts.switchAccount(id), secondId)
  ]);
  await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').inputValue(), '0');
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '70');
  assert.equal(await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').isChecked(), true);
  await page.locator('.machine-reference-beast-prices summary').click();
  assert.equal(await page.locator('[data-reference-beast-price="mechanical-wing"]').inputValue(), '');
  await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('456');
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('22');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.evaluate(id => window.QinshiAccounts.switchAccount(id), firstId)
  ]);
  await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').inputValue(), '11');
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '64');
  assert.equal(await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').isChecked(), false);
  await page.locator('.machine-reference-beast-prices summary').click();
  assert.equal(await page.locator('[data-reference-beast-price="mechanical-wing"]').inputValue(), '123.5');
}));

test('local backup export and actual import restore complete reference settings and beast progress', async () => scenario(async page => {
  await setAccountJson(page, KEY, { beasts: {
    'mechanical-white-tiger': { research: 750000, fragments: 13, inventory: { none: { 7: 2 } } }
  } });
  await page.reload({ waitUntil: 'networkidle' });
  await enter(page);
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('11');
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').uncheck();
  await page.locator('.machine-reference-beast-prices summary').click();
  await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('123.5');
  await page.locator('[data-reference-beast-price="mechanical-bear"]').fill('0');
  const saved = await getAccountJson(page, KEY);
  assert.equal(saved.beasts['mechanical-white-tiger'].research, 750000);
  assert.equal(saved.beasts['mechanical-white-tiger'].fragments, 13);
  assert.equal(saved.beasts['mechanical-white-tiger'].inventory.none['7'], 2);
  assert.equal(saved.referenceCost.useAwakeningBlueprintStock, false);
  assert.equal(saved.referenceCost.beastPrices['mechanical-wing'], 123.5);
  assert.equal(saved.referenceCost.beastPrices['mechanical-bear'], 0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.QinshiSettings.exportBackup())
  ]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const backup = Buffer.concat(chunks).toString('utf8');
  const payload = JSON.parse(backup);
  const physicalKey = await page.evaluate(key => window.QinshiAccountProfiles.physicalKey(window.QinshiAccounts.currentAccount().id, key), KEY);
  assert.deepEqual(JSON.parse(payload.data[physicalKey]), saved);
  // Only this isolated browser context's account storage is replaced; no disk or remote account data.
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('99');
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('134');
  await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').check();
  await page.locator('[data-reference-beast-price="mechanical-wing"]').fill('999');
  await page.locator('[data-reference-beast-price="mechanical-bear"]').fill('45000');
  const changed = await getAccountJson(page, KEY);
  changed.beasts['mechanical-white-tiger'].research = 1;
  changed.beasts['mechanical-white-tiger'].fragments = 0;
  changed.beasts['mechanical-white-tiger'].inventory.none['7'] = 0;
  await setAccountJson(page, KEY, changed);
  assert.notDeepEqual(await getAccountJson(page, KEY), saved);
  page.once('dialog', dialog => dialog.accept());
  const beforeImportDownload = page.waitForEvent('download');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.evaluate(text => window.QinshiSettings.importBackup(new File([text], 'local-reference-settings.json', { type: 'application/json' })), backup)
  ]);
  assert.match((await beforeImportDownload).suggestedFilename(), /^Qin-backup-before-import-/);
  await enter(page);
  assert.deepEqual(await getAccountJson(page, KEY), saved);
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').inputValue(), '11');
  assert.equal(await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').inputValue(), '64');
  assert.equal(await page.locator('[data-reference-cost-field="useAwakeningBlueprintStock"]').isChecked(), false);
  await page.locator('.machine-reference-beast-prices summary').click();
  assert.equal(await page.locator('[data-reference-beast-price="mechanical-wing"]').inputValue(), '123.5');
  assert.equal(await page.locator('[data-reference-beast-price="mechanical-bear"]').inputValue(), '0');
}));
