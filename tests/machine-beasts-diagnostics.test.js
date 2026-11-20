'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const CORE=require('../js/machine-beasts.js');
const PLANNER=require('../js/machine-beast-school-planner.js');
function fixture(){
  const beast={id:'one',name:'One',quality:'orange',maxLevel:1,maxRank:1,fragmentsPerBody:4,effects:[]};
  const data={modifications:[{id:'none',name:'0改'}],researchThresholds:{0:0,1:257},researchValues:{orange:{0:{none:1},1:{none:1}}},resourceRules:{blueprintDivisor:500,organPieceDivisor:100}};
  const progress={research:0,fragments:0,inventory:{none:{}},showMods:false};
  return {beast,data,progress,options:{convertOwnedInventory:true,newRankMode:'zeroToSeven'}};
}
test('opt-in diagnostics measure actual frontier transitions without changing candidate JSON',()=>{
  const f=fixture(),events=[];
  const plain=CORE.conversionCandidates(f.data,f.beast,f.progress,f.options,257,true);
  const measured=CORE.conversionCandidates(f.data,f.beast,f.progress,{...f.options,onDiagnostic:event=>events.push(event)},257,true);
  assert.deepEqual(measured,plain);
  const event=events.find(e=>e.phase==='conversion-complete');
  assert.ok(event,'a completed solve must report its measured counters');
  assert.equal(event.beastId,'one');assert.equal(event.typeCount,2);assert.equal(event.researchGcd,1);
  assert.ok(event.attempted>0);assert.ok(event.accepted>0);assert.equal(event.attempted,event.accepted+event.rejected);
  assert.ok(event.peakStates>=1);assert.ok(event.elapsedMs>=0);assert.ok(event.allocations>0);
});
test('school phase reports follow real solver boundaries without changing the exact result',()=>{
  const f=fixture(),phases=[];f.beast.contributionPerFragment=3;
  f.data.beasts=[f.beast];f.data.schools=[{id:'s',name:'S',beastIds:['one'],stages:[{stage:1,requiredTotalLevel:1}]}];
  const plain=PLANNER.calculateSchoolPlans(f.data,'s',{one:f.progress},{...f.options,targetStage:1});
  const measured=PLANNER.calculateSchoolPlans(f.data,'s',{one:f.progress},{...f.options,targetStage:1,onPhase:phase=>phases.push(phase)});
  assert.equal(measured.valid,true,JSON.stringify(measured.errors));assert.deepEqual(measured,plain);
  assert.deepEqual(phases,['candidate-preparation','school-combine','equivalent-graph']);
});
test('large repeated counts preserve exact reconstruction and stable lexicographic ties',()=>{
  const f=fixture(),rows=CORE.conversionCandidates(f.data,f.beast,f.progress,f.options,257,true);
  const row=rows.find(row=>row.research===257);
  assert.equal(row.rawItems.length,1);assert.equal(row.rawItems[0].rank,1);assert.equal(row.rawItems[0].count,257);
  assert.equal(row.stable,'00000000000000000000000000000257');
});
