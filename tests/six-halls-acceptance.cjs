// Isolated local acceptance checks. No production account, cloud upload or external API is used.
// Run: node --test --test-concurrency=1 tests/six-halls-acceptance.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, getAccountJson, currentAppVersion } = require('./browser-test-helpers.cjs');

const KEY = 'qinshi_six_halls_progress_v1';
const IDS = ['kuiwei', 'chiyou', 'lieshan', 'siyue', 'gonggong', 'shennong'];
const PARTITION = '#partition-six-halls';
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

async function contextFor(width = 900, serviceWorkers = 'block') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers });
  context.setDefaultTimeout(5000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  return context;
}

async function pageFor(context) {
  const page = await context.newPage();
  await openApp(page, origin);
  return page;
}

async function enter(page) {
  if (await page.locator('#mobile-more-toggle').isVisible()) {
    await page.locator('#mobile-more-toggle').click();
    await page.locator('#mobile-more-layer [data-partition="six-halls"]').click();
  } else await page.locator('.tab[data-partition="six-halls"]').click();
  await page.locator(PARTITION).waitFor({ state: 'visible' });
  await page.locator('[data-six-halls-mode="progress"]').waitFor({ state: 'visible' });
}

async function mode(page, value) {
  await page.locator('[data-six-halls-mode="' + value + '"]').click();
  await page.locator('#six-halls-' + value).waitFor({ state: 'visible' });
}

function field(page, name, id) {
  return page.locator('[data-six-halls-progress="' + name + '"]' + (id ? '[data-hall-id="' + id + '"]' : ''));
}

async function edit(page, name, value, id) {
  await field(page, name, id).fill(String(value));
}

async function select(page, id = 'kuiwei') {
  await page.locator('[data-six-halls-select="' + id + '"]').check();
  await page.locator('[data-six-halls-result-row="' + id + '"]').waitFor({ state: 'visible' });
}

async function calculate(page) {
  await page.locator('[data-six-halls-action="calculate"]').click();
}

async function metric(page, name) {
  return Number((await page.locator('[data-six-halls-herbs="' + name + '"]').innerText()).replace(/[,\s]/g, ''));
}

async function refreshAccess(page) {
  await page.evaluate(() => window.QinshiAccountLease.refresh(window.QinshiAccounts.currentAccount().id));
}

test('a genuinely read-only tab disables every persisted field but still permits memory-only planning', async () => {
  const context = await contextFor();
  try {
    const writer = await pageFor(context);
    await enter(writer);
    await edit(writer, 'herbs', 1000);
    const original = await getAccountItem(writer, KEY);
    const reader = await pageFor(context);
    await enter(reader);
    assert.equal(await reader.evaluate(() => window.QinshiAccounts.isReadOnly()), true);
    assert.equal(await reader.locator('[data-six-halls-progress]').count(), 14);
    assert.equal(await reader.locator('[data-six-halls-progress]:disabled').count(), 14);
    assert.equal(await reader.locator('#six-halls-readonly').isVisible(), true);
    await mode(reader, 'planner');
    await select(reader);
    await reader.locator('[data-six-halls-quick="30"][data-hall-id="kuiwei"]').click();
    assert.equal(await metric(reader, 'need'), 421);
    assert.equal(await metric(reader, 'remaining'), 579);
    assert.equal(await getAccountItem(reader, KEY), original);
  } finally { await context.close(); }
});

test('taking the same account back must retain progress saved by the other editing tab', async () => {
  const context = await contextFor();
  try {
    const first = await pageFor(context);
    await enter(first);
    await edit(first, 'herbs', 1000);
    await edit(first, 'tokens', 77, 'kuiwei');
    await mode(first, 'planner');
    await select(first);
    await first.locator('[data-six-halls-quick="40"][data-hall-id="kuiwei"]').click();
    const second = await pageFor(context);
    await enter(second);
    assert.equal(await second.evaluate(() => window.QinshiAccounts.takeOverEditing()), true);
    await refreshAccess(first);
    await second.waitForFunction(() => !document.querySelector('[data-six-halls-progress="herbs"]').disabled);
    await edit(second, 'herbs', 2000);
    assert.equal((await getAccountJson(second, KEY)).herbs, 2000);
    assert.equal(await first.evaluate(() => window.QinshiAccounts.takeOverEditing()), true);
    await refreshAccess(second);
    await first.waitForFunction(() => document.querySelector('[data-six-halls-herbs="stock"]')?.textContent.replace(/[,\s]/g, '') === '2000');
    assert.equal(await first.locator('#six-halls-planner').isVisible(), true);
    assert.equal(await first.locator('[data-six-halls-select="kuiwei"]').isChecked(), true);
    assert.equal(await first.locator('[data-six-halls-target="kuiwei"]').inputValue(), '40');
    await mode(first, 'progress');
    await first.waitForFunction(() => !document.querySelector('[data-six-halls-progress="level"][data-hall-id="kuiwei"]').disabled);
    await edit(first, 'level', 30, 'kuiwei');
    const saved = await getAccountJson(first, KEY);
    assert.equal(saved.halls.kuiwei.level, 30);
    assert.equal(saved.halls.kuiwei.tokens, 77);
    assert.equal(saved.herbs, 2000, 'editing another field after a lease handoff must not roll shared herbs back to a stale snapshot');
  } finally { await context.close(); }
});

test('all six halls save separate fields and every quick target is scoped to its own hall', async () => {
  const context = await contextFor();
  try {
    const page = await pageFor(context);
    await enter(page);
    for (const [index, id] of IDS.entries()) {
      await edit(page, 'level', index, id);
      await edit(page, 'tokens', 101 + index, id);
    }
    await page.reload();
    await enter(page);
    for (const [index, id] of IDS.entries()) {
      assert.equal(await field(page, 'level', id).inputValue(), String(index));
      assert.equal(await field(page, 'tokens', id).inputValue(), String(101 + index));
    }
    await mode(page, 'planner');
    for (const id of IDS) {
      for (const target of [10, 20, 30, 40, 50]) {
        await page.locator('[data-six-halls-quick="' + target + '"][data-hall-id="' + id + '"]').click();
        for (const checkId of IDS) {
          assert.equal(await page.locator('[data-six-halls-target="' + checkId + '"]').inputValue(), String(checkId === id ? target : 50));
        }
      }
    }
    await mode(page, 'progress');
    await edit(page, 'level', 31, 'kuiwei');
    await mode(page, 'planner');
    for (const target of [10, 20, 30]) assert.equal(await page.locator('[data-six-halls-quick="' + target + '"][data-hall-id="kuiwei"]').isDisabled(), true);
    for (const target of [40, 50]) assert.equal(await page.locator('[data-six-halls-quick="' + target + '"][data-hall-id="kuiwei"]').isDisabled(), false);
    await select(page);
    await page.locator('[data-six-halls-target="kuiwei"]').fill('30');
    await calculate(page);
    assert.match(await page.locator('#six-halls-result').innerText(), /不能|必须|目标/);
    assert.equal(await page.locator('[data-six-halls-herbs="need"]').count(), 0);
  } finally { await context.close(); }
});

test('unknown player levels, locked steps, milestone boundaries and completed targets render distinct states', async () => {
  const context = await contextFor();
  try {
    const page = await pageFor(context);
    await enter(page);
    await mode(page, 'planner');
    await select(page);
    const row = page.locator('[data-six-halls-result-row="kuiwei"]');
    assert.equal(await metric(page, 'need'), 904);
    assert.match(await row.innerText(), /玩家等级未填写.*无法判断/);
    const missingColor = await page.locator('[data-six-halls-herbs="missing"]').evaluate(node => getComputedStyle(node).color);
    assert.equal(missingColor, 'rgb(255, 155, 145)');
    assert.match(await row.innerText(), /本堂信物不足.*435/);
    await mode(page, 'progress');
    await edit(page, 'herbs', 1000);
    await edit(page, 'tokens', 500, 'kuiwei');
    await edit(page, 'playerLevel', 49);
    await mode(page, 'planner');
    assert.equal(await metric(page, 'missing'), 0);
    assert.equal(await page.locator('[data-six-halls-herbs="missing"]').evaluate(node => getComputedStyle(node).color), 'rgb(166, 212, 160)');
    assert.match(await page.locator('#six-halls-result').innerText(), /材料充足.*缺口为0/);
    assert.match(await row.innerText(), /本堂信物充足.*缺口0/);
    assert.match(await row.innerText(), /目标尚未解锁.*89级/);
    await row.locator('summary').click();
    assert.equal(await row.locator('.six-halls-locked-steps li').count(), 41);
    assert.match(await row.locator('.six-halls-locked-steps li').first().innerText(), /9→10级.*玩家等级需50级/);
    assert.match(await row.locator('.six-halls-locked-steps li').last().innerText(), /49→50级.*玩家等级需89级/);
    for (const [player, target, locked] of [[49, 10, true], [50, 10, false], [58, 20, true], [59, 20, false], [68, 30, true], [69, 30, false], [78, 40, true], [79, 40, false], [88, 50, true], [89, 50, false]]) {
      await mode(page, 'progress');
      await edit(page, 'playerLevel', player);
      await mode(page, 'planner');
      await page.locator('[data-six-halls-quick="' + target + '"][data-hall-id="kuiwei"]').click();
      assert.match(await row.innerText(), locked ? /目标尚未解锁/ : /本次目标已解锁/, 'player ' + player + ', target ' + target);
      assert.equal(await row.locator('.six-halls-locked-steps li').count(), locked ? 1 : 0);
    }
    await mode(page, 'progress');
    await edit(page, 'playerLevel', 49);
    await edit(page, 'level', 50, 'kuiwei');
    await mode(page, 'planner');
    assert.match(await row.innerText(), /目标已达成.*无新增消耗/);
    assert.match(await row.innerText(), /高于玩家等级可升上限.*不会自动降低/);
    assert.equal(await metric(page, 'need'), 0);
    assert.equal(await metric(page, 'remaining'), 1000);
    assert.equal((await getAccountJson(page, KEY)).halls.kuiwei.level, 50);
  } finally { await context.close(); }
});

for (const failure of ['false', 'throw']) {
  test('a real UI save that returns ' + failure + ' retains persisted progress and suppresses old planning totals', async () => {
    const context = await contextFor();
    try {
      const page = await pageFor(context);
      await enter(page);
      await edit(page, 'herbs', 1000);
      const original = await getAccountItem(page, KEY);
      await mode(page, 'planner');
      await select(page);
      assert.equal(await metric(page, 'need'), 904);
      await page.evaluate(({ key, failure }) => {
        const original = window.QinshiAccounts.setItem;
        window.__sixHallsOriginalSetItem = original;
        window.QinshiAccounts.setItem = function (logicalKey, value) {
          if (logicalKey !== key) return original.call(this, logicalKey, value);
          if (failure === 'throw') throw new Error('Acceptance test: storage quota exceeded');
          return false;
        };
      }, { key: KEY, failure });
      await mode(page, 'progress');
      await edit(page, 'herbs', 2000);
      await page.locator('#six-halls-error').waitFor({ state: 'visible' });
      assert.match(await page.locator('#six-halls-error').innerText(), /保存失败.*原进度未改变/);
      assert.equal(await getAccountItem(page, KEY), original);
      await mode(page, 'planner');
      assert.equal(await page.locator('[data-six-halls-herbs="need"]').count(), 0);
      assert.match(await page.locator('#six-halls-result').innerText(), /无法计算.*修正/s);
      await page.evaluate(() => { window.QinshiAccounts.setItem = window.__sixHallsOriginalSetItem; });
      await mode(page, 'progress');
      await edit(page, 'herbs', 1500);
      await mode(page, 'planner');
      assert.equal(await metric(page, 'stock'), 1500);
      assert.equal(await metric(page, 'remaining'), 596);
    } finally { await context.close(); }
  });
}

test('backup restore, account snapshots, clear and delete preserve six-halls scope using local-only APIs', async () => {
  const context = await contextFor();
  try {
    const page = await pageFor(context);
    await enter(page);
    await edit(page, 'playerLevel', 89);
    await edit(page, 'herbs', 321);
    await edit(page, 'level', 30, 'kuiwei');
    await edit(page, 'tokens', 155, 'kuiwei');
    await mode(page, 'planner');
    await select(page);
    await page.locator('[data-six-halls-quick="40"][data-hall-id="kuiwei"]').click();
    const result = await page.evaluate(async key => {
      const accounts = window.QinshiAccounts;
      const settings = window.QinshiSettings;
      const source = accounts.currentAccount();
      const original = accounts.getItem(key);
      const payload = settings.makePayload('manual');
      const envelope = await window.QinshiCloudSyncCore.createSnapshotEnvelope({
        appVersion: window.QinshiPWA.version,
        sourceDeviceId: 'six-halls-local-acceptance',
        clientCreatedAt: '2026-10-22T00:00:00.000Z',
        data: payload.data
      });
      const validated = await window.QinshiCloudSyncCore.validateSnapshotEnvelope(JSON.parse(JSON.stringify(envelope)));
      accounts.clearAccountData(source.id);
      const cleared = accounts.getItem(key);
      settings.replaceManagedData(settings.validatePayload(payload));
      const restored = accounts.getItem(key);
      const physical = window.QinshiAccountProfiles.physicalKey(source.id, key);
      const snapshotRaw = validated.data[physical];
      const target = accounts.createAccount({ name: '六堂快照接收测试', server: '本地隔离服' });
      if (!accounts.claimEditing(target.id)) throw new Error('The isolated snapshot target must be writable');
      accounts.replaceAccountData(target.id, accounts.listAccountData(source.id));
      const copied = accounts.listAccountData(target.id)[key];
      accounts.deleteAccount(target.id);
      return {
        original, cleared, restored, snapshotRaw, copied,
        deleted: !accounts.listAccounts().some(account => account.id === target.id),
        deletedPhysical: localStorage.getItem(window.QinshiAccountProfiles.physicalKey(target.id, key)),
        sourceAfterDelete: accounts.getItem(key),
        saved: JSON.parse(original)
      };
    }, KEY);
    assert.equal(result.cleared, null);
    assert.equal(result.restored, result.original);
    assert.equal(result.snapshotRaw, result.original);
    assert.equal(result.copied, result.original);
    assert.equal(result.deleted, true);
    assert.equal(result.deletedPhysical, null);
    assert.equal(result.sourceAfterDelete, result.original);
    assert.deepEqual(Object.keys(result.saved).sort(), ['halls', 'herbs', 'playerLevel', 'version']);
    assert.deepEqual(result.saved.halls.kuiwei, { level: 30, tokens: 155 });
    await page.reload();
    await enter(page);
    assert.equal(await field(page, 'herbs').inputValue(), '321');
    assert.equal(await field(page, 'level', 'kuiwei').inputValue(), '30');
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), false);
    assert.equal(await page.locator('[data-six-halls-target="kuiwei"]').inputValue(), '50');
  } finally { await context.close(); }
});

for (const [width, columns] of [[390, 1], [900, 2], [1440, 3]]) {
  test(width + ': card columns, reference layout and navigation match the approved responsive structure', async () => {
    const context = await contextFor(width);
    try {
      const page = await pageFor(context);
      const navigation = width === 390 ? '#mobile-more-layer [data-partition]' : '.tab[data-partition]';
      const names = await page.locator(navigation).evaluateAll(nodes => nodes.map(node => node.dataset.partition));
      const position = names.indexOf('six-halls');
      assert.deepEqual(names.slice(position - 1, position + 2), ['formations', 'six-halls', 'loulan']);
      await enter(page);
      for (const value of ['progress', 'planner']) {
        await mode(page, value);
        const actual = await page.locator('#six-halls-' + value + ' > .six-halls-grid').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
        assert.equal(actual, columns);
      }
      await mode(page, 'reference');
      const styles = await page.locator('.six-halls-reference-table').evaluate(node => ({
        table: getComputedStyle(node).display,
        heading: getComputedStyle(node.tHead).display,
        row: getComputedStyle(node.tBodies[0].rows[0]).display
      }));
      if (width === 390) assert.deepEqual(styles, { table: 'block', heading: 'none', row: 'block' });
      else assert.equal(styles.table, 'table');
      const first = page.locator('#six-halls-reference tbody tr').first();
      assert.equal(await first.locator('[data-label="玩家等级门槛"]').innerText(), '—');
      assert.equal(await first.locator('[data-label="单次七星珠草"]').innerText(), '3');
      assert.equal(await first.locator('[data-label="单次信物"]').innerText(), '1');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  });
}

test('leaving six halls cancels a queued render without clearing its target draft or rebuilding other partitions', async () => {
  const context = await contextFor();
  try {
    const page = await pageFor(context);
    await page.evaluate(() => {
      const create = window.UI_PERFORMANCE.createRefreshQueue;
      window.__sixHallsQueueProbe = { renders: 0, cancels: 0 };
      window.UI_PERFORMANCE.createRefreshQueue = function (render, delay) {
        const queue = create(function () { window.__sixHallsQueueProbe.renders++; render(); }, delay);
        const cancel = queue.cancel;
        queue.cancel = function () { window.__sixHallsQueueProbe.cancels++; cancel(); };
        return queue;
      };
    });
    await enter(page);
    await mode(page, 'planner');
    await select(page);
    const before = await page.evaluate(() => {
      window.__sixHallsAtlasProbe = document.querySelector('#partition-atlas').firstElementChild;
      const before = window.__sixHallsQueueProbe.renders;
      const target = document.querySelector('[data-six-halls-target="kuiwei"]');
      target.value = '40';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.tab[data-partition="atlas"]').click();
      return before;
    });
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({
      ...window.__sixHallsQueueProbe,
      sameAtlas: window.__sixHallsAtlasProbe === document.querySelector('#partition-atlas').firstElementChild
    }));
    assert.equal(after.renders, before, 'the pending six-halls render must not execute after navigation away');
    assert.ok(after.cancels > 0);
    assert.equal(after.sameAtlas, true);
    await enter(page);
    await mode(page, 'planner');
    assert.equal(await page.locator('[data-six-halls-target="kuiwei"]').inputValue(), '40');
    assert.equal(await page.locator('[data-six-halls-select="kuiwei"]').isChecked(), true);
  } finally { await context.close(); }
});

test('the installed service worker precaches all four six-halls resources and supports offline planning', async () => {
  const context = await contextFor(390, 'allow');
  try {
    const page = await pageFor(context);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await enter(page);
    await edit(page, 'herbs', 1000);
    const cacheState = await page.evaluate(async () => {
      const keys = await caches.keys();
      const resources = ['css/six-halls.css', 'data/six-halls.js', 'js/six-halls.js', 'js/six-halls-ui.js'];
      const present = {};
      for (const resource of resources) {
        const response = await caches.match(new URL(resource, location.href).href, { ignoreSearch: true });
        present[resource] = Boolean(response && response.ok && (await response.text()).length);
      }
      return { keys, present, version: window.QinshiPWA.version };
    });
    assert.equal(cacheState.version, currentAppVersion());
    assert.ok(cacheState.keys.includes('qinshi-site-' + currentAppVersion()));
    assert.deepEqual(cacheState.present, {
      'css/six-halls.css': true, 'data/six-halls.js': true,
      'js/six-halls.js': true, 'js/six-halls-ui.js': true
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await enter(page);
    assert.equal(await field(page, 'herbs').inputValue(), '1000');
    await mode(page, 'planner');
    await select(page);
    assert.equal(await metric(page, 'need'), 904);
    assert.equal(await metric(page, 'remaining'), 96);
    await mode(page, 'reference');
    assert.equal(await page.locator('#six-halls-reference tbody tr').count(), 50);
  } finally { await context.close(); }
});
