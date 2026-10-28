"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("./inscription-rules.js");
const State = require("./inscription-crafting-state.js");
const material = (terms, quality = "p2", origin = "crafted") => ({ prefix: "天同", dun: "地遁", quality, origin, terms: terms.map(([attr,tier]) => ({attr,tier})) });
const a = material([["技能穿透","L"],["治疗效果","U"]], "p2", "wash");
const b = material([["技能穿透","M"],["技能穿透","H"]]);
function fixture() {
  const accounts = { one: new Map(), two: new Map() }; let active = "one", failure = null, counter = 0;
  const storage = { currentAccount: () => ({id:active}), getItem: key => accounts[active].get(key) ?? null, setItem(key,value) { if (failure === "throw") throw new Error("quota"); if (failure === "false") return false; accounts[active].set(key,String(value)); } };
  const store = State.createStore(storage, { uuid: () => "id-" + (++counter) });
  const goal = () => store.saveGoal({ name:"三穿", prefix:"天同", dun:"地遁", quality:"o2", attrs:["技能穿透","技能穿透","技能穿透"] });
  return { store, goal, storage, accounts, switchTo: value => { active=value; }, fail: value => { failure=value; } };
}
function setup() { const f=fixture(); f.id=f.goal(); f.store.setActual(a,2); f.store.setActual(b,2); f.store.copyActual(f.id); f.store.setSelection(f.id,[Rules.signature(a),Rules.signature(b)]); return f; }

test("optional X choices follow the selected position and exclude exact requested terms", () => {
  const target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速']};
  const choices=State.xOptions(target);
  assert.ok(choices.some(t=>t.attr==='防'&&t.tier==='H'));
  assert.ok(choices.some(t=>t.attr==='血'&&t.tier==='M'));
  assert.ok(choices.some(t=>t.attr==='闪避'&&t.tier==='U'));
  assert.ok(!choices.some(t=>t.attr==='速'||t.attr==='技能穿透'));
  assert.deepEqual(State.xOptions({...target,dun:''}),[]);
  assert.ok(!State.xOptions({...target,discipleKey:'test',slot:'天府|人遁'}).some(t=>t.attr==='速'));
  assert.ok(State.xOptions({...target,attrs:['速','速','防']}).some(t=>t.attr==='速'&&t.tier==='L'));
  assert.ok(!State.xOptions({...target,quality:'b2',attrs:['防']}).some(t=>t.tier==='?'));
});

test("optional X saves independently of simulation inputs and defaults to symbolic mode", () => {
  const f=fixture(),workbench=State.createWorkbench(f.storage),fresh=workbench.inspect();
  assert.equal(fresh.valid,true);assert.equal(fresh.state.target.xTerm,null);
  const value=fresh.state;
  value.target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速'],xTerm:{attr:'血',tier:'M'}};
  value.simulation={stage:'b2',inputs:[[{attr:'速',tier:'?'}],[{attr:'速',tier:'?'}]],pending:null};
  let saved=workbench.save(value,fresh.token,'one');
  assert.equal(saved.valid,true);assert.deepEqual(saved.state.target.xTerm,{attr:'血',tier:'M'});
  const original=JSON.parse(JSON.stringify(saved.state.simulation));
  saved.state.target.xTerm=null;saved=workbench.save(saved.state,saved.token,'one');
  assert.deepEqual(saved.state.simulation,original);assert.equal(saved.state.target.xTerm,null);
  saved.state.target.xTerm={attr:'速',tier:'H'};
  assert.throws(()=>workbench.save(saved.state,saved.token,'one'),/杂词/);
  f.switchTo('two');assert.equal(workbench.inspect().state.target.xTerm,null);
});

test("legacy targets without X remain readable without rewriting stored data", () => {
  const f=fixture(),simple={version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速']},simulation:{stage:'b2',inputs:[],pending:null}};
  f.store.updateDraft({simpleWorkbench:simple});const raw=f.storage.getItem(State.KEY);
  assert.equal(State.createWorkbench(f.storage).inspect().valid,true);
  assert.equal(f.storage.getItem(State.KEY),raw);
});

test("old double-blue-speed pending probability migrates without losing token or inventory", () => {
  const f=fixture(), speed={prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]};
  f.store.setActual(b,7);
  const outcome=Rules.preview([speed,speed]).outcomes.find(o=>o.terms.some(t=>t.attr==='速'&&t.tier==='M'));
  const simple={version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','防']},simulation:{stage:'b2',inputs:[speed.terms,speed.terms],pending:{id:'legacy',material:{...outcome.material,prefix:'天府'},probability:1/9}}};
  // Unspecified disciple uses the first shared prefix, not a mixed prefix.
  simple.simulation.pending.material.prefix=Rules.prefixes[0];
  f.store.updateDraft({simpleWorkbench:simple});
  const workbench=State.createWorkbench(f.storage), inspected=workbench.inspect();
  assert.equal(inspected.valid,true);
  assert.equal(inspected.state.simulation.pending.probability,1/17);
  assert.equal(JSON.parse(inspected.token).simulation.pending.probability,1/9);
  assert.equal(workbench.save(inspected.state,inspected.token,'one').valid,true);
  assert.equal(f.store.snapshot().actual[0].quantity,7);
  const corrupted=JSON.parse(JSON.stringify(simple));
  corrupted.simulation.pending.material.terms=[{attr:'速',tier:'H'},{attr:'闪避',tier:'U'}];
  f.store.updateDraft({simpleWorkbench:corrupted});
  assert.equal(workbench.inspect().valid,false);
});
test("actual totals merge source identity, quantities reject noninteger and wildcard", () => {
  const f=fixture(); f.store.setActual(b,2); f.store.setActual({...b,origin:"wash",terms:[{attr:"防",tier:"H"},{attr:"治疗效果",tier:"U"}]},1);
  const common=material([["治疗效果","U"],["闪避","U"]]); f.store.setActual(common,2); f.store.setActual({...common,origin:"wash"},3);
  assert.equal(f.store.snapshot().actual.length,3); assert.equal(f.store.snapshot().actual.find(x=>x.signature===Rules.signature(common)).quantity,3);
  for (const qty of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>f.store.setActual(a,qty));
  assert.throws(()=>f.store.setActual({...a,terms:[{attr:"X",tier:"U"}]},1)); f.store.setActual(common,0); assert.equal(f.store.snapshot().actual.length,2);
});
test("multiple named goals share actual stock but isolated replaceable simulation snapshots", () => {
  const f=setup(), second=f.goal(); f.store.copyActual(second); f.store.addVirtual(f.id,b,1);
  assert.equal(f.store.snapshot().actual.find(x=>x.signature===Rules.signature(b)).quantity,2);
  assert.equal(f.store.snapshot().workspaces[second].inventory.find(x=>x.signature===Rules.signature(b)).quantity,2);
  f.store.deleteGoal(f.id); assert.equal(f.store.snapshot().actual.length,2); assert.ok(f.store.snapshot().workspaces[second]);
  assert.throws(()=>f.store.saveGoal({prefix:"wrong",dun:"地遁",quality:"o2",attrs:["技能穿透"]}));
});
test("roll and retry only replace persistent pending; commit credits once and leaves actual untouched", () => {
  const f=setup(), before=f.store.snapshot(); f.store.roll(f.id,()=>0); const pending=f.store.snapshot().workspaces[f.id].pending;
  assert.deepEqual(f.store.snapshot().workspaces[f.id].inventory,before.workspaces[f.id].inventory);
  const restored=State.createStore(f.storage); assert.equal(restored.snapshot().workspaces[f.id].pending.id,pending.id);
  restored.retry(f.id,()=>0.999); const retried=restored.snapshot().workspaces[f.id].pending;
  assert.notDeepEqual(retried.result,pending.result); assert.equal(retried.id,pending.id); assert.deepEqual(retried.inputs,pending.inputs);
  restored.commitPending(f.id,"next",retried.id); const after=restored.snapshot();
  assert.equal(after.workspaces[f.id].stage,"o1"); assert.equal(after.workspaces[f.id].inventory.reduce((n,x)=>n+x.quantity,0),3);
  assert.deepEqual(after.actual,before.actual); assert.throws(()=>restored.commitPending(f.id,"next",retried.id));
});
test("repeat preserves recipe intent but rejects next roll after stock is exhausted", () => {
  const f=setup(); f.store.roll(f.id,()=>0); let p=f.store.snapshot().workspaces[f.id].pending; f.store.commitPending(f.id,"repeat",p.id);
  assert.equal(f.store.snapshot().workspaces[f.id].selection.length,2); f.store.roll(f.id,()=>0); p=f.store.snapshot().workspaces[f.id].pending; f.store.commitPending(f.id,"repeat",p.id);
  assert.throws(()=>f.store.roll(f.id,()=>0),/库存/);
});
test("edits invalidate pending, token mismatch cannot commit, invalid rng makes no write", () => {
  const f=setup(); f.store.roll(f.id,()=>0); assert.throws(()=>f.store.commitPending(f.id,"next","wrong"));
  f.store.addVirtual(f.id,b,1); assert.equal(f.store.snapshot().workspaces[f.id].pending,null);
  const raw=f.storage.getItem(State.KEY); assert.throws(()=>f.store.roll(f.id,()=>1)); assert.equal(f.storage.getItem(State.KEY),raw);
  f.store.resetSimulation(f.id); assert.equal(f.store.snapshot().workspaces[f.id].inventory.length,0); assert.equal(f.store.snapshot().actual.length,2);
});
test("failed writes preserve saved transaction and allow exactly one later commit", () => {
  for (const failure of ["false","throw"]) { const f=setup(); f.store.roll(f.id,()=>0); const raw=f.storage.getItem(State.KEY), id=f.store.snapshot().workspaces[f.id].pending.id;
    f.fail(failure); assert.throws(()=>f.store.commitPending(f.id,"next",id),/保存/); assert.equal(f.storage.getItem(State.KEY),raw);
    f.fail(null); f.store.commitPending(f.id,"next",id); assert.throws(()=>f.store.commitPending(f.id,"next",id)); }
});
test("same adapter switches accounts without cached inventory or goals", () => {
  const f=setup(); f.switchTo("two"); assert.equal(f.store.snapshot().goals.length,0); const id=f.goal(); f.store.updateDraft({quality:"p1"});
  f.switchTo("one"); assert.equal(f.store.snapshot().goals[0].id,f.id); assert.equal(f.store.snapshot().draft.quality,undefined);
  f.switchTo("two"); assert.equal(f.store.snapshot().goals[0].id,id);
});
test("malformed and unknown schema data are retained and saves blocked", () => {
  for (const raw of ["broken",'{"schemaVersion":999}', '{"schemaVersion":1}']) { const f=fixture(); f.storage.setItem(State.KEY,raw);
    assert.equal(f.store.inspect().valid,false); assert.throws(()=>f.store.snapshot()); assert.throws(()=>f.goal()); assert.equal(f.storage.getItem(State.KEY),raw); }
});
test("selection enforces same recipe, concrete source, and signature multiplicity", () => {
  const f=setup(); assert.throws(()=>f.store.setSelection(f.id,[Rules.signature(a),Rules.signature(a),Rules.signature(a)]));
  assert.throws(()=>f.store.addVirtual(f.id,{...a,origin:"crafted"},1)); assert.throws(()=>f.store.setSelection(f.id,[Rules.signature(a)]));
  const snap=f.store.snapshot(); snap.actual.length=0; assert.equal(f.store.snapshot().actual.length,2);
});
test("a workspace refuses otherwise valid recipes from another goal slot", () => {
  const f=setup(), foreignA={...a,prefix:"天府"},foreignB={...b,prefix:"天府"};
  f.store.addVirtual(f.id,foreignA,1); f.store.addVirtual(f.id,foreignB,1);
  assert.throws(()=>f.store.setSelection(f.id,[Rules.signature(foreignA),Rules.signature(foreignB)]),/目标/);
});
test("renaming accepts equivalent term order but refuses to retarget an existing goal", () => {
  const f=setup(), goal=f.store.snapshot().goals[0];
  assert.equal(f.store.saveGoal({...goal,name:"renamed",targetTerms:goal.targetTerms.slice().reverse()}),f.id);
  assert.equal(f.store.snapshot().goals[0].name,"renamed");
  assert.throws(()=>f.store.saveGoal({...goal,attrs:["防","防","防"]}),/目标/);
});
test("consumed token cannot match a subsequent transaction even if injected UUID repeats", () => {
  const f=setup(); const repeated=State.createStore(f.storage,{uuid:()=>"repeated"});
  repeated.roll(f.id,()=>0); const first=repeated.snapshot().workspaces[f.id].pending.id; repeated.commitPending(f.id,"repeat",first);
  repeated.roll(f.id,()=>0); const next=repeated.snapshot().workspaces[f.id].pending.id;
  assert.notEqual(first,next); assert.throws(()=>repeated.commitPending(f.id,"repeat",first));
});
test("clear pending, total virtual edits and stage changes preserve goal and actual collections", () => {
  const f=setup(); f.store.roll(f.id,()=>0); f.store.clearPending(f.id); assert.equal(f.store.snapshot().workspaces[f.id].pending,null);
  f.store.setVirtual(f.id,a,7); assert.equal(f.store.snapshot().workspaces[f.id].inventory.find(e=>e.signature===Rules.signature(a)).quantity,7);
  f.store.setVirtual(f.id,a,0); assert.ok(!f.store.snapshot().workspaces[f.id].inventory.some(e=>e.signature===Rules.signature(a)));
  f.store.setStage(f.id,"p1"); const state=f.store.snapshot(); assert.equal(state.workspaces[f.id].stage,"p1"); assert.deepEqual(state.workspaces[f.id].selection,[]);
  assert.equal(state.actual.length,2); assert.equal(state.goals.length,1); assert.throws(()=>f.store.setStage(f.id,"b1"));
});
test("all invalid random endpoints leave raw storage and pending unchanged", () => {
  const f=setup(), raw=f.storage.getItem(State.KEY);
  for(const random of [-1,1,Infinity,NaN,"0"]) { assert.throws(()=>f.store.roll(f.id,()=>random)); assert.equal(f.storage.getItem(State.KEY),raw); }
  f.store.roll(f.id,()=>0); const pendingRaw=f.storage.getItem(State.KEY); assert.throws(()=>f.store.retry(f.id,()=>1)); assert.equal(f.storage.getItem(State.KEY),pendingRaw);
});
test("corrupt pending and duplicate inventory are blocked without replacing the original payload", () => {
  const f=setup(); f.store.roll(f.id,()=>0); const state=f.store.snapshot(); state.workspaces[f.id].pending.inputs[0].quantity=999;
  f.storage.setItem(State.KEY,JSON.stringify(state)); const raw=f.storage.getItem(State.KEY); assert.equal(f.store.inspect().valid,false); assert.throws(()=>f.store.clearPending(f.id)); assert.equal(f.storage.getItem(State.KEY),raw);
  const clean=setup(), next=clean.store.snapshot(); next.actual.push(next.actual[0]); clean.storage.setItem(State.KEY,JSON.stringify(next)); assert.equal(clean.store.inspect().valid,false);
});
test("reentrant account or inventory changes during a draw cannot overwrite newer account data", () => {
  const f=setup(), original=f.storage.getItem(State.KEY);
  assert.throws(()=>f.store.roll(f.id,()=>{f.switchTo("two");return 0;}),/改变/);
  assert.equal(f.storage.getItem(State.KEY),null); f.switchTo("one"); assert.equal(f.storage.getItem(State.KEY),original);
  assert.throws(()=>f.store.roll(f.id,()=>{f.store.setActual(a,9);return 0;}),/改变/);
  assert.equal(f.store.snapshot().actual.find(e=>e.signature===Rules.signature(a)).quantity,9); assert.equal(f.store.snapshot().workspaces[f.id].pending,null);
});
