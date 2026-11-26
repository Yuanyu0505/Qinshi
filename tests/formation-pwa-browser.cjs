"use strict";

const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');

let server,browser,url;
before(async()=>{
 server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 url='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{
 if(browser)await browser.close();
 if(server)await new Promise(resolve=>server.close(resolve));
});

test('formation lazy-load failure gives a usable retry and then initializes',async()=>{
 const context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  await openApp(page,url);
  let attempts=0;
  await page.route('**/js/formations.js?v=*',async route=>{
   attempts+=1;
   if(attempts===1)await route.abort('failed');
   else await route.continue();
  });
  await page.locator('.tab[data-partition="formations"]').click();
  await page.locator('.partition-load-status').getByText(/分区加载失败/).waitFor();
  assert.equal(await page.evaluate(()=>window.QinshiPartitionLoader.isReady('formations')),false);
  await page.locator('.tab[data-partition="formations"]').click();
  await page.locator('#formation-selector [data-formation-id]').first().waitFor();
  assert.equal(await page.evaluate(()=>window.QinshiPartitionLoader.isReady('formations')),true);
  assert.equal(attempts,2);
 }finally{await context.close();}
});

test('installed PWA loads formation reference and exact Worker while offline',async()=>{
 const context=await browser.newContext({serviceWorkers:'allow'});
 const page=await context.newPage();
 try{
  await openApp(page,url);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  if(!await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)))await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
  await context.setOffline(true);
  await page.goto(url+'/#formations',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.QinshiAccounts?.currentAccount()));
  if(!await page.locator('#partition-formations').isVisible())await page.locator('.tab[data-partition="formations"]').click();
  await page.locator('[data-formation-view="reference"]').click();
  await page.locator('[data-limit-select="地泽二十四"]').click();
  await page.locator('[data-limit-output] .formation-benefits').first().waitFor();
  const result=await page.evaluate(async()=>{
   const formation=window.FORMATIONS_DATA.items.find(item=>item.name==='地泽二十四');
   const reference=window.FORMATION_MAX_REFERENCE_DATA.formations.find(item=>item.name==='地泽二十四');
   const progress=window.FORMATION_LIMIT_ADAPTER.buildLimitProgress(formation,reference).progress;
   window.FORMATIONS.recommendFormation=()=>{throw new Error('main-thread fallback forbidden');};
   return window.FORMATION_RECOMMENDATION_UI.run('offline-formation',formation,progress,window.FORMATION_RECOMMENDATION_UI.defaults());
  });
  assert.equal(result.exactScore,'5345260');
  assert.equal(result.tieCount,'2');
 }finally{await context.close();}
});
