const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const dataPath=require('node:path').join(__dirname,'../data/formation-max-reference.js');
function data(){return fs.existsSync(dataPath)?require(dataPath):{formations:[]};}
test('level300 source preserves all 19 formations and hand-checked attack defense health',()=>{
  const d=data();assert.equal(d.formations.length,19);
  const item=d.formations.find(f=>f.name==='地泽二十四').members.find(m=>m.name==='典庆');
  assert.deepEqual([item.attack,item.defense,item.hp,item.position,item.trainAttribute,item.gainAttribute],[161865,130432,1083264,1,'血','血']);
  const last=d.formations.find(f=>f.name==='潜龙在渊').members.find(m=>m.name==='神·霸道田虎');
  assert.deepEqual([last.attack,last.defense,last.hp,last.position],[344047,148845,1471297,null]);
  const supreme=d.formations.find(f=>f.name==='太极两仪');
  assert.equal(supreme.stones,5);
  assert.deepEqual(supreme.members.map(m=>m.name),['神·凤吟弄玉','神·森罗大司命','神·太虚月神','神·兰轩紫女','神·极诣星魂','神·红莲赤练','神·墨家雪女','神·素华少司命']);
  assert.deepEqual([supreme.members[0].attack,supreme.members[0].defense,supreme.members[0].hp],[322158,152194,1685137]);
  assert.deepEqual([supreme.members[5].position,supreme.members[5].trainAttribute,supreme.members[5].gainAttribute],[6,'血','护盾']);
});
test('unrecommended source rows remain null instead of manufacturing a position',()=>{
  const d=data();assert.ok(d.formations.length);
  const item=d.formations.find(f=>f.name==='妙法阴阳').members.find(m=>m.name==='月神');
  assert.deepEqual([item.position,item.trainAttribute,item.gainAttribute],[null,null,null]);
  const all=d.formations.flatMap(f=>f.members);assert.equal(all.length,144);
  assert.deepEqual(d.formations.map(f=>f.members.length),[7,6,6,6,6,7,8,12,8,8,8,8,7,8,8,7,8,8,8]);
  assert.equal(new Set(d.formations.map(f=>f.name)).size,19);
  assert.ok(d.formations.every(f=>new Set(f.members.map(m=>m.name)).size===f.members.length));
  assert.ok(all.every(m=>[m.attack,m.defense,m.hp].every(v=>Number.isSafeInteger(v)&&v>0)));
});
function api(){const c={FORMATION_MAX_REFERENCE_DATA:data(),QinshiNumberFormat:require('../js/number-format.js')};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/formations-ui.js'),'utf8'),c);return c.FORMATIONS_UI;}
test('max reference searches name and formation, sorts independent copies without changing source',()=>{
  const a=api();assert.equal(typeof a.maxReferenceRows,'function');const before=JSON.stringify(data());
  assert.equal(a.maxReferenceRows({formation:'妙法阴阳',query:'月神',sort:'source'}).length,1);
  assert.equal(a.maxReferenceRows({formation:'',query:'不存在',sort:'attack'}).length,0);
  const rows=a.maxReferenceRows({formation:'妙法阴阳',query:'',sort:'attack'});
  assert.equal(rows[0].name,'焱妃');assert.equal(rows[0].attack,168382);
  assert.equal(JSON.stringify(data()),before);
});
