(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SECRET_REALM_UI=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var KEY='qinshi_secret_realms_v1', contexts=[];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function number(v){return Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});}
  function money(v){return '¥'+Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function inputNumber(raw){if(typeof raw!=='string'||!raw.trim()||!/^\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw Error('请输入有效的非负数值，不能留空。');return Number(raw);}
  function accountId(c){var a=c.root.QinshiAccounts.currentAccount();return a&&a.id;}
  function readonly(c){try{return c.root.QinshiAccounts.isReadOnly();}catch(e){return true;}}
  function cancel(c){c.revision++;if(c.runner)c.runner.cancel();c.busy=false;c.result=null;var result=c.host.querySelector('[data-realm-results]');if(result)result.innerHTML='<p>条件已变化，请重新计算。</p>';var button=c.host.querySelector('[data-realm-calculate]');if(button)button.disabled=false;c.host.setAttribute('aria-busy','false');}
  function showError(c,error){c.error=error?String(error.message||error):'';var box=c.host.querySelector('[data-realm-error]');if(box){box.textContent=c.error;box.hidden=!c.error;}}
  function read(c){var raw=c.root.QinshiAccounts.getItem(KEY);return raw==null?c.core.createDefault(c.data):c.core.normalize(JSON.parse(raw),c.data);}
  function write(c,state){if(c.root.QinshiAccounts.setItem(KEY,JSON.stringify(state))===false)throw Error('当前账号为只读状态，未保存。');}
  function load(c){
    cancel(c);var nextAccount=accountId(c);if(nextAccount!==c.account)c.drafts={};c.account=nextAccount;c.accessWritable=!readonly(c);c.readError=false;
    try{var saved=read(c),next=c.core.advance(saved,Date.now(),c.data);if(JSON.stringify(next)!==JSON.stringify(saved)&&!readonly(c))write(c,next);c.state=next;c.error='';}
    catch(e){c.readError=true;c.state=c.core.createDefault(c.data);c.error='秘境数据读取或状态保存失败，原存储未被覆盖，已暂停编辑和计算。请恢复备份或重新读取。'+e.message;}
    var ids=Object.keys(c.state.realms);if(ids.indexOf(c.realmId)===-1)c.realmId=ids[0]||null;
    var realm=c.state.realms[c.realmId];if(realm&&(c.period<realm.currentPeriod||c.period>6))c.period=realm.currentPeriod;
  }
  function commit(c,fn){
    cancel(c);
    try{
      if(c.readError)throw Error('数据未能读取，不能用默认值覆盖原存储。');
      if(accountId(c)!==c.account){load(c);render(c);throw Error('账号已切换，请重新操作。');}
      if(readonly(c))throw Error('当前账号为只读状态，不能保存修改。');
      var fresh=c.core.advance(read(c),Date.now(),c.data),next=fn(fresh);
      write(c,next);c.state=next;c.error='';
      if(!next.realms[c.realmId])c.realmId=Object.keys(next.realms)[0]||null;
      if(c.realmId)c.period=Math.max(c.period,next.realms[c.realmId].currentPeriod);
      render(c);return true;
    }catch(e){showError(c,e);return false;}
  }
  function field(label,name,value,options){options=options||{};return '<label class="realm-field">'+esc(label)+'<input name="'+esc(name)+'" type="'+(options.type||'number')+'" '+(options.type==='date'?'':'min="0" step="'+(options.step||(options.money?'0.01':'1'))+'" inputmode="'+(options.money?'decimal':'numeric')+'"')+' value="'+esc(value)+'"'+(options.disabled?' disabled':'')+'></label>';}
  function statusLabel(status){return status.phase==='active'?'进行中 · 第'+status.day+'天':status.phase==='ended'?'已结束':'未开始';}
  function dateMarkup(c,realm,period,status){var rec=realm.periods[period]||{};var locked=rec.locked||rec.ended||status.phase!=='upcoming'||realm.finished;return '<form data-realm-form="date" class="realm-inline">'+field('本期开始日期（北京时间）','startDate',rec.startDate||'',{type:'date',disabled:locked||readonly(c)||c.readError})+'<button class="seg" type="submit"'+(locked||readonly(c)||c.readError?' disabled':'')+'>保存日期</button></form><p class="realm-muted">'+(status.endDate?'结束时间：'+esc(status.endDate)+' 00:00；开始后日期锁定。':'待设置开始日期。预规划按完整14天计算，不推测实际日期。')+'</p>';}
  function sourceMarkup(c,realm,period,status){
    var records=(realm.periods[period]||{}).sources||{},actual=c.mode==='progress',active=status.phase==='active'&&period===realm.currentPeriod&&!realm.finished,disabled=readonly(c)||c.readError||realm.finished||status.phase==='ended';
    return '<div class="realm-inline realm-source-tools"><button type="button" class="seg" data-realm-action="all"'+(disabled?' disabled':'')+'>全选常规来源</button><button type="button" class="seg" data-realm-action="none"'+(disabled?' disabled':'')+'>全部取消</button><button type="button" class="seg" data-realm-action="following"'+(disabled||period===6?' disabled':'')+'>应用勾选到后续各期</button></div><p class="realm-muted">勾选表示允许使用，不强制买满；648需逐期单独开启。已得抽数不会因取消勾选而消失。'+(actual?' 此处记录只扣减剩余额度，不自动增加累计或未使用库存。':'')+'</p><div class="secret-realm-sources">'+c.data.sources.filter(function(s){return !s.firstOnly||period===1;}).map(function(s){
      var rec=records[s.id]||{enabled:s.id!=='pack648',obtained:0,purchased:0},today=rec.todayDate===status.today;
      var check='<label class="realm-check"><input type="checkbox" data-realm-enable="'+s.id+'"'+(rec.enabled?' checked':'')+(disabled?' disabled':'')+'><strong>'+esc(s.name)+'</strong></label>';
      var details='<p class="realm-muted">每份'+s.draws+'抽 · '+(s.price?money(s.price):s.id==='ingots'?'2000元宝':'不计人民币')+' · '+(s.daily?'每天1次，错过不补':s.limit===null?'不限购':'每期'+s.limit+'次')+'</p>';
      var form='';if(actual){
        var locked=!active||disabled;
        form='<form data-realm-form="source" data-record-date="'+esc(status.today)+'" data-source-id="'+s.id+'"><div class="realm-fields">'+field('本期已获取抽数','obtained',rec.obtained||0,{disabled:locked})+(s.price?field('本期已购次数','purchased',rec.purchased||0,{disabled:locked}):'')+'</div>';
        if(s.daily){form+=s.price?field('今天已获取抽数（0～'+s.draws+'）','todayObtained',today?rec.todayObtained:0,{disabled:locked}):'<label class="realm-check"><input type="checkbox" name="todayObtained"'+(today&&rec.todayObtained?' checked':'')+(locked?' disabled':'')+'>今天已获取</label>';if(s.price)form+='<label class="realm-check"><input type="checkbox" name="todayPurchased"'+(today&&rec.todayPurchased?' checked':'')+(locked?' disabled':'')+'>今天已购买</label>';}
        form+='<button class="seg" type="submit"'+(locked?' disabled':'')+'>保存此来源记录</button></form>';
      }
      return '<article class="realm-source'+(s.id==='pack648'?' realm-unlimited':'')+'" data-realm-source="'+s.id+'">'+check+details+form+'</article>';
    }).join('')+'</div>';
  }
  function settingsMarkup(c){var settings=c.state.settings,disabled=readonly(c)||c.readError;return '<details class="realm-settings" open><summary>平台折扣与共用代金</summary><p class="realm-muted">同账号两种秘境共用；两种秘境独立规划，不代表同一余额可重复实际消费。计算不会扣减余额。</p><form data-realm-form="settings"><div class="realm-fields"><label class="realm-field">平台<select name="platformId"'+(disabled?' disabled':'')+'>'+settings.platforms.map(function(p){return '<option value="'+esc(p.id)+'"'+(p.id===settings.platformId?' selected':'')+'>'+esc(p.name)+' · '+esc(p.discount)+'折</option>';}).join('')+'</select></label>'+field('已有代金（元）','vouchers',settings.vouchers,{money:true,disabled:disabled})+'</div><label class="realm-check"><input type="checkbox" name="useVouchers"'+(settings.useVouchers?' checked':'')+(disabled?' disabled':'')+'>使用已有代金（先抵折前价，再打折）</label><button type="submit" class="seg"'+(disabled?' disabled':'')+'>保存费用设置</button></form><form data-realm-form="platform" class="realm-inline"><label class="realm-field">自定义平台名称<input type="text" name="platformName" maxlength="40"'+(disabled?' disabled':'')+'></label>'+field('折扣（例如4.3表示4.3折）','discount','4.3',{money:true,step:'any',disabled:disabled})+'<button class="seg" type="submit"'+(disabled?' disabled':'')+'>保存自定义平台</button></form></details>';}
  function referenceMarkup(c){return '<section class="realm-reference"><h3>抽数来源与单期限额</h3><p>每种秘境共6期，每期14天；首期赠送仅第1期有。通行证拆为免费11抽和付费额外88抽。所有奖励保留资料泛称，数量未知不猜测。</p><div class="realm-table-wrap"><table><thead><tr><th>来源</th><th>每份抽数</th><th>人民币原价</th><th>单期上限</th></tr></thead><tbody>'+c.data.sources.map(function(s){return '<tr><th>'+esc(s.name)+'</th><td>'+s.draws+'</td><td>'+money(s.price)+(s.id==='ingots'?'，另需2000元宝':'')+'</td><td>'+(s.firstOnly?'仅第1期1次':s.daily?'每日1次，共14次':s.limit===null?'不限，需逐期许可':s.limit+'次')+'</td></tr>';}).join('')+'</tbody></table></div><h3>累计奖励 · 共35档</h3><div class="realm-rewards">'+c.data.rewards.map(function(r){return '<div><strong>'+number(r.draws)+'抽</strong><span>'+esc(r.name)+'</span></div>';}).join('')+'</div></section>';}
  function schemeMarkup(label,plan){
    if(!plan)return '<section class="realm-plan"><h3>'+label+'</h3><p>在当前条件下无法达标。</p></section>';
    return '<section class="realm-plan"><h3>'+label+' · '+(plan.reachPeriod==null?'现有抽数已足够':'第'+plan.reachPeriod+'期达标')+'</h3><div class="realm-costs"><span>总计折前原价 <strong>'+money(plan.totalBefore)+'</strong></span><span>使用代金 <strong>'+money(plan.voucherUsed)+'</strong></span><span>抵后折前应付 <strong>'+money(plan.totalBefore-plan.voucherUsed)+'</strong></span><span>总计折后现金 <strong class="realm-price">'+money(plan.totalAfter)+'</strong></span><span>可达累计 '+number(plan.availableTotal)+'抽</span><span>超出目标 '+number(plan.surplus)+'抽</span></div>'+plan.periods.map(function(p){return '<details class="realm-period-result" open><summary>第'+p.number+'期 · 新增可得'+number(p.draws)+'抽 · 折后现金 '+money(p.after)+'</summary><p>本期折前原价 '+money(p.before)+' ／代金抵扣 '+money(p.voucherUsed)+' ／抵后折前应付 '+money(p.before-p.voucherUsed)+' ／折后现金 <strong class="realm-price">'+money(p.after)+'</strong></p><div class="realm-result-rows">'+p.rows.filter(function(row){return row.draws||row.purchases;}).map(function(row){return '<article><strong>'+esc(row.name)+'</strong><span>免费／已付款待领 '+number(row.availableDraws)+'抽</span><span>新增购买 '+number(row.purchases)+'份 · 新增可得共'+number(row.draws)+'抽</span><span>折前 '+money(row.before)+' ／代金 '+money(row.voucherUsed)+' ／折后 <strong class="realm-price">'+money(row.after)+'</strong></span>'+(row.id==='ingots'?'<span>需消耗2000元宝，不计人民币。</span>':'')+'</article>';}).join('')+'</div></details>';}).join('')+'<p class="realm-muted">以上仅为规划，不会替你购买、抽取、扣代金或更新实际记录。</p></section>';
  }
  function renderResults(c){var host=c.host.querySelector('[data-realm-results]');if(!host)return;if(c.busy){host.innerHTML='<p role="status">正在后台精确计算，可随时修改条件取消…</p>';return;}var result=c.result;if(!result){host.innerHTML='<p>保存条件后点击计算，同时对比最快与最省钱方案。</p>';return;}if(!result.valid){host.textContent=result.error||'计算条件不正确。';return;}host.innerHTML=(!result.fastest?'<p role="status">目前最多可达 '+number(result.maxReachable)+' 抽，距离目标还差 '+number(result.shortfall)+' 抽。请调整目标或允许的来源。</p>':'')+schemeMarkup('最快方案',result.fastest)+schemeMarkup('最省钱方案',result.cheapest);}
  function scheduleClock(c){if(c.clock)c.root.clearTimeout(c.clock);if(!c.visible)return;var now=Date.now(),day=Math.floor((now+28800000)/86400000),next=(day+1)*86400000-28800000;c.clock=c.root.setTimeout(function(){if(!c.visible)return;load(c);render(c);},Math.max(25,Math.min(2147483647,next-now+25)));}
  function render(c){
    var state=c.state,realm=state.realms[c.realmId],disabled=readonly(c)||c.readError;
    var html='<div class="realm-toolbar"><label class="realm-field">当前秘境<select id="secret-realm-select"'+(!realm?' disabled':'')+'>'+Object.keys(state.realms).map(function(id){var definition=c.data.realms.find(function(d){return d.id===id;});return '<option value="'+esc(id)+'"'+(c.realmId===id?' selected':'')+'>'+esc(definition?definition.name:id)+'</option>';}).join('')+'</select></label><button type="button" class="seg" data-realm-action="reload">重新读取</button></div><div class="segs realm-modes">'+[['progress','个人进度'],['planner','目标规划'],['reference','资料参考']].map(function(m){return '<button type="button" class="seg'+(c.mode===m[0]?' active':'')+'" data-realm-mode="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div><p data-realm-error class="error" role="alert"'+(c.error?'':' hidden')+'>'+esc(c.error)+'</p>'+(readonly(c)?'<p role="status">当前账号只读，可查看及临时计算，不能保存修改。</p>':'');
    if(c.mode==='reference')html+=referenceMarkup(c);
    else if(!realm)html+='<p>当前账号已无秘境记录。删除的秘境不会自动恢复；共用平台和代金设置仍保留。</p>'+settingsMarkup(c);
    else{
      if(c.period<realm.currentPeriod||c.period>6)c.period=realm.currentPeriod;
      var st=c.core.status(realm,c.period,Date.now(),c.data);
      html+='<p data-realm-status class="realm-status">'+esc(c.data.realms.find(function(r){return r.id===c.realmId;}).name)+' · 第'+c.period+'期 · '+statusLabel(st)+(realm.finished?' · 六期全部结束':'')+'</p><div class="segs realm-periods">';
      for(var n=1;n<=6;n++)html+='<button type="button" class="seg'+(n===c.period?' active':'')+'" data-realm-period="'+n+'"'+(n<realm.currentPeriod?' disabled':'')+'>第'+n+'期'+(n<realm.currentPeriod?' · 已结束':'')+'</button>';
      html+='</div>'+dateMarkup(c,realm,c.period,st);
      if(c.mode==='progress')html+='<form data-realm-form="totals"><div class="realm-fields">'+field('累计已抽次数（包含本期已抽）','cumulative',c.readError?'':realm.cumulative,{disabled:disabled})+field('当前持有未使用抽数','inventory',c.readError?'':realm.inventory,{disabled:disabled})+'</div><button class="seg" type="submit"'+(disabled?' disabled':'')+'>保存累计与库存</button></form><p class="realm-muted">来源“已获取”只扣减剩余额度；请分别更新累计已抽和未使用库存，避免重复加算。</p>';
      if(!realm.finished){
        if(c.mode==='planner')html+=settingsMarkup(c)+'<form data-realm-form="calculate" class="realm-goal"><div class="realm-fields">'+field('目标累计抽数','target',Object.prototype.hasOwnProperty.call(c.drafts,c.realmId)?c.drafts[c.realmId]:realm.target,{disabled:c.readError})+'<label class="realm-field">按奖励选目标<select data-realm-reward'+(c.readError?' disabled':'')+'><option value="">选择奖励门槛</option>'+c.data.rewards.map(function(r){return '<option value="'+r.draws+'">'+r.draws+'抽 · '+esc(r.name)+'</option>';}).join('')+'</select></label></div><button type="submit" class="seg" data-realm-calculate'+(c.readError?' disabled':'')+'>计算最快／最省钱方案</button><p class="realm-muted">仅计算当前及未来期。最快先比较达标期数；最省钱先比较折后现金，再比较代金消耗。</p></form>';
        html+=sourceMarkup(c,realm,c.period,st);
        if(c.mode==='planner')html+='<div data-realm-results aria-live="polite"></div>';
        else if(st.phase!=='active')html+='<p class="realm-muted">本期尚未开始：可填写累计、库存和规划条件，但不能生成实际购买／获取记录。</p>';
      }else html+='<p>六期已全部结束，仅保留累计已抽和未使用库存。</p><button type="button" class="seg realm-delete" data-realm-action="delete"'+(disabled?' disabled':'')+'>删除此秘境全部信息</button>';
    }
    c.host.innerHTML=html;c.host.setAttribute('aria-busy',String(c.busy));renderResults(c);scheduleClock(c);
  }
  function get(form,name){return form.elements.namedItem(name);}
  function collectSettings(c,form){return {platformId:get(form,'platformId').value,vouchers:inputNumber(get(form,'vouchers').value),useVouchers:get(form,'useVouchers').checked};}
  async function calculate(c,form){
    cancel(c);var raw=get(form,'target').value,revision=c.revision,account=c.account,realmId=c.realmId;
    try{
      if(c.readError)throw Error('原数据未能读取，不能使用空白替代值计算。');
      var fresh=c.core.advance(read(c),Date.now(),c.data);fresh=c.core.updateTotals(fresh,realmId,{target:inputNumber(raw)},c.data);
      if(!readonly(c))write(c,fresh);c.state=fresh;delete c.drafts[realmId];
      var input=c.core.buildPlanningInput(fresh,realmId,Date.now(),c.data),fingerprint=JSON.stringify(input);
      c.busy=true;c.error='';showError(c,'');c.host.setAttribute('aria-busy','true');var button=c.host.querySelector('[data-realm-calculate]');if(button)button.disabled=true;renderResults(c);
      var result=await c.runner.run(input);
      if(revision!==c.revision||account!==accountId(c)||realmId!==c.realmId||!c.visible||c.mode!=='planner')return;
      var latest=c.core.advance(read(c),Date.now(),c.data);if(readonly(c))latest=c.core.updateTotals(latest,realmId,{target:inputNumber(raw)},c.data);
      if(JSON.stringify(c.core.buildPlanningInput(latest,realmId,Date.now(),c.data))!==fingerprint){load(c);render(c);showError(c,'记录或活动时间已变化，请重新计算。');return;}
      c.result=result;c.busy=false;c.host.setAttribute('aria-busy','false');if(button)button.disabled=false;renderResults(c);
    }catch(e){if(e.name==='AbortError')return;c.busy=false;c.host.setAttribute('aria-busy','false');var b=c.host.querySelector('[data-realm-calculate]');if(b)b.disabled=false;showError(c,e);}
  }
  function attach(c){
    c.host.addEventListener('input',function(event){if(event.target.name==='target')c.drafts[c.realmId]=event.target.value;if(event.target.matches('input,select'))cancel(c);});
    c.host.addEventListener('change',function(event){var input=event.target;
      if(input.id==='secret-realm-select'){cancel(c);c.realmId=input.value;c.period=c.state.realms[c.realmId].currentPeriod;render(c);}
      else if(input.hasAttribute('data-realm-enable'))commit(c,function(s){return c.core.setEnabled(s,c.realmId,c.period,input.dataset.realmEnable,input.checked,Date.now(),c.data);});
      else if(input.hasAttribute('data-realm-reward')&&input.value){var target=c.host.querySelector('input[name="target"]');target.value=input.value;c.drafts[c.realmId]=input.value;cancel(c);}
    });
    c.host.addEventListener('click',function(event){var b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.realmMode){cancel(c);c.mode=b.dataset.realmMode;render(c);}
      else if(b.dataset.realmPeriod){cancel(c);c.period=Number(b.dataset.realmPeriod);render(c);}
      else if(b.dataset.realmAction==='reload'){c.drafts={};load(c);render(c);}
      else if(b.dataset.realmAction==='all'||b.dataset.realmAction==='none')commit(c,function(s){return c.core.setAll(s,c.realmId,c.period,b.dataset.realmAction==='all',Date.now(),c.data);});
      else if(b.dataset.realmAction==='following')commit(c,function(s){return c.core.applyFollowing(s,c.realmId,c.period,Date.now(),c.data);});
      else if(b.dataset.realmAction==='delete'&&c.root.confirm('确认删除当前账号中此秘境的全部信息？删除后不会自动恢复，其他账号、共用代金和平台设置不受影响。'))commit(c,function(s){return c.core.deleteRealm(s,c.realmId,Date.now(),c.data);});
    });
    c.host.addEventListener('submit',function(event){var form=event.target,kind=form.dataset.realmForm;if(!kind)return;event.preventDefault();
      if(kind==='calculate'){calculate(c,form);return;}
      commit(c,function(s){
        if(kind==='date')return c.core.setStartDate(s,c.realmId,c.period,get(form,'startDate').value,Date.now(),c.data);
        if(kind==='totals')return c.core.updateTotals(s,c.realmId,{cumulative:inputNumber(get(form,'cumulative').value),inventory:inputNumber(get(form,'inventory').value)},c.data);
        if(kind==='settings')return c.core.updateSettings(s,collectSettings(c,form),c.data);
        if(kind==='source'){var source=c.data.sources.find(function(item){return item.id===form.dataset.sourceId;});var values={obtained:inputNumber(get(form,'obtained').value),purchased:get(form,'purchased')?inputNumber(get(form,'purchased').value):0};var today=c.core.status(s.realms[c.realmId],c.period,Date.now(),c.data).today;if(source.daily&&form.dataset.recordDate!==today)throw Error('日期已变化，请重新读取并确认今天的获取／购买记录后再保存。');values.todayDate=source.daily?form.dataset.recordDate:null;values.todayObtained=source.daily&&source.price?inputNumber(get(form,'todayObtained').value):get(form,'todayObtained')&&get(form,'todayObtained').checked?source.draws:0;values.todayPurchased=get(form,'todayPurchased')&&get(form,'todayPurchased').checked?1:0;return c.core.updateSource(s,c.realmId,c.period,form.dataset.sourceId,values,Date.now(),c.data);}
        if(kind==='platform'){var settings=copy(s.settings),id='custom-'+Date.now().toString(36);settings.platforms.push({id:id,name:get(form,'platformName').value,discount:inputNumber(get(form,'discount').value)});settings.platformId=id;return c.core.updateSettings(s,settings,c.data);}
        throw Error('未知保存操作。');
      });
    });
  }
  function init(root){
    if(!root||!root.document||!root.QinshiAccounts||!root.SECRET_REALM_CORE||!root.SECRET_REALM_PLANNER)return null;
    var partition=root.document.getElementById('partition-secret-realm');if(!partition)return null;
    var existing=contexts.find(function(c){return c.partition===partition;});if(existing)return existing;
    var host=root.document.createElement('div');host.id='secret-realm-content';partition.appendChild(host);
    var c={root:root,partition:partition,host:host,data:root.SECRET_REALM_DATA,core:root.SECRET_REALM_CORE,state:null,drafts:{},realmId:null,period:0,mode:'progress',revision:0,busy:false,result:null,error:'',visible:!partition.hidden,clock:null};
    c.runner=root.QinshiCalculationRunner.create({kind:'secret-realm',fallback:function(input){return root.SECRET_REALM_PLANNER.plan(input);}});contexts.push(c);attach(c);load(c);render(c);partition.dataset.realmInitialized='true';
    root.document.addEventListener('qinshi:partitionchange',function(event){c.visible=event.detail&&event.detail.name==='secret-realm'&&!partition.hidden;if(c.visible){load(c);render(c);}else{cancel(c);if(c.clock)root.clearTimeout(c.clock);}});
    root.document.addEventListener('visibilitychange',function(){if(!root.document.hidden&&c.visible){load(c);render(c);}});
    root.addEventListener('pageshow',function(){if(c.visible){load(c);render(c);}});
    root.addEventListener('storage',function(event){if(c.visible&&(!event.key||event.key.indexOf(encodeURIComponent(KEY))!==-1)){load(c);render(c);}});
    if(root.QinshiAccounts.subscribeAccess)root.QinshiAccounts.subscribeAccess(function(access){if(c.visible&&(accountId(c)!==c.account||(access.accountId===c.account&&access.writable!==c.accessWritable))){load(c);render(c);}});
    return c;
  }
  function captureView(){var c=contexts[0];return c?{mode:c.mode,realmId:c.realmId,period:c.period}:{};}
  function restoreView(view){var c=contexts[0];if(!c)return;cancel(c);load(c);if(view&&c.state.realms[view.realmId])c.realmId=view.realmId;if(view&&['progress','planner','reference'].indexOf(view.mode)!==-1)c.mode=view.mode;c.period=view&&Number(view.period)||c.state.realms[c.realmId]&&c.state.realms[c.realmId].currentPeriod||0;render(c);}
  return {STORE_KEY:KEY,init:init,captureView:captureView,restoreView:restoreView};
});
