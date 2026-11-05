const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function page(){const p=await browser.newPage({viewport:{width:1200,height:1000},serviceWorkers:'block'});await p.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());await openApp(p,url);return p;}

test('reverse Chinese composition keeps its input node and applied results can be reopened in both locators',async()=>{
 const p=await page();try{await p.evaluate(()=>document.querySelector('.tab[data-partition="inscription"]').click());
 for(const mode of ['crafting-paths','crafting-simulator']){await p.locator('[data-mode="'+mode+'"]').click();const root=p.locator('#inscription-'+mode);await root.locator('[data-locator-tab="reverse"]').click();const q=root.locator('[data-locator-panel="reverse"]');await q.locator('[data-reverse-attr]').first().selectOption('技能穿透');await q.locator('[data-craft-action="reverse-search"]').click();
 const search=q.locator('[data-result-filter="search"]');await search.evaluate(n=>{window.__searchNode=n;n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='gai';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
 assert.equal(await search.evaluate(n=>n===window.__searchNode),true);await search.evaluate(n=>{n.value='盖聂';n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'盖聂'}));n.dispatchEvent(new InputEvent('input',{bubbles:true}));});assert.equal(await search.evaluate(n=>n===window.__searchNode),true);assert.match(await q.locator('[data-reverse-result]').first().innerText(),/盖聂/);
 const raw=await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY));await q.locator('[data-craft-action="reverse-apply"]').first().click();assert.equal(await q.locator('[data-reverse-result]:visible').count(),0);await q.locator('[data-craft-action="reverse-reselect"]').click();assert.equal(await search.inputValue(),'盖聂');assert.ok(await q.locator('[data-reverse-result]:visible').count()>0);assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 }}finally{await p.close();}
});

test('reference keyword finds other duns and arbitrary higher-quality growth is centered with percent deltas',async()=>{
 const p=await page();try{await p.evaluate(()=>document.querySelector('.tab[data-partition="inscription"]').click());await p.locator('[data-mode="reference"]').click();const h=p.locator('#inscription-reference');await h.locator('[data-ref-keyword]').fill('技能穿透');await h.locator('[data-ref-other-toggle]').click();assert.match(await h.locator('[data-ref-other-results]').innerText(),/地遁.*人遁/s);
 await h.locator('[data-ref-mode]').selectOption('quality');assert.equal(await h.locator('[data-ref-diff]').count(),0);await h.locator('[data-ref-tab="upgrade"]').click();await h.locator('[data-ref-upgrade-dun]').selectOption('鬼遁');await h.locator('[data-ref-upgrade-from]').selectOption('b2');await h.locator('[data-ref-upgrade-to]').selectOption('o2');await h.locator('[data-ref-upgrade-diff]').check();const row=h.locator('[data-ref-upgrade-row="速:?"]');assert.match(await row.innerText(),/5.*4/s);assert.doesNotMatch(await h.innerText(),/百分点/);const style=await row.locator('th').evaluate(n=>({text:getComputedStyle(n).textAlign,vertical:getComputedStyle(n).verticalAlign}));assert.deepEqual(style,{text:'center',vertical:'middle'});
 }finally{await p.close();}
});

test('tactics maximum affects only the plan and default pack prices require explicit edit/save',async()=>{
 const p=await page();try{await p.evaluate(()=>document.querySelector('.tab[data-partition="tactics"]').click());await p.locator('[data-tactic-id="wind"]').click();const raw=await p.evaluate(()=>QinshiAccounts.getItem('qinshi_tactics_progress_v1'));await p.locator('[data-action="maximize-target"]').click();assert.equal(await p.locator('[data-calc-field="target-rank"]').inputValue(),'15');assert.equal(await p.evaluate(()=>QinshiAccounts.getItem('qinshi_tactics_progress_v1')),raw);
 await p.locator('[data-tactics-mode="cost"]').click();const row=p.locator('[data-cost-material-row="shared:merit"]');assert.equal(await row.locator('[data-cost-material-field="packPrice"]').count(),0);assert.match(await row.innerText(),/280/);await row.locator('[data-cost-price-action="edit"]').click();await row.locator('[data-cost-price-field="packPrice"]').fill('300');await row.locator('[data-cost-price-action="save"]').click();assert.match(await row.innerText(),/300/);assert.equal(await p.evaluate(()=>JSON.parse(QinshiAccounts.getItem('qinshi_tactics_cost_calculator_v1')).materials['shared:merit'].packPrice),300);
 }finally{await p.close();}
});
