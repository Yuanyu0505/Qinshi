const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,url;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});fs.mkdirSync('test-results/1071-visual',{recursive:true});});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
const fixtures=[
  {name:'焚天钺',stats:['25%攻','15%穿透'],effect:'全队暴击伤害提升1.5%',materials:['乱神','破阵霸王枪','真刚','凌虚','木剑','刺客列传','焚天钺','掩日','天罡斧','蚩尤']},
  {name:'青岚刀',stats:['25%血','15%技免'],effect:'全队抗暴击提升1.5%',materials:['双剑魍魉','非攻','断水','凌虚','木剑','五德终始','青岚刀','镇岳','撼地镰','镇天刃']},
  {name:'听潮笛',stats:['20%攻','20%血'],effect:'全队攻击提升1%',materials:['水寒','羽刃','号钟琴','凌虚','木剑','乐经','听潮笛','怒涛','天问','凤鸟自舞']}
];
for(const width of [390,768,1440])test(width+' new weapons show only confirmed stats, effects and full forging recipes',async()=>{
  const page=await browser.newPage({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  try{
    await openApp(page,url);
    for(const fixture of fixtures){
      await page.locator('.tab[data-partition="equipment"]').evaluate(el=>el.click());
      await page.locator('#search').fill(fixture.name);
      const result=width<=1024?page.locator('#cards .card'):page.locator('#table-wrap tbody tr');
      await result.waitFor();assert.equal(await result.count(),1);
      const text=await result.textContent();assert.match(text,new RegExp('神兵'+fixture.name));
      assert.equal(await result.locator('.tier-none').filter({hasText:'暂无资料'}).count(),3);
      for(const stat of fixture.stats)assert.ok(text.includes(stat),fixture.name+' missing '+stat);
      const effect=result.locator('.equipment-exclusive-effect');await effect.locator('summary').click();
      assert.ok((await effect.innerText()).includes(fixture.effect));assert.ok((await effect.innerText()).includes('最多10层'));
      if(fixture.name==='焚天钺')await result.screenshot({path:'test-results/1071-visual/weapon-'+width+'.png'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await result.locator('.equipment-forge-link').click();
      await page.locator('[data-item-navigation-action="forging"]').click();
      assert.equal(await page.locator('#forge-search').inputValue(),fixture.name);
      await page.waitForFunction(name=>document.querySelector('#forge-results').textContent.includes(name),fixture.name);
      const recipe=await page.locator('#forge-results').innerText();
      for(const material of fixture.materials)assert.ok(recipe.includes(material),fixture.name+' recipe missing '+material);
      assert.equal(await page.locator('#forge-results td[data-label="6→7锻"]').count(),1);
      assert.equal(await page.locator('#forge-results td[data-label="10锻→红金"]').count(),1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
