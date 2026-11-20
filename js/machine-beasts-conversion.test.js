'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const DATA=require('../data/machine-beasts.js'),CORE=require('./machine-beasts.js'),PLANNER=require('./machine-beast-school-planner.js');
const beast=DATA.beasts.find(b=>b.name==='机关炎傀');
test('conversion: zero stock can become rank seven without buying or mutating inventory',()=>{
  const progress={inventory:{none:{0:20}}},before=JSON.stringify(progress);
  const r=CORE.calculateInvestmentPlan(DATA,beast,progress,{targetLevel:10,newRankMode:'zeroToSeven',convertOwnedInventory:true});
  assert.equal(r.valid,true);assert.equal(r.totals.newInvestedCount,0);assert.equal(r.totals.investedCount,5);
  assert.ok(r.selected.ownedItems.some(i=>i.rank>0));assert.ok(r.inventoryConversion.sources.length);assert.equal(JSON.stringify(progress),before);
});
test('conversion: zero-new mode may reprocess owned stock and reuse its returned cores',()=>{
  const r=CORE.calculateInvestmentPlan(DATA,beast,{showMods:true,inventory:{fullDivine:{7:1}}},{targetLevel:9,newRankMode:'zero',includeMods:true,convertOwnedInventory:true});
  assert.equal(r.totals.newInvestedCount,0);assert.equal(r.selected.ownedItems[0].modificationId,'fullDivine');
  assert.equal(r.selected.ownedItems[0].rank,0);assert.equal(r.inventoryConversion.sources.length,1);
  assert.equal(r.modificationCores.returned,145);assert.equal(r.modificationCores.spent,145);
});
test('conversion: partially dismantled high stock leaves base-body remainder and respects original limits',()=>{
  const r=CORE.calculateInvestmentPlan(DATA,beast,{inventory:{none:{10:1}}},{targetLevel:1,newRankMode:'zero',convertOwnedInventory:true});
  assert.equal(r.totals.investedCount,1);assert.equal(r.totals.newInvestedCount,0);
  assert.equal(r.inventoryConversion.remainingBaseBodies,7);
  assert.equal(r.inventoryConversion.sources[0].sevenRankEquivalent,8);
  assert.equal(r.unused.find(i=>i.rank===7).count,7);
  const blocked=CORE.calculateInvestmentPlan(DATA,beast,{inventory:{none:{10:1}}},{targetLevel:1,newRankMode:'zero',convertOwnedInventory:true,ownedLimits:{none:{10:0}}});
  assert.equal(blocked.totals.newInvestedCount,1);
});
test('conversion: allocation reserves unchanged forms before spending the remaining pool',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{7:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven'}).pool;
  const allocation=CORE.allocateConvertedInventory(DATA,beast,pool,[{source:'new',rank:0,modificationId:'none',count:1,researchEach:48000,sevenRankEquivalent:1},{source:'new',rank:7,modificationId:'none',count:1,researchEach:75252,sevenRankEquivalent:1}]);
  assert.equal(allocation.newCount,1);
  assert.equal(allocation.items.filter(i=>i.source==='owned').reduce((n,i)=>n+i.count,0),1);
  assert.equal(allocation.items.find(i=>i.rank===0).source,'new');
  assert.equal(allocation.inventoryConversion.sources.length,0);
});
test('conversion: a high-rank output can contain both owned and new base bodies',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{0:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven',allowNewHighRanks:true}).pool;
  const result=CORE.allocateConvertedInventory(DATA,beast,pool,[{source:'new',rank:8,modificationId:'none',count:1,researchEach:150504,sevenRankEquivalent:2}]);
  assert.equal(result.invested,2);assert.equal(result.newCount,1);assert.equal(result.owned,1);
  assert.equal(result.items[0].ownedBaseBodies,1);assert.equal(result.items[0].newBaseBodies,1);
  assert.equal(result.inventoryConversion.sources[0].sevenRankEquivalent,1);
});
test('conversion: a mixed modified output credits each side its actual base-body contribution',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{0:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven',allowNewHighRanks:true,ownedLooseCores:40}).pool;
  const result=CORE.allocateConvertedInventory(DATA,beast,pool,[{source:'new',rank:8,modificationId:'initial',count:1,researchEach:178704,sevenRankEquivalent:2}]);
  assert.equal(result.ownedModified,1);
  assert.equal(result.newModified,1);
  assert.equal(result.modificationCores.spent,40);
  assert.equal(result.modificationCores.externalDeficit,0);
});
test('conversion: reclaiming the required cores can supply the body without dismantling unrelated stock',()=>{
  const progress=CORE.normalizeBeastProgress(beast,{inventory:{none:{0:1},initial:{10:1}}},DATA);
  const pool=CORE.conversionMaterials(DATA,beast,progress,{newRankMode:'zeroToSeven'}).pool;
  const result=CORE.allocateConvertedInventory(DATA,beast,pool,[{source:'new',rank:7,modificationId:'initial',count:1,researchEach:103452,sevenRankEquivalent:1}]);
  assert.deepEqual(result.inventoryConversion.sources.map(s=>[s.rank,s.modificationId,s.usedBaseBodies,s.remainingBaseBodies]),[[10,'initial',1,7]]);
  assert.ok(result.unused.some(i=>i.rank===0&&i.count===1&&!i.converted));
  assert.equal(result.modificationCores.returned,40);
  assert.equal(result.modificationCores.spent,40);
  assert.equal(result.newCount,0);
});
test('conversion: explicitly allowed modification does not duplicate original-versus-recreated identical inputs',()=>{
  const data=fixture();data.researchThresholds={0:0,1:4,2:6};
  data.researchValues.orange={0:{none:6,initial:4},7:{none:12,initial:9},8:{none:24,initial:18}};
  const p={inventory:{none:{0:1},initial:{0:1}}};
  const result=PLANNER.calculateSchoolPlans(data,'s',{b:p},{targetStage:1,newRankMode:'zero',convertOwnedInventory:true,allowNewModifications:true});
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  const plan=result.plans[0];assert.equal(plan.totals.modifiedInvestedCount,1);
  assert.equal(plan.beasts[0].items[0].modificationId,'initial');assert.ok(!plan.beasts[0].items[0].converted);
  assert.equal(plan.equivalents.count,'1');
});

function fixture(quality='orange'){
  const b={id:'b',name:'B',schoolId:'s',quality:quality,tier:quality==='orange'?'橙一':'紫色',maxLevel:2,maxRank:8,fragmentsPerBody:4,contributionPerFragment:3,effects:[{level:1,text:'A'},{level:2,text:'B'}]};
  return {beasts:[b],schools:[{id:'s',name:'S',beastIds:['b'],stages:[{stage:1,requiredTotalLevel:1}]}],modifications:[{id:'none'},{id:'initial'}],researchThresholds:{0:0,1:5,2:9},researchValues:{[quality]:{0:{none:2,initial:6},7:{none:5,initial:9},8:{none:10,initial:18}}},resourceRules:{blueprintDivisor:3,organPieceDivisor:2},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3,orangeFiveBodyPrice:45}};
}
function compare(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;}
// Enumerates physical original choices and every processing quantity directly.
// It never calls the conversion helper, production research/fee helpers or DP.
function brute(data,p,options,school){
  const b=data.beasts[0],inventory=p.inventory||{},types=[],max=options.newRankMode==='zero'?0:options.allowNewHighRanks?8:7;
  let pool=0,corePool=0;const coreCosts={none:0,initial:40};
  for(const [mod,ranks]of Object.entries(inventory))for(const [rankText,count]of Object.entries(ranks)){
    const rank=Number(rankText),cap=options.useOwnedInventory===false||b.quality!=='orange'&&mod!=='none'?0:Math.min(count,options.ownedLimits?.[mod]?.[rankText]??count),weight=rank>7?2**(rank-7):1;
    pool+=cap*weight;
    corePool+=cap*coreCosts[mod];
    types.push({research:data.researchValues[b.quality][rank][mod],cap,weight,modified:mod!=='none',cores:coreCosts[mod],ownedWeight:weight});
  }
  const ownedMax=options.allowNewHighRanks?8:7;
  for(const rank of [0,7,8].filter(r=>r<=Math.max(max,pool?ownedMax:0)))for(const mod of data.modifications){
    if(mod.id!=='none'&&(b.quality!=='orange'||!corePool&&!options.allowNewModifications))continue;
    const research=data.researchValues[b.quality][rank][mod.id],weight=rank>7?2**(rank-7):1;
    if(research)types.push({research,weight,modified:mod.id!=='none',cores:coreCosts[mod.id],ownedWeight:rank>max?weight:0,cap:Math.ceil(9/research)});
  }
  let best=null,rows=[];
  function visit(index,r,n,m,B,pieces,cores=0,owned=0){
    if(owned>pool||!options.allowNewModifications&&cores>corePool)return;
    if(index<types.length){const t=types[index];for(let q=0;q<=t.cap;q++)visit(index+1,r+q*t.research,n+q*t.weight,m+(t.modified?q*t.weight:0),B+q*Math.ceil(t.research/3),pieces+q*Math.ceil(t.research/2),cores+q*t.cores,owned+q*t.ownedWeight);return;}
    const final=r>=9?2:r>=5?1:0,added=Math.max(0,n-pool);
    if(school==='rows'){
      if(b.quality!=='orange'&&options.bluePurpleInventoryOnly!==false&&added)return;
      rows.push({level:final,m:m,B:B,body:b.quality==='orange'?Math.max(0,added*4-(p.fragments||0)):0,overflow:r-(final===2?9:final===1?5:0)});return;
    }
    if(school?(final!==data.schools[0].stages[0].requiredTotalLevel):r<5)return;
    if(school&&b.quality!=='orange'&&options.bluePurpleInventoryOnly!==false&&added)return;
    const fragments=Math.max(0,added*4-(p.fragments||0)),body=b.quality==='orange'?fragments:0;
    const cost=body+Math.max(0,B-(options.referenceCostSettings?.awakeningBlueprintStock||0))*7;
    const score=school?[m,cost,-final,r-(final===2?9:5),B]:[added,n,r-5,B,pieces];
    if(!best||compare(score,best)<0)best=score;
  }
  visit(0,0,0,0,0,0);return school==='rows'?rows:best;
}
test('conversion: 80 independently enumerated physical-stock cases match single and school objectives',()=>{
  let seed=12391;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed>>>8)%n;};
  for(let k=0;k<80;k++){
    const data=fixture(k%4===0?'purple':'orange'),p={fragments:random(5),inventory:{none:{0:random(3),8:random(2)},initial:{7:random(2)}}};
    data.schools[0].stages[0].requiredTotalLevel=1+random(2);
    const o={convertOwnedInventory:true,newRankMode:k%2?'zero':'zeroToSeven',useOwnedInventory:k%7!==0,allowNewHighRanks:k%5===0,ownedLimits:{none:{0:random(3)}},referenceCostSettings:{awakeningBlueprintStock:random(5)}};
    const expected=brute(data,p,o,false),single=CORE.calculateInvestmentPlan(data,data.beasts[0],p,{...o,targetLevel:1});
    assert.equal(single.valid,true,'single '+k);
    assert.deepEqual([single.totals.newInvestedCount,single.totals.investedCount,single.totals.overflow,single.totals.awakeningBlueprints,single.totals.organPieces],expected,'single '+k);
    const schoolExpected=brute(data,p,o,true),result=PLANNER.calculateSchoolPlans(data,'s',{b:p},{...o,targetStage:1,ownedLimitsByBeast:{b:o.ownedLimits}});
    assert.equal(result.valid,schoolExpected!==null,'school feasible '+k+' '+JSON.stringify(result.errors));
    if(!result.valid)continue;
    for(const plan of result.plans){
      const t=plan.totals;assert.deepEqual([t.modifiedInvestedCount,t.pricedYuan,-t.unlockedEffects,t.overflowResearch,t.awakeningBlueprints],schoolExpected,'school '+k);
      const alternatives=PLANNER.equivalentPlansPage(data,plan,'0',10);
      assert.ok(alternatives);
    }
  }
});
test('conversion: joint school choices match exhaustive shared-blueprint pricing and all decoded alternatives',()=>{
  for(const stock of [0,2,6,20]){
    const data=fixture(),other={...data.beasts[0],id:'c',name:'C',effects:[{level:2,text:'C'}]};
    data.beasts.push(other);data.schools[0].beastIds.push('c');data.schools[0].stages[0].requiredTotalLevel=2;
    const progress={b:{fragments:1,inventory:{none:{8:1},initial:{7:1}}},c:{inventory:{none:{0:1}}}};
    const options={convertOwnedInventory:true,newRankMode:'zeroToSeven',referenceCostSettings:{awakeningBlueprintStock:stock}};
    const a=brute(data,progress.b,options,'rows'),b=brute({...data,beasts:[other]},progress.c,options,'rows'),expected={cost:null,effects:null};
    for(const left of a)for(const right of b){
      if(left.level+right.level!==2)continue;
      const m=left.m+right.m,B=left.B+right.B,cost=left.body+right.body+Math.max(0,B-stock)*7,effects=left.level+(right.level===2?1:0),overflow=left.overflow+right.overflow;
      for(const mode of ['cost','effects']){const score=mode==='cost'?[m,cost,-effects,overflow,B]:[m,-effects,cost,overflow,B];if(!expected[mode]||compare(score,expected[mode])<0)expected[mode]=score;}
    }
    const actual=PLANNER.calculateSchoolPlans(data,'s',progress,{...options,targetStage:1});assert.equal(actual.valid,true,JSON.stringify(actual.errors));
    for(const mode of ['cost','effects']){
      const plan=actual.plans.find(p=>p.kind===mode||p.kind==='merged'),t=plan.totals;
      const score=mode==='cost'?[t.modifiedInvestedCount,t.pricedYuan,-t.unlockedEffects,t.overflowResearch,t.awakeningBlueprints]:[t.modifiedInvestedCount,-t.unlockedEffects,t.pricedYuan,t.overflowResearch,t.awakeningBlueprints];
      assert.deepEqual(score,expected[mode],'joint '+stock+'/'+mode);
      let offset='0',seen=new Set();
      do{const page=PLANNER.equivalentPlansPage(data,plan,offset,50);for(const alternate of page.plans){
        const signature=JSON.stringify(alternate.beasts.map(b=>b.items));assert.ok(!seen.has(signature),'duplicate reconstructed combination');seen.add(signature);
        assert.equal(alternate.totals.pricedYuan,t.pricedYuan);assert.equal(alternate.totals.projectedTotalLevel,2);
      }offset=page.nextOffset;if(!page.hasMore)break;}while(true);
    }
  }
});
