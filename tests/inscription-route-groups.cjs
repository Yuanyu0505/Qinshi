const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp,getAccountJson}=require('./browser-test-helpers.cjs');
const FAVORITES='qinshi_inscription_route_favorites_v1';
let server,browser,url;
before(async()=>{
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function openPaths(page){
  const tab=page.locator('.tab[data-partition="inscription"]');
  if(await tab.isVisible())await tab.click();
  else {await page.locator('#mobile-more-toggle').click();await page.locator('#mobile-more-layer [data-partition="inscription"]').click();}
  await page.locator('[data-mode="crafting-paths"]').click();
  return page.locator('#inscription-crafting-paths');
}
async function generate(section){
  await section.locator('[data-craft-action="generate"]').click();
  await section.locator('.craft-strategy').first().waitFor();
}
async function setup(width){
  const page=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block'});
  page.setDefaultTimeout(10000);
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await openApp(page,url,{waitUntil:'load'});
  const section=await openPaths(page);
  await section.locator('[data-craft-field="dun"]').selectOption('地遁');
  for(const [i,attr] of ['技能穿透','技能穿透','暴击'].entries())await section.locator('[data-craft-field="attr"]').nth(i).selectOption(attr);
  await generate(section);return {page,section};
}
async function favoriteCount(page,count){
  await page.waitForFunction(({key,count})=>JSON.parse(window.QinshiAccounts.getItem(key)||'{"entries":[]}').entries.length===count,{key:FAVORITES,count});
}
async function expectedDescription(page,index){
  return page.evaluate(index=>{
    const plan=window.InscriptionPaths.representative({dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','暴击']});
    const document=new DOMParser().parseFromString(window.InscriptionFlowchart.render(plan.strategies[index],plan.xAttr,{showFailures:false,positionLabel:'地遁'}),'text/html');
    return document.querySelector('svg desc').textContent;
  },index);
}
for(const width of [320,390,768,1024])test(`grouped variants switch one complete flow without overflow at ${width}px`,async()=>{
  const {page,section}=await setup(width);
  try{
    assert.equal(await section.locator('.craft-strategy').count(),6);
    const stable=section.locator('.craft-strategy[data-route-kind="deterministic"]');
    const chance=section.locator('.craft-strategy[data-route-kind="probability"]');
    assert.deepEqual(await stable.locator('summary>span').allTextContents(),['必中路线 1 · 蓝二 → 橙二','必中路线 2 · 蓝二 → 橙二','必中路线 3 · 蓝二 → 橙二']);
    assert.deepEqual((await chance.locator('summary>span').allTextContents()).map(s=>s.match(/概率思路 \d+/)[0]),['概率思路 1','概率思路 2','概率思路 3']);
    const card=chance.first(),select=card.locator('[data-route-variant]');
    assert.equal(await select.locator('option').count(),3);
    const before=await card.locator('svg desc').textContent(),expected=await expectedDescription(page,3);
    assert.equal(before,await expectedDescription(page,1));
    await select.selectOption('3');
    assert.equal(await card.getAttribute('data-route-index'),'3');
    assert.equal(await card.locator('[data-craft-action="toggle-favorite"]').getAttribute('data-route-index'),'3');
    assert.notEqual(await card.locator('svg desc').textContent(),before);
    assert.equal(await card.locator('svg desc').textContent(),expected);
    assert.equal(await card.locator('[data-flow-viewer]').count(),1);
    await card.locator('summary>span').click();await card.locator('summary>span').click();
    assert.equal(await select.inputValue(),'3');
    await generate(section);
    assert.equal(await chance.first().locator('[data-route-variant]').inputValue(),'3');
    assert.equal(await chance.first().locator('svg desc').textContent(),expected);
    const box=await select.boundingBox();assert.ok(box.width>80&&box.height>=40&&box.x>=0&&box.x+box.width<=width);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }finally{await page.close();}
});

test('two variants keep distinct saved trees through requery, reload and cancellation',async()=>{
  const {page,section}=await setup(1024);
  try{
    const chance=()=>section.locator('.craft-strategy[data-route-kind="probability"]:not(.craft-favorite-pinned)').first();
    await chance().locator('[data-route-variant]').selectOption('3');
    await chance().locator('[data-craft-action="toggle-favorite"]').click();await favoriteCount(page,1);
    assert.equal(await section.locator('.craft-favorite-pinned').getAttribute('data-route-index'),'3');
    await chance().locator('[data-route-variant]').selectOption('5');
    await chance().locator('[data-craft-action="toggle-favorite"]').click();await favoriteCount(page,2);
    const saved=await getAccountJson(page,FAVORITES);
    assert.notDeepEqual(saved.entries[0].route.tree,saved.entries[1].route.tree);
    assert.deepEqual(await page.evaluate(key=>{
      const records=JSON.parse(window.QinshiAccounts.getItem(key)).entries;
      const target={discipleKey:'',slot:'',dun:'地遁',quality:'o2',attrs:['技能穿透','技能穿透','暴击'],xTerm:null};
      const plan=window.InscriptionPaths.representative({...target,prefix:window.InscriptionRules.prefixes[0]});
      return records.map(record=>plan.strategies.findIndex(route=>window.InscriptionRouteFavorites.match([record],route,target,plan.xAttr)));
    },FAVORITES),[3,5]);
    assert.deepEqual(await section.locator('.craft-favorite-pinned').evaluateAll(els=>els.map(el=>el.dataset.routeIndex)),['3','5']);
    assert.match(await chance().locator('summary>span').innerText(),/^概率思路 1/);
    await page.reload({waitUntil:'load'});await openPaths(page);await generate(section);
    assert.deepEqual(await getAccountJson(page,FAVORITES),saved);
    assert.deepEqual(await section.locator('.craft-favorite-pinned').evaluateAll(els=>els.map(el=>el.dataset.routeIndex)),['3','5']);
    await section.locator('.craft-favorite-pinned[data-route-index="3"] [data-craft-action="toggle-favorite"]').click();await favoriteCount(page,1);
    assert.deepEqual((await getAccountJson(page,FAVORITES)).entries,[saved.entries[1]]);
    await chance().locator('[data-route-variant]').selectOption('3');
    assert.equal(await chance().locator('[data-craft-action="toggle-favorite"]').getAttribute('data-route-index'),'3');
    await generate(section);
    assert.equal(await chance().getAttribute('data-route-index'),'3');
    assert.equal(await section.locator('.craft-favorite-pinned').getAttribute('data-route-index'),'5');
  }finally{await page.close();}
});

test('main list numbers remain continuous when guaranteed cards and entire probability groups are pinned',async()=>{
  const {page,section}=await setup(1024);
  try{
    await section.locator('.craft-strategy[data-route-index="2"] [data-craft-action="toggle-favorite"]').click();await favoriteCount(page,1);
    assert.deepEqual((await section.locator('.craft-strategy[data-route-kind="deterministic"]:not(.craft-favorite-pinned) summary>span').allTextContents()).map(s=>s.match(/必中路线 \d+/)[0]),['必中路线 1','必中路线 2']);
    for(const [i,index] of [1,3,5].entries()){
      const card=section.locator('.craft-strategy[data-route-kind="probability"]:not(.craft-favorite-pinned)').first();
      await card.locator('[data-route-variant]').selectOption(String(index));
      await card.locator('[data-craft-action="toggle-favorite"]').click();await favoriteCount(page,i+2);
    }
    assert.deepEqual((await section.locator('.craft-strategy[data-route-kind="probability"]:not(.craft-favorite-pinned) summary>span').allTextContents()).map(s=>s.match(/概率思路 \d+/)[0]),['概率思路 1','概率思路 2']);
    assert.deepEqual((await section.locator('.craft-favorite-pinned summary>span').allTextContents()).map(s=>s.match(/收藏路线 \d+/)[0]),['收藏路线 1','收藏路线 2','收藏路线 3','收藏路线 4']);
  }finally{await page.close();}
});

test('variant labels sort terms and propagate only explicitly sourced symbolic X',async()=>{
  const {page,section}=await setup(1024);
  try{
    const labels=()=>section.locator('[data-route-variant] option').allTextContents();
    await page.evaluate(()=>{
      const original=window.InscriptionPaths.representative;
      window.InscriptionPaths.representative=function(goal){
        const result=original(goal);
        function walk(node){node.material.terms.reverse();node.children.forEach(c=>walk(c.node));}
        result.strategies.forEach(route=>walk(route.tree));return result;
      };
    });
    await generate(section);
    assert.match((await labels())[0],/4%技能穿透（高档）＋3%技能穿透（中档）/);
    assert.ok((await labels()).some(text=>text.includes('杂词条 X（同一个）')));
    assert.ok((await labels()).every(text=>!text.includes('闪避')));
    await section.locator('[data-craft-field="x-term"]').selectOption('闪避:U');await generate(section);
    assert.ok((await labels()).some(text=>text.includes('闪避')));
    assert.ok((await labels()).every(text=>!text.includes('杂词条 X')));
    await page.evaluate(()=>{
      const original=window.InscriptionPaths.representative;
      window.InscriptionPaths.representative=function(goal){
        const result=original(goal);
        function walk(node){delete node.xSource;node.children.forEach(c=>walk(c.node));}
        result.strategies.forEach(route=>walk(route.tree));return result;
      };
    });
    await section.locator('[data-craft-field="x-term"]').selectOption('');await generate(section);
    assert.ok((await labels()).some(text=>text.includes('闪避')));
    assert.ok((await labels()).every(text=>!text.includes('杂词条 X')));
  }finally{await page.close();}
});

test('a real randomly filled ingredient keeps its concrete term in symbolic mode',async()=>{
  const {page,section}=await setup(1024);
  try{
    await section.locator('[data-craft-field="dun"]').selectOption('鬼遁');
    await section.locator('[data-craft-field="quality"]').selectOption('p2');
    await section.locator('[data-craft-field="attr"]').nth(0).selectOption('速');
    await section.locator('[data-craft-field="attr"]').nth(1).selectOption('闪避');
    await page.evaluate(()=>{
      const R=window.InscriptionRules;
      const blue={prefix:R.prefixes[0],dun:'鬼遁',quality:'b2',origin:'wash',terms:[{attr:'速',tier:'?'}]};
      const preview=R.preview([blue,blue]);
      const output=preview.outcomes.find(o=>o.material.terms.some(t=>t.attr==='速'&&t.tier==='H')&&o.material.terms.some(t=>t.attr==='闪避'));
      const child={kind:'craft',material:output.material,children:[{quantity:2,node:{kind:'base',material:blue,children:[]}}],outcomes:preview.outcomes,probability:output.probability,promotion:preview.promotion};
      const upgrade=R.preview([child.material,child.material,child.material]);
      const tree={kind:'craft',material:upgrade.outcomes[0].material,children:[{quantity:3,node:child}],outcomes:upgrade.outcomes,probability:1,promotion:upgrade.promotion};
      const xTerm={attr:'闪避',tier:'U'};
      window.InscriptionPaths.representative=()=>({valid:true,strategies:[{kind:'probability',tree,reuse:[],symbolicX:true,xTerm}],symbolicX:true,xTerm,xAttr:'闪避'});
    });
    await generate(section);
    const label=await section.locator('[data-route-variant] option').innerText();
    assert.match(label,/3%闪避（不分档）/);
    assert.doesNotMatch(label,/杂词条 X/);
  }finally{await page.close();}
});

test('graded concrete X uses its reduced route count, wash source and actual label',async()=>{
  const {page,section}=await setup(1024);
  try{
    await section.locator('[data-craft-field="x-term"]').selectOption('技能穿透:L');await generate(section);
    assert.equal(await section.locator('.craft-strategy').count(),4);
    const chance=section.locator('.craft-strategy[data-route-kind="probability"]');
    assert.equal(await chance.count(),1);
    assert.equal(await chance.locator('[data-route-variant] option').count(),1);
    const label=await chance.locator('[data-route-variant] option').innerText();
    assert.match(label,/2%技能穿透（低档）/);assert.doesNotMatch(label,/杂词条 X|闪避/);
    assert.match(await chance.locator('.craft-route-picker').innerText(),/紫二置换准备/);
    const description=await chance.locator('svg desc').textContent();
    assert.match(description,/另行置换合成素材铭文/);
    assert.match(description,/当前概率：未知/);
    assert.match(description,/2%技能穿透（低档）/);
    assert.doesNotMatch(description,/杂词条 X（同一个）/);
  }finally{await page.close();}
});
