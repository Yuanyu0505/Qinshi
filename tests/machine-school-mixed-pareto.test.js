'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const file=require.resolve('../js/machine-beast-school-planner.js');
const sandbox={module:{exports:{}},require:name=>require(require.resolve('../js/'+name.slice(2)))};
vm.runInNewContext(fs.readFileSync(file,'utf8').replace('return { defaultTargetStage:', 'return { mixedFrontier: mixedFrontier, defaultTargetStage:'),sandbox);
const sweep=sandbox.module.exports.mixedFrontier;
test('mixed frontier exactly matches pairwise dominance and insertion order, including stable ties',()=>{
  let seed=155;const rand=n=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>8)%n;
  function dominates(a,b){
    const x=[a.body,a.blueprints,-a.effects,a.overflow], y=[b.body,b.blueprints,-b.effects,b.overflow];
    return x.every((v,i)=>v<=y[i])&&(x.some((v,i)=>v<y[i])||a.key<=b.key);
  }
  for(let run=0;run<80;run++){
    const rows=Array.from({length:300},(_,i)=>({body:rand(18),blueprints:rand(40),effects:rand(5),overflow:rand(21),key:String(rand(7)),i}));
    const expected=[];
    for(const row of rows){
      if(expected.some(old=>dominates(old,row)))continue;
      for(let i=expected.length-1;i>=0;i--)if(dominates(row,expected[i]))expected.splice(i,1);
      expected.push(row);
    }
    assert.deepEqual(Array.from(sweep(rows,null),r=>r.i),expected.map(r=>r.i));
  }
});
