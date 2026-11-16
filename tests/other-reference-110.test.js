'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ui=require('../js/other-reference-ui.js');
const root={OTHER_REFERENCE_DATA:require('../data/other-reference-data.js')};
for(const k of ['A','B','C'])root['OTHER_REFERENCE_TABLES_'+k]=require('../data/other-reference-tables-'+k.toLowerCase()+'.js');
test('presentation retains source rows and merges matching disciple origins without duplicate records',()=>{
 const tables=ui.tablesFor(root),displayed=tables.flatMap(t=>t.parts||[t]);
 assert.equal(new Set(tables.map(t=>t.id)).size,tables.length);
 for(const key of ['A','B','C'])for(const expected of root['OTHER_REFERENCE_TABLES_'+key].tables){const actual=displayed.find(t=>t.id===expected.id);assert.ok(actual,expected.id);for(const field of ['columns','rows','sourcePaths','verification'])assert.deepEqual(actual[field],expected[field],expected.id+' '+field);}
 const origins=tables.filter(t=>t.section==='origins'&&t.id!=='origins-all'),all=tables.find(t=>t.id==='origins-all');
 assert.equal(origins.length,5);assert.equal(all.rows.length,83);assert.equal(new Set(all.rows.map(r=>JSON.stringify(r))).size,83);
 assert.deepEqual(all.columns,['弟子','可获得来源']);assert.equal(tables.some(t=>t.id.startsWith('origins-supplement-')),false);
 for(const name of ['星魂','王离','诺敏'])assert.ok(all.rows.some(r=>r[0]===name&&r[1].includes('累计充值100元')));
 const given=require('./fixtures/other-reference-elements-110.json');
 for(const expected of given.tables){const actual=tables.find(t=>t.id===expected.id);assert.deepEqual(actual.columns,expected.columns);assert.deepEqual(actual.rows,expected.rows);}
 const csv=fs.readFileSync(path.join(__dirname,'fixtures/other-reference-elements-110.csv'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
 assert.equal(csv.length,28);assert.deepEqual(tables.find(t=>t.id==='elements-cost').rows,csv.filter(r=>r[0]==='气蕴').map(r=>r.slice(1)));assert.deepEqual(tables.find(t=>t.id==='elements-stones').rows,csv.filter(r=>r[0]==='五极石').map(r=>r.slice(1)));
 assert.equal(tables.find(t=>t.id==='elements-cost').rows.length,25);assert.equal(tables.find(t=>t.id==='elements-stones').rows.length,3);
 assert.equal(new Set(tables.find(t=>t.id==='origins-all').rows.map(r=>r[0])).size,43);
 assert.equal(root.OTHER_REFERENCE_DATA.cardAlbum.three_cards_total['防御'],120000);
});
