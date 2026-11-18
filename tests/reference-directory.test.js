'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/other-reference-data.js');
const ui=require('../js/other-reference-ui.js');
test('directory order is a complete unique catalog, including migrated modules',()=>{
  const ids=data.sections.map(s=>s.id);
  assert.equal(ids.length,17);
  assert.deepEqual(data.sections.filter(s=>s.partition).map(s=>s.partition),['pilots','battle-box-pill-pouch','quiz','zhulu','loulan','formations','settings']);
  assert.deepEqual(ui.normalizeSectionOrder(data.sections,['settings','settings','unknown','cards']),['settings','cards'].concat(ids.filter(id=>!['settings','cards'].includes(id))));
  assert.deepEqual(ui.normalizeSectionOrder(data.sections,{}),ids);
});
test('directory search matches only names, trims spaces and preserves catalog',()=>{
  const before=JSON.stringify(data.sections);
  assert.deepEqual(ui.filterSections(data.sections,'  战匣 ').map(s=>s.id),['battle-box-pill-pouch']);
  assert.equal(ui.filterSections(data.sections,'副属性档位').length,0);
  assert.equal(ui.filterSections(data.sections,'不存在的分区').length,0);
  assert.equal(ui.filterSections(data.sections,'').length,17);
  assert.equal(JSON.stringify(data.sections),before);
});
