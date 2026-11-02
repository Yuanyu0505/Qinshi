'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('./inscription-rules.js');
const Lab=require('./inscription-simulation.js');
function fresh(){return Lab.upgrade({version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速']},simulation:{stage:'b2',inputs:[[{attr:'速',tier:'?'}],[{attr:'速',tier:'?'}]],pending:null}});}
const total=w=>w.lab.lots.reduce((n,l)=>n+l.quantity,0);
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
test('quantity increments are independent manual lots and invalidate conflicting undo',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'credit');const lot=w.lab.lots[0];
 w=Lab.act(w,'quantity',{id:lot.id,quantity:4});assert.equal(total(w),4);
 assert.equal(w.lab.lots.filter(l=>l.source.type==='manual').reduce((n,l)=>n+l.quantity,0),3);
 assert.throws(()=>Lab.act(w,'back'),/背包.*改变|冲突/);
 const route=Lab.route(w,w.simulation.pending.recordId);assert.equal(route.tree.kind,'craft');assert.equal(route.tree.children.length,2);
});
test('backpack use enforces multiplicity and same prefix/dun/quality',()=>{
 let w=Lab.act(fresh(),'roll',{random:()=>0});w=Lab.act(w,'next');const id=w.simulation.refs[0];
 assert.throws(()=>Lab.act(w,'select',{selection:[{id,quantity:2}]}),/不足/);
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
test('manually incremented material is a trace leaf, not a copied simulated chain',()=>{
 let w=threePurple(),first=w.simulation.refs[0];
 w=Lab.act(w,'quantity',{id:first,quantity:2});const manual=w.lab.lots.find(l=>l.source.type==='manual');
 const others=w.simulation.refs.slice(1).map(id=>({id,quantity:1}));
 w=Lab.act(w,'select',{selection:[{id:manual.id,quantity:1},...others]});w=Lab.act(w,'roll',{random:()=>0});
 const route=Lab.route(w,w.simulation.pending.recordId);
 assert.equal(route.tree.children[0].node.kind,'base');assert.equal(route.tree.children[0].node.material.quality,'p1');
 assert.equal(route.tree.children[0].node.sourceLabel,'手动补充');
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
