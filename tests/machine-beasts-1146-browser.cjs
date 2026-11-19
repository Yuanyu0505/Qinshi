'use strict';
// User-run presentation regression; never opens a real account or external service.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
for(const width of [360,1280])test('bounded target picker and reference alignment at '+width,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();view.calcBeastId='red-serpent';view.calcDraft={research:0,fragments:0,showHighRanks:false,showMods:false,inventory:{none:{7:1,6:1,5:1}}};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:{none:{7:1,6:1,5:1}}};view.calcTargetLevel=25;view.calcResult=null;window.MACHINE_BEAST_UI.restoreView(view);
    });
    const picker=page.locator('[data-calc-target-picker]'),select=page.locator('[data-calc-target]');
    await picker.locator('summary').click();
    assert.equal(await select.evaluate(node=>node.size),10);
    assert.equal(await select.locator('option').count(),25);
    assert.ok(await select.evaluate(node=>node.scrollHeight>node.clientHeight));
    await select.selectOption('12');await select.press('Enter');
    assert.equal(await picker.evaluate(node=>node.open),false);
    assert.equal(await picker.locator('summary').innerText(),'12级');
    assert.equal(await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcTargetLevel),12);
    await picker.locator('summary').click();await select.press('Escape');
    assert.equal(await picker.evaluate(node=>node.open),false);
    await picker.locator('summary').click();await page.locator('.machine-calculator-panel h2').first().click();
    assert.equal(await picker.evaluate(node=>node.open),false);
    const rows=await page.locator('.machine-owned-inventory-row').evaluateAll(nodes=>nodes.map(row=>{
      const rect=row.getBoundingClientRect();return {y:rect.y,overflow:row.scrollWidth>row.clientWidth,inputWidth:row.querySelector('input[type="number"]').getBoundingClientRect().width};
    }));
    assert.equal(rows.length,3);
    for(const row of rows){assert.equal(row.overflow,false);assert.ok(row.inputWidth<=56);}
    assert.ok(rows[2].y>rows[0].y,'a row must never contain three inventory cards');
    await page.locator('[data-machine-beast-mode="reference"]').click();
    assert.deepEqual(await page.locator('#machine-beast-reference-content > section.panel').evaluateAll(nodes=>nodes.map(node=>node.id)),[
      'machine-reference-effects','machine-reference-schools','machine-reference-materials','machine-reference-blueprints','machine-reference-breakthrough','machine-reference-thresholds','machine-reference-values'
    ]);
    assert.deepEqual(await page.locator('.machine-modification-core-reference tbody tr').evaluateAll(nodes=>nodes.map(node=>Array.from(node.children,cell=>cell.textContent))),[
      ['升神','40','40','200'],['天改','15','55','75'],['仙改','20','75','100'],['圣改','30','105','150'],['神改','40','145','200']
    ]);
    const starts=await page.locator('.machine-breakthrough-stage-table tbody td').evaluateAll(nodes=>nodes.map(node=>{const range=document.createRange();range.selectNodeContents(node);return {x:range.getBoundingClientRect().x,alignment:getComputedStyle(node).textAlign};}));
    assert.ok(starts.every(item=>item.alignment==='left'&&Math.abs(item.x-starts[0].x)<1));
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
