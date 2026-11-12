'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width=1440,height=900,extra={}){
 const context=await browser.newContext(Object.assign({viewport:{width,height},serviceWorkers:'block'},extra)),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{if(new URL(r.request().url()).origin!==url)return r.abort();if(process.env.REFERENCE_TEST_NATIVE_TOUCH&&r.request().url().includes('other-reference.css')){const response=await r.fetch();return r.fulfill({response,body:(await response.text()).replace('touch-action:none','touch-action:pan-x pan-y pinch-zoom')});}return r.continue();});
 await openApp(p,url+'/#other-reference');
 await p.locator('#partition-other-reference [data-ref-section]').first().waitFor();
 return {context,p,errors};
}
test('nine sections, Chinese filter focus, independent state and source viewer are read-only',async()=>{
 const {context,p,errors}=await open();
 try{
 const before=await p.evaluate(()=>JSON.stringify({...localStorage}));
 assert.equal(await p.locator('.ref-index [data-ref-section]').count(),9);
 for(const id of ['cards','elements','origins','treasure','speed','guardians','levels','spirits','disciples']){
  await p.locator('.ref-index [data-ref-section="'+id+'"]').click();
  assert.ok(await p.locator('#partition-other-reference h2').innerText());
  await p.locator('[data-ref-home]').click();
 }
 await p.locator('.ref-index [data-ref-section="elements"]').click();
 await p.locator('[data-ref-search]').fill('无双鬼');
 assert.equal(await p.locator('[data-ref-search]').evaluate(n=>n===document.activeElement),true);
 assert.equal(await p.locator('.ref-table tbody tr').count(),1);
 assert.match(await p.locator('.ref-table').innerText(),/300/);
 await p.locator('[data-ref-home]').click();await p.locator('.ref-index [data-ref-section="cards"]').click();
 assert.equal(await p.locator('[data-ref-search]').inputValue(),'');
 await p.locator('[data-ref-image]').first().click();
 const viewer=p.locator('.ref-viewer');assert.equal(await viewer.isVisible(),true);
 await p.locator('[data-ref-zoom="in"]').click();
 await p.keyboard.press('Escape');assert.equal(await viewer.isVisible(),false);
 assert.equal(await p.evaluate(()=>document.activeElement.hasAttribute('data-ref-image')),true);
 await p.locator('[data-ref-home]').click();await p.locator('.ref-index [data-ref-section="elements"]').click();
 assert.equal(await p.locator('[data-ref-search]').inputValue(),'无双鬼');
 assert.equal(await p.evaluate(()=>JSON.stringify({...localStorage})),before);
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('levels have ten-level filters, origins search all source lists and speed schemes keep independent drafts',async()=>{
 const {context,p}=await open();
 try{
 await p.locator('.ref-index [data-ref-section="levels"]').click();
 await p.locator('[data-ref-band]').selectOption('0');
 assert.equal(await p.locator('.ref-table tbody tr').count(),4);
 await p.locator('[data-ref-home]').click();await p.locator('.ref-index [data-ref-section="origins"]').click();
 await p.locator('[data-ref-search]').fill('东皇太一');assert.ok(await p.locator('.ref-table tbody tr').count()>1);
 await p.locator('[data-ref-home]').click();await p.locator('.ref-index [data-ref-section="speed"]').click();
 await p.locator('[data-ref-search]').fill('黑龙');
 await p.locator('[data-ref-table]').selectOption('speed-free-ranking');assert.equal(await p.locator('[data-ref-search]').inputValue(),'');
 await p.locator('[data-ref-table]').selectOption('speed-paid-ranking');assert.equal(await p.locator('[data-ref-search]').inputValue(),'黑龙');
 }finally{await context.close();}
});
test('touch viewer pinches the image itself and pans long content without zooming the page',async()=>{
 const {context,p}=await open(390,844,{hasTouch:true,isMobile:true});
 try{
 await p.locator('.ref-index [data-ref-section="cards"]').click();await p.locator('[data-ref-image]').first().click();
 await p.locator('.ref-viewer img').evaluate(n=>n.complete&&n.naturalWidth?true:new Promise(r=>n.onload=r));
 const box=await p.locator('.ref-image-stage').boundingBox(),client=await context.newCDPSession(p),x=box.x+box.width/2,y=box.y+Math.min(box.height/2,130);
 const points=d=>[{x:x-d,y,id:1},{x:x+d,y,id:2}];
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});
 for(const d of [40,50,60,70,80])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(d)});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(parseInt(await p.locator('.ref-viewer output').innerText(),10)>150);
 assert.equal(await p.evaluate(()=>Math.round(visualViewport.scale*100)),100);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y+50,id:3}]});
 for(const dy of [0,-30,-60,-90])await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy,id:3}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(await p.locator('.ref-image-stage').evaluate(n=>n.scrollTop>0));
 }finally{await context.close();}
});
test('PWA core cache opens reference scripts offline without precaching the whole image archive',async()=>{
 const context=await browser.newContext({serviceWorkers:'allow'}),p=await context.newPage();
 try{
 await openApp(p,url);await p.evaluate(()=>navigator.serviceWorker.ready);
 if(!await p.evaluate(()=>!!navigator.serviceWorker.controller))await p.reload({waitUntil:'networkidle'});
 const before=await p.evaluate(async()=>{const keys=await caches.keys(),core=await caches.open(keys.find(k=>k.startsWith('qinshi-site-')));return (await core.keys()).map(r=>new URL(r.url).pathname);});
 assert.ok(before.some(p=>p.endsWith('/data/other-reference-tables-c.js')));
 assert.equal(before.some(p=>p.includes('/assets/other-reference/sources/01_')),false);
 await context.setOffline(true);await p.goto(url+'/#other-reference',{waitUntil:'domcontentloaded'});
 await p.locator('.ref-index [data-ref-section="elements"]').click();
 assert.equal(await p.locator('.ref-table tbody tr').count(),25);
 await context.setOffline(false);await p.locator('[data-ref-image]').first().click();
 await p.waitForFunction(()=>{const img=document.querySelector('.ref-viewer img');return img&&img.complete&&img.naturalWidth>0;});
 await p.locator('[data-ref-close]').click();await context.setOffline(true);await p.locator('[data-ref-image]').first().click();
 await p.waitForFunction(()=>{const img=document.querySelector('.ref-viewer img');return img&&img.complete&&img.naturalWidth>0;});
 }finally{await context.close();}
});
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[768,1024],[820,1180],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]])test(`reference layout ${width}x${height}: all sections and local tables fit`,async()=>{
 const {context,p,errors}=await open(width,height);
 try{
 if([390,820,1440].includes(width)){fs.mkdirSync('test-results/other-reference',{recursive:true});await p.screenshot({path:`test-results/other-reference/${width}-index.png`,fullPage:true});}
 for(const id of ['elements','levels','origins','speed','guardians','spirits','cards','treasure','disciples']){
  await p.locator('.ref-index [data-ref-section="'+id+'"]').click();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,id);
  if(id==='elements'&&[390,820,1440].includes(width)){fs.mkdirSync('test-results/other-reference',{recursive:true});await p.screenshot({path:`test-results/other-reference/${width}-elements.png`,fullPage:true});}
  if(id==='speed'&&width===390)await p.screenshot({path:'test-results/other-reference/390-speed.png',fullPage:true});
  await p.locator('[data-ref-home]').click();
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const zoom of [1.25,1.5,2])test(`2000px desktop at ${zoom*100}% equivalent zoom`,async()=>{
 const {context,p}=await open(Math.floor(2000/zoom),Math.floor(1100/zoom));
 try{await p.locator('.ref-index [data-ref-section="elements"]').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}finally{await context.close();}
});
