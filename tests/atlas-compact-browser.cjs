const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
test('favorite and pin preserve every unrelated card and its live level input in 177 results',async()=>{
 const context=await browser.newContext({serviceWorkers:'block'}),p=await context.newPage();
 await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
 try{await openApp(p,url);await p.locator('#atlas-tabs [data-atlas="全部"]').click();
 await p.evaluate(()=>{window.untouchedAtlas=[...document.querySelectorAll('[data-atlas-item]')].slice(1).map(card=>[card,card.querySelector('.atlas-level')]);});
 await p.locator('[data-atlas-favorite]').first().click();await p.locator('[data-atlas-pin]').first().click();
 assert.equal(await p.evaluate(()=>window.untouchedAtlas.every(([c,n])=>c.isConnected&&n===c.querySelector('.atlas-level'))),true);
 }finally{await context.close();}
});
for(const width of [320,390,820,1280,1440])test(`${width}: 1.0.95 layout returns while current interaction guards remain`,async()=>{
 async function capture(legacy){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),p=await context.newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==url)return r.abort();const f=u.pathname==='/'?'index.html':u.pathname.slice(1);if(legacy&&['index.html','js/app.js','css/style.css'].includes(f))return r.fulfill({body:cp.execFileSync('git',['-c','safe.directory='+path.resolve('.').replaceAll('\\','/'),'show','ebb11643:'+f],{encoding:'utf8',maxBuffer:4e6}),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});return r.continue();});
  try{
   await openApp(p,url);await p.locator('#atlas-tabs [data-atlas="攻"]').click();
   const card=p.locator('[data-atlas-item]').first(),out={};
   const measure=async state=>{await card.scrollIntoViewIfNeeded();out[state]=await card.evaluate(n=>({height:n.getBoundingClientRect().height,equipment:n.querySelectorAll('.atlas-equipment-stage').length}));fs.mkdirSync('test-results/atlas-compact',{recursive:true});await card.screenshot({path:`test-results/atlas-compact/${width}-${legacy?'before':'after'}-${state}.png`});};
   out.summary=await p.locator('.atlas-upgrade-summary').evaluate(n=>n.getBoundingClientRect().height);
   await measure('ordinary');await card.locator('[data-atlas-favorite]').click();await measure('favorite');
   await card.locator('[data-atlas-inventory-edit]').click();await measure('editing');
   if(!legacy){assert.equal(await card.locator('.atlas-meta').isVisible(),true);assert.ok(await card.locator('.atlas-equipment-stage-list').count()>0);assert.ok(await card.locator('[data-atlas-inventory-owned]').count()>0);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
   assert.deepEqual(errors,[]);return out;
  }finally{await context.close();}
 }
 const before=await capture(true),after=await capture(false);
 fs.writeFileSync(`test-results/atlas-compact/${width}-measurements.json`,JSON.stringify({before,after},null,2));
 assert.ok(Math.abs(after.summary-before.summary)<20,JSON.stringify({before,after}));
 assert.equal(after.ordinary.equipment,before.ordinary.equipment);
 assert.equal(after.editing.equipment,before.editing.equipment);
});
