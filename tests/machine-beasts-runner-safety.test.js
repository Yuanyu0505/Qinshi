'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function load(Worker){
  const root={setTimeout,clearTimeout,URL,structuredClone,Worker,location:{protocol:'http:'},document:{currentScript:{src:'http://localhost/js/calculation-runner.js?v=test'}}};
  const context={window:root,globalThis:root,module:{exports:{}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/calculation-runner.js'),'utf8'),context);
  return context.module.exports;
}
test('unavailable Workers do not enter a blocking beast fallback',async()=>{
  for(const kind of ['beast-single','beast-school']){
    let calls=0;
    const runner=load(undefined).create({kind,fallback(){calls++;return 'should not execute';}});
    await assert.rejects(runner.run({}),/后台计算/);
    assert.equal(calls,0);runner.dispose();
  }
});
for(const kind of ['beast-single','beast-school']){
  test(kind+' retries a temporary constructor failure only on the next explicit run',async()=>{
    let attempts=0,port,calls=0;
    class TemporaryWorker{
      constructor(){if(++attempts===1)throw Error('temporary loading failure');port=this;}
      postMessage(message){this.message=message;}
      terminate(){this.terminated=true;}
    }
    const runner=load(TemporaryWorker).create({kind,fallback(){calls++;}});
    await assert.rejects(runner.run({value:1}),/后台计算/);
    assert.equal(attempts,1);
    const recovered=runner.run({value:2});
    recovered.catch(()=>{});
    assert.equal(attempts,2);
    port.onmessage({data:{id:port.message.id,result:'recovered'}});
    assert.equal(await recovered,'recovered');assert.equal(calls,0);runner.dispose();
  });

  test(kind+' safely rejects repeated Worker errors and recovers without accepting old packets or errors',async()=>{
    const ports=[];let calls=0;
    class TemporaryWorker{
      constructor(){ports.push(this);}
      postMessage(message){this.message=message;}
      terminate(){this.terminated=true;}
    }
    const runner=load(TemporaryWorker).create({kind,fallback(){calls++;}});
    for(let attempt=0;attempt<3;attempt++){
      const failed=assert.rejects(runner.run({attempt}),/后台计算/);
      assert.equal(ports.length,attempt+1);
      ports[attempt].onerror({preventDefault(){}});
      await failed;assert.equal(ports[attempt].terminated,true);
      assert.equal(ports.length,attempt+1,'failure must not automatically create another Worker');
    }
    const recovering=runner.run({attempt:3});
    assert.equal(ports.length,4);
    const canceled=assert.rejects(recovering,error=>error.name==='AbortError');
    const fresh=runner.run({attempt:4});
    await canceled;assert.equal(ports[3].terminated,true);assert.equal(ports.length,5);
    for(const old of ports.slice(0,-1)){
      old.onmessage({data:{id:old.message.id,result:'stale'}});
      old.onmessage({data:{id:old.message.id,error:'stale failure'}});
      old.onerror({preventDefault(){}});
    }
    assert.notEqual(ports[4].terminated,true,'old errors must not terminate the new Worker');
    ports[4].onmessage({data:{id:ports[3].message.id,result:'wrong job'}});
    ports[4].onmessage({data:{id:ports[4].message.id,result:'fresh'}});
    assert.equal(await fresh,'fresh');assert.equal(calls,0);runner.dispose();
  });
}

test('non-beast Worker failure retains permanent asynchronous fallback policy',async()=>{
  let attempts=0,port,calls=0;
  class TemporaryWorker{constructor(){attempts++;port=this;}postMessage(){}terminate(){}}
  const runner=load(TemporaryWorker).create({kind:'wooden',fallback(input){calls++;return input.value;}});
  const first=runner.run({value:1});port.onerror({preventDefault(){}});
  assert.equal(await first,1);
  assert.equal(await runner.run({value:2}),2);
  assert.equal(attempts,1);assert.equal(calls,2);runner.dispose();
});
