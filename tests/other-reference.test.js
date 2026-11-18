'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
test('reference library exposes seventeen sections and confirmed values', () => {
  const data = require('../data/other-reference-data.js');
  assert.deepEqual(data.sections.map(s => s.name), ['诸子卡','五行天枢录','橙弟子来源','灵宝','极限速度','守护神','功能开放等级','器灵','弟子相关','六堂','机师','战匣丹囊','答题','逐鹿','楼兰棋阵','合阵','设置']);
  assert.equal(data.elements.length, 28);
  for (const row of data.elements) assert.equal(['金','木','水','火','土'].reduce((n,k)=>n+row[k],0),row['总计']);
  assert.equal(data.elements.filter(r=>r.kind==='气蕴').length,25);
  assert.equal(data.cardAlbum.three_cards_total['防御'],120000);
  assert.equal(data.guides.length,6);
});
test('every supplied image is preserved byte for byte and mapped to a section or explicit archive', () => {
  const data = require('../data/other-reference-data.js');
  assert.equal(data.images.length,37);
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
test('both speed rankings use the user-confirmed disciple names',()=>{
  const tables=require('../data/other-reference-tables-c.js').tables;
  const names={'10102':'神贯侯钟离昧','10066':'神蚩魔卫庄','10096':'神鲨齿卫庄','10085':'神赤霄刘季'};
  for(const id of ['speed-paid-ranking','speed-free-ranking']){
    const table=tables.find(t=>t.id===id);
    assert.equal(table.rows.length,47);
    for(const [number,name] of Object.entries(names))assert.equal(table.rows.find(row=>row[1]===number)[2],name);
  }
});

test('speed tables retain one source image per version and no stale partial status',()=>{
  const tables=require('../data/other-reference-tables-c.js').tables;
  for(const version of ['paid','free']){
    const source='01_原始资料_17张/'+(version==='paid'?'12.png':'13.png');
    for(const kind of ['ranking','components']){
      const table=tables.find(t=>t.id==='speed-'+version+'-'+kind);
      assert.deepEqual(table.sourcePaths,[source]);
      assert.equal(table.verification,'visually-transcribed');
      assert.ok(table.rows.every(row=>row.every(value=>!String(value).includes('待核对'))));
    }
  }
});

test('guardian materials distinguish activation, label stages and omit redundant subtotals',()=>{
  const tables=require('../data/other-reference-tables-c.js').tables;
  for(const [color,activation,maxStage,total] of [['orange','25',10,['295','2200','1650']],['red','35',15,['705','7850','7850']]]){
    const table=tables.find(t=>t.id==='guardians-'+color+'-materials');
    assert.deepEqual(table.columns,['当前阶数','碎片','锦书残卷','淬火印记']);
    assert.deepEqual(table.rows[0],['0阶激活',activation,'—','—']);
    assert.equal(table.rows.length,maxStage+2);
    for(let stage=1;stage<=maxStage;stage++)assert.equal(table.rows[stage][0],stage+'阶');
    assert.deepEqual(table.rows.at(-1),['合计',...total]);
    assert.ok(!table.rows.some(row=>/原图|小表/.test(row[0])));
  }
});

test('guardian names and both formerly uncertain effects use user-confirmed text',()=>{
  const tables=require('../data/other-reference-tables-c.js').tables.filter(t=>t.section==='guardians');
  const skills=tables.find(t=>t.id==='guardians-aid-skills');
  const special=tables.find(t=>t.id==='guardians-aid-special');
  assert.equal(skills.rows.find(row=>row[0]==='10028')[2],'噤若寒蝉');
  for(const table of [skills,special])assert.equal(table.rows.find(row=>row[0]==='10045')[1],'神诺敏');
  assert.equal(skills.verification,'visually-transcribed');
  assert.equal(special.verification,'visually-transcribed');
  assert.ok(special.rows.find(row=>row[0]==='10037')[2].includes('残废1回合'));
  assert.ok(special.rows.find(row=>row[0]==='10050')[2].includes('侠义誓约：永久提升5%攻和防'));
  const pending=tables.flatMap(table=>table.rows.filter(row=>row.some(value=>String(value).includes('待核对'))).map(row=>row[0]));
  assert.deepEqual(pending,[]);
  for(const table of tables){
    assert.equal(table.sourcePaths.length,1);
    assert.ok(table.columns.every(column=>!column.includes('原图')));
  }
});

test('level bands include overlapping league ranges and spirit names use confirmed text',()=>{
  const ui=require('../js/other-reference-ui.js');
  assert.equal(ui.matchesLevelBand('70–100级','80'),true);
  assert.equal(ui.matchesLevelBand('70–100级','100'),true);
  assert.equal(ui.matchesLevelBand('60–69级','80'),false);
  assert.equal(ui.matchesLevelBand('38级','30'),true);
  assert.equal(ui.matchesLevelBand('合计','30'),false);
  const spirits=require('../data/other-reference-tables-a.js').tables.find(t=>t.id==='spirits-elements');
  assert.equal(spirits.rows.find(r=>r[0]==='金'&&r[1]==='紫')[2],'紫煞蟠龙');
});
