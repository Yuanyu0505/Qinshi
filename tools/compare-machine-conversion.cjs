'use strict';
// Reproducible diagnostic against a Git baseline; never loads personal data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),revision=process.argv[2]||'a44fda3';
function load(baseline){
  const source=baseline?execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',revision+':js/machine-beasts.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'js/machine-beasts.js'),'utf8');
  const context={module:{exports:{}}};vm.runInNewContext(source,context);const core=context.module.exports;
  context.module={exports:{}};context.require=name=>name==='./machine-beasts.js'?core:require(path.join(root,'js',name));
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/machine-beast-school-planner.js'),'utf8'),context);
  return {core,planner:context.module.exports};
}
const before=load(true),after=load(false);let seed=1142,singles=0,schools=0,frontiers=0,pages=0;
const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;};
function same(a,b,label){assert.equal(JSON.stringify(a),JSON.stringify(b),label);}
for(let iteration=0;iteration<180;iteration++){
  const quality=iteration%4===0?'purple':'orange',modifications=[{id:'none'},{id:'initial'}];
  const beast={id:'a',name:'A',schoolId:'s',quality,tier:quality==='orange'?'橙一':'紫色',maxLevel:3,maxRank:8,fragmentsPerBody:4,contributionPerFragment:3,effects:[{level:1,text:'A'},{level:2,text:'B'}]};
  const data={beasts:[beast,{...beast,id:'b',name:'B'}],schools:[{id:'s',name:'S',beastIds:['a','b'],stages:[{stage:1,requiredTotalLevel:1+random(5)}]}],modifications,researchThresholds:{0:0,1:3,2:7,3:12},researchValues:{[quality]:Object.fromEntries(Array.from({length:9},(_,rank)=>[rank,{none:1+random(8),initial:1+random(8)}]))},resourceRules:{blueprintDivisor:3,organPieceDivisor:2},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3,orangeFiveBodyPrice:45}};
  const progress=Object.fromEntries(['a','b'].map(id=>[id,{research:random(3),fragments:random(7),showMods:true,showHighRanks:true,inventory:{none:{0:random(3),8:random(2)},initial:{0:random(2),8:random(2)}}}]));
  const options={convertOwnedInventory:true,targetLevel:1+random(3),targetStage:1,newRankMode:iteration%2?'zero':'zeroToSeven',allowNewModifications:iteration%3===0,allowNewHighRanks:iteration%5===0,useOwnedInventory:iteration%7!==0,bluePurpleInventoryOnly:iteration%3!==1,ownedLimits:{initial:{8:iteration%2}},ownedLimitsByBeast:{a:{initial:{8:iteration%2}}},referenceCostSettings:{awakeningBlueprintStock:random(8)}};
  for(const b of data.beasts){
    same(before.core.calculateInvestmentPlan(data,b,progress[b.id],options),after.core.calculateInvestmentPlan(data,b,progress[b.id],options),'single '+iteration+' '+b.id);singles++;
    const p=before.core.normalizeBeastProgress(b,progress[b.id],data);
    same(before.core.conversionCandidates(data,b,p,options,12-p.research,true),after.core.conversionCandidates(data,b,p,options,12-p.research,true),'full frontier '+iteration+' '+b.id);frontiers++;
  }
  const a=before.planner.calculateSchoolPlans(data,'s',progress,options),b=after.planner.calculateSchoolPlans(data,'s',progress,options);
  same(a,b,'school '+iteration);schools++;
  if(a.valid)for(let index=0;index<a.plans.length;index++){
    const count=BigInt(a.plans[index].equivalents.count),last=count>4n?String(count-4n):'0';
    for(const offset of new Set(['0',last])){
      same(before.planner.equivalentPlansPage(data,a.plans[index],offset,3),after.planner.equivalentPlansPage(data,b.plans[index],offset,3),'page '+iteration+' '+index+' '+offset);pages++;
    }
  }
}
console.log(JSON.stringify({baseline:revision,seed:1142,singles,schools,frontiers,pages,comparison:'entire JSON including stable order, allocations, equivalent counts and first/last pages',result:'identical'}));
