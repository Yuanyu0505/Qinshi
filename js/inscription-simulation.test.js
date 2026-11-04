'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('./inscription-rules.js');
const Lab=require('./inscription-simulation.js');
function fresh(){return Lab.upgrade({version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速']},simulation:{stage:'b2',inputs:[[{attr:'速',tier:'?'}],[{attr:'速',tier:'?'}]],pending:null}});}
const total=w=>w.lab.lots.reduce((n,l)=>n+l.quantity,0);

// These public-action cases catch provenance loss, guessing between recipes,
// foreign-record injection, and accidental migration of previously manual stock.
for(const action of ['group-quantity','quantity']){
 const increase=(w,quantity,extra={})=>Lab.act(w,action,{id:action==='quantity'?w.lab.lots[0].id:R.signature(w.lab.lots[0].material),quantity,...extra});
 test(action+' inherits one unique source without drawing or fabricating records',()=>{
  const w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'credit');
  const records=JSON.stringify(w.lab.records),before=JSON.stringify(w),source=w.lab.records[0].id;
  const grown=increase(w,4);
  assert.equal(total(grown),4);assert.equal(JSON.stringify(w),before);
  assert.equal(JSON.stringify(grown.lab.records),records);
  assert.deepEqual(grown.lab.lots.map(l=>l.source),[{type:'simulation',recordId:source},{type:'simulation',recordId:source}]);
  assert.deepEqual(grown.lab.lots.map(l=>l.quantity),[1,3]);
 });
 test(action+' requires a selected recipe when distinct matching sources exist',()=>{
  let w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'repeat');
  w=Lab.act(Lab.act(w,'roll',{random:()=>0}),'repeat');
  const before=JSON.stringify(w),records=JSON.stringify(w.lab.records),source=w.lab.records[1].id;
  assert.throws(()=>increase(w,5),/来源/);assert.equal(JSON.stringify(w),before);
  const grown=increase(w,5,{sourceRecordId:source});
  assert.equal(grown.lab.lots.at(-1).source.recordId,source);
  assert.equal(total(grown),action==='quantity'?6:5);
  assert.equal(JSON.stringify(grown.lab.records),records);
 });
 test(action+' rejects missing or foreign recipe selections atomically',()=>{
  let w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'repeat');
  w=Lab.act(Lab.act(w,'roll',{random:()=>.999}),'repeat');
  const before=JSON.stringify(w),foreign=w.lab.records[1].id;
  assert.notEqual(R.signature(w.lab.records[0].material),R.signature(w.lab.records[1].material));
  for(const sourceRecordId of ['missing-record',foreign,null,'']){
   assert.throws(()=>increase(w,4,{sourceRecordId}),/来源/);
   assert.equal(JSON.stringify(w),before);
  }
 });
 test(action+' leaves old manual lots unchanged when inheriting a simulated source',()=>{
  let w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'credit');
  w.lab.lots.push({id:'old-manual',material:structuredClone(w.lab.lots[0].material),quantity:2,source:{type:'manual'}});
  const manual=JSON.stringify(w.lab.lots[1]);
  w=increase(w,5);
  assert.equal(JSON.stringify(w.lab.lots[1]),manual);
  assert.equal(w.lab.lots.at(-1).source.recordId,w.lab.records[0].id);
  assert.equal(w.lab.lots.at(-1).quantity,action==='quantity'?4:2);
 });
 test(action+' keeps a manual-only group manual and cannot attach an unrelated record',()=>{
  let w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'credit');
  const recordId=w.lab.records[0].id;
  w=Lab.act(w,'reset',{stage:'p1'});
  w.lab.lots[0].source={type:'manual'};
  const before=JSON.stringify(w);
  assert.throws(()=>increase(w,3,{sourceRecordId:recordId}),/来源/);assert.equal(JSON.stringify(w),before);
  const grown=increase(w,3);
  assert.equal(total(grown),3);assert.ok(grown.lab.lots.every(l=>l.source.type==='manual'));
  assert.equal(JSON.stringify(grown.lab.records),JSON.stringify(w.lab.records));
 });
 test(action+' deduplicates several batches carrying the same recipe source',()=>{
  let w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'credit');
  w.lab.lots.push({...structuredClone(w.lab.lots[0]),id:'same-recipe',quantity:2});
  const grown=increase(w,5);
  assert.ok(grown.lab.lots.every(l=>l.source.recordId===w.lab.records[0].id));
  assert.equal(total(grown),action==='quantity'?7:5);
 });
 test(action+' inherited additions still block conflicting synthesis undo',()=>{
  const w=Lab.act(Lab.act(fresh(),'roll',{random:()=>0}),'credit');
  const grown=increase(w,3),before=JSON.stringify(grown);
  assert.throws(()=>Lab.act(grown,'back'),/改变|冲突/);
  assert.equal(JSON.stringify(grown),before);
 });
}

test('interactive synthesis defaults to automatic credit and repeat immediately adds one fresh result',()=>{
 let w=Lab.act(fresh(),'simulate',{random:()=>0});assert.equal(w.lab.autoCredit,true);assert.equal(total(w),1);
 const first=w.simulation.pending.recordId;w=Lab.act(w,'repeat-simulate',{random:()=>.999});
 assert.ok(w.simulation.pending);assert.notEqual(w.simulation.pending.recordId,first);assert.equal(total(w),2);assert.equal(w.lab.records.length,2);
 w=Lab.act(w,'retry',{random:()=>0});assert.equal(total(w),2);assert.equal(w.lab.records.length,2);
 w=Lab.act(w,'back');assert.equal(total(w),1);
});

test('automatic credit can be disabled without forced saving while starting another batch',()=>{
 let w=Lab.act(fresh(),'auto-credit',{enabled:false});w=Lab.act(w,'simulate',{random:()=>0});assert.equal(total(w),0);
 w=Lab.act(w,'repeat-simulate',{random:()=>0});assert.equal(total(w),0);assert.equal(w.lab.records.length,2);
 w=Lab.act(w,'credit');assert.equal(total(w),1);w=Lab.act(w,'retry',{random:()=>0});assert.equal(total(w),1);
 assert.equal(Lab.upgrade(w).lab.autoCredit,false);
});

test('editing material after a result starts a new batch and retains the prior credited result',()=>{
 let w=Lab.act(fresh(),'simulate',{random:()=>0}),record=w.simulation.pending.recordId;
 w=Lab.act(w,'edit-material',{index:0,terms:[{attr:'防',tier:'H'}]});
 assert.equal(w.simulation.pending,null);assert.equal(w.simulation.inputs[0][0].attr,'防');assert.equal(total(w),1);
 assert.equal(w.lab.records[0].id,record);assert.equal(Lab.preview(w).valid,true);
});

test('repeated backpack synthesis with insufficient remaining stock is atomic',()=>{
 let w=Lab.act(threePurple(),'simulate',{random:()=>0});const before=JSON.stringify(w);
 assert.throws(()=>Lab.act(w,'repeat-simulate',{random:()=>0}),/不足/);assert.equal(JSON.stringify(w),before);assert.equal(total(w),1);
 w=Lab.act(w,'prepare',{clear:true});assert.equal(w.simulation.stage,'p1');assert.equal(w.simulation.pending,null);assert.equal(w.simulation.refs.length,0);
 assert.ok(w.simulation.inputs.every(a=>a.every(t=>t===null)));assert.equal(total(w),1);
});

test('retry of a repeated batch reuses returned equivalent stock without charging the spent lot',()=>{
 let w=fresh();const m={prefix:'天府',dun:'鬼遁',quality:'p1',origin:'crafted',terms:[{attr:'速',tier:'H'},{attr:'速',tier:'M'}]};
 w.simulation={stage:'p1',inputs:[],refs:[],pending:null};w.lab.lots=['A','B'].map(id=>({id,material:m,quantity:3,source:{type:'manual'}}));
 w=Lab.act(w,'select',{selection:[{id:'A',quantity:3}]});w=Lab.act(w,'simulate',{random:()=>0});w=Lab.act(w,'repeat-simulate',{random:()=>0});
 assert.deepEqual(w.lab.records.at(-1).inputs.map(i=>i.lotId),['B','B','B']);
 w=Lab.act(w,'retry',{random:()=>0});assert.deepEqual(w.lab.records.at(-1).inputs.map(i=>i.lotId),['B','B','B']);
 assert.equal(w.lab.lots.find(l=>l.id==='A').quantity,0);assert.equal(w.lab.lots.find(l=>l.id==='B').quantity,0);assert.equal(total(w),2);
 w=Lab.act(w,'back');assert.equal(w.lab.lots.find(l=>l.id==='B').quantity,3);assert.ok(w.simulation.pending);assert.equal(w.lab.records.length,1);
});

test('enabling automatic credit before retry saves its replacement exactly once',()=>{
 let w=Lab.act(fresh(),'auto-credit',{enabled:false});w=Lab.act(w,'simulate',{random:()=>0});
 assert.equal(total(w),0);w=Lab.act(w,'auto-credit',{enabled:true});w=Lab.act(w,'retry',{random:()=>0});
 assert.equal(total(w),1);assert.ok(w.simulation.pending.creditedLot);w=Lab.act(w,'retry',{random:()=>.999});assert.equal(total(w),1);assert.equal(w.lab.records.length,1);
 w=Lab.act(w,'back');assert.equal(total(w),0);assert.equal(w.lab.records.length,0);
});

test('refill of an identical group repairs spent refs using the selected existing source',()=>{
 let w=Lab.act(threePurple(),'roll',{random:()=>0});w=Lab.act(w,'repeat');
 const id=R.signature(w.lab.lots[0].material),records=JSON.stringify(w.lab.records);
 const source=w.lab.lots[0].source.recordId;
 w=Lab.act(w,'group-quantity',{id,quantity:4,sourceRecordId:source});
 const group=Lab.groups(w).find(g=>g.id===id);
 assert.deepEqual([group.quantity,group.available,group.reserved],[4,1,3]);
 assert.ok(w.simulation.refs.every(ref=>w.lab.lots.find(l=>l.id===ref).source.recordId===source));
 assert.equal(Lab.preview(w).valid,true);assert.equal(JSON.stringify(w.lab.records),records);
 w=Lab.act(w,'roll',{random:()=>0});
 assert.ok(w.lab.records.at(-1).inputs.every(i=>i.source==='simulation'&&i.recordId===source));
});

test('loading a legacy depleted reference uses only identical stock and preserves valid reservations',()=>{
 const w=fresh(),m={prefix:'天府',dun:'鬼遁',quality:'p2',origin:'crafted',terms:[{attr:'速',tier:'H'},{attr:'速',tier:'M'}]};
 w.simulation={stage:'p2',inputs:[m.terms,m.terms],refs:['valid','spent'],pending:null};
 w.lab.lots=[{id:'valid',material:m,quantity:1,source:{type:'manual'}},{id:'spent',material:m,quantity:0,source:{type:'manual'}},{id:'refill',material:m,quantity:3,source:{type:'manual'}}];
 const before=JSON.stringify(w),upgraded=Lab.upgrade(w);
 assert.deepEqual(upgraded.simulation.refs,['valid','refill']);assert.equal(JSON.stringify(w),before);
 assert.equal(Lab.preview(upgraded).valid,true);
 const wrong=JSON.parse(before);wrong.lab.lots[2].material={...m,prefix:'天同'};
 assert.throws(()=>Lab.preview(Lab.upgrade(wrong)),/不足/);
});

test('clear all current inputs frees reservations without removing stock history or current stage',()=>{
 const w=threePurple(),inventory=JSON.stringify(w.lab.lots),history=JSON.stringify(w.lab.records);
 const cleared=Lab.act(w,'clear-inputs');
 assert.equal(cleared.simulation.stage,'p1');assert.equal(cleared.simulation.refs.some(Boolean),false);
 assert.ok(cleared.simulation.inputs.every(terms=>terms.every(t=>t===null)));
 assert.equal(JSON.stringify(cleared.lab.lots),inventory);assert.equal(JSON.stringify(cleared.lab.records),history);
 assert.equal(Lab.selectionCapacity(cleared),3);
 const pending=Lab.act(w,'roll',{random:()=>0});assert.throws(()=>Lab.act(pending,'clear-inputs'),/结果/);
});
test('a credited result is idempotent and retry replaces it without accumulating',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');assert.equal(total(w),1);
 w=Lab.act(w,'credit');assert.equal(total(w),1);
 const id=w.simulation.pending.recordId;w=Lab.act(w,'retry',{random:()=>0});
 assert.equal(total(w),1);assert.equal(w.simulation.pending.attempt,2);assert.equal(w.simulation.pending.same,true);
 assert.notEqual(w.simulation.pending.recordId,id);assert.equal(w.lab.records.length,1);
});
test('next reserves a credited product and back restores the prior scene without extra credit',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});const signature=R.signature(w.simulation.pending.material);
 w=Lab.act(w,'next');assert.equal(w.simulation.stage,'p1');assert.ok(w.simulation.refs[0]);assert.equal(total(w),1);
 w=Lab.act(w,'back');assert.equal(w.simulation.stage,'b2');assert.equal(R.signature(w.simulation.pending.material),signature);assert.equal(total(w),0);
 w=Lab.act(w,'back');assert.equal(w.simulation.pending,null);assert.equal(w.lab.records.length,0);
});
test('manual mid tiers are rejected; generated mid tiers may be selected from inventory',()=>{
 const w=fresh();w.simulation.stage='p1';w.simulation.inputs=Array.from({length:3},()=>[{attr:'速',tier:'M'},{attr:'防',tier:'H'}]);w.simulation.refs=[];
 assert.throws(()=>Lab.preview(w),/洗练/);
});
test('quantity increments inherit the unique source and invalidate conflicting undo',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');const lot=w.lab.lots[0];
 w=Lab.act(w,'quantity',{id:lot.id,quantity:4});assert.equal(total(w),4);
 assert.equal(w.lab.lots.filter(l=>l.source.type==='simulation').reduce((n,l)=>n+l.quantity,0),4);
 assert.ok(w.lab.lots.every(l=>l.source.recordId===lot.source.recordId));
 assert.throws(()=>Lab.act(w,'back'),/背包.*改变|冲突/);
 const route=Lab.route(w,w.simulation.pending.recordId);assert.equal(route.tree.kind,'craft');assert.equal(route.tree.children.length,2);
});
test('backpack use enforces multiplicity and same prefix/dun/quality',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'next');const id=w.simulation.refs[0];
 assert.throws(()=>Lab.act(w,'select',{selection:[{id,quantity:2}]}),/不足/);
 w=Lab.act(w,'edit',{index:0,terms:[null,null]});
 w=Lab.act(w,'select',{selection:[{id,quantity:1}]});assert.equal(w.simulation.refs[0],id);
 w=Lab.act(w,'clear-bag');assert.equal(total(w),0);assert.equal(w.simulation.refs.some(Boolean),false);
});
test('legacy crafted entries require explicit adoption instead of being silently removed',()=>{
 const old=fresh();delete old.lab;old.simulation={stage:'p2',inputs:[[{attr:'速',tier:'H'},{attr:'速',tier:'M'}],[]],pending:null};
 old.simulation.inputs[1]=[{attr:'速',tier:'L'},{attr:'闪避',tier:'U'}];
 const w=Lab.upgrade(old);assert.equal(w.simulation.legacy,true);assert.deepEqual(w.simulation.inputs,old.simulation.inputs);
 const adopted=Lab.act(w,'adopt-legacy');assert.ok(adopted.simulation.refs[0]);assert.equal(adopted.lab.lots[0].source.type,'manual');
});
test('clearing a credited result does not trap the scene or silently recreate it',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');w=Lab.act(w,'clear-bag');
 assert.throws(()=>Lab.act(w,'next'),/已从背包移除/);
 w=Lab.act(w,'repeat');assert.equal(w.simulation.pending,null);assert.equal(total(w),0);
});
test('manual edits stay protected after undoing a later navigation event',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');
 w=Lab.act(w,'quantity',{id:w.lab.lots[0].id,quantity:2});
 w=Lab.act(w,'next');w=Lab.act(w,'back');assert.throws(()=>Lab.act(w,'back'),/背包已手动改变/);
});
test('partial legacy crafted terms remain visible in an archived draft after explicit adoption',()=>{
 const w=fresh();delete w.lab;w.simulation={stage:'p1',inputs:[[{attr:'速',tier:'M'},null],[null,null],[null,null]],pending:null};
 const migrated=Lab.upgrade(w);assert.equal(migrated.simulation.legacy,true);
 const adopted=Lab.act(migrated,'adopt-legacy');
 assert.deepEqual(adopted.lab.legacyDrafts[0].simulation.inputs[0],[{attr:'速',tier:'M'},null]);
 assert.deepEqual(adopted.simulation.inputs[0],[null,null]);assert.equal(total(adopted),0);
});
function threePurple(){
 let w=fresh();for(let i=0;i<3;i++){w=Lab.act(w,'roll',{random:()=>0});w=Lab.act(w,'repeat');}
 w=Lab.act(w,'reset',{stage:'p1'});
 return Lab.act(w,'select',{selection:w.lab.lots.filter(l=>l.quantity>0).map(l=>({id:l.id,quantity:1}))});
}
test('backpack ingredients are debited once across credit and retry and restored on back',()=>{
 let w=threePurple();const inputs=w.simulation.refs.slice();
 w=Lab.act(w,'roll',{random:()=>0});assert.ok(inputs.every(id=>w.lab.lots.find(l=>l.id===id).quantity===0));
 w=Lab.act(w,'credit');w=Lab.act(w,'retry',{random:()=>0});
 assert.ok(inputs.every(id=>w.lab.lots.find(l=>l.id===id).quantity===0));assert.equal(total(w),1);
 w=Lab.act(w,'back');assert.ok(inputs.every(id=>w.lab.lots.find(l=>l.id===id).quantity===1));assert.equal(total(w),3);
});
test('clear after a backpack-backed result keeps consumed-source identity for repeat',()=>{
 let w=Lab.act(threePurple(),'roll',{random:()=>0});w=Lab.act(w,'credit');w=Lab.act(w,'clear-bag');
 w=Lab.act(w,'repeat');assert.equal(w.simulation.pending,null);
 assert.throws(()=>Lab.preview(w),/不足/);w=Lab.act(w,'reset');assert.equal(total(w),0);
});
test('actual route traces used simulated parents and excludes discarded retry outputs',()=>{
 let w=Lab.act(threePurple(),'roll',{random:()=>0});const abandoned=w.simulation.pending.recordId;
 w=Lab.act(w,'retry',{random:()=>0});const route=Lab.route(w,w.simulation.pending.recordId);
 assert.notEqual(route.tree.sourceKey,abandoned);assert.equal(route.tree.children.length,3);
 assert.ok(route.tree.children.every(c=>c.node.kind==='craft'&&c.node.material.quality==='p1'));
 assert.ok(route.tree.children.every(c=>c.node.children.every(i=>i.node.kind==='base'&&i.node.material.quality==='b2')));
 assert.ok(!JSON.stringify(route).includes(abandoned));
});
test('old manual stock stays a trace leaf beside existing simulated chains',()=>{
 let w=threePurple();
 const manual={id:'old-manual',material:structuredClone(w.lab.lots[0].material),quantity:1,source:{type:'manual'}};
 w.lab.lots.push(manual);
 const others=w.simulation.refs.slice(1).map(id=>({id,quantity:1}));
 for(let i=0;i<3;i++)w=Lab.act(w,'edit',{index:i,terms:[null,null]});
 w=Lab.act(w,'select',{selection:[{id:manual.id,quantity:1},...others]});w=Lab.act(w,'roll',{random:()=>0});
 const route=Lab.route(w,w.simulation.pending.recordId);
 assert.equal(route.tree.children[0].node.kind,'base');assert.equal(route.tree.children[0].node.material.quality,'p1');
 assert.equal(route.tree.children[0].node.sourceLabel,'手动补充');
});

test('equivalent backpack materials group without losing separate actual source routes',()=>{
 let w=threePurple();w=Lab.act(w,'reset',{stage:'p1'});
 const source=w.lab.lots[0].source.recordId;
 w=Lab.act(w,'quantity',{id:w.lab.lots[0].id,quantity:3,sourceRecordId:source});
 const groups=Lab.groups(w);assert.equal(groups.length,1);
 const group=groups[0];assert.equal(group.quantity,5);assert.equal(group.available,5);assert.equal(group.reserved,0);
 assert.equal(group.lots.length,4);assert.equal(group.id,R.signature(group.material));
 assert.equal(group.lots.filter(l=>l.source.type==='simulation').length,4);
 group.lots.filter(l=>l.source.type==='simulation').forEach(l=>assert.equal(Lab.route(w,l.source.recordId).tree.sourceKey,l.source.recordId));
 assert.equal(group.lots.at(-1).quantity,2);assert.equal(group.lots.at(-1).source.recordId,source);
 const before=JSON.stringify(w);group.lots[0].quantity=900;assert.equal(JSON.stringify(w),before);
});

test('picker fills only empty slots and preserves partial and completed hand entries',()=>{
 let w=threePurple();w=Lab.act(w,'reset',{stage:'p1'});
 w=Lab.act(w,'edit',{index:0,terms:[{attr:'速',tier:'H'},null]});
 w=Lab.act(w,'edit',{index:2,terms:[{attr:'速',tier:'H'},{attr:'防',tier:'H'}]});
 const before=JSON.parse(JSON.stringify(w.simulation.inputs));
 w=Lab.act(w,'select',{selection:[{id:w.lab.lots[0].id,quantity:1}]});
 assert.deepEqual(w.simulation.inputs[0],before[0]);assert.deepEqual(w.simulation.inputs[2],before[2]);
 assert.equal(w.simulation.refs[1],w.lab.lots[0].id);assert.equal(Lab.selectionCapacity(w),0);
 const full=JSON.stringify(w);assert.throws(()=>Lab.act(w,'select',{selection:[{id:w.lab.lots[1].id,quantity:1}]}),/空.*材料位|空位/);
 assert.equal(JSON.stringify(w),full);
});

test('group picker subtracts existing reserved stock and atomically validates combined selections',()=>{
 let w=threePurple();w=Lab.act(w,'reset',{stage:'p1'});const id=w.lab.lots[0].id;
 w=Lab.act(w,'select',{selection:[{id,quantity:1}]});
 const group=Lab.groups(w)[0];assert.equal(group.available,2);assert.equal(group.reserved,1);assert.equal(Lab.selectionCapacity(w),2);
 const snapshot=JSON.stringify(w);
 assert.throws(()=>Lab.act(w,'select',{selection:[{id,quantity:1}]}),/不足/);
 assert.throws(()=>Lab.act(w,'select',{selection:[{id:group.id,quantity:1},{id:group.id,quantity:2}]}),/不足|空.*材料位|空位/);
 assert.equal(JSON.stringify(w),snapshot);
 w=Lab.act(w,'select',{selection:[{id:group.id,quantity:2}]});
 assert.equal(w.simulation.refs[0],id);assert.equal(new Set(w.simulation.refs).size,3);assert.equal(Lab.groups(w)[0].available,0);
 w=Lab.act(w,'roll',{random:()=>0});
 assert.ok(Lab.route(w,w.simulation.pending.recordId).tree.children.every(c=>c.node.kind==='craft'));
});

test('group quantity additions inherit selected provenance and reductions respect exact lot reservations',()=>{
 let w=threePurple();w=Lab.act(w,'reset',{stage:'p1'});const first=w.lab.lots[0].id;
 w=Lab.act(w,'select',{selection:[{id:first,quantity:1}]});const id=Lab.groups(w)[0].id;
 const source=w.lab.lots[0].source.recordId;
 w=Lab.act(w,'group-quantity',{id,quantity:6,sourceRecordId:source});assert.equal(total(w),6);
 assert.equal(w.lab.records.length,3);assert.equal(w.lab.lots.find(l=>l.id===first).quantity,1);
 assert.equal(w.lab.lots.at(-1).quantity,3);assert.equal(w.lab.lots.at(-1).source.recordId,source);
 w=Lab.act(w,'group-quantity',{id,quantity:1});assert.equal(total(w),1);
 assert.equal(w.lab.lots.find(l=>l.id===first).quantity,1);assert.equal(w.simulation.refs[0],first);
 const snapshot=JSON.stringify(w);assert.throws(()=>Lab.act(w,'group-remove',{id}),/占用/);assert.equal(JSON.stringify(w),snapshot);
 w=Lab.act(w,'edit',{index:0,terms:[null,null]});w=Lab.act(w,'group-remove',{id});
 assert.equal(total(w),0);assert.equal(Lab.groups(w).length,0);assert.equal(w.lab.records.length,3);
});

test('picker keeps legacy source confirmation mandatory',()=>{
 let w=threePurple();w=Lab.act(w,'reset',{stage:'p1'});w.simulation.legacy=true;
 const before=JSON.stringify(w);
 assert.throws(()=>Lab.act(w,'select',{selection:[{id:w.lab.lots[0].id,quantity:1}]}),/旧现场|来源/);
 assert.equal(JSON.stringify(w),before);
});

test('group selection reuses the unique simulated parent recipe for each expanded quantity',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'repeat');w=Lab.act(w,'reset',{stage:'p1'});
 const id=Lab.groups(w)[0].id;w=Lab.act(w,'group-quantity',{id,quantity:3});
 w=Lab.act(w,'select',{selection:[{id,quantity:3}]});w=Lab.act(w,'roll',{random:()=>0});
 const children=Lab.route(w,w.simulation.pending.recordId).tree.children;
 assert.deepEqual(children.map(c=>c.node.kind),['craft','craft','craft']);
 assert.ok(children.every(c=>c.node.sourceKey===w.lab.records[0].id));
 assert.equal(children.flatMap(c=>c.node.children).length,6);
 assert.ok(children.flatMap(c=>c.node.children).every(c=>c.node.kind==='base'&&c.node.material.quality==='b2'));
 assert.equal(w.lab.records.length,2);
 const graph=require('./inscription-flow-model.js').project(Lab.route(w,w.simulation.pending.recordId));
 assert.equal(graph.operations.filter(o=>o.quality==='p1').length,1);
 assert.equal(graph.materials.find(m=>m.material.quality==='p1').demand,3);
 assert.equal(graph.materials.find(m=>m.material.quality==='b2').demand,6);
 assert.deepEqual(graph.operations.find(o=>o.quality==='p1').sourceKeys,[w.lab.records[0].id]);
});

test('picker accepts several grouped kinds and rejects mixed over-allocation without mutation',()=>{
 let w=fresh();w=Lab.act(w,'roll',{random:()=>0});w=Lab.act(w,'repeat');
 w=Lab.act(w,'roll',{random:()=>0.999});w=Lab.act(w,'repeat');w=Lab.act(w,'reset',{stage:'p1'});
 const groups=Lab.groups(w);assert.equal(groups.length,2);
 const before=JSON.stringify(w),first=w.lab.lots[0].id;
 assert.throws(()=>Lab.act(w,'select',{selection:[{id:groups[0].id,quantity:1},{id:first,quantity:1}]}),/不足/);
 assert.equal(JSON.stringify(w),before);
 w=Lab.act(w,'select',{selection:groups.map(g=>({id:g.id,quantity:1}))});
 assert.equal(w.simulation.refs.filter(Boolean).length,2);assert.equal(Lab.selectionCapacity(w),1);
 assert.deepEqual(w.lab.lots.map(l=>l.quantity),[1,1]);
 assert.throws(()=>Lab.act(w,'select',{selection:[{id:groups[1].id,quantity:-1}]}),/非负整数/);
});
test('account storage persists bag and history without touching another account',()=>{
 const State=require('./inscription-crafting-state.js'),accounts={one:new Map(),two:new Map()};let active='one';
 const storage={currentAccount:()=>({id:active}),getItem:k=>accounts[active].get(k)??null,setItem:(k,v)=>accounts[active].set(k,v)};
 const store=State.createWorkbench(storage),initial=store.inspect();
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');
 assert.equal(store.save(w,initial.token,'one').valid,true);
 const raw=storage.getItem(State.KEY);assert.equal(total(Lab.upgrade(store.inspect().state)),1);
 active='two';assert.equal(total(Lab.upgrade(store.inspect().state)),0);
 active='one';assert.equal(storage.getItem(State.KEY),raw);assert.equal(store.inspect().state.lab.undo.length,1);
});
