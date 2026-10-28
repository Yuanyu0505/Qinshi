"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const Flow=require('./inscription-flowchart.js');

test('flow failures collapse by default and expand with stage frames',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']});
  const route=plan.strategies.find(s=>s.kind==='probability');
  assert.ok(route);
  const collapsed=Flow.render(route,plan.xAttr),expanded=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.match(collapsed,/种结果已收起/);
  assert.doesNotMatch(collapsed,/失败紫一 A/);
  assert.match(expanded,/失败紫一 A/);
  assert.match(collapsed,/craft-flow-stage-blue/);
  assert.match(collapsed,/craft-flow-stage-purple/);
  assert.match(collapsed,/data-zoom="0.9"/);
  assert.match(collapsed,/当前概率：约6%/);
});

test('expanded failures include failed reuse outcomes and preserve orange stage',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const route=plan.strategies.find(s=>s.reuse.some(r=>r.probability<1));
  assert.ok(route);
  const closed=Flow.render(route,plan.xAttr),open=Flow.render(route,plan.xAttr,{showFailures:true});
  assert.doesNotMatch(closed,/复用失败橙二/);
  assert.match(open,/复用失败橙二/);
  assert.match(open,/craft-flow-stage-orange/);
  assert.match(open,/失败品互补复用/);
});
