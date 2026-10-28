const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountItem, setAccountItem } = require('./browser-test-helpers.cjs');
const KEY = 'qinshi_inscription_crafting_v1';
let browser, server, url;
const scriptErrors=[];
before(async () => {
  server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
afterEach(()=>{assert.deepEqual(scriptErrors.splice(0),[],'No uncaught browser script errors');});
async function pageFor(mode = 'paths', width = 1024, address = url) {
  const page = await browser.newPage({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
  page.on('pageerror',error=>scriptErrors.push(error.message));
  await openApp(page, address, { waitUntil: 'load' });
  await page.locator('.tab[data-partition="inscription"]').evaluate(el => el.click());
  await page.locator('[data-mode="crafting-' + mode + '"]').click();
  return page;
}
function section(page, mode = 'paths') { return page.locator('#inscription-crafting-' + mode); }
async function goal(page, { mode = 'paths', dun = '地遁', quality = 'o2', attrs = ['技能穿透', '技能穿透', '技能穿透'], prefix = '天同' } = {}) {
  const s = section(page, mode);
  await s.locator('[data-craft-field="quality"]').selectOption(quality);
  for (let i = 0; i < attrs.length; i++) await s.locator('[data-craft-field="attr"]').nth(i).selectOption(attrs[i]);
  await s.locator('[data-craft-field="dun"]').selectOption(dun);
  await s.locator('[data-craft-field="prefix"]').selectOption(prefix);
  return s;
}
async function saveGoal(s, name = '') {
  await s.locator('[data-craft-field="name"]').fill(name);
  await s.locator('[data-craft-action="save-goal"]').click();
}
async function addMaterial(s, quality, origin, terms, quantity = 1, actual = false) {
  const editor = s.locator('[data-craft-material-editor]');
  await editor.locator('[data-material-field="quality"]').selectOption(quality);
  await editor.locator('[data-material-field="origin"]').selectOption(origin);
  for (let i = 0; i < terms.length; i++) await editor.locator('[data-material-field="term"]').nth(i).selectOption(terms[i]);
  await editor.locator('[data-material-field="quantity"]').fill(String(quantity));
  await editor.locator('[data-craft-action="' + (actual ? 'set-actual' : 'add-virtual') + '"]').click();
}

test('目标全槽校验、九遁原因与弟子实际位置，不悄悄替换目标', async () => {
  const page = await pageFor(); try {
    const s = section(page);
    assert.equal(await s.locator('[data-craft-field="dun"] option').count(), 10);
    await s.locator('[data-craft-action="generate"]').click();
    assert.match(await s.locator('[data-craft-status]').innerText(), /选满|填写/);
    await goal(page, { dun: '人遁' });
    await s.locator('[data-craft-action="generate"]').click();
    assert.match(await s.locator('[data-craft-status]').innerText(), /减少重复|最多|两|2|三/);
    assert.deepEqual(await s.locator('[data-craft-field="attr"]').evaluateAll(els => els.map(x => x.value)), ['技能穿透','技能穿透','技能穿透']);
    await s.locator('[data-craft-field="disciple-search"]').fill('墨眉天明');
    await s.locator('[data-craft-field="disciple"]').selectOption({ label: '墨眉天明 · 普通橙色' });
    assert.equal(await s.locator('[data-craft-field="slot"] option').count(), 2);
    assert.match(await s.locator('[data-craft-field="slot"]').innerText(), /天府 · 龙遁/);
  } finally { await page.close(); }
});

test('地三穿显示完整分组、递归准备、真实连接与全部结果；人双穿P伤没有伪洗M', async () => {
  const page = await pageFor(); try {
    const s = await goal(page);
    const generateMs=await s.locator('[data-craft-action="generate"]').evaluate(button=>{const start=performance.now();button.click();return performance.now()-start;});
    process.stdout.write('earth goal UI generation '+generateMs.toFixed(2)+' ms\n');
    assert.match(await s.locator('[data-craft-results]').innerText(), /技能穿透6%.*技能穿透4%.*技能穿透5%/s);
    assert.ok(await s.locator('[data-route-group]').count() > 1);
    await s.locator('[data-route-group]').first().locator('summary').first().click();
    await s.locator('.craft-flow .craft-edge').first().waitFor({state:'attached'});
    assert.ok(await s.locator('.craft-flow .craft-edge').count() > 0);
    await s.locator('[data-craft-action="expand-material"]').first().click();
    assert.ok(await s.locator('[data-expanded-material]').count() > 0);
    assert.match(await s.locator('[data-craft-results]').innerText(), /洗练.*概率未知|随机.*未知/s);
    assert.ok(await s.locator('[data-additional-branch]').count() > 0);
    assert.equal(await s.locator('[data-reuse-branch]').count(), 3);
    await goal(page, { dun: '人遁', attrs: ['技能穿透','技能穿透','PVP伤害'] });
    await s.locator('[data-craft-action="generate"]').click();
    await s.locator('[data-route-group]').first().locator('summary').first().click();
    await s.locator('.craft-flow .craft-edge').first().waitFor({state:'attached'});
    const illegal = await s.locator('[data-material-origin="wash"]').evaluateAll(els => els.some(el => el.textContent.includes('中档')));
    assert.equal(illegal, false);
    assert.match(await s.locator('[data-craft-results]').innerText(), /等概率模型/);
  } finally { await page.close(); }
});

test('品质数值表和手工来源控制含未知蓝速、紫洗无M、紫合无L', async () => {
  const page = await pageFor('simulator'); try {
    const s = await goal(page, { mode: 'simulator', dun:'鬼遁', quality:'p1', attrs:['速','防'] });
    assert.match(await s.locator('[data-craft-matrix]').innerText(), /蓝二.*紫一.*紫二.*橙一.*橙二/s);
    await saveGoal(s);
    const editor = s.locator('[data-craft-material-editor]');
    const options = await editor.locator('[data-material-field="term"]').first().locator('option').allTextContents();
    assert.equal(options.filter(x => x.startsWith('速')).length, 1);
    assert.match(options.find(x => x.startsWith('速')), /1.*档位不可辨识/);
    await editor.locator('[data-material-field="quality"]').selectOption('p2');
    assert.equal((await editor.locator('[data-material-field="term"]').first().innerText()).includes('中档'), false);
    await editor.locator('[data-material-field="origin"]').selectOption('crafted');
    assert.equal((await editor.locator('[data-material-field="term"]').first().innerText()).includes('低档'), false);
  } finally { await page.close(); }
});

test('共享实际总数、独立虚拟副本、pending恢复与retry/next只入账一次', async () => {
  const page = await pageFor('simulator'); try {
    const s = await goal(page, { mode:'simulator', dun:'鬼遁', quality:'p1', attrs:['速','防'] });
    await saveGoal(s, '鬼速防');
    await addMaterial(s,'b2','wash',['速:?'],2,true);
    await addMaterial(s,'b2','wash',['防:H'],1,true);
    const actualBefore = JSON.parse(await getAccountItem(page, KEY)).actual;
    page.on('dialog', dialog => dialog.accept());
    await s.locator('[data-craft-action="copy-actual"]').click();
    await s.locator('[data-recipe-input]').nth(0).selectOption({ index: 1 });
    await s.locator('[data-recipe-input]').nth(1).selectOption({ index: 2 });
    await s.locator('[data-craft-preview] summary').click();
    assert.match(await s.locator('[data-craft-preview]').innerText(), /50/);
    await s.locator('[data-craft-action="roll"]').click();
    const pending = JSON.parse(await getAccountItem(page,KEY)); const id = pending.goals[0].id;
    assert.equal(pending.workspaces[id].inventory.reduce((sum,x) => sum+x.quantity,0),3);
    await s.locator('[data-craft-action="retry"]').click();
    assert.equal(JSON.parse(await getAccountItem(page,KEY)).workspaces[id].pending.id,pending.workspaces[id].pending.id);
    await page.reload(); await page.locator('.tab[data-partition="inscription"]').evaluate(el => el.click());
    await page.locator('[data-mode="crafting-simulator"]').click();
    assert.ok(await s.locator('[data-craft-pending]').isVisible());
    await s.locator('[data-craft-action="next"]').click();
    const result = JSON.parse(await getAccountItem(page,KEY));
    assert.equal(result.workspaces[id].stage,'p1');
    assert.equal(result.workspaces[id].pending,null);
    assert.equal(result.workspaces[id].inventory.reduce((sum,x) => sum+x.quantity,0),2);
    assert.deepEqual(result.actual,actualBefore);
    assert.equal(await s.locator('[data-craft-action="next"]').count(),0);
  } finally { await page.close(); }
});

test('存档损坏与false写入显式报错并保留原始数据', async () => {
  const page = await pageFor(); try {
    await setAccountItem(page,KEY,'{broken'); await page.reload();
    await page.locator('.tab[data-partition="inscription"]').evaluate(el => el.click());
    await page.locator('[data-mode="crafting-paths"]').click();
    assert.match(await section(page).locator('[data-craft-status]').innerText(), /损坏|读取|JSON|存档/);
    assert.equal(await getAccountItem(page,KEY),'{broken');
    await setAccountItem(page,KEY,JSON.stringify({schemaVersion:1,idSequence:0,actual:[],goals:[],workspaces:{},draft:{}})); await page.reload();
    await page.locator('.tab[data-partition="inscription"]').evaluate(el => el.click());
    await page.locator('[data-mode="crafting-paths"]').click();
    const s=await goal(page);
    const beforeWrite=await getAccountItem(page,KEY);
    await page.evaluate(() => { window.craftingWriteAttempts=0;window.QinshiAccounts.setItem = () => { window.craftingWriteAttempts++;return false; }; });
    await saveGoal(s);
    assert.match(await s.locator('[data-craft-status]').innerText(), /保存|写入/);
    assert.equal(await s.locator('[data-craft-field="saved-goal"] option').count(),1);
    assert.ok(await page.evaluate(()=>window.craftingWriteAttempts>0));assert.equal(await getAccountItem(page,KEY),beforeWrite);
  } finally { await page.close(); }
});

for(const width of [360,390,768,1024,1440]) test(width+' 响应式表单、流程和本地静态页面可用',async()=>{
  const page=await pageFor('paths',width);try{
    const s=await goal(page); await s.locator('[data-craft-action="generate"]').click();
    await s.locator('[data-route-group]').first().locator('summary').first().click();
    await s.locator('.craft-flow').first().waitFor({state:'attached'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.equal(await s.locator('input,select,button').evaluateAll(els=>els.filter(el=>el.getClientRects().length).some(el=>{const r=el.getBoundingClientRect();return r.width<1||r.left<0||r.right>innerWidth+1;})),false);
    fs.mkdirSync(path.join(__dirname,'../test-results/inscription-crafting'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'../test-results/inscription-crafting/paths-'+width+'.png')});
    await s.locator('.craft-flow').first().screenshot({path:path.join(__dirname,'../test-results/inscription-crafting/flow-'+width+'.png')});
  }finally{await page.close();}
});

test('file协议加载共享规则与两种新模式并可生成路径',async()=>{
  const page=await pageFor('paths',1024,'file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/'));try{
    const s=await goal(page);await s.locator('[data-craft-action="generate"]').click();
    assert.ok(await s.locator('[data-route-group]').count()>0);
  }finally{await page.close();}
});

test('实际节点空值不清零且跨目标总数共享；重复提交后不足不能继续产出',async()=>{
  const page=await pageFor('simulator');try{
    const s=await goal(page,{mode:'simulator',dun:'鬼遁',quality:'p1',attrs:['速','防']});await saveGoal(s,'目标一');
    await addMaterial(s,'b2','wash',['速:?'],1,true);await addMaterial(s,'b2','wash',['防:H'],1,true);
    const before=JSON.parse(await getAccountItem(page,KEY)).actual;
    const total=s.locator('[data-craft-actual] [data-node-actual]').first();await total.fill('');await total.dispatchEvent('change');
    assert.match(await s.locator('[data-craft-status]').innerText(),/非负整数|空白/);assert.deepEqual(JSON.parse(await getAccountItem(page,KEY)).actual,before);
    await saveGoal(s,'目标二');assert.equal(JSON.parse(await getAccountItem(page,KEY)).actual.length,2);
    page.on('dialog',d=>d.accept());await s.locator('[data-craft-action="copy-actual"]').click();
    await s.locator('[data-recipe-input]').nth(0).selectOption({index:1});await s.locator('[data-recipe-input]').nth(1).selectOption({index:2});
    await s.locator('[data-craft-action="roll"]').click();await s.locator('[data-craft-action="repeat"]').click();
    const committed=await getAccountItem(page,KEY);await s.locator('[data-craft-action="roll"]').click();
    assert.match(await s.locator('[data-craft-status]').innerText(),/不足|选满/);
    assert.equal(JSON.parse(await getAccountItem(page,KEY)).workspaces[JSON.parse(committed).goals[1].id].pending,null);
  }finally{await page.close();}
});

test('旧铭文异常值保持可见且加载切页不改raw，新编辑按品质条数与合法数值校验',async()=>{
  const page=await pageFor();try{
    const raw=JSON.stringify({'红色神将\u0000神鬼谷盖聂':{name:'神鬼谷盖聂',quality:'红色神将',slots:[{tian:'天府',shield:'人盾',quality:'紫色',star:'2',subs:['技能穿透','技能穿透','技能穿透'],subValues:['+99%','旧备注','']}]},'普通橙色\u0000墨眉天明':{name:'墨眉天明',quality:'普通橙色',slots:[{tian:'天府',shield:'龙盾',quality:'橙色',star:'2',subs:['PVP速'],subValues:['旧文本']} ]}});
    await setAccountItem(page,'qinshi_inscription_progress_v2',raw);await page.reload();
    await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());
    assert.match(await page.locator('#ins-progress-list').innerText(),/99%.*旧备注/s);
    assert.match(await page.locator('#ins-progress-list').innerText(),/警告|历史记录|无效/);
    await page.locator('[data-mode="reference"]').click();
    const support=await page.locator('#inscription-reference').innerText();
    assert.match(support,/天遁（极致：攻、暴击伤害）/);assert.match(support,/云遁（极致：护盾、技免）/);
    assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw);
    await page.locator('[data-mode="progress"]').click();await page.locator('[data-edit-key]').first().click();
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    assert.match(await page.locator('#ins-progress-editor').innerText(),/警告|无效|合法|条数/);
    assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw);
  }finally{await page.close();}
});

test('龙蓝速未知档双料可预览并仅重抽',async()=>{
  const page=await pageFor('simulator');try{
    const s=await goal(page,{mode:'simulator',dun:'龙遁',quality:'p1',attrs:['PVP速','PVP速']});await saveGoal(s);
    await addMaterial(s,'b2','crafted',['PVP速:?'],2);
    await s.locator('[data-recipe-input]').nth(0).selectOption({index:1});await s.locator('[data-recipe-input]').nth(1).selectOption({index:1});
    assert.match(await s.locator('[data-craft-preview]').innerText(),/9 种结果/);
    await s.locator('[data-craft-action="roll"]').click();const before=JSON.parse(await getAccountItem(page,KEY));
    await s.locator('[data-craft-action="retry"]').click();const after=JSON.parse(await getAccountItem(page,KEY));
    assert.deepEqual(after.actual,[]);assert.deepEqual(after.workspaces[after.goals[0].id].inventory,before.workspaces[before.goals[0].id].inventory);
  }finally{await page.close();}
});

test('多X模板与具体库存规划完整结果，AAA缺目标不推荐，模拟可使用更高阶段材料',async()=>{
  const page=await pageFor();try{
    const s=await goal(page);await saveGoal(s,'三穿复用');await s.locator('[data-craft-action="generate"]').click();
    await s.locator('[data-reuse-branch] [data-craft-action="open-planner"]').first().click();
    await addMaterial(s,'o1','crafted',['技能穿透:H','技能穿透:M','治疗效果:U'],3,true);
    await s.locator('[data-planner-entry]').first().check();await s.locator('[data-craft-action="plan-stock"]').click();
    assert.match(await s.locator('[data-planner-results]').innerText(),/0 条可达|缺词AAA/);
    await addMaterial(s,'o1','crafted',['技能穿透:L','技能穿透:M','招架:U'],1,true);
    for(const checkbox of await s.locator('[data-planner-entry]').all())await checkbox.check();await s.locator('[data-craft-action="plan-stock"]').click();
    assert.ok(await s.locator('[data-planner-results] [data-concrete-route]').count()>0);
    assert.match(await s.locator('[data-planner-results]').innerText(),/10%/);
    page.on('dialog',d=>d.accept());await s.locator('[data-craft-action="copy-actual"]').click();
    await s.locator('[data-planner-results] [data-craft-action="use-recipe"]').first().click();
    assert.equal(await s.locator('[data-craft-stage]').inputValue(),'o1');
    await s.locator('[data-craft-action="roll"]').click();assert.ok(await s.locator('[data-craft-pending]').isVisible());
  }finally{await page.close();}
});

test('账号切换隔离目标与pending，完整备份往返包含实际库存和独立工作台',async()=>{
  const page=await pageFor('simulator');try{
    const s=await goal(page,{mode:'simulator',quality:'p1',dun:'鬼遁',attrs:['速','防']});await saveGoal(s,'第一账号目标');
    await addMaterial(s,'b2','wash',['速:?'],2,true);await addMaterial(s,'b2','wash',['防:H'],1);
    const original=await getAccountItem(page,KEY),originalId=await page.evaluate(()=>window.QinshiAccounts.currentAccount().id);
    const second=await page.evaluate(()=>window.QinshiAccounts.createAccount({name:'铭文隔离账号',server:'测试服'}).id);
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'inscription'}),second)]);
    await page.locator('[data-mode="crafting-simulator"]').click();assert.equal(await s.locator('[data-craft-field="saved-goal"] option').count(),1);
    const s2=await goal(page,{mode:'simulator'});await saveGoal(s2,'第二账号目标');
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(id=>window.QinshiAccounts.switchAccount(id,{partition:'inscription'}),originalId)]);
    await page.locator('[data-mode="crafting-simulator"]').click();assert.equal(await getAccountItem(page,KEY),original);
    const result=await page.evaluate(()=>{
      const settings=window.QinshiSettings,backup=settings.makePayload('test');const data=settings.validatePayload(backup);
      const key=Object.keys(data).find(k=>k.includes('inscription_crafting'));
      const value=data[key];settings.replaceManagedData(data);
      return {key,value,before:JSON.parse(value).goals.length,after:window.InscriptionCraftingState.createStore(window.QinshiAccounts).snapshot().goals.length};
    });
    assert.match(result.key,/qinshi_/);assert.equal(result.before,1);assert.equal(result.after,1);
  }finally{await page.close();}
});

test('明确调整旧记录可保存合法三档，并且不重写其他弟子历史别名和自由文本',async()=>{
  const page=await pageFor();try{
    const untouched={name:'墨眉天明',quality:'普通橙色',slots:[{tian:'天府',shield:'龙盾',quality:'橙色',star:'2',sub:'3PVP速',subValues:['旧文本']} ]};
    await setAccountItem(page,'qinshi_inscription_progress_v2',JSON.stringify({'普通橙色\u0000墨眉天明':untouched}));await page.reload();
    await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());
    await page.locator('#ins-progress-search').fill('神鬼谷盖聂');await page.locator('#ins-progress-suggestions button').first().click();
    const row=page.locator('.ins-editor-slot[data-tian="天同"]');
    for(let i=0;i<3;i++)await row.locator('.ins-edit-sub').nth(i).selectOption(['技能穿透:H','技能穿透:M','技能穿透:L'][i]);
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'));
    assert.deepEqual(saved['普通橙色\u0000墨眉天明'],untouched);
    assert.deepEqual(saved['红色神将\u0000神鬼谷盖聂'].slots.find(x=>x.tian==='天同').subValues,['+6%','+5%','+4%']);
  }finally{await page.close();}
});

test('切换新旧页签保留两个目标表单与正在编辑的具体材料，不重复绑定动作',async()=>{
  const page=await pageFor('simulator');try{
    const s=await goal(page,{mode:'simulator',dun:'鬼遁',quality:'p1',attrs:['速','防']});await saveGoal(s);
    const ed=s.locator('[data-craft-material-editor]');await ed.locator('[data-material-field="term"]').first().selectOption('速:?');await ed.locator('[data-material-field="quantity"]').fill('7');
    await page.locator('[data-mode="crafting-paths"]').click();await goal(page,{dun:'人遁',attrs:['技能穿透','技能穿透','PVP伤害']});
    await page.locator('[data-mode="query"]').click();await page.locator('[data-mode="crafting-simulator"]').click();
    assert.equal(await ed.locator('[data-material-field="term"]').first().inputValue(),'速:?');assert.equal(await ed.locator('[data-material-field="quantity"]').inputValue(),'7');
    assert.equal(await s.locator('[data-craft-field="dun"]').inputValue(),'鬼遁');
    await ed.locator('[data-craft-action="add-virtual"]').click();const state=JSON.parse(await getAccountItem(page,KEY));
    assert.equal(state.workspaces[state.goals[0].id].inventory[0].quantity,7);
    await page.locator('[data-mode="crafting-paths"]').click();assert.equal(await section(page).locator('[data-craft-field="dun"]').inputValue(),'人遁');
  }finally{await page.close();}
});

test('193条具体路线均可展开加载，13个策略组不截断，条件必中排在概率之前',async()=>{
  const page=await pageFor();try{
    const s=await goal(page);await s.locator('[data-craft-action="generate"]').click();
    const groups=s.locator('[data-route-group]');assert.equal(await groups.count(),13);
    assert.match(await groups.first().locator('summary').first().innerText(),/^条件必中/);
    for(const group of await groups.all()){
      await group.locator('summary').first().click();
      await group.locator('[data-concrete-route]').first().waitFor({state:'attached'});
      while(await group.locator('[data-more]').count())await group.locator('[data-more]').click();
    }
    assert.equal(await s.locator('[data-concrete-route]').count(),193);
  }finally{await page.close();}
});

test('弟子选定后改搜索词保留当前弟子、实际位置与存储草稿',async()=>{
  const page=await pageFor();try{
    const s=section(page);await s.locator('[data-craft-field="disciple-search"]').fill('墨眉天明');
    await s.locator('[data-craft-field="disciple"]').selectOption({label:'墨眉天明 · 普通橙色'});
    await s.locator('[data-craft-field="slot"]').selectOption('天府|龙遁');
    const before=await s.locator('[data-craft-field="disciple"]').inputValue();
    const draftBefore=JSON.parse(await getAccountItem(page,KEY)).draft['crafting-paths'].form;
    await s.locator('[data-craft-field="disciple-search"]').fill('盖聂');
    assert.equal(await s.locator('[data-craft-field="disciple"]').inputValue(),before);
    assert.equal(await s.locator('[data-craft-field="slot"]').inputValue(),'天府|龙遁');
    assert.equal(await s.locator('[data-craft-field="dun"]').inputValue(),'龙遁');
    assert.equal(await s.locator('[data-craft-field="prefix"]').inputValue(),'天府');
    assert.match(await s.locator('[data-craft-field="disciple"]').innerText(),/盖聂/);
    assert.deepEqual(JSON.parse(await getAccountItem(page,KEY)).draft['crafting-paths'].form,draftBefore);
    await page.locator('[data-mode="query"]').click();await page.locator('[data-mode="crafting-paths"]').click();
    assert.equal(await s.locator('[data-craft-field="disciple"]').inputValue(),before);
    await page.reload();await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());await page.locator('[data-mode="crafting-paths"]').click();
    assert.equal(await s.locator('[data-craft-field="disciple"]').inputValue(),before);
    assert.equal(await s.locator('[data-craft-field="slot"]').inputValue(),'天府|龙遁');
  }finally{await page.close();}
});

test('递归o2到o1到p2保留全部深层分支，规划使用精确中间目标而非顶层目标',async()=>{
  const page=await pageFor();try{
    const s=await goal(page);await s.locator('[data-craft-action="generate"]').click();
    const outer=s.locator('[data-route-group]').first();await outer.locator('summary').first().click();
    const o1Node=outer.locator('[data-concrete-route]').first().locator(':scope > .craft-flow > .craft-inputs > .craft-node').first();
    await o1Node.locator(':scope > [data-craft-action="expand-material"]').click();
    const o1=o1Node.locator(':scope > [data-material-expansion]');
    assert.ok(await o1.locator(':scope > .craft-panel [data-reuse-branch]').count()===0);
    const o1Group=o1.locator(':scope > [data-route-group]').first();await o1Group.locator('summary').first().click();
    const nodes=o1Group.locator('[data-concrete-route]').first().locator(':scope > .craft-flow > .craft-inputs > .craft-node');
    const washNode=nodes.locator('xpath=self::*[@data-material-origin="wash"]').first();
    await washNode.locator(':scope > [data-craft-action="expand-material"]').click();
    const lowP2=washNode.locator(':scope > [data-material-expansion]');
    assert.equal(await lowP2.locator(':scope > .craft-panel [data-additional-branch]').count(),3);
    const craftNode=nodes.locator('xpath=self::*[@data-material-origin="crafted"]').first();
    await craftNode.locator(':scope > [data-craft-action="expand-material"]').click();
    const p2=craftNode.locator(':scope > [data-material-expansion]');
    assert.equal(await p2.locator(':scope > .craft-panel [data-additional-branch]').count(),3);
    await p2.locator(':scope > .craft-panel [data-craft-action="open-planner"]').first().click();
    const editor=s.locator('[data-craft-material-editor]');
    assert.equal(await editor.locator('[data-material-field="quality"]').inputValue(),'p1');
    await editor.locator('[data-material-field="origin"]').selectOption('wash');
    await editor.locator('[data-material-field="term"]').nth(0).selectOption('技能穿透:H');await editor.locator('[data-material-field="term"]').nth(1).selectOption('治疗效果:U');
    await editor.locator('[data-craft-action="add-template"]').click();
    await editor.locator('[data-material-field="origin"]').selectOption('crafted');
    await editor.locator('[data-material-field="term"]').nth(0).selectOption('技能穿透:M');await editor.locator('[data-material-field="term"]').nth(1).selectOption('治疗效果:U');
    await editor.locator('[data-craft-action="add-template"]').click();
    const planner=p2.locator(':scope > .craft-panel [data-craft-planner]');
    await planner.locator('[data-craft-action="plan-templates"]').click();
    assert.equal(await planner.locator('[data-concrete-route]').count(),2);
    assert.match(await planner.innerText(),/紫一 → 紫二/);
    assert.match(await planner.innerText(),/33\.3333%/);
    const outputs=await planner.locator('.craft-output').allTextContents();
    assert.ok(outputs.every(text=>text.includes('紫二目标')&&text.includes('技能穿透4%')&&text.includes('技能穿透3%')&&!text.includes('橙二')));
    assert.equal(await s.locator('[data-craft-field="quality"]').inputValue(),'o2');
    assert.deepEqual(await s.locator('[data-craft-field="attr"]').evaluateAll(els=>els.map(el=>el.value)),['技能穿透','技能穿透','技能穿透']);
  }finally{await page.close();}
});

async function openLegacyRemarkEditor(page){
  const raw=JSON.stringify({'红色神将\u0000神鬼谷盖聂':{name:'神鬼谷盖聂',quality:'红色神将',slots:[
    {tian:'天府',shield:'人遁',quality:'橙色',star:'2',subs:['','',''],subValues:['旧备注，数值待确认','','']},
    {tian:'天同',shield:'地遁',quality:'橙色',star:'2',subs:['技能穿透','技能穿透','技能穿透'],subValues:['+6%','+5%','+4%']}
  ]}});
  await setAccountItem(page,'qinshi_inscription_progress_v2',raw);await page.reload();
  await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());await page.locator('[data-mode="progress"]').click();
  assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw,'loading must not rewrite the historical remark');
  assert.match(await page.locator('#ins-progress-list').innerText(),/旧备注，数值待确认/);
  await page.locator('[data-edit-key]').first().click();
  assert.equal(await getAccountItem(page,'qinshi_inscription_progress_v2'),raw,'opening the editor must not rewrite the remark');
  const remarkRow=page.locator('.ins-editor-slot[data-tian="天府"]');
  assert.equal(await remarkRow.locator('.ins-edit-sub').first().inputValue(),'__legacy__');
  assert.match(await remarkRow.innerText(),/旧备注，数值待确认/);
  return {raw,remarkRow,otherRow:page.locator('.ins-editor-slot[data-tian="天同"]')};
}

test('未改动的旧空属性备注保存后仍原样保留',async()=>{
  const page=await pageFor();try{
    const {raw}=await openLegacyRemarkEditor(page);
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const before=JSON.parse(raw)['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府');
    const after=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府');
    assert.deepEqual(after,before);
    assert.match(await page.locator('#ins-progress-list').innerText(),/旧备注，数值待确认/);
  }finally{await page.close();}
});

test('旧空属性备注不能因修改同弟子另一合法槽位而被顺带清除',async()=>{
  const page=await pageFor();try{
    const {raw,otherRow}=await openLegacyRemarkEditor(page);
    await otherRow.locator('.ins-edit-sub').nth(2).selectOption('治疗效果:U');
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'];
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府'),JSON.parse(raw)['红色神将\u0000神鬼谷盖聂'].slots.find(slot=>slot.tian==='天府'));
    assert.equal(saved.slots.find(slot=>slot.tian==='天同').subs[2],'治疗效果');
    assert.equal(saved.slots.find(slot=>slot.tian==='天同').subValues[2],'+6%');
  }finally{await page.close();}
});

test('旧空属性备注只有用户明确清空后才可保存为空草稿',async()=>{
  const page=await pageFor();try{
    const {remarkRow}=await openLegacyRemarkEditor(page);
    await remarkRow.locator('.ins-edit-sub').first().selectOption('');
    await page.locator('#ins-progress-editor [data-action="save"]').click();
    const saved=JSON.parse(await getAccountItem(page,'qinshi_inscription_progress_v2'))['红色神将\u0000神鬼谷盖聂'];
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府').subs,['','','']);
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天府').subValues,['','','']);
    assert.deepEqual(saved.slots.find(slot=>slot.tian==='天同').subValues,['+6%','+5%','+4%']);
    assert.equal(await page.locator('#ins-progress-editor .ins-editor').count(),0);
    assert.match(await page.locator('#ins-progress-list').innerText(),/未填写草稿/);
  }finally{await page.close();}
});
