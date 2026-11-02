'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('./inscription-crafting-state.js'),L=require('./inscription-simulation.js');
function fixture(){const data=new Map();let account='one';const storage={currentAccount:()=>({id:account}),getItem:k=>data.get(account+k)??null,setItem:(k,v)=>data.set(account+k,String(v))};return {storage,data,switchTo:a=>account=a};}
test('path query target persists without reading corrupt simulation and is account isolated',()=>{
 const f=fixture();f.storage.setItem(S.KEY,'not json');const q=S.createQueryStore(f.storage),a=q.inspect();
 assert.equal(a.valid,true);a.target.dun='鬼遁';a.target.attrs=['速','速','速'];q.save(a.target,a.token,'one');
 assert.equal(f.storage.getItem(S.KEY),'not json');assert.equal(q.inspect().target.dun,'鬼遁');
 f.switchTo('two');assert.equal(q.inspect().target.dun,'');f.switchTo('one');assert.equal(q.inspect().target.dun,'鬼遁');
 assert.throws(()=>q.save(a.target,a.token,'one'),/更新|改变/);
});
test('legacy recovery is explicit and isolate preserves raw plus valid backpack sources',()=>{
 const f=fixture(),store=S.createWorkbench(f.storage),base=store.inspect();let w=L.upgrade(base.state);
 w.target.dun='鬼遁';w.lab.lots.push({id:'manual',material:{prefix:'天机',dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]},quantity:4,source:{type:'manual'}});
 const raw={schemaVersion:1,idSequence:0,actual:[],goals:[],workspaces:{},draft:{simpleWorkbench:w}};
 raw.draft.simpleWorkbench.simulation.stage='invalid';f.storage.setItem(S.KEY,JSON.stringify(raw));
 const bad=store.inspect();assert.equal(bad.valid,false);const before=f.storage.getItem(S.KEY);
 assert.equal(f.storage.getItem(S.KEY),before);const recovered=store.recover('isolate',before,'one');
 assert.equal(recovered.valid,true);assert.equal(recovered.state.lab.lots[0].quantity,4);assert.equal(recovered.state.simulation.stage,'b2');
 assert.equal(store.archives()[0].raw,before);assert.equal(store.archives()[0].reason.length>0,true);
});
test('clear recovery removes all simulator history and bags but leaves query and other legacy fields',()=>{
 const f=fixture(),query=S.createQueryStore(f.storage),q=query.inspect();q.target.dun='地遁';query.save(q.target,q.token,'one');
 const raw={schemaVersion:1,idSequence:0,actual:[],goals:[],workspaces:{},draft:{unrelated:{keep:true},simpleWorkbench:{broken:true}}};
 f.storage.setItem(S.KEY,JSON.stringify(raw));const store=S.createWorkbench(f.storage);
 const result=store.recover('clear',f.storage.getItem(S.KEY),'one');
 assert.equal(result.valid,true);assert.equal(result.state.lab.lots.length,0);assert.equal(result.state.lab.records.length,0);assert.equal(store.archives().length,0);
 assert.equal(JSON.parse(f.storage.getItem(S.KEY)).draft.unrelated.keep,true);assert.equal(query.inspect().target.dun,'地遁');
 const stable=f.storage.getItem(S.KEY);assert.throws(()=>store.recover('clear','stale','one'),/改变|更新/);assert.equal(f.storage.getItem(S.KEY),stable);
 f.switchTo('two');assert.throws(()=>store.recover('clear',null,'one'),/账号/);
});
test('a broken outer legacy pending does not erase real inventory goals or unrelated drafts',()=>{
 for(const mode of ['clear','isolate']){
  const f=fixture(),legacy=S.createStore(f.storage),material={prefix:'天府',dun:'地遁',quality:'b2',origin:'wash',terms:[{attr:'技能穿透',tier:'H'}]};
  legacy.setActual(material,7);const id=legacy.saveGoal({name:'保留目标',prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  legacy.updateDraft({unrelated:{keep:true}});const raw=JSON.parse(f.storage.getItem(S.KEY));raw.workspaces[id].pending={id:'broken'};
  f.storage.setItem(S.KEY,JSON.stringify(raw));const store=S.createWorkbench(f.storage);store.recover(mode,f.storage.getItem(S.KEY),'one');
  const restored=JSON.parse(f.storage.getItem(S.KEY));assert.equal(restored.actual[0].quantity,7);assert.equal(restored.goals[0].name,'保留目标');assert.equal(restored.draft.unrelated.keep,true);
 }
});
