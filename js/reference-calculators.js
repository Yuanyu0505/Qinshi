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
    result.stamina=Math.ceil(result.stamina);result.chickens=Math.ceil(result.stamina/20);return result;
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
  var SAGE_SOURCES=[
    {key:'stamina',cycles:27,tiers:[[50,30],[100,60],[150,90]]},
    {key:'activity',cycles:27,tiers:[[10,20],[15,30],[25,50],[40,80],[50,100]]},
    {key:'weeklySpend',cycles:4,tiers:[[5000,500],[10000,800],[30000,4000]]},
    {key:'weeklyRecharge',cycles:4,tiers:[[30,500],[198,800],[648,4000]]}
  ];
  function sageEstimate(input){
    ['stamina','activity','weeklySpend','weeklyRecharge'].forEach(function(key){number(input[key],key,false);});
    if(typeof input.master!=='boolean')throw new RangeError('Invalid master reward state');
    var parts={};
    SAGE_SOURCES.forEach(function(source){var reward=0;source.tiers.forEach(function(tier){if(input[source.key]>=tier[0])reward=tier[1];});parts[source.key]=source.cycles*reward;});
    parts.recharge=input.weeklyRecharge*4;
    var experience=Object.values(parts).reduce(function(total,value){return total+value;},0);
    if(!Number.isSafeInteger(Math.floor(experience)))throw new RangeError('Experience exceeds safe range');
    var rawTokens=experience*(input.master?3:1)/100;
    return {days:27,weeks:4,experience:experience,rawTokens:rawTokens,tokens:Math.floor(rawTokens),parts:parts};
  }
  function sageExchange(rows,demands){
    var tiers=Array.from(new Set(rows.map(function(row){return row[0];}))).sort(function(a,b){return a-b;});
    var items=[],spent=tiers.map(function(){return 0;}),total=0;
    Object.keys(demands).forEach(function(key){
      if(!/^(0|[1-9]\d*)$/.test(key)||!rows[Number(key)])throw new RangeError('Unknown exchange item');
      var row=rows[Number(key)],times=number(demands[key],'exchange count',true);
      if(times>row[4])throw new RangeError('Exchange limit exceeded');
      if(!times)return;
      var cost=times*number(row[3],'item price',true),quantity=times*number(row[2],'item quantity',true),index=tiers.indexOf(row[0]);
      number(cost,'exchange cost',true);number(quantity,'exchange quantity',true);
      items.push({id:Number(key),layer:index+1,name:row[1],times:times,quantity:quantity,cost:cost});
      spent[index]+=cost;total+=cost;
    });
    number(total,'exchange total',true);
    var last=items.reduce(function(max,item){return Math.max(max,item.layer);},1),blocked=[];
    // Only spending in already unlocked layers can unlock the next layer.
    var cumulative=0;
    for(var i=0;i<last-1;i++){
      cumulative+=spent[i];
      if(cumulative<tiers[i+1]){blocked.push({layer:i+1,nextLayer:i+2,shortage:tiers[i+1]-cumulative});break;}
    }
    items.sort(function(a,b){return a.id-b.id;});
    return {items:items,total:total,spent:spent,blocked:blocked,valid:!blocked.length};
  }
  var sageScheduleCache=new Map();
  function sageSchedules(source){
    if(sageScheduleCache.has(source.key))return sageScheduleCache.get(source.key);
    var options=new Map([[0,{experience:0,cost:0,used:0,counts:source.tiers.map(function(){return 0;})}]]);
    for(var n=0;n<source.cycles;n++){
      var next=new Map(options);
      options.forEach(function(option){
        source.tiers.forEach(function(tier,index){
          var xp=option.experience+tier[1]+(source.key==='weeklyRecharge'?tier[0]:0),cost=option.cost+tier[0],used=option.used+1,existing=next.get(xp);
          if(!existing||cost<existing.cost||cost===existing.cost&&used<existing.used){
            var counts=option.counts.slice();counts[index]++;
            next.set(xp,{experience:xp,cost:cost,used:used,counts:counts});
          }
        });
      });
      options=next;
    }
    var sorted=Array.from(options.values()).sort(function(a,b){return a.experience-b.experience;});
    sageScheduleCache.set(source.key,sorted);return sorted;
  }
  function sagePlan(tokens,master){
    number(tokens,'required tokens',true);
    if(typeof master!=='boolean')throw new RangeError('Invalid master reward state');
    number(tokens*100,'required experience',true);
    var requiredExperience=Math.ceil(tokens*100/(master?3:1)),remaining=requiredExperience,tasks=[];
    var parts={stamina:0,activity:0,weeklySpend:0,weeklyRecharge:0,recharge:0};
    SAGE_SOURCES.forEach(function(source){
      if(remaining<=0)return;
      var choices=sageSchedules(source),best=choices.find(function(choice){return choice.experience>=remaining;})||choices[choices.length-1];
      var schedule=source.tiers.map(function(tier,index){return {threshold:tier[0],reward:tier[1],times:best.counts[index]};}).filter(function(entry){return entry.times;});
      parts[source.key]=schedule.reduce(function(sum,entry){return sum+entry.reward*entry.times;},0);
      if(source.key==='weeklyRecharge')parts.recharge=best.cost;
      tasks.push({key:source.key,schedule:schedule,experience:parts[source.key],rechargeExperience:source.key==='weeklyRecharge'?best.cost:0});
      remaining-=best.experience;
    });
    var extraRecharge=Math.max(0,remaining);
    parts.recharge+=extraRecharge;
    var experience=Object.values(parts).reduce(function(sum,xp){return sum+xp;},0);
    number(experience,'planned experience',true);
    return {requiredExperience:requiredExperience,experience:experience,tokens:Math.floor(experience*(master?3:1)/100),parts:parts,tasks:tasks,extraRecharge:extraRecharge};
  }
  return {accountCost:accountCost,awakeningCost:awakeningCost,fishTotal:fishTotal,sageEstimate:sageEstimate,sageExchange:sageExchange,sagePlan:sagePlan};
});
