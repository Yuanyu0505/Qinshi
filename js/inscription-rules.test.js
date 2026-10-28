"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Rules = require("./inscription-rules.js");
const term = (attr, tier) => ({ attr, tier });
const mat = (quality, terms, origin = "crafted", dun = "地遁", prefix = "天同") => ({ prefix, dun, quality, origin, terms });
const keys = terms => terms.map(t => t.attr + ":" + t.tier).sort();
const preview = materials => {
  const result = Rules.preview(materials);
  assert.equal(result.valid, true, result.errors.join(";"));
  return result.outcomes;
};

test("CommonJS and browser share the same pure rule behavior", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("./inscription-rules.js"), "utf8"), context);
  assert.equal(context.window.InscriptionRules.value(term("防御", "H"), "o2"), 12);
});

const growth = [
  { attrs: ["攻", "防", "血", "内力", "护盾"], H: [2,4,6,8,10,12], M: [1,2,4,6,8,10], L: [null,null,null,4,6,8] },
  { attrs: ["暴击", "抗暴击", "暴击伤害", "技能穿透", "技免", "PVP伤害", "PVP免伤"], H: [1,2,3,4,5,6], M: [1,1,2,3,4,5], L: [null,null,null,2,3,4] },
  { attrs: ["速", "PVP速"], H: [1,1,2,3,4,5], M: [1,1,1,2,3,4], L: [null,null,null,1,2,3] },
  { attrs: ["追加伤害"], H: [800,1400,2500,4500,8100,14500], M: [400,800,1400,2500,4500,8100], L: [null,null,null,1400,2500,4500] },
  { attrs: ["闪避", "招架", "治疗效果"], U: [1,2,3,4,5,6] }
];
for (const group of growth) for (const attr of group.attrs) {
  test("literal growth values: " + attr, () => {
    for (const tier of ["H", "M", "L", "U"]) if (group[tier]) {
      assert.deepEqual(["b1","b2","p1","p2","o1","o2"].map(q => Rules.value(term(attr, tier), q)), group[tier]);
    }
  });
}

const supports = {
  天遁: ["攻","暴击伤害","技免","内力","追加伤害"], 地遁: ["PVP速","暴击","PVP免伤","技能穿透","防"],
  人遁: ["血","抗暴击","PVP伤害","技能穿透","防"], 神遁: ["PVP速","攻","PVP伤害","技能穿透","内力"],
  鬼遁: ["速","血","护盾","暴击伤害","防"], 龙遁: ["PVP速","血","暴击","PVP伤害","技免"],
  虎遁: ["血","暴击伤害","抗暴击","内力","追加伤害"], 风遁: ["攻","暴击","护盾","PVP免伤","追加伤害"],
  云遁: ["护盾","抗暴击","PVP免伤","技免","防"]
};
const highs = { 天遁:["攻","暴击伤害"], 地遁:["技能穿透","防"], 人遁:["血","抗暴击"], 神遁:["攻","PVP伤害"], 鬼遁:["速","防"], 龙遁:["PVP速","暴击"], 虎遁:["血","内力"], 风遁:["PVP免伤","追加伤害"], 云遁:["护盾","技免"] };
for (const [dun, attrs] of Object.entries(supports)) {
  test("per-dun support, source restrictions and target counts: " + dun, () => {
    assert.deepEqual([...new Set(Rules.termsFor(dun,"o2").map(t => t.attr))].sort(), attrs.concat(["闪避","招架","治疗效果"]).sort());
    assert.deepEqual(Rules.termsFor(dun,"o2").filter(t=>t.tier==="H").map(t=>t.attr).sort(), highs[dun].sort());
    for (const [q, count] of [["b2",1],["p1",2],["p2",2],["o1",3],["o2",3]]) {
      const choices = count === 1 ? [attrs[0]] : count === 2 ? [attrs[0],"闪避"] : [attrs[0],"闪避","招架"];
      const result = Rules.bestTargets(dun,q,choices);
      assert.ok(result.targets.length, result.reason);
      for (const target of result.targets) assert.equal(target.length,count);
      assert.ok(!Rules.termsFor(dun,q,"wash").some(t=>t.tier==="M") || q === "b2");
      if (["b2","p1","p2"].includes(q)) assert.ok(!Rules.termsFor(dun,q,"crafted").some(t=>t.tier==="L"));
    }
  });
}

test("normalizes legacy aliases without mutating inputs; signature excludes origin and term order", () => {
  const a = mat("o2",[term("防御","H"),term("技能减免","M"),term("闪避","U")],"crafted","云盾");
  // 云 does not support high defense: use a legal alias fixture instead.
  a.terms[0].tier="M";
  const before=JSON.stringify(a);
  assert.equal(Rules.validate(a).valid,true);
  const b=mat("o2",[term("闪避","U"),term("技免","M"),term("防","M")],"wash","云遁");
  assert.equal(Rules.signature(a),Rules.signature(b));
  assert.equal(JSON.stringify(a),before);
  assert.notEqual(Rules.signature(a),Rules.signature({...a,prefix:"天府"}));
  assert.equal(Rules.label(term("技伤减免","H"),"o2"),"技免6%");
  assert.equal(Rules.label(term("速","M"),"o2"),"速4");
  assert.equal(Rules.label(term("追加伤害","H"),"o2"),"追加伤害14500");
});

test("material validation rejects malformed, unknown, duplicate and illegal sources", () => {
  const valid=mat("p2",[term("技能穿透","H"),term("技能穿透","L")],"wash");
  assert.equal(Rules.validate(valid).valid,true);
  const invalid=[null,{}, {...valid,prefix:""},{...valid,prefix:"unknown"},{...valid,dun:"unknown"},{...valid,quality:"b1"},
    {...valid,origin:"unknown"},{...valid,terms:[]},{...valid,terms:[null,term("技能穿透","H")]},
    {...valid,terms:[term("unknown","H"),term("防","H")]}, {...valid,terms:[term("技能穿透","H"),term("技能穿透","H")]},
    {...valid,terms:[term("闪避","U"),term("闪避","U")]}, {...valid,terms:[term("技能穿透","M"),term("防","H")]},
    {...valid,origin:"crafted"},mat("p1",[term("技能穿透","L"),term("防","H")]),
    mat("o2",[term("攻","H"),term("PVP伤害","H"),term("内力","H")],"crafted","神遁"),
    mat("p1",[term("速","?"),term("防","H")],"crafted","鬼遁")];
  for (const input of invalid) { const result=Rules.validate(input); assert.equal(result.valid,false,JSON.stringify(input)); assert.ok(result.errors.length); }
  assert.equal(Rules.validate(mat("o1",[term("技能穿透","L"),term("技能穿透","M"),term("防","H")])).valid,true);
});

test("blue speed only exposes unknown visible 1 and rejects hidden H/M user choices", () => {
  for (const [dun,attr] of [["鬼遁","速"],["龙遁","PVP速"],["地遁","PVP速"],["神遁","PVP速"]]) {
    assert.deepEqual(Rules.termsFor(dun,"b2","wash").filter(t=>t.attr===attr),[term(attr,"?")]);
    assert.equal(Rules.value(term(attr,"?"),"b2"),1);
    assert.equal(Rules.validate(mat("b2",[term(attr,"?")],"wash",dun)).valid,true);
    for (const tier of ["H","M"]) assert.equal(Rules.validate(mat("b2",[term(attr,tier)],"wash",dun)).valid,false);
  }
});

test("bestTargets preserves repeated attrs, rejects impossible targets, and selects highest feasible tiers", () => {
  assert.deepEqual(Rules.bestTargets("地遁","o2",["技能穿透","技能穿透","技能穿透"]).targets.map(keys),[["技能穿透:H","技能穿透:L","技能穿透:M"]]);
  assert.deepEqual(Rules.bestTargets("人遁","o2",["技能穿透","技能穿透","PVP伤害"]).targets.map(keys),[["PVP伤害:M","技能穿透:L","技能穿透:M"]]);
  for (const args of [["人遁","o2",["技能穿透","技能穿透","技能穿透"]],["云遁","o2",["抗暴击","抗暴击","抗暴击"]],["地遁","p1",["闪避","闪避"]],["地遁","p2",["技能穿透"]],["地遁","o2",["速","防","招架"]],["unknown","p1",["防","招架"]]]) {
    const result=Rules.bestTargets(...args); assert.deepEqual(result.targets,[]); assert.ok(result.reason);
  }
  const result=Rules.bestTargets("天遁","o2",["攻","攻","暴击伤害"]);
  assert.deepEqual(result.targets.map(keys),[["攻:H","攻:M","暴击伤害:H"]]);
});

test("recipe validation returns errors rather than throwing", () => {
  const a=mat("b2",[term("防","H")],"wash");
  const invalid=[null,[],[a],[a,a,a],[a,{...a,prefix:"天府"}],[a,{...a,dun:"鬼遁"}],[a,mat("p1",[term("防","H"),term("招架","U")])],[{...a,quality:"o2"},a],[a,{...a,terms:[]}]];
  for (const materials of invalid) { const result=Rules.preview(materials); assert.equal(result.valid,false); assert.deepEqual(result.outcomes,[]); assert.ok(result.errors.length); }
});

test("all four recipes grow exact distinct terms and declare implicit promotion items", () => {
  const fixtures=[
    {inputs:[mat("b2",[term("防","H")],"wash"),mat("b2",[term("闪避","U")],"wash")],q:"p1",promotion:"初级",terms:["防:H","闪避:U"]},
    {inputs:Array.from({length:3},()=>mat("p1",[term("防","H"),term("闪避","U")])),q:"p2",promotion:null,terms:["防:H","闪避:U"]},
    {inputs:[mat("p2",[term("技能穿透","L"),term("技能穿透","H")],"wash"),mat("p2",[term("技能穿透","M"),term("技能穿透","H")])],q:"o1",promotion:"中级",terms:["技能穿透:H","技能穿透:L","技能穿透:M"]},
    {inputs:Array.from({length:3},()=>mat("o1",[term("技能穿透","L"),term("技能穿透","M"),term("技能穿透","H")])),q:"o2",promotion:null,terms:["技能穿透:H","技能穿透:L","技能穿透:M"]}
  ];
  for (const fixture of fixtures) {const result=Rules.preview(fixture.inputs); assert.equal(result.valid,true); assert.equal(result.quality,fixture.q); assert.equal(result.promotion,fixture.promotion); assert.equal(result.outcomes.length,1); assert.deepEqual(keys(result.outcomes[0].terms),fixture.terms.sort()); assert.equal(result.outcomes[0].probability,1); assert.equal(result.outcomes[0].material.origin,"crafted");}
});

test("four distinct inherited terms choose three at .25, duplicates do not weight probability", () => {
  const a=mat("p2",[term("技能穿透","L"),term("治疗效果","U")],"wash");
  const b=mat("p2",[term("技能穿透","M"),term("技能穿透","H")]);
  const outputs=preview([a,b]);
  assert.deepEqual(outputs.map(o=>keys(o.terms)).sort(),[
    ["技能穿透:H","技能穿透:L","技能穿透:M"],["技能穿透:H","技能穿透:L","治疗效果:U"],
    ["技能穿透:H","技能穿透:M","治疗效果:U"],["技能穿透:L","技能穿透:M","治疗效果:U"]].sort());
  assert.ok(outputs.every(o=>o.probability===.25));
  const one=mat("o1",[term("技能穿透","L"),term("技能穿透","M"),term("技能穿透","H")]);
  assert.equal(preview([one,one,one])[0].probability,1);
});

test("shortage adds only legal H/M/U, preserves anchors, and never creates a third high", () => {
  const a=mat("b2",[term("防","H")],"wash");
  const outputs=preview([a,a]);
  assert.equal(outputs.length,9);
  for (const output of outputs) {assert.ok(keys(output.terms).includes("防:H")); assert.ok(!output.terms.some(t=>t.tier==="L")); assert.ok(output.terms.filter(t=>t.tier==="H").length<=2);}
  assert.ok(outputs.every(o=>o.probability===1/9));
});

test("two blue speeds expand hidden H/M and deduplicate equiprobable visible combinations", () => {
  for (const [dun,attr,count] of [["鬼遁","速",17],["龙遁","PVP速",17],["地遁","PVP速",9],["神遁","PVP速",9]]) {
    const a=mat("b2",[term(attr,"?")],"wash",dun);
    const outputs=preview([a,a]);
    assert.equal(outputs.length,count);
    assert.ok(outputs.every(o=>o.terms.some(t=>t.attr===attr)));
    assert.ok(outputs.every(o=>o.probability===1/count));
    assert.equal(outputs.filter(o=>keys(o.terms).includes(attr+":H")).length,["鬼遁","龙遁"].includes(dun)?9:0);
    assert.equal(outputs.filter(o=>keys(o.terms).includes(attr+":H")&&keys(o.terms).includes(attr+":M")).length,["鬼遁","龙遁"].includes(dun)?1:0);
  }
});

test("single blue ghost speed plus high defense has exactly two visible outcomes, order-independent", () => {
  const a=mat("b2",[term("速","?")],"wash","鬼遁"),b=mat("b2",[term("防","H")],"wash","鬼遁");
  const expected=[["速:H","防:H"],["速:M","防:H"]].sort();
  assert.deepEqual(preview([a,b]).map(o=>keys(o.terms)).sort(),expected);
  assert.deepEqual(preview([b,a]).map(o=>keys(o.terms)).sort(),expected);
  assert.ok(preview([a,b]).every(o=>o.probability===.5));
  for (const dun of ["地遁","神遁"]) {
    const outputs=preview([mat("b2",[term("PVP速","?")],"wash",dun),mat("b2",[term("闪避","U")],"wash",dun)]);
    assert.deepEqual(outputs.map(o=>keys(o.terms)),[["PVP速:M","闪避:U"]]);
  }
});

test("sampling respects cumulative boundaries and rejects invalid random values", () => {
  const a=mat("b2",[term("速","?")],"wash","鬼遁"),b=mat("b2",[term("防","H")],"wash","鬼遁");
  const outcomes=preview([a,b]);
  assert.equal(Rules.sample(outcomes,()=>0),outcomes[0]);
  assert.equal(Rules.sample(outcomes,()=>.499999),outcomes[0]);
  assert.equal(Rules.sample(outcomes,()=>.5),outcomes[1]);
  assert.equal(Rules.sample(outcomes,()=>.999999999),outcomes[1]);
  for (const value of [-.1,1,NaN,Infinity,"0.5"]) assert.throws(()=>Rules.sample(outcomes,()=>value),/random/i);
  assert.throws(()=>Rules.sample([],()=>0));
});

test("invalid value lookups never expose object prototype members", () => {
  for (const t of [null,term("unknown","H"),term("防","unknown"),term("防","toString"),term("防","__proto__"),term("防",["H"])]) {
    assert.equal(Rules.value(t,"o2"),null);
    assert.equal(Rules.label(t,"o2"),"");
  }
  assert.equal(Rules.value(term("防","H"),"unknown"),null);
});

test("p2 target cannot pretend to combine washed low with crafted middle", () => {
  const result=Rules.bestTargets("人遁","p2",["技能穿透","技能穿透"]);
  assert.deepEqual(result.targets,[]);
  assert.match(result.reason,/来源|洗|合/);
  assert.deepEqual(Rules.bestTargets("地遁","p2",["技能穿透","技能穿透"]).targets.map(keys),[["技能穿透:H","技能穿透:M"]]);
});

test("blue crafted materials remain valid although b1 crafting is outside simulation scope", () => {
  assert.equal(Rules.validate(mat("b2",[term("防","M")])).valid,true);
  assert.equal(Rules.validate(mat("b2",[term("速","?")],"crafted","鬼遁")).valid,true);
});

test("preview preserves caller data, identities include grade/dun/tier, and final grade has no recipe", () => {
  const a=mat("p2",[term("防御","H"),term("技能穿透","M")]);
  const before=JSON.stringify(a);
  assert.ok(preview([a,a]).length);
  assert.equal(JSON.stringify(a),before);
  assert.notEqual(Rules.signature(a),Rules.signature({...a,quality:"o1"}));
  assert.notEqual(Rules.signature(a),Rules.signature({...a,dun:"鬼遁"}));
  assert.notEqual(Rules.signature(a),Rules.signature({...a,terms:[term("防","H"),term("技能穿透","L")]}));
  assert.equal(Rules.preview([mat("o2",[term("技能穿透","H"),term("技能穿透","M"),term("技能穿透","L")])]).valid,false);
});

test("sampler rejects malformed or non-normalized probability distributions", () => {
  for (const outcomes of [[{probability:NaN}],[{probability:Infinity}],[{probability:0}],[{probability:-1}],[{probability:.5}],[null]]) {
    assert.throws(()=>Rules.sample(outcomes,()=>0));
  }
});

test("malformed tier arrays are rejected instead of string-coercing to a legal tier", () => {
  const a=mat("b2",[term("防",["H"])],"wash");
  assert.equal(Rules.validate(a).valid,false);
});
test("sparse terms are rejected instead of appearing to fill required slots", () => {
  assert.equal(Rules.validate(mat("p2",Array(2))).valid,false);
});
test("sparse materials return clear preview errors without UI exceptions", () => {
  assert.equal(Rules.preview(Array(2)).valid,false);
});
test("sparse selected target attrs are rejected", () => {
  assert.deepEqual(Rules.bestTargets("地遁","p2",Array(2)).targets,[]);
});
test("sparse sample distributions are rejected", () => {
  assert.throws(()=>Rules.sample(Array(2),()=>0));
});

test("alias normalization leaves unknown strings as strings rather than inherited prototype properties", () => {
  assert.equal(Rules.normalizeAttr("防御"),"防");
  assert.equal(Rules.normalizeAttr("toString"),"toString");
  assert.equal(Rules.normalizeAttr("__proto__"),"__proto__");
  assert.equal(Rules.normalizeAttr(null),null);
  assert.equal(Rules.normalizeDun("鬼盾"),"鬼遁");
  assert.equal(Rules.normalizeDun(null),null);
});
