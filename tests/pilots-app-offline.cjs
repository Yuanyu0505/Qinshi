const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const {createServer}=require('../serve.js'),{openApp,currentAppVersion}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync(path.join(__dirname,'../test-results/pilots-workbench'),{recursive:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function navigate(p,id){const tab=p.locator('.tab[data-partition="'+id+'"]');if(await tab.isVisible())await tab.click();else{await p.locator('#mobile-more-toggle').click();await p.locator('#mobile-more-layer [data-partition="'+id+'"]').click();}}
for(const width of [390,768,1440])test(width+' real navigation lazily opens pilot search and beast reference offline',async()=>{
 const context=await browser.newContext({viewport:{width,height:950}}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await openApp(p,url);
 // Creating the isolated account reloads the initial document and can race
 // clients.claim() on first install. Wait for installation, then prove that
 // a controlled navigation really comes from the worker before going offline.
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(async()=> (await navigator.serviceWorker.getRegistration())?.active?.state==='activated');
 const controlled=await p.reload({waitUntil:'networkidle'});assert.equal(controlled.fromServiceWorker(),true);await p.waitForFunction(()=>navigator.serviceWorker.controller);
 const version=currentAppVersion();await p.waitForFunction(async v=>{const cache=await caches.open('qinshi-site-'+v);return Boolean(await cache.match('./js/pilots-ui.js'));},version);
 await context.setOffline(true);await navigate(p,'pilots');const s=p.locator('#partition-pilots');await s.locator('.pilots-workbench').waitFor();assert.equal(await s.locator('.pilots-card').count(),0);assert.equal(await s.locator('.pilots-result-count').isVisible(),false);assert.equal(await s.locator('.pilots-grid').isVisible(),false);
 await s.locator('[data-pilots-type="pilot"]').click();
 const layout=await s.evaluate(root=>{const rect=selector=>root.querySelector(selector).getBoundingClientRect().toJSON();return{type:rect('[aria-label="弟子分类"]'),categories:rect('[data-pilots-categories]'),search:rect('#pilots-search'),notes:rect('[data-pilots-category-notes]')};});
 assert.ok(layout.categories.y>=layout.type.bottom&&layout.categories.y-layout.type.bottom<=14);assert.ok(layout.categories.bottom<layout.search.y);assert.ok(layout.notes.y>=layout.search.bottom);assert.equal(await s.locator('[data-pilots-category-notes] > p').count(),3);
 await s.locator('[data-pilots-category="traditional"]').click();await s.locator('#pilots-search').fill('神英布');assert.equal(await s.locator('.pilots-card').count(),1);assert.match(await s.locator('.pilots-card').textContent(),/狼王/);assert.equal(await s.locator('.pilots-effect-title:not(h4)').count(),0);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(__dirname,'../test-results/pilots-workbench/pilots-'+width+'.png')});
 await navigate(p,'machine-beasts');await p.locator('[data-machine-beast-mode="reference"]').click();await p.locator('[data-machine-breakthrough-guide]').waitFor();assert.match(await p.locator('[data-machine-breakthrough-guide]').innerText(),/3,856|3856/);
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
