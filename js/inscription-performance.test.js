const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRenderCoordinator } = require("./inscription-performance.js");

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
