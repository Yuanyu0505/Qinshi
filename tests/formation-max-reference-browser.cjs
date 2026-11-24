const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
for(const width of [390,1280])test(width+'px max reference remains separate from account data and filters all source rows',async()=>{
 const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
 try{
  await openApp(page,url);
  const tab=page.locator('.tab[data-partition="formations"]');
  if(await tab.isVisible())await tab.click();else{await page.locator('#mobile-more-toggle').click();await page.locator('#mobile-more-layer [data-partition="formations"]').click();}
  const ref=page.locator('#formation-max-reference');await ref.waitFor({state:'visible'});
  const saved=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  assert.equal(await ref.getAttribute('open'),null);
  await ref.locator(':scope > summary').click();
  const results=width<760?ref.locator('.formation-max-cards article'):ref.locator('.formation-max-table tbody tr');
  assert.equal(await results.count(),144);
  await ref.locator('[data-max-formation]').click();
  await page.getByRole('listbox',{name:'极限属性合阵',exact:true}).getByRole('option',{name:'妙法阴阳',exact:true}).click();
  assert.equal(await results.count(),7);
  await ref.locator('[data-max-sort]').selectOption('attack');
  assert.match(await results.first().innerText(),/焱妃/);
  await ref.locator('[data-max-query]').fill('月神');
  assert.equal(await results.count(),1);assert.match(await results.first().innerText(),/月神/);
  await ref.locator('[data-max-query]').fill('不存在');assert.equal(await results.count(),0);
  await ref.locator('[data-max-query]').fill('');assert.equal(await results.count(),7);
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage)))),saved);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
  await ref.locator(':scope > summary').click();await ref.locator(':scope > summary').click();
  assert.equal(await results.count(),7);
 }finally{await page.close();}
});
