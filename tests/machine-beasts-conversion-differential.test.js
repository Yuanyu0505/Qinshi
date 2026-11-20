'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load } = require('../tools/machine-baseline-loader.cjs');

test('baseline loader keeps the complete native module graph private', () => {
  const baseline = load('d667c2b'), current = load();
  assert.notEqual(baseline.core, current.core);
  assert.notEqual(baseline.planner, current.planner);
  assert.notEqual(baseline.equivalents, current.equivalents);
  assert.notEqual(baseline.data, current.data);
  // Independent data objects prevent accidental shared fixture mutation.
  assert.notEqual(baseline.data.beasts, current.data.beasts);
  assert.equal(typeof baseline.core.conversionCandidates, 'function');
  assert.equal(typeof baseline.planner.equivalentPlansPage, 'function');
});

test('actual inventory-conversion path retains complete baseline JSON and every bounded page', { timeout: 60000 }, () => {
  const child = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/compare-machine-conversion.cjs'), 'd667c2b'], {
    encoding: 'utf8', timeout: 55000, windowsHide: true, maxBuffer: 1024 * 1024
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const record = JSON.parse(child.stdout.trim());
  assert.equal(record.result, 'identical');
  assert.equal(record.seed, 1147);
  assert.equal(record.singles, 360);
  assert.equal(record.schools, 180);
  assert.equal(record.frontiers, 720);
  assert.ok(record.pages >= 360);
});
