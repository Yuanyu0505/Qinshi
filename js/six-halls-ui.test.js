const { test } = require('node:test');
const assert = require('node:assert/strict');

const DATA = require('../data/six-halls.js');
const CORE = require('./six-halls.js');
const UI = require('./six-halls-ui.js');

const STORE_KEY = 'qinshi_six_halls_progress_v1';

function memoryStore() {
  let active = 'a';
  const values = { a: {}, b: {} };
  const accessListeners = new Set();
  const store = {
    readOnly: false,
    readFailure: false,
    failure: null,
    writes: 0,
    beforeWrite: null,
    currentAccount: () => ({ id: active, name: active === 'a' ? '主号' : '小号', server: '测试服' }),
    isReadOnly: () => store.readOnly,
    subscribeAccess(listener) {
      accessListeners.add(listener);
      return () => accessListeners.delete(listener);
    },
    signalAccess(id = active) {
      accessListeners.forEach(listener => listener({ accountId: id, writable: !store.readOnly }));
    },
    getItem(key) {
      if (store.readFailure) throw new Error('Storage access denied');
      return values[active][key] ?? null;
    },
    setItem(key, value) {
      if (store.beforeWrite) store.beforeWrite(key, value);
      store.writes += 1;
      if (store.failure === 'throw') throw new Error('Storage quota exceeded');
      if (store.readOnly || store.failure === 'false') return false;
      values[active][key] = String(value);
      return true;
    },
    switchTo: id => { active = id; },
    seed: (id, raw) => { values[id][STORE_KEY] = raw; },
    raw: values
  };
  return store;
}

function controller(store = memoryStore()) {
  return UI.createController({ data: DATA, core: CORE, store });
}

test('first load leaves account storage untouched and defaults to unknown player level', () => {
  const store = memoryStore();
  const control = controller(store);
  assert.equal(control.state.progress.playerLevel, null);
  assert.equal(control.state.progress.herbs, 0);
  assert.equal(control.state.progress.halls.kuiwei.level, 0);
  assert.equal(control.state.progress.halls.kuiwei.tokens, 0);
  assert.deepEqual(control.state.plan.selected, []);
  assert.equal(control.state.plan.targets.kuiwei, 50);
  assert.equal(store.getItem(STORE_KEY), null);
  assert.equal(store.writes, 0);
});

test('unchanged persisted progress skips writes but rechecks current storage and editing rights', () => {
  const store = memoryStore();
  const control = controller(store);
  assert.equal(control.setProgress('herbs', '1000'), true);
  assert.equal(store.writes, 1);
  assert.equal(control.setProgress('herbs', '01000'), true);
  assert.equal(store.writes, 1);
  const external = JSON.parse(store.getItem(STORE_KEY));
  external.herbs = 7;
  store.seed('a', JSON.stringify(external));
  assert.equal(control.setProgress('herbs', '1000'), true);
  assert.equal(store.writes, 2);
  store.readOnly = true;
  assert.equal(control.setProgress('herbs', '1000'), false);
  assert.match(control.state.error, /只读/);
});

test('successful writes persist real progress before replacing the visible state', () => {
  const store = memoryStore();
  const control = controller(store);
  const previous = control.state.progress;
  store.beforeWrite = (key, raw) => {
    assert.equal(key, STORE_KEY);
    assert.strictEqual(control.state.progress, previous);
    assert.equal(control.state.progress.herbs, 0);
    assert.equal(JSON.parse(raw).herbs, 1000);
  };
  assert.equal(control.setProgress('herbs', '1000'), true);
  store.beforeWrite = null;
  assert.notStrictEqual(control.state.progress, previous);
  assert.equal(control.state.progress.herbs, 1000);
  assert.equal(JSON.parse(store.getItem(STORE_KEY)).herbs, 1000);
  assert.equal(control.state.error, '');
});

test('editing current level neither deducts nor refunds either inventory', () => {
  const store = memoryStore();
  const control = controller(store);
  assert.equal(control.setProgress('herbs', 1000), true);
  assert.equal(control.setProgress('tokens', 435, 'kuiwei'), true);
  assert.equal(control.setProgress('level', 30, 'kuiwei'), true);
  assert.equal(control.state.progress.herbs, 1000);
  assert.equal(control.state.progress.halls.kuiwei.tokens, 435);
  assert.equal(control.setProgress('level', 10, 'kuiwei'), true);
  assert.equal(control.state.progress.herbs, 1000);
  assert.equal(control.state.progress.halls.kuiwei.tokens, 435);
  assert.equal(JSON.parse(store.getItem(STORE_KEY)).halls.kuiwei.level, 10);
});

for (const failure of ['false', 'throw']) {
  test('a store ' + failure + ' failure preserves the earlier progress and both inventories', () => {
    const store = memoryStore();
    const control = controller(store);
    control.setProgress('herbs', 1000);
    control.setProgress('tokens', 77, 'kuiwei');
    const previous = control.state.progress;
    const raw = store.getItem(STORE_KEY);
    store.failure = failure;
    for (const [field, value, id] of [['herbs', 12], ['tokens', 3, 'kuiwei'], ['level', 50, 'kuiwei'], ['playerLevel', 89]]) {
      assert.equal(control.setProgress(field, value, id), false);
      assert.strictEqual(control.state.progress, previous);
      assert.equal(control.state.progress.herbs, 1000);
      assert.equal(control.state.progress.halls.kuiwei.tokens, 77);
      assert.equal(control.state.progress.halls.kuiwei.level, 0);
      assert.equal(store.getItem(STORE_KEY), raw);
      assert.ok(control.state.error, 'failed writes must not look successful');
    }
  });
}

test('read-only accounts reject saved edits but still permit temporary planning', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  const previous = control.state.progress;
  const raw = store.getItem(STORE_KEY);
  store.readOnly = true;
  assert.equal(control.setProgress('herbs', 0), false);
  assert.strictEqual(control.state.progress, previous);
  assert.equal(store.getItem(STORE_KEY), raw);
  assert.ok(control.state.error);
  control.setMode('planner');
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 30);
  const result = control.calculate();
  assert.equal(result.valid, true);
  assert.equal(result.herbs.need, 421);
  assert.equal(result.herbs.remaining, 579);
  assert.equal(store.getItem(STORE_KEY), raw);
});

test('invalid progress inputs cannot silently become zero or a successful save', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  control.setProgress('tokens', 20, 'kuiwei');
  const previous = control.state.progress;
  const raw = store.getItem(STORE_KEY);
  const writes = store.writes;
  for (const [field, id] of [['herbs'], ['tokens', 'kuiwei'], ['level', 'kuiwei'], ['playerLevel']]) {
    for (const input of ['bad', -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '9007199254740992']) {
      assert.equal(control.setProgress(field, input, id), false, field + ': ' + String(input));
      assert.strictEqual(control.state.progress, previous);
      assert.equal(store.getItem(STORE_KEY), raw);
      assert.equal(store.writes, writes);
      assert.ok(control.state.error);
    }
  }
  assert.equal(control.setProgress('level', 51, 'kuiwei'), false);
  assert.equal(control.setProgress('herbs', ''), false);
  assert.equal(store.getItem(STORE_KEY), raw);
});

test('clearing player level saves null instead of guessing level zero', () => {
  const store = memoryStore();
  const control = controller(store);
  assert.equal(control.setProgress('playerLevel', 89), true);
  assert.equal(control.setProgress('playerLevel', ''), true);
  assert.equal(control.state.progress.playerLevel, null);
  assert.equal(JSON.parse(store.getItem(STORE_KEY)).playerLevel, null);
  control.toggleHall('kuiwei', true);
  const result = control.calculate();
  assert.equal(result.playerLevelKnown, false);
  assert.equal(result.playerCap, null);
  assert.equal(result.herbs.need, 904);
});

test('planning, mode switches and calculation never persist selected halls or targets', () => {
  const store = memoryStore();
  const control = controller(store);
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 30);
  control.setMode('planner');
  assert.equal(control.calculate().herbs.need, 421);
  control.setMode('reference');
  control.setMode('progress');
  control.setMode('planner');
  assert.deepEqual(control.state.plan.selected, ['kuiwei']);
  assert.equal(control.state.plan.targets.kuiwei, 30);
  assert.equal(store.writes, 0);
  assert.equal(store.getItem(STORE_KEY), null);
  control.setProgress('herbs', 1000);
  const saved = JSON.parse(store.getItem(STORE_KEY));
  assert.deepEqual(Object.keys(saved).sort(), ['halls', 'herbs', 'playerLevel', 'version']);
  assert.deepEqual(Object.keys(saved.halls.kuiwei).sort(), ['level', 'tokens']);
  assert.equal(saved.selected, undefined);
  assert.equal(saved.targets, undefined);
  assert.equal(saved.plan, undefined);
  const reloaded = controller(store);
  assert.equal(reloaded.state.progress.herbs, 1000);
  assert.deepEqual(reloaded.state.plan.selected, []);
  assert.equal(reloaded.state.plan.targets.kuiwei, 50);
});

test('calculation does not apply a plan to current levels or stocks', () => {
  const control = controller();
  control.setProgress('herbs', 1000);
  control.setProgress('tokens', 500, 'kuiwei');
  control.toggleHall('kuiwei', true);
  const snapshot = JSON.stringify(control.state.progress);
  assert.equal(control.calculate().herbs.need, 904);
  assert.equal(control.calculate().rows[0].tokenRemaining, 65);
  assert.equal(JSON.stringify(control.state.progress), snapshot);
});

test('an invalid selected target replaces the old successful calculation with an error', () => {
  const control = controller();
  control.toggleHall('kuiwei', true);
  assert.equal(control.calculate().herbs.need, 904);
  control.setTarget('kuiwei', 'bad');
  const result = control.calculate();
  assert.equal(result.valid, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.herbs, null);
});

test('an invalid progress draft hides previous totals until the field is corrected and saved', () => {
  const control = controller();
  control.toggleHall('kuiwei', true);
  assert.equal(control.calculate().herbs.need, 904);
  assert.equal(control.setProgress('herbs', 'bad'), false);
  assert.equal(control.state.progress.herbs, 0);
  let result = control.calculate();
  assert.equal(result.valid, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.herbs, null);
  assert.equal(control.setProgress('herbs', 1000), true);
  result = control.calculate();
  assert.equal(result.valid, true);
  assert.deepEqual(result.herbs, { need: 904, stock: 1000, missing: 0, remaining: 96 });
});

test('an invalid unselected target does not affect the selected hall', () => {
  const control = controller();
  control.toggleHall('kuiwei', true);
  control.setTarget('chiyou', 'bad');
  const result = control.calculate();
  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.herbs.need, 904);
});

test('a saved level increase never silently raises an already edited temporary target', () => {
  const control = controller();
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 9);
  assert.equal(control.calculate().valid, true);
  assert.equal(control.setProgress('level', 11, 'kuiwei'), true);
  assert.equal(control.state.plan.targets.kuiwei, 9);
  const result = control.calculate();
  assert.equal(result.valid, false);
  assert.deepEqual(result.rows, []);
  assert.equal(result.herbs, null);
});

test('controllers load account-scoped progress and start fresh planning drafts on account changes', () => {
  const store = memoryStore();
  const first = controller(store);
  first.setProgress('herbs', 1000);
  first.setProgress('level', 30, 'kuiwei');
  first.toggleHall('kuiwei', true);
  first.setTarget('kuiwei', 40);
  store.switchTo('b');
  const second = controller(store);
  assert.equal(second.state.progress.herbs, 0);
  assert.equal(second.state.progress.halls.kuiwei.level, 0);
  assert.deepEqual(second.state.plan.selected, []);
  assert.equal(second.state.plan.targets.kuiwei, 50);
  second.setProgress('herbs', 3);
  store.switchTo('a');
  const restored = controller(store);
  assert.equal(restored.state.progress.herbs, 1000);
  assert.equal(restored.state.progress.halls.kuiwei.level, 30);
  assert.deepEqual(restored.state.plan.selected, []);
  assert.equal(restored.state.plan.targets.kuiwei, 50);
});

test('an existing controller also discards its draft if the active account changes', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 30);
  store.switchTo('b');
  control.setMode('planner');
  assert.equal(control.state.progress.herbs, 0);
  assert.deepEqual(control.state.plan.selected, []);
  assert.equal(control.state.plan.targets.kuiwei, 50);
  store.switchTo('a');
  control.calculate();
  assert.equal(control.state.progress.herbs, 1000);
  assert.deepEqual(control.state.plan.selected, []);
  assert.equal(control.state.plan.targets.kuiwei, 50);
});

test('corrupt imported JSON is reported without an automatic write over the original data', () => {
  const store = memoryStore();
  const damaged = '{"version":1,"herbs":1000,';
  store.seed('a', damaged);
  const control = controller(store);
  assert.ok(control.state.error);
  assert.equal(store.getItem(STORE_KEY), damaged);
  assert.equal(store.writes, 0);
  control.setMode('planner');
  control.toggleHall('kuiwei', true);
  assert.equal(control.calculate().valid, false);
  assert.equal(control.setProgress('herbs', 30), false);
  assert.ok(control.state.error);
  assert.equal(store.getItem(STORE_KEY), damaged);
  assert.equal(store.writes, 0);
});

test('a storage read exception blocks replacement writes instead of treating missing data as empty', () => {
  const store = memoryStore();
  const raw = '{"version":1,"herbs":1000,"playerLevel":89,"halls":{}}';
  store.seed('a', raw);
  store.readFailure = true;
  const control = controller(store);
  assert.ok(control.state.error);
  assert.equal(control.setProgress('herbs', 3), false);
  control.toggleHall('kuiwei', true);
  assert.equal(control.calculate().valid, false);
  assert.equal(store.raw.a[STORE_KEY], raw);
  assert.equal(store.writes, 0);
});

test('empty stored strings and non-object JSON cannot masquerade as a new account', () => {
  for (const raw of ['', '   ', 'null', '[]', 'false', '42', '"text"']) {
    const store = memoryStore();
    store.seed('a', raw);
    const control = controller(store);
    assert.ok(control.state.error, JSON.stringify(raw));
    assert.match(control.state.error, /备份|恢复/);
    assert.equal(control.setProgress('herbs', 3), false);
    control.toggleHall('kuiwei', true);
    assert.equal(control.calculate().valid, false);
    assert.equal(store.getItem(STORE_KEY), raw);
    assert.equal(store.writes, 0);
  }
});

test('saving one field rebases on the latest persisted progress instead of a stale page snapshot', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  const latest = JSON.parse(store.getItem(STORE_KEY));
  latest.herbs = 2000;
  latest.halls.chiyou = { level: 20, tokens: 333 };
  store.seed('a', JSON.stringify(latest));
  assert.equal(control.setProgress('level', 30, 'kuiwei'), true);
  const saved = JSON.parse(store.getItem(STORE_KEY));
  assert.equal(saved.herbs, 2000);
  assert.deepEqual(saved.halls.chiyou, { level: 20, tokens: 333 });
  assert.equal(saved.halls.kuiwei.level, 30);
  assert.deepEqual(control.state.progress, saved);
});

test('same-account access refresh loads new progress without clearing the selected target or subview', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 30);
  control.setMode('planner');
  const latest = JSON.parse(store.getItem(STORE_KEY));
  latest.herbs = 2000;
  latest.halls.kuiwei = { level: 31, tokens: 88 };
  store.seed('a', JSON.stringify(latest));
  const writes = store.writes;
  store.signalAccess();
  assert.equal(control.state.progress.herbs, 2000);
  assert.deepEqual(control.state.progress.halls.kuiwei, { level: 31, tokens: 88 });
  assert.deepEqual(control.state.plan.selected, ['kuiwei']);
  assert.equal(control.state.plan.targets.kuiwei, 30);
  assert.equal(control.state.mode, 'planner');
  assert.equal(control.calculate().valid, false, 'a retained target below the new current level must be revalidated');
  assert.equal(store.writes, writes);
});

test('lease heartbeat notifications preserve invalid input feedback and memory-only planning', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 40);
  control.setMode('planner');
  control.setProgress('herbs', 'bad');
  const original = store.getItem(STORE_KEY);
  const writes = store.writes;
  store.signalAccess();
  store.signalAccess();
  assert.equal(control.state.mode, 'planner');
  assert.deepEqual(control.state.plan.selected, ['kuiwei']);
  assert.equal(control.state.plan.targets.kuiwei, 40);
  assert.ok(control.state.fieldErrors.herbs);
  assert.equal(control.calculate().valid, false);
  assert.equal(store.getItem(STORE_KEY), original);
  assert.equal(store.writes, writes);
});

test('a fresh storage read failure at save time cannot overwrite previously saved progress', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  const previous = control.state.progress;
  const raw = store.getItem(STORE_KEY);
  const writes = store.writes;
  store.readFailure = true;
  assert.equal(control.setProgress('level', 30, 'kuiwei'), false);
  assert.strictEqual(control.state.progress, previous);
  assert.equal(store.raw.a[STORE_KEY], raw);
  assert.equal(store.writes, writes);
  assert.ok(control.state.loadError);
  control.toggleHall('kuiwei', true);
  assert.equal(control.calculate().valid, false);
});

test('JSON damaged after the initial load is protected before applying a single-field save', () => {
  const store = memoryStore();
  const control = controller(store);
  control.setProgress('herbs', 1000);
  const damaged = '{"version":1,"herbs":2000,';
  store.seed('a', damaged);
  const writes = store.writes;
  assert.equal(control.setProgress('level', 30, 'kuiwei'), false);
  assert.equal(store.getItem(STORE_KEY), damaged);
  assert.equal(store.writes, writes);
  assert.ok(control.state.loadError);
});

test('access notifications for another account never reset the active account draft', () => {
  const store = memoryStore();
  const control = controller(store);
  control.toggleHall('kuiwei', true);
  control.setTarget('kuiwei', 30);
  control.setMode('planner');
  store.readFailure = true;
  store.signalAccess('b');
  assert.equal(control.state.loadError, '');
  assert.equal(control.state.mode, 'planner');
  assert.deepEqual(control.state.plan.selected, ['kuiwei']);
  assert.equal(control.state.plan.targets.kuiwei, 30);
});
