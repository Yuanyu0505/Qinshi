'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const beast={id:'b',name:'B',quality:'orange',maxLevel:3,maxRank:2,fragmentsPerBody:4,contributionPerFragment:3,effects:[]};
  return {beasts:[beast],modifications:[{id:'none'},{id:'initial'}],researchThresholds:{0:0,1:7,2:11,3:19},researchValues:{orange:{0:{none:3,initial:4},1:{none:5,initial:7},2:{none:6,initial:8}}},resourceRules:{blueprintDivisor:5,organPieceDivisor:3},referenceCostRules:{blueprintPrice:7,contributionPerYuan:3}};
}
test('dominated conversion transitions do not allocate discarded quantity vectors',()=>{
  let clones=0,accepted=0;
  let source=fs.readFileSync(require.resolve('../js/machine-beasts.js'),'utf8');
  source=source.replace('from.counts.slice()','cloneCounts(from.counts)').replace('bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});','accepted();bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});');
  const sandbox={module:{exports:{}},cloneCounts(counts){clones++;return counts.slice();},accepted(){accepted++;}};
  vm.runInNewContext(source,sandbox);
  const data=fixture(),core=sandbox.module.exports;
  const result=core.conversionCandidates(data,data.beasts[0],core.normalizeBeastProgress(data.beasts[0],{},data),{newRankMode:'zeroToSeven',allowNewModifications:true},19,true);
  assert.ok(result.length>0);assert.ok(accepted>0);
  assert.equal(clones,accepted,'a rejected transition must not clone a quantity vector');
});

test('single-beast search never expands beyond a feasible base-body incumbent',()=>{
  let maximumCount=0;
  let source=fs.readFileSync(require.resolve('../js/machine-beasts.js'),'utf8');
  source=source.replace('bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});','accepted(n);bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});');
  const sandbox={module:{exports:{}},accepted(n){maximumCount=Math.max(maximumCount,n);}};
  vm.runInNewContext(source,sandbox);
  const data=fixture(),core=sandbox.module.exports;
  const result=core.conversionCandidates(data,data.beasts[0],core.normalizeBeastProgress(data.beasts[0],{},data),{newRankMode:'zeroToSeven',allowNewModifications:true},19,true,true);
  assert.ok(result.some(candidate=>candidate.research>=19));
  // Three rank-2 initial forms provide 24 research with three base bodies.
  assert.ok(maximumCount<=3,`expanded ${maximumCount} bodies despite a feasible three-body plan`);
});

test('single-beast count bound includes bounded original and processed mixtures',()=>{
  let maximumCount=0;
  let source=fs.readFileSync(require.resolve('../js/machine-beasts.js'),'utf8');
  source=source.replace('bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});','accepted(n);bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});');
  const sandbox={module:{exports:{}},accepted(n){maximumCount=Math.max(maximumCount,n);}};
  vm.runInNewContext(source,sandbox);
  const data=fixture(),core=sandbox.module.exports;
  const progress=core.normalizeBeastProgress(data.beasts[0],{inventory:{initial:{2:2}}},data);
  const result=core.conversionCandidates(data,data.beasts[0],progress,{newRankMode:'zeroToSeven',allowNewModifications:false},19,true,true);
  assert.ok(result.some(candidate=>candidate.research>=19));
  // Two preserved modified originals (8 each) + one processed plain form (6).
  assert.ok(maximumCount<=3,`expanded ${maximumCount} bodies despite a feasible mixed three-body plan`);
});
