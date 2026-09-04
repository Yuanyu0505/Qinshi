const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('连续输入合并成一次刷新，即时操作取消旧任务', async () => {
  assert.ok(fs.existsSync(__dirname + '/ui-performance.js'), '缺少可取消的输入刷新队列');
  const { createRefreshQueue } = require('./ui-performance.js');
  let count = 0;
  const queue = createRefreshQueue(() => ++count, 5);
  queue.schedule(); queue.schedule(); queue.schedule();
  assert.equal(count, 0);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(count, 1);
  queue.schedule(); queue.flush();
  assert.equal(count, 2);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(count, 2);
  queue.schedule(); queue.cancel();
  await new Promise(r => setTimeout(r, 25));
  assert.equal(count, 2);
});

test('中文组词只同步状态不重绘，组词完成后使用最终文字', async () => {
  assert.ok(fs.existsSync(__dirname + '/ui-performance.js'), '缺少输入法安全的刷新绑定');
  const { createRefreshQueue, bindInput } = require('./ui-performance.js');
  const input = new EventTarget();
  const rendered = []; let state = '';
  const queue = createRefreshQueue(() => rendered.push(state), 5);
  bindInput(input, () => { state = input.value; }, queue);
  input.dispatchEvent(new Event('compositionstart'));
  input.value = 'shen'; input.dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r, 25));
  assert.equal(state, 'shen'); assert.deepEqual(rendered, []);
  input.value = '神兵'; input.dispatchEvent(new Event('compositionend'));
  input.dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r, 25));
  assert.deepEqual(rendered, ['神兵']);
});
