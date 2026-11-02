'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Layout=require('./inscription-flow-layout.js');
const Flow=require('./inscription-flowchart.js');
const Paths=require('./inscription-paths.js');
const Rules=require('./inscription-rules.js');

test('independent preparations remain near their recipe without covering input descent corridors',()=>{
  const nodes=[
    {id:'b',role:'main',level:0,w:320,h:90,demand:9},
    {id:'p',role:'main',level:2,w:320,h:110,demand:3},
    {id:'target',role:'main',level:4,w:320,h:90,demand:1},
    {id:'wash',role:'auxiliary',level:2,w:260,h:100},
    {id:'promotion',role:'auxiliary',level:2,w:190,h:44},
    {id:'other',role:'side',level:2,w:200,h:60},
    {id:'reuse',role:'side',level:3,w:260,h:90},
    {id:'other-reuse',role:'side',level:4,w:200,h:60}
  ];
  const edges=[{from:'b',to:'p',phase:'input',batch:'one'},{from:'p',to:'target',phase:'input',batch:'two'},
    {from:'other',to:'reuse',phase:'input',batch:'reuse'},{from:'reuse',to:'other-reuse',phase:'output',batch:'reuse'}];
  const box=id=>nodes.find(n=>n.id===id);
  const result=Layout.arrange(nodes,edges);
  assert.equal(box('b').x,box('p').x);
  assert.equal(box('p').x,box('target').x);
  assert.ok(box('wash').y>=box('p').y+box('p').h+24);
  assert.ok(box('other').x>box('p').x+box('p').w);
  assert.ok(box('promotion').x>=box('wash').x+box('wash').w+20||box('wash').x>=box('promotion').x+box('promotion').w+20);
  assert.equal(box('other').x+box('other').w/2,box('reuse').x+box('reuse').w/2);
  assert.equal(result.bands.length,2);
  for(const n of nodes)assert.ok(n.x>=0&&n.y>=0&&n.x+n.w<=result.width&&n.y+n.h<=result.height);
});

test('all dun families use semantic lanes without changing recipes or probabilities',()=>{
  for(const dun of Rules.duns){
    const attr=dun.high[0],plan=Paths.representative({prefix:'天府',dun:dun.id,quality:'o2',attrs:[attr,attr,attr]});
    assert.ok(plan.strategies.length,dun.id);
    for(const route of plan.strategies){
      const before=JSON.stringify(route),html=Flow.render(route,plan.xAttr,{showFailures:true});
      assert.equal(JSON.stringify(route),before);
      assert.match(html,/data-flow-region="main"/);
      assert.match(html,/data-flow-lane="main"/);
      assert.match(html,/data-zoom="0.9"/);
      assert.doesNotMatch(html,/>置换概率未知[。<]/);
      assert.doesNotMatch(html,/<button[^>]*>展开明细<\/button>/);
    }
  }
});

test('symbolic failure terms use the same quality formatting as concrete peers',()=>{
  const base=terms=>({kind:'base',material:{prefix:'天府',dun:'鬼遁',quality:'b2',origin:'wash',terms},children:[]});
  const children=[{node:base([{attr:'速',tier:'?'}]),quantity:1},{node:base([{attr:'闪避',tier:'U'}]),quantity:1}];
  children[1].node.xSource=true;
  const preview=Rules.preview(children.map(c=>c.node.material));
  const output=preview.outcomes.find(o=>o.material.terms.some(t=>t.attr==='速'&&t.tier==='H'));
  const route={kind:'probability',xTerm:{attr:'闪避',tier:'U'},symbolicX:true,reuse:[],tree:{kind:'craft',material:output.material,children,promotion:preview.promotion,outcomes:preview.outcomes,probability:output.probability}};
  const html=Flow.render(route,'闪避',{showFailures:true});
  assert.match(html,/<strong class="ins-term-value ins-term-purple">杂词条 X（同一个）<\/strong>/);
  assert.match(html,/craft-flow-failure[^\"]*craft-flow-quality-p1/);
  assert.doesNotMatch(html,/3%闪避/);
});

test('parallel auxiliary batches use separate local spaces instead of a distant common column',()=>{
  const nodes=[
    {id:'wash-one',kind:'wash',role:'auxiliary',level:0,w:260,h:90,batch:'op0'},
    {id:'wash-two',kind:'wash',role:'auxiliary',level:0,w:260,h:90,batch:'op1'},
    {id:'promotion-one',kind:'promotion',role:'auxiliary',level:0,w:190,h:44,batch:'op0'},
    {id:'promotion-two',kind:'promotion',role:'auxiliary',level:0,w:190,h:44,batch:'op1'},
    {id:'goal',kind:'success',role:'main',level:2,w:320,h:90,demand:1}
  ];
  Layout.arrange(nodes,[]);
  const byId=id=>nodes.find(n=>n.id===id);
  assert.equal(byId('wash-one').y,byId('promotion-one').y);
  assert.ok(byId('promotion-one').x>byId('wash-one').x+byId('wash-one').w);
  assert.ok(byId('wash-two').x>byId('promotion-one').x+byId('promotion-one').w);
});

test('recipe ingredients stay adjacent even when one ingredient continues down a longer chain',()=>{
  const nodes=[
    {id:'a-one',role:'main',level:0,w:240,h:44,demand:9,batch:'one'},
    {id:'a-two',role:'main',level:0,w:240,h:44,demand:9,batch:'two'},
    {id:'b-one',role:'main',level:0,w:240,h:44,demand:9,batch:'one'},
    {id:'b-two',role:'main',level:0,w:240,h:44,demand:9,batch:'two'},
    {id:'p-one',role:'main',level:2,w:320,h:104,demand:3},
    {id:'p-two',role:'main',level:2,w:320,h:104,demand:3},
    {id:'goal',role:'main',level:4,w:320,h:64,demand:1},
    {id:'promotion-one',kind:'promotion',role:'auxiliary',level:0,w:190,h:44,batch:'one'},
    {id:'promotion-two',kind:'promotion',role:'auxiliary',level:0,w:190,h:44,batch:'two'}
  ];
  const edges=[
    ...['one','two'].flatMap(batch=>['a','b','promotion'].map(kind=>({from:kind+'-'+batch,to:'p-'+batch,phase:'input',batch}))),
    {from:'p-one',to:'goal',phase:'input',batch:'final'},
    {from:'p-two',to:'goal',phase:'input',batch:'final'}
  ];
  Layout.arrange(nodes,edges);
  assert.deepEqual(nodes.filter(n=>n.level===0&&n.role==='main').sort((a,b)=>a.x-b.x).map(n=>n.batch),['one','one','two','two']);
  for(const batch of ['one','two']){
    const sources=nodes.filter(n=>n.level===0&&n.role==='main'&&n.batch===batch),promotion=nodes.find(n=>n.id==='promotion-'+batch);
    const center=promotion.x+promotion.w/2;
    assert.ok(center>=Math.min(...sources.map(n=>n.x))&&center<=Math.max(...sources.map(n=>n.x+n.w)),'promotion stays inside its own recipe span');
  }
});
