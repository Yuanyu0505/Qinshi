const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('./inscription-reverse.js');
function storage(){const data=new Map();let owner='a',readonly=false;return {data,currentAccount:()=>({id:owner}),getItem:k=>data.get(owner+':'+k)??null,setItem:(k,v)=>{if(readonly)return false;data.set(owner+':'+k,v);return true;},owner:v=>owner=v,readonly:v=>readonly=v};}
const target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速'],xTerm:null};
test('locator stores migrate old direct/reverse drafts read-only, isolate children and never write simulation',()=>{
 assert.equal(typeof X.createLocatorStore,'function');const s=storage();s.setItem('qinshi_inscription_path_query_v1',JSON.stringify(target));
 s.setItem('qinshi_inscription_reverse_paths_v1',JSON.stringify({version:1,draft:{quality:'p2',dun:'人遁',attrs:['技能穿透','']},editing:true}));
 const direct=X.createLocatorStore(s,'crafting-paths','direct'),reverse=X.createLocatorStore(s,'crafting-paths','reverse');
 assert.equal(direct.inspect().value.target.dun,'鬼遁');assert.deepEqual(reverse.inspect().value.reverse.attrs,['技能穿透','']);
 const before=s.getItem('qinshi_inscription_path_query_v1'),r=reverse.inspect();r.value.target.dun='地遁';reverse.save(r.value,r.token,'a');
 assert.equal(direct.inspect().value.target.dun,'鬼遁');assert.equal(s.getItem('qinshi_inscription_path_query_v1'),before);assert.equal(s.getItem('qinshi_inscription_crafting_v1'),null);
});
test('locator writes reject stale/corrupt/readonly and switched-account state without destroying old bytes',()=>{
 const s=storage(),store=X.createLocatorStore(s,'crafting-simulator','direct');const a=store.inspect();a.value.target=target;
 const saved=store.save(a.value,a.token,'a');assert.throws(()=>store.save(a.value,null,'a'),/其他页面/);
 s.readonly(true);assert.throws(()=>store.save(a.value,saved.token,'a'),/只读|拒绝/);s.readonly(false);assert.equal(store.inspect().token,saved.token);
 s.owner('b');assert.equal(store.inspect().value.target.dun,'');assert.throws(()=>store.save(a.value,null,'a'),/账号/);
 s.setItem(store.key,'broken');assert.equal(store.inspect().valid,false);assert.throws(()=>store.save(a.value,'broken','b'),/异常/);assert.equal(s.getItem(store.key),'broken');
});
test('reverse result filters and queried marker survive reload per child and account',()=>{
 const s=storage(),a=X.createLocatorStore(s,'crafting-paths','reverse'),b=X.createLocatorStore(s,'crafting-simulator','reverse');const v=a.inspect().value;
 v.filters={ordinary:true,group:'common',prefix:'天府',dun:'人遁',search:'盖聂'};v.queried=true;
 a.save(v,null,'a');assert.deepEqual(a.inspect().value.filters,v.filters);assert.equal(b.inspect().value.filters.ordinary,false);assert.equal(b.inspect().value.queried,false);
 s.owner('b');assert.equal(a.inspect().value.queried,false);
});
test('locator stores retain pending search text and quarantine malformed reverse terms',()=>{
 const s=storage(),store=X.createLocatorStore(s,'crafting-paths','direct'),v=store.inspect().value;v.search='盖聂';
 store.save(v,null,'a');assert.equal(store.inspect().value.search,'盖聂');
 const damaged=store.inspect().value;damaged.reverse={quality:'p2',dun:'鬼遁',attrs:['不存在的属性','']};const raw=JSON.stringify(damaged);s.setItem(store.key,raw);
 assert.equal(store.inspect().valid,false);assert.throws(()=>store.save(v,raw,'a'),/异常/);assert.equal(s.getItem(store.key),raw);
});
test('direct path migration retains the old workbench fallback when no query document exists',()=>{
 const s=storage(),raw=JSON.stringify({draft:{simpleWorkbench:{target}}});s.setItem('qinshi_inscription_crafting_v1',raw);
 const result=X.createLocatorStore(s,'crafting-paths','direct').inspect();assert.equal(result.valid,true);assert.equal(result.value.target.dun,'鬼遁');assert.deepEqual(result.value.target.attrs,['速','速','速']);
 assert.equal(s.getItem('qinshi_inscription_crafting_v1'),raw);assert.equal(s.getItem('qinshi_inscription_path_query_v1'),null);
});
test('malformed locator position and concrete X stay quarantined rather than normalized and overwritten',()=>{
 const s=storage(),store=X.createLocatorStore(s,'crafting-paths','direct');
 for(const change of [{dun:'不存在'},{slot:'坏位置'},{xTerm:{attr:'不存在',tier:'H'}}]){
  const value={version:1,target:{...target,...change}},raw=JSON.stringify(value);s.setItem(store.key,raw);
  assert.equal(store.inspect().valid,false,JSON.stringify(change));assert.throws(()=>store.save({version:1,target},raw,'a'),/异常/);assert.equal(s.getItem(store.key),raw);
 }
});
