'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ui=require('../js/other-reference-ui.js');
test('new directory entries append once without changing old data or saved ordering',()=>{
  const original={sections:[{id:'cards',name:'诸子卡'},{id:'settings',name:'设置'}]};
  const root={OTHER_REFERENCE_DATA:original,REFERENCE_EXPANSION_DATA:{sections:[{id:'first-releases',name:'弟子首发'},{id:'fishing',name:'钓鱼'}]}};
  assert.equal(typeof ui.directorySections,'function');
  assert.deepEqual(ui.directorySections(root).map(s=>s.id),['cards','first-releases','fishing','settings']);
  assert.deepEqual(original.sections.map(s=>s.id),['cards','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(ui.directorySections(root),['settings','cards']),['settings','cards','first-releases','fishing']);
  assert.deepEqual(ui.directorySections({OTHER_REFERENCE_DATA:original}).map(s=>s.id),['cards','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(ui.directorySections(root),null),['cards','first-releases','fishing','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(ui.directorySections(root),['cards','settings']),['cards','first-releases','fishing','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(ui.directorySections(root),['fishing','settings','cards']),['fishing','settings','cards','first-releases']);
});
