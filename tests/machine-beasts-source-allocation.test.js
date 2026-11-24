'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const CORE=require('../js/machine-beasts.js');
const SCHOOL=require('../js/machine-beast-school-planner.js');
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

test('Yueliao 25 in zero mode retains the equivalent rank-eight original',()=>{
  const progress={fragments:0,inventory:{none:{8:1,6:1,5:1,4:1,3:1}}};
  const original=structuredClone(progress);
  const r=CORE.calculateInvestmentPlan(DATA,beast,progress,{targetLevel:25,newRankMode:'zero',convertOwnedInventory:true});
  assert.equal(r.valid,true);
  assert.deepEqual(byRank(r.selected.ownedItems),{8:1,6:1,5:1,4:1,0:1});
  assert.deepEqual(byRank(r.selected.newItems),{0:16});
  assert.deepEqual([r.totals.research,r.totals.overflow,r.totals.awakeningBlueprints,r.totals.organPieces],[1137138,338,2277,11374]);
  assert.equal(r.inventoryConversion.operations,1);
  assert.deepEqual(r.inventoryConversion.sources.map(s=>s.rank),[3]);
  assert.deepEqual(r.unused,[]);
  assert.deepEqual(progress,original);
  const cost=CORE.calculateReferenceCost(DATA,{awakeningBlueprints:r.totals.awakeningBlueprints,beasts:[{beastId:beast.id,fragments:r.shortage.fragments}]});
  assert.equal(cost.totalYuan,879390);
});

test('the fully invested unmodified eight stays original, but partial or altered yield does not',()=>{
  const kept=allocate({8:1},{7:2});
  assert.deepEqual(byRank(kept.items),{8:1});
  assert.equal(kept.inventoryConversion.operations,0);
  const altered=allocate({8:1},{7:1,0:1});
  assert.deepEqual(byRank(altered.items),{7:1,0:1});
  assert.equal(altered.inventoryConversion.operations,2);
});

test('multiple originals are retained independently without folding purchased sevens',()=>{
  const result=allocate({8:2},{7:5});
  assert.deepEqual(byRank(result.items.filter(i=>i.source==='owned')),{8:2});
  assert.deepEqual(byRank(result.items.filter(i=>i.source==='new')),{7:1});
  assert.equal(result.inventoryConversion.operations,0);
  assert.deepEqual(result.unused,[]);
});

test('preserve an eight intact when the separate rank-seven original can supply the downgrade',()=>{
  const result=allocate({7:1,8:1},{7:2,0:1},{newRankMode:'zero'});
  assert.deepEqual(byRank(result.items),{8:1,0:1});
  assert.deepEqual(result.inventoryConversion.sources.map(s=>[s.rank,s.bodyTargets.map(t=>t.rank)]),[[7,[0]]]);
  assert.equal(result.inventoryConversion.operations,1);
});

test('buying a rank seven can leave the selected rank zero original untouched in free mode',()=>{
  const result=allocate({0:1},{0:1,7:1});
  assert.deepEqual(byRank(result.items.filter(i=>i.source==='owned')),{0:1});
  assert.deepEqual(byRank(result.items.filter(i=>i.source==='new')),{7:1});
  assert.equal(result.newCount,1);
  assert.equal(result.inventoryConversion.operations,0);
});

test('a newly modified slot need not take the inventory share from an untouched plain slot',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{0:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven',ownedLooseCores:40}).pool;
  const raw=[[0,'none'],[7,'initial']].map(([rank,modificationId])=>({source:'new',rank,modificationId,count:1,sevenRankEquivalent:1,researchEach:CORE.researchFor(DATA,beast,rank,modificationId)}));
  const r=CORE.allocateConvertedInventory(DATA,beast,pool,raw);
  assert.deepEqual(r.items.map(i=>[i.source,i.rank,i.modificationId]).sort(),[['new',7,'initial'],['owned',0,'none']]);
  assert.equal(r.inventoryConversion.operations,0);
  assert.equal(r.modificationCores.spent,40);
  assert.equal(r.newCount,1);
});

test('a matching modified original is not reset to fund a purchasable plain slot',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{initial:{0:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven'}).pool;
  const raw=[[0,'initial'],[7,'none']].map(([rank,modificationId])=>({source:'new',rank,modificationId,count:1,sevenRankEquivalent:1,researchEach:CORE.researchFor(DATA,beast,rank,modificationId)}));
  const r=CORE.allocateConvertedInventory(DATA,beast,pool,raw);
  assert.deepEqual(r.items.map(i=>[i.source,i.rank,i.modificationId]).sort(),[['new',7,'none'],['owned',0,'initial']]);
  assert.equal(r.inventoryConversion.operations,0);
  assert.deepEqual([r.modificationCores.spent,r.modificationCores.returned,r.modificationCores.externalDeficit],[0,0,0]);
});

test('reserve an explicit original before trying to satisfy seven-rank demand',()=>{
  const {pool}=CORE.conversionMaterials(DATA,beast,CORE.normalizeBeastProgress(beast,{inventory:{none:{8:1}}},DATA),{newRankMode:'zeroToSeven'});
  const result=CORE.allocateConvertedInventory(DATA,beast,pool,[
    {source:'owned',rank:8,modificationId:'none',count:1,researchEach:150504,sevenRankEquivalent:2},
    {source:'new',rank:7,modificationId:'none',count:1,researchEach:75252,sevenRankEquivalent:1}
  ]);
  assert.equal(result.newCount,1);
  assert.deepEqual(result.inventoryConversion.sources,[]);
});

for(const [rank,weight,blueprints] of [[9,4,603],[10,8,1205]])test(`rank ${rank} and its split yield keep their separate per-unit rounding`,()=>{
  const {types}=CORE.conversionMaterials(DATA,beast,CORE.normalizeBeastProgress(beast,{inventory:{none:{[rank]:1}}},DATA),{newRankMode:'zero'});
  assert.equal(types.find(t=>t.rank===rank&&t.source==='owned').blueprints,blueprints);
  const split=allocate({[rank]:1},{7:weight});
  assert.deepEqual(byRank(split.items),{7:weight});
  assert.equal(split.inventoryConversion.operations,1);
  const source=types.find(t=>t.rank===7&&t.modificationId==='none');
  assert.equal(source.blueprints*weight,151*weight);
  const data={...DATA,researchThresholds:{0:0,1:75252*weight}};
  const plan=CORE.calculateInvestmentPlan(data,{...beast,maxLevel:1},{inventory:{none:{[rank]:1}}},
    {targetLevel:1,newRankMode:'zero',convertOwnedInventory:true});
  assert.equal(plan.valid,true);
  assert.deepEqual(byRank(plan.selected.ownedItems),{[rank]:1});
  assert.equal(plan.totals.awakeningBlueprints,blueprints);
  assert.deepEqual(plan.inventoryConversion.sources,[]);
});

for(const [rank,weight] of [[8,2],[9,4],[10,8]])test(`rank ${rank} is directly invested when all resource rounding is exactly equal`,()=>{
  const data={...DATA,resourceRules:{...DATA.resourceRules,blueprintDivisor:1,organPieceDivisor:1}};
  const {pool,types}=CORE.conversionMaterials(data,beast,CORE.normalizeBeastProgress(beast,{inventory:{none:{[rank]:1}}},data),{newRankMode:'zero'});
  assert.ok(!types.some(t=>t.rank===rank&&t.source==='owned'&&t.available>0));
  const result=CORE.allocateConvertedInventory(data,beast,pool,[{source:'owned-processed',rank:7,modificationId:'none',count:weight,researchEach:75252,sevenRankEquivalent:1}]);
  assert.deepEqual(byRank(result.items),{[rank]:1});
  assert.equal(result.items[0].researchEach,75252*weight);
  assert.equal(result.inventoryConversion.operations,0);
  assert.deepEqual(result.unused,[]);
});

function narrowSchool(){
  const one={...beast,schoolId:'audit',maxRank:8,maxLevel:1,effects:[{level:1,text:'A'}]};
  const data={...DATA,beasts:[one],schools:[{id:'audit',name:'验收',beastIds:[one.id],stages:[{stage:1,requiredTotalLevel:1}]}],
    researchThresholds:{0:0,1:150504},
    researchValues:{orange:{0:{none:48000},7:{none:75252},8:{none:150504}}}};
  return {one,data};
}
for(const school of [false,true])test('formal tie does not replace an untouched original with a rank upgrade: '+school,()=>{
  const {one,data}=narrowSchool();
  one.maxRank=1;
  data.researchThresholds={0:0,1:500};
  data.researchValues={orange:{0:{none:500},1:{none:500}}};
  const progress={inventory:{none:{0:1}}},options={targetLevel:1,targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true};
  const result=school?SCHOOL.calculateSchoolPlans(data,'audit',{[one.id]:progress},options):CORE.calculateInvestmentPlan(data,one,progress,options);
  assert.equal(result.valid,true);
  const choice=school?result.plans[0].beasts[0]:result;
  assert.deepEqual(byRank(school?choice.items:choice.selected.ownedItems),{0:1});
  assert.equal(choice.inventoryConversion.operations,0);
  assert.equal(school?choice.addedResearch:choice.totals.research,500);
  if(school){
    assert.equal(result.plans[0].equivalents.count,'2');
    assert.deepEqual(byRank(SCHOOL.equivalentPlansPage(data,result.plans[0],'0',1).plans[0].beasts[0].items),{1:1});
  }
});

test('lower formal blueprint use still wins even when it takes one operation',()=>{
  const {one,data}=narrowSchool();
  one.maxRank=1;
  data.researchThresholds={0:0,1:600};
  data.researchValues={orange:{0:{none:300},1:{none:600}}};
  data.resourceRules={...data.resourceRules,blueprintDivisor:600};
  const progress={inventory:{none:{0:2}}},options={targetLevel:1,targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true};
  const result=SCHOOL.calculateSchoolPlans(data,'audit',{[one.id]:progress},options);
  assert.equal(result.valid,true);
  assert.equal(result.plans[0].totals.awakeningBlueprints,1);
  assert.deepEqual(byRank(result.plans[0].beasts[0].items),{1:1});
  assert.equal(result.plans[0].beasts[0].inventoryConversion.operations,1);
});

test('school chooses an untouched original across formally tied beasts, not only tied forms of one beast',()=>{
  const {one,data}=narrowSchool();
  one.maxRank=1;
  const second={...one,id:'second-original',name:'第二只'};
  data.beasts.push(second);
  data.schools[0].beastIds.push(second.id);
  data.researchThresholds={0:0,1:500};
  data.researchValues={orange:{0:{none:300},1:{none:500}}};
  for(const reverse of [false,true]){
    const [first,other]=reverse?[second,one]:[one,second];
    const progress={[first.id]:{inventory:{none:{0:1}}},[other.id]:{inventory:{none:{1:1}}}};
    const r=SCHOOL.calculateSchoolPlans(data,'audit',progress,{targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true});
    assert.equal(r.valid,true);
    const plan=r.plans[0];
    assert.deepEqual(plan.beasts.map(b=>b.beastId),[other.id]);
    assert.equal(plan.beasts[0].inventoryConversion.operations,0);
    assert.equal(plan.equivalents.count,'2');
  }
});

test('school compares actual core deficits even when neither tied plan has owned bodies',()=>{
  const {one,data}=narrowSchool();
  one.maxRank=0;
  data.researchThresholds={0:0,1:500};
  data.researchValues={orange:{0:{none:0,initial:500,heaven:500}}};
  const r=SCHOOL.calculateSchoolPlans(data,'audit',{},
    {targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true,allowNewModifications:true});
  assert.equal(r.valid,true);
  const plan=r.plans[0], choice=plan.beasts[0];
  assert.equal(plan.equivalents.count,'2');
  assert.equal(choice.items[0].modificationId,'initial');
  assert.equal(choice.modificationCores.externalDeficit,40);
});

test('school can certify unavoidable processing without visiting 230230 tied material vectors', {timeout:5000},()=>{
  const {one,data}=narrowSchool();
  one.maxRank=7;
  data.researchThresholds={0:0,1:10000};
  data.researchValues={orange:{0:{none:0,initial:30}}};
  for(let rank=1;rank<=7;rank++)data.researchValues.orange[rank]={none:500};
  const r=SCHOOL.calculateSchoolPlans(data,'audit',{[one.id]:{inventory:{initial:{0:1}}}},
    {targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true});
  assert.equal(r.valid,true);
  assert.equal(r.plans[0].equivalents.count,'230230');
  assert.deepEqual([r.plans[0].beasts[0].inventoryConversion.operations,r.plans[0].beasts[0].inventoryConversion.rankDistance],[1,1]);
});
for(const [allowNewHighRanks,extraSeven] of [[false,0],[true,0],[true,1],[true,2]])test('school planner counts a physical rank-eight original once: '+allowNewHighRanks+'/'+extraSeven,()=>{
  const {one,data}=narrowSchool();
  const r=SCHOOL.calculateSchoolPlans(data,'audit',{[one.id]:{inventory:{none:{8:1,7:extraSeven}}}},
    {targetStage:1,newRankMode:'zero',convertOwnedInventory:true,allowNewHighRanks});
  assert.equal(r.valid,true);
  assert.equal(r.plans.length,1);
  assert.equal(r.plans[0].equivalents.count,'1');
  assert.deepEqual(byRank(r.plans[0].beasts[0].items),{8:1});
  assert.deepEqual(r.plans[0].beasts[0].inventoryConversion.sources,[]);
  assert.deepEqual([r.plans[0].totals.awakeningBlueprints,r.plans[0].totals.organPieces],[302,1506]);
  const page=SCHOOL.equivalentPlansPage(data,r.plans[0],'0',10);
  assert.deepEqual([page.plans,page.nextOffset,page.hasMore],[[],'1',false]);
});

test('two distinct rank-seven originals can still be used as-is or assembled',()=>{
  const {one,data}=narrowSchool();
  const result=SCHOOL.calculateSchoolPlans(data,'audit',{[one.id]:{inventory:{none:{7:2}}}},
    {targetStage:1,newRankMode:'zero',convertOwnedInventory:true,allowNewHighRanks:true});
  assert.equal(result.valid,true);
  const plan=result.plans[0], page=SCHOOL.equivalentPlansPage(data,plan,'0',1);
  assert.equal(plan.equivalents.count,'2');
  assert.equal(page.plans.length,1);
  assert.deepEqual([plan,...page.plans].map(p=>JSON.stringify(byRank(p.beasts[0].items))).sort(),['{"7":2}','{"8":1}']);
});

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
        if(r===8&&targets.filter(t=>t===7).length>=2){
          const rest=targets.slice();
          for(let i=0;i<2;i++)rest.splice(rest.indexOf(7),1);
          const direct=oracle(stock.slice(0,index).concat(stock.slice(index+1)),rest,restricted);
          if(direct&&(!best||direct[0]<best[0]||direct[0]===best[0]&&direct[1]<best[1]))best=direct;
        }
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
  assert.deepEqual(byRank(first.items.filter(i=>i.source==='owned')),{6:1,8:1,10:1});
  assert.equal(first.newCount,3);
  assert.ok(first.inventoryConversion.sources.every(s=>s.rank!==10));
});
for(const [group,ranks,mode,owned,added,paths,metrics] of [
  [1,[8,9,10],'zeroToSeven',{10:1,9:1,7:1,6:1},{0:2},[[8,[[7,1],[6,1]]]], [2,1137180,380,2277,249390]],
  [2,[8,9,10],'zero',{10:1,9:1,7:1,6:1},{0:2},[[8,[[7,1],[6,1]]]], [2,1137180,380,2277,249390]],
  [3,[4,5,6,7],'zeroToSeven',{6:1,7:3},{7:10,0:2},[[4,[[7,1]]],[5,[[7,1]]]], [12,1137180,380,2281,699670]],
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
