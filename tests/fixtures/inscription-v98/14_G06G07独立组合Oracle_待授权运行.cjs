/*
  Independent SMALL-DOMAIN oracle for G06 and G07. Deliberately does not
  require/import the application Rules, data module, or preview function.
  Source pools and recipe were manually transcribed from the 1.1.58 agreed rules.
  It checks the fixture itself, NOT the application. Run only when authorized.
*/
'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const fixture=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]||path.join(__dirname,'02_计算黄金用例_固定输入与预期.json')),'utf8'));
const byId=Object.fromEntries(fixture.cases.map(c=>[c.id,c]));
const key=terms=>terms.slice().sort().join('|');
// 地遁/紫一/crafted: 1 high per allowed high attr, 5 M attrs, 3 common U.
const earth=['PVP速:M','暴击:M','PVP免伤:M','技能穿透:H','技能穿透:M','防:H','防:M','闪避:U','招架:U','治疗效果:U'];
// 鬼遁/紫一/crafted: 2 H, 5 M, 3 common U.
const ghost=['速:H','速:M','血:M','护盾:M','暴击伤害:M','防:H','防:M','闪避:U','招架:U','治疗效果:U'];
function fill(anchor,pool){return pool.filter(x=>x!==anchor).map(x=>key([anchor,x]));}
function same(id,arr){const expected=byId[id].expected.outcomes.map(o=>key(o.terms)).sort();const actual=[...new Set(arr)].sort();assert.deepEqual(expected,actual,`${id}: fixture does not match independently enumerated pool`);assert.equal(expected.length,byId[id].expected.outcomeCount,`${id}: count`);}
// G05: four distinct inherited terms, choose exactly three; 4 choose 3 = 4.
const fours=['技能穿透:L','治疗效果:U','技能穿透:M','技能穿透:H'];
const g05=[];for(let dropped=0;dropped<fours.length;dropped++)g05.push(key(fours.filter((_,i)=>i!==dropped)));
same('G05',g05);
same('G06',fill('防:H',earth));
same('G07',[...fill('速:H',ghost),...fill('速:M',ghost)]);
process.stdout.write('Independent fixture enumeration G05/G06/G07 agrees (no application code imported).\n');
