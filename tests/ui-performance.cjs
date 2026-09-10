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

test('大型隐藏分区仅在首次进入时渲染', async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, serviceWorkers: 'block' });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    const targets = [
      ['forging', '#forging-summary'],
      ['inscription', '#ins-progress-list'],
      ['machine-beasts', '#machine-beast-progress-content'],
      ['tactics', '#tactics-selector'],
      ['battle-box-pill-pouch', '#battle-pouch-account'],
      ['forbidden', '#forbidden-content']
    ];
    for (const [, selector] of targets) {
      assert.equal((await page.locator(selector).innerHTML()).trim(), '');
    }
    for (const [part, selector] of targets) {
      await page.evaluate(name => document.querySelector('.tab[data-partition="' + name + '"]').click(), part);
      assert.ok((await page.locator(selector).innerHTML()).trim(), part + ' should render after activation');
    }
  } finally { await page.close(); }
});

test('机关兽连续搜索只重绘最终结果', async () => {
  const page = await pageFor('machine-beasts');
  try {
    await page.evaluate(() => {
      window.machineRenderCount = 0;
      new MutationObserver(records => { window.machineRenderCount += records.filter(record => record.type === 'childList').length; })
        .observe(document.querySelector('#machine-beast-progress-content'), { childList: true });
      const field = document.querySelector('[data-machine-search="progress"]');
      ['霸', '霸道', '霸道机关'].forEach(query => {
        field.value = query;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.machineRenderCount), 1);
  } finally { await page.close(); }
});

test('兵法连续填写演练消耗只刷新最终计算结果', async () => {
  const page = await pageFor('tactics');
  try {
    await page.locator('[data-tactic-id]').first().click();
    const field = page.locator('[data-calc-field="start-rehearsalSpent"]');
    assert.equal(await field.count(), 1);
    await page.evaluate(() => {
      window.tacticsResultCount = 0;
      new MutationObserver(records => { window.tacticsResultCount += records.filter(record => record.type === 'childList').length; })
        .observe(document.querySelector('#tactics-result [data-tactics-result]'), { childList: true });
      const input = document.querySelector('[data-calc-field="start-rehearsalSpent"]');
      ['1', '12', '120'].forEach(value => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.tacticsResultCount), 1);
  } finally { await page.close(); }
});

test('离开分区后取消尚未执行的搜索和计算刷新', async () => {
  for (const scenario of [
    { part: 'equipment', prepare: '', input: '#search', result: '#cards' },
    { part: 'machine-beasts', prepare: '', input: '[data-machine-search="progress"]', result: '#machine-beast-progress-content' },
    { part: 'tactics', prepare: '[data-tactic-id]', input: '[data-calc-field="start-rehearsalSpent"]', result: '#tactics-result [data-tactics-result]' }
  ]) {
    const page = await pageFor(scenario.part);
    try {
      if (scenario.prepare) await page.locator(scenario.prepare).first().click();
      await page.evaluate(({ input, result }) => {
        window.hiddenRefreshCount = 0;
        new MutationObserver(records => { window.hiddenRefreshCount += records.filter(record => record.type === 'childList').length; })
          .observe(document.querySelector(result), { childList: true });
        const field = document.querySelector(input);
        field.value = '12';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.tab[data-partition="atlas"]').click();
      }, scenario);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.hiddenRefreshCount), 0, scenario.part);
    } finally { await page.close(); }
  }
});

for (const [part, firstMode, secondMode, stableSelector] of [
  ['machine-beasts', 'calculator', 'progress', '#machine-beast-calculator-controls > *'],
  ['battle-box-pill-pouch', 'calculator', 'progress', '#battle-pouch-calculator > *']
]) test(part + ' 重复切换未变更模式时复用既有结果', async () => {
  const page = await pageFor(part);
  try {
    await page.locator('[data-' + (part === 'machine-beasts' ? 'machine-beast' : 'battle-pouch') + '-mode="' + firstMode + '"]').click();
    await page.evaluate(selector => { window.stableModeNode = document.querySelector(selector); }, stableSelector);
    await page.locator('[data-' + (part === 'machine-beasts' ? 'machine-beast' : 'battle-pouch') + '-mode="' + secondMode + '"]').click();
    await page.locator('[data-' + (part === 'machine-beasts' ? 'machine-beast' : 'battle-pouch') + '-mode="' + firstMode + '"]').click();
    assert.equal(await page.evaluate(() => window.stableModeNode && window.stableModeNode.isConnected), true);
  } finally { await page.close(); }
});

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

for (const width of [390, 900, 1440]) test('战匣丹囊批量选择独立切换并保留目标与顺序 / ' + width, async () => {
  const page = await pageFor('battle-box-pill-pouch', width);
  try {
    await page.evaluate(() => localStorage.setItem('qinshi_battle_box_pill_pouch_v1', JSON.stringify({
      account: { playerLevel: 54 }, disciples: ['甲', '乙'].map((name, i) => ({
        id: 'bulk-' + i, name, sourceType: 'custom',
        battle: { currentLevel: 0, targetLevel: 1 }, pouch: { currentLevel: 0, targetLevel: 1 }
      }))
    })));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.tab[data-partition="battle-box-pill-pouch"]').click());
    await page.locator('[data-battle-pouch-mode="calculator"]').click();
    const selected = field => page.locator(field).evaluateAll(nodes => nodes.map(node => node.checked));
    const toggle = kind => page.locator('[data-calc-toggle-all="' + kind + '"]');
    assert.deepEqual(await selected('[data-calc-select]'), [true, true]);
    assert.deepEqual(await selected('[data-calc-field="battleEnabled"]'), [true, true]);
    assert.deepEqual(await selected('[data-calc-field="pouchEnabled"]'), [false, false]);
    assert.deepEqual(await page.locator('[data-calc-field="systemPriority"]').evaluateAll(nodes => nodes.map(n => n.value)), ['battle', 'battle']);
    await page.locator('[data-plan-move="down"]').first().click();
    await page.locator('[data-calc-field="battleTarget"]').first().fill('2');
    await page.locator('[data-calc-field="battleTarget"]').first().press('Tab');
    await page.locator('[data-battle-pouch-action="calculate"]').click();
    assert.equal(await page.locator('.battle-pouch-result-item').count(), 2);
    assert.equal(await page.locator('.battle-pouch-plan-toolbar + #battle-pouch-calculation-result').count(), 1);
    assert.equal(await page.locator('#battle-pouch-calculation-result + .battle-pouch-plan-list').count(), 1);
    assert.equal(await page.locator('.battle-pouch-result-grid > div > .battle-pouch-summary-line').count(), 8);
    assert.equal(await page.locator('.battle-pouch-result-item .battle-pouch-required').count(), 2);
    assert.match(await page.locator('.battle-pouch-result-overview').innerText(), /剑玦/);
    assert.equal(await page.locator('.battle-pouch-purchase-settings').getByText('每包剑玦', { exact: true }).count(), 2);
    await toggle('disciples').click();
    assert.deepEqual(await selected('[data-calc-select]'), [false, false]);
    assert.equal(await page.locator('#battle-pouch-calculation-result').innerHTML(), '');
    assert.deepEqual(await selected('[data-calc-field="battleEnabled"]'), [true, true]);
    await toggle('disciples').click();
    await toggle('pouch').click();
    assert.deepEqual(await selected('[data-calc-field="pouchEnabled"]'), [true, true]);
    await page.locator('[data-calc-field="pouchEnabled"]').first().uncheck();
    assert.equal(await toggle('pouch').innerText(), '丹囊：全选');
    await toggle('pouch').click();
    await toggle('pouch').click();
    await toggle('battle').click();
    assert.deepEqual(await selected('[data-calc-field="pouchEnabled"]'), [false, false]);
    assert.deepEqual(await selected('[data-calc-field="battleEnabled"]'), [false, false]);
    await toggle('battle').click();
    await page.locator('[data-battle-pouch-mode="progress"]').click();
    await page.locator('[data-battle-pouch-mode="calculator"]').click();
    assert.deepEqual(await page.locator('[data-plan-row]').evaluateAll(nodes => nodes.map(n => n.dataset.planRow)), ['bulk-1', 'bulk-0']);
    assert.equal(await page.locator('[data-calc-field="battleTarget"]').first().inputValue(), '2');
    assert.deepEqual(await selected('[data-calc-field="pouchEnabled"]'), [false, false]);
  } finally { await page.close(); }
});

for (const width of [390, 1440]) test('战匣丹囊结果状态与资料当前等级、上限突出显示 / ' + width, async () => {
  const page = await pageFor('battle-box-pill-pouch', width);
  try {
    await page.evaluate(() => localStorage.setItem('qinshi_battle_box_pill_pouch_v1', JSON.stringify({
      account: { playerLevel: 54, inventory: { pearls: 0, shells: 0 } },
      disciples: [{ id: 'highlight', name: '提示测试', sourceType: 'custom',
        battle: { currentLevel: 42, targetLevel: 42 }, pouch: { currentLevel: 0, targetLevel: 1 } }]
    })));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.tab[data-partition="battle-box-pill-pouch"]').click());
    await page.locator('[data-battle-pouch-mode="calculator"]').click();
    await page.locator('[data-calc-toggle-all="pouch"]').click();
    await page.locator('[data-battle-pouch-action="calculate"]').click();
    assert.equal(await page.locator('.battle-pouch-complete').innerText(), '目标可完成');
    assert.equal(await page.locator('.battle-pouch-shortage').innerText(), '从1级开始材料不足');
    assert.equal(await page.locator('.battle-pouch-shortage').evaluate(n => getComputedStyle(n).color), 'rgb(255, 51, 51)');
    assert.equal(await page.locator('.battle-pouch-complete').evaluate(n => getComputedStyle(n).color), 'rgb(57, 255, 122)');
    assert.deepEqual(await page.locator('.battle-pouch-required').first().locator('span').allTextContents(), ['沧海珠0', '、', '玄龟甲0']);
    assert.deepEqual(await page.locator('.battle-pouch-required').first().locator('span').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).color)), ['rgb(57, 255, 122)', 'rgb(255, 255, 255)', 'rgb(57, 255, 122)']);
    assert.ok(await page.locator('.battle-pouch-required .battle-pouch-cost-positive').count());
    const costs = page.locator('.battle-pouch-result-grid .battle-pouch-cost-positive');
    assert.ok(await costs.count());
    assert.ok((await costs.evaluateAll(nodes => nodes.map(n => getComputedStyle(n).color))).every(color => color === 'rgb(255, 51, 51)'));
    const packCounts = page.locator('.battle-pouch-purchase-packs span');
    assert.ok((await packCounts.evaluateAll(nodes => nodes.map(n => ({ count: Number(n.textContent.replace(/,/g, '')), color: getComputedStyle(n).color })))).every(item => item.color === (item.count > 0 ? 'rgb(255, 51, 51)' : 'rgb(57, 255, 122)')));
    await page.locator('[data-calc-toggle-all="pouch"]').click();
    await page.locator('[data-battle-pouch-action="calculate"]').click();
    assert.deepEqual(await page.locator('.battle-pouch-result-grid .battle-pouch-cost-zero').allTextContents(), ['0', '0', '0', '0', '0']);
    assert.deepEqual(await page.locator('.battle-pouch-result-grid .battle-pouch-cost-zero').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).color)), Array(5).fill('rgb(57, 255, 122)'));
    assert.deepEqual(await packCounts.allTextContents(), ['0', '0']);
    await page.locator('[data-battle-pouch-mode="reference"]').click();
    await page.locator('[data-reference-disciple]').selectOption('highlight');
    const row = page.locator('.battle-pouch-reference-table tr.is-current.is-cap');
    assert.equal(await row.locator('td').first().evaluate(n => getComputedStyle(n).color), 'rgb(57, 255, 122)');
    const divider = width < 721 ? row : row.locator('td').first();
    assert.match(await divider.evaluate(n => getComputedStyle(n).boxShadow), /rgb\(255, 51, 51\).*?-4px/);
    assert.equal(await page.locator('.battle-pouch-rule-grid > span').first().evaluate(n => getComputedStyle(n).borderTopWidth), '3px');
    assert.equal(await page.locator('.battle-pouch-rule-increase').first().evaluate(n => getComputedStyle(n).color), 'rgb(255, 255, 255)');
  } finally { await page.close(); }
});

test('战匣丹囊空名单与未解锁分区不允许批量勾选', async () => {
  const page = await pageFor('battle-box-pill-pouch');
  try {
    await page.locator('[data-battle-pouch-mode="calculator"]').click();
    assert.deepEqual(await page.locator('[data-calc-toggle-all]').evaluateAll(nodes => nodes.map(n => n.disabled)), [true, true, true]);
    await page.evaluate(() => localStorage.setItem('qinshi_battle_box_pill_pouch_v1', JSON.stringify({
      account: { playerLevel: 45 }, disciples: [{ id: 'locked', name: '未解锁弟子', sourceType: 'custom' }]
    })));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.tab[data-partition="battle-box-pill-pouch"]').click());
    await page.locator('[data-battle-pouch-mode="calculator"]').click();
    assert.deepEqual(await page.locator('[data-calc-toggle-all]').evaluateAll(nodes => nodes.map(n => n.disabled)), [false, true, true]);
    assert.deepEqual(await page.locator('[data-calc-field$="Enabled"]').evaluateAll(nodes => nodes.map(n => n.checked)), [false, false]);
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
    await page.locator('#cards [data-item-menu-source="equipment"][data-item-name="神兵墨眉"]').click();
    await page.locator('[data-item-navigation-action="forging"]').click();
    await page.waitForTimeout(250);
    await page.locator('[data-item-navigation-return="forging"] [data-item-navigation-back]').click();
    assert.equal(await page.locator('#search').inputValue(), '神兵墨眉');
    assert.equal(await page.locator('#category-filter [data-category="神兵武器"]').getAttribute('class'), 'seg active');
    assert.deepEqual(await page.locator('#cards [data-equipment-favorite]').evaluateAll(es => es.map(e => e.dataset.equipmentFavorite)), ['w-0038']);
  } finally { await page.close(); }
});
