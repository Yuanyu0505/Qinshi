'use strict';
// Reproducible diagnostic against a Git baseline; never loads personal data.
const assert=require('node:assert/strict');
const {load}=require('./machine-baseline-loader.cjs');
const revision=process.argv[2]||'d667c2b';
const allowAllocationFix=process.argv.includes('--allow-1149-allocation-fix');
// Correct only the independently reproduced stock-cap defect in the reference,
// so that the performance changes are still checked against the old solver.
const stockRule='zeroTotalFee=bestFee===0&&(price===0||hi<=stock);';
const before=load(revision),reference=load(revision,(file,source)=>{
  if(file!=='js/machine-beast-school-planner.js')return source;
  if(!source.includes(stockRule))return source;
  return source.replace(stockRule,'zeroTotalFee=bestFee===0&&(price===0||freeSets.reduce(function(n,cs){return sumSafe(n,Math.max.apply(null,cs.map(function(c){return c.resources.awakeningBlueprints;})));},0)<=stock);');
}),after=load();
let seed=1147,singles=0,schools=0,frontiers=0,pages=0;
const oldStockDefects=[];
const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
function comparable(value){
  if(Array.isArray(value))return value.map(comparable);
  if(!value||typeof value!=='object')return value;
  const ledger=value.modificationCores, conversion=value.inventoryConversion;
  if(ledger){
    assert.equal(ledger.looseOwned+ledger.returned+ledger.externalDeficit,ledger.spent+ledger.remaining);
    assert.equal(ledger.reused,Math.min(ledger.spent,ledger.looseOwned+ledger.returned));
  }
  if(conversion){
    assert.equal(conversion.sources.reduce((n,s)=>n+s.returnedCores,0),conversion.modificationCores.returned);
    assert.equal(conversion.sources.reduce((n,s)=>n+s.usedBaseBodies,0),conversion.usedBaseBodies);
    assert.equal(conversion.sources.reduce((n,s)=>n+s.remainingBaseBodies,0),conversion.remainingBaseBodies);
    assert.ok(conversion.sources.every(s=>s.usedBaseBodies+s.remainingBaseBodies===s.baseBodies));
  }
  // 1.1.49 intentionally changed which original items fund identical final
  // investments and the owned/new split of mixed modified outputs.
  const omitted=new Set(['unused','inventoryConversion','modificationCores','ownedModified','newModified','ownedModifiedInvestedCount','newModifiedInvestedCount']);
  return Object.fromEntries(Object.entries(value).filter(([key])=>!omitted.has(key)).map(([key,entry])=>[key,comparable(entry)]));
}
function same(a,b,label){assert.equal(JSON.stringify(allowAllocationFix?comparable(a):a),JSON.stringify(allowAllocationFix?comparable(b):b),label);}
for(let iteration=0;iteration<180;iteration++){
  const quality=iteration%4===0?'purple':'orange',modifications=['none','initial','heaven','immortal','saint','fullDivine'].map(id=>({id}));
  const beast={id:'a',name:'A',schoolId:'s',quality,tier:quality==='orange'?'橙一':'紫色',maxLevel:3,maxRank:8,fragmentsPerBody:4,contributionPerFragment:3,effects:[{level:1,text:'A'},{level:2,text:'B'}]};
  const data={beasts:[beast,{...beast,id:'b',name:'B'}],schools:[{id:'s',name:'S',beastIds:['a','b'],stages:[{stage:1,requiredTotalLevel:1+random(5)}]}],modifications,researchThresholds:{0:0,1:3,2:7,3:12},researchValues:{[quality]:Object.fromEntries(Array.from({length:9},(_,rank)=>[rank,Object.fromEntries(modifications.map(mod=>[mod.id,1+random(8)]))]))},resourceRules:{blueprintDivisor:3,organPieceDivisor:2},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3,orangeFiveBodyPrice:45}};
  const progress=Object.fromEntries(['a','b'].map(id=>[id,{research:random(3),fragments:random(7),showMods:true,showHighRanks:true,inventory:{none:{0:random(3),8:random(2)},initial:{0:random(2),8:random(2)},fullDivine:{0:random(2)}}}]));
  const options={convertOwnedInventory:true,targetLevel:1+random(3),targetStage:1,newRankMode:iteration%2?'zero':'zeroToSeven',allowNewModifications:iteration%3===0,allowNewHighRanks:iteration%5===0,useOwnedInventory:iteration%7!==0,bluePurpleInventoryOnly:iteration%3!==1,ownedLooseCores:iteration%2?40:0,ownedLooseCoresByBeast:{a:iteration%2?55:0,b:iteration%3?0:145},ownedLimits:{initial:{8:iteration%2}},ownedLimitsByBeast:{a:{initial:{8:iteration%2},fullDivine:{0:iteration%2}},b:{none:{0:iteration%3}}},referenceCostSettings:{awakeningBlueprintStock:random(8),awakeningBlueprintPrice:iteration%2?1.1:7}};
  for(const b of data.beasts){
    same(before.core.calculateInvestmentPlan(data,b,progress[b.id],options),after.core.calculateInvestmentPlan(data,b,progress[b.id],options),'single '+iteration+' '+b.id);singles++;
    const p=before.core.normalizeBeastProgress(b,progress[b.id],data);
    for(const frontierMode of [false,true]){
      same(before.core.conversionCandidates(data,b,p,options,12-p.research,frontierMode),after.core.conversionCandidates(data,b,p,options,12-p.research,frontierMode),'full frontier '+iteration+' '+b.id+' '+frontierMode);frontiers++;
    }
  }
  const original=before.planner.calculateSchoolPlans(data,'s',progress,options);
  const a=reference.planner.calculateSchoolPlans(data,'s',progress,options),b=after.planner.calculateSchoolPlans(data,'s',progress,options);
  if(JSON.stringify(original)!==JSON.stringify(a))oldStockDefects.push({iteration,oldValid:original.valid,correctedValid:a.valid});
  same(a,b,'school '+iteration);schools++;
  if(a.valid)for(let index=0;index<a.plans.length;index++){
    const count=BigInt(a.plans[index].equivalents.count),last=count>4n?String(count-4n):'0';
    // Exhaust all small-domain pages, and always exercise a trailing offset.
    assert.ok(count<=10000n,'Unexpected small-domain equivalent explosion');
    const offsets=new Set(['0',last]);for(let offset=0n;offset<count;offset+=3n)offsets.add(String(offset));
    for(const offset of offsets){
      same(before.planner.equivalentPlansPage(data,a.plans[index],offset,3),after.planner.equivalentPlansPage(data,b.plans[index],offset,3),'page '+iteration+' '+index+' '+offset);pages++;
    }
  }
}
console.log(JSON.stringify({baseline:revision,seed:1147,singles,schools,frontiers,pages,oldStockDefects,comparison:allowAllocationFix?'unchanged plans and every bounded page; corrected 1.1.49 allocation fields checked for resource conservation':'entire JSON including every bounded page against baseline with only the verified stock-cap defect corrected',result:'identical'}));
