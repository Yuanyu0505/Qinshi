// Isolated localhost installation of actual 1.0.59 -> current release.
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve');
const {ensureTestAccount,currentAppVersion}=require('./browser-test-helpers.cjs');
const OLD='da4f58542bf4188ce58fc05d0f867c44394a9d70';
test('installed 1.0.59 migrates fixed pack6, retains balances and computes dual goals offline on a worker',{timeout:120000},async()=>{
  const old=new Map();for(const file of ['index.html','service-worker.js','version.json','js/pwa.js','js/app.js','js/partition-loader.js','js/calculation-worker.js','js/secret-realm-core.js','js/secret-realm-planner.js','js/secret-realm-ui.js','data/secret-realm.js','css/secret-realm.css','js/inscription.js','data/2026-09-content-update.js','data/wooden-man-alley.js','js/wooden-man-alley-planner.js','js/wooden-man-alley-ui.js'])old.set('/'+file,execFileSync('git',['-c','safe.directory=C:/Users/pghyl/Desktop/deepseek','show',OLD+':'+file],{maxBuffer:16*1024*1024}));
  const server=createServer(),serve=server.listeners('request')[0];server.removeListener('request',serve);let oldMode=true,browser,context;
  server.on('request',(req,res)=>{const p=new URL(req.url,'http://test.local').pathname,key=p==='/'?'/index.html':p;if(oldMode&&old.has(key)){res.writeHead(200,{'Content-Type':key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.json')?'application/json':key.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(old.get(key));}else serve(req,res);});
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(()=>{Date.now=()=>Date.parse('2026-10-23T04:00:00Z');});const page=await context.newPage();
    await page.goto(url,{waitUntil:'networkidle'});await ensureTestAccount(page);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));assert.equal(await page.locator('#pwa-version').innerText(),'1.0.59');
    await page.evaluate(()=>document.querySelector('[data-partition=secret-realm]').click());await page.locator('#secret-realm-content').waitFor();
    const account=await page.evaluate(()=>{const d=window.SECRET_REALM_DATA,k=window.SECRET_REALM_CORE;let s=k.createDefault(d);s=k.setStartDate(s,'guigu',6,'2026-10-20',Date.now(),d);s=k.updateTotals(s,'guigu',{cumulative:321,inventory:7},d);s=k.updateSource(s,'guigu',6,'pack6',{purchased:1,obtained:1,todayDate:'2026-10-23',todayPurchased:1,todayObtained:1},Date.now(),d);window.QinshiAccounts.setItem('qinshi_secret_realms_v1',JSON.stringify(s));return window.QinshiAccounts.currentAccount().id;});
    oldMode=false;await page.evaluate(()=>window.QinshiPWA.checkForUpdate());await page.locator('#pwa-update-notice').waitFor({state:'visible',timeout:30000});await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.locator('#pwa-apply-update').click()]);
    assert.equal(await page.locator('#pwa-version').innerText(),currentAppVersion());assert.equal(await page.evaluate(()=>window.QinshiAccounts.currentAccount().id),account);
    await page.locator('#secret-realm-content').waitFor();assert.equal(await page.locator('[name=cumulative]').inputValue(),'321');assert.equal(await page.locator('[name=inventory]').inputValue(),'7');assert.equal(await page.locator('[name=currency]').inputValue(),'0');assert.equal(await page.locator('[data-realm-source=pack6] [name=todayObtained]').count(),0);
    await page.locator('[name=currency]').fill('12');await page.locator('[data-realm-form=totals] [type=submit]').click();
    const migrated=await page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')));assert.equal(migrated.schemaVersion,2);assert.equal(migrated.realms.guigu.periods[6].sources.pack6.obtained,3);assert.equal(migrated.realms.guigu.inventory,7);
    await context.setOffline(true);await page.reload({waitUntil:'networkidle'});await page.locator('#secret-realm-content').waitFor();assert.equal(await page.locator('[name=currency]').inputValue(),'12');
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=targetEnabled]').uncheck();await page.locator('[name=currencyTargetEnabled]').check();await page.locator('[name=currencyTarget]').fill('18');await page.evaluate(()=>{window.SECRET_REALM_PLANNER={plan:()=>{throw Error('Main thread fallback forbidden');}};});await page.locator('[data-realm-calculate]').click();await page.locator('.realm-plan').waitFor();const text=await page.locator('.realm-plan').innerText();assert.match(text,/实际计划抽取\s*6/);assert.match(text,/预计剑玦余额\s*18/);
    const cachesList=await page.evaluate(()=>caches.keys());assert.ok(cachesList.includes('qinshi-site-'+currentAppVersion()));assert.equal(cachesList.includes('qinshi-site-1.0.59'),false);
  }finally{await context?.close();await browser?.close();await new Promise(r=>server.close(r));}
});
