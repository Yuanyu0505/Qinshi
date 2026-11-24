'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
for(const width of [320,390,820,1440])test('real app new reference navigation, calculation and no account writes at '+width+'px',async()=>{
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
 try{
  await openApp(page,url+'/#other-reference');
  await page.locator('[data-ref-directory-search]').waitFor();
  assert.equal(await page.locator('[data-ref-section]').count(),23);
  const original=await page.evaluate(()=>JSON.stringify({...localStorage}));
  for(const id of ['first-releases','costumes','fishing','account-levels','disciple-awakening','jinchan','sage']){
   await page.locator('[data-ref-section="'+id+'"]').click();
   await page.locator('[data-exp-section="'+id+'"]').waitFor();
   await page.locator('[data-exp-query]').fill('不存在的查询');
   assert.match(await page.locator('[data-exp-results]').textContent(),/未找到/);
   await page.locator('[data-exp-clear]').click();
   if(id==='sage'){
    await page.locator('[data-exp-calculate]').click();
    assert.match(await page.locator('[data-exp-calculation]').textContent(),/336/);
    assert.ok(await page.locator('[data-exp-calculation] table').evaluate(table=>table.getBoundingClientRect().width<=table.parentElement.clientWidth+1));
    await page.locator('[data-exp-input="master"]').check();
    assert.equal(await page.locator('[data-exp-calculation]').textContent(),'');
    await page.locator('[data-exp-calculate]').click();
    assert.match(await page.locator('[data-exp-calculation]').textContent(),/1008/);
   }
   if(id==='account-levels'){
    await page.locator('[data-exp-input="from"]').fill('99');
    await page.locator('[data-exp-input="to"]').fill('100');
    await page.locator('[data-exp-calculate]').click();
    assert.match(await page.locator('[data-exp-calculation]').textContent(),/6301/);
   }
   const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(size.scroll<=size.width+1,id+': whole page overflow '+JSON.stringify(size));
   await page.locator('[data-ref-home]').click();
  }
  await page.locator('[data-ref-section="sage"]').click();
  assert.equal(await page.locator('[data-exp-input="master"]').isChecked(),false);
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),original);
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
