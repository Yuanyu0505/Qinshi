const {test,before,after,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let server,browser,url;const errors=[];
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
afterEach(()=>assert.deepEqual(errors.splice(0),[]));
async function setup(width,attrs=['暴击伤害','速','速'],dun='鬼遁'){
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:true,serviceWorkers:'block'});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await openApp(page,url,{waitUntil:'load'});
  const tab=page.locator('.tab[data-partition="inscription"]');if(await tab.isVisible())await tab.click();else{await page.locator('#mobile-more-toggle').click();await page.locator('#mobile-more-layer [data-partition="inscription"]').click();}
  await page.locator('[data-mode="crafting-paths"]').click();const section=page.locator('#inscription-crafting-paths');
  await section.locator('[data-craft-field="dun"]').selectOption(dun);for(const [i,a]of attrs.entries())await section.locator('[data-craft-field="attr"]').nth(i).selectOption(a);
  await section.locator('[data-craft-action="generate"]').click();const card=section.locator('.craft-strategy').first();await card.locator('svg').waitFor();return{page,section,card};
}
for(const width of [320,390,768,1024])test(width+' shared ghost flow keeps useful branches, fitting and keyboard focus usable',async()=>{
  const {page,card}=await setup(width);try{
    const boxes=card.locator('[data-flow-node]');
    assert.equal(await boxes.filter({hasText:'蓝二速度档位不可辨'}).count(),0);
    const useful=boxes.filter({hasText:/紫一 可用产物/});assert.equal(await useful.count(),2);
    for(const text of await useful.allTextContents()){assert.doesNotMatch(text,/概率/);assert.match(text,/总共需要9枚该铭文/);}
    assert.match(await card.locator('svg').textContent(),/概率50%/);
    assert.equal(await card.locator('.craft-flow-stage').count(),0);
    assert.ok(await card.locator('.craft-flow-promotion').count()>0);
    for(const [kind,color]of [['initial','rgb(8, 104, 186)'],['intermediate','rgb(135, 54, 186)']]){
      const labels=card.locator('.craft-flow-promotion-'+kind+' text');
      for(const fill of await labels.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fill)))assert.equal(fill,color);
    }
    assert.equal(await card.locator('[data-craft-action="diagram-failures"]').count(),0);
    const node=useful.first();await node.scrollIntoViewIfNeeded();await node.focus();await node.press('Enter');
    assert.equal(await card.locator('.craft-flow-box.is-focused').count(),1);assert.ok(await card.locator('.is-dimmed').count()>0);
    await node.press('Escape');assert.equal(await card.locator('.is-dimmed').count(),0);
    await card.locator('[data-craft-action="diagram-width"]').click();
    assert.ok(await card.locator('.craft-flow-viewport').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
    await card.locator('[data-craft-action="diagram-all"]').click();
    assert.ok(await card.locator('[data-flow-viewer]').evaluate(el=>Number(el.dataset.zoom)>0&&Number(el.dataset.zoom)<=1));
    fs.mkdirSync('test-results/1071-visual',{recursive:true});
    await card.locator('[data-flow-viewer]').screenshot({path:'test-results/1071-visual/overview-'+width+'.png'});
    await card.locator('[data-craft-action="diagram-reset"]').click();assert.equal(await card.locator('[data-flow-viewer]').getAttribute('data-zoom'),'0.9');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    fs.mkdirSync('test-results/1068-visual',{recursive:true});await card.screenshot({path:'test-results/1068-visual/shared-'+width+'.png'});
  }finally{await page.close();}
});
test('unused details expand below the single canvas without changing graph dimensions or zoom',async()=>{
  const {page,card}=await setup(768,['技能穿透','技能穿透','技能穿透'],'地遁');try{
    const canvas=card.locator('svg');const size=await canvas.getAttribute('viewBox');await card.locator('[data-craft-action="diagram-in"]').click();
    await card.locator('[data-craft-action="diagram-failures"]').click();
    await card.locator('[data-flow-details]').waitFor({state:'visible'});assert.equal(await canvas.getAttribute('viewBox'),size);
    assert.equal(await card.locator('[data-flow-viewer]').getAttribute('data-zoom'),'1');assert.equal(await card.locator('svg').count(),1);
    assert.match(await card.locator('[data-flow-details]').innerText(),/失败橙一|复用失败橙二/);
    await card.locator('[data-craft-action="diagram-failures"]').click();assert.equal(await card.locator('[data-flow-details]').isHidden(),true);
  }finally{await page.close();}
});

test('changing crafting context clears target choices while typing search and choosing the same disciple do not',async()=>{
  const {page,section}=await setup(1024);
  try{
    const attrs=()=>section.locator('[data-craft-field="attr"]');
    const values=()=>attrs().evaluateAll(nodes=>nodes.map(node=>node.value));
    await section.locator('[data-craft-field="search"]').fill('盖聂');
    assert.deepEqual(await values(),['暴击伤害','速','速']);
    await section.locator('[data-craft-field="quality"]').selectOption('p2');
    assert.deepEqual(await values(),['','']);
    await attrs().nth(0).selectOption('速');
    await section.locator('[data-craft-field="dun"]').selectOption('龙遁');
    assert.deepEqual(await values(),['','']);
    await attrs().nth(0).selectOption('PVP速');
    await section.locator('[data-craft-field="search"]').fill('盖聂');
    const choice=section.locator('[data-craft-action="choose-disciple"]').first();
    await choice.click();assert.deepEqual(await values(),['','']);
    const slot=section.locator('[data-craft-field="slot"]');
    const slots=await slot.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value).filter(Boolean));
    await slot.selectOption(slots[0]);
    await attrs().nth(0).selectOption({index:1});
    if(slots.length>1){await slot.selectOption(slots[1]);assert.deepEqual(await values(),['','']);}
    await page.locator('[data-mode="crafting-simulator"]').click();
    const simulator=page.locator('#inscription-crafting-simulator');
    await simulator.locator('[data-craft-field="quality"]').selectOption('o2');
    assert.deepEqual(await simulator.locator('[data-craft-field="attr"]').evaluateAll(nodes=>nodes.map(node=>node.value)),['','','']);
  }finally{await page.close();}
});

test('favorite viewers bind keyboard highlighting again after unused-details redraw',async()=>{
  const {page,card}=await setup(1024,['技能穿透','技能穿透','技能穿透'],'地遁');try{
    await card.locator('[data-craft-action="toggle-favorite"]').click();
    await page.locator('[data-mode="crafting-favorites"]').click();
    const saved=page.locator('.craft-favorite-route').first();await saved.locator('summary').click();await saved.locator('svg').waitFor();
    for(const redraw of [false,true]){
      if(redraw)await saved.locator('[data-craft-action="diagram-failures"]').click();
      const node=saved.locator('[data-flow-node]').first();await node.scrollIntoViewIfNeeded();await node.focus();await node.press('Enter');
      assert.equal(await saved.locator('.craft-flow-box.is-focused').count(),1);
      await node.press('Escape');assert.equal(await saved.locator('.is-dimmed').count(),0);
    }
  }finally{await page.close();}
});
