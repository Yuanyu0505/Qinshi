const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('./inscription-reverse.js');
const R=require('./inscription-rules.js');
test('reverse capacity follows quality and truncates excess repeated picks',()=>{
 assert.deepEqual(X.normalizeDraft({quality:'p2',dun:'地遁',attrs:['技能穿透','技能穿透','防']}).attrs,['技能穿透','技能穿透']);
 assert.equal(X.normalizeDraft({quality:'b2',attrs:['防','血']}).attrs.length,1);
});
test('single attribute fills all legal target tiers and uses null for non-query filler',()=>{
 assert.deepEqual(X.combinations('地遁','o2',['技能穿透']).map(a=>a.map(t=>t&&t.tier)),[['H','M','L']]);
 const a=X.combinations('人遁','o2',['技能穿透']);assert.equal(a.length,1);assert.deepEqual(a[0].filter(Boolean).map(t=>R.value(t,'o2')),[5,4]);assert.equal(a[0].filter(t=>t===null).length,1);
});
test('all maximal allocations are retained without lower dominated variants',()=>{
 const found=X.combinations('地遁','o2',['技能穿透','PVP速']);
 assert.equal(found.length,2);
 assert.deepEqual(found.map(a=>a.filter(t=>t&&t.attr==='技能穿透').length).sort(),[1,2]);
 assert.ok(found.every(a=>!a.includes(null)));
 assert.ok(found.every(a=>R.validate({prefix:'天府',dun:'地遁',quality:'o2',origin:'crafted',terms:a}).valid));
});
test('minimum repetition and whole-item origin legality reject impossible requests',()=>{
 assert.equal(X.combinations('人遁','o2',['技能穿透','技能穿透','技能穿透']).length,0);
 assert.equal(X.combinations('人遁','p2',['技能穿透','技能穿透']).length,0,'M+L cannot coexist in washed or crafted p2');
 assert.equal(X.combinations('鬼遁','o2',['技能穿透']).length,0);
 assert.equal(X.combinations('地遁','o2',['速']).length,0);
});
test('duns and candidate options exclude incompatible pairs and repeated counts',()=>{
 const draft={quality:'o2',dun:'',attrs:['速','','']};
 assert.deepEqual(X.duns(draft).map(d=>d.id),['鬼遁']);
 assert.ok(!X.options(draft,1).includes('技能穿透'));
 assert.ok(X.options(draft,1).includes('速'));
 assert.ok(!X.options({quality:'o2',dun:'鬼遁',attrs:['暴击伤害','暴击伤害','']},2).includes('暴击伤害'));
});
test('dun labels explain current tiers and ambiguous blue speed',()=>{
 assert.match(X.duns({quality:'o2',attrs:['技能穿透']}).find(d=>d.id==='人遁').label,/中.*低/);
 assert.match(X.duns({quality:'b2',attrs:['速']})[0].label,/档位不可辨/);
});
test('search ignores unrelated disciple selection, deduplicates slots and returns blank X attrs',()=>{
 const items=[{name:'甲',quality:'红色神将',slots:[{tian:'天府',shield:'人遁'},{tian:'天府',shield:'人遁'}]},{name:'乙',quality:'普通橙色',slots:[{tian:'天相',shield:'地遁'}]}];
 const found=X.search(items,{quality:'o2',dun:'',attrs:['技能穿透'],discipleKey:'ignored'});
 assert.equal(found.length,2);assert.equal(found[0].discipleKey,'红色神将\0甲');
 assert.deepEqual(found[0].attrs,['技能穿透','技能穿透','']);
 assert.equal(X.search(items,{quality:'o2',dun:'鬼遁',attrs:['技能穿透']}).length,0);
 assert.equal(X.search(items,{quality:'o2',dun:'',attrs:[]}).length,0);
});
test('cached results cannot be modified by a caller',()=>{
 const a=X.combinations('人遁','o2',['技能穿透']);a[0][0].tier='H';
 assert.equal(X.combinations('人遁','o2',['技能穿透'])[0][0].tier,'M');
});

test('reverse drafts isolate pages/accounts and reject stale, readonly and damaged writes',()=>{
 const data=new Map();let owner='a',readonly=false;
 const storage={currentAccount:()=>({id:owner}),getItem:k=>data.get(owner+':'+k)??null,setItem:(k,v)=>{if(readonly)return false;data.set(owner+':'+k,v);return true;}};
 const paths=X.createDraftStore(storage,'crafting-paths'),sim=X.createDraftStore(storage,'crafting-simulator');
 const d=X.normalizeDraft({attrs:['速']});
 const saved=paths.save(d,true,null,'a');assert.equal(saved.draft.attrs[0],'速');assert.equal(sim.inspect().draft.attrs[0],'');
 assert.throws(()=>paths.save(d,true,null,'a'),/其他页面/);
 readonly=true;assert.throws(()=>paths.save(d,false,saved.token,'a'),/只读/);assert.equal(paths.inspect().token,saved.token);readonly=false;
 owner='b';assert.equal(paths.inspect().draft.attrs[0],'');assert.throws(()=>paths.save(d,true,null,'a'),/账号已切换/);
 data.set('b:'+paths.key,'damaged');assert.equal(paths.inspect().valid,false);assert.throws(()=>paths.save(d,true,'damaged','b'),/异常/);assert.equal(data.get('b:'+paths.key),'damaged');
});
