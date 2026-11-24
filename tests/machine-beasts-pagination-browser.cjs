'use strict';
// Isolated fake-account regression. All non-local requests are blocked.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
const data=require('../data/machine-beasts.js'),planner=require('../js/machine-beast-school-planner.js');
const {execFileSync}=require('node:child_process'),root=require('node:path').resolve(__dirname,'..');
const {load}=require('../tools/machine-baseline-loader.cjs');
// The historical stress graph had 768 raw paths, many of which are now the
// same physical plan. Freeze the solver for this UI-only load scenario.
const stressRevision='aea9a10';
const stress=load(stressRevision);
const stressFiles=['machine-beasts','machine-beast-equivalents','machine-beast-school-planner'].map(name=>[name,execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',stressRevision+':js/'+name+'.js'],{cwd:root,encoding:'utf8'})]);
async function installStressSolver(context){
  for(const [name,body] of stressFiles)await context.route('**/js/'+name+'.js*',route=>route.fulfill({contentType:'application/javascript',body}));
}
const baseline=process.env.PAGINATION_BASELINE_REVISION||'';
const clicks=Number(process.env.PAGINATION_CLICKS||76);
const outputDir=process.env.PAGINATION_OUTPUT_DIR||'outputs/1148-pagination';
function fixtureInput(){
  const progress={},school=data.schools.find(s=>s.id==='hegemonic');
  school.beastIds.forEach((id,index)=>{
    const beast=data.beasts.find(b=>b.id===id),inventory={};
    if(beast.quality==='orange'){
      inventory.none={0:2+index%3,7:1,8:1,9:index%2,10:index%3===0?1:0};
      inventory.fullDivine={7:index%2,8:index%3===0?1:0};inventory.initial={0:index%2,9:index%4===0?1:0};
    }else inventory.none={0:Math.ceil(data.researchThresholds[beast.maxLevel]/data.researchValues[beast.quality][0].none),[beast.maxRank]:2};
    progress[id]={research:0,fragments:index%3,showHighRanks:true,showMods:true,inventory};
  });
  return {progress,options:{targetStage:5,newRankMode:'zeroToSeven',convertOwnedInventory:true,allowNewModifications:false,allowNewHighRanks:false,bluePurpleInventoryOnly:true,referenceCostSettings:{awakeningBlueprintPrice:70,useAwakeningBlueprintStock:true,awakeningBlueprintStock:0}}};
}
let browser,server,origin,result,expected;
before(async()=>{
  const fixture=fixtureInput();
  const current=planner.calculateSchoolPlans(data,'hegemonic',fixture.progress,fixture.options);
  assert.equal(current.valid,true);assert.equal(current.plans[1].equivalents.count,'3');
  result=stress.planner.calculateSchoolPlans(stress.data,'hegemonic',fixture.progress,fixture.options);
  assert.equal(result.valid,true);assert.equal(result.plans[1].equivalents.count,'768');
  expected=[];let page={nextOffset:'0',hasMore:true};
  while(page.hasMore){page=stress.planner.equivalentPlansPage(stress.data,result.plans[1],page.nextOffset,10);expected.push(...page.plans.map(plan=>plan.stableKey));}
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync(outputDir,{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
test('mode navigation retains loaded DOM and resumes pagination after canceling pending tasks',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await installStressSolver(context);
  const source=fs.readFileSync(require.resolve('../js/machine-beasts-ui.js'),'utf8');
  await context.route('**/js/machine-beasts-ui.js*',route=>route.fulfill({contentType:'application/javascript',body:source.replace('window.MACHINE_BEAST_UI = {','window.paginationTest={state,el,equivalentGroup};window.MACHINE_BEAST_UI = {')}));
  const page=await context.newPage();
  try{
    await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
    const summary=await page.evaluate(async result=>{
      const ui=window.paginationTest;ui.state.schoolDraft={schoolId:'hegemonic',targetStage:5};ui.state.schoolResult=result;
      ui.el.calculatorResult.hidden=false;ui.el.calculatorResult.innerHTML=ui.equivalentGroup(result.plans[1],1,'materials')+ui.equivalentGroup(result.plans[1],1,'effects');
      const section=ui.el.calculatorResult.firstElementChild;
      const button=section.querySelector('[data-machine-action="more-equivalents"]');
      button.click();while(button.hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,1));
      const first=section.querySelector('.machine-equivalent-combination');first.open=true;
      const offsets=[],native=window.MACHINE_BEAST_SCHOOL_PLANNER.equivalentPlansPage;
      window.MACHINE_BEAST_SCHOOL_PLANNER.equivalentPlansPage=function(...args){offsets.push(args[2]);return native.apply(this,args);};
      async function finish(){while(button.hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,1));}
      button.click();await finish();
      for(const mode of ['progress','reference','calculator'])document.querySelector('[data-machine-beast-mode="'+mode+'"]').click();
      button.click();await finish();
      const loaded=section.querySelectorAll('.machine-equivalent-combination').length;
      button.click(); // Queued old task must not append after this navigation.
      for(const mode of ['progress','calculator'])document.querySelector('[data-machine-beast-mode="'+mode+'"]').click();
      button.click();await finish();
      return {loaded,final:section.querySelectorAll('.machine-equivalent-combination').length,effects:ui.el.calculatorResult.querySelector('[data-equivalent-effects-index]').querySelectorAll('.machine-equivalent-combination').length,identity:first.isConnected&&first.open&&ui.el.calculatorResult.firstElementChild===section,offsets};
    },result);
    assert.equal(summary.loaded,31);assert.equal(summary.final,41);assert.equal(summary.effects,41);assert.equal(summary.identity,true);
    assert.equal(summary.offsets.length,30);assert.equal(new Set(summary.offsets).size,30);assert.ok(summary.offsets.every(offset=>BigInt(offset)>=10n));
  }finally{await context.close();}
});
for(const width of (process.env.PAGINATION_WIDTHS||'320,390,820,1366,1920').split(',').map(Number))test('exact 768 pagination preserves DOM and focus at '+width,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await installStressSolver(context);
  const root=require('node:path').resolve(__dirname,'..');
  const source=baseline?require('node:child_process').execFileSync('git',['-c','safe.directory='+root,'show',baseline+':js/machine-beasts-ui.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(require.resolve('../js/machine-beasts-ui.js'),'utf8');
  const markupRenderer=baseline?'equivalentMaterials':'equivalentGroup';
  await context.route('**/js/machine-beasts-ui.js*',route=>route.fulfill({contentType:'application/javascript',body:source.replace('window.MACHINE_BEAST_UI = {','window.paginationTest={state,el,presentation,showMoreEquivalentMaterials,cancelCalculation,renderGroup:'+markupRenderer+'};window.MACHINE_BEAST_UI = {')}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.text().startsWith('PAGINATION_PROGRESS '))console.log(message.text());});
  try{
    await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.evaluate(async ({result,baseline})=>{
      const ui=window.paginationTest;ui.state.schoolDraft={schoolId:'hegemonic',targetStage:5};ui.state.schoolResult=result;
      const start=performance.now();
      ui.el.calculatorResult.hidden=false;ui.el.calculatorResult.innerHTML=ui.renderGroup(result.plans[1],1,'materials')+(baseline?'':ui.renderGroup(result.plans[1],1,'effects'));
      const mainMarkupMs=performance.now()-start;
      window.paginationLongTasks=[];new PerformanceObserver(list=>window.paginationLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:false});
      if(!baseline){
        const button=ui.el.calculatorResult.querySelector('[data-machine-action="more-equivalents"]');
        if(ui.el.calculatorResult.querySelectorAll('[data-equivalent-index] .machine-equivalent-combination').length!==1)throw Error('alternatives decoded during main markup');
        button.click();
        while(button.hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,1));
      }
      console.log('PAGINATION_PROGRESS '+JSON.stringify({mainMarkupMs,firstBatchReadyMs:performance.now()-start}));
    },{result,baseline});
    const section=page.locator('[data-equivalent-index="1"]');
    await section.evaluate(node=>{
      node.closest('[data-detail-key]')?.setAttribute('open','');
      window.paginationFirst=node.querySelector('.machine-equivalent-combination');window.paginationFirst.open=true;
      window.paginationFirstSummary=window.paginationFirst.querySelector('summary');
    });
    await section.locator(baseline?'h3':'.machine-equivalent-combination > summary').first().scrollIntoViewIfNeeded();
    const stats=await page.evaluate(async({baseline,clicks})=>{
      const ui=window.paginationTest,plan=ui.state.schoolResult.plans[1],section=ui.el.calculatorResult.querySelector('[data-equivalent-index="1"]');
      const button=section.querySelector('[data-machine-action="more-equivalents"]');
      const times=[],scrollChanges=[];button.focus({preventScroll:true});
      let calls=0,decoded=0;const native=window.MACHINE_BEAST_SCHOOL_PLANNER.equivalentPlansPage;
      window.MACHINE_BEAST_SCHOOL_PLANNER.equivalentPlansPage=function(...args){calls++;decoded+=args[3];return native.apply(this,args);};
      const wallStart=performance.now();
      while(times.length<clicks&&(baseline||button.getAttribute('aria-disabled')!=='true'||button.hasAttribute('aria-busy'))){
        const before=scrollY,start=performance.now();
        (baseline?ui.el.calculatorResult.querySelector('[data-machine-action="more-equivalents"]'):button).click();
        while(button.hasAttribute('aria-busy'))await new Promise(resolve=>setTimeout(resolve,1));
        times.push(performance.now()-start);scrollChanges.push(scrollY-before);
        if(times.length%10===0)console.log('PAGINATION_PROGRESS '+JSON.stringify({pages:times.length,wallMs:performance.now()-wallStart}));
        if(!baseline&&document.activeElement!==button)throw Error('pagination lost keyboard focus');
        if(!baseline&&(!window.paginationFirst.isConnected||!window.paginationFirst.open||window.paginationFirst.querySelector('summary')!==window.paginationFirstSummary))throw Error('previous disclosure was rebuilt');
        if(baseline)await new Promise(resolve=>setTimeout(resolve,0));
      }
      await new Promise(resolve=>setTimeout(resolve,0));
      const current=ui.el.calculatorResult.querySelector('[data-equivalent-index="1"]');
      return {times,wallMs:performance.now()-wallStart,scrollChanges,calls,decoded,count:current.querySelectorAll('.machine-equivalent-combination').length,
        keys:Array.from(current.querySelectorAll('.machine-equivalent-combination')).slice(baseline?0:1).map(node=>node.dataset.detailKey.split(baseline?':alternative:':':combination:')[1]),
        nodeIdentity:window.paginationFirst.isConnected,focus:document.activeElement===button,
        longTasks:window.paginationLongTasks,overflow:document.documentElement.scrollWidth>innerWidth};
    },{baseline,clicks});
    assert.deepEqual(stats.keys,expected.slice(0,Math.min(767,10+clicks*10)));if(!baseline){assert.equal(stats.decoded,Math.min(757,clicks*10));assert.equal(stats.calls,Math.min(757,clicks*10));assert.ok(stats.scrollChanges.every(delta=>Math.abs(delta)<1),'scroll position changes without navigation');}
    assert.equal(stats.times.length,clicks);assert.equal(stats.overflow,false);assert.deepEqual(errors,[]);
    const name=(baseline?'baseline-':'')+width+(clicks===76?'':'-'+clicks+'pages');
    await page.screenshot({path:outputDir+'/'+name+'.png',fullPage:false});
    const output={width,baseline:baseline||null,browser:browser.version(),pages:stats.times.length,count:stats.count,decodeCalls:stats.calls,totalWallMs:stats.wallMs,totalMs:stats.times.reduce((a,b)=>a+b,0),maxPageMs:Math.max(...stats.times),longTasks:stats.longTasks,focus:stats.focus,scrollStable:stats.scrollChanges.every(d=>Math.abs(d)<1),nodeIdentity:stats.nodeIdentity,exactOrder:true};
    console.log('PAGINATION '+JSON.stringify(output));fs.writeFileSync(outputDir+'/'+name+'.json',JSON.stringify(output,null,2));
  }finally{await context.close();}
});
