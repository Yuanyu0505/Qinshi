'use strict';
// User-run only; not executed by the implementation task.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
test('name filtering keeps focus; ordering survives reload and reset',async()=>{
  const page=await browser.newPage({viewport:{width:390,height:900},serviceWorkers:'block'});
  try{
    await openApp(page,url+'/#other-reference');
    const search=page.locator('[data-ref-directory-search]');await search.waitFor();
    await search.fill('战匣');
    assert.equal(await page.locator('[data-ref-section]').count(),1);
    assert.equal(await search.evaluate(n=>n===document.activeElement),true);
    await search.fill('没有这个分区');await page.locator('[data-ref-directory-empty]').waitFor();
    await page.locator('[data-ref-sort-toggle]').click();
    assert.equal(await search.isDisabled(),true);
    await page.locator('[data-ref-section="elements"]').click();
    assert.equal(await page.locator('[data-ref-section="elements"]').getAttribute('aria-pressed'),'true');
    assert.equal(new URL(page.url()).hash,'#other-reference');
    await page.locator('[data-ref-section="elements"]').click();
    assert.equal(await page.locator('[data-ref-section="elements"]').getAttribute('aria-pressed'),'false');
    await page.locator('[data-ref-section="elements"]').click();
    await page.locator('[data-ref-section="cards"]').click();
    assert.equal(await page.locator('[data-ref-section]').first().getAttribute('data-ref-section'),'elements');
    await page.reload();await page.locator('[data-ref-section]').first().waitFor();
    assert.equal(await page.locator('[data-ref-section]').first().getAttribute('data-ref-section'),'elements');
    await page.locator('[data-ref-sort-toggle]').click();await page.locator('[data-ref-order-reset]').click();
    assert.equal(await page.locator('[data-ref-section]').first().getAttribute('data-ref-section'),'cards');
    const dimensions=await page.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert.ok(dimensions[0]<=dimensions[1]);
  }finally{await page.close();}
});
test('all migrated modules use original routes, stay under reference navigation and return to directory',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await openApp(page,url+'/#other-reference');
    for(const id of ['pilots','battle-box-pill-pouch','quiz','zhulu','settings']){
      await page.locator('[data-ref-section="'+id+'"]').click();
      await page.locator('#partition-'+id).waitFor();
      await page.waitForFunction(name=>document.activeElement===document.querySelector('#partition-'+name+' [data-reference-return]'),id);
      assert.equal(new URL(page.url()).hash,'#'+id);
      assert.equal(await page.locator('.tab.active[data-partition]').getAttribute('data-partition'),'other-reference');
      await page.locator('#partition-'+id+' [data-reference-return]').click();
      await page.locator('[data-ref-directory-search]').waitFor();
      await page.waitForFunction(()=>document.activeElement===document.querySelector('#partition-other-reference h2'));
    }
    await page.locator('[data-ref-section="pilots"]').click();
    await page.locator('#pilots-search').fill('端木蓉');
    await page.locator('#pilots-search').evaluate(n=>{window.directoryOriginalPilotInput=n;});
    await page.locator('#partition-pilots [data-reference-return]').click();
    await page.locator('[data-ref-section="pilots"]').click();
    assert.equal(await page.locator('#pilots-search').inputValue(),'端木蓉');
    assert.equal(await page.locator('#pilots-search').evaluate(n=>n===window.directoryOriginalPilotInput),true);
    await page.goto(url+'/#settings');await page.locator('#partition-settings [data-reference-return]').waitFor();
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
test('damaged or unwritable ordering preference never hides module access',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});
  try{
    await page.addInitScript(()=>{
      localStorage.setItem('qinshi_reference_section_order_v1','{"broken":true}');
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key==='qinshi_reference_section_order_v1')throw new Error('test storage unavailable');return original.call(this,key,value);};
    });
    await openApp(page,url+'/#other-reference');
    assert.equal(await page.locator('[data-ref-section]').count(),23);
    await page.locator('[data-ref-sort-toggle]').click();
    await page.locator('[data-ref-section="settings"]').click();
    await page.locator('[data-ref-section="cards"]').click();
    await page.locator('[data-ref-order-status]').waitFor();
    await page.locator('[data-ref-sort-toggle]').click();
    await page.locator('[data-ref-section="settings"]').click();
    await page.locator('#partition-settings').waitFor();
  }finally{await page.close();}
});

for(const width of [390,1440])test('loulan and formations use independent navigation at '+width,async()=>{
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  try{
    await openApp(page,url+'/#other-reference');
    for(const id of ['loulan','formations']){
      assert.equal(await page.locator('[data-ref-section="'+id+'"]').count(),0);
      if(width<760){await page.locator('#mobile-more-toggle').click();await page.locator('#mobile-more-layer [data-partition="'+id+'"]').click();}
      else await page.locator('.tabs [data-partition="'+id+'"]').click();
      await page.locator('#partition-'+id).waitFor();
      assert.equal(new URL(page.url()).hash,'#'+id);
      assert.equal(await page.locator('.tab.active[data-partition]').getAttribute('data-partition'),id);
      assert.equal(await page.locator('#partition-'+id+' [data-reference-return]').count(),0);
    }
  }finally{await page.close();}
});

test('leaving a selected directory card through six-halls hash clears pending sorting',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await openApp(page,url+'/#other-reference');
    await page.locator('[data-ref-sort-toggle]').click();
    await page.locator('[data-ref-section="cards"]').click();
    await page.evaluate(()=>location.hash='six-halls');
    await page.locator('#partition-six-halls').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-ref-home]').click();
    assert.equal(await page.locator('[data-ref-sort-toggle]').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('[data-ref-section][aria-pressed="true"]').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
