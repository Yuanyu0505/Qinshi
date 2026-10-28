"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const Flow=require('./inscription-flowchart.js');
const Terms=require('./inscription-terms.js');
const Rules=require('./inscription-rules.js');

function sourcedRoute(symbolicX=true){
  const material=terms=>({prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms});
  const base=(terms,xSource)=>({kind:'base',material:material(terms),children:[],promotion:null,xSource});
  const children=[{quantity:1,node:base([{attr:'速',tier:'?'}],false)},{quantity:1,node:base([{attr:'闪避',tier:'U'}],symbolicX)}];
  const preview=Rules.preview(children.map(c=>c.node.material));
  const target=preview.outcomes.find(o=>o.material.terms.some(t=>t.attr==='速'&&t.tier==='H'));
  const tree={kind:'craft',material:target.material,children,promotion:preview.promotion,outcomes:preview.outcomes,probability:target.probability};
  tree.sourceKey=JSON.stringify([Rules.signature(tree.material),children.map(c=>Rules.signature(c.node.material)).sort()]);
  return {kind:'probability',tree,reuse:[],xTerm:{attr:'闪避',tier:'U'},symbolicX};
}

test('display values descend and failure lists never hide a concrete term behind X',()=>{
  assert.deepEqual(Terms.sortTerms([{attr:'速',tier:'L'},{attr:'速',tier:'H'},{attr:'速',tier:'M'}],'o2').map(t=>t.tier),['H','M','L']);
  const plan=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']});
  const drawing=Flow.render(plan.strategies.find(s=>s.kind==='probability'),plan.xAttr,{showFailures:true});
  assert.match(drawing,/3%闪避/);
  assert.doesNotMatch(drawing,/失败紫一[^<]*杂词条 X/);
  assert.ok(drawing.indexOf('craft-flow-toolbar')<drawing.indexOf('data-craft-action="diagram-failures"'));
  assert.doesNotMatch(drawing,/准备蓝二 × 1/);
});

test('flow failures collapse by default and expand with stage frames',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']});
  const route=plan.strategies.find(s=>s.kind==='probability');
  assert.ok(route);
  const collapsed=Flow.render(route,plan.xAttr),expanded=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.match(collapsed,/种结果已收起/);
  assert.doesNotMatch(collapsed,/失败紫一 A/);
  assert.match(expanded,/失败紫一 A/);
  assert.match(collapsed,/craft-flow-stage-blue/);
  assert.match(collapsed,/craft-flow-stage-purple/);
  assert.match(collapsed,/data-zoom="0.9"/);
  assert.match(collapsed,/当前概率：约6%/);
});

test('expanded failures include failed reuse outcomes and preserve orange stage',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const route=plan.strategies.find(s=>s.reuse.some(r=>r.probability<1));
  assert.ok(route);
  const closed=Flow.render(route,plan.xAttr),open=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.doesNotMatch(closed,/复用失败橙二/);
  assert.match(open,/复用失败橙二/);
  assert.match(open,/craft-flow-stage-orange/);
  assert.match(open,/失败品互补复用/);
});

test('only deliberate symbolic inputs propagate X into successful and failed descendants',()=>{
  const route=sourcedRoute(),drawing=Flow.render(route,'闪避',{showFailures:true});
  assert.match(drawing,/失败紫一 A1：[^<]*杂词条 X（同一个）/);
  assert.doesNotMatch(drawing,/3%闪避/);
  assert.match(drawing,/概率只对.*模板条件成立/);
  const concrete=Flow.render(sourcedRoute(false),'闪避',{showFailures:true});
  assert.doesNotMatch(concrete,/杂词条 X（同一个）/);
  assert.match(concrete,/3%闪避/);
  assert.match(concrete,/闪避（不分档）/);
});

test('an unmarked same-attribute filler remains concrete even in symbolic mode',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']});
  const route=plan.strategies.find(s=>s.tree.kind==='craft'&&s.tree.children.every(c=>c.node.material.terms.every(t=>t.attr==='速')));
  assert.ok(route);
  const drawing=Flow.render({...route,xTerm:{attr:'闪避',tier:'U'},symbolicX:true},'闪避',{showFailures:true});
  assert.match(drawing,/3%闪避/);
  assert.doesNotMatch(drawing,/杂词条 X（同一个）/);
});

test('a successful random filler is not inferred as X by modern or legacy routes',()=>{
  const blue={prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]},preview=Rules.preview([blue,blue]);
  const output=preview.outcomes.find(o=>o.material.terms.some(t=>t.attr==='闪避'));
  const tree={kind:'craft',material:output.material,children:[{quantity:2,node:{kind:'base',material:blue,children:[]}}],promotion:preview.promotion,outcomes:preview.outcomes,probability:output.probability};
  for(const route of [{kind:'probability',tree,reuse:[]},{kind:'probability',tree,reuse:[],xTerm:{attr:'闪避',tier:'U'},symbolicX:true}]){
    const drawing=Flow.render(route,'闪避',{showFailures:true});
    assert.match(drawing,/3%闪避/);
    assert.doesNotMatch(drawing,/杂词条 X（同一个）/);
  }
});

test('a reuse branch never binds a failure from a different producing recipe',()=>{
  const route=sourcedRoute(),failure=route.tree.outcomes.find(o=>Rules.signature(o.material)!==Rules.signature(route.tree.material));
  route.reuse=[{...route.tree,children:[{quantity:3,node:{kind:'failure',material:failure.material,children:[],sourceKey:'unrelated-producer'}}],coverageReuse:true}];
  assert.doesNotMatch(Flow.render(route,'闪避'),/失败品互补复用/);
});

test('legacy failure references are not guessed when several producers yield the same material',()=>{
  const blue={prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]},preview=Rules.preview([blue,blue]);
  const pair=terms=>preview.outcomes.find(o=>terms.every(t=>o.material.terms.some(u=>u.attr===t.attr&&u.tier===t.tier)));
  const high={attr:'速',tier:'H'},mid={attr:'速',tier:'M'},x={attr:'闪避',tier:'U'},other={attr:'招架',tier:'U'};
  const produce=output=>({kind:'craft',material:output.material,children:[{quantity:2,node:{kind:'base',material:blue,children:[]}}],promotion:'初级',outcomes:preview.outcomes,probability:output.probability});
  const left=produce(pair([high,mid])),right=produce(pair([high,x]));
  const rootPreview=Rules.preview([left.material,left.material,right.material]),goal=rootPreview.outcomes.find(o=>o.material.terms.every(t=>t.attr==='速'));
  const tree={kind:'craft',material:goal.material,children:[{quantity:2,node:left},{quantity:1,node:right}],promotion:null,outcomes:rootPreview.outcomes,probability:goal.probability};
  const reuseInputs=[{quantity:2,node:{kind:'failure',material:pair([mid,other]).material,children:[]}},{quantity:1,node:{kind:'failure',material:pair([high,other]).material,children:[]}}];
  const reusePreview=Rules.preview(reuseInputs.flatMap(c=>Array(c.quantity).fill(c.node.material)));
  const reuse={kind:'craft',material:goal.material,children:reuseInputs,promotion:null,outcomes:reusePreview.outcomes,probability:1/3};
  assert.doesNotMatch(Flow.render({kind:'probability',tree,reuse:[reuse]},'闪避'),/失败品互补复用/);
});

test('coverage reuse describes four choose three and permits repeated material kinds',()=>{
  const make=(quality,terms,origin='crafted')=>({prefix:'天府',dun:'地遁',quality,origin,terms});
  const a={attr:'技能穿透',tier:'H'},b={attr:'闪避',tier:'U'},c={attr:'招架',tier:'U'},x={attr:'治疗效果',tier:'U'};
  const childrenOfProducer=[{quantity:1,node:{kind:'wash',material:make('p2',[a,b],'wash'),children:[],xSource:false}},{quantity:1,node:{kind:'wash',material:make('p2',[c,x],'wash'),children:[],xSource:true}}];
  const preview=Rules.preview(childrenOfProducer.map(child=>child.node.material));
  const producer={kind:'craft',material:make('o1',[a,b,c]),children:childrenOfProducer,promotion:'中级',outcomes:preview.outcomes,probability:0.25};
  producer.sourceKey=JSON.stringify([Rules.signature(producer.material),childrenOfProducer.map(child=>Rules.signature(child.node.material)).sort()]);
  const one=make('o1',[a,b,x]),two=make('o1',[a,c,x]),output=make('o2',[a,b,c]);
  const children=[{quantity:2,node:{kind:'failure',material:one,children:[],sourceKey:producer.sourceKey}},{quantity:1,node:{kind:'failure',material:two,children:[],sourceKey:producer.sourceKey}}];
  const tree={kind:'craft',material:output,children:[{quantity:3,node:producer}],promotion:null,outcomes:[{material:output,probability:1}],probability:1};
  const reusePreview=Rules.preview([one,one,two]);
  const drawing=Flow.render({kind:'probability',tree,reuse:[{kind:'craft',material:output,children,outcomes:reusePreview.outcomes,probability:0.25,coverageReuse:true}],xTerm:x,symbolicX:true},'治疗效果');
  assert.match(drawing,/四个候选词条中必须有三个是所需词条，四选三/);
  assert.match(drawing,/当前概率：25%/);
  assert.match(drawing,/同种.*重复/);
  assert.match(drawing,/投料示例（非唯一）/);
  assert.doesNotMatch(drawing,/必须(?:收集)?A[＋+、]B[＋+、]C/);
});
