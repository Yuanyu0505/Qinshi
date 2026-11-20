'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DATA=require('../data/machine-beasts.js'),CORE=require('../js/machine-beasts.js'),EQ=require('../js/machine-beast-equivalents.js');
test('fully covered shared stock compares overflow then blueprints without retaining fee-irrelevant tradeoffs',()=>{
  let peak=0;
  const sandbox={module:{exports:{}},require(name){return name==='./machine-beasts.js'?CORE:EQ;},observe(states){let count=0;states.forEach(frontier=>count+=frontier.length);peak=Math.max(peak,count);}};
  let source=fs.readFileSync(require.resolve('../js/machine-beast-school-planner.js'),'utf8');
  source=source.replace('return { defaultTargetStage:','return { testCombine:combine, defaultTargetStage:').replace('      states = next;','      states = next;observe(states);');
  vm.runInNewContext(source,sandbox);
  const sets=Array.from({length:12},(_,index)=>{
    const values=[];for(let gain=0;gain<=2;gain++)for(let b=gain?1:0;b<=(gain?8:0);b++)values.push({beastId:'war-demon',startLevel:0,endLevel:gain,modifiedInvestedCount:0,unlockedEffects:gain===2?1:0,overflowResearch:(9-b)*gain,stableKey:index+'/'+gain+'/'+b,items:[],resources:{pricedBodyYuan:0,awakeningBlueprints:b}});
    return values;
  });
  const settings=CORE.normalizeReferenceCostSettings(DATA,{awakeningBlueprintPrice:69.125,awakeningBlueprintStock:1000000000,useAwakeningBlueprintStock:true});
  for(const mixed of [false,true])for(const effects of [false,true]){
    const inputs=mixed?sets.map((cs,index)=>cs.concat({beastId:'war-demon',startLevel:0,endLevel:2,modifiedInvestedCount:0,unlockedEffects:1,overflowResearch:0,stableKey:'paid/'+index,items:[],resources:{pricedBodyYuan:1,awakeningBlueprints:0}})):sets;
    const result=sandbox.module.exports.testCombine(DATA,inputs,0,12,settings,effects);
    assert.equal(result.totals.projectedTotalLevel,12);assert.equal(result.totals.pricedYuan,0);assert.equal(result.totals.unlockedEffects,6);
    assert.equal(result.totals.overflowResearch,12);assert.equal(result.totals.awakeningBlueprints,48);
  }
  assert.ok(peak<=169,'at most one lexicographic prefix per gain/effect is needed when every cost is provably zero: '+peak);
});

test('a zero-fee witness at the stock cap does not make expensive prefixes free',()=>{
  const sandbox={module:{exports:{}},require:name=>name==='./machine-beasts.js'?CORE:EQ};
  const source=fs.readFileSync(require.resolve('../js/machine-beast-school-planner.js'),'utf8');
  vm.runInNewContext(source.replace('return { defaultTargetStage:','return { testCombine:combine, defaultTargetStage:'),sandbox);
  function candidate(key,b,o){
    return {beastId:'war-demon',startLevel:0,endLevel:1,modifiedInvestedCount:0,unlockedEffects:0,overflowResearch:o,stableKey:key,items:[],resources:{pricedBodyYuan:0,awakeningBlueprints:b}};
  }
  const sets=[[candidate('light',1,5),candidate('heavy',2,0)],[candidate('last',1,0)]];
  const settings=CORE.normalizeReferenceCostSettings(DATA,{awakeningBlueprintPrice:7,awakeningBlueprintStock:2,useAwakeningBlueprintStock:true});
  for(const mode of [false,true]){
    const result=sandbox.module.exports.testCombine(DATA,sets,0,2,settings,mode);
    assert.ok(result);
    assert.equal(result.totals.pricedYuan,0);
    assert.equal(result.totals.overflowResearch,5);
    assert.equal(result.totals.awakeningBlueprints,2);
  }
});
