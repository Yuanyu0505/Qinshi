'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountItem}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
for(const [width,fallback] of [[390,false],[1280,false]])test('convertible stock reaches the real UI without saving inventory '+width+'/'+fallback,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  if(fallback)await context.addInitScript(()=>{window.Worker=function(){throw new Error('test fallback');};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.locator('[data-calc-beast]').selectOption('war-demon');
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();
      view.calcDraft.research=0;view.calcDraft.fragments=0;view.calcDraft.inventory={none:{0:20}};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:{none:{0:20}}};view.singleNewRankMode='zeroToSeven';view.calcTargetLevel=10;view.calcResult=null;
      window.MACHINE_BEAST_UI.restoreView(view);
    });
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>{const result=window.MACHINE_BEAST_UI.captureView().calcResult;return result&&document.querySelector('#machine-beast-calculator-result').getAttribute('aria-busy')!=='true';});
    const result=await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult);
    assert.equal(result.valid,true);assert.equal(result.totals.newInvestedCount,0);assert.equal(result.totals.investedCount,5);
    await page.locator('.machine-inventory-conversion').waitFor();
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(dimensions[0]<=dimensions[1]);
    await page.locator('#machine-beast-calculator-result').screenshot({path:'outputs/machine-beast-conversion-'+width+'.png'});
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();view.calcDraft.inventory={none:{10:1}};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:{none:{10:1}}};view.singleNewRankMode='zero';view.calcTargetLevel=1;view.calcResult=null;window.MACHINE_BEAST_UI.restoreView(view);
    });
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.MACHINE_BEAST_UI.captureView().calcResult!==null);
    const high=await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult);
    assert.equal(high.inventoryConversion.remainingBaseBodies,7);
    assert.ok(!(await page.locator('#machine-beast-calculator-result').innerText()).includes('NaN'));
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
