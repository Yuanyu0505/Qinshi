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
test('failed Workers safely stop a beast job, support retry rejection and never run sync fallback',async()=>{
  let port;
  class FailedWorker{constructor(){port=this;}postMessage(){}terminate(){this.terminated=true;}}
  let calls=0;
  const runner=load(FailedWorker).create({kind:'beast-single',fallback(){calls++;}});
  const job=runner.run({});const failure=assert.rejects(job,/后台计算/);
  port.onerror({preventDefault(){}});await failure;
  assert.equal(port.terminated,true);assert.equal(calls,0);
  await assert.rejects(runner.run({}),/后台计算/);assert.equal(calls,0);runner.dispose();
});
