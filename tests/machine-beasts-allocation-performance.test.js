'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../js/machine-beasts.js');
function fixture(){
  const beast={id:'b',name:'B',quality:'orange',maxLevel:3,maxRank:2,fragmentsPerBody:4,contributionPerFragment:3,effects:[]};
  return {beasts:[beast],modifications:[{id:'none'},{id:'initial'}],researchThresholds:{0:0,1:7,2:11,3:19},researchValues:{orange:{0:{none:3,initial:4},1:{none:5,initial:7},2:{none:6,initial:8}}},resourceRules:{blueprintDivisor:5,organPieceDivisor:3},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3}};
}
test('dominated conversion transitions do not allocate discarded quantity vectors',()=>{
  let measured;
  const data=fixture();
  const result=core.conversionCandidates(data,data.beasts[0],core.normalizeBeastProgress(data.beasts[0],{},data),{newRankMode:'zeroToSeven',allowNewModifications:true,onDiagnostic(event){if(event.phase==='conversion-complete')measured=event;}},19,true);
  assert.ok(result.length>0);assert.ok(measured.accepted>0);assert.ok(measured.rejected>0);
  assert.ok(measured.decodedVectors>0&&measured.decodedVectors<measured.accepted,'decode full vectors only for final representatives, not each accepted/rejected transition');
});

test('single-beast search never expands beyond a feasible base-body incumbent',()=>{
  let maximumCount=0;
  const data=fixture();
  const result=core.conversionCandidates(data,data.beasts[0],core.normalizeBeastProgress(data.beasts[0],{},data),{newRankMode:'zeroToSeven',allowNewModifications:true,onDiagnostic(event){maximumCount=Math.max(maximumCount,event.maximumBodies);}},19,true,true);
  assert.ok(result.some(candidate=>candidate.research>=19));
  // Three rank-2 initial forms provide 24 research with three base bodies.
  assert.ok(maximumCount<=3,`expanded ${maximumCount} bodies despite a feasible three-body plan`);
});

test('single-beast count bound includes bounded original and processed mixtures',()=>{
  let maximumCount=0;
  const data=fixture();
  const progress=core.normalizeBeastProgress(data.beasts[0],{inventory:{initial:{2:2}}},data);
  const result=core.conversionCandidates(data,data.beasts[0],progress,{newRankMode:'zeroToSeven',allowNewModifications:false,onDiagnostic(event){maximumCount=Math.max(maximumCount,event.maximumBodies);}},19,true,true);
  assert.ok(result.some(candidate=>candidate.research>=19));
  // Two preserved modified originals (8 each) + one processed plain form (6).
  assert.ok(maximumCount<=3,`expanded ${maximumCount} bodies despite a feasible mixed three-body plan`);
});
