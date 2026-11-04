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

function row(name,discipleQuality='红色神将',slot='天府|人遁',terms=[{attr:'技能穿透',tier:'M'},{attr:'技能穿透',tier:'L'},null]) {
 return {name,discipleQuality,discipleKey:discipleQuality+'\0'+name,slot,dun:slot.split('|')[1],quality:'o2',terms,attrs:terms.map(t=>t?t.attr:'')};
}
test('reverse result grouping hides ordinary by default and puts surviving divine identities first',()=>{
 assert.equal(typeof X.groupResults,'function');
 const rows=[row('鬼谷盖聂','普通橙色'),row('神鬼谷盖聂'),row('其他','普通橙色')];
 assert.deepEqual(X.groupResults(rows).map(c=>c.members.map(r=>r.name)),[['神鬼谷盖聂']]);
 assert.deepEqual(X.groupResults(rows,{ordinary:true}).map(c=>c.members.map(r=>r.name)),[['神鬼谷盖聂','鬼谷盖聂'],['其他']]);
});
test('explicit pairs and exact full names are additive but positions and combinations stay separate',()=>{
 const rows=[row('兵家王翦','普通橙色'),row('王翦','普通橙色'),row('神·王翦'),row('王翦','普通橙色','天相|人遁'),row('镜仙端木蓉','普通橙色'),row('神端木蓉')];
 rows[0].terms.reverse();
 const cards=X.groupResults(rows,{ordinary:true},{atlasTargets:{'兵家王翦':['兵家王翦','神·王翦']}});
 assert.equal(cards.length,4);
 assert.equal(cards.find(c=>c.members.some(r=>r.name==='神·王翦')).members.length,3);
 assert.equal(cards.find(c=>c.members.some(r=>r.name==='神端木蓉')).members.length,1);
 assert.equal(X.groupResults([row('神王翦'),row('王翦','普通橙色','天府|人遁',[{attr:'技能穿透',tier:'M'},null,null])],{ordinary:true}).length,2);
});
test('result filters run on individuals before merging without sharing common or formation classification',()=>{
 const rows=[row('神鬼谷盖聂'),row('鬼谷盖聂','普通橙色'),row('神王翦')];
 const context={commonKeys:new Set(['普通橙色\0鬼谷盖聂']),formationNames:new Set(['神王翦'])};
 assert.deepEqual(X.groupResults(rows,{ordinary:true,group:'common'},context)[0].members.map(r=>r.name),['鬼谷盖聂']);
 assert.deepEqual(X.groupResults(rows,{ordinary:true,group:'formation'},context)[0].members.map(r=>r.name),['神王翦']);
 assert.deepEqual(X.groupResults(rows,{ordinary:true,group:'other'},context)[0].members.map(r=>r.name),['神鬼谷盖聂']);
 assert.equal(X.groupResults(rows,{ordinary:true,search:'鬼谷',prefix:'天相'},context).length,0);
 assert.equal(X.groupResults(rows,{ordinary:true,dun:'鬼遁'},context).length,0);
 assert.equal(X.groupResults(rows,{ordinary:true,search:'神·鬼谷盖聂'},context).length,1);
 assert.equal(X.groupResults(rows,{group:'common'},context).length,0);
});
