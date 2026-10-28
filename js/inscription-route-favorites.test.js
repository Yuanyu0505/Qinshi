'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Rules=require('./inscription-rules.js');
const Favorites=require('./inscription-route-favorites.js');
const Paths=require('./inscription-paths.js');

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

function xRoute(symbolicX=true,xTerm={attr:'闪避',tier:'U'}){
  const blue=terms=>({prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms});
  const base=(terms,xSource)=>({kind:'base',material:blue(terms),children:[],promotion:null,xSource});
  function craft(quality,terms,children,extra={}){
    const inputs=children.flatMap(c=>Array(c.quantity).fill(c.node.material)),preview=Rules.preview(inputs);
    const material={prefix:'天府',dun:'鬼遁',quality,origin:'crafted',terms},output=preview.outcomes.find(o=>Rules.signature(o.material)===Rules.signature(material));
    assert.ok(output);
    return {kind:'craft',material:output.material,children,promotion:preview.promotion,outcomes:preview.outcomes,probability:output.probability,sourceKey:JSON.stringify([Rules.signature(output.material),inputs.map(Rules.signature).sort()]),...extra};
  }
  const high={attr:'速',tier:'H'},mid={attr:'速',tier:'M'};
  const inputs=[{quantity:1,node:base([{attr:'速',tier:'?'}],false)},{quantity:1,node:base([xTerm],symbolicX)}];
  const highSource=craft('p1',[high,xTerm],inputs),midSource=craft('p1',[mid,xTerm],inputs);
  const tree=craft('p2',[high,mid],[{quantity:2,node:highSource},{quantity:1,node:midSource}]);
  const failure=(source,terms)=>({kind:'failure',material:source.outcomes.find(o=>o.material.terms.some(t=>t.tier===terms.tier&&t.attr===terms.attr)).material,children:[],promotion:null,sourceKey:source.sourceKey});
  const reuse=craft('p2',[high,mid],[{quantity:2,node:failure(highSource,mid)},{quantity:1,node:failure(midSource,high)}],{coverageReuse:true});
  return {route:{kind:'probability',tree,reuse:[reuse],xTerm,symbolicX},target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'p2',attrs:['速','速']},xAttr:xTerm.attr};
}

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

test('symbolic X and failure production metadata survive compact favorite round trips',async()=>{
  const f=fixture(),saved=await toggle(f,xRoute()),entry=saved.entries[0],raw=f.storage.getItem(Favorites.KEY);
  assert.equal(entry.valid,true);
  assert.deepEqual(entry.route.xTerm,{attr:'闪避',tier:'U'});assert.equal(entry.route.symbolicX,true);
  assert.match(raw,/"xSource":true/);assert.match(raw,/"sourceKey":/);assert.match(raw,/"coverageReuse":true/);
  assert.doesNotMatch(raw,/"(?:outcomes|probability|hasChance)"\s*:/);
  assert.equal(entry.route.reuse[0].probability,1/3);
  assert.equal(entry.route.reuse[0].children.reduce((sum,c)=>sum+c.quantity,0),3);
});

test('concrete X identity distinguishes symbolic mode and exact attribute tiers',async()=>{
  const f=fixture(),symbolic=xRoute(),concrete=xRoute(false);
  await toggle(f,symbolic);await toggle(f,concrete);
  assert.equal(f.store.inspect().entries.length,2);
  const fixed=Favorites.prepare(concrete.route,concrete.target,concrete.xAttr);
  const changed={...concrete.route,xTerm:{attr:'防',tier:'H'}};
  assert.equal(Favorites.match([fixed],changed,concrete.target,'防'),null);
  const tiered=Favorites.prepare(changed,concrete.target,'防');
  assert.equal(Favorites.match([tiered],{...changed,xTerm:{attr:'防',tier:'M'}},concrete.target,'防'),null);
  assert.equal(f.store.inspect().entries.find(e=>e.route.symbolicX===false).route.tree.children[0].node.children.some(c=>c.node.xSource===true),false);
});

test('two concrete tier choices save independently and retain their physical source materials',async()=>{
  const f=fixture();
  await toggle(f,xRoute(false,{attr:'防',tier:'H'}));await toggle(f,xRoute(false,{attr:'防',tier:'M'}));
  const entries=f.store.inspect().entries;
  assert.equal(entries.length,2);
  assert.deepEqual(entries.map(entry=>entry.route.xTerm.tier).sort(),['H','M']);
  for(const entry of entries){
    assert.equal(entry.valid,true);assert.equal(entry.route.symbolicX,false);
    const blue=entry.route.tree.children[0].node.children.find(child=>child.node.material.terms.some(term=>term.attr==='防'));
    assert.deepEqual(blue.node.material.terms,[entry.route.xTerm]);
  }
});

test('wrong failure producer references invalidate saved reuse without replacing it',()=>{
  const input=xRoute(),saved=Favorites.prepare(input.route,input.target,input.xAttr);
  saved.route.reuse[0].children[0].node.sourceKey='a-different-producer';
  assert.throws(()=>Favorites.rehydrate(saved),/失败产物|生产/);
});

test('legacy reuse with ambiguous physical failure signatures is retained as invalid',()=>{
  const input=speedRoute(),preview=input.route.tree.outcomes,high={attr:'速',tier:'H'},mid={attr:'速',tier:'M'},x={attr:'闪避',tier:'U'},other={attr:'招架',tier:'U'};
  const pair=terms=>preview.find(o=>terms.every(t=>o.material.terms.some(u=>u.attr===t.attr&&u.tier===t.tier))).material;
  const left=input.route.tree,right={...input.route.tree,material:pair([high,x])};
  const rootPreview=Rules.preview([left.material,left.material,right.material]),target=rootPreview.outcomes.find(o=>o.material.terms.every(t=>t.attr==='速'));
  const tree={kind:'craft',material:target.material,children:[{quantity:2,node:left},{quantity:1,node:right}],promotion:null};
  const reuse={kind:'craft',material:target.material,promotion:null,children:[{quantity:2,node:{kind:'failure',material:pair([mid,other]),children:[]}},{quantity:1,node:{kind:'failure',material:pair([high,other]),children:[]}}]};
  const saved=Favorites.prepare({kind:'probability',tree,reuse:[reuse]},{...input.target,quality:'p2'},'闪避');
  const entry=Favorites.inspectRecord({...saved,id:'ambiguous',createdAt:'2026-10-28',updatedAt:'2026-10-28',rulesVersion:'observable-equal-speed17-v1'});
  assert.equal(entry.valid,false);assert.match(entry.errors[0],/生产步骤关联不明确/);
  assert.deepEqual(entry.record.route,saved.route);
});

test('illegal X source metadata is rejected rather than relabeling a different physical term',()=>{
  const input=xRoute(),saved=Favorites.prepare(input.route,input.target,input.xAttr);
  const producer=saved.route.tree.children[0].node;
  producer.children.find(c=>c.node.material.terms[0].attr==='速').node.xSource=true;
  assert.throws(()=>Favorites.rehydrate(saved),/X|杂词条/);
});

test('a concrete X may share a target attribute when its exact tier is different',()=>{
  const input=washRoute(),candidate=Favorites.prepare({...input.route,xTerm:{attr:'技能穿透',tier:'M'},symbolicX:false},input.target,'技能穿透');
  const route=Favorites.rehydrate(candidate);
  assert.deepEqual(route.xTerm,{attr:'技能穿透',tier:'M'});
  assert.equal(route.symbolicX,false);
});

test('a saved craft source key must still identify its own expanded physical recipe',()=>{
  const input=xRoute(),saved=Favorites.prepare(input.route,input.target,input.xAttr);
  saved.route.tree.sourceKey='another-recipe';
  assert.throws(()=>Favorites.rehydrate(saved),/生产步骤|配方/);
});

test('legacy records rehydrate when legal and remain unchanged on inspection',async()=>{
  const f=fixture();await toggle(f,xRoute());const data=JSON.parse(f.storage.getItem(Favorites.KEY)),record=data.entries[0];
  record.rulesVersion='observable-equal-speed17-v1';delete record.route.xTerm;delete record.route.symbolicX;
  function legacy(node){delete node.xSource;delete node.sourceKey;delete node.coverageReuse;node.children.forEach(c=>legacy(c.node));}
  legacy(record.route.tree);record.route.reuse.forEach(legacy);
  f.storage.setItem(Favorites.KEY,JSON.stringify(data));const raw=f.storage.getItem(Favorites.KEY),entry=f.store.inspect().entries[0];
  assert.equal(entry.valid,true);assert.equal(entry.rulesUpdated,true);assert.equal(entry.route.symbolicX,true);
  assert.equal(f.storage.getItem(Favorites.KEY),raw);
});

test('three-common targets save when symbolic fallback X is only an unused placeholder',async()=>{
  const target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o1',attrs:['闪避','招架','治疗效果']};
  const plan=Paths.representative({prefix:'天府',...target});
  assert.equal(plan.valid,true);assert.deepEqual(plan.xTerm,{attr:'闪避',tier:'U'});assert.equal(plan.symbolicX,true);
  const f=fixture(),saved=await toggle(f,{route:plan.strategies[0],target,xAttr:plan.xAttr}),entry=saved.entries[0];
  assert.equal(entry.valid,true);assert.deepEqual(entry.route.tree.material.terms.map(term=>term.attr).sort(),['招架','治疗效果','闪避'].sort());
  function hasSource(node){return node.xSource===true||node.children.some(child=>hasSource(child.node));}
  assert.equal(hasSource(entry.route.tree),false);
});

test('legacy symbolic fallback overlapping a target is not inferred as a physical X source',()=>{
  const material={prefix:'天府',dun:'鬼遁',quality:'o1',origin:'wash',terms:[{attr:'闪避',tier:'U'},{attr:'招架',tier:'U'},{attr:'治疗效果',tier:'U'}]};
  const route={kind:'deterministic',tree:{kind:'wash',material,children:[],promotion:null},reuse:[]};
  const target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o1',attrs:['闪避','招架','治疗效果']};
  const candidate=Favorites.prepare(route,target,'闪避'),hydrated=Favorites.rehydrate(candidate);
  assert.equal(hydrated.symbolicX,true);assert.notEqual(hydrated.tree.xSource,true);
  const marked=JSON.parse(JSON.stringify(candidate));marked.route.tree.xSource=true;
  assert.throws(()=>Favorites.rehydrate(marked),/杂词条 X 来源/);
  const concrete=JSON.parse(JSON.stringify(candidate));concrete.route.xTerm={attr:'闪避',tier:'U'};concrete.route.symbolicX=false;
  assert.throws(()=>Favorites.rehydrate(concrete),/目标词条冲突/);
});
