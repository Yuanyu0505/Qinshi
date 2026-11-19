'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const DATA=require('../data/machine-beasts.js');
const CORE=require('./machine-beasts.js');
const PLANNER=require('./machine-beast-school-planner.js');

function fixture(rank=8, modification='none') {
  const beast={id:'b',name:'B',schoolId:'s',quality:'orange',tier:'橙一',maxLevel:2,maxRank:10,fragmentsPerBody:4,contributionPerFragment:3,effects:[{level:1,text:'A'}]};
  const modifications=['none','initial','heaven','fullDivine'].map(id=>({id}));
  const values=Object.fromEntries(Array.from({length:11},(_,r)=>[r,Object.fromEntries(modifications.map(m=>[m.id,r===rank&&m.id===modification?10:3]))]));
  return {beasts:[beast],schools:[{id:'s',name:'S',beastIds:['b'],stages:[{stage:1,requiredTotalLevel:1}]}],modifications,researchThresholds:{0:0,1:10,2:11},researchValues:{orange:values},resourceRules:{blueprintDivisor:10,organPieceDivisor:10},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3}};
}

test('highrank: original remains legal while returned cores can produce a lower-overflow optimum',()=>{
  const beast=DATA.beasts.find(b=>b.id==='red-serpent');
  for(const mode of ['zero','zeroToSeven']){
    const result=CORE.calculateInvestmentPlan(DATA,beast,{showHighRanks:true,showMods:true,inventory:{fullDivine:{8:1}}},{targetLevel:10,newRankMode:mode,convertOwnedInventory:true,allowNewHighRanks:false});
    console.log('red-serpent',mode,JSON.stringify({valid:result.valid,newBodies:result.totals?.newInvestedCount,invested:result.totals?.investedCount,items:result.selected?.ownedItems,conversion:result.inventoryConversion}));
    assert.equal(result.valid,true);
    assert.deepEqual([result.totals.newInvestedCount,result.totals.investedCount],[0,2],mode);
    assert.equal(result.modificationCores.returned,145);assert.equal(result.modificationCores.spent,130);assert.equal(result.modificationCores.remaining,15);
    const progress=CORE.normalizeBeastProgress(beast,{showHighRanks:true,showMods:true,inventory:{fullDivine:{8:1}}},DATA);
    assert.ok(CORE.conversionMaterials(DATA,beast,progress,{newRankMode:mode}).types.some(item=>item.source==='owned'&&item.rank===8&&item.modificationId==='fullDivine'));
  }
});

test('highrank: exact-school original remains feasible independently of processing rank limits',()=>{
  const data=fixture();
  for(const mode of ['zero','zeroToSeven']){
    const result=PLANNER.calculateSchoolPlans(data,'s',{b:{inventory:{none:{8:1}}}},{targetStage:1,newRankMode:mode,convertOwnedInventory:true,allowNewHighRanks:false});
    console.log('exact-school',mode,JSON.stringify({valid:result.valid,errors:result.errors,totals:result.plans?.[0]?.totals,items:result.plans?.[0]?.beasts[0]?.items}));
    assert.equal(result.valid,true,mode+' '+JSON.stringify(result.errors));
    assert.equal(result.plans[0].totals.newInvestedCount,0);
    assert.equal(result.plans[0].beasts[0].addedResearch,10);
  }
});

// This catches both the old mode filter and accidentally stripping modification
// from an unchanged input when creation of that modification is disabled.
test('highrank: 96 rank/modification/mode/high-rank/modification-switch cases keep originals',()=>{
  let cases=0;
  for(const rank of [8,9,10])for(const mod of ['none','initial','heaven','fullDivine'])
  for(const mode of ['zero','zeroToSeven'])for(const high of [false,true])for(const mods of [false,true]){
    const data=fixture(rank,mod),beast=data.beasts[0],progress={inventory:{[mod]:{[rank]:1}}};
    const options={targetLevel:1,targetStage:1,newRankMode:mode,allowNewHighRanks:high,allowNewModifications:mods,convertOwnedInventory:true};
    const single=CORE.calculateInvestmentPlan(data,beast,progress,options);
    assert.equal(single.valid,true);
    assert.equal(single.totals.newInvestedCount,0);
    // Unlike school, single may legally overshoot: four plain inputs provide
    // 12 research and beat the eight-base-body rank-ten original on investment.
    assert.equal(single.totals.investedCount,Math.min(4,2**(rank-7)));
    if(rank<10){
      assert.deepEqual(single.selected.ownedItems.map(i=>[i.rank,i.modificationId,i.count]),[[rank,mod,1]]);
      assert.equal(single.inventoryConversion.sources.length,0);
    }else assert.equal(single.totals.overflow,2);
    const school=PLANNER.calculateSchoolPlans(data,'s',{b:progress},options);
    assert.equal(school.valid,true,JSON.stringify({rank,mod,mode,high,mods,errors:school.errors}));
    assert.equal(school.plans[0].beasts[0].addedResearch,10);
    assert.equal(school.plans[0].totals.newInvestedCount,0);
    assert.deepEqual(school.plans[0].beasts[0].items.map(i=>[i.rank,i.modificationId,i.count]),[[rank,mod,1]]);
    cases++;
  }
  assert.equal(cases,96);
});

// Check physical source counts independently of the allocator's baseCount.
function assertConserved(result,inventory,limits) {
  const originalUsed=new Map(),weight=r=>r>7?2**(r-7):1;
  const add=(rank,mod,count)=>{const key=mod+'/'+rank;originalUsed.set(key,(originalUsed.get(key)||0)+count);};
  for(const item of result.items)if(item.source==='owned'&&!item.converted)add(item.rank,item.modificationId,item.count);
  let supplied=0;
  for(const source of result.inventoryConversion.sources){
    add(source.rank,source.modificationId,source.count);
    supplied+=source.count*weight(source.rank);
  }
  for(const [key,count]of originalUsed){
    const [mod,rank]=key.split('/');
    assert.ok(count<=Math.min(inventory[mod]?.[rank]||0,limits?.[mod]?.[rank]??Infinity),'overused '+key);
    assert.ok(count>=0);
  }
  assert.equal(supplied,result.inventoryConversion.usedBaseBodies+result.inventoryConversion.remainingBaseBodies);
  const recorded=Object.entries(inventory).reduce((n,[mod,ranks])=>n+Object.entries(ranks).reduce((a,[r,q])=>a+q*weight(Number(r)),0),0);
  const unused=result.unused.reduce((n,i)=>n+i.count*weight(i.rank),0);
  const spent=result.items.reduce((n,i)=>n+(i.source==='owned'?i.count*weight(i.rank):i.ownedBaseBodies||0),0);
  assert.equal(spent+unused,recorded);
  assert.equal(result.invested,result.owned+result.newCount);
  assert.equal(result.owned,spent);
  assert.ok(result.unused.every(i=>i.count>=0));
}

test('highrank: bounded originals and partial dismantling share one physical pool with zero-modification output',()=>{
  let cases=0;
  for(const rank of [8,9,10])for(const mod of ['none','initial','heaven','fullDivine'])
  for(const count of [1,3])for(const limit of [0,1,3]){
    const data=fixture(rank,mod),beast=data.beasts[0],inventory={[mod]:{[rank]:count}},limits={[mod]:{[rank]:limit}};
    const progress=CORE.normalizeBeastProgress(beast,{inventory},data);
    const domain=CORE.conversionMaterials(data,beast,progress,{newRankMode:'zeroToSeven',allowNewModifications:false,ownedLimits:limits});
    const available=Math.min(count,limit),weight=2**(rank-7);
    assert.equal(domain.pool.baseCount,available*weight);
    for(let original=0;original<=available;original++)for(let processed=0;processed<=weight+1;processed++){
      const raw=[];
      if(original)raw.push({source:'owned',rank,modificationId:mod,count:original,researchEach:10,sevenRankEquivalent:weight});
      if(processed)raw.push({source:'new',rank:0,modificationId:'none',count:processed,researchEach:3,sevenRankEquivalent:1});
      const allocation=CORE.allocateConvertedInventory(data,beast,domain.pool,raw);
      assert.equal(allocation.newCount,Math.max(0,original*weight+processed-available*weight));
      assertConserved(allocation,inventory,limits);
      assert.ok(allocation.items.filter(i=>i.converted).every(i=>i.modificationId==='none'));
      if(available===1&&original===0&&processed===1){
        assert.equal(allocation.inventoryConversion.remainingBaseBodies,weight-1);
        assert.ok(!allocation.unused.some(i=>i.rank===rank&&i.count>count-available));
      }
      cases++;
    }
    const excluded=CORE.conversionMaterials(data,beast,progress,{newRankMode:'zeroToSeven',useOwnedInventory:false});
    assert.equal(excluded.pool.baseCount,0);
    assert.ok(excluded.types.every(i=>i.source==='new'));
  }
  console.log('independent physical allocation cases',cases);
});

test('highrank: disabled or zero-limited originals cannot solve exact school and do not mutate stock',()=>{
  const data=fixture(),progress={inventory:{none:{8:3}}},before=JSON.stringify(progress);
  for(const option of [{useOwnedInventory:false},{ownedLimitsByBeast:{b:{none:{8:0}}}}]){
    const result=PLANNER.calculateSchoolPlans(data,'s',{b:progress},{targetStage:1,newRankMode:'zeroToSeven',convertOwnedInventory:true,...option});
    assert.equal(result.valid,false);
  }
  assert.equal(JSON.stringify(progress),before);
});

test('highrank: independently enumerated bounded physical combinations equal every paginated equivalent',()=>{
  let scenarios=0;
  for(const eight of [0,1,2])for(const nine of [0,1,2])for(const ten of [0,1,2]){
    const data=fixture();
    data.researchThresholds={0:0,1:20,2:21};
    for(const rank of [8,9,10])data.researchValues.orange[rank].none=10;
    const inventory={none:{8:2,9:2,10:2}},limits={none:{8:eight,9:nine,10:ten}};
    const expected=new Set();
    // Independent exhaustive quantity vectors: every lower-rank input has 3
    // research, so 20 can only be two unchanged high-rank originals.
    for(let a=0;a<=eight;a++)for(let b=0;b<=nine;b++)for(let c=0;c<=ten;c++){
      if(a+b+c===2)expected.add(JSON.stringify([a,b,c]));
    }
    const result=PLANNER.calculateSchoolPlans(data,'s',{b:{inventory}},{targetStage:1,newRankMode:'zeroToSeven',allowNewHighRanks:false,convertOwnedInventory:true,ownedLimitsByBeast:{b:limits}});
    assert.equal(result.valid,expected.size>0,JSON.stringify({eight,nine,ten,errors:result.errors}));
    if(!result.valid)continue;
    for(const plan of result.plans){
      assert.equal(plan.equivalents.count,String(expected.size));
      const seen=new Set();
      const inspect=detail=>{
        const counts=[8,9,10].map(rank=>detail.items.filter(i=>i.rank===rank).reduce((n,i)=>n+i.count,0));
        const key=JSON.stringify(counts);
        assert.ok(expected.has(key),'unexpected quantity vector '+key);
        assert.ok(!seen.has(key),'duplicate quantity vector '+key);
        seen.add(key);
        // Detail intentionally lacks unused stock; decode conservation is
        // checked from independent source caps and unchanged-item consumption.
        assert.ok(detail.items.every(i=>i.source==='owned'&&!i.converted&&i.modificationId==='none'));
        assert.equal(detail.newInvestedCount,0);
        assert.equal(detail.inventoryConversion.sources.length,0);
        assert.equal(detail.resources.awakeningBlueprints,2);
        assert.equal(detail.resources.organPieces,2);
      };
      inspect(plan.beasts[0]);
      let offset='0';
      for(let pageIndex=0;pageIndex<10;pageIndex++){
        const page=PLANNER.equivalentPlansPage(data,plan,offset,1);
        for(const alternate of page.plans){
          assert.equal(alternate.totals.pricedYuan,14);
          assert.equal(alternate.totals.projectedTotalLevel,1);
          inspect(alternate.beasts[0]);
        }
        if(!page.hasMore)break;
        assert.notEqual(page.nextOffset,offset);
        offset=page.nextOffset;
        assert.ok(pageIndex<9,'pagination did not terminate');
      }
      assert.deepEqual(seen,expected);
    }
    scenarios++;
  }
  console.log('independent highrank equivalence scenarios',scenarios);
});

test('highrank: every tied original-plus-processed page respects origin caps and dismantled remainder',()=>{
  for(const selected of [[1,1],[1,0],[0,1]]){
    const data=fixture();
    data.researchThresholds={0:0,1:13,2:14};
    data.researchValues.orange[9].none=10;
    const inventory={none:{8:1,9:1},fullDivine:{10:1}};
    const limits={none:{8:selected[0],9:selected[1]}};
    const result=PLANNER.calculateSchoolPlans(data,'s',{b:{inventory}},{targetStage:1,newRankMode:'zeroToSeven',allowNewModifications:false,convertOwnedInventory:true,ownedLimitsByBeast:{b:limits}});
    assert.equal(result.valid,true,JSON.stringify(result.errors));
    const expected=new Set();
    // Independent physical enumeration: the exact sum 13 requires one selected
    // high-rank plain original (10) plus one of eight processed plain ranks (3).
    for(const rank of [8,9])if(limits.none[rank])for(let processed=0;processed<=7;processed++)expected.add(rank+'/'+processed);
    for(const plan of result.plans){
      assert.equal(plan.equivalents.count,String(expected.size));
      const seen=new Set();
      const inspect=detail=>{
        const original=detail.items.find(i=>!i.converted),processed=detail.items.find(i=>i.converted);
        assert.ok(original&&processed);
        assert.equal(original.source,'owned');assert.equal(processed.source,'owned');
        assert.equal(original.count,1);assert.equal(processed.count,1);
        assert.equal(processed.modificationId,'none');
        const key=original.rank+'/'+processed.rank;
        assert.ok(expected.has(key),key);assert.ok(!seen.has(key),'duplicate '+key);seen.add(key);
        const used=new Map([[original.modificationId+'/'+original.rank,1]]);
        let supplied=0;
        for(const source of detail.inventoryConversion.sources){
          const originKey=source.modificationId+'/'+source.rank;
          used.set(originKey,(used.get(originKey)||0)+source.count);
          supplied+=source.count*2**(source.rank-7);
        }
        for(const [originKey,count]of used){
          const [mod,rank]=originKey.split('/');
          assert.ok(count<=Math.min(inventory[mod][rank],limits[mod]?.[rank]??Infinity),'origin reused '+originKey);
        }
        assert.equal(detail.inventoryConversion.usedBaseBodies,1);
        assert.equal(detail.inventoryConversion.remainingBaseBodies,supplied-1);
        assert.equal(detail.newInvestedCount,0);
        assert.equal(detail.resources.awakeningBlueprints,2);
        assert.equal(detail.resources.organPieces,2);
      };
      inspect(plan.beasts[0]);
      let offset='0',pageCount=0;
      while(true){
        const page=PLANNER.equivalentPlansPage(data,plan,offset,2);
        for(const alternate of page.plans){
          assert.equal(alternate.totals.pricedYuan,14);
          assert.equal(alternate.totals.modifiedInvestedCount,0);
          inspect(alternate.beasts[0]);
        }
        if(!page.hasMore)break;
        assert.notEqual(page.nextOffset,offset);offset=page.nextOffset;
        assert.ok(++pageCount<20,'pagination did not terminate');
      }
      assert.deepEqual(seen,expected);
    }
  }
});
