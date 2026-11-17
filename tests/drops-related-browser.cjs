'use strict';
// Optional isolated acceptance, not run automatically by the implementation agent.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
for(const width of[390,1366])test(`${width}: merged drops retain forms and only actual sources`,async()=>{
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'}),page=await context.newPage();
 try{
  await openApp(page,url+'/#drops');
  await page.locator('#drop-search').fill('八爪铁蜈蚣碎片');
  await page.waitForFunction(()=>document.querySelectorAll('#drop-results .drop-item').length===1&&document.querySelector('#drop-results .drop-item-title').textContent.trim()==='八爪铁蜈蚣');
  const result=page.locator('#drop-results');
  assert.match(await result.innerText(),/41-10/);assert.match(await result.innerText(),/34-5/);
  assert.deepEqual(await result.locator('.drop-source-name').allTextContents(),['碎片','本体']);
  assert.equal(await result.locator('.drop-block').count(),2);
  await page.locator('#drop-search').fill('醉梦罗裳');
  await page.waitForFunction(()=>document.querySelector('#drop-results .drop-item-title')?.textContent.trim()==='醉梦罗裳');
  assert.equal(await result.locator('.drop-item').count(),1);
  assert.match(await result.innerText(),/55-7/);assert.match(await result.innerText(),/第53章/);
  await page.locator('#drop-search').fill('白羽绸衣');
  await page.waitForFunction(()=>document.querySelector('#drop-results .drop-item-title')?.textContent.trim()==='白羽绸衣');
  assert.equal(await result.locator('.drop-block').count(),2);
  assert.doesNotMatch(await result.innerText(),/英雄关卡|未找到|0 处/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }finally{await context.close();}
});
