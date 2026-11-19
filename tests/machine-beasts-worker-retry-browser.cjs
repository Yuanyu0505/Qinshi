'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountItem}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function enter(){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();await openApp(page,origin+'/#machine-beasts');
  return {page,context};
}

for(const kind of ['beast-single','beast-school'])test(kind+' real Worker load error recovers on next run and agrees with bounded core',async()=>{
  const {page,context}=await enter();try{
    let loads=0;
    await context.route('**/js/calculation-worker.js*',async route=>{
      if(++loads===1)await route.fulfill({contentType:'application/javascript',body:'throw new Error("isolated temporary Worker load failure");'});
      else await route.continue();
    });
    const result=await page.evaluate(async kind=>{
      const data=window.MACHINE_BEAST_DATA,beast=data.beasts.find(item=>item.id==='war-demon');
      const school=data.schools.find(item=>item.beastIds.includes(beast.id)),progressByBeast={};
      school.beastIds.forEach(id=>progressByBeast[id]={inventory:{none:{0:20}}});
      const input=kind==='beast-single'
        ? {beastId:beast.id,progress:{inventory:{none:{0:20}}},options:{targetLevel:10,newRankMode:'zero',convertOwnedInventory:true}}
        : {schoolId:school.id,progressByBeast,options:{targetStage:1,newRankMode:'zero',convertOwnedInventory:true}};
      let fallbackCalls=0;
      const runner=window.QinshiCalculationRunner.create({kind,fallback(){fallbackCalls++;throw Error('main thread forbidden');}});
      let failure='';try{await runner.run(input);}catch(error){failure=error.message;}
      const actual=await runner.run(input);runner.dispose();
      const expected=kind==='beast-single'
        ? window.MACHINE_BEAST_CORE.calculateInvestmentPlan(data,beast,input.progress,input.options)
        : window.MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans(data,school.id,input.progressByBeast,input.options);
      return {failure,fallbackCalls,valid:actual.valid,agrees:JSON.stringify(actual)===JSON.stringify(expected)};
    },kind);
    assert.match(result.failure,/后台计算/);assert.equal(result.fallbackCalls,0);
    assert.equal(result.valid,true);assert.equal(result.agrees,true);assert.equal(loads,2);
    console.log('WORKER_RETRY '+JSON.stringify({kind,loads,...result}));
  }finally{await context.close();}
});

test('existing calculate button recovers after constructor failure without changing inventory',async()=>{
  const {page,context}=await enter();try{
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('war-demon');
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();
      view.calcTargetLevel=10;view.singleNewRankMode='zero';view.calcDraft.inventory={none:{0:20}};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:{none:{0:20}}};
      window.MACHINE_BEAST_UI.restoreView(view);
      const Native=window.Worker;window.retryAttempts=0;window.retryPayload=null;
      window.Worker=function(...args){
        if(++window.retryAttempts===1)throw Error('isolated temporary constructor failure');
        const worker=new Native(...args),post=worker.postMessage.bind(worker);
        worker.postMessage=message=>{window.retryPayload=structuredClone(message.input);post(message);};return worker;
      };
    });
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>document.querySelector('#machine-beast-error')?.textContent.includes('后台计算'));
    assert.equal(await page.evaluate(()=>window.retryAttempts),1);
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.MACHINE_BEAST_UI.captureView().calcResult!==null);
    const result=await page.evaluate(()=>{
      const input=window.retryPayload,data=window.MACHINE_BEAST_DATA;
      const expected=window.MACHINE_BEAST_CORE.calculateInvestmentPlan(data,data.beasts.find(item=>item.id===input.beastId),input.progress,input.options);
      const actual=window.MACHINE_BEAST_UI.captureView().calcResult;
      return {attempts:window.retryAttempts,valid:actual.valid,agrees:JSON.stringify(actual)===JSON.stringify(expected)};
    });
    assert.deepEqual(result,{attempts:2,valid:true,agrees:true});
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    console.log('WORKER_UI_RETRY '+JSON.stringify(result));
  }finally{await context.close();}
});

test('caller account and sequence guards ignore delayed real Worker results and old errors',async()=>{
  const {page,context}=await enter();try{
    await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('war-demon');
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();view.calcTargetLevel=10;view.singleNewRankMode='zero';
      window.MACHINE_BEAST_UI.restoreView(view);
      const create=window.QinshiCalculationRunner.create;
      window.delayedJobs=[];
      window.QinshiCalculationRunner.create=options=>{
        const runner=create(options),run=runner.run;
        runner.run=input=>run(input).then(result=>new Promise((resolve,reject)=>{
          window.delayedJobs.push({result,resolve,reject});
        }));return runner;
      };
      // Account-identity test double only: never changes account data or storage.
      const current=window.QinshiAccounts.currentAccount();window.testAccount=current;
      window.QinshiAccounts.currentAccount=()=>window.testAccount;
    });
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.delayedJobs.length===1);
    await page.evaluate(async()=>{
      window.testAccount={id:'isolated-next-account'};
      window.delayedJobs[0].resolve(window.delayedJobs[0].result);
      await new Promise(resolve=>setTimeout(resolve,0));
    });
    assert.equal(await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult),null,'changed account must not receive old result');
    // Input change invalidates the first caller sequence and re-enables calculate.
    await page.locator('[data-calc-field="research"]').fill('1');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.delayedJobs.length===2);
    await page.locator('[data-calc-field="research"]').fill('2');
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.delayedJobs.length===3);
    await page.evaluate(async()=>{
      window.delayedJobs[2].resolve(window.delayedJobs[2].result);
      await new Promise(resolve=>setTimeout(resolve,0));
      window.delayedJobs[1].reject(Error('isolated stale account calculation error'));
      await new Promise(resolve=>setTimeout(resolve,0));
    });
    const result=await page.evaluate(()=>({
      fresh:JSON.stringify(window.MACHINE_BEAST_UI.captureView().calcResult)===JSON.stringify(window.delayedJobs[2].result),
      visible:!document.querySelector('#machine-beast-calculator-result').hidden,
      staleError:document.querySelector('#machine-beast-error').textContent.includes('isolated stale')
    }));
    assert.deepEqual(result,{fresh:true,visible:true,staleError:false});
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    console.log('WORKER_CALLER_GUARDS '+JSON.stringify(result));
  }finally{await context.close();}
});
