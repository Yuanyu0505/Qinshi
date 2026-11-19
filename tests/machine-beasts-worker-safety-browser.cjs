'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountItem}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function enter(fail){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await context.addInitScript(fail=>{
    const Native=window.Worker;window.workerStarted=0;window.workerStopped=0;
    window.Worker=function(...args){if(fail)throw Error('isolated unavailable Worker');const worker=new Native(...args);window.workerStarted++;
      const terminate=worker.terminate.bind(worker);worker.terminate=()=>{window.workerStopped++;terminate();};return worker;};
    window.uiTicks=0;setInterval(()=>window.uiTicks++,30);
  },fail);
  const page=await context.newPage();await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
  return {page,context};
}
test('Worker creation failure returns a visible safe error and keeps inputs responsive',async()=>{
  const {page,context}=await enter(true);try{
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>document.querySelector('#machine-beast-error')?.textContent.includes('后台计算'));
    assert.equal(await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult),null);
    await page.locator('[data-calc-field="research"]').fill('12');
    assert.equal(await page.locator('[data-calc-field="research"]').inputValue(),'12');
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
  }finally{await context.close();}
});
test('real Worker with controlled result delivery can be canceled by input without writing inventory',async()=>{
  const {page,context}=await enter(false);try{
    // Hold final delivery, not execution: cancellation must not depend on how
    // slowly the real solver runs on a particular machine.
    await context.route('**/js/calculation-worker.js*',async route=>{
      const response=await route.fetch(),source=await response.text();
      await route.fulfill({response,body:'var deliverResult=self.postMessage.bind(self);self.postMessage=function(message){if(message.result||message.error)self.__heldResult=message;else deliverResult(message);};\n'+source});
    });
    await page.locator('[data-calc-beast]').selectOption('mechanical-bear');
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView(),inventory={};
      for(const mod of window.MACHINE_BEAST_DATA.modifications){inventory[mod.id]={};for(let rank=0;rank<=7;rank++)inventory[mod.id][rank]=2;}
      view.calcDraft={...view.calcDraft,research:0,fragments:0,showMods:true,showHighRanks:true,inventory};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:inventory};view.singleNewRankMode='zeroToSeven';view.calcTargetLevel=20;view.calcResult=null;
      window.MACHINE_BEAST_UI.restoreView(view);
    });
    await page.locator('[data-machine-action="calculate"]').click();await page.waitForFunction(()=>window.workerStarted>0);
    const start=await page.evaluate(()=>window.uiTicks);
    await page.waitForFunction(t=>window.uiTicks>=t+5,start);
    assert.equal(await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult),null);
    await page.locator('[data-calc-field="research"]').fill('1');
    await page.waitForFunction(()=>window.workerStopped>0);
    assert.equal(await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult),null);
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    console.log('WORKER_CANCEL '+JSON.stringify(await page.evaluate(()=>({started:workerStarted,stopped:workerStopped,ticks:uiTicks}))));
  }finally{await context.close();}
});

test('Worker and direct API agree on bounded single and school inputs',async()=>{
  const {page,context}=await enter(false);try{
    const result=await page.evaluate(async()=>{
      const data=window.MACHINE_BEAST_DATA,core=window.MACHINE_BEAST_CORE,planner=window.MACHINE_BEAST_SCHOOL_PLANNER;
      const beast=data.beasts.find(b=>b.id==='war-demon');
      const input={beastId:beast.id,progress:{inventory:{none:{0:20}}},options:{targetLevel:10,newRankMode:'zeroToSeven',convertOwnedInventory:true}};
      const single=window.QinshiCalculationRunner.create({kind:'beast-single',fallback(){throw Error('not permitted');}});
      const actual=await single.run(input),expected=core.calculateInvestmentPlan(data,beast,input.progress,input.options);single.dispose();
      const school=data.schools.find(s=>s.beastIds.includes(beast.id)),progressByBeast={};
      school.beastIds.forEach(id=>{progressByBeast[id]={inventory:{none:{0:20}}};});
      const schoolInput={schoolId:school.id,progressByBeast,options:{targetStage:1,newRankMode:'zero',convertOwnedInventory:true}};
      const group=window.QinshiCalculationRunner.create({kind:'beast-school',fallback(){throw Error('not permitted');}});
      const groupActual=await group.run(schoolInput),groupExpected=planner.calculateSchoolPlans(data,school.id,progressByBeast,schoolInput.options);group.dispose();
      return {single:JSON.stringify(actual)===JSON.stringify(expected),school:JSON.stringify(groupActual)===JSON.stringify(groupExpected),singleValid:actual.valid,schoolValid:groupActual.valid};
    });
    assert.deepEqual(result,{single:true,school:true,singleValid:true,schoolValid:true});
  }finally{await context.close();}
});

for(const beastId of ['red-serpent','mechanical-bear'])test('UI clear-to-default permits owned-only zero-purchase school planning '+beastId,async()=>{
  const {page,context}=await enter(false);try{
    await page.locator('[data-machine-calculator-mode="school"]').click();
    await page.locator('[data-school-calc-school]').selectOption('hegemonic');
    const price=beastId==='red-serpent'?'[data-reference-cost-field="awakeningBlueprintPrice"]':'[data-reference-beast-price="mechanical-bear"]';
    await page.locator('#machine-price-settings').evaluate(n=>n.open=true);
    await page.locator(price).evaluate(node=>{for(let detail=node.closest('details');detail;detail=detail.parentElement.closest('details'))detail.open=true;});
    await page.locator(price).fill('');await page.locator(price).dispatchEvent('change');
    assert.equal(await page.locator(price).inputValue(),beastId==='red-serpent'?'70':'45000');
    await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').fill(beastId==='red-serpent'?'10000':'0');
    await page.locator('[data-reference-cost-field="awakeningBlueprintStock"]').dispatchEvent('change');
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.evaluate(beastId=>{
      const view=window.MACHINE_BEAST_UI.captureView(),draft=view.schoolDraft,data=window.MACHINE_BEAST_DATA;
      for(const id of Object.keys(draft.participating)){draft.participating[id]=false;draft.progressByBeast[id].research=0;}
      for(const [id,level]of [['war-demon',20],['nine-headed-jade',20],['potu-sanlang',3]])draft.progressByBeast[id].research=data.researchThresholds[level];
      draft.participating[beastId]=true;draft.progressByBeast[beastId].inventory={none:{0:1}};
      draft.ownedPoliciesByBeast[beastId]={useOwnedInventory:true,limits:{none:{0:1}}};
      draft.targetStage=1;draft.useOwnedInventory=true;draft.newRankMode='zero';view.schoolResult=null;
      window.MACHINE_BEAST_UI.restoreView(view);
    },beastId);
    await page.locator('[data-machine-action="calculate-school"]').click();await page.waitForFunction(()=>window.MACHINE_BEAST_UI.captureView().schoolResult!==null);
    const result=await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().schoolResult);
    assert.equal(result.valid,true,JSON.stringify(result.errors));
    assert.equal(result.plans[0].totals.projectedTotalLevel,45);
    assert.equal(result.plans[0].totals.newInvestedCount,0);
    assert.equal(result.plans[0].totals.pricedYuan,beastId==='red-serpent'?0:6720);
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
  }finally{await context.close();}
});

test('instrumented real Worker pressure records frontiers and completes or remains cancellable',async()=>{
  const {page,context}=await enter(false);try{
    // Test-only instrumentation is served to Workers, never written to product JS.
    await context.route('**/js/machine-beasts.js*',async route=>{
      const response=await route.fetch();let source=await response.text();
      const init='rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:Array(types.length).fill(0)}];';
      const put='bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});rows[r]=bucket;';
      const header='var __pressure={puts:0,states:0,peakStates:0,frontierPeak:0,buckets:0},__buckets={};function __pressurePut(r,n){__pressure.puts++;var old=__buckets[r]||0;if(!old)__pressure.buckets++;__buckets[r]=n;__pressure.states+=n-old;__pressure.peakStates=Math.max(__pressure.peakStates,__pressure.states);__pressure.frontierPeak=Math.max(__pressure.frontierPeak,n);if(__pressure.puts%5000===0&&typeof document==="undefined")self.postMessage({diagnostic:__pressure});}\n';
      assert.ok(source.includes(init)&&source.includes(put));
      source=header+source.replace(init,'__pressure.candidates=types.length;__pressure.gcd=unit;__pressure.capacity=rows.length;'+init).replace(put,put+'__pressurePut(r,bucket.length);');
      await route.fulfill({response,body:source});
    });
    await page.evaluate(()=>{
      const Worker=window.Worker;window.pressureSamples=[];
      window.Worker=function(...args){const worker=new Worker(...args);worker.addEventListener('message',e=>{if(e.data?.diagnostic)window.pressureSamples.push(e.data.diagnostic);});return worker;};
    });
    for(const [mode,mods]of [['zero',false],['zeroToSeven',false],['zeroToSeven',true]]){
      await page.evaluate(([mode,mods])=>{
        const inventory={};for(const mod of window.MACHINE_BEAST_DATA.modifications){inventory[mod.id]={};for(let rank=0;rank<=10;rank++)inventory[mod.id][rank]=rank<8?2:1;}
        window.pressureSamples=[];window.pressureRunner=window.QinshiCalculationRunner.create({kind:'beast-single'});
        window.pressureStarted=performance.now();window.pressureState='pending';
        window.pressureRunner.run({beastId:'mechanical-bear',progress:{inventory,showHighRanks:true,showMods:true},options:{targetLevel:20,newRankMode:mode,allowNewModifications:mods,convertOwnedInventory:true}})
          .then(result=>{window.pressureValid=result.valid;window.pressureState='complete';},e=>window.pressureState=e.name);
      },[mode,mods]);
      await page.waitForFunction(()=>performance.now()-window.pressureStarted>1200);
      const metrics=await page.evaluate(()=>({last:window.pressureSamples.at(-1)||null,elapsedMs:performance.now()-window.pressureStarted,ticks:window.uiTicks,state:window.pressureState,valid:window.pressureValid}));
      console.log('BROWSER_PRESSURE '+JSON.stringify({mode,mods,...metrics}));
      assert.ok(metrics.ticks>5);
      const canceled=await page.evaluate(()=>{if(window.pressureState!=='pending')return false;window.pressureRunner.cancel();return true;});
      if(canceled)await page.waitForFunction(()=>window.pressureState==='AbortError');
      else assert.deepEqual(await page.evaluate(()=>({state:window.pressureState,valid:window.pressureValid})),{state:'complete',valid:true});
      await page.evaluate(()=>window.pressureRunner.dispose());
    }
  }finally{await context.close();}
});
