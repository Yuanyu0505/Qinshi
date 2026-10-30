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

test('flow failures collapse by default and expand with quality-colored peers',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']});
  const route=plan.strategies.find(s=>s.kind==='probability');
  assert.ok(route);
  const collapsed=Flow.render(route,plan.xAttr),expanded=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.match(collapsed,/data-flow-details hidden/);
  assert.doesNotMatch(collapsed.split('</svg>')[0],/失败紫一 A/);
  assert.doesNotMatch(expanded,/data-flow-details hidden/);
  assert.match(expanded,/失败紫一 A/);
  assert.match(collapsed,/craft-flow-quality-b2/);
  assert.match(collapsed,/craft-flow-quality-p1/);
  assert.doesNotMatch(collapsed,/craft-flow-stage/);
  assert.match(collapsed,/data-zoom="0.9"/);
  assert.match(collapsed,/概率约6%/);
});

test('expanded failures include failed reuse outcomes and preserve orange stage',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const route=plan.strategies.find(s=>s.reuse.some(r=>r.probability<1));
  assert.ok(route);
  const closed=Flow.render(route,plan.xAttr),open=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.match(closed,/data-flow-details hidden/);
  assert.doesNotMatch(closed.split('</svg>')[0],/复用失败橙二/);
  assert.match(open,/复用失败橙二/);
  assert.match(open,/craft-flow-quality-o2/);
  assert.match(open,/失败品复用1/);
});

test('only deliberate symbolic inputs propagate X into successful and failed descendants',()=>{
  const route=sourcedRoute(),drawing=Flow.render(route,'闪避',{showFailures:true});
  assert.match(drawing,/失败紫一 A1：(?:(?!<\/p>).)*<strong class="ins-term-value ins-term-purple">杂词条 X（同一个）/s);
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
  assert.doesNotMatch(Flow.render(route,'闪避'),/失败品复用\d/);
});

test('legacy failure references are not guessed when several producers yield the same material',()=>{
  const blue={prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]},preview=Rules.preview([blue,blue]);
  const pair=terms=>preview.outcomes.find(o=>terms.every(t=>o.material.terms.some(u=>u.attr===t.attr&&u.tier===t.tier)));
  const high={attr:'速',tier:'H'},mid={attr:'速',tier:'M'},x={attr:'闪避',tier:'U'},other={attr:'招架',tier:'U'};
  const produce=output=>({kind:'craft',material:output.material,children:[{quantity:2,node:{kind:'base',material:blue,children:[]}}],promotion:'初级',outcomes:preview.outcomes,probability:output.probability});
  const left=produce(pair([high,mid])),right=produce(pair([high,x]));
  // Same inputs/outputs alone now correctly share an operation. Keep this
  // ambiguity test about genuinely distinct owned vs independently washed sources.
  right.children[0].node={kind:'wash',material:blue,children:[]};
  const rootPreview=Rules.preview([left.material,left.material,right.material]),goal=rootPreview.outcomes.find(o=>o.material.terms.every(t=>t.attr==='速'));
  const tree={kind:'craft',material:goal.material,children:[{quantity:2,node:left},{quantity:1,node:right}],promotion:null,outcomes:rootPreview.outcomes,probability:goal.probability};
  const reuseInputs=[{quantity:2,node:{kind:'failure',material:pair([mid,other]).material,children:[]}},{quantity:1,node:{kind:'failure',material:pair([high,other]).material,children:[]}}];
  const reusePreview=Rules.preview(reuseInputs.flatMap(c=>Array(c.quantity).fill(c.node.material)));
  const reuse={kind:'craft',material:goal.material,children:reuseInputs,promotion:null,outcomes:reusePreview.outcomes,probability:1/3};
  assert.doesNotMatch(Flow.render({kind:'probability',tree,reuse:[reuse]},'闪避'),/失败品复用\d/);
});

test('coverage reuse preserves target coverage and permits repeated material kinds without choose-count copy',()=>{
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
  assert.match(drawing,/失败品复用1/);
  assert.match(drawing,/候选词条池必须覆盖全部目标词条/);
  assert.match(drawing,/概率25%/);
  assert.doesNotMatch(drawing,/目前\d+选\d+/);
  assert.match(drawing,/同种.*重复/);
  assert.doesNotMatch(drawing,/投料示例|候选池必须覆盖|三枚合法同品质/);
  assert.doesNotMatch(drawing,/必须(?:收集)?A[＋+、]B[＋+、]C/);
});

function reuseWithCandidateCount(count){
  const a={attr:'技能穿透',tier:'H'},b={attr:'闪避',tier:'U'},c={attr:'招架',tier:'U'},x={attr:'治疗效果',tier:'U'},y={attr:'防',tier:'H'};
  const make=(quality,terms,origin='crafted')=>({prefix:'天府',dun:'地遁',quality,origin,terms});
  function producer(pair,goal){
    const children=pair.map(terms=>({quantity:1,node:{kind:'wash',material:make('p2',terms,'wash'),children:[]}}));
    children.forEach(child=>assert.equal(Rules.validate(child.node.material).valid,true));
    const preview=Rules.preview(children.map(child=>child.node.material)),signature=Rules.signature(make('o1',goal));
    assert.equal(preview.valid,true);
    const outcome=preview.outcomes.find(outcome=>Rules.signature(outcome.material)===signature);
    assert.ok(outcome);
    return {kind:'craft',material:outcome.material,children,promotion:preview.promotion,outcomes:preview.outcomes,probability:outcome.probability,
      sourceKey:JSON.stringify([signature,children.map(child=>Rules.signature(child.node.material)).sort()])};
  }
  const left=producer([[a,b],[c,x]],[a,b,x]),right=producer([[a,b],[c,y]],[a,c,y]);
  const preview=Rules.preview([left.material,left.material,right.material]),signature=Rules.signature(make('o2',[a,b,c]));
  const goal=preview.outcomes.find(outcome=>Rules.signature(outcome.material)===signature);
  assert.ok(goal);
  const fail=(node,terms,quantity)=>({quantity,node:{kind:'failure',material:node.outcomes.find(outcome=>Rules.signature(outcome.material)===Rules.signature(make('o1',terms))).material,children:[],sourceKey:node.sourceKey}});
  const children=count===3?[fail(left,[a,b,c],3)]:[fail(left,[a,c,x],2),fail(right,[b,c,y],1)];
  const reusePreview=Rules.preview(children.flatMap(child=>Array(child.quantity).fill(child.node.material)));
  assert.equal(reusePreview.valid,true);
  const reuseGoal=reusePreview.outcomes.find(outcome=>Rules.signature(outcome.material)===signature);
  assert.ok(reuseGoal);
  return {kind:'probability',tree:{kind:'craft',material:goal.material,children:[{quantity:2,node:left},{quantity:1,node:right}],promotion:preview.promotion,outcomes:preview.outcomes,probability:goal.probability},
    reuse:[{kind:'craft',material:goal.material,children,promotion:null,outcomes:reusePreview.outcomes,probability:reuseGoal.probability}],xTerm:x,symbolicX:false};
}

for(const count of [3,5])test('reuse probability retains the real candidate pool when choose-count copy is hidden: '+count,()=>{
  const route=reuseWithCandidateCount(count),drawing=Flow.render(route,'治疗效果');
  const operations=Array.from(drawing.matchAll(/<g class="craft-flow-box craft-flow-operation[^\"]*"[^>]*>([\s\S]*?)<\/g>/g),match=>
    Array.from(match[1].matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g),line=>line[1].replace(/<[^>]*>/g,'')));
  const operation=operations.find(lines=>lines[0]==='失败品复用1');
  assert.ok(operation,'The reuse node retains its ordinal');
  assert.deepEqual(operation,[
    '失败品复用1',
    '三枚失败材料，同种可重复',
    '候选词条池必须覆盖全部目标词条'
  ]);
  assert.match(drawing,new RegExp('概率'+(count===3?'100%':'10%')));
  const probabilityLabels=Array.from(drawing.matchAll(/<g class="craft-flow-label"[^>]*>([\s\S]*?)<\/g>/g),match=>match[1])
    .filter(label=>/概率/.test(label));
  const anchors=probabilityLabels.map(label=>label.match(/<rect x="([^"]+)" y="([^"]+)"/).slice(1).join(','));
  assert.equal(new Set(anchors).size,anchors.length,'Probabilities for main and reuse routes must not cover each other');
});
