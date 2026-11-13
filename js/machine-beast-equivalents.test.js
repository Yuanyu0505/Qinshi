'use strict';
// User-run regressions; not executed automatically under this project's AGENTS.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const DATA=require('../data/machine-beasts.js');
const P=require('./machine-beast-school-planner.js');
function fixture(count,target=1,ranks={0:{none:2}}) {
  const beast={...DATA.beasts.find(b=>b.id==='red-serpent'),maxLevel:1,maxRank:1,fragmentsPerBody:1,contributionPerFragment:2.7,effects:[{level:1,text:'effect'}]};
  const beasts=Array.from({length:count},(_,i)=>({...beast,id:'beast-'+String(i).padStart(2,'0'),name:'Beast '+i}));
  return {...DATA,beasts,researchThresholds:{0:0,1:2},researchValues:{orange:ranks},modifications:[{id:'none',name:'0改'}],resourceRules:{blueprintDivisor:2,organPieceDivisor:1},schools:[{id:'tie',beastIds:beasts.map(b=>b.id),stages:[{stage:1,requiredTotalLevel:target}]}]};
}
function solve(d,progress={},options={}) { const r=P.calculateSchoolPlans(d,'tie',progress,{targetStage:1,newRankMode:'zero',...options});assert.equal(r.valid,true,JSON.stringify(r.errors));return r.plans[0]; }
function all(d,plan,size=10) {let offset='0',out=[];do {const p=P.equivalentPlansPage(d,plan,offset,size);out.push(...p.plans);offset=p.nextOffset;if(!p.hasMore)break;}while(true);return out;}
function metrics(p) {const t=p.totals;return [t.modifiedInvestedCount,t.pricedYuan,t.unlockedEffects,t.overflowResearch,t.awakeningBlueprints];}
test('all equally optimal beasts survive stable-key selection and remain JSON round-trippable',()=>{
  const d=fixture(3),plan=JSON.parse(JSON.stringify(solve(d)));
  assert.equal(plan.equivalents.count,'3');
  const alternatives=all(d,plan,1);assert.equal(alternatives.length,2);
  assert.deepEqual(new Set([plan,...alternatives].map(p=>p.beasts[0].beastId)),new Set(d.beasts.map(b=>b.id)));
  for(const p of alternatives) assert.deepEqual(metrics(p),metrics(plan));
});
test('material allocations with identical raw research and resources are not reduced to one stable vector',()=>{
  const d=fixture(1,1,{0:{none:2},1:{none:2}}),plan=solve(d,{}, {newRankMode:'zeroToSeven'});
  assert.equal(plan.equivalents.count,'2');
  const alternatives=all(d,plan);assert.equal(alternatives.length,1);
  assert.notEqual(alternatives[0].beasts[0].items[0].rank,plan.beasts[0].items[0].rank);
});
test('free new bodies and owned bodies remain equivalent even when the primary optimizer removes new types',()=>{
  const d=fixture(1),id=d.beasts[0].id,plan=solve(d,{[id]:{fragments:1,inventory:{none:{0:1}}}});
  assert.equal(plan.equivalents.count,'2');
  assert.deepEqual(new Set([plan,...all(d,plan)].map(p=>p.beasts[0].items[0].source)),new Set(['new','owned']));
});
test('strictly more expensive, higher-blueprint or unavailable materials never appear as equivalent',()=>{
  const d=fixture(1,1,{0:{none:2},1:{none:3}}),id=d.beasts[0].id;
  const plan=solve(d,{[id]:{inventory:{none:{0:1}}}},{ownedLimitsByBeast:{[id]:{none:{0:0}}},newRankMode:'zeroToSeven',referenceCostSettings:{awakeningBlueprintStock:100}});
  assert.equal(plan.equivalents.count,'1');assert.deepEqual(all(d,plan),[]);
});
test('different new quantities covered by fragments remain tied under fractional shared blueprint pricing',()=>{
  const d=fixture(1,1,{0:{none:2},1:{none:4}}),id=d.beasts[0].id;
  d.researchThresholds[1]=4;d.resourceRules.blueprintDivisor=3;
  const plan=solve(d,{[id]:{fragments:2}},{newRankMode:'zeroToSeven',referenceCostSettings:{awakeningBlueprintPrice:0.1,awakeningBlueprintStock:1}});
  assert.equal(plan.equivalents.count,'2');
  const choices=[plan,...all(d,plan)];assert.deepEqual(new Set(choices.map(p=>p.totals.newInvestedCount)),new Set([1,2]));
  assert.ok(choices.every(p=>p.totals.pricedYuan===1&&p.totals.awakeningBlueprints===2&&p.totals.overflowResearch===0));
});
test('when exact levels require modifications, all equally minimal modification types are retained',()=>{
  const d=fixture(1,1,{0:{none:2,initial:3,heaven:3}});
  d.beasts[0].maxLevel=2;d.beasts[0].maxRank=0;d.researchThresholds={0:0,1:3,2:4};
  d.modifications=[{id:'none',name:'0改'},{id:'initial',name:'初改'},{id:'heaven',name:'天改'}];
  const plan=solve(d,{}, {allowNewModifications:true});
  assert.equal(plan.totals.modifiedInvestedCount,1);assert.equal(plan.equivalents.count,'2');
  assert.deepEqual(new Set([plan,...all(d,plan)].map(p=>p.beasts[0].items[0].modificationId)),new Set(['initial','heaven']));
});
test('97 to 135 keeps both six-node 647052 alternatives and resets the uncultivated final effects',()=>{
  const d=DATA,progress={},ids=['mechanical-black-tortoise','mechanical-white-tiger','mechanical-year-beast'];
  let remaining=95;
  for(const id of d.schools.find(s=>s.id==='nonAttack').beastIds){const b=d.beasts.find(b=>b.id===id);const n=ids.includes(id)?(id==='mechanical-year-beast'?2:0):Math.min(remaining,b.maxLevel);if(!ids.includes(id))remaining-=n;progress[id]={research:d.researchThresholds[n]};}
  const result=P.calculateSchoolPlans(d,'nonAttack',progress,{targetStage:3,newRankMode:'zero',participatingBeastIds:ids});
  assert.equal(result.valid,true);const plan=result.plans.find(p=>p.kind==='effects'||p.kind==='merged');
  // Level 2 starts at 47700, not one 48000-research body: the year beast
  // overflows by 47700 + 17 * 48000 - 834000 = 29700, not 30000.
  assert.deepEqual(metrics(plan),[0,647052,6,59700,3360]);assert.equal(plan.equivalents.count,'2');
  const alternatives=all(d,plan);assert.equal(alternatives.length,1);
  const other=alternatives[0];assert.deepEqual(metrics(other),metrics(plan));
  assert.equal(result.current.totalLevel,97);assert.equal(result.target.remaining,38);
  assert.deepEqual(new Set([plan,other].map(p=>p.beasts.find(b=>b.beastId!=='mechanical-year-beast').beastId)),new Set(ids.slice(0,2)));
  for(const p of [plan,other]){
    assert.equal(p.beasts.length,2);
    const year=p.beasts.find(b=>b.beastId==='mechanical-year-beast');
    const partner=p.beasts.find(b=>b.beastId!=='mechanical-year-beast');
    for(const [row,startLevel,startResearch,count,endResearch,overflow] of [[partner,0,0,18,864000,30000],[year,2,47700,17,863700,29700]]){
      assert.deepEqual([row.startLevel,row.startResearch,row.endLevel,row.addedResearch,row.endResearch,row.overflowResearch],
        [startLevel,startResearch,20,count*48000,endResearch,overflow]);
      assert.deepEqual(row.items,[{source:'new',modificationId:'none',rank:0,count,researchEach:48000,sevenRankEquivalent:1}]);
      assert.equal(row.finalEffect.level,20);
    }
    // Independent conservation check: 35 bodies add 1680000 research; the
    // two level-20 thresholds consume 1668000 including the original 47700.
    assert.equal(p.beasts.reduce((n,b)=>n+b.items.reduce((r,i)=>r+i.count*i.researchEach,0),0),1680000);
    assert.equal(p.beasts.reduce((n,b)=>n+b.endResearch,0),1727700);
    assert.equal(p.beasts.reduce((n,b)=>n+b.endResearch-834000,0),59700);
    assert.equal(p.beasts.reduce((n,b)=>n+b.endLevel-b.startLevel,0),38);
    assert.equal(p.totals.projectedTotalLevel,135);
    assert.equal(p.finalEffects.reduce((n,b)=>n+b.level,0),135);
    assert.deepEqual([p.totals.newInvestedCount,p.totals.fragments,p.totals.organPieces,p.totals.contribution,p.totals.yuan],
      [35,1400,16800,1112000,411852]);
    assert.equal(p.cost.blueprints.yuan,235200);
  }
  const cultivated=new Set(other.beasts.map(b=>b.beastId));
  for(const id of ['mechanical-black-tortoise','mechanical-white-tiger']){const row=other.finalEffects.find(b=>b.beastId===id);assert.equal(row.level,cultivated.has(id)?20:0);assert.equal(Boolean(row.effect),cultivated.has(id));}
});
test('pagination has no hidden twenty-result cap and exact counts exceed Number safe integers',()=>{
  const d=fixture(10,3),plan=solve(d),alternatives=all(d,plan,7);
  assert.equal(plan.equivalents.count,'120');assert.equal(alternatives.length,119);
  const keys=[plan,...alternatives].map(p=>p.beasts.map(b=>b.beastId).sort().join(','));assert.equal(new Set(keys).size,120);
  const large=fixture(60,30),many=solve(large);
  assert.equal(many.equivalents.count,'118264581564861424');
  const last=P.equivalentPlansPage(large,JSON.parse(JSON.stringify(many)),'118264581564861423',1);
  assert.equal(last.hasMore,false);assert.equal(last.nextOffset,'118264581564861424');
});
test('the final excluded primary does not leave an empty load-more page',()=>{
  const d=fixture(21),plan=solve(d),first=P.equivalentPlansPage(d,plan,'0',10),last=P.equivalentPlansPage(d,plan,first.nextOffset,10);
  assert.equal(first.plans.length,10);assert.equal(first.hasMore,true);
  assert.equal(last.plans.length,10);assert.equal(last.hasMore,false);assert.equal(last.nextOffset,'21');
});
