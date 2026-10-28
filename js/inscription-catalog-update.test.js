'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('god mirror Duanmu stays independent and receives exactly five confirmed positions',()=>{
  const ordinary={name:'镜仙端木蓉',quality:'普通橙色',slots:[]},originalGod={name:'神端木蓉',quality:'红色神将',slots:[]};
  const context={window:{INSCRIPTION_DATA:{items:[ordinary,originalGod],meta:{total:2}}}};
  const source=fs.readFileSync(require.resolve('../data/2026-10-inscription-update.js'),'utf8');
  vm.runInNewContext(source,context);vm.runInNewContext(source,context);
  const data=context.window.INSCRIPTION_DATA,added=data.items.find(item=>item.name==='神镜仙端木蓉');
  assert.equal(data.items.length,3);assert.equal(data.meta.total,3);
  assert.equal(data.items[0],ordinary);assert.equal(data.items[1],originalGod);
  assert.deepEqual(JSON.parse(JSON.stringify(added.slots)),[
    {tian:'天府',shield:'地遁'},{tian:'天相',shield:'神遁'},{tian:'天同',shield:'云遁'},
    {tian:'天梁',shield:'人遁'},{tian:'天机',shield:'风遁'}
  ]);
});
