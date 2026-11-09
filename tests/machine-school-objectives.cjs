// Local-only real browser coverage for school objective inputs and results.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountJson } = require('./browser-test-helpers.cjs');
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
async function enter(page) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="machine-beasts"]').click();
  } else await page.locator('.tab[data-partition="machine-beasts"]').click();
  await page.locator('[data-machine-beast-mode="calculator"]').click();
  await page.locator('[data-machine-calculator-mode="school"]').click();
}
async function scenario(run, width = 1100) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try { await openApp(page, origin); await enter(page); await run(page); assert.deepEqual(errors, []); }
  finally { await context.close(); }
}
async function preparePurple(page, count = 2) {
  await page.evaluate(count => {
    const view = window.MACHINE_BEAST_UI.captureView();
    const draft = view.schoolDraft;
    let remaining = 44;
    for (const id of Object.keys(draft.progressByBeast)) {
      const beast = window.MACHINE_BEAST_DATA.beasts.find(item => item.id === id);
      const level = id === 'eight-claw-centipede' ? 0 : Math.min(remaining, beast.maxLevel);
      remaining -= level;
      Object.assign(draft.progressByBeast[id], { research: window.MACHINE_BEAST_DATA.researchThresholds[level], inventory: {}, fragments: 0 });
      draft.participating[id] = id === 'eight-claw-centipede';
      draft.ownedPoliciesByBeast[id] = { useOwnedInventory: true, limits: {} };
    }
    draft.progressByBeast['eight-claw-centipede'].inventory = { none: { 0: count } };
    draft.ownedPoliciesByBeast['eight-claw-centipede'].limits = { none: { 0: count } };
    Object.assign(draft, { targetStage: 1, useOwnedInventory: true, newRankMode: 'zero', allowNewHighRanks: false, allowNewModifications: false });
    view.schoolResult = null;
    window.MACHINE_BEAST_UI.restoreView(view);
  }, count);
}
async function calculate(page) {
  await page.locator('[data-machine-action="calculate-school"]').click();
  await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().schoolResult != null);
  return page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult);
}
test('blue-purple stock-only switch defaults on and is independent of the global stock switch', async () => scenario(async page => {
  const toggle = page.locator('[data-reference-cost-field="bluePurpleInventoryOnly"]');
  assert.equal(await toggle.count(), 1, 'school settings expose the blue-purple stock-only policy');
  assert.equal(await toggle.isChecked(), true);
  await page.locator('[data-school-option="useOwnedInventory"]').uncheck();
  assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck();
  assert.equal((await getAccountJson(page, 'qinshi_machine_beasts_progress_v1')).referenceCost.bluePurpleInventoryOnly, false);
  await page.reload({ waitUntil: 'networkidle' }); await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="bluePurpleInventoryOnly"]').isChecked(), false);
}));
test('real purple inventory result reports priced resources without pretending body acquisition is free', async () => scenario(async page => {
  await preparePurple(page);
  const result = await calculate(page);
  assert.equal(result.valid, true);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].kind, 'merged');
  const body = page.locator('.machine-school-plan');
  assert.match(await body.textContent(), /两种目标得到相同方案/);
  assert.match(await body.textContent(), /新增解锁效果/);
  assert.match(await body.textContent(), /已计价参考元宝/);
  assert.equal(await body.locator('[data-reference-cost-total]').textContent(), '3,360');
  assert.match(await body.textContent(), /未计价|获取成本未计入/);
  assert.equal(result.plans[0].totals.newInvestedCount, 0);
  assert.equal(result.plans[0].totals.ownedInvestedCount, 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
}, 360));
test('editing any optimization price invalidates cached school results and requires a fresh solve', async () => scenario(async page => {
  await preparePurple(page); await calculate(page);
  await page.evaluate(() => { window.__oldSchoolView = window.MACHINE_BEAST_UI.captureView(); });
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), null);
  assert.equal(await page.locator('#machine-beast-calculator-result').isVisible(), false);
  await page.locator('[data-machine-action="calculate-school"]').focus();
  await page.evaluate(() => window.MACHINE_BEAST_UI.restoreView(window.__oldSchoolView));
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), null, 'navigation history cannot restore a plan optimized at an obsolete price');
  await calculate(page);
  assert.equal(await page.locator('[data-reference-cost-total]').textContent(), '3,072');
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('10');
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), null);
  await calculate(page);
  assert.equal(await page.locator('[data-reference-cost-total]').textContent(), '2,432');
}));
test('invalid price drafts block school solve instead of silently using the last saved price', async () => scenario(async page => {
  await preparePurple(page);
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('');
  await page.locator('[data-machine-action="calculate-school"]').click();
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), null);
  assert.match(await page.locator('#machine-beast-error').textContent(), /单价必须/);
  assert.notEqual(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), 'true');
}));
test('school pricing edits cancel an in-flight real worker and never restore its stale result', async () => scenario(async page => {
  await preparePurple(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested;
  const requestSeen = new Promise(resolve => { requested = resolve; });
  await page.route('**/calculation-worker.js*', async route => {
    requested();
    await gate;
    await route.continue().catch(() => {});
  });
  await page.locator('[data-machine-action="calculate-school"]').click();
  await requestSeen;
  assert.equal(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), 'true');
  await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill('48');
  release();
  assert.equal(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().schoolResult), null);
  assert.notEqual(await page.locator('#machine-beast-calculator-result').getAttribute('aria-busy'), 'true');
  await page.unroute('**/calculation-worker.js*');
  await calculate(page);
  assert.equal(await page.locator('[data-reference-cost-total]').textContent(), '0');
}));
test('a readonly account can use temporary current prices without forcing persistence', async () => scenario(async page => {
  const before = await getAccountJson(page, 'qinshi_machine_beasts_progress_v1');
  const readonly = await page.context().newPage();
  await openApp(readonly, origin);
  assert.equal(await readonly.evaluate(() => window.QinshiAccounts.isReadOnly()), true);
  await enter(readonly); await preparePurple(readonly);
  await readonly.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  await calculate(readonly);
  assert.equal(await readonly.locator('[data-reference-cost-total]').textContent(), '3,072');
  assert.equal(await readonly.locator('#machine-beast-error').isVisible(), false);
  assert.deepEqual(await getAccountJson(page, 'qinshi_machine_beasts_progress_v1'), before);
  await readonly.close();
}));
test('blue-purple policy stays isolated when switching local test accounts', async () => scenario(async page => {
  const first = await page.evaluate(() => window.QinshiAccounts.currentAccount().id);
  await page.locator('[data-reference-cost-field="bluePurpleInventoryOnly"]').uncheck();
  const second = await page.evaluate(() => window.QinshiAccounts.createAccount({ name: '流派隔离测试', server: '本地测试服' }).id);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.evaluate(id => window.QinshiAccounts.switchAccount(id), second)]);
  await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="bluePurpleInventoryOnly"]').isChecked(), true);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }), page.evaluate(id => window.QinshiAccounts.switchAccount(id), first)]);
  await enter(page);
  assert.equal(await page.locator('[data-reference-cost-field="bluePurpleInventoryOnly"]').isChecked(), false);
}));
test('single-beast optimization stays cached while its displayed reference price changes', async () => scenario(async page => {
  await page.locator('[data-machine-calculator-mode="single"]').click();
  await page.locator('[data-calc-beast]').selectOption('war-demon');
  await page.locator('[data-calc-target]').selectOption('1');
  await page.locator('[data-machine-action="calculate"]').click();
  await page.waitForFunction(() => window.MACHINE_BEAST_UI.captureView().calcResult != null);
  const before = await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult);
  const total = await page.locator('[data-reference-cost-total]').textContent();
  await page.locator('[data-reference-cost-field="awakeningBlueprintPrice"]').fill('64');
  assert.deepEqual(await page.evaluate(() => window.MACHINE_BEAST_UI.captureView().calcResult), before);
  assert.notEqual(await page.locator('[data-reference-cost-total]').textContent(), total);
}));
