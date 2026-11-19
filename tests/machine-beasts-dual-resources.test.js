'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const DATA=require('../data/machine-beasts.js'),CORE=require('../js/machine-beasts.js');
const beast=DATA.beasts.find(beast=>beast.id==='red-serpent');
function domain(inventory,options={}){return CORE.conversionMaterials(DATA,beast,CORE.normalizeBeastProgress(beast,{inventory,showHighRanks:true,showMods:true},DATA),{newRankMode:'zero',...options});}
function item(rank,modificationId,count,source='owned-processed'){return {rank,modificationId,count,source,researchEach:CORE.researchFor(DATA,beast,rank,modificationId),sevenRankEquivalent:rank>7?2**(rank-7):1};}
test('core costs are physical per-unit cumulative 0/40/55/75/105/145 independent of rank',()=>{
  assert.deepEqual(DATA.modifications.map(mod=>CORE.modificationCoreNeed(DATA,mod.id)),[0,40,55,75,105,145]);
});
for(const [mods,spent,remaining]of [[['saint','initial'],145,0],[['immortal','heaven'],130,15],[['initial','initial','initial'],120,25],[['heaven','heaven'],110,35]])test('one dismantled rank-ten divine body precisely funds '+mods.join('+'),()=>{
  const d=domain({fullDivine:{10:1}}),before=JSON.stringify(d.pool);
  const result=CORE.allocateConvertedInventory(DATA,beast,d.pool,mods.map(mod=>item(0,mod,1)));
  assert.deepEqual([result.modificationCores.returned,result.modificationCores.spent,result.modificationCores.remaining,result.modificationCores.externalDeficit],[145,spent,remaining,0]);
  assert.equal(result.inventoryConversion.remainingBaseBodies,8-mods.length);
  assert.ok(result.unused.some(i=>i.rank===7&&i.modificationId==='none'&&i.count===8-mods.length));
  assert.equal(JSON.stringify(d.pool),before);
});
test('only actual dismantling returns cores; direct original and excluded stock cannot also return',()=>{
  let d=domain({fullDivine:{10:2}}),r=CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(10,'fullDivine',1,'owned'),item(0,'initial',1)]);
  assert.equal(r.modificationCores.returned,145);assert.equal(r.modificationCores.spent,40);
  d=domain({fullDivine:{10:1}});r=CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(10,'fullDivine',1,'owned')]);
  assert.equal(r.modificationCores.returned,0);assert.equal(r.modificationCores.spent,0);
  d=domain({fullDivine:{10:1}},{ownedLimits:{fullDivine:{10:0}}});
  assert.throws(()=>CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(0,'initial',1)]),/本体|神核/);
});
test('145 cores cannot become two divine units without an explicit external-core policy',()=>{
  const d=domain({fullDivine:{10:1}});
  assert.throws(()=>CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(0,'fullDivine',2)]),/神核/);
  const allowed=domain({fullDivine:{10:1}},{allowNewModifications:true});
  const r=CORE.allocateConvertedInventory(DATA,beast,allowed.pool,[item(0,'fullDivine',2)]);
  assert.equal(r.modificationCores.externalDeficit,145);assert.equal(r.modificationCores.estimatedBoxes,725);assert.equal(r.modificationCores.unpriced,true);
});
test('inventory processing can reach rank seven in zero-new mode, but purchased bodies remain rank zero',()=>{
  const d=domain({none:{0:1}}),types=d.types;
  assert.ok(types.some(t=>t.rank===7&&t.source==='owned-processed'));
  assert.ok(!types.some(t=>t.rank>0&&t.source==='new'));
  assert.equal(CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(7,'none',1)]).newCount,0);
  assert.throws(()=>CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(7,'none',2)]),/库存|本体/);
});
test('mixed sources return 55+40 cores, not one interchangeable stage token',()=>{
  const d=domain({heaven:{0:1},initial:{0:1}}),r=CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(7,'immortal',1)]);
  assert.equal(r.modificationCores.returned,95);assert.equal(r.modificationCores.remaining,20);
});
test('cores are independent per physical output rank and cannot cross beast IDs',()=>{
  for(const rank of [0,7,10]){
    const d=domain({none:{10:1},fullDivine:{0:1}},{allowNewHighRanks:true});
    const r=CORE.allocateConvertedInventory(DATA,beast,d.pool,[item(rank,'fullDivine',1)]);
    if(rank===0)assert.equal(r.modificationCores.spent,0); // unchanged original, not reprocessed
    else assert.equal(r.modificationCores.spent,145);
    assert.equal(r.modificationCores.externalDeficit,0);
  }
  const d=domain({fullDivine:{10:1}}),other=DATA.beasts.find(b=>b.id==='war-demon');
  assert.throws(()=>CORE.allocateConvertedInventory(DATA,other,d.pool,[item(0,'initial',1)]),/不同机关兽/);
});
test('unsupported blue/purple modifications stay excluded and cannot return bodies or cores',()=>{
  for(const b of DATA.beasts.filter(b=>b.quality!=='orange')){
    const progress=CORE.normalizeBeastProgress(b,{inventory:{fullDivine:{0:1}},showMods:true},DATA);
    const d=CORE.conversionMaterials(DATA,b,progress,{newRankMode:'zero'});
    assert.equal(d.pool.baseCount,0);assert.equal(d.pool.coreCount,0);
    assert.ok(d.pool.excluded.some(i=>i.modificationId==='fullDivine'&&i.count===1));
    assert.ok(d.types.every(t=>t.modificationId==='none'));
  }
});
