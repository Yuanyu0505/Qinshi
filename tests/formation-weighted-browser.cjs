// Browser acceptance requires PLAYWRIGHT_MODULE and explicit user authorization.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountItem}=require('./browser-test-helpers.cjs');
const golden=require('./fixtures/formation-weighted-golden-20261125.json');
let server,browser,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
async function open(width){const p=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});await openApp(p,url);await p.evaluate(()=>document.querySelector('.tab[data-partition="formations"]').click());await p.locator('#formation-selector [data-formation-id]').first().click();return p;}
for(const width of [320,390,768,820,1366,1440,1920])test(width+'px weighted recommendation, readonly reference and source isolation',async()=>{
 const p=await open(width);
 try{
  assert.equal(await p.locator('[data-scope="calculator"]').count(),0);
  const before=await getAccountItem(p,'qinshi_formation_progress_v1');
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  const attack=p.locator('[data-scope="progress"][data-member-field="attack"]').first();
  await attack.fill('12345');await attack.press('Tab');
  await p.locator('[data-formation-view="reference"]').click();
  await p.locator('[data-max-formation]').selectOption({label:'地泽二十四'});
  await p.locator('[data-limit-output] .formation-benefits').first().waitFor();
  assert.equal(await p.locator('[data-limit-output] [data-tie-page] > details').count(),2);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),before);
  await p.locator('[data-formation-view="main"]').click();
  assert.equal(await attack.inputValue(),'12345');
  await p.locator('[data-action="save-progress"]').first().click();
  assert.equal(await p.locator('[data-action="save-progress"]').count(),0);
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  assert.match(await p.locator('[data-personal-output]').innerText(),/缺少助阵位/);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
 }finally{await p.close();}
});
test('false writes retain saved recommendation and editor; input focus survives generation',async()=>{
 const p=await open(1440);
 try{
  await p.locator('[data-personal-settings] button[type="submit"]').click();await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  const saved=await getAccountItem(p,'qinshi_formation_progress_v1');
  const result=await p.locator('[data-personal-output]').innerText();
  await p.locator('[data-action="edit-progress"]').click();await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  const input=p.locator('[data-member-field="attack"]').first();await input.fill('9876');await input.press('Tab');
  await p.evaluate(()=>{window.QinshiAccounts.setItem=()=>false;});
  await p.locator('[data-action="save-progress"]').first().click();
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),saved);
  assert.equal(await input.inputValue(),'9876');assert.equal(await p.locator('[data-personal-output]').innerText(),result);
  assert.ok(await p.locator('.formation-personal [role="alert"]').count());
 }finally{await p.close();}
});
test('unsaved progress blocks formation switch until confirmed and leaves archive intact',async()=>{
 const p=await open(1440);
 try{
  const original=await p.locator('.formation-official h2').innerText();
  const before=await getAccountItem(p,'qinshi_formation_progress_v1');
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  const other=p.locator('#formation-selector [data-formation-id]').nth(1);
  p.once('dialog',dialog=>dialog.dismiss());
  await other.click();
  assert.equal(await p.locator('.formation-official h2').innerText(),original);
  assert.ok(await p.locator('[data-action="save-progress"]').count());
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),before);
  p.once('dialog',dialog=>dialog.accept());
  await other.click();
  assert.notEqual(await p.locator('.formation-official h2').innerText(),original);
  assert.equal(await p.locator('[data-action="save-progress"]').count(),0);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),before);
 }finally{await p.close();}
});
test('unsaved editor draft does not enter free calculation before successful save',async()=>{
 const p=await open(1440);
 try{
  const submit=p.locator('[data-personal-settings] button[type="submit"]');
  await submit.click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  const savedOutput=await p.locator('[data-personal-output]').innerText();
  const before=await getAccountItem(p,'qinshi_formation_progress_v1');
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  await p.locator('[data-scope="progress"][data-role="owned"]').nth(1).check();
  await submit.click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  assert.equal(await p.locator('[data-personal-output]').innerText(),savedOutput);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),before);
  await p.locator('[data-action="save-progress"]').first().click();
  assert.equal(await p.locator('[data-action="save-progress"]').count(),0);
  await submit.click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  assert.notEqual(await p.locator('[data-personal-output]').innerText(),savedOutput);
 }finally{await p.close();}
});
test('limit reference shows original comparison separately and exposes both tied arrangements',async()=>{
 const p=await open(1440);
 try{
  await p.locator('[data-formation-view="reference"]').click();
  await p.locator('[data-max-formation]').selectOption({label:'地泽二十四'});
  const output=p.locator('[data-limit-output]');
  await output.locator('.formation-benefits').first().waitFor();
  assert.doesNotMatch(await output.innerText(),/推荐模式|综合评分|最佳助阵排列|1级参考值弟子/);
  const comparison=output.locator('details').filter({has:p.locator('summary:text("原资料方案对照")')});
  assert.equal(await comparison.count(),1);
  assert.doesNotMatch(await comparison.innerText(),/原资料评分|当前权重下原资料已最优/);
  assert.equal(await p.locator('#formation-max-reference [data-limit-cancel], #formation-max-reference [data-cancel-job]').count(),0);
  assert.equal(await p.locator('[data-limit-settings], #formation-max-reference .formation-parameter-grid').count(),0);
  assert.equal(await output.locator('[data-tie-page] > details').count(),2);
  const expected=golden.results.find(item=>item.name==='地泽二十四');
  for(const index of [0,1]){
   const tie=output.locator('[data-tie-page] > details').nth(index);
   await tie.locator('summary').click();
   assert.equal(await tie.locator('.formation-benefits').count(),1);
   assert.match(await tie.locator('summary').innerText(),new RegExp('其他方案 '+(index+1)));
   assert.ok((await tie.locator('summary').innerText()).includes(expected.ties[index].names.join('、')));
   const mainLine=(await tie.locator('p').allTextContents()).find(text=>text.includes('可选主将：'))||'';
   const actualMains=mainLine.split('可选主将：')[1]?.trim().split('、').sort();
   assert.deepEqual(actualMains,expected.ties[index].main.slice().sort(),mainLine);
  }
 }finally{await p.close();}
});
test('limit comparison deltas match independent golden vectors',async()=>{
 const p=await open(1440);
 try{
  await p.locator('[data-formation-view="reference"]').click();
  await p.locator('[data-max-formation]').selectOption({label:'旗开得胜'});
  const output=p.locator('[data-limit-output]');
  await output.locator('.formation-benefits').first().waitFor();
  const expected=golden.results.find(item=>item.name==='旗开得胜');
  const rows=await output.locator('.formation-comparison > span').allTextContents();
  assert.equal(rows.length,6);
  for(let index=0;index<rows.length;index++){
   const match=rows[index].match(/原\s+([\d,]+)\s+→\s+([\d,]+)\s*（([+\-\d,]+)）/);
   assert.ok(match,rows[index]);
   const actual=match.slice(1).map(value=>Number(value.replaceAll(',','')));
   assert.deepEqual(actual,[expected.original.vector[index],expected.ties[0].vector[index],expected.ties[0].vector[index]-expected.original.vector[index]]);
   const delta=output.locator('.formation-delta').nth(index);
   assert.equal(await delta.evaluate(el=>el.classList.contains('formation-delta-positive')),actual[2]>0);
   assert.equal(await delta.evaluate(el=>el.classList.contains('formation-delta-negative')),actual[2]<0);
  }
  assert.doesNotMatch(await output.innerText(),/原资料评分/);
 }finally{await p.close();}
});

test('limit table recommendations follow shared parameters and never write progress',async()=>{
 const p=await open(1440);
 try{
  const saved=await getAccountItem(p,'qinshi_formation_progress_v1');
  await p.locator('[data-formation-view="reference"]').click();
  await p.locator('[data-max-formation]').selectOption({label:'地泽二十四'});
  await p.locator('[data-limit-output] .formation-benefits').first().waitFor();
  assert.equal(await p.locator('#formation-max-reference .formation-settings').count(),0);
  await p.locator('[data-formation-view="main"]').click();
  const form=p.locator('[data-personal-settings] form');
  await form.locator('summary').click();
  for(let i=0;i<6;i++)await form.locator('[name="weight'+i+'"]').fill(i===1?'100':'0');
  await form.locator('[type="submit"]').click();
  await p.locator('[data-formation-view="reference"]').click();
  await p.locator('[data-limit-output] .formation-benefits').first().waitFor();
  await p.waitForFunction(()=>!document.querySelector('[data-max-results]').textContent.includes('计算中…'));
  const actual=await p.locator('.formation-max-table tbody tr').evaluateAll(rows=>rows.map(row=>Array.from(row.cells).slice(6).map(cell=>cell.textContent)));
  const expected=await p.evaluate(()=>{
   const f=window.FORMATIONS_DATA.items.find(f=>f.name==='地泽二十四');
   const ref=window.FORMATION_MAX_REFERENCE_DATA.formations.find(row=>row.name==='地泽二十四');
   const adapted=window.FORMATION_LIMIT_ADAPTER.buildLimitProgress(f,ref);
   const result=window.FORMATIONS.recommendFormation(f,adapted.progress,{mode:'custom',weights:['0','100','0','0','0','0'],scales:['1','8','6','1.5','2','1']});
   return window.FORMATION_LIMIT_ADAPTER.recommendationRows(ref,result).map(row=>[row.position==null?'—':String(row.position),row.trainAttribute||'—',row.gainAttribute||'—']);
  });
  assert.deepEqual(actual,expected);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),saved);
  assert.equal(await p.locator('[data-personal-settings] [name="weight1"]').inputValue(),'100');
 }finally{await p.close();}
});
test('custom settings apply, cancel and restore without accepting invalid drafts',async()=>{
 const p=await open(1440);
 try{
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  const form=p.locator('[data-personal-settings] form');
  const output=p.locator('[data-personal-output]');
  await output.locator('.formation-benefits').first().waitFor();
  await form.locator('details summary').click();
  const weight=form.locator('input[name="weight0"]');
  await weight.fill('13');
  await form.locator('[data-cancel-parameters]').click();
  assert.equal(await weight.inputValue(),'12');
  assert.equal(await form.locator('select').count(),0);
  await weight.fill('');
  const before=await output.innerText();
  await form.locator('button[type="submit"]').click();
  assert.ok(await form.locator('[data-settings-error]').isVisible());
  assert.equal(await output.innerText(),before);
  await weight.fill('13');
  await form.locator('button[type="submit"]').click();
  await output.locator('.formation-benefits').first().waitFor();
  assert.equal(await p.locator('[data-personal-settings] input[name="weight0"]').inputValue(),'13');
  const applied=p.locator('[data-personal-settings] form');
  await applied.locator('details summary').click();
  await applied.locator('[data-default-parameters]').click();
  assert.equal(await applied.locator('input[name="weight0"]').inputValue(),'12');
  await applied.locator('button[type="submit"]').click();
  await output.locator('.formation-benefits').first().waitFor();
  assert.equal(await p.locator('[data-personal-settings] input[name="weight0"]').inputValue(),'12');
 }finally{await p.close();}
});
test('thrown account writes preserve archive, editor draft and prior result',async()=>{
 const p=await open(1440);
 try{
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  const before=await getAccountItem(p,'qinshi_formation_progress_v1');
  const result=await p.locator('[data-personal-output]').innerText();
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  const input=p.locator('[data-scope="progress"][data-member-field="attack"]').first();
  await input.fill('9876');await input.press('Tab');
  await p.evaluate(()=>{window.QinshiAccounts.setItem=()=>{throw new Error('test write rejection');};});
  await p.locator('[data-action="save-progress"]').first().click();
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),before);
  assert.equal(await input.inputValue(),'9876');
  assert.equal(await p.locator('[data-personal-output]').innerText(),result);
  assert.ok(await p.locator('.formation-personal [role="alert"]').count());
 }finally{await p.close();}
});
test('switching test accounts isolates saved progress and discards the prior account draft',async()=>{
 const p=await open(1440);
 try{
  const accountA=await p.evaluate(()=>window.QinshiAccounts.currentAccount().id);
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  await p.locator('[data-action="save-progress"]').first().click();
  const savedA=await getAccountItem(p,'qinshi_formation_progress_v1');
  assert.ok(savedA);
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  await p.locator('[data-personal-output] .formation-benefits').first().waitFor();
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').nth(1).check();
  const accountB=await p.evaluate(()=>window.QinshiAccounts.createAccount({name:'隔离测试账号',server:'测试服'}).id);
  await p.evaluate(id=>window.QinshiAccounts.switchAccount(id),accountB);
  await p.waitForFunction(id=>window.QinshiAccounts?.currentAccount()?.id===id,accountB);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),null);
  await p.locator('.tab[data-partition="formations"]').click();
  await p.locator('#formation-selector [data-formation-id]').first().click();
  assert.equal(await p.locator('[data-action="save-progress"]').count(),0);
  assert.equal(await p.locator('[data-personal-output] .formation-benefits').count(),0);
  await p.evaluate(id=>window.QinshiAccounts.switchAccount(id),accountA);
  await p.waitForFunction(id=>window.QinshiAccounts?.currentAccount()?.id===id,accountA);
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),savedA);
  await p.locator('.tab[data-partition="formations"]').click();
  await p.locator('#formation-selector [data-formation-id]').first().click();
  assert.equal(await p.locator('[data-action="save-progress"]').count(),0);
  assert.equal(await p.locator('[data-personal-output] .formation-benefits').count(),0);
 }finally{await p.close();}
});
test('second tab cannot overwrite formation progress while the first tab owns editing',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 const p=await context.newPage();
 let other;
 try{
  await openApp(p,url);
  await p.locator('.tab[data-partition="formations"]').click();
  await p.locator('#formation-selector [data-formation-id]').first().click();
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  await p.locator('[data-action="save-progress"]').first().click();
  const saved=await getAccountItem(p,'qinshi_formation_progress_v1');
  other=await context.newPage();
  await other.goto(url,{waitUntil:'networkidle'});
  await other.waitForFunction(()=>Boolean(window.QinshiAccounts?.currentAccount()));
  assert.equal(await other.evaluate(()=>window.QinshiAccounts.isReadOnly()),true);
  await other.locator('.tab[data-partition="formations"]').click();
  await other.locator('#formation-selector [data-formation-id]').first().click();
  await other.locator('[data-action="edit-progress"]').click();
  await other.locator('[data-scope="progress"][data-role="owned"]').nth(1).check();
  await other.locator('[data-action="save-progress"]').first().click();
  assert.equal(await getAccountItem(p,'qinshi_formation_progress_v1'),saved);
  assert.ok(await other.locator('.formation-personal [role="alert"]').count());
 }finally{await context.close();}
});
test('stale asynchronous recommendation cannot overwrite a newly selected formation',async()=>{
 const p=await open(1440);
 try{
  await p.evaluate(()=>{
   const original=window.FORMATION_RECOMMENDATION_UI.run;
   window.__pendingFormationRecommendation=[];
   window.FORMATION_RECOMMENDATION_UI.run=function(scope){
    if(scope==='personal')return new Promise(resolve=>window.__pendingFormationRecommendation.push(resolve));
    return original.apply(this,arguments);
   };
  });
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  assert.equal(await p.evaluate(()=>window.__pendingFormationRecommendation.length),1);
  await p.locator('#formation-selector [data-formation-id]').nth(1).click();
  await p.evaluate(async()=>{
   window.__pendingFormationRecommendation[0]({exactScore:'987654321'});
   await new Promise(resolve=>setTimeout(resolve,0));
  });
  assert.doesNotMatch(await p.locator('[data-personal-output]').innerText(),/987654321/);
  assert.equal(await p.locator('[data-personal-output] .formation-benefits').count(),0);
 }finally{await p.close();}
});
test('stale asynchronous recommendation cannot overwrite changed scoring parameters',async()=>{
 const p=await open(1440);
 try{
  await p.evaluate(()=>{
   window.__pendingFormationRecommendation=[];
   window.FORMATION_RECOMMENDATION_UI.run=function(scope){
    if(scope==='personal')return new Promise(resolve=>window.__pendingFormationRecommendation.push(resolve));
    throw new Error('unexpected scope '+scope);
   };
  });
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  assert.equal(await p.evaluate(()=>window.__pendingFormationRecommendation.length),1);
  await p.locator('[data-personal-settings] input[name="weight0"]').fill('13');
  await p.locator('[data-personal-settings] button[type="submit"]').click();
  assert.equal(await p.evaluate(()=>window.__pendingFormationRecommendation.length),2);
  await p.evaluate(async()=>{
   window.__pendingFormationRecommendation[0]({exactScore:'987654321'});
   await new Promise(resolve=>setTimeout(resolve,0));
  });
  assert.doesNotMatch(await p.locator('[data-personal-output]').innerText(),/987654321/);
  assert.equal(await p.locator('[data-personal-settings] input[name="weight0"]').inputValue(),'13');
 }finally{await p.close();}
});
test('progress editor preserves focused input through Chromium IME composition',async()=>{
 const p=await open(390);
 try{
  await p.locator('[data-action="edit-progress"]').click();
  await p.locator('[data-scope="progress"][data-role="owned"]').first().check();
  const input=p.locator('[data-scope="progress"][data-member-field="attack"]').first();
  await input.fill('');await input.focus();
  await p.evaluate(()=>{window.__focusedFormationInput=document.activeElement;});
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Input.imeSetComposition',{text:'123',selectionStart:3,selectionEnd:3});
  await cdp.send('Input.insertText',{text:'123'});
  await input.press('4');
  assert.equal(await input.inputValue(),'1234');
  assert.equal(await p.evaluate(()=>document.activeElement===window.__focusedFormationInput),true);
 }finally{await p.close();}
});
