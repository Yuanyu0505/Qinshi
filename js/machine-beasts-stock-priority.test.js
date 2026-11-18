'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const DATA=require('../data/machine-beasts.js');
const CORE=require('./machine-beasts.js');
test('single stock priority: sufficient low-rank inventory avoids buying high-rank bodies',()=>{
  const beast=DATA.beasts.find(b=>b.name==='机关炎傀');
  const result=CORE.calculateInvestmentPlan(DATA,beast,{inventory:{none:{0:20}}},{targetLevel:10,newRankMode:'zeroToSeven',preferOwnedOnTie:true,prioritizeOwnedInventory:true});
  assert.equal(result.valid,true);
  assert.equal(result.totals.newInvestedCount,0);
  assert.equal(result.totals.investedCount,7);
  assert.equal(result.selected.ownedItems[0].count,7);
  assert.equal(result.selected.newItems.length,0);
});
test('single stock priority: limited or disabled stock remains bounded and range switches stay independent',()=>{
  const beast=DATA.beasts.find(b=>b.name==='机关炎傀');
  const progress={inventory:{none:{0:20}}};
  const options={targetLevel:10,newRankMode:'zeroToSeven',prioritizeOwnedInventory:true,preferOwnedOnTie:true};
  const limited=CORE.calculateInvestmentPlan(DATA,beast,progress,{...options,ownedLimits:{none:{0:6}}});
  assert.equal(limited.totals.newInvestedCount,1);
  assert.ok(limited.selected.ownedItems.reduce((n,i)=>n+i.count,0)<=6);
  const ignored=CORE.calculateInvestmentPlan(DATA,beast,progress,{...options,useOwnedInventory:false});
  assert.equal(ignored.selected.ownedItems.length,0);
  assert.equal(ignored.totals.investedCount,5);
  const zero=CORE.calculateInvestmentPlan(DATA,beast,progress,{...options,newRankMode:'zero'});
  assert.equal(zero.totals.newInvestedCount,0);
  assert.equal(zero.totals.investedCount,7);
});

// Independent complete quantity enumeration: no product DP, state pruning or
// candidate helpers. A wrong count cap or early exit must disagree here.
test('single stock priority: 100 seeded mixed-inventory instances match exhaustive enumeration',()=>{
  let seed=94731;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
  const modes=new Set();
  for(let iteration=0;iteration<100;iteration++){
    const rows={0:{none:2,initial:3},3:{none:5,initial:6},7:{none:9,initial:10},8:{none:18,initial:20}};
    const beast={id:'fixture',name:'Fixture',quality:'orange',tier:'橙一',maxLevel:3,maxRank:8,fragmentsPerBody:4,contributionPerFragment:3,effects:[]};
    const data={beasts:[beast],researchThresholds:{0:0,1:4,2:12,3:23},researchValues:{orange:rows},modifications:[{id:'none'},{id:'initial'}],resourceRules:{blueprintDivisor:3,organPieceDivisor:2},referenceCostRules:{contributionPerYuan:3}};
    const inventory={none:{0:random(4),3:random(3),8:random(2)},initial:{0:random(3)}};
    const limit=random(4),start=random(4),deficit=12-start;
    const zero=Boolean(random(2)),equivalent=Boolean(random(2));
    modes.add(zero+'/'+equivalent);
    const types=[];
    for(const mod of ['none','initial'])for(const [rankText,count] of Object.entries(inventory[mod])){
      const rank=Number(rankText),available=mod==='none'&&rank===0?Math.min(count,limit):count;
      types.push({owned:true,research:rows[rank][mod],cap:available,weight:equivalent&&rank===8?2:1});
    }
    for(const rank of zero?[0]:[0,3,7])types.push({owned:false,research:rows[rank].none,cap:Math.ceil(deficit/rows[rank].none),weight:1});
    let best=null;
    function enumerate(index,research,added,total,blueprints,pieces){
      if(index===types.length){
        if(research<deficit)return;
        const score=[added,total,research-deficit,blueprints,pieces];
        if(!best||score.some((v,i)=>v<best[i]&&score.slice(0,i).every((p,j)=>p===best[j])))best=score;
        return;
      }
      const type=types[index];
      for(let q=0;q<=type.cap;q++)enumerate(index+1,research+q*type.research,added+(type.owned?0:q*type.weight),total+q*type.weight,blueprints+q*Math.ceil(type.research/3),pieces+q*Math.ceil(type.research/2));
    }
    enumerate(0,0,0,0,0,0);
    const progress={research:start,showMods:true,showHighRanks:true,inventory};
    const options={targetLevel:2,newRankMode:zero?'zero':'zeroToSeven',prioritizeOwnedInventory:true,includeMods:true,includeHighRanks:true,ownedLimits:{none:{0:limit}},investedCountMode:equivalent?'equivalent':'actual'};
    const result=CORE.calculateInvestmentPlan(data,beast,progress,options);
    assert.equal(result.valid,true,'instance '+iteration);
    assert.deepEqual([result.totals.newInvestedCount,result.totals.investedCount,result.totals.overflow,result.totals.awakeningBlueprints,result.totals.organPieces],best,'instance '+iteration);
    const frontier=CORE.calculateInvestmentCandidates(data,beast,progress,{...options,maximumTargetLevel:2});
    const shared=frontier.find(plan=>plan.target.level===2);
    assert.deepEqual(shared.totals,result.totals,'shared workspace '+iteration);
  }
  assert.equal(modes.size,4,'exercise both new-rank ranges and both high-rank counting modes');
});
