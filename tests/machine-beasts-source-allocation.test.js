'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const CORE=require('../js/machine-beasts.js');
const DATA=require('../data/machine-beasts.js');
const beast=DATA.beasts.find(b=>b.id==='mechanical-yueliao');
function byRank(items){
  return Object.fromEntries(Object.entries(items.reduce((m,i)=>(m[i.rank]=(m[i.rank]||0)+i.count,m),{})));
}

function allocate(stock, demand, options={}){
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:stock}},DATA);
  const {pool}=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven',...options});
  const vector=Object.entries(demand).map(([k,count])=>{
    const rank=Number(k);
    return {source:'new',rank,count,modificationId:'none',researchEach:CORE.researchFor(DATA,beast,rank,'none'),sevenRankEquivalent:rank>7?2**(rank-7):1};
  });
  return CORE.allocateConvertedInventory(DATA,beast,pool,vector);
}

test('use one split output as-is instead of raising another body and downgrading both outputs',()=>{
  const inventory={none:{5:1,6:1,8:1,9:1,10:1}};
  const result=CORE.calculateInvestmentPlan(DATA,beast,{inventory},{targetLevel:25,newRankMode:'zeroToSeven',convertOwnedInventory:true});
  assert.equal(result.valid,true);
  assert.equal(result.totals.newInvestedCount,0);
  assert.equal(result.totals.awakeningBlueprints,2277);
  assert.deepEqual([result.totals.research,result.totals.overflow],[1137180,380]);
  const price=CORE.calculateReferenceCost(DATA,{awakeningBlueprints:result.totals.awakeningBlueprints,beasts:[{beastId:beast.id,fragments:result.shortage.fragments}]});
  assert.equal(price.totalYuan,159390);
  const {operations,sources}=result.inventoryConversion;
  assert.equal(operations,3);
  assert.deepEqual(sources.map(s=>[s.rank,byRank(s.bodyTargets.map(t=>({rank:t.rank,count:t.bodies})))]),[[5,{0:1}],[8,{0:1,7:1}]]);
});

test('for the same operation count prefer the shortest downgrade and upgrade',()=>{
  for(const [stock,demand,rank] of [[{7:1,6:1},{0:1},6],[{3:1,5:1},{7:1},5]]){
    const result=allocate(stock,demand);
    assert.equal(result.inventoryConversion.operations,1);
    assert.deepEqual(result.inventoryConversion.sources.map(s=>s.rank),[rank]);
    assert.equal(result.unused.length,1);
  }
});

for(const [rank,quantity] of [[8,2],[9,4],[10,8]])test(`rank ${rank} splits directly into ${quantity} rank-seven bodies in one operation`,()=>{
  const result=allocate({[rank]:1},{7:1});
  assert.equal(result.inventoryConversion.operations,1);
  assert.equal(result.inventoryConversion.sources[0].baseBodies,quantity);
  assert.equal(result.inventoryConversion.sources[0].remainingBaseBodies,quantity-1);
  assert.deepEqual(byRank(result.unused),{7:quantity-1});
});

test('small allocation oracle independently enumerates raw originals, splits and rank transfers',()=>{
  function oracle(stock,targets,restricted){
    let best;
    function choose(index,pool,splits){
      if(index<stock.length){
        const r=stock[index];
        choose(index+1,pool,splits);
        choose(index+1,pool.concat(Array(r>7?2**(r-7):1).fill(Math.min(r,7))),splits+(r>7?1:0));
        return;
      }
      function assign(i,available,ops,span){
        if(i===targets.length){
          if(!best||ops<best[0]||ops===best[0]&&span<best[1])best=[ops,span];
          return;
        }
        for(let j=0;j<available.length;j++){
          if(restricted&&available[j]<targets[i])continue;
          const d=Math.abs(available[j]-targets[i]);
          assign(i+1,available.filter((_,k)=>k!==j),ops+Number(d>0),span+d);
        }
      }
      assign(0,pool,splits,0);
    }
    choose(0,[],0);
    return best;
  }
  for(const stock of [[4,5,7],[3,6,8],[5,8,9],[6,7,10],[0,3,5]]){
    const inventory=byRank(stock.map(rank=>({rank,count:1})));
    for(const restricted of [false,true])for(const targets of [[0],[0,0],[0,7],[3,6],[7,7],[3,5,7]]){
      const expected=oracle(stock,targets,restricted);
      if(!expected)continue;
      const demand=byRank(targets.map(rank=>({rank,count:1})));
      const result=allocate(inventory,demand,{newRankMode:restricted?'zero':'zeroToSeven'});
      assert.deepEqual([result.inventoryConversion.operations,result.inventoryConversion.rankDistance],expected,JSON.stringify({stock,targets,restricted}));
    }
  }
});

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
