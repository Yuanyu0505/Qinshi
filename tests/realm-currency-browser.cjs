const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width=390){const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();await openApp(page,url+'/#secret-realm');await page.locator('#secret-realm-content').waitFor();return {context,page};}
async function result(page){await page.locator('[data-realm-calculate]').click();await page.waitForFunction(()=>document.querySelector('[data-realm-results] .realm-plan')&&document.querySelector('#secret-realm-content').getAttribute('aria-busy')==='false');}
test('budget label and amount stay together without redundant rounding totals',async()=>{
 const {context,page}=await open(1280);try{
 await page.locator('[data-realm-mode=planner]').click();await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack98]').check();
 await page.locator('[name=targetEnabled]').uncheck();await page.locator('[name=currencyTargetEnabled]').check();await page.locator('[name=currencyTarget]').fill('40');await result(page);
 const plan=page.locator('.realm-plan').first();assert.doesNotMatch(await plan.innerText(),/（向上取整）|折后金额合计|预算取整差额/);
 assert.ok(await plan.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=-2&&r.top<innerHeight/2;}),'calculation should locate its result automatically');
 assert.equal(await plan.locator('.realm-budget').count(),1);assert.equal(await plan.locator('.realm-budget').evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
 }finally{await context.close();}
});

test('active realm is a prominent pressed button with Gaoyue period two and no retired entry',async()=>{
  const {context,page}=await open();try{const buttons=page.locator('[data-realm-id]');assert.equal(await buttons.count(),1);assert.equal(await page.locator('[data-realm-id=guigu]').count(),0);assert.equal(await page.locator('#secret-realm-select').count(),0);
    await page.locator('[data-realm-id=gaoyue]').click();assert.equal(await page.locator('[data-realm-id=gaoyue]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('[data-realm-status]').innerText(),/第2期/);
    const box=await page.locator('[data-realm-id=gaoyue]').boundingBox();assert.ok(box.height>=48);
  }finally{await context.close();}
});

test('currency-only goal and overflow mode calculate on worker and merge identical plans',async()=>{
  const {context,page}=await open();try{
    // Restrict this merge regression to the last active Gaoyue period. With
    // periods 2..6 available, fastest and cheapest can legitimately differ.
    await page.evaluate(()=>{
      const state=window.SECRET_REALM_CORE.createDefault(window.SECRET_REALM_DATA);
      state.realms.gaoyue.currentPeriod=6;
      for(let n=1;n<6;n++)state.realms.gaoyue.periods[n]={startDate:null,locked:true,ended:true,sources:{}};
      window.QinshiAccounts.setItem('qinshi_secret_realms_v1',JSON.stringify(state));
    });
    await page.locator('[data-realm-action=reload]').click();
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack98]').check();
    await page.locator('[name=targetEnabled]').uncheck();await page.locator('[name=currencyTargetEnabled]').check();await page.locator('[name=currencyTarget]').fill('40');await result(page);
    assert.equal(await page.locator('.realm-plan').count(),1);assert.match(await page.locator('.realm-plan').innerText(),/最快.*最省钱/);
    const first=await page.locator('.realm-plan').innerText();assert.match(first,/实际计划抽取\s*25/);assert.match(first,/剩余.*5/);assert.match(first,/预计.*月石.*40/);
    await page.locator('[name=drawMode]').selectOption('all');await result(page);assert.equal(await page.locator('.realm-plan').count(),1);assert.match(await page.locator('.realm-plan').innerText(),/实际计划抽取\s*30/);assert.match(await page.locator('.realm-plan').innerText(),/预计.*月石.*45/);
    const state=await page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')));assert.equal(state.realms.gaoyue.currency,0);assert.equal(state.realms.gaoyue.periods[6].sources.pack98.purchased,0);assert.equal(state.realms.guigu.currency,0);
  }finally{await context.close();}
});

test('custom platform deletion confirms, falls back to direct and leaves vouchers intact',async()=>{
  const {context,page}=await open();try{
    await page.locator('[data-realm-mode=planner]').click();const f=page.locator('[data-realm-form=platform]');await f.locator('[name=platformName]').fill('测试平台');await f.locator('[name=discount]').fill('3.7');await f.locator('[type=submit]').click();
    assert.equal(await page.locator('[data-realm-delete-platform]').count(),1);page.once('dialog',d=>d.dismiss());await page.locator('[data-realm-delete-platform]').click();assert.equal(await page.locator('[data-realm-delete-platform]').count(),1);
    page.once('dialog',d=>d.accept());await page.locator('[data-realm-delete-platform]').click();assert.equal(await page.locator('[data-realm-delete-platform]').count(),0);assert.equal(await page.locator('[name=platformId]').inputValue(),'direct');
  }finally{await context.close();}
});

test('six yuan fixed purchase UI has no independent claim inputs and stores three tickets',async()=>{
  const {context,page}=await open();try{
    const today=await page.evaluate(()=>new Date(Date.now()+28800000).toISOString().slice(0,10));await page.locator('[name=startDate]').fill(today);await page.locator('[data-realm-form=date] [type=submit]').click();
    const s=page.locator('[data-realm-source=pack6]');assert.equal(await s.locator('[name=obtained]').count(),0);assert.equal(await s.locator('[name=todayObtained]').count(),0);
    await s.locator('[name=purchased]').fill('1');assert.equal(await s.locator('[name=todayPurchased]').count(),0);
    const state=await page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_secret_realms_v1')));
    assert.equal(state.realms.gaoyue.periods[2].sources.pack6.obtained,3);
    assert.equal(state.realms.gaoyue.periods[2].sources.pack6.purchased,1);
    assert.equal(state.realms.guigu.periods[6].sources.pack6.obtained,0);
  }finally{await context.close();}
});

test('divine Gaoyue has five correct inscription slots and one-time common default respects cancellation',async()=>{
  const {context,page}=await open(1440);try{
    await page.locator('.tab[data-partition=inscription]').click();await page.locator('#inscription-modes [data-mode=query]').click();await page.locator('#ins-search').fill('千泷高月');
    const card=page.locator('#ins-results .ins-query-card').filter({hasText:'神千泷高月'});await card.waitFor({timeout:5000});await page.waitForFunction(()=>document.querySelectorAll('#ins-results .ins-query-card').length===1);await card.scrollIntoViewIfNeeded();const text=await card.innerText();assert.match(text,/天府.*人遁/s);assert.match(text,/天机.*鬼遁/s);assert.match(text,/天相.*地遁/s);assert.match(text,/天梁.*虎遁/s);assert.match(text,/天同.*天遁/s);
    const b=card.locator('[data-ins-common-key]');assert.equal(await b.getAttribute('aria-pressed'),'true');await b.click();await page.reload();await page.locator('#inscription-modes [data-mode=query]').click();await page.locator('#ins-search').fill('千泷高月');await page.waitForTimeout(160);assert.equal(await page.locator('#ins-results [data-ins-common-key]').getAttribute('aria-pressed'),'false');
  }finally{await context.close();}
});

for(const width of [320,390,768,1100,1440])test(width+' dual goal results stay within the document',async()=>{
  const {context,page}=await open(width);try{
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[data-realm-action=none]').click();await page.locator('[data-realm-enable=pack98]').check();await page.locator('[name=currencyTargetEnabled]').check();await page.locator('[name=currencyTarget]').fill('40');await page.locator('[name=target]').fill('20');await result(page);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  }finally{await context.close();}
});

test('wooden reference includes added milestones and distinguishes guide estimate from probability model',async()=>{
  const {context,page}=await open(1440);try{
    await page.locator('.tab[data-partition=wooden-man-alley]').click();await page.locator('[data-wooden-mode=reference]').click();
    const reference=page.locator('#partition-wooden-man-alley');const text=await reference.innerText();
    for(const floor of [10,25,50,130,280,380,430])assert.match(text,new RegExp(floor+'层'));
    assert.match(text,/不超过.*最坏需求/);assert.match(text,/0\.7依据未说明/);assert.match(text,/2,262,400/);
  }finally{await context.close();}
});

test('inscription default migration preserves malformed and unknown common keys without an automatic write',async()=>{
  const {context,page}=await open(1440);try{
    for(const bad of [{version:1,keys:[null]},{version:1,keys:['红色神将\u0000未知弟子']},{version:1,keys:[],gaoyueDefaultApplied:'yes'}]){
      const raw=JSON.stringify(bad);await page.evaluate(raw=>window.QinshiAccounts.setItem('qinshi_inscription_common_v1',raw),raw);await page.reload();
      assert.equal(await page.evaluate(()=>window.QinshiAccounts.getItem('qinshi_inscription_common_v1')),raw);
      await page.locator('.tab[data-partition=inscription]').click();assert.match(await page.locator('#ins-common-status').innerText(),/读取失败.*保留原始记录/);
    }
  }finally{await context.close();}
});

test('existing and future account common defaults are isolated and preserve other common disciples',async()=>{
  const {context,page}=await open(1440);try{
    await page.evaluate(()=>window.QinshiAccounts.setItem('qinshi_inscription_common_v1',JSON.stringify({version:1,keys:['红色神将\u0000神东皇太一']})));await page.reload();
    const first=await page.evaluate(()=>({id:window.QinshiAccounts.currentAccount().id,list:JSON.parse(window.QinshiAccounts.getItem('qinshi_inscription_common_v1'))}));assert.deepEqual(first.list,{version:1,keys:['红色神将\u0000神东皇太一','红色神将\u0000神千泷高月','普通橙色\u0000雷豹英布'],gaoyueDefaultApplied:true,leibaoDefaultApplied:true});
    const second=await page.evaluate(()=>window.QinshiAccounts.createAccount({name:'新铭文账号',server:'测试服'}).id);await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'inscription'}),second)]);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_inscription_common_v1'))),{version:1,keys:['红色神将\u0000神千泷高月','普通橙色\u0000雷豹英布'],gaoyueDefaultApplied:true,leibaoDefaultApplied:true});
    await Promise.all([page.waitForNavigation({waitUntil:'networkidle'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'inscription'}),first.id)]);assert.deepEqual(await page.evaluate(()=>JSON.parse(window.QinshiAccounts.getItem('qinshi_inscription_common_v1'))),first.list);
  }finally{await context.close();}
});

test('Gaoyue currency and independent period receipts survive navigation reload and backup without crediting predictions or changing retired data',async()=>{
  const {context,page}=await open();try{
    const retired=await page.evaluate(()=>{
      const state=window.SECRET_REALM_CORE.createDefault(window.SECRET_REALM_DATA);
      Object.assign(state.realms.guigu,{currency:123,cumulative:777,inventory:9});
      window.QinshiAccounts.setItem('qinshi_secret_realms_v1',JSON.stringify(state));return state.realms.guigu;
    });
    await page.locator('[data-realm-action=reload]').click();
    await page.locator('[name=currency]').fill('80');
    const today=await page.evaluate(()=>new Date(Date.now()+28800000).toISOString().slice(0,10));await page.locator('[name=startDate]').fill(today);await page.locator('[data-realm-form=date] [type=submit]').click();
    const source=page.locator('[data-realm-source=panda]');await source.locator('[name=currencyObtained]').fill('20');
    await page.locator('[data-realm-mode=planner]').click();await page.locator('[name=targetEnabled]').uncheck();await page.locator('[name=currencyTargetEnabled]').check();await page.locator('[name=currencyTarget]').fill('100');await result(page);
    await page.locator('[data-realm-mode=progress]').click();assert.equal(await page.locator('[name=currency]').inputValue(),'80');assert.equal(await page.locator('[data-realm-source=panda] [name=currencyObtained]').inputValue(),'20');
    await page.locator('[data-realm-period="3"]').click();assert.equal(await page.locator('[name=currency]').inputValue(),'80');assert.equal(await page.locator('[data-realm-source=panda] [name=currencyObtained]').inputValue(),'0');
    await page.locator('[data-realm-period="2"]').click();assert.equal(await page.locator('[data-realm-source=panda] [name=currencyObtained]').inputValue(),'20');
    await page.reload();await page.locator('#secret-realm-content').waitFor();
    assert.equal(await page.locator('[name=currency]').inputValue(),'80');assert.equal(await page.locator('[data-realm-source=panda] [name=currencyObtained]').inputValue(),'20');
    const backup=await page.evaluate(()=>{
      const logical='qinshi_secret_realms_v1',payload=window.QinshiSettings.makePayload('test');window.QinshiSettings.validatePayload(payload);
      const physical=Object.keys(payload.data).find(k=>k.endsWith(encodeURIComponent(logical)));
      if(!physical)throw Error('Secret realm omitted from full device snapshot');
      return {stored:JSON.parse(window.QinshiAccounts.getItem(logical)),exported:JSON.parse(payload.data[physical])};
    });
    assert.deepEqual(backup.exported,backup.stored);assert.deepEqual(backup.stored.realms.guigu,retired);
    assert.equal(backup.stored.realms.gaoyue.currency,80);assert.equal(backup.stored.realms.gaoyue.periods[2].sources.panda.currencyObtained,20);assert.equal(backup.stored.realms.gaoyue.periods[3].sources.panda.currencyObtained,0);
    assert.equal(await page.locator('[data-realm-id=guigu]').count(),0);
  }finally{await context.close();}
});
