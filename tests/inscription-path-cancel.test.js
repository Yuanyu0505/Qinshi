const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createContext, runInContext } = require('node:vm');

const target = { prefix: '天府', dun: '虎遁', quality: 'o2', attrs: ['内力', '招架', '治疗效果'] };
const concrete = { ...target, attrs: ['内力', '追加伤害', '治疗效果'], xTerm: { attr: '闪避', tier: 'U' } };

function harness() {
  const messages = [], tasks = [];
  let now = 0;
  const context = createContext({ location: { search: '' }, performance: { now: () => ++now },
    setTimeout: callback => tasks.push(callback), postMessage: data => messages.push(data) });
  context.self = context;
  function load(file) { runInContext(readFileSync(join(__dirname, '../js', file), 'utf8'), context, { filename: file }); }
  context.importScripts = (...files) => files.forEach(load);
  load('inscription-path-worker.js');
  return { send: data => context.onmessage({ data }), tasks, messages,
    drain() { let count = 0; while (tasks.length && ++count < 10000) tasks.shift()(); assert.equal(tasks.length, 0); } };
}

test('a cancellation queued after route enumeration starts is acknowledged without a route result', () => {
  const runner = harness();
  runner.send(target);
  assert.equal(runner.messages.length, 0, 'the real solver must yield before returning all routes');
  assert.ok(runner.tasks.length, 'a further batch is pending');
  runner.send({ type: 'cancel-route' });
  runner.drain();
  assert.equal(runner.messages.length, 1);
  assert.equal(runner.messages[0].cancelled, true);
  assert.equal(runner.messages[0].interrupted, true);
  assert.equal(runner.messages[0].result, undefined);
  runner.send(concrete);
  runner.drain();
  assert.equal(runner.messages[1].result.strategies.length, 12, 'a cancelled job must not poison the next request');
});

test('the worker keeps the complete route payload and order from the pre-change solver', () => {
  const cases = [
    [target, '6761d9272d26459f62bfb44edf812a56573c7e683f5a19500eab074b95a46e05'],
    [concrete, '1c8ec98e7ca3945520872a6a6c996488bd23b4a5060536829cc69021353f438a'],
    [{ ...target, dun: '风遁', attrs: ['攻击', '暴击', '招架'] }, 'cc798ce5000b9f46115ea607c3f10f9113f966e4b35a871bd4f7630729464a6d']
  ];
  for (const [goal, digest] of cases) {
    const runner = harness();
    runner.send(goal);
    runner.drain();
    assert.equal(runner.messages.length, 1);
    assert.equal(createHash('sha256').update(JSON.stringify(runner.messages[0].result)).digest('hex'), digest);
  }
});
