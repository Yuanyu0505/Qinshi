(function(root,factory){
  'use strict';
  var api=factory(typeof module==='object'&&module.exports?require('./inscription-rules.js'):root.InscriptionRules);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionSimulation=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  // Immutable recipe records are checked on load/save; cache only that pure
  // rule calculation so long-lived backpacks do not rerun every old lottery.
  var recordChecks=new Map();
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function fail(s){throw new Error(s);}
  function amount(n){if(!Number.isSafeInteger(n)||n<0)fail('数量必须是非负整数');return n;}
  function valid(m){var r=R.validate(m);if(!r.valid)fail(r.errors.join('；'));return r.material;}
  function context(w){var p=w.target.slot.split('|');return {prefix:w.target.discipleKey?p[0]:R.prefixes[0],dun:w.target.discipleKey?p[1]:w.target.dun};}
  function blank(stage){return {stage:stage||'b2',inputs:[],refs:[],pending:null};}
  function empty(){return {version:1,sequence:0,revision:0,lots:[],records:[],undo:[],legacyDrafts:[]};}
  function record(w,id){var r=w.lab.records.find(function(r){return r.id===id;});if(!r)fail('合成来源记录不存在');return r;}
  function lot(w,id){var l=w.lab.lots.find(function(l){return l.id===id;});if(!l)fail('背包铭文不存在');return l;}
  function uid(w,type){if(w.lab.sequence>=Number.MAX_SAFE_INTEGER)fail('记录编号已达上限');return type+(++w.lab.sequence);}
  function inputsFor(stage){var recipe=R.recipes[stage],q=R.qualities.find(function(q){return q.id===stage;});return recipe?Array.from({length:recipe.count},function(){return Array(q.count).fill(null);}):[];}
  function reservations(w){
    var counts=new Map();if(!w.simulation.pending)w.simulation.refs.forEach(function(id){if(id)counts.set(id,(counts.get(id)||0)+1);});return counts;
  }
  function emptySlots(w){
    var s=w.simulation,recipe=R.recipes[s.stage];if(!recipe||s.pending||s.legacy)return [];
    var slots=[];for(var i=0;i<recipe.count;i++)if(!s.refs[i]&&(!s.inputs[i]||!s.inputs[i].some(Boolean)))slots.push(i);return slots;
  }
  function selectionCapacity(w){return emptySlots(w).length;}
  function reconcileSelections(w){
    var s=w.simulation;if(!s||s.pending||s.legacy||!w.lab||!Array.isArray(w.lab.lots))return;
    var pos=context(w),remaining=new Map(w.lab.lots.map(function(l){return[l.id,l.quantity];})),missing=[];
    // Reserve every still-valid batch first. Refilling a group must not steal
    // stock from another selected slot or fill an intentionally empty slot.
    s.refs.forEach(function(id,index){
      if(!id)return;var l=w.lab.lots.find(function(l){return l.id===id;});
      if(!l||l.material.prefix!==pos.prefix||l.material.dun!==pos.dun||l.material.quality!==s.stage||JSON.stringify(l.material.terms)!==JSON.stringify(s.inputs[index]))return;
      if(remaining.get(id)>0)remaining.set(id,remaining.get(id)-1);else missing.push({index:index,signature:R.signature(l.material)});
    });
    missing.forEach(function(slot){
      var replacement=w.lab.lots.find(function(l){return remaining.get(l.id)>0&&R.signature(l.material)===slot.signature;});
      if(!replacement)return;
      s.refs[slot.index]=replacement.id;s.inputs[slot.index]=copy(replacement.material.terms);
      remaining.set(replacement.id,remaining.get(replacement.id)-1);
    });
  }
  function grouped(w){
    var byId=new Map(),reserved=reservations(w);
    w.lab.lots.forEach(function(l){var id=R.signature(l.material),g=byId.get(id);if(!g){g={id:id,material:copy(l.material),quantity:0,available:0,reserved:0,lots:[]};byId.set(id,g);}
      var held=reserved.get(l.id)||0;g.quantity=amount(g.quantity+l.quantity);g.reserved+=held;g.available=amount(g.available+Math.max(0,l.quantity-held));g.lots.push(copy(l));
    });return Array.from(byId.values());
  }
  function groups(w){return grouped(w).filter(function(g){return g.quantity>0;});}
  function group(w,id){var g=grouped(w).find(function(g){return g.id===id;});if(!g)fail('背包铭文分组不存在');return g;}
  function select(w,selection){
    var s=w.simulation,pos=context(w),recipe=R.recipes[s.stage];
    if(s.pending)fail('已有结果，请先重复当前阶段或返回上一步');
    if(s.legacy)fail('旧现场含未确认来源的材料，请先确认保留旧现场');
    if(!recipe)fail('当前阶段无需合成');
    if(!Array.isArray(selection))fail('背包选择无效');
    var slots=emptySlots(w),reserved=reservations(w),allocations=[];
    selection.forEach(function(v){if(!v||typeof v.id!=='string')fail('背包选择无效');
      var n=amount(v.quantity),single=w.lab.lots.find(function(l){return l.id===v.id;}),lots=single?[single]:group(w,v.id).lots;
      var available=lots.reduce(function(sum,l){return amount(sum+Math.max(0,l.quantity-(reserved.get(l.id)||0)));},0);
      if(n>available)fail('背包材料数量不足，已占用材料不能重复选择');
      if(n>slots.length-allocations.length)fail('所选数量超过剩余空材料位');
      lots.forEach(function(l){if(!n)return;
        if(l.material.prefix!==pos.prefix||l.material.dun!==pos.dun||l.material.quality!==s.stage)fail('所选背包铭文不符合当前前缀、遁位或品质');
        var use=Math.min(n,Math.max(0,l.quantity-(reserved.get(l.id)||0)));reserved.set(l.id,(reserved.get(l.id)||0)+use);n-=use;
        for(var i=0;i<use;i++)allocations.push(l);
      });
    });
    if(!s.inputs.length)s.inputs=inputsFor(s.stage);
    allocations.forEach(function(l,i){s.inputs[slots[i]]=copy(l.material.terms);s.refs[slots[i]]=l.id;});
  }
  function additionSource(w,g,sourceRecordId){
    // Keep depleted batches eligible: replenishment reuses a known recipe,
    // without drawing a new result or reattributing existing manual stock.
    var sources=Array.from(new Set(g.lots.filter(function(l){return l.source.type==='simulation';}).map(function(l){return l.source.recordId;})));
    if(sourceRecordId!==undefined){
      if(typeof sourceRecordId!=='string'||!sources.includes(sourceRecordId))fail('所选合成来源不属于该铭文分组');
    }else{
      if(sources.length>1)fail('该铭文有多个合成来源，请先选择补充数量的来源');
      if(!sources.length)return {type:'manual'};
      sourceRecordId=sources[0];
    }
    if(R.signature(record(w,sourceRecordId).material)!==g.id)fail('合成来源与背包铭文不一致');
    return {type:'simulation',recordId:sourceRecordId};
  }
  function groupQuantity(w,id,quantity,sourceRecordId){
    var g=group(w,id),n=amount(quantity),reserved=reservations(w);
    if(n<g.reserved)fail('该铭文已被当前材料位占用，请先清空对应材料位');
    if(n===g.quantity)return;
    if(n>g.quantity)addLot(w,g.material,n-g.quantity,additionSource(w,g,sourceRecordId));
    else{
      // Spend unreserved manual additions first; never reattribute simulated lots.
      var remaining=g.quantity-n;
      g.lots.sort(function(a,b){return Number(b.source.type==='manual')-Number(a.source.type==='manual');}).forEach(function(entry){
        var l=lot(w,entry.id),take=Math.min(remaining,Math.max(0,l.quantity-(reserved.get(l.id)||0)));l.quantity-=take;remaining-=take;
      });
    }
    w.lab.revision++;
  }
  function hand(w,terms,origin){return valid(Object.assign(context(w),{quality:w.simulation.stage,origin:origin||'wash',terms:terms}));}
  function isWash(w,terms){try{hand(w,terms);return true;}catch(e){return false;}}
  function partialWash(w,terms){
    var allowed=R.termsFor(context(w).dun,w.simulation.stage,'wash'),keys=new Set(),high=0;
    terms.filter(Boolean).forEach(function(t){var key=t.attr+':'+t.tier;
      if(keys.has(key)||!allowed.some(function(a){return a.attr===t.attr&&a.tier===t.tier;}))fail('手动材料只能填写合法洗练词条，同属性同档位不能重复');
      keys.add(key);if(t.tier==='H')high++;
    });if(high>2)fail('每枚最多两条高档');
  }
  function upgrade(value){
    var w=copy(value);if(!w.lab){w.lab=empty();w.simulation.refs=[];
      var legacy=!!w.simulation.pending;
      w.simulation.inputs.forEach(function(terms){try{partialWash(w,terms);}catch(e){legacy=true;}});
      if(legacy)w.simulation.legacy=true;
    }
    if(!Array.isArray(w.simulation.refs))w.simulation.refs=[];
    if(!Array.isArray(w.lab.legacyDrafts))w.lab.legacyDrafts=[];
    if(w.lab.autoCredit===undefined)w.lab.autoCredit=true;
    reconcileSelections(w);
    return w;
  }
  function selected(w){
    var s=w.simulation,recipe=R.recipes[s.stage];if(!recipe)fail('当前品质无需后续合成');
    if(s.legacy)fail('旧现场含未确认来源的材料，请先确认保留旧现场');
    if(s.inputs.length!==recipe.count)fail('请填满本次'+recipe.count+'枚材料');
    var counts=new Map(),p=context(w);
    return s.inputs.map(function(terms,i){
      var id=s.refs[i];
      if(id){var l=lot(w,id),used=(counts.get(id)||0)+1;counts.set(id,used);
        if(used>l.quantity)fail('背包材料数量不足，请补充或重新选择');
        if(l.material.prefix!==p.prefix||l.material.dun!==p.dun||l.material.quality!==s.stage)fail('背包材料必须同前缀、同遁位、同品质');
        if(JSON.stringify(l.material.terms)!==JSON.stringify(terms))fail('背包选材与词条不一致，请重新选择');
        return {material:copy(l.material),lotId:l.id,recordId:l.source.type==='simulation'?l.source.recordId:null,source:l.source.type};
      }
      try{return {material:hand(w,terms),lotId:null,recordId:null,source:'wash'};}
      catch(e){fail('手动材料只允许合法洗练词条；合成中档请从背包选用。'+e.message);}
    });
  }
  function preview(w){
    var materials=w.simulation.pending&&w.simulation.pending.recordId?record(w,w.simulation.pending.recordId).inputs.map(function(i){return i.material;}):selected(w).map(function(i){return i.material;});
    var r=R.preview(materials);if(!r.valid)fail(r.errors.join('；'));return r;
  }
  function checkpoint(w,kind){return {kind:kind,before:copy(w.simulation),consumed:[],added:[],recordId:null,beforeRevision:w.lab.revision,revision:w.lab.revision};}
  function finish(w,f){w.lab.revision++;f.revision=w.lab.revision;w.lab.undo.push(f);}
  function addLot(w,m,n,source){var l={id:uid(w,'lot-'),material:copy(m),quantity:amount(n),source:copy(source)};w.lab.lots.push(l);return l;}
  function credit(w,f){
    var p=w.simulation.pending;if(!p||!p.recordId)fail('没有可保存的模拟产物');
    if(p.creditedLot){if(lot(w,p.creditedLot).quantity<1)fail('该产物已从背包移除，请重新备料');return p.creditedLot;}
    var l=addLot(w,p.material,1,{type:'simulation',recordId:p.recordId});p.creditedLot=l.id;f.added.push(l.id);return l.id;
  }
  function undo(w){
    var f=w.lab.undo[w.lab.undo.length-1];if(!f)fail('已经到达本轮起点，没有上一步');
    if(f.revision!==w.lab.revision)fail('背包已手动改变，无法无损撤销；请保留当前背包并重新备料');
    f.added.forEach(function(id){var l=lot(w,id);if(l.quantity!==1)fail('产物数量已改变，撤销冲突');});
    f.added.forEach(function(id){w.lab.lots=w.lab.lots.filter(function(l){return l.id!==id;});});
    f.consumed.forEach(function(c){var l=lot(w,c.id);l.quantity=amount(l.quantity+c.quantity);});
    if(f.recordId)w.lab.records=w.lab.records.filter(function(r){return r.id!==f.recordId;});
    w.simulation=copy(f.before);w.lab.undo.pop();w.lab.revision++;
    if(w.lab.undo.length&&w.lab.undo[w.lab.undo.length-1].revision===f.beforeRevision)w.lab.undo[w.lab.undo.length-1].revision=w.lab.revision;
  }
  function roll(w,payload,attempt,priorSignature,frame){
    if(w.simulation.pending)fail('请先处理当前结果');
    var inputs=selected(w),r=R.preview(inputs.map(function(i){return i.material;}));if(!r.valid)fail(r.errors.join('；'));
    var o=payload.observed?r.outcomes.find(function(o){return R.signature(o.material)===R.signature(payload.observed);}):R.sample(r.outcomes,payload.random);
    if(!o)fail('旧结果与原投料不一致，已保留旧现场');
    var f=frame||checkpoint(w,'roll'),counts=new Map();inputs.forEach(function(i){if(i.lotId)counts.set(i.lotId,(counts.get(i.lotId)||0)+1);});
    counts.forEach(function(n,id){lot(w,id).quantity-=n;f.consumed.push({id:id,quantity:n});});
    var rId=uid(w,'record-'),rec={id:rId,material:copy(o.material),probability:o.probability,promotion:r.promotion||null,inputs:copy(inputs)};
    w.lab.records.push(rec);f.recordId=rId;
    w.simulation.pending={id:uid(w,'result-'),recordId:rId,material:copy(o.material),probability:o.probability,attempt:attempt||1,same:!!priorSignature&&priorSignature===R.signature(o.material),creditedLot:null};
    if(payload.autoCredit)credit(w,f);
    finish(w,f);
  }
  function prepare(w,clear){
    var s=w.simulation;if(s.legacy)fail('请先确认保留旧现场');
    if(s.pending){var f=checkpoint(w,'prepare');if(w.lab.autoCredit&&!s.pending.creditedLot)credit(w,f);s.pending=null;finish(w,f);}
    if(clear){s.inputs=inputsFor(s.stage);s.refs=[];}
    reconcileSelections(w);
  }
  function cancelScene(w,stage){
    // Accepted outputs are never lost when a user starts a different scene.
    if(w.simulation.pending){if(w.simulation.legacy)fail('请先确认保留旧现场');var f=checkpoint(w,'close');if(!w.simulation.pending.creditedLot)credit(w,f);finish(w,f);}
    w.simulation=blank(stage);w.lab.undo=[];
  }
  function act(value,action,payload){
    var w=upgrade(value),s=w.simulation,p=payload||{};
    if(action==='roll')roll(w,p);
    else if(action==='simulate')roll(w,Object.assign({},p,{autoCredit:w.lab.autoCredit}));
    else if(action==='auto-credit'){
      if(typeof p.enabled!=='boolean')fail('自动入包设置无效');w.lab.autoCredit=p.enabled;
    }else if(action==='prepare')prepare(w,!!p.clear);
    else if(action==='repeat-simulate'){
      if(!s.pending||!s.pending.recordId)fail('请先模拟合成');
      if(s.legacy)fail('请先确认保留旧现场');
      var repeated=checkpoint(w,'roll');
      if(w.lab.autoCredit&&!s.pending.creditedLot)credit(w,repeated);
      s.pending=null;reconcileSelections(w);
      roll(w,Object.assign({},p,{autoCredit:w.lab.autoCredit}),1,null,repeated);
    }
    else if(action==='retry'){
      if(!s.pending||!s.pending.recordId)fail('没有可重新模拟的结果');
      var old=copy(s.pending),last=w.lab.undo[w.lab.undo.length-1];
      if(!last||last.kind!=='roll'||last.recordId!==old.recordId)fail('该结果已用于后续步骤，请先返回上一步');
      undo(w);
      var replay=checkpoint(w,'roll');
      // A repeated synthesis is one undoable transaction whose before-state
      // may contain the previous batch's result. Preserve that accepted batch
      // while replacing only the most recent random draw.
      if(w.simulation.pending){
        if(!w.simulation.pending.creditedLot&&last.added.some(function(id){return id!==old.creditedLot;}))credit(w,replay);
        w.simulation.pending=null;
      }
      reconcileSelections(w);
      roll(w,Object.assign({},p,{autoCredit:w.lab.autoCredit||!!old.creditedLot}),old.attempt+1,R.signature(old.material),replay);
    }else if(action==='credit'){
      if(s.pending&&s.pending.creditedLot)return w;
      var frame=w.lab.undo[w.lab.undo.length-1];if(!frame||frame.kind!=='roll'||!s.pending||frame.recordId!==s.pending.recordId)fail('当前结果无法入包');
      if(frame.revision!==w.lab.revision)fail('背包已改变，请先重新备料');credit(w,frame);frame.revision=++w.lab.revision;
    }else if(action==='next'||action==='repeat'){
      if(!s.pending||!s.pending.recordId)fail('请先模拟合成');
      var target=R.qualities.findIndex(function(q){return q.id===w.target.quality;}),out=R.qualities.findIndex(function(q){return q.id===s.pending.material.quality;});
      if(action==='next'&&out>=target)fail('已经达到目标品质');
      var nf=checkpoint(w,action),id=action==='next'||!s.pending.creditedLot?credit(w,nf):s.pending.creditedLot,result=copy(s.pending.material);
      if(action==='next'){w.simulation=blank(result.quality);w.simulation.inputs=inputsFor(result.quality);w.simulation.inputs[0]=result.terms;w.simulation.refs[0]=id;}
      else s.pending=null;
      finish(w,nf);
    }else if(action==='back')undo(w);
    else if(action==='reset')cancelScene(w,p.stage||'b2');
    else if(action==='clear-inputs'){
      if(s.pending)fail('已有合成结果，请先处理结果或返回上一步');
      if(s.legacy)fail('请先确认保留旧现场');
      s.inputs=inputsFor(s.stage);s.refs=[];
    }
    else if(action==='edit'||action==='edit-material'){
      if(action==='edit-material')prepare(w,false);
      if(s.pending)fail('已有合成结果，请先重复当前阶段或返回上一步');
      if(!s.inputs.length)s.inputs=inputsFor(s.stage);
      if(!Number.isInteger(p.index)||p.index<0||p.index>=s.inputs.length)fail('材料位置无效');
      partialWash(w,p.terms);s.refs[p.index]=null;s.inputs[p.index]=copy(p.terms);if(p.terms.every(Boolean))hand(w,p.terms);
    }else if(action==='select'){
      select(w,p.selection);
    }else if(action==='group-quantity'||action==='group-remove'){
      groupQuantity(w,p.id,action==='group-remove'?0:p.quantity,p.sourceRecordId);
    }else if(action==='quantity'){
      var l=lot(w,p.id),n=amount(p.quantity),reserved=s.pending?0:s.refs.filter(function(id){return id===l.id;}).length;
      if(n<reserved)fail('该铭文已被当前材料位占用，请先清空对应材料位');
      if(n>l.quantity)addLot(w,l.material,n-l.quantity,additionSource(w,group(w,R.signature(l.material)),p.sourceRecordId));else l.quantity=n;
      w.lab.revision++;
    }else if(action==='clear-bag'){
      w.lab.lots.forEach(function(l){l.quantity=0;});
      if(!s.pending){s.refs.forEach(function(id,i){if(id)s.inputs[i]=Array(s.inputs[i].length).fill(null);});s.refs=[];}
      w.lab.revision++;
    }else if(action==='adopt-legacy'){
      if(!s.legacy)return w;
      w.lab.legacyDrafts.push({target:copy(w.target),simulation:copy(s)});
      var previous=copy(s.pending);s.pending=null;s.refs=[];s.legacy=false;
      s.inputs.forEach(function(terms,i){if(terms.length&&terms.every(Boolean)&&!isWash(w,terms)){
        var m=hand(w,terms,'crafted'),l=addLot(w,m,1,{type:'manual'});s.refs[i]=l.id;
      }else if(!terms.every(Boolean)){try{partialWash(w,terms);}catch(e){s.inputs[i]=Array(terms.length).fill(null);}}});
      w.lab.revision++;w.lab.undo=[];
      if(previous)roll(w,{observed:previous.material});
    }else fail('未知模拟操作');
    reconcileSelections(w);validate(w);return w;
  }
  function validate(w){
    var b=w.lab;if(!b||b.version!==1||!Array.isArray(b.lots)||!Array.isArray(b.records)||!Array.isArray(b.undo))fail('虚拟背包格式无效');
    amount(b.sequence);amount(b.revision);
    if(b.autoCredit!==undefined&&typeof b.autoCredit!=='boolean')fail('自动入包设置无效');
    var ids=new Set(),records=new Map();
    b.records.forEach(function(r){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||!Array.isArray(r.inputs)||!Number.isFinite(r.probability)||r.probability<=0||r.probability>1)fail('合成记录格式无效');
      ids.add(r.id);valid(r.material);if(r.material.origin!=='crafted')fail('模拟产物必须来自合成');
      r.inputs.forEach(function(i){valid(i.material);if(!['wash','manual','simulation'].includes(i.source))fail('材料来源类型无效');
        if(i.source==='wash'&&i.material.origin!=='wash'||i.source==='simulation'&&!i.recordId)fail('材料来源与词条不一致');
        if(i.recordId){var source=records.get(i.recordId);if(!source||i.source!=='simulation'||R.signature(source.material)!==R.signature(i.material))fail('合成来源链无效');}});
      var key=JSON.stringify([r.material,r.inputs.map(function(i){return i.material;}),r.probability,r.promotion]);
      if(!recordChecks.has(key)){
        var match=R.preview(r.inputs.map(function(i){return i.material;}));if(!match.valid||match.promotion!==r.promotion||!match.outcomes.some(function(o){return R.signature(o.material)===R.signature(r.material)&&o.probability===r.probability;}))fail('历史合成记录不符合配方');
        if(recordChecks.size>=256)recordChecks.delete(recordChecks.keys().next().value);recordChecks.set(key,true);
      }
      records.set(r.id,r);
    });
    b.lots.forEach(function(l){if(!l||typeof l.id!=='string'||ids.has(l.id)||!l.source||!['manual','simulation'].includes(l.source.type))fail('背包批次格式无效');ids.add(l.id);amount(l.quantity);valid(l.material);
      if(l.source.type==='simulation'){var r=records.get(l.source.recordId);if(!r||R.signature(r.material)!==R.signature(l.material))fail('背包来源无效');}
    });
    if(!Array.isArray(w.simulation.refs)||w.simulation.refs.length>w.simulation.inputs.length)fail('背包选材格式无效');
    w.simulation.refs.forEach(function(id){if(id)lot(w,id);});
    if(!w.simulation.legacy&&!w.simulation.pending)w.simulation.inputs.forEach(function(terms,i){if(!w.simulation.refs[i])partialWash(w,terms);});
    b.undo.forEach(function(f){if(!f||!f.before||!Array.isArray(f.consumed)||!Array.isArray(f.added)||!Number.isSafeInteger(f.revision))fail('撤销记录格式无效');});
    if(!Array.isArray(b.legacyDrafts)||b.legacyDrafts.some(function(scene){return !scene||!scene.target||!scene.simulation||!Array.isArray(scene.simulation.inputs)||!R.qualities.some(function(q){return q.id===scene.simulation.stage;});}))fail('旧现场归档格式无效');
    var p=w.simulation.pending;if(p&&!w.simulation.legacy){var rec=record(w,p.recordId);if(R.signature(rec.material)!==R.signature(p.material)||p.probability!==rec.probability)fail('模拟结果与记录不一致');if(p.creditedLot){var l=lot(w,p.creditedLot);if(l.source.recordId!==p.recordId)fail('入包结果不一致');}}
    return w;
  }
  function route(w,id){
    var records=new Map(w.lab.records.map(function(r){return[r.id,r];}));
    function build(rec){return {kind:'craft',sourceKey:rec.id,material:copy(rec.material),probability:rec.probability,promotion:rec.promotion,
      outcomes:[{material:copy(rec.material),probability:rec.probability}],children:rec.inputs.map(function(i,index){return {quantity:1,node:i.recordId?build(records.get(i.recordId)):{kind:'base',sourceKey:rec.id+'-input-'+index,material:copy(i.material),sourceLabel:i.source==='wash'?'洗练备料':'手动补充',children:[]}};})};}
    var rec=records.get(id);if(!rec)fail('没有这枚产物的完整记录');
    return {kind:'recorded',recorded:true,symbolicX:false,xTerm:null,tree:build(rec),reuse:[],notes:['仅展示本枚产物实际使用的材料链；手动补充从当前品质起算。概率为抽取当时的模型概率，不代表路线完成率。']};
  }
  return {upgrade:upgrade,validate:validate,preview:preview,act:act,route:route,inputsFor:inputsFor,groups:groups,selectionCapacity:selectionCapacity};
});
