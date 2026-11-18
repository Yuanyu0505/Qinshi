'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tables=require('../data/other-reference-tables-a.js').tables;
const {filterRows}=require('../js/other-reference-ui.js');

test('spirit names are confirmed while quality metadata remains filterable',()=>{
  const table=tables.find(t=>t.id==='spirits-elements');
  assert.equal(table.verification,'visually-transcribed');
  assert.equal(table.rows.length,15);
  assert.deepEqual(filterRows(table,'紫煞蟠龙','紫'),[['金','紫','紫煞蟠龙','攻','全体攻 / 全体追伤 / 全体护盾']]);
  assert.deepEqual(filterRows(table,'紫煞蟠龙','蓝'),[]);
});

test('single orange spirit totals follow each stated per-level attribute times three',()=>{
  const table=tables.find(t=>t.id==='spirits-fates');
  assert.deepEqual(table.columns,['序号','命格','每一级属性','单橙色器灵总属性','剑位弟子','盾位弟子']);
  assert.deepEqual(table.rows.map(row=>[row[1],row[3]]),[
    ['暗渡陈仓','1.5%闪避'],['胜负未分','1.5%招架'],['妙手回春','3%治疗效果'],
    ['项王举鼎','1.5%暴击'],['楚河汉界','1.5%抗暴击'],['醉斩白蛇','3%暴击伤害'],
    ['毁天灭地','1.5%技能穿透'],['不渝之志','1.5%技伤减免'],['偷天换日','3%PVP伤害'],
    ['割据秦宫','3%PVP免伤'],['神行百步','6PVP速度']
  ]);
  assert.ok(table.rows.every(row=>row.length===table.columns.length));
});

test('spirit combinations retain the five element columns without an unnamed value column',()=>{
  const table=tables.find(t=>t.id==='spirits-combinations');
  assert.deepEqual(table.columns,['金','木','水','火','土']);
  assert.equal(table.rows.length,11);
  assert.ok(table.rows.every(row=>row.length===5));
  for(let i=0;i<5;i++)assert.equal(table.rows.filter(row=>row[i]!=='—').length,7);
  assert.deepEqual(filterRows(table,'毁天灭地',''),[['毁天灭地','—','—','毁天灭地','—']]);
});
