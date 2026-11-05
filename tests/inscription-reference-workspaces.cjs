const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function setup(width){const p=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});p.setDefaultTimeout(5000);await p.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());await openApp(p,url);await p.evaluate(()=>document.querySelector('.tab[data-partition="inscription"]').click());await p.locator('[data-mode="reference"]').click();return p;}
for(const width of [390,768,1440])test(width+' reference tabs show local matrix and mutually exclusive comparisons without writing progress',async()=>{
 const p=await setup(width);try{const host=p.locator('#inscription-reference');const before=await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_progress_v2'));
 assert.equal(await host.locator('[data-ref-tab]').count(),4);assert.equal(await host.locator('[data-ref-quality]').inputValue(),'o2');
 assert.equal(await host.locator('.ins-ref-section:visible').count(),1);await host.locator('[data-ref-dun]').selectOption('地遁');
 assert.equal(await host.locator('.ins-ref-matrix thead th').count(),5);assert.match(await host.locator('[data-ref-attr-row="技能穿透"]').innerText(),/6%.*5%.*4%/s);
 await host.locator('[data-ref-mode]').selectOption('quality');await host.locator('[data-ref-quality2]').selectOption('p2');
 assert.equal(await host.locator('[data-ref-compare-panel]').count(),2);assert.equal(await host.locator('[data-ref-diff],[data-ref-comparison]').count(),0);
 if(width>=768){const panels=await host.locator('[data-ref-compare-panel]').all();const a=await panels[0].boundingBox(),b=await panels[1].boundingBox();assert.ok(Math.abs(a.y-b.y)<2&&b.x>a.x,'tablet and desktop comparisons are side by side');}
 await host.locator('[data-ref-mode]').selectOption('dun');assert.equal(await host.locator('[data-ref-quality2]').count(),0);assert.equal(await host.locator('[data-ref-dun2]').count(),1);assert.equal(await host.locator('[data-ref-compare-panel]').count(),2);
 await host.locator('[data-ref-mode]').selectOption('single');await host.locator('[data-ref-source]').selectOption('crafted');await host.locator('[data-ref-quality]').selectOption('p2');
 const row=host.locator('[data-ref-attr-row="技能穿透"]');assert.doesNotMatch(await row.innerText(),/2%/);
 await host.locator('[data-ref-tab="wash"]').click();assert.equal(await host.locator('[data-ref-wash-dun]').count(),9);assert.match(await host.innerText(),/紫二/);
 await host.locator('[data-ref-tab="upgrade"]').click();await host.locator('[data-ref-upgrade-dun]').selectOption('鬼遁');await host.locator('[data-ref-upgrade-from]').selectOption('b2');
 assert.match(await host.locator('[data-ref-upgrade-row="速:?"]').innerText(),/2.*高档.*1.*中档/s);assert.doesNotMatch(await host.locator('[data-ref-upgrade-row="速:?"]').innerText(),/概率/);
 await host.locator('[data-ref-tab="foundation"]').click();assert.match(await host.locator('[data-ref-foundation]').innerText(),/绿一.*无法置换/s);
 assert.equal(await host.locator('.ins-ref-main-table tbody tr').count(),5);await host.locator('[data-ref-main-quality]').selectOption('g1');assert.match(await host.locator('.ins-ref-main-table').innerText(),/25600护盾/);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:'test-results/1081-reference-'+width+'.png'});
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_progress_v2')),before);
 }finally{await p.close();}
});
test('reference comparison source filters retain unavailable cells without adding a difference table',async()=>{
 const p=await setup(1440);try{const host=p.locator('#inscription-reference');await host.locator('[data-ref-dun]').selectOption('地遁');await host.locator('[data-ref-mode]').selectOption('quality');await host.locator('[data-ref-quality]').selectOption('p2');await host.locator('[data-ref-quality2]').selectOption('o2');await host.locator('[data-ref-source]').selectOption('crafted');
 const panels=host.locator('[data-ref-compare-panel]');assert.equal(await panels.count(),2);assert.doesNotMatch(await panels.first().locator('[data-ref-attr-row="技能穿透"]').innerText(),/2%/);assert.equal(await host.locator('[data-ref-comparison]').count(),0);
 }finally{await p.close();}
});
