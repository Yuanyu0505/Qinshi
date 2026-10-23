const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(Worker) {
  const root = { setTimeout, clearTimeout, URL, structuredClone, Worker,
    location: { protocol: 'http:' }, document: { currentScript: { src: 'http://localhost/js/calculation-runner.js?v=1.0.57' } } };
  const context = { window: root, globalThis: root, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./calculation-runner.js'), 'utf8'), context);
  return context.module.exports;
}
class WorkerPort {
  static all = [];
  constructor(url) { this.url = String(url); WorkerPort.all.push(this); }
  postMessage(message) { this.message = message; }
  terminate() { this.terminated = true; }
  respond(value) { this.onmessage({ data: { id: this.message.id, result: value } }); }
}

test('background result is returned without executing the blocking fallback', async () => {
  const runner = load(WorkerPort).create({ kind: 'wooden', fallback() { throw Error('fallback should not run'); } });
  const pending = runner.run({ direction: 'target', input: { targetFloor: 500 } });
  const port = WorkerPort.all.at(-1);
  assert.match(port.url, /calculation-worker\.js\?v=1\.0\.57$/);
  assert.equal(port.message.kind, 'wooden');
  port.respond({ demand: 42 });
  assert.equal((await pending).demand, 42);
  runner.dispose();
});

test('starting another run rejects the stale run and cannot accept its later result', async () => {
  const runner = load(WorkerPort).create({ kind: 'beast-single', fallback: x => x });
  const old = runner.run({ targetLevel: 10 });
  const rejected = assert.rejects(old, error => error.name === 'AbortError');
  const first = WorkerPort.all.at(-1);
  const fresh = runner.run({ targetLevel: 20 });
  first.respond('stale');
  WorkerPort.all.at(-1).respond('fresh');
  await rejected;
  assert.equal(await fresh, 'fresh');
  assert.equal(first.terminated, true);
  runner.dispose();
});

test('worker failure falls back asynchronously using a detached input snapshot', async () => {
  const payload = { value: 7 };
  const runner = load(WorkerPort).create({ kind: 'wooden', fallback: x => x.value });
  const pending = runner.run(payload);
  payload.value = 99;
  WorkerPort.all.at(-1).onerror({ preventDefault() {} });
  assert.equal(await pending, 7);
  runner.dispose();
});

test('unsupported worker still computes and propagates fallback errors', async () => {
  const runner = load(undefined).create({ kind: 'wooden', fallback: x => { if (x.fail) throw Error('bad input'); return x.value; } });
  assert.equal(await runner.run({ value: 0 }), 0);
  await assert.rejects(runner.run({ fail: true }), /bad input/);
  runner.dispose();
});

test('cancel prevents a scheduled fallback from executing', async () => {
  let called = false;
  const runner = load(undefined).create({ kind: 'wooden', fallback() { called = true; } });
  const pending = runner.run({});
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  runner.cancel();
  await rejected;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(called, false);
  runner.dispose();
});
