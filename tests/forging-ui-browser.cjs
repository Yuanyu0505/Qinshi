// PLAYWRIGHT_MODULE=<bundled playwright> node --test tests/forging-ui-browser.cjs
// FORGING_UI_PHASE=before saves baseline evidence without expecting the new layout.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp, setAccountJson, getAccountJson } = require('./browser-test-helpers.cjs');
const phase = process.env.FORGING_UI_PHASE || 'after';
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.FORGING_UI_EVIDENCE_ROOT || path.join(root, 'outputs', 'forging-ui-1.1.19');
const out = path.join(evidenceRoot, phase);
const key = 'qinshi_forging_progress_v1';
const fixture = { version: 2, disciples: [
  { id: 'ui-d1', name: '测试甲·长名称弟子', items: [
    { id: 'ui-i1', forgeName: '雷神锤', equipmentName: '雷神锤', quality: 'red', progress: 0 },
    { id: 'ui-i2', forgeName: '墨眉', equipmentName: '神兵墨眉', quality: 'orange', progress: 2 }
  ] },
  { id: 'ui-d2', name: '测试乙', items: [
    { id: 'ui-i3', forgeName: '非攻', equipmentName: '非攻', quality: 'red', progress: 5 }
  ] }
] };
let browser, server, url;
before(async () => {
  fs.mkdirSync(out, { recursive: true });
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: 'msedge', headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function start(width = 1366, height = 768, data = fixture, options = {}) {
  const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: 'block', timezoneId: 'Asia/Shanghai', ...options });
  await openApp(page, url);
  await setAccountJson(page, key, data);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('.tab[data-partition="forging"]').click());
  await page.locator('#partition-forging').waitFor({ state: 'visible' });
  return page;
}
async function search(page, value, mode = 'main') {
  await page.locator('#forge-view [data-view="query"]').click();
  await page.locator('#forge-mode [data-mode="' + mode + '"]').click();
  await page.locator('#forge-search').fill(value);
  await page.waitForTimeout(220);
}
async function progress(page) {
  await page.locator('#forge-view [data-view="progress"]').click();
  await page.locator('#prog-search').fill('');
  await page.waitForTimeout(220);
}
async function shot(page, name) {
  // Full-page capture can resize the viewport and correctly dismiss a fixed menu.
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: !name.endsWith('menu') });
}
async function snapshot(page) {
  return page.evaluate(fixture => {
    const data = window.FORGING_DATA, p = window.PROGRESS;
    const catalog = window.EquipmentForging.buildProgressEquipmentCatalog(data.items, window.SPECIAL_EQUIPMENT_DATA.items);
    const disciples = p.normalizeProgressStore(fixture, catalog, data.items).disciples;
    return {
      data, catalog,
      main: window.FORGING.findMain(data.items, '雷神锤'),
      materials: ['非攻', '水寒', '墨眉'].map(q => window.FORGING.findAsMaterial(data.items, q)),
      overall: p.overallSummary(data, disciples),
      individual: disciples.map(d => p.discipleSummary(data, d)),
      stages: disciples.flatMap(d => d.items.map(i => ({ name: i.equipmentName,
        remaining: p.remainingStages(p.findItem(data, i.forgeName), i.progress, i.quality),
        next: p.nextStage(p.findItem(data, i.forgeName), i.progress, i.quality) })))
    };
  }, fixture);
}
test('five viewport before/after evidence and identical public calculations', async () => {
  const metrics = [];
  for (const [width, height] of [[320,568],[390,844],[820,1180],[1366,768],[1920,1080]]) {
    const page = await start(width, height);
    try {
      if (width === 1366) {
        const data = await snapshot(page);
        assert.equal(data.data.items.length,165);
        assert.equal(data.catalog.length,169);
        assert.equal(data.data.meta.stageNames.length,11);
        assert.equal(data.data.summary.length,4);
        assert.ok(data.overall.length > 0);
        fs.writeFileSync(path.join(out, 'public-calculations.json'), JSON.stringify(data, null, 2));
        const hashes = Object.fromEntries(['js/forging.js','js/progress.js','js/equipment-forging.js','js/item-navigation.js',
          ...fs.readdirSync(path.join(root,'data')).filter(n=>n.endsWith('.js')).map(n=>'data/'+n)]
          .map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
        fs.writeFileSync(path.join(out, 'protected-hashes.json'), JSON.stringify(hashes, null, 2));
        if (phase === 'after' && fs.existsSync(path.join(out,'../before/public-calculations.json'))) {
          assert.deepEqual(data, JSON.parse(fs.readFileSync(path.join(out,'../before/public-calculations.json'))));
          assert.deepEqual(hashes, JSON.parse(fs.readFileSync(path.join(out,'../before/protected-hashes.json'))));
        }
      }
      await search(page, '雷神锤');
      assert.equal(await page.locator('#forge-results tbody tr').count(), 1);
      assert.equal(await page.locator('#forge-results tbody tr td[data-label]').count(), 11);
      await shot(page, width+'-main');
      await search(page, '非攻', 'material');
      await shot(page, width+'-material');
      const border = await page.locator('#forge-results .hit').first().evaluate(e => parseFloat(getComputedStyle(e).borderLeftWidth));
      await search(page, '');
      await page.locator('.forging-summary-table-wrap').scrollIntoViewIfNeeded();
      await shot(page, width+'-summary');
      const font = await page.locator('#forging-summary td').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
      await progress(page);
      await page.locator('#prog-pager').scrollIntoViewIfNeeded();
      await shot(page, width+'-overall');
      await page.locator('#prog-next').click();
      await shot(page, width+'-disciple');
      await page.locator('[data-act="toggle-add"]').click();
      await page.locator('.prog-item-search').fill('墨眉');
      await shot(page, width+'-add');
      await page.locator('[data-act="toggle-add"]').click();
      await page.locator('#prog-reorder-toggle').click();
      await page.locator('[data-prog-reorder-disciple="ui-d1"]').click();
      await shot(page, width+'-reorder');
      await page.locator('#prog-reorder-cancel').click();
      await page.locator('.progress-equipment-link').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      await page.locator('.progress-equipment-link').first().click();
      if (phase === 'before' && !await page.locator('#item-navigation-menu').isVisible()) {
        await page.waitForTimeout(100);
        await page.locator('.progress-equipment-link').first().click();
      }
      await page.locator('#item-navigation-menu').waitFor({state:'visible'});
      await shot(page, width+'-menu');
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      metrics.push({width,height,font,border,overflow});
    } finally { await page.close(); }
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics,null,2));
  if (phase !== 'before') for (const m of metrics) {
    assert.ok(m.font >= 13, JSON.stringify(m));
    assert.ok(m.border <= 2, JSON.stringify(m));
    assert.ok(m.overflow <= 1, JSON.stringify(m));
  }
});

test('tablet summary stays readable, main query stays sticky and material stages fit without horizontal scrolling', async () => {
  const page = await start(820,1180);
  try {
    const font = await page.locator('#forging-summary td').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
    assert.ok(font >= 13, 'summary font '+font+' must be readable');
    for (const mode of ['main','material']) {
      await search(page, mode==='main'?'雷神锤':'非攻', mode);
      const position=await page.locator('#forge-results .forge-eq').first().evaluate(e=>getComputedStyle(e).position);
      if(mode==='main') assert.equal(position,'sticky');
      else {
        assert.equal(position,'static');
        const size=await page.locator('.forge-scroll-material').evaluate(e=>({content:e.scrollWidth,visible:e.clientWidth}));
        assert.ok(size.content<=size.visible+1,JSON.stringify(size));
        const stageCounts=await page.locator('#forge-results tbody tr').evaluateAll(rows=>rows.map(row=>row.querySelectorAll('td[data-label]').length));
        assert.ok(stageCounts.length>0);
        assert.ok(stageCounts.every(count=>count===11));
      }
    }
  } finally { await page.close(); }
});

test('stage rerender preserves unsaved add form, selected candidate, focus and expanded material details', async () => {
  const page = await start();
  try {
    await progress(page); await page.locator('#prog-next').click();
    await page.locator('[data-act="toggle-add"]').click();
    await page.locator('.prog-item-search').fill('墨眉');
    const option = page.locator('.prog-item-opt').first();
    const selected = await option.getAttribute('data-option-key');
    await option.click();
    const stage = page.locator('[data-act="set-stage"][data-item="ui-i1"][data-idx="1"]');
    await stage.focus(); await stage.press('Enter');
    assert.equal(await page.locator('[data-add-form="ui-d1"]').getAttribute('data-selected'), selected);
    assert.equal(await page.locator('[data-add-form="ui-d1"]').isVisible(), true);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.idx), '1');
    const details = page.locator('.prog-equip').first().locator('details');
    assert.equal(await details.count(), 1);
    await details.locator('summary').click();
    await page.locator('[data-act="set-stage"][data-item="ui-i1"][data-idx="2"]').click();
    assert.equal(await details.getAttribute('open'), '');
    await page.locator('[data-act="add-item"]').click();
    const stored = await getAccountJson(page,key);
    assert.equal(stored.disciples[0].items.length,3);
  } finally { await page.close(); }
});

test('a refused account write never reports saved', async () => {
  const page = await start();
  try {
    await progress(page); await page.locator('#prog-next').click();
    await page.evaluate(() => { window.QinshiAccounts.setItem = () => false; });
    await page.locator('[data-act="set-stage"][data-item="ui-i1"][data-idx="1"]').click();
    assert.doesNotMatch(await page.locator('#prog-save-tip').innerText(), /^已保存/);
    assert.equal((await getAccountJson(page,key)).disciples[0].items[0].progress,0);
  } finally { await page.close(); }
});

test('query results, all stage tokens, dashes, hit locations and summary match frozen baseline', async () => {
  const page = await start();
  try {
    const baselinePath=path.join(out,'../before/public-calculations.json');
    const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath)) : await snapshot(page);
    for (const [query,mode,rows] of [['雷神锤','main',baseline.main], ...['非攻','水寒','墨眉'].map((q,i)=>[q,'material',baseline.materials[i]])]) {
      await search(page,query,mode);
      const rendered = await page.locator('#forge-results tbody tr').evaluateAll(rows=>rows.map(row=>({
        name:row.querySelector('.forging-equipment-link').dataset.itemName,
        stages:Array.from(row.querySelectorAll('td[data-label]')).map(cell=>Array.from(cell.querySelectorAll('.mat,.mat-dash')).map(t=>({n:t.textContent,hit:t.classList.contains('hit')})))
      })));
      assert.equal(rendered.length,rows.length);
      rows.forEach((entry,i)=>{
        const item = mode==='main'?entry:entry.item;
        assert.equal(rendered[i].name,item.name);
        assert.equal(rendered[i].stages.length,11);
        item.stages.forEach((stage,si)=>stage.tokens.forEach((token,ti)=>{
          assert.equal(rendered[i].stages[si][ti].n,token.dash?'—':token.n);
          if(mode==='material') assert.equal(rendered[i].stages[si][ti].hit,entry.hits.some(h=>h.stageIdx===si&&h.tokenIdx===ti));
        }));
      });
    }
    const actual = await page.locator('#forging-summary').innerText();
    assert.ok(actual.includes('武器') && actual.includes('盔甲') && actual.includes('首饰') && actual.includes('典籍'));
    await search(page,'无此装备-test');
    assert.equal(await page.locator('#forge-results tbody tr').count(),0);
    await search(page,'');
    assert.equal(await page.locator('#forge-results').isVisible(),false);
    const input=page.locator('#forge-search');
    await input.dispatchEvent('compositionstart');
    await input.fill('雷神');
    await input.dispatchEvent('compositionend');
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#forge-results tbody tr').count()>0);
    await input.fill('不存在'); await input.fill('雷神锤'); await page.waitForTimeout(220);
    assert.equal(await page.locator('#forge-results tbody tr').count(),1);
  } finally {await page.close();}
});

test('all orange/red stages, downgrade confirmation, remove cancel and confirm retain correct records', async () => {
  const page = await start(390,844);
  try {
    await progress(page); await page.locator('#prog-next').click();
    for(const [id,max] of [['ui-i1',11],['ui-i2',6]]) {
      for(let stage=0;stage<=max;stage++) {
        await page.locator('[data-act="set-stage"][data-item="'+id+'"][data-idx="'+stage+'"]').click();
        const record=(await getAccountJson(page,key)).disciples[0].items.find(i=>i.id===id);
        assert.equal(record.progress,stage);
        const card=page.locator('[data-prog-card-key="disciple:ui-d1:'+id+'"]');
        assert.equal(await card.locator('.prog-material-table tr').count(),Math.max(1,max-stage));
      }
    }
    const toggle=page.locator('[data-act="switch-quality"][data-item="ui-i1"]');
    page.once('dialog',d=>d.dismiss()); await toggle.click();
    assert.equal((await getAccountJson(page,key)).disciples[0].items[0].quality,'red');
    page.once('dialog',d=>d.accept()); await toggle.click();
    const changed=(await getAccountJson(page,key)).disciples[0].items[0];
    assert.equal(changed.quality,'orange'); assert.equal(changed.progress,6);
    const remove=page.locator('[data-act="remove-item"][data-item="ui-i2"]');
    page.once('dialog',d=>d.dismiss()); await remove.click();
    assert.equal((await getAccountJson(page,key)).disciples[0].items.length,2);
    page.once('dialog',d=>d.accept()); await remove.click();
    assert.equal((await getAccountJson(page,key)).disciples[0].items.length,1);
    assert.equal((await getAccountJson(page,key)).disciples[1].items[0].progress,5);
    await page.reload(); await page.evaluate(()=>document.querySelector('.tab[data-partition="forging"]').click());
    await progress(page); await page.locator('#prog-next').click();
    assert.equal(await page.locator('.prog-equip').count(),1);
  } finally {await page.close();}
});

test('reorder is a draft until saved and preserves current disciple; add, rename, delete and empty states', async () => {
  const page=await start();
  try {
    await progress(page); await page.locator('#prog-next').click();
    const original=await getAccountJson(page,key);
    await page.locator('#prog-reorder-toggle').click();
    await page.locator('[data-prog-reorder-disciple="ui-d1"]').click();
    await page.locator('[data-prog-reorder-disciple="ui-d1"]').click();
    assert.equal(await page.locator('[aria-pressed="true"][data-prog-reorder-disciple]').count(),0);
    await page.locator('[data-prog-reorder-disciple="ui-d1"]').click();
    await page.locator('[data-prog-reorder-disciple="ui-d2"]').click();
    assert.deepEqual(await getAccountJson(page,key),original);
    await page.locator('#prog-reorder-cancel').click();
    assert.deepEqual(await getAccountJson(page,key),original);
    await page.locator('#prog-reorder-toggle').click();
    await page.locator('[data-prog-reorder-disciple="ui-d1"]').click();
    await page.locator('[data-prog-reorder-disciple="ui-d2"]').click();
    await page.locator('#prog-reorder-save').click();
    assert.deepEqual((await getAccountJson(page,key)).disciples.map(d=>d.id),['ui-d2','ui-d1']);
    assert.equal(await page.locator('.prog-name').inputValue(),'测试甲·长名称弟子');
    await page.locator('.prog-name').fill('改名甲'); await page.locator('.prog-name').press('Tab');
    assert.equal((await getAccountJson(page,key)).disciples[1].name,'改名甲');
    await page.locator('#prog-add-disciple').click();
    assert.equal((await getAccountJson(page,key)).disciples.length,3);
    page.once('dialog',d=>d.dismiss()); await page.locator('[data-act="remove-disciple"]').click();
    assert.equal((await getAccountJson(page,key)).disciples.length,3);
    page.once('dialog',d=>d.accept()); await page.locator('[data-act="remove-disciple"]').click();
    assert.equal((await getAccountJson(page,key)).disciples.length,2);
  } finally {await page.close();}
  for(const disciples of [[],fixture.disciples.slice(0,1)]) {
    const empty=await start(320,568,{version:2,disciples});
    try {await progress(empty); assert.equal(await empty.locator('#prog-reorder-toggle').isVisible(),false);}
    finally {await empty.close();}
  }
});

test('menu navigation returns exact query and progress state, and menu fits a short phone viewport', async () => {
  const page=await start(320,568);
  try {
    await search(page,'水寒','material');
    await page.locator('#forge-results .forging-material-link').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.locator('#forge-results .forging-material-link').first().click();
    const menu=page.locator('#item-navigation-menu');
    const box=await menu.boundingBox();
    assert.ok(box.x>=0 && box.x+box.width<=321 && box.y>=0 && box.y+box.height<=569,JSON.stringify(box));
    await page.locator('[data-item-navigation-action="equipment"]').click();
    await page.locator('#partition-equipment').waitFor({state:'visible'});
    await page.locator('#partition-equipment [data-item-navigation-back]').click();
    assert.equal(await page.locator('#forge-search').inputValue(),'水寒');
    assert.equal(await page.locator('#forge-mode .active').getAttribute('data-mode'),'material');
    await progress(page); await page.locator('#prog-next').click();
    await page.locator('.progress-equipment-link').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.locator('.progress-equipment-link').first().click();
    await page.locator('[data-item-navigation-action="equipment"]').click();
    await page.locator('#partition-equipment [data-item-navigation-back]').click();
    assert.equal(await page.locator('.prog-name').inputValue(),'测试甲·长名称弟子');
    assert.equal(await page.locator('#prog-search').inputValue(),'');
  } finally {await page.close();}
});

test('transition widths, landscape, low height and CSS zoom retain local scrolling and aligned material columns', async () => {
  const page=await start();
  const measures=[];
  try {
    for(const [width,height] of [[600,800],[767,900],[768,1024],[932,430],[1024,768],[1180,820],[1280,720]]) {
      await page.setViewportSize({width,height});
      await search(page,'雷神锤');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
      if(width>=768 && height>500) {
        const wrap=page.locator('#forge-results .forge-scroll');
        await wrap.evaluate(e=>e.scrollLeft=250);
        const position=await page.locator('.forge-eq').evaluate(e=>e.getBoundingClientRect().left);
        const edge=(await wrap.boundingBox()).x;
        assert.ok(Math.abs(position-edge)<3);
      }
      await progress(page);
      if(await page.locator('#prog-overall').isVisible()) await page.locator('#prog-next').click();
      const details=page.locator('.prog-material-details').first();
      await details.evaluate(e=>e.open=true);
      const label=page.locator('.prog-stage-label').first();
      assert.equal(await label.evaluate(e=>getComputedStyle(e).transform),'none');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1));
      measures.push({width,height,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});
    }
    // CSS zoom is a rendering stress test, not a claim of native browser zoom.
    await page.setViewportSize({width:1366,height:768});
    for(const zoom of [1.25,1.5,2]) {
      await page.evaluate(zoom=>document.documentElement.style.zoom=zoom,zoom);
      await search(page,'雷神锤');
      await shot(page,'css-zoom-'+zoom);
      measures.push({cssZoom:zoom,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});
    }
    fs.writeFileSync(path.join(out,'transitions.json'),JSON.stringify(measures,null,2));
  } finally {await page.close();}
});

test('owned and required copies keep independent detail state and keyboard focus after an edit', async () => {
  const page=await start(390,844,{version:2,disciples:[{id:'dual',name:'水寒持有者',items:[
    {id:'water',forgeName:'水寒',equipmentName:'水寒',quality:'red',progress:0}
  ]}]});
  try {
    await progress(page);
    await page.locator('#prog-search').fill('水寒'); await page.waitForTimeout(220);
    const owned=page.locator('#prog-search-results .prog-search-section').filter({has:page.locator('h3',{hasText:'弟子直接持有'})});
    const required=page.locator('#prog-search-results .prog-search-section').filter({has:page.locator('h3',{hasText:'尚未完成的锻造材料需求'})});
    assert.equal(await owned.locator('.prog-equip').count(),1);
    assert.equal(await required.locator('.prog-equip').count(),1);
    await owned.locator('details').evaluate(e=>e.open=false);
    await required.locator('details').evaluate(e=>e.open=true);
    const stage=required.locator('[data-act="set-stage"][data-idx="1"]');
    await stage.focus(); await stage.press('Enter');
    assert.equal(await owned.locator('details').getAttribute('open'),null);
    assert.equal(await required.locator('details').getAttribute('open'),'');
    assert.equal(await required.locator('[data-idx="1"]').evaluate(e=>e===document.activeElement),true);
  } finally {await page.close();}
});

test('touch actions, short-viewport menu scrolling and failed storage feedback remain usable', async () => {
  const page=await start(390,844,fixture,{hasTouch:true,isMobile:true});
  try {
    await progress(page); await page.locator('#prog-next').tap();
    await page.locator('[data-act="toggle-add"]').tap();
    await page.locator('.prog-item-search').fill('墨眉');
    await page.locator('.prog-item-opt').first().tap();
    await page.locator('[data-act="add-item"]').tap();
    assert.equal((await getAccountJson(page,key)).disciples[0].items.length,3);
    await page.locator('[data-act="set-stage"][data-item="ui-i1"][data-idx="2"]').tap();
    assert.equal((await getAccountJson(page,key)).disciples[0].items[0].progress,2);
    await page.setViewportSize({width:844,height:390});
    const trigger=page.locator('.progress-equipment-link').first();
    await trigger.scrollIntoViewIfNeeded(); await page.waitForTimeout(100); await trigger.tap();
    const menu=page.locator('#item-navigation-menu');
    await menu.waitFor({state:'visible'});
    await menu.evaluate(e=>e.scrollTop=e.scrollHeight);
    await page.waitForTimeout(100);
    assert.equal(await menu.isVisible(),true);
    await shot(page,'touch-landscape-menu');
    await page.locator('#item-navigation-close').click();
    const raw=await getAccountJson(page,key);
    await page.evaluate(()=>{window.QinshiAccounts.setItem=()=>{throw new Error('isolated test storage error');};});
    await page.locator('[data-act="set-stage"][data-item="ui-i1"][data-idx="3"]').click();
    assert.match(await page.locator('#prog-save-tip').innerText(),/保存失败/);
    assert.deepEqual(await getAccountJson(page,key),raw);
  } finally {await page.close();}
});

test('phone stage controls keep a 44px touch target', async () => {
  const page=await start(390,844);
  try {
    await progress(page); await page.locator('#prog-next').click();
    const size=await page.locator('.prog-stage').first().boundingBox();
    assert.ok(size.height>=44,JSON.stringify(size));
  } finally {await page.close();}
});
