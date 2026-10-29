'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Update=require('../data/2026-10-three-weapons.js');
const EquipmentForging=require('./equipment-forging.js');
const Query=require('./query.js');
const Compare=require('./equipment-compare.js');

function fixture(){
  const context={window:{}};
  for(const file of ['special-equipment.js','forging.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../data',file),'utf8'),context);
  require('../data/2026-09-content-update.js').apply(context.window);
  require('../data/2026-10-equipment-update.js').apply(context.window);
  require('../data/2026-10-forging-update.js').apply(context.window);
  return context.window;
}
test('three divine weapons expose only confirmed red-gold stats and preserve effect text separately',()=>{
  const target=fixture();Update.apply(target);
  for(const [name,values,effect] of [
    ['焚天钺',{攻:25,穿透:15},/10%攻击，3回合.*背包中生效.*暴击伤害提升1.5%.*10层/],
    ['青岚刀',{血:25,技免:15},/总血量15%的化劲.*背包中生效.*抗暴击提升1.5%.*10层/],
    ['听潮笛',{攻:20,血:20},/15%暴击，3回合.*背包中生效.*攻击提升1%.*10层/]
  ]){
    const item=target.SPECIAL_EQUIPMENT_DATA.items.find(item=>item.name==='神兵'+name);
    assert.equal(item.cat,'神兵武器');assert.equal(item.main,'攻');
    assert.deepEqual(Object.fromEntries(item.tiers.红金.map(token=>[token.t,token.v])),values);
    assert.deepEqual(item.max,values);assert.match(item.exclusiveEffect,effect);
    for(const tier of ['橙色','橙金','红色']){assert.deepEqual(item.tiers[tier],[]);assert.ok(item.unknownTiers.includes(tier));}
    for(const tier of ['橙金','红色']){
      assert.deepEqual(Compare.dimensionValue(item,tier,'攻'),{available:false,value:null});
      assert.equal(Compare.compareItems([item],tier,['攻','血']).rows[0].available,false);
    }
    assert.equal(EquipmentForging.resolveForgeTarget(item.name,target.FORGING_DATA.items),name);
    assert.equal(EquipmentForging.resolveForgeTarget('神兵·'+name,target.FORGING_DATA.items),name);
    assert.equal(EquipmentForging.resolveEquipmentTarget(name,target.SPECIAL_EQUIPMENT_DATA.items).id,item.id);
    assert.ok(Query.matchSearch(item,name));
  }
});
test('all eleven forging stages follow the confirmed order with dual purple materials and no 6-to-7 material',()=>{
  const target=fixture();Update.apply(target);
  for(const [name,names] of [
    ['焚天钺',['乱神','破阵霸王枪','真刚',['凌虚','木剑'],'刺客列传','焚天钺',null,'掩日','天罡斧','蚩尤','焚天钺']],
    ['青岚刀',['双剑魍魉','非攻','断水',['凌虚','木剑'],'五德终始','青岚刀',null,'镇岳','撼地镰','镇天刃','青岚刀']],
    ['听潮笛',['水寒','羽刃','号钟琴',['凌虚','木剑'],'乐经','听潮笛',null,'怒涛','天问','凤鸟自舞','听潮笛']]
  ]){
    const item=target.FORGING_DATA.items.find(item=>item.name===name);
    assert.equal(item.stages.length,11);
    assert.deepEqual(item.stages.map(stage=>stage.tokens.map(token=>token.n)),names.map(n=>n?[].concat(n):[]));
    item.stages.forEach((stage,index)=>stage.tokens.forEach(token=>assert.equal(token.q,index<=4?'紫':'橙')));
  }
});
test('three-weapon increment is idempotent and preserves every pre-existing equipment and forging entry',()=>{
  const target=fixture(),equipment=JSON.stringify(target.SPECIAL_EQUIPMENT_DATA.items),forging=JSON.stringify(target.FORGING_DATA.items);
  Update.apply(target);const once=JSON.stringify(target);Update.apply(target);assert.equal(JSON.stringify(target),once);
  assert.equal(JSON.stringify(target.SPECIAL_EQUIPMENT_DATA.items.filter(item=>!item.id.startsWith('eq-20261029-'))),equipment);
  assert.equal(JSON.stringify(target.FORGING_DATA.items.filter(item=>!item.id.startsWith('f-20261029-'))),forging);
});
