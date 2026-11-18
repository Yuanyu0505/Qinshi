'use strict';
// Prepared for manual execution; not executed as part of the local UI change.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const reference = require('../data/six-halls-reference.js');
const upgrade = require('../data/six-halls.js');
const library = require('../data/other-reference-data.js');

test('all six halls retain five effects and reachable reference images', () => {
  assert.deepEqual(reference.halls.map(h => h.id), upgrade.halls.map(h => h.id));
  assert.equal(reference.halls.reduce((n,h) => n+h.disciples.length,0),99);
  for (const hall of reference.halls) {
    assert.deepEqual(hall.bonuses.map(b => b.level),[10,20,30,40,50]);
    assert.ok(hall.bonuses.every(b => b.text.length > 0));
    assert.ok(library.images.some(image => image.path === hall.sourcePath));
    assert.equal(new Set(hall.disciples).size,hall.disciples.length);
  }
  assert.deepEqual(upgrade.fullCost,{ herbs:904,tokens:435 });
  assert.match(reference.halls.find(h=>h.id==='lieshan').bonuses[3].text,/1%单级闪避/);
});
