'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Rules=require('./inscription-rules.js');
const Favorites=require('./inscription-route-favorites.js');

function fixture(){
  const accounts={one:new Map(),two:new Map()};let active='one',failure='',readOnly=false,serial=0;
  const storage={
    currentAccount:()=>({id:active}),getItem:key=>accounts[active].get(key)??null,isReadOnly:()=>readOnly,
    setItem(key,value){if(failure==='throw')throw new Error('quota');if(failure==='false'||readOnly)return false;accounts[active].set(key,String(value));return true;}
  };
  const store=Favorites.createStore(storage,{uuid:()=>`favorite-${++serial}`,now:()=>new Date(1793116800000+serial).toISOString()});
  return {storage,store,accounts,switchTo:id=>{active=id;},fail:mode=>{failure=mode;},readonly:value=>{readOnly=value;}};
}
function speedRoute(){
  const blue={prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]};
  const preview=Rules.preview([blue,blue]),output=preview.outcomes.find(outcome=>outcome.material.terms.length===2&&outcome.material.terms.every(term=>term.attr==='速'));
  assert.ok(output);
  const route={kind:'probability',tree:{kind:'craft',material:output.material,promotion:'初级',children:[{quantity:2,node:{kind:'base',material:blue,children:[],probability:null,hasChance:false}}],probability:1/9,outcomes:preview.outcomes,hasChance:true},reuse:[]};
  return {route,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'p1',attrs:['速','速']},xAttr:'闪避'};
}
function washRoute(){
  const material={prefix:'天府',dun:'地遁',quality:'o1',origin:'wash',terms:[{attr:'技能穿透',tier:'H'},{attr:'技能穿透',tier:'L'},{attr:'闪避',tier:'U'}]};
  return {route:{kind:'deterministic',tree:{kind:'wash',material,children:[],promotion:null,probability:null,hasChance:false},reuse:[]},target:{discipleKey:'',slot:'',dun:'地遁',quality:'o1',attrs:['闪避','技能穿透','技能穿透']},xAttr:'招架'};
}
function toggle(f,input,token=f.store.inspect().token){return f.store.toggle(input.route,input.target,input.xAttr,token,f.storage.currentAccount().id);}

test('favorites store compact trees, keep generic ownership unbound, and rebuild current probabilities',async()=>{
  const f=fixture(),input=speedRoute(),saved=await toggle(f,input),raw=f.storage.getItem(Favorites.KEY),record=saved.entries[0].record;
  assert.equal(saved.valid,true);assert.equal(record.owner.discipleKey,'');assert.equal(record.owner.tian,'');
  assert.deepEqual(record.owner.attrs,['速','速']);assert.equal(record.rulesVersion,Favorites.RULES_VERSION);
  assert.doesNotMatch(raw,/"(?:outcomes|probability|hasChance)"\s*:/);
  assert.equal(saved.entries[0].route.tree.probability,1/17);
  assert.equal(saved.entries[0].route.tree.outcomes.length,17);
  assert.equal(record.route.tree.children[0].quantity,2);
  assert.equal(f.storage.getItem('qinshi_inscription_crafting_v1'),null);
});

test('leaf washing starts at its own quality, and target identity is an unordered multiset',async()=>{
  const f=fixture(),input=washRoute(),saved=await toggle(f,input),record=saved.entries[0].record;
  assert.equal(saved.entries[0].route.tree.kind,'wash');assert.deepEqual(saved.entries[0].route.tree.children,[]);
  assert.equal(saved.entries[0].route.tree.probability,null);
  assert.equal(Favorites.match([record],input.route,{...input.target,attrs:['技能穿透','闪避','技能穿透']},input.xAttr).id,record.id);
  assert.equal(Favorites.match([record],input.route,{...input.target,attrs:['技能穿透','闪避','防']},input.xAttr),null);
  const removed=await toggle(f,{...input,target:{...input.target,attrs:input.target.attrs.slice().reverse()}});
  assert.deepEqual(removed.entries,[]);
});

test('washing favorites reject hidden production subtrees instead of hiding a saved step',()=>{
  const input=washRoute(),candidate=Favorites.prepare(input.route,input.target,input.xAttr);
  candidate.route.tree.children=[{quantity:1,node:speedRoute().route.tree}];
  assert.throws(()=>Favorites.rehydrate(candidate));
});

test('same adapter keeps accounts isolated and refuses a queued write after switching account',async()=>{
  const f=fixture(),input=speedRoute();await toggle(f,input);const first=f.accounts.one.get(Favorites.KEY);
  f.switchTo('two');assert.deepEqual(f.store.inspect().entries,[]);await toggle(f,input);
  assert.equal(f.accounts.one.get(Favorites.KEY),first);
  const pending=toggle(f,washRoute());f.switchTo('one');await assert.rejects(pending,/账号已切换/);
  assert.equal(f.accounts.one.get(Favorites.KEY),first);
});

test('stale tab revisions and concurrent writes never replace another saved collection',async()=>{
  const f=fixture(),input=speedRoute(),token=f.store.inspect().token;
  const first=toggle(f,input,token),second=toggle(f,washRoute(),token);
  await first;const current=f.storage.getItem(Favorites.KEY);
  await assert.rejects(second,/其他页面更新/);
  assert.equal(f.storage.getItem(Favorites.KEY),current);assert.equal(f.store.inspect().entries.length,1);
});

test('write rejection, quota and read-only ownership leave saved bytes unchanged',async()=>{
  for(const mode of ['false','throw','readonly']){
    const f=fixture(),input=speedRoute();await toggle(f,input);const before=f.storage.getItem(Favorites.KEY);
    if(mode==='readonly')f.readonly(true);else f.fail(mode);
    await assert.rejects(toggle(f,input),/只读|拒绝|quota/);
    assert.equal(f.storage.getItem(Favorites.KEY),before);
  }
});

test('unreachable saved recipes remain as invalid records without writing or replacing their tree',async()=>{
  const f=fixture();await toggle(f,speedRoute());const saved=JSON.parse(f.storage.getItem(Favorites.KEY));
  saved.entries[0].route.tree.children[0].quantity=1;f.storage.setItem(Favorites.KEY,JSON.stringify(saved));
  const raw=f.storage.getItem(Favorites.KEY),result=f.store.inspect();
  assert.equal(result.valid,true);assert.equal(result.entries[0].valid,false);assert.equal(result.entries[0].route,null);
  assert.equal(result.entries[0].record.route.tree.children[0].quantity,1);assert.equal(f.storage.getItem(Favorites.KEY),raw);
  const removed=await f.store.remove(result.entries[0].record.id,result.token,'one');assert.deepEqual(removed.entries,[]);
});

test('a malformed favorite is retained when the user saves a fresh valid copy of that route',async()=>{
  const f=fixture(),input=speedRoute();await toggle(f,input);const saved=JSON.parse(f.storage.getItem(Favorites.KEY));
  saved.entries[0].createdAt=null;f.storage.setItem(Favorites.KEY,JSON.stringify(saved));
  const result=await toggle(f,input);assert.equal(result.entries.length,2);
  assert.equal(result.entries.filter(entry=>entry.valid).length,1);assert.equal(result.entries.filter(entry=>!entry.valid).length,1);
});

test('unknown envelopes or foreign ownership preserve original bytes and block changes',async()=>{
  for(const raw of ['broken',JSON.stringify({schemaVersion:999}),JSON.stringify({schemaVersion:1,accountId:'two',revision:0,entries:[]})]){
    const f=fixture();f.storage.setItem(Favorites.KEY,raw);assert.equal(f.store.inspect().valid,false);
    await assert.rejects(toggle(f,speedRoute()));assert.equal(f.storage.getItem(Favorites.KEY),raw);
  }
});
