const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('school worker forwards sparse task-tagged real phases before the complete result', () => {
  const messages = [], imports = [];
  const self = { location: { search: '?v=test' }, postMessage: value => messages.push(structuredClone(value)),
    MACHINE_BEAST_DATA: {}, MACHINE_BEAST_SCHOOL_PLANNER: {
      calculateSchoolPlans(data, schoolId, progress, options) {
        assert.equal(schoolId, 'synthetic-school');
        assert.equal(options.convertOwnedInventory, true);
        options.onPhase('candidate-preparation');
        options.onPhase('candidate-preparation');
        options.onPhase('school-combine');
        options.onPhase('equivalent-graph');
        return { valid: true, total: '768', unchanged: options.targetStage };
      }
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('./calculation-worker.js'), 'utf8'), { self, importScripts: path => imports.push(path) });
  const options = { targetStage: 5, convertOwnedInventory: true };
  self.onmessage({ data: { id: 42, kind: 'beast-school', input: { schoolId: 'synthetic-school', progressByBeast: {}, options } } });
  assert.deepEqual(messages, [
    { id: 42, progress: { phase: 'candidate-preparation' } },
    { id: 42, progress: { phase: 'school-combine' } },
    { id: 42, progress: { phase: 'equivalent-graph' } },
    { id: 42, result: { valid: true, total: '768', unchanged: 5 } }
  ]);
  assert.deepEqual(options, { targetStage: 5, convertOwnedInventory: true });
  assert.ok(imports.length > 0 && imports.every(path => path.endsWith('?v=test')));
});
