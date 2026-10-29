'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const R=require('./inscription-rules.js');
const Model=require('./inscription-flow-model.js');

const clone=value=>JSON.parse(JSON.stringify(value));
const term=(attr,tier)=>({attr,tier});
const make=(quality,terms,origin='crafted')=>({prefix:'天府',dun:'鬼遁',quality,origin,terms});
const base=(terms,xSource)=>({kind:'base',material:make('b2',terms,'wash'),children:[],xSource});
function craft(children,pick=()=>true){
  const preview=R.preview(children.flatMap(child=>Array(child.quantity).fill(child.node.material)));
  assert.equal(preview.valid,true);
  const outcome=preview.outcomes.find(pick);
  assert.ok(outcome);
  return {kind:'craft',material:outcome.material,children,promotion:preview.promotion,probability:outcome.probability,outcomes:preview.outcomes,
    sourceKey:JSON.stringify([R.signature(outcome.material),children.flatMap(child=>Array(child.quantity).fill(R.signature(child.node.material))).sort()])};
}
const route=tree=>({tree,reuse:[],xTerm:term('闪避','U'),symbolicX:true});
const byId=graph=>new Map(graph.materials.map(m=>[m.id,m]));
function sourcedPair(){
  return craft([{quantity:1,node:base([term('速','?')],false)},{quantity:1,node:base([term('闪避','U')],true)}]);
}

for(const [dun,attrs] of [['鬼遁',['暴击伤害','速','速']],['龙遁',['PVP伤害','PVP速','PVP速']]]){
  test(dun+' shares complementary 50% products and counts the complete one-target demand',()=>{
    const plan=Paths.representative({prefix:'天府',dun,quality:'o2',attrs});
    const original=plan.strategies[0],before=JSON.stringify(original),graph=Model.project(original,plan.xAttr),materials=byId(graph);
    const first=graph.operations.filter(o=>o.kind==='craft'&&o.quality==='p1');
    assert.equal(first.length,1,'one shared blue recipe, not one operation per selected outcome');
    assert.equal(first[0].promotion,'初级');
    assert.equal(first[0].sourceKeys.length,2,'both original producer aliases survive');
    assert.deepEqual(first[0].outputs.map(o=>o.probability),[0.5,0.5]);
    assert.deepEqual(first[0].outputs.map(o=>materials.get(o.id).demand),[9,9]);
    assert.ok(first[0].outputs.every(o=>materials.get(o.id).kind==='product'&&materials.get(o.id).useful));
    assert.deepEqual(graph.materials.filter(m=>m.material.quality==='p2').map(m=>m.demand),[3,3]);
    assert.equal(graph.materials.find(m=>m.material.quality==='o1').demand,3);
    assert.equal(materials.get(graph.targetId).demand,1);
    assert.equal(graph.materials.filter(m=>m.kind==='base').length,2);
    assert.ok(graph.operations.every(o=>Math.abs(o.outputs.reduce((sum,x)=>sum+x.probability,0)-1)<1e-10));
    assert.equal(JSON.stringify(original),before);
  });
}

test('different X origins keep physically identical recipes separate',()=>{
  const left=sourcedPair(),right=clone(left);
  right.children[1].node.xSource=false;
  const graph=Model.project(route(craft([{quantity:2,node:left},{quantity:1,node:right}])),'闪避');
  const operations=graph.operations.filter(o=>o.quality==='p1'),materials=byId(graph);
  assert.equal(operations.length,2);
  assert.deepEqual(operations.map(o=>materials.get(o.outputs[0].id).symbols),[['闪避:U'],[]]);
});

test('material origin and independently washed preparation do not merge into crafted sources',()=>{
  const left=sourcedPair(),right=clone(left);
  right.children[1].node.material.origin='crafted';
  const graph=Model.project(route(craft([{quantity:2,node:left},{quantity:1,node:right}])),'闪避');
  assert.equal(graph.operations.filter(o=>o.quality==='p1').length,2);
  const washed={kind:'wash',material:{...clone(left.material),origin:'wash'},children:[{quantity:99,node:base([term('防','H')])}],xSource:false};
  const isolated=Model.project(route(craft([{quantity:2,node:left},{quantity:1,node:washed}])),'闪避');
  assert.equal(isolated.operations.filter(o=>o.kind==='wash').length,1);
  assert.deepEqual(isolated.operations.find(o=>o.kind==='wash').inputs,[]);
  assert.ok(!isolated.materials.some(m=>m.material.terms.some(t=>t.attr==='防')),'illustrative wash children are not consumed or demanded');
  assert.equal(isolated.materials.find(m=>m.kind==='wash').demand,1);
});

test('random filler stays concrete, while marked and legacy X propagate only through real inputs',()=>{
  const filler=craft([{quantity:2,node:base([term('速','?')])}],o=>o.material.terms.some(t=>t.attr==='闪避'));
  for(const original of [route(filler),{tree:filler,reuse:[]}]){
    const graph=Model.project(original,'闪避');
    assert.ok(graph.materials.length>0);
    assert.ok(graph.materials.every(m=>m.symbols.length===0));
  }
  const modern=sourcedPair();delete modern.children[1].node.xSource;
  assert.ok(Model.project(route(modern),'闪避').materials.every(m=>m.symbols.length===0));
  const legacy=Model.project({tree:modern,reuse:[]},'闪避');
  assert.ok(legacy.materials.some(m=>m.material.terms.some(t=>t.attr==='闪避')));
  assert.ok(legacy.materials.filter(m=>m.material.terms.some(t=>t.attr==='闪避')).every(m=>m.symbols.includes('闪避:U')));
});

test('real reuse keeps exact producer references, quantities, coverage and complete output probabilities',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const original=plan.strategies.find(s=>s.reuse.some(r=>r.probability<1)),before=JSON.stringify(original);
  assert.ok(original);
  const graph=Model.project(original,plan.xAttr),materials=byId(graph),reuse=graph.operations.filter(o=>o.kind==='reuse');
  assert.equal(reuse.length,original.reuse.length);
  reuse.forEach((operation,index)=>{
    assert.deepEqual(operation.inputs.map(i=>i.quantity),original.reuse[index].children.map(c=>c.quantity));
    assert.equal(operation.inputs.reduce((sum,i)=>sum+i.quantity,0),3);
    assert.equal(operation.coverageReuse,true);
    assert.ok(operation.inputs.every(i=>materials.get(i.id).producer!==null));
    assert.ok(operation.inputs.every((i,n)=>materials.get(i.id).sourceKeys.includes(original.reuse[index].children[n].node.sourceKey)));
    assert.equal(operation.outputs.find(o=>o.id===graph.targetId).probability,original.reuse[index].probability);
    assert.ok(Math.abs(operation.outputs.reduce((sum,o)=>sum+o.probability,0)-1)<1e-10);
    assert.equal(operation.candidateCount,new Set(original.reuse[index].children.flatMap(c=>c.node.material.terms.map(t=>t.attr+':'+t.tier))).size);
  });
  assert.equal(materials.get(graph.targetId).demand,1,'optional reuse never adds main-tree demand');
  assert.equal(JSON.stringify(original),before);
  const broken=clone(original);broken.reuse.forEach(r=>r.children[0].node.sourceKey='unrelated-producer');
  assert.equal(Model.project(broken,plan.xAttr).operations.filter(o=>o.kind==='reuse').length,0);
});

test('same source alias cannot bind an ambiguous physical producer after provenance isolation',()=>{
  const left=sourcedPair(),right=clone(left);right.children[1].node.xSource=false;
  const tree=craft([{quantity:2,node:left},{quantity:1,node:right}]);
  const failure=left.outcomes.find(o=>R.signature(o.material)!==R.signature(left.material));
  const reuse=craft([{quantity:3,node:{kind:'failure',material:failure.material,children:[],sourceKey:left.sourceKey}}]);
  const graph=Model.project({...route(tree),reuse:[reuse]},'闪避');
  assert.equal(graph.operations.filter(o=>o.quality==='p1').length,2);
  assert.equal(graph.operations.filter(o=>o.kind==='reuse').length,0,'ambiguous aliases must never pick an arbitrary branch');
});

test('an exact product from another recipe is useful without replacing or charging the required branch',()=>{
  const left=sourcedPair();
  const right=craft([{quantity:2,node:base([term('速','?')],false)}],o=>o.material.terms.every(t=>t.attr==='速'));
  left.children[1].node.xSource=false;
  const graph=Model.project(route(craft([{quantity:2,node:left},{quantity:1,node:right}])),'闪避');
  const alternate=graph.materials.find(m=>m.demand===0&&m.useful&&m.alternateFor&&m.alternateFor.length);
  assert.ok(alternate,'a full matching product should not be called useless');
  assert.equal(alternate.kind,'product');
  const required=byId(graph).get(alternate.alternateFor[0]);
  assert.equal(required.demand,2);
  assert.notEqual(alternate.producer,required.producer);
  assert.equal(R.signature(alternate.material),R.signature(required.material));
});

test('multiple and duplicate reuse recipes preserve unique material IDs and the existing target',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const original=clone(plan.strategies.find(s=>s.reuse.some(r=>r.probability<1)));
  const another=clone(original.reuse[0]);
  another.children=another.children.slice().reverse();
  original.reuse.push(another,clone(another));
  const graph=Model.project(original,plan.xAttr),ids=new Set(graph.materials.map(m=>m.id));
  assert.equal(ids.size,graph.materials.length);
  assert.ok(ids.has(graph.targetId));
  assert.equal(graph.materials.find(m=>m.id===graph.targetId).demand,1);
  assert.equal(graph.operations.filter(o=>o.kind==='reuse').length,1);
  assert.ok(graph.operations.every(o=>o.inputs.concat(o.outputs).every(e=>ids.has(e.id))));
});
