'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const ui=require('../js/other-reference-ui.js'),data=require('../data/other-reference-data.js');
test('cards query ignores annotations but still matches attribute names and values',()=>{
 const table=require('../data/other-reference-tables-a.js').tables.find(t=>t.id==='cards-substats-7-9');
 assert.equal(ui.filterRows(table,'原图标注','').length,0);
 assert.equal(ui.filterRows(table,'橙','').length,0);
 assert.equal(ui.filterRows(table,'无视防御','').length,1);
 assert.ok(ui.filterRows(table,'4.2%','').length>0);
});
test('guide presentation removes requested editorial text without mutating archived guides',()=>{
 const before=JSON.stringify(data.guides);
 const probability=ui.guideText(data.guides[3],data.cardAlbum);
 assert.match(probability,/1\/15 × 1\/16 = 1\/240/);
 assert.doesNotMatch(probability,/[`“”]|不得擅自|攻略示例/);
 const album=ui.guideText(data.guides[4],data.cardAlbum);
 assert.match(album,/96w血 12w攻 12w防 6w内力 54w护盾/);
 assert.doesNotMatch(album,/原图|用户已确认|[「」“”`（）()]/);
 const refund=ui.guideText(data.guides[5],data.cardAlbum);
 assert.match(refund,/120个三级迷珏/);assert.match(refund,/258个三级迷珏/);
 assert.doesNotMatch(refund,/原图写|补图06|对照入口/);
 assert.equal(JSON.stringify(data.guides),before);
});
test('recommendation is offered only when its actual container layout differs from the table',()=>{
 assert.equal(ui.hasRecommendedView({id:'elements-cost',section:'elements'},390),false);
 assert.equal(ui.hasRecommendedView({id:'cards-substats-10',section:'cards'},1440),false);
 assert.equal(ui.hasRecommendedView({id:'origins-all',section:'origins'},1440),true);
 assert.equal(ui.hasRecommendedView({id:'speed-paid-ranking',section:'speed'},760),false);
 assert.equal(ui.hasRecommendedView({id:'speed-paid-ranking',section:'speed'},759),true);
 assert.equal(ui.hasRecommendedView({id:'guardians-aid-skills',section:'guardians'},390),true);
});
