(function(root){
  'use strict';
  var targets=['全体攻','全体血','全体护盾','追加伤害','全体内力','全体防'];
  var defaults={mode:'weighted',weights:['12','10','5','4','3','1'],scales:['1','8','6','1.5','2','1'],target:'全体攻'};
  var jobs=new Map();
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){return root.QinshiNumberFormat.format(v);}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function settings(options,formation){
    var available=formation.slots.map(function(s){return s.targetAttribute;});
    var localFile=root.location&&root.location.protocol==='file:';
    return '<form class="formation-settings"><div class="formation-settings-row"><select name="mode" aria-label="推荐模式">'+
      [['weighted','综合推荐'],['target','指定属性优先'],['custom','自定义权重'],['legacy','旧版严格排序']].map(function(x){return '<option value="'+x[0]+'"'+(options.mode===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+
      '</select><select name="target" aria-label="优先属性">'+targets.map(function(t){return '<option'+(available.includes(t)?'':' disabled')+(options.target===t?' selected':'')+'>'+t+'</option>';}).join('')+
      '</select><button class="seg active" type="submit">应用并生成</button><button class="seg" type="button" data-cancel-job'+(localFile?' disabled':'')+'>取消计算</button></div>'+(localFile?'<p>本地文件使用同步精确计算，不支持中途取消；可取消计算请通过HTTP/PWA打开。</p>':'')+'<details><summary>高级参数</summary><div class="formation-parameter-grid"><b>属性</b><b>重要权重</b><b>数值比例</b><b>实际系数 w/d</b>'+targets.map(function(t,i){return '<span>'+t+'</span><input name="weight'+i+'" aria-label="'+t+'重要权重" inputmode="decimal" value="'+esc(options.weights[i])+'"><input name="scale'+i+'" aria-label="'+t+'数值比例" inputmode="decimal" value="'+esc(options.scales[i])+'"><output>'+esc(options.weights[i])+'/'+esc(options.scales[i])+'</output>';}).join('')+'</div><p>比例是量级估计，不代表实战价值。盾默认6、伤默认1.5。</p><button type="button" class="seg" data-default-parameters>恢复默认参数</button><button type="button" class="seg" data-cancel-parameters>取消参数编辑</button></details><p class="error" role="alert" data-settings-error hidden></p></form>';
  }
  function bindSettings(container,options,formation,onApply,onCancel){
    container.innerHTML=settings(options,formation);
    var form=container.querySelector('form');
    function populate(value){form.elements.mode.value=value.mode; form.elements.target.value=value.target; targets.forEach(function(_,i){form.elements['weight'+i].value=value.weights[i];form.elements['scale'+i].value=value.scales[i];form.querySelectorAll('output')[i].textContent=value.weights[i]+'/'+value.scales[i];});}
    form.addEventListener('input',function(e){if(/^(weight|scale)\d$/.test(e.target.name)){form.elements.mode.value='custom';targets.forEach(function(_,i){form.querySelectorAll('output')[i].textContent=form.elements['weight'+i].value+'/'+form.elements['scale'+i].value;});}});
    form.elements.mode.addEventListener('change',function(){if(form.elements.mode.value!=='custom'){var reset=copy(defaults);reset.mode=form.elements.mode.value;reset.target=form.elements.target.value;populate(reset);}});
    form.addEventListener('click',function(e){if(e.target.closest('[data-default-parameters]'))populate(defaults);if(e.target.closest('[data-cancel-parameters]'))populate(options);if(e.target.closest('[data-cancel-job]'))onCancel();});
    form.addEventListener('submit',function(e){e.preventDefault();var next={mode:form.elements.mode.value,target:form.elements.target.value,weights:[],scales:[]};targets.forEach(function(_,i){next.weights.push(form.elements['weight'+i].value);next.scales.push(form.elements['scale'+i].value);});
      var error=form.querySelector('[data-settings-error]');
      try { root.FORMATIONS.validateOptions(formation,next); error.hidden=true; options=copy(next); onApply(next); }
      catch(ex){error.textContent=ex.message;error.hidden=false;}
    });
  }
  function scoreText(result){return esc(String(result.exactScore).replace(/\B(?=(\d{4})+(?!\d))/g,','))+' / '+esc(result.scoreDenominator);}
  function planHtml(formation,result){
    var mains=result.mainOptions||[];
    return '<div class="formation-benefits">'+targets.map(function(t){return '<div><span>'+t+'</span><strong>'+ (formation.slots.some(function(s){return s.targetAttribute===t;})?num(result.totals[t]||0):'—')+'</strong></div>';}).join('')+'</div><p>综合评分（非战力）：'+scoreText(result)+'</p><p>主将：<strong>'+esc(result.mainName||'无合法主将')+'</strong>'+(result.manualMain?'（已固定）':'')+'；可选主将：'+esc(mains.map(function(m){return m.name;}).join('、')||'—')+'</p><div class="formation-recommend-grid">'+formation.slots.map(function(slot){var a=result.assignments.find(function(x){return x.position===slot.position;});return '<article class="formation-recommend-card"><b>助阵'+slot.position+'</b><strong>'+esc(a?a.name:'空位')+'</strong>'+(a?'<span>'+esc(a.sourceAttribute)+' '+num(a.sourceValue)+' × '+a.ratePercent+'%</span><em>向下取整 '+num(a.value)+' '+esc(a.targetAttribute)+'</em>':'')+'</article>';}).join('')+'</div>';
  }
  function resultHtml(formation,result){
    return '<p>推荐模式：'+esc({weighted:'综合推荐',target:'指定属性优先',custom:'自定义权重',legacy:'旧版严格排序'}[result.mode])+'</p>'+planHtml(formation,result)+'<p>最佳助阵排列 '+esc(result.tieCount)+' 套；含主将组合 '+esc(result.combinationCount)+' 套</p>'+
      (result.missingPositions?'<p>缺少助阵位 '+result.missingPositions+' 个</p>':'')+
      (result.referenceCount?'<p>包含 '+result.referenceCount+' 名1级参考值弟子</p>':'')+
      (result.excluded.length?'<p>以下弟子不能担任助阵（仍可在资格允许时担任主将）：'+esc(result.excluded.map(function(x){return x.name;}).join('、'))+'</p>':'')+
      '<div data-tie-page>'+tiesHtml(formation,result)+'</div>';
  }
  function tiesHtml(formation,result){return (result.ties||[]).map(function(t,i){return '<details><summary>并列排列 '+(BigInt(result.offset||0)+BigInt(i)+1n).toString()+'：'+esc(t.assignments.map(function(a){return a.name;}).join('、'))+'</summary>'+planHtml(formation,t)+'</details>';}).join('');}
  function cancel(scope){var job=jobs.get(scope);if(job){job.worker.terminate();jobs.delete(scope);job.reject(new Error('计算已取消'));}}
  function run(scope,formation,progress,options){
    cancel(scope);
    // Preserve the pre-existing file: capability without pretending that a
    // synchronous call is cancellable or meets Worker responsiveness budgets.
    if(root.location&&root.location.protocol==='file:'){
      try{return Promise.resolve(root.FORMATIONS.recommendFormation(formation,progress,options));}
      catch(error){return Promise.reject(error);}
    }
    if(!root.Worker)return Promise.reject(new Error('当前浏览器不支持独立计算，请使用支持 Worker 的浏览器并通过 HTTP 或 PWA 打开。'));
    return new Promise(function(resolve,reject){var worker=new Worker('js/formation-worker.js');var job={worker:worker,reject:reject};jobs.set(scope,job);worker.onmessage=function(e){if(jobs.get(scope)!==job)return;jobs.delete(scope);worker.terminate();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.result);};worker.onerror=function(){if(jobs.get(scope)!==job)return;jobs.delete(scope);worker.terminate();reject(new Error('合阵计算加载或执行失败，请通过 HTTP/PWA 打开后重新生成。'));};worker.postMessage({formation:formation,progress:progress,options:options});});
  }
  root.FORMATION_RECOMMENDATION_UI={defaults:function(){return copy(defaults);},targets:targets,bindSettings:bindSettings,resultHtml:resultHtml,run:run,cancel:cancel,tiesHtml:tiesHtml};
})(typeof window!=='undefined'?window:globalThis);
