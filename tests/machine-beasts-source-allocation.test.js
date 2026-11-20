'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const CORE=require('../js/machine-beasts.js');
const DATA=require('../data/machine-beasts.js');
const beast=DATA.beasts.find(b=>b.id==='mechanical-yueliao');
function byRank(items){
  return Object.fromEntries(Object.entries(items.reduce((m,i)=>(m[i.rank]=(m[i.rank]||0)+i.count,m),{})));
}

test('source order cannot change high-rank coverage or consume a reserved direct original',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{5:1,10:1,8:1}}},DATA);
  const domain=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven'});
  const shape=(rank,count,source='new')=>({source,rank,count,modificationId:'none',researchEach:DATA.researchValues.orange[rank].none,sevenRankEquivalent:rank>7?2**(rank-7):1});
  const vector=[shape(0,3),shape(7,2),shape(6,1),shape(10,1,'owned')];
  const first=CORE.allocateConvertedInventory(DATA,beast,domain.pool,vector);
  const second=CORE.allocateConvertedInventory(DATA,beast,domain.pool,vector.slice().reverse());
  assert.deepEqual(first,second);
  assert.deepEqual(byRank(first.items.filter(i=>i.source==='owned')),{6:1,7:2,10:1});
  assert.equal(first.newCount,3);
  assert.ok(first.inventoryConversion.sources.every(s=>s.rank!==10));
});
for(const [group,ranks,mode,owned,added,paths,metrics] of [
  [1,[8,9,10],'zeroToSeven',{10:1,9:1,7:1,6:1},{0:2},[[8,[[7,1],[6,1]]]], [2,1137180,380,2277,249390]],
  [2,[8,9,10],'zero',{10:1,9:1,7:1,6:1},{0:2},[[8,[[7,1],[6,1]]]], [2,1137180,380,2277,249390]],
  [3,[4,5,6,7],'zeroToSeven',{7:4},{7:9,6:1,0:2},[[4,[[7,1]]],[5,[[7,1]]],[6,[[7,1]]]], [12,1137180,380,2281,699670]],
  [4,[4,5,6,7],'zero',{6:1,5:2,3:1},{0:19},[[4,[[3,1]]],[7,[[5,1]]]], [19,1136838,38,2276,1014320]]
]){
  test('source screenshot group '+group,()=>{
    const inventory={none:Object.fromEntries(ranks.map(r=>[r,1]))};
    const progress={inventory,fragments:0};
    const before=JSON.stringify(progress);
    const r=CORE.calculateInvestmentPlan(DATA,beast,progress,{targetLevel:25,newRankMode:mode,convertOwnedInventory:true,ownedLimits:inventory});
    assert.equal(r.valid,true);
    assert.deepEqual(byRank(r.selected.ownedItems),owned);
    assert.deepEqual(byRank(r.selected.newItems),added);
    const c=r.inventoryConversion,t=r.totals;
    const cost=CORE.calculateReferenceCost(DATA,{awakeningBlueprints:t.awakeningBlueprints,beasts:[{beastId:beast.id,fragments:r.shortage.fragments}]});
    assert.deepEqual([t.newInvestedCount,t.research,t.overflow,t.awakeningBlueprints,cost.totalYuan],metrics);
    assert.deepEqual(c.sources.map(s=>[s.rank,s.bodyTargets.map(p=>[p.rank,p.bodies])]),paths);
    for(const s of c.sources){
      assert.equal(s.count,inventory.none[s.rank]);
      assert.equal(s.usedBaseBodies+s.remainingBaseBodies,s.baseBodies);
      assert.equal(s.bodyTargets.reduce((n,p)=>n+p.bodies,0),s.usedBaseBodies);
      assert.equal(s.returnedCores,0);
    }
    assert.equal(r.modificationCores.spent,0);
    assert.deepEqual(r.unused,[]);
    assert.equal(JSON.stringify(progress),before);
  });
}
