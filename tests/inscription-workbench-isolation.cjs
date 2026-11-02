const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function setup(width=1280){const p=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block'});await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await openApp(p,url,{waitUntil:'load'});await p.locator('.tab[data-partition="inscription"]').click();await p.locator('[data-mode="crafting-paths"]').click();return p;}
test('query and simulator filters persist independently through tab switches and query clear',async()=>{
 const p=await setup();try{const q=p.locator('#inscription-crafting-paths'),s=p.locator('#inscription-crafting-simulator');
 await q.locator('[data-craft-field="dun"]').selectOption('鬼遁');await q.locator('[data-craft-field="attr"]').nth(0).selectOption('速');
 await p.locator('[data-mode="crafting-simulator"]').click();assert.equal(await s.locator('[data-craft-field="dun"]').inputValue(),'');
 await s.locator('[data-craft-field="dun"]').selectOption('云遁');await s.locator('[data-craft-field="attr"]').nth(0).selectOption('护盾');
 await p.locator('[data-mode="crafting-paths"]').click();assert.equal(await q.locator('[data-craft-field="dun"]').inputValue(),'鬼遁');assert.equal(await q.locator('[data-craft-field="attr"]').nth(0).inputValue(),'速');
 await q.locator('[data-craft-action="clear-options"]').click();await p.locator('[data-mode="crafting-simulator"]').click();assert.equal(await s.locator('[data-craft-field="dun"]').inputValue(),'云遁');assert.equal(await s.locator('[data-craft-field="attr"]').nth(0).inputValue(),'护盾');
 await p.reload({waitUntil:'load'});await p.locator('.tab[data-partition="inscription"]').click();await p.locator('[data-mode="crafting-simulator"]').click();assert.equal(await s.locator('[data-craft-field="dun"]').inputValue(),'云遁');
 }finally{await p.close();}
});
test('invalid legacy simulation offers explicit recovery while query continues usable',async()=>{
 const p=await setup();try{await p.evaluate(()=>{QinshiAccounts.setItem(InscriptionCraftingState.KEY,'broken legacy');InscriptionCraftingUI.refresh();});
 const q=p.locator('#inscription-crafting-paths');await q.locator('[data-craft-field="dun"]').selectOption('地遁');assert.equal(await q.locator('[data-craft-field="dun"]').inputValue(),'地遁');
 await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');await s.locator('[data-craft-action="isolate-legacy"]').waitFor();
 p.once('dialog',d=>d.accept());await s.locator('[data-craft-action="isolate-legacy"]').click();assert.equal(await s.locator('[data-craft-action="isolate-legacy"]').count(),0);
 assert.equal(await p.evaluate(()=>InscriptionCraftingState.createWorkbench(QinshiAccounts).archives()[0].raw),'broken legacy');
 await s.locator('summary').filter({hasText:'已隔离的旧档'}).click();await s.locator('[data-craft-action="view-archive"]').click();assert.equal(await s.locator('.craft-archive-raw').textContent(),'broken legacy');
 }finally{await p.close();}
});
for(const width of [390,768])test(width+' merged backpack caps multi-selection and fills only empty material slots',async()=>{
 const p=await setup();try{await p.setViewportSize({width,height:950});await p.evaluate(()=>{
 const w=InscriptionSimulation.upgrade({version:1,target:{discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速'],xTerm:null},simulation:{stage:'b2',inputs:[[{attr:'防',tier:'H'}],[null]],pending:null}});
 const m={prefix:InscriptionRules.prefixes[0],dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]};
 w.lab.lots=[{id:'a',material:m,quantity:1,source:{type:'manual'}},{id:'b',material:m,quantity:1,source:{type:'manual'}}];
 QinshiAccounts.setItem(InscriptionCraftingState.KEY,JSON.stringify({schemaVersion:1,idSequence:0,actual:[],goals:[],workspaces:{},draft:{simpleWorkbench:w}}));InscriptionCraftingUI.refresh();
 });await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');await s.locator('[data-craft-action="open-bag"]').click();
 assert.equal(await s.locator('[data-bag-id]').count(),1);const row=s.locator('[data-bag-id]').first();assert.equal(await row.locator('[data-bag-total]').inputValue(),'2');assert.equal(await row.locator('[data-bag-count]').getAttribute('max'),'1');
 await row.locator('[data-bag-check]').check();await s.locator('[data-craft-action="use-selected"]').click();
 const inputs=await p.evaluate(()=>InscriptionCraftingState.createWorkbench(QinshiAccounts).inspect().state.simulation.inputs);assert.equal(inputs[0][0].attr,'防');assert.equal(inputs[1][0].attr,'速');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await p.close();}
});
test('manual material edit re-caps the aggregate backpack selection immediately',async()=>{
 const p=await setup();try{
 await p.evaluate(()=>{const target={discipleKey:'',slot:'',dun:'鬼遁',quality:'o2',attrs:['速','速','速'],xTerm:null},w=InscriptionSimulation.upgrade({version:1,target,simulation:{stage:'b2',inputs:[],pending:null}});
 w.lab.lots=['防','血'].map((a,i)=>({id:'stock'+i,material:{prefix:InscriptionRules.prefixes[0],dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:a,tier:i?'M':'H'}]},quantity:1,source:{type:'manual'}}));
 QinshiAccounts.setItem(InscriptionCraftingState.KEY,JSON.stringify({schemaVersion:1,idSequence:0,actual:[],goals:[],workspaces:{},draft:{simpleWorkbench:w}}));InscriptionCraftingUI.refresh();});
 await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');await s.locator('[data-craft-action="open-bag"]').click();for(const c of await s.locator('[data-bag-check]').all())await c.check();
 await s.locator('[data-sim-material="0"]').selectOption('速:?');assert.equal(await s.locator('[data-bag-check]:checked').count(),1);assert.match(await s.locator('[data-bag-summary]').textContent(),/已选 1枚.*1个/);
 }finally{await p.close();}
});
test('clear-old-data confirmation can cancel and never clears query favorites or real progress',async()=>{
 const p=await setup();try{await p.evaluate(()=>{
 QinshiAccounts.setItem(InscriptionCraftingState.KEY,'broken legacy');QinshiAccounts.setItem('qinshi_inscription_progress_v2','{"keepProgress":true}');QinshiAccounts.setItem('qinshi_inscription_route_favorites_v1','{"keepFavorites":true}');InscriptionCraftingUI.refresh();});
 const q=p.locator('#inscription-crafting-paths');await q.locator('[data-craft-field="dun"]').selectOption('地遁');await p.locator('[data-mode="crafting-simulator"]').click();const s=p.locator('#inscription-crafting-simulator');
 p.once('dialog',d=>d.dismiss());await s.locator('[data-craft-action="clear-legacy"]').click();assert.equal(await p.evaluate(()=>QinshiAccounts.getItem(InscriptionCraftingState.KEY)),'broken legacy');
 p.once('dialog',d=>d.accept());await s.locator('[data-craft-action="clear-legacy"]').click();assert.equal(await p.evaluate(()=>InscriptionCraftingState.createWorkbench(QinshiAccounts).inspect().valid),true);
 const saved=await p.evaluate(()=>({progress:QinshiAccounts.getItem('qinshi_inscription_progress_v2'),favorites:QinshiAccounts.getItem('qinshi_inscription_route_favorites_v1'),query:InscriptionCraftingState.createQueryStore(QinshiAccounts).inspect().target.dun}));assert.deepEqual(saved,{progress:'{"keepProgress":true}',favorites:'{"keepFavorites":true}',query:'地遁'});
 }finally{await p.close();}
});
