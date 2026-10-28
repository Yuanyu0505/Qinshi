const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('./browser-test-helpers.cjs');

let browser, server, url;
before(async () => {
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
});
after(async () => {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});

async function openPaths(page) {
  await openApp(page,url,{waitUntil:'load'});
  await page.locator('.tab[data-partition="inscription"]').evaluate(el=>el.click());
  await page.locator('[data-mode="crafting-paths"]').click();
  const section=page.locator('#inscription-crafting-paths');
  await section.locator('[data-craft-field="dun"]').selectOption('鬼遁');
  for(let i=0;i<3;i++)await section.locator('[data-craft-field="attr"]').nth(i).selectOption('速');
  return section;
}

test('empty X remains queryable while concrete X changes preserve the simulation scene',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});
  try{
    const section=await openPaths(page),x=section.locator('[data-craft-field="x-term"]');
    assert.equal(await x.inputValue(),'');
    await section.locator('[data-craft-action="generate"]').click();
    await section.locator('.craft-strategy').first().waitFor();
    assert.match(await section.locator('[data-craft-results]').innerText(),/符号|不分档/);
    await page.locator('[data-mode="crafting-simulator"]').click();
    const simulator=page.locator('#inscription-crafting-simulator');
    const inputs=simulator.locator('[data-sim-term]');
    await inputs.nth(0).selectOption('速:?');await inputs.nth(1).selectOption('速:?');
    await page.locator('[data-mode="crafting-paths"]').click();
    await x.selectOption('防:H');
    await section.locator('[data-craft-action="generate"]').click();
    await section.locator('.craft-strategy').first().waitFor();
    assert.match(await section.locator('[data-craft-results]').innerText(),/具体杂词 X/);
    await page.locator('[data-mode="crafting-simulator"]').click();
    assert.deepEqual(await inputs.evaluateAll(els=>els.map(el=>el.value)),['速:?','速:?']);
    await page.locator('[data-mode="crafting-paths"]').click();
    await x.selectOption('');
    await page.locator('[data-mode="crafting-simulator"]').click();
    assert.deepEqual(await inputs.evaluateAll(els=>els.map(el=>el.value)),['速:?','速:?']);
  }finally{await page.close();}
});

test('an unavailable concrete X route explains its blocked purple source and clear restores empty X',async()=>{
  const page=await browser.newPage({serviceWorkers:'block'});
  try{
    const section=await openPaths(page);
    await section.locator('[data-craft-field="x-term"]').selectOption('血:M');
    await section.locator('[data-craft-action="generate"]').click();
    await section.locator('[data-craft-status]').filter({hasText:'紫二'}).waitFor();
    assert.match(await section.locator('[data-craft-status]').innerText(),/紫二低档＋X.*合法.*来源/);
    assert.equal(await section.locator('.craft-strategy').count(),0);
    await section.locator('[data-craft-action="clear-options"]').click();
    assert.equal(await section.locator('[data-craft-field="x-term"]').inputValue(),'');
    assert.equal(await section.locator('[data-craft-field="dun"]').inputValue(),'');
  }finally{await page.close();}
});
