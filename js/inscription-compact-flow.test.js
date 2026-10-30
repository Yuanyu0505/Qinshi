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
  assert.equal(boxes.filter(s=>s.includes('蓝二速度档位不可辨')).length,0);
  const useful=boxes.filter(s=>s.includes('可用产物')&&s.includes('紫一'));
  assert.equal(useful.length,2);
  assert.ok(useful.every(s=>!s.includes('概率')&&s.includes('总共需要9枚该铭文')));
  assert.match(html,/概率50%/);
  assert.match(html,/该铭文×3、概率100%/);
  assert.doesNotMatch(html,/craft-flow-stage|蓝色品质流程|紫色品质流程|种候选|\d+选\d+/);
  assert.match(html,/craft-flow-quality-b2/);
  assert.match(html,/craft-flow-quality-p1/);
  assert.match(html,/craft-flow-promotion/);
  assert.ok(!boxes.some(s=>s.includes('失败紫一')||s.includes('失败产物')));
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
  assert.match(open,/候选词条池必须覆盖全部目标词条/);
  assert.doesNotMatch(open,/目前\d+选\d+/);
});

test('base materials use one line and failed outcomes are compact peers of useful outcomes',()=>{
  const p=P.representative({prefix:'天府',dun:'鬼遁',quality:'p1',attrs:['速','速']}),route=p.strategies.find(s=>s.kind==='probability');
  const html=F.render(route,p.xAttr),svg=html.split('</svg>')[0];
  const groups=Array.from(svg.matchAll(/<g class="craft-flow-box[^\"]*"[^>]*>([\s\S]*?)<\/g>/g),m=>m[1]);
  const base=groups.find(s=>s.includes('蓝二')&&s.includes('档位不可辨'));
  assert.equal((base.match(/<text\b/g)||[]).length,1);
  assert.doesNotMatch(svg,/每次随机产出一枚|当前概率|准备蓝二|蓝二速度档位不可辨/);
  const failure=groups.find(s=>s.includes('种其他紫一'));
  const success=groups.find(s=>s.includes('可用产物'));
  assert.ok(failure&&success);
  assert.equal(failure.match(/<rect[^>]* y="([^"]+)"/)[1],success.match(/<rect[^>]* y="([^"]+)"/)[1]);
});
