(function(root){
  'use strict';
  var data=root.INSCRIPTION_DATA;
  if(!data||!Array.isArray(data.items))return;
  var disciple={name:'神镜仙端木蓉',quality:'红色神将',slots:[
    {tian:'天府',shield:'地遁'},{tian:'天相',shield:'神遁'},
    {tian:'天同',shield:'云遁'},{tian:'天梁',shield:'人遁'},{tian:'天机',shield:'风遁'}
  ]};
  var index=data.items.findIndex(function(item){return item.name===disciple.name&&item.quality===disciple.quality;});
  if(index<0)data.items.push(disciple);else data.items[index]=disciple;
  if(data.meta)data.meta.total=data.items.length;
})(window);
