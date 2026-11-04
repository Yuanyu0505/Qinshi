const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function openInscription(p){await p.evaluate(()=>document.querySelector('.tab[data-partition="inscription"]').click());}
async function setup(width=1280){const p=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'});p.setDefaultTimeout(5000);await p.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());await openApp(p,url);await openInscription(p);return p;}
const panel=(p,mode,child)=>p.locator('#inscription-'+mode+' [data-locator-panel="'+child+'"]');
test('path children retain independent targets and generated routes on switching and reload',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-paths"]').click();const root=p.locator('#inscription-crafting-paths'),direct=panel(p,'crafting-paths','direct');
 await direct.locator('[data-craft-field="dun"]').selectOption('人遁');
 for(const [i,a] of ['技能穿透','技能穿透','PVP伤害'].entries())await direct.locator('[data-craft-field="attr"]').nth(i).selectOption(a);
 await direct.locator('[data-craft-action="generate"]').click();await direct.locator('.craft-strategy').first().waitFor();
 const before=await direct.locator('[data-craft-results]').innerText();
 await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-paths','reverse');
 await reverse.locator('[data-reverse-attr]').first().selectOption('速');await reverse.locator('[data-craft-action="reverse-search"]').click();
 assert.ok(await reverse.locator('[data-reverse-result]').count()>0);await reverse.locator('[data-craft-action="reverse-apply"]').first().click();
 await root.locator('[data-locator-tab="direct"]').click();assert.equal(await direct.locator('[data-craft-results]').innerText(),before);
 await p.reload();await openInscription(p);await p.locator('[data-mode="crafting-paths"]').click();assert.equal(await direct.locator('[data-craft-field="dun"]').inputValue(),'人遁');
 await root.locator('[data-locator-tab="reverse"]').click();assert.equal(await reverse.locator('[data-reverse-attr]').first().inputValue(),'速');assert.ok(await reverse.locator('[data-reverse-result]').count()>0);
 }finally{await p.close();}
});
test('simulator locators never mutate shared scene until explicit apply, cancelled apply is byte-identical',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-simulator"]').click();const root=p.locator('#inscription-crafting-simulator'),direct=panel(p,'crafting-simulator','direct');
 await direct.locator('[data-craft-field="dun"]').selectOption('鬼遁');assert.equal(await root.locator('[data-sim-term]').count(),0);
 await direct.locator('[data-craft-action="apply-simulation"]').click();
 for(const c of await root.locator('[data-sim-term]').all())await c.selectOption('速:?');await root.locator('[data-craft-action="roll"]').click();
 const raw=await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY));
 await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-simulator','reverse');await reverse.locator('[data-reverse-attr]').first().selectOption('技能穿透');await reverse.locator('[data-craft-action="reverse-search"]').click();
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);p.once('dialog',d=>d.dismiss());await reverse.locator('[data-craft-action="reverse-apply"]').first().click();
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);assert.equal(await root.locator('[data-craft-simulator]').count(),1);
 await root.locator('[data-locator-tab="direct"]').click();assert.equal(await direct.locator('[data-craft-field="dun"]').inputValue(),'鬼遁');
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 }finally{await p.close();}
});
for(const width of [390,768,1440])test(width+' reverse results default to divine, filters and merged members stay locally readable',async()=>{
 const p=await setup(width);try{await p.locator('[data-mode="crafting-paths"]').click();const root=p.locator('#inscription-crafting-paths');await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-paths','reverse');
 await reverse.locator('[data-reverse-attr]').first().selectOption('技能穿透');await reverse.locator('[data-craft-action="reverse-search"]').click();
 assert.equal(await reverse.locator('[data-result-filter="ordinary"]').isChecked(),false);
 assert.doesNotMatch(await reverse.locator('[data-reverse-result]').first().innerText(),/普通橙色|红色神将/);
 await reverse.locator('[data-result-filter="ordinary"]').check();await reverse.locator('[data-result-filter="search"]').fill('鬼谷盖聂');
 await reverse.locator('[data-result-filter="search"]').dispatchEvent('change');
 const card=reverse.locator('[data-reverse-result]').first();assert.match(await card.innerText(),/神鬼谷盖聂.*鬼谷盖聂/);
 assert.equal(await card.locator('[data-result-member] option').count(),2);await card.locator('[data-result-member]').selectOption({label:'鬼谷盖聂'});
 await card.locator('[data-craft-action="reverse-apply"]').click();assert.equal(await reverse.locator('[data-craft-field="search"]').inputValue(),'鬼谷盖聂');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:'test-results/1081-workspace-'+width+'.png'});
 }finally{await p.close();}
});
