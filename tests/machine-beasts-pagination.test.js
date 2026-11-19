'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
  const calls=[],tasks=[],appended=[];
  const button={disabled:false,hidden:false,focus(){},setAttribute(){},removeAttribute(){}};
  const count={textContent:''};
  const items={insertAdjacentHTML(position,html){assert.equal(position,'beforeend');appended.push(html);}};
  const section={isConnected:true,querySelector(selector){return selector.includes('items')?items:selector.includes('count')?count:button;},querySelectorAll(){return[];},replaceWith(){assert.fail('pagination must not replace existing DOM');}};
  const plan={kind:'cost',stableKey:'primary',beasts:[],totals:{pricedYuan:0,awakeningBlueprints:0,overflowResearch:0},equivalents:{count:'36'}};
  let account='fake-A';
  const context={document:{addEventListener(){},createElement(){return {content:{firstElementChild:{}}};}},setTimeout(fn){tasks.push(fn);},console};
  context.window=context;context.QinshiAccounts={currentAccount:()=>({id:account})};
  context.MACHINE_BEAST_SCHOOL_PLANNER={equivalentPlansPage(data,p,offset,limit){calls.push([offset,limit]);const start=Number(offset),end=Math.min(start+limit,35);return {plans:Array.from({length:end-start},(_,i)=>({stableKey:String(start+i),beasts:[],totals:{awakeningBlueprints:0}})),nextOffset:String(end),hasMore:end<35};}};
  vm.createContext(context);
  const source=fs.readFileSync(path.join(__dirname,'../js/machine-beasts-ui.js'),'utf8');
  vm.runInContext(source.replace('window.MACHINE_BEAST_UI = {','window.paginationTest={state,presentation,el,rendered,setMode,equivalentMaterials,showMoreEquivalentMaterials,cancelCalculation};window.MACHINE_BEAST_UI = {'),context);
  const ui=context.paginationTest;ui.state.schoolDraft={schoolId:'hegemonic',targetStage:5};ui.state.schoolResult={plans:[plan]};
  ui.el.calculatorResult={querySelector:()=>section,querySelectorAll:()=>[],hidden:false,removeAttribute(){}};
  ui.el.calculator={querySelectorAll:()=>[]};
  ui.el.modes={querySelectorAll:()=>[]};ui.el.progress={};ui.el.reference={};
  Object.assign(ui.rendered,{calculator:true,progress:true,reference:true});ui.state.mode='calculator';
  return {ui,plan,calls,appended,button,count,step(){tasks.shift()();},flush(){while(tasks.length)tasks.shift()();},account(value){account=value;}};
}
// A replay from offset zero, a whole-section replacement, or a missing stale guard breaks these tests.
test('first ten are cached; later batches decode only the next ten and append',()=>{
  const f=fixture();f.ui.equivalentMaterials(f.plan,0);f.ui.equivalentMaterials(f.plan,0);
  assert.deepEqual(f.calls,[['0',10]],'rerender must use cached material HTML');
  for(let i=0;i<3;i++){f.ui.showMoreEquivalentMaterials(0);f.ui.showMoreEquivalentMaterials(0);f.flush();}
  assert.equal(f.calls.reduce((n,row)=>n+row[1],0),35);
  assert.deepEqual(f.calls.slice(1).map(row=>row[0]),Array.from({length:25},(_,i)=>String(i+10)));
  assert.equal(f.appended.length,3);assert.match(f.count.textContent,/35／35/);assert.equal(f.button.hidden,true);
});
test('queued pages cannot write after account, result, or cancellation changes',()=>{
  for(const change of [f=>f.account('fake-B'),f=>{f.ui.state.schoolResult={plans:[f.plan]};},f=>f.ui.cancelCalculation(true)]){
    const f=fixture();f.ui.equivalentMaterials(f.plan,0);f.ui.showMoreEquivalentMaterials(0);change(f);f.flush();
    assert.equal(f.appended.length,0);assert.deepEqual(f.calls,[['0',10]]);
  }
});
test('a new result with identical values does not reuse the previous graph',()=>{
  const f=fixture();f.ui.equivalentMaterials(f.plan,0);const newer={...f.plan};f.ui.state.schoolResult={plans:[newer]};
  f.ui.equivalentMaterials(newer,0);assert.deepEqual(f.calls,[['0',10],['0',10]]);
});
test('real setMode round trip retains loaded pages and resumes at the next offset',()=>{
  const f=fixture();f.ui.equivalentMaterials(f.plan,0);f.ui.showMoreEquivalentMaterials(0);f.flush();
  f.ui.setMode('progress');f.ui.setMode('reference');f.ui.setMode('calculator');
  f.ui.showMoreEquivalentMaterials(0);f.flush();
  assert.equal(f.appended.length,2);assert.match(f.count.textContent,/30／35/);
  assert.deepEqual(f.calls,[['0',10],...Array.from({length:20},(_,i)=>[String(i+10),1])]);
});
test('mode switch cancels a partial batch without allowing its queued task to revive',()=>{
  const f=fixture();f.ui.equivalentMaterials(f.plan,0);f.ui.showMoreEquivalentMaterials(0);f.step();
  f.ui.setMode('progress');f.ui.setMode('calculator');
  f.ui.showMoreEquivalentMaterials(0);f.flush();
  assert.equal(f.appended.length,1);assert.match(f.count.textContent,/20／35/);
  assert.deepEqual(f.calls,[['0',10],['10',1],...Array.from({length:10},(_,i)=>[String(i+10),1])]);
});
