// Regression cases supplied for user execution; not run by the assistant.
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('./secret-realm-core.js');
const Planner=require('./secret-realm-planner.js');
const Data=require('../data/secret-realm.js');
const now=Date.parse('2026-10-29T12:00:00+08:00');
function active(){return Core.setStartDate(Core.createDefault(Data),'guigu',6,'2026-10-20',now,Data);}
test('compact pack progress derives acquired draws and never plans a second collection',()=>{
  const state=Core.updateSourceProgress(active(),'guigu',6,'pack198',{purchased:1},now,Data);
  assert.equal(state.realms.guigu.periods[6].sources.pack198.obtained,55);
  const source=Core.buildPlanningInput(state,'guigu',now,Data).periods[0].sources.find(s=>s.id==='pack198');
  assert.equal(source.availableDraws,0);assert.equal(source.maxPurchases,1);
  assert.equal(state.realms.guigu.inventory,0);
});
test('paid pass can be purchased before collecting its tickets',()=>{
  const state=Core.updateSourceProgress(active(),'guigu',6,'paid-pass',{purchased:1},now,Data);
  const pass=Core.buildPlanningInput(state,'guigu',now,Data).periods[0].sources.find(s=>s.id==='paid-pass');
  assert.equal(pass.availableDraws,88);assert.equal(pass.maxPurchases,0);
});
test('daily planning uses entered period totals, not hidden today markers',()=>{
  let state=Core.updateSource(active(),'guigu',6,'pack6',{purchased:9,todayDate:'2026-10-29',todayPurchased:1},now,Data);
  const before=Core.buildPlanningInput(state,'guigu',now,Data).periods[0].sources.find(s=>s.id==='pack6');
  assert.equal(before.maxPurchases,5);
  state=Core.updateSourceProgress(state,'guigu',6,'pack6',{purchased:10},now,Data);
  assert.equal(state.realms.guigu.periods[6].sources.pack6.todayDate,null);
  assert.equal(Core.buildPlanningInput(state,'guigu',now,Data).periods[0].sources.find(s=>s.id==='pack6').maxPurchases,4);
});
test('cash is rounded up once at total level and apportioned as integer rows and periods',()=>{
  const result=Planner.plan({cumulative:0,inventory:0,target:2,discount:4.3,vouchers:0,useVouchers:true,periods:[
    {number:1,sources:[{id:'a',name:'A',draws:1,price:98,maxPurchases:1,availableDraws:0}]},
    {number:2,sources:[{id:'b',name:'B',draws:1,price:98,maxPurchases:1,availableDraws:0}]}
  ]});
  assert.equal(result.valid,true);assert.equal(result.cheapest.totalAfter,85);
  assert.deepEqual(result.cheapest.periods.map(p=>p.after),[43,42]);
  assert.equal(result.cheapest.periods.flatMap(p=>p.rows).reduce((n,r)=>n+r.after,0),85);
});
