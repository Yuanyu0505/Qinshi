(function (root) {
  'use strict';
  var R=root.InscriptionRules, P=root.InscriptionPaths, S=root.InscriptionCraftingState, F=root.InscriptionFlowchart, T=root.InscriptionTerms, L=root.InscriptionSimulation;
  var views={}, store, state, token, accountId, loaded=false, sequence=0;
  var queryStore,queryTarget,queryToken,recovery=null;
  function targetFor(v){return v.mode==='crafting-paths'?queryTarget:state.target;}
  var favoriteStore, favoriteState=null, favoriteOperation=0, favoriteBusy=false;
  var modelNote='等概率模型，非实测游戏频率。各步骤概率以材料备齐为前提；置换概率未知，不计算整条路线的总成功率。';
  function esc(value) { return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function quality(id) { return R.qualities.find(function(q){return q.id===id;}); }
  function qLabel(id) { var q=quality(id); return q?q.label:id; }
  function probability(value) {
    var number=value*100, rounded=Math.round(number);
    if(value>0 && rounded===0)return '不足1%';
    if(value<1 && rounded===100)return '超过99%';
    return (Math.abs(number-rounded)>1e-8?'约':'')+rounded+'%';
  }
  function friendly(message) { return String(message).replace(/\b[HMLU]\b/g,T.tierLabel); }
  function field(v,name) { return v.el.querySelector('[data-craft-field="'+name+'"]'); }
  function area(v,name) { return v.el.querySelector('[data-craft-'+name+']'); }
  function options(list,value,empty) {
    return (empty===undefined?'':'<option value="">'+esc(empty)+'</option>')+list.map(function(item){
      var id=typeof item==='string'?item:item.id, label=typeof item==='string'?item:item.label;
      return '<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(label)+'</option>';
    }).join('');
  }
  function button(action,label,extra) { return '<button type="button" class="seg" data-craft-action="'+action+'"'+(extra||'')+'>'+esc(label)+'</button>'; }
  function status(v,text) { area(v,'status').textContent=text?friendly(text):''; area(v,'status').hidden=!text; }
  function itemFor(target) { return root.INSCRIPTION_DATA.items.find(function(item){return item.quality+'\0'+item.name===target.discipleKey;}); }
  function position(target) { return S.context(target); }
  function sameTarget(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
  function displayTerms(m,x) {
    return T.sortTerms(m.terms,m.quality).map(function(t){return t.attr===x?'杂词条 X':T.html(t,m.quality);}).join(' ＋ ');
  }
  function sceneExists(sim) { return !!sim.pending || sim.inputs.some(function(terms){return terms.some(Boolean);}); }
  function currentAccount() { var a=root.QinshiAccounts.currentAccount(); return a?a.id:null; }
  function save(v,next) {
    if (!loaded || currentAccount()!==accountId) { status(v,'账号已切换，请重新打开铭文分区后操作。'); return false; }
    try {
      var result=store.save(next,token,accountId);
      if (!result.valid) throw new Error(result.errors.join('；'));
      state=result.state; token=result.token; return true;
    } catch(error) { status(v,error.message); return false; }
  }
  function normalizeTarget(target) {
    var next=clone(target), item=itemFor(next);
    if (next.discipleKey && !item) { next.discipleKey=''; next.slot=''; }
    if (item) {
      var actual=item.slots.find(function(s){return next.slot===s.tian+'|'+R.normalizeDun(s.shield);});
      if (!actual) { next.slot=''; next.dun=''; } else next.dun=R.normalizeDun(actual.shield);
    } else next.slot='';
    var count=quality(next.quality).count;
    // A changed context can make a saved attribute unsupported. Keep its text so
    // the user can repair the goal deliberately instead of losing it on reopen.
    next.attrs=Array.from({length:count},function(_,i){return next.attrs[i]||'';});
    if(!next.xTerm||!S.xOptions(next).some(function(t){return t.attr===next.xTerm.attr&&t.tier===next.xTerm.tier;}))next.xTerm=null;
    return next;
  }
  function clearPlan(v){v.generation++;if(area(v,'results')){area(v,'results').innerHTML='';v.planTarget='';v.plan=null;v.routeSelections=new Map();}}
  function changeTarget(v,next) {
    var beforeTarget=targetFor(v),previousX=next.xTerm;
    next=normalizeTarget(S.targetAfterContextChange(beforeTarget,next));
    if(sameTarget(next,beforeTarget)){renderFilters(v);return;}
    if(v.mode==='crafting-paths'){
      try{var q=queryStore.save(next,queryToken,accountId);if(!q.valid)throw new Error(q.errors.join('；'));queryTarget=q.target;queryToken=q.token;clearPlan(v);renderFilters(v);}
      catch(e){status(v,e.message);renderFilters(v);}
      return;
    }
    if(recovery){status(v,'请先选择保留隔离或清空旧模拟数据；路径查询仍可正常使用。');renderFilters(v);return;}
    var before=position(beforeTarget),after=position(next),sim=state.simulation;
    var incompatible=before.prefix!==after.prefix||before.dun!==after.dun||R.qualities.findIndex(function(q){return q.id===sim.stage;})>=R.qualities.findIndex(function(q){return q.id===next.quality;});
    var queryOnly=next.discipleKey===beforeTarget.discipleKey&&next.slot===beforeTarget.slot&&next.dun===beforeTarget.dun&&next.quality===beforeTarget.quality&&JSON.stringify(next.attrs)===JSON.stringify(beforeTarget.attrs);
    if(queryOnly)incompatible=false;
    if(incompatible&&sceneExists(sim)&&!root.confirm('切换将重新准备当前模拟材料，已生成的结果保留到虚拟背包。是否继续？')){renderFilters(v);return;}
    try{var draft=incompatible?L.act(state,'reset'):clone(state);draft.target=next;
      if(save(v,draft)){v.bagSelection={};renderFilters(v);renderSimulator(v);if(previousX&&!next.xTerm)status(v,'原具体杂词 X 已恢复为未指定。');}
      else renderFilters(v);
    }catch(e){status(v,e.message);renderFilters(v);}
  }
  function init(mode) {
    var el=document.getElementById('inscription-'+mode);
    var v=views[mode]={mode:mode,el:el,generation:0,activeSuggestion:-1,planTarget:''};
    var searchId=mode+'-disciple-suggestions';
    el.innerHTML='<div data-craft-status class="craft-status" role="alert" hidden></div>'+
      '<section class="craft-panel"><h3>'+(mode==='crafting-paths'?'合成路径查询':'合成模拟')+'</h3>'+
      '<p class="craft-note">本页筛选独立保存，与另一页互不影响。模拟及背包按当前游戏账号保存，不关联真实铭文库存。</p>'+
      '<div class="craft-controls craft-filters"><label class="craft-search">弟子搜索（可不选）'+
      '<input type="search" data-craft-field="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="'+searchId+'" placeholder="输入姓名，例如盖聂">'+
      '<span id="'+searchId+'" class="craft-suggestions" data-craft-suggestions role="listbox" hidden></span></label>'+
      '<label>弟子天遁位<select data-craft-field="slot"></select></label>'+
      '<label>目标品质<select data-craft-field="quality">'+options(R.qualities,'o2')+'</select></label>'+
      '<label>遁位<select data-craft-field="dun">'+options(R.duns.map(function(d){return d.id;}),'','请选择遁位')+'</select></label></div>'+
      '<div class="craft-actions">'+button('clear-options','清除所有选项')+'</div>'+
      '<div data-craft-attrs class="craft-attrs"></div>'+
      '<p class="craft-note">属性槽由品质决定，必须选满；同属性同档位不能重复，每枚最多两条高档。</p>'+
      (mode==='crafting-paths'?'<div class="craft-controls craft-x-picker"><label>具体杂词 X（可选）<select data-craft-field="x-term"></select></label></div><p class="craft-note" data-craft-x-note></p>':'')+
      '<div data-craft-analysis></div></section>'+
      '<details class="craft-panel craft-values"><summary>所选属性的品质、档位与数值</summary><div data-craft-matrix></div></details>'+
      (mode==='crafting-paths'?'<div class="craft-actions">'+button('generate','一键查询合成路径')+'</div><div data-craft-results></div>':
        '<section class="craft-panel"><h3>本次模拟材料</h3><p class="craft-note">手动填写代表洗练备料；紫色开始中档只能合成获得，请从虚拟背包取用。所有模拟数据按游戏账号保存，不影响真实个人进度。</p><div data-craft-simulator></div></section>');
    el.addEventListener('change',function(event){onChange(v,event.target);});
    el.addEventListener('click',function(event){
      var attrControl=event.target.closest('[data-craft-attr-trigger],[data-craft-attr-option]');
      if(attrControl){onAttrClick(v,attrControl);return;}
      var control=event.target.closest('[data-craft-action]');
      if(control&&control.dataset.craftAction==='toggle-favorite'){event.preventDefault();event.stopPropagation();}
      if(control) onClick(v,control);
    });
    el.addEventListener('keydown',function(event){if(event.target.matches('[data-craft-attr-trigger]'))onAttrKey(v,event);});
    el.addEventListener('input',function(event){if(event.target===field(v,'search')) suggestions(v);if(event.target.matches('[data-bag-count]'))updateBagSelection(v,event.target);});
    field(v,'search').addEventListener('focus',function(){if(!itemFor(targetFor(v))) suggestions(v);});
    field(v,'search').addEventListener('keydown',function(event){
      var list=area(v,'suggestions'), choices=Array.from(list.querySelectorAll('[data-craft-action="choose-disciple"]'));
      if(event.key==='Escape'){hideSuggestions(v);return;}
      if(!['ArrowDown','ArrowUp','Enter'].includes(event.key)) return;
      if(list.hidden || !choices.length){if(event.key==='ArrowDown') suggestions(v);return;}
      event.preventDefault();
      if(event.key==='Enter'){if(v.activeSuggestion>=0) choices[v.activeSuggestion].click();return;}
      v.activeSuggestion=v.activeSuggestion<0 ? (event.key==='ArrowDown'?0:choices.length-1) :
        (v.activeSuggestion+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length;
      choices.forEach(function(choice,i){choice.setAttribute('aria-selected',String(i===v.activeSuggestion));});
      field(v,'search').setAttribute('aria-activedescendant',choices[v.activeSuggestion].id);
      choices[v.activeSuggestion].scrollIntoView({block:'nearest'});
    });
    return v;
  }
  function hideSuggestions(v) {
    area(v,'suggestions').hidden=true; field(v,'search').setAttribute('aria-expanded','false');
    field(v,'search').removeAttribute('aria-activedescendant'); v.activeSuggestion=-1;
  }
  function suggestions(v) {
    if(!loaded)return;
    var query=field(v,'search').value.trim().replace(/[·\s]/g,'').toLowerCase(), list=area(v,'suggestions');
    if(!query){hideSuggestions(v);return;}
    var items=root.INSCRIPTION_DATA.items.filter(function(item){return item.name.replace(/[·\s]/g,'').toLowerCase().includes(query);});
    list.innerHTML=items.length?items.map(function(item,i){
      return '<button type="button" role="option" aria-selected="false" id="'+v.mode+'-suggestion-'+i+'" data-craft-action="choose-disciple" data-key="'+esc(encodeURIComponent(item.quality+'\0'+item.name))+'">'+esc(item.name)+'<small>'+esc(item.quality)+'</small></button>';
    }).join(''):'<span class="craft-note">没有匹配弟子，可使用独立遁位筛选。</span>';
    list.hidden=false; field(v,'search').setAttribute('aria-expanded','true'); v.activeSuggestion=-1;
  }
  function targetCompletion(target) {
    var dun=position(target).dun,attrs=target.attrs.slice(),available=Array.from(new Set(R.termsFor(dun,target.quality).map(function(t){return t.attr;})));
    if(!dun)return {valid:false,reason:'请先选择弟子实际位置或独立遁位。'};
    // Check complete goals through the rule engine, including common origin and
    // the two-high limit. A duplicate-count check alone misses e.g. purple M/L.
    function complete(index) {
      while(index<attrs.length&&attrs[index])index++;
      if(index===attrs.length)return R.bestTargets(dun,target.quality,attrs).targets.length>0;
      for(var i=0;i<available.length;i++){
        attrs[index]=available[i];
        if(complete(index+1)){attrs[index]='';return true;}
      }
      attrs[index]='';return false;
    }
    if(complete(0))return {valid:true,reason:''};
    var example=target.attrs.slice();
    // Distinct fillers produce an explanation about the fixed selections, not
    // an accidental repeated filler introduced only while checking empty slots.
    example.forEach(function(attr,i){if(!attr)example[i]=available.find(function(a){return !example.includes(a);})||available[0];});
    var reason=R.bestTargets(dun,target.quality,example).reason;
    return {valid:false,reason:(target.attrs.some(function(a){return !a;})?'保留其他已选属性后，剩余空槽无法补全合法组合。':'')+reason};
  }
  function candidateTarget(v,index,value) {var next=clone(targetFor(v));next.attrs[index]=value;return next;}
  function attrTrigger(v,index) {return v.el.querySelector('[data-craft-attr-trigger][data-index="'+index+'"]');}
  function closeAttrPicker(v) {
    area(v,'attrs').querySelectorAll('[data-craft-attr-trigger]').forEach(function(trigger){trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');});
    area(v,'attrs').querySelectorAll('.craft-attr-options').forEach(function(list){list.hidden=true;});
    v.attrOpen=null;v.attrActive=-1;
  }
  function activateAttrOption(v,index,active) {
    var trigger=attrTrigger(v,index),list=document.getElementById(trigger.getAttribute('aria-controls')),choices=list.querySelectorAll('[data-craft-attr-option]');
    v.attrActive=(active+choices.length)%choices.length;
    choices.forEach(function(choice,i){choice.classList.toggle('is-active',i===v.attrActive);});
    trigger.setAttribute('aria-activedescendant',choices[v.attrActive].id);
    choices[v.attrActive].scrollIntoView({block:'nearest'});
  }
  function openAttrPicker(v,index,active) {
    closeAttrPicker(v);var trigger=attrTrigger(v,index);if(!trigger||trigger.disabled)return;
    var list=document.getElementById(trigger.getAttribute('aria-controls'));
    list.hidden=false;trigger.setAttribute('aria-expanded','true');v.attrOpen=index;
    list.style.left='0';list.style.right='auto';
    var bounds=list.getBoundingClientRect(),viewport=document.documentElement.clientWidth;
    list.style.left=Math.max(12-bounds.left,Math.min(0,viewport-12-bounds.right))+'px';
    var choices=Array.from(list.querySelectorAll('[data-craft-attr-option]'));
    activateAttrOption(v,index,active===undefined?Math.max(0,choices.findIndex(function(choice){return choice.dataset.value===targetFor(v).attrs[index];})):active);
  }
  function renderAttrFeedback(v) {
    var feedback=area(v,'attr-feedback'),result=targetCompletion(targetFor(v)),message=v.attrRejection;
    if(!message&&position(targetFor(v)).dun&&!result.valid)message='原目标属性已保留，请手动调整。'+result.reason;
    feedback.hidden=!message;
    feedback.innerHTML=message?'<b>无法组成所选搭配</b><p>'+esc(friendly(message))+'</p>':'';
  }
  function selectAttr(v,index,value) {
    if(!loaded||currentAccount()!==accountId){status(v,'请重新打开铭文分区后再操作。');return;}
    var next=candidateTarget(v,index,value),result=targetCompletion(next);
    // Clearing a slot is always possible, including when repairing an old goal.
    if(value&&!result.valid){v.attrRejection=result.reason;renderAttrFeedback(v);attrTrigger(v,index).focus();return;}
    v.attrRejection='';closeAttrPicker(v);status(v,'');changeTarget(v,next);
    var trigger=attrTrigger(v,index);if(trigger)trigger.focus();
  }
  function onAttrClick(v,control) {
    var index=Number(control.dataset.index);
    if(control.hasAttribute('data-craft-attr-option')){selectAttr(v,index,control.dataset.value);return;}
    if(v.attrOpen===index)closeAttrPicker(v);else openAttrPicker(v,index);
  }
  function onAttrKey(v,event) {
    var trigger=event.target,index=Number(trigger.dataset.index),key=event.key;
    if(key==='Tab'){closeAttrPicker(v);return;}
    if(key==='Escape'){event.preventDefault();closeAttrPicker(v);return;}
    if(!['ArrowDown','ArrowUp','Enter',' '].includes(key))return;
    event.preventDefault();
    if(v.attrOpen!==index){openAttrPicker(v,index,key==='ArrowUp'?-1:undefined);return;}
    if(key==='ArrowDown'||key==='ArrowUp'){activateAttrOption(v,index,v.attrActive+(key==='ArrowDown'?1:-1));return;}
    var list=document.getElementById(trigger.getAttribute('aria-controls')),choice=list.querySelectorAll('[data-craft-attr-option]')[v.attrActive];
    if(choice)selectAttr(v,index,choice.dataset.value);
  }
  function renderAttrPickers(v,attrs,dun) {
    var host=area(v,'attrs'),focused=document.activeElement,focusedIndex=focused&&focused.hasAttribute('data-craft-attr-trigger')&&v.el.contains(focused)?Number(focused.dataset.index):null;
    closeAttrPicker(v);
    host.style.setProperty('--craft-slots',quality(targetFor(v).quality).count);
    host.innerHTML=targetFor(v).attrs.map(function(attr,i){
      var id=v.mode+'-attr-'+i,listId=id+'-options',choices=attrs.slice();if(attr&&!choices.includes(attr))choices.push(attr);
      return '<div class="craft-attr-picker"><span id="'+id+'-label">目标属性'+(i+1)+'</span>'+
        '<select class="craft-attr-native" aria-hidden="true" tabindex="-1" data-craft-field="attr" data-index="'+i+'"'+(!dun?' disabled':'')+'>'+options(choices,attr,'请选择属性')+'</select>'+
        '<button type="button" id="'+id+'" class="craft-attr-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="'+listId+'" aria-labelledby="'+id+'-label '+id+'-value" aria-describedby="'+v.mode+'-attr-feedback" data-craft-attr-trigger data-index="'+i+'"'+(!dun?' disabled':'')+'><span id="'+id+'-value">'+esc(attr||'请选择属性')+'</span></button>'+
        '<div id="'+listId+'" class="craft-attr-options" role="listbox" aria-labelledby="'+id+'-label" hidden>'+[''].concat(choices).map(function(value,j){
          var result=value?targetCompletion(candidateTarget(v,i,value)):{valid:true};
          return '<button type="button" role="option" tabindex="-1" id="'+id+'-option-'+j+'" aria-selected="'+String(value===attr)+'" aria-disabled="'+String(!result.valid)+'" data-craft-attr-option data-index="'+i+'" data-value="'+esc(value)+'">'+esc(value||'请选择属性')+(!result.valid?'<small>不可选 · 点击查看原因</small>':'')+'</button>';
        }).join('')+'</div></div>';
    }).join('')+'<div id="'+v.mode+'-attr-feedback" data-craft-attr-feedback class="craft-analysis unavailable craft-attr-feedback" role="status" aria-live="polite" hidden></div>';
    renderAttrFeedback(v);
    if(focusedIndex!==null&&attrTrigger(v,focusedIndex))attrTrigger(v,focusedIndex).focus();
  }
  function renderFilters(v) {
    var target=targetFor(v),item=itemFor(target),dun=position(target).dun;
    field(v,'search').value=item?item.name:''; hideSuggestions(v);
    field(v,'slot').innerHTML=options(item?item.slots.map(function(s){return{id:s.tian+'|'+R.normalizeDun(s.shield),label:s.tian+' · '+R.normalizeDun(s.shield)};}):[],target.slot,item?'请选择弟子实际位置':'未指定弟子：可独立选择遁位');
    field(v,'slot').disabled=!item; field(v,'quality').value=target.quality;
    field(v,'dun').value=dun||''; field(v,'dun').disabled=!!item;
    field(v,'dun').title=item?'遁位由所选弟子的实际铭文位置确定':'未指定弟子时可独立筛选';
    var attrs=Array.from(new Set(R.termsFor(dun,target.quality).map(function(t){return t.attr;})));
    renderAttrPickers(v,attrs,dun);
    if(field(v,'x-term')){
      var chosen=target.xTerm,termId=chosen?chosen.attr+':'+chosen.tier:'';
      field(v,'x-term').innerHTML=options(T.sortTerms(S.xOptions(target),target.quality).map(function(t){return {id:t.attr+':'+t.tier,label:T.plain(t,target.quality)};}),termId,'不指定 X（符号模板）');
      field(v,'x-term').disabled=!dun;
      area(v,'x-note').innerHTML=chosen?'已指定具体 X：'+T.html(chosen,target.quality)+'。沿途保持同一属性、同一档位，数值随品质变化；各阶段仍需满足合法来源，不可用时会说明。':'未指定 X：保留“杂词条 X（同一个）”的符号写法。模板概率以同一种合法不分档杂词为条件，不能直接套用于任意带档位的属性。此选择仅用于路径查询，不改变模拟投料。';
    }
    renderAnalysis(v); renderMatrix(v);
  }
  function renderAnalysis(v) {
    var target=targetFor(v),dun=position(target).dun,host=area(v,'analysis');
    if(!dun){host.innerHTML='<p class="craft-note">请选择弟子实际位置，或不指定弟子后独立选择遁位。</p>';return;}
    if(target.attrs.some(function(a){return !a;})){host.innerHTML='<p class="craft-note">选满当前品质的'+quality(target.quality).count+'条目标属性后，显示可行性及最优组合。</p>';return;}
    var best=R.bestTargets(dun,target.quality,target.attrs);
    if(best.targets.length){host.innerHTML='<div class="craft-analysis"><b>可以组成，最优合法组合：</b>'+best.targets.map(function(terms){return '<p>'+displayTerms({terms:terms,quality:target.quality})+'</p>';}).join('')+'</div>';return;}
    var replacements=[],known=new Set(),available=Array.from(new Set(R.termsFor(dun,target.quality).map(function(t){return t.attr;})));
    function alternatives(start,remaining,changed){
      if(replacements.length>=3)return;
      if(!remaining){
        var key=changed.slice().sort().join('|');if(known.has(key))return;known.add(key);
        var candidate=R.bestTargets(dun,target.quality,changed);
        if(candidate.targets.length)replacements.push({attrs:changed,terms:candidate.targets[0]});
        return;
      }
      for(var i=start;i<=target.attrs.length-remaining;i++) available.forEach(function(attr){
        if(attr===target.attrs[i])return;
        var next=changed.slice();next[i]=attr;alternatives(i+1,remaining-1,next);
      });
    }
    for(var changes=1;changes<=target.attrs.length&&!replacements.length;changes++)alternatives(0,changes,target.attrs.slice());
    host.innerHTML='<div class="craft-analysis unavailable"><b>无法组成所选搭配</b><p>'+esc(friendly(best.reason))+'</p>'+
      (replacements.length?'<p>可参考的合法替代（仅建议，不会替换选择）：</p><ul>'+replacements.slice(0,3).map(function(item){return '<li>'+esc(item.attrs.join(' ＋ '))+' → '+displayTerms({terms:item.terms,quality:target.quality})+'</li>';}).join('')+'</ul>':'<p>请减少重复属性，或调整遁位、目标品质。</p>')+'</div>';
  }
  function renderMatrix(v) {
    var target=targetFor(v),dun=position(target).dun,attrs=Array.from(new Set(target.attrs.filter(Boolean)));
    area(v,'matrix').innerHTML=!attrs.length?'<p class="craft-note">先选择目标属性。</p>':
      '<p class="craft-note">标签说明单条词条的获取方式，整枚材料仍需合法；蓝二速度不区分肉眼无法识别的档位。表格可左右滑动。</p>'+
      '<div class="craft-scroll" tabindex="0" aria-label="所选属性成长数值"><table class="craft-table craft-matrix"><thead><tr><th>属性</th>'+R.qualities.map(function(q){return '<th>'+q.label+'</th>';}).join('')+'</tr></thead><tbody>'+attrs.map(function(attr){
        return '<tr><th>'+esc(attr)+'</th>'+R.qualities.map(function(q){
          return '<td>'+R.termsFor(dun,q.id).filter(function(t){return t.attr===attr;}).map(function(t){
            var sources=['wash','crafted'].filter(function(origin){return R.termsFor(dun,q.id,origin).some(function(term){return term.attr===t.attr&&term.tier===t.tier;});});
            return '<div>'+T.html(t,q.id)+'<small>'+sources.map(function(s){return s==='wash'?'置换':'合成';}).join(' / ')+'</small></div>';
          }).join('')+'</td>';
        }).join('')+'</tr>';
      }).join('')+'</tbody></table></div>';
  }
  function graphMaterial(m,x,extra) {
    return '<div class="craft-node craft-quality-'+m.quality+' '+(extra||'')+'"><b>'+esc(qLabel(m.quality))+'</b><p>'+displayTerms(m,x)+'</p></div>';
  }
  function inspectFavorites() {
    var api=root.InscriptionRouteFavorites;
    if(!api||!root.QinshiAccounts)return;
    if(!favoriteStore)favoriteStore=api.createStore(root.QinshiAccounts,{items:root.INSCRIPTION_DATA.items});
    favoriteState=favoriteStore.inspect();
  }
  function favoriteFor(route,target,xAttr) {
    if(!favoriteState||!favoriteState.valid||favoriteState.accountId!==accountId)return null;
    return root.InscriptionRouteFavorites.match(favoriteState.entries.filter(function(entry){return entry.valid;}).map(function(entry){return entry.record;}),route,target,xAttr);
  }
  function variantIngredient(node,route) {
    var x=route.xTerm;
    function carriesX(current){
      if(route.symbolicX===false||!x||!current.material.terms.some(function(t){return t.attr===x.attr&&t.tier===x.tier;}))return false;
      if(current.kind==='base'||current.kind==='wash')return current.xSource===true;
      return current.kind==='craft'&&current.children.some(function(c){return carriesX(c.node);});
    }
    var symbolic=carriesX(node);
    return qLabel(node.material.quality)+'：'+T.sortTerms(node.material.terms,node.material.quality).map(function(t){
      return symbolic&&t.attr===x.attr&&t.tier===x.tier?'杂词条 X（同一个）':T.plain(t,node.material.quality);
    }).join('＋');
  }
  function renderPlan(v,plan) {
    var host=area(v,'results'),target=targetFor(v);
    var opened={};host.querySelectorAll('details[data-route-card]').forEach(function(details){opened[details.dataset.routeCard]=details.open;});
    if(!v.routeSelections)v.routeSelections=new Map();
    v.plan=plan;
    host.innerHTML='<section class="craft-panel"><h3>从蓝二到'+qLabel(target.quality)+'的完整路线</h3><p class="craft-note">'+modelNote+'</p>'+
      '<p class="craft-note">'+(target.discipleKey?esc(itemFor(target).name+' · '+target.slot.replace('|',' · '))+'。':'通用遁位路线：全部材料必须为同一个前缀、同一个遁位。')+
      (plan.symbolicX===false?'具体杂词 X：'+T.html(plan.xTerm,target.quality)+'；按实际词条逐阶段校验并计算，不会自动替换成其他 X。':'杂词条 X 不指定具体属性，默认采用同一种词条/不分档词条；本路线需要一致的 X 不可换成多个不同杂词条。所示概率以同一种合法不分档杂词为条件。')+'</p>'+
      (plan.notes||[]).map(function(note){return '<p class="craft-note">'+esc(note)+'</p>';}).join('')+
      '<p class="craft-note">按材料准备方式展示常规代表路线，不穷举所有材料树，也不把投料顺序变化算作新方案。每步概率均以该步材料已经备齐为条件，置换概率未知。点击星标收藏当前完整路线，收藏方案统一排在所有未收藏方案之前。</p><div data-route-groups></div></section>';
    var groups=host.querySelector('[data-route-groups]');
    var entries=plan.strategies.map(function(route,index){return {route:route,index:index,favorite:favoriteFor(route,target,plan.xAttr)};});
    var ideas=P.groupStrategies(plan.strategies);
    ['favorites','deterministic','probability'].forEach(function(kind){
      var routes=kind==='favorites'?entries.filter(function(entry){return !!entry.favorite;}).map(function(entry){return {id:'favorite:'+entry.index,kind:entry.route.kind,variants:[entry]};}):
        ideas.filter(function(group){return group.kind===kind;}).map(function(group){return {id:group.id,kind:group.kind,label:group.label,variants:group.variants.filter(function(variant){return !entries[variant.index].favorite;}).map(function(variant){return entries[variant.index];})};}).filter(function(group){return group.variants.length;});
      if(kind==='favorites'&&!routes.length)return;
      var heading=document.createElement('h4');heading.className=kind==='favorites'?'craft-favorite-group-title':'';heading.textContent=kind==='favorites'?'已收藏方案（统一置顶）':kind==='deterministic'?'未收藏 · 必中合成方案（置换准备另计）':'未收藏 · 概率合成方案';groups.appendChild(heading);
      if(!routes.length){var note=document.createElement('p');note.className='craft-note';note.textContent=entries.some(function(entry){return entry.route.kind===kind;})?'此类方案均已收藏并置顶。':kind==='deterministic'?'当前目标没有已知的全程必中合成路线，不会把随机补词条当作必中。':'当前目标不需要单独展示额外的概率路线。';groups.appendChild(note);}
      routes.forEach(function(group,index){
        var entry=group.variants.find(function(variant){return variant.index===v.routeSelections.get(group.id);})||group.variants[0],route=entry.route;
        var details=document.createElement('details');details.className='craft-strategy';
        details.dataset.routeCard=group.id;details.dataset.routeKind=route.kind;
        details.dataset.routeIndex=String(entry.index);if(entry.favorite)details.classList.add('craft-favorite-pinned');
        var title=kind==='favorites'?'收藏路线 '+(index+1)+' · '+(route.kind==='deterministic'?'必中':'概率'):(route.kind==='deterministic'?'必中路线 ':'概率思路 ')+(index+1);
        details.innerHTML='<summary class="craft-route-summary"><span>'+esc(title)+' · 蓝二 → '+qLabel(target.quality)+'</span>'+
          '<button type="button" class="craft-favorite-star'+(entry.favorite?' is-favorite':'')+'" data-craft-action="toggle-favorite" data-route-index="'+entry.index+'" aria-label="'+(entry.favorite?'取消收藏此完整路线':'收藏此完整路线')+'" aria-pressed="'+(entry.favorite?'true':'false')+'" title="'+(entry.favorite?'取消收藏':'收藏完整路线')+'"'+(!favoriteState||!favoriteState.valid||favoriteState.readOnly||favoriteBusy?' disabled':'')+'>'+(entry.favorite?'★':'☆')+'</button></summary><div class="craft-strategy-body"></div>';
        if(kind==='probability'){
          var picker=document.createElement('div');picker.className='craft-route-picker';
          picker.innerHTML='<p class="craft-note">'+esc(group.label)+'</p><label>选择具体配料（仅切换当前完整路线）<select data-route-variant>'+group.variants.map(function(variant,i){
            var node=variant.route.tree;if(node.material.quality==='o2'&&node.children.length)node=node.children[0].node;
            var ingredients=node.children.map(function(c){return variantIngredient(c.node,variant.route)+' × '+c.quantity;}).join('；');
            return '<option value="'+variant.index+'"'+(variant.index===entry.index?' selected':'')+'>'+esc('配料 '+(i+1)+' · '+ingredients)+'</option>';
          }).join('')+'</select></label>';
          details.insertBefore(picker,details.querySelector('.craft-strategy-body'));
          picker.querySelector('select').addEventListener('change',function(event){
            entry=group.variants.find(function(variant){return variant.index===Number(event.target.value);});route=entry.route;
            v.routeSelections.set(group.id,entry.index);details.dataset.routeIndex=String(entry.index);
            details.querySelector('[data-craft-action="toggle-favorite"]').dataset.routeIndex=String(entry.index);
            rendered=false;fill();
          });
        }
        v.routeSelections.set(group.id,entry.index);
        var rendered=false;
        function fill(){if(rendered)return;rendered=true;var body=details.querySelector('.craft-strategy-body');body.renderFlow=function(show){
          var old=body.querySelector('[data-flow-viewer]'),zoom=old?Number(old.dataset.zoom):0.9;
          body.innerHTML=F.render(route,plan.xAttr,{showFailures:show,positionLabel:target.discipleKey?target.slot.replace('|',' · '):position(target).dun});
          body.dataset.failures=show?'open':'closed';
          var viewer=body.querySelector('[data-flow-viewer]'),drawing=viewer.querySelector('svg');viewer.dataset.zoom=String(zoom);if(F.bind)F.bind(viewer);
          drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*zoom)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*zoom)+'px';
          viewer.querySelector('[data-craft-action="diagram-reset"]').textContent=Math.round(zoom*100)+'%';
        };body.renderFlow(false);}
        details.addEventListener('toggle',function(){if(details.open)fill();});
        groups.appendChild(details);if(Object.prototype.hasOwnProperty.call(opened,group.id)?opened[group.id]:index===0){fill();details.open=true;}
      });
    });
    if(favoriteState&&(!favoriteState.valid||favoriteState.readOnly)){
      var warning=document.createElement('p');warning.className='craft-legacy-warning';warning.textContent=!favoriteState.valid?'收藏读取失败，原始数据已保留：'+favoriteState.errors.join('；'):'账号当前为只读，仍可查询路线；收藏操作需先取得编辑权。';groups.prepend(warning);
    }
  }
  function toggleFavorite(v,control) {
    if(favoriteBusy)return;
    if(!favoriteStore||!favoriteState||!favoriteState.valid||favoriteState.accountId!==accountId){status(v,'收藏存档不可用，请重新打开铭文分区后操作。');return;}
    if(!v.plan||v.planTarget!==JSON.stringify(targetFor(v))){status(v,'查询目标已变化，请重新查询后收藏。');return;}
    var route=v.plan.strategies[Number(control.dataset.routeIndex)],account=accountId,operation=++favoriteOperation;
    if(!route)return;favoriteBusy=true;Object.keys(views).forEach(function(key){views[key].el.querySelectorAll('[data-craft-action="toggle-favorite"]').forEach(function(button){button.disabled=true;});});
    try{
      favoriteStore.toggle(route,clone(targetFor(v)),v.plan.xAttr,favoriteState.token,account).then(function(result){
        if(!loaded||accountId!==account||currentAccount()!==account||operation!==favoriteOperation)return;
        favoriteBusy=false;favoriteState=result;status(v,'');
        root.dispatchEvent(new CustomEvent('inscription-route-favorites-change'));
      }).catch(function(error){
        if(accountId!==account||currentAccount()!==account||operation!==favoriteOperation)return;
        favoriteBusy=false;status(v,'收藏未成功保存：'+error.message);Object.keys(views).forEach(function(key){views[key].el.querySelectorAll('[data-craft-action="toggle-favorite"]').forEach(function(button){button.disabled=!!favoriteState.readOnly;});});
      });
    }catch(error){favoriteBusy=false;status(v,'收藏未成功保存：'+error.message);Object.keys(views).forEach(function(key){views[key].el.querySelectorAll('[data-craft-action="toggle-favorite"]').forEach(function(button){button.disabled=!!favoriteState.readOnly;});});}
  }
  function generate(v) {
    var target=targetFor(v),p=position(target),best=R.bestTargets(p.dun,target.quality,target.attrs);
    if(!best.targets.length){status(v,best.reason);return;}
    var request=++v.generation, selected=JSON.stringify(target),account=accountId;
    status(v,'正在整理完整合成路线……');
    root.setTimeout(function(){
      if(!loaded||currentAccount()!==account||accountId!==account||request!==v.generation||JSON.stringify(targetFor(v))!==selected)return;
      try{
        var result=P.representative({prefix:p.prefix,dun:p.dun,quality:target.quality,attrs:target.attrs,xTerm:target.xTerm||null});
        if(!result.valid)throw new Error(result.errors.concat(result.notes||[]).join('；'));
        if(!result.strategies.length)throw new Error('当前目标尚无可展示的完整路线；不会用不合法步骤补齐。');
        v.planTarget=selected; renderPlan(v,result); status(v,'');
      }catch(error){status(v,error.message);}
    },0);
  }
  function availableStages(v) {
    var index=R.qualities.findIndex(function(q){return q.id===targetFor(v).quality;});
    return R.qualities.slice(0,Math.max(1,index));
  }
  function blankInputs(stage) {
    var recipe=R.recipes[stage];
    return recipe?Array.from({length:recipe.count},function(){return Array(quality(stage).count).fill(null);}):[];
  }
  function partialAllowed(v,peers,term,stage) {
    var selected=peers.filter(Boolean).concat([term]), keys=selected.map(function(t){return t.attr+':'+t.tier;});
    if(new Set(keys).size!==keys.length || selected.filter(function(t){return t.tier==='H';}).length>2)return false;
    var available=R.termsFor(position(targetFor(v)).dun,stage,'wash');
    return selected.every(function(t){return available.some(function(a){return a.attr===t.attr&&a.tier===t.tier;});});
  }
  function renderBag(v){
    if(!v.bagOpen)return '';
    var p=position(targetFor(v)),sim=state.simulation,entries=L.groups(state),capacity=L.selectionCapacity(state);
    if(!v.bagSelection)v.bagSelection={};
    return '<section class="craft-backpack"><h4>虚拟合成背包 · 本账号共用</h4><p class="craft-note">相同铭文合并库存，分别保留合成来源。增加数量记为手动补充。勾选铭文只填空材料位，不替换已填写材料。</p><p data-bag-summary role="status">剩余 '+capacity+' 个材料位</p>'+
      (entries.length?'<div class="craft-bag-list">'+entries.map(function(g){
        var eligible=g.available>0&&capacity>0&&!sim.pending&&!sim.legacy&&g.material.prefix===p.prefix&&g.material.dun===p.dun&&g.material.quality===sim.stage;
        var chosen=eligible?Math.min(v.bagSelection[g.id]||0,g.available,capacity):0;
        var records=Array.from(new Set(g.lots.filter(function(l){return l.quantity>0&&l.source.type==='simulation';}).map(function(l){return l.source.recordId;})));
        return '<article class="craft-bag-item" data-bag-id="'+esc(g.id)+'" data-available="'+g.available+'" data-eligible="'+String(eligible)+'"><div><label class="craft-bag-pick"><input type="checkbox" data-bag-check'+(chosen?' checked':'')+(!eligible?' disabled':'')+' aria-label="选用此铭文">'+esc(g.material.prefix+' · '+g.material.dun+' · '+qLabel(g.material.quality))+'</label><p>'+displayTerms(g.material)+'</p><p class="craft-note">库存 '+g.quantity+'枚 · 可选 '+g.available+'枚'+(g.reserved?' · 已占用 '+g.reserved+'枚':'')+'</p></div>'+
          '<div class="craft-bag-controls"><label>背包数量<input type="number" min="'+g.reserved+'" step="1" value="'+g.quantity+'" data-bag-total="'+esc(g.id)+'"></label><label>本次选用<input type="number" min="1" max="'+Math.min(g.available,capacity)+'" step="1" value="'+(chosen||1)+'" data-bag-count'+(!eligible?' disabled':'')+'></label>'+
          button('remove-lot','移除',' data-lot="'+esc(g.id)+'"')+
          (records.length?'<label>合成来源<select data-bag-route>'+records.map(function(id,i){return '<option value="'+esc(id)+'">来源 '+(i+1)+'</option>';}).join('')+'</select></label>'+button('actual-route','查看此铭文完整路线'):'<span class="craft-note">手动材料，无模拟制作记录</span>')+'</div></article>';
      }).join('')+'</div>':'<p class="craft-note">背包暂无铭文。模拟后加入虚拟背包，或进入下一阶段自动保存。</p>')+
      '<div class="craft-actions">'+button('use-selected','使用勾选铭文',sim.pending||!capacity?' disabled':'')+button('clear-bag','一键清空背包')+button('close-bag','收起背包')+'</div></section>';
  }
  function updateBagSelection(v,control){
    var rows=Array.from(v.el.querySelectorAll('[data-bag-id]')),cap=L.selectionCapacity(state),changed=control&&control.closest('[data-bag-id]');
    if(!changed){var left=cap;rows.forEach(function(row){var check=row.querySelector('[data-bag-check]'),count=row.querySelector('[data-bag-count]');if(!check.checked)return;var use=Math.min(left,Number(row.dataset.available),Math.max(0,Number(count.value)||0));check.checked=use>0;if(use)count.value=String(use);left-=use;});}
    if(changed){var check=changed.querySelector('[data-bag-check]'),count=changed.querySelector('[data-bag-count]'),others=rows.reduce(function(n,row){return n+(row!==changed&&row.querySelector('[data-bag-check]').checked?Number(row.querySelector('[data-bag-count]').value)||0:0);},0);
      var max=Math.min(Number(changed.dataset.available),Math.max(0,cap-others));
      if(check.checked&&!max){check.checked=false;status(v,'已选满本次剩余材料位。');}
      if(max>0)count.value=String(Math.min(max,Math.max(1,Math.floor(Number(count.value)||1))));
    }
    var total=rows.reduce(function(n,row){return n+(row.querySelector('[data-bag-check]').checked?Number(row.querySelector('[data-bag-count]').value)||0:0);},0);
    v.bagSelection={};rows.forEach(function(row){var check=row.querySelector('[data-bag-check]'),count=row.querySelector('[data-bag-count]'),own=check.checked?Number(count.value):0;
      var max=Math.min(Number(row.dataset.available),Math.max(0,cap-total+own)),eligible=row.dataset.eligible==='true';
      check.disabled=!eligible||(!check.checked&&!max);count.disabled=!eligible||max===0;count.max=String(max);
      if(check.checked)v.bagSelection[row.dataset.bagId]=own;
    });
    var summary=v.el.querySelector('[data-bag-summary]');if(summary)summary.textContent='已选 '+total+'枚 / 剩余空位 '+cap+'个';
    var apply=v.el.querySelector('[data-craft-action="use-selected"]');if(apply)apply.disabled=total<1||total>cap;
  }
  function recoveryPanel(){
    return '<div class="craft-status"><h4>旧模拟数据需要处理</h4><p>'+esc(recovery.reason)+'</p><p>路径查询、收藏和真实铭文进度不受影响。请选择保留隔离，或清空全部模拟现场、历史及虚拟背包。</p><div class="craft-actions">'+button('isolate-legacy','保留旧档并隔离异常')+button('clear-legacy','一键清空旧档')+'</div></div>';
  }
  function archivedScenes(){
    var rescue=[];try{rescue=store.archives();}catch(e){}
    var rescued=rescue.length?'<details class="craft-backpack"><summary>已隔离的旧档（只读） · '+rescue.length+'份</summary>'+rescue.map(function(entry,i){return '<section><p>'+esc(entry.createdAt)+' · '+esc(entry.reason)+'</p>'+button('view-archive','查看旧档内容',' data-archive="'+i+'"')+'<pre class="craft-archive-raw" hidden></pre></section>';}).join('')+'</details>':'';
    if(!state.lab.legacyDrafts.length)return rescued;
    return rescued+'<details class="craft-backpack"><summary>已保留的旧现场草稿（只读）</summary>'+state.lab.legacyDrafts.map(function(scene,index){
      return '<section><h4>旧现场 '+(index+1)+' · '+esc(scene.target.slot||scene.target.dun)+' · '+qLabel(scene.simulation.stage)+'</h4>'+scene.simulation.inputs.map(function(terms,i){return '<p>材料 '+(i+1)+'：'+terms.map(function(t){return t?T.html(t,scene.simulation.stage):'未填写';}).join(' ＋ ')+'</p>';}).join('')+'</section>';
    }).join('')+'</details>';
  }
  function renderActualRoute(v){
    var host=area(v,'actual-route');if(!host)return;
    if(v.actualRecord){try{var traced=L.route(state,v.actualRecord);host.innerHTML=button('close-actual-route','收起完整路线')+F.render(traced,null,{positionLabel:'本次实际合成记录'});if(F.bind)F.bind(host.querySelector('[data-flow-viewer]'));}catch(e){v.actualRecord=null;host.innerHTML='<p class="craft-note">'+esc(e.message)+'</p>';}}
  }
  function renderSimulator(v) {
    var host=area(v,'simulator');if(!host)return;
    if(recovery){host.innerHTML=recoveryPanel();return;}
    var sim=state.simulation,recipe=R.recipes[sim.stage],p=position(targetFor(v));
    if(!p.dun||targetFor(v).quality==='b2'){
      host.innerHTML='<div class="craft-actions">'+button('open-bag','查看背包')+'</div>'+renderBag(v)+archivedScenes()+'<p class="craft-note">'+(!p.dun?'请先选择弟子实际位置或独立遁位。':'目标为蓝二，直接收集或置换即可，无需合成。')+'</p><div data-craft-actual-route></div>';renderActualRoute(v);updateBagSelection(v);return;
    }
    var inputs=sim.inputs.length?sim.inputs:blankInputs(sim.stage);
    host.innerHTML='<div class="craft-controls"><label>当前材料阶段<select data-sim-stage>'+options(availableStages(v),sim.stage)+'</select></label></div>'+
      '<div class="craft-actions">'+button('open-bag','查看背包')+button('select-bag','使用背包内铭文',sim.pending?' disabled':'')+button('back','返回上一步',state.lab.undo.length?'':' disabled')+'</div>'+renderBag(v)+
      (sim.legacy?'<div class="craft-status">旧现场已保留。合法完整的合成材料经确认后作为“手动补充”加入背包；未填满的非洗练材料另存为只读草稿，当前材料位重新备料，不虚构完整库存。已有结果保留。'+button('adopt-legacy','确认保留旧现场并继续')+'</div>':'')+archivedScenes()+
      '<p class="craft-note">'+(targetFor(v).discipleKey?esc(p.prefix+' · '+p.dun):'通用 '+esc(p.dun)+'：本次材料视为同一前缀，不允许跨前缀混合。')+'。'+qLabel(sim.stage)+' × '+recipe.count+' → '+qLabel(recipe.quality)+
      (recipe.promotion?'；自动附加'+esc(recipe.promotion)+'晋升铭文 × 1。':'；无需晋升铭文。')+'</p>'+
      '<div class="craft-material-toolbar">'+button('clear-inputs','一键清空所有材料',sim.pending||sim.legacy||!inputs.some(function(terms){return terms.some(Boolean);})?' disabled':'')+'</div>'+
      '<div class="craft-materials">'+inputs.map(function(terms,i){
        var ref=sim.refs[i],fromBag=ref&&state.lab.lots.find(function(l){return l.id===ref;});
        var source=fromBag?'来自虚拟背包 · '+(sim.pending?'本次已消耗':fromBag.quantity>=sim.refs.filter(function(id){return id===ref;}).length?'当前占用1枚':'数量不足，请补充后重新选材'):'手动填写洗练材料';
        var header='<div class="craft-material-header"><p class="craft-note">'+esc(source)+'</p>'+button('clear-material','清空本次材料',' data-index="'+i+'"'+(sim.pending||sim.legacy?' disabled':''))+'</div>';
        if(fromBag)return '<fieldset class="craft-material craft-material-confirmed"><legend>材料 '+(i+1)+' · '+qLabel(sim.stage)+'</legend>'+header+'<div class="craft-material-content">'+graphMaterial(fromBag.material)+'</div></fieldset>';
        return '<fieldset class="craft-material"><legend>材料 '+(i+1)+' · '+qLabel(sim.stage)+'</legend>'+header+terms.map(function(term,j){
          var pool=R.termsFor(p.dun,sim.stage,'wash'),peers=terms.filter(function(_,k){return k!==j;});
          var choices=pool.filter(function(t){return partialAllowed(v,peers,t,sim.stage);});
          if(term&&!choices.some(function(t){return t.attr===term.attr&&t.tier===term.tier;}))choices.push(term);
          return '<label>词条 '+(j+1)+'<select data-sim-material="'+i+'" data-sim-term="'+j+'"'+(sim.pending||sim.legacy?' disabled':'')+'>'+options(choices.map(function(t){return{id:t.attr+':'+t.tier,label:T.plain(t,sim.stage)};}),term?term.attr+':'+term.tier:'','请选择合法洗练词条')+'</select></label>';
        }).join('')+'</fieldset>';
      }).join('')+'</div><div data-craft-preview></div><div class="craft-actions">'+button('roll','模拟合成')+'</div><div data-craft-pending></div>';
    var preview;
    try{var candidate=clone(state);candidate.simulation.inputs=inputs;preview=S.preview(candidate);
      area(v,'preview').innerHTML='<p class="craft-note">'+modelNote+' 百分比取整显示，可能因四舍五入相加不等于100%，实际抽取使用精确概率。</p>'+outcomes(preview.outcomes);
    }catch(error){area(v,'preview').innerHTML='<p class="craft-note">'+esc(friendly(error.message))+'</p>';}
    host.querySelector('[data-craft-action="roll"]').disabled=!preview||!!sim.pending||!!sim.legacy;
    if(sim.pending){
      var pending=sim.pending,end=R.qualities.findIndex(function(q){return q.id===pending.material.quality;})>=R.qualities.findIndex(function(q){return q.id===targetFor(v).quality;});
      area(v,'pending').innerHTML='<div class="craft-pending"><h4>本次合成结果 · '+probability(pending.probability)+'</h4>'+graphMaterial(pending.material)+
        '<p class="craft-note" role="status">第'+(pending.attempt||1)+'次模拟'+(pending.attempt>1?(pending.same?' · 本次结果与上次相同':' · 已生成新的随机结果'):'')+'。重新模拟会替换本次结果，不重复消耗或累加产物。</p>'+
        '<div class="craft-actions">'+button('next',end?'已到目标品质':'进入下一阶段',' data-token="'+esc(pending.id)+'"'+(end||sim.legacy?' disabled':''))+
        button('credit',pending.creditedLot?'已加入虚拟背包':'加入虚拟背包',pending.creditedLot||sim.legacy?' disabled':'')+
        button('repeat','重复当前阶段合成',' data-token="'+esc(pending.id)+'"'+(sim.legacy?' disabled':''))+button('retry','重新模拟本次合成',' data-token="'+esc(pending.id)+'"'+(sim.legacy?' disabled':''))+
        (end&&pending.recordId?button('actual-route','查看完整合成路线图',' data-record="'+esc(pending.recordId)+'"'):'')+'</div></div>';
    }
    host.insertAdjacentHTML('beforeend','<div data-craft-actual-route></div>');
    renderActualRoute(v);updateBagSelection(v);
  }
  function outcomes(list) {
    return '<details class="craft-preview-outcomes"><summary>结果预览 · '+list.length+'种组合（点击展开）</summary><div class="craft-scroll"><table class="craft-table"><thead><tr><th>产物</th><th>概率</th></tr></thead><tbody>'+
      list.map(function(o){return '<tr><td>'+esc(qLabel(o.material.quality)+'：')+displayTerms(o.material)+'</td><td>'+probability(o.probability)+'</td></tr>';}).join('')+'</tbody></table></div></details>';
  }
  function renderAll(clearRoutes) {
    if(!state)return;
    Object.keys(views).forEach(function(key){
      var v=views[key];renderFilters(v);renderSimulator(v);
      if(clearRoutes && area(v,'results')){area(v,'results').innerHTML='';v.planTarget='';v.plan=null;v.routeSelections=new Map();}
    });
  }
  function labAction(v,action,payload){
    try{var draft=L.act(state,action,payload);if(save(v,draft)){if(['select','next','reset','back','clear-bag','clear-inputs'].includes(action))v.bagSelection={};Object.keys(views).forEach(function(key){renderSimulator(views[key]);});return true;}}
    catch(error){status(v,error.message);}
    renderSimulator(v);return false;
  }
  function onChange(v,control) {
    if(control.matches('[data-route-variant]'))return;
    if(!loaded||currentAccount()!==accountId){status(v,'请重新打开铭文分区后再操作。');return;}
    status(v,'');
    if(control.matches('[data-bag-check],[data-bag-count]')){updateBagSelection(v,control);return;}
    if(control.matches('[data-bag-total]')){
      var entry=L.groups(state).find(function(l){return l.id===control.dataset.bagTotal;}),n=Number(control.value);
      if(entry&&n<entry.quantity&&!root.confirm('确认减少这批虚拟铭文数量？这可能使此前的撤销操作无法无损恢复。')){renderSimulator(v);return;}
      labAction(v,'group-quantity',{id:control.dataset.bagTotal,quantity:n});return;
    }
    if(control.matches('[data-craft-field]')){
      var target=clone(targetFor(v)),name=control.dataset.craftField;
      if(name==='search')return;
      if(name==='attr'){
        target.attrs[Number(control.dataset.index)]=control.value;
        // Hidden native selects remain a legacy/script bridge. Validate and
        // retain invalid drafts with a warning, never silently clear old input.
        var checked=targetCompletion(target);v.attrRejection=checked.valid?'':'原目标属性已保留，请手动调整。'+checked.reason;
      }else v.attrRejection='';
      if(name==='quality')target.quality=control.value;
      if(name==='slot')target.slot=control.value;
      if(name==='dun')target.dun=control.value;
      if(name==='x-term'){
        var split=control.value.lastIndexOf(':');target.xTerm=control.value?{attr:control.value.slice(0,split),tier:control.value.slice(split+1)}:null;
      }
      changeTarget(v,target);return;
    }
    var sim=clone(state.simulation);
    if(control.matches('[data-sim-stage]')){
      if(sceneExists(sim)&&!root.confirm('切换材料阶段会清除当前填写，已生成的结果会保留在背包。是否继续？')){renderSimulator(v);return;}
      labAction(v,'reset',{stage:control.value});return;
    }
    if(control.matches('[data-sim-term]')){
      if(!sim.inputs.length)sim.inputs=blankInputs(sim.stage);
      var index=Number(control.dataset.simMaterial),slot=Number(control.dataset.simTerm),value=control.value;
      var split=value.lastIndexOf(':');sim.inputs[index][slot]=value?{attr:value.slice(0,split),tier:value.slice(split+1)}:null;
      labAction(v,'edit',{index:index,terms:sim.inputs[index]});
    }
  }
  function onClick(v,control) {
    var action=control.dataset.craftAction;
    if(action==='diagram-failures'){var body=control.closest('.craft-strategy-body');if(body&&body.renderFlow)body.renderFlow(body.dataset.failures!=='open');return;}
    if(action.indexOf('diagram-')===0){F.zoom(control.closest('[data-flow-viewer]'),action.slice(8));return;}
    if(!loaded||currentAccount()!==accountId){status(v,'请重新打开铭文分区后再操作。');return;}
    status(v,'');
    if(action==='toggle-favorite'){toggleFavorite(v,control);return;}
    if(action==='choose-disciple'){
      var target=clone(targetFor(v)),key=decodeURIComponent(control.dataset.key);
      if(target.discipleKey===key){hideSuggestions(v);return;}
      target.discipleKey=key;target.slot='';
      changeTarget(v,target);return;
    }
    if(action==='clear-options'){
      var blank={discipleKey:'',slot:'',dun:'',quality:'o2',attrs:['','',''],xTerm:null};v.attrRejection='';
      if(v.mode==='crafting-paths'){changeTarget(v,blank);return;}
      if(recovery){status(v,'请先处理旧模拟数据，或切换至路径查询。');return;}
      if(sceneExists(state.simulation)&&!root.confirm('清除本页筛选和当前材料？已生成的结果保留到虚拟背包，路径查询不受影响。'))return;
      try{var cleared=L.act(state,'reset');cleared.target=blank;if(save(v,cleared)){v.bagSelection={};renderFilters(v);renderSimulator(v);}}catch(e){status(v,e.message);}return;
    }
    if(action==='isolate-legacy'||action==='clear-legacy'){
      var clearing=action==='clear-legacy';
      if(!recovery)return;
      if(!root.confirm(clearing?'确认清空全部合成模拟数据？将清空旧现场、模拟历史、虚拟背包及已隔离的旧模拟档；收藏路线、弟子铭文进度和其他模块不受影响。':'保留旧档完整只读副本，恢复可验证的背包与历史，并重新准备模拟现场。是否继续？'))return;
      try{store.recover(clearing?'clear':'isolate',recovery.raw,accountId);activate(v.mode);}catch(e){status(v,e.message);}return;
    }
    if(action==='view-archive'){
      try{var archive=store.archives()[Number(control.dataset.archive)],pre=control.parentElement.querySelector('pre');pre.textContent=archive.raw;pre.hidden=!pre.hidden;}catch(e){status(v,e.message);}return;
    }
    if(action==='generate'){generate(v);return;}
    if(action==='open-bag'||action==='select-bag'){v.bagOpen=true;renderSimulator(v);var bag=v.el.querySelector('.craft-backpack');if(bag)bag.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
    if(action==='close-bag'){v.bagOpen=false;renderSimulator(v);return;}
    if(action==='use-selected'){
      var selection=Array.from(v.el.querySelectorAll('[data-bag-id]')).filter(function(row){return row.querySelector('[data-bag-check]').checked;}).map(function(row){return {id:row.dataset.bagId,quantity:Number(row.querySelector('[data-bag-count]').value)};});
      if(!selection.length){status(v,'请勾选至少一批符合当前配方的铭文。');return;}
      if(labAction(v,'select',{selection:selection})){v.bagOpen=false;renderSimulator(v);}return;
    }
    if(action==='clear-bag'){
      if(root.confirm('确认清空本账号的整个虚拟合成背包？将取消当前背包选材，历史合成路线保留。真实个人铭文不受影响。'))labAction(v,action);return;
    }
    if(action==='remove-lot'){
      if(root.confirm('确认移除这批虚拟铭文？已占用的铭文需先清空材料位。'))labAction(v,'group-remove',{id:control.dataset.lot});return;
    }
    if(action==='actual-route'){var row=control.closest('[data-bag-id]'),picker=row&&row.querySelector('[data-bag-route]');v.actualRecord=picker?picker.value:control.dataset.record;renderSimulator(v);return;}
    if(action==='close-actual-route'){v.actualRecord=null;renderSimulator(v);return;}
    if(action==='adopt-legacy'){
      if(root.confirm('确认保留旧现场并继续？合法完整合成材料记为手动补充，未填满的非洗练材料另存只读草稿并重新备料。旧结果保留，不虚构制作过程。'))labAction(v,action);return;
    }
    if(action==='back'){labAction(v,action);return;}
    if(action==='credit'){labAction(v,action);return;}
    var sim=clone(state.simulation);
    if(action==='clear-inputs'){
      if(root.confirm('确认清空当前所有材料位？背包库存、历史合成记录和当前材料阶段均保留。'))labAction(v,'clear-inputs');return;
    }
    if(action==='clear-material'){
      if(!root.confirm('清空这一枚材料位？背包中的该铭文不会被删除。'))return;
      if(!sim.inputs.length)sim.inputs=blankInputs(sim.stage);
      labAction(v,'edit',{index:Number(control.dataset.index),terms:Array(quality(sim.stage).count).fill(null)});return;
    }
    if(['roll','retry','next','repeat'].includes(action)){
      if(action!=='roll' && (!sim.pending||sim.pending.id!==control.dataset.token)){status(v,'该合成结果已失效，请重新操作。');return;}
      control.disabled=true;labAction(v,action);
    }
  }
  function activate(mode) {
    if(mode==='crafting-favorites'){if(root.InscriptionRouteFavorites)root.InscriptionRouteFavorites.activate();return;}
    if(!R||!P||!S||!F||!T||!L||!root.QinshiAccounts||!root.INSCRIPTION_DATA)return;
    if(!store)store=S.createWorkbench(root.QinshiAccounts);
    if(!queryStore)queryStore=S.createQueryStore(root.QinshiAccounts);
    var v=views[mode]||init(mode),account=currentAccount(),result=store.inspect(),q=queryStore.inspect();
    var oldQuery=queryTarget&&JSON.stringify(queryTarget),changedAccount=!loaded||accountId!==account;
    accountId=account;loaded=true;
    if(changedAccount){favoriteOperation++;favoriteBusy=false;}
    if(q.valid){queryTarget=normalizeTarget(q.target);queryToken=q.token;}
    else {queryTarget=q.target;queryToken=q.token;}
    recovery=null;
    if(result.valid){state=L.upgrade(result.state);token=result.token;if(state.simulation.legacy)recovery={reason:'旧现场材料来源或规则需要重新确认',raw:root.QinshiAccounts.getItem(S.KEY)};}
    else {state=L.upgrade({version:1,target:{discipleKey:'',slot:'',dun:'',quality:'o2',attrs:['','',''],xTerm:null},simulation:S.blankSimulation()});token=null;recovery={reason:result.errors.join('；'),raw:root.QinshiAccounts.getItem(S.KEY)};}
    state.target=normalizeTarget(state.target);
    inspectFavorites();
    Object.keys(views).forEach(function(key){
      var view=views[key];view.attrRejection='';status(view,'');
      view.el.querySelectorAll('button,input,select').forEach(function(c){c.disabled=false;});
      if(changedAccount){view.bagOpen=false;view.actualRecord=null;view.bagSelection={};clearPlan(view);}
      renderFilters(view);renderSimulator(view);
      if(view.mode==='crafting-paths'){
        if(oldQuery!==JSON.stringify(queryTarget))clearPlan(view);
        else if(view.plan)renderPlan(view,view.plan);
        if(!q.valid)status(view,'查询筛选读取异常，原始数据保留：'+q.errors.join('；'));
      }
    });
  }
  document.addEventListener('click',function(event){Object.keys(views).forEach(function(key){var v=views[key];if(!event.target.closest('.craft-search')||!v.el.contains(event.target))hideSuggestions(v);if(!event.target.closest('.craft-attr-picker')||!v.el.contains(event.target))closeAttrPicker(v);});});
  root.addEventListener('inscription-route-favorites-change',function(){
    if(!loaded||currentAccount()!==accountId)return;inspectFavorites();
    Object.keys(views).forEach(function(key){var v=views[key];if(v.plan&&v.planTarget===JSON.stringify(targetFor(v)))renderPlan(v,v.plan);});
  });
  root.InscriptionCraftingUI={activate:activate,refresh:function(){var keys=Object.keys(views);if(keys.length)activate(keys[0]);if(root.InscriptionRouteFavorites)root.InscriptionRouteFavorites.refresh();}};
})(window);
