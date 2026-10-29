const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, setAccountItem } = require('./browser-test-helpers.cjs');

const KEY = 'qinshi_inscription_crafting_v1';
const FAVORITES_KEY = 'qinshi_inscription_route_favorites_v1';
const PROGRESS_KEY = 'qinshi_inscription_progress_v2';
let browser, server, url;
const scriptErrors = [];
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
afterEach(() => assert.deepEqual(scriptErrors.splice(0), [], 'No uncaught browser script errors'));

async function openInscription(page, mode = 'paths') {
  const desktopTab = page.locator('.tab[data-partition="inscription"]');
  if (await desktopTab.isVisible()) await desktopTab.click();
  else {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="inscription"]').click();
  }
  await page.locator('[data-mode="crafting-' + mode + '"]').click();
}
async function pageFor(mode = 'paths', width = 1024, address = url) {
  // Every test owns an isolated browser context and synthetic local accounts.
  const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => scriptErrors.push(error.message));
  await page.route('**/*', route => {
    const requested = new URL(route.request().url());
    return requested.protocol === 'file:' || requested.protocol === 'data:' || ['127.0.0.1', 'localhost'].includes(requested.hostname)
      ? route.continue() : route.abort();
  });
  await openApp(page, address, { waitUntil: 'load' });
  await openInscription(page, mode);
  return page;
}
function section(page, mode = 'paths') { return page.locator('#inscription-crafting-' + mode); }
function field(s, name) { return s.locator('[data-craft-field="' + name + '"]'); }
async function goal(page, { mode = 'paths', dun = '地遁', quality = 'o2', attrs = ['技能穿透', '技能穿透', '技能穿透'] } = {}) {
  const s = section(page, mode);
  await field(s, 'quality').selectOption(quality);
  await field(s, 'dun').selectOption(dun);
  for (let i = 0; i < attrs.length; i++) await field(s, 'attr').nth(i).selectOption(attrs[i]);
  return s;
}
async function generate(s) {
  await s.locator('[data-craft-action="generate"]').click();
  await s.locator('.craft-strategy').first().waitFor({ state: 'visible' });
}
async function workbench(page) { return JSON.parse(await getAccountItem(page, KEY)).draft.simpleWorkbench; }
async function material(s, index, values) {
  for (let i = 0; i < values.length; i++) await s.locator('[data-sim-material="' + index + '"][data-sim-term="' + i + '"]').selectOption(values[i]);
}
async function favoriteCount(page, count) {
  await page.waitForFunction(({ key, count }) => {
    const raw = window.QinshiAccounts.getItem(key);
    return raw !== null && JSON.parse(raw).entries.length === count;
  }, { key: FAVORITES_KEY, count });
}
async function switchAccount(page, id, mode = 'favorites') {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.evaluate(id => window.QinshiAccounts.switchAccount(id, { partition: 'inscription' }), id)
  ]);
  await openInscription(page, mode);
}
async function revealProgressCard(page, name, expectedText) {
  // Progress cards use content-visibility:auto. A visible list container does
  // not imply an off-screen card has rendered text yet; scroll the actual card.
  const card = page.locator('#ins-progress-list .ins-progress-card').filter({ hasText: name });
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(({ name, expectedText }) => {
    const card = Array.from(document.querySelectorAll('#ins-progress-list .ins-progress-card'))
      .find(candidate => candidate.textContent.includes(name));
    return card && card.innerText.includes(expectedText);
  }, { name, expectedText });
  return card;
}

test('独立九遁筛选、固定属性槽和弟子实际位置；非法目标只建议不替换', async () => {
  const page = await pageFor(); try {
    const s = section(page);
    assert.equal(await field(s, 'dun').locator('option').count(), 10);
    assert.equal(await field(s, 'slot').isDisabled(), true);
    assert.equal(await field(s, 'attr').count(), 3);
    await s.locator('[data-craft-action="generate"]').click();
    assert.match(await s.locator('[data-craft-status]').innerText(), /遁位|请选择/);
    await goal(page, { dun: '人遁' });
    await s.locator('[data-craft-action="generate"]').click();
    assert.match(await s.locator('[data-craft-analysis]').innerText(), /无法组成|不会替换/);
    assert.deepEqual(await field(s, 'attr').evaluateAll(els => els.map(el => el.value)), ['技能穿透', '技能穿透', '技能穿透']);
    assert.equal(await s.locator('.craft-strategy').count(), 0);
    await field(s, 'quality').selectOption('b2');
    assert.equal(await field(s, 'attr').count(), 1);
    await field(s, 'quality').selectOption('p1');
    assert.equal(await field(s, 'attr').count(), 2);
    await field(s, 'search').fill('墨眉天明');
    await s.locator('[data-craft-action="choose-disciple"]').click();
    assert.equal(await field(s, 'slot').locator('option').count(), 2);
    assert.match(await field(s, 'slot').innerText(), /天府 · 龙遁/);
    assert.equal(await field(s, 'dun').isDisabled(), true);
    await field(s, 'slot').selectOption('天府|龙遁');
    assert.equal(await field(s, 'dun').inputValue(), '龙遁');
  } finally { await page.close(); }
});

test('弟子建议支持键盘；改搜索词保留已选弟子、实际位置和共享存档', async () => {
  const page = await pageFor(); try {
    const s = section(page), search = field(s, 'search');
    await search.fill('墨眉天明'); await search.press('ArrowDown');
    assert.equal(await s.locator('[data-craft-suggestions] [role="option"][aria-selected="true"]').count(), 1);
    await search.press('Enter'); await field(s, 'slot').selectOption('天府|龙遁');
    const before = (await workbench(page)).target;
    await search.fill('盖聂');
    assert.match(await s.locator('[data-craft-suggestions]').innerText(), /盖聂/);
    assert.deepEqual((await workbench(page)).target, before);
    assert.equal(await field(s, 'slot').inputValue(), '天府|龙遁');
    await page.locator('[data-mode="query"]').click();
    await page.locator('[data-mode="crafting-paths"]').click();
    assert.equal(await search.inputValue(), '墨眉天明');
    await page.reload({ waitUntil: 'load' }); await openInscription(page);
    assert.deepEqual((await workbench(page)).target, before);
    assert.equal(await field(s, 'slot').inputValue(), '天府|龙遁');
  } finally { await page.close(); }
});

test('地三穿完整代表路线逐图可展开，紫色洗练无中档，失败复用有真实来源', async () => {
  const page = await pageFor(); try {
    const s = await goal(page); await generate(s);
    assert.equal(await s.locator('.craft-strategy').count(), 2);
    assert.match(await s.locator('[data-craft-analysis]').innerText(), /6%.*5%.*4%/s);
    assert.match(await s.locator('[data-craft-results]').innerText(), /置换概率未知|置换概率.*未知/s);
    for (const route of await s.locator('.craft-strategy').all()) {
      if (!(await route.evaluate(el => el.open))) await route.locator('summary').first().click();
      await route.locator('svg.craft-flow-svg').waitFor();
      assert.equal(await route.locator('svg').count(), 1, 'One complete SVG per route');
      assert.ok(await route.locator('.craft-flow-connection').count() > 0);
      assert.match(await route.innerText(), /失败品复用\d|失败结果/);
    }
    const audit = await page.evaluate(() => {
      const R = window.InscriptionRules, P = window.InscriptionPaths, F = window.InscriptionRouteFavorites;
      const target = window.InscriptionCraftingState.createWorkbench(window.QinshiAccounts).inspect().state.target;
      const plan = P.representative({ prefix: '天府', dun: target.dun, quality: target.quality, attrs: target.attrs });
      const nodes = [];
      function visit(node) { nodes.push(node); node.children.forEach(child => visit(child.node)); }
      plan.strategies.forEach(route => { visit(route.tree); route.reuse.forEach(visit); });
      return {
        invalid: nodes.filter(node => !R.validate(node.material).valid).length,
        badWash: nodes.filter(node => node.kind === 'wash' && (node.children.length || node.material.origin !== 'wash' || /^p/.test(node.material.quality) && node.material.terms.some(t => t.tier === 'M'))).length,
        washCount: nodes.filter(node => node.kind === 'wash').length,
        reuse: plan.strategies.map(route => F.rehydrate(F.prepare(route, target, plan.xAttr), window.INSCRIPTION_DATA.items).reuse.length)
      };
    });
    assert.equal(audit.invalid, 0); assert.equal(audit.badWash, 0); assert.ok(audit.washCount > 0);
    assert.deepEqual(audit.reuse, [1, 1], 'Failure reuse must match actual producer outcomes');
    await goal(page, { dun: '人遁', attrs: ['技能穿透', '技能穿透', 'PVP伤害'] }); await generate(s);
    assert.equal(await s.locator('.craft-strategy').count(), 2);
    assert.match(await s.locator('[data-craft-results]').innerText(), /等概率模型/);
    assert.match(await s.locator('svg').first().textContent(), /技能穿透/);
  } finally { await page.close(); }
});

test('模拟材料联动禁止紫色低中混洗、同档重复及三个高档，未填满不可合成', async () => {
  const page = await pageFor('simulator'); try {
    const s = await goal(page, { mode: 'simulator' });
    await s.locator('[data-sim-stage]').selectOption('p2');
    await material(s, 0, ['技能穿透:L']);
    const second = s.locator('[data-sim-material="0"][data-sim-term="1"]');
    assert.equal(await second.locator('option[value="技能穿透:M"]').count(), 0);
    assert.equal(await second.locator('option[value="技能穿透:L"]').count(), 0);
    await second.selectOption('技能穿透:H'); await material(s, 1, ['技能穿透:M', '技能穿透:H']);
    assert.equal(await s.locator('[data-craft-action="roll"]').isEnabled(), true);
    assert.match(await s.locator('[data-craft-preview]').innerText(), /组合/);
    page.once('dialog', dialog => dialog.accept()); await s.locator('[data-sim-stage]').selectOption('o1');
    await material(s, 0, ['技能穿透:H', '防:H']);
    assert.equal(await s.locator('[data-sim-material="0"][data-sim-term="2"] option[value$=":H"]').count(), 0);
    assert.equal(await s.locator('[data-craft-action="roll"]').isDisabled(), true);
  } finally { await page.close(); }
});

for (const [dun, speed] of [['鬼遁', '速'], ['龙遁', 'PVP速']]) test(dun + '蓝二同速双料17种合法结果，重抽保留材料且不猜蓝色档位', async () => {
  const page = await pageFor('simulator'); try {
    const s = await goal(page, { mode: 'simulator', dun, quality: 'p1', attrs: [speed, speed] });
    assert.equal((await s.locator('[data-sim-term]').first().locator('option').allTextContents()).filter(t => t.includes(speed) && t.includes('档位不可辨')).length, 1);
    await material(s, 0, [speed + ':?']); await material(s, 1, [speed + ':?']);
    await s.locator('[data-craft-preview] summary').click();
    assert.match(await s.locator('[data-craft-preview] summary').innerText(), /17种组合/);
    assert.equal(await s.locator('[data-craft-preview] tbody tr').count(), 17);
    const preview = await page.evaluate(() => window.InscriptionCraftingState.preview(window.InscriptionCraftingState.createWorkbench(window.QinshiAccounts).inspect().state));
    assert.equal(preview.outcomes.length, 17);
    assert.ok(preview.outcomes.every(o => Math.abs(o.probability - 1 / 17) < 1e-12));
    assert.ok(preview.outcomes.some(o => o.material.terms.some(t => t.attr === speed && t.tier === 'M')));
    await s.locator('[data-craft-action="roll"]').click();
    const before = await workbench(page);
    await s.locator('[data-craft-action="retry"]').click();
    const after = await workbench(page);
    assert.deepEqual(after.simulation.inputs, before.simulation.inputs);
    assert.notEqual(after.simulation.pending.id, before.simulation.pending.id);
    assert.equal(await s.locator('[data-craft-action="next"]').isDisabled(), true);
    await s.locator('[data-craft-action="repeat"]').click();
    assert.equal((await workbench(page)).simulation.pending, null);
    assert.deepEqual((await workbench(page)).simulation.inputs, before.simulation.inputs);
    assert.equal(await s.locator('[data-craft-action="roll"]').isEnabled(), true);
  } finally { await page.close(); }
});

test('两页共享目标，切页重载保留pending；下一阶段只带一枚产物且不改旧库存', async () => {
  const page = await pageFor('simulator'); try {
    await page.evaluate(() => {
      const store = window.InscriptionCraftingState.createStore(window.QinshiAccounts);
      const savedMaterial = { prefix: '天府', dun: '鬼遁', quality: 'b2', origin: 'wash', terms: [{ attr: '防', tier: 'H' }] };
      store.setActual(savedMaterial, 7);
      const id = store.saveGoal({ name: '保留旧目标', prefix: '天府', dun: '鬼遁', quality: 'p1', attrs: ['速', '防'] });
      store.copyActual(id);
    });
    const s = await goal(page, { mode: 'simulator', dun: '鬼遁', attrs: ['速', '速', '速'] });
    await material(s, 0, ['速:?']); await material(s, 1, ['防:H']);
    await s.locator('[data-craft-action="roll"]').click();
    const before = await workbench(page), legacy = JSON.parse(await getAccountItem(page, KEY));
    await page.locator('[data-mode="crafting-paths"]').click();
    assert.equal(await field(section(page), 'dun').inputValue(), '鬼遁');
    assert.deepEqual(await field(section(page), 'attr').evaluateAll(els => els.map(el => el.value)), ['速', '速', '速']);
    await page.locator('[data-mode="query"]').click(); await page.locator('[data-mode="crafting-simulator"]').click();
    assert.deepEqual((await workbench(page)).simulation, before.simulation);
    await page.reload({ waitUntil: 'load' }); await openInscription(page, 'simulator');
    assert.deepEqual((await workbench(page)).simulation, before.simulation);
    assert.equal(await s.locator('[data-craft-pending] .craft-pending').isVisible(), true);
    await s.locator('[data-craft-action="next"]').click();
    const after = await workbench(page);
    assert.equal(after.simulation.stage, 'p1'); assert.equal(after.simulation.pending, null);
    assert.deepEqual(after.simulation.inputs[0], before.simulation.pending.material.terms);
    assert.deepEqual(after.simulation.inputs.slice(1), [[null, null], [null, null]]);
    assert.equal(await s.locator('[data-craft-action="next"]').count(), 0);
    const saved = JSON.parse(await getAccountItem(page, KEY));
    for (const name of ['actual', 'goals', 'workspaces']) assert.deepEqual(saved[name], legacy[name]);
    assert.equal(await s.locator('[data-craft-material-editor], [data-craft-actual], [data-craft-field="saved-goal"]').count(), 0);
  } finally { await page.close(); }
});

test('不兼容目标切换须确认，取消保留材料，接受后两页共同重置', async () => {
  const page = await pageFor('simulator'); try {
    const s = await goal(page, { mode: 'simulator', dun: '鬼遁', attrs: ['速', '速', '速'] });
    await material(s, 0, ['速:?']); const before = await workbench(page);
    page.once('dialog', d => d.dismiss()); await field(s, 'dun').selectOption('龙遁');
    assert.deepEqual(await workbench(page), before); assert.equal(await field(s, 'dun').inputValue(), '鬼遁');
    page.once('dialog', d => d.accept()); await field(s, 'dun').selectOption('龙遁');
    assert.deepEqual((await workbench(page)).simulation, { stage: 'b2', inputs: [], pending: null });
    await page.locator('[data-mode="crafting-paths"]').click();
    assert.equal(await field(section(page), 'dun').inputValue(), '龙遁');
    assert.deepEqual(await field(section(page), 'attr').evaluateAll(els => els.map(el => el.value)), ['', '', '']);
    assert.match(await section(page).locator('[data-craft-analysis]').innerText(), /选满当前品质/);
  } finally { await page.close(); }
});

test('数值表全部品质与真实获取方式，蓝速仅显示不可辨档位', async () => {
  const page = await pageFor(); try {
    const s = await goal(page, { dun: '鬼遁', attrs: ['速', '速', '速'] });
    await s.locator('.craft-values summary').click();
    assert.deepEqual(await s.locator('.craft-matrix thead th').allTextContents(), ['属性', '蓝二', '紫一', '紫二', '橙一', '橙二']);
    const cells = s.locator('.craft-matrix tbody tr').first().locator('td');
    assert.match(await cells.nth(0).innerText(), /1速.*档位不可辨/s);
    assert.doesNotMatch(await cells.nth(0).innerText(), /高档|中档/);
    const sources = await cells.nth(2).locator('div').allTextContents();
    assert.ok(sources.some(t => /中档/.test(t) && /合成/.test(t) && !/置换/.test(t)));
    assert.ok(sources.some(t => /低档/.test(t) && /置换/.test(t) && !/合成/.test(t)));
  } finally { await page.close(); }
});

test('X可选符号A或具体B，改X保留模拟现场，不可用紫色来源明确说明', async () => {
  const page = await pageFor('simulator'); try {
    const simulator = await goal(page, { mode: 'simulator', dun: '鬼遁', attrs: ['速', '速', '速'] });
    await material(simulator, 0, ['速:?']); await material(simulator, 1, ['速:?']);
    const scene = (await workbench(page)).simulation;
    await page.locator('[data-mode="crafting-paths"]').click();
    const s = section(page), x = field(s, 'x-term');
    assert.equal(await x.inputValue(), ''); await generate(s);
    assert.match(await s.locator('[data-craft-results]').innerText(), /符号模板 A|同一种合法不分档/);
    await x.selectOption('防:H'); await generate(s);
    assert.match(await s.locator('[data-craft-results]').innerText(), /具体模式 B|具体杂词 X/);
    assert.deepEqual((await workbench(page)).target.xTerm, { attr: '防', tier: 'H' });
    assert.deepEqual((await workbench(page)).simulation, scene);
    await x.selectOption('血:M'); await s.locator('[data-craft-action="generate"]').click();
    await s.locator('[data-craft-status]').filter({ hasText: '紫二' }).waitFor();
    assert.match(await s.locator('[data-craft-status]').innerText(), /紫二低档＋X.*合法.*来源/);
    assert.equal(await s.locator('.craft-strategy').count(), 0);
    assert.deepEqual((await workbench(page)).simulation, scene);
    await x.selectOption(''); await generate(s);
    assert.deepEqual((await workbench(page)).simulation, scene);
  } finally { await page.close(); }
});

test('失败结果展开收起及缩放保持单张SVG，重绘保留比例', async () => {
  const page = await pageFor(); try {
    const s = await goal(page); await generate(s);
    const body = s.locator('.craft-strategy-body').first();
    assert.equal(await body.locator('svg').count(), 1);
    const closed = await body.locator('svg').textContent();
    await body.locator('[data-craft-action="diagram-in"]').click();
    assert.equal(await body.locator('[data-flow-viewer]').getAttribute('data-zoom'), '1');
    await body.locator('[data-craft-action="diagram-failures"]').click();
    assert.equal(await body.locator('[data-craft-action="diagram-failures"]').getAttribute('aria-expanded'), 'true');
    assert.equal(await body.locator('[data-flow-viewer]').getAttribute('data-zoom'), '1');
    assert.equal(await body.locator('svg').textContent(), closed);
    assert.equal(await body.locator('[data-flow-details]').isVisible(), true);
    assert.match(await body.locator('[data-flow-details]').innerText(), /失败橙一|失败紫一|失败紫二|失败橙二/);
    assert.equal(await body.locator('svg').count(), 1);
    await body.locator('[data-craft-action="diagram-failures"]').click();
    assert.equal(await body.locator('[data-craft-action="diagram-failures"]').getAttribute('aria-expanded'), 'false');
    await body.locator('[data-craft-action="diagram-out"]').click();
    assert.equal(await body.locator('[data-flow-viewer]').getAttribute('data-zoom'), '0.9');
    await body.locator('[data-craft-action="diagram-in"]').click(); await body.locator('[data-craft-action="diagram-reset"]').click();
    assert.equal(await body.locator('[data-craft-action="diagram-reset"]').innerText(), '90%');
  } finally { await page.close(); }
});

test('收藏增删筛选、重复属性、统一置顶与账号隔离，不改变目标或模拟', async () => {
  const page = await pageFor(); try {
    const s = await goal(page); await generate(s);
    const first = await page.evaluate(() => window.QinshiAccounts.currentAccount().id), target = await workbench(page);
    await s.locator('[data-craft-action="toggle-favorite"]').last().click(); await favoriteCount(page, 1);
    assert.equal(await s.locator('.craft-strategy').first().getAttribute('data-route-index'), '1');
    assert.equal(await s.locator('.craft-strategy').first().locator('[aria-pressed="true"]').count(), 1);
    await page.locator('[data-mode="crafting-favorites"]').click();
    const favorites = section(page, 'favorites');
    assert.equal(await favorites.locator('.craft-favorite-route').count(), 1);
    await favorites.locator('[data-favorite-field="dun"]').selectOption('地遁');
    for (let i = 0; i < 3; i++) await favorites.locator('[data-favorite-field="attr' + i + '"]').selectOption('技能穿透');
    assert.match(await favorites.locator('[data-favorite-count]').innerText(), /显示 1 \/ 1/);
    await favorites.locator('[data-favorite-field="attr2"]').selectOption('防');
    assert.equal(await favorites.locator('.craft-favorite-route').count(), 0);
    await favorites.locator('[data-favorite-clear]').click(); await favorites.locator('.craft-favorite-route summary').click();
    await favorites.locator('svg').waitFor(); assert.equal(await favorites.locator('svg').count(), 1);
    assert.deepEqual(await workbench(page), target);
    const original = await getAccountItem(page, FAVORITES_KEY), originalWorkbench = await getAccountItem(page, KEY);
    const second = await page.evaluate(() => window.QinshiAccounts.createAccount({ name: '铭文隔离测试账号', server: '测试服' }).id);
    await switchAccount(page, second);
    assert.equal(await getAccountItem(page, FAVORITES_KEY), null);
    assert.equal(await getAccountItem(page, KEY), null);
    assert.equal(await favorites.locator('.craft-favorite-route').count(), 0);
    await switchAccount(page, first);
    assert.equal(await getAccountItem(page, FAVORITES_KEY), original);
    assert.equal(await getAccountItem(page, KEY), originalWorkbench);
    assert.equal(await favorites.locator('.craft-favorite-route').count(), 1);
    await favorites.locator('[data-favorite-remove]').click(); await favoriteCount(page, 0);
    assert.equal(await favorites.locator('.craft-favorite-route').count(), 0);
    await page.locator('[data-mode="crafting-paths"]').click(); await generate(s);
    assert.equal(await s.locator('[aria-pressed="true"]').count(), 0);
  } finally { await page.close(); }
});

test('损坏合成存档保留raw并禁写，写入false不悄悄更新共享目标', async () => {
  const page = await pageFor(); try {
    await setAccountItem(page, KEY, '{broken'); await page.reload({ waitUntil: 'load' }); await openInscription(page);
    const s = section(page);
    assert.match(await s.locator('[data-craft-status]').innerText(), /损坏|读取|存档/);
    assert.equal(await field(s, 'quality').isDisabled(), true);
    assert.equal(await getAccountItem(page, KEY), '{broken');
    await setAccountItem(page, KEY, JSON.stringify({ schemaVersion: 1, idSequence: 0, actual: [], goals: [], workspaces: {}, draft: {} }));
    await page.reload({ waitUntil: 'load' }); await openInscription(page);
    const before = await getAccountItem(page, KEY);
    await page.evaluate(() => { window.craftingWriteAttempts = 0; window.QinshiAccounts.setItem = () => { window.craftingWriteAttempts++; return false; }; });
    await field(s, 'dun').selectOption('地遁');
    assert.match(await s.locator('[data-craft-status]').innerText(), /保存|写入/);
    assert.equal(await field(s, 'dun').inputValue(), '');
    assert.ok(await page.evaluate(() => window.craftingWriteAttempts > 0));
    assert.equal(await getAccountItem(page, KEY), before);
  } finally { await page.close(); }
});

test('收藏写入拒绝及损坏存档显式报错，不伪造成功或覆盖原文', async () => {
  const page = await pageFor(); try {
    const s = await goal(page); await generate(s);
    await page.evaluate(() => {
      const original = window.QinshiAccounts.setItem;
      window.QinshiAccounts.setItem = (key, value) => key === 'qinshi_inscription_route_favorites_v1' ? false : original(key, value);
    });
    await s.locator('[data-craft-action="toggle-favorite"]').first().click();
    await s.locator('[data-craft-status]').filter({ hasText: '收藏未成功保存' }).waitFor();
    assert.equal(await getAccountItem(page, FAVORITES_KEY), null);
    assert.equal(await s.locator('[aria-pressed="true"]').count(), 0);
    await page.reload({ waitUntil: 'load' }); await openInscription(page);
    await setAccountItem(page, FAVORITES_KEY, '{broken');
    await page.locator('[data-mode="crafting-favorites"]').click();
    assert.match(await section(page, 'favorites').locator('[data-favorite-status]').innerText(), /读取失败.*原始数据已保留/);
    assert.equal(await getAccountItem(page, FAVORITES_KEY), '{broken');
  } finally { await page.close(); }
});

for (const width of [360, 390, 768, 1024, 1440]) test(width + ' 真实导航、响应式表单和局部滚动流程可用', async () => {
  const page = await pageFor('paths', width); try {
    const s = await goal(page); await generate(s); await s.locator('svg').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await s.locator('input,select,button').evaluateAll(els => els.filter(el => el.getClientRects().length).some(el => {
      const r = el.getBoundingClientRect(); return r.width < 1 || r.left < -1 || r.right > innerWidth + 1;
    })), false);
    const viewport = s.locator('.craft-flow-viewport').first();
    const geometry=await viewport.evaluate(el=>{const svg=el.querySelector('svg');return {scroll:el.scrollWidth,width:el.clientWidth,drawing:svg.getBoundingClientRect().width,natural:Number(svg.dataset.flowWidth)*0.9};});
    assert.ok(Math.abs(geometry.drawing-geometry.natural)<=1, 'The default scale preserves the full graph');
    assert.equal(geometry.scroll>geometry.width+1, geometry.natural>geometry.width+1);
    const output = path.join(__dirname, '../test-results/inscription-crafting');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'paths-' + width + '.png') });
    await viewport.screenshot({ path: path.join(output, 'flow-' + width + '.png') });
  } finally { await page.close(); }
});

test('file协议共享规则和真实入口可以生成完整路线', async () => {
  const page = await pageFor('paths', 1024, 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/')); try {
    const s = await goal(page); await generate(s);
    assert.equal(await s.locator('.craft-strategy').count(), 2);
    assert.equal(await s.locator('svg').first().getAttribute('role'), 'img');
  } finally { await page.close(); }
});

test('个人进度六品质含蓝一蓝二、固定词条、品质条数及合法来源约束', async () => {
  const page = await pageFor(); try {
    await page.locator('[data-mode="progress"]').click();
    await page.locator('#ins-progress-search').fill('神鬼谷盖聂');
    await page.locator('#ins-progress-suggestions button').first().click();
    const row = page.locator('.ins-editor-slot[data-tian="天同"]');
    assert.deepEqual(await row.locator('.ins-edit-quality option').allTextContents(), ['蓝一', '蓝二', '紫一', '紫二', '橙一', '橙二']);
    assert.equal(await row.locator('input').count(), 0, 'Complete fixed terms, not arbitrary free text');
    await row.locator('.ins-edit-quality').selectOption('b1');
    assert.equal(await row.locator('.ins-edit-sub:visible').count(), 1);
    assert.equal(await row.locator('.ins-edit-sub option[value="技能穿透:?"]').count(), 3, 'Blue-one equal-value tiers must remain indistinguishable');
    await row.locator('.ins-edit-sub').first().selectOption('技能穿透:?');
    page.once('dialog', d => d.dismiss()); await row.locator('.ins-edit-quality').selectOption('b2');
    assert.equal(await row.locator('.ins-edit-quality').inputValue(), 'b1');
    assert.equal(await row.locator('.ins-edit-sub').first().inputValue(), '技能穿透:?');
    page.once('dialog', d => d.accept()); await row.locator('.ins-edit-quality').selectOption('b2');
    assert.equal(await row.locator('.ins-edit-sub:visible').count(), 1);
    await row.locator('.ins-edit-quality').selectOption('p2');
    assert.equal(await row.locator('.ins-edit-sub:visible').count(), 2);
    await row.locator('.ins-edit-sub').first().selectOption('技能穿透:L');
    // Read native option.disabled: Playwright's isDisabled() does not report
    // disabled <option>s consistently, although the select correctly blocks them.
    assert.equal(await row.locator('.ins-edit-sub').nth(1).locator('option[value="技能穿透:M"]').evaluate(option => option.disabled), true);
    assert.equal(await row.locator('.ins-edit-sub').nth(1).locator('option[value="技能穿透:L"]').evaluate(option => option.disabled), true);
    await row.locator('.ins-edit-sub').nth(1).selectOption('技能穿透:H');
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved = JSON.parse(await getAccountItem(page, PROGRESS_KEY))['红色神将\u0000神鬼谷盖聂'].slots.find(slot => slot.tian === '天同');
    assert.equal(saved.quality, '紫色'); assert.equal(saved.star, '2');
    assert.deepEqual(saved.subValues, ['+2%', '+4%', '']); assert.deepEqual(saved.subTiers, ['L', 'H', '']);
  } finally { await page.close(); }
});

test('旧异常铭文加载切页不改raw，明确修正合法三档且保留其他弟子原文', async () => {
  const page = await pageFor(); try {
    const untouched = { name: '墨眉天明', quality: '普通橙色', slots: [{ tian: '天府', shield: '龙盾', quality: '橙色', star: '2', sub: '3PVP速', subValues: ['旧文本'] }] };
    const raw = JSON.stringify({ '红色神将\u0000神鬼谷盖聂': { name: '神鬼谷盖聂', quality: '红色神将', slots: [{ tian: '天同', shield: '地盾', quality: '橙色', star: '2', subs: ['技能穿透', '技能穿透', '技能穿透'], subValues: ['+99%', '旧备注', ''] }] }, '普通橙色\u0000墨眉天明': untouched });
    await setAccountItem(page, PROGRESS_KEY, raw); await page.reload({ waitUntil: 'load' }); await openInscription(page);
    await page.locator('[data-mode="progress"]').click();
    const historicalCard = await revealProgressCard(page, '神鬼谷盖聂', '旧备注');
    assert.match(await historicalCard.innerText(), /99%.*旧备注/s);
    assert.match(await historicalCard.innerText(), /历史记录警告/);
    await page.locator('[data-mode="reference"]').click();
    assert.match(await page.locator('#inscription-reference').innerText(), /天遁（极致：攻、暴击伤害）/);
    assert.match(await page.locator('#inscription-reference').innerText(), /云遁（极致：护盾、技免）/);
    assert.equal(await getAccountItem(page, PROGRESS_KEY), raw);
    await page.locator('[data-mode="progress"]').click(); await page.locator('#ins-progress-search').fill('神鬼谷盖聂');
    await page.locator('#ins-progress-suggestions button').first().click();
    const row = page.locator('.ins-editor-slot[data-tian="天同"]');
    assert.equal(await getAccountItem(page, PROGRESS_KEY), raw);
    for (let i = 0; i < 3; i++) await row.locator('.ins-edit-sub').nth(i).selectOption(['技能穿透:H', '技能穿透:M', '技能穿透:L'][i]);
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved = JSON.parse(await getAccountItem(page, PROGRESS_KEY));
    assert.deepEqual(saved['普通橙色\u0000墨眉天明'], untouched);
    assert.deepEqual(saved['红色神将\u0000神鬼谷盖聂'].slots.find(slot => slot.tian === '天同').subValues, ['+6%', '+5%', '+4%']);
  } finally { await page.close(); }
});

async function openLegacyRemarkEditor(page){
  const raw=JSON.stringify({'红色神将\u0000神鬼谷盖聂':{name:'神鬼谷盖聂',quality:'红色神将',slots:[
    {tian:'天府',shield:'人遁',quality:'橙色',star:'2',subs:['','',''],subValues:['旧备注，数值待确认','','']},
    {tian:'天同',shield:'地遁',quality:'橙色',star:'2',subs:['技能穿透','技能穿透','技能穿透'],subValues:['+6%','+5%','+4%']}
  ]}});
  await setAccountItem(page,'qinshi_inscription_progress_v2',raw);await page.reload();
  await openInscription(page);await page.locator('[data-mode="progress"]').click();
  assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw,'loading must not rewrite the historical remark');
  await revealProgressCard(page,'神鬼谷盖聂','旧备注，数值待确认');
  assert.match(await page.locator('#ins-progress-list').innerText(),/旧备注，数值待确认/);
  await page.locator('[data-edit-key]').first().click();
  assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw,'opening the editor must not rewrite the remark');
  const remarkRow=page.locator('.ins-editor-slot[data-tian="天府"]');
  assert.equal(await remarkRow.locator('.ins-edit-sub').first().inputValue(),'__legacy__');
  assert.match(await remarkRow.innerText(),/旧备注，数值待确认/);
  return {raw,remarkRow,otherRow:page.locator('.ins-editor-slot[data-tian="天同"]')};
}

test('未改动的旧空属性备注保存后仍原样保留',async()=>{
  const page=await pageFor();try{
    const {raw}=await openLegacyRemarkEditor(page);
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const before=JSON.parse(raw)['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府');
    const after=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府');
    assert.deepEqual(after,before);
    await revealProgressCard(page,'神鬼谷盖聂','旧备注，数值待确认');
    assert.match(await page.locator('#ins-progress-list').innerText(),/旧备注，数值待确认/);
  }finally{await page.close();}
});

test('旧空属性备注不能因修改同弟子另一合法槽位而被顺带清除',async()=>{
  const page=await pageFor();try{
    const {raw,otherRow}=await openLegacyRemarkEditor(page);
    await otherRow.locator('.ins-edit-sub').nth(2).selectOption('治疗效果:U');
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'];
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府'),JSON.parse(raw)['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府'));
    assert.equal(saved.slots.find(slot=>slot.tian==='天同').subs[2],'治疗效果');
    assert.equal(saved.slots.find(slot=>slot.tian==='天同').subValues[2],'+6%');
  }finally{await page.close();}
});

test('旧空属性备注只有用户明确清空后才可保存为空草稿',async()=>{
  const page=await pageFor();try{
    const {remarkRow}=await openLegacyRemarkEditor(page);
    await remarkRow.locator('.ins-edit-sub').first().selectOption('');
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'];
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府').subs,['','','']);
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府').subValues,['','','']);
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天同').subValues,['+6%','+5%','+4%']);
    assert.equal(await page.locator('#ins-progress-editor .ins-editor').count(),0);
    await revealProgressCard(page,'神鬼谷盖聂','未填写草稿');
    assert.match(await page.locator('#ins-progress-list').innerText(),/未填写草稿/);
  }finally{await page.close();}
});
