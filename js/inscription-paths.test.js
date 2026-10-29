"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("./inscription-rules.js");
const Paths = require("./inscription-paths.js");
const goal = (dun="地遁", attrs=["技能穿透","技能穿透","技能穿透"],quality="o1") => ({prefix:"天同",dun,quality,attrs});
const has = (m,attr,tier) => m.terms.some(t=>t.attr===attr&&t.tier===tier);

test('display grouping retains all earth trees and original indexes in three probability ideas',()=>{
  const plan=Paths.representative(goal('地遁',['技能穿透','技能穿透','暴击'],'o2'));
  const before=JSON.stringify(plan.strategies),groups=Paths.groupStrategies(plan.strategies);
  assert.equal(plan.strategies.length,12);
  assert.deepEqual(groups.filter(g=>g.kind==='deterministic').map(g=>g.variants.map(v=>v.index)),[[0],[2],[4]]);
  assert.deepEqual(groups.filter(g=>g.kind==='probability').map(g=>g.variants.map(v=>v.index)),[[1,3,5],[6,8,10],[7,9,11]]);
  for(const group of groups)for(const variant of group.variants)assert.equal(variant.route,plan.strategies[variant.index]);
  assert.equal(JSON.stringify(plan.strategies),before);
  const reversed=plan.strategies.slice().reverse(),again=Paths.groupStrategies(reversed);
  for(const group of groups.filter(g=>g.kind==='probability')){
    const matching=again.find(g=>g.id===group.id);
    assert.deepEqual(matching.variants.map(v=>v.route),group.variants.map(v=>v.route).reverse());
    matching.variants.forEach(v=>assert.equal(v.route,reversed[v.index]));
  }
  assert.deepEqual(Paths.groupStrategies([]),[]);
});

test('grouping derives concrete X, washing and blue speed mechanisms from actual trees',()=>{
  const goals=[goal('鬼遁',['速','速','防'],'o2'),goal('地遁',['技能穿透','技能穿透','暴击'],'o2')];
  const strategies=goals.flatMap(g=>[Paths.representative(g),Paths.representative({...g,xTerm:{attr:'防',tier:'H'}})].filter(p=>p.valid).flatMap(p=>p.strategies));
  const groups=Paths.groupStrategies(strategies);
  assert.equal(groups.flatMap(g=>g.variants).length,strategies.length);
  for(const group of groups){
    assert.equal(new Set(group.variants.map(v=>JSON.stringify([v.route.symbolicX,v.route.xTerm]))).size,1);
    const mechanisms=group.variants.map(({route})=>{
      const events=new Set();
      function walk(node){
        if(node.kind==='wash')events.add('wash:'+node.material.quality);
        if(node.kind==='craft'&&node.children.some(c=>c.node.material.terms.some(t=>t.attr==='速'&&t.tier==='?')))events.add('speed:'+node.material.quality);
        node.children.forEach(c=>walk(c.node));
      }
      walk(route.tree);return [...events].sort().join('|');
    });
    assert.equal(new Set(mechanisms).size,1);
  }
  // Identical stage probabilities must not hide a different preparation mechanism.
  const base={kind:'base',material:{prefix:'天同',dun:'鬼遁',quality:'b2',terms:[{attr:'速',tier:'?'}]},children:[]};
  const make=child=>({kind:'probability',symbolicX:true,xTerm:{attr:'闪避',tier:'U'},tree:{kind:'craft',probability:0.5,material:{prefix:'天同',dun:'鬼遁',quality:'p1',terms:[{attr:'速',tier:'H'},{attr:'防',tier:'H'}]},children:[{quantity:2,node:child}]}});
  const washed={...base,kind:'wash',material:{...base.material,quality:'p1',terms:[{attr:'速',tier:'H'},{attr:'防',tier:'H'}]}};
  assert.equal(Paths.groupStrategies([make(base),make(washed)]).length,2);
});

test('grouping does not merge equal stage shapes with different actual recipe probabilities',()=>{
  const make=terms=>({prefix:'天同',dun:'地遁',quality:'o1',origin:'crafted',terms:terms.map(([attr,tier])=>({attr,tier}))});
  const a=make([['技能穿透','H'],['技能穿透','M'],['闪避','U']]);
  const b=make([['技能穿透','H'],['暴击','M'],['闪避','U']]);
  const c=make([['技能穿透','H'],['暴击','M'],['招架','U']]);
  // Two real operations: four candidates gives 1/4, five gives 1/10.
  // The supplied material nodes deliberately share one preparation shape.
  function strategy(inputs){
    const preview=Rules.preview(inputs);assert.equal(preview.valid,true);
    const outcome=preview.outcomes.find(o=>has(o.material,'技能穿透','H')&&has(o.material,'技能穿透','M')&&has(o.material,'暴击','M'));
    return {kind:'probability',symbolicX:false,xTerm:null,tree:{kind:'craft',material:outcome.material,probability:outcome.probability,children:inputs.map(material=>({quantity:1,node:{kind:'material',material,children:[]}}))}};
  }
  const strategies=[strategy([a,a,b]),strategy([a,b,c])];
  assert.deepEqual(strategies.map(s=>s.tree.probability),[0.25,0.1]);
  assert.equal(Paths.groupStrategies(strategies).length,2);
  // This pure display API must respect the supplied probability independently
  // of today's pool-size rule; it must never recalculate it from the shape.
  const differentProbability={...strategies[1],tree:{...strategies[1].tree,probability:0.2}};
  assert.equal(Paths.groupStrategies([strategies[1],differentProbability]).length,2);
});

test('dragon PVP speed is grouped as the same unknown-speed mechanism, never as a known blue term',()=>{
  const plan=Paths.representative(goal('龙遁',['PVP速','PVP速','暴击'],'o2'));
  assert.equal(plan.valid,true);assert.equal(plan.strategies.length,12);
  const groups=Paths.groupStrategies(plan.strategies);
  assert.deepEqual(groups.map(g=>g.variants.length),[2,1,2,1,2,1,2,1]);
  assert.ok(groups.every(g=>g.kind==='probability'));
  const route=plan.strategies[0];let unknownCount=0;
  function replaceUnknown(node,attr,tier){
    node.material.terms.forEach(t=>{if(t.attr==='PVP速'&&t.tier==='?'){unknownCount++;t.attr=attr;t.tier=tier;}});
    node.children.forEach(c=>replaceUnknown(c.node,attr,tier));
  }
  // Classification contract fixtures reuse a real Dragon tree and change only
  // the unknown-source marker; this API does not revalidate or rewrite recipes.
  const ordinarySpeed=JSON.parse(JSON.stringify(route));replaceUnknown(ordinarySpeed.tree,'速','?');assert.ok(unknownCount>0);
  assert.equal(Paths.groupStrategies([route,ordinarySpeed]).length,1);
  const known=JSON.parse(JSON.stringify(route));replaceUnknown(known.tree,'PVP速','H');
  assert.equal(Paths.groupStrategies([route,known]).length,2);
});

test('normal representative recipes inherit every target instead of fishing for missing terms',()=>{
  for(const g of [goal('鬼遁',['速','速','防'],'o2'),goal('云遁',['护盾','护盾','技免'],'o2'),goal('人遁',['技能穿透','技能穿透','PVP伤害'],'o2')]){
    const plan=Paths.representative(g);assert.equal(plan.valid,true);
    function visit(node){
      if(node.kind==='wash'){assert.equal(node.children.length,0);return;}
      if(node.kind==='craft'){
        const inputs=node.children.flatMap(c=>Array.from({length:c.quantity},()=>c.node.material));
        for(const attr of new Set(node.material.terms.map(t=>t.attr))){
          const wanted=node.material.terms.filter(t=>t.attr===attr);
          const known=new Set(inputs.flatMap(m=>m.terms).filter(t=>t.attr===attr&&t.tier!=='?').map(t=>t.tier));
          const unknown=inputs.flatMap(m=>m.terms).filter(t=>t.attr===attr&&t.tier==='?').length;
          assert.ok(wanted.filter(t=>!known.has(t.tier)).length<=unknown);
        }
        if(node.material.quality==='o2')assert.equal(node.probability,1);
      }
      node.children.forEach(c=>visit(c.node));
    }
    plan.strategies.forEach(s=>visit(s.tree));
  }
});

test("representative cloud routes retain multiple complementary intermediate recipes", () => {
  const plan=Paths.representative(goal('云遁',['护盾','护盾','技免'],'o2'));
  assert.equal(plan.valid,true);
  const pairs=new Set();
  function walk(node) {
    if(node.kind==='craft'&&node.material.quality==='o1'&&node.probability===1)
      pairs.add(JSON.stringify(node.children.map(c=>[Rules.signature(c.node.material),c.quantity]).sort()));
    node.children.forEach(c=>walk(c.node));
  }
  plan.strategies.forEach(s=>walk(s.tree));
  assert.ok(pairs.size>=2);
  assert.ok(plan.strategies.length<=21*plan.targets.length);
});
test("earth triple penetration exposes deterministic overlapping pairs and .25 U seed", () => {
  const result=Paths.generate(goal()); assert.equal(result.valid,true); assert.equal(result.bestTargets.targets.length,1);
  const exact=result.routes.filter(r=>r.probability===1);
  assert.ok(exact.some(r=>r.inputs.some(m=>m.origin==="wash"&&has(m,"技能穿透","L")&&has(m,"技能穿透","H"))&&r.inputs.some(m=>m.origin==="crafted"&&has(m,"技能穿透","M")&&has(m,"技能穿透","H"))));
  assert.ok(result.routes.some(r=>r.probability===0.25&&r.inputs.some(m=>has(m,"技能穿透","L")&&has(m,"治疗效果","U"))&&r.inputs.some(m=>has(m,"技能穿透","M")&&has(m,"技能穿透","H"))));
});
test("human double penetration with PVP has no invented deterministic p2 M+L source", () => {
  const result=Paths.generate(goal("人遁",["技能穿透","技能穿透","PVP伤害"]));
  assert.equal(result.valid,true); assert.equal(result.routes.filter(r=>r.probability===1).length,0); assert.ok(result.routes.some(r=>r.probability>0));
});
test("generated recipes are canonical, concrete, source valid and match actual preview", () => {
  for (const g of [goal(),goal("云遁",["护盾","技免","抗暴击"]),goal("神遁",["PVP伤害","技能穿透","攻"])]) {
    const result=Paths.generate(g), seen=new Set();
    for (const route of result.routes) { assert.ok(route.inputs.every(m=>Rules.validate(m).valid)); const preview=Rules.preview(route.inputs); assert.equal(preview.valid,true);
      const match=preview.outcomes.find(o=>Rules.signature(o.material)===route.targetSignature); assert.equal(match.probability,route.probability); assert.ok(!seen.has(route.id)); seen.add(route.id); }
    const again=Paths.generate({...g,attrs:g.attrs.slice().reverse()}); assert.deepEqual(again.routes.map(r=>r.id),result.routes.map(r=>r.id));
  }
});
test("b2 preparation and all dun/quality arbitrary nonrepeated attrs give explicit routes or reasons", () => {
  for (const d of Rules.duns) for (const q of Rules.qualities) { const attrs=d.attrs.slice(0,q.count), result=Paths.generate(goal(d.id,attrs,q.id)); assert.equal(typeof result.valid,"boolean");
    if(result.valid) { assert.ok(result.nodes.length); if(q.id==="b2") assert.equal(result.routes.length,0);
      for(const route of result.routes) { assert.ok(route.inputs.every(m=>Rules.validate(m).valid)); const preview=Rules.preview(route.inputs); assert.equal(preview.outcomes.find(o=>Rules.signature(o.material)===route.targetSignature).probability,route.probability); }
    } else assert.ok(result.errors.length); }
  assert.equal(Paths.generate(goal("人遁",["技能穿透","技能穿透","技能穿透"])).valid,false);
  assert.equal(Paths.generate({...goal(),prefix:"*"}).valid,false);
});
test("predecessor expansion preserves crafted-only two M purple source and defensive cache", () => {
  const material={prefix:"天同",dun:"地遁",quality:"p2",origin:"crafted",terms:[{attr:"技能穿透",tier:"M"},{attr:"防",tier:"M"}]};
  const result=Paths.expand(material); assert.ok(result.routes.some(r=>r.probability===1)); assert.equal(result.preparations.length,0);
  result.routes.length=0; assert.ok(Paths.expand(material).routes.length); assert.ok(Paths.generate(goal()).groups.length);
});
test("reuse planner calculates complementary failures, rejects AAA, handles AAB and different X", () => {
  const make=terms=>({prefix:"天同",dun:"地遁",quality:"o1",origin:"crafted",terms:terms.map(t=>({attr:t[0],tier:t[1]}))});
  const a=make([["技能穿透","L"],["技能穿透","M"],["治疗效果","U"]]);
  const b=make([["技能穿透","L"],["技能穿透","H"],["治疗效果","U"]]);
  const c=make([["技能穿透","M"],["技能穿透","H"],["治疗效果","U"]]);
  const result=Paths.reuseRecipes(goal("地遁",["技能穿透","技能穿透","技能穿透"],"o2"),[a,b,c]);
  assert.equal(result.recipes.find(r=>r.inputs.some(m=>Rules.signature(m)===Rules.signature(a))&&r.inputs.some(m=>Rules.signature(m)===Rules.signature(b))&&r.inputs.some(m=>Rules.signature(m)===Rules.signature(c))).probability,0.25);
  assert.ok(!result.recipes.some(r=>r.inputs.every(m=>Rules.signature(m)===Rules.signature(a))));
  assert.ok(result.recipes.some(r=>r.inputs.filter(m=>Rules.signature(m)===Rules.signature(a)).length===2));
  const different={...c,terms:c.terms.map(t=>t.attr==="治疗效果"?{attr:"闪避",tier:"U"}:t)};
  assert.ok(Paths.reuseRecipes(goal("地遁",["技能穿透","技能穿透","技能穿透"],"o2"),[a,b,different]).recipes.some(r=>r.probability<0.25));
});
test("reuse quantities bind actual stock while templates disclose repeated input requirements", () => {
  const make=terms=>({prefix:"天同",dun:"地遁",quality:"o1",origin:"crafted",terms:terms.map(([attr,tier])=>({attr,tier}))});
  const a=make([["技能穿透","L"],["技能穿透","M"],["治疗效果","U"]]), b=make([["技能穿透","L"],["技能穿透","H"],["治疗效果","U"]]);
  const g=goal("地遁",["技能穿透","技能穿透","技能穿透"],"o2");
  assert.equal(Paths.reuseRecipes(g,[{material:a,quantity:1},{material:b,qty:1}]).recipes.length,0);
  const enough=Paths.reuseRecipes(g,[{material:a,quantity:2},{material:b,quantity:1}]); assert.equal(enough.recipes.length,1); assert.equal(enough.recipes[0].inventoryBound,true);
  assert.equal(Paths.reuseRecipes(g,[a,b]).templateMode,true); assert.ok(Paths.reuseRecipes(g,[a,b]).recipes.every(r=>r.requirements.some(e=>e.quantity===2)));
  assert.deepEqual(Paths.generate(g).reuseBranches.map(branch=>branch.distinctX),[1,2,3]); assert.ok(Paths.generate(g).reuseBranches.every(branch=>branch.probability===null));
});
test("blue unknown speed is never a guaranteed high-speed source and cached results stay isolated", () => {
  const result=Paths.generate(goal("鬼遁",["速","防"],"p1"));
  const recipe=result.routes.find(r=>r.inputs.some(m=>has(m,"速","?"))&&r.inputs.some(m=>has(m,"防","H")));
  assert.equal(recipe.probability,0.5); assert.equal(recipe.deterministic,false); result.targets[0].terms.length=0;
  assert.equal(Paths.generate(goal("鬼遁",["速","防"],"p1")).targets[0].terms.length,2);
});
test("all legal o1 pair recipes reaching human double penetration are represented without permutation duplicates", () => {
  const g=goal("人遁",["技能穿透","技能穿透","PVP伤害"]), actual=Paths.generate(g), candidates=[], seen=new Set();
  const terms=Rules.termsFor("人遁","p2");
  for(let i=0;i<terms.length;i++) for(let j=i+1;j<terms.length;j++) for(const origin of ["wash","crafted"]) {
    const m={prefix:"天同",dun:"人遁",quality:"p2",origin,terms:[terms[i],terms[j]]}, sig=Rules.signature(m);
    if(Rules.validate(m).valid&&!seen.has(sig)) {seen.add(sig);candidates.push(m);}
  }
  const wanted=Rules.signature(actual.targets[0]), expected=new Set();
  for(let i=0;i<candidates.length;i++) for(let j=i;j<candidates.length;j++) { const inputs=[candidates[i],candidates[j]], preview=Rules.preview(inputs);
    if(preview.outcomes.some(o=>Rules.signature(o.material)===wanted)) expected.add(JSON.stringify(inputs.map(Rules.signature).sort())); }
  assert.deepEqual(new Set(actual.routes.map(r=>JSON.stringify(r.inputs.map(Rules.signature).sort()))),expected);
});
test("multiextra recipes remain explicit selectable branches at three-parent grades", () => {
  for(const [quality,attrs,maxExtras] of [["p2",["技能穿透","防"],4],["o2",["技能穿透","技能穿透","技能穿透"],6]]) {
    const result=Paths.generate(goal("地遁",attrs,quality));
    assert.ok(Array.isArray(result.additionalBranches));
    assert.equal(result.additionalBranches.at(-1).distinctExtras,maxExtras);
    assert.ok(result.additionalBranches.every(b=>b.selectConcrete&&b.probability===null&&b.planner==="reuseRecipes"));
  }
});
test("on-demand predecessor plans accept an exact non-best intermediate material for multi-extra evaluation", () => {
  const target={prefix:"天同",dun:"地遁",quality:"p2",origin:"crafted",terms:[{attr:"防",tier:"M"},{attr:"技能穿透",tier:"M"}]};
  const a={...target,quality:"p1"}, b={...a,terms:[{attr:"技能穿透",tier:"M"},{attr:"治疗效果",tier:"U"}]};
  const planned=Paths.reuseRecipes(target,[a,b]); assert.equal(planned.valid,true); assert.ok(planned.recipes.length);
  assert.ok(planned.recipes.every(route=>route.targetSignature===Rules.signature(target)));
});
test("quantity-bearing reuse entries cannot turn null or missing quantities into unlimited templates", () => {
  const material={prefix:"天同",dun:"地遁",quality:"o1",origin:"crafted",terms:[{attr:"技能穿透",tier:"H"},{attr:"技能穿透",tier:"M"},{attr:"技能穿透",tier:"L"}]};
  const g=goal("地遁",["技能穿透","技能穿透","技能穿透"],"o2");
  for(const qty of [null,undefined,-1,1.5,NaN,Infinity]) assert.equal(Paths.reuseRecipes(g,[{material,quantity:qty}]).valid,false);
  assert.equal(Paths.reuseRecipes(g,new Array(1)).valid,false);
});
const blueSpeedGoal={prefix:"天同",dun:"鬼遁",quality:"p1",attrs:["速","防"]};
const blueSpeed={prefix:"天同",dun:"鬼遁",quality:"b2",origin:"wash",terms:[{attr:"速",tier:"?"}]};
const blueDefense={prefix:"天同",dun:"鬼遁",quality:"b2",origin:"wash",terms:[{attr:"防",tier:"H"}]};
test("concrete-material planner projects blue unknown speed through preview with .5 high-speed chance", () => {
  const result=Paths.reuseRecipes(blueSpeedGoal,[blueSpeed,blueDefense]);
  assert.equal(result.valid,true); assert.equal(result.templateMode,true);
  const recipe=result.recipes.find(r=>r.inputs.some(m=>has(m,"速","?"))&&r.inputs.some(m=>has(m,"防","H")));
  assert.ok(recipe); assert.equal(recipe.probability,0.5); assert.equal(recipe.deterministic,false);
});
test("counted-stock planner retains legal blue unknown speed recipe and respects one of each input", () => {
  const result=Paths.reuseRecipes(blueSpeedGoal,[{material:blueSpeed,quantity:1},{material:blueDefense,quantity:1}]);
  assert.equal(result.valid,true); assert.equal(result.templateMode,false); assert.equal(result.recipes.length,1);
  assert.equal(result.recipes[0].probability,0.5); assert.equal(result.recipes[0].inventoryBound,true);
  assert.ok(result.recipes[0].requirements.every(e=>e.quantity===1));
});

function treeNodes(tree) {
  return [tree,...tree.children.flatMap(child=>treeNodes(child.node))];
}

test("routine speed preparation retains identical HM and mixed same-X purple-two families", () => {
  for(const [dun,attr] of [["鬼遁","速"],["龙遁","PVP速"]]) {
    const plan=Paths.representative(goal(dun,[attr,attr,attr],"o2"));
    assert.equal(plan.valid,true);
    assert.deepEqual(plan.xTerm,{attr:"闪避",tier:"U"});
    assert.equal(plan.symbolicX,true);
    assert.ok(plan.strategies.every(strategy=>strategy.symbolicX&&strategy.xTerm.attr==="闪避"));
    const nodes=plan.strategies.flatMap(strategy=>treeNodes(strategy.tree));
    const pairs=nodes.filter(node=>node.kind==="craft"&&node.material.quality==="p2"&&has(node.material,attr,"H")&&has(node.material,attr,"M"));
    const identical=pairs.find(node=>node.children.length===1&&node.children[0].quantity===3);
    assert.ok(identical,"purple-one HM × 3 preparation must remain available");
    assert.equal(identical.probability,1);
    assert.equal(identical.children[0].node.probability,1/17);
    assert.ok(treeNodes(identical).every(node=>!node.xSource),"a no-X blue-speed recipe must not acquire symbolic provenance");
    const split=pairs.find(node=>node.children.length===2&&node.children.every(child=>has(child.node.material,"闪避","U")));
    assert.ok(split,"purple-one M+X/H+same-X preparation must survive deterministic-route pruning");
    assert.deepEqual(split.children.map(child=>child.quantity).sort(),[1,2]);
    assert.equal(split.probability,1/3);
    assert.ok(split.children.every(child=>child.node.probability===0.5));
    const orange=nodes.filter(node=>node.kind==="craft"&&node.material.quality==="o1");
    assert.ok(orange.length);
    assert.ok(orange.every(node=>node.probability===0.25));
    assert.ok(orange.every(node=>node.children.some(child=>child.node.kind==="wash"&&has(child.node.material,attr,"L")&&has(child.node.material,"闪避","U"))));
    assert.ok(!nodes.some(node=>node.kind==="wash"&&node.material.quality==="p2"&&has(node.material,attr,"H")&&has(node.material,attr,"L")));
    assert.ok(plan.strategies.length<=21*plan.targets.length);
  }
});

test("routine low+X preparation generalizes beyond same-attribute speed goals", () => {
  const plan=Paths.representative(goal("人遁",["技能穿透","技能穿透","PVP伤害"],"o2"));
  assert.equal(plan.valid,true);
  const nodes=plan.strategies.flatMap(strategy=>treeNodes(strategy.tree));
  const pairs=nodes.filter(node=>node.kind==="craft"&&node.material.quality==="p2"&&has(node.material,"技能穿透","M")&&has(node.material,"PVP伤害","M"));
  assert.ok(pairs.some(node=>node.probability===1&&node.children.length===1&&node.children[0].quantity===3));
  assert.ok(pairs.some(node=>node.probability===1/3&&node.children.length===2&&node.children.every(child=>has(child.node.material,"闪避","U"))));
  assert.ok(nodes.some(node=>node.kind==="wash"&&node.material.quality==="p2"&&has(node.material,"技能穿透","L")&&has(node.material,"闪避","U")));
});

test("empty X remains optional and target common terms do not become symbolic sources", () => {
  const g=goal("鬼遁",["闪避","招架","治疗效果"],"o2");
  for(const configured of [g,{...g,xTerm:null}]) {
    const plan=Paths.representative(configured);
    assert.equal(plan.valid,true);
    assert.equal(plan.symbolicX,true);
    assert.ok(plan.strategies.length);
    assert.ok(plan.strategies.every(strategy=>treeNodes(strategy.tree).every(node=>!node.xSource)));
  }
});

test("symbolic provenance is confined to explicit X leaves and craft recipes have stable source keys", () => {
  const plan=Paths.representative(goal("鬼遁",["速","速","速"],"o2"));
  let symbolicLeaves=0,randomFillWithX=0;
  for(const strategy of plan.strategies) for(const node of treeNodes(strategy.tree)) {
    if(node.xSource) {
      symbolicLeaves++;
      assert.ok(["base","wash"].includes(node.kind));
      assert.ok(has(node.material,"闪避","U"));
    }
    if(node.kind==="craft") {
      const inputs=node.children.flatMap(child=>Array.from({length:child.quantity},()=>child.node.material));
      assert.equal(node.sourceKey,JSON.stringify([Rules.signature(node.material),inputs.map(Rules.signature).sort()]));
      if(!inputs.some(material=>has(material,"闪避","U"))&&node.outcomes.some(outcome=>has(outcome.material,"闪避","U"))) {
        randomFillWithX++;
        assert.ok(treeNodes(node).every(child=>!child.xSource));
      }
    }
    assert.ok(node.material.terms.every(term=>Object.keys(term).sort().join(",")==="attr,tier"));
  }
  assert.ok(symbolicLeaves>0);
  assert.ok(randomFillWithX>0);
});

test("selected graded X recalculates legal sources without symbolic replacement", () => {
  const xTerm={attr:"防",tier:"H"};
  const plan=Paths.representative({...goal("鬼遁",["速","速","速"],"o2"),xTerm});
  assert.equal(plan.valid,true);
  assert.deepEqual(plan.xTerm,xTerm);
  assert.equal(plan.symbolicX,false);
  for(const strategy of plan.strategies) {
    assert.deepEqual(strategy.xTerm,xTerm);
    assert.equal(strategy.symbolicX,false);
    for(const node of treeNodes(strategy.tree)) {
      assert.equal(node.xSource,undefined);
      assert.equal(Rules.validate(node.material).valid,true);
      if(node.kind==="craft") {
        const inputs=node.children.flatMap(child=>Array.from({length:child.quantity},()=>child.node.material));
        const preview=Rules.preview(inputs);
        const match=preview.outcomes.find(outcome=>Rules.signature(outcome.material)===Rules.signature(node.material));
        assert.equal(match.probability,node.probability);
      }
    }
  }
  assert.ok(plan.strategies.some(strategy=>treeNodes(strategy.tree).some(node=>node.kind==="wash"&&node.material.quality==="p2"&&has(node.material,"速","L")&&has(node.material,"防","H"))));
});

test("a blue-legal middle-tier X cannot be invented as a purple low+X wash source", () => {
  const xTerm={attr:"血",tier:"M"};
  const blocked=Paths.representative({...goal("鬼遁",["速","速","速"],"o2"),xTerm});
  assert.equal(blocked.valid,false);
  assert.equal(blocked.strategies.length,0);
  assert.deepEqual(blocked.xTerm,xTerm);
  assert.ok(blocked.errors.length);
  assert.ok(blocked.notes.some(note=>/紫二/.test(note)&&/洗练|来源/.test(note)));
  const partial=Paths.representative({...goal("鬼遁",["速","速"],"p2"),xTerm});
  assert.equal(partial.valid,true,"legal no-X preparation families must not be discarded");
  assert.ok(partial.strategies.some(strategy=>treeNodes(strategy.tree).some(node=>node.kind==="craft"&&node.material.quality==="p2"&&node.children.some(child=>has(child.node.material,"血","M")))));
  assert.ok(partial.strategies.every(strategy=>!treeNodes(strategy.tree).some(node=>has(node.material,"闪避","U"))),"selected X must never fall back to the default placeholder");
});

test("illegal concrete X is rejected rather than silently changed to another term", () => {
  for(const xTerm of [{attr:"攻",tier:"H"},{attr:"闪避",tier:"H"},{attr:"血",tier:"?"}]) {
    const plan=Paths.representative({...goal("鬼遁",["速","速","速"],"o2"),xTerm});
    assert.equal(plan.valid,false);
    assert.equal(plan.strategies.length,0);
    assert.ok(plan.errors.length);
  }
});

test("failure reuse presents repeated 2+1 coverage and retains its exact producing recipe", () => {
  const plan=Paths.representative(goal("地遁",["技能穿透","技能穿透","技能穿透"],"o2"));
  const branches=plan.strategies.flatMap(strategy=>strategy.reuse.map(branch=>({strategy,branch})));
  assert.ok(branches.length);
  for(const {strategy,branch} of branches) {
    assert.equal(branch.coverageReuse,true);
    assert.equal(branch.probability,0.25);
    assert.deepEqual(branch.children.map(child=>child.quantity).sort(),[1,2]);
    const producers=treeNodes(strategy.tree).filter(node=>node.kind==="craft");
    const pool=branch.children.flatMap(child=>child.node.material.terms);
    assert.ok(branch.material.terms.every(term=>pool.some(candidate=>candidate.attr===term.attr&&candidate.tier===term.tier)));
    for(const child of branch.children) {
      assert.equal(child.node.kind,"failure");
      assert.equal(child.node.xSource,undefined);
      const producer=producers.find(node=>node.sourceKey===child.node.sourceKey);
      assert.ok(producer);
      assert.ok(producer.outcomes.some(outcome=>Rules.signature(outcome.material)===Rules.signature(child.node.material)));
    }
  }
});
