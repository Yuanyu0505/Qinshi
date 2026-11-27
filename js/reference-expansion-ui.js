/* Workbook reference pages. Choices and calculations are memory-only. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.REFERENCE_EXPANSION_UI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var IDS=['first-releases','costumes','fishing','account-levels','disciple-awakening','jinchan','sage'];
 var ATTRS=['攻','防','血','内力','追加伤害','技能穿透','技伤减免','暴击','抗暴击','真伤抵抗','中级闪避','速','护盾'];
 var PERCENTS=['技能穿透','技伤减免','暴击','抗暴击','真伤抵抗','中级闪避'];
 function attrLabel(key){return {'技能穿透':'穿透','技伤减免':'技免','抗暴击':'抗暴','中级闪避':'闪避'}[key]||key;}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function unique(list){return Array.from(new Set(list.filter(function(v){return v!==undefined&&v!==null&&v!=='';})));}
 function hasSection(id){return IDS.includes(id);}
 function mount(root,body,id){
  if(!hasSection(id))return false;
  var data=root.REFERENCE_EXPANSION_DATA,core=root.REFERENCE_CALCULATORS,format=root.QinshiNumberFormat;
  var descriptor=data.sections.find(function(s){return s.id===id;});
  var tables=(data.tables||[]).filter(function(t){return t.section===id;});
  var state={query:'',year:'',sort:'desc',quality:'',attribute:'',table:tables[0]?tables[0].id:'',view:'table',mode:'max',element:'金',star:'',place:'',event:'',band:'',detail:''};
  var appliedRange=null,rangeDraft={from:'',to:''};
  var sageDemands={},sageMaster=false;
  function num(v){return v===null||v===undefined?'—':format.format(v);}
  function value(v){return v===null||v===undefined||v===''?'—':format.formatText(String(v));}
  function select(label,key,options,first){return '<label>'+esc(label)+'<select data-exp-filter="'+key+'">'+(first!==undefined?'<option value="">'+esc(first)+'</option>':'')+options.map(function(o){var pair=Array.isArray(o)?o:[o,o];return '<option value="'+esc(pair[0])+'"'+(String(pair[0])===String(state[key])?' selected':'')+'>'+esc(pair[1])+'</option>';}).join('')+'</select></label>';}
  function input(label,key,val,min,max){return '<label>'+esc(label)+'<input type="number" data-exp-input="'+key+'" value="'+val+'" min="'+(min===undefined?0:min)+'"'+(max===undefined?'':' max="'+max+'"')+' step="1" required></label>';}
  body.innerHTML='<section class="panel ref-section ref-expansion" data-exp-section="'+id+'"><header class="ref-heading"><h2 tabindex="-1">'+esc(descriptor?descriptor.name:id)+'</h2><button type="button" class="seg" data-ref-home>返回目录</button></header><div class="ref-exp-controls" data-exp-controls></div><div data-exp-tools></div><div data-exp-results aria-live="polite"></div></section>';
  var section=body.querySelector('[data-exp-section]'),controls=section.querySelector('[data-exp-controls]'),tools=section.querySelector('[data-exp-tools]'),results=section.querySelector('[data-exp-results]');
  var sageSummary=null;
  if(id==='sage'){sageSummary=root.document.createElement('section');sageSummary.className='ref-sage-summary';sageSummary.setAttribute('data-sage-summary','');sageSummary.setAttribute('aria-live','polite');section.appendChild(sageSummary);}
  function match(row){return !state.query||JSON.stringify(row).toLocaleLowerCase().includes(state.query.toLocaleLowerCase());}
  function current(){return tables.find(function(t){return t.id===state.table;})||tables[0];}
  function titleFor(t){return t.id==='awakening-source-totals'?'0至9星合计':t.title;}
  function sageLayers(){return unique(data.tables.find(function(t){return t.id==='sage-store';}).rows.map(function(row){return row[0];})).sort(function(a,b){return a-b;});}
  function sageLayerName(index){return '第'+(['一','二','三','四'][index]||num(index+1))+'层';}
  function sageLayerLabel(band){return sageLayerName(sageLayers().indexOf(Number(band)))+'（消耗'+num(Number(band))+'圣贤令开启）';}
  function awakeningElements(){return state.element?[state.element]:['金','木','水','火','土'];}
  function packedTable(title,columns,rows,groups,className){
   if(state.view==='cards')return '<div class="'+className+'">'+tableHtml(title,columns,rows,{blankEmpty:true})+'</div>';
   var packed=[];
   for(var i=0;i<rows.length;i+=groups){var cells=[];for(var j=0;j<groups;j++)cells=cells.concat(rows[i+j]||columns.map(function(){return ''; }));packed.push(cells);}
   return '<div class="'+className+'">'+tableHtml(title,Array.from({length:groups},function(){return columns;}).flat(),packed,{blankEmpty:true})+'</div>';
  }
  function searchHint(){
   if(id==='first-releases')return '搜索弟子名或首发日期，如：季布 / 2026-08';
   if(id==='costumes')return '搜索弟子名或戎装名，如：将威龙且 / 九霄御天';
   if(id==='fishing')return state.table==='fishing-totals'?'搜索适用鱼类、品质或合计数值；属性可用上方筛选':'搜索鱼名、品质或属性，如：玉蛟鎏金 / 技免';
   if(id==='disciple-awakening')return state.table==='awakening-source-totals'?'搜索材料名或数量；五行可用上方筛选':'搜索星／段或材料名，如：2星2段 / 艮山之尘';
   if(id==='jinchan')return state.table==='jinchan-blessings'?'搜索地点、属性或祝福，如：矿坑 / 晶矿':'搜索事件、处理选项、结果或掉落；地点可用上方筛选';
   if(state.table==='sage-store')return '搜索兑换道具、圣贤令价格或限购数量';
   if(state.table==='sage-master-rules')return '搜索宗师奖励计入条件或规则内容';
   return '搜索经验任务、领取条件或周期，如：体力 / 每日';
  }
  function renderControls(){
   if(id==='account-levels'){controls.hidden=true;controls.innerHTML='';return;}
   var html='';
   if(id==='fishing')html+=select('资料栏目','table',[['fishing-species','鱼类属性'],['fishing-totals','强化满级与品质合计']]);
   else if(tables.length>1&& !['first-releases','costumes'].includes(id))html+=select('资料栏目','table',tables.map(function(t){return [t.id,titleFor(t)];}));
   if(id==='first-releases')html+=select('年份','year',unique(data.firstReleases.map(function(r){return r.date.slice(0,4);})).sort().reverse(),'全部年份')+select('日期排序','sort',[['desc','从新到旧'],['asc','从旧到新']]);
   if(id==='fishing')html+=select('品质','quality',unique(data.fish.map(function(f){return f.quality;})),'全部品质')+select('属性','attribute',ATTRS.map(function(a){return [a,attrLabel(a)];}),'全部属性')+select('属性数值','mode',[['base','基础属性'],['max','强化满级']]);
   if(id==='disciple-awakening')html+=select('五行','element',['金','木','水','火','土'],'全部')+select('星级','star',Array.from({length:9},function(_,i){return [String(i),i+'星'];}),'全部星级');
   if(id==='jinchan')html+=select('地点','place',unique(data.jinchan.map(function(r){return r.place;})),'全部地点')+select('事件','event',unique(data.jinchan.filter(function(r){return !state.place||r.place===state.place;}).map(function(r){return r.event;})),'全部事件');
   if(id==='sage'){
    var sageTable=current(),detailIndex=state.table==='sage-master-rules'?1:0;
    var details=unique(sageTable.rows.map(function(row){return row[detailIndex];}));
    if(state.table==='sage-store')details=details.map(function(band){return [band,sageLayerLabel(band)];});
    html+=select(state.table==='sage-store'?'消耗圣贤令数量':state.table==='sage-master-rules'?'计入情况':'任务项目','detail',details,'全部');
   }
   html+=select('展示方式','view',[['table','表格'],['cards','卡片']]);
   if(id!=='account-levels')html+='<label class="ref-exp-search">搜索<input type="search" autocomplete="off" data-exp-query placeholder="'+esc(searchHint())+'" value="'+esc(state.query)+'"></label>';
   html+='<button type="button" class="seg" data-exp-clear>清除筛选</button>';
   controls.innerHTML=html;
   updateApplicableFilters();
  }
  function updateApplicableFilters(){
   if(id==='sage'){tools.hidden=state.table!=='sage-experience';var summary=section.querySelector('[data-sage-summary]');if(summary)summary.hidden=state.table!=='sage-store';}
   var queryInput=controls.querySelector('[data-exp-query]');if(queryInput)queryInput.placeholder=searchHint();
   var fishMode=controls.querySelector('[data-exp-filter="mode"]');if(fishMode)fishMode.parentElement.hidden=state.table!=='fishing-species';
   [['star',state.table==='awakening-source-totals'],['event',state.table==='jinchan-blessings']].forEach(function(pair){var el=controls.querySelector('[data-exp-filter="'+pair[0]+'"]');if(el){el.disabled=pair[1];if(pair[0]==='event')el.parentElement.hidden=pair[1];}});
  }
  function tableHtml(title,columns,rows,options){
   options=options||{};
   if(!rows.length)return '<p class="ref-empty">未找到匹配资料。</p>';
   function cell(v){return options.blankEmpty&&v===''?'':options.raw?String(v):esc(value(v));}
   var cards=state.view==='cards';
   function rowClass(row){return options.rowClass?' class="'+esc(options.rowClass(row))+'"':'';}
   if(cards)return '<div class="ref-exp-cards">'+rows.map(function(row){var titleIndex=options.titleIndex||0;return '<article'+rowClass(row)+'><h3>'+(options.levelCards?'当前等级'+cell(row[titleIndex])+'级':cell(row[titleIndex]))+'</h3><dl>'+columns.map(function(c,i){if(i===titleIndex||options.skipEmpty&&(row[i]==='—'||row[i]===null||row[i]===undefined||row[i]===''))return '';return '<div><dt>'+esc(c)+'</dt><dd>'+cell(row[i])+(options.levelCards&&i===1?'级':'')+'</dd></div>';}).join('')+'</dl></article>';}).join('')+'</div>';
   return '<section class="ref-exp-table-block">'+(options.noCaption?'':'<h3 class="ref-exp-table-title">'+esc(title)+'</h3>')+'<div class="ref-exp-table-scroll" tabindex="0" role="region" aria-label="'+esc(title)+'"><table>'+(options.noCaption?'':'<caption class="ref-visually-hidden">'+esc(title)+'</caption>')+'<thead><tr>'+columns.map(function(c){return '<th scope="col">'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr'+rowClass(row)+'>'+row.map(function(v){return '<td>'+cell(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div></section>';
  }
  function fishName(name,quality){
   var tone=String(quality).match(/[绿蓝紫橙红]/),label=String(quality).replace(/[（(][^）)]+[）)]/g,'');
   var className=tone?{'绿':'green','蓝':'blue','紫':'purple','橙':'orange','红':'red'}[tone[0]]:'';
   return '<span class="ref-fish-name'+(className?' ref-fish-'+className:'')+'">'+esc(name?String(name).replace(/\s+/g,'')+(label?'（'+label+'）':''):quality)+'</span>';
  }
  function fishStat(key,stat){return value(stat)+(PERCENTS.includes(key)&&stat!==null&&stat!==undefined&&stat!==''&&stat!=='—'&&!String(stat).includes('%')?'%':'')+attrLabel(key);}
  function fishMatches(row){return match(row)||match(JSON.stringify(row).replace(/\s+/g,''))||match(JSON.stringify(row).replace(/技能穿透/g,'穿透').replace(/技伤减免/g,'技免').replace(/抗暴击/g,'抗暴').replace(/中级闪避/g,'闪避'));}
  function qualityMatches(quality){var selected=state.quality,match=selected.match(/[（(]([^）)]+)[）)]/);return !selected||selected===quality||match&&match[1]===quality;}
  function sageRuleRow(row,table){
   var labels=['VIP等级','折扣／代金券','2280元宝','红利商城198红利','首充双倍','新弟子周充值双倍','充值红利','充值送礼','单日充值','累计充值','每周充值任务','七日狂欢','仙境玉匣','古老钥匙＋特典宝玉','周五充值四选一','周日充值四选一','周三充值四选一'];
   var label=labels[table.rows.indexOf(row)]||row[0],details=String(row[0]).replace(/(\d)\.(?=\d)/g,'$1、');
   return [label,details,row[1]];
  }
  function generic(target){
   var t=target||current();if(!t)return '<p class="ref-empty">暂无资料。</p>';
   var sourceRows=t.rows;
   if(id==='disciple-awakening'&&t.id==='awakening-source-totals')sourceRows=awakeningElements().flatMap(function(element){return core.awakeningCost(data.awakening,element,'0星','9星').materials.map(function(m){return [element,m.name,m.count];});});
   var rows=sourceRows.filter(function(row){
    if(id!=='account-levels'&&!(id==='fishing'?fishMatches(row):id==='sage'&&t.id==='sage-master-rules'?match(sageRuleRow(row,t)):match(row)))return false;
    if(id==='fishing'){
     var qi=t.columns.indexOf('品质'),ai=t.columns.indexOf(state.attribute);
     if(ai<0)ai=t.columns.indexOf(state.attribute+'%');
     if(qi>=0&&!qualityMatches(row[qi]))return false;
     if(state.attribute&&(ai<0||row[ai]==='—'||row[ai]===null))return false;
    }
    if(id==='disciple-awakening'&&state.element&&t.columns.indexOf('五行')>=0&&row[t.columns.indexOf('五行')]!==state.element)return false;
    if(id==='account-levels'&&state.band&&(Number(row[0])<Number(state.band)||Number(row[0])>(state.band==='1'?9:state.band==='90'?100:Number(state.band)+9)))return false;
    if(id==='jinchan'&&state.place&&t.columns.indexOf('地点')>=0&&row[t.columns.indexOf('地点')]!==state.place)return false;
    if(id==='sage'&&state.detail&&String(row[t.id==='sage-master-rules'?1:0])!==state.detail)return false;
    return true;
   });
   if(id==='sage'&&t.id==='sage-store')return sageStoreTable(t,rows);
   if(id==='sage'&&t.id==='sage-master-rules'){
    return '<div class="ref-sage-rules">'+tableHtml(t.title,['项目','规则','是否计入'],rows.map(function(row){return sageRuleRow(row,t);}))+'</div>';
   }
   if(id==='fishing'){
    var merged=t.id==='fishing-maxima';
    var columns=(merged?['适用鱼类']:['品质']).concat(t.columns.slice(merged?2:1).map(function(c){return attrLabel(c.replace(/%$/,''));}));
    var display=rows.map(function(row){return [merged?fishName(row[1],row[0]):fishName('',row[0])].concat(row.slice(merged?2:1).map(function(v,i){var c=t.columns[i+(merged?2:1)],text=value(v);return esc(text+(/%$/.test(c)&&v!==null&&v!==undefined&&v!==''&&v!=='—'&&!text.includes('%')?'%':''));}));});
    return tableHtml(t.title,columns,display,{raw:true})+(t.note?'<p class="ref-note">'+esc(t.note)+'</p>':'');
   }
   if(id==='account-levels'){
    var columns=t.columns.map(function(c){return c==='体力需求'?'体力需求（向上取整）':c==='烤山鸡取整'?'烤山鸡（向上取整）':c;});
    var rounded=rows.map(function(row){return row.map(function(v,i){return ['体力需求','烤山鸡取整'].includes(t.columns[i])&&typeof v==='number'?Math.ceil(v):v;});});
    return tableHtml(t.title,columns,rounded,{levelCards:true})+(t.note?'<p class="ref-note">'+esc(t.note)+'</p>':'');
   }
   if(id==='disciple-awakening'&&t.id==='awakening-source-totals')return packedTable(titleFor(t),t.columns,rows,2,'ref-awakening-totals');
   return tableHtml(t.title,t.columns,rows)+(t.note?'<p class="ref-note">'+esc(t.note)+'</p>':'');
  }
  function sageStoreTable(t,rows){
   var columns=t.columns.concat('需求');
   return '<div class="ref-sage-store">'+tableHtml(t.title,columns,rows.map(function(row){
    var index=t.rows.indexOf(row),checked=Object.prototype.hasOwnProperty.call(sageDemands,index);
    var demand='<div class="ref-sage-demand"><label class="ref-exp-check"><input type="checkbox" data-sage-pick="'+index+'"'+(checked?' checked':'')+' aria-label="选择'+esc(row[1])+'"></label>'+
      (checked?'<input type="number" min="1" max="'+row[4]+'" step="1" required data-sage-count="'+index+'" value="'+esc(sageDemands[index])+'" aria-label="'+esc(row[1])+'兑换次数">':'')+'</div>';
    return [esc(sageLayerLabel(row[0]))].concat(row.slice(1).map(function(v){return esc(value(v));})).concat(demand);
   }),{raw:true,titleIndex:1})+'</div>';
  }
  function renderSageSummary(){
   if(!sageSummary)return;
   function setContent(html){var focused=root.document.activeElement&&root.document.activeElement.hasAttribute('data-sage-master');sageSummary.innerHTML=html;if(focused){var master=sageSummary.querySelector('[data-sage-master]');if(master)master.focus({preventScroll:true});}}
   sageSummary.hidden=state.table!=='sage-store';
   var header='<header class="ref-heading"><h3>本期兑换需求合计</h3><label class="ref-exp-check"><input type="checkbox" data-sage-master'+(sageMaster?' checked':'')+'>宗师圣贤令</label></header>';
   if(!Object.keys(sageDemands).length){sageSummary.innerHTML='';return;}
   try{
    var demands={};
    Object.keys(sageDemands).forEach(function(key){if(String(sageDemands[key]).trim()===''||Number(sageDemands[key])<1)throw new Error('请填写有效的兑换次数。');demands[key]=Number(sageDemands[key]);});
    var store=data.tables.find(function(t){return t.id==='sage-store';}),exchange=core.sageExchange(store.rows,demands);
    var html=tableHtml('本期兑换需求合计',['道具','兑换次数','获得总数','总价'],exchange.items.map(function(item){return [item.name,item.times,item.quantity,item.cost];}).concat([['总价','','',num(exchange.total)]]),{blankEmpty:true,noCaption:true});
    if(!exchange.valid){
     html+='<p class="ref-exp-error" role="alert">当前方案无法计算。'+exchange.blocked.map(function(item){return '还需要在'+(item.layer===1?sageLayerName(0):'第一至'+sageLayerName(item.layer-1))+'累计购买'+num(item.shortage)+'圣贤令的道具后才能解锁'+sageLayerName(item.nextLayer-1)+'购买。';}).join('')+'</p>';
    }else{
     var plan=core.sagePlan(exchange.total,sageMaster),names={stamina:'日消耗体力',activity:'日活跃度',weeklySpend:'周消费元宝',weeklyRecharge:'周累计充值'};
     var schedule=plan.tasks.flatMap(function(task){return task.schedule.map(function(entry){return [names[task.key],num(entry.threshold),entry.times+(task.key.startsWith('weekly')?'周':'天'),num(entry.reward*entry.times),task.key==='weeklyRecharge'?num(entry.threshold*entry.times):''];});});
     if(plan.extraRecharge)schedule.push(['额外充值',num(plan.extraRecharge)+'元','本期',0,num(plan.extraRecharge)]);
     html+=tableHtml('圣贤令获取方案',['来源','档位／投入','次数','任务经验','充值额外经验'],schedule,{blankEmpty:true})+
       tableHtml('获取合计',['项目','数量'],[['所需圣贤令',num(exchange.total)],['最低所需经验',num(plan.requiredExperience)],['方案经验',num(plan.experience)],['圣贤令（最终）',num(plan.tokens)+'（对比总需求还剩'+num(plan.tokens-exchange.total)+'个）']],{rowClass:function(row){return row[0]==='圣贤令（最终）'?'ref-sage-final':'';}});
    }
    setContent(header+html);
   }catch(error){setContent(header+'<p class="ref-exp-error" role="alert">'+esc(error.message==='Exchange limit exceeded'?'兑换次数不得超过兑换上限。':/^[A-Za-z]/.test(error.message)?'请填写有效的整数兑换次数，且不得超过兑换上限。':error.message)+'</p>');}
  }
  function renderResults(){
   if(id==='first-releases'){
    var releases=data.firstReleases.filter(function(r){return (!state.year||r.date.startsWith(state.year))&&match([r.name,r.date]);}).slice().sort(function(a,b){return (state.sort==='asc'?1:-1)*a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'zh-CN');});
    results.innerHTML=packedTable('弟子首发',['弟子','首发日期'],releases.map(function(r){return [r.name,r.date];}),3,'ref-exp-packed-records');
   }else if(id==='costumes')results.innerHTML=packedTable('戎装',['弟子','戎装名称'],data.costumes.filter(function(r){return match([r.name,r.costume]);}).map(function(r){return [r.name,r.costume||'暂缺'];}),3,'ref-exp-packed-records');
   else if(id==='fishing'){
    if(state.table==='fishing-totals')results.innerHTML=tables.filter(function(t){return t.id!=='fishing-species';}).map(generic).join('');
    else{
     var fish=data.fish.filter(function(f){return (!state.quality||state.quality===f.quality)&&(!state.attribute||Object.prototype.hasOwnProperty.call(f.base,state.attribute))&&fishMatches([f.name,f.quality,state.mode==='max'?f.max:f.base]);});
     var count=fish.reduce(function(n,f){return Math.max(n,Object.keys(f.base).length);},0);
     results.innerHTML=tableHtml('鱼类属性',['鱼类'].concat(Array.from({length:count},function(_,i){return '属性'+(i+1);})),fish.map(function(f){var entries=ATTRS.filter(function(a){return Object.prototype.hasOwnProperty.call(f.base,a);});var stats=state.mode==='max'?f.max:f.base;return [fishName(f.name,f.quality)].concat(Array.from({length:count},function(_,i){var key=entries[i];return !key?'—':state.mode==='max'&&(stats[key]===null||stats[key]===undefined)?'满级数值暂缺':esc(fishStat(key,stats[key]));}));}),{raw:true,skipEmpty:true});
    }
   }else if(id==='disciple-awakening'){
    var rangeRows=new Set();
    if(appliedRange)awakeningElements().forEach(function(element){var path=data.awakening.filter(function(r){return r.element===element;}),stages=[path[0].from].concat(path.map(function(r){return r.to;}));path.slice(stages.indexOf(appliedRange.from),stages.indexOf(appliedRange.to)).forEach(function(r){rangeRows.add(r);});});
    var rows=data.awakening.filter(function(r){return (!state.element||r.element===state.element)&&(!appliedRange||rangeRows.has(r))&&(!state.star||r.from.startsWith(state.star+'星'))&&match([r.from,r.to,r.materials.map(function(m){return m.name;})]);});
    var running={},lookup=new Map(),incomplete=false;
    awakeningElements().forEach(function(element){running={};incomplete=false;data.awakening.filter(function(r){return r.element===element;}).forEach(function(r){if((r.issues||[]).length)incomplete=true;r.materials.forEach(function(m){running[m.name]=(running[m.name]||0)+m.count;});lookup.set(element+r.from+'→'+r.to,(incomplete?'部分合计：':'')+Object.entries(running).map(function(m){return m[0]+'×'+num(m[1]);}).join('、'));});});
    results.innerHTML=state.table==='awakening-source-totals'?generic():'<div class="ref-awakening-steps">'+tableHtml('逐段与累计材料',['五行','阶段','本段材料','自0星累计'],rows.map(function(r){return [r.element,r.from+' → '+r.to,r.materials.map(function(m){return m.name+'×'+num(m.count);}).concat((r.issues||[]).map(function(issue){return issue.text+'×数量缺失（'+issue.source+'）';})).join('、'),lookup.get(r.element+r.from+'→'+r.to)];}),{titleIndex:1})+'</div>';
   }else if(id==='jinchan'){
    var entries=data.jinchan.filter(function(r){return (!state.place||r.place===state.place)&&(!state.event||r.event===state.event)&&match([r.place,r.event,r.choice,r.result,r.reward,r.contribution]);});
    if(state.table==='jinchan-blessings'){
     var blessings=current().rows.map(function(row){return row.slice(0,3).concat(row[3]+'+'+num(parseFloat(row[4]))+'%');}).filter(function(row){return (!state.place||row[0]===state.place)&&match(row);});
     results.innerHTML='<div class="ref-jinchan-blessings">'+tableHtml('地点与祝福',['地点','属性加成','产出祝福','祝福加成'],blessings)+'</div>';
    }else results.innerHTML='<div class="ref-jinchan-events">'+tableHtml('事件与选项',['地点','事件','处理选项','结果','加成／掉落','贡献'],entries.map(function(r){return [r.place,r.event,r.choice,r.result,r.reward,r.contribution];}),{titleIndex:2,noCaption:true})+'</div>';
   }else results.innerHTML=generic();
   if(id==='sage')renderSageSummary();
  }
  function renderTools(){
   var html='';
   if(id==='account-levels')html='<div class="ref-exp-form ref-exp-level-range">'+select('等级区间','band',Array.from({length:10},function(_,i){var from=i===0?1:i*10,to=i===0?9:i===9?100:i*10+9;return [String(from),from+'–'+to+'级'];}),'全部等级')+select('展示方式','view',[['table','表格'],['cards','卡片']])+input('当前等级','from',1,1,100)+input('当前等级已获得经验','currentExperience',0)+input('目标等级','to',100,1,100)+'<button type="button" class="seg" data-exp-calculate>计算</button></div>';
   if(id==='disciple-awakening'){
    var rows=data.awakening.filter(function(r){return !state.element||r.element===state.element;}),stages=unique(rows.flatMap(function(r){return [r.from,r.to];}));
    function stageOptions(key){return '<option value="">请选择</option>'+stages.map(function(s){return '<option value="'+esc(s)+'"'+(rangeDraft[key]===s?' selected':'')+'>'+esc(s)+'</option>';}).join('');}
    html='<h3>升金区间</h3><div class="ref-exp-form ref-awakening-range"><label>当前星／段<select data-exp-input="from">'+stageOptions('from')+'</select></label><label>目标星／段<select data-exp-input="to">'+stageOptions('to')+'</select></label><button type="button" class="seg" data-exp-calculate>计算</button></div>';
   }
   if(id==='sage'){
    function milestone(label,key){var tiers=data.sage[key];return '<label>'+label+'<select data-exp-input="'+key+'"><option value="0">不参与</option>'+tiers.map(function(tier,index){return '<option value="'+tier[0]+'"'+(index===tiers.length-1?' selected':'')+'>'+num(tier[0])+'</option>';}).join('')+'</select></label>';}
    html='<h3>圣贤令估算 · 27天／4次周任务</h3><div class="ref-sage-controls-scroll"><div class="ref-exp-form ref-sage-range">'+milestone('日消耗体力','stamina')+milestone('日活跃度','activity')+milestone('周消费元宝','weeklySpend')+milestone('周累计充值（元）','weeklyRecharge')+'<label class="ref-exp-check"><input type="checkbox" data-exp-input="master"'+(sageMaster?' checked':'')+'>解锁宗师奖励</label><button type="button" class="seg" data-exp-calculate>计算</button></div></div>';
   }
   if(id==='account-levels')tools.innerHTML='<div class="ref-exp-level-controls-scroll">'+html+'</div><div data-exp-calculation role="status" aria-live="polite"></div>';
   else tools.innerHTML=html?'<section class="ref-exp-calculator">'+html+'<div data-exp-calculation role="status" aria-live="polite"></div></section>':'';
  }
  function readInputs(){var out={};tools.querySelectorAll('[data-exp-input]').forEach(function(el){var key=el.dataset.expInput;if(el.type==='checkbox')out[key]=el.checked;else if(el.tagName==='SELECT')out[key]=id==='sage'?Number(el.value):el.value;else{if(el.value.trim()===''||!el.validity.valid)throw new RangeError('请填写有效的'+el.parentElement.firstChild.textContent+'。');out[key]=Number(el.value);}});return out;}
  function calculate(){
   var dest=tools.querySelector('[data-exp-calculation]');
   try{
    var input=readInputs(),result,html='';
    if(id==='account-levels'){
     result=core.accountCost(data.accountLevels,input.from,input.to,input.currentExperience);
     html=tableHtml('升级需求',['项目','需求'],[['经验',num(result.experience)],['体力需求（向上取整）',num(result.stamina)],['烤山鸡（向上取整）',num(result.chickens)]]);
    }else if(id==='disciple-awakening'){
     if(!input.from||!input.to)throw new Error('请选择完整的起点和终点。');
     var calculations=awakeningElements().map(function(element){return {element:element,result:core.awakeningCost(data.awakening,element,input.from,input.to)};});
     html=calculations.map(function(entry){var result=entry.result;return (state.element?'':'<h4>'+entry.element+'系</h4>')+(result.steps===0?'<p>无需材料。</p>':packedTable('区间材料合计',['材料','数量'],result.materials.map(function(m){return [m.name,m.count];}),3,'ref-awakening-materials'))+(result.issues.length?'<p class="ref-exp-error">不完整结果：'+result.issues.map(function(issue){return esc(issue.text+'缺少数量（'+issue.source+'）');}).join('；')+'。</p>':'');}).join('');
     appliedRange={from:input.from,to:input.to};rangeDraft={from:input.from,to:input.to};state.table='awakening-steps';state.star='';state.query='';renderControls();renderResults();
    }else{
     result=core.sageEstimate(input);
     var names={stamina:'体力任务经验',activity:'活跃任务经验',weeklySpend:'元宝消费任务经验',weeklyRecharge:'充值任务经验',recharge:'充值额外经验'};
     html=tableHtml('经验与圣贤令',['项目','数量'],Object.keys(names).map(function(k){return [names[k],num(result.parts[k])];}).concat([['经验合计',num(result.experience)],['圣贤令（取整前）',num(result.rawTokens)],['圣贤令（最终）',num(result.tokens)]]),{rowClass:function(row){return row[0]==='圣贤令（最终）'?'ref-sage-final':'';}});
    }
    dest.innerHTML=html;
   }catch(error){
    var messages={'Invalid level range':'目标等级须不低于当前等级，且不得超过100级。','Current experience exceeds level requirement':'当前经验不得超过本级升级所需经验。','Invalid awakening range':'请选择有效的升金起点和终点，目标不得低于当前阶段。'};
    var message=messages[error.message]||(/^Missing level data: /.test(error.message)?'所选区间缺少等级资料，暂不能计算。':/^[A-Za-z]/.test(error.message)?'请输入有效的非负数值。':error.message);
    dest.innerHTML='<p class="ref-exp-error">'+esc(message)+'</p>';
   }
  }
  section.addEventListener('input',function(e){
   if(e.target.hasAttribute('data-sage-count')){sageDemands[e.target.dataset.sageCount]=e.target.value;e.target.setAttribute('aria-invalid',String(!e.target.validity.valid));renderSageSummary();}
   else if(e.target.matches('[data-exp-query]')){state.query=e.target.value.trim();renderResults();}
   else if(e.target.matches('[data-exp-input]')){var output=tools.querySelector('[data-exp-calculation]');if(output)output.innerHTML='';if(id==='disciple-awakening'){rangeDraft[e.target.dataset.expInput]=e.target.value;appliedRange=null;renderResults();}}
  });
  section.addEventListener('change',function(e){
   var el=e.target;
   if(el.hasAttribute('data-sage-pick')){
    var picked=el.dataset.sagePick,checked=el.checked;
    if(el.checked)sageDemands[el.dataset.sagePick]='1';else delete sageDemands[el.dataset.sagePick];
    renderResults();
    var next=results.querySelector(checked?'[data-sage-count="'+picked+'"]':'[data-sage-pick="'+picked+'"]');if(next)next.focus({preventScroll:true});
   }else if(el.hasAttribute('data-sage-master')){
    sageMaster=el.checked;var masterInput=tools.querySelector('[data-exp-input="master"]');if(masterInput)masterInput.checked=sageMaster;
    var estimate=tools.querySelector('[data-exp-calculation]');if(estimate)estimate.innerHTML='';renderSageSummary();
   }else if(el.hasAttribute('data-exp-filter')){
    var key=el.dataset.expFilter;state[key]=el.value;
    if(key==='table'&&id==='sage'){state.detail='';renderControls();}
    if(key==='place'){state.event='';renderControls();}
    if(key==='element'){appliedRange=null;rangeDraft={from:'',to:''};renderTools();}
    updateApplicableFilters();
    renderResults();
   }else if(el.hasAttribute('data-exp-input')){var output=tools.querySelector('[data-exp-calculation]');if(output)output.innerHTML='';if(id==='sage'&&el.dataset.expInput==='master'){sageMaster=el.checked;renderSageSummary();}if(id==='disciple-awakening'){rangeDraft[el.dataset.expInput]=el.value;appliedRange=null;renderResults();}}
  });
  section.addEventListener('click',function(e){var button=e.target.closest('button');if(!button)return;if(button.hasAttribute('data-exp-calculate'))calculate();if(id!=='account-levels'&&button.hasAttribute('data-exp-clear')){state.query='';state.year='';state.quality='';state.attribute='';state.star='';state.place='';state.event='';state.band='';state.detail='';appliedRange=null;rangeDraft={from:'',to:''};renderControls();if(id==='disciple-awakening')renderTools();renderResults();}});
  renderControls();renderTools();renderResults();
  return true;
 }
 return {hasSection:hasSection,mount:mount};
});
