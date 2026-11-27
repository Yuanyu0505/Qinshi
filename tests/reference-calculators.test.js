const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = fs.existsSync(require('node:path').join(__dirname, '../js/reference-calculators.js')) ? require('../js/reference-calculators.js') : {};

test('account range excludes destination cost and accounts for partial current experience', () => {
  assert.equal(typeof C.accountCost, 'function');
  const levels=[{level:1,experience:30,perStamina:5},{level:2,experience:50,perStamina:5}];
  assert.deepEqual(C.accountCost(levels,1,3,5), {experience:75,stamina:15,chickens:1,chickensByLevel:2,steps:2});
  assert.deepEqual(C.accountCost(levels,2,2,0), {experience:0,stamina:0,chickens:0,chickensByLevel:0,steps:0});
  assert.throws(()=>C.accountCost(levels,1,101,0),RangeError);
  assert.throws(()=>C.accountCost(levels,1,2,31),RangeError);
  assert.throws(()=>C.accountCost(levels,1,3,''),RangeError);
});
test('awakening merges repeated materials, respects selected element, and exposes unknown data', () => {
  assert.equal(typeof C.awakeningCost,'function');
  const rows=[{element:'金',from:'0星',to:'1星',materials:[{name:'尘',count:2},{name:'尘',count:3}]},{element:'金',from:'1星',to:'1星1段',materials:[{name:'丹',count:4}],issues:[{source:'B9',text:'bad'}]},{element:'木',from:'0星',to:'1星',materials:[{name:'木尘',count:20}]}];
  assert.deepEqual(C.awakeningCost(rows,'金','0星','1星'),{materials:[{name:'尘',count:5}],steps:1,issues:[]});
  assert.equal(C.awakeningCost(rows,'金','0星','1星1段').issues.length,1);
  assert.throws(()=>C.awakeningCost(rows,'金','1星','0星'),RangeError);
});

test('account stamina and chicken totals round up after summing the requested interval', () => {
 const levels=[{level:1,experience:101,perStamina:5},{level:2,experience:101,perStamina:5}];
 const before=JSON.stringify(levels);
 const one=C.accountCost(levels,1,2,0);
 assert.equal(one.stamina,21);
 assert.equal(one.chickens,2);
 const range=C.accountCost(levels,1,3,0);
 assert.equal(range.stamina,41);
 assert.equal(range.chickens,3);
 const partial=C.accountCost(levels,1,2,100);
 assert.equal(partial.stamina,1);
 assert.equal(partial.chickens,1);
 assert.equal(JSON.stringify(levels),before);
});
test('fish selection deduplicates ids, separates max stats, and never awards shields per fish', () => {
  assert.equal(typeof C.fishTotal,'function');
  const fish=[{id:'a',name:'A',base:{攻:86},max:{攻:173}},{id:'b',name:'B',base:{血:346},max:{血:692}}];
  assert.deepEqual(C.fishTotal(fish,['a','a','b'],'max'),{stats:{攻:173,血:692},selectedCount:2,missing:[]});
  assert.deepEqual(C.fishTotal(fish,[],'base'),{stats:{},selectedCount:0,missing:[]});
  assert.throws(()=>C.fishTotal(fish,['unknown'],'base'),RangeError);
});
test('sage uses only the highest eligible milestone and floors only final tokens', () => {
  assert.equal(typeof C.sageEstimate,'function');
  const input={stamina:150,activity:50,weeklySpend:30000,weeklyRecharge:648,master:false};
  const r=C.sageEstimate(input);
  assert.deepEqual(r.parts,{stamina:2430,activity:2700,weeklySpend:16000,weeklyRecharge:16000,recharge:2592});
  assert.equal(r.experience,39722); assert.equal(r.rawTokens,397.22); assert.equal(r.tokens,397);
  assert.equal(C.sageEstimate({...input,master:true}).tokens,1191);
  assert.equal(C.sageEstimate({...input,stamina:99}).parts.stamina,810);
  assert.equal(C.sageEstimate({...input,stamina:100}).parts.stamina,1620);
  assert.equal(C.sageEstimate({...input,stamina:149}).parts.stamina,1620);
  for(const bad of [NaN,Infinity,-1,'',null])assert.throws(()=>C.sageEstimate({...input,activity:bad}),RangeError);
  assert.deepEqual(input,{stamina:150,activity:50,weeklySpend:30000,weeklyRecharge:648,master:false});
});

test('sage exchange uses cumulative spending in unlocked layers, never later purchases',()=>{
 const rows=[[0,'甲',2,10,20,40,200],[60,'乙',3,10,20,60,200],[180,'丙',1,5,10,10,50],[300,'丁',1,10,1,1,10]];
 const input={0:6,1:11,2:1};
 const invalid=C.sageExchange(rows,input);
 assert.equal(invalid.valid,false);
 assert.deepEqual(invalid.blocked.map(x=>[x.layer,x.shortage]),[[2,10]]);
 assert.equal(invalid.total,175);
 const valid=C.sageExchange(rows,{0:6,1:18,2:1});
 assert.equal(valid.valid,true);assert.equal(valid.total,245);
 assert.deepEqual(valid.items.map(x=>[x.times,x.quantity,x.cost]),[[6,12,60],[18,54,180],[1,1,5]]);
 assert.deepEqual(input,{0:6,1:11,2:1});
 assert.equal(C.sageExchange(rows,{0:18,2:1}).valid,true);
 assert.deepEqual(C.sageExchange(rows,{1:18,2:1}).blocked.map(x=>[x.layer,x.shortage]),[[1,60]]);
 for(const count of [-1,1.5,21,NaN])assert.throws(()=>C.sageExchange(rows,{0:count}),RangeError);
 assert.throws(()=>C.sageExchange(rows,{99:1}),RangeError);
});

test('sage reverse plan honors priority, discrete daily counts, master rounding and recharge credit',()=>{
 const small=C.sagePlan(1,false);
 assert.equal(small.requiredExperience,100);
 assert.equal(small.experience,120);
 assert.equal(small.parts.activity,0);
 assert.equal(small.tasks[0].schedule.reduce((n,x)=>n+x.times,0),2);
 const next=C.sagePlan(25,false);
 assert.equal(next.parts.stamina,2430);assert.equal(next.parts.activity,70);
 assert.equal(next.parts.weeklySpend,0);
 const master=C.sagePlan(1,true);
 assert.equal(master.requiredExperience,34);assert.equal(master.experience,60);assert.equal(master.tokens,1);
 const recharge=C.sagePlan(374,false);
 assert.equal(recharge.parts.stamina,2430);assert.equal(recharge.parts.activity,2700);
 assert.equal(recharge.parts.weeklySpend,16000);
 assert.equal(recharge.parts.weeklyRecharge,16000);
 assert.equal(recharge.parts.recharge,2592);assert.equal(recharge.extraRecharge,0);
 const extra=C.sagePlan(400,false);
 assert.equal(extra.extraRecharge,278);assert.equal(extra.experience,40000);assert.equal(extra.tokens,400);
 assert.deepEqual(C.sagePlan(0,false).tasks,[]);
 const mixed=C.sagePlan(262,false),weekly=mixed.tasks.find(x=>x.key==='weeklyRecharge');
 assert.deepEqual(weekly.schedule.map(x=>[x.threshold,x.times]),[[30,1],[648,1]]);
 assert.equal(mixed.parts.weeklyRecharge,4500);assert.equal(mixed.parts.recharge,678);
 assert.equal(mixed.experience,26308);
 for(const tokens of [-1,0.5,NaN,Infinity])assert.throws(()=>C.sagePlan(tokens,false),RangeError);
});

test('generated references preserve additions, city branches, and incomplete source values', () => {
  const d=require('../data/reference-expansion.js');
  assert.equal(d.sections.length,7);
  assert.equal(d.firstReleases.length,66);
  assert.equal(d.firstReleases.find(x=>x.name==='雷豹英布').date,'2026-11-12');
  assert.equal(d.firstReleases.find(x=>x.name==='千泷高月').date,'2026-10-01');
  assert.equal(d.firstReleases.find(x=>x.name==='隐虎季布').date,'2026-08-20');
  assert.equal(d.costumes.find(x=>x.name==='神将威龙且').costume,'九霄御天');
  assert.equal(d.costumes.find(x=>x.name==='神千泷高月').costume,'瑞麟踏焰');
  assert.equal(d.costumes.filter(x=>x.name==='神将威龙且').length,1);
  assert.equal(d.fish.length,90);
  assert.deepEqual(d.fish[0].base,{攻:86,防:86});
  assert.deepEqual(d.fish[0].max,{攻:173,防:173});
  assert.equal(C.fishTotal(d.fish,['fish-3'],'max').stats.护盾,undefined);
  assert.equal(d.accountLevels.length,100);
  assert.equal(d.accountLevels[99].experience,null);
  assert.equal(d.awakening.length,195);
  assert.equal(d.awakening.find(x=>x.source==='弟子升金!A9:E9').materials.find(x=>x.name==='艮山之尘').count,10);
  const partial=C.awakeningCost(d.awakening,'火','0星','1星');
  assert.deepEqual(partial.issues,[]);
  assert.equal(partial.materials.find(x=>x.name==='震雷之尘').count,2);
  const wood=C.awakeningCost(d.awakening,'木','2星2段','3星');
  assert.equal(wood.materials.find(x=>x.name==='乾天之尘').count,10);
  assert.equal(wood.materials.some(x=>x.name==='乾天之'),false);
  assert.equal(d.jinchan.length,90);
  assert.deepEqual([...new Set(d.jinchan.map(x=>x.place))],['矿坑','森林','栈道','城邦']);
  assert.equal(d.jinchan.find(x=>x.id==='jinchan-122').reward,'失败');
  assert.equal(d.jinchan.find(x=>x.id==='jinchan-122').contribution,'—');
  assert.equal(d.jinchan.find(x=>x.id==='jinchan-121').contribution,'贡献+200');
});

test('source-backed fish max aggregation reproduces every quality total without shield multiplication', () => {
  const d=require('../data/reference-expansion.js');
  const expected=[['普通（绿）','绿'],['稀有（蓝）','蓝'],['史诗（紫）','紫'],['传说（橙）','橙'],['神话（红）','红']];
  for(const [quality,totalQuality] of expected){
    const result=C.fishTotal(d.fish,d.fish.filter(x=>x.quality===quality).map(x=>x.id),'max');
    const source=d.fishTotals.find(x=>x.quality===totalQuality).stats;
    assert.deepEqual(result.missing,[]);
    for(const [key,value] of Object.entries(source))if(key!=='护盾')assert.equal(result.stats[key]||0,value,quality+': '+key);
    assert.equal(result.stats.护盾,undefined);
  }
});

test('account boundaries reject unknown data instead of supplying a zero cost', () => {
  assert.throws(()=>C.accountCost([{level:1,experience:null,perStamina:5}],1,2,0),RangeError);
  assert.throws(()=>C.accountCost([{level:1,experience:30,perStamina:null}],1,2,0),RangeError);
  assert.throws(()=>C.accountCost([],0,1,0),RangeError);
  assert.throws(()=>C.accountCost([],3,2,0),RangeError);
  assert.throws(()=>C.accountCost([],100,100,1),RangeError);
});

test('missing fish maximum remains observable while selection inputs stay unchanged', () => {
  const fish=[{id:'a',name:'A',base:{攻:86},max:{攻:null}}],ids=['a','a'];
  assert.deepEqual(C.fishTotal(fish,ids,'max'),{stats:{},selectedCount:1,missing:[{id:'a',name:'A',attribute:'攻'}]});
  assert.deepEqual(ids,['a','a']);assert.equal(fish[0].max.攻,null);
  assert.throws(()=>C.fishTotal(fish,ids,'invented'),RangeError);
});

test('awakening source summary disagreement is preserved separately from computed step totals', () => {
  const d=require('../data/reference-expansion.js');
  assert.ok(Array.isArray(d.sourceDiscrepancies));
  const gold=d.sourceDiscrepancies.find(x=>x.element==='金'&&x.name==='坤地之尘');
  assert.equal(gold.sourceCount,174);assert.equal(gold.stepCount,189);
  assert.equal(C.awakeningCost(d.awakening,'金','0星','9星').materials.find(x=>x.name==='坤地之尘').count,189);
  const totals=d.tables.find(x=>x.id==='awakening-source-totals');
  assert.equal(totals.title,'0至9星合计');
  assert.equal(totals.note,undefined);
  for(const element of ['金','木','水','火','土']){
    const calculated=C.awakeningCost(d.awakening,element,'0星','9星');
    assert.deepEqual(calculated.issues,[]);
    assert.deepEqual(totals.rows.filter(row=>row[0]===element),calculated.materials.map(m=>[element,m.name,m.count]));
  }
});
