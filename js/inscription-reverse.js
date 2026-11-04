(function(root,factory){
  'use strict';var api=factory(typeof module==='object'&&module.exports?require('./inscription-rules.js'):root.InscriptionRules);
  if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.InscriptionReverse=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  var cache=new Map(),attrIds=R.attributes.map(function(a){return a.id;});
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function info(q){return R.qualities.find(function(a){return a.id===q;});}
  function normalizeDraft(value,fallback){
    var d=value&&typeof value==='object'?value:{},q=info(d.quality)?d.quality:(info(fallback)?fallback:'o2');
    return {quality:q,dun:R.duns.some(function(a){return a.id===R.normalizeDun(d.dun);})?R.normalizeDun(d.dun):'',
      attrs:Array.from({length:info(q).count},function(_,i){var a=R.normalizeAttr(Array.isArray(d.attrs)?d.attrs[i]:'');return attrIds.includes(a)?a:'';})};
  }
  function combinations(dun,quality,attrs){
    var q=info(quality),names=Array.isArray(attrs)?attrs.filter(Boolean).map(R.normalizeAttr):[];
    if(!q||!names.length||names.length>q.count||names.some(function(a){return !attrIds.includes(a);}))return [];
    var pool=R.termsFor(dun,quality);if(!pool.length)return [];
    var wanted=new Map();names.forEach(function(a){wanted.set(a,(wanted.get(a)||0)+1);});
    if(names.some(function(a){return !pool.some(function(t){return t.attr===a;});}))return [];
    var cacheKey=JSON.stringify([dun,quality,Array.from(wanted).sort()]);
    if(cache.has(cacheKey))return JSON.parse(cache.get(cacheKey));
    var candidates=[],max=0,seen=new Set(),order=Array.from(wanted.keys());
    function accept(terms){
      if(Array.from(wanted).some(function(a){return terms.filter(function(t){return t.attr===a[0];}).length<a[1];}))return;
      if(!['wash','crafted'].some(function(origin){return R.validate({prefix:R.prefixes[0],dun:dun,quality:quality,origin:origin,terms:terms}).valid;}))return;
      var selected=terms.filter(function(t){return wanted.has(t.attr);});
      if(selected.length<max)return;
      if(selected.length>max){max=selected.length;candidates=[];seen.clear();}
      selected.sort(function(a,b){return order.indexOf(a.attr)-order.indexOf(b.attr)||R.value(b,quality)-R.value(a,quality)||a.tier.localeCompare(b.tier);});
      var key=JSON.stringify(selected);if(seen.has(key))return;seen.add(key);candidates.push(selected);
    }
    function visit(start,picked,high){
      if(picked.length===q.count){accept(picked);return;}
      for(var i=start;i<=pool.length-(q.count-picked.length);i++){
        if(high+(pool[i].tier==='H'?1:0)>2)continue;
        visit(i+1,picked.concat([pool[i]]),high+(pool[i].tier==='H'?1:0));
      }
    }
    visit(0,[],0);
    function dominates(a,b){
      var larger=false;
      for(var i=0;i<order.length;i++){
        var av=a.filter(function(t){return t.attr===order[i];}).map(function(t){return R.value(t,quality);});
        var bv=b.filter(function(t){return t.attr===order[i];}).map(function(t){return R.value(t,quality);});
        if(av.length!==bv.length)return false;
        for(var j=0;j<av.length;j++){if(av[j]<bv[j])return false;if(av[j]>bv[j])larger=true;}
      }return larger;
    }
    var result=candidates.filter(function(a){return !candidates.some(function(b){return dominates(b,a);});}).map(function(a){return a.concat(Array(q.count-a.length).fill(null));});
    if(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(cacheKey,JSON.stringify(result));return copy(result);
  }
  function matching(d,attrs){return R.duns.filter(function(a){return (!d.dun||d.dun===a.id)&&combinations(a.id,d.quality,attrs).length;});}
  function options(value,index){
    var d=normalizeDraft(value),others=d.attrs.filter(function(_,i){return i!==index;});
    return attrIds.filter(function(a){return matching(d,others.concat([a])).length>0;});
  }
  function duns(value){
    var d=normalizeDraft(value),names=Array.from(new Set(d.attrs.filter(Boolean))),tiers={H:'高档',M:'中档',L:'低档',U:'不分档','?':'档位不可辨'};
    return R.duns.filter(function(a){return !names.length||combinations(a.id,d.quality,d.attrs).length;}).map(function(a){
      var note=names.map(function(name){var ts=Array.from(new Set(R.termsFor(a.id,d.quality).filter(function(t){return t.attr===name;}).map(function(t){return tiers[t.tier];})));return (names.length>1?name+'：':'')+ts.join('/');}).join('；');
      return {id:a.id,label:a.id+(note?'（'+note+'）':'')};
    });
  }
  function search(items,value){
    var d=normalizeDraft(value),results=[],seen=new Set();if(!d.attrs.some(Boolean))return results;
    (items||[]).forEach(function(item){
      if(!item||typeof item.name!=='string'||typeof item.quality!=='string'||!Array.isArray(item.slots))return;
      item.slots.forEach(function(slot){
        if(!slot||!R.prefixes.includes(slot.tian))return;var dun=R.normalizeDun(slot.shield);if(d.dun&&d.dun!==dun)return;
        combinations(dun,d.quality,d.attrs).forEach(function(terms){
          var discipleKey=item.quality+'\0'+item.name,position=slot.tian+'|'+dun,key=JSON.stringify([discipleKey,position,d.quality,terms]);
          if(seen.has(key))return;seen.add(key);results.push({key:key,discipleKey:discipleKey,name:item.name,discipleQuality:item.quality,slot:position,dun:dun,quality:d.quality,terms:terms,attrs:terms.map(function(t){return t?t.attr:'';})});
        });
      });
    });return results;
  }
  function nameKey(name){return String(name||'').replace(/[·\s]/g,'');}
  function divine(row){return row.discipleQuality==='红色神将';}
  // Identity edges come from explicit project mappings and full-name equality,
  // never substring/title stripping. Build identity before filtering, but apply
  // classification to each concrete disciple before constructing result cards.
  function groupResults(rows,filters,context){
    rows=rows||[];filters=filters||{};context=context||{};
    var parents=new Map(),byName=new Map(),identities=new Map();
    function find(k){if(!parents.has(k))parents.set(k,k);var p=parents.get(k);if(p!==k){p=find(p);parents.set(k,p);}return p;}
    function join(a,b){parents.set(find(a),find(b));}
    rows.forEach(function(row){identities.set(row.discipleKey,row);var n=nameKey(row.name);if(!byName.has(n))byName.set(n,[]);byName.get(n).push(row);find(row.discipleKey);});
    identities.forEach(function(row){if(divine(row)){var ordinary=nameKey(row.name).replace(/^神/,'');(byName.get(ordinary)||[]).forEach(function(peer){if(!divine(peer))join(row.discipleKey,peer.discipleKey);});}});
    Object.keys(context.atlasTargets||{}).forEach(function(key){
      var names=[key].concat(context.atlasTargets[key]||[]),members=[];
      names.forEach(function(n){(byName.get(nameKey(n))||[]).forEach(function(r){members.push(r);});});
      members.filter(divine).forEach(function(god){members.filter(function(r){return !divine(r);}).forEach(function(normal){join(god.discipleKey,normal.discipleKey);});});
    });
    var common=context.commonKeys||new Set(),formation=context.formationNames||new Set(),cards=new Map(),query=nameKey(filters.search).toLowerCase();
    rows.forEach(function(row){
      if(!filters.ordinary&&!divine(row))return;
      var isCommon=common.has(row.discipleKey),isFormation=formation.has(row.name),prefix=row.slot.split('|')[0];
      if(filters.group==='common'&&!isCommon||filters.group==='formation'&&!isFormation||filters.group==='other'&&(isCommon||isFormation))return;
      if(filters.prefix&&filters.prefix!==prefix||filters.dun&&filters.dun!==row.dun||query&&!nameKey(row.name).toLowerCase().includes(query))return;
      var terms=row.terms.map(function(t){return t?[t.attr,t.tier,R.value(t,row.quality)]:null;}).sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});
      var key=JSON.stringify([find(row.discipleKey),row.slot,row.quality,terms]);
      if(!cards.has(key))cards.set(key,{key:key,members:[]});
      var members=cards.get(key).members;if(!members.some(function(m){return m.discipleKey===row.discipleKey;}))members.push(row);
    });
    var result=Array.from(cards.values());result.forEach(function(c){c.members.sort(function(a,b){return Number(divine(b))-Number(divine(a))||a.name.localeCompare(b.name,'zh-CN');});});
    return result.sort(function(a,b){return Number(divine(b.members[0]))-Number(divine(a.members[0]))||a.members[0].name.localeCompare(b.members[0].name,'zh-CN')||a.key.localeCompare(b.key);});
  }
  // Draft writes use the same account boundary and optimistic raw token as the
  // other inscription stores, but never write the live simulation document.
  function createDraftStore(storage,mode){
    if(!['crafting-paths','crafting-simulator'].includes(mode))throw new Error('未知反查页面');
    var key='qinshi_inscription_reverse_'+(mode==='crafting-paths'?'paths':'simulator')+'_v1';
    function account(){var a=storage.currentAccount();return a?a.id:null;}
    function inspect(){
      var raw,owner=account();
      try{
        raw=storage.getItem(key);var value=raw==null?{version:1,draft:normalizeDraft(),editing:false}:JSON.parse(raw);
        if(!value||value.version!==1||typeof value.editing!=='boolean'||!value.draft||!info(value.draft.quality)||!Array.isArray(value.draft.attrs))throw new Error('反查草稿格式异常');
        var normalized=normalizeDraft(value.draft);
        if(normalized.dun!==value.draft.dun||JSON.stringify(normalized.attrs)!==JSON.stringify(value.draft.attrs))throw new Error('反查草稿格式异常');
        return {valid:true,accountId:owner,token:raw==null?null:raw,draft:copy(value.draft),editing:value.editing};
      }catch(e){return {valid:false,accountId:owner,token:raw,draft:normalizeDraft(),editing:false,error:e.message};}
    }
    return {key:key,inspect:inspect,save:function(draft,editing,expected,owner){
      var existing=inspect();
      if(!owner||account()!==owner)throw new Error('账号已切换，请重新打开铭文分区');
      if(!existing.valid)throw new Error('反查草稿异常，原始数据已保留，请先处理旧数据');
      if(existing.token!==expected)throw new Error('反查筛选已在其他页面更新，请重新打开分区');
      var raw=JSON.stringify({version:1,draft:normalizeDraft(draft),editing:!!editing});
      if(storage.setItem(key,raw)===false)throw new Error('当前账号为只读，反查筛选未保存');
      if(account()!==owner||storage.getItem(key)!==raw)throw new Error('反查筛选保存失败，请重新打开分区');
      return inspect();
    }};
  }
  function blankTarget(){return {discipleKey:'',slot:'',dun:'',quality:'o2',attrs:['','',''],xTerm:null};}
  function resultFilters(value){
    var f=value||{};return {ordinary:f.ordinary===true,group:['common','formation','other'].includes(f.group)?f.group:'all',
      prefix:R.prefixes.includes(f.prefix)?f.prefix:'',dun:R.duns.some(function(d){return d.id===f.dun;})?f.dun:'',search:typeof f.search==='string'?f.search.slice(0,80):''};
  }
  function locatorValue(value){
    if(!value||value.version!==1||!value.target||!info(value.target.quality)||!Array.isArray(value.target.attrs))throw new Error('查询工作区格式异常');
    var t=value.target,attrs=t.attrs;
    if(attrs.length!==info(t.quality).count||attrs.some(function(a){return typeof a!=='string'||a&&!attrIds.includes(a);})||typeof t.discipleKey!=='string'||typeof t.slot!=='string'||typeof t.dun!=='string')throw new Error('查询工作区目标异常');
    return {version:1,target:copy(t),reverse:normalizeDraft(value.reverse),filters:resultFilters(value.filters),queried:value.queried===true,generated:value.generated===true};
  }
  function createLocatorStore(storage,mode,child){
    if(!['crafting-paths','crafting-simulator'].includes(mode)||!['direct','reverse'].includes(child))throw new Error('未知查询工作区');
    var key='qinshi_inscription_locator_'+(mode==='crafting-paths'?'paths':'simulator')+'_'+child+'_v1';
    function owner(){var a=storage.currentAccount();return a?a.id:null;}
    function legacy(){
      var target=blankTarget(),reverse=normalizeDraft(),warning='';
      try{
        var raw=storage.getItem(mode==='crafting-paths'?'qinshi_inscription_path_query_v1':'qinshi_inscription_crafting_v1');
        if(raw){var parsed=JSON.parse(raw),candidate=mode==='crafting-paths'?parsed:parsed.draft&&parsed.draft.simpleWorkbench&&parsed.draft.simpleWorkbench.target;
          if(candidate)target=locatorValue({version:1,target:candidate}).target;}
      }catch(e){warning='旧目标读取异常，原始数据保留，使用独立的新查询工作区。';}
      reverse=normalizeDraft({quality:target.quality});
      if(child==='reverse'){
        var old=createDraftStore(storage,mode).inspect();
        if(old.valid&&old.token!==null)reverse=old.draft;else if(!old.valid)warning='旧反查草稿异常，原始数据保留，使用独立的新查询工作区。';
        target=blankTarget();target.quality=reverse.quality;target.attrs=Array(info(reverse.quality).count).fill('');
      }
      return {value:locatorValue({version:1,target:target,reverse:reverse}),warning:warning};
    }
    function inspect(){var raw=null;try{
      raw=storage.getItem(key);var fallback=raw==null?legacy():null;
      return {valid:true,token:raw,accountId:owner(),value:fallback?fallback.value:locatorValue(JSON.parse(raw)),warning:fallback?fallback.warning:''};
    }catch(e){return {valid:false,token:raw,accountId:owner(),value:locatorValue({version:1,target:blankTarget()}),error:e.message};}}
    return {key:key,inspect:inspect,save:function(value,expected,accountId){
      if(!accountId||owner()!==accountId)throw new Error('账号已切换，请重新打开铭文分区');
      var current=inspect();if(!current.valid)throw new Error('查询工作区异常，原始数据保留，请先恢复备份');
      if(current.token!==expected)throw new Error('查询工作区已在其他页面更新，请重新打开分区');
      var raw=JSON.stringify(locatorValue(value));
      if(storage.setItem(key,raw)===false)throw new Error('当前账号为只读或存储拒绝写入，筛选未保存');
      if(owner()!==accountId||storage.getItem(key)!==raw)throw new Error('筛选保存失败，请重新打开分区');
      return inspect();
    }};
  }
  return {normalizeDraft:normalizeDraft,combinations:combinations,options:options,duns:duns,search:search,groupResults:groupResults,createDraftStore:createDraftStore,createLocatorStore:createLocatorStore,resultFilters:resultFilters};
});
