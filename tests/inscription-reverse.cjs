const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function openInscription(p){const tab=p.locator('.tab[data-partition="inscription"]');if(await tab.isVisible())await tab.click();else{await p.locator('#mobile-more-toggle').click();await p.locator('#mobile-more-layer [data-partition="inscription"]').click();}}
async function setup(width=1280){const p=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});await p.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());await openApp(p,url);await openInscription(p);await p.locator('[data-mode="crafting-paths"]').click();await p.locator('#inscription-crafting-paths [data-locator-tab="reverse"]').click();return p;}
test('reverse candidates and result application retain X as an empty target slot',async()=>{
 const p=await setup();try{const q=p.locator('#inscription-crafting-paths [data-locator-panel="reverse"]');
 await q.locator('[data-reverse-attr]').nth(0).selectOption('技能穿透');
 assert.equal(await q.locator('[data-reverse-field="dun"] option[value="鬼遁"]').count(),0);
 await q.locator('[data-reverse-field="dun"]').selectOption('人遁');
 await q.locator('[data-craft-action="reverse-search"]').click();
 assert.ok(await q.locator('[data-reverse-result]').count()>0);
 assert.match(await q.locator('[data-reverse-result]').first().textContent(),/非查询词条X/);
 await q.locator('[data-craft-action="reverse-apply"]').first().click();
 const attrs=await q.locator('[data-craft-field="attr"]').evaluateAll(s=>s.map(x=>x.value));
 assert.deepEqual(attrs,['技能穿透','技能穿透','']);
 assert.ok((await q.locator('[data-craft-field="search"]').inputValue()).length>0);
 }finally{await p.close();}
});
test('reverse draft changes and cancelled apply leave a pending simulation byte-identical',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');
 await s.locator('[data-craft-field="dun"]').selectOption('鬼遁');await s.locator('[data-craft-action="apply-simulation"]').click();for(const c of await s.locator('[data-sim-term]').all())await c.selectOption('速:?');await s.locator('[data-craft-action="roll"]').click();
 const raw=await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY));
 await s.locator('[data-locator-tab="reverse"]').click();await s.locator('[data-reverse-attr]').nth(0).selectOption('技能穿透');await s.locator('[data-reverse-field="quality"]').selectOption('p1');
 assert.equal(await s.locator('[data-reverse-attr]').count(),2);
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 await s.locator('[data-craft-action="reverse-search"]').click();await s.locator('[data-craft-action="reverse-apply"]').first().click();p.once('dialog',d=>d.dismiss());await s.locator('[data-locator-panel="reverse"] [data-craft-action="apply-simulation"]').click();
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 }finally{await p.close();}
});
for(const width of [390,768])test(width+' reverse filters persist by page and have no document overflow',async()=>{
 const p=await setup(width);try{const q=p.locator('#inscription-crafting-paths [data-locator-panel="reverse"]');await q.locator('[data-reverse-attr]').nth(0).selectOption('速');
 assert.equal(await q.locator('[data-reverse-attr]').nth(1).locator('option[value="技能穿透"]').count(),0);
 await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');await s.locator('[data-locator-tab="reverse"]').click();assert.equal(await s.locator('[data-reverse-attr]').nth(0).inputValue(),'');await s.locator('[data-reverse-attr]').nth(0).selectOption('护盾');
 await p.reload();await openInscription(p);await p.locator('[data-mode="crafting-paths"]').click();await p.locator('#inscription-crafting-paths [data-locator-tab="reverse"]').click();assert.equal(await q.locator('[data-reverse-attr]').nth(0).inputValue(),'速');
 await q.locator('[data-craft-action="reverse-search"]').click();assert.ok(await q.locator('[data-reverse-result]').count()>0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:'test-results/1080-reverse-'+width+'.png'});
 await q.locator('[data-craft-action="clear-options"]').click();assert.equal(await q.locator('[data-reverse-attr]').nth(0).inputValue(),'');
 await p.locator('[data-mode="crafting-simulator"]').click();await s.locator('[data-locator-tab="reverse"]').click();assert.equal(await s.locator('[data-reverse-attr]').nth(0).inputValue(),'护盾');
 }finally{await p.close();}
});
test('bag additions preserve the selected recipe source through the browser controller',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');await s.locator('[data-craft-field="dun"]').selectOption('鬼遁');await s.locator('[data-craft-action="apply-simulation"]').click();
 for(const c of await s.locator('[data-sim-term]').all())await c.selectOption('速:?');await s.locator('[data-craft-action="roll"]').click();await s.locator('[data-craft-action="open-bag"]').click();
 const before=await p.evaluate(()=>InscriptionCraftingState.createWorkbench(QinshiAccounts).inspect().state.lab.records.length);
 await s.locator('[data-bag-total]').first().fill('5');await s.locator('[data-bag-total]').first().dispatchEvent('change');
 const lab=await p.evaluate(()=>InscriptionCraftingState.createWorkbench(QinshiAccounts).inspect().state.lab);
 assert.equal(lab.records.length,before);assert.equal(lab.lots.reduce((n,l)=>n+l.quantity,0),5);assert.ok(lab.lots.every(l=>l.source.type==='simulation'));
 }finally{await p.close();}
});

test('first reverse draft follows an existing blue target and never mutates it',async()=>{
 const p=await setup();try{const q=p.locator('#inscription-crafting-paths [data-locator-panel="reverse"]');
 await p.evaluate(()=>QinshiAccounts.setItem('qinshi_inscription_path_query_v1',JSON.stringify({discipleKey:'',slot:'',dun:'',quality:'b2',attrs:[''],xTerm:null})));
 await p.evaluate(()=>{QinshiAccounts.removeItem('qinshi_inscription_reverse_paths_v1');QinshiAccounts.removeItem('qinshi_inscription_locator_paths_reverse_v1');});
 await p.reload();await openInscription(p);await p.locator('[data-mode="crafting-paths"]').click();await p.locator('#inscription-crafting-paths [data-locator-tab="reverse"]').click();
 assert.equal(await q.locator('[data-reverse-attr]').count(),1);
 await q.locator('[data-reverse-attr]').first().selectOption('速');
 assert.equal(await q.locator('[data-reverse-field="quality"]').inputValue(),'b2');
 assert.equal(await p.evaluate(()=>JSON.parse(QinshiAccounts.getItem(InscriptionCraftingState.QUERY_KEY)).quality),'b2');
 }finally{await p.close();}
});

test('a stale or damaged reverse draft rejects apply and clear before touching simulation',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');
 await s.locator('[data-craft-field="dun"]').selectOption('鬼遁');await s.locator('[data-craft-action="apply-simulation"]').click();for(const c of await s.locator('[data-sim-term]').all())await c.selectOption('速:?');await s.locator('[data-craft-action="roll"]').click();
 const raw=await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY));
 await s.locator('[data-locator-tab="reverse"]').click();await s.locator('[data-reverse-attr]').first().selectOption('技能穿透');await s.locator('[data-craft-action="reverse-search"]').click();
 await p.evaluate(()=>{const k='qinshi_inscription_locator_simulator_reverse_v1',v=JSON.parse(QinshiAccounts.getItem(k));v.reverse.dun='地遁';QinshiAccounts.setItem(k,JSON.stringify(v));});
 await s.locator('[data-craft-action="reverse-apply"]').first().click();assert.match(await s.locator('[data-craft-status]:visible').textContent(),/其他页面更新/);
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 await p.evaluate(()=>QinshiAccounts.setItem('qinshi_inscription_locator_simulator_reverse_v1','broken'));
 await s.locator('[data-locator-panel="reverse"] [data-craft-action="clear-options"]').click();assert.match(await s.locator('[data-craft-status]:visible').textContent(),/工作区异常/);
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 }finally{await p.close();}
});
