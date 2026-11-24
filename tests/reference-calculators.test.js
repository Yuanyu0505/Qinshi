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
test('fish selection deduplicates ids, separates max stats, and never awards shields per fish', () => {
  assert.equal(typeof C.fishTotal,'function');
  const fish=[{id:'a',name:'A',base:{攻:86},max:{攻:173}},{id:'b',name:'B',base:{血:346},max:{血:692}}];
  assert.deepEqual(C.fishTotal(fish,['a','a','b'],'max'),{stats:{攻:173,血:692},selectedCount:2,missing:[]});
  assert.deepEqual(C.fishTotal(fish,[],'base'),{stats:{},selectedCount:0,missing:[]});
  assert.throws(()=>C.fishTotal(fish,['unknown'],'base'),RangeError);
});
test('sage cumulative milestones use fixed 27 days and 4 weeks and floor only final tokens', () => {
  assert.equal(typeof C.sageEstimate,'function');
  const input={stamina:150,activity:50,weeklySpend:30000,weeklyRecharge:648,master:false};
  const r=C.sageEstimate(input);
  assert.deepEqual(r.parts,{stamina:4860,activity:7560,weeklySpend:21200,weeklyRecharge:21200,recharge:2592});
  assert.equal(r.experience,57412); assert.equal(r.rawTokens,574.12); assert.equal(r.tokens,574);
  assert.equal(C.sageEstimate({...input,master:true}).tokens,1722);
  assert.equal(C.sageEstimate({...input,stamina:99}).parts.stamina,810);
  assert.equal(C.sageEstimate({...input,stamina:100}).parts.stamina,2430);
  for(const bad of [NaN,Infinity,-1,'',null])assert.throws(()=>C.sageEstimate({...input,activity:bad}),RangeError);
  assert.deepEqual(input,{stamina:150,activity:50,weeklySpend:30000,weeklyRecharge:648,master:false});
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
  assert.equal(partial.issues[0].source,'弟子升金!D152');
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
  assert.match(d.tables.find(x=>x.id==='awakening-source-totals').note,/按逐段材料/);
});
