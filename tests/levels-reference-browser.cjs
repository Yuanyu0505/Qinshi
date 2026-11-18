'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
const phase=process.env.LEVELS_UI_PHASE||'after';
const evidence=path.resolve(__dirname,'../outputs/levels-reference-1.1.32',phase);
let server,browser,url;
before(async()=>{fs.mkdirSync(evidence,{recursive:true});server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(width=1366,height=900){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
  await openApp(p,url+'/#other-reference');
  await p.locator('[data-ref-section="levels"]').click();
  return {context,p,errors};
}
async function selectTable(p,id){await p.locator('.ref-column-menu > summary').click();await p.locator('[data-ref-table-option="'+id+'"]').click();}
for(const width of [320,390,820,1366,1920])test('levels responsive layout '+width,async()=>{
  const {context,p,errors}=await open(width);
  try{
    const storage=await p.evaluate(()=>JSON.stringify({...localStorage}));
    assert.equal(await p.locator('[data-ref-table-option="levels-positions"]').count(),0);
    assert.equal(await p.locator('[data-ref-band] option').count(),11);
    assert.equal(await p.locator('[data-ref-band] option[value="90"]').innerText(),'90–100级');
    assert.equal(await p.locator('[data-ref-band] option[value="100"]').count(),0);
    for(const id of ['levels-features','levels-leagues']){
      await selectTable(p,id);
      await p.screenshot({path:path.join(evidence,width+'-'+id+'.png'),fullPage:true});
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' page overflow');
      if(phase==='before')continue;
      if(id==='levels-leagues'){
        assert.equal(await p.locator('.ref-table tbody tr').count(),14);
        assert.equal(await p.locator('[data-ref-view]').inputValue(),'table');
        assert.equal(await p.locator('[data-ref-view] option[value="auto"]').count(),0);
        assert.ok((await p.locator('.ref-table tbody tr').first().innerText()).includes('青铜联赛（初级青龙/白虎护符）'));
        assert.equal(await p.locator('.ref-timeline').count(),0);
      }
      await p.locator('[data-ref-view]').selectOption('table');
      assert.ok(await p.locator('.ref-table th,.ref-table td').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).verticalAlign==='middle')));
      assert.ok(await p.locator('.ref-table th,.ref-table td').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).textAlign==='left')));
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    assert.equal(await p.evaluate(()=>JSON.stringify({...localStorage})),storage);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('levels search, overlapping ranges, drafts, card switching and source viewer',async()=>{
  if(phase==='before')return;
  const {context,p,errors}=await open();
  try{
    const search=p.locator('[data-ref-search]');
    await search.focus();
    await search.fill('星宿');assert.equal(await p.locator('.ref-table tbody tr').count(),1);
    assert.ok(await search.evaluate(n=>document.activeElement===n));
    assert.equal(await p.locator('[data-ref-results]').innerText().then(t=>/外圈|内圈/.test(t)),false);
    await search.fill('兵法');assert.equal(await p.locator('.ref-table tbody tr').count(),1);
    await p.locator('[data-ref-clear]').click();
    await selectTable(p,'levels-leagues');
    assert.equal(await p.locator('.ref-league-notes').count(),0);
    for(const [query,count] of [['混服',3],['折扣专服',2],['83',4],['87',2],['59',1],['69',1]]){
      await search.fill(query);assert.equal(await p.locator('.ref-table tbody tr').count(),count,query);
    }
    await p.locator('[data-ref-clear]').click();
    for(const [band,count] of [['50',3],['60',3],['70',3],['80',5],['90',2]]){
      await p.locator('[data-ref-band]').selectOption(band);assert.equal(await p.locator('.ref-table tbody tr').count(),count,band);
    }
    await p.locator('[data-ref-clear]').click();await search.fill('折扣专服');
    await p.locator('[data-ref-view]').selectOption('cards');assert.equal(await p.locator('.ref-row-card').count(),2);
    await selectTable(p,'levels-features');await selectTable(p,'levels-leagues');
    assert.equal(await search.inputValue(),'折扣专服');assert.equal(await p.locator('[data-ref-view]').inputValue(),'cards');
    await p.locator('[data-ref-clear]').click();await p.locator('[data-ref-view]').selectOption('table');
    const trigger=p.locator('[data-ref-image]').first();await trigger.click();
    await p.waitForFunction(()=>{const i=document.querySelector('.ref-viewer img');return i.complete&&i.naturalWidth>0;});
    await p.locator('[data-ref-zoom="in"]').click();assert.equal(await p.locator('.ref-viewer output').innerText(),'125%');
    await p.locator('[data-ref-zoom="reset"]').click();assert.equal(await p.locator('.ref-viewer output').innerText(),'100%');
    await p.locator('[data-ref-close]').click();assert.ok(await trigger.evaluate(n=>document.activeElement===n));
    await p.locator('[data-ref-home]').click();assert.equal(await p.locator('[data-ref-section]').count(),9);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
