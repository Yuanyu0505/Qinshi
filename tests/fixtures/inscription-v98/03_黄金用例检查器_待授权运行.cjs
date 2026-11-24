/*
  Read-only regression against versioned, hand-reviewed expected fixtures.
  This file has NOT been executed in this delivery; AGENTS.md delegates all
  tests/format checks to the user unless separately authorized.

  node 03_黄金用例检查器_待授权运行.cjs <current-qin-project-root> <fixture-json>
*/
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const projectRoot=path.resolve(process.argv[2]||process.cwd());
const fixture=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]||path.join(__dirname,'02_计算黄金用例_固定输入与预期.json')),'utf8'));
const R=require(path.join(projectRoot,'js','inscription-rules.js'));
const EPS=1e-10;
const deepCopy=x=>JSON.parse(JSON.stringify(x));
function deepFreeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.values(x).forEach(deepFreeze);Object.freeze(x);}return x;}
function tkey(ts){return ts.map(t=>typeof t==='string'?t:`${t.attr}:${t.tier}`).sort().join('|');}
function near(a,e,label){assert.ok(Number.isFinite(a)&&Math.abs(a-e)<=EPS,`${label}: expected ${e}, got ${a}`);}
function cmpErrors(got,wanted,test){
  assert.equal(got.length,wanted.errorCount,`${test.id}: unexpected error category/count`);
  const remaining=got.slice();
  for(const expected of wanted.errorsContain){const idx=remaining.findIndex(err=>err.includes(expected));assert.ok(idx>=0,`${test.id}: missing exact semantic error: ${expected}; actual: ${got.join(' / ')}`);remaining.splice(idx,1);}
  assert.equal(remaining.length,0,`${test.id}: unwanted rejection reason(s): ${remaining.join(';')}`);
}
function check(test){
  const input=deepFreeze(deepCopy(test.input));const before=deepCopy(input);
  const expected=test.expected;
  const got=test.api==='preview'?R.preview(input):test.api==='validate'?R.validate(input):test.api==='bestTargets'?R.bestTargets(input.dun,input.quality,input.attrs):null;
  assert.ok(got,`${test.id}: unknown API`);
  assert.deepEqual(input,before,`${test.id}: input mutated`);
  if('valid' in expected)assert.equal(got.valid,expected.valid,`${test.id}: valid`);
  if(expected.valid===false){
    assert.ok(Array.isArray(got.errors)&&got.errors.length,`${test.id}: no rejection reason`);
    if(expected.errorsContain)cmpErrors(got.errors,expected,test);
    if(test.api==='preview')assert.deepEqual(got.outcomes,[],`${test.id}: invalid preview must not emit results`);
    return;
  }
  if(test.api==='validate'){
    assert.deepEqual(got.errors,[],`${test.id}: unexpected validation errors`);
    if(expected.normalized){
      const terms=expected.normalized.terms.map(identity=>{
        const [attr,tier]=identity.split(':');
        return {attr,tier};
      });
      assert.deepEqual(got.material,{...expected.normalized,terms},`${test.id}: normalized material`);
    }
    if(test.id==='G16'){
      // The original pack used wash for two orange mid-tier terms. Keep that
      // exact input as a negative guard, not as evidence to change the rules.
      const wash=deepFreeze({...deepCopy(input),origin:'wash',terms:input.terms.map(t=>t.attr==='技能减免'?{...t,attr:'技免'}:{...t})});
      const beforeWash=deepCopy(wash),rejected=R.validate(wash);
      assert.equal(rejected.valid,false,'G16: alias normalization cannot grant an illegal wash source');
      cmpErrors(rejected.errors,{errorCount:2,errorsContain:[
        '属性/档位不支持此遁位、品质或来源：技免:M','属性/档位不支持此遁位、品质或来源：防:M'
      ]},test);
      assert.deepEqual(wash,beforeWash,'G16: rejected input mutated');
    }
    return;
  }
  if(test.api==='bestTargets'){
    const real=got.targets.map(tkey).sort(),want=expected.targets.map(tkey).sort();
    assert.deepEqual(real,want,`${test.id}: exact Pareto set`);
    if(expected.reasonNonEmpty)assert.ok(typeof got.reason==='string'&&got.reason.trim(),`${test.id}: missing reason`);
    return;
  }
  assert.equal(got.quality,expected.quality,`${test.id}: quality`);
  assert.equal(got.promotion,expected.promotion,`${test.id}: promotion`);
  assert.equal(got.model,'等概率模型，非实测游戏频率',`${test.id}: model disclaimer`);
  const results=got.outcomes;
  assert.ok(Array.isArray(results)&&results.length>0,`${test.id}: no outputs`);
  const keys=results.map(o=>tkey(o.terms));
  assert.equal(new Set(keys).size,keys.length,`${test.id}: duplicate visible outcomes`);
  if(expected.outcomeCount!=null)assert.equal(results.length,expected.outcomeCount,`${test.id}: number of results`);
  if(expected.outcomes){
    // EXACT SET comparison catches substituted legal-looking terms, not just count/probability.
    const actual=results.map(o=>({terms:tkey(o.terms),probability:o.probability})).sort((a,b)=>a.terms.localeCompare(b.terms));
    const wanted=expected.outcomes.map(o=>({terms:tkey(o.terms),probability:o.probability})).sort((a,b)=>a.terms.localeCompare(b.terms));
    assert.deepEqual(actual.map(x=>x.terms),wanted.map(x=>x.terms),`${test.id}: complete visible outcome set`);
    for(let i=0;i<actual.length;i++)near(actual[i].probability,wanted[i].probability,`${test.id} ${actual[i].terms} probability`);
  }
  if('equalProbability'in expected)results.forEach(o=>near(o.probability,expected.equalProbability,`${test.id} equal probability`));
  if(expected.mustContain)results.forEach(o=>expected.mustContain.forEach(t=>assert.ok(o.terms.some(y=>`${y.attr}:${y.tier}`===t),`${test.id}: missing ${t}`)));
  if(expected.mustContainAttr)results.forEach(o=>assert.ok(o.terms.some(y=>y.attr===expected.mustContainAttr),`${test.id}: attr`));
  if(expected.noTier)results.forEach(o=>assert.ok(!o.terms.some(y=>expected.noTier.includes(y.tier)),`${test.id}: forbidden tier`));
  for(const o of results){
    assert.equal(o.material.quality,expected.quality,`${test.id}: output quality in material`);
    assert.equal(tkey(o.material.terms),tkey(o.terms),`${test.id}: material/outcome mismatch`);
    assert.equal(R.validate(o.material).valid,true,`${test.id}: invalid output material`);
  }
  near(results.reduce((sum,o)=>sum+o.probability,0),1,`${test.id}: total probability`);
}
let passed=0;let failed=0;
for(const tc of fixture.cases){try{check(tc);passed++;process.stdout.write(`PASS ${tc.id}\n`);}catch(err){failed++;process.stderr.write(`FAIL ${tc.id}: ${err.message}\n`);}}
process.stdout.write(`Golden regression: ${passed}/${fixture.cases.length} passed; ${failed} failed; fixture ${fixture.strictRevision||fixture.baseline.version}\n`);
if(failed)process.exitCode=1;
