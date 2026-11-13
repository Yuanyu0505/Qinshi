'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const ui=require('../js/other-reference-ui.js');
const root={OTHER_REFERENCE_DATA:require('../data/other-reference-data.js')};
for(const k of ['A','B','C'])root['OTHER_REFERENCE_TABLES_'+k]=require('../data/other-reference-tables-'+k.toLowerCase()+'.js');
test('1.1.0 presentation retains every baseline row, column, source, order and review state',()=>{
 const tables=ui.tablesFor(root),frozen=tables.map(({id,section,columns,rows,sourcePaths,verification})=>({id,section,columns,rows,sourcePaths,verification}));
 assert.equal(tables.length,50);assert.equal(tables.reduce((n,t)=>n+t.rows.length,0),970);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(frozen)).digest('hex'),'f08f62f45fa01f13bb8f279ffa0e3e142d3e292b402815906d4c7b5be9a294c5');
 const given=require('./fixtures/other-reference-elements-110.json');
 for(const expected of given.tables){const actual=tables.find(t=>t.id===expected.id);assert.deepEqual(actual.columns,expected.columns);assert.deepEqual(actual.rows,expected.rows);}
 const csv=fs.readFileSync(path.join(__dirname,'fixtures/other-reference-elements-110.csv'),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
 assert.equal(csv.length,28);assert.deepEqual(tables.find(t=>t.id==='elements-cost').rows,csv.filter(r=>r[0]==='气蕴').map(r=>r.slice(1)));assert.deepEqual(tables.find(t=>t.id==='elements-stones').rows,csv.filter(r=>r[0]==='五极石').map(r=>r.slice(1)));
 assert.equal(tables.find(t=>t.id==='elements-cost').rows.length,25);assert.equal(tables.find(t=>t.id==='elements-stones').rows.length,3);
 assert.equal(new Set(tables.find(t=>t.id==='origins-all').rows.map(r=>r[0])).size,43);
 assert.equal(root.OTHER_REFERENCE_DATA.cardAlbum.three_cards_total['防御'],120000);
});
