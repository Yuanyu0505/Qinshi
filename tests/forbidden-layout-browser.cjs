'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const crypto=require('node:crypto');
// Frozen from actual 1.1.13 rendering before any template/CSS change, not derived from production helpers.
const baselineDefault='6b31a68be5e6f12c0ec1758badc156443c3b3168c5ccaeb7a842115e9691399a';
const baselineSchedule='cec965863c74eca4cc06ba6f4b8d0438991df16f9b54143f69edf8becaea6e4a';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;
const out='outputs/forbidden-layout-1.1.14',key='qinshi_forbidden_needs_v2';
const current='[data-forbidden-card="2026-11-16_yin_yang"]';
before(async()=>{
  fs.mkdirSync(out,{recursive:true});server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
async function setup(width=1366,height=768){
  const context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Shanghai',serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>{throw e;});await page.clock.install({time:new Date('2026-11-17T12:00:00+08:00')});await openApp(page,url+'/#forbidden');return{context,page};
}
async function snapshot(page){return page.locator('[data-forbidden-card]').evaluateAll(cards=>cards.map(card=>({
  id:card.dataset.forbiddenCard,expanded:card.querySelector('[data-forbidden-expand]').getAttribute('aria-expanded'),
  disciples:Array.from(card.querySelectorAll('.forbidden-disciples [data-forbidden-name-action]'),n=>({text:n.textContent,...n.dataset})),
  groups:Array.from(card.querySelectorAll('.forbidden-reward-section'),section=>({
    rows:Array.from(section.querySelectorAll('.forbidden-reward-row'),row=>({choice:row.classList.contains('is-choice-group'),items:Array.from(row.querySelectorAll('[data-forbidden-name-action]'),n=>({...n.dataset,text:n.textContent}))})),
    items:Array.from(section.querySelectorAll('[data-forbidden-name-action]'),n=>({...n.dataset,text:n.textContent}))
  }))
})));}
for(const[width,height]of[[320,568],[390,844],[820,1180],[1366,768],[1920,1080]])test(`${width}: forbidden before/after layout and unchanged rewards`,async()=>{
  const{context,page}=await setup(width,height);
  try{
    const phase=process.env.FORBIDDEN_BASELINE?'before':'after',records=await snapshot(page);
    const geometry=await page.locator('[data-forbidden-card]').evaluateAll(cards=>cards.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
    await page.screenshot({path:`${out}/${phase}-${width}-default.png`,fullPage:true});
    const contribution=page.locator(current+' .forbidden-rewards [data-forbidden-section="contribution5"][data-forbidden-select]');
    await contribution.nth(0).click();await contribution.nth(1).click();
    const saved=await page.evaluate(k=>window.QinshiAccounts.getItem(k),key);
    await page.screenshot({path:`${out}/${phase}-${width}-selected.png`,fullPage:true});
    await page.locator(current+' .forbidden-rewards [data-forbidden-purpose-edit]').first().click();
    await page.screenshot({path:`${out}/${phase}-${width}-purpose.png`});await page.keyboard.press('Escape');
    if(!process.env.FORBIDDEN_BASELINE){
      assert.equal(digest(records),baselineDefault,'original reward identities/text/order must survive without local screenshot artifacts');
      const selectedToken=page.locator(current+' .forbidden-rewards .forbidden-token.is-selected').first();
      const checkBounds=await selectedToken.locator('[data-forbidden-select]').boundingBox(), nameBounds=await selectedToken.locator('[data-forbidden-name-action]').boundingBox();
      assert.ok(checkBounds.x+checkBounds.width<=nameBounds.x+0.5,'selection and name must have separate hit regions');
      const baseline=`${out}/before-${width}.json`;
      if(fs.existsSync(baseline))assert.deepEqual(records,JSON.parse(fs.readFileSync(baseline)).records);
      assert.ok(geometry[1].y>=geometry[0].y+geometry[0].height,'next period follows current period');
      assert.ok(Math.abs(geometry[1].width-geometry[0].width)<2);
      assert.deepEqual(await page.locator(current+' .forbidden-reward-group > h3').allTextContents(),['贡献奖励','排名奖励','材料与其他奖励']);
      const details=page.locator(current+' details.forbidden-needs');
      assert.equal(await details.getAttribute('open'),null);
      assert.match(await details.locator('summary').innerText(),/弟子 0.*奖励道具 2/);
      await details.locator('summary').click();
      assert.equal(await details.locator('[data-forbidden-purpose-edit]').count(),2);
      assert.equal(await page.evaluate(k=>window.QinshiAccounts.getItem(k),key),saved,'expanding needs must not write storage');
      await page.screenshot({path:`${out}/${phase}-${width}-needs.png`,fullPage:true});
      await contribution.first().click();
      assert.equal(await page.locator(current+' details.forbidden-needs').getAttribute('open'),'');
      assert.match(await page.locator(current+' details.forbidden-needs summary').innerText(),/奖励道具 1/);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    fs.writeFileSync(`${out}/${phase}-${width}.json`,JSON.stringify({records,geometry},null,2));
  }finally{await context.close();}
});
test('all future forbidden rewards keep exact option identity, order and choice boundaries',async()=>{
  const{context,page}=await setup();try{
    await page.locator('#forbidden-schedule-toggle').click();await page.clock.runFor(200);await page.locator('#forbidden-expand-all').click();await page.clock.runFor(200);
    const records=await snapshot(page);assert.equal(records.length,14);assert.equal(records[0].id,'2026-11-16_yin_yang');
    assert.equal(records[13].id,'2026-12-31_song_dance');
    if(process.env.FORBIDDEN_BASELINE)fs.writeFileSync(`${out}/all-reward-baseline.json`,JSON.stringify(records,null,2));
    else {
      assert.equal(digest(records),baselineSchedule,'all 14 original future periods retain their exact subgroups and options');
      if(fs.existsSync(`${out}/all-reward-baseline.json`))assert.deepEqual(records,JSON.parse(fs.readFileSync(`${out}/all-reward-baseline.json`)));
    }
    for(const card of records){assert.equal(card.groups.length,9);assert.ok(card.groups.slice(2,5).every(g=>g.rows.every(r=>r.choice)));assert.ok(card.groups.slice(5).every(g=>g.rows.every(r=>!r.choice)));}
  }finally{await context.close();}
});
if(!process.env.FORBIDDEN_BASELINE)test('needs details survive render and exact atlas navigation return without persistent UI fields',async()=>{
  const{context,page}=await setup(390,844);try{
    await page.locator(current+' .forbidden-disciples [data-forbidden-select]').first().click();
    await page.locator(current+' details.forbidden-needs summary').click();
    const saved=await page.evaluate(k=>window.QinshiAccounts.getItem(k),key);
    await page.locator(current+' .forbidden-disciples [data-forbidden-name-action]').first().click();
    await page.locator('#partition-atlas').waitFor({state:'visible'});
    await page.locator('#partition-atlas [data-item-navigation-back]').click();
    assert.equal(await page.locator(current+' details.forbidden-needs').getAttribute('open'),'');
    assert.equal(await page.evaluate(k=>window.QinshiAccounts.getItem(k),key),saved);
  }finally{await context.close();}
});
if(!process.env.FORBIDDEN_BASELINE)test('forbidden search composition, purposes, rapid rendering and end-date boundary preserve visible results',async()=>{
  const{context,page}=await setup(820,1180);try{
    await page.locator('#forbidden-search').evaluate(input=>{
      input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='秋骊';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    });
    assert.equal(await page.locator('[data-forbidden-card]').count(),2);
    await page.locator('#forbidden-search').dispatchEvent('compositionend');await page.clock.runFor(200);
    assert.ok(await page.locator('[data-forbidden-card]').count()>2);
    assert.equal(await page.locator('[data-forbidden-card] [data-forbidden-expand][aria-expanded="false"]').count(),0);
    await page.locator('#forbidden-search').fill('not-a-real-reward');await page.clock.runFor(200);
    assert.equal(await page.locator('[data-forbidden-card]').count(),0);
    await page.locator('#forbidden-search').fill('');await page.clock.runFor(200);
    await page.locator(current+' .forbidden-rewards [data-forbidden-select]').first().click();
    await page.locator('[data-forbidden-purpose="unclassified"]').click();await page.clock.runFor(200);
    assert.ok(await page.locator(current).count());
    await page.locator('[data-forbidden-purpose=""]').click();
    await page.locator('#forbidden-schedule-toggle').click();await page.locator('#forbidden-search').fill('11.16');await page.clock.runFor(200);
    assert.equal(await page.locator('[data-forbidden-card]').count(),1);
    await page.clock.fastForward(35*3600000+59*60000);
    assert.equal(await page.locator('[data-forbidden-card]').count(),1,'end date remains active until midnight');
    await page.clock.fastForward(2*60000);
    assert.equal(await page.locator('[data-forbidden-card]').count(),0);
  }finally{await context.close();}
});
if(!process.env.FORBIDDEN_BASELINE)test('forbidden family sync remains opt-in and never rewrites other selected disciples or soul shop data',async()=>{
 const{context,page}=await setup();try{
  await page.locator(current+' .forbidden-disciples [data-forbidden-select]').first().click();
  await page.locator(current+' .forbidden-rewards [data-forbidden-select]').first().click();
  const before=JSON.parse(await page.evaluate(k=>window.QinshiAccounts.getItem(k),key));
  assert.deepEqual(Object.keys(before.events),['2026-11-16_yin_yang']);
  await page.locator(current+' .forbidden-rewards [data-forbidden-purpose-edit]').first().click();
  assert.equal(await page.locator('input[name="forbidden-purpose-scope"][value="event"]').isChecked(),true);
  await page.locator('input[name="forbidden-purpose-scope"][value="family"]').check();
  await page.locator('[data-forbidden-purpose-save]').click();
  const after=JSON.parse(await page.evaluate(k=>window.QinshiAccounts.getItem(k),key));
  assert.ok(Object.keys(after.events).length>1);assert.ok(Object.keys(after.events).every(id=>id>='2026-11-16'));
  assert.deepEqual(after.events['2026-11-16_yin_yang'].disciples,before.events['2026-11-16_yin_yang'].disciples);
  assert.equal(await page.evaluate(()=>window.QinshiAccounts.getItem('qinshi_soul_shop_needs_v1')),null);
  await page.locator(current+' .forbidden-rewards [data-forbidden-purpose-edit]').first().click();
  assert.equal(await page.locator('input[name="forbidden-purpose-scope"][value="event"]').isChecked(),true);
  await page.keyboard.press('Escape');
  assert.deepEqual(JSON.parse(await page.evaluate(k=>window.QinshiAccounts.getItem(k),key)),after);
 }finally{await context.close();}
});
if(!process.env.FORBIDDEN_BASELINE)test('forbidden transition widths and low-height purpose editor have no page overflow or obscured save button',async()=>{
 const{context,page}=await setup();try{
  for(const width of[360,520,599,600,640,767,900,1024,1199,1200,1280,1536]){
   await page.setViewportSize({width,height:568});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`width ${width}`);
  }
  await page.setViewportSize({width:820,height:360});
  await page.locator(current+' .forbidden-rewards [data-forbidden-select]').first().click();
  await page.locator(current+' .forbidden-rewards [data-forbidden-purpose-edit]').first().click();
  await page.locator('[data-forbidden-purpose-save]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-forbidden-purpose-save]').evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await page.keyboard.press('Escape');
 }finally{await context.close();}
});
