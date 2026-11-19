'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/six-halls.js');
const core=require('../js/six-halls.js');
const ui=require('../js/six-halls-ui.js');

test('loaded accounts default targets to their saved player cap without reducing existing progress',()=>{
  for(const [playerLevel,want]of [[null,50],[0,9],[50,10],[59,20],[79,40],[89,50]]) {
    const raw=JSON.stringify({playerLevel,halls:{kuiwei:{level:45}}});
    const controller=ui.createController({data,core,store:{getItem:()=>raw}});
    assert.equal(controller.state.plan.targets.chiyou,want,'player '+playerLevel);
    assert.equal(controller.state.plan.targets.kuiwei,Math.max(45,want));
    assert.equal(controller.state.progress.halls.kuiwei.level,45);
    controller.toggleHall('kuiwei',true);assert.equal(controller.calculate().valid,true);
  }
});

test('load and account changes reset cap defaults while same-account lease refresh keeps drafts private',()=>{
  let account='first',listener,writes=0;
  const saved={first:JSON.stringify({playerLevel:79}),second:JSON.stringify({playerLevel:59})};
  const store={getItem:()=>saved[account],currentAccount:()=>({id:account}),setItem:()=>{writes++;return true;},subscribeAccess:fn=>{listener=fn;}};
  const c=ui.createController({data,core,store});
  c.toggleHall('kuiwei',true);c.setTarget('kuiwei',30);
  saved.first=JSON.stringify({playerLevel:80});listener({accountId:'first'});
  assert.equal(c.state.plan.targets.kuiwei,30);assert.equal(c.state.progress.playerLevel,80);
  c.load();assert.equal(c.state.plan.targets.kuiwei,41);assert.deepEqual(c.state.plan.selected,[]);
  account='second';c.calculate();assert.equal(c.state.plan.targets.kuiwei,20);
  assert.equal(writes,0);
});

test('reference cumulative consumption starts at the selected range and preserves step costs and gates',()=>{
  const rows=core.referenceRows(data,40,50);
  assert.equal(rows.length,10);
  assert.deepEqual([rows[0].from,rows[0].herbs,rows[0].tokens,rows[0].cumulativeHerbs,rows[0].cumulativeTokens,rows[0].playerLevel],[40,24,14,24,14,80]);
  assert.deepEqual([rows[9].cumulativeHerbs,rows[9].cumulativeTokens],[270,161]);
  const full=core.referenceRows(data);assert.deepEqual([full[49].cumulativeHerbs,full[49].cumulativeTokens],[904,435]);
  assert.deepEqual(core.referenceRows(data,40,40),[]);
  for(const range of [['',50],[50,40],[-1,50],[0,51]])assert.throws(()=>core.referenceRows(data,...range),RangeError);
});

test('confirmed consecutive gates include the special shared threshold at 19 and 20',()=>{
  const rows=core.referenceRows(data);
  for(let target=1;target<=50;target++) {
    const expected=target<10?null:target<20?target+40:target+39;
    assert.equal(rows[target-1].playerLevel,expected,'target '+target);
  }
  for(const [player,expected]of [[0,9],[49,9],[50,10],[51,11],[58,18],[59,20],[60,21],[78,39],[79,40],[80,41],[88,49],[89,50],[100,50]]) {
    assert.equal(core.playerCap(player,data),expected,'player '+player);
  }
});

test('over-cap targets reject calculation without changing saved progress or stocks',()=>{
  for(const [player,target]of [[50,11],[58,19],[59,21],[79,41],[80,42]]) {
    const progress=core.normalizeProgress({playerLevel:player,herbs:9999,halls:{kuiwei:{level:10,tokens:9999}}},data);
    const before=JSON.stringify(progress);
    const result=core.calculatePlan(progress,{selected:['kuiwei'],targets:{kuiwei:target}},data);
    assert.equal(result.valid,false,player+' / '+target);
    assert.deepEqual(result.rows,[]);assert.equal(result.herbs,null);
    assert.match(result.errors[0].message,/当前等级最大可升级至\d+级六堂，无法升级至您指定的目标等级/);
    assert.equal(JSON.stringify(progress),before);
  }
});

test('saved player-level changes update all temporary targets and preserve selected halls',()=>{
  const saved=core.normalizeProgress({playerLevel:80},data);
  let stored=JSON.stringify(saved);
  const store={getItem:()=>stored,setItem:(key,value)=>{stored=value;return true;}};
  const controller=ui.createController({data,core,store});
  controller.toggleHall('kuiwei',true);controller.setTarget('kuiwei',41);
  assert.equal(controller.calculate().valid,true);
  controller.setProgress('playerLevel',79);
  assert.equal(controller.state.targetErrors.kuiwei,undefined);
  assert.deepEqual(controller.state.plan.selected,['kuiwei']);
  assert.ok(Object.values(controller.state.plan.targets).every(level=>level===40));
  assert.equal(controller.calculate().valid,true);
  controller.setProgress('playerLevel',80);
  assert.ok(Object.values(controller.state.plan.targets).every(level=>level===41));
  assert.equal(controller.state.targetErrors.kuiwei,undefined);
  assert.equal(controller.calculate().valid,true);
  controller.setProgress('playerLevel','');
  assert.ok(Object.values(controller.state.plan.targets).every(level=>level===50));
  assert.equal(JSON.parse(stored).playerLevel,null);
  assert.equal('targets' in JSON.parse(stored),false);
});

test('failed, read-only, invalid and unchanged level edits do not replace target drafts',()=>{
  let stored=JSON.stringify(core.normalizeProgress({playerLevel:80},data)),failure=null,readOnly=false;
  const store={getItem:()=>stored,isReadOnly:()=>readOnly,setItem:(key,value)=>{
    if(failure==='throw')throw Error('Storage unavailable');if(failure==='false')return false;stored=value;return true;
  }};
  const c=ui.createController({data,core,store});c.setTarget('kuiwei',30);
  for(const value of ['bad',-1]){assert.equal(c.setProgress('playerLevel',value),false);assert.equal(c.state.plan.targets.kuiwei,30);}
  const before=stored;
  for(const mode of ['readonly','false','throw']){
    readOnly=mode==='readonly';failure=mode;
    assert.equal(c.setProgress('playerLevel',79),false);assert.equal(c.state.plan.targets.kuiwei,30);assert.equal(stored,before);
  }
  readOnly=false;failure=null;
  assert.equal(c.setProgress('playerLevel',80),true);assert.equal(c.state.plan.targets.kuiwei,30);
  assert.equal(c.setProgress('herbs',12),true);assert.equal(c.state.plan.targets.kuiwei,30);
});
