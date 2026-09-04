// 运行：设置 PLAYWRIGHT_MODULE（或安装 playwright），node --test tests/ui-performance.cjs。
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
let browser, server, url;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });
async function pageFor(part, width = 900) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(p => document.querySelector('.tab[data-partition="' + p + '"]').click(), part);
  return page;
}

for (const [part, input, result, queries] of [
  ['equipment', '#search', '#cards', ['神', '神兵', '神兵墨眉']],
  ['atlas', '#atlas-search', '#atlas-results', ['神', '神·', '神·项羽']],
  ['forging', '#forge-search', '#forge-results', ['非', '非攻', '非攻九变']],
  ['forbidden', '#forbidden-search', '#forbidden-content', ['秋', '秋骊', '秋骊']]
]) test(part + ' 连续搜索只重绘最终结果', async () => {
  const page = await pageFor(part);
  try {
    await page.evaluate(({ input, result, queries }) => {
      window.renderCount = 0;
      new MutationObserver(records => { window.renderCount += records.filter(r => r.type === 'childList').length; })
        .observe(document.querySelector(result), { childList: true });
      for (const query of queries) {
        const field = document.querySelector(input); field.value = query;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { input, result, queries });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.renderCount), 1);
    assert.ok((await page.locator(result).innerText()).trim());
  } finally { await page.close(); }
});

test('装备只生成当前尺寸结果，旋转/缩放后命中保持一致', async () => {
  const page = await pageFor('equipment');
  try {
    await page.locator('#search').fill('神兵墨眉'); await page.waitForTimeout(300);
    const ids = await page.locator('#cards [data-equipment-favorite]').evaluateAll(es => es.map(e => e.dataset.equipmentFavorite));
    assert.ok(ids.length);
    assert.equal(await page.locator('#table-wrap').innerHTML(), '');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(150);
    assert.deepEqual(await page.locator('#table-wrap [data-equipment-favorite]').evaluateAll(es => es.map(e => e.dataset.equipmentFavorite)), ids);
    assert.equal(await page.locator('#cards').innerHTML(), '');
    await page.setViewportSize({ width: 390, height: 900 }); await page.waitForTimeout(150);
    assert.deepEqual(await page.locator('#cards [data-equipment-favorite]').evaluateAll(es => es.map(e => e.dataset.equipmentFavorite)), ids);
  } finally { await page.close(); }
});

test('图鉴编辑库存不重建其他卡片，切换拥有状态保留输入焦点', async () => {
  const page = await pageFor('atlas');
  try {
    await page.locator('#atlas-search').fill('神'); await page.waitForTimeout(350);
    await page.locator('[data-atlas-favorite]').first().click();
    await page.evaluate(() => { window.otherCard = document.querySelectorAll('[data-atlas-item]')[1]; });
    await page.locator('[data-atlas-inventory-edit]').first().click();
    assert.equal(await page.evaluate(() => window.otherCard.isConnected), true);
    const select = page.locator('[data-atlas-inventory-owned]').first();
    await select.focus();
    await page.evaluate(() => { window.ownedSelect = document.querySelector('[data-atlas-inventory-owned]'); });
    await select.selectOption('owned');
    assert.equal(await page.evaluate(() => window.ownedSelect === document.activeElement), true);
    assert.equal(await page.locator('.atlas-inventory-equipment-row').first().locator('[data-atlas-inventory-note]').isHidden(), true);
    await page.locator('[data-atlas-inventory-cancel]').click();
    assert.equal(await page.evaluate(() => window.otherCard.isConnected), true);
    assert.equal(await page.locator('.atlas-inventory-editor').count(), 0);
  } finally { await page.close(); }
});

test('战匣丹囊调整等级保留编辑输入与其他弟子节点', async () => {
  const page = await pageFor('battle-box-pill-pouch');
  try {
    await page.evaluate(() => {
      localStorage.setItem('qinshi_battle_box_pill_pouch_v1', JSON.stringify({ account: { playerLevel: 54 },
        disciples: ['甲', '乙'].map((name, i) => BATTLE_BOX_PILL_POUCH_CORE.normalizeDisciple({ id: 'audit-' + i, name, sourceType: 'custom' }, BATTLE_BOX_PILL_POUCH_DATA)) }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.tab[data-partition="battle-box-pill-pouch"]').click());
    await page.locator('[data-battle-pouch-action="edit"]').first().click();
    await page.evaluate(() => {
      window.editField = document.querySelector('[data-edit-field="battleLevel"]');
      window.otherDisciple = document.querySelector('[data-battle-pouch-action="edit"]');
      window.editField.value = '21';
      window.editField.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.equal(await page.evaluate(() => window.editField.isConnected && window.otherDisciple.isConnected), true);
    await page.locator('[data-battle-pouch-action="save-edit"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('qinshi_battle_box_pill_pouch_v1')).disciples[0].battle.currentLevel), 21);
  } finally { await page.close(); }
});

test('战匣装备先输入再匹配，不使用原生列表，并保留自由输入', async () => {
  const page = await pageFor('battle-box-pill-pouch');
  try {
    await page.evaluate(() => localStorage.setItem('qinshi_battle_box_pill_pouch_v1', JSON.stringify({
      account: { playerLevel: 54 }, disciples: [BATTLE_BOX_PILL_POUCH_CORE.normalizeDisciple(
        { id: 'equipment-search', name: '搜索测试弟子', sourceType: 'custom' }, BATTLE_BOX_PILL_POUCH_DATA)]
    })));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.tab[data-partition="battle-box-pill-pouch"]').click());
    await page.locator('[data-battle-pouch-action="edit"]').click();
    const fields = page.locator('[data-edit-equipment]');
    for (let index = 0; index < await fields.count(); index++) {
      await fields.nth(index).click();
      assert.equal(await fields.nth(index).getAttribute('list'), null);
      assert.equal(await page.locator('.battle-pouch-equipment-matches:visible').count(), 0);
    }
    const field = fields.first();
    const quality = page.locator('[data-edit-equipment-quality]').first();
    assert.equal(await quality.isEnabled(), true);
    assert.equal(await quality.inputValue(), 'orange');
    await field.fill('墨眉');
    const choices = page.locator('[data-pick-battle-equipment]');
    assert.ok(await choices.count() > 0);
    assert.ok((await choices.allTextContents()).every(name => name.includes('墨眉')));
    const selected = await choices.first().innerText();
    await choices.first().click();
    assert.equal(await field.inputValue(), selected);
    assert.equal(await page.locator('.battle-pouch-equipment-matches:visible').count(), 0);
    await quality.selectOption('red');
    await field.fill('');
    await field.press('Tab');
    assert.equal(await quality.isEnabled(), true);
    assert.equal(await quality.inputValue(), 'red');
    assert.equal(await page.locator('.battle-pouch-slot-title span').first().innerText(), '+15级上限');
    await page.locator('[data-battle-pouch-action="save-edit"]').click();
    const emptyNameSlot = await page.evaluate(() => JSON.parse(localStorage.getItem('qinshi_battle_box_pill_pouch_v1'))
      .disciples[0].battle.slots[0]);
    assert.equal(emptyNameSlot.itemName, '');
    assert.equal(emptyNameSlot.quality, 'red');
    await page.locator('[data-battle-pouch-action="edit"]').click();
    await field.fill('自定义测试装备');
    assert.equal(await choices.count(), 0);
    await field.press('Tab');
    await page.locator('[data-battle-pouch-action="save-edit"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('qinshi_battle_box_pill_pouch_v1'))
      .disciples[0].battle.slots[0].itemName), '自定义测试装备');
  } finally { await page.close(); }
});

test('兵法填写库存后不重建尚未计算的材料表', async () => {
  const page = await pageFor('tactics');
  try {
    await page.locator('[data-tactics-mode="cost"]').click();
    const result = await page.evaluate(() => {
      const input = document.querySelector('input[data-cost-material]');
      input.value = '123'; input.dispatchEvent(new Event('change', { bubbles: true }));
      return { connected: input.isConnected, value: input.value };
    });
    assert.deepEqual(result, { connected: true, value: '123' });
  } finally { await page.close(); }
});

test('移动装备长列表跳过远处卡片绘制，滚动后恢复内容', async () => {
  const page = await pageFor('equipment', 390);
  try {
    await page.locator('#search').fill('神'); await page.waitForTimeout(400);
    const last = page.locator('#cards .card').last();
    assert.equal(await last.locator('.card-head').evaluate(e => e.checkVisibility({ contentVisibilityAuto: true })), false);
    await last.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
    assert.equal(await last.locator('.card-head').evaluate(e => e.checkVisibility({ contentVisibilityAuto: true })), true);
    assert.ok((await last.innerText()).includes('神兵'));
  } finally { await page.close(); }
});

test('兵法其他材料合法编辑后不能保留已拒绝的无效库存值', async () => {
  const page = await pageFor('tactics');
  try {
    await page.locator('[data-tactics-mode="cost"]').click();
    const value = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[data-cost-material][data-cost-material-field="stock"]');
      inputs[0].value = 'abc'; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      inputs[1].value = '123'; inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelector('input[data-cost-material][data-cost-material-field="stock"]').value;
    });
    assert.equal(value, '0');
  } finally { await page.close(); }
});

test('待执行的装备搜索不会覆盖即时分类和锻造返回条件', async () => {
  const page = await pageFor('equipment');
  try {
    await page.evaluate(() => {
      const field = document.querySelector('#search'); field.value = '神兵墨眉';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#category-filter [data-category="神兵武器"]').click();
    });
    await page.locator('#cards [data-equipment-forge="w-0038"]').click();
    await page.waitForTimeout(250);
    await page.locator('[data-forging-equipment="墨眉"]').click();
    assert.equal(await page.locator('#search').inputValue(), '神兵墨眉');
    assert.equal(await page.locator('#category-filter [data-category="神兵武器"]').getAttribute('class'), 'seg active');
    assert.deepEqual(await page.locator('#cards [data-equipment-favorite]').evaluateAll(es => es.map(e => e.dataset.equipmentFavorite)), ['w-0038']);
  } finally { await page.close(); }
});
