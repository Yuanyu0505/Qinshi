'use strict';
// Prepared for manual execution: node --test tests/six-halls-embedding-browser.cjs
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});

for(const fail of [false,true])test('embedded six halls resumes background '+(fail?'failed':'successful')+' first load',async()=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  let release,seen;
  const gate=new Promise(r=>release=r),requested=new Promise(r=>seen=r);
  let first=true;
  try{
    await openApp(page,url);
    await page.route('**/data/six-halls-reference.js*',async route=>{
      if(first){first=false;seen();await gate;if(fail)return route.abort();}
      return route.continue();
    });
    await page.locator('.tab[data-partition="other-reference"]').click();
    await page.locator('[data-ref-section="six-halls"]').click();
    await requested;
    await page.locator('.tab[data-partition="forging"]').click();
    release();
    await page.waitForFunction(failed=>{
      const status=document.querySelector('[data-ref-six-halls-status]');
      return status&&(failed?status.textContent.includes('加载失败'):status.hidden);
    },fail);
    await page.locator('.tab[data-partition="other-reference"]').click();
    await page.locator('#six-halls-hall-details .six-halls-bonuses').waitFor();
    await page.locator('[data-ref-six-halls-status]').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-six-halls-hall]').count(),6);
    await page.locator('[data-six-halls-mode="progress"]').click();
    const input=page.locator('[data-six-halls-progress="herbs"]');
    await input.fill('321');
    await input.evaluate(node=>{window.sixHallsOriginalInput=node;});
    await page.locator('[data-ref-home]').click();
    await page.locator('[data-ref-section="six-halls"]').click();
    await input.waitFor();
    assert.equal(await input.inputValue(),'321');
    assert.equal(await input.evaluate(node=>node===window.sixHallsOriginalInput),true);
  }finally{release();await page.close();}
});
