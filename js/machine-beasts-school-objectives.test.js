const test = require('node:test');
const assert = require('node:assert/strict');
const DATA = require('../data/machine-beasts.js');
const P = require('./machine-beast-school-planner.js');
function input(ids, total) {
  const school = {id:'test',beastIds:ids,stages:[{stage:1,requiredTotalLevel:total}]};
  return {...DATA,schools:[school]};
}
function solve(data, progress={}, options={}) {return P.calculateSchoolPlans(data,'test',progress,{targetStage:1,...options});}
function mode(r, kind) {assert.equal(r.valid,true,JSON.stringify(r));return r.plans.find(p=>p.kind===kind||p.kind==='merged');}
test('large valid blueprint price does not erase body-price differences when stock covers all diagrams',()=>{
  const b={...DATA.beasts.find(b=>b.id==='red-serpent'),id:'tiny',maxLevel:1,maxRank:1,fragmentsPerBody:1,contributionPerFragment:2.7,effects:[]};
  const d={...DATA,beasts:[b],researchThresholds:{0:0,1:4},researchValues:{orange:{0:{none:4},1:{none:6}}},resourceRules:{blueprintDivisor:3,organPieceDivisor:1},schools:[{id:'test',beastIds:['tiny'],stages:[{stage:1,requiredTotalLevel:1}]}]};
  const p=mode(solve(d,{tiny:{inventory:{none:{1:1}}}},{newRankMode:'zero',referenceCostSettings:{awakeningBlueprintStock:2,awakeningBlueprintPrice:8e15}}),'cost');
  assert.equal(p.totals.pricedYuan,0);assert.equal(p.totals.newInvestedCount,0);
});
test('money objective uses two owned zero-rank snakes rather than one new seventh-rank body',()=>{
  const r=solve(input(['red-serpent'],3),{'red-serpent':{inventory:{none:{0:2}}}});
  const p=mode(r,'cost');assert.equal(p.totals.pricedYuan,13440);
  assert.equal(p.beasts[0].newInvestedCount,0);assert.equal(p.beasts[0].ownedInvestedCount,2);
});
test('blue purple inventory restriction cannot be bypassed by fragments or global inventory switch',()=>{
  const d=input(['eight-claw-centipede'],1);
  assert.equal(solve(d,{'eight-claw-centipede':{fragments:1000}}).valid,false);
  assert.equal(solve(d,{'eight-claw-centipede':{inventory:{none:{0:1}}}}).valid,false);
  const progress={'eight-claw-centipede':{inventory:{none:{0:2}}}};
  assert.equal(mode(solve(d,progress),'cost').totals.pricedYuan,3360);
  assert.equal(solve(d,progress,{useOwnedInventory:false}).valid,false);
  const allowed=mode(solve(d,{}, {bluePurpleInventoryOnly:false}),'cost');
  assert.ok(allowed.totals.newInvestedCount>0);assert.ok(allowed.cost.unpricedResources.length>0);
});
test('effects objective continues to legal beast caps and counts actual crossed effect nodes',()=>{
  const r=solve(input(['war-demon'],10),{'war-demon':{research:277000}},{newRankMode:'zero'});
  const cheap=mode(r,'cost'),effects=mode(r,'effects');
  assert.equal(cheap.totals.unlockedEffects,1);
  assert.equal(effects.totals.unlockedEffects,3);assert.equal(effects.beasts[0].endLevel,20);
  assert.ok(effects.totals.pricedYuan>cheap.totals.pricedYuan);
});
test('modified bodies never displace feasible zero-modification plans because their count is first',()=>{
  const r=solve(input(['red-serpent'],9),{}, {allowNewModifications:true,newRankMode:'zeroToSeven'});
  const p=mode(r,'cost');assert.equal(p.totals.modifiedInvestedCount,0);
  assert.ok(p.beasts.every(b=>b.items.every(i=>i.modificationId==='none')));
});
test('intermediate ranks survive when stocked blueprints make exact overflow the tiebreak',()=>{
  const r=solve(input(['red-serpent'],10),{'red-serpent':{research:269544}}, {referenceCostSettings:{awakeningBlueprintStock:10000}});
  const p=mode(r,'cost');assert.equal(p.beasts[0].endResearch,317700);assert.equal(p.totals.overflowResearch,0);
  assert.equal(p.beasts[0].items[0].rank,1);
});
test('all prices and shared stock used for ranking are identical to displayed plan cost',()=>{
  const r=solve(input(['red-serpent','potu-sanlang'],4),{}, {newRankMode:'zero',referenceCostSettings:{awakeningBlueprintStock:100}});
  for(const p of r.plans){assert.equal(p.totals.pricedYuan,p.cost.totalYuan);assert.equal(p.cost.blueprints.usedStock,100);assert.equal(p.cost.blueprints.missing,p.totals.awakeningBlueprints-100);}
});
