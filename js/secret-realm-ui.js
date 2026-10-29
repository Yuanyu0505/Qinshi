(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SECRET_REALM_UI=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var KEY='qinshi_secret_realms_v1', contexts=[];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function number(v){return Number(v).toLocaleString('zh-CN',{maximumFractionDigits:2});}
  function money(v){return '¥'+Math.ceil(Number(v)).toLocaleString('zh-CN',{maximumFractionDigits:0});}
  function emphasis(v){return '<strong class="realm-price">'+number(v)+'</strong>';}
  function isPack(source){return /^pack\d+$/.test(source.id);}
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function currencyName(c){var d=c.data.realms.find(function(r){return r.id===c.realmId;});return d?d.currencyName:'兑换道具';}
  function goals(c){return Object.assign({},c.state.realms[c.realmId],c.drafts[c.realmId]||{});}
  function collectGoals(c,form){var r=c.state.realms[c.realmId],targetEnabled=get(form,'targetEnabled').checked,currencyTargetEnabled=get(form,'currencyTargetEnabled').checked;return {targetEnabled:targetEnabled,currencyTargetEnabled:currencyTargetEnabled,target:targetEnabled?inputNumber(get(form,'target').value):r.target,currencyTarget:currencyTargetEnabled?inputNumber(get(form,'currencyTarget').value):r.currencyTarget,drawMode:get(form,'drawMode').value};}
  function rememberGoal(c,input){if(['target','currencyTarget','targetEnabled','currencyTargetEnabled','drawMode'].indexOf(input.name)!==-1){if(!c.drafts[c.realmId])c.drafts[c.realmId]={};c.drafts[c.realmId][input.name]=input.type==='checkbox'?input.checked:input.value;}}
  function inputNumber(raw){if(typeof raw!=='string'||!raw.trim()||!/^\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw Error('请输入有效的非负数值，不能留空。');return Number(raw);}
  function accountId(c){var a=c.root.QinshiAccounts.currentAccount();return a&&a.id;}
  function readonly(c){try{return c.root.QinshiAccounts.isReadOnly();}catch(e){return true;}}
  function pause(c){c.revision++;if(c.runner)c.runner.cancel();c.busy=false;var button=c.host.querySelector('[data-realm-calculate]');if(button)button.disabled=false;c.host.setAttribute('aria-busy','false');}
  function cancel(c){pause(c);c.result=null;if(c.results)delete c.results[c.realmId];var result=c.host.querySelector('[data-realm-results]');if(result)result.innerHTML='<p>条件已变化，请重新计算。</p>';}
  function planningInput(c){var r=goals(c),values={targetEnabled:!!r.targetEnabled,currencyTargetEnabled:!!r.currencyTargetEnabled,drawMode:r.drawMode};if(r.targetEnabled)values.target=inputNumber(String(r.target));if(r.currencyTargetEnabled)values.currencyTarget=inputNumber(String(r.currencyTarget));return c.core.buildPlanningInput(c.core.updateTotals(c.state,c.realmId,values,c.data),c.realmId,Date.now(),c.data);}
  function restoreResult(c){
    if(c.busy)return;c.result=null;var cached=c.results[c.realmId];if(!cached||c.readError)return;
    try{if(cached.fingerprint===JSON.stringify(planningInput(c)))c.result=cached.result;else delete c.results[c.realmId];}catch(e){delete c.results[c.realmId];}
  }
  function showError(c,error){c.error=error?String(error.message||error):'';var box=c.host.querySelector('[data-realm-error]');if(box){box.textContent=c.error;box.hidden=!c.error;}}
  function read(c){var raw=c.root.QinshiAccounts.getItem(KEY);return raw==null?c.core.createDefault(c.data):c.core.normalize(JSON.parse(raw),c.data);}
  function write(c,state){if(c.root.QinshiAccounts.setItem(KEY,JSON.stringify(state))===false)throw Error('当前账号为只读状态，未保存。');}
  function load(c){
    pause(c);var nextAccount=accountId(c);if(nextAccount!==c.account){c.drafts={};c.results={};}c.account=nextAccount;c.accessWritable=!readonly(c);c.readError=false;
    try{var saved=read(c),next=c.core.advance(saved,Date.now(),c.data);if(JSON.stringify(next)!==JSON.stringify(saved)&&!readonly(c))write(c,next);c.state=next;c.error='';}
    catch(e){c.results={};c.result=null;c.readError=true;c.state=c.core.createDefault(c.data);c.error='秘境数据读取或状态保存失败，原存储未被覆盖，已暂停编辑和计算。请恢复备份或重新读取。'+e.message;}
    var ids=Object.keys(c.state.realms);if(ids.indexOf(c.realmId)===-1)c.realmId=ids[0]||null;
    var realm=c.state.realms[c.realmId];if(realm&&(c.period<realm.currentPeriod||c.period>6))c.period=realm.currentPeriod;
  }
  function commit(c,fn,quiet){
    try{
      if(c.readError)throw Error('数据未能读取，不能用默认值覆盖原存储。');
      if(accountId(c)!==c.account){load(c);render(c);throw Error('账号已切换，请重新操作。');}
      if(readonly(c))throw Error('当前账号为只读状态，不能保存修改。');
      var fresh=c.core.advance(read(c),Date.now(),c.data),next=fn(fresh);
      if(JSON.stringify(next)!==JSON.stringify(fresh)){write(c,next);pause(c);}c.state=next;c.error='';
      if(!next.realms[c.realmId])c.realmId=Object.keys(next.realms)[0]||null;
      if(c.realmId)c.period=Math.max(c.period,next.realms[c.realmId].currentPeriod);
      if(quiet){restoreResult(c);renderResults(c);showError(c,'');var saved=c.host.querySelector('[data-realm-save-status]');if(saved)saved.textContent='已自动保存';}else render(c);return true;
    }catch(e){showError(c,e);return false;}
  }
  function field(label,name,value,options){options=options||{};return '<label class="realm-field">'+esc(label)+'<input name="'+esc(name)+'" type="'+(options.type||'number')+'" '+(options.type==='date'?'':'min="0" step="'+(options.step||'1')+'" inputmode="'+(options.step==='any'?'decimal':'numeric')+'"')+' value="'+esc(value)+'"'+(options.disabled?' disabled':'')+'></label>';}
  function statusLabel(status){return status.phase==='active'?'进行中 · 第'+status.day+'天':status.phase==='ended'?'已结束':'未开始';}
  function dateMarkup(c,realm,period,status){var rec=realm.periods[period]||{};var locked=rec.locked||rec.ended||status.phase!=='upcoming'||realm.finished;return '<form data-realm-form="date" class="realm-inline">'+field('本期开始日期（北京时间）','startDate',rec.startDate||'',{type:'date',disabled:locked||readonly(c)||c.readError})+'<button class="seg" type="submit"'+(locked||readonly(c)||c.readError?' disabled':'')+'>保存日期</button></form><p class="realm-muted">'+(status.endDate?'结束时间：'+esc(status.endDate)+' 00:00；开始后日期锁定。':'待设置开始日期。预规划按完整14天计算，不推测实际日期。')+'</p>';}
  function sourceMarkup(c,realm,period,status){
    var records=(realm.periods[period]||{}).sources||{},actual=c.mode==='progress',active=status.phase==='active'&&period===realm.currentPeriod&&!realm.finished,disabled=readonly(c)||c.readError||realm.finished||status.phase==='ended';
    var tools=actual?'':'<div class="realm-inline realm-source-tools"><button type="button" class="seg" data-realm-action="all"'+(disabled?' disabled':'')+'>全选常规来源</button><button type="button" class="seg" data-realm-action="none"'+(disabled?' disabled':'')+'>全部取消</button><button type="button" class="seg" data-realm-action="following"'+(disabled||period===6?' disabled':'')+'>应用勾选到后续各期</button></div><p class="realm-muted">勾选表示允许使用，不强制买满；648需逐期单独开启。已得抽数不会因取消勾选而消失。</p>';
    return tools+'<div class="secret-realm-sources">'+c.data.sources.filter(function(s){return !s.firstOnly||period===1;}).map(function(s){
      var rec=records[s.id]||{enabled:s.id!=='pack648',obtained:0,purchased:0};
      var title=actual?'<h3>'+esc(s.name)+'</h3>':'<label class="realm-check"><input type="checkbox" data-realm-enable="'+s.id+'"'+(rec.enabled?' checked':'')+(disabled?' disabled':'')+'><strong>'+esc(s.name)+'</strong></label>';
      var counts={1:'一',2:'两',4:'四',6:'六',14:'十四'};
      var frequency=s.firstOnly?'仅首期一次':s.daily?'每天一次，每期十四次':s.limit===null?'不限次数':'每期'+(counts[s.limit]||s.limit)+'次';
      var details='<p class="realm-muted">'+frequency+'，'+emphasis(s.draws)+'抽/次'+(s.price?' · '+money(s.price)+'/次':s.id==='ingots'?' · 2000元宝/次':'')+'</p>';
      var form='';if(actual){
        var locked=!active||disabled;
        form='<form data-realm-form="source" data-source-id="'+s.id+'">'+(s.id==='paid-pass'?'<label class="realm-check"><input type="checkbox" name="purchased"'+(rec.purchased?' checked':'')+(locked?' disabled':'')+'>已购买付费通行证</label>':'')+'<div class="realm-fields">'+(isPack(s)?field('本期已购次数','purchased',rec.purchased||0,{disabled:locked}):field('本期已获取抽数','obtained',rec.obtained||0,{disabled:locked}))+(s.currencyReceipt?field('本期已领取'+currencyName(c),'currencyObtained',rec.currencyObtained||0,{disabled:locked}):'')+'</div></form>';
      }
      return '<article class="realm-source'+(s.id==='pack648'?' realm-unlimited':'')+'" data-realm-source="'+s.id+'">'+title+details+(s.currency?'<p class="realm-muted">'+(s.currencyReceipt?'每期':'每次购买')+'直接赠送'+emphasis(s.currency)+'个'+currencyName(c)+(s.id==='paid-pass'?'（免费'+emphasis(40)+'个之外额外获得）':'')+'</p>':'')+form+'</article>';
    }).join('')+'</div>';
  }
  function platformOptions(c){
    var settings=c.state.settings,groups=[],builtins=c.data.platforms.map(function(p){return p.id;});
    settings.platforms.forEach(function(p){
      var builtin=builtins.indexOf(p.id)!==-1,group=builtin&&groups.find(function(g){return g.builtin&&g.discount===p.discount;});
      if(group){group.items.push(p);return;}groups.push({builtin:builtin,discount:p.discount,items:[p]});
    });
    return groups.map(function(g){var selected=g.items.find(function(p){return p.id===settings.platformId;});var p=selected||g.items[0],label=g.items.map(function(p){return p.name;}).join('/');return '<option value="'+esc(p.id)+'"'+(selected?' selected':'')+'>'+esc(label)+(g.discount===10?' · 无折扣':' · '+esc(g.discount)+'折')+'</option>';}).join('');
  }
  function settingsMarkup(c){var settings=c.state.settings,disabled=readonly(c)||c.readError;return '<details class="realm-settings" open><summary>平台折扣与共用代金</summary><p class="realm-muted">同账号秘境共用；修改后自动保存，计算不会扣减实际代金。折后现金总额向上取整后分摊至各期和来源。</p><form data-realm-form="settings"><div class="realm-fields"><label class="realm-field">平台<select name="platformId"'+(disabled?' disabled':'')+'>'+platformOptions(c)+'</select></label>'+field('已有代金（元）','vouchers',settings.vouchers,{disabled:disabled})+'</div><label class="realm-check"><input type="checkbox" name="useVouchers"'+(settings.useVouchers?' checked':'')+(disabled?' disabled':'')+'>使用已有代金（先抵折前价，再打折）</label></form><form data-realm-form="platform" class="realm-inline"><label class="realm-field">自定义平台名称<input type="text" name="platformName" maxlength="40"'+(disabled?' disabled':'')+'></label>'+field('折扣（例如4.3表示4.3折）','discount','4.3',{step:'any',disabled:disabled})+'<button class="seg" type="submit"'+(disabled?' disabled':'')+'>保存自定义平台</button></form></details>';}
  function referenceMarkup(c){var gaoyue=c.realmId==='gaoyue',ref=c.data.gaoyueReference;return '<section class="realm-reference"><h3>抽数来源与单期限额</h3><p>每种秘境共6期，每期14天；首期赠送仅第1期有。通行证拆为免费11抽和付费额外88抽。每次实际抽取赠送1个'+currencyName(c)+'，领取抽取券并不等于已经抽取。</p><div class="realm-table-wrap"><table><thead><tr><th>来源</th><th>每份抽数</th><th>人民币原价</th><th>单期上限</th><th>直接赠送道具</th></tr></thead><tbody>'+c.data.sources.map(function(s){return '<tr><th>'+esc(s.name)+'</th><td>'+s.draws+'</td><td>'+money(s.price)+(s.id==='ingots'?'，另需2000元宝':'')+'</td><td>'+(s.firstOnly?'仅第1期1次':s.daily?'每日1次，共14次':s.limit===null?'不限，需逐期许可':s.limit+'次')+'</td><td>'+(s.currency?emphasis(s.currency)+(s.currencyReceipt?'个／期':'个／份'):'—')+'</td></tr>';}).join('')+'</tbody></table></div><p>免费每期110个道具＝14次免费抽取＋免费通行证40＋熊猫头56；另有70张可保存券，实际使用后还可获得70个道具。未使用的券不发放抽取赠送。</p>'+(gaoyue?'<h3>高月商店兑换参考</h3><div class="realm-rewards">'+ref.shop.map(function(r){return '<div><strong class="realm-price">'+r[0]+'月石</strong><span>'+esc(r[1])+'</span></div>';}).join('')+'</div><p>120神魄按40月石兑换5个计算，共需960月石；仅为资料，不自动兑换或扣余额。</p>':'')+'<h3>累计奖励 · 共35档</h3><div class="realm-rewards">'+c.data.rewards.map(function(r){var specific=gaoyue&&ref.rewards.find(function(x){return x[0]===r.draws;});return '<div><strong class="realm-price">'+number(r.draws)+'抽</strong><span>'+esc(specific?specific[1]:r.name)+'</span></div>';}).join('')+'</div></section>';}
  function schemeMarkup(c,label,plan){
    if(!plan)return '<section class="realm-plan"><h3>'+label+'</h3><p>在当前条件下无法达标。</p></section>';
    var currency=esc(currencyName(c));
    return '<section class="realm-plan"><h3>'+label+' · '+(plan.reachPeriod==null?'现有余额／库存可达标':'第'+plan.reachPeriod+'期达标')+'</h3><div class="realm-costs">'+
      '<span>总计折前原价 <strong>'+money(plan.totalBefore)+'</strong></span><span>使用代金 <strong class="realm-price">'+money(plan.voucherUsed)+'</strong></span><span>代金抵扣后折前应付 <strong>'+money(plan.totalBefore-plan.voucherUsed)+'</strong></span><span>总计折后现金 <strong class="realm-price">'+money(plan.totalAfter)+'</strong></span><span>实际计划抽取 '+emphasis(plan.plannedDraws)+' 次</span>'+ 
      '<span>最终累计 '+emphasis(plan.finalCumulative)+' 抽</span><span>剩余抽取券 '+number(plan.remainingTickets)+' 张</span><span>直接赠送'+currency+' '+emphasis(plan.directCurrency)+' 个</span><span>抽取赠送'+currency+' '+emphasis(plan.currencyFromDraws)+' 个</span><span>预计'+currency+'余额 '+emphasis(plan.currencyBalance)+' 个</span></div>'+
      (plan.initialDraws?'<p>使用现有库存抽取 '+emphasis(plan.initialDraws)+' 次。</p>':'')+plan.periods.map(function(p){return '<details class="realm-period-result" open><summary>第'+p.number+'期：本期计划抽取 '+emphasis(p.plannedDraws)+'抽、折后现金 <strong class="realm-price">'+money(p.after)+'</strong></summary><p>本期折前原价 '+money(p.before)+' ／代金抵扣 <strong class="realm-price">'+money(p.voucherUsed)+'</strong> ／代金抵扣后折前应付 '+money(p.before-p.voucherUsed)+' ／折后现金 <strong class="realm-price">'+money(p.after)+'</strong></p><p>本期计划抽取 '+emphasis(p.plannedDraws)+' 次；剩余券 '+number(p.remainingTickets)+'；直接赠送'+currency+' '+emphasis(p.directCurrency)+'；抽取赠送'+currency+' '+emphasis(p.currencyFromDraws)+'；预计'+currency+'余额 '+emphasis(p.currencyBalance)+'</p><div class="realm-result-rows">'+p.rows.filter(function(row){return row.draws||row.purchases||row.directCurrency;}).map(function(row){
        var source=c.data.sources.find(function(s){return s.id===row.id;});
        return '<article><strong>'+esc(row.name)+'</strong>'+(!source||!isPack(source)?'<span>剩余 '+emphasis(row.availableDraws)+'抽待领取</span>':'')+(row.purchases?'<span>需要购买'+number(row.purchases)+'份，累计'+emphasis(row.draws)+'抽</span>':'')+'<span>直接赠送'+currency+' '+emphasis(row.directCurrency)+'个</span><span>折前 '+money(row.before)+' ／代金 <strong class="realm-price">'+money(row.voucherUsed)+'</strong> ／折后 <strong class="realm-price">'+money(row.after)+'</strong></span>'+(row.id==='ingots'?'<span>需消耗2000元宝，不计人民币。</span>':'')+'</article>';
      }).join('')+'</div></details>';}).join('')+'<p class="realm-muted">以上仅为规划，不会替你购买、抽取、扣代金或更新实际记录。</p></section>';
  }
  function renderResults(c){var host=c.host.querySelector('[data-realm-results]');if(!host)return;if(c.busy){host.innerHTML='<p role="status">正在后台精确计算，可随时修改条件取消…</p>';return;}var result=c.result;if(!result){host.innerHTML='<p>设置目标后点击计算，同时对比最快与最省钱方案。</p>';return;}if(!result.valid){host.textContent=result.error||'计算条件不正确。';return;}var same=result.fastest&&result.cheapest&&JSON.stringify(result.fastest)===JSON.stringify(result.cheapest);host.innerHTML=(!result.fastest?'<p role="status">当前条件无法达标，抽数目标还差 '+number(result.shortfall||0)+' 抽，'+currencyName(c)+'目标还差 '+number(result.currencyShortfall||0)+' 个。请调整目标或允许的来源。</p>':'')+(same?schemeMarkup(c,'最快／最省钱方案',result.fastest):schemeMarkup(c,'最快方案',result.fastest)+schemeMarkup(c,'最省钱方案',result.cheapest));}
  function scheduleClock(c){if(c.clock)c.root.clearTimeout(c.clock);if(!c.visible)return;var now=Date.now(),day=Math.floor((now+28800000)/86400000),next=(day+1)*86400000-28800000;c.clock=c.root.setTimeout(function(){if(!c.visible)return;load(c);render(c);},Math.max(25,Math.min(2147483647,next-now+25)));}
  function platformDeleteMarkup(c){return '<div class="realm-inline realm-platform-list">'+c.state.settings.platforms.filter(function(p){return !c.data.platforms.some(function(d){return d.id===p.id;});}).map(function(p){return '<span>'+esc(p.name)+' · '+esc(p.discount)+'折 <button type="button" class="seg realm-delete" data-realm-delete-platform="'+esc(p.id)+'"'+(readonly(c)||c.readError?' disabled':'')+'>删除此平台</button></span>';}).join('')+'</div>';}
  function goalMarkup(c){var r=goals(c);return '<form data-realm-form="calculate" class="realm-goal"><div class="realm-goal-switches"><label class="realm-check"><input type="checkbox" name="targetEnabled"'+(r.targetEnabled?' checked':'')+'>启用累计抽数目标</label><label class="realm-check"><input type="checkbox" name="currencyTargetEnabled"'+(r.currencyTargetEnabled?' checked':'')+'>启用'+currencyName(c)+'目标</label></div><div class="realm-fields realm-goal-row">'+field('目标累计抽数','target',r.target,{disabled:c.readError})+field('目标'+currencyName(c)+'余额','currencyTarget',r.currencyTarget,{disabled:c.readError})+'<label class="realm-field">抽取模式<select name="drawMode"><option value="stop"'+(r.drawMode==='stop'?' selected':'')+'>点到即止（余券留库存）</option><option value="all"'+(r.drawMode==='all'?' selected':'')+'>全部抽光（仅使用方案余券）</option></select></label><label class="realm-field">按奖励选目标<select data-realm-reward'+(c.readError?' disabled':'')+'><option value="">选择奖励门槛</option>'+c.data.rewards.map(function(r){return '<option value="'+r.draws+'">'+r.draws+'抽 · '+esc(r.name)+'</option>';}).join('')+'</select></label><button type="submit" class="seg" data-realm-calculate'+(c.readError?' disabled':'')+'>计算最快／最省钱方案</button></div><p class="realm-muted">目标分别可选，两个启用时同时满足。抽光仅使用同一购买方案的余券，不追加来源或购买。最快先比较达标期数；最省钱先比较折后现金，再比较代金消耗。</p></form>';}
  function render(c){
    restoreResult(c);
    var state=c.state,realm=state.realms[c.realmId],disabled=readonly(c)||c.readError;
    var html='<div class="realm-toolbar"><div class="segs realm-switches" aria-label="当前秘境">'+Object.keys(state.realms).map(function(id){var definition=c.data.realms.find(function(d){return d.id===id;});return '<button type="button" class="seg'+(c.realmId===id?' active':'')+'" data-realm-id="'+esc(id)+'" aria-pressed="'+(c.realmId===id)+'">'+esc(definition?definition.name:id)+'</button>';}).join('')+'</div><button type="button" class="seg" data-realm-action="reload">重新读取</button></div><div class="segs realm-modes">'+[['progress','个人进度'],['planner','目标规划'],['reference','资料参考']].map(function(m){return '<button type="button" class="seg'+(c.mode===m[0]?' active':'')+'" data-realm-mode="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div><p data-realm-error class="error" role="alert"'+(c.error?'':' hidden')+'>'+esc(c.error)+'</p>'+(readonly(c)?'<p role="status">当前账号只读，可查看及临时计算，不能保存修改。</p>':'');
    if(c.mode==='reference')html+=referenceMarkup(c);
    else if(!realm)html+='<p>当前账号已无秘境记录。删除的秘境不会自动恢复；共用平台和代金设置仍保留。</p>'+settingsMarkup(c)+platformDeleteMarkup(c);
    else{
      if(c.period<realm.currentPeriod||c.period>6)c.period=realm.currentPeriod;
      var st=c.core.status(realm,c.period,Date.now(),c.data);
      html+='<p data-realm-status class="realm-status">'+esc(c.data.realms.find(function(r){return r.id===c.realmId;}).name)+' · 第'+c.period+'期 · '+statusLabel(st)+(realm.finished?' · 六期全部结束':'')+'</p><div class="segs realm-periods">';
      for(var n=1;n<=6;n++)html+='<button type="button" class="seg'+(n===c.period?' active':'')+'" data-realm-period="'+n+'"'+(n<realm.currentPeriod?' disabled':'')+'>第'+n+'期'+(n<realm.currentPeriod?' · 已结束':'')+'</button>';
      html+='</div>'+dateMarkup(c,realm,c.period,st);
      if(c.mode==='progress')html+='<form data-realm-form="totals"><div class="realm-fields">'+field('累计已抽次数（包含本期已抽）','cumulative',c.readError?'':realm.cumulative,{disabled:disabled})+field('当前持有未使用抽数','inventory',c.readError?'':realm.inventory,{disabled:disabled})+field('当前持有'+currencyName(c),'currency',c.readError?'':realm.currency,{disabled:disabled})+'</div></form><p class="realm-muted">修改后自动保存；来源记录只扣减剩余额度，不自动更新库存或累计。请分别更新累计、未用券库存及兑换道具余额。每日来源只使用本期累计填写值，不判断今天额度。已购礼包的赠送道具包含在手填余额，不重复发放。</p>';
      if(!realm.finished){
        if(c.mode==='planner')html+=settingsMarkup(c)+platformDeleteMarkup(c)+goalMarkup(c);
        html+=sourceMarkup(c,realm,c.period,st);
        if(c.mode==='planner')html+='<div data-realm-results aria-live="polite"></div>';
        else if(st.phase!=='active')html+='<p class="realm-muted">本期尚未开始：可填写累计、库存和规划条件，但不能生成实际购买／获取记录。</p>';
      }else html+='<p>六期已全部结束，仅保留累计已抽和未使用库存。</p><button type="button" class="seg realm-delete" data-realm-action="delete"'+(disabled?' disabled':'')+'>删除此秘境全部信息</button>';
    }
    c.host.innerHTML=html+'<p data-realm-save-status class="realm-muted" role="status" aria-live="polite">有效输入会自动保存。</p>';c.host.setAttribute('aria-busy',String(c.busy));renderResults(c);scheduleClock(c);
  }
  function get(form,name){return form.elements.namedItem(name);}
  function autoSave(c,input){
    var form=input.closest('form'),kind=form&&form.dataset.realmForm;
    if(['totals','settings','source'].indexOf(kind)===-1||input.disabled)return;
    if(input.type!=='checkbox'&&input.type!=='select-one'&&(!input.value.trim()||!input.validity.valid)){showError(c,'尚未保存：请输入有效的非负整数。');var notice=c.host.querySelector('[data-realm-save-status]');if(notice)notice.textContent='输入尚未保存，原记录保持不变。';return;}
    var saved=commit(c,function(s){
      var values={},value=input.type==='checkbox'?(kind==='source'?(input.checked?1:0):input.checked):input.tagName==='SELECT'?input.value:inputNumber(input.value);
      values[input.name]=value;
      if(kind==='totals')return c.core.updateTotals(s,c.realmId,values,c.data);
      if(kind==='settings')return c.core.updateSettings(s,values,c.data);
      return c.core.updateSourceProgress(s,c.realmId,c.period,form.dataset.sourceId,values,Date.now(),c.data);
    },true);
    var notice=c.host.querySelector('[data-realm-save-status]');if(notice&&!saved)notice.textContent='未保存，请按上方提示修正；原记录保持不变。';
  }
  async function calculate(c,form){
    pause(c);var revision=c.revision,account=c.account,realmId=c.realmId;
    try{
      if(c.readError)throw Error('原数据未能读取，不能使用空白替代值计算。');
      var values=collectGoals(c,form),fresh=c.core.advance(read(c),Date.now(),c.data);fresh=c.core.updateTotals(fresh,realmId,values,c.data);
      if(!readonly(c)){write(c,fresh);delete c.drafts[realmId];}else c.drafts[realmId]=values;c.state=fresh;
      var input=c.core.buildPlanningInput(fresh,realmId,Date.now(),c.data),fingerprint=JSON.stringify(input);
      c.busy=true;c.error='';showError(c,'');c.host.setAttribute('aria-busy','true');var button=c.host.querySelector('[data-realm-calculate]');if(button)button.disabled=true;renderResults(c);
      var result=await c.runner.run(input);
      if(revision!==c.revision||account!==accountId(c)||realmId!==c.realmId||!c.visible||c.mode!=='planner')return;
      var latest=c.core.advance(read(c),Date.now(),c.data);if(readonly(c))latest=c.core.updateTotals(latest,realmId,values,c.data);
      if(JSON.stringify(c.core.buildPlanningInput(latest,realmId,Date.now(),c.data))!==fingerprint){load(c);render(c);showError(c,'记录或活动时间已变化，请重新计算。');return;}
      c.result=result;c.results[realmId]={fingerprint:fingerprint,result:result};c.busy=false;c.host.setAttribute('aria-busy','false');if(button)button.disabled=false;renderResults(c);
    }catch(e){if(e.name==='AbortError')return;c.busy=false;c.host.setAttribute('aria-busy','false');var b=c.host.querySelector('[data-realm-calculate]');if(b)b.disabled=false;restoreResult(c);renderResults(c);showError(c,e);}
  }
  function attach(c){
    c.host.addEventListener('input',function(event){var input=event.target;rememberGoal(c,input);if(input.closest('[data-realm-form="calculate"]'))cancel(c);else autoSave(c,input);});
    c.host.addEventListener('change',function(event){var input=event.target;
      rememberGoal(c,input);
      if(input.hasAttribute('data-realm-enable'))commit(c,function(s){return c.core.setEnabled(s,c.realmId,c.period,input.dataset.realmEnable,input.checked,Date.now(),c.data);});
      else if(input.hasAttribute('data-realm-reward')&&input.value){var target=c.host.querySelector('input[name="target"]');target.value=input.value;rememberGoal(c,target);cancel(c);}
      else if(input.closest('[data-realm-form="calculate"]'))cancel(c);
      else autoSave(c,input);
    });
    c.host.addEventListener('click',function(event){var b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.realmId){pause(c);c.realmId=b.dataset.realmId;c.period=c.state.realms[c.realmId].currentPeriod;render(c);}
      else if(b.dataset.realmDeletePlatform&&c.root.confirm('确认删除此自定义平台？若正在使用，将切换为直充无折扣；秘境进度和代金不变。'))commit(c,function(s){return c.core.deletePlatform(s,b.dataset.realmDeletePlatform,c.data);});
      else if(b.dataset.realmMode){pause(c);c.mode=b.dataset.realmMode;render(c);}
      else if(b.dataset.realmPeriod){pause(c);c.period=Number(b.dataset.realmPeriod);render(c);}
      else if(b.dataset.realmAction==='reload'){c.drafts={};load(c);render(c);}
      else if(b.dataset.realmAction==='all'||b.dataset.realmAction==='none')commit(c,function(s){return c.core.setAll(s,c.realmId,c.period,b.dataset.realmAction==='all',Date.now(),c.data);});
      else if(b.dataset.realmAction==='following')commit(c,function(s){return c.core.applyFollowing(s,c.realmId,c.period,Date.now(),c.data);});
      else if(b.dataset.realmAction==='delete'&&c.root.confirm('确认删除当前账号中此秘境的全部信息？删除后不会自动恢复，其他账号、共用代金和平台设置不受影响。'))commit(c,function(s){return c.core.deleteRealm(s,c.realmId,Date.now(),c.data);});
    });
    c.host.addEventListener('submit',function(event){var form=event.target,kind=form.dataset.realmForm;if(!kind)return;event.preventDefault();
      if(kind==='calculate'){calculate(c,form);return;}
      if(['totals','settings','source'].indexOf(kind)!==-1)return;
      commit(c,function(s){
        if(kind==='date')return c.core.setStartDate(s,c.realmId,c.period,get(form,'startDate').value,Date.now(),c.data);
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
    var c={root:root,partition:partition,host:host,data:root.SECRET_REALM_DATA,core:root.SECRET_REALM_CORE,state:null,drafts:{},results:{},realmId:null,period:0,mode:'progress',revision:0,busy:false,result:null,error:'',visible:!partition.hidden,clock:null};
    c.runner=root.QinshiCalculationRunner.create({kind:'secret-realm',fallback:function(input){return root.SECRET_REALM_PLANNER.plan(input);}});contexts.push(c);attach(c);load(c);render(c);partition.dataset.realmInitialized='true';
    root.document.addEventListener('qinshi:partitionchange',function(event){c.visible=event.detail&&event.detail.name==='secret-realm'&&!partition.hidden;if(c.visible){load(c);render(c);}else{pause(c);if(c.clock)root.clearTimeout(c.clock);}});
    root.document.addEventListener('visibilitychange',function(){if(!root.document.hidden&&c.visible){load(c);render(c);}});
    root.addEventListener('pageshow',function(){if(c.visible){load(c);render(c);}});
    root.addEventListener('storage',function(event){if(c.visible&&(!event.key||event.key.indexOf(encodeURIComponent(KEY))!==-1)){load(c);render(c);}});
    if(root.QinshiAccounts.subscribeAccess)root.QinshiAccounts.subscribeAccess(function(access){if(c.visible&&(accountId(c)!==c.account||(access.accountId===c.account&&access.writable!==c.accessWritable))){load(c);render(c);}});
    return c;
  }
  function captureView(){var c=contexts[0];return c?{mode:c.mode,realmId:c.realmId,period:c.period}:{};}
  function restoreView(view){var c=contexts[0];if(!c)return;pause(c);load(c);if(view&&c.state.realms[view.realmId])c.realmId=view.realmId;if(view&&['progress','planner','reference'].indexOf(view.mode)!==-1)c.mode=view.mode;c.period=view&&Number(view.period)||c.state.realms[c.realmId]&&c.state.realms[c.realmId].currentPeriod||0;render(c);}
  return {STORE_KEY:KEY,init:init,captureView:captureView,restoreView:restoreView};
});
