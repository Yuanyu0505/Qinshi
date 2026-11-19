'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
const phase=process.env.SIX_HALLS_CAPTURE_PHASE==='before'?'before':'after';
const output=path.join(__dirname,'../outputs/six-halls-1139',phase);
let browser,server,url;
before(async()=>{fs.mkdirSync(output,{recursive:true});server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
async function enter(width=820,height=1180){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());
  const page=await context.newPage();await openApp(page,url+'/#other-reference');await page.locator('[data-ref-section="six-halls"]').click();
  await page.locator('#six-halls-hall-details table').waitFor();return {context,page};
}
async function mode(page,value){await page.locator('[data-six-halls-mode="'+value+'"]').click();await page.locator('#six-halls-'+value).waitFor();}
async function dimensions(page){return page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));}
async function assertPageMetrics(page){
  if(phase!=='after')return;
  const size=await dimensions(page);assert.ok(size.scroll<=size.width,JSON.stringify(size));
  const targets=await page.locator('#partition-six-halls button, #partition-six-halls input, [data-ref-kind="six-halls"] > .ref-heading button').evaluateAll(nodes=>nodes.map(n=>{
    const element=n.type==='checkbox'?n.closest('label'):n,b=element.getBoundingClientRect();return {width:b.width,height:b.height};
  }).filter(b=>b.width&&b.height));
  assert.ok(targets.every(t=>t.width>=44&&t.height>=44),JSON.stringify(targets));
}
for(const [width,height]of [[320,568],[390,844],[820,1180],[1366,768],[1920,1080]])test('real four-page captures '+phase+' '+width,async()=>{
  const {context,page}=await enter(width,height),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.locator('[data-six-halls-hall="lieshan"]').click();
    assert.match(await page.locator('#six-halls-hall-details').innerText(),/1%单级闪避/);
    assert.equal(await page.locator('.six-halls-bonuses tbody tr').count(),5);
    await assertPageMetrics(page);
    await page.locator('#partition-other-reference').screenshot({path:path.join(output,width+'-halls.png')});
    assert.equal(await page.locator('[data-six-halls-source]').count(),0);
    const boxes=await page.locator('.six-halls-modes,.six-halls-hall-tabs,.six-halls-profile').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left,width:b.width};}));
    for(const box of boxes){assert.ok(Math.abs(box.left-boxes[0].left)<1,JSON.stringify(boxes));assert.ok(Math.abs(box.width-boxes[0].width)<1,JSON.stringify(boxes));}
    await mode(page,'progress');
    await page.locator('[data-six-halls-progress="playerLevel"]').fill('89');await page.locator('[data-six-halls-progress="herbs"]').fill('100');
    await page.locator('[data-six-halls-progress="level"][data-hall-id="kuiwei"]').fill('10');
    await page.locator('[data-six-halls-progress="tokens"][data-hall-id="kuiwei"]').fill('30');
    await page.locator('[data-six-halls-mode="progress"]').click();
    await assertPageMetrics(page);
    await page.locator('#partition-other-reference').screenshot({path:path.join(output,width+'-progress.png')});
    if(phase==='after')assert.equal(await page.locator('.six-halls-order').count(),0);
    await mode(page,'planner');await page.locator('[data-six-halls-select="kuiwei"]').check();await page.locator('[data-six-halls-quick="50"][data-hall-id="kuiwei"]').click();
    await page.locator('[data-six-halls-action="calculate"]').click();
    await assertPageMetrics(page);
    if(phase==='after')assert.equal(await page.locator('.six-halls-key-shortage').evaluate(n=>getComputedStyle(n).borderColor===getComputedStyle(n).color),true);
    await page.locator('#partition-other-reference').screenshot({path:path.join(output,width+'-planner.png')});
    await mode(page,'reference');assert.equal(await page.locator('#six-halls-reference-content tbody tr').count(),50);
    await assertPageMetrics(page);
    await page.locator('#partition-other-reference').screenshot({path:path.join(output,width+'-reference.png')});
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
test('public page survives controller reload but private plan resets',async()=>{
  const {context,page}=await enter();try{
    await mode(page,'reference');
    const state=await page.evaluate(()=>{const c=window.SIX_HALLS_UI.init(window);c.toggleHall('kuiwei',true);c.setTarget('kuiwei',20);c.load();return {mode:c.state.mode,selected:c.state.plan.selected};});
    assert.equal(state.mode,'reference');assert.deepEqual(state.selected,[]);
  }finally{await context.close();}
});
test('over-cap target blocks old results and recovers after the player meets the gate',async()=>{
  const {context,page}=await enter();try{
    await mode(page,'progress');await page.locator('[data-six-halls-progress="playerLevel"]').fill('79');
    await mode(page,'planner');await page.locator('[data-six-halls-select="kuiwei"]').check();
    await page.locator('[data-six-halls-action="calculate"]').click();
    assert.match(await page.locator('#six-halls-result').innerText(),/最大可升级至40级六堂/);
    assert.equal(await page.locator('[data-six-halls-herbs]').count(),0);
    await page.locator('[data-six-halls-target="kuiwei"]').fill('41');
    await page.locator('[data-six-halls-action="calculate"]').click();
    assert.equal(await page.locator('[data-six-halls-target="kuiwei"]').getAttribute('aria-invalid'),'true');
    await mode(page,'progress');await page.locator('[data-six-halls-progress="playerLevel"]').fill('80');
    await mode(page,'planner');await page.locator('[data-six-halls-action="calculate"]').click();
    assert.equal(await page.locator('[data-six-halls-result-row="kuiwei"]').count(),1);
    assert.equal(await page.locator('.six-halls-level-status,.six-halls-locked-steps').count(),0);
    await mode(page,'reference');await page.locator('#six-halls-reference-min').fill('40');
    await page.locator('#six-halls-reference-max').fill('50');
    await page.waitForFunction(()=>document.querySelectorAll('#six-halls-reference-content tbody tr').length===10);
    assert.match(await page.locator('#six-halls-reference-content tbody tr').first().innerText(),/40 → 41级/);
    assert.equal(await page.locator('#six-halls-reference-content tbody tr').first().locator('[data-label="玩家等级门槛"]').innerText(),'80级');
    await page.locator('#six-halls-reference-max').fill('40');
    await page.waitForFunction(()=>document.querySelectorAll('#six-halls-reference-content tbody tr').length===0);
  }finally{await context.close();}
});
test('container narrowing, landscape and CSS zoom keep six-halls controls readable',async()=>{
  const {context,page}=await enter(1366,768);try{
    await page.locator('#partition-other-reference').evaluate(n=>{n.style.maxWidth='350px';});
    assert.equal(await page.locator('.six-halls-modes').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2);
    assert.equal(await page.locator('.six-halls-hall-tabs').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),3);
    await page.locator('#partition-other-reference').evaluate(n=>{n.style.maxWidth='';});
    await page.setViewportSize({width:844,height:390});
    for(const scale of [1.25,1.5,2]){
      await page.evaluate(s=>{document.body.style.zoom=String(s);},scale);
      const size=await dimensions(page);assert.ok(size.scroll<=size.width,scale+' '+JSON.stringify(size));
    }
  }finally{await context.close();}
});
test('directory search and spirit total-number styling remain independent',async()=>{
  const {context,page}=await enter();try{
    await page.locator('[data-ref-home]').click();
    await page.locator('[data-ref-directory-search]').fill('器灵');
    assert.equal(await page.locator('[data-ref-section]').count(),1);
    await page.locator('[data-ref-section="spirits"]').click();
    await page.locator('.ref-column-menu > summary').click();await page.locator('[data-ref-table-option="spirits-fates"]').click();
    assert.equal(await page.locator('.ref-spirit-total-number').first().evaluate(n=>getComputedStyle(n).color),'rgb(255, 120, 111)');
    assert.match(await page.locator('.ref-spirit-total-number').first().innerText(),/^\d+(\.\d+)?$/);
  }finally{await context.close();}
});
test('all hall texts and members remain exact; member search navigates and preserves input focus',async()=>{
  const {context,page}=await enter(390,844);try{
    const halls=await page.evaluate(()=>window.SIX_HALLS_REFERENCE_DATA.halls);
    assert.deepEqual(halls.map(h=>h.name),['魁隗','蚩尤','烈山','四岳','共工','神农']);
    for(const hall of halls){
      await page.locator('[data-six-halls-hall="'+hall.id+'"]').click();
      assert.deepEqual(await page.locator('.six-halls-bonuses tbody td').allTextContents(),hall.bonuses.map(b=>b.text));
      assert.deepEqual(await page.locator('.six-halls-members li').allTextContents(),hall.disciples);
      const search=page.locator('#six-halls-member-search');await search.fill(hall.disciples[0]);
      assert.equal(await page.locator('.six-halls-profile h3').innerText(),hall.name);
      assert.equal(await search.evaluate(n=>n===document.activeElement),true);
      assert.equal(await page.locator('.six-halls-members .is-match').count(),1);
      await search.fill('');
    }
    const search=page.locator('#six-halls-member-search');await search.fill('神');
    assert.equal(await page.locator('#six-halls-search-results button').count(),99);
    await page.locator('#six-halls-search-results button').filter({hasText:'神赤练 · 魁隗'}).click();
    assert.equal(await page.locator('.six-halls-profile h3').innerText(),'魁隗');
    await search.fill('不存在的神将');assert.match(await page.locator('#six-halls-search-results').innerText(),/未找到/);
    await search.fill('');assert.equal(await page.locator('#six-halls-search-results button').count(),0);
    await search.evaluate(input=>{
      input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='神星魂';
      input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    });
    assert.equal(await page.locator('.six-halls-profile h3').innerText(),'魁隗');
    await search.dispatchEvent('compositionend');
    assert.equal(await page.locator('.six-halls-profile h3').innerText(),'蚩尤');
    assert.equal(await search.inputValue(),'神星魂');
  }finally{await context.close();}
});
test('legacy six-halls URL and browser back preserve the parked form identity',async()=>{
  const {context,page}=await enter();try{
    await page.goto(url+'/#six-halls');await page.locator('#six-halls-hall-details table').waitFor();
    assert.equal(new URL(page.url()).hash,'#other-reference');
    await mode(page,'progress');const input=page.locator('[data-six-halls-progress="herbs"]');await input.fill('123');
    await input.evaluate(n=>{window.sixHallsIdentityProbe=n;});
    await page.locator('[data-ref-home]').click();await page.locator('[data-ref-section="elements"]').click();
    await page.locator('[data-ref-home]').click();await page.locator('[data-ref-section="six-halls"]').click();
    await input.waitFor();assert.equal(await input.inputValue(),'123');assert.equal(await input.evaluate(n=>n===window.sixHallsIdentityProbe),true);
    await page.locator('.tab[data-partition="forging"]').click();await page.goBack();await input.waitFor();
    assert.equal(await input.evaluate(n=>n===window.sixHallsIdentityProbe),true);
  }finally{await context.close();}
});
