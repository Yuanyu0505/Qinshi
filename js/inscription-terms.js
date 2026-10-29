(function(root,factory){
  'use strict';
  var api=factory(typeof module==='object'&&module.exports?require('./inscription-rules.js'):root.InscriptionRules);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionTerms=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  var tiers={H:'高档',M:'中档',L:'低档',U:'不分档','?':'档位不可辨'};
  var aliases={'速度':'速','PVP速度':'PVP速','攻击':'攻'};
  function own(value,key){return Object.prototype.hasOwnProperty.call(value,key);}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function rank(quality){return /^b[12]$/.test(quality)?'blue':/^p[12]$/.test(quality)?'purple':/^o[12]$/.test(quality)?'orange':'';}
  function tierLabel(tier){return own(tiers,tier)?tiers[tier]:'';}
  function attributeName(attr){return R.normalizeAttr(own(aliases,attr)?aliases[attr]:attr);}
  function describe(term,quality){
    if(!term)return null;
    var name=attributeName(term.attr),meta=R.attributes.find(function(a){return a.id===name;}),amount=R.value({attr:name,tier:term.tier},quality),label=tierLabel(term.tier);
    if(!meta||amount===null||!label)return null;
    return {body:String(amount)+meta.unit+name,suffix:'（'+label+'）',rank:rank(quality)};
  }
  function plain(term,quality){var d=describe(term,quality);return d?d.body+d.suffix:'';}
  // Entries carry resolved numeric values and any caller-owned identity (such
  // as the original saved index). Only display arrays are created and sorted.
  function sortEntries(entries){
    var groups=new Map();
    entries.forEach(function(entry){
      var attr=attributeName(entry.attr),amount=typeof entry.value==='number'&&Number.isFinite(entry.value)?entry.value:-Infinity;
      if(!groups.has(attr))groups.set(attr,{attr:attr,max:amount,entries:[]});
      var group=groups.get(attr);
      group.max=Math.max(group.max,amount);
      group.entries.push({entry:entry,value:amount});
    });
    return Array.from(groups.values()).sort(function(a,b){
      return b.max-a.max||String(a.attr).localeCompare(String(b.attr),'zh-CN');
    }).reduce(function(result,group){
      return result.concat(group.entries.sort(function(a,b){return b.value-a.value;}).map(function(part){return part.entry;}));
    },[]);
  }
  function sortTerms(terms,quality){
    return sortEntries(terms.map(function(term){return {attr:term.attr,value:R.value(term,quality),term:term};})).map(function(entry){return entry.term;});
  }
  function coloredValue(text,color){return '<strong class="ins-term-value ins-term-'+color+'">'+esc(text)+'</strong>';}
  function valueHtml(text,quality){return coloredValue(text,rank(quality));}
  function descriptionHtml(d){return '<span class="ins-term">'+coloredValue(d.body,d.rank)+'<span class="ins-term-tier">'+esc(d.suffix)+'</span></span>';}
  function html(term,quality){var d=describe(term,quality);return d?descriptionHtml(d):'';}
  function savedHtml(attr,raw,dun,quality){
    var value=String(raw==null?'':raw).trim(),name=attributeName(attr),meta=R.attributes.find(function(a){return a.id===name;});
    if(!attr&&!value)return '';
    // Preserve unparseable historical text. Display normalization never writes
    // back, invents a tier, or turns an invalid record into valid material.
    if(!meta||!/^\+?\d+(?:\.\d+)?%?$/.test(value)||(value.endsWith('%')&&meta.unit!=='%'))return esc(String(attr||'')+value);
    var amount=Number(value.replace(/[+%]/g,''));
    var choices=R.termsFor(dun,quality).filter(function(t){return t.attr===name&&R.value(t,quality)===amount;});
    if(choices.length===1)return html(choices[0],quality);
    if(choices.length>1)return descriptionHtml({body:String(amount)+meta.unit+name,suffix:'（档位不可辨）',rank:rank(quality)});
    return esc(String(attr||'')+value);
  }
  function mainHtml(text,quality){
    return '<span class="ins-main-stack">'+String(text).split('、').map(function(part){
      var match=part.trim().match(/^([^+]+)\+(\d+(?:\.\d+)?%?)$/);
      return '<span>'+(match?valueHtml(match[2]+attributeName(match[1].trim()),quality):esc(part.trim()))+'</span>';
    }).join('')+'</span>';
  }
  return {rank:rank,tierLabel:tierLabel,describe:describe,plain:plain,sortTerms:sortTerms,sortEntries:sortEntries,html:html,savedHtml:savedHtml,valueHtml:valueHtml,mainHtml:mainHtml};
});
