const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const Flow=require('./inscription-flowchart.js');
const Model=require('./inscription-flow-model.js');
const Rules=require('./inscription-rules.js');
const Simulation=require('./inscription-simulation.js');

test('independent washed material carries its per-batch quantity on its outgoing wire',()=>{
 const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs:['速','速','速']});let checked=0;
 for(const route of plans.strategies){
  const {html,wires}=drawing(route,plans.xAttr);
  for(const match of html.matchAll(/<g class="craft-flow-box craft-flow-wash[^\"]*" data-flow-node="([^"]+)"/g)){
   const from=match[1];for(const wire of wires.filter(w=>w.attrs['data-from']===from&&w.attrs['data-phase']==='input')){
    const label=Array.from(html.matchAll(/<g class="craft-flow-label" data-from="([^"]+)" data-to="([^"]+)">([\s\S]*?)<\/g>/g)).find(m=>m[1]===from&&m[2]===wire.attrs['data-to']);
    assert.ok(label&&/该铭文×/.test(label[3]));checked++;
   }
  }
 }
 assert.ok(checked>0,'exercise independent washing preparations');
});

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

function assertBatchNeighbours(rendered){
  const sources=rendered.wires.filter(w=>w.attrs['data-phase']==='input').map(w=>({batch:w.attrs['data-batch'],id:w.attrs['data-from'],box:rendered.boxes.get(w.attrs['data-from'])}));
  const rows=new Map();
  for(const source of sources){
    if(!source.box)continue;
    if(!rows.has(source.box.y))rows.set(source.box.y,[]);
    const row=rows.get(source.box.y);if(!row.some(n=>n.id===source.id))row.push(source);
  }
  for(const row of rows.values()){
    row.sort((a,b)=>a.box.x-b.box.x);
    for(const batch of new Set(row.map(n=>n.batch))){
      const positions=row.flatMap((n,i)=>n.batch===batch?[i]:[]);
      assert.equal(positions.at(-1)-positions[0]+1,positions.length,'ingredients of '+batch+' must be adjacent: '+row.map(n=>n.id+'='+n.batch+'@'+n.box.y).join(','));
    }
  }
  const boxes=Array.from(rendered.boxes);
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const [id,a]=boxes[i],[other,b]=boxes[j];
    assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,id+' must not overlap '+other);
  }
  for(const wire of rendered.wires){
    for(const [id,rect]of boxes){
      if(id===wire.attrs['data-from']||id===wire.attrs['data-to'])continue;
      for(let i=1;i<wire.points.length;i++)assert.equal(cuts(wire.points[i-1],wire.points[i],rect),false,'unrelated node '+id+' must not be crossed by '+wire.attrs['data-from']+' -> '+wire.attrs['data-to']);
    }
  }
}

test('all template, saved wash and actual recipe routes keep recipe ingredients adjacent and geometry clear',()=>{
  let checked=0;
  for(const dun of Rules.duns)for(const quality of ['p1','p2','o1','o2']){
    const attrs=quality==='o2'&&dun.id==='云遁'?['护盾','护盾','技免']:Array(quality==='p1'||quality==='p2'?2:3).fill(dun.high[0]);
    const plan=Paths.representative({prefix:'天府',dun:dun.id,quality,attrs});
    for(const original of plan.strategies){
      const route=JSON.parse(JSON.stringify(original));
      assertBatchNeighbours(drawing(route,plan.xAttr));
      function wash(node){if(node.kind==='base'){node.kind='wash';node.material.origin='wash';node.children=[];}else(node.children||[]).forEach(c=>wash(c.node));}
      wash(route.tree);
      assertBatchNeighbours(drawing(route,plan.xAttr));
      // Recorded routes use the public provenance projection, not a template flag.
      const records=[];
      function record(node){
        if(node.kind==='base'||node.kind==='wash')return null;
        const inputs=(node.children||[]).flatMap(c=>Array.from({length:c.quantity},()=>({material:c.node.material,recordId:record(c.node),source:'wash'})));
        const id='record-'+records.length;records.push({id,material:node.material,probability:node.probability,promotion:node.promotion,inputs});return id;
      }
      const recordId=record(original.tree);
      if(recordId)assertBatchNeighbours(drawing(Simulation.route({lab:{records}},recordId),null));
      checked++;
    }
  }
  assert.ok(checked>40,'exercise multiple families, qualities and route kinds');
});

test('recorded routes share identical blue materials across consumers with counted outgoing edges',()=>{
 let w=Simulation.upgrade({version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'p2',attrs:['速','速'],xTerm:null},simulation:{stage:'b2',inputs:[],pending:null}});
 for(const random of [0,.999,.999]){
  w=Simulation.act(w,'edit',{index:0,terms:[{attr:'速',tier:'?'}]});w=Simulation.act(w,'edit',{index:1,terms:[{attr:'闪避',tier:'U'}]});
  w=Simulation.act(w,'roll',{random:()=>random});w=Simulation.act(w,'repeat');
 }
 w=Simulation.act(w,'reset',{stage:'p1'});w=Simulation.act(w,'select',{selection:w.lab.lots.filter(l=>l.quantity).map(l=>({id:l.id,quantity:l.quantity}))});
 w=Simulation.act(w,'roll',{random:()=>0});const traced=Simulation.route(w,w.simulation.pending.recordId),{html,wires}=drawing(traced,null);
 const sources=Array.from(html.matchAll(/<g class="craft-flow-box craft-flow-material craft-flow-quality-b2" data-flow-node="([^"]+)"/g),m=>m[1]);
 assert.equal(sources.length,2,'each identical actual blue material has one counted card');
 for(const id of sources){const outputs=wires.filter(w=>w.attrs['data-from']===id&&w.attrs['data-phase']==='input');assert.equal(outputs.length,2);}
 assert.match(html,/总共需要3枚该铭文/);
});

test('flow cards fit compact line spacing without excess bottom padding',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'云遁',quality:'o2',attrs:['护盾','护盾','技免']});
  const html=drawing(plan.strategies[0],plan.xAttr).html;
  for(const match of html.matchAll(/<g class="craft-flow-box[^\"]*"[^>]*>([\s\S]*?)<\/g>/g)){
    const rect=match[1].match(/<rect[^>]+ y="([\d.]+)"[^>]+ height="([\d.]+)"/),texts=Array.from(match[1].matchAll(/<text[^>]+ y="([\d.]+)"/g),m=>Number(m[1]));
    const termIndex=Array.from(match[1].matchAll(/<text\b[^>]*>/g)).findIndex(m=>m[0].includes('craft-flow-node-terms'));
    const noteGap=termIndex>=0&&termIndex<texts.length-1?8:0;
    assert.equal(Number(rect[2]),24+texts.length*20+noteGap,'card height tracks text and the deliberate term-to-note gap');
    for(let i=1;i<texts.length;i++)assert.equal(texts[i]-texts[i-1],20+(i===termIndex+1?noteGap:0));
    assert.ok(Number(rect[1])+Number(rect[2])-texts.at(-1)<=22,'last line leaves only compact bottom padding');
  }
});
test('cloud preparation batches do not merge into a misleading common input bus',()=>{
  const plan=Paths.representative({prefix:'天府',dun:'云遁',quality:'o2',attrs:['护盾','护盾','技免']});
  assert.ok(plan.strategies.length);
  for(const route of plan.strategies){
    const {html,wires}=drawing(route,plan.xAttr);
    assert.doesNotMatch(html,/class="craft-flow-next-band"/);
    const inputs=wires.filter(w=>w.attrs['data-phase']==='input');
    for(let i=0;i<inputs.length;i++)for(let j=i+1;j<inputs.length;j++){
      const one=inputs[i],two=inputs[j];
      if(one.attrs['data-batch']===two.attrs['data-batch']||one.attrs['data-source-quality']!==two.attrs['data-source-quality'])continue;
      for(let a=1;a<one.points.length;a++)for(let b=1;b<two.points.length;b++){
        const p=one.points[a-1],q=one.points[a],r=two.points[b-1],s=two.points[b];
        if(p.y!==q.y||r.y!==s.y||p.y!==r.y)continue;
        assert.ok(Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))<=Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)),'independent input batches must keep separate horizontal buses');
      }
    }
  }
});
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
    assert.equal(x,end.x,'probability belongs to the vertical leg of its own result branch');
    const leg=wire.points.at(-2),y=Number(group[2].match(/<text[^>]+ y="([^"]+)"/)[1]);
    assert.ok(y>leg.y&&y<end.y,'the label stays below the split and above its arrow');
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
      assert.ok(wire.points.length===2||wire.points.length===3,'outcomes use a direct main leg or one compact orthogonal fork');
      assert.equal(wire.points.at(-2).x,wire.points.at(-1).x,'outcome arrows point down the actual result leg');
      const start=wire.points[0],key=wire.attrs['data-batch'];
      if(starts.has(key))assert.deepEqual(start,starts.get(key));else starts.set(key,start);
    }
    for(const match of html.matchAll(/<g class="craft-flow-box craft-flow-wash[^\"]*" data-flow-node="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)){
      assert.ok(match[2].includes('另行置换合成素材铭文'));
      assert.ok(!match[2].includes('置换概率未知'));
      assert.equal(wires.filter(w=>w.attrs['data-to']===match[1]).length,0,'washed material is independent, not an outcome of an unrelated recipe');
    }
  }
});

test('only a real merge or split has a visible junction, and arrowheads remain outside boxes',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs:['速','速','速']});
  let junctions=0,arrows=0;
  for(const route of plans.strategies){
    const {html,boxes,wires}=drawing(route,plans.xAttr);
    for(const match of html.matchAll(/<circle class="craft-flow-junction" data-flow-junction="([^"]+)"/g)){
      const id=match[1],inputs=new Set(wires.filter(w=>w.attrs['data-to']===id).map(w=>w.attrs['data-from']));
      const outputs=new Set(wires.filter(w=>w.attrs['data-from']===id).map(w=>w.attrs['data-to']));
      assert.ok(inputs.size>1||outputs.size>1,'single-in/single-out is a line, not a visible node');
      junctions++;
    }
    for(const wire of wires.filter(w=>w.attrs['marker-end'])){
      const target=boxes.get(wire.attrs['data-to']);assert.ok(target);
      assert.ok(wire.points.at(-1).y<=target.y-12,'arrowhead must not be hidden under the target border');
      arrows++;
    }
    for(const match of html.matchAll(/<g class="craft-flow-box[^\"]*craft-flow-quality-o2[^\"]*"[^>]*>([\s\S]*?)<\/g>/g)){
      assert.ok(!match[1].includes('总共需要1枚该铭文'));
    }
  }
  assert.ok(junctions&&arrows,'exercise actual merges, splits and arrows');
});

test('no connection label covers any complete arrowhead, including neighbouring result branches',()=>{
  const plans=Paths.representative({prefix:'天府',dun:'鬼遁',quality:'o2',attrs:['暴击伤害','速','速']});
  let checked=0;
  for(const route of plans.strategies){
    const {html,wires}=drawing(route,plans.xAttr);
    const labels=Array.from(html.matchAll(/<g class="craft-flow-label"([^>]*)>([\s\S]*?)<\/g>/g),label=>Object.fromEntries(Array.from(label[2].match(/<rect\b[^>]*>/)[0].matchAll(/\b(x|y|width|height)="(-?[\d.]+)"/g),m=>[m[1],Number(m[2])])));
    assert.ok(labels.length);
    for(const wire of wires.filter(w=>w.attrs['marker-end'])){
      const start=wire.points.at(-2),end=wire.points.at(-1),length=Math.hypot(end.x-start.x,end.y-start.y),ux=(end.x-start.x)/length,uy=(end.y-start.y)/length;
      const wings=[-7.2,7.2].map(side=>({x:end.x-ux*14.4-uy*side,y:end.y-uy*14.4+ux*side}));
      for(const rect of labels){
        const padded={x:rect.x-2,y:rect.y-2,width:rect.width+4,height:rect.height+4};
        for(const wing of wings)assert.equal(cuts(wing,end,padded),false,'no label may intersect either full arrow wing, even from a different batch');
      }
      checked++;
    }
  }
  assert.ok(checked,'exercise labelled outcome branches');
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
