'use strict';
// 1.1.58 snapshot fixture runner; NOT EXECUTED during document preparation.
// User-authorized usage: node --test <this-file> <current-project-root>
// node --test normally treats trailing args differently; recommended:
// QIN_PROJECT_ROOT=/path/to/project node --test <this-file>
// Only synthetic in-memory state/storage, never accesses player accounts.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(process.env.QIN_PROJECT_ROOT||path.join(__dirname,'../../..'));
const R=require(path.join(root,'js','inscription-rules.js'));
const Lab=require(path.join(root,'js','inscription-simulation.js'));
const State=require(path.join(root,'js','inscription-crafting-state.js'));
const Favorites=require(path.join(root,'js','inscription-route-favorites.js'));
const Paths=require(path.join(root,'js','inscription-paths.js'));
const spec=JSON.parse(fs.readFileSync(path.join(__dirname,'16_H01-H08_事件序列与逐步预期.json'),'utf8'));
const s=id=>spec.cases.find(c=>c.id===id);
const cp=v=>JSON.parse(JSON.stringify(v));
const t=(attr,tier)=>({attr,tier});
// A generic (no disciple/slot) workbench uses 天府 as its prefix.
const mat=(quality,origin,terms,dun='地遁',prefix='天府')=>({prefix,dun,quality,origin,terms:terms.map(([a,b])=>t(a,b))});
const k=m=>m.terms.map(x=>`${x.attr}:${x.tier}`).sort().join('|');
const qty=w=>w.lab.lots.reduce((sum,x)=>sum+x.quantity,0);
function baseLab(dun='地遁'){
  return Lab.upgrade({version:1,target:{discipleKey:'',slot:'',dun,quality:'o2',attrs: dun==='地遁'?['技能穿透','技能穿透','技能穿透']:['速','速','速']},simulation:{stage:'o1',inputs:[],refs:[],pending:null}});
}
const pWashA=mat('p2','wash',[['技能穿透','L'],['技能穿透','H']]);
const pWashB=mat('p2','wash',[['技能穿透','L'],['治疗效果','U']]);
const pCraft=mat('p2','crafted',[['技能穿透','M'],['技能穿透','H']]);
const o1a=mat('o1','crafted',[['技能穿透','H'],['技能穿透','L'],['技能穿透','M']]);
const o1b=mat('o1','crafted',[['技能穿透','H'],['技能穿透','M'],['治疗效果','U']]);
function mkRecord(id,output,inputs,prob){return {id,material:cp(output),probability:prob,promotion:'中级',inputs:inputs.map((m,i)=>({material:cp(m),lotId:null,recordId:null,source:m.origin==='wash'?'wash':'manual'}))};}
function seeded(records,lots){const w=baseLab();w.lab.records=records.map(cp);w.lab.lots=lots.map(cp);w.lab.sequence=records.length;Lab.validate(w);return w;}
function lot(id,m,q,source){return {id,material:cp(m),quantity:q,source:cp(source)};}
function idSource(id){return {type:'simulation',recordId:id};}
function acc(){const maps={A:new Map(),B:new Map()};let who='A',failMode='',readOnly=false;
 const storage={currentAccount:()=>({id:who}),getItem:k=>maps[who].get(k)??null,isReadOnly:()=>readOnly,setItem(k,v){if(failMode==='throw')throw Error('synthetic quota');if(failMode==='false'||readOnly)return false;maps[who].set(k,String(v));return true;}};
 return {storage,maps,switch:id=>{who=id;},fail:x=>{failMode=x;},readonly:x=>{readOnly=x;}};}
function act(w,action,payload){
 const before=cp(w),payloadBefore=payload&&JSON.stringify(payload);
 const next=Lab.act(w,action,payload);
 assert.deepEqual(w,before,`${action}: previous state was mutated`);
 assert.equal(payload&&JSON.stringify(payload),payloadBefore,`${action}: payload was mutated`);
 Lab.validate(next);
 return next;
}
const refs=w=>w.simulation.refs.filter(Boolean);
const lots=w=>w.lab.lots.map(x=>[x.id,x.quantity,x.source.type,x.source.recordId??null]);
function pending(w,{credited=false}={}){
 const result=w.simulation.pending, record=w.lab.records.at(-1), undo=w.lab.undo.at(-1);
 assert.ok(result);assert.equal(result.recordId,record.id);assert.equal(undo.recordId,record.id);
 assert.equal(undo.kind,'roll');assert.equal(undo.revision,w.lab.revision);
 if(credited){
  assert.deepEqual(undo.added,[result.creditedLot]);
  const output=w.lab.lots.find(x=>x.id===result.creditedLot);
  assert.equal(output.quantity,1);assert.deepEqual(output.source,idSource(record.id));
 }else{assert.equal(result.creditedLot,null);assert.deepEqual(undo.added,[]);}
}

test('H01 legitimate failed o1 recipe stocks A×2+B×1 are consumed once, credited once, and fully restored by undo',()=>{
 const w0=seeded([mkRecord('seed-a',o1a,[pWashA,pCraft],1),mkRecord('seed-b',o1b,[pWashB,pCraft],0.25)],
  [lot('A',o1a,2,idSource('seed-a')),lot('B',o1b,1,idSource('seed-b'))]);
 assert.equal(w0.lab.records.length,s('H01').expected.seedRecords);
 let w=act(w0,'select',{selection:[{id:'A',quantity:2},{id:'B',quantity:1}]});
 assert.deepEqual(refs(w),['A','A','B']);assert.deepEqual(lots(w),lots(w0));
 assert.equal(w.simulation.pending,null);assert.deepEqual(w.lab.undo,[]);assert.equal(w.lab.revision,w0.lab.revision);
 assert.equal(Lab.groups(w).reduce((x,g)=>x+g.reserved,0),3);
 const expected=['技能穿透:H','技能穿透:L','技能穿透:M','治疗效果:U'];
 const outcomes=Lab.preview(w).outcomes;
 const choose3=[];for(let omitted=0;omitted<expected.length;omitted++)choose3.push(expected.filter((_,i)=>i!==omitted).sort().join('|'));
 assert.deepEqual(outcomes.map(o=>k(o)).sort(),choose3.sort());
 assert.equal(outcomes.length,4);outcomes.forEach(o=>{assert.equal(o.probability,0.25);assert.equal(o.terms.length,3);assert.ok(o.terms.every(term=>expected.includes(`${term.attr}:${term.tier}`)));});
 const selected=cp(w);
 w=act(w,'roll',{random:()=>0});pending(w);
 assert.equal(w.lab.records.length,3);assert.equal(w.lab.lots.find(l=>l.id==='A').quantity,0);assert.equal(w.lab.lots.find(l=>l.id==='B').quantity,0);
 const inputs=w.lab.records.at(-1).inputs;assert.deepEqual(inputs.map(i=>i.recordId),['seed-a','seed-a','seed-b']);assert.ok(inputs.every(i=>i.source==='simulation'));
 assert.deepEqual(w.lab.undo.at(-1).consumed,[{id:'A',quantity:2},{id:'B',quantity:1}]);
 w=act(w,'credit');assert.equal(qty(w),1);pending(w,{credited:true});
 const credited=cp(w);assert.deepEqual(act(w,'credit'),credited);
 const route=Lab.route(w,w.simulation.pending.recordId);assert.deepEqual(route.tree.children.map(c=>c.node.sourceKey),['seed-a','seed-a','seed-b']);
 w=act(w,'back');assert.equal(qty(w),3);assert.deepEqual(w.lab.records,w0.lab.records);
 assert.deepEqual(lots(w),lots(w0));assert.deepEqual(w.simulation,selected.simulation);assert.deepEqual(w.lab.undo,[]);
 Lab.validate(w);assert.equal(qty(w0),3);
});

test('H02 equivalent signature with 2 distinct production records and manual source retains provenance',()=>{
 const x=mkRecord('record-1',o1a,[pWashA,pCraft],1),y=mkRecord('record-2',o1a,[pWashA,pCraft],1);
 let w=seeded([x,y],[lot('s1',o1a,1,idSource('record-1')),lot('s2',o1a,1,idSource('record-2')),lot('manual',o1a,1,{type:'manual'})]);
 const key=R.signature(o1a);
 assert.equal(Lab.groups(w).length,1);assert.equal(Lab.groups(w)[0].quantity,3);
 const original=JSON.stringify(w);
 assert.throws(()=>Lab.act(w,'group-quantity',{id:key,quantity:4}),/来源/);assert.equal(JSON.stringify(w),original);
 w=act(w,'group-quantity',{id:key,quantity:4,sourceRecordId:'record-1'});
 assert.equal(Lab.groups(w)[0].quantity,4);assert.equal(w.lab.lots.find(l=>l.id==='manual').quantity,1);
 assert.equal(w.lab.lots.at(-1).source.recordId,'record-1');assert.equal(w.lab.records.length,2);
 const stocked=cp(w);
 w=act(w,'select',{selection:[{id:key,quantity:3}]});
 assert.deepEqual(refs(w),['s1','s2','manual']);assert.deepEqual(lots(w),lots(stocked));
 assert.equal(Lab.groups(w)[0].reserved,3);w=act(w,'roll',{random:()=>0});pending(w);
 assert.equal(w.lab.records.at(-1).inputs.length,3);assert.deepEqual(w.lab.records.at(-1).inputs.map(i=>[i.source,i.recordId]),[['simulation','record-1'],['simulation','record-2'],['manual',null]]);assert.equal(qty(w),1);
 w=act(w,'back');assert.equal(qty(w),4);assert.deepEqual(w.lab.records,stocked.lab.records);
 assert.deepEqual(lots(w),lots(stocked));assert.equal(w.simulation.pending,null);assert.deepEqual(w.lab.undo,[]);
});

test('H03 selection reservation, atomic rejection, roll/credit/back and clear retain exact quantities',()=>{
 const A=mat('p1','crafted',[['技能穿透','H'],['闪避','U']]),B=mat('p1','crafted',[['技能穿透','M'],['闪避','U']]);
 let w=baseLab();w.simulation.stage='p1';w.lab.lots=[lot('A',A,2,{type:'manual'}),lot('B',B,2,{type:'manual'})];
 const initial=cp(w);
 w=act(w,'select',{selection:[{id:'A',quantity:2},{id:'B',quantity:1}]});
 assert.deepEqual(refs(w),['A','A','B']);assert.deepEqual(lots(w),lots(initial));
 assert.deepEqual(Lab.groups(w).map(g=>[g.quantity,g.reserved,g.available]),[[2,2,0],[2,1,1]]);
 const raw=JSON.stringify(w);assert.throws(()=>Lab.act(w,'select',{selection:[{id:'B',quantity:2}]}),/不足|超过/);assert.equal(JSON.stringify(w),raw);
 const selected=cp(w);
 w=act(w,'roll',{random:()=>0});assert.deepEqual(w.lab.lots.map(l=>l.quantity),[0,1]);pending(w);
 assert.deepEqual(w.lab.records.at(-1).inputs.map(x=>[x.lotId,x.source,x.recordId]),[['A','manual',null],['A','manual',null],['B','manual',null]]);
 w=act(w,'credit');assert.equal(qty(w),2);assert.equal(w.lab.records.length,1);pending(w,{credited:true});
 w=act(w,'back');assert.deepEqual(lots(w),lots(initial));assert.deepEqual(w.lab.records,[]);
 assert.deepEqual(w.simulation,selected.simulation);assert.deepEqual(w.lab.undo,[]);
 w=act(w,'clear-inputs');assert.equal(Lab.groups(w).reduce((x,g)=>x+g.reserved,0),0);
 assert.deepEqual(lots(w),lots(initial));assert.deepEqual(refs(w),[]);assert.equal(w.simulation.pending,null);
});

test('H04 favorite ruleVersion mismatch and damaged route never silently delete the stored record',async()=>{
 const f=acc(),fav=Favorites.createStore(f.storage,{uuid:()=> 'fav-id-1',now:()=> '2026-11-23T00:00:00.000Z'});
 const m=mat('o1','wash',[['技能穿透','H'],['技能穿透','L'],['闪避','U']],'地遁','天府');
 const input={route:{kind:'deterministic',tree:{kind:'wash',material:m,children:[],promotion:null},reuse:[]},target:{discipleKey:'',slot:'',dun:'地遁',quality:'o1',attrs:['闪避','技能穿透','技能穿透']},xAttr:'招架'};
 const first=await fav.toggle(input.route,input.target,input.xAttr,fav.inspect().token,'A');assert.equal(first.entries[0].valid,true);
 let saved=JSON.parse(f.storage.getItem(Favorites.KEY));saved.entries[0].rulesVersion='pre-upgrade';f.storage.setItem(Favorites.KEY,JSON.stringify(saved));
 const legacy=f.storage.getItem(Favorites.KEY);
 assert.equal(fav.inspect().entries[0].rulesUpdated,true);assert.equal(fav.inspect().entries[0].valid,true);
 assert.equal(f.storage.getItem(Favorites.KEY),legacy);
 saved.entries[0].route.tree.material.terms[0].tier='?';f.storage.setItem(Favorites.KEY,JSON.stringify(saved));
 const original=f.storage.getItem(Favorites.KEY),read=fav.inspect();assert.equal(read.valid,true);assert.equal(read.entries.length,1);assert.equal(read.entries[0].valid,false);
 assert.equal(read.entries[0].route,null);assert.equal(f.storage.getItem(Favorites.KEY),original);
 const removed=await fav.remove(read.entries[0].record.id,read.token,'A');assert.equal(removed.entries.length,0);
});

test('H05 A→B→A isolated synthetic account storage and per-account draft',()=>{
 const f=acc(),store=State.createStore(f.storage);
 store.updateDraft({note:'A saved'});const Araw=f.maps.A.get(State.KEY);const localUnsaved={note:'A unsaved'};
 f.switch('B');assert.deepEqual(store.snapshot().draft,{});store.updateDraft({note:'B saved'});const Braw=f.maps.B.get(State.KEY);
 assert.equal(f.maps.A.get(State.KEY),Araw);
 f.switch('A');assert.equal(store.snapshot().draft.note,'A saved');assert.equal(f.maps.A.get(State.KEY),Araw);assert.equal(f.maps.B.get(State.KEY),Braw);
 assert.equal(localUnsaved.note,'A unsaved');f.switch('B');assert.equal(store.snapshot().draft.note,'B saved');assert.equal(f.maps.B.get(State.KEY),Braw);
});

test('H06 malformed storage, setItem=false, throw, readonly fail without modifying original bytes',()=>{
 const f=acc(),store=State.createStore(f.storage);
 const bad='{"schemaVersion":1,"broken"';f.storage.setItem(State.KEY,bad);
 assert.equal(store.inspect().valid,false);assert.throws(()=>store.updateDraft({note:'forbidden'}));assert.equal(f.storage.getItem(State.KEY),bad);
 const g=acc(),store2=State.createStore(g.storage);
 store2.updateDraft({note:'baseline'});const raw=g.storage.getItem(State.KEY);
 for(const failure of ['false','throw']){g.fail(failure);assert.throws(()=>store2.updateDraft({note:'must not save'}),/保存|quota/);assert.equal(g.storage.getItem(State.KEY),raw);}
 g.fail('');g.readonly(true);assert.throws(()=>store2.updateDraft({note:'read only'}),/保存|只读/);assert.equal(g.storage.getItem(State.KEY),raw);
 g.readonly(false);store2.updateDraft({note:'success'});assert.equal(store2.snapshot().draft.note,'success');
});

test('H07 fixed triple penetration query preserves separate direct recipe vs representative strategy semantics',()=>{
 const goal=cp(s('H07').expected.goal);
 const direct=Paths.generate(goal),representative=Paths.representative(goal);
 assert.deepEqual(goal,s('H07').expected.goal);
 assert.equal(direct.valid,true);assert.equal(representative.valid,true);
 // 193 / 2 are strict 1.1.58 regression anchors only, not an identity between API sets.
 assert.equal(direct.routes.length,s('H07').expected.baselineDirectRecipes);
 assert.equal(representative.strategies.length,s('H07').expected.baselineRepresentativeStrategies);
 for(const route of direct.routes){assert.ok(route.inputs.every(x=>R.validate(x).valid));const preview=R.preview(route.inputs);const match=preview.outcomes.find(o=>R.signature(o.material)===route.targetSignature);assert.ok(match);assert.equal(match.probability,route.probability);}
 for(const route of representative.strategies){function walk(n){if(n.kind==='craft'){
    const inputs=n.children.flatMap(c=>Array.from({length:c.quantity},()=>c.node.material));const preview=R.preview(inputs);
    assert.equal(preview.valid,true);assert.ok(preview.outcomes.some(o=>R.signature(o.material)===R.signature(n.material)));
    assert.equal(preview.promotion,n.promotion);
  }n.children.forEach(c=>walk(c.node));}
  walk(route.tree);
 }
});

test('H08 256→257→337→1000 synthetic histories stay valid; tampered recipe is rejected',()=>{
 const records=[];const seen=new Set();
 // R.termsFor / R.preview are only WORKLOAD generators here; H08 is not an independent result oracle.
 outer: for(const prefix of R.prefixes)for(const info of R.duns){const ts=R.termsFor(info.id,'b2','wash');for(let i=0;i<ts.length;i++)for(let j=i;j<ts.length;j++){
  const a={prefix,dun:info.id,quality:'b2',origin:'wash',terms:[cp(ts[i])]},b={prefix,dun:info.id,quality:'b2',origin:'wash',terms:[cp(ts[j])]};
  const p=R.preview([a,b]);if(!p.valid)continue;const chosen=p.outcomes[0];
  const identity=JSON.stringify([a,b,chosen.material,chosen.probability]);if(seen.has(identity))continue;seen.add(identity);
  records.push({id:`workload-${records.length+1}`,material:cp(chosen.material),promotion:p.promotion,probability:chosen.probability,inputs:[{material:a,source:'wash',recordId:null,lotId:null},{material:b,source:'wash',recordId:null,lotId:null}]});
  if(records.length>=1000)break outer;
  }
 }
 assert.ok(records.length>=1000,`workload generator only produced ${records.length} different entries; do not silently reduce coverage`);
 const sample=baseLab();for(const n of s('H08').expected.sizes){
  const w=cp(sample);w.lab.records=records.slice(0,n);w.lab.sequence=n;
  const before=cp(w);Lab.validate(w);Lab.validate(w);assert.deepEqual(w,before);
  const tampered=cp(w);tampered.lab.records[n-1].material.terms[0].attr='NOT_AN_ATTRIBUTE';
  const bad=cp(tampered);assert.throws(()=>Lab.validate(tampered),/未知|不支持|词条|属性|格式/);assert.deepEqual(tampered,bad);
  Lab.validate(w);assert.deepEqual(w,before);
 }
});
