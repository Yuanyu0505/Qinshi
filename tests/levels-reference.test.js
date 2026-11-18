'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const baseline=require('./fixtures/levels-reference-1.1.30.json');
const tables=require('../data/other-reference-tables-a.js').tables;
const ui=require('../js/other-reference-ui.js');
const table=id=>tables.find(t=>t.id===id);

test('feature search removes only the five authorized old entries or annotations',()=>{
  const old=baseline.find(t=>t.id==='levels-features');
  const expected=old.rows.filter(r=>!['关卡/奇遇','青铜联赛终点','白银联赛终点'].includes(r[1])).map(r=>['星宿','兵法'].includes(r[1])?[r[0],r[1],'—']:r);
  assert.deepEqual(table('levels-features').rows,expected);
  assert.equal(expected.length,37);
  assert.equal(ui.filterRows(table('levels-features'),'星宿','')[0][0],'40级');
  assert.equal(ui.filterRows(table('levels-features'),'兵法','')[0][0],'49级');
  for(const q of ['外圈','内圈','其徐如林','不动如山','其疾如风','侵掠如火','青铜联赛终点','白银联赛终点','关卡/奇遇'])assert.equal(ui.filterRows(table('levels-features'),q,'').length,0,q);
});

test('position unlocks including both initial slots retain every original field',()=>{
  assert.deepEqual(table('levels-positions'),baseline.find(t=>t.id==='levels-positions'));
  assert.deepEqual(table('levels-positions').rows[0],['1级','1号/2号位']);
});

test('league data exposes exactly the fourteen user-confirmed literal bands',()=>{
  const leagues=table('levels-leagues');
  assert.deepEqual(leagues.columns,['等级区间','联赛','服务器类别']);
  assert.deepEqual(leagues.rows,[
    ['50–53级','青铜联赛',''],['54–56级','青铜联赛',''],['57–59级','青铜联赛',''],
    ['60–63级','白银联赛',''],['64–66级','白银联赛',''],['67–69级','白银联赛',''],
    ['70–73级','黄金联赛',''],['74–76级','黄金联赛',''],['77–79级','黄金联赛',''],
    ['80–83级','钻石联赛','混服'],['83–87级','钻石联赛','混服'],['87–100级','钻石联赛','混服'],
    ['80–83级','钻石联赛','折扣专服'],['83–100级','钻石联赛','折扣专服']
  ]);
  assert.equal(leagues.verification,'user-confirmed');
  assert.deepEqual(leagues.sourcePaths,['01_原始资料_17张/14.png']);
  assert.deepEqual(leagues.leagueNotes,[
    ['青铜联赛','初级青龙/白虎护符'],['白银联赛','中级青龙/白虎护符'],['黄金联赛','高级青龙/白虎护符']
  ]);
  assert.equal(ui.filterRows(leagues,'混服','').length,3);
  assert.equal(ui.filterRows(leagues,'折扣专服','').length,2);
  assert.equal(ui.filterRows(leagues,'83','').length,4);
  assert.equal(ui.filterRows(leagues,'87','').length,2);
});

test('league level-band filtering retains overlap and the former endpoint levels',()=>{
  const leagues=table('levels-leagues');
  for(const [band,count] of [['50',3],['60',3],['70',3],['80',5],['90',2],['100',2]])assert.equal(leagues.rows.filter(r=>ui.matchesLevelBand(r[0],band)).length,count,band);
  assert.ok(leagues.rows.some(r=>ui.matchesLevelBand(r[0],'50')&&r[0].includes('59')));
  assert.ok(leagues.rows.some(r=>ui.matchesLevelBand(r[0],'60')&&r[0].includes('69')));
  for(const level of [83,87])assert.ok(leagues.rows.filter(r=>{const n=r[0].match(/\d+/g).map(Number);return n[0]<=level&&n[1]>=level;}).length>1);
});
