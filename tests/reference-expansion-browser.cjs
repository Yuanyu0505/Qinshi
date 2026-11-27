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

test('release and costume tables pack three records in order and leave spare cells blank',async()=>scenario(async page=>{
 await page.evaluate(()=>{
  window.REFERENCE_EXPANSION_DATA.firstReleases=[{name:'甲',date:'2026-11-04'},{name:'乙',date:'2026-11-03'},{name:'丙',date:'2026-11-02'},{name:'丁',date:'2026-11-01'}];
  window.REFERENCE_EXPANSION_DATA.costumes=[{name:'甲',costume:'衣甲'},{name:'乙',costume:'衣乙'},{name:'丙',costume:'衣丙'},{name:'丁',costume:'衣丁'}];
 });
 for(const id of ['first-releases','costumes']){
  await mount(page,id);
  const rows=page.locator('[data-exp-results] tbody tr');
  assert.equal(await rows.count(),2);
  assert.equal(await rows.first().locator('td').count(),6);
  assert.deepEqual(await rows.last().locator('td').allTextContents(),id==='first-releases'?['丁','2026-11-01','','','','']:['丁','衣丁','','','','']);
  assert.ok(await rows.first().locator('td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).borderRightStyle==='solid')));
  await page.locator('[data-exp-filter="view"]').selectOption('cards');
  assert.equal(await page.locator('[data-exp-results] article').count(),4);
 }
}));

test('sage filters its current reference column and keeps estimator separate from store and rules',async()=>scenario(async page=>{
 await mount(page,'sage');
 assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'table');
 await page.locator('[data-exp-filter="detail"]').selectOption('日消耗体力');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),3);
 await page.locator('[data-exp-filter="table"]').selectOption('sage-master-rules');
 assert.equal(await page.locator('[data-exp-tools]').isVisible(),false);
 await page.locator('[data-exp-filter="detail"]').selectOption('没有');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),2);
 await page.locator('[data-exp-filter="table"]').selectOption('sage-experience');
 assert.equal(await page.locator('[data-exp-tools]').isVisible(),true);
 assert.equal(await page.locator('[data-exp-filter="detail"]').inputValue(),'');
}));
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
 assert.equal(await page.locator('[data-exp-filter="availability"]').count(),0);
 await page.locator('[data-exp-query]').fill('暂缺');
 assert.match(await page.locator('[data-exp-results]').textContent(),/暂缺/);
}));
test('account calculation rejects descending levels and accepts the 100-level endpoint',async()=>scenario(async page=>{
 await mount(page,'account-levels');
 assert.equal(await page.locator('[data-exp-query]').count(),0);
 assert.equal(await page.locator('[data-exp-clear]').count(),0);
 assert.equal(await page.locator('[data-exp-tools] .ref-exp-calculator, [data-exp-tools] h3').count(),0);
 assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'table');
 assert.equal(await page.locator('[data-exp-filter="view"] option[value="auto"]').count(),0);
 await page.locator('[data-exp-filter="band"]').selectOption('90');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),11);
 await page.locator('[data-exp-input="from"]').fill('99');
 await page.locator('[data-exp-input="to"]').fill('100');
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/经验/);
 assert.equal(await page.locator('[data-exp-calculation] tbody tr').count(),3);
 assert.ok(await page.locator('[data-exp-calculation] td:last-child').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).textAlign==='justify'&&getComputedStyle(cell).verticalAlign==='middle')));
 const edges=await page.evaluate(()=>{
  const result=document.querySelector('[data-exp-calculation] .ref-exp-table-scroll').getBoundingClientRect();
  const reference=document.querySelector('[data-exp-results] .ref-exp-table-scroll').getBoundingClientRect();
  return {left:Math.abs(result.left-reference.left),right:Math.abs(result.right-reference.right),gap:reference.top-result.bottom};
 });
 assert.ok(edges.left<1&&edges.right<1);
 assert.ok(edges.gap>=20);
 assert.doesNotMatch(await page.locator('[data-exp-calculation]').textContent(),/逐级取整/);
 assert.doesNotMatch(await page.locator('[data-exp-calculation]').textContent(),/NaN|undefined/);
 await page.locator('[data-exp-input="to"]').fill('98');
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/目标|等级|范围/);
}));

test('account rows round demands upward and keep three equal inputs followed by calculate',async()=>scenario(async page=>{
 await page.evaluate(()=>{const row=window.REFERENCE_EXPANSION_DATA.tables.find(t=>t.id==='account-experience').rows[0];row[4]=6.01;row[5]=1.01;});
 await mount(page,'account-levels');
 const table=page.locator('[data-exp-results] table');
 assert.deepEqual((await table.locator('thead th').allTextContents()).slice(-2),['体力需求（向上取整）','烤山鸡（向上取整）']);
 assert.deepEqual((await table.locator('tbody tr').first().locator('td').allTextContents()).slice(-2),['7','2']);
 const layout=await page.locator('.ref-exp-level-range').evaluate(row=>{
  const inputs=Array.from(row.querySelectorAll('input')).map(el=>{const r=el.getBoundingClientRect();return {width:r.width,bottom:r.bottom,x:r.x};});
  const b=row.querySelector('[data-exp-calculate]').getBoundingClientRect();
  return {inputs,button:{x:b.x,bottom:b.bottom}};
 });
 assert.ok(layout.inputs.every(input=>Math.abs(input.width-layout.inputs[0].width)<1));
 assert.ok(layout.inputs.every(input=>Math.abs(input.bottom-layout.button.bottom)<1));
 assert.ok(layout.button.x>layout.inputs[2].x);
 const controls=await page.locator('.ref-exp-level-range').evaluate(row=>Array.from(row.querySelectorAll('select,input,button')).map(el=>{const r=el.getBoundingClientRect();return {bottom:r.bottom,x:r.x};}));
 assert.equal(controls.length,6);
 assert.ok(controls.every(control=>Math.abs(control.bottom-controls[0].bottom)<1));
 assert.ok(controls.every((control,i)=>i===0||control.x>controls[i-1].x));
 assert.ok(await table.locator('td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).verticalAlign==='middle')));
},390));

test('desktop fishing clear action remains inline with compact filters and search',async()=>scenario(async page=>{
 await mount(page,'fishing');
 assert.equal(await page.locator('.ref-exp-filter-actions').count(),0);
 const offsets=await page.locator('[data-exp-controls]').evaluate(row=>Array.from(row.querySelectorAll('select,input,button')).filter(el=>el.getBoundingClientRect().width>0).map(el=>el.getBoundingClientRect().bottom));
 assert.ok(offsets.every(bottom=>Math.abs(bottom-offsets[0])<1));
},1440));

test('account cards label current and target levels and keep demand labels on one line',async()=>scenario(async page=>{
 await mount(page,'account-levels');
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 const first=page.locator('[data-exp-results] article').first();
 assert.equal(await first.locator('h3').textContent(),'当前等级1级');
 assert.equal(await first.locator('dl > div').first().locator('dd').textContent(),'2级');
 const labels=first.locator('dt').filter({hasText:/体力需求|烤山鸡/});
 assert.equal(await labels.count(),2);
 assert.ok(await labels.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap')));
},390));
test('sage estimator uses discrete highest-tier defaults and fixed 27 days and four weeks',async()=>scenario(async page=>{
 await mount(page,'sage');
 for(const [key,val]of Object.entries({stamina:'150',activity:'50',weeklySpend:'30000',weeklyRecharge:'648'}))assert.equal(await page.locator('select[data-exp-input="'+key+'"]').inputValue(),val);
 await page.locator('[data-exp-calculate]').click();
 assert.match(await page.locator('[data-exp-calculation]').textContent(),/397\.22/);
 assert.match(await page.locator('[data-exp-calculation] .ref-sage-final').textContent(),/397/);
 const command=await page.locator('.ref-sage-range').evaluate(node=>Array.from(node.children).map(child=>{var r=child.getBoundingClientRect();return r.bottom;}));
 assert.ok(command.every(bottom=>Math.abs(bottom-command[0])<=1));
 const color=await page.locator('.ref-sage-final td').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
 assert.deepEqual(color,['rgb(255, 107, 102)','rgb(255, 107, 102)']);
 const clearFocus=await page.locator('[data-exp-input="stamina"]').evaluate(node=>{
  const input=node.getBoundingClientRect(),scroll=node.closest('.ref-sage-controls-scroll').getBoundingClientRect();
  return input.left-scroll.left;
 });
 assert.ok(clearFocus>=5,'left focus ring must fit inside the scrolling area');
 assert.equal(await page.locator('input[data-exp-input="days"],input[data-exp-input="weeks"]').count(),0);
}));
test('sage exchange retains quantities through filters, blocks locked layers and plans discrete tasks',async()=>scenario(async page=>{
 await mount(page,'sage');
 await page.locator('[data-exp-filter="table"]').selectOption('sage-store');
 assert.doesNotMatch(await page.locator('[data-exp-section]').textContent(),/历史资料|原表分档|／圣贤令/);
 assert.match(await page.locator('[data-exp-filter="detail"] option[value="60"]').textContent(),/第二层（消耗60圣贤令开启）/);
 await page.locator('[data-sage-pick="0"]').check();
 assert.equal(await page.locator('[data-sage-count="0"]').evaluate(el=>el===document.activeElement),true);
 const demandWidth=await page.locator('.ref-sage-store th:last-child').evaluate(node=>node.getBoundingClientRect().width);
 assert.ok(demandWidth>=159 && demandWidth<=161,'demand column keeps a compact fixed width');
 await page.locator('[data-sage-count="0"]').fill('10');
 assert.ok(await page.locator('.ref-sage-store .ref-exp-table-scroll').evaluate(node=>node.scrollWidth<=node.clientWidth+1),'desktop demand controls should fit without horizontal scrolling');
 assert.match(await page.locator('[data-sage-summary]').textContent(),/6000/);
 await page.locator('[data-exp-filter="detail"]').selectOption('180');
 await page.locator('[data-sage-pick="12"]').check();
 assert.match(await page.locator('[data-sage-summary]').textContent(),/当前方案无法计算/);
 assert.match(await page.locator('[data-sage-summary]').textContent(),/第一至第二层累计购买120圣贤令/);
 assert.doesNotMatch(await page.locator('[data-sage-summary]').textContent(),/圣贤令获取方案/);
 await page.locator('[data-exp-filter="detail"]').selectOption('60');
 await page.locator('[data-sage-pick="10"]').check();
 await page.locator('[data-sage-count="10"]').fill('20');
 await page.locator('[data-sage-pick="11"]').check();
 await page.locator('[data-sage-count="11"]').fill('10');
 await page.locator('[data-sage-pick="8"]').check();
 await page.locator('[data-sage-count="8"]').fill('10');
 await page.locator('[data-sage-pick="6"]').check();
 await page.locator('[data-sage-count="6"]').fill('5');
 await page.locator('[data-sage-pick="7"]').check();
 await page.locator('[data-sage-count="7"]').fill('5');
 await page.locator('[data-sage-pick="9"]').check();
 await page.locator('[data-sage-count="9"]').fill('5');
 assert.match(await page.locator('[data-sage-summary]').textContent(),/圣贤令获取方案/);
 assert.equal(await page.getByRole('heading',{name:'本期兑换需求合计',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:'圣贤令获取方案',exact:true}).count(),1);
 assert.equal(await page.getByRole('heading',{name:'兑换需求合计',exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'按来源优先级安排',exact:true}).count(),0);
 await page.locator('[data-sage-master]').check();
 assert.equal(await page.locator('[data-sage-master]').evaluate(el=>el===document.activeElement),true);
 assert.match(await page.locator('[data-sage-summary] .ref-sage-final').textContent(),/圣贤令/);
 assert.match(await page.locator('[data-sage-summary] .ref-sage-final').textContent(),/（对比总需求还剩\d+个）/);
 await page.locator('[data-sage-count="10"]').fill('21');
 assert.match(await page.locator('[data-sage-summary]').textContent(),/不得超过兑换上限/);
 assert.doesNotMatch(await page.locator('[data-sage-summary]').textContent(),/圣贤令获取方案/);
 await page.locator('[data-sage-count="10"]').fill('20');
 await page.locator('[data-exp-filter="detail"]').selectOption('0');
 assert.equal(await page.locator('[data-sage-count="0"]').inputValue(),'10');
 await page.locator('[data-sage-pick="0"]').uncheck();
 assert.equal(await page.locator('[data-sage-count="0"]').count(),0);
 assert.match(await page.locator('[data-sage-summary]').textContent(),/第一层累计购买60圣贤令/);
 assert.equal(await page.evaluate(()=>localStorage.length),0);
}));
test('sage rules remain searchable by displayed short titles and separator-formatted amounts',async()=>scenario(async page=>{
 await mount(page,'sage');
 await page.locator('[data-exp-filter="table"]').selectOption('sage-master-rules');
 assert.deepEqual(await page.locator('[data-exp-results] th').allTextContents(),['项目','规则','是否计入']);
 const vip=page.locator('[data-exp-results] tbody tr').first();
 assert.deepEqual(await vip.locator('td').allTextContents(),['VIP等级','VIP等级','可以']);
 const title=page.locator('.ref-sage-rules .ref-exp-table-title'),scroll=page.locator('.ref-sage-rules .ref-exp-table-scroll');
 assert.equal(await scroll.locator('.ref-exp-table-title').count(),0);
 const titleBox=await title.boundingBox(),scrollBox=await scroll.boundingBox();
 assert.ok(titleBox.y+titleBox.height<=scrollBox.y,'table border starts below the title');
 await page.locator('[data-exp-query]').fill('周五充值四选一');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),1);
 assert.match(await page.locator('[data-exp-results]').textContent(),/橙色铭文特惠礼包/);
 await page.locator('[data-exp-query]').fill('30、198、648');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),1);
 assert.match(await page.locator('[data-exp-results]').textContent(),/500、800、4000/);
}));
test('fish data is readonly with merged quality names and compact attribute columns',async()=>scenario(async page=>{
 await mount(page,'fishing');
 const results=page.locator('[data-exp-results]');
 assert.equal(await page.locator('[data-exp-fish], [data-exp-reset-fish]').count(),0);
 assert.equal(await page.locator('[data-exp-filter="mode"]').inputValue(),'max');
 await page.locator('[data-exp-filter="mode"]').selectOption('base');
assert.equal(await page.locator('[data-exp-selection]').count(),0);
 await page.locator('[data-exp-query]').fill('玉蛟鎏金');
 assert.deepEqual(await results.locator('th').allTextContents(),['鱼类','属性1','属性2','属性3']);
 assert.deepEqual(await results.locator('tbody td').allTextContents(),['玉蛟鎏金（神话）','4146攻','1%技免','1%暴击']);
 assert.equal(await results.locator('.ref-fish-red').textContent(),'玉蛟鎏金（神话）');
 await page.locator('[data-exp-filter="mode"]').selectOption('max');
 assert.deepEqual(await results.locator('tbody td').allTextContents(),['玉蛟鎏金（神话）','2,2803攻','1%技免','1%暴击']);
assert.equal(await page.locator('[data-exp-selection]').count(),0);
 await page.locator('[data-exp-filter="mode"]').selectOption('base');
 await page.locator('[data-exp-query]').fill('幻鱼绿');
 assert.deepEqual(await results.locator('th').allTextContents(),['鱼类','属性1','属性2']);
 assert.equal(await results.locator('.ref-fish-green').textContent(),'幻鱼绿（普通）');
 await page.locator('[data-exp-query]').fill('技免');
 assert.ok(await results.locator('tbody tr').count()>0);
 await page.locator('[data-exp-query]').fill('');
 await page.locator('[data-exp-filter="table"]').selectOption('fishing-totals');
 const maximum=results.getByRole('region',{name:'强化满级属性',exact:true});
 assert.equal(await results.locator('table').count(),2);
 assert.equal(await maximum.locator('th').first().textContent(),'适用鱼类');
 assert.equal(await maximum.locator('.ref-fish-green').textContent(),'幻鱼绿等10种（普通）');
 assert.doesNotMatch((await maximum.locator('th').allTextContents()).join(''),/%|技能穿透|技伤减免|品质/);
 const headers=await maximum.locator('th').allTextContents();
 const row=maximum.locator('tbody tr').filter({hasText:'骨鲲鎏金'});
 assert.equal(await row.locator('td').nth(headers.indexOf('穿透')).textContent(),'1%');
 assert.equal(await row.locator('td').nth(headers.indexOf('技免')).textContent(),'1%');
 assert.equal(await page.evaluate(()=>localStorage.length),0);
}));
test('jinchan shows all filtered outcomes without comparison and merges blessing percentages',async()=>scenario(async page=>{
 await mount(page,'jinchan');
 await page.locator('[data-exp-filter="place"]').selectOption('矿坑');
 await page.locator('[data-exp-filter="event"]').selectOption('坑洞出现');
 assert.equal(await page.locator('[data-exp-choice],[data-exp-selection]').count(),0);
 assert.deepEqual(await page.locator('[data-exp-results] thead th').allTextContents(),['地点','事件','处理选项','结果','加成／掉落','贡献']);
 assert.equal(await page.locator('[data-exp-results] caption').count(),0);
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),6);
 assert.ok(await page.locator('[data-exp-results] tbody td:last-child').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).whiteSpace==='nowrap')));
 assert.doesNotMatch(await page.locator('[data-exp-section]').textContent(),/正式服|比较/);
 await page.locator('[data-exp-filter="event"]').selectOption('发现矿脉');
 assert.doesNotMatch(await page.locator('[data-exp-results]').textContent(),/坑洞出现/);
 await page.locator('[data-exp-filter="table"]').selectOption('jinchan-blessings');
 assert.equal(await page.locator('[data-exp-filter="event"]').isDisabled(),true);
 assert.equal(await page.locator('[data-exp-filter="event"]').isVisible(),false);
 assert.deepEqual(await page.locator('[data-exp-results] thead th').allTextContents(),['地点','属性加成','产出祝福','祝福加成']);
 assert.match(await page.locator('[data-exp-results]').textContent(),/技伤减免\+10%/);
 assert.doesNotMatch(await page.locator('[data-exp-results]').textContent(),/10\.0%/);
 await page.locator('[data-exp-query]').fill('10%');
 assert.equal(await page.locator('[data-exp-results] tbody tr').count(),1);
 await page.locator('[data-exp-query]').fill('');
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 assert.match(await page.locator('[data-exp-results]').textContent(),/技伤减免\+10%/);
 assert.equal(await page.locator('[data-exp-results] dt').filter({hasText:/^比例$/}).count(),0);
 await page.locator('[data-exp-filter="table"]').selectOption('jinchan-events');
 assert.equal(await page.locator('[data-exp-choice],[data-exp-clear-comparison]').count(),0);
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

test('awakening explicit ranges drive details, pack materials and reset to all stages',async()=>scenario(async page=>{
 await mount(page,'disciple-awakening');
 assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'table');
 assert.equal(await page.locator('[data-exp-filter="view"] option[value="auto"]').count(),0);
 assert.equal(await page.locator('[data-exp-input="from"]').inputValue(),'');
 assert.equal(await page.locator('.ref-awakening-steps tbody tr').count(),39);
 await page.locator('[data-exp-input="from"]').selectOption('1星');
 await page.locator('[data-exp-input="to"]').selectOption('2星');
 await page.locator('[data-exp-calculate]').click();
 assert.equal(await page.locator('.ref-awakening-steps tbody tr').count(),2);
 assert.equal(await page.locator('.ref-awakening-materials th').count(),6);
 assert.doesNotMatch(await page.locator('.ref-awakening-materials').textContent(),/—/);
 assert.ok(await page.locator('.ref-awakening-steps td:nth-child(4)').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).textAlign==='justify')));
 assert.ok(await page.locator('.ref-awakening-materials td').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).borderLeftWidth==='1px'&&getComputedStyle(cell).borderTopWidth==='1px')));
 await page.locator('[data-exp-input="from"]').selectOption('');
 assert.equal(await page.locator('.ref-awakening-steps tbody tr').count(),39);
 await page.locator('[data-exp-filter="element"]').selectOption('');
 assert.equal(await page.locator('.ref-awakening-steps tbody tr').count(),195);
 await page.locator('[data-exp-input="from"]').selectOption('0星');
 await page.locator('[data-exp-input="to"]').selectOption('1星');
 await page.locator('[data-exp-calculate]').click();
 assert.equal(await page.locator('.ref-awakening-steps tbody tr').count(),5);
 assert.equal(await page.locator('.ref-awakening-materials').count(),5);
 assert.doesNotMatch(await page.locator('[data-exp-calculation]').textContent(),/不完整|缺少数量/);
 const align=await page.locator('.ref-awakening-range').evaluate(row=>Array.from(row.querySelectorAll('select,button')).map(el=>el.getBoundingClientRect().bottom));
 assert.ok(align.every(bottom=>Math.abs(bottom-align[0])<1));
 const rangeWidth=await page.locator('.ref-awakening-range').evaluate(row=>({right:row.getBoundingClientRect().right,buttonRight:row.querySelector('button').getBoundingClientRect().right}));
 assert.ok(Math.abs(rangeWidth.right-rangeWidth.buttonRight)<1);
 await page.locator('[data-exp-filter="table"]').selectOption('awakening-source-totals');
 assert.equal(await page.locator('[data-exp-filter="table"] option:checked').textContent(),'0至9星合计');
 const source=page.locator('.ref-awakening-totals');
 assert.equal(await source.locator('th').count(),6);
 const actual=await source.locator('tbody td').allTextContents();
 const expected=await page.evaluate(()=>REFERENCE_EXPANSION_DATA.tables.find(t=>t.id==='awakening-source-totals').rows.slice(0,2).flat().map(String));
 assert.deepEqual(actual.slice(0,6),expected);
 assert.equal(await page.locator('.ref-awakening-audit').count(),0);
 // Active summaries must derive from steps even if an old summary is supplied.
 await page.evaluate(()=>{
  REFERENCE_EXPANSION_DATA.tables.find(t=>t.id==='awakening-source-totals').rows[0][2]=999999;
  document.querySelector('[data-exp-filter="element"]').dispatchEvent(new Event('change',{bubbles:true}));
 });
 assert.doesNotMatch(await source.textContent(),/99,9999|999999/);
},1280));
test('fishing defaults to table and keeps explicit view across resize without losing search',async()=>scenario(async page=>{
 await mount(page,'fishing');
 assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'table');
 assert.equal(await page.locator('[data-exp-filter="view"] option[value="auto"]').count(),0);
 await page.locator('[data-exp-query]').fill('丑鱼 金');
 assert.equal(await page.locator('[data-exp-results] table').count(),1);
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 assert.equal(await page.locator('[data-exp-results] .ref-exp-cards').count(),1);
 await page.setViewportSize({width:1280,height:900});
 assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'cards');
 await page.locator('[data-exp-filter="view"]').selectOption('table');
 assert.equal(await page.locator('[data-exp-query]').inputValue(),'丑鱼 金');
 assert.match(await page.locator('[data-exp-results]').textContent(),/3576/);
},390));

test('first releases, costumes and fishing have explicit table defaults and content-specific hints',async()=>scenario(async page=>{
 for(const [id,phrase]of [['first-releases','首发日期'],['costumes','戎装名'],['fishing','鱼名']]){
  await mount(page,id);
  assert.equal(await page.locator('[data-exp-filter="view"]').inputValue(),'table');
  assert.equal(await page.locator('[data-exp-filter="view"] option[value="auto"]').count(),0);
  assert.ok((await page.locator('[data-exp-query]').getAttribute('placeholder')).includes(phrase));
 }
 await page.locator('[data-exp-filter="table"]').selectOption('fishing-totals');
 assert.match(await page.locator('[data-exp-query]').getAttribute('placeholder'),/合计数值/);
 await mount(page,'first-releases');
 assert.doesNotMatch(await page.locator('[data-exp-query]').getAttribute('placeholder'),/属性/);
 await mount(page,'sage');
 await page.locator('[data-exp-filter="table"]').selectOption('sage-store');
 assert.match(await page.locator('[data-exp-query]').getAttribute('placeholder'),/兑换道具/);
 await mount(page,'jinchan');
 await page.locator('[data-exp-filter="table"]').selectOption('jinchan-blessings');
 assert.match(await page.locator('[data-exp-query]').getAttribute('placeholder'),/祝福/);
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
 assert.ok(rows.some(row=>row.includes('圣贤令（取整前）')&&row.includes('397.22')));
 assert.ok(rows.some(row=>row.includes('圣贤令（最终）')&&row.includes('397')));
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 await page.locator('[data-exp-calculate]').click();
 const first=output.locator('.ref-exp-cards > article').first();
 assert.equal(await first.locator('h3').textContent(),'体力任务经验');
 assert.equal(await first.locator('dl > div').count(),1);
 assert.equal(await first.locator('dt').textContent(),'数量');
},390));
test('mobile fish cards keep merged quality names and full-level attributes without collection UI',async()=>scenario(async page=>{
 await mount(page,'fishing');
 await page.locator('[data-exp-query]').fill('丑鱼 金');
 await page.locator('[data-exp-filter="view"]').selectOption('cards');
 const card=page.locator('[data-exp-results] article').first();
 assert.equal(await card.locator('h3').textContent(),'丑鱼金（稀有）');
 assert.equal(await card.locator('[data-exp-fish]').count(),0);
 assert.deepEqual(await card.locator('dt').allTextContents(),['属性1','属性2']);
 assert.deepEqual(await card.locator('dd').allTextContents(),['3576血','1%穿透']);
assert.equal(await page.locator('[data-exp-selection]').count(),0);
},390));
for(const width of [320,390,820,1280])test(width+'px expansion pages keep tables locally scrollable and controls within the viewport',async()=>scenario(async page=>{
 for(const id of ['first-releases','costumes','fishing','account-levels','disciple-awakening','jinchan','sage']){
  await mount(page,id);
  assert.equal(await page.locator('[data-exp-section="'+id+'"]').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
},width));
