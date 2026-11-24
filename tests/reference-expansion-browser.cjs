const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser;
before(async()=>{browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();});
async function scenario(run,width=1280){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 const page=await context.newPage();
 try{
  await context.route('http://127.0.0.1/reference-test',route=>route.fulfill({contentType:'text/html',body:'<main id="partition-other-reference"><div id="body"></div></main>'}));
  await page.goto('http://127.0.0.1/reference-test');
  await page.addScriptTag({path:path.resolve('js/number-format.js')});
  for(const file of ['data/reference-expansion.js','js/reference-calculators.js','js/reference-expansion-ui.js']) if(fs.existsSync(file))await page.addScriptTag({path:path.resolve(file)});
  await page.addStyleTag({path:path.resolve('css/other-reference.css')});
  if(fs.existsSync('css/reference-expansion.css'))await page.addStyleTag({path:path.resolve('css/reference-expansion.css')});
  await run(page);
 }finally{await context.close();}
}
async function mount(page,id){await page.evaluate(id=>{window.REFERENCE_EXPANSION_UI?.mount(window,document.querySelector('#body'),id);},id);}
test('first-release lookup defaults newest-first, filters year and search together without storage writes',async()=>scenario(async page=>{
 await mount(page,'first-releases');
 assert.equal(await page.locator('[data-exp-query]').count(),1);
 await page.locator('[data-exp-query]').fill('雷豹');
 assert.match(await page.locator('[data-exp-results]').textContent(),/雷豹英布/);
 assert.match(await page.locator('[data-exp-results]').textContent(),/2026-11-12/);
 await page.locator('[data-exp-filter="year"]').selectOption('2025');
 assert.match(await page.locator('[data-exp-results]').textContent(),/未找到/);
 assert.equal(await page.evaluate(()=>localStorage.length),0);
}));
test('costume names can be found from costume text and missing source names remain explicit',async()=>scenario(async page=>{
 await mount(page,'costumes');
 await page.locator('[data-exp-query]').fill('瑞麟踏焰');
 assert.match(await page.locator('[data-exp-results]').textContent(),/千泷高月/);
 await page.locator('[data-exp-query]').fill('');
 await page.locator('[data-exp-filter="availability"]').selectOption('missing');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),1);
 assert.match(await page.locator('[data-exp-results]').textContent(),/暂缺/);
}));
test('account calculation rejects descending levels and accepts the 100-level endpoint',async()=>scenario(async page=>{
 await mount(page,'account-levels');
 await page.locator('[data-exp-filter="band"]').selectOption('90');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),11);
 await page.locator('[data-exp-input="from"]').fill('99');
 await page.locator('[data-exp-input="to"]').fill('100');
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/经验/);
 assert.doesNotMatch(await page.locator('[data-exp-calculation]').textContent(),/NaN|undefined/);
 await page.locator('[data-exp-input="to"]').fill('98');
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/目标|等级|范围/);
}));
test('sage estimator keeps 27 days and four weeks fixed and sums cumulative thresholds',async()=>scenario(async page=>{
 await mount(page,'sage');
 for(const [key,val]of Object.entries({stamina:'150',activity:'50',weeklySpend:'30000',weeklyRecharge:'0'}))await page.locator('[data-exp-input="'+key+'"]').fill(val);
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/336\.2/);
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/336/);
 assert.equal(await page.locator('input[data-exp-input="days"],input[data-exp-input="weeks"]').count(),0);
}));
test('fish selection includes percentage attributes once and is cleared on a fresh section mount',async()=>scenario(async page=>{
 await mount(page,'fishing');
 await page.locator('[data-exp-filter="attribute"]').selectOption('技能穿透');
 await page.locator('[data-exp-query]').fill('丑鱼 金');
 assert.equal(await page.locator('[data-exp-fish]').count(),1);
 await page.locator('[data-exp-fish]').check();
 const summary=page.locator('[data-exp-selection]');
 assert.match(await summary.textContent(),/技能穿透（%）/);
 assert.match(await summary.textContent(),/1430/);
 await page.locator('[data-exp-filter="mode"]').selectOption('max');
 assert.match(await summary.textContent(),/3576/);
 await page.locator('[data-exp-query]').fill('');
 await page.locator('[data-exp-filter="table"]').selectOption('fishing-totals');
 assert.equal(await page.locator('[data-exp-results] table').count(),2);
 await mount(page,'costumes');await mount(page,'fishing');
 assert.match(await summary.textContent(),/已勾选 0 种/);
 assert.equal(await page.evaluate(()=>localStorage.length),0);
}));
test('jinchan comparison groups all outcomes by the same place and event without mixing another event',async()=>scenario(async page=>{
 await mount(page,'jinchan');
 await page.locator('[data-exp-filter="place"]').selectOption('矿坑');
 await page.locator('[data-exp-filter="event"]').selectOption('坑洞出现');
 assert.equal(await page.locator('[data-exp-choice]').count(),2);
 await page.locator('[data-exp-choice]').first().check();
 await page.locator('[data-exp-choice]').nth(1).check();
 assert.match(await page.locator('[data-exp-selection]').textContent(),/矿坑 · 坑洞出现/);
 assert.equal(await page.locator('[data-exp-selection] tbody tr').count(),6);
 await page.locator('[data-exp-filter="event"]').selectOption('发现矿脉');
 await page.locator('[data-exp-choice]').first().check();
 assert.doesNotMatch(await page.locator('[data-exp-selection]').textContent(),/坑洞出现/);
 await page.locator('[data-exp-filter="table"]').selectOption('jinchan-blessings');
 assert.equal(await page.locator('[data-exp-filter="event"]').isDisabled(),true);
 assert.match(await page.locator('[data-exp-results]').textContent(),/晶矿/);
}));
test('awakening range and total retain five-element filtering and never mutate the stored workbook data',async()=>scenario(async page=>{
 const before=await page.evaluate(()=>JSON.stringify(REFERENCE_EXPANSION_DATA.awakening));
 await mount(page,'disciple-awakening');
 await page.locator('[data-exp-filter="element"]').selectOption('木');
 await page.locator('[data-exp-input="from"]').selectOption('0星');
 await page.locator('[data-exp-input="to"]').selectOption('1星');
 await page.locator('[data-exp-calculate]').click();
 assert.doesNotMatch(await page.locator('[data-exp-calculation]').textContent(),/NaN|undefined|不完整/);
 await page.locator('[data-exp-filter="table"]').selectOption('awakening-source-totals');
 assert.equal(await page.locator('[data-exp-filter="star"]').isDisabled(),true);
 assert.equal(await page.locator('[data-exp-results] tbody tr').first().locator('td').first().textContent(),'木');
 assert.equal(await page.evaluate(()=>JSON.stringify(REFERENCE_EXPANSION_DATA.awakening)),before);
}));
test('responsive auto view changes from cards to table after resize without losing search or selection',async()=>scenario(async page=>{
 await mount(page,'fishing');
 await page.locator('[data-exp-query]').fill('丑鱼 金');
 assert.equal(await page.locator('[data-exp-results] .ref-exp-cards').count(),1);
 await page.setViewportSize({width:1280,height:900});
 await page.waitForFunction(()=>Boolean(document.querySelector('[data-exp-results] table')));
 assert.equal(await page.locator('[data-exp-query]').inputValue(),'丑鱼 金');
 assert.match(await page.locator('[data-exp-results]').textContent(),/1430/);
},390));
test('mobile sage results use one compact table with all eight outputs and cards do not repeat their title',async()=>scenario(async page=>{
 await mount(page,'sage');
 await page.locator('[data-exp-calculate]').click();
 const output=page.locator('[data-exp-calculation]');
 assert.equal(await output.locator('table').count(),1);
 assert.equal(await output.locator('tbody tr').count(),8);
 assert.ok(await output.locator('table').evaluate(table=>table.getBoundingClientRect().width<=table.parentElement.clientWidth+1));
 assert.equal(await output.locator('.ref-exp-cards').count(),0);
 const rows=await output.locator('tbody tr').allTextContents();
 assert.ok(rows.some(row=>row.includes('圣贤令（取整前）')&&row.includes('336.2')));
 assert.ok(rows.some(row=>row.includes('圣贤令（最终）')&&row.includes('336')));
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 await page.locator('[data-exp-calculate]').click();
 const first=output.locator('.ref-exp-cards > article').first();
 assert.equal(await first.locator('h3').textContent(),'体力任务经验');
 assert.equal(await first.locator('dl > div').count(),1);
 assert.equal(await first.locator('dt').textContent(),'数量');
},390));
test('mobile fish cards show selection, quality and existing attributes without blank-stat rows',async()=>scenario(async page=>{
 await mount(page,'fishing');
 await page.locator('[data-exp-query]').fill('丑鱼 金');
 const card=page.locator('[data-exp-results] article').first();
 assert.equal(await card.locator('h3').textContent(),'丑鱼 金');
 assert.equal(await card.locator('[data-exp-fish]').count(),1);
 assert.deepEqual(await card.locator('dt').allTextContents(),['收集','品质','血','技能穿透（%）']);
 await card.locator('[data-exp-fish]').check();
 assert.equal(await page.locator('[data-exp-selection] table').count(),1);
},390));
for(const width of [320,390,820,1280])test(width+'px expansion pages keep tables locally scrollable and controls within the viewport',async()=>scenario(async page=>{
 for(const id of ['first-releases','costumes','fishing','account-levels','disciple-awakening','jinchan','sage']){
  await mount(page,id);
  assert.equal(await page.locator('[data-exp-section="'+id+'"]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
},width));
