(function(root){
  'use strict';
  var targets=['全体攻','全体血','全体护盾','追加伤害','全体内力','全体防'];
  var defaults={mode:'custom',weights:['12','10','5','4','3','1'],scales:['1','8','6','1.5','2','1']};
  var jobs=new Map();
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){return root.QinshiNumberFormat.format(v);}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function settings(options,formation){
    var localFile=root.location&&root.location.protocol==='file:';
    return '<form class="formation-settings"><div class="formation-settings-row"><button class="seg active" type="submit">应用并生成</button><button class="seg" type="button" data-cancel-job'+(localFile?' disabled':'')+'>取消计算</button></div>'+(localFile?'<p>本地文件使用同步精确计算，不支持中途取消；可取消计算请通过HTTP/PWA打开。</p>':'')+'<details><summary>高级参数</summary><div class="formation-parameter-grid"><b>属性</b><b>重要权重</b><b>数值比例</b>'+targets.map(function(t,i){return '<span>'+t+'</span><input name="weight'+i+'" aria-label="'+t+'重要权重" inputmode="decimal" value="'+esc(options.weights[i])+'"><input name="scale'+i+'" aria-label="'+t+'数值比例" inputmode="decimal" value="'+esc(options.scales[i])+'">';}).join('')+'</div><p>比例是量级估计，不代表实战价值。盾默认6、伤默认1.5。</p><button type="button" class="seg" data-default-parameters>恢复默认参数</button><button type="button" class="seg" data-cancel-parameters>取消参数编辑</button></details><p class="error" role="alert" data-settings-error hidden></p></form>';
  }
  function bindSettings(container,options,formation,onApply,onCancel){
    container.innerHTML=settings(options,formation);
    var form=container.querySelector('form');
    function populate(value){targets.forEach(function(_,i){form.elements['weight'+i].value=value.weights[i];form.elements['scale'+i].value=value.scales[i];});}
    form.addEventListener('click',function(e){if(e.target.closest('[data-default-parameters]'))populate(defaults);if(e.target.closest('[data-cancel-parameters]'))populate(options);if(e.target.closest('[data-cancel-job]'))onCancel();});
    form.addEventListener('submit',function(e){e.preventDefault();var next={mode:'custom',weights:[],scales:[]};targets.forEach(function(_,i){next.weights.push(form.elements['weight'+i].value);next.scales.push(form.elements['scale'+i].value);});
      var error=form.querySelector('[data-settings-error]');
      try { root.FORMATIONS.validateOptions(formation,next); error.hidden=true; options=copy(next); onApply(next); }
      catch(ex){error.textContent=ex.message;error.hidden=false;}
    });
  }
  function planHtml(formation,result){
    var mains=result.mainOptions||[];
    return '<div class="formation-benefits">'+targets.map(function(t){return '<div><span>'+t+'</span><strong>'+ (formation.slots.some(function(s){return s.targetAttribute===t;})?num(result.totals[t]||0):'—')+'</strong></div>';}).join('')+'</div><p>主将：<strong>'+esc(result.mainName||'无合法主将')+'</strong>'+(result.manualMain?'（已固定）':'')+'；可选主将：'+esc(mains.map(function(m){return m.name;}).join('、')||'—')+'</p><div class="formation-recommend-grid">'+formation.slots.map(function(slot){var a=result.assignments.find(function(x){return x.position===slot.position;});return '<article class="formation-recommend-card"><b>助阵'+slot.position+'</b><strong>'+esc(a?a.name:'空位')+'</strong>'+(a?'<span>'+esc(a.sourceAttribute)+' '+num(a.sourceValue)+' × '+a.ratePercent+'%</span><em>向下取整 '+num(a.value)+' '+esc(a.targetAttribute)+'</em>':'')+'</article>';}).join('')+'</div>';
  }
  function resultHtml(formation,result){
    return planHtml(formation,result)+
      (result.missingPositions?'<p>缺少助阵位 '+result.missingPositions+' 个</p>':'')+
      (result.excluded.length?'<p>以下弟子不能担任助阵（仍可在资格允许时担任主将）：'+esc(result.excluded.map(function(x){return x.name;}).join('、'))+'</p>':'')+
      '<div data-tie-page>'+tiesHtml(formation,result)+'</div>';
  }
  function tiesHtml(formation,result){return (result.ties||[]).map(function(t,i){return '<details><summary>其他方案 '+(BigInt(result.offset||0)+BigInt(i)+1n).toString()+'：'+esc(t.assignments.map(function(a){return a.name;}).join('、'))+'</summary>'+planHtml(formation,t)+'</details>';}).join('');}
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
