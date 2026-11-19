'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/six-halls.js');
const core=require('../js/six-halls.js');
const ui=require('../js/six-halls-ui.js');

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

test('controller updates target errors after player-level edits without clamping the draft',()=>{
  const saved=core.normalizeProgress({playerLevel:80},data);
  let stored=JSON.stringify(saved);
  const store={getItem:()=>stored,setItem:(key,value)=>{stored=value;return true;}};
  const controller=ui.createController({data,core,store});
  controller.toggleHall('kuiwei',true);controller.setTarget('kuiwei',41);
  assert.equal(controller.calculate().valid,true);
  controller.setProgress('playerLevel',79);
  assert.match(controller.state.targetErrors.kuiwei,/最大可升级至40级六堂/);
  assert.equal(controller.state.plan.targets.kuiwei,41);
  assert.equal(controller.calculate().valid,false);
  controller.setProgress('playerLevel',80);
  assert.equal(controller.state.targetErrors.kuiwei,undefined);
  assert.equal(controller.calculate().valid,true);
});
