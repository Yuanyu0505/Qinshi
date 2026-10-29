(function (root, factory) {
  'use strict';
  var api=factory(typeof module==='object'&&module.exports?require('./inscription-rules.js'):root.InscriptionRules);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionRouteFavorites=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  var KEY='qinshi_inscription_route_favorites_v1', RULES_VERSION='observable-equal-speed17-optional-x-v2', sequence=0;
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
  function fail(message){throw new Error(message);}
  function account(storage){var value=storage.currentAccount();return value?value.id:null;}
  function cleanAttrs(attrs){
    if(!Array.isArray(attrs)||!attrs.length||attrs.some(function(attr){return typeof attr!=='string'||!R.attributes.some(function(a){return a.id===attr;});}))fail('目标属性无效');
    return attrs.slice().sort();
  }
  function ownerFor(target){
    if(!object(target))fail('收藏目标无效');
    var bound=typeof target.discipleKey==='string'&&!!target.discipleKey, slot=bound?String(target.slot||'').split('|'):[];
    return {discipleKey:bound?target.discipleKey:'',tian:bound?slot[0]:'',dun:R.normalizeDun(bound?slot[1]:target.dun),quality:target.quality,attrs:cleanAttrs(target.attrs)};
  }
  function termKey(term){return term.attr+':'+term.tier;}
  function xConfig(route,xAttr){
    var legacy=route.xTerm===undefined&&route.symbolicX===undefined,term=route.xTerm===undefined?(xAttr?{attr:xAttr,tier:'U'}:null):route.xTerm;
    if(!legacy&&(typeof route.symbolicX!=='boolean'||!object(route.xTerm)&&!(route.xTerm===null&&route.symbolicX===false)))fail('杂词条 X 配置无效');
    if(term&&(!object(term)||!R.attributes.some(function(attr){return attr.id===term.attr;})||!['U','H','M','L'].includes(term.tier)))fail('杂词条 X 属性或档位无效');
    var symbolic=legacy?!!term:route.symbolicX;
    if(symbolic&&(!term||term.tier!=='U'||!R.attributes.some(function(attr){return attr.id===term.attr&&attr.group==='common';})))fail('符号杂词条 X 必须使用合法不分档词条模板');
    return {xTerm:term?{attr:term.attr,tier:term.tier}:null,symbolicX:symbolic,legacy:legacy};
  }
  function recipeKey(material,children){
    var inputs=[];children.forEach(function(child){for(var i=0;i<child.quantity;i++)inputs.push(R.signature(child.node.material));});
    return JSON.stringify([R.signature(material),inputs.sort()]);
  }
  function compactNode(node,budget,depth){
    if(!object(node)||++budget.count>2000||depth>20||!['base','wash','craft','failure'].includes(node.kind)||!Array.isArray(node.children))fail('路线节点结构无效');
    var checked=R.validate(node.material);
    if(!checked.valid)fail(checked.errors.join('；'));
    var children=node.children.map(function(child){
      if(!object(child)||!Number.isSafeInteger(child.quantity)||child.quantity<1||child.quantity>3)fail('路线材料份数无效');
      return {quantity:child.quantity,node:compactNode(child.node,budget,depth+1)};
    });
    children.sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});
    var result={kind:node.kind,material:checked.material,promotion:node.promotion==null?null:node.promotion,children:children};
    ['xSource','coverageReuse'].forEach(function(key){if(node[key]!==undefined){if(typeof node[key]!=='boolean')fail('路线来源标记无效');result[key]=node[key];}});
    if(node.sourceKey!==undefined){if(typeof node.sourceKey!=='string'||!node.sourceKey||node.sourceKey.length>20000)fail('失败产物生产标识无效');result.sourceKey=node.sourceKey;}
    return result;
  }
  function compactRoute(route){
    if(!object(route)||!Array.isArray(route.reuse)||!['deterministic','probability'].includes(route.kind))fail('完整路线结构无效');
    var budget={count:0};
    var result={kind:route.kind,tree:compactNode(route.tree,budget,0),reuse:route.reuse.map(function(node){return compactNode(node,budget,0);})};
    if(route.xTerm!==undefined||route.symbolicX!==undefined){var config=xConfig(route,'');result.xTerm=config.xTerm;result.symbolicX=config.symbolicX;}
    return result;
  }
  function identity(record){
    var owner=record.owner;
    if(!object(owner))fail('收藏归属无效');
    var route=compactRoute(record.route);
    var config=xConfig(route,record.xAttr);
    return JSON.stringify([owner.discipleKey,owner.tian,owner.dun,owner.quality,cleanAttrs(owner.attrs),config.xTerm,config.symbolicX,route.tree,route.reuse]);
  }
  function prepare(route,target,xAttr){
    var compact=compactRoute(route),config=xConfig(route,xAttr);
    // Legacy records are inspected in place, but new saves carry the explicit
    // A/B choice so a later query cannot silently replace their meaning.
    if(!config.legacy){compact.xTerm=config.xTerm;compact.symbolicX=config.symbolicX;}
    return {owner:ownerFor(target),xAttr:config.xTerm?config.xTerm.attr:'',route:compact};
  }
  function hydrate(record,items){
    var owner=record.owner;
    if(!object(owner)||typeof owner.discipleKey!=='string'||typeof owner.tian!=='string'||!R.duns.some(function(d){return d.id===owner.dun;})||!R.qualities.some(function(q){return q.id===owner.quality;}))fail('收藏归属或目标品质无效');
    var attrs=cleanAttrs(owner.attrs),compact=compactRoute(record.route),target=compact.tree.material;
    if(owner.discipleKey){
      if(!R.prefixes.includes(owner.tian)||owner.tian!==target.prefix)fail('弟子天位与路线前缀不一致');
      if(Array.isArray(items)){
        var disciple=items.find(function(item){return item.quality+'\0'+item.name===owner.discipleKey;});
        if(!disciple||!disciple.slots.some(function(slot){return slot.tian===owner.tian&&R.normalizeDun(slot.shield)===owner.dun;}))fail('弟子或其天遁位已不再存在');
      }
    }else if(owner.tian!=='')fail('通用路线不能绑定弟子天位');
    if(target.dun!==owner.dun||target.quality!==owner.quality||JSON.stringify(target.terms.map(function(t){return t.attr;}).sort())!==JSON.stringify(attrs))fail('路线产物与收藏目标不一致');
    var config=xConfig(compact,record.xAttr),xTerm=config.xTerm,xIsTarget=!!xTerm&&target.terms.some(function(term){return termKey(term)===termKey(xTerm);});
    // All three common terms may already be targets. The symbolic template is
    // then an unused placeholder, not a fourth material term or an X source.
    if(xTerm&&(!config.symbolicX&&xIsTarget||!R.qualities.some(function(q){return R.termsFor(owner.dun,q.id).some(function(term){return termKey(term)===termKey(xTerm);});})))fail('杂词条 X 与目标词条冲突或不支持此遁位');
    if(record.xAttr&&(!xTerm||record.xAttr!==xTerm.attr))fail('杂词条 X 标记与具体词条不一致');
    var failures=new Map();
    function node(value,allowFailure,collect){
      var m=value.material,children=value.children.map(function(child){return {quantity:child.quantity,node:node(child.node,allowFailure,collect)};});
      if(m.prefix!==target.prefix||m.dun!==target.dun)fail('整条路线必须同前缀、同遁位');
      var result={kind:value.kind,material:copy(m),children:children,promotion:value.promotion,probability:null,hasChance:children.some(function(child){return child.node.hasChance;})};
      if(value.xSource!==undefined)result.xSource=value.xSource;
      if(value.coverageReuse!==undefined)result.coverageReuse=value.coverageReuse;
      if(value.xSource===true&&(!config.symbolicX||!xTerm||xIsTarget||!['base','wash'].includes(value.kind)||!m.terms.some(function(term){return termKey(term)===termKey(xTerm);})))fail('杂词条 X 来源标记必须属于提供同一个额外 X 的起始或洗练材料，不能把目标项标成 X');
      if(config.legacy&&config.symbolicX&&xTerm&&!xIsTarget&&value.xSource===undefined&&['base','wash'].includes(value.kind)&&m.terms.some(function(term){return termKey(term)===termKey(xTerm);}))result.xSource=true;
      if(value.kind==='base'){
        if(m.quality!=='b2'||children.length||value.promotion!==null)fail('起始材料必须为蓝二');
      }else if(value.kind==='failure'){
        var producers=failures.get(R.signature(m)),source=value.sourceKey;
        if(!allowFailure||children.length||value.promotion!==null||!producers||source&&!producers.has(source)||!source&&producers.size!==1)fail('复用材料不属于这条路线的具体失败产物，或生产步骤关联不明确');
        result.sourceKey=source||Array.from(producers)[0];
      }else if(value.kind==='wash'){
        if(m.origin!=='wash'||value.promotion!==null||children.length)fail('置换准备必须从当前品质独立开始，不包含隐藏制作支线');
        result.note='另行置换合成素材铭文；置换概率未知，不计入合成成功率。';
      }else{
        var inputs=[];
        children.forEach(function(child){for(var i=0;i<child.quantity;i++)inputs.push(child.node.material);});
        var preview=R.preview(inputs);
        if(!preview.valid)fail(preview.errors.join('；'));
        if(preview.promotion!==value.promotion||preview.quality!==m.quality)fail('合成配方或晋升材料已变化');
        var wanted=R.signature(m),output=preview.outcomes.find(function(outcome){return R.signature(outcome.material)===wanted;});
        if(!output)fail('保存的材料组合已无法得到该目标产物');
        var sourceKey=recipeKey(m,children);
        if(value.sourceKey!==undefined&&value.sourceKey!==sourceKey)fail('合成生产步骤标识与保存的配方不一致');
        result.sourceKey=sourceKey;
        result.outcomes=preview.outcomes;result.probability=output.probability;result.hasChance=result.hasChance||output.probability<1;
        if(collect)preview.outcomes.forEach(function(outcome){var sig=R.signature(outcome.material);if(sig!==wanted){if(!failures.has(sig))failures.set(sig,new Set());failures.get(sig).add(sourceKey);}});
      }
      return result;
    }
    var tree=node(compact.tree,false,true),reuse=compact.reuse.map(function(value){
      if(value.kind!=='craft'||R.signature(value.material)!==R.signature(target)||value.children.some(function(child){return child.node.kind!=='failure';}))fail('失败品复用分支结构无效');
      var result=node(value,true,false);result.note='需备齐三枚合法同品质失败材料，同种可重复；去重候选池必须覆盖全部目标词条，概率以材料备齐为前提。';return result;
    });
    return {kind:tree.hasChance?'probability':'deterministic',tree:tree,reuse:reuse,xTerm:xTerm,symbolicX:config.symbolicX};
  }
  function inspectRecord(record,items){
    try{
      if(!object(record)||typeof record.rulesVersion!=='string'||typeof record.createdAt!=='string'||!record.createdAt||typeof record.updatedAt!=='string'||!record.updatedAt)fail('收藏版本或时间信息无效');
      return {record:copy(record),valid:true,errors:[],route:hydrate(record,items),rulesUpdated:record.rulesVersion!==RULES_VERSION};
    }catch(error){return {record:copy(record),valid:false,errors:[error.message],route:null,rulesUpdated:false};}
  }
  function match(entries,route,target,xAttr){
    var wanted=identity(prepare(route,target,xAttr));
    return entries.find(function(entry){try{return identity(entry)===wanted;}catch(error){return false;}})||null;
  }
  function createStore(storage,options){
    options=options||{};
    if(!storage||typeof storage.currentAccount!=='function'||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')fail('账号收藏存储不可用');
    var locks=options.locks||(typeof navigator!=='undefined'&&navigator.locks), now=options.now||function(){return new Date().toISOString();};
    function empty(id){return {schemaVersion:1,accountId:id,revision:0,updatedAt:'',entries:[]};}
    function decode(raw,id){
      if(raw==null)return empty(id);
      var saved=JSON.parse(raw),ids=new Set();
      if(!object(saved)||saved.schemaVersion!==1||saved.accountId!==id||!Number.isSafeInteger(saved.revision)||saved.revision<0||!Array.isArray(saved.entries)||saved.entries.length>1000)fail('收藏存档结构、账号归属或版本不支持');
      saved.entries.forEach(function(entry){
        if(!object(entry)||typeof entry.id!=='string'||!entry.id||ids.has(entry.id))fail('收藏标识无效或重复');
        ids.add(entry.id);
      });
      return saved;
    }
    function inspect(){
      var raw=null,id;
      try{
        id=account(storage);raw=storage.getItem(KEY);var saved=decode(raw,id);
        return {valid:true,errors:[],accountId:id,token:raw,state:copy(saved),entries:saved.entries.map(function(entry){return inspectRecord(entry,options.items);}),readOnly:typeof storage.isReadOnly==='function'&&storage.isReadOnly()};
      }catch(error){return {valid:false,errors:[error.message],accountId:id,token:raw,state:null,entries:[],readOnly:true};}
    }
    function change(expected,id,edit){
      function commit(){
        if(!id||account(storage)!==id)fail('账号已切换，请重新打开收藏分区后操作');
        if(typeof storage.isReadOnly==='function'&&storage.isReadOnly())fail('该账号正在其他标签页编辑，当前页面为只读模式');
        var before=storage.getItem(KEY);
        if(before!==expected)fail('收藏已在其他页面更新，本次未覆盖；请刷新收藏后重试');
        var saved=decode(before,id);edit(saved);
        if(saved.revision===Number.MAX_SAFE_INTEGER)fail('收藏修订号已达上限');
        saved.revision++;saved.updatedAt=now();
        var serialized=JSON.stringify(saved);
        if(account(storage)!==id||storage.getItem(KEY)!==before)fail('账号或收藏在保存前发生变化，本次未覆盖');
        if(storage.setItem(KEY,serialized)===false)fail('账号为只读或存储拒绝写入，收藏未保存');
        if(account(storage)!==id||storage.getItem(KEY)!==serialized)fail('收藏保存期间发生并发变化，请刷新后确认；未将本次操作标记为成功');
        var result=inspect();
        if(!result.valid||result.accountId!==id||result.token!==serialized)fail('收藏保存后读取到不同数据，请刷新后确认；未将本次操作标记为成功');
        return result;
      }
      // Web Locks serializes same-account writes across tabs; the account's
      // existing edit lease and raw token checks remain the fallback guard.
      return Promise.resolve().then(function(){return locks&&typeof locks.request==='function'?locks.request(KEY+':'+id,{mode:'exclusive'},commit):commit();});
    }
    return {inspect:inspect,toggle:function(route,target,xAttr,expected,id){
      var candidate=prepare(route,target,xAttr);hydrate(candidate,options.items);
      return change(expected,id,function(saved){
        var found=match(saved.entries.filter(function(entry){return inspectRecord(entry,options.items).valid;}),route,target,xAttr);
        if(found){saved.entries=saved.entries.filter(function(entry){return entry.id!==found.id;});return;}
        if(saved.entries.length>=1000)fail('收藏数量已达1000条，请先取消不再需要的收藏');
        var stamp=now(),seed=options.uuid?options.uuid():(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+(++sequence)+'-'+Math.random().toString(36).slice(2));
        if(typeof seed!=='string'||!seed||saved.entries.some(function(entry){return entry.id===seed;}))fail('无法生成唯一收藏标识');
        saved.entries.push(Object.assign(candidate,{id:seed,createdAt:stamp,updatedAt:stamp,rulesVersion:RULES_VERSION}));
      });
    },remove:function(id,expected,accountId){return change(expected,accountId,function(saved){
      if(!saved.entries.some(function(entry){return entry.id===id;}))fail('该收藏已不存在，请刷新后重试');
      saved.entries=saved.entries.filter(function(entry){return entry.id!==id;});
    });}};
  }
  return {KEY:KEY,RULES_VERSION:RULES_VERSION,createStore:createStore,prepare:prepare,rehydrate:hydrate,inspectRecord:inspectRecord,match:match};
});

(function(root){
  'use strict';
  if(!root||!root.InscriptionRouteFavorites)return;
  var API=root.InscriptionRouteFavorites,view=null,store=null,snapshot=null,activeAccount=null,request=0,busy=false;
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function field(name){return view.querySelector('[data-favorite-field="'+name+'"]');}
  function host(name){return view.querySelector('[data-favorite-'+name+']');}
  function status(text){host('status').textContent=text;host('status').hidden=!text;}
  function options(list,value,label){return '<option value="">'+esc(label)+'</option>'+list.map(function(item){var id=typeof item==='string'?item:item.id;return '<option value="'+esc(id)+'"'+(id===value?' selected':'')+'>'+esc(typeof item==='string'?item:item.label)+'</option>';}).join('');}
  function blank(){return {search:'',quality:'',tian:'',dun:'',attrs:['','','']};}
  function filters(){return {search:field('search').value,quality:field('quality').value,tian:field('tian').value,dun:field('dun').value,attrs:[0,1,2].map(function(i){return field('attr'+i).value;})};}
  function renderFilters(value){
    var R=root.InscriptionRules;field('search').value=value.search;
    field('quality').innerHTML=options(R.qualities,value.quality,'全部品质');
    field('tian').innerHTML=options(R.prefixes,value.tian,'全部天位（含通用）');
    field('dun').innerHTML=options(R.duns.map(function(d){return d.id;}),value.dun,'全部遁位');
    var attrs=R.attributes.filter(function(attr){return !value.dun||R.termsFor(value.dun,value.quality||'o2').some(function(term){return term.attr===attr.id;});}).map(function(attr){return attr.id;});
    [0,1,2].forEach(function(i){field('attr'+i).innerHTML=options(attrs,value.attrs[i],'不限属性');});
  }
  function disciple(owner){return owner&&root.INSCRIPTION_DATA.items.find(function(item){return item.quality+'\0'+item.name===owner.discipleKey;});}
  function label(owner){var item=disciple(owner);return owner&&owner.discipleKey?(item?item.name:String(owner.discipleKey).split('\0').pop())+' · '+(owner.tian||'未知天位')+' · '+(owner.dun||'未知遁位'):'通用遁位路线 · '+(owner&&owner.dun||'未知遁位')+'（未绑定弟子、天位）';}
  function qualityLabel(id){var q=root.InscriptionRules.qualities.find(function(value){return value.id===id;});return q?q.label:'未知品质';}
  function matches(record,value){
    var owner=record.owner||{},item=disciple(owner),query=value.search.trim().replace(/[·\s]/g,'').toLowerCase();
    if(query&&(!owner.discipleKey||!(item?item.name:String(owner.discipleKey).split('\0').pop()).replace(/[·\s]/g,'').toLowerCase().includes(query)))return false;
    if(value.quality&&owner.quality!==value.quality||value.tian&&(!owner.discipleKey||owner.tian!==value.tian)||value.dun&&owner.dun!==value.dun)return false;
    var available=Array.isArray(owner.attrs)?owner.attrs.slice():[];
    return value.attrs.filter(Boolean).every(function(attr){var index=available.indexOf(attr);if(index<0)return false;available.splice(index,1);return true;});
  }
  function fill(details,entry){
    if(details.dataset.rendered==='true')return;details.dataset.rendered='true';
    var body=details.querySelector('.craft-strategy-body');
    body.renderFlow=function(show){
      var old=body.querySelector('[data-flow-viewer]'),zoom=old?Number(old.dataset.zoom):0.9,owner=entry.record.owner;
      body.innerHTML=(entry.rulesUpdated?'<p class="craft-note">规则版本已更新，已按当前规则重新校验原结构并重算各步骤概率。</p>':'')+root.InscriptionFlowchart.render(entry.route,entry.record.xAttr,{showFailures:show,positionLabel:owner.discipleKey?owner.tian+' · '+owner.dun:owner.dun});
      body.dataset.failures=show?'open':'closed';
      var viewer=body.querySelector('[data-flow-viewer]'),drawing=viewer&&viewer.querySelector('svg');
      if(viewer&&root.InscriptionFlowchart.bind)root.InscriptionFlowchart.bind(viewer);
      if(viewer&&drawing){viewer.dataset.zoom=String(zoom);drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*zoom)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*zoom)+'px';var reset=viewer.querySelector('[data-craft-action="diagram-reset"]');if(reset)reset.textContent=Math.round(zoom*100)+'%';}
    };body.renderFlow(false);
  }
  function renderResults(){
    var target=host('results');target.innerHTML='';
    if(!snapshot||!snapshot.valid)return;
    var value=filters(),entries=snapshot.entries.filter(function(entry){return matches(entry.record,value);});
    host('count').textContent='显示 '+entries.length+' / '+snapshot.entries.length+' 条收藏；属性筛选无顺序，但保留重复次数。';
    if(!entries.length){target.innerHTML='<p class="craft-note">没有符合筛选的收藏。可在合成路径查询中点击每条完整路线旁的星标收藏。</p>';return;}
    entries.slice().sort(function(a,b){return String(b.record.createdAt).localeCompare(String(a.record.createdAt));}).forEach(function(entry){
      var record=entry.record,details=document.createElement('details');details.className='craft-strategy craft-favorite-route'+(entry.valid?'':' craft-favorite-invalid');
      details.innerHTML='<summary class="craft-route-summary"><span>'+esc(label(record.owner))+' · '+esc(qualityLabel(record.owner&&record.owner.quality))+'<small>'+esc((record.owner&&Array.isArray(record.owner.attrs)?record.owner.attrs:[]).join(' ＋ '))+(entry.valid?' · '+(entry.route.kind==='deterministic'?'必中合成方案':'概率合成方案'):' · 已失效')+'</small></span><button type="button" class="craft-favorite-star is-favorite" data-favorite-remove="'+esc(record.id)+'" aria-label="取消收藏此完整路线" title="取消收藏"'+(snapshot.readOnly||busy?' disabled':'')+'>★</button></summary>'+
        (entry.valid?'<div class="craft-strategy-body">'+(entry.rulesUpdated?'<p class="craft-note">规则版本已更新，已按当前规则重新校验原结构并重算各步骤概率。</p>':'')+'</div>':'<div class="craft-favorite-warning" role="alert">这条收藏已失效，原始路线仍保留，不会自动换成其他方案：'+esc(entry.errors.join('；'))+'。请重新查询，或取消这条收藏。</div>');
      if(entry.valid)details.addEventListener('toggle',function(){if(details.open)fill(details,entry);});
      target.appendChild(details);
    });
  }
  function changed(){root.dispatchEvent(new CustomEvent('inscription-route-favorites-change'));}
  function init(){
    view=document.getElementById('inscription-crafting-favorites');if(!view)return false;
    view.innerHTML='<div class="craft-status" data-favorite-status role="alert" hidden></div><section class="craft-panel"><h3>收藏合成路径</h3><p class="craft-note">按当前游戏账号独立保存。这里的筛选不会修改查询目标或模拟现场；通用路线不绑定任何弟子、天位。</p><div class="craft-controls craft-favorites-filters"><label class="craft-search">弟子搜索<input type="search" data-favorite-field="search" autocomplete="off" placeholder="输入弟子姓名"></label><label>目标品质<select data-favorite-field="quality"></select></label><label>天位<select data-favorite-field="tian"></select></label><label>遁位<select data-favorite-field="dun"></select></label></div><div class="craft-attrs" style="--craft-slots:3">'+[0,1,2].map(function(i){return '<label>属性'+(i+1)+'<select data-favorite-field="attr'+i+'"></select></label>';}).join('')+'</div><div class="craft-actions"><button type="button" class="seg" data-favorite-clear>清除收藏筛选</button><button type="button" class="seg" data-favorite-refresh>刷新收藏</button></div><p class="craft-note" data-favorite-count></p><p class="craft-note">通用遁位路线：全部材料必须为同一个前缀、同一个遁位。未指定具体 X 的收藏使用同一种合法不分档词条作为符号模板，概率仅对该模板条件成立；已指定的收藏固定属性与档位，不会自动换成其他 X。</p></section><div data-favorite-results></div>';
    view.addEventListener('input',function(event){if(event.target===field('search'))renderResults();});
    view.addEventListener('change',function(event){if(event.target.matches('[data-favorite-field]')){var value=filters();if(event.target===field('dun')||event.target===field('quality'))renderFilters(value);renderResults();}});
    view.addEventListener('click',function(event){
      var remove=event.target.closest('[data-favorite-remove]');
      if(remove){
        event.preventDefault();event.stopPropagation();if(!snapshot||!snapshot.valid||busy)return;busy=true;view.querySelectorAll('[data-favorite-remove]').forEach(function(button){button.disabled=true;});
        var account=activeAccount,operation=++request;
        store.remove(remove.dataset.favoriteRemove,snapshot.token,account).then(function(result){
          if(account!==activeAccount||operation!==request)return;busy=false;snapshot=result;status('');renderResults();changed();
        }).catch(function(error){if(account!==activeAccount||operation!==request)return;busy=false;status(error.message);view.querySelectorAll('[data-favorite-remove]').forEach(function(button){button.disabled=!!snapshot.readOnly;});});return;
      }
      var control=event.target.closest('[data-craft-action]');
      if(control){var action=control.dataset.craftAction,body=control.closest('.craft-strategy-body');if(action==='diagram-failures'&&body&&body.renderFlow)body.renderFlow(body.dataset.failures!=='open');else if(action.indexOf('diagram-')===0)root.InscriptionFlowchart.zoom(control.closest('[data-flow-viewer]'),action.slice(8));return;}
      if(event.target.closest('[data-favorite-clear]')){renderFilters(blank());renderResults();}
      if(event.target.closest('[data-favorite-refresh]'))activate();
    });return true;
  }
  function activate(){
    if(!root.QinshiAccounts||!root.InscriptionRules||!root.InscriptionFlowchart||!root.INSCRIPTION_DATA)return;
    if(!view&&!init())return;
    if(!store)store=API.createStore(root.QinshiAccounts,{items:root.INSCRIPTION_DATA.items});
    var result=store.inspect(),changedAccount=result.accountId!==activeAccount,value=!snapshot||changedAccount?blank():filters();
    activeAccount=result.accountId;snapshot=result;if(changedAccount){request++;busy=false;}
    renderFilters(value);
    status(!result.valid?'收藏读取失败，原始数据已保留，禁止覆盖：'+result.errors.join('；'):result.readOnly?'该账号正在其他标签页编辑，本页可查看收藏；取消收藏需先取得编辑权。':'');
    host('count').textContent='';renderResults();
  }
  API.activate=activate;API.refresh=function(){if(view)activate();};
  root.addEventListener('storage',function(event){
    if(!event.key)return;
    var account=root.QinshiAccounts&&root.QinshiAccounts.currentAccount(),physical=account?'qinshi_account_v1:'+account.id+':'+encodeURIComponent(API.KEY):'';
    if(event.key===API.KEY||event.key===physical){API.refresh();changed();}
  });
  root.addEventListener('inscription-route-favorites-change',function(){API.refresh();});
  if(root.QinshiAccounts&&typeof root.QinshiAccounts.subscribeAccess==='function'){
    var account=root.QinshiAccounts.currentAccount(),access=account?account.id+':'+!(typeof root.QinshiAccounts.isReadOnly==='function'&&root.QinshiAccounts.isReadOnly()):'';
    root.QinshiAccounts.subscribeAccess(function(value){
      var current=root.QinshiAccounts.currentAccount();if(!current||current.id!==value.accountId)return;
      var next=value.accountId+':'+value.writable;if(next===access)return;access=next;API.refresh();changed();
    });
  }
})(typeof window!=='undefined'?window:null);
