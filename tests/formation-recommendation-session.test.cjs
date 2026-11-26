// Session/Worker lifecycle contract; written but NOT_RUN for this change.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(protocol='https:'){
 const workers=[];
 class Worker {constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}}
 const root={Worker,location:{protocol},FORMATIONS:{recommendFormation:()=>({exactScore:'144',scoreDenominator:'12'})}};
 const sandbox={window:root,Worker,Map,Promise,BigInt};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/formation-recommendation-ui.js'),'utf8'),sandbox);
 return {api:root.FORMATION_RECOMMENDATION_UI,workers};
}
test('cancel terminates the actual worker and rejects its pending result',async()=>{
 const {api,workers}=fixture();const promise=api.run('personal',{}, {},{});
 const rejected=assert.rejects(promise,/计算已取消/);api.cancel('personal');await rejected;
 assert.equal(workers[0].terminated,true);
 workers[0].onmessage({data:{result:{stale:true}}});
});
test('new request cancels only its own scope and old completion cannot replace it',async()=>{
 const {api,workers}=fixture();const old=api.run('personal',{}, {},{});const rejected=assert.rejects(old,/计算已取消/);
 const limit=api.run('limit',{}, {},{});const next=api.run('personal',{}, {},{});await rejected;
 workers[0].onmessage({data:{result:{id:'stale'}}});
 workers[1].onmessage({data:{result:{id:'limit'}}});workers[2].onmessage({data:{result:{id:'new'}}});
 assert.equal((await limit).id,'limit');assert.equal((await next).id,'new');
 assert.ok(workers.every(worker=>worker.terminated));
});
test('file protocol retains explicit synchronous exact fallback, no worker pretending to cancel',async()=>{
 const {api,workers}=fixture('file:');const result=await api.run('personal',{}, {},{});
 assert.equal(result.exactScore,'144');assert.equal(workers.length,0);
});
