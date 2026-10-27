const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
test.before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
test.after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
test('secret realm direct hash initializes independent realms with past periods locked',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}); const page=await context.newPage();
  try{await openApp(page,url+'/#secret-realm'); await page.locator('#secret-realm-content').waitFor({timeout:5000});
    assert.equal(await page.title(),'秘境'); assert.match(await page.locator('#secret-realm-content').innerText(),/鬼谷盖聂/);
    assert.match(await page.locator('[data-realm-status]').innerText(),/第6期.*未开始/);
    assert.equal(await page.locator('[data-realm-source="first-gift"]').count(),0);
  }finally{await context.close();}
});

async function openRealm(options={}){
  const context=await browser.newContext({viewport:{width:options.width||390,height:844}}),page=await context.newPage();
  if(options.now)await page.addInitScript(value=>{window.__realmNow=value;Date.now=()=>window.__realmNow;},Date.parse(options.now));
  await openApp(page,url+'/#secret-realm');await page.locator('#secret-realm-content').waitFor();return {context,page};
}
async function saved(page){return page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')));}
async function saveTotals(page,cumulative,inventory){const form=page.locator('[data-realm-form="totals"]');await form.locator('[name=cumulative]').fill(String(cumulative));await form.locator('[name=inventory]').fill(String(inventory));await form.locator('[type=submit]').click();}
async function setupSixYuan(page){await page.locator('[data-realm-mode=planner]').click();await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack6]').check();await page.locator('[name=target]').fill('3');}
async function runPlan(page){await page.locator('[data-realm-calculate]').click();await page.waitForFunction(()=>{const h=document.querySelector('#secret-realm-content');return h.getAttribute('aria-busy')==='false'&&document.querySelector('[data-realm-results] .realm-plan');},null,{timeout:10000});}

test('numeric UI totals save once without inventing source receipts before the event starts',async()=>{
  const {context,page}=await openRealm();try{
    await saveTotals(page,500,20);const state=await saved(page);assert.equal(state.realms.guigu.cumulative,500);assert.equal(state.realms.guigu.inventory,20);
    assert.equal(state.realms.guigu.periods[6].sources.pack6.obtained,0);assert.equal(await page.locator('[data-realm-source=pack6] [name=purchased]').isDisabled(),true);
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[name=cumulative]').inputValue(),'500');
  }finally{await context.close();}
});
test('real worker plan uses saved vouchers before discount and leaves receipts unchanged',async()=>{
  const {context,page}=await openRealm();try{
    await setupSixYuan(page);const settings=page.locator('[data-realm-form=settings]');await settings.locator('[name=vouchers]').fill('2');await settings.locator('[type=submit]').click();
    await page.locator('[name=target]').fill('3');await runPlan(page);const plans=page.locator('.realm-plan');assert.equal(await plans.count(),1);
    assert.match(await plans.first().innerText(),/¥1\.60/);assert.match(await plans.first().innerText(),/¥6\.00/);
    const state=await saved(page);assert.equal(state.settings.vouchers,2);assert.equal(state.realms.guigu.periods[6].sources.pack6.purchased,0);
    assert.equal(state.realms.guigu.cumulative,0);assert.equal(state.realms.guigu.inventory,0);
  }finally{await context.close();}
});
test('today purchased six-yuan pack immediately grants three tickets',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    const date=page.locator('[data-realm-form=date]');await date.locator('[name=startDate]').fill('2026-10-20');await date.locator('[type=submit]').click();
    assert.match(await page.locator('[data-realm-status]').innerText(),/进行中.*第4天/);
    const source=page.locator('[data-realm-source=pack6]');await source.locator('[name=purchased]').fill('1');await source.locator('[name=todayPurchased]').check();await source.locator('[type=submit]').click();
    const record=(await saved(page)).realms.guigu.periods[6].sources.pack6;assert.equal(record.purchased,1);assert.equal(record.obtained,3);assert.equal(record.todayPurchased,1);assert.equal(record.todayObtained,0);
    const input=await page.evaluate(()=>window.SECRET_REALM_CORE.buildPlanningInput(JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')),'guigu',Date.now(),window.SECRET_REALM_DATA));
    const s=input.periods[0].sources.find(x=>x.id==='pack6');assert.equal(s.availableDraws,0);assert.equal(s.maxPurchases,10);
  }finally{await context.close();}
});
test('a Beijing midnight boundary advances to the next planning period and locks expired records',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    await page.locator('[data-realm-id=gaoyue]').click();await saveTotals(page,400,20);
    const date=page.locator('[data-realm-form=date]');await date.locator('[name=startDate]').fill('2026-10-10');await date.locator('[type=submit]').click();
    assert.match(await page.locator('[data-realm-status]').innerText(),/第2期.*第14天/);
    await page.evaluate(()=>{window.__realmNow=Date.parse('2026-10-23T16:00:00Z');if(!window.QinshiAccounts.claimEditing(window.QinshiAccounts.currentAccount().id))throw Error('Test account editing lease unavailable after clock jump');document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await page.locator('[data-realm-status]').innerText(),/第3期.*未开始/);const state=await saved(page);assert.equal(state.realms.gaoyue.cumulative,400);assert.equal(state.realms.gaoyue.inventory,20);assert.deepEqual(state.realms.gaoyue.periods[2].sources,{});
    assert.equal(await page.locator('[data-realm-period="2"]').isDisabled(),true);
  }finally{await context.close();}
});

test('paid pass claims do not duplicate free pass or bill an already purchased pass',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    const date=page.locator('[data-realm-form=date]');await date.locator('[name=startDate]').fill('2026-10-20');await date.locator('[type=submit]').click();
    const source=page.locator('[data-realm-source=paid-pass]');await source.locator('[name=purchased]').fill('1');await source.locator('[name=obtained]').fill('30');await source.locator('[type=submit]').click();
    const state=await saved(page);assert.equal(state.realms.guigu.periods[6].sources['paid-pass'].obtained,30);assert.equal(state.realms.guigu.cumulative,0);
    const rows=await page.evaluate(()=>window.SECRET_REALM_CORE.buildPlanningInput(JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')),'guigu',Date.now(),window.SECRET_REALM_DATA).periods[0].sources);
    assert.equal(rows.find(r=>r.id==='paid-pass').availableDraws,58);assert.equal(rows.find(r=>r.id==='paid-pass').maxPurchases,0);assert.equal(rows.find(r=>r.id==='free-pass').availableDraws,11);
  }finally{await context.close();}
});
test('per-period source switches persist, all respects 648, and following does not affect the other realm',async()=>{
  const {context,page}=await openRealm();try{
    await page.locator('[data-realm-id=gaoyue]').click();await page.locator('[data-realm-mode=planner]').click();await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack648]').check();await page.locator('[data-realm-action=following]').click();
    let state=await saved(page);for(let n=2;n<=6;n++){assert.equal(state.realms.gaoyue.periods[n].sources.pack648.enabled,true);assert.equal(state.realms.gaoyue.periods[n].sources.pack6.enabled,false);}
    assert.equal(state.realms.guigu.periods[6].sources.pack648.enabled,false);
    await page.locator('[data-realm-action=all]').click();state=await saved(page);assert.equal(state.realms.gaoyue.periods[2].sources.pack648.enabled,false);assert.equal(state.realms.gaoyue.periods[2].sources.pack6.enabled,true);
    await page.locator('[data-realm-period="3"]').click();assert.equal(await page.locator('[data-realm-enable=pack648]').isChecked(),true);assert.equal(await page.locator('[data-realm-source=first-gift]').count(),0);
  }finally{await context.close();}
});
test('custom platform discount is saved and reused in the other realm including fractional folds',async()=>{
  const {context,page}=await openRealm();try{
    await page.locator('[data-realm-mode=planner]').click();const form=page.locator('[data-realm-form=platform]');await form.locator('[name=platformName]').fill('自定义测试平台');await form.locator('[name=discount]').fill('4.333');await form.locator('[type=submit]').click();
    const state=await saved(page);assert.ok(state);assert.equal(state.settings.platforms.at(-1).discount,4.333);
    await page.locator('[data-realm-id=gaoyue]').click();assert.match(await page.locator('[name=platformId] option:checked').innerText(),/自定义测试平台.*4\.333/);
  }finally{await context.close();}
});
test('target draft survives source toggles before calculation',async()=>{
  const {context,page}=await openRealm();try{
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=target]').fill('3');await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack6]').check();
    assert.equal(await page.locator('[name=target]').inputValue(),'3');await runPlan(page);assert.match(await page.locator('.realm-plan').first().innerText(),/¥2\.40/);
  }finally{await context.close();}
});
test('saving fee fields preserves profiles added to the current fresh account snapshot',async()=>{
  const {context,page}=await openRealm();try{
    await page.locator('[data-realm-mode=planner]').click();const form=page.locator('[data-realm-form=settings]');await form.locator('[name=vouchers]').fill('15');
    await page.evaluate(()=>{let s=window.SECRET_REALM_CORE.createDefault(window.SECRET_REALM_DATA);s.settings.platforms.push({id:'new-profile',name:'新增加的平台',discount:5});window.QinshiAccounts.setItem('qinshi_secret_realms_v1',JSON.stringify(s));});
    await form.locator('[type=submit]').click();const state=await saved(page);assert.equal(state.settings.vouchers,15);assert.equal(state.settings.platforms.some(p=>p.id==='new-profile'),true);
  }finally{await context.close();}
});
test('switching real accounts isolates secret realm totals and fees',async()=>{
  const {context,page}=await openRealm();try{
    await saveTotals(page,510,12);const ids=await page.evaluate(()=>({first:window.QinshiAccounts.currentAccount().id,second:window.QinshiAccounts.createAccount({name:'第二账号',server:'测试服'}).id}));
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'secret-realm'}),ids.second)]);
    await page.locator('#secret-realm-content').waitFor();assert.equal(await page.locator('[name=cumulative]').inputValue(),'0');await saveTotals(page,100,4);
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'secret-realm'}),ids.first)]);
    await page.locator('#secret-realm-content').waitFor();assert.equal(await page.locator('[name=cumulative]').inputValue(),'510');assert.equal(await page.locator('[name=inventory]').inputValue(),'12');
  }finally{await context.close();}
});
test('ended sixth period deletion is confirmed and does not resurrect or remove shared settings',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    await saveTotals(page,4550,5);const date=page.locator('[data-realm-form=date]');await date.locator('[name=startDate]').fill('2026-10-10');await date.locator('[type=submit]').click();
    await page.evaluate(()=>{window.__realmNow=Date.parse('2026-10-23T16:00:00Z');window.QinshiAccounts.claimEditing(window.QinshiAccounts.currentAccount().id);document.dispatchEvent(new Event('visibilitychange'));});
    assert.match(await page.locator('[data-realm-status]').innerText(),/六期全部结束/);
    page.once('dialog',d=>d.dismiss());await page.locator('[data-realm-action=delete]').click();assert.ok((await saved(page)).realms.guigu);
    page.once('dialog',d=>d.accept());await page.locator('[data-realm-action=delete]').click();let state=await saved(page);assert.equal(state.realms.guigu,undefined);assert.ok(state.realms.gaoyue);assert.equal(state.settings.platformId,'x7');
    await page.reload({waitUntil:'networkidle'});state=await saved(page);assert.equal(state.realms.guigu,undefined);assert.equal(await page.locator('#secret-realm-select option[value=guigu]').count(),0);
  }finally{await context.close();}
});
test('real account snapshot export restore and clear include all secret realm data',async()=>{
  const {context,page}=await openRealm();try{
    await saveTotals(page,750,12);
    const result=await page.evaluate(()=>{
      const key='qinshi_secret_realms_v1',a=window.QinshiAccounts,id=a.currentAccount().id;
      const snapshot=a.listAccountData(id),payload=window.QinshiSettings.makePayload('test');window.QinshiSettings.validatePayload(payload);
      const physical=Object.keys(payload.data).find(k=>k.endsWith(encodeURIComponent(key)));if(!physical)throw Error('Secret realm omitted from full device snapshot');
      a.clearAccountData(id);const cleared=a.getItem(key);window.QinshiSettings.replaceManagedData(payload.data);return {cleared,original:snapshot[key],restored:a.getItem(key)};
    });
    assert.equal(result.cleared,null);assert.equal(result.restored,result.original);await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[name=cumulative]').inputValue(),'750');
  }finally{await context.close();}
});
test('corrupt data is never replaced by default values and reference remains accessible',async()=>{
  const {context,page}=await openRealm();try{
    await page.evaluate(()=>window.QinshiAccounts.setItem('qinshi_secret_realms_v1','{broken'));
    await page.locator('[data-realm-action=reload]').click();assert.match(await page.locator('[data-realm-error]').innerText(),/未被覆盖/);
    assert.equal(await page.locator('[name=cumulative]').isDisabled(),true);await page.locator('[data-realm-mode=reference]').click();assert.equal(await page.locator('.realm-rewards>div').count(),35);
    assert.equal(await page.evaluate(()=>window.QinshiAccounts.getItem('qinshi_secret_realms_v1')),'{broken');
  }finally{await context.close();}
});
for(const width of [320,390,768,1100,1440])test(width+' width realm planning and long results have no document overflow',async()=>{
  const {context,page}=await openRealm({width});try{
    await setupSixYuan(page);await runPlan(page);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false);
    await page.locator('[data-realm-mode=reference]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false);
  }finally{await context.close();}
});
test('installed PWA loads secret realm and calculates on a real worker fully offline',async()=>{
  const pageErrors=[];
  const {context,page}=await openRealm();try{
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.waitForFunction(async()=>{await navigator.serviceWorker.ready;return true;});
    await page.waitForFunction(async()=>{const registration=await navigator.serviceWorker.getRegistration();return registration?.active?.state==='activated';});
    const installedReload=await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    assert.equal(installedReload.fromServiceWorker(),true,'The installed PWA must serve the page before offline testing');
    await page.locator('#secret-realm-content').waitFor();
    await context.setOffline(true);await page.reload({waitUntil:'networkidle'});
    await setupSixYuan(page);await page.evaluate(()=>{window.SECRET_REALM_PLANNER={plan:()=>{throw Error('Main-thread fallback forbidden by offline-worker test');}};});
    await runPlan(page);assert.match(await page.locator('.realm-plan').first().innerText(),/¥2\.40/);
  }catch(error){
    try{if(!page.isClosed())console.error('Installed realm fixture failure diagnostics',{pageErrors,registration:await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r?.active?.state??null,installing:r?.installing?.state??null,waiting:r?.waiting?.state??null,controller:navigator.serviceWorker.controller?.state??null};})});}
    catch(diagnosticError){console.error('Fixture diagnostics unavailable',diagnosticError.message,pageErrors);}
    throw error;
  }finally{await context.close();}
});
test('edited inputs and leaving the partition cannot receive an older held worker result',async()=>{
  const {context,page}=await openRealm();try{
    await setupSixYuan(page);await page.evaluate(()=>{const NativeWorker=window.Worker;window.__heldRealmResults=[];window.Worker=class{constructor(url){this.worker=new NativeWorker(url);this.worker.onmessage=e=>window.__heldRealmResults.push(()=>{if(this.onmessage)this.onmessage(e);});this.worker.onerror=e=>{if(this.onerror)this.onerror(e);};}postMessage(v){this.worker.postMessage(v);}terminate(){this.worker.terminate();}};});
    await page.locator('[data-realm-calculate]').click();await page.waitForFunction(()=>window.__heldRealmResults.length>0);await page.locator('[name=target]').fill('6');await page.evaluate(()=>window.__heldRealmResults.splice(0).forEach(fn=>fn()));
    assert.equal(await page.locator('[data-realm-results] .realm-plan').count(),0);assert.equal(await page.locator('#secret-realm-content').getAttribute('aria-busy'),'false');
    await page.locator('[data-realm-calculate]').click();await page.waitForFunction(()=>window.__heldRealmResults.length>0);await page.evaluate(()=>document.querySelector('[data-partition=atlas]').click());await page.evaluate(()=>window.__heldRealmResults.splice(0).forEach(fn=>fn()));
    assert.equal(await page.locator('[data-realm-results] .realm-plan').count(),0);
  }finally{await context.close();}
});
test('a second real tab makes the old account read-only without allowing accidental writes',async()=>{
  const {context,page}=await openRealm();let other;try{
    await saveTotals(page,90,2);other=await context.newPage();await openApp(other,url+'/#secret-realm');await other.waitForFunction(()=>Boolean(window.QinshiAccounts));
    await other.evaluate(()=>window.QinshiAccounts.takeOverEditing(window.QinshiAccounts.currentAccount().id));await page.waitForFunction(()=>window.QinshiAccounts.isReadOnly());
    await page.locator('[data-realm-action=reload]').click();assert.equal(await page.locator('[name=cumulative]').isDisabled(),true);assert.equal((await saved(page)).realms.guigu.cumulative,90);
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=target]').fill('90');await runPlan(page);assert.match(await page.locator('.realm-plan').first().innerText(),/现有余额／库存可达标/);
    assert.equal((await saved(page)).realms.guigu.target,4550);
  }finally{await context.close();}
});
test('ordinary account lease renewal preserves unfinished fee input and its DOM node',async()=>{
  const {context,page}=await openRealm();try{
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=vouchers]').fill('123.45');
    const result=await page.evaluate(()=>{const before=document.querySelector('[name=vouchers]');window.QinshiAccountLease.renewAll();const after=document.querySelector('[name=vouchers]');return {same:before===after,value:after.value};});
    assert.deepEqual(result,{same:true,value:'123.45'});
  }finally{await context.close();}
});
test('a daily receipt form rendered yesterday cannot silently save yesterday flags as today',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    const date=page.locator('[data-realm-form=date]');await date.locator('[name=startDate]').fill('2026-10-20');await date.locator('[type=submit]').click();
    const source=page.locator('[data-realm-source=pack6]');await source.locator('[name=purchased]').fill('1');await source.locator('[name=todayPurchased]').check();
    await page.evaluate(()=>{window.__realmNow=Date.parse('2026-10-24T04:00:00Z');window.QinshiAccounts.claimEditing(window.QinshiAccounts.currentAccount().id);});
    await source.locator('[type=submit]').click();assert.equal((await saved(page)).realms.guigu.periods[6].sources.pack6.purchased,0);assert.match(await page.locator('[data-realm-error]').innerText(),/日期.*变化|跨日/);
  }finally{await context.close();}
});
test('old partial pack6 receipts migrate to fixed grants without changing real total inventory',async()=>{
  const {context,page}=await openRealm({now:'2026-10-23T04:00:00Z'});try{
    await page.evaluate(()=>{const d=window.SECRET_REALM_DATA,k=window.SECRET_REALM_CORE;let s=k.createDefault(d);s=k.setStartDate(s,'guigu',6,'2026-10-20',Date.now(),d);s.schemaVersion=1;Object.assign(s.realms.guigu.periods[6].sources.pack6,{purchased:1,obtained:1,todayDate:'2026-10-23',todayPurchased:1,todayObtained:1});window.QinshiAccounts.setItem('qinshi_secret_realms_v1',JSON.stringify(s));});
    await page.locator('[data-realm-action=reload]').click();const source=page.locator('[data-realm-source=pack6]');assert.equal(await source.locator('[name=todayObtained]').count(),0);await source.locator('[type=submit]').click();
    const state=await saved(page),row=state.realms.guigu.periods[6].sources.pack6;assert.equal(row.todayObtained,0);assert.equal(row.obtained,3);assert.equal(state.realms.guigu.inventory,0);assert.equal(await page.locator('[data-realm-error]').isVisible(),false);
  }finally{await context.close();}
});
test('direct local HTML secret realm retains calculation through the file-protocol fallback',async()=>{
  const path=require('node:path'),{pathToFileURL}=require('node:url');const context=await browser.newContext({viewport:{width:768,height:844}}),page=await context.newPage();
  try{
    await openApp(page,pathToFileURL(path.resolve(__dirname,'../index.html')).href+'#secret-realm');await page.locator('#secret-realm-content').waitFor();await setupSixYuan(page);await runPlan(page);
    assert.match(await page.locator('.realm-plan').first().innerText(),/¥2\.40/);assert.equal((await saved(page)).realms.guigu.periods[6].sources.pack6.purchased,0);
  }finally{await context.close();}
});
test('current navigation still works when an older page has no optional secret realm section',async()=>{
  const fs=require('node:fs'),path=require('node:path');const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}}),page=await context.newPage();
  try{
    const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8').replace('    <section id="partition-secret-realm" hidden></section>','');
    await page.route(url+'/',route=>route.fulfill({status:200,contentType:'text/html',body:html}));await openApp(page,url);
    await page.locator('.tab[data-partition=six-halls]').click();await page.locator('#partition-six-halls').waitFor({state:'visible',timeout:5000});assert.equal(await page.title(),'六堂');
  }finally{await context.close();}
});
