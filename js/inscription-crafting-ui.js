(function (root) {
  'use strict';
  var R=root.InscriptionRules, P=root.InscriptionPaths, S=root.InscriptionCraftingState, F=root.InscriptionFlowchart, T=root.InscriptionTerms;
  var views={}, store, state, token, accountId, loaded=false, sequence=0;
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
    var count=quality(next.quality).count, allowed=R.termsFor(position(next).dun,next.quality).map(function(t){return t.attr;});
    next.attrs=Array.from({length:count},function(_,i){return allowed.includes(next.attrs[i])?next.attrs[i]:'';});
    return next;
  }
  function changeTarget(v,next) {
    next=normalizeTarget(next);
    if (sameTarget(next,state.target)) { renderAll(false); return; }
    var before=position(state.target), after=position(next), sim=state.simulation;
    var incompatible=before.prefix!==after.prefix || before.dun!==after.dun ||
      R.qualities.findIndex(function(q){return q.id===sim.stage;})>=R.qualities.findIndex(function(q){return q.id===next.quality;});
    if (incompatible && sceneExists(sim) && !root.confirm('新目标与当前模拟现场不兼容。切换将重置当前材料和结果，旧版保存数据不受影响。是否继续？')) { renderAll(false); return; }
    var draft=clone(state); draft.target=next;
    if (incompatible) draft.simulation=S.blankSimulation();
    if (save(v,draft)) { Object.keys(views).forEach(function(key){views[key].generation++;}); renderAll(true); }
    else renderAll(false);
  }
  function init(mode) {
    var el=document.getElementById('inscription-'+mode);
    var v=views[mode]={mode:mode,el:el,generation:0,activeSuggestion:-1,planTarget:''};
    var searchId=mode+'-disciple-suggestions';
    el.innerHTML='<div data-craft-status class="craft-status" role="alert" hidden></div>'+
      '<section class="craft-panel"><h3>'+(mode==='crafting-paths'?'合成路径查询':'合成模拟')+'</h3>'+
      '<p class="craft-note">两页共用目标筛选。模拟现场按当前游戏账号自动保存，不关联实际铭文库存。</p>'+
      '<div class="craft-controls craft-filters"><label class="craft-search">弟子搜索（可不选）'+
      '<input type="search" data-craft-field="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="'+searchId+'" placeholder="输入姓名，例如盖聂">'+
      '<span id="'+searchId+'" class="craft-suggestions" data-craft-suggestions role="listbox" hidden></span></label>'+
      '<label>弟子天遁位<select data-craft-field="slot"></select></label>'+
      '<label>目标品质<select data-craft-field="quality">'+options(R.qualities,'o2')+'</select></label>'+
      '<label>遁位<select data-craft-field="dun">'+options(R.duns.map(function(d){return d.id;}),'','请选择遁位')+'</select></label></div>'+
      '<div class="craft-actions">'+button('clear-options','清除所有选项')+'</div>'+
      '<div data-craft-attrs class="craft-attrs"></div>'+
      '<p class="craft-note">属性槽由品质决定，必须选满；同属性同档位不能重复，每枚最多两条高档。</p>'+
      '<div data-craft-analysis></div></section>'+
      '<details class="craft-panel craft-values"><summary>所选属性的品质、档位与数值</summary><div data-craft-matrix></div></details>'+
      (mode==='crafting-paths'?'<div class="craft-actions">'+button('generate','一键查询合成路径')+'</div><div data-craft-results></div>':
        '<section class="craft-panel"><h3>本次模拟材料</h3><p class="craft-note">仅填写本次所需材料，不管理剩余数量。手动材料可为合法的洗练或合成产物，系统自动校验。重复合成视为重新备齐本次材料。</p><div data-craft-simulator></div></section>');
    el.addEventListener('change',function(event){onChange(v,event.target);});
    el.addEventListener('click',function(event){
      var control=event.target.closest('[data-craft-action]');
      if(control&&control.dataset.craftAction==='toggle-favorite'){event.preventDefault();event.stopPropagation();}
      if(control) onClick(v,control);
    });
    el.addEventListener('input',function(event){if(event.target===field(v,'search')) suggestions(v);});
    field(v,'search').addEventListener('focus',function(){if(!itemFor(state.target)) suggestions(v);});
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
  function renderFilters(v) {
    var target=state.target,item=itemFor(target),dun=position(target).dun;
    field(v,'search').value=item?item.name:''; hideSuggestions(v);
    field(v,'slot').innerHTML=options(item?item.slots.map(function(s){return{id:s.tian+'|'+R.normalizeDun(s.shield),label:s.tian+' · '+R.normalizeDun(s.shield)};}):[],target.slot,item?'请选择弟子实际位置':'未指定弟子：可独立选择遁位');
    field(v,'slot').disabled=!item; field(v,'quality').value=target.quality;
    field(v,'dun').value=dun||''; field(v,'dun').disabled=!!item;
    field(v,'dun').title=item?'遁位由所选弟子的实际铭文位置确定':'未指定弟子时可独立筛选';
    var attrs=Array.from(new Set(R.termsFor(dun,target.quality).map(function(t){return t.attr;})));
    area(v,'attrs').style.setProperty('--craft-slots',quality(target.quality).count);
    area(v,'attrs').innerHTML=target.attrs.map(function(attr,i){return '<label>目标属性'+(i+1)+'<select data-craft-field="attr" data-index="'+i+'"'+(!dun?' disabled':'')+'>'+options(attrs,attr,'请选择属性')+'</select></label>';}).join('');
    renderAnalysis(v); renderMatrix(v);
  }
  function renderAnalysis(v) {
    var target=state.target,dun=position(target).dun,host=area(v,'analysis');
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
    var target=state.target,dun=position(target).dun,attrs=Array.from(new Set(target.attrs.filter(Boolean)));
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
  function renderPlan(v,plan) {
    var host=area(v,'results'),target=state.target;
    var opened={};host.querySelectorAll('details[data-route-index]').forEach(function(details){opened[details.dataset.routeIndex]=details.open;});
    v.plan=plan;
    host.innerHTML='<section class="craft-panel"><h3>从蓝二到'+qLabel(target.quality)+'的完整路线</h3><p class="craft-note">'+modelNote+'</p>'+
      '<p class="craft-note">'+(target.discipleKey?esc(itemFor(target).name+' · '+target.slot.replace('|',' · '))+'。':'通用遁位路线：全部材料必须为同一个前缀、同一个遁位。')+
      '杂词条 X 不指定具体属性，默认采用同一种词条/不分档词条；本路线需要一致的 X 不可换成多个不同杂词条。</p><p class="craft-note">展示具有不同中间配料的代表路线，每个目标最多整理21个候选后去重，不穷举所有材料树，也不按投料顺序变化凑方案。点击星标收藏当前完整路线，收藏方案统一排在所有未收藏方案之前。</p><div data-route-groups></div></section>';
    var groups=host.querySelector('[data-route-groups]');
    var entries=plan.strategies.map(function(route,index){return {route:route,index:index,favorite:favoriteFor(route,target,plan.xAttr)};});
    ['favorites','deterministic','probability'].forEach(function(kind){
      var routes=entries.filter(function(entry){return kind==='favorites'?!!entry.favorite:!entry.favorite&&entry.route.kind===kind;});
      if(kind==='favorites'&&!routes.length)return;
      var heading=document.createElement('h4');heading.className=kind==='favorites'?'craft-favorite-group-title':'';heading.textContent=kind==='favorites'?'已收藏方案（统一置顶）':kind==='deterministic'?'未收藏 · 必中合成方案（置换准备另计）':'未收藏 · 概率合成方案';groups.appendChild(heading);
      if(!routes.length){var note=document.createElement('p');note.className='craft-note';note.textContent=entries.some(function(entry){return entry.route.kind===kind;})?'此类方案均已收藏并置顶。':kind==='deterministic'?'当前目标没有已知的全程必中合成路线，不会把随机补词条当作必中。':'当前目标不需要单独展示额外的概率路线。';groups.appendChild(note);}
      routes.forEach(function(entry,index){
        var route=entry.route;
        var details=document.createElement('details');details.className='craft-strategy';
        details.dataset.routeIndex=String(entry.index);if(entry.favorite)details.classList.add('craft-favorite-pinned');
        details.innerHTML='<summary class="craft-route-summary"><span>'+esc((route.kind==='deterministic'?'必中':'概率')+'路线 '+(entry.index+1))+' · 蓝二 → '+qLabel(target.quality)+'</span>'+
          '<button type="button" class="craft-favorite-star'+(entry.favorite?' is-favorite':'')+'" data-craft-action="toggle-favorite" data-route-index="'+entry.index+'" aria-label="'+(entry.favorite?'取消收藏此完整路线':'收藏此完整路线')+'" aria-pressed="'+(entry.favorite?'true':'false')+'" title="'+(entry.favorite?'取消收藏':'收藏完整路线')+'"'+(!favoriteState||!favoriteState.valid||favoriteState.readOnly||favoriteBusy?' disabled':'')+'>'+(entry.favorite?'★':'☆')+'</button></summary><div class="craft-strategy-body"></div>';
        var rendered=false;
        function fill(){if(rendered)return;rendered=true;var body=details.querySelector('.craft-strategy-body');body.renderFlow=function(show){
          var old=body.querySelector('[data-flow-viewer]'),zoom=old?Number(old.dataset.zoom):0.9;
          body.innerHTML=F.render(route,plan.xAttr,{showFailures:show,positionLabel:target.discipleKey?target.slot.replace('|',' · '):position(target).dun});
          body.dataset.failures=show?'open':'closed';
          var viewer=body.querySelector('[data-flow-viewer]'),drawing=viewer.querySelector('svg');viewer.dataset.zoom=String(zoom);
          drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*zoom)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*zoom)+'px';
          viewer.querySelector('[data-craft-action="diagram-reset"]').textContent=Math.round(zoom*100)+'%';
        };body.renderFlow(false);}
        details.addEventListener('toggle',function(){if(details.open)fill();});
        groups.appendChild(details);if(Object.prototype.hasOwnProperty.call(opened,String(entry.index))?opened[String(entry.index)]:index===0){fill();details.open=true;}
      });
    });
    if(favoriteState&&(!favoriteState.valid||favoriteState.readOnly)){
      var warning=document.createElement('p');warning.className='craft-legacy-warning';warning.textContent=!favoriteState.valid?'收藏读取失败，原始数据已保留：'+favoriteState.errors.join('；'):'账号当前为只读，仍可查询路线；收藏操作需先取得编辑权。';groups.prepend(warning);
    }
  }
  function toggleFavorite(v,control) {
    if(favoriteBusy)return;
    if(!favoriteStore||!favoriteState||!favoriteState.valid||favoriteState.accountId!==accountId){status(v,'收藏存档不可用，请重新打开铭文分区后操作。');return;}
    if(!v.plan||v.planTarget!==JSON.stringify(state.target)){status(v,'查询目标已变化，请重新查询后收藏。');return;}
    var route=v.plan.strategies[Number(control.dataset.routeIndex)],account=accountId,operation=++favoriteOperation;
    if(!route)return;favoriteBusy=true;Object.keys(views).forEach(function(key){views[key].el.querySelectorAll('[data-craft-action="toggle-favorite"]').forEach(function(button){button.disabled=true;});});
    try{
      favoriteStore.toggle(route,clone(state.target),v.plan.xAttr,favoriteState.token,account).then(function(result){
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
    var target=state.target,p=position(target),best=R.bestTargets(p.dun,target.quality,target.attrs);
    if(!best.targets.length){status(v,best.reason);return;}
    var request=++v.generation, selected=JSON.stringify(target),account=accountId;
    status(v,'正在整理完整合成路线……');
    root.setTimeout(function(){
      if(!loaded||currentAccount()!==account||accountId!==account||request!==v.generation||JSON.stringify(state.target)!==selected)return;
      try{
        var result=P.representative({prefix:p.prefix,dun:p.dun,quality:target.quality,attrs:target.attrs});
        if(!result.valid)throw new Error(result.errors.join('；'));
        if(!result.strategies.length)throw new Error('当前目标尚无可展示的完整路线；不会用不合法步骤补齐。');
        v.planTarget=selected; renderPlan(v,result); status(v,'');
      }catch(error){status(v,error.message);}
    },0);
  }
  function availableStages() {
    var index=R.qualities.findIndex(function(q){return q.id===state.target.quality;});
    return R.qualities.slice(0,Math.max(1,index));
  }
  function blankInputs(stage) {
    var recipe=R.recipes[stage];
    return recipe?Array.from({length:recipe.count},function(){return Array(quality(stage).count).fill(null);}):[];
  }
  function partialAllowed(peers,term,stage) {
    var selected=peers.filter(Boolean).concat([term]), keys=selected.map(function(t){return t.attr+':'+t.tier;});
    if(new Set(keys).size!==keys.length || selected.filter(function(t){return t.tier==='H';}).length>2)return false;
    return ['wash','crafted'].some(function(origin){var available=R.termsFor(position(state.target).dun,stage,origin);return selected.every(function(t){return available.some(function(a){return a.attr===t.attr&&a.tier===t.tier;});});});
  }
  function renderSimulator(v) {
    var host=area(v,'simulator');if(!host)return;
    var sim=state.simulation,recipe=R.recipes[sim.stage],p=position(state.target);
    if(!p.dun){host.innerHTML='<p class="craft-note">请先选择弟子实际位置或独立遁位。</p>';return;}
    if(state.target.quality==='b2'){host.innerHTML='<p class="craft-note">目标为蓝二，直接收集或置换即可，无需合成。</p>';return;}
    var inputs=sim.inputs.length?sim.inputs:blankInputs(sim.stage);
    host.innerHTML='<div class="craft-controls"><label>当前材料阶段<select data-sim-stage>'+options(availableStages(),sim.stage)+'</select></label></div>'+
      '<p class="craft-note">'+(state.target.discipleKey?esc(p.prefix+' · '+p.dun):'通用 '+esc(p.dun)+'：本次材料视为同一前缀，不允许跨前缀混合。')+'。'+qLabel(sim.stage)+' × '+recipe.count+' → '+qLabel(recipe.quality)+
      (recipe.promotion?'；自动附加'+esc(recipe.promotion)+'晋升铭文 × 1。':'；无需晋升铭文。')+'</p>'+
      '<div class="craft-materials">'+inputs.map(function(terms,i){
        return '<fieldset class="craft-material"><legend>材料 '+(i+1)+' · '+qLabel(sim.stage)+'</legend>'+terms.map(function(term,j){
          var pool=R.termsFor(p.dun,sim.stage),peers=terms.filter(function(_,k){return k!==j;});
          var choices=pool.filter(function(t){return partialAllowed(peers,t,sim.stage);});
          return '<label>词条 '+(j+1)+'<select data-sim-material="'+i+'" data-sim-term="'+j+'">'+options(choices.map(function(t){return{id:t.attr+':'+t.tier,label:T.plain(t,sim.stage)};}),term?term.attr+':'+term.tier:'','请选择合法词条')+'</select></label>';
        }).join('')+button('clear-material','清空本次材料',' data-index="'+i+'"')+'</fieldset>';
      }).join('')+'</div><div data-craft-preview></div><div class="craft-actions">'+button('roll','模拟合成')+'</div><div data-craft-pending></div>';
    var preview;
    try{var candidate=clone(state);candidate.simulation.inputs=inputs;preview=S.preview(candidate);
      area(v,'preview').innerHTML='<p class="craft-note">'+modelNote+' 百分比取整显示，可能因四舍五入相加不等于100%，实际抽取使用精确概率。</p>'+outcomes(preview.outcomes);
    }catch(error){area(v,'preview').innerHTML='<p class="craft-note">'+esc(friendly(error.message))+'</p>';}
    host.querySelector('[data-craft-action="roll"]').disabled=!preview||!!sim.pending;
    if(sim.pending){
      var pending=sim.pending,end=R.qualities.findIndex(function(q){return q.id===pending.material.quality;})>=R.qualities.findIndex(function(q){return q.id===state.target.quality;});
      area(v,'pending').innerHTML='<div class="craft-pending"><h4>本次合成结果 · '+probability(pending.probability)+'</h4>'+graphMaterial(pending.material)+
        '<p class="craft-note">进入下一阶段后，清除本次材料并将这一枚产物带入下一阶段的第一个材料位。重复当前阶段会保留材料填写模板，视为重新备齐，不记录剩余数量。</p>'+
        '<div class="craft-actions">'+button('next',end?'已到目标品质':'进入下一阶段',' data-token="'+esc(pending.id)+'"'+(end?' disabled':''))+
        button('repeat','重复当前阶段合成',' data-token="'+esc(pending.id)+'"')+button('retry','重新模拟本次合成',' data-token="'+esc(pending.id)+'"')+'</div></div>';
    }
  }
  function outcomes(list) {
    return '<details class="craft-preview-outcomes"><summary>结果预览 · '+list.length+'种组合（点击展开）</summary><div class="craft-scroll"><table class="craft-table"><thead><tr><th>产物</th><th>概率</th></tr></thead><tbody>'+
      list.map(function(o){return '<tr><td>'+esc(qLabel(o.material.quality)+'：')+displayTerms(o.material)+'</td><td>'+probability(o.probability)+'</td></tr>';}).join('')+'</tbody></table></div></details>';
  }
  function renderAll(clearRoutes) {
    if(!state)return;
    Object.keys(views).forEach(function(key){
      var v=views[key];renderFilters(v);renderSimulator(v);
      if(clearRoutes && area(v,'results')){area(v,'results').innerHTML='';v.planTarget='';v.plan=null;}
    });
  }
  function updateSimulation(v,sim) {
    var draft=clone(state);draft.simulation=sim;
    if(save(v,draft))renderSimulator(v);else renderSimulator(v);
  }
  function onChange(v,control) {
    if(!loaded||currentAccount()!==accountId){status(v,'请重新打开铭文分区后再操作。');return;}
    status(v,'');
    if(control.matches('[data-craft-field]')){
      var target=clone(state.target),name=control.dataset.craftField;
      if(name==='search')return;
      if(name==='attr')target.attrs[Number(control.dataset.index)]=control.value;
      if(name==='quality')target.quality=control.value;
      if(name==='slot')target.slot=control.value;
      if(name==='dun')target.dun=control.value;
      changeTarget(v,target);return;
    }
    var sim=clone(state.simulation);
    if(control.matches('[data-sim-stage]')){
      if(sceneExists(sim)&&!root.confirm('切换材料阶段会清除当前填写的材料和结果，是否继续？')){renderSimulator(v);return;}
      sim.stage=control.value;sim.inputs=blankInputs(sim.stage);sim.pending=null;updateSimulation(v,sim);return;
    }
    if(control.matches('[data-sim-term]')){
      if(!sim.inputs.length)sim.inputs=blankInputs(sim.stage);
      var index=Number(control.dataset.simMaterial),slot=Number(control.dataset.simTerm),value=control.value;
      if(sim.pending&&!root.confirm('修改本次材料会取消已生成的结果，是否继续？')){renderSimulator(v);return;}
      var split=value.lastIndexOf(':');sim.inputs[index][slot]=value?{attr:value.slice(0,split),tier:value.slice(split+1)}:null;sim.pending=null;
      updateSimulation(v,sim);
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
      var target=clone(state.target);target.discipleKey=decodeURIComponent(control.dataset.key);target.slot='';
      changeTarget(v,target);return;
    }
    if(action==='clear-options'){
      if(sceneExists(state.simulation)&&!root.confirm('清除所有筛选、当前模拟材料及结果？已保存的个人铭文数据不受影响。'))return;
      var cleared=clone(state);cleared.target={discipleKey:'',slot:'',dun:'',quality:'o2',attrs:['','','']};cleared.simulation=S.blankSimulation();
      if(save(v,cleared)){Object.keys(views).forEach(function(key){views[key].generation++;});renderAll(true);}return;
    }
    if(action==='generate'){generate(v);return;}
    var sim=clone(state.simulation);
    if(action==='clear-material'){
      if(!root.confirm('清空这一枚本次材料，并取消当前合成结果？'))return;
      if(!sim.inputs.length)sim.inputs=blankInputs(sim.stage);
      sim.inputs[Number(control.dataset.index)]=Array(quality(sim.stage).count).fill(null);sim.pending=null;updateSimulation(v,sim);return;
    }
    if(['roll','retry','next','repeat'].includes(action)){
      if(action!=='roll' && (!sim.pending||sim.pending.id!==control.dataset.token)){status(v,'该合成结果已失效，请重新操作。');return;}
      control.disabled=true;
      try{
        if(action==='roll'||action==='retry'){
          if(!sim.inputs.length)throw new Error('请先填满本次材料。');
          var preview=S.preview(state),outcome=R.sample(preview.outcomes);
          sim.pending={id:Date.now().toString(36)+'-'+(++sequence),material:clone(outcome.material),probability:outcome.probability};
        }else if(action==='next'){
          var result=clone(sim.pending.material);
          if(R.qualities.findIndex(function(q){return q.id===result.quality;})>=R.qualities.findIndex(function(q){return q.id===state.target.quality;}))throw new Error('已经达到目标品质。');
          sim.stage=result.quality;sim.inputs=blankInputs(sim.stage);sim.inputs[0]=result.terms;sim.pending=null;
        }else sim.pending=null;
        updateSimulation(v,sim);
      }catch(error){status(v,error.message);control.disabled=false;}
    }
  }
  function activate(mode) {
    if(mode==='crafting-favorites'){if(root.InscriptionRouteFavorites)root.InscriptionRouteFavorites.activate();return;}
    if(!R||!P||!S||!F||!T||!root.QinshiAccounts||!root.INSCRIPTION_DATA)return;
    if(!store)store=S.createWorkbench(root.QinshiAccounts);
    var v=views[mode]||init(mode),account=currentAccount(),result=store.inspect();
    if(!result.valid){
      loaded=false;Object.keys(views).forEach(function(key){views[key].el.querySelectorAll('input,select,button').forEach(function(c){c.disabled=true;});status(views[key],'存档读取失败，已保留原始数据并禁止写入：'+result.errors.join('；'));});return;
    }
    var oldTarget=state&&JSON.stringify(state.target),changedAccount=!loaded||accountId!==account;
    state=result.state;token=result.token;accountId=account;loaded=true;if(changedAccount){favoriteOperation++;favoriteBusy=false;}
    inspectFavorites();
    var normalized=normalizeTarget(state.target);
    // Normalize only in memory on first open. Merely opening never rewrites old data.
    state.target=normalized;
    Object.keys(views).forEach(function(key){
      var view=views[key];view.el.querySelectorAll('button,input,select').forEach(function(c){c.disabled=false;});status(view,'');
      if(changedAccount)view.generation++;
    });
    renderAll(changedAccount||oldTarget!==JSON.stringify(state.target));
    Object.keys(views).forEach(function(key){var view=views[key];if(view.plan&&view.planTarget===JSON.stringify(state.target))renderPlan(view,view.plan);});
  }
  document.addEventListener('click',function(event){Object.keys(views).forEach(function(key){if(!event.target.closest('.craft-search')||!views[key].el.contains(event.target))hideSuggestions(views[key]);});});
  root.addEventListener('inscription-route-favorites-change',function(){
    if(!loaded||currentAccount()!==accountId)return;inspectFavorites();
    Object.keys(views).forEach(function(key){var v=views[key];if(v.plan&&v.planTarget===JSON.stringify(state.target))renderPlan(v,v.plan);});
  });
  root.InscriptionCraftingUI={activate:activate,refresh:function(){var keys=Object.keys(views);if(keys.length)activate(keys[0]);if(root.InscriptionRouteFavorites)root.InscriptionRouteFavorites.refresh();}};
})(window);
