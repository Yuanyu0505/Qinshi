// Set PLAYWRIGHT_MODULE if Playwright is not available in the default module path.
// Run manually: node --test tests/six-halls-browser.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, getAccountJson, setAccountItem } = require('./browser-test-helpers.cjs');

const STORE_KEY = 'qinshi_six_halls_progress_v1';
const PARTITION = '#partition-six-halls';
let browser, server, url;

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

async function newPage(width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await openApp(page, url);
  return page;
}

async function openSixHalls(page) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="six-halls"]').click();
  } else {
    await page.locator('.tab[data-partition="six-halls"]').click();
  }
  await page.locator(PARTITION).waitFor({ state: 'visible' });
  await page.locator('[data-six-halls-mode="progress"]').waitFor({ state: 'visible' });
}

async function mode(page, value) {
  await page.locator('[data-six-halls-mode="' + value + '"]').click();
  const content = value === 'planner' ? '#six-halls-result' : value === 'reference' ? '#six-halls-reference' : '[data-six-halls-progress="herbs"]';
  await page.locator(content).waitFor({ state: 'visible' });
}

function field(page, name, hallId) {
  return page.locator('[data-six-halls-progress="' + name + '"]' + (hallId ? '[data-hall-id="' + hallId + '"]' : ''));
}

async function edit(page, name, value, hallId) {
  const input = field(page, name, hallId);
  await input.fill(String(value));
  await input.dispatchEvent('change');
}

async function noOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(sizes.page <= sizes.viewport, label + ': horizontal page overflow ' + JSON.stringify(sizes));
}

async function herbsMetric(page, key) {
  const text = await page.locator('[data-six-halls-herbs="' + key + '"]').innerText();
  return Number(text.replace(/[,\s]/g, ''));
}

async function touchTargets(page) {
  const sizes = await page.locator(PARTITION + ' button, ' + PARTITION + ' input, ' + PARTITION + ' select')
    .evaluateAll(nodes => nodes.map(node => {
      const target = node.type === 'checkbox' ? node.closest('label') || node : node;
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      return { label: node.getAttribute('aria-label') || node.name || node.textContent.trim(), width: box.width, height: box.height, visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' };
    }).filter(box => box.visible));
  assert.ok(sizes.length > 0);
  for (const box of sizes) assert.ok(box.width >= 44 && box.height >= 44, 'Small touch target: ' + JSON.stringify(box));
}

for (const width of [390, 900, 1440]) {
  test(width + ': real progress saves and all three six-halls views avoid page overflow', async () => {
    const page = await newPage(width);
    try {
      assert.equal(await page.locator(PARTITION + ' [data-six-halls-progress]').count(), 0,
        'hidden six-halls section should not eagerly create its form');
      await openSixHalls(page);
      assert.equal(await page.locator('[data-six-halls-progress="level"]').count(), 6);
      await edit(page, 'playerLevel', 89);
      await edit(page, 'herbs', 1000);
      await edit(page, 'level', 30, 'kuiwei');
      await edit(page, 'tokens', 155, 'kuiwei');
      const saved = await getAccountJson(page, STORE_KEY);
      assert.equal(saved.playerLevel, 89);
      assert.equal(saved.herbs, 1000);
      assert.deepEqual(saved.halls.kuiwei, { level: 30, tokens: 155 });
      await noOverflow(page, width + ' / progress');
      await touchTargets(page);
      await mode(page, 'planner');
      await page.locator('[data-six-halls-select="kuiwei"]').check();
      const target = page.locator('[data-six-halls-target="kuiwei"]');
      await target.fill('50');
      await target.dispatchEvent('input');
      await page.locator('[data-six-halls-result-row="kuiwei"]').waitFor({ state: 'visible' });
      assert.match(await page.locator('#six-halls-result').innerText(), /483/);
      assert.match(await page.locator('#six-halls-result').innerText(), /280/);
      await noOverflow(page, width + ' / planner');
      await touchTargets(page);
      await mode(page, 'reference');
      assert.match(await page.locator('#six-halls-reference').innerText(), /904/);
      assert.match(await page.locator('#six-halls-reference').innerText(), /435/);
      assert.equal(await page.locator('#six-halls-reference tbody tr').count(), 50);
      await noOverflow(page, width + ' / reference');
      await touchTargets(page);
      await page.reload();
      await openSixHalls(page);
      assert.equal(await field(page, 'playerLevel').inputValue(), '89');
      assert.equal(await field(page, 'herbs').inputValue(), '1000');
      assert.equal(await field(page, 'level', 'kuiwei').inputValue(), '30');
      assert.equal(await field(page, 'tokens', 'kuiwei').inputValue(), '155');
    } finally { await page.close(); }
  });
}

test('six selected halls deduct shared herbs once and backup contains only saved progress', async () => {
  const page = await newPage();
  try {
    await openSixHalls(page);
    await edit(page, 'playerLevel', 89);
    await edit(page, 'herbs', 1000);
    await edit(page, 'tokens', 1000, 'kuiwei');
    const before = await getAccountItem(page, STORE_KEY);
    await mode(page, 'planner');
    for (const id of ['kuiwei', 'chiyou', 'lieshan', 'siyue', 'gonggong', 'shennong']) {
      await page.locator('[data-six-halls-select="' + id + '"]').check();
    }
    await page.locator('[data-six-halls-result-row="shennong"]').waitFor({ state: 'visible' });
    assert.equal(await herbsMetric(page, 'need'), 5424);
    assert.equal(await herbsMetric(page, 'stock'), 1000);
    assert.equal(await herbsMetric(page, 'missing'), 4424);
    assert.equal(await herbsMetric(page, 'remaining'), 0);
    const first = page.locator('[data-six-halls-result-row="kuiwei"]');
    const second = page.locator('[data-six-halls-result-row="chiyou"]');
    assert.equal(await first.getByText('剩余', { exact: true }).locator('..').locator('dd').innerText(), '565');
    assert.equal(await second.getByText('缺口', { exact: true }).locator('..').locator('dd').innerText(), '435');
    assert.equal(await second.locator('.six-halls-metrics .six-halls-shortage').count(), 1);
    assert.equal(await getAccountItem(page, STORE_KEY), before, 'calculation must not apply any upgrades');
    const backups = await page.evaluate(key => {
      const payload = window.QinshiSettings.makePayload('manual');
      return {
        bareKey: localStorage.getItem(key),
        entries: Object.entries(payload.data).filter(([physicalKey]) => physicalKey.startsWith('qinshi_account_v1:') && physicalKey.endsWith(':' + encodeURIComponent(key)))
          .map(([, raw]) => JSON.parse(raw))
      };
    }, STORE_KEY);
    assert.equal(backups.bareKey, null, 'six-halls data must use the account-scoped store');
    assert.equal(backups.entries.length, 1);
    assert.deepEqual(Object.keys(backups.entries[0]).sort(), ['halls', 'herbs', 'playerLevel', 'version']);
    for (const hall of Object.values(backups.entries[0].halls)) assert.deepEqual(Object.keys(hall).sort(), ['level', 'tokens']);
    assert.deepEqual(backups.entries[0].halls.kuiwei, { level: 0, tokens: 1000 });
  } finally { await page.close(); }
});

test('planning survives subview and partition switches, but refresh clears its in-memory draft', async () => {
  const page = await newPage();
  try {
    await openSixHalls(page);
    await edit(page, 'herbs', 1000);
    await mode(page, 'planner');
    await page.locator('[data-six-halls-select="kuiwei"]').check();
    const target = page.locator('[data-six-halls-target="kuiwei"]');
    await page.locator('[data-six-halls-quick="40"][data-hall-id="kuiwei"]').click();
    assert.equal(await target.inputValue(), '40');
    assert.equal(await page.locator('[data-six-halls-target="chiyou"]').inputValue(), '50');
    await target.evaluate(node => { window.__sixHallsTargetProbe = node; });
    await target.fill('30');
    await target.dispatchEvent('input');
    await page.locator('[data-six-halls-result-row="kuiwei"]').waitFor({ state: 'visible' });
    assert.equal(await target.evaluate(node => node === window.__sixHallsTargetProbe), true,
      'typing a target must not replace the active input');
    for (const value of ['reference', 'progress', 'planner']) await mode(page, value);
    assert.equal(await target.inputValue(), '30');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), true);
    await page.locator('.tab[data-partition="atlas"]').click();
    await openSixHalls(page);
    await mode(page, 'planner');
    assert.equal(await target.inputValue(), '30');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), true);
    await page.reload();
    await openSixHalls(page);
    assert.equal(await field(page, 'herbs').inputValue(), '1000');
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), false);
    assert.equal(await page.locator('[data-six-halls-target="kuiwei"]').inputValue(), '50');
  } finally { await page.close(); }
});

test('reference filtering uses target levels and retains cumulative-from-zero material totals', async () => {
  const page = await newPage();
  try {
    await openSixHalls(page);
    await mode(page, 'reference');
    await page.locator('[data-six-halls-reference-bound="min"]').fill('30');
    await page.locator('[data-six-halls-reference-bound="max"]').fill('30');
    await page.waitForFunction(() => document.querySelectorAll('#six-halls-reference tbody tr').length === 1);
    const row = page.locator('#six-halls-reference tbody tr');
    assert.match(await row.locator('th').innerText(), /29\s*→\s*30/);
    assert.equal(await row.locator('[data-label="累计七星珠草"]').innerText(), '421');
    assert.equal(await row.locator('[data-label="累计信物"]').innerText(), '155');
    assert.equal(await row.locator('[data-label="玩家等级门槛"]').innerText(), '69级');
    await noOverflow(page, '390 / filtered reference');
    await page.locator('[data-six-halls-reference-bound="min"]').fill('31');
    await page.waitForFunction(() => document.querySelectorAll('#six-halls-reference tbody tr').length === 0);
    assert.match(await page.locator('#six-halls-reference-status').innerText(), /起点|终点|整数/);
    await page.locator('[data-six-halls-action="reference-reset"]').click();
    assert.equal(await page.locator('#six-halls-reference tbody tr').count(), 50);
  } finally { await page.close(); }
});

test('invalid selected targets remove old totals while unselected invalid targets remain harmless', async () => {
  const page = await newPage(900);
  try {
    await openSixHalls(page);
    await mode(page, 'planner');
    await page.locator('[data-six-halls-select="kuiwei"]').check();
    await page.locator('[data-six-halls-result-row="kuiwei"]').waitFor({ state: 'visible' });
    const unselected = page.locator('[data-six-halls-target="chiyou"]');
    await unselected.fill('-1');
    await unselected.dispatchEvent('input');
    assert.equal(await herbsMetric(page, 'need'), 904);
    const selected = page.locator('[data-six-halls-target="kuiwei"]');
    await selected.fill('-1');
    await selected.dispatchEvent('input');
    await page.locator('#six-halls-result .six-halls-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-six-halls-result-row="kuiwei"]').count(), 0);
    assert.equal(await page.locator('[data-six-halls-herbs="need"]').count(), 0);
    assert.match(await page.locator('#six-halls-result').innerText(), /目标|整数|无效/);
  } finally { await page.close(); }
});

test('account changes isolate progress and clear planning instead of carrying a previous account draft', async () => {
  const page = await newPage(900);
  try {
    await openSixHalls(page);
    const firstId = await page.evaluate(() => window.QinshiAccounts.currentAccount().id);
    await edit(page, 'herbs', 1000);
    await edit(page, 'level', 30, 'kuiwei');
    await mode(page, 'planner');
    await page.locator('[data-six-halls-select="kuiwei"]').check();
    await page.locator('[data-six-halls-target="kuiwei"]').fill('40');
    const secondId = await page.evaluate(() => {
      const account = window.QinshiAccounts.createAccount({ name: '六堂隔离测试', server: '本地测试服' });
      window.QinshiAccounts.bindAccount(account.id);
      return account.id;
    });
    await page.reload();
    await openSixHalls(page);
    assert.equal(await field(page, 'herbs').inputValue(), '0');
    assert.equal(await field(page, 'level', 'kuiwei').inputValue(), '0');
    await edit(page, 'herbs', 3);
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), false);
    assert.equal(await page.locator('[data-six-halls-target="kuiwei"]').inputValue(), '50');
    await page.evaluate(id => window.QinshiAccounts.bindAccount(id), firstId);
    await page.reload();
    await openSixHalls(page);
    assert.equal(await field(page, 'herbs').inputValue(), '1000');
    assert.equal(await field(page, 'level', 'kuiwei').inputValue(), '30');
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), false);
    const separate = await page.evaluate(({ id, key }) => JSON.parse(window.QinshiAccounts.listAccountData(id)[key]), { id: secondId, key: STORE_KEY });
    assert.equal(separate.herbs, 3);
  } finally { await page.close(); }
});

test('corrupt imported JSON stays intact and blocks edits while reference data remains accessible', async () => {
  const page = await newPage();
  try {
    const damaged = '{"version":1,"herbs":1000,';
    await setAccountItem(page, STORE_KEY, damaged);
    await page.reload();
    await openSixHalls(page);
    await page.locator('#six-halls-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#six-halls-error').innerText(), /读取|恢复|备份/);
    assert.equal(await field(page, 'herbs').isDisabled(), true);
    assert.equal(await getAccountItem(page, STORE_KEY), damaged);
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-herbs="need"]').count(), 0);
    await mode(page, 'reference');
    assert.match(await page.locator('#six-halls-reference').innerText(), /904/);
    assert.equal(await getAccountItem(page, STORE_KEY), damaged);
  } finally { await page.close(); }
});

for (const invalidText of ['-', 'e']) {
  test('player-level keyboard input ' + JSON.stringify(invalidText) + ' cannot masquerade as an intentional clear', async () => {
    const page = await newPage();
    try {
      await openSixHalls(page);
      await edit(page, 'playerLevel', 89);
      const before = await getAccountItem(page, STORE_KEY);
      const input = field(page, 'playerLevel');
      await input.focus();
      await input.press('Control+A');
      await page.keyboard.type(invalidText);
      assert.deepEqual(await input.evaluate(node => ({ value: node.value, badInput: node.validity.badInput })),
        { value: '', badInput: true });
      await page.locator('#six-halls-error').waitFor({ state: 'visible' });
      assert.match(await page.locator('#six-halls-error').innerText(), /玩家等级|整数|有效/);
      assert.equal((await getAccountJson(page, STORE_KEY)).playerLevel, 89);
      assert.equal(await getAccountItem(page, STORE_KEY), before,
        'incomplete numeric keyboard input must not overwrite the saved player level');
      await input.press('Control+A');
      await input.press('Backspace');
      assert.deepEqual(await input.evaluate(node => ({ value: node.value, badInput: node.validity.badInput })),
        { value: '', badInput: false });
      await page.locator('#six-halls-error').waitFor({ state: 'hidden' });
      assert.equal((await getAccountJson(page, STORE_KEY)).playerLevel, null);
    } finally { await page.close(); }
  });
}

test('390: forty-character English account and server names wrap without page overflow', async () => {
  const page = await newPage();
  try {
    const name = 'A'.repeat(40);
    const serverName = 'S'.repeat(40);
    await page.evaluate(({ name, serverName }) => {
      const store = window.QinshiAccounts;
      store.updateAccount(store.currentAccount().id, { name, server: serverName });
    }, { name, serverName });
    await page.reload();
    await openSixHalls(page);
    assert.equal(await page.locator('#six-halls-account').innerText(), name + ' · ' + serverName);
    await noOverflow(page, '390 / forty-character account and server names / progress');
    for (const value of ['planner', 'reference']) {
      await mode(page, value);
      await noOverflow(page, '390 / forty-character account and server names / ' + value);
    }
  } finally { await page.close(); }
});
