// Real installed 1.0.58 -> working release upgrade, isolated localhost/test account only.
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {ensureTestAccount,currentAppVersion}=require('./browser-test-helpers.cjs');
const OLD='f75564e90606e45b16da3c9c5b6c011917054462';
test('installed 1.0.58 upgrades to secret realm release and retains progress and offline worker', {timeout:120000},async()=>{
  const old=new Map();
  for(const file of ['index.html','service-worker.js','version.json','js/pwa.js','js/app.js','js/partition-loader.js','js/calculation-worker.js','js/inscription.js'])old.set('/'+file,execFileSync('git',['-c','safe.directory=C:/Users/pghyl/Desktop/deepseek','show',OLD+':'+file],{maxBuffer:16*1024*1024}));
  const server=createServer(),serve=server.listeners('request')[0];server.removeListener('request',serve);let oldMode=true,browser,context,page;const pageErrors=[];
  server.on('request',(req,res)=>{const pathname=new URL(req.url,'http://local.test').pathname;const key=pathname==='/'?'/index.html':pathname;
    if(oldMode&&old.has(key)){res.writeHead(200,{'Content-Type':key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.json')?'application/json':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(old.get(key));}else serve(req,res);
  });
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(url,{waitUntil:'networkidle'});await ensureTestAccount(page);
    // Account creation may reload before installation finishes; install the old release first.
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(async()=>{const registration=await navigator.serviceWorker.getRegistration();return registration?.active?.state==='activated';});
    const oldReload=await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    assert.equal(oldReload.fromServiceWorker(),true,'The installed historical release must serve the old page');
    assert.equal(await page.locator('#pwa-version').innerText(),'1.0.58');assert.equal(await page.locator('[data-partition=secret-realm]').count(),0);
    assert.deepEqual(pageErrors,[],'The historical 1.0.58 page must not throw runtime errors');
    const id=await page.evaluate(()=>{window.QinshiAccounts.setItem('qinshi_atlas_target_level_v1','15');return window.QinshiAccounts.currentAccount().id;});
    oldMode=false;await page.evaluate(()=>window.QinshiPWA.checkForUpdate());await page.locator('#pwa-update-notice').waitFor({state:'visible',timeout:30000});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle',timeout:30000}),page.locator('#pwa-apply-update').click()]);
    assert.equal(await page.locator('#pwa-version').innerText(),currentAppVersion());assert.equal(await page.evaluate(()=>window.QinshiAccounts.currentAccount().id),id);assert.equal(await page.evaluate(()=>window.QinshiAccounts.getItem('qinshi_atlas_target_level_v1')),'15');
    await page.evaluate(()=>document.querySelector('[data-partition=secret-realm]').click());await page.locator('#secret-realm-content').waitFor();
    const totals=page.locator('[data-realm-form=totals]');await totals.locator('[name=cumulative]').fill('321');await totals.locator('[name=inventory]').fill('7');await totals.locator('[type=submit]').click();
    assert.deepEqual(pageErrors,[],'The updated page must not throw runtime errors');
    await context.setOffline(true);await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>document.querySelector('[data-partition=secret-realm]').click());await page.locator('#secret-realm-content').waitFor();assert.equal(await page.locator('[name=cumulative]').inputValue(),'321');
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=target]').fill('329');await page.evaluate(()=>{window.SECRET_REALM_PLANNER={plan:()=>{throw Error('Fallback forbidden by upgrade regression');}};});await page.locator('[data-realm-calculate]').click();
    await page.locator('[data-realm-results] .realm-plan').first().waitFor();assert.match(await page.locator('.realm-plan').first().innerText(),/第6期达标/);
    assert.equal(await page.evaluate(()=>window.QinshiAccounts.getItem('qinshi_atlas_target_level_v1')),'15');
    const names=await page.evaluate(()=>caches.keys());assert.ok(names.includes('qinshi-site-'+currentAppVersion()));assert.equal(names.includes('qinshi-site-1.0.58'),false);
    assert.deepEqual(pageErrors,[],'The offline page must not throw runtime errors');
  }catch(error){
    try{if(page&&!page.isClosed())console.error('1.0.58 fixture failure diagnostics',{pageErrors,registration:await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r?.active?.state??null,installing:r?.installing?.state??null,waiting:r?.waiting?.state??null,controller:navigator.serviceWorker.controller?.state??null};})});}
    catch(diagnosticError){console.error('Fixture diagnostics unavailable',diagnosticError.message,pageErrors);}
    throw error;
  }finally{if(context)await context.close();if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
