"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("./inscription-rules.js");
const Paths = require("./inscription-paths.js");
const goal = (dun="地遁", attrs=["技能穿透","技能穿透","技能穿透"],quality="o1") => ({prefix:"天同",dun,quality,attrs});
const has = (m,attr,tier) => m.terms.some(t=>t.attr===attr&&t.tier===tier);
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
