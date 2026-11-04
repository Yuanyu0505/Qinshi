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
  function currentHtml(quality, all) {
    return (all ? tierData.map(function (row) { return row.id; }) : [quality]).map(function (id) {
      var body = id === 'g1' ? '<p class="muted-tip">绿一副属性数值未知，暂不推算。</p>' : wrapTable(qualityLabel(id) + '遁位副属性', ['遁位','单条词条数值 / 档位 / 来源'], Rules.duns.map(function (dun) {
        return '<tr><th scope="row">' + extreme(dun) + '</th><td><div class="ins-ref-terms">' + termRows(dun.id, id).map(function (row) {
          return '<span class="ins-ref-term">' + termHtml(row, id, dun.id) + '<small class="ins-ref-origin">' + row.origins.map(function (origin) { return originLabels[origin]; }).join(' / ') + '</small></span>';
        }).join('') + '</div></td></tr>';
      }).join(''), 'ins-ref-dun-table');
      return '<div class="ins-ref-quality-panel" data-ref-quality-panel="' + id + '"><h4>' + qualityHtml(id) + '</h4>' + body + '</div>';
    }).join('');
  }
  function washHtml() {
    return '<div class="ins-ref-wash-grid">' + Rules.duns.map(function (dun) {
      return '<article class="ins-ref-wash-card" data-ref-wash-dun="' + esc(dun.id) + '"><h4>' + extreme(dun) + '</h4><div class="ins-ref-terms">' + washOnlyRows(dun.id).map(function (row) { return termHtml(row,'p2',dun.id); }).join('') + '</div></article>';
    }).join('') + '</div>';
  }
  function washOnlyRows(dun) {
    return termRows(dun,'p2','wash').filter(function(row){return row.origins.indexOf('crafted')<0;});
  }
  function upgradeHtml(dun, from) {
    var recipe = Rules.recipes[from];
    return wrapTable('同档成长对照', ['属性','升级前 · ' + qualityHtml(from),'升级后 · ' + qualityHtml(recipe.quality)], upgradeRows(dun, from).map(function (row) {
      return '<tr data-ref-upgrade-row="' + esc(row.attr + ':' + row.tier) + '"><th scope="row">' + esc(row.attr) + '</th><td>' + termHtml(row,from,dun) + '</td><td><div class="ins-ref-terms">' + row.possibilities.map(function (next) { return termHtml({attr:row.attr,tier:next.tier},recipe.quality,dun); }).join('<span class="ins-ref-or">或</span>') + '</div></td></tr>';
    }).join(''));
  }
  function foundationHtml() {
    var summary = wrapTable('品质基础数值和石头资料', ['品质','主属性单值','相邻品质单值成长','分解所得置换石','单次重铸置换石'], tierData.map(function (row,index) {
      var previous = tierData[index - 1];
      var growth = previous ? '+' + (row.scalar - previous.scalar) + '（+' + ((row.scalar / previous.scalar - 1) * 100).toFixed(2) + '%）' : '—';
      return '<tr><th scope="row">' + qualityHtml(row.id) + '</th><td>' + Terms.valueHtml(row.scalar,row.id) + '</td><td>' + growth + '</td><td>' + row.disassemble + '</td><td>' + (row.recast === null ? '未知 / 未提供' : row.recast) + '</td></tr>';
    }).join(''));
    var main = wrapTable('五天位七品质主属性', ['天位'].concat(tierData.map(function (row) { return qualityHtml(row.id); })), Rules.prefixes.map(function (prefix) {
      return '<tr><th scope="row">' + esc(prefix) + '</th>' + tierData.map(function (row) {
        return '<td class="ins-ref-quality-' + row.id + '">' + Terms.mainHtml(mainStats(prefix,row.id).map(function (entry) { return entry.attr + '+' + entry.value; }).join('、'),row.id) + '</td>';
      }).join('') + '</tr>';
    }).join(''), 'ins-ref-main-table');
    return summary + '<h4>天位主属性</h4>' + main;
  }
  function options(rows, selected) { return rows.map(function (row) { return '<option value="' + esc(row.id) + '"' + (row.id === selected ? ' selected' : '') + '>' + esc(row.label || row.id) + '</option>'; }).join(''); }
  function render(host) {
    if (!host) return;
    var state = host._insRefState || {quality:'o2',all:false,dun:'天遁',from:'p1'};
    host._insRefState = state;
    host.innerHTML = '<section class="ins-reference-block ins-ref-section"><h3>遁位副属性数值与来源</h3><div class="ins-ref-controls"><label>品质星级<select data-ref-quality aria-label="资料品质星级">' + options(tierData,state.quality) + '</select></label><label class="ins-ref-check"><input type="checkbox" data-ref-all' + (state.all ? ' checked' : '') + '>展示全部品质</label></div><p class="muted-tip">每项为单条词条，不表示可任意组合。极致属性支持高 / 中 / 低档，同属性同档位不可重复，每枚最多两条高档；蓝一仅供资料和个人记录。</p><div data-ref-current>' + currentHtml(state.quality,state.all) + '</div></section>' +
      '<section class="ins-reference-block ins-ref-section"><h3>紫二 · 仅能通过洗练获得的词条</h3><p class="muted-tip">以下词条不能定向合成获得，建议遇到时保留；不列洗练和合成都能获得的词条。每枚紫二需两条合法词条，本表不是整枚组合清单。</p>' + washHtml() + '</section>' +
      '<section class="ins-reference-block ins-ref-section"><h3>升级同档成长对照</h3><div class="ins-ref-controls"><label>遁位<select data-ref-upgrade-dun aria-label="成长对照遁位">' + options(Rules.duns,state.dun) + '</select></label><label>升级前品质<select data-ref-upgrade-from aria-label="成长对照升级前品质">' + options(Rules.qualities.filter(function (row) { return Rules.recipes[row.id]; }),state.from) + '</select></label></div><p class="muted-tip">沿真实同档成长，不按下一个更大数值猜档。蓝二速度档位不可辨时列出可继承的可能情况，不推测具体档位或概率；本表不等于完整投料配方。</p><div data-ref-upgrades>' + upgradeHtml(state.dun,state.from) + '</div></section>' +
      '<section class="ins-reference-block ins-ref-section" data-ref-foundation><h3>品质基础、分解与重铸</h3><p class="muted-tip">主属性单值乘各天位固定倍率。相邻品质成长仅为主属性单值差，不代表合成配方；石头数值仅作静态资料，不计算重铸次数，不扣除真实库存。</p>' + foundationHtml() + '</section>';
    if (!host._insRefBound) {
      host.addEventListener('change', function (event) {
        var target = event.target, current = host._insRefState;
        if (target.matches('[data-ref-quality]')) current.quality = target.value;
        else if (target.matches('[data-ref-all]')) current.all = target.checked;
        else if (target.matches('[data-ref-upgrade-dun]')) current.dun = target.value;
        else if (target.matches('[data-ref-upgrade-from]')) current.from = target.value;
        else return;
        host.querySelector('[data-ref-current]').innerHTML = currentHtml(current.quality,current.all);
        host.querySelector('[data-ref-upgrades]').innerHTML = upgradeHtml(current.dun,current.from);
      });
      host._insRefBound = true;
    }
  }
  return {mainStats:mainStats,tiers:tiers,termRows:termRows,washOnlyRows:washOnlyRows,upgradeRows:upgradeRows,render:render};
});
