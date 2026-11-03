const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRenderCoordinator, createQueryBatchRenderer } = require("./inscription-performance.js");

function createManualScheduler() {
  let nextId = 1;
  const jobs = new Map();
  return {
    schedule(callback) {
      const id = nextId++;
      jobs.set(id, callback);
      return id;
    },
    cancel(id) {
      jobs.delete(id);
    },
    flush() {
      const pending = Array.from(jobs.values());
      jobs.clear();
      pending.forEach((callback) => callback());
    },
    size() {
      return jobs.size;
    }
  };
}

function createHarness() {
  const calls = { progress: 0, query: 0, reference: 0 };
  const scheduler = createManualScheduler();
  const coordinator = createRenderCoordinator({
    renderers: {
      progress() { calls.progress += 1; },
      query() { calls.query += 1; },
      reference() { calls.reference += 1; }
    },
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    queryDelay: 120
  });
  return { calls, scheduler, coordinator };
}

test("子页面仅在首次激活或失效后渲染", () => {
  const { calls, coordinator } = createHarness();

  assert.equal(coordinator.activate("progress"), true);
  assert.equal(coordinator.activate("progress"), false);
  assert.deepEqual(calls, { progress: 1, query: 0, reference: 0 });

  assert.equal(coordinator.activate("query"), true);
  assert.equal(coordinator.activate("reference"), true);
  assert.equal(coordinator.activate("query"), false);
  assert.deepEqual(calls, { progress: 1, query: 1, reference: 1 });
});

test("隐藏页失效时延迟刷新而当前页失效时立即刷新", () => {
  const { calls, coordinator } = createHarness();

  coordinator.activate("progress");
  coordinator.markDirty("query");
  assert.equal(calls.query, 0);

  coordinator.activate("query");
  assert.equal(calls.query, 1);
  coordinator.invalidate("query");
  assert.equal(calls.query, 2);

  coordinator.activate("progress");
  coordinator.invalidate("query");
  assert.equal(calls.query, 2);
  coordinator.activate("query");
  assert.equal(calls.query, 3);
});

test("连续搜索输入只执行最后一次查询刷新", () => {
  const { calls, scheduler, coordinator } = createHarness();

  coordinator.activate("query");
  coordinator.scheduleQuery();
  coordinator.scheduleQuery();
  coordinator.scheduleQuery();

  assert.equal(scheduler.size(), 1);
  assert.equal(calls.query, 1);
  scheduler.flush();
  assert.equal(calls.query, 2);
});

test("离开查询页会取消尚未执行的搜索刷新并保留失效状态", () => {
  const { calls, scheduler, coordinator } = createHarness();

  coordinator.activate("query");
  coordinator.scheduleQuery();
  coordinator.activate("progress");

  assert.equal(scheduler.size(), 0);
  scheduler.flush();
  assert.equal(calls.query, 1);
  coordinator.activate("query");
  assert.equal(calls.query, 2);
});

test("查询分批安装且保持所有结果顺序", () => {
  const scheduler = createManualScheduler(), batches = [];
  const renderer = createQueryBatchRenderer({
    batchSize: 2, schedule: scheduler.schedule, cancel: scheduler.cancel,
    renderBatch(items, replace) { batches.push({ items, replace }); }
  });
  renderer.render(["a", "b", "c", "d", "e"]);
  assert.deepEqual(batches, [{ items: ["a", "b"], replace: true }]);
  scheduler.flush();
  assert.deepEqual(batches[1], { items: ["c", "d"], replace: false });
  scheduler.flush();
  assert.deepEqual(batches[2], { items: ["e"], replace: false });
  assert.equal(renderer.cancel(), false, "completed results are reusable");
});

test("取消或新查询不会继续追加旧批次", () => {
  const scheduler = createManualScheduler(), batches = [];
  const renderer = createQueryBatchRenderer({
    batchSize: 1, schedule: scheduler.schedule, cancel: scheduler.cancel,
    renderBatch(items, replace) { batches.push({ items, replace }); }
  });
  renderer.render(["old-1", "old-2"]);
  assert.equal(renderer.cancel(), true);
  scheduler.flush();
  assert.equal(batches.length, 1);
  renderer.render(["next-1", "next-2"]);
  renderer.render(["latest"]);
  scheduler.flush();
  assert.deepEqual(batches.map(row => row.items), [["old-1"], ["next-1"], ["latest"]]);
});

test("账号上下文改变时停止追加并失效查询", () => {
  const scheduler = createManualScheduler(), batches = [];
  let current = true, invalidated = 0;
  const renderer = createQueryBatchRenderer({
    batchSize: 1, schedule: scheduler.schedule, cancel: scheduler.cancel,
    isCurrent() { return current; }, onCancel() { invalidated += 1; },
    renderBatch(items) { batches.push(items); }
  });
  renderer.render(["account-a-1", "account-a-2"]);
  current = false;
  scheduler.flush();
  assert.deepEqual(batches, [["account-a-1"]]);
  assert.equal(invalidated, 1);
});

test("离开分区取消未完成批次后返回会重新查询，已完成查询不重绘", () => {
  let incomplete = true, calls = 0, cancellations = 0;
  const coordinator = createRenderCoordinator({
    renderers: { query() { calls += 1; }, progress() {} },
    cancelQueryRender() { cancellations += 1; const pending = incomplete; incomplete = false; return pending; }
  });
  coordinator.activate("query");
  coordinator.cancelPendingQuery();
  coordinator.activate("query");
  assert.equal(calls, 2);
  coordinator.activate("progress");
  coordinator.activate("query");
  assert.equal(calls, 2);
  assert.equal(cancellations, 2);
});
