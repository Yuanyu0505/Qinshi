'use strict';
// User-run only. Tests fixture coverage; does not launch expensive diagnostics.
const {test}=require('node:test'),assert=require('node:assert/strict');
const benchmark=require('../tools/benchmark-machine-school.cjs');
const data=require('../data/machine-beasts.js');
test('school pressure matrix spans both schools, exact stages, modifications, stock and decimal prices',()=>{
  const specs=benchmark.specifications(true);
  assert.equal(specs.length,48);assert.equal(new Set(specs.map(spec=>spec.id)).size,48);
  assert.deepEqual([...new Set(specs.map(spec=>spec.schoolId))],['hegemonic','nonAttack']);
  assert.deepEqual([...new Set(specs.map(spec=>spec.stage))],[3,5]);
  assert.deepEqual([...new Set(specs.map(spec=>spec.stock))],['zero','sufficient','boundary']);
  assert.deepEqual([...new Set(specs.map(spec=>spec.price))],[70,69.125]);
  for(const spec of specs){
    const input=benchmark.buildInput(spec);
    assert.equal(input.school.beastIds.length,spec.schoolId==='hegemonic'?14:13);
    assert.equal(Object.keys(input.progressByBeast).length,input.school.beastIds.length);
    assert.equal(input.school.stages.find(stage=>stage.stage===spec.stage).requiredTotalLevel,spec.stage===3?135:225);
    assert.equal(input.options.allowNewModifications,spec.mods);
    assert.equal(input.options.newRankMode,'zeroToSeven');
    assert.ok(Object.values(input.progressByBeast).some(p=>p.inventory.none[10]>0));
    assert.ok(Object.values(input.progressByBeast).some(p=>p.inventory.fullDivine));
    for(const [id,progress]of Object.entries(input.progressByBeast)){
      const beast=data.beasts.find(beast=>beast.id===id);
      for(const ranks of Object.values(progress.inventory))assert.ok(Object.keys(ranks).every(rank=>Number(rank)<=beast.maxRank));
      if(beast.quality!=='orange')assert.deepEqual(Object.keys(progress.inventory),['none']);
    }
  }
});

test('separate modification-domain fixtures request actual full candidates, not an assumed planner fallback',()=>{
  const specs=benchmark.specifications(false,true);
  assert.deepEqual(specs.map(spec=>spec.id),['modified-domain-hegemonic','modified-domain-nonAttack']);
  for(const spec of specs){assert.equal(spec.domainOnly,true);assert.equal(spec.mods,true);}
});
