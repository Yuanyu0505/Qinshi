(function (root) {
  'use strict';
  var R = root.InscriptionRules, P = root.InscriptionPaths, S = root.InscriptionCraftingState;
  var views = {}, store, serial = 0;
  var model = '等概率模型，非实测游戏频率。合成概率以前级具体材料备齐为条件；洗练随机，概率未知，不推算总体成本。';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function qInfo(id) { return R.qualities.find(function (q) { return q.id === id; }); }
  function qLabel(id) { var q = qInfo(id); return q ? q.label : id; }
  function tierLabel(tier) { return {H:'高档',M:'中档',L:'低档',U:'不分档','?':'蓝二速度档位不可辨识'}[tier] || tier; }
  function friendly(message) { return String(message).replace(/\b[HMLU]\b/g,tierLabel); }
  function field(v, name) { return v.el.querySelector('[data-craft-field="' + name + '"]'); }
  function area(v, name) { return v.el.querySelector('[data-craft-' + name + ']'); }
  function options(values, selected, empty) {
    return (empty === undefined ? '' : '<option value="">' + esc(empty) + '</option>') + values.map(function (x) {
      var id = typeof x === 'string' ? x : x.id, label = typeof x === 'string' ? x : x.label;
      return '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  function button(action, label, data) { return '<button type="button" class="seg" data-craft-action="' + action + '"' + (data || '') + '>' + esc(label) + '</button>'; }
  function status(v, message) { var el = area(v, 'status'); el.textContent = message ? friendly(message) : ''; el.hidden = !message; }
  function call(v, fn, message) {
    try { var result = fn(); v.state = store.snapshot(); if(message !== undefined) status(v, message); return result === undefined ? true : result; }
    catch (error) { status(v, error.message); return false; }
  }
  function integer(raw) {
    if (!/^\d+$/.test(String(raw).trim())) throw new Error('数量必须明确填写非负整数（填0才会移除；空白不会清零）');
    var number = Number(raw); if (!Number.isSafeInteger(number)) throw new Error('数量超出安全整数范围'); return number;
  }
  function termsText(material, tiers) {
    return material.terms.map(function (t) { return R.label(t, material.quality) + (tiers ? '［' + tierLabel(t.tier) + '］' : ''); }).join(' · ');
  }
  function materialText(m) { return m.prefix + ' · ' + m.dun + ' · ' + qLabel(m.quality) + '：' + termsText(m, true); }
  function currentGoal(v) { return v.state && v.state.goals.find(function (g) { return g.id === v.goalId; }); }
  function workspace(v) { return v.state && v.state.workspaces[v.goalId]; }
  function inputAttrs(v) { return Array.from(v.el.querySelectorAll('[data-craft-field="attr"]')).map(function (x) { return x.value; }); }
  function targetReason(dun,attrs,reason) {
    return reason + (dun==='人遁' && attrs.filter(function(a){return a==='技能穿透';}).length>2 ? '；人遁技能穿透最多两条，建议双穿加其他属性，或选择地遁三穿。' : '');
  }
  function form(v) {
    return { prefix: field(v,'prefix').value, dun: field(v,'dun').value, quality: field(v,'quality').value,
      attrs: inputAttrs(v), discipleKey: field(v,'disciple').value ? decodeURIComponent(field(v,'disciple').value) : null, name: field(v,'name').value };
  }
  function persist(v) {
    return call(v, function () {
      var draft = clone(store.snapshot().draft); draft[v.mode] = { form: form(v), goalId: v.goalId || '', selection: v.selection || [] };
      store.updateDraft(draft);
    });
  }
  function initView(mode) {
    var el = document.getElementById('inscription-' + mode);
    var v = views[mode] = { mode: mode, el: el, goalId: '', selection: [], registry: {}, planner: null };
    el.innerHTML = '<div class="craft-status" data-craft-status role="alert" hidden></div>' +
      '<section class="craft-panel"><h3>' + (mode === 'crafting-paths' ? '合成路径查询' : '合成模拟工作台') + '</h3>' +
      '<p class="craft-note">目标、可消耗实际库存与每个目标的虚拟库存分别保存，不会自动计入个人已佩戴铭文。切换页签保留输入。</p>' +
      '<div class="craft-controls"><label>搜索弟子（可不选）<input type="search" data-craft-field="disciple-search" placeholder="输入姓名筛选"></label>' +
      '<label>弟子<select data-craft-field="disciple"></select></label><label>弟子实际位置<select data-craft-field="slot"></select></label>' +
      '<label>目标品质<select data-craft-field="quality">' + options(R.qualities,'o2') + '</select></label>' +
      '<label>遁位<select data-craft-field="dun">' + options(R.duns.map(function (d) { return d.id; }),'','请选择遁位') + '</select></label>' +
      '<label>前缀<select data-craft-field="prefix">' + options(R.prefixes,'','请选择前缀') + '</select></label></div>' +
      '<div data-craft-attrs></div><div class="craft-actions">' + button('add-attr','添加属性槽') + '</div>' +
      '<p class="craft-note">可重复选属性，但同属性同档不能重复，同一种不分档属性只能一条，每枚最多两条高档；目标需选满品质槽数。中档可合成，不代表可洗出。</p>' +
      '<div data-craft-compatibility></div><div class="craft-controls"><label>目标名称（可留空）<input data-craft-field="name" maxlength="80" placeholder="自动使用前缀、遁位和属性命名"></label>' +
      '<label>已保存目标<select data-craft-field="saved-goal"><option value="">请选择目标</option></select></label></div>' +
      '<div class="craft-actions">' + button('generate','生成合成路径') + button('save-goal','另存为目标') + button('rename-goal','重命名当前目标') + button('delete-goal','删除当前目标') + '</div></section>' +
      '<section class="craft-panel"><h3>所选属性数值与来源</h3><div data-craft-matrix></div></section>' +
      '<div data-craft-results></div>' +
      '<section class="craft-panel"><h3>具体材料录入</h3><p class="craft-note">选择完整具体词条和真实来源。蓝二速度1的档位不可辨识，不猜测高档或中档。实际库存设置总数，虚拟录入增加数量；晋升材料自动列出，无模拟数量限制。</p><div data-craft-material-editor></div></section>' +
      '<section class="craft-panel"><h3>实际可消耗库存（本账号共享）</h3><p class="craft-note">同一具体铭文跨目标共用总数；来源不重复记账。明确输入0才移除该材料。</p><div data-craft-actual class="craft-inventory"></div></section>' +
      '<section class="craft-panel" data-craft-simulator><h3>目标独立模拟工作台</h3><div class="craft-actions">' + button('copy-actual','复制实际库存至虚拟') + button('reset','重置虚拟工作台') + '</div><div data-craft-workspace></div></section>';
    refreshDisciples(v);
    renderAttrs(v, ['', '', '']);
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-craft-action]'); if (b) handleClick(v,b); });
    el.addEventListener('change', function (e) { handleChange(v,e.target); });
    el.addEventListener('input', function (e) {
      if (e.target === field(v,'disciple-search')) refreshDisciples(v);
      if (e.target === field(v,'name')) persist(v);
    });
    el.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d.open && d._render && !d._rendered) { d._rendered = true; d._render(); }
    }, true);
    return v;
  }
  function refreshDisciples(v) {
    var selected = field(v,'disciple').value, query = field(v,'disciple-search').value.trim().toLowerCase();
    var items = root.INSCRIPTION_DATA.items.filter(function (i) { return !query || i.name.toLowerCase().includes(query) || encodeURIComponent(i.quality + '\0' + i.name) === selected; });
    field(v,'disciple').innerHTML = options(items.map(function (i) { return { id:encodeURIComponent(i.quality + '\0' + i.name), label:i.name + ' · ' + i.quality }; }), selected, '不限定弟子');
  }
  function disciple(v) { var key = decodeURIComponent(field(v,'disciple').value); return root.INSCRIPTION_DATA.items.find(function (i) { return i.quality + '\0' + i.name === key; }); }
  function refreshSlots(v, prefer) {
    var item = disciple(v), slots = item ? item.slots.map(function (s) { return { prefix:s.tian, dun:R.normalizeDun(s.shield) }; }) : [];
    field(v,'slot').innerHTML = options(slots.map(function (s) { return { id:s.prefix + '|' + s.dun, label:s.prefix + ' · ' + s.dun }; }),prefer || '',item ? '请选择实际位置' : '不限定弟子：直接选遁位与前缀');
    var prefix = field(v,'prefix').value, dun = field(v,'dun').value;
    field(v,'prefix').innerHTML = options(item ? Array.from(new Set(slots.map(function (s) { return s.prefix; }))) : R.prefixes,prefix,'请选择前缀');
    field(v,'dun').innerHTML = options(item ? Array.from(new Set(slots.map(function (s) { return s.dun; }))) : R.duns.map(function (d) { return d.id; }),dun,'请选择遁位');
  }
  function renderAttrs(v, attrs) {
    var count = qInfo(field(v,'quality').value).count;
    area(v,'attrs').innerHTML = attrs.map(function (attr,index) {
      return '<div class="craft-attr-row"><label>目标属性' + (index+1) + '<select data-craft-field="attr">' + options(R.attributes.map(function (a) { return a.id; }),attr,'请选择属性') + '</select></label>' + button('remove-attr','移除',' data-index="' + index + '"') + '</div>';
    }).join('');
    v.el.querySelector('[data-craft-action="add-attr"]').disabled = attrs.length >= count;
  }
  function refreshDerived(v) {
    var attrs = inputAttrs(v), quality = field(v,'quality').value, dun = field(v,'dun').value, item = disciple(v);
    var positions = item ? item.slots.map(function (s) { return { prefix:s.tian,dun:R.normalizeDun(s.shield) }; }) : R.duns.map(function (d) { return { dun:d.id }; });
    area(v,'compatibility').innerHTML = '<p class="craft-note">实时可行位置（不隐藏不支持原因）：</p><ul class="craft-positions">' + positions.map(function (p) {
      var best = R.bestTargets(p.dun,quality,attrs), valid = best.targets.length;
      return '<li class="' + (valid ? '' : 'unavailable') + '"><b>' + esc((p.prefix ? p.prefix + ' · ' : '') + p.dun) + '</b><br>' + esc(valid ? '可行：' + best.targets.map(function (ts) { return ts.map(function (t) { return R.label(t,quality); }).join(' / '); }).join('；') : targetReason(p.dun,attrs,best.reason)) + '</li>';
    }).join('') + '</ul>';
    var chosen = Array.from(new Set(attrs.filter(Boolean)));
    area(v,'matrix').innerHTML = !chosen.length ? '<p class="craft-note">选择属性后显示蓝二至橙二的高档、中档、低档或不分档数值；“—”表示该遁位不支持。</p>' :
      '<p class="craft-note">来源标签按单词条显示，整枚仍需通过来源及数量校验。先选遁位查看可用值。左右滑动查看所有品质 →</p><div class="craft-scroll" tabindex="0" aria-label="属性成长数值表"><table class="craft-table craft-matrix"><thead><tr><th>属性</th>' + R.qualities.map(function (q) { return '<th>' + q.label + '</th>'; }).join('') + '</tr></thead><tbody>' + chosen.map(function (attr) {
        return '<tr><th>' + esc(attr) + '</th>' + R.qualities.map(function (q) {
          var terms = R.termsFor(dun,q.id).filter(function (t) { return t.attr === attr; });
          return '<td>' + (terms.length ? terms.map(function (t) {
            var origins = ['wash','crafted'].filter(function (o) { return R.termsFor(dun,q.id,o).some(function (x) { return x.attr === t.attr && x.tier === t.tier; }); });
            return '<div>' + esc(tierLabel(t.tier) + ' ') + esc(R.label(t,q.id)) + '<small>' + origins.map(function (o) { return o === 'wash' ? '洗练' : '合成'; }).join(' / ') + '</small></div>';
          }).join('') : '—') + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function restoreForm(v,f) {
    field(v,'quality').value = qInfo(f.quality) ? f.quality : 'o2';
    field(v,'disciple-search').value = ''; refreshDisciples(v); field(v,'disciple').value = f.discipleKey ? encodeURIComponent(f.discipleKey) : '';
    refreshSlots(v, f.prefix + '|' + f.dun); field(v,'prefix').value=f.prefix || ''; field(v,'dun').value=f.dun || ''; field(v,'name').value=f.name || '';
    renderAttrs(v, Array.isArray(f.attrs) ? f.attrs : ['', '', '']); refreshDerived(v);
  }
  function activate(mode) {
    if (!R || !P || !S || !root.QinshiAccounts) return;
    if (!store) store = S.createStore(root.QinshiAccounts);
    var v = views[mode] || initView(mode), inspected = store.inspect();
    if (!inspected.valid) { v.state = null; status(v, '存档读取失败，已保留原始数据：' + inspected.errors.join('；')); return; }
    v.state = inspected.state;
    var account = root.QinshiAccounts.currentAccount(), accountId = account && account.id;
    var newAccount = v.accountId !== accountId || !v.loaded;
    if (newAccount) {
      v.accountId = accountId; v.loaded = true;
      var draft = v.state.draft[mode] || {};
      v.goalId=draft.goalId || ''; v.selection=draft.selection || [];
      if (draft.form) restoreForm(v,draft.form); else { refreshSlots(v); refreshDerived(v); }
    }
    refreshGoalList(v); if(newAccount || !area(v,'material-editor').children.length)renderMaterialEditor(v); refreshInventory(v); refreshNodeTotals(v); renderWorkspace(v);
  }
  function refreshGoalList(v) {
    field(v,'saved-goal').innerHTML = options(v.state.goals.map(function (g) { return {id:g.id,label:g.name}; }),v.goalId,'请选择目标');
  }
  function useGoal(v,id) {
    var goal = v.state.goals.find(function (g) { return g.id === id; }); if (!goal) return;
    area(v,'results').innerHTML='';v.planner=null;
    v.goalId = id; v.selection = (v.state.workspaces[id].selection || []).slice(); restoreForm(v,goal);
    persist(v); renderMaterialEditor(v); refreshInventory(v); renderWorkspace(v); refreshGoalList(v);
  }
  function newGoal(v) {
    var f = form(v), item=disciple(v);
    if(item&&!item.slots.some(function(s){return s.tian===f.prefix&&R.normalizeDun(s.shield)===f.dun;})){status(v,'请从该弟子的实际位置中选择前缀与遁位');return false;}
    var best=R.bestTargets(f.dun,f.quality,f.attrs);if(!best.targets.length){status(v,targetReason(f.dun,f.attrs,best.reason));return false;}
    f.name=f.name.trim() || (item ? item.name+' · ' : '')+f.prefix+' · '+f.dun+' · '+qLabel(f.quality)+' · '+f.attrs.join('/');
    var id = call(v,function () { return store.saveGoal(f); },'目标已保存；实际库存未改变');
    if (id === false) return false; v.goalId = id; v.selection=[]; persist(v); refreshGoalList(v); renderMaterialEditor(v); renderWorkspace(v); return id;
  }
  function register(v,value) { var id = 'c' + (++serial); v.registry[id]=value; return id; }
  function getActual(v,m) { var sig=R.signature(m); return v.state.actual.find(function (x) { return x.signature === sig; }); }
  function materialNode(v,m,quantity,sources,canExpand) {
    var key=register(v,{material:m,sources:sources}), stocked=getActual(v,m);
    return '<div class="craft-node" data-material-origin="' + esc(m.origin) + '"><b>' + esc(qLabel(m.quality)) + ' × ' + quantity + '</b><p>' + esc(termsText(m,true)) + '</p><p class="craft-note">' + esc(m.prefix + ' · ' + m.dun) + '</p><p class="craft-note">来源：' + sources.map(function (s) { return s === 'wash' ? '洗练（随机，概率未知）' : '合成'; }).join(' / ') + '</p>' +
      '<label>实际总数<input type="number" min="0" step="1" value="' + (stocked ? stocked.quantity : 0) + '" data-node-actual="' + key + '"></label>' +
      '<label>实际来源<select data-node-source="' + key + '">' + options(sources.map(function (s) { return { id:s,label:s === 'wash' ? '洗练' : '合成' }; }),stocked ? stocked.material.origin : m.origin) + '</select></label>' +
      (canExpand && m.quality !== 'b2' ? button('expand-material','展开前级准备',' data-ref="' + key + '"') + '<div data-material-expansion="' + key + '"></div>' : '') + '</div>';
  }
  function outcomesHtml(outcomes) {
    return '<details><summary>全部 ' + outcomes.length + ' 种结果 · 概率合计 ' + Math.round(outcomes.reduce(function (s,o) { return s+o.probability; },0)*100) + '%（点击展开）</summary><div class="craft-scroll"><table class="craft-table"><thead><tr><th>产物</th><th>概率</th></tr></thead><tbody>' + outcomes.map(function (o) { return '<tr><td>' + esc(termsText(o.material,true)) + '</td><td>' + probability(o.probability) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
  }
  function probability(n) { return (n*100).toLocaleString('zh-CN',{maximumFractionDigits:4}) + '%'; }
  function routeHtml(v,r,allowUse) {
    var id=register(v,r);
    return '<article class="craft-route" data-concrete-route><div class="craft-note">' + (r.probability === 1 ? '条件必中' : '目标概率 ' + probability(r.probability)) + ' · ' + esc(qLabel(r.inputQuality) + ' → ' + qLabel(r.quality)) + '</div><div class="craft-flow"><div class="craft-inputs">' + r.requirements.map(function (req) { return materialNode(v,req.material,req.quantity,req.sources,true); }).join('') + '</div><div class="craft-edge" aria-label="材料进入合成"></div><div class="craft-node craft-operation"><b>合成 × 1</b><p>消耗 ' + r.quantity + ' 枚</p><p>' + (r.promotion ? esc(r.promotion) + '晋升材料 × 1' : '无需晋升材料') + '</p><small>' + probability(r.probability) + '</small></div><div class="craft-edge" aria-label="合成输出"></div><div class="craft-node craft-output"><b>' + esc(qLabel(r.quality)) + '目标</b><p>' + esc(termsText(r.target,true)) + '</p><small>合成来源</small></div></div>' + outcomesHtml(r.outcomes) + (allowUse ? button('use-recipe','在虚拟工作台选择此配方',' data-ref="' + id + '"') : '') + '</article>';
  }
  function pagedRoutes(v,host,routes,allowUse) {
    var shown=0;
    function more() {
      var old=host.querySelector(':scope > [data-more]'); if(old)old.remove();
      var next=routes.slice(shown,shown+6); host.insertAdjacentHTML('beforeend',next.map(function (r) { return routeHtml(v,r,allowUse); }).join('')); shown+=next.length;
      if(shown<routes.length) { var b=document.createElement('button');b.type='button';b.className='seg';b.dataset.more='';b.textContent='加载更多（已显示 '+shown+'/'+routes.length+'）'; b.onclick=more;host.appendChild(b); }
    }
    more();
  }
  function renderPlan(v,host,result) {
    if(!result.valid) { host.textContent=result.errors.join('；');return; }
    host.innerHTML='<p class="craft-note">' + model + '</p><p class="craft-highlight">精确目标：' + result.targets.map(function (m) { return esc(materialText(m)); }).join('；') + '</p>' +
      result.preparations.map(function (p) { return '<p class="craft-note">可直接洗练准备：' + esc(materialText(p.material)) + ' × ' + p.quantity + '；洗练随机，概率未知</p>'; }).join('') +
      '<p class="craft-note">共 ' + result.routes.length + ' 条具体路线，' + result.groups.length + ' 个策略组。逐组展开；每组分页可查看全部，无省略上限。额外词条X默认推荐同一种不分档属性，但可选任意合法词条。</p>';
    result.groups.slice().sort(function(a,b){return Number(a.kind!=='deterministic')-Number(b.kind!=='deterministic') || Number(b.preferred)-Number(a.preferred);}).forEach(function (group) {
      var d=document.createElement('details');d.className='craft-strategy';d.dataset.routeGroup=group.id;
      var extras=group.extras.map(function (t) { return R.label(t,result.routes.find(function (r) { return r.id===group.routeIds[0]; }).inputQuality)+'［'+tierLabel(t.tier)+'］'; }).join(' / ');
      d.innerHTML='<summary>' + (group.kind==='deterministic' ? '条件必中' : '概率合成') + (extras ? ' · 具体X：'+esc(extras) : '') + (group.preferred && group.kind!=='deterministic' ? ' · 同类概率路线推荐复用' : '') + ' · '+group.routeIds.length+' 条路线</summary><div class="craft-strategy-body"></div>';
      d._render=function(){var ids=new Set(group.routeIds);pagedRoutes(v,d.querySelector('.craft-strategy-body'),result.routes.filter(function (r) { return ids.has(r.id); }),false);};host.appendChild(d);
    });
    renderBranches(v,host,result);
  }
  function renderBranches(v,host,result) {
    var branches=(result.additionalBranches || []).concat(result.reuseBranches || []);
    if(!branches.length)return;
    result.targets.forEach(function(target){
      var panel=document.createElement('section');panel.className='craft-panel';panel.dataset.craftBranchPanel='';
      var targetRef=register(v,clone(target));
      panel.innerHTML='<h4>多X与失败品复用规划</h4><p class="craft-highlight">精确规划目标：'+esc(materialText(target))+'</p><p class="craft-note">选择具体材料后按规则重算，不把不同X一律当作25%。可混用成功品与失败品；AAA缺少目标属性时不可达。库存模式尊重实际数量，模板模式可重复并显示所需数量。</p>' + branches.map(function (b) { return '<p '+(b.kind==='failure-reuse'?'data-reuse-branch':'data-additional-branch')+'>'+esc(b.label)+' '+button('open-planner','选择具体材料并计算',' data-quality="'+esc(b.inputQuality)+'" data-ref="'+targetRef+'"')+'</p>'; }).join('') + '<div data-craft-planner></div>';
      host.appendChild(panel);
    });
  }
  function openPlanner(v,b) {
    var target=clone(v.registry[b.dataset.ref]), quality=b.dataset.quality;
    var host=b.closest('[data-craft-branch-panel]').querySelector('[data-craft-planner]');
    var planner={host:host,target:target,quality:quality,materials:[]};host._planner=planner;v.planner=planner;
    host.innerHTML='<h4>'+qLabel(quality)+'具体材料选择</h4><p class="craft-highlight">按此精确目标计算：'+esc(materialText(target))+'</p><p class="craft-note">从本账号实际库存勾选候选类型（按库存数量），或用下方具体材料编辑器加入独立配方模板；模板与库存两种计算入口分开，不会混记。模板可加入所有合法X，不限于目标属性。</p><div data-planner-stock></div><div class="craft-actions">'+button('plan-stock','按勾选实际库存计算')+button('plan-templates','按具体模板计算')+'</div><div data-planner-templates></div><div data-planner-results></div>';
    renderPlannerStock(v); var ed=area(v,'material-editor');ed.querySelector('[data-material-field="prefix"]').value=target.prefix;ed.querySelector('[data-material-field="dun"]').value=target.dun;ed.querySelector('[data-material-field="quality"]').value=quality;updateMaterialTerms(v);ed.scrollIntoView({block:'nearest'});
    status(v,'材料模板将加入当前精确规划目标：'+materialText(target));
  }
  function renderPlannerStock(v) {
    v.el.querySelectorAll('[data-craft-planner]').forEach(function(host){
      var planner=host._planner;if(!planner)return;
      var target=planner.target, candidates=v.state.actual.filter(function (x) { return x.material.prefix===target.prefix&&x.material.dun===target.dun&&x.material.quality===planner.quality; });
      host.querySelector('[data-planner-stock]').innerHTML=candidates.length ? candidates.map(function (x) {var id=register(v,x);return '<label class="craft-note"><input style="width:auto" type="checkbox" data-planner-entry="'+id+'"> '+esc(materialText(x.material))+' × '+x.quantity+'</label>';}).join('<br>') : '<p class="craft-note">没有此位置/品质的实际库存，可录入实际材料或添加具体模板。</p>';
    });
  }
  function sourcesFor(m) { return ['wash','crafted'].filter(function (o) { var c=clone(m);c.origin=o;return R.validate(c).valid; }); }
  function refreshInventory(v) {
    area(v,'actual').innerHTML=v.state.actual.length?v.state.actual.map(function (x) {return materialNode(v,x.material,x.quantity,sourcesFor(x.material),false);}).join(''):'<p class="craft-note">实际库存为空；未从已佩戴进度导入。</p>';
    renderPlannerStock(v);
  }
  function refreshNodeTotals(v) {
    v.el.querySelectorAll('[data-node-actual]').forEach(function(input){
      var ref=input.dataset.nodeActual, entry=v.registry[ref], current=entry&&getActual(v,entry.material);
      input.value=current?current.quantity:0;
      var source=v.el.querySelector('[data-node-source="'+ref+'"]');if(source&&current)source.value=current.material.origin;
    });
  }
  function renderMaterialEditor(v) {
    var host=area(v,'material-editor'), f=form(v), old=host.querySelector('[data-material-field="quality"]'), quality=old?old.value:'b2', origin=old?host.querySelector('[data-material-field="origin"]').value:'wash';
    host.innerHTML='<div class="craft-controls"><label>材料前缀<select data-material-field="prefix">'+options(R.prefixes,f.prefix,'请选择前缀')+'</select></label><label>材料遁位<select data-material-field="dun">'+options(R.duns.map(function (d) {return d.id;}),f.dun,'请选择遁位')+'</select></label><label>材料品质<select data-material-field="quality">'+options(R.qualities,quality)+'</select></label><label>真实来源<select data-material-field="origin">'+options([{id:'wash',label:'洗练'},{id:'crafted',label:'合成'}],origin)+'</select></label></div><div data-material-terms></div><div class="craft-controls"><label>数量（实际为总数，虚拟为增量）<input data-material-field="quantity" type="number" min="0" step="1" value="1"></label></div><div class="craft-actions">'+button('set-actual','设置实际总数')+button('add-virtual','增量加入当前目标虚拟库存')+button('add-template','加入具体规划模板')+'</div><p class="craft-note" data-material-validation></p>';
    updateMaterialTerms(v);
  }
  function updateMaterialTerms(v) {
    var host=area(v,'material-editor'), quality=host.querySelector('[data-material-field="quality"]').value, origin=host.querySelector('[data-material-field="origin"]').value, dun=host.querySelector('[data-material-field="dun"]').value;
    var old=Array.from(host.querySelectorAll('[data-material-field="term"]')).map(function (s) {return s.value;});
    var available=R.termsFor(dun,quality,origin), goalAttrs=form(v).attrs;
    host.querySelector('[data-material-terms]').innerHTML='<div class="craft-controls">'+Array.from({length:qInfo(quality).count},function (_,i) {return '<label>材料词条'+(i+1)+'<select data-material-field="term">'+options(available.map(function (t) {return {id:t.attr+':'+t.tier,label:R.label(t,quality)+'［'+tierLabel(t.tier)+'］'+(goalAttrs.includes(t.attr)?' ★目标属性':'')};}),old[i] || '', '请选择具体词条')+'</select></label>';}).join('')+'</div>';
    validateEditor(v);
  }
  function materialFromEditor(v) {
    var host=area(v,'material-editor');function val(n){return host.querySelector('[data-material-field="'+n+'"]').value;}
    var m={prefix:val('prefix'),dun:val('dun'),quality:val('quality'),origin:val('origin'),terms:Array.from(host.querySelectorAll('[data-material-field="term"]')).map(function (s) {var split=s.value.lastIndexOf(':');return {attr:s.value.slice(0,split),tier:s.value.slice(split+1)};})};
    var result=R.validate(m);if(!result.valid)throw new Error(result.errors.join('；'));return result.material;
  }
  function validateEditor(v) {
    var message='';try{materialFromEditor(v);message='具体材料合法；可以设置库存。';}catch(e){message=e.message;}
    area(v,'material-editor').querySelector('[data-material-validation]').textContent=friendly(message);
  }
  function renderWorkspace(v) {
    var host=area(v,'workspace'), goal=currentGoal(v), ws=workspace(v);
    if(!goal||!ws){host.innerHTML='<p class="craft-note">先保存/选择一个目标，再建立独立模拟工作台。</p>';return;}
    var recipe=R.recipes[ws.stage], available=ws.inventory.filter(function (x) {return x.material.prefix===goal.prefix&&x.material.dun===goal.dun&&x.material.quality===ws.stage;});
    if(ws.pending)v.selection=ws.pending.selection.slice();else if(!v.selection.length && ws.selection.length)v.selection=ws.selection.slice();
    host.innerHTML='<p><b>'+esc(goal.name)+'</b></p><p class="craft-note">已保存目标：'+esc(goal.prefix+' · '+goal.dun+' · '+qLabel(goal.quality)+' · '+goal.attrs.join('/'))+'。上方修改筛选不会改变此工作台目标；新搭配请另存为目标。</p><div class="craft-controls"><label>当前材料阶段<select data-craft-stage>'+options(R.qualities,ws.stage)+'</select></label></div>' +
      (recipe?'<p class="craft-note">'+qLabel(ws.stage)+' × '+recipe.count+' → '+qLabel(recipe.quality)+(recipe.promotion?'；自动附加'+recipe.promotion+'晋升材料 × 1':'；无需晋升材料')+'。选择材料后自动预览全部结果。</p><div class="craft-controls">'+Array.from({length:recipe.count},function (_,i) {return '<label>输入材料'+(i+1)+'<select data-recipe-input="'+i+'">'+options(available.map(function (x) {return {id:x.signature,label:termsText(x.material,true)+' × '+x.quantity};}),v.selection[i] || '', '请选择具体虚拟材料')+'</select></label>';}).join('')+'</div>':'<p class="craft-note">已到橙二终点，不尝试未知配方。</p>') +
      '<div data-craft-preview></div><div class="craft-actions">'+(recipe?button('roll','试算一次（不扣料）'):'')+'</div><div data-pending-host></div><h4>虚拟库存（不影响实际库存）</h4><div class="craft-inventory" data-virtual-inventory>'+ws.inventory.map(function (x) {var id=register(v,x);return '<div class="craft-node"><b>'+esc(materialText(x.material))+'</b><p>来源：'+(x.material.origin==='wash'?'洗练':'合成')+'</p><label>虚拟总数<input type="number" min="0" step="1" data-virtual-total="'+id+'" value="'+x.quantity+'"></label></div>';}).join('')+'</div>';
    renderPreview(v);
    if(ws.pending) {
      var p=ws.pending;host.querySelector('[data-pending-host]').innerHTML='<div class="craft-pending" data-craft-pending><b>待确认结果（尚未消耗或入账）</b><p>'+esc(materialText(p.result))+'</p><p>本结果概率 '+probability(p.probability)+'</p><div class="craft-actions">'+button('next','进入下一阶段',' data-token="'+esc(p.id)+'"')+button('repeat','重复当前阶段 / 连续制作',' data-token="'+esc(p.id)+'"')+button('retry','反复试算（仅重抽）')+button('clear-pending','取消待确认结果')+'</div></div>';
    }
  }
  function renderPreview(v) {
    var host=area(v,'preview'),ws=workspace(v);if(!host||!ws)return;
    var recipe=R.recipes[ws.stage];if(!recipe){host.textContent='';return;}
    var selected=Array.from(v.el.querySelectorAll('[data-recipe-input]')).map(function (s) {return s.value;});
    if(selected.some(function (s) {return !s;})){host.textContent='请选满'+recipe.count+'枚材料（相同类型可以重复，但需足量）。';return;}
    var materials=selected.map(function (sig) {var entry=ws.inventory.find(function (x) {return x.signature===sig;});return entry&&entry.material;});
    var counts={};selected.forEach(function (s) {counts[s]=(counts[s]||0)+1;});
    var insufficient=Object.keys(counts).some(function (sig) {var e=ws.inventory.find(function (x) {return x.signature===sig;});return !e||e.quantity<counts[sig];});
    if(insufficient){host.textContent='虚拟材料数量不足，不能复用同一枚材料。';return;}
    var preview=R.preview(materials), goal=currentGoal(v), targetChance='';
    if(preview.valid&&goal&&preview.quality===goal.quality){
      var target={prefix:goal.prefix,dun:goal.dun,quality:goal.quality,terms:goal.targetTerms}, sig=R.signature(target);
      var chance=preview.outcomes.reduce(function(total,o){return total+(R.signature(o.material)===sig?o.probability:0);},0);
      targetChance='<p class="craft-highlight">当前目标命中概率：'+probability(chance)+'</p>';
    }
    host.innerHTML=preview.valid?'<p class="craft-note">'+model+'</p>'+targetChance+outcomesHtml(preview.outcomes):'<p class="craft-status">'+esc(friendly(preview.errors.join('；')))+'</p>';
  }
  function handleChange(v,target) {
    if(!v.state){status(v,'存档读取失败，已阻止写入');return;}
    status(v,'');
    if(target.matches('[data-node-actual],[data-node-source]')) {
      var ref=target.dataset.nodeActual || target.dataset.nodeSource;
      var entry=v.registry[ref], source=v.el.querySelector('[data-node-source="'+ref+'"]').value, totalInput=v.el.querySelector('[data-node-actual="'+ref+'"]');
      if(call(v,function(){var m=clone(entry.material);m.origin=source;store.setActual(m,integer(totalInput.value));},'实际库存总数已保存')!==false){refreshInventory(v);refreshNodeTotals(v);renderWorkspace(v);}
      return;
    }
    if(target.matches('[data-virtual-total]')){var e=v.registry[target.dataset.virtualTotal];if(call(v,function(){store.setVirtual(v.goalId,e.material,integer(target.value));})!==false){v.selection=[];renderWorkspace(v);}return;}
    if(target.matches('[data-craft-stage]')){if(call(v,function(){store.setStage(v.goalId,target.value);})!==false){v.selection=[];persist(v);renderWorkspace(v);}return;}
    if(target.matches('[data-recipe-input]')){
      v.selection=Array.from(v.el.querySelectorAll('[data-recipe-input]')).map(function(s){return s.value;});
      if(workspace(v).pending && call(v,function(){store.clearPending(v.goalId);})===false)return;
      if(v.selection.every(Boolean))call(v,function(){store.setSelection(v.goalId,v.selection);});
      persist(v);renderWorkspace(v);return;
    }
    if(target.matches('[data-material-field]')) {if(['quality','origin','dun'].includes(target.dataset.materialField))updateMaterialTerms(v);else validateEditor(v);return;}
    if(!target.matches('[data-craft-field]'))return;
    var name=target.dataset.craftField;
    if(name==='saved-goal'){if(target.value)useGoal(v,target.value);return;}
    if(['attr','quality','disciple','slot','prefix','dun'].includes(name)) {area(v,'results').innerHTML='';v.planner=null;}
    if(name==='disciple'){refreshSlots(v);field(v,'prefix').value='';field(v,'dun').value='';}
    if(name==='slot'&&target.value){var slot=target.value.split('|');field(v,'prefix').value=slot[0];field(v,'dun').value=slot[1];}
    if(name==='quality'){var attrs=inputAttrs(v),count=qInfo(target.value).count;attrs=attrs.slice(0,count);while(attrs.length<count)attrs.push('');renderAttrs(v,attrs);}
    refreshDerived(v);persist(v);
    if(['dun','prefix','slot','disciple'].includes(name))renderMaterialEditor(v);
  }
  function handleClick(v,b) {
    if(!v.state){status(v,'存档读取失败，已阻止写入；请通过备份恢复有效数据。');return;}
    status(v,'');
    var action=b.dataset.craftAction;
    if(action==='add-attr'){var attrs=inputAttrs(v);if(attrs.length<qInfo(field(v,'quality').value).count){attrs.push('');renderAttrs(v,attrs);refreshDerived(v);persist(v);}return;}
    if(action==='remove-attr'){var remaining=inputAttrs(v);remaining.splice(Number(b.dataset.index),1);renderAttrs(v,remaining);refreshDerived(v);persist(v);return;}
    if(action==='save-goal'){newGoal(v);return;}
    if(action==='rename-goal'){var goal=currentGoal(v);if(!goal){status(v,'请先选择已保存目标');return;}if(call(v,function(){var renamed=clone(goal);renamed.name=field(v,'name').value;store.saveGoal(renamed);},'目标名称已保存')!==false)refreshGoalList(v);return;}
    if(action==='delete-goal'){if(!currentGoal(v))return;if(!root.confirm('删除当前目标及其虚拟工作台？实际库存会保留。'))return;if(call(v,function(){store.deleteGoal(v.goalId);})!==false){v.goalId='';v.selection=[];persist(v);refreshGoalList(v);renderWorkspace(v);}return;}
    if(action==='generate'){
      var f=form(v),item=disciple(v);
      if(item&&!item.slots.some(function(s){return s.tian===f.prefix&&R.normalizeDun(s.shield)===f.dun;})){status(v,'请从该弟子的实际位置中选择前缀与遁位');return;}
      if(!f.prefix||!f.dun){status(v,'请填写遁位与前缀，并选满目标属性');return;}
      var plan=P.generate(f);if(!plan.valid){status(v,targetReason(f.dun,f.attrs,plan.errors.join('；')));return;}status(v,'');v.planner=null;renderPlan(v,area(v,'results'),plan);persist(v);return;
    }
    if(action==='expand-material'){var ref=b.dataset.ref,entry=v.registry[ref],host=v.el.querySelector('[data-material-expansion="'+ref+'"]');if(host.childNodes.length){host.hidden=!host.hidden;return;}host.dataset.expandedMaterial='';renderPlan(v,host,P.expand(entry.material));return;}
    if(action==='open-planner'){openPlanner(v,b);return;}
    if(action==='add-template'){
      var activePlanner=v.planner;
      if(!activePlanner||!activePlanner.host.isConnected){status(v,'先在多X / 失败复用分支中点击“选择具体材料并计算”');return;}
      call(v,function(){var m=materialFromEditor(v);if(m.quality!==activePlanner.quality)throw new Error('模板品质必须为'+qLabel(activePlanner.quality));if(m.prefix!==activePlanner.target.prefix||m.dun!==activePlanner.target.dun)throw new Error('模板必须与当前精确规划目标同前缀、遁位');activePlanner.materials.push(m);activePlanner.host.querySelector('[data-planner-templates]').textContent='具体模板：'+activePlanner.materials.map(materialText).join('；');},'已加入当前精确目标模板（不改实际或虚拟库存）');return;
    }
    if(action==='plan-stock'||action==='plan-templates'){
      var plannerHost=b.closest('[data-craft-planner]'),planner=plannerHost&&plannerHost._planner;
      if(!planner){status(v,'请先打开具体分支的规划器');return;}
      var inputs=action==='plan-stock'?Array.from(plannerHost.querySelectorAll('[data-planner-entry]:checked')).map(function(c){return v.registry[c.dataset.plannerEntry];}):planner.materials;
      if(!inputs.length){status(v,'请先选择具体材料；X通配不能入库或直接计算');return;}
      var calculated=P.reuseRecipes(planner.target,inputs),out=plannerHost.querySelector('[data-planner-results]');out.innerHTML='';
      if(!calculated.valid){status(v,calculated.errors.join('；'));return;}
      out.innerHTML='<p class="craft-note">'+(calculated.templateMode?'模板模式（尚未检查实际库存）':'实际库存数量约束')+'，共 '+calculated.recipes.length+' 条可达配方。'+(!calculated.recipes.length?'当前材料不能覆盖目标，或实际数量不足；不会将缺词AAA当作可达。':'')+'</p>';pagedRoutes(v,out,calculated.recipes,true);return;
    }
    if(action==='set-actual'||action==='add-virtual'){
      if(action==='add-virtual'&&!currentGoal(v)){status(v,'请先保存/选择目标');return;}
      var succeeded=call(v,function(){var m=materialFromEditor(v),total=integer(area(v,'material-editor').querySelector('[data-material-field="quantity"]').value);if(action==='set-actual')store.setActual(m,total);else store.addVirtual(v.goalId,m,total);},action==='set-actual'?'实际库存总数已保存':'虚拟库存已增量添加；实际库存未改变');
      if(succeeded!==false){refreshInventory(v);refreshNodeTotals(v);v.selection=[];renderWorkspace(v);}return;
    }
    if(!currentGoal(v)){status(v,'请先保存/选择目标');return;}
    if(action==='copy-actual'||action==='reset'){
      if(!root.confirm(action==='copy-actual'?'用实际库存快照覆盖此目标的虚拟库存？当前选择和待确认结果会清空。':'重置此目标虚拟工作台？实际库存和目标保留。'))return;
      if(call(v,function(){if(action==='copy-actual')store.copyActual(v.goalId);else store.resetSimulation(v.goalId);})!==false){v.selection=[];persist(v);renderWorkspace(v);}return;
    }
    if(action==='use-recipe'){var route=v.registry[b.dataset.ref];if(call(v,function(){store.setSelection(v.goalId,route.inputs);})!==false){v.selection=route.inputs.map(R.signature);persist(v);renderWorkspace(v);area(v,'simulator').scrollIntoView({block:'start'});}return;}
    if(action==='roll'||action==='retry'||action==='next'||action==='repeat'||action==='clear-pending'){
      b.disabled=true;
      var ok=call(v,function(){
        if(action==='roll'){var selection=Array.from(v.el.querySelectorAll('[data-recipe-input]')).map(function(c){return c.value;});if(!selection.length||selection.some(function(s){return !s;}))throw new Error('请选满输入材料');if(workspace(v).pending)throw new Error('请先提交、重抽或取消当前待确认结果');store.setSelection(v.goalId,selection);store.roll(v.goalId);}
        if(action==='retry')store.retry(v.goalId);
        if(action==='next'||action==='repeat')store.commitPending(v.goalId,action,b.dataset.token);
        if(action==='clear-pending')store.clearPending(v.goalId);
      });
      b.disabled=false;if(ok!==false){v.selection=(action==='next'?[]:store.snapshot().workspaces[v.goalId].selection.slice());persist(v);renderWorkspace(v);}return;
    }
  }
  root.InscriptionCraftingUI={activate:activate,refresh:function(){Object.keys(views).forEach(activate);}};
})(window);
