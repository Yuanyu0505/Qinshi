/* Workbook reference pages. Choices and calculations are memory-only. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.REFERENCE_EXPANSION_UI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 var IDS=['first-releases','costumes','fishing','account-levels','disciple-awakening','jinchan','sage'];
 var ATTRS=['攻','防','血','内力','追加伤害','技能穿透','技伤减免','暴击','抗暴击','真伤抵抗','中级闪避','速','护盾'];
 var PERCENTS=['技能穿透','技伤减免','暴击','抗暴击','真伤抵抗','中级闪避'];
 function attrLabel(key){return key+(PERCENTS.includes(key)?'（%）':'');}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function unique(list){return Array.from(new Set(list.filter(function(v){return v!==undefined&&v!==null&&v!=='';})));}
 function hasSection(id){return IDS.includes(id);}
 function mount(root,body,id){
  if(!hasSection(id))return false;
  var data=root.REFERENCE_EXPANSION_DATA,core=root.REFERENCE_CALCULATORS,format=root.QinshiNumberFormat;
  var descriptor=data.sections.find(function(s){return s.id===id;});
  var tables=(data.tables||[]).filter(function(t){return t.section===id;});
  var state={query:'',year:'',sort:'desc',quality:'',attribute:'',table:tables[0]?tables[0].id:'',view:'auto',mode:'base',element:'金',star:'',place:'',event:'',band:'',availability:''};
  var selected=new Set(),compared=new Set();
  function num(v){return v===null||v===undefined?'—':format.format(v);}
  function value(v){return v===null||v===undefined||v===''?'—':format.formatText(String(v));}
  function select(label,key,options,first){return '<label>'+esc(label)+'<select data-exp-filter="'+key+'">'+(first!==undefined?'<option value="">'+esc(first)+'</option>':'')+options.map(function(o){var pair=Array.isArray(o)?o:[o,o];return '<option value="'+esc(pair[0])+'"'+(String(pair[0])===String(state[key])?' selected':'')+'>'+esc(pair[1])+'</option>';}).join('')+'</select></label>';}
  function input(label,key,val,min,max){return '<label>'+esc(label)+'<input type="number" data-exp-input="'+key+'" value="'+val+'" min="'+(min===undefined?0:min)+'"'+(max===undefined?'':' max="'+max+'"')+' step="1" required></label>';}
  body.innerHTML='<section class="panel ref-section ref-expansion" data-exp-section="'+id+'"><header class="ref-heading"><h2 tabindex="-1">'+esc(descriptor?descriptor.name:id)+'</h2><button type="button" class="seg" data-ref-home>返回目录</button></header><div class="ref-exp-controls" data-exp-controls></div><div data-exp-tools></div><div data-exp-results aria-live="polite"></div><div data-exp-selection aria-live="polite"></div></section>';
  var section=body.querySelector('[data-exp-section]'),controls=section.querySelector('[data-exp-controls]'),tools=section.querySelector('[data-exp-tools]'),results=section.querySelector('[data-exp-results]'),selection=section.querySelector('[data-exp-selection]');
  function match(row){return !state.query||JSON.stringify(row).toLocaleLowerCase().includes(state.query.toLocaleLowerCase());}
  function current(){return tables.find(function(t){return t.id===state.table;})||tables[0];}
  function renderControls(){
   var html='';
   if(id==='fishing')html+=select('资料栏目','table',[['fishing-species','鱼类属性'],['fishing-totals','强化满级与品质合计']]);
   else if(tables.length>1&& !['first-releases','costumes'].includes(id))html+=select('资料栏目','table',tables.map(function(t){return [t.id,t.title];}));
   if(id==='first-releases')html+=select('年份','year',unique(data.firstReleases.map(function(r){return r.date.slice(0,4);})).sort().reverse(),'全部年份')+select('日期排序','sort',[['desc','从新到旧'],['asc','从旧到新']]);
   if(id==='costumes')html+=select('资料状态','availability',[['known','已有名称'],['missing','暂缺名称']],'全部状态');
   if(id==='account-levels')html+=select('等级区间','band',Array.from({length:10},function(_,i){var from=i===0?1:i*10,to=i===0?9:i===9?100:i*10+9;return [String(from),from+'–'+to+'级'];}),'全部等级');
   if(id==='fishing')html+=select('品质','quality',unique(data.fish.map(function(f){return f.quality;})),'全部品质')+select('属性','attribute',ATTRS,'全部属性')+select('勾选汇总','mode',[['base','基础属性'],['max','强化满级']]);
   if(id==='disciple-awakening')html+=select('五行','element',['金','木','水','火','土'])+select('星级','star',Array.from({length:9},function(_,i){return [String(i),i+'星'];}),'全部星级');
   if(id==='jinchan')html+=select('地点','place',unique(data.jinchan.map(function(r){return r.place;})),'全部地点')+select('事件','event',unique(data.jinchan.filter(function(r){return !state.place||r.place===state.place;}).map(function(r){return r.event;})),'全部事件');
   html+=select('展示方式','view',[['auto','自动'],['table','表格'],['cards','卡片']]);
   html+='<label class="ref-exp-search">搜索<input type="search" autocomplete="off" data-exp-query placeholder="输入名称、属性或关键词" value="'+esc(state.query)+'"></label><button type="button" class="seg" data-exp-clear>清除筛选</button>';
   controls.innerHTML=html;
   updateApplicableFilters();
  }
  function updateApplicableFilters(){
   [['star',state.table==='awakening-source-totals'],['event',state.table==='jinchan-blessings']].forEach(function(pair){var el=controls.querySelector('[data-exp-filter="'+pair[0]+'"]');if(el)el.disabled=pair[1];});
  }
  function tableHtml(title,columns,rows,options){
   options=options||{};
   if(!rows.length)return '<p class="ref-empty">未找到匹配资料。</p>';
   function cell(v){return options.raw?String(v):esc(value(v));}
   var compact=columns.length<=4&&rows.every(function(row){return row.every(function(v){return String(v==null?'':v).length<=32&&!String(v).includes('\n');});});
   var cards=state.view==='cards'||state.view==='auto'&&!compact&&(section.getBoundingClientRect().width||root.innerWidth||1280)<760;
   if(cards)return '<div class="ref-exp-cards">'+rows.map(function(row){var titleIndex=options.titleIndex||0;return '<article><h3>'+cell(row[titleIndex])+'</h3><dl>'+columns.map(function(c,i){if(i===titleIndex||options.skipEmpty&&(row[i]==='—'||row[i]===null||row[i]===undefined||row[i]===''))return '';return '<div><dt>'+esc(c)+'</dt><dd>'+cell(row[i])+'</dd></div>';}).join('')+'</dl></article>';}).join('')+'</div>';
   return '<div class="ref-exp-table-scroll" tabindex="0" role="region" aria-label="'+esc(title)+'"><table><caption>'+esc(title)+'</caption><thead><tr>'+columns.map(function(c){return '<th scope="col">'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+cell(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
  }
  function statsRows(stats){return ATTRS.filter(function(a){return Object.prototype.hasOwnProperty.call(stats,a);}).map(function(a){return [attrLabel(a),num(stats[a])];});}
  function qualityMatches(quality){var selected=state.quality,match=selected.match(/[（(]([^）)]+)[）)]/);return !selected||selected===quality||match&&match[1]===quality;}
  function generic(target){
   var t=target||current();if(!t)return '<p class="ref-empty">暂无资料。</p>';
   var rows=t.rows.filter(function(row){
    if(!match(row))return false;
    if(id==='fishing'){
     var qi=t.columns.indexOf('品质'),ai=t.columns.indexOf(state.attribute);
     if(ai<0)ai=t.columns.indexOf(state.attribute+'%');
     if(qi>=0&&!qualityMatches(row[qi]))return false;
     if(state.attribute&&(ai<0||row[ai]==='—'||row[ai]===null))return false;
    }
    if(id==='disciple-awakening'&&t.columns.indexOf('五行')>=0&&row[t.columns.indexOf('五行')]!==state.element)return false;
    if(id==='account-levels'&&state.band&&(Number(row[0])<Number(state.band)||Number(row[0])>(state.band==='1'?9:state.band==='90'?100:Number(state.band)+9)))return false;
    if(id==='jinchan'&&state.place&&t.columns.indexOf('地点')>=0&&row[t.columns.indexOf('地点')]!==state.place)return false;
    return true;
   });
   return tableHtml(t.title,t.columns,rows)+(t.note?'<p class="ref-note">'+esc(t.note)+'</p>':'');
  }
  function renderResults(){
   if(id==='first-releases'){
    var releases=data.firstReleases.filter(function(r){return (!state.year||r.date.startsWith(state.year))&&match([r.name,r.date]);}).slice().sort(function(a,b){return (state.sort==='asc'?1:-1)*a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'zh-CN');});
    results.innerHTML=tableHtml('弟子首发',['弟子','首发日期'],releases.map(function(r){return [r.name,r.date];}));
   }else if(id==='costumes')results.innerHTML=tableHtml('戎装',['弟子','戎装名称'],data.costumes.filter(function(r){var missing=!r.costume||r.costume==='暂缺';return match([r.name,r.costume])&&(!state.availability||state.availability===(missing?'missing':'known'));}).map(function(r){return [r.name,r.costume||'暂缺'];}));
   else if(id==='fishing'){
    if(state.table==='fishing-totals')results.innerHTML=tables.filter(function(t){return t.id!=='fishing-species';}).map(generic).join('');
    else{
     var fish=data.fish.filter(function(f){return (!state.quality||state.quality===f.quality)&&(!state.attribute||Object.prototype.hasOwnProperty.call(f.base,state.attribute))&&match([f.name,f.quality,f.base]);});
     results.innerHTML=tableHtml('鱼类属性',['收集','鱼类','品质'].concat(ATTRS.map(attrLabel)),fish.map(function(f){return ['<label class="ref-exp-check"><input type="checkbox" data-exp-fish="'+esc(f.id)+'"'+(selected.has(f.id)?' checked':'')+' aria-label="收集'+esc(f.name)+'">收集</label>',esc(f.name),esc(f.quality)].concat(ATTRS.map(function(a){var stat=(state.mode==='max'?f.max:f.base)[a];return state.mode==='max'&&Object.prototype.hasOwnProperty.call(f.base,a)&&(stat===null||stat===undefined)?'满级数值暂缺':esc(value(stat));}));}),{raw:true,titleIndex:1,skipEmpty:true});
    }
    renderFishTotal();
   }else if(id==='disciple-awakening'){
    var rows=data.awakening.filter(function(r){return r.element===state.element&&(!state.star||r.from.startsWith(state.star+'星'))&&match([r.from,r.to,r.materials.map(function(m){return m.name;})]);});
    var running={},lookup=new Map(),incomplete=false;
    data.awakening.filter(function(r){return r.element===state.element;}).forEach(function(r){if((r.issues||[]).length)incomplete=true;r.materials.forEach(function(m){running[m.name]=(running[m.name]||0)+m.count;});lookup.set(r.from+'→'+r.to,(incomplete?'部分合计：':'')+Object.entries(running).map(function(m){return m[0]+'×'+num(m[1]);}).join('、'));});
    results.innerHTML=state.table==='awakening-source-totals'?generic():tableHtml('逐段与累计材料',['五行','阶段','本段材料','自0星累计'],rows.map(function(r){return [r.element,r.from+' → '+r.to,r.materials.map(function(m){return m.name+'×'+num(m.count);}).concat((r.issues||[]).map(function(issue){return '原表待确认：'+issue.text;})).join('、'),lookup.get(r.from+'→'+r.to)];}),{titleIndex:1});
   }else if(id==='jinchan'){
    var entries=data.jinchan.filter(function(r){return (!state.place||r.place===state.place)&&(!state.event||r.event===state.event)&&match([r.place,r.event,r.choice,r.result,r.reward,r.contribution]);});
    var used=new Set();
    results.innerHTML=state.table==='jinchan-blessings'?generic():tableHtml('正式服事件',['比较','地点','事件','处理选项','结果','加成／掉落','贡献'],entries.map(function(r){var key=choiceKey(r),first=!used.has(key);used.add(key);return [first?'<label class="ref-exp-check"><input type="checkbox" data-exp-choice="'+esc(key)+'"'+(compared.has(key)?' checked':'')+' aria-label="比较'+esc(r.choice)+'">比较</label>':'',esc(r.place),esc(r.event),esc(r.choice),esc(value(r.result)),esc(value(r.reward)),esc(value(r.contribution))];}),{raw:true,titleIndex:3});
    renderComparison();
   }else results.innerHTML=generic();
  }
  function choiceKey(r){return [r.place,r.event,r.choice].join('｜');}
  function renderComparison(){
   var rows=data.jinchan.filter(function(r){return compared.has(choiceKey(r));});
   selection.innerHTML=rows.length?'<section class="ref-exp-result"><h3>'+esc(rows[0].place+' · '+rows[0].event)+' · 选项比较</h3>'+tableHtml('选项比较',['处理选项','可能结果','加成／掉落','贡献'],rows.map(function(r){return [r.choice,r.result,r.reward,r.contribution];}))+'</section>':'';
  }
  function renderFishTotal(){
   var total=core.fishTotal(data.fish,Array.from(selected),state.mode);
   selection.innerHTML='<section class="ref-exp-result"><h3>已勾选 '+total.selectedCount+' 种 · '+(state.mode==='max'?'强化满级':'基础属性')+'</h3>'+ (total.selectedCount?tableHtml('勾选属性合计',['属性','合计'],statsRows(total.stats)):'')+(total.missing.length?'<p class="ref-exp-error">部分满级属性缺少来源数值，以下合计不完整：'+total.missing.map(function(m){return esc(m.name+' '+m.attribute);}).join('、')+'</p>':'')+'<button type="button" class="seg" data-exp-reset-fish>清空勾选</button></section>';
  }
  function renderTools(){
   var html='';
   if(id==='account-levels')html='<h3>升级区间</h3><div class="ref-exp-form">'+input('当前等级','from',1,1,100)+input('当前等级已获得经验','currentExperience',0)+input('目标等级','to',100,1,100)+'</div>';
   if(id==='disciple-awakening'){
    var rows=data.awakening.filter(function(r){return r.element===state.element;}),stages=unique(rows.flatMap(function(r){return [r.from,r.to];}));
    html='<h3>升金区间</h3><div class="ref-exp-form"><label>当前星／段<select data-exp-input="from">'+stages.map(function(s){return '<option>'+esc(s)+'</option>';}).join('')+'</select></label><label>目标星／段<select data-exp-input="to">'+stages.map(function(s,i){return '<option'+(i===stages.length-1?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select></label></div>';
   }
   if(id==='sage')html='<h3>圣贤令估算 · 27天／4次周任务</h3><p class="ref-note">按原表历史活动规则估算。</p><div class="ref-exp-form">'+input('日消耗体力','stamina',150)+input('日活跃度','activity',50)+input('每周消费元宝','weeklySpend',30000)+input('每周充值（元）','weeklyRecharge',0)+'<label class="ref-exp-check"><input type="checkbox" data-exp-input="master">解锁宗师奖励</label></div>';
   tools.innerHTML=html?'<section class="ref-exp-calculator">'+html+'<button type="button" class="seg" data-exp-calculate>计算</button><div data-exp-calculation role="status" aria-live="polite"></div></section>':'';
  }
  function readInputs(){var out={};tools.querySelectorAll('[data-exp-input]').forEach(function(el){var key=el.dataset.expInput;if(el.type==='checkbox')out[key]=el.checked;else if(el.tagName==='SELECT')out[key]=el.value;else{if(el.value.trim()===''||!el.validity.valid)throw new RangeError('请填写有效的'+el.parentElement.firstChild.textContent+'。');out[key]=Number(el.value);}});return out;}
  function calculate(){
   var dest=tools.querySelector('[data-exp-calculation]');
   try{
    var input=readInputs(),result,html='';
    if(id==='account-levels'){
     result=core.accountCost(data.accountLevels,input.from,input.to,input.currentExperience);
     html=tableHtml('升级需求',['项目','需求'],[['经验',num(result.experience)],['体力',num(result.stamina)],['烤山鸡（合并取整）',num(result.chickens)],['烤山鸡（逐级取整合计）',num(result.chickensByLevel)]]);
    }else if(id==='disciple-awakening'){
     result=core.awakeningCost(data.awakening,state.element,input.from,input.to);
     html=result.steps===0?'<p>无需材料。</p>':tableHtml('区间材料合计',['材料','数量'],result.materials.map(function(m){return [m.name,num(m.count)];}));
     if(result.issues.length)html='<p class="ref-exp-error">结果不完整：所选区间存在未能确定的原表材料。</p>'+html;
    }else{
     result=core.sageEstimate(input);
     var names={stamina:'体力任务经验',activity:'活跃任务经验',weeklySpend:'元宝消费任务经验',weeklyRecharge:'充值任务经验',recharge:'充值额外经验'};
     html=tableHtml('经验与圣贤令',['项目','数量'],Object.keys(names).map(function(k){return [names[k],num(result.parts[k])];}).concat([['经验合计',num(result.experience)],['圣贤令（取整前）',num(result.rawTokens)],['圣贤令（最终）',num(result.tokens)]]));
    }
    dest.innerHTML=html;
   }catch(error){
    var messages={'Invalid level range':'目标等级须不低于当前等级，且不得超过100级。','Current experience exceeds level requirement':'当前经验不得超过本级升级所需经验。','Invalid awakening range':'请选择有效的升金起点和终点，目标不得低于当前阶段。'};
    var message=messages[error.message]||(/^Missing level data: /.test(error.message)?'所选区间缺少等级资料，暂不能计算。':/^[A-Za-z]/.test(error.message)?'请输入有效的非负数值。':error.message);
    dest.innerHTML='<p class="ref-exp-error">'+esc(message)+'</p>';
   }
  }
  section.addEventListener('input',function(e){
   if(e.target.matches('[data-exp-query]')){state.query=e.target.value.trim();renderResults();}
   else if(e.target.matches('[data-exp-input]')){var output=tools.querySelector('[data-exp-calculation]');if(output)output.innerHTML='';}
  });
  section.addEventListener('change',function(e){
   var el=e.target;
   if(el.hasAttribute('data-exp-filter')){
    var key=el.dataset.expFilter;state[key]=el.value;
    if(key==='place'){state.event='';renderControls();}
    if(key==='element')renderTools();
    updateApplicableFilters();
    renderResults();
   }else if(el.hasAttribute('data-exp-fish')){if(el.checked)selected.add(el.dataset.expFish);else selected.delete(el.dataset.expFish);renderFishTotal();}
   else if(el.hasAttribute('data-exp-choice')){
    var key=el.dataset.expChoice;
    if(el.checked){var prefix=key.split('｜').slice(0,2).join('｜');Array.from(compared).forEach(function(k){if(k.split('｜').slice(0,2).join('｜')!==prefix)compared.delete(k);});compared.add(key);}else compared.delete(key);
    renderResults();
   }else if(el.hasAttribute('data-exp-input')){var output=tools.querySelector('[data-exp-calculation]');if(output)output.innerHTML='';}
  });
  section.addEventListener('click',function(e){var button=e.target.closest('button');if(!button)return;if(button.hasAttribute('data-exp-calculate'))calculate();if(button.hasAttribute('data-exp-reset-fish')){selected.clear();renderResults();}if(button.hasAttribute('data-exp-clear')){state.query='';state.year='';state.quality='';state.attribute='';state.star='';state.place='';state.event='';state.band='';state.availability='';renderControls();renderResults();}});
  renderControls();renderTools();renderResults();
  if(root.ResizeObserver){
   var wasNarrow=(section.getBoundingClientRect().width||root.innerWidth||1280)<760;
   var observer=new root.ResizeObserver(function(){
    if(!section.isConnected){observer.disconnect();return;}
    var isNarrow=section.getBoundingClientRect().width<760;
    if(isNarrow!==wasNarrow){wasNarrow=isNarrow;if(state.view==='auto')renderResults();}
   });observer.observe(section);
  }
  return true;
 }
 return {hasSection:hasSection,mount:mount};
});
