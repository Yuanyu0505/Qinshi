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
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);let dialogs=0;p.on('dialog',async d=>{dialogs++;await d.dismiss();});await reverse.locator('[data-craft-action="reverse-apply"]').first().click();
 assert.equal(dialogs,0,'choosing a locator combination must not ask to reset the scene');
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw,'choosing a combination only prepares a locator target');
 // One unified apply control commits either locator to the common scene.
 await reverse.locator('[data-craft-action="apply-simulation"]').click();
 assert.equal(dialogs,1,'only the explicit shared-scene apply asks for incompatible material reset');
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);assert.equal(await root.locator('[data-craft-simulator]').count(),1);
 await root.locator('[data-locator-tab="direct"]').click();assert.equal(await direct.locator('[data-craft-field="dun"]').inputValue(),'鬼遁');
 assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),raw);
 }finally{await p.close();}
});
test('returning to common reverse results refreshes personal classification without changing locator or scene',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-paths"]').click();const root=p.locator('#inscription-crafting-paths');await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-paths','reverse');
 await reverse.locator('[data-reverse-attr]').first().selectOption('速');await reverse.locator('[data-craft-action="reverse-search"]').click();
 await reverse.locator('[data-result-filter="group"]').selectOption('common');const before=await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_locator_paths_reverse_v1'));
 await p.locator('[data-mode="query"]').click();await p.evaluate(()=>QinshiAccounts.setItem('qinshi_inscription_common_v1',JSON.stringify({keys:[],defaultApplied:true})));await p.locator('[data-mode="crafting-paths"]').click();
 assert.equal(await reverse.locator('[data-reverse-result]').count(),0);assert.equal(await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_locator_paths_reverse_v1')),before);
 await p.locator('[data-mode="query"]').click();await p.evaluate(()=>{const item=INSCRIPTION_DATA.items.find(i=>i.quality==='红色神将'&&i.slots.some(s=>s.shield==='鬼遁'));QinshiAccounts.setItem('qinshi_inscription_common_v1',JSON.stringify({keys:[item.quality+'\0'+item.name],defaultApplied:true}));});
 await p.locator('[data-mode="crafting-paths"]').click();assert.ok(await reverse.locator('[data-reverse-result]').count()>0);
 }finally{await p.close();}
});
test('pending path generations render only into their own child and never cross an account switch',async()=>{
 const p=await setup();try{await p.locator('[data-mode="crafting-paths"]').click();const root=p.locator('#inscription-crafting-paths'),direct=panel(p,'crafting-paths','direct');
 await direct.locator('[data-craft-field="dun"]').selectOption('云遁');for(const [i,a] of ['护盾','护盾','技免'].entries())await direct.locator('[data-craft-field="attr"]').nth(i).selectOption(a);
 await p.evaluate(()=>{const original=window.setTimeout;window.__pendingPlans=[];window.setTimeout=function(fn,delay,...args){if(delay===0&&String(fn).includes('P.representative')){window.__pendingPlans.push(fn);return 987654;}return original(fn,delay,...args);};});
 await direct.locator('[data-craft-action="generate"]').click();await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-paths','reverse');
 for(const control of await reverse.locator('[data-reverse-attr]').all())await control.selectOption('速');await reverse.locator('[data-craft-action="reverse-search"]').click();await reverse.locator('[data-craft-action="reverse-apply"]').first().click();await reverse.locator('[data-craft-action="generate"]').click();
 assert.equal(await p.evaluate(()=>__pendingPlans.length),2);await p.evaluate(()=>__pendingPlans.pop()());assert.ok(await reverse.locator('.craft-strategy').count()>0);assert.equal(await direct.locator('.craft-strategy').count(),0);
 const reverseText=await reverse.locator('[data-craft-results]').innerText();await p.evaluate(()=>__pendingPlans.shift()());assert.ok(await direct.locator('.craft-strategy').count()>0);assert.equal(await reverse.locator('[data-craft-results]').innerText(),reverseText);
 await root.locator('[data-locator-tab="direct"]').click();await direct.locator('[data-craft-action="clear-options"]').click();await direct.locator('[data-craft-field="dun"]').selectOption('云遁');for(const [i,a] of ['护盾','护盾','技免'].entries())await direct.locator('[data-craft-field="attr"]').nth(i).selectOption(a);await direct.locator('[data-craft-action="generate"]').click();
 // Bind without the normal page reload so the old callback is deliberately
 // still alive, exercising the controller's account guard itself.
 await p.evaluate(()=>{const next=QinshiAccounts.createAccount({name:'Pending generation account',server:'Browser test'});QinshiAccounts.bindAccount(next.id);InscriptionCraftingUI.refresh();});
 const raw=await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_locator_paths_direct_v1'));await p.evaluate(()=>{while(__pendingPlans.length)__pendingPlans.shift()();});assert.equal(await direct.locator('.craft-strategy').count(),0);assert.equal(await p.evaluate(()=>QinshiAccounts.getItem('qinshi_inscription_locator_paths_direct_v1')),raw);
 }finally{await p.close();}
});

for(const width of [390,768,1440])test(width+' reverse results default to divine, filters and merged members stay locally readable',async()=>{
 const p=await setup(width);try{await p.locator('[data-mode="crafting-paths"]').click();const root=p.locator('#inscription-crafting-paths');await root.locator('[data-locator-tab="reverse"]').click();const reverse=panel(p,'crafting-paths','reverse');
 await reverse.locator('[data-reverse-attr]').first().selectOption('技能穿透');await reverse.locator('[data-craft-action="reverse-search"]').click();
 assert.equal(await reverse.locator('[data-result-filter="ordinary"]').isChecked(),false);
 const checkbox=await reverse.locator('[data-result-filter="ordinary"]').evaluate(n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return {width:b.width,height:b.height,minWidth:s.minWidth,minHeight:s.minHeight,padding:s.padding};});assert.ok(checkbox.width<=24&&checkbox.height<=24,'visibility checkbox must not stretch like a full-width text field: '+JSON.stringify(checkbox));
 assert.doesNotMatch(await reverse.locator('[data-reverse-result]').first().innerText(),/普通橙色|红色神将/);
 await reverse.locator('[data-result-filter="ordinary"]').check();await reverse.locator('[data-result-filter="search"]').fill('鬼谷盖聂');
 await reverse.locator('[data-result-filter="search"]').dispatchEvent('change');
 const card=reverse.locator('[data-reverse-result]').first();assert.match(await card.innerText(),/神鬼谷盖聂.*鬼谷盖聂/);
 assert.equal(await card.locator('[data-result-member] option').count(),2);await card.locator('[data-result-member]').selectOption({label:'鬼谷盖聂'});
 await card.locator('[data-craft-action="reverse-apply"]').click();assert.equal(await reverse.locator('[data-craft-field="search"]').inputValue(),'鬼谷盖聂');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await p.screenshot({path:'test-results/1081-workspace-'+width+'.png'});
 }finally{await p.close();}
});
