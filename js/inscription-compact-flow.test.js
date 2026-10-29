const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('./inscription-paths.js');
const F=require('./inscription-flowchart.js');

function plan(dun='鬼遁'){
  return P.representative({prefix:'天府',dun,quality:'o2',attrs:dun==='鬼遁'?['暴击伤害','速','速']:['PVP伤害','PVP速','PVP速']});
}
function visibleBoxes(html){return Array.from(html.matchAll(/<g\b[^>]*class="craft-flow-box[^\"]*"[^>]*>([\s\S]*?)<\/g>/g),m=>m[1].replace(/<[^>]*>/g,''));}

for(const dun of ['鬼遁','龙遁'])test(dun+' shows one random recipe feeding two useful branches rather than reciprocal failures',()=>{
  const p=plan(dun),before=JSON.stringify(p.strategies[0]),html=F.render(p.strategies[0],p.xAttr),boxes=visibleBoxes(html);
  assert.equal(boxes.filter(s=>s.includes('蓝二速度档位不可辨')).length,1);
  const useful=boxes.filter(s=>s.includes('可用产物')&&s.includes('紫一'));
  assert.equal(useful.length,2);
  assert.ok(useful.every(s=>s.includes('50%')&&s.includes('本路线需9枚')));
  assert.ok(!boxes.some(s=>s.includes('失败紫一')||s.includes('失败结果')));
  assert.match(html,/每次只产出一枚/);
  assert.equal(JSON.stringify(p.strategies[0]),before);
});

test('compact ghost layout materially reduces width and height without shrinking default scale',()=>{
  const p=plan(),html=F.render(p.strategies[0],p.xAttr);
  const width=Number(html.match(/data-flow-width="([^"]+)"/)[1]),height=Number(html.match(/data-flow-height="([^"]+)"/)[1]);
  assert.ok(width<1200,'Shared branches should fit a materially narrower canvas: '+width);
  assert.ok(height<1200,'Stable operations should not occupy an extra full row: '+height);
  assert.match(html,/data-zoom="0.9"/);
  assert.match(html,/data-craft-action="diagram-width"/);
  assert.match(html,/data-craft-action="diagram-all"/);
});

test('expanded unused outcomes are outside the canvas and do not enlarge its dimensions',()=>{
  const p=P.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']}),route=p.strategies.find(r=>r.reuse.length);
  const closed=F.render(route,p.xAttr),open=F.render(route,p.xAttr,{showFailures:true});
  for(const name of ['width','height'])assert.equal(open.match(new RegExp('data-flow-'+name+'="([^"]+)"'))[1],closed.match(new RegExp('data-flow-'+name+'="([^"]+)"'))[1]);
  assert.match(open,/data-flow-details/);
  assert.match(open,/失败品复用1/);
  assert.match(open,/目前4选3/);
});
