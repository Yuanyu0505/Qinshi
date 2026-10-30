const {test}=require('node:test');
const assert=require('node:assert/strict');
const Paths=require('./inscription-paths.js');
const Flow=require('./inscription-flowchart.js');

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
  return a.x===b.x ? a.x>r.x+.5&&a.x<r.x+r.width-.5&&Math.max(a.y,b.y)>r.y+.5&&Math.min(a.y,b.y)<r.y+r.height-.5
    : a.y===b.y&&a.y>r.y+.5&&a.y<r.y+r.height-.5&&Math.max(a.x,b.x)>r.x+.5&&Math.min(a.x,b.x)<r.x+r.width-.5;
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
    assert.equal(x,wire.points.at(-1).x,'probability aligns with the actual target entry, not the common stem');
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
