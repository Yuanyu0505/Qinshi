(function (root, factory) {
  'use strict';
  var common = typeof module === 'object' && module.exports;
  var api = factory(common ? require('./inscription-rules.js') : root.InscriptionRules,
    common ? require('./inscription-progress-rules.js') : root.InscriptionProgressRules,
    common ? require('./inscription-terms.js') : root.InscriptionTerms);
  if (common) module.exports = api;
  if (root) root.InscriptionReference = api;
})(typeof window !== 'undefined' ? window : null, function (Rules, Progress, Terms) {
  'use strict';
  var tierData = [
    {id:'g1',label:'绿一',scalar:1600,disassemble:1,recast:null},
    {id:'b1',label:'蓝一',scalar:2700,disassemble:3,recast:1},
    {id:'b2',label:'蓝二',scalar:4550,disassemble:9,recast:1},
    {id:'p1',label:'紫一',scalar:7700,disassemble:20,recast:2},
    {id:'p2',label:'紫二',scalar:13050,disassemble:60,recast:5},
    {id:'o1',label:'橙一',scalar:22150,disassemble:132,recast:12},
    {id:'o2',label:'橙二',scalar:37650,disassemble:396,recast:40}
  ];
  var mainFactors = {
    '天机':[['内力',1],['护盾',16]], '天相':[['攻',1],['内力',2]],
    '天同':[['内力',1],['血',16]], '天梁':[['防',2],['血',8]], '天府':[['防',1],['攻',2]]
  };
  var originLabels = {wash:'洗练',crafted:'合成'};
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function tiers() { return tierData.map(function (row) { return Object.assign({}, row); }); }
  function mainStats(prefix, quality) {
    var tier = tierData.find(function (row) { return row.id === quality; });
    return tier && Object.prototype.hasOwnProperty.call(mainFactors,prefix) ? mainFactors[prefix].map(function (factor) { return {attr:factor[0],value:factor[1] * tier.scalar}; }) : [];
  }
  function termRows(dun, quality, origin) {
    var wash = Progress.termsFor(dun, quality, 'wash').map(Progress.identity);
    // Blue records are washed; no recipe produces blue inscriptions.
    var crafted = /^b/.test(quality) ? [] : Progress.termsFor(dun, quality, 'crafted').map(Progress.identity);
    return Terms.sortEntries(Progress.termsFor(dun, quality, origin).map(function (term) {
      var identity = Progress.identity(term), origins = [];
      if (wash.indexOf(identity) >= 0) origins.push('wash');
      if (crafted.indexOf(identity) >= 0) origins.push('crafted');
      return {attr:term.attr,tier:term.tier,value:Progress.value(term, quality, dun),origins:origins};
    }));
  }
  function upgradeRows(dun, fromQuality) {
    var recipe = Rules.recipes[fromQuality];
    if (!recipe) return [];
    var target = Progress.termsFor(dun, recipe.quality, 'crafted');
    return termRows(dun, fromQuality).map(function (row) {
      var possible = target.filter(function (term) {
        return term.attr === row.attr && (row.tier === '?' ? term.tier === 'H' || term.tier === 'M' : term.tier === row.tier);
      }).map(function (term) { return {tier:term.tier,value:Progress.value(term, recipe.quality, dun)}; });
      return {attr:row.attr,tier:row.tier,value:row.value,toQuality:recipe.quality,possibilities:possible};
    }).filter(function (row) { return row.possibilities.length; });
  }
  function compareRows(leftDun,leftQuality,rightDun,rightQuality){
    var left=termRows(leftDun,leftQuality),right=termRows(rightDun,rightQuality),rows=new Map();
    left.concat(right).forEach(function(t){var key=t.attr+':'+t.tier;if(!rows.has(key))rows.set(key,{attr:t.attr,tier:t.tier});});
    return Terms.sortEntries(Array.from(rows.values()).map(function(row){
      var a=left.find(function(t){return t.attr===row.attr&&t.tier===row.tier;})||null,b=right.find(function(t){return t.attr===row.attr&&t.tier===row.tier;})||null;
      var meta=Rules.attributes.find(function(t){return t.id===row.attr;});
      return {attr:row.attr,tier:row.tier,left:a,right:b,delta:a&&b?b.value-a.value:null,unit:meta&&meta.unit==='%'?'百分点':'',value:Math.max(a?a.value:-Infinity,b?b.value:-Infinity)};
    }));
  }
  function qualityLabel(id) { var row = tierData.find(function (entry) { return entry.id === id; }); return row ? row.label : id; }
  function qualityHtml(id) { return '<span class="ins-ref-quality ins-ref-quality-' + esc(id) + '">' + esc(qualityLabel(id)) + '</span>'; }
  function termHtml(row, quality, dun) {
    var description = Progress.describe(row, quality, dun);
    return description ? '<span class="ins-term">' + Terms.valueHtml(description.body, quality) + '<span class="ins-term-tier">' + esc(description.suffix) + '</span></span>' : '';
  }
  function extreme(dun) { return esc(dun.id) + '（极致：' + esc(dun.high.join('、')) + '）'; }
  function wrapTable(label, head, body, className) {
    return '<p class="mobile-scroll-hint" aria-hidden="true">左右滑动查看完整资料 →</p><div class="table-wrap mobile-scroll-region ins-ref-scroll" tabindex="0" aria-label="' + esc(label) + '，可左右滑动"><table class="ins-reference-table ' + (className || '') + '"><thead><tr>' + head.map(function (title) { return '<th scope="col">' + title + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function amountHtml(row,q){
    if(!row)return '<span class="ins-ref-empty">—</span>';
    var meta=Rules.attributes.find(function(a){return a.id===row.attr;});
    return Terms.valueHtml(row.value+(meta?meta.unit:''),q);
  }
  function sourceHtml(row){return '<small class="ins-ref-origin">'+row.origins.map(function(o){return originLabels[o];}).join(' / ')+'</small>';}
  function matches(row,s){return (!s.keyword||row.attr.toLowerCase().includes(s.keyword.toLowerCase().trim()))&&(!s.source||row.origins.includes(s.source));}
  function matrixHtml(dun,q,s){
    if(q==='g1')return '<p class="muted-tip">绿一副属性数值未知，暂不推算；绿一无法置换。</p>';
    var rows=termRows(dun,q).filter(function(r){return matches(r,s);}),attrs=Array.from(new Set(rows.map(function(r){return r.attr;}))),tiers=['H','M','L','U'];
    if(rows.some(function(r){return r.tier==='?';}))tiers.push('?');
    return wrapTable(qualityLabel(q)+' · '+dun+'副属性',['属性'].concat(tiers.map(Terms.tierLabel)),attrs.map(function(attr){
      return '<tr data-ref-attr-row="'+esc(attr)+'"><th scope="row">'+esc(attr)+'</th>'+tiers.map(function(tier){var row=rows.find(function(r){return r.attr===attr&&r.tier===tier;});return '<td>'+amountHtml(row,q)+(row?sourceHtml(row):'')+'</td>';}).join('')+'</tr>';
    }).join('')||'<tr><td colspan="'+(tiers.length+1)+'">没有符合条件的词条。</td></tr>','ins-ref-matrix');
  }
  function currentHtml(s){
    var pairs=s.all?tierData.map(function(q){return {dun:s.dun,q:q.id};}):[{dun:s.dun,q:s.quality}];
    if(!s.all&&s.mode==='quality')pairs.push({dun:s.dun,q:s.quality2});
    if(!s.all&&s.mode==='dun')pairs.push({dun:s.dun2,q:s.quality});
    var panels=pairs.map(function(pair){var dun=Rules.duns.find(function(d){return d.id===pair.dun;});
      return '<article class="ins-ref-quality-panel" data-ref-quality-panel="'+pair.q+'"'+(pairs.length===2?' data-ref-compare-panel':'')+'><h4>'+qualityHtml(pair.q)+' · '+extreme(dun)+'</h4>'+matrixHtml(pair.dun,pair.q,s)+'</article>';
    }).join('');
    var diff='';if(pairs.length===2&&s.diff){
      var a=pairs[0],b=pairs[1];diff='<div data-ref-comparison><h4>右侧减左侧 · 同属性同档位差值</h4>'+wrapTable('两组副属性差值',['属性','档位','差值'],compareRows(a.dun,a.q,b.dun,b.q).filter(function(r){return (r.left&&matches(r.left,s))||(r.right&&matches(r.right,s));}).map(function(r){
        return '<tr><th scope="row">'+esc(r.attr)+'</th><td>'+esc(Terms.tierLabel(r.tier))+'</td><td>'+(r.delta===null?'—':esc((r.delta>0?'+':'')+r.delta+(r.unit?' '+r.unit:'')))+'</td></tr>';
      }).join(''))+'</div>';
    }
    return '<div class="ins-ref-panels'+(pairs.length===2?' is-comparison':'')+'">'+panels+'</div>'+diff;
  }
  function washHtml() {
    return '<div class="ins-ref-wash-grid">' + Rules.duns.map(function (dun) {
      return '<article class="ins-ref-wash-card" data-ref-wash-dun="' + esc(dun.id) + '"><h4>' + extreme(dun) + '</h4><small class="ins-ref-origin">紫二 · 低档 · 仅洗练</small><dl>' + washOnlyRows(dun.id).map(function (row) { return '<div><dt>'+esc(row.attr)+'</dt><dd>'+amountHtml(row,'p2')+'</dd></div>'; }).join('') + '</dl></article>';
    }).join('') + '</div>';
  }
  function washOnlyRows(dun) {
    return termRows(dun,'p2','wash').filter(function(row){return row.origins.indexOf('crafted')<0;});
  }
  function upgradeHtml(dun, from,diff) {
    var recipe = Rules.recipes[from];
    return wrapTable('同档成长对照', ['属性','档位','升级前 · ' + qualityHtml(from),'升级后 · ' + qualityHtml(recipe.quality)].concat(diff?['成长差值']:[]), upgradeRows(dun, from).map(function (row) {
      var unit=Rules.attributes.find(function(a){return a.id===row.attr;}).unit==='%'?'百分点':'';
      return '<tr data-ref-upgrade-row="' + esc(row.attr + ':' + row.tier) + '"><th scope="row">' + esc(row.attr) + '</th><td>'+esc(Terms.tierLabel(row.tier))+'</td><td>' + amountHtml(row,from) + '</td><td><div class="ins-ref-terms">' + row.possibilities.map(function (next) { return amountHtml({attr:row.attr,value:next.value},recipe.quality)+(row.tier==='?'?'<small class="ins-ref-origin">'+esc(Terms.tierLabel(next.tier))+'</small>':''); }).join('<span class="ins-ref-or">或</span>') + '</div></td>'+(diff?'<td>'+row.possibilities.map(function(n){return esc('+'+(n.value-row.value)+(unit?' '+unit:''));}).join(' 或 ')+'</td>':'')+'</tr>';
    }).join(''));
  }
  function foundationHtml(s) {
    var summary = wrapTable('品质基础数值和石头资料', ['品质','主属性单值','相邻品质单值成长','分解所得置换石','单次重铸置换石'], tierData.map(function (row,index) {
      var previous = tierData[index - 1];
      var growth = previous ? '+' + (row.scalar - previous.scalar) + '（+' + ((row.scalar / previous.scalar - 1) * 100).toFixed(2) + '%）' : '—';
      return '<tr><th scope="row">' + qualityHtml(row.id) + '</th><td>' + Terms.valueHtml(row.scalar,row.id) + '</td><td class="ins-ref-growth">' + growth + '</td><td>' + row.disassemble + '</td><td>' + (row.recast === null ? '无法置换' : row.recast) + '</td></tr>';
    }).join(''));
    var full = wrapTable('五天位七品质主属性', ['天位'].concat(tierData.map(function (row) { return qualityHtml(row.id); })), Rules.prefixes.map(function (prefix) {
      return '<tr><th scope="row">' + esc(prefix) + '</th>' + tierData.map(function (row) {
        return '<td class="ins-ref-quality-' + row.id + '">' + Terms.mainHtml(mainStats(prefix,row.id).map(function (entry) { return entry.attr + '+' + entry.value; }).join('、'),row.id) + '</td>';
      }).join('') + '</tr>';
    }).join(''), 'ins-ref-main-overview');
    var main=s.mode==='quality'?wrapTable('两品质天位主属性对比',['天位','属性',qualityHtml(s.quality),qualityHtml(s.quality2)].concat(s.diff?['差值']:[]),Rules.prefixes.map(function(prefix){
      return mainStats(prefix,s.quality).map(function(a,i){var b=mainStats(prefix,s.quality2)[i];return '<tr><th scope="row">'+esc(prefix)+'</th><td>'+esc(a.attr)+'</td><td>'+Terms.valueHtml(a.value,s.quality)+'</td><td>'+Terms.valueHtml(b.value,s.quality2)+'</td>'+(s.diff?'<td>'+esc((b.value-a.value>0?'+':'')+(b.value-a.value))+'</td>':'')+'</tr>';}).join('');
    }).join(''),'ins-ref-main-table'):wrapTable('五天位主属性',['天位','主属性一','主属性二'],Rules.prefixes.map(function(prefix){return '<tr><th scope="row">'+esc(prefix)+'</th>'+mainStats(prefix,s.quality).map(function(a){return '<td>'+Terms.valueHtml(a.value+a.attr,s.quality)+'</td>';}).join('')+'</tr>';}).join(''),'ins-ref-main-table');
    return summary + '<h4>天位主属性</h4><div class="ins-ref-controls"><label>查看方式<select data-ref-main-mode>'+options([{id:'single',label:'单项查看'},{id:'quality',label:'双品质对比'}],s.mode)+'</select></label><label>品质<select data-ref-main-quality>'+options(tierData,s.quality)+'</select></label>'+(s.mode==='quality'?'<label>对比品质<select data-ref-main-quality2>'+options(tierData,s.quality2)+'</select></label><label><input type="checkbox" data-ref-main-diff'+(s.diff?' checked':'')+'>显示差值</label>':'')+'</div>'+main+'<details class="ins-ref-overview"><summary>查看全部品质主属性总览</summary>'+full+'</details>';
  }
  function options(rows, selected) { return rows.map(function (row) { return '<option value="' + esc(row.id) + '"' + (row.id === selected ? ' selected' : '') + '>' + esc(row.label || row.id) + '</option>'; }).join(''); }
  function render(host) {
    if (!host) return;
    var state = host._insRefState || {tab:'current',current:{quality:'o2',quality2:'p2',all:false,dun:'天遁',dun2:'地遁',mode:'single',diff:false,source:'',keyword:''},upgrade:{dun:'天遁',from:'p1',diff:false},foundation:{quality:'o2',quality2:'p2',mode:'single',diff:false}};
    host._insRefState = state;
    var current=state.current,u=state.upgrade,body='';
    if(state.tab==='current')body='<h3>遁位副属性与来源</h3><div class="ins-ref-controls"><label>查看方式<select data-ref-mode>'+options([{id:'single',label:'单项查看'},{id:'quality',label:'双品质对比'},{id:'dun',label:'双遁位对比'}],current.mode)+'</select></label><label>品质<select data-ref-quality>'+options(tierData,current.quality)+'</select></label><label>遁位<select data-ref-dun>'+options(Rules.duns,current.dun)+'</select></label>'+
      (current.mode==='quality'?'<label>对比品质<select data-ref-quality2>'+options(tierData,current.quality2)+'</select></label>':'')+(current.mode==='dun'?'<label>对比遁位<select data-ref-dun2>'+options(Rules.duns,current.dun2)+'</select></label>':'')+
      (current.mode==='single'?'<label class="ins-ref-check"><input type="checkbox" data-ref-all'+(current.all?' checked':'')+'>展示全部品质</label>':'<label class="ins-ref-check"><input type="checkbox" data-ref-diff'+(current.diff?' checked':'')+'>显示差值</label>')+
      '<label>来源<select data-ref-source>'+options([{id:'',label:'全部来源'},{id:'wash',label:'可洗练'},{id:'crafted',label:'可合成'}],current.source)+'</select></label><label>属性关键词<input type="search" data-ref-keyword value="'+esc(current.keyword)+'" placeholder="如：技能穿透"></label></div><p class="muted-tip">每格是单条词条，不代表可任意组合；同属性同档位不可重复，每枚最多两条高档。蓝色速度档位不可辨；— 表示此处没有已知合法词条，不视为0。</p><div data-ref-current>'+currentHtml(current)+'</div>';
    if(state.tab==='wash')body='<h3>紫二 · 仅能通过洗练获得的词条</h3><p class="muted-tip">不能定向合成的词条，遇到可保留；每枚紫二仍需两条合法词条。本表不是整枚组合清单。</p>'+washHtml();
    if(state.tab==='upgrade')body='<h3>升级同档成长对照</h3><div class="ins-ref-controls"><label>遁位<select data-ref-upgrade-dun>'+options(Rules.duns,u.dun)+'</select></label><label>升级前品质<select data-ref-upgrade-from>'+options(Rules.qualities.filter(function(q){return Rules.recipes[q.id];}),u.from)+'</select></label><label><input type="checkbox" data-ref-upgrade-diff'+(u.diff?' checked':'')+'>显示差值</label></div><p class="muted-tip">沿真实同档成长，不按下一个更大数值猜档。蓝二速度列出可继承的可能情况，不推测档位或概率；本表不是完整投料配方。</p><div data-ref-upgrades>'+upgradeHtml(u.dun,u.from,u.diff)+'</div>';
    if(state.tab==='foundation')body='<h3>品质与材料</h3><p class="muted-tip">主属性单值乘各天位固定倍率。分解与置换数值仅作资料，不扣除库存；绿一无法置换。</p><div data-ref-foundation>'+foundationHtml(state.foundation)+'</div>';
    host.innerHTML='<div class="ins-ref-tabs" role="group" aria-label="资料类别">'+[{id:'current',label:'副属性与来源'},{id:'wash',label:'紫二仅洗练词条'},{id:'upgrade',label:'升级同档成长'},{id:'foundation',label:'品质与材料'}].map(function(tab){return '<button type="button" class="seg'+(state.tab===tab.id?' active':'')+'" data-ref-tab="'+tab.id+'" aria-pressed="'+(state.tab===tab.id)+'">'+tab.label+'</button>';}).join('')+'</div><section class="ins-reference-block ins-ref-section">'+body+'</section>';
    if (!host._insRefBound) {
      host.addEventListener('change', function (event) {
        var t=event.target,s=host._insRefState,c=s.current;
        if(t.matches('[data-ref-mode]')){c.mode=t.value;c.all=false;}
        else if(t.matches('[data-ref-quality]'))c.quality=t.value;
        else if(t.matches('[data-ref-quality2]'))c.quality2=t.value;
        else if(t.matches('[data-ref-dun]'))c.dun=t.value;
        else if(t.matches('[data-ref-dun2]'))c.dun2=t.value;
        else if(t.matches('[data-ref-source]'))c.source=t.value;
        else if(t.matches('[data-ref-keyword]'))c.keyword=t.value;
        else if(t.matches('[data-ref-all]')){c.all=t.checked;c.mode='single';}
        else if(t.matches('[data-ref-diff]'))c.diff=t.checked;
        else if(t.matches('[data-ref-upgrade-dun]'))s.upgrade.dun=t.value;
        else if(t.matches('[data-ref-upgrade-from]'))s.upgrade.from=t.value;
        else if(t.matches('[data-ref-upgrade-diff]'))s.upgrade.diff=t.checked;
        else if(t.matches('[data-ref-main-mode]'))s.foundation.mode=t.value;
        else if(t.matches('[data-ref-main-quality]'))s.foundation.quality=t.value;
        else if(t.matches('[data-ref-main-quality2]'))s.foundation.quality2=t.value;
        else if(t.matches('[data-ref-main-diff]'))s.foundation.diff=t.checked;
        else return;
        render(host);
      });
      host.addEventListener('input',function(e){if(e.target.matches('[data-ref-keyword]')){host._insRefState.current.keyword=e.target.value;host.querySelector('[data-ref-current]').innerHTML=currentHtml(host._insRefState.current);}});
      host.addEventListener('click',function(e){var button=e.target.closest('[data-ref-tab]');if(button){host._insRefState.tab=button.dataset.refTab;render(host);}});
      host._insRefBound = true;
    }
  }
  return {mainStats:mainStats,tiers:tiers,termRows:termRows,washOnlyRows:washOnlyRows,upgradeRows:upgradeRows,compareRows:compareRows,render:render};
});
