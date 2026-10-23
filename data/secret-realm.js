/* 用户确认的秘境通用资料；价格为人民币原价，通行证付费部分仅额外88抽。 */
(function(root,factory){ var data=factory(); if(typeof module==='object'&&module.exports)module.exports=data; if(root)root.SECRET_REALM_DATA=data; })(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var rows=[
    ['first-gift','首期秘境赠送',19,0,1,false,true],['ingots','2000元宝',10,0,1],
    ['zero-ticket','0元票',1,0,14,true],['daily-free','免费1抽',1,0,14,true],
    ['panda','熊猫头',35,0,1],['free-pass','免费通行证',11,0,1],['paid-pass','付费通行证',88,98,1],
    ['pack6','6元礼包',3,6,14,true],['pack30','30元礼包',10,30,6],['pack98','98元礼包',30,98,4],
    ['pack198','198元礼包',55,198,2],['pack328','328元礼包',80,328,2],['pack648','648元礼包',130,648,null]
  ];
  var rewards=[[100,'弟子魂魄'],[200,'弟子神魄'],[350,'神兵武器'],[500,'神兵衣服'],[650,'298时装'],[750,'神兵饰品'],[850,'神兵典籍'],[1000,'298时装'],[1150,'武器'],[1300,'598时装'],[1400,'衣服'],[1500,'饰品'],[1650,'298时装'],[1800,'聚神印'],[1950,'戎装'],[2050,'典籍'],[2150,'机关碎片'],[2300,'298时装'],[2450,'觉醒神图'],[2600,'当期称号'],[2700,'元宝'],[2800,'神果'],[2950,'元宝'],[3100,'聚神印'],[3250,'称号'],[3350,'联动神将'],[3450,'武器'],[3600,'防具'],[3750,'饰品'],[3900,'典籍'],[4000,'联动神将戎装'],[4100,'机关碎片'],[4250,'联动神将神魄'],[4400,'觉醒神图'],[4550,'联动神将称号']];
  return {maxPeriods:6,periodDays:14,realms:[{id:'guigu',name:'鬼谷盖聂',firstPeriod:6},{id:'gaoyue',name:'千泷高月',firstPeriod:2}],
    sources:rows.map(function(r){return {id:r[0],name:r[1],draws:r[2],price:r[3],limit:r[4],daily:!!r[5],firstOnly:!!r[6]};}),
    rewards:rewards.map(function(r){return {draws:r[0],name:r[1]};}),
    platforms:[{id:'x7',name:'小7',discount:4},{id:'guopan',name:'果盘',discount:4},{id:'gamefan',name:'游戏fan',discount:4.3},{id:'mumayi',name:'木蚂蚁',discount:4.3},{id:'direct',name:'直充',discount:10}]
  };
});
