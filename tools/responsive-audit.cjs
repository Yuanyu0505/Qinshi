// Local, isolated rendering audit. Never connects to production services.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('../serve.js');
const { openApp } = require('../tests/browser-test-helpers.cjs');
const sizes = [[320,568],[375,667],[390,844],[430,932],[600,800],[768,1024],[820,1180],[1024,1366],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[844,390]];
const output = path.resolve(process.env.AUDIT_OUTPUT || 'test-results/responsive-before');
const modes = '[data-mode],[data-machine-beast-mode],[data-tactics-mode],[data-battle-pouch-mode],[data-wooden-mode],[data-realm-mode],[data-halls-mode],[data-six-halls-mode],[data-settings-section]';
(async () => {
 fs.mkdirSync(output,{recursive:true});
 const server = createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin = 'http://127.0.0.1:'+server.address().port;
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const results=[]; const errors=[];
 try {
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<=1024,serviceWorkers:'block'});
  page.setDefaultTimeout(12000);
  page.on('pageerror',e=>errors.push({width,message:e.message}));
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await openApp(page,origin,{waitUntil:'load'});
  const partitions=await page.locator('.tabs .tab[data-partition]').evaluateAll(ns=>ns.map(n=>n.dataset.partition));
  async function capture(partition,mode){
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const result=await page.evaluate(({partition,mode})=>{
    const root=document.getElementById('partition-'+partition);
    const shown=n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return b.width>0&&b.height>0&&s.visibility!=='hidden';};
    const visible=[...root.querySelectorAll('input,select,button,textarea')].filter(shown);
    const short=visible.filter(n=>!['checkbox','radio','hidden'].includes(n.type)&&n.getBoundingClientRect().height<35).map(n=>({tag:n.tagName,id:n.id,cls:n.className,text:(n.innerText||n.placeholder||'').slice(0,35),h:Math.round(n.getBoundingClientRect().height)}));
    const escaped=[...root.querySelectorAll('*')].filter(shown).filter(n=>{
      const b=n.getBoundingClientRect();if(b.right<=innerWidth+2&&b.left>=-2)return false;
      for(let p=n.parentElement;p&&p!==document.body;p=p.parentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return false;}
      return true;
    }).slice(0,8).map(n=>({tag:n.tagName,cls:n.className?.baseVal||n.className,id:n.id,width:Math.round(n.getBoundingClientRect().width)}));
    return {partition,mode,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,short:short.slice(0,12),shortCount:short.length,escaped};
   },{partition,mode}); results.push(result);
   if([390,820,1280].includes(width)&&mode==='main') await page.screenshot({path:path.join(output,`${width}-${partition}.png`)});
  }
  for(const partition of partitions){
   await page.evaluate(p=>document.querySelector('.tab[data-partition="'+p+'"]').click(),partition);
   await page.waitForFunction(p=>{const n=document.getElementById('partition-'+p);return n&&!n.hidden&&window.QinshiPartitionLoader.isReady(p);},partition);
   // Lazy partition initialization must settle before inspecting its controls.
   await page.waitForTimeout(120);
   await capture(partition,'main');
   const choices=await page.locator('#partition-'+partition).locator(modes).evaluateAll(ns=>ns.filter(n=>n.tagName==='BUTTON'&&n.getBoundingClientRect().width).map(n=>({attr:[...n.attributes].find(a=>a.name.startsWith('data-')&&/mode|section/.test(a.name))?.name,value:[...n.attributes].find(a=>a.name.startsWith('data-')&&/mode|section/.test(a.name))?.value})).filter(n=>n.attr));
   for(const c of choices){
    const control=page.locator('#partition-'+partition+' ['+c.attr+'="'+c.value+'"]');
    if(await control.first().isVisible()){await control.first().click();await capture(partition,c.attr+':'+c.value);}
   }
  }
  await page.close();
  fs.writeFileSync(path.join(output,'audit.json'),JSON.stringify({results,errors},null,2));
  console.log(width+'x'+height+' audited: '+results.length+' states, '+results.filter(r=>r.overflow>2).length+' overflowing states');
 }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log('ARTIFACTS='+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
