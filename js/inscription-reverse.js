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
  return {normalizeDraft:normalizeDraft,combinations:combinations,options:options,duns:duns,search:search,createDraftStore:createDraftStore};
});
