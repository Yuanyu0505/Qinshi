'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
test('reference library exposes exactly nine ordered sections and confirmed values', () => {
  const data = require('../data/other-reference-data.js');
  assert.deepEqual(data.sections.map(s => s.name), ['诸子卡','五行天枢录','橙弟子来源','灵宝','极限速度','守护神','功能开放等级','器灵','弟子相关']);
  assert.equal(data.elements.length, 28);
  for (const row of data.elements) assert.equal(['金','木','水','火','土'].reduce((n,k)=>n+row[k],0),row['总计']);
  assert.equal(data.elements.filter(r=>r.kind==='气蕴').length,25);
  assert.equal(data.cardAlbum.three_cards_total['防御'],120000);
  assert.equal(data.guides.length,6);
});
test('every supplied image is preserved byte for byte and mapped to a section or explicit archive', () => {
  const data = require('../data/other-reference-data.js');
  assert.equal(data.images.length,31);
  for (const item of data.images) {
    const file=path.join(__dirname,'../assets/other-reference/sources',item.path);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),item.sha256,item.path);
    assert.ok(data.sections.some(s=>s.sourcePaths.includes(item.path))||item.path.includes('误传原图留档'),item.path);
  }
  assert.ok(data.sections.find(s=>s.id==='levels').sourcePaths.every(p=>!p.includes('误传')));
});
test('every transcribed row retains columns and reachable sources; filtering never mutates data', () => {
  const root={OTHER_REFERENCE_DATA:require('../data/other-reference-data.js'),OTHER_REFERENCE_TABLES_A:require('../data/other-reference-tables-a.js'),OTHER_REFERENCE_TABLES_B:require('../data/other-reference-tables-b.js'),OTHER_REFERENCE_TABLES_C:require('../data/other-reference-tables-c.js')};
  const ui=require('../js/other-reference-ui.js'),tables=ui.tablesFor(root),ids=new Set();
  for(const table of tables){
    assert.ok(!ids.has(table.id),table.id);ids.add(table.id);
    assert.ok(root.OTHER_REFERENCE_DATA.sections.some(s=>s.id===table.section));
    assert.ok(table.sourcePaths.length);
    for(const source of table.sourcePaths)assert.ok(root.OTHER_REFERENCE_DATA.images.some(i=>i.path===source),source);
    for(const row of table.rows)assert.equal(row.length,table.columns.length,table.id+': '+row[0]);
  }
  const table=tables.find(t=>t.id==='elements-cost'),before=JSON.stringify(table);
  assert.deepEqual(ui.filterRows(table,'无双鬼','蓝').map(r=>r[0]),['无双鬼气蕴']);
  assert.equal(ui.filterRows(table,'无双鬼','紫').length,0);
  assert.equal(ui.filterRows(table,'<script>','').length,0);
  assert.equal(JSON.stringify(table),before);
});
test('level bands include overlapping league ranges and distinguish unreadable names from absent source values',()=>{
  const ui=require('../js/other-reference-ui.js');
  assert.equal(ui.matchesLevelBand('70–100级','80'),true);
  assert.equal(ui.matchesLevelBand('70–100级','100'),true);
  assert.equal(ui.matchesLevelBand('60–69级','80'),false);
  assert.equal(ui.matchesLevelBand('38级','30'),true);
  assert.equal(ui.matchesLevelBand('合计','30'),false);
  const spirits=require('../data/other-reference-tables-a.js').tables.find(t=>t.id==='spirits-elements');
  assert.equal(spirits.rows.find(r=>r[0]==='金'&&r[1]==='紫')[2],'名称待核对');
});
