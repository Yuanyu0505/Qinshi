'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js'),{ensureTestAccount}=require('./browser-test-helpers.cjs');
test('installed actual 1.0.100 upgrades across minor version to 1.1.0 and retains account and offline reference', {timeout:120000},async()=>{
 const commit='599ef047d2ce8f51933418ad478bac38e461eeb4',gitArgs=['-c','safe.directory=C:/Users/pghyl/Desktop/deepseek'];
 const files=cp.execFileSync('git',gitArgs.concat(['ls-tree','-r','--name-only','-z',commit]),{encoding:'utf8'}).split('\0').filter(f=>/^(js|css|data|icons|images)\//.test(f)||/^(index.html|service-worker.js|version.json|manifest.webmanifest)$/.test(f));
 const batch=cp.execFileSync('git',gitArgs.concat(['cat-file','--batch']),{input:files.map(f=>commit+':'+f+'\n').join(''),maxBuffer:256*1024*1024}),old=new Map();let offset=0;
 for(const file of files){const end=batch.indexOf(10,offset),head=batch.subarray(offset,end).toString();assert.match(head,/^[a-f0-9]+ blob \d+$/);const size=Number(head.split(' ')[2]);old.set(file,batch.subarray(end+1,end+1+size));offset=end+1+size+1;}
 const server=createServer(),serve=server.listeners('request')[0];server.removeListener('request',serve);let oldMode=true,browser,context;
 server.on('request',(req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname),key=pathname==='/'?'index.html':pathname.slice(1);if(oldMode&&old.has(key)){res.writeHead(200,{'Content-Type':/\.js$/.test(key)?'text/javascript; charset=utf-8':/\.css$/.test(key)?'text/css':/\.json$/.test(key)?'application/json':/\.html$/.test(key)?'text/html':'application/octet-stream','Cache-Control':'no-store'});res.end(old.get(key));}else serve(req,res);});
 try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',r=>new URL(r.request().url()).origin===url?r.continue():r.abort());const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url,{waitUntil:'networkidle'});await ensureTestAccount(p);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('#pwa-version').innerText(),'1.0.100');
 const saved=await p.evaluate(()=>{window.QinshiAccounts.setItem('qinshi_atlas_target_level_v1','15');return {account:window.QinshiAccounts.currentAccount().id,value:window.QinshiAccounts.getItem('qinshi_atlas_target_level_v1')};});
 oldMode=false;await p.evaluate(()=>window.QinshiPWA.checkForUpdate());await p.locator('#pwa-update-notice').waitFor({state:'visible',timeout:30000});await Promise.all([p.waitForNavigation({waitUntil:'networkidle'}),p.locator('#pwa-apply-update').click()]);
 assert.equal(await p.locator('#pwa-version').innerText(),'1.1.0');assert.equal(await p.evaluate(()=>window.QinshiAccounts.currentAccount().id),saved.account);
 await context.setOffline(true);await p.goto(url+'/#other-reference',{waitUntil:'networkidle'});const response=await p.reload({waitUntil:'networkidle'});assert.equal(response.fromServiceWorker(),true);await p.locator('[data-ref-section="elements"]').click();assert.match(await p.locator('[data-ref-table] option:checked').innerText(),/需求数量/);assert.equal(await p.locator('.ref-table tbody tr').count(),25);assert.equal(await p.evaluate(()=>window.QinshiAccounts.getItem('qinshi_atlas_target_level_v1')),saved.value);
 const caches=await p.evaluate(()=>window.caches.keys());assert.ok(caches.includes('qinshi-site-1.1.0'));assert.ok(!caches.includes('qinshi-site-1.0.100'));assert.deepEqual(errors,[]);
 }finally{if(context)await context.close();if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
