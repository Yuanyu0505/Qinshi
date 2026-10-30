const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const Flow=require('./inscription-flowchart.js');
const Model=require('./inscription-flow-model.js');

function drawing(route,x){
  const html=Flow.render(route,x),boxes=new Map();
  for(const match of html.matchAll(/<g class="craft-flow-box[^\"]*" data-flow-node="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)){
    const values=Object.fromEntries(Array.from(match[2].match(/<rect\b[^>]*>/)[0].matchAll(/\b(x|y|width|height)="([\d.]+)"/g),m=>[m[1],Number(m[2])]));
    boxes.set(match[1],values);
  }
  const wires=Array.from(html.matchAll(/<path class="craft-flow-connection"([^>]+)>/g),m=>{
    const attrs=Object.fromEntries(Array.from(m[1].matchAll(/([\w-]+)="([^"]*)"/g),a=>[a[1],a[2]]));
    const nums=attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number),points=[];
    for(let i=0;i<nums.length;i+=2)points.push({x:nums[i],y:nums[i+1]});
    return {attrs,points};
  });
  return {html,boxes,wires};
}
function cuts(a,b,r){
  let low=0,high=1;
  for(const [start,delta,min,max]of [[a.x,b.x-a.x,r.x+.5,r.x+r.width-.5],[a.y,b.y-a.y,r.y+.5,r.y+r.height-.5]]){
    if(!delta){if(start<=min||start>=max)return false;continue;}
    const enter=(min-start)/delta,exit=(max-start)/delta;
    low=Math.max(low,Math.min(enter,exit));high=Math.min(high,Math.max(enter,exit));
    if(low>=high)return false;
  }
  return low<high;
}
for(const attrs of [['速','速','速'],['暴击伤害','速','速']])test('ghost routes keep independent wash boxes clear and batch inputs on one bus: '+attrs.join('/'),()=>{
  const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs});
  for(const route of plans.strategies){
    const {boxes,wires}=drawing(route,plans.xAttr),batches=new Map();
    assert.ok(wires.length);
    for(const wire of wires){
      for(const [id,rect]of boxes){
        if(id===wire.attrs['data-from']||id===wire.attrs['data-to'])continue;
        for(let i=1;i<wire.points.length;i++)assert.equal(cuts(wire.points[i-1],wire.points[i],rect),false,'unrelated node '+id+' must not be crossed');
      }
      if(wire.attrs['data-phase']==='input'){
        const batch=wire.attrs['data-batch'];
        if(!batches.has(batch))batches.set(batch,[]);
        batches.get(batch).push(Number(wire.attrs['data-bus-y']));
      }
    }
    for(const buses of batches.values())assert.equal(new Set(buses).size,1,'same batch, including promotion, joins one horizontal bus');
    for(const wiresInBatch of Array.from(batches.keys(),batch=>wires.filter(w=>w.attrs['data-phase']==='input'&&w.attrs['data-batch']===batch))){
      const join={x:wiresInBatch[0].points.at(-1).x,y:Number(wiresInBatch[0].attrs['data-bus-y'])};
      for(const wire of wiresInBatch)assert.ok(wire.points.some((p,i)=>{
        if(!i)return false;const a=wire.points[i-1];
        return a.x===p.x&&join.x===p.x&&join.y>=Math.min(a.y,p.y)&&join.y<=Math.max(a.y,p.y)
          ||a.y===p.y&&join.y===p.y&&join.x>=Math.min(a.x,p.x)&&join.x<=Math.max(a.x,p.x);
      }),'every batch input physically reaches the same joining point');
    }
  }
});

test('reuse probability belongs to its result leg rather than the shared stem',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','技能穿透']});
  const route=plans.strategies.find(item=>item.reuse.length);assert.ok(route);
  const {html,boxes,wires}=drawing(route,plans.xAttr);
  for(const wire of wires.filter(w=>w.attrs['data-phase']==='output')){
    const group=Array.from(html.matchAll(/<g class="craft-flow-label"([^>]*)>([\s\S]*?)<\/g>/g)).find(m=>m[1].includes('data-from="'+wire.attrs['data-from']+'"')&&m[1].includes('data-to="'+wire.attrs['data-to']+'"'));
    assert.ok(group,'each result has its own probability label');
    const x=Number(group[2].match(/<text x="([^"]+)"/)[1]);
    const start=wire.points[0],end=wire.points.at(-1);
    assert.equal(x,start.x+(end.x-start.x)*.65,'probability belongs on its own straight result branch');
    assert.ok(Number(group[2].match(/<text[^>]+ y="([^"]+)"/)[1])<boxes.get(wire.attrs['data-to']).y);
  }
  for(const wire of wires.filter(w=>w.attrs['data-phase']==='output')){
    for(const other of wires.filter(w=>w.attrs['data-to']===wire.attrs['data-to']&&w.attrs['data-batch']!==wire.attrs['data-batch'])){
      for(let i=1;i<wire.points.length;i++)for(let j=1;j<other.points.length;j++){
        const a=wire.points[i-1],b=wire.points[i],c=other.points[j-1],d=other.points[j];
        if(a.y!==b.y||c.y!==d.y||a.y!==c.y)continue;
        assert.ok(Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))<=Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)),'independent result batches must not overlap into one horizontal stem');
      }
    }
  }
});

test('random outcomes all depart directly from one junction; wash preparation has no separate crossing wire',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs:['速','速','速']});
  for(const route of plans.strategies){
    const {html,wires}=drawing(route,plans.xAttr),starts=new Map();
    for(const wire of wires.filter(w=>w.attrs['data-phase']==='output')){
      assert.equal(wire.points.length,2,'outcome arrows must be straight from one shared point');
      const start=wire.points[0],key=wire.attrs['data-batch'];
      if(starts.has(key))assert.deepEqual(start,starts.get(key));else starts.set(key,start);
    }
    for(const match of html.matchAll(/<g class="craft-flow-box craft-flow-wash[^\"]*" data-flow-node="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)){
      assert.ok(match[2].includes('另行置换合成素材铭文'));
      assert.ok(match[2].includes('置换概率未知'));
      assert.equal(wires.filter(w=>w.attrs['data-to']===match[1]).length,0,'washed material is independent, not an outcome of an unrelated recipe');
    }
  }
});

test('shared blue materials are separately prepared per batch, not one misleading cross-batch bus',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'云遁',quality:'o2',attrs:['护盾','护盾','技免']});
  let shared=0;
  for(const route of plans.strategies){
    const model=Model.project(route,plans.xAttr);
    shared+=model.materials.filter(m=>m.material.quality==='b2'&&model.operations.filter(op=>op.inputs.some(i=>i.id===m.id)).length>1).length;
    const before=JSON.stringify(route),{wires}=drawing(route,plans.xAttr),owners=new Map();
    for(const wire of wires.filter(w=>w.attrs['data-phase']==='input'&&w.attrs['data-source-quality']==='b2')){
      const source=wire.attrs['data-from'];
      if(owners.has(source))assert.equal(owners.get(source),wire.attrs['data-batch'],'a blue preparation card belongs to one batch');
      owners.set(source,wire.attrs['data-batch']);
    }
    assert.equal(JSON.stringify(route),before,'display projection does not change recipes or demand');
  }
  assert.ok(shared,'fixture must contain a blue material shared by multiple recipes');
});

test('favorite routes with independently washed blue leaves also prepare a separate card for each batch',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'云遁',quality:'o2',attrs:['护盾','护盾','技免']});
  let checked=0;
  for(const original of plans.strategies){
    const route=JSON.parse(JSON.stringify(original));
    function washLeaves(node){if(node.kind==='base'&&node.material.quality==='b2'){node.kind='wash';node.material.origin='wash';node.children=[];node.promotion=null;}else(node.children||[]).forEach(child=>washLeaves(child.node));}
    washLeaves(route.tree);
    const model=Model.project(route,plans.xAttr),rendered=drawing(route,plans.xAttr);
    for(const material of model.materials.filter(m=>m.material.quality==='b2')){
      const consumers=model.operations.filter(op=>op.inputs.some(i=>i.id===material.id));
      if(consumers.length<2)continue;
      const inputs=rendered.wires.filter(w=>w.attrs['data-phase']==='input'&&w.attrs['data-from'].startsWith(material.id+'-for-'));
      assert.equal(new Set(inputs.map(w=>w.attrs['data-from'])).size,consumers.length);
      for(const wire of inputs)assert.equal(rendered.wires.filter(other=>other.attrs['data-to']===wire.attrs['data-from']).length,0,'independent wash has no incoming synthesis line');
      checked++;
    }
  }
  assert.ok(checked,'favorite fixture must exercise shared wash-blue preparations');
});

test('single-source failure reuse and its next failure stay vertically aligned',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs:['速','速','速']});
  let checked=0;
  for(const route of plans.strategies){
    const {html,boxes,wires}=drawing(route,plans.xAttr);
    const operationIds=new Set(Array.from(html.matchAll(/<g class="craft-flow-box craft-flow-operation[^\"]*" data-flow-node="([^"]+)"/g),m=>m[1]));
    for(const match of html.matchAll(/<g class="craft-flow-box craft-flow-operation[^\"]*" data-flow-node="([^"]+)"/g)){
      const id=match[1],inputs=wires.filter(w=>w.attrs['data-to']===id);
      if(inputs.length!==1)continue;
      if(wires.filter(w=>w.attrs['data-from']===inputs[0].attrs['data-from']&&operationIds.has(w.attrs['data-to'])).length!==1)continue;
      const source=boxes.get(inputs[0].attrs['data-from']),reuse=boxes.get(id);
      assert.equal(source.x+source.width/2,reuse.x+reuse.width/2);
      const failure=boxes.get('other-'+inputs[0].attrs['data-batch']);
      if(failure)assert.equal(failure.x+failure.width/2,reuse.x+reuse.width/2);
      checked++;
    }
  }
  assert.ok(checked,'fixture must exercise single-source failure reuse');
});
