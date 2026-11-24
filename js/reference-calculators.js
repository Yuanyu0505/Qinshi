(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.REFERENCE_CALCULATORS=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function number(value,name,integer){
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER||(integer&&!Number.isInteger(value)))throw new RangeError('Invalid '+name);
    return value;
  }
  function accountCost(levels,from,to,currentExperience){
    number(from,'current level',true);number(to,'target level',true);
    currentExperience=currentExperience===undefined?0:number(currentExperience,'current experience',false);
    if(from<1||to<from||to>100)throw new RangeError('Invalid level range');
    var current=levels.find(function(row){return row.level===from;});
    if(currentExperience&&(from===100||!current||currentExperience>current.experience))throw new RangeError('Current experience exceeds level requirement');
    var result={experience:0,stamina:0,chickens:0,chickensByLevel:0,steps:0};
    for(var level=from;level<to;level++){
      var row=levels.find(function(item){return item.level===level;});
      if(!row||typeof row.experience!=='number'||!Number.isFinite(row.experience)||row.experience<=0||typeof row.perStamina!=='number'||!Number.isFinite(row.perStamina)||row.perStamina<=0)throw new RangeError('Missing level data: '+level);
      var experience=row.experience-(level===from?currentExperience:0),stamina=experience/row.perStamina;
      result.experience+=experience;result.stamina+=stamina;result.chickensByLevel+=Math.ceil(stamina/20);result.steps++;
    }
    result.chickens=Math.ceil(result.stamina/20);return result;
  }
  function awakeningCost(rows,element,from,to){
    var path=rows.filter(function(row){return row.element===element;}),states=path.length?[path[0].from].concat(path.map(function(row){return row.to;})):[],start=states.indexOf(from),end=states.indexOf(to);
    if(start<0||end<start)throw new RangeError('Invalid awakening range');
    var materials=new Map(),issues=[];
    path.slice(start,end).forEach(function(row){
      (row.issues||[]).forEach(function(issue){issues.push({source:issue.source,text:issue.text});});
      row.materials.forEach(function(item){number(item.count,'material count',true);materials.set(item.name,(materials.get(item.name)||0)+item.count);});
    });
    return {materials:Array.from(materials,function(pair){return {name:pair[0],count:pair[1]};}),steps:end-start,issues:issues};
  }
  function fishTotal(fish,selectedIds,mode){
    if(!Array.isArray(selectedIds)||!['base','max'].includes(mode))throw new RangeError('Invalid fish selection');
    var ids=Array.from(new Set(selectedIds)),stats={},missing=[];
    ids.forEach(function(id){
      var row=fish.find(function(item){return item.id===id;});if(!row)throw new RangeError('Unknown fish: '+id);
      var values=row[mode]||{};
      Object.keys(row.base).forEach(function(key){
        var value=values[key];if(typeof value!=='number'||!Number.isFinite(value)){missing.push({id:id,name:row.name,attribute:key});return;}
        stats[key]=(stats[key]||0)+value;
      });
    });
    return {stats:stats,selectedCount:ids.length,missing:missing};
  }
  function sageEstimate(input){
    ['stamina','activity','weeklySpend','weeklyRecharge'].forEach(function(key){number(input[key],key,false);});
    if(typeof input.master!=='boolean')throw new RangeError('Invalid master reward state');
    function sum(value,milestones){return milestones.reduce(function(total,item){return total+(value>=item[0]?item[1]:0);},0);}
    var parts={stamina:27*sum(input.stamina,[[50,30],[100,60],[150,90]]),activity:27*sum(input.activity,[[10,20],[15,30],[25,50],[40,80],[50,100]]),weeklySpend:4*sum(input.weeklySpend,[[5000,500],[10000,800],[30000,4000]]),weeklyRecharge:4*sum(input.weeklyRecharge,[[30,500],[198,800],[648,4000]]),recharge:input.weeklyRecharge*4};
    var experience=Object.values(parts).reduce(function(total,value){return total+value;},0);
    if(!Number.isSafeInteger(Math.floor(experience)))throw new RangeError('Experience exceeds safe range');
    var rawTokens=experience*(input.master?3:1)/100;
    return {days:27,weeks:4,experience:experience,rawTokens:rawTokens,tokens:Math.floor(rawTokens),parts:parts};
  }
  return {accountCost:accountCost,awakeningCost:awakeningCost,fishTotal:fishTotal,sageEstimate:sageEstimate};
});
