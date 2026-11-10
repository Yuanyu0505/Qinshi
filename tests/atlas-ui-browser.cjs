// Real DOM regressions; every run uses a separate browser account and local origin.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, getAccountJson } = require('./browser-test-helpers.cjs');
let server, browser, origin;
before(async () => {
  server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); });
async function scenario(run, width = 390, height = 844, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, serviceWorkers: 'block' });
  await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  const p = await context.newPage(), errors = [];
  p.setDefaultTimeout(10000);
  p.on('pageerror', e => errors.push(e.message));
  try {
    await openApp(p, origin);
    await p.locator('#atlas-tabs [data-atlas="攻"]').click();
    await run(p);
    assert.deepEqual(errors, [], 'page errors');
  } finally { if (errors.length) console.error('atlas page errors:', errors); await context.close(); }
}
test('focused level commit does not reenter replacement or swallow next favorite click', async () => scenario(async p => {
  for (let index = 0; index < 4; index++) {
    const card = p.locator('[data-atlas-item]').nth(index);
    const id = await card.getAttribute('data-atlas-item');
    await card.locator('.atlas-level').fill('2');
    await card.locator('[data-atlas-favorite]').click();
    assert.equal(await p.locator(`[data-atlas-favorite="${id}"]`).getAttribute('aria-pressed'), 'true');
  }
  const ids = await p.locator('[data-atlas-item]').evaluateAll(ns => ns.map(n => n.dataset.atlasItem));
  assert.equal(new Set(ids).size, ids.length);
}));
test('synthetic change on focused level is safe during DOM reordering', async () => scenario(async p => {
  await p.locator('[data-atlas-item]').first().locator('.atlas-level').fill('3');
  await p.locator('[data-atlas-item]').first().locator('.atlas-level').dispatchEvent('change');
  assert.equal(await p.locator('[data-atlas-item]').first().locator('.atlas-level').inputValue(), '3');
}));
test('level commit displays the same parsed integer used by existing storage rules',async()=>scenario(async p=>{
  const card=p.locator('[data-atlas-item]').first();
  for(const [raw,normalized] of [['2.5','2'],['','0']]){
    await card.locator('.atlas-level').fill(raw);await card.locator('.atlas-level').press('Tab');
    assert.equal(await card.locator('.atlas-level').inputValue(),normalized);
  }
}));
test('level blur preserves directly visible equipment and metadata',async()=>scenario(async p=>{
  const card=p.locator('[data-atlas-item]').first();
  await card.locator('.atlas-level').fill('3');
  await card.locator('.atlas-level').press('Tab');
  assert.equal(await card.locator('.atlas-meta').isVisible(),true);
  assert.equal(await card.locator('.atlas-equipment-stage-list').isVisible(),true);
}));
test('focused level changes requery favorite cost order without a nested replacement',async()=>scenario(async p=>{
  await p.locator('[data-atlas-item]').nth(0).locator('[data-atlas-favorite]').click();
  await p.locator('[data-atlas-item]').nth(1).locator('[data-atlas-favorite]').click();
  await p.locator('#atlas-tabs [data-atlas="已收藏"]').click();
  const card=p.locator('[data-atlas-item]').nth(1),id=await card.getAttribute('data-atlas-item');
  await card.locator('.atlas-level').fill('20'); await card.locator('.atlas-level').dispatchEvent('change');
  assert.equal(await p.locator('[data-atlas-item]').first().getAttribute('data-atlas-item'),id);
  assert.equal(await p.locator('[data-atlas-item]').count(),2);
  assert.equal(await p.locator(`[data-atlas-item="${id}"] .atlas-level`).evaluate(n=>n===document.activeElement),true);
}));
test('keyboard favorite toggle retains focus on the same logical control after redraw',async()=>scenario(async p=>{
  const toggle=p.locator('[data-atlas-favorite]').first();
  await toggle.focus();await p.keyboard.press('Enter');
  assert.equal(await toggle.evaluate(n=>n===document.activeElement),true);
  await p.keyboard.press('Enter');assert.equal(await toggle.getAttribute('aria-pressed'),'false');
}));
test('a real pin click after level blur still reaches that card when costs reorder favorites',async()=>scenario(async p=>{
  for(const index of [0,1])await p.locator('[data-atlas-item]').nth(index).locator('[data-atlas-favorite]').click();
  await p.locator('#atlas-tabs [data-atlas="已收藏"]').click();
  const id=await p.locator('[data-atlas-item]').nth(1).getAttribute('data-atlas-item');
  const card=p.locator(`[data-atlas-item="${id}"]`);
  await card.locator('.atlas-level').fill('20');
  await card.locator('[data-atlas-pin]').click();
  assert.equal(await p.locator(`[data-atlas-pin="${id}"]`).getAttribute('aria-pressed'),'true');
  assert.deepEqual(await getAccountJson(p,'qinshi_atlas_pins_v1'),[id]);
}));
test('initial unactivated atlas results respect the hidden attribute',async()=>scenario(async p=>{
  await p.reload({waitUntil:'networkidle'});
  assert.equal(await p.locator('#atlas-results').evaluate(n=>getComputedStyle(n).display),'none');
}));
test('inventory decimal error stays beside souls, focuses field, preserves note and cancel semantics', async () => scenario(async p => {
  const card = p.locator('[data-atlas-item]').first();
  await card.locator('[data-atlas-favorite]').click();
  await card.locator('[data-atlas-inventory-edit]').click();
  const souls = card.locator('[data-atlas-inventory-souls]'), note = card.locator('[data-atlas-inventory-note]').first();
  await note.fill('禁地草稿'); await souls.fill('1.5');
  await card.locator('[data-atlas-inventory-save]').click();
  assert.equal(await souls.getAttribute('aria-invalid'), 'true');
  assert.equal(await souls.evaluate(n => n === document.activeElement), true);
  const errorField=await souls.boundingBox();
  const navTop=await p.locator('.tabs').evaluate(n=>n.getBoundingClientRect().top);
  assert.ok(errorField.y+errorField.height<=navTop, 'error field must be above fixed bottom navigation');
  assert.equal(await note.inputValue(), '禁地草稿');
  const error = card.locator('.atlas-inventory-error');
  assert.ok(await error.evaluate(n => n.parentElement.classList.contains('atlas-inventory-souls')));
  await souls.fill('3'); await card.locator('[data-atlas-inventory-cancel]').click();
  assert.equal(await card.locator('.atlas-inventory-editor').count(), 0);
  await card.locator('[data-atlas-inventory-edit]').click(); assert.equal(await souls.inputValue(), '');
}));
test('details and inventory drafts survive unrelated favorite redraw without changing saved inventory', async () => scenario(async p => {
  const card = p.locator('[data-atlas-item]').first();
  await card.locator('[data-atlas-favorite]').click();
  await card.locator('[data-atlas-inventory-edit]').click();
  await card.locator('[data-atlas-inventory-note]').first().fill('主线草稿');
  await card.locator('[data-atlas-inventory-souls]').fill('7');
  await p.locator('[data-atlas-item]').nth(1).locator('[data-atlas-favorite]').click();
  assert.equal(await card.locator('.atlas-meta').isVisible(),true);
  assert.equal(await card.locator('[data-atlas-inventory-note]').first().inputValue(), '主线草稿');
  assert.equal(await card.locator('[data-atlas-inventory-souls]').inputValue(), '7');
  assert.equal(await getAccountJson(p, 'qinshi_atlas_inventory_v1'), null);
}));
test('all 177 items, empty state, IME and saved inventory keep their existing meaning', async () => scenario(async p => {
  await p.locator('#atlas-tabs [data-atlas="全部"]').click();
  assert.equal(await p.locator('[data-atlas-item]').count(), 177);
  await p.evaluate(() => {
    const field=document.querySelector('#atlas-search');
    field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    field.value='琴师'; field.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
  });
  await p.waitForTimeout(180); assert.equal(await p.locator('[data-atlas-item]').count(), 177);
  await p.locator('#atlas-search').dispatchEvent('compositionend');
  await p.waitForTimeout(180); assert.equal(await p.locator('[data-atlas-item]').count(), 1);
  const card=p.locator('[data-atlas-item]').first(), id=await card.getAttribute('data-atlas-item');
  await card.locator('[data-atlas-favorite]').click(); await card.locator('[data-atlas-inventory-edit]').click();
  await card.locator('[data-atlas-inventory-souls]').fill('23');
  await card.locator('[data-atlas-inventory-note]').first().fill('主线');
  await card.locator('[data-atlas-inventory-owned]').first().selectOption('owned');
  assert.equal(await card.locator('[data-atlas-inventory-note]').first().inputValue(),'');
  await card.locator('[data-atlas-inventory-save]').click();
  const saved=await getAccountJson(p,'qinshi_atlas_inventory_v1');
  assert.equal(saved[id].soulsOwned,23); assert.equal(Object.values(saved[id].equipment).filter(x=>x.owned).length,1);
  await p.locator('#atlas-search').fill('NoSuchAtlasXYZ'); await p.waitForTimeout(180);
  assert.equal(await p.locator('#atlas-results .empty').count(),1);
  assert.equal(await p.locator('#atlas-upgrade-summary .atlas-upgrade-summary').count(),0);
  await p.locator('#atlas-search').fill(''); await p.waitForTimeout(180);
  assert.deepEqual(await getAccountJson(p,'qinshi_atlas_inventory_v1'),saved);
}));
test('query order, card costs and inventory are identical to pre-UI release for representative filters', async () => {
  const baseline = new Map(['/index.html','/js/app.js'].map(file => [file, cp.execFileSync('git', ['-c','safe.directory='+path.resolve(__dirname,'..').replaceAll('\\','/'),'show','e11ce71:'+file.slice(1)],{encoding:'utf8',maxBuffer:4*1024*1024})]));
  async function snapshot(legacy) {
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await context.route('**/*', r => {
      const u=new URL(r.request().url());
      if(u.origin!==origin)return r.abort();
      const file=u.pathname==='/'?'/index.html':u.pathname;
      if(legacy&&baseline.has(file))return r.fulfill({body:baseline.get(file),contentType:file.endsWith('.js')?'text/javascript':'text/html'});
      return r.continue();
    });
    const p=await context.newPage();
    try {
      await openApp(p,origin);
      await p.evaluate(()=>{
        const ids=ATLAS_DATA.items.slice(0,3).map(x=>String(x.id));
        QinshiAccounts.setItem('qinshi_atlas_favorites_v1',JSON.stringify(ids));
        QinshiAccounts.setItem('qinshi_atlas_pins_v1',JSON.stringify([ids[1]]));
        QinshiAccounts.setItem('qinshi_atlas_levels_v1',JSON.stringify({[ids[0]]:2,[ids[1]]:9,[ids[2]]:14}));
        QinshiAccounts.setItem('qinshi_atlas_inventory_v1',JSON.stringify({[ids[0]]:{soulsOwned:11,equipment:{}}}));
      });
      await p.reload({waitUntil:'networkidle'});
      const snapshots=[];
      for(const condition of [{tab:'全部'},{tab:'攻'},{tab:'血'},{tab:'内力'},{tab:'防'},{tab:'已收藏'},
        {tab:'全部',query:'琴师',field:'disciple'},{tab:'全部',query:'9级',field:'level'},
        {tab:'全部',query:'天问',field:'equipment'},{tab:'全部',query:'禁地',field:'acquire'},
        {tab:'全部',min:'3',max:'14'},{tab:'已收藏',sort:'souls',direction:'desc'},
        {tab:'已收藏',souls:'short',equipment:'missing'},{tab:'全部',query:'NoSuchAtlasXYZ'}]) {
        await p.evaluate(c=>{
          document.querySelector(`#atlas-tabs [data-atlas="${c.tab}"]`).click();
          const fields={'atlas-search-field':c.field||'all','atlas-level-min':c.min||'0','atlas-level-max':c.max||'20','atlas-soul-filter':c.souls||'all','atlas-equipment-filter':c.equipment||'all','atlas-sort-field':c.sort||'default','atlas-sort-direction':c.direction||'asc'};
          for(const [id,value] of Object.entries(fields)){const n=document.getElementById(id);n.value=value;n.dispatchEvent(new Event(id.includes('level-')?'input':'change',{bubbles:true}));if(id.includes('level-'))n.dispatchEvent(new Event('change',{bubbles:true}));}
          const search=document.getElementById('atlas-search');search.value=c.query||'';search.dispatchEvent(new Event('input',{bubbles:true}));
        },condition);
        await p.waitForTimeout(150);
        snapshots.push(await p.evaluate(()=>({
          cards:[...document.querySelectorAll('[data-atlas-item]')].map(n=>({id:n.dataset.atlasItem,level:n.querySelector('.atlas-level').value,costs:[...n.querySelectorAll('.atlas-upgrade-cost b')].map(x=>x.textContent.replaceAll(',',''))})),
          knots:document.querySelector('#atlas-upgrade-summary .atlas-cost-knots b')?.textContent.replaceAll(',','')||null,
          growth:document.querySelector('#atlas-upgrade-summary .atlas-cost-growth b')?.textContent.replaceAll(',','')||null,
          saved:['levels','target_level','favorites','pins','inventory'].map(k=>QinshiAccounts.getItem('qinshi_atlas_'+k+'_v1'))
        })));
      }
      return snapshots;
    } finally {await context.close();}
  }
  assert.deepEqual(await snapshot(false), await snapshot(true));
});
test('account switching and backup keep atlas favorites, pins, levels and inventory isolated', async () => scenario(async p => {
  const card=p.locator('[data-atlas-item]').first(), id=await card.getAttribute('data-atlas-item');
  await card.locator('[data-atlas-favorite]').click(); await card.locator('[data-atlas-pin]').click();
  await card.locator('.atlas-level').fill('4'); await card.locator('.atlas-level').press('Tab');
  await card.locator('[data-atlas-inventory-edit]').click(); await card.locator('[data-atlas-inventory-souls]').fill('31'); await card.locator('[data-atlas-inventory-save]').click();
  const before=await p.evaluate(()=>['levels','favorites','pins','inventory'].map(k=>QinshiAccounts.getItem('qinshi_atlas_'+k+'_v1')));
  const accounts=await p.evaluate(()=>({a:QinshiAccounts.currentAccount().id,b:QinshiAccounts.createAccount({name:'隔离账号乙',server:'本地测试'}).id}));
  await Promise.all([p.waitForNavigation({waitUntil:'networkidle'}),p.evaluate(id=>QinshiAccounts.switchAccount(id),accounts.b)]);
  assert.equal(await getAccountJson(p,'qinshi_atlas_favorites_v1'),null);
  await Promise.all([p.waitForNavigation({waitUntil:'networkidle'}),p.evaluate(id=>QinshiAccounts.switchAccount(id),accounts.a)]);
  assert.deepEqual(await p.evaluate(()=>['levels','favorites','pins','inventory'].map(k=>QinshiAccounts.getItem('qinshi_atlas_'+k+'_v1'))),before);
  const backup=await p.evaluate(()=>QinshiSettings.makePayload('manual'));
  const logical=await p.evaluate(payload=>{
    const data=QinshiSettings.validatePayload(payload);
    return Object.values(data).filter(v=>typeof v==='string');
  },backup);
  for(const raw of before) assert.ok(logical.includes(raw));
  await p.evaluate(payload=>{
    QinshiAccounts.setItem('qinshi_atlas_inventory_v1','{}');
    QinshiSettings.replaceManagedData(QinshiSettings.validatePayload(payload));
  },backup);
  await p.reload({waitUntil:'networkidle'});
  assert.deepEqual(await p.evaluate(()=>['levels','favorites','pins','inventory'].map(k=>QinshiAccounts.getItem('qinshi_atlas_'+k+'_v1'))),before);
  const other=await p.context().newPage();
  try {
    await other.goto(origin,{waitUntil:'networkidle'});
    assert.equal(await other.evaluate(()=>QinshiAccounts.isReadOnly()),true);
    await other.locator('#atlas-tabs [data-atlas="攻"]').click();
    await other.locator(`[data-atlas-favorite="${id}"]`).click();
    assert.deepEqual(await p.evaluate(()=>['levels','favorites','pins','inventory'].map(k=>QinshiAccounts.getItem('qinshi_atlas_'+k+'_v1'))),before);
  } finally {await other.close();}
}));
for (const scale of [1.25,1.5,2]) test(`${scale*100}% equivalent CSS viewport: transition layout remains usable`,async()=>scenario(async p=>{
  await p.locator('[data-atlas-item]').first().locator('[data-atlas-favorite]').click();
  await p.locator('[data-atlas-item]').first().locator('[data-atlas-inventory-edit]').click();
  await p.locator('[data-atlas-inventory-souls]').fill('9');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const n=await p.locator('[data-atlas-inventory-note]').first().boundingBox();assert.ok(n.width>=150);
},Math.round(1440/scale),Math.round(900/scale),scale));
test('breakpoint transitions and source selection preserve conditions and close independently',async()=>scenario(async p=>{
  for(const width of [699,701,999,1001,1270,1300]){
    await p.setViewportSize({width,height:850});
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await p.setViewportSize({width:390,height:568});
  await p.locator('#atlas-advanced-toggle').click();
  await p.locator('#atlas-equipment-filter').selectOption('missing');
  await p.locator('#atlas-note-toggle').click();
  await p.locator('[data-atlas-note-source="禁地"]').check();
  await p.locator('[data-atlas-note-source="主线"]').check();
  await p.keyboard.press('Escape');
  const conditions=await p.locator('#atlas-note-toggle').textContent(); assert.match(conditions,/禁地.*主线/);
  await p.locator('#partition-atlas .responsive-filter-toggle').click();
  assert.equal(await p.locator('#atlas-search').isVisible(),false);
  await p.locator('#partition-atlas .responsive-filter-toggle').click();
  assert.equal(await p.locator('#atlas-equipment-filter').inputValue(),'missing');
  assert.equal(await p.locator('#atlas-note-toggle').textContent(),conditions);
}));
test('installed atlas stylesheet and existing progress remain available offline',async()=>{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const p=await context.newPage();
  try {
    await openApp(p,origin);
    await p.evaluate(()=>navigator.serviceWorker.ready);
    await p.reload({waitUntil:'networkidle'});
    await p.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    await p.locator('#atlas-tabs [data-atlas="攻"]').click();
    const card=p.locator('[data-atlas-item]').first(),id=await card.getAttribute('data-atlas-item');
    await card.locator('[data-atlas-favorite]').click();
    const saved=await getAccountJson(p,'qinshi_atlas_favorites_v1');assert.ok(saved.includes(id));
    await context.setOffline(true); await p.reload({waitUntil:'networkidle'});
    await p.locator('#atlas-tabs [data-atlas="攻"]').click();
    assert.equal(await p.locator(`#atlas-tabs`).evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),3);
    assert.equal(await p.locator(`[data-atlas-favorite="${id}"]`).getAttribute('aria-pressed'),'true');
    assert.equal(await p.evaluate(async()=>{const response=await fetch('./css/atlas.css');return response.status;}),200);
    assert.deepEqual(await getAccountJson(p,'qinshi_atlas_favorites_v1'),saved);
  } finally {await context.close();}
});
const sizes = [[320,568],[375,667],[390,844],[430,932],[600,800],[768,1024],[820,1180],[1024,1366],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[844,390]];
for (const [width,height] of sizes) test(`${width}x${height}: readable cards, editor and source menu stay within content`, async () => scenario(async p => {
  const output = path.resolve('test-results/atlas-ui'); fs.mkdirSync(output, { recursive: true });
  if (process.env.ATLAS_CAPTURE_BEFORE) { await p.screenshot({path:path.join(output, `${width}-${height}-before.png`)}); return; }
  await p.screenshot({path:path.join(output, `${width}-${height}-overview.png`)});
  assert.equal(await p.locator('.atlas-summary-metrics > div').count(), 3);
  const layout = await p.locator('#atlas-results').evaluate(n => ({width:n.clientWidth,columns:getComputedStyle(n).gridTemplateColumns.split(' ').length}));
  assert.equal(layout.columns, layout.width >= 960 ? 2 : 1);
  const card = p.locator('[data-atlas-item]').first();
  await card.locator('[data-atlas-favorite]').click(); await card.locator('[data-atlas-inventory-edit]').click();
  await card.locator('[data-atlas-inventory-note]').first().fill('长备注：主线、碎片、禁地，保留全部文字');
  await p.screenshot({path:path.join(output, `${width}-${height}-editor.png`)});
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const rows = await card.locator('.atlas-inventory-equipment-row').first().evaluate(n => ({width:n.clientWidth,scroll:n.scrollWidth}));
  assert.ok(rows.scroll <= rows.width+1, JSON.stringify(rows));
  if (await p.locator('#atlas-advanced-toggle').isVisible()) await p.locator('#atlas-advanced-toggle').click();
  await p.locator('#atlas-equipment-filter').selectOption('missing');
  await p.locator('#atlas-note-toggle').scrollIntoViewIfNeeded();
  await p.locator('#atlas-note-toggle').click();
  const menu = p.locator('#atlas-note-menu');
  const geometry = await menu.evaluate(n => {const r=n.getBoundingClientRect();const nav=document.querySelector('.tabs').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,limit:matchMedia('(max-width:767px)').matches?nav.top:innerHeight,w:innerWidth};});
  assert.ok(geometry.left>=0&&geometry.right<=geometry.w&&geometry.top>=0&&geometry.bottom<=geometry.limit+1, JSON.stringify(geometry));
  await p.screenshot({path:path.join(output, `${width}-${height}-menu.png`)});
  await p.keyboard.press('Escape'); assert.equal(await menu.isVisible(), false);
  assert.equal(await p.locator('#atlas-note-toggle').evaluate(n=>n===document.activeElement), true);
}, width, height));
