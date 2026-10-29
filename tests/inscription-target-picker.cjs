const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, setAccountItem } = require('./browser-test-helpers.cjs');

const KEY = 'qinshi_inscription_crafting_v1';
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
async function openMode(page, mode = 'paths') {
  const tab = page.locator('.tab[data-partition="inscription"]');
  if (await tab.isVisible()) await tab.click();
  else {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="inscription"]').click();
  }
  await page.locator('[data-mode="crafting-' + mode + '"]').click();
  return page.locator('#inscription-crafting-' + mode);
}
async function pageFor(width = 1024, touch = false) {
  const page = await browser.newPage({ viewport: { width, height: 950 }, hasTouch: touch, serviceWorkers: 'block' });
  page.on('pageerror', error => scriptErrors.push(error.message));
  page.setDefaultTimeout(6000);
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await openApp(page, url, { waitUntil: 'load' });
  await openMode(page);
  return page;
}
function field(s, name) { return s.locator('[data-craft-field="' + name + '"]'); }
function trigger(s, index) { return s.locator('[data-craft-attr-trigger][data-index="' + index + '"]'); }
function option(s, index, value) { return s.locator('[data-craft-attr-option][data-index="' + index + '"][data-value="' + value + '"]'); }
async function choose(s, index, value) { await trigger(s, index).click(); await option(s, index, value).click(); }
async function attrs(s) { return field(s, 'attr').evaluateAll(els => els.map(el => el.value)); }
async function target(page) { return JSON.parse(await getAccountItem(page, KEY)).draft.simpleWorkbench.target; }

test('鬼遁橙二冲突候选可解释但不写入，合法候选保留其他槽并同步模拟页', async () => {
  const page = await pageFor(); try {
    const s = page.locator('#inscription-crafting-paths');
    await field(s, 'dun').selectOption('鬼遁');
    assert.equal(await trigger(s, 0).count(), 1, 'Target attributes have visible custom triggers');
    assert.equal(await field(s, 'attr').first().evaluate(el => getComputedStyle(el).opacity), '0', 'Native selects are visually hidden compatibility bridges only');
    await choose(s, 0, '暴击伤害'); await choose(s, 1, '暴击伤害');
    await trigger(s, 2).click();
    assert.equal(await option(s, 2, '暴击伤害').getAttribute('aria-disabled'), 'true');
    assert.equal(await option(s, 2, '速').getAttribute('aria-disabled'), 'false');
    const saved = await getAccountItem(page, KEY);
    // aria-disabled communicates rejection without using native disabled: the
    // item still accepts a real click to explain the conflict.
    await option(s, 2, '暴击伤害').click({ force: true });
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '']);
    assert.equal(await getAccountItem(page, KEY), saved, 'Rejected options never write storage');
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配.*暴击伤害.*不同合法档位/s);
    await option(s, 2, '速').click();
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '速']);
    assert.equal(await trigger(s, 2).evaluate(el => el === document.activeElement), true, 'Selection keeps keyboard focus');
    const sim = await openMode(page, 'simulator');
    assert.deepEqual(await attrs(sim), ['暴击伤害', '暴击伤害', '速']);
    await choose(sim, 0, '速');
    await openMode(page);
    assert.deepEqual(await attrs(s), ['速', '暴击伤害', '速']);
    assert.deepEqual((await target(page)).attrs, ['速', '暴击伤害', '速']);
  } finally { await page.close(); }
});

test('品质与遁位重算并检查所有剩余空槽能否补全，原非法目标保留原文', async () => {
  const page = await pageFor(); try {
    const s = page.locator('#inscription-crafting-paths');
    await field(s, 'quality').selectOption('p1'); await field(s, 'dun').selectOption('鬼遁');
    assert.equal(await s.locator('[data-craft-attr-trigger]').count(), 2);
    await choose(s, 0, '暴击伤害'); await trigger(s, 1).click();
    assert.equal(await option(s, 1, '暴击伤害').getAttribute('aria-disabled'), 'true');
    await trigger(s, 1).press('Escape'); await field(s, 'quality').selectOption('p2');
    assert.equal(await s.locator('[data-craft-attr-trigger]').count(), 2); await trigger(s, 1).click();
    assert.equal(await option(s, 1, '暴击伤害').getAttribute('aria-disabled'), 'true', 'p2 M/L mix has no single legal origin');
    await option(s, 1, '速').click();
    await field(s, 'quality').selectOption('o2');
    assert.equal(await s.locator('[data-craft-attr-trigger]').count(), 3);
    await trigger(s, 2).click();
    assert.equal(await option(s, 2, '暴击伤害').getAttribute('aria-disabled'), 'false');
    await option(s, 2, '暴击伤害').click();
    await field(s, 'dun').selectOption('龙遁');
    assert.deepEqual(await attrs(s), ['暴击伤害', '速', '暴击伤害']);
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配.*保留.*暴击伤害/s);
    await field(s, 'dun').selectOption('鬼遁');
    await choose(s, 0, ''); await choose(s, 2, ''); await choose(s, 1, '');
    await trigger(s, 0).click();
    assert.equal(await option(s, 0, '暴击伤害').getAttribute('aria-disabled'), 'false', 'One selected M can be completed with two different attributes');
  } finally { await page.close(); }
});

test('键盘可浏览冲突选项并解释，Escape和Tab与外部点击关闭列表', async () => {
  const page = await pageFor(); try {
    const s = page.locator('#inscription-crafting-paths');
    await field(s, 'dun').selectOption('鬼遁');
    await choose(s, 0, '暴击伤害'); await choose(s, 1, '暴击伤害');
    const third = trigger(s, 2);
    await third.focus(); await third.press('ArrowDown');
    for (let i = 0; i < 4; i++) await third.press('ArrowDown');
    const active = await third.getAttribute('aria-activedescendant');
    assert.equal(await page.locator('[id="' + active + '"]').getAttribute('data-value'), '暴击伤害');
    await third.press('Enter');
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配/);
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '']);
    await third.press('Escape'); assert.equal(await third.getAttribute('aria-expanded'), 'false');
    assert.equal(await third.evaluate(el => el === document.activeElement), true);
    await third.press('ArrowUp'); await third.press('Tab'); assert.equal(await third.getAttribute('aria-expanded'), 'false');
    await third.click(); await s.locator('h3').first().click(); assert.equal(await third.getAttribute('aria-expanded'), 'false');
    await third.focus(); await third.press('ArrowDown'); await third.press('ArrowDown'); await third.press('Enter');
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '速']);
    assert.equal(await trigger(s, 2).evaluate(el => el === document.activeElement), true);
  } finally { await page.close(); }
});

test('隐藏native桥兼容旧脚本；历史非法目标重开不丢失、不静默覆盖', async () => {
  const page = await pageFor(); try {
    const s = page.locator('#inscription-crafting-paths');
    await field(s, 'dun').selectOption('鬼遁');
    for (let i = 0; i < 3; i++) await field(s, 'attr').nth(i).selectOption('暴击伤害');
    const raw = await getAccountItem(page, KEY);
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '暴击伤害']);
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配.*保留/s);
    const saved = JSON.parse(raw); saved.draft.simpleWorkbench.target.attrs = ['攻', '暴击伤害', '暴击伤害'];
    await setAccountItem(page, KEY, JSON.stringify(saved));
    const historical = await getAccountItem(page, KEY);
    await page.reload({ waitUntil: 'load' }); await openMode(page);
    assert.deepEqual(await attrs(s), ['攻', '暴击伤害', '暴击伤害']);
    assert.equal(await trigger(s, 0).innerText(), '攻');
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配.*保留.*攻/s);
    assert.equal(await getAccountItem(page, KEY), historical);
  } finally { await page.close(); }
});

for (const width of [320, 768]) test(width + 'px触控能查看冲突原因且选择器不越过视口', async () => {
  const page = await pageFor(width, true); try {
    const s = page.locator('#inscription-crafting-paths');
    await field(s, 'dun').selectOption('鬼遁');
    await choose(s, 0, '暴击伤害'); await choose(s, 1, '暴击伤害');
    await trigger(s, 2).tap(); await option(s, 2, '暴击伤害').tap({ force: true });
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '']);
    assert.match(await s.locator('[data-craft-attr-feedback]').innerText(), /无法组成所选搭配/);
    const list = s.locator('[role="listbox"]:visible');
    const bounds = await list.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'Touch list stays inside viewport: ' + JSON.stringify(bounds));
    assert.ok((await option(s, 2, '速').boundingBox()).height >= 44);
    await option(s, 2, '速').tap();
    assert.deepEqual(await attrs(s), ['暴击伤害', '暴击伤害', '速']);
  } finally { await page.close(); }
});
