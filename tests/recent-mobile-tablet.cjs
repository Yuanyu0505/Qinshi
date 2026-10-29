const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
const artifacts=path.resolve('test-results/recent-mobile-tablet');
let browser,server,url;
before(async()=>{
  fs.mkdirSync(artifacts,{recursive:true});
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function pageAt(width,height=1000){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:Math.min(width,height)<600,serviceWorkers:'block'});
  page.errors=[];page.on('pageerror',error=>page.errors.push(error.message));
  await openApp(page,url,{waitUntil:'load'});
  await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());return page;
}
async function noOverflow(page,label){
  const size=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(size.page<=size.viewport+1,label+JSON.stringify(size));
}
async function contained(locator,container,label){
  const outer=await container.boundingBox(),boxes=await locator.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {text:node.textContent,width:r.width,left:r.left,right:r.right};}).filter(r=>r.width));
  assert.ok(outer);for(const box of boxes)assert.ok(box.left>=outer.x-1&&box.right<=outer.x+outer.width+1,label+JSON.stringify({outer,box}));
}
for(const [width,height] of [[320,1000],[390,1000],[768,1000],[1024,1000],[1280,1000],[844,390],[1024,768]]){
  test(width+'×'+height+' touch: continuous flow, failures, zoom and favorite filters remain usable',async()=>{
    const page=await pageAt(width,height);
    try{
      await page.locator('[data-mode="crafting-paths"]').click();const section=page.locator('#inscription-crafting-paths');
      await section.locator('[data-craft-field="dun"]').selectOption('鬼遁');
      for(let i=0;i<3;i++)await section.locator('[data-craft-field="attr"]').nth(i).selectOption('速');
      assert.equal(await section.locator('[data-craft-field="x-term"]').inputValue(),'');
      await section.locator('[data-craft-action="generate"]').click();
      const route=section.locator('details.craft-strategy').first();await route.waitFor();
      const viewer=route.locator('[data-flow-viewer]'),toolbar=viewer.locator('.craft-flow-toolbar');
      await toolbar.waitFor();
      await page.screenshot({path:path.join(artifacts,width+'x'+height+'-flow.png'),fullPage:true});
      await contained(toolbar.locator('button'),viewer,'toolbar clipped at '+width);
      if(width<=1024){
        const viewport=viewer.locator('.craft-flow-viewport');
        assert.ok((await viewport.boundingBox()).height<=height*.72+1,'phone/tablet diagram should scroll inside a bounded viewport');
        assert.ok(await viewport.evaluate(node=>node.scrollWidth>node.clientWidth),'wide diagram retains local horizontal scrolling');
      }
      if(width<=420){
        const lines=await toolbar.locator('[data-craft-action="diagram-failures"]').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);return range.getClientRects().length;});
        assert.equal(lines,1,'failure toggle must not become a narrow multi-line column on a phone');
      }
      const attrs=section.locator('[data-craft-attrs] select');
      const ys=await attrs.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().top));
      assert.ok(Math.max(...ys)-Math.min(...ys)<2,'target attributes should remain in one row');
      const toggle=toolbar.locator('[data-craft-action="diagram-failures"]');
      await toggle.tap();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      await toolbar.locator('[data-craft-action="diagram-out"]').tap();assert.equal(await viewer.getAttribute('data-zoom'),'0.8');
      await toolbar.locator('[data-craft-action="diagram-reset"]').tap();assert.equal(await viewer.getAttribute('data-zoom'),'0.9');
      await route.locator('[data-craft-action="toggle-favorite"]').tap();
      await page.waitForFunction(()=>document.querySelector('#inscription-crafting-paths .craft-favorite-star.is-favorite'));
      await page.locator('[data-mode="crafting-favorites"]').tap();
      const favorites=page.locator('#inscription-crafting-favorites');
      assert.equal(await favorites.locator('.craft-favorite-route').count(),1);
      await favorites.locator('[data-favorite-field="dun"]').selectOption('鬼遁');
      for(let i=0;i<3;i++)await favorites.locator('[data-favorite-field="attr'+i+'"]').selectOption('速');
      assert.equal(await favorites.locator('.craft-favorite-route').count(),1);
      await favorites.locator('.craft-favorite-route summary').tap();
      await contained(favorites.locator('.craft-flow-toolbar button'),favorites.locator('[data-flow-viewer]'),'favorite toolbar clipped '+width);
      await noOverflow(page,'favorite page '+width);assert.deepEqual(page.errors,[]);
    }finally{await page.close();}
  });
  test(width+'×'+height+' touch: personal progress blue grades, fixed terms and saved cards fit their panel',async()=>{
    const page=await pageAt(width,height);
    try{
      const search=page.locator('#ins-progress-search');await search.fill('神镜仙端木蓉');
      const suggestion=page.locator('#ins-progress-suggestions .ins-suggestion');await suggestion.waitFor();
      await contained(suggestion,page.locator('#ins-progress-suggestions'),'suggestion list '+width);
      const inputBox=await search.boundingBox(),listBox=await page.locator('#ins-progress-suggestions').boundingBox();
      assert.ok(Math.abs(inputBox.x-listBox.x)<=2&&Math.abs(inputBox.width-listBox.width)<=2,'search list alignment');
      await suggestion.tap();const rows=page.locator('.ins-editor-slot');assert.equal(await rows.count(),5);
      const first=rows.nth(0),second=rows.nth(1);
      await first.locator('.ins-edit-quality').selectOption('b1');
      await first.locator('.ins-edit-sub:visible').first().selectOption({index:1});
      await second.locator('.ins-edit-quality').selectOption('b2');
      await second.locator('.ins-edit-sub:visible').first().selectOption({index:1});
      assert.equal(await first.locator('.ins-edit-sub:visible').count(),1);
      assert.equal(await second.locator('.ins-edit-sub:visible').count(),1);
      await noOverflow(page,'editor '+width);
      await page.locator('#ins-progress-editor [data-action="save"]').tap();
      const card=page.locator('.ins-progress-card').first();await card.waitFor();
      await page.screenshot({path:path.join(artifacts,width+'x'+height+'-progress.png'),fullPage:true});
      await contained(card.locator('.ins-saved-slot'),card,'saved slots '+width);
      await contained(card.locator('.ins-saved-substats'),card,'saved terms '+width);
      await noOverflow(page,'saved progress '+width);
      await page.locator('[data-mode="query"]').tap();
      await page.locator('#ins-disciple-group').selectOption('common');
      await noOverflow(page,'query '+width);assert.deepEqual(page.errors,[]);
    }finally{await page.close();}
  });
}
