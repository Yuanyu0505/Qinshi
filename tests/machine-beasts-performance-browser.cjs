'use strict';
// Local Worker diagnostics only. Production files contain no telemetry hooks.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../serve.js');
const {openApp}=require('./browser-test-helpers.cjs');
let browser,server,origin;
before(async()=>{server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({channel:'msedge',headless:true});});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
test('seven mixed-stock pressure cases complete in real Workers with responsive page',async()=>{
  const context=await browser.newContext({serviceWorkers:'block'});
  try{
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();await openApp(page,origin+'/#machine-beasts');
    let source=fs.readFileSync(require.resolve('../js/machine-beasts.js'),'utf8');
    const initial='rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:Array(types.length).fill(0)}];',put='bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});rows[r]=bucket;';
    assert.ok(source.includes(initial)&&source.includes(put));
    source=source.replace(initial,'probe.domain(types,unit,rows.length);'+initial).replace(put,put+'probe.put(r,bucket.length);');
    await context.route('**/js/machine-beasts.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
    const workerSource=fs.readFileSync(require.resolve('../js/calculation-worker.js'),'utf8');
    const diagnostics=`var diagnosticStart=performance.now(),diagnosticBuckets=new Map(),diagnostics={puts:0,states:0,peakStates:0,frontierPeak:0};
      var probe={domain:function(types,unit,length){diagnostics.candidates=types.length;diagnostics.researchGcd=unit;diagnostics.bucketCapacity=length;},put:function(r,size){diagnostics.puts++;diagnostics.states+=size-(diagnosticBuckets.get(r)||0);diagnosticBuckets.set(r,size);diagnostics.peakStates=Math.max(diagnostics.peakStates,diagnostics.states);diagnostics.frontierPeak=Math.max(diagnostics.frontierPeak,size);}};
      var nativePost=self.postMessage.bind(self);self.postMessage=function(message){diagnostics.elapsedMs=performance.now()-diagnosticStart;diagnostics.stateBuckets=diagnosticBuckets.size;diagnostics.workerHeapBytes=performance.memory?performance.memory.usedJSHeapSize:null;message.diagnostics=diagnostics;nativePost(message);};`;
    await context.route('**/js/calculation-worker.js*',route=>route.fulfill({contentType:'application/javascript',body:diagnostics+workerSource}));
    const cases=[['zero-plain','zero',false,false],['zero-seven-plain','zeroToSeven',false,false],['zero-mods','zero',true,false],['zero-seven-mods','zeroToSeven',true,false],['mixed-high-plain','zeroToSeven',false,true],['mixed-high-mods','zeroToSeven',true,true],['reported-four-modifications','zeroToSeven',true,false]];
    for(const [id,mode,mods,mixed]of cases){
      const result=await page.evaluate(async({id,mode,mods,mixed})=>{
        const inventory={};for(const modification of window.MACHINE_BEAST_DATA.modifications){
          if(id==='reported-four-modifications'&&!['none','initial','heaven','fullDivine'].includes(modification.id))continue;
          inventory[modification.id]={};for(let rank=0;rank<=7;rank++)inventory[modification.id][rank]=2;
          if(mixed)for(let rank=8;rank<=10;rank++)inventory[modification.id][rank]=1;
        }
        let ticks=0;const timer=setInterval(()=>ticks++,5),start=performance.now();
        const message=await new Promise((resolve,reject)=>{
          const worker=new Worker('/js/calculation-worker.js?performance1142');
          worker.onmessage=event=>{worker.terminate();resolve(event.data);};worker.onerror=error=>{worker.terminate();reject(Error(error.message));};
          worker.postMessage({id:1,kind:'beast-single',input:{beastId:'mechanical-bear',progress:{showHighRanks:true,showMods:true,inventory},options:{targetLevel:20,newRankMode:mode,allowNewModifications:mods,allowNewHighRanks:false,convertOwnedInventory:true}}});
        });clearInterval(timer);
        return {id,ticks,roundTripMs:performance.now()-start,error:message.error,valid:message.result?.valid,totals:message.result?.totals,diagnostics:message.diagnostics};
      },{id,mode,mods,mixed});
      console.log('WORKER_PERFORMANCE '+JSON.stringify(result));
      assert.equal(result.error,undefined);assert.equal(result.valid,true);assert.equal(result.totals.investedCount,3);assert.equal(result.totals.newInvestedCount,0);
      assert.ok(result.ticks>0,'main page must keep responding during Worker computation');
      assert.ok(result.diagnostics.peakStates>0);assert.equal(result.diagnostics.frontierPeak,2);
    }
  }finally{await context.close();}
});
