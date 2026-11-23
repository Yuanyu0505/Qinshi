const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
const phase=process.env.REALM_LAYOUT_EVIDENCE;
const baseline=process.env.REALM_LAYOUT_BASELINE;
async function useBaseline(context){
  if(!baseline)return;
  const {execFileSync}=require('node:child_process');
  const sources=['css/secret-realm.css','js/secret-realm-ui.js'];
  for(const source of sources){
    const contents=execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',baseline+':'+source]);
    await context.route('**/'+source+'*',route=>route.fulfill({body:contents,contentType:source.endsWith('.css')?'text/css':'text/javascript'}));
  }
}
async function capture(page,name){if(phase)await page.screenshot({path:path.resolve('outputs','realm-1155-'+phase+'-'+name+'.png')});}
async function plan(page){
  await page.locator('[data-realm-action=none]').click();
  await page.locator('[data-realm-enable=pack6]').check();
  await page.locator('[name=target]').fill('3');
  const start=Date.now();await page.locator('[data-realm-calculate]').click();
  await page.locator('.realm-plan .realm-budget').first().waitFor();
  return Date.now()-start;
}
test('planning and results fit seven viewports and keep the primary action ahead of optional settings',async()=>{
  const layouts=[];
  const viewports=[[320,568],[390,844],[768,1024],[820,1180],[1280,800],[1440,900],[1920,1080]];
  const recordOnly=process.env.REALM_LAYOUT_VIDEO_ONLY==='1';
  if(recordOnly)assert.ok(phase);
  for(const [width,height] of recordOnly?viewports.filter(([w])=>w===390):viewports){
    const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',...(phase&&process.env.REALM_LAYOUT_VIDEO&&width===390?{recordVideo:{dir:path.resolve('outputs','realm-1155-'+phase+'-video')}}:{})}),page=await context.newPage();
    try{
      await useBaseline(context);
      await openApp(page,url+'/#secret-realm');
      if(recordOnly)await capture(page,width+'-progress');
      await page.locator('[data-realm-mode=planner]').click();
      await page.evaluate(()=>window.scrollTo(0,0));await capture(page,width+'-planner');
      const layout=await page.locator('[data-realm-calculate]').evaluate(n=>({
        goalFirst:!!(n.compareDocumentPosition(document.querySelector('[data-realm-form=settings]'))&Node.DOCUMENT_POSITION_FOLLOWING),
        top:Math.round(n.getBoundingClientRect().top),height:Math.round(n.getBoundingClientRect().height),
        font:parseFloat(getComputedStyle(document.querySelector('[name=target]')).fontSize),
        aboveFold:(()=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&n.contains(document.elementFromPoint(r.left+r.width/2,r.bottom-2));})()
      }));
      if(width===1280){
        const host=page.locator('#secret-realm-content');
        await host.evaluate(n=>n.style.maxWidth='470px');
        layout.narrow=await page.locator('[name=target]').evaluate(n=>Math.abs(n.getBoundingClientRect().left-document.querySelector('[name=currencyTarget]').getBoundingClientRect().left)<2);
        await host.evaluate(n=>n.style.removeProperty('max-width'));
      }
      if(recordOnly){
        await page.locator('.realm-source-tools').scrollIntoViewIfNeeded();
        await capture(page,width+'-sources');
      }
      layout.elapsed=await plan(page);await capture(page,width+'-result');
      layout.resultsFit=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
      layout.metrics=await page.locator('.realm-plan').first().locator('.realm-costs [data-realm-metric]').count();
      if(!baseline&&width===1440){
        const positions=await page.locator('.realm-plan-compare .realm-plan').evaluateAll(nodes=>nodes.map(n=>[n.offsetLeft,n.offsetTop]));
        assert.equal(positions.length,2);
        assert.ok(positions[1][0]>positions[0][0]&&positions[1][1]===positions[0][1],'desktop plans share a row');
      }
      if(width===390||width===1440){
        await page.locator('[data-realm-mode=reference]').click();
        await page.evaluate(()=>window.scrollTo(0,0));await capture(page,width+'-reference');
        assert.equal(await page.locator('.realm-reference .realm-rewards').last().locator('div').count(),35);
      }
      layouts.push({width,...layout});
    }finally{await context.close();}
  }
  console.log('Realm layout evidence:',JSON.stringify(layouts));
  if(baseline)return; // Opt-in capture of the old layout, not a green regression.
  for(const layout of layouts){
    assert.equal(layout.goalFirst,true,'goal before settings at '+layout.width);
    assert.ok(layout.height>=44&&layout.font>=16,'accessible form at '+layout.width);
    if(layout.width<=390)assert.equal(layout.aboveFold,true,'reachable without scrolling at '+layout.width);
    assert.equal(layout.resultsFit,true,'result fits at '+layout.width);
    assert.equal(layout.metrics,10);
  }
  if(!recordOnly)assert.equal(layouts.find(s=>s.width===1280).narrow,true,'packed sidebar width uses single column');
});
test('keyboard expands platform management and report periods without resetting edited draft',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  try{
    await openApp(page,url+'/#secret-realm');await page.locator('[data-realm-mode=planner]').click();
    const summary=page.getByText('管理自定义平台',{exact:true});assert.equal(await summary.count(),1);
    const platform=page.locator('[name=platformName]');assert.equal(await platform.isVisible(),false);
    await summary.focus();await page.keyboard.press('Enter');assert.equal(await platform.isVisible(),true);
    await platform.focus();await platform.evaluate(n=>{window.realmComposingNode=n;n.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));n.value='测试';n.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'测试'}));});
    assert.equal(await platform.evaluate(n=>n===window.realmComposingNode&&n===document.activeElement&&n.value==='测试'),true);
    await platform.evaluate(n=>n.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'测试'})));
    await page.locator('[name=discount]').fill('4.25');
    await page.locator('[data-realm-form=platform] button[type=submit]').focus();await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
    const remove=page.locator('[data-realm-delete-platform]');await remove.focus();
    page.once('dialog',dialog=>dialog.accept());await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
    await plan(page);
    const period=page.locator('.realm-period-result > summary').first();await period.focus();await page.keyboard.press('Space');
    const card=period.locator('xpath=ancestor::section[contains(@class, "realm-plan")]').first();
    assert.equal(await period.evaluate(n=>n.parentElement.open),true);
    await page.waitForFunction(()=>document.querySelector('.realm-plan [data-realm-toggle-periods]').getAttribute('aria-expanded')==='true');
    assert.equal(await card.locator('[data-realm-toggle-periods]').getAttribute('aria-expanded'),'true');
  }finally{await context.close();}
});
test('blocked Worker and file mode retain successful calculation',async()=>{
  for(const mode of ['blocked-worker','file']){
    const context=await browser.newContext({viewport:{width:820,height:800}}),page=await context.newPage();
    try{
      if(mode==='blocked-worker')await page.addInitScript(()=>{window.Worker=function(){throw Error('isolated test: Worker blocked');};});
      const entry=mode==='file'?pathToFileURL(path.resolve(__dirname,'../index.html')).href:url+'/';
      await openApp(page,entry+'#secret-realm');await page.locator('[data-realm-mode=planner]').click();
      console.log('Realm '+mode+' click-to-result: '+await plan(page)+' ms');
      assert.match(await page.locator('.realm-budget').first().innerText(),/¥3(?:\D|$)/);
    }finally{await context.close();}
  }
});
