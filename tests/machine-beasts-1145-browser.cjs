'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountItem}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
for(const width of [360,1280])test('dual cores, one-row controls and four-digit presentation at '+width,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await openApp(page,origin+'/#machine-beasts');await page.locator('[data-machine-beast-mode="calculator"]').click();
    const saved=await getAccountItem(page,'qinshi_machine_beasts_progress_v1');
    await page.evaluate(()=>{
      const view=window.MACHINE_BEAST_UI.captureView();view.calcBeastId='red-serpent';view.calcDraft={research:0,fragments:0,showHighRanks:true,showMods:true,inventory:{fullDivine:{10:1}}};
      view.singleInventoryPolicy={useOwnedInventory:true,limits:{fullDivine:{10:1}}};view.singleNewRankMode='zero';view.calcTargetLevel=8;view.calcResult=null;window.MACHINE_BEAST_UI.restoreView(view);
    });
    assert.ok((await page.locator('[data-calc-target] option').allTextContents()).every(text=>/^\d+级$/.test(text)));
    const geometry=await page.locator('.machine-owned-inventory-row').evaluate(row=>{
      const bounds=['.machine-owned-toggle','.machine-owned-stock','.machine-owned-quantity'].map(selector=>row.querySelector(selector).getBoundingClientRect());
      return {centers:bounds.map(rect=>rect.y+rect.height/2),left:bounds.map(rect=>rect.x),overflow:row.scrollWidth>row.clientWidth};
    });
    assert.ok(Math.max(...geometry.centers)-Math.min(...geometry.centers)<2,JSON.stringify(geometry));
    assert.ok(geometry.left[0]<geometry.left[1]&&geometry.left[1]<geometry.left[2]);assert.equal(geometry.overflow,false);
    await page.locator('[data-machine-action="calculate"]').click();
    await page.waitForFunction(()=>window.MACHINE_BEAST_UI.captureView().calcResult!==null);
    const result=await page.evaluate(()=>window.MACHINE_BEAST_UI.captureView().calcResult);
    assert.equal(result.valid,true);assert.equal(result.modificationCores.returned,145);assert.equal(result.modificationCores.spent,145);assert.equal(result.modificationCores.externalDeficit,0);
    assert.ok(result.unused.some(item=>item.rank===7&&item.modificationId==='none'&&item.count===7));
    await page.locator('.machine-inventory-conversion > summary').click();
    assert.match(await page.locator('.machine-inventory-conversion').innerText(),/7阶0改 8只/);
    assert.equal(await getAccountItem(page,'qinshi_machine_beasts_progress_v1'),saved);
    await page.locator('#machine-price-settings').evaluate(node=>node.open=true);
    const alignment=await page.evaluate(()=>{
      const a=document.querySelector('[data-reference-cost-field="awakeningBlueprintStock"]').getBoundingClientRect(),b=document.querySelector('.machine-reference-cost-check').getBoundingClientRect();
      const label=document.querySelector('.machine-reference-cost-check'),style=getComputedStyle(label);
      return {sameRow:Math.abs(a.y-b.y)<4,centerGap:Math.abs(a.y+a.height/2-b.y-b.height/2),input:{y:a.y,h:a.height},label:{y:b.y,h:b.height},style:{minHeight:style.minHeight,padding:style.padding,margin:style.margin,display:style.display,alignSelf:style.alignSelf,alignItems:style.alignItems,flexDirection:style.flexDirection}};
    });
    console.log('STOCK_ALIGNMENT '+width+' '+JSON.stringify(alignment));
    if(alignment.sameRow||width>=760)assert.ok(alignment.centerGap<3,JSON.stringify(alignment));
    assert.equal(await page.evaluate(()=>window.QinshiNumberFormat.format(2412304)),'241,2304');
    await page.screenshot({path:'outputs/1145-dual-ui-'+width+'.png',fullPage:false});
    await page.goto(origin+'/#other-reference');await page.locator('[data-ref-directory-search]').waitFor();
    const search=await page.locator('.ref-directory-controls').evaluate(row=>{
      const input=row.querySelector('input').getBoundingClientRect(),button=row.querySelector('[data-ref-sort-toggle]').getBoundingClientRect(),label=row.querySelector('label').getBoundingClientRect();
      return {centerGap:Math.abs(input.y+input.height/2-button.y-button.height/2),labelCenterGap:Math.abs(label.y+label.height/2-input.y-input.height/2),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(search.centerGap<3&&search.labelCenterGap<3,JSON.stringify(search));assert.equal(search.overflow,false);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
