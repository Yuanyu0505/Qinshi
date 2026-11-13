/* Independent read-only reference UI. No account, inventory or persistent state. */
(function(root,factory){'use strict';var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OTHER_REFERENCE_UI=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function filterRows(table,query,quality){
    var q=String(query||'').trim().toLocaleLowerCase(),index=table.columns.indexOf('品质');
    return table.rows.filter(function(row){return (!quality||index<0||row[index]===quality)&&(!q||row.join(' ').toLocaleLowerCase().includes(q));});
  }
  function matchesLevelBand(value,band){
    if(band==='')return true;
    var match=String(value).match(/^(\d+)(?:\s*[~～–—-]\s*(\d+))?/);
    if(!match)return false;
    var start=Number(match[1]),end=match[2]===undefined?start:Number(match[2]);
    return start<=Math.min(100,Number(band)+9)&&end>=Number(band);
  }
  function tablesFor(root){
    var d=root.OTHER_REFERENCE_DATA,source=d.elements[0].source;
    var tables=[{id:'elements-cost',section:'elements',title:'气蕴消耗',columns:['名称','品质','金','木','水','火','土','总计'],rows:d.elements.filter(function(r){return r.kind==='气蕴';}).map(function(r){return [r.name,r.quality,r['金'],r['木'],r['水'],r['火'],r['土'],r['总计']].map(String);}),sourcePaths:[source],verification:'visually-transcribed',note:'原表的五行消耗值。每种气蕴总计1500；此处仅展示原值，不提供计算器。'},
      {id:'elements-stones',section:'elements',title:'五极石',columns:['名称','品质','金','木','水','火','土','总计'],rows:d.elements.filter(function(r){return r.kind==='五极石';}).map(function(r){return [r.name,r.quality,r['金'],r['木'],r['水'],r['火'],r['土'],r['总计']].map(String);}),sourcePaths:[source],verification:'visually-transcribed',note:'初级与中级均为每行1350，高级4050；按来源原值保留。'},
      {id:'cards-album',section:'cards',title:'传说卡册 · 已确认属性',columns:['范围','生命','攻击','防御','内力','护盾','三级迷珏消耗'],rows:[['单册','320,000','40,000','40,000','20,000','180,000','75个'],['三册合计','960,000','120,000','120,000','60,000','540,000','225个']],sourcePaths:d.guides[4].sourcePaths,verification:'user-confirmed',note:'三册总防御已按用户确认修订为12万。原图写6万，原图保留不改；此项不再待核对。'}];
    ['OTHER_REFERENCE_TABLES_A','OTHER_REFERENCE_TABLES_B','OTHER_REFERENCE_TABLES_C'].forEach(function(key){if(root[key])tables=tables.concat(root[key].tables);});
    var origins=tables.filter(function(t){return t.section==='origins';});
    if(origins.length)tables.unshift({id:'origins-all',section:'origins',title:'弟子查来源 · 全部来源独立对照',columns:['弟子','可获得来源','出处'],rows:origins.flatMap(function(t){return t.rows.map(function(row){return [row[0],row[1],t.title];});}),sourcePaths:Array.from(new Set(origins.flatMap(function(t){return t.sourcePaths;}))),verification:'visually-transcribed',note:'检索弟子可同时看到原图07及补图07的来源；切换子栏目可按来源查看名单。各出处独立保留，不推断活动开放时间或获取概率。'});
    return tables;
  }
  // Presentation metadata only: the underlying tables and filter fields stay intact.
  function titleFor(table){return table.id==='elements-cost'?'气蕴需求数量对照':table.id==='elements-stones'?'五极石五行数量对照':table.title;}
  function groupFor(table){
    var id=table.id;
    if(table.section==='elements')return /^elements-(cost|stones)$/.test(id)?'气蕴数量与五极石':/mappings$/.test(id)?'金／水／火／土抵抗组合':'品质、进度与属性增益';
    if(table.section==='guardians')return /materials$/.test(id)?'进阶材料':/aid-/.test(id)?'援助弟子':'守护神技能';
    if(table.section==='cards')return id==='cards-album'?'传说卡册':'副属性数值速查';
    if(table.section==='origins')return id==='origins-all'?'按弟子查全部来源':id.includes('supplement')?'按来源查名单 · 补图07':'按来源查名单 · 原图07';
    if(table.section==='speed')return id.includes('paid')?'氪佬版':'平民版';
    if(table.section==='spirits')return id==='spirits-elements'?'五行器灵':id==='spirits-fates'?'命格属性':'搭配建议';
    if(table.section==='disciples')return id==='disciples-skill-evolution'?'技能进化材料':'神魄与神果材料';
    return '';
  }
  function groupedOptions(list,selected){
    var groups=new Map();list.forEach(function(t){var key=groupFor(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);});
    return Array.from(groups.entries()).map(function(entry){var options=entry[1].map(function(t){return '<option value="'+t.id+'"'+(t.id===selected?' selected':'')+'>'+esc(titleFor(t))+'</option>';}).join('');return entry[0]?'<optgroup label="'+esc(entry[0])+'">'+options+'</optgroup>':options;}).join('');
  }
  function init(root){
    root=root||window;
    var host=root.document.getElementById('partition-other-reference');
    if(!host||host.dataset.refReady)return;
    host.dataset.refReady='true';
    var data=root.OTHER_REFERENCE_DATA,tables=tablesFor(root),states={},sectionId='',homeScroll=0,restoreButton=null,zoom=1,fitWidth=0,pointers=new Map(),pinch=0;
    function state(){if(!states[sectionId])states[sectionId]={query:'',table:'',quality:'',view:'auto',sort:'source',band:'',scroll:0,perTable:{}};return states[sectionId];}
    function sourceButtons(paths,full){return '<div class="ref-sources">'+paths.map(function(p,i){return '<div><button type="button" class="seg" title="'+esc(p)+'" aria-label="查看原图：'+esc(p.split('/').pop())+'" data-ref-image="'+esc(p)+'">查看原图'+(paths.length>1?' '+(i+1):'')+'</button>'+(full?'<small class="ref-source-path">'+esc(p)+'</small>':'')+'</div>';}).join('')+'</div>';}
    var viewer=root.document.createElement('dialog');viewer.className='ref-viewer';viewer.setAttribute('aria-labelledby','ref-viewer-title');
    viewer.innerHTML='<header><strong id="ref-viewer-title">来源原图</strong><div class="ref-viewer-tools"><button type="button" class="seg" data-ref-zoom="out" aria-label="缩小原图">−</button><output aria-live="polite">100%</output><button type="button" class="seg" data-ref-zoom="in" aria-label="放大原图">＋</button><button type="button" class="seg" data-ref-zoom="reset">适应宽度</button><button type="button" class="seg" data-ref-close>关闭</button></div></header><p class="ref-muted">可滚动查看；放大后拖动平移，双指缩放。Esc关闭，＋／−缩放。</p><p class="ref-image-status" role="status"></p><button type="button" class="seg" data-ref-retry hidden>重新加载原图</button><div class="ref-image-stage" tabindex="0" aria-label="原图滚动区域"><img alt="" draggable="false"></div><a class="seg" data-ref-original target="_blank" rel="noopener">新标签页查看原始分辨率</a>';
    viewer.querySelector('header').insertAdjacentHTML('afterend','<p class="ref-image-filename" data-ref-image-filename></p>');
    var body=root.document.createElement('div');host.append(body,viewer);
    var img=viewer.querySelector('img'),stage=viewer.querySelector('.ref-image-stage'),status=viewer.querySelector('.ref-image-status');
    function changeZoom(next){zoom=Math.max(0.5,Math.min(4,next));if(fitWidth)img.style.width=(fitWidth*zoom)+'px';viewer.querySelector('output').textContent=Math.round(zoom*100)+'%';}
    img.addEventListener('load',function(){fitWidth=Math.min(img.naturalWidth,stage.clientWidth-2);status.textContent='原始尺寸 '+img.naturalWidth+' × '+img.naturalHeight;viewer.querySelector('[data-ref-retry]').hidden=true;changeZoom(1);});
    img.addEventListener('error',function(){status.textContent='原图加载失败，请检查网络后重试。';viewer.querySelector('[data-ref-retry]').hidden=false;});
    function closeViewer(){if(viewer.open)viewer.close();}
    viewer.addEventListener('close',function(){pointers.clear();if(host.hidden)return;var target=restoreButton&&restoreButton.isConnected?restoreButton:body.querySelector('h2');if(target)target.focus({preventScroll:true});});
    viewer.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ref-close'))closeViewer();if(b.dataset.refZoom)changeZoom(b.dataset.refZoom==='reset'?1:zoom*(b.dataset.refZoom==='in'?1.25:0.8));if(b.hasAttribute('data-ref-retry')){status.textContent='正在重新加载原图…';var src=img.src;img.removeAttribute('src');img.src=src;}});
    viewer.addEventListener('keydown',function(e){if(e.key==='+'||e.key==='='){e.preventDefault();changeZoom(zoom*1.25);}if(e.key==='-'){e.preventDefault();changeZoom(zoom*0.8);}});
    stage.addEventListener('wheel',function(e){if(e.ctrlKey){e.preventDefault();changeZoom(zoom*(e.deltaY<0?1.1:0.9));}},{passive:false});
    stage.addEventListener('pointerdown',function(e){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(e.pointerType==='touch'||zoom>1){stage.setPointerCapture(e.pointerId);e.preventDefault();}if(pointers.size===2){var p=Array.from(pointers.values());pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
    stage.addEventListener('pointermove',function(e){if(!pointers.has(e.pointerId))return;var old=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){var p=Array.from(pointers.values()),distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch)changeZoom(zoom*distance/pinch);pinch=distance;e.preventDefault();}else if(e.pointerType==='touch'||zoom>1){stage.scrollLeft-=e.clientX-old.x;stage.scrollTop-=e.clientY-old.y;e.preventDefault();}});
    ['pointerup','pointercancel','pointerleave'].forEach(function(type){stage.addEventListener(type,function(e){pointers.delete(e.pointerId);pinch=0;});});
    function openImage(path,button){
      if(!data.images.some(function(i){return i.path===path;}))return;
      restoreButton=button;fitWidth=0;changeZoom(1);status.textContent='正在加载原图…';
      viewer.querySelector('#ref-viewer-title').textContent='来源原图';
      viewer.querySelector('[data-ref-image-filename]').textContent=path.split('/').pop();
      viewer.querySelector('[data-ref-image-filename]').title=path;
      var url=encodeURI('assets/other-reference/sources/'+path);
      viewer.querySelector('[data-ref-original]').href=url;viewer.showModal();img.style.width='100%';img.alt=path;img.src=url;stage.scrollTo(0,0);
    }
    function home(){
      body.innerHTML='<section class="panel"><h2 tabindex="-1">其他资料 · 九分区</h2><p class="ref-muted">选择资料分类查询；本模块只读，不影响个人进度与库存。</p><nav class="ref-index" aria-label="其他资料目录">'+data.sections.map(function(s,i){return '<button type="button" data-ref-section="'+s.id+'"><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(s.name)+'</strong><small>'+esc(s.description)+'</small></button>';}).join('')+'</nav><details class="ref-provenance"><summary>资料来源与修订记录</summary><p>31张原图及补充图已按字节保留。密集文字尚未完整逐字复核的子表会明确标记；原编号14已更换为功能开放等级，误传图仅留档。</p><a class="seg" href="assets/other-reference/sources/图片清单与SHA256.json" target="_blank" rel="noopener">查看图片来源与SHA-256清单</a><p>三册传说卡册防御采用用户确认的120,000，不采用原图误写的60,000。</p>'+sourceButtons(data.images.filter(function(i){return i.path.includes('误传原图留档');}).map(function(i){return i.path;}),true)+'</details></section>';
    }
    function sectionTables(){var list=tables.filter(function(t){return t.section===sectionId;});if(sectionId==='cards')list.sort(function(a,b){return (a.id==='cards-album'?1:0)-(b.id==='cards-album'?1:0);});if(sectionId==='levels')list.sort(function(a,b){return (a.id==='levels-features'?-1:0)-(b.id==='levels-features'?-1:0);});return list;}
    function currentTable(){var s=state(),list=sectionTables();return list.find(function(t){return t.id===s.table;})||list[0];}
    function controls(){
      var s=state(),section=data.sections.find(function(x){return x.id===sectionId;}),list=sectionTables(),table=currentTable();
      if(table)s.table=table.id;
      body.innerHTML='<section class="panel ref-section"><header class="ref-heading"><h2 tabindex="-1">'+esc(section.name)+'</h2><button type="button" class="seg" data-ref-home>返回九分区</button></header><div class="ref-controls"><label>查找资料<input type="search" data-ref-search placeholder="名称、等级、属性或来源关键词" value="'+esc(s.query)+'"></label><label'+(list.length===1?' hidden':'')+'>资料栏目<select data-ref-table>'+groupedOptions(list,s.table)+'</select></label><label data-ref-quality-label hidden>品质<select data-ref-quality><option value="">全部品质</option></select></label><label'+(sectionId==='levels'?'':' hidden')+'>等级区间<select data-ref-band><option value="">全部等级</option>'+Array.from({length:11},function(_,i){return '<option value="'+(i*10)+'">'+(i*10)+'–'+Math.min(100,i*10+9)+'级</option>';}).join('')+'</select></label><label>展示方式<select data-ref-view><option value="auto"'+(s.view==='auto'?' selected':'')+'>推荐视图</option><option value="table"'+(s.view==='table'?' selected':'')+'>原始对照表</option><option value="cards"'+(s.view==='cards'?' selected':'')+'>逐项卡片</option></select></label><label data-ref-sort-label'+(sectionId==='speed'?'':' hidden')+'>浏览排序<select data-ref-sort><option value="source">原图顺序</option><option value="panel">面板速度降序</option><option value="pvp">PVP速度降序</option></select></label><button class="seg" type="button" data-ref-clear>清除筛选</button></div><div data-ref-results aria-live="polite"></div><details class="ref-source-index"><summary>本分区全部原图 · '+section.sourcePaths.length+'张</summary>'+sourceButtons(section.sourcePaths,true)+'</details></section>';
      body.querySelector('[data-ref-sort]').value=s.sort;body.querySelector('[data-ref-band]').value=s.band;
      if(sectionId==='disciples')body.querySelector('[data-ref-clear]').insertAdjacentHTML('beforebegin','<label>快捷查找等级<select data-ref-level-search><option value="">全部等级</option></select></label>');
      fillQuality();results();
    }
    function fillQuality(){var table=currentTable(),s=state(),select=body.querySelector('[data-ref-quality]'),label=body.querySelector('[data-ref-quality-label]'),index=table?table.columns.indexOf('品质'):-1;label.hidden=index<0;var values=index<0?[]:Array.from(new Set(table.rows.map(function(row){return row[index];})));select.innerHTML='<option value="">全部品质</option>'+values.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');if(!values.includes(s.quality))s.quality='';select.value=s.quality;
      var level=body.querySelector('[data-ref-level-search]');if(level){var levels=Array.from(new Set(table.rows.flatMap(function(row){return row.slice(0,2);}).filter(function(v){return /^\d+级$/.test(v);})));level.innerHTML='<option value="">全部等级</option>'+levels.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');level.value=levels.includes(s.query)?s.query:'';}
    }
    function renderTable(table,rows){
      var s=state();
      if(!rows.length)return '<p class="ref-empty" role="status">未找到匹配资料。试试其他关键词，或清除筛选。</p>';
      if(table.id==='origins-all'&&s.view==='auto'){
        var groups=new Map();rows.forEach(function(row){if(!groups.has(row[0]))groups.set(row[0],[]);groups.get(row[0]).push(row);});
        return '<div class="ref-origins">'+Array.from(groups.entries()).map(function(entry){return '<details data-ref-origin><summary><strong>'+esc(entry[0])+'</strong><span>'+entry[1].length+'条来源记录</span></summary><ol>'+entry[1].map(function(row){return '<li data-ref-origin-record><span>'+esc(row[1])+'</span><small>'+esc(row[2])+'</small></li>';}).join('')+'</ol></details>';}).join('')+'</div>';
      }
      if((sectionId==='levels'||sectionId==='disciples')&&s.view==='auto'&&host.getBoundingClientRect().width<760){
        return '<ol class="ref-timeline">'+rows.map(function(row){return '<li><strong>'+esc(row[0])+'</strong><dl>'+table.columns.slice(1).map(function(c,i){return '<div><dt>'+esc(c)+'</dt><dd>'+esc(row[i+1])+'</dd></div>';}).join('')+'</dl></li>';}).join('')+'</ol>';
      }
      if(sectionId==='guardians'&&s.view==='auto'&&host.getBoundingClientRect().width<760&&/aid-|base-skills/.test(table.id)){
        var nameIndex=Math.max(0,table.columns.indexOf('神将名称'));
        return '<div class="ref-skill-list">'+rows.map(function(row){return '<details><summary>'+esc(row[nameIndex])+(nameIndex?' <small>编号 '+esc(row[0])+'</small>':'')+'</summary><div class="ref-detail-body"><dl>'+table.columns.map(function(c,i){return '<div><dt>'+esc(c)+'</dt><dd>'+esc(row[i])+'</dd></div>';}).join('')+'</dl></div></details>';}).join('')+'</div>';
      }
      if(/^speed-(paid|free)-ranking$/.test(table.id)){
        var name=table.columns.indexOf('神将名称'),panel=table.columns.indexOf('面板速度'),pvp=table.columns.indexOf('PVP速度'),order=[name,0,panel,pvp].concat(table.columns.map(function(c,i){return i;}).filter(function(i){return [name,0,panel,pvp].indexOf(i)<0;}));
        if(s.view==='auto'&&host.getBoundingClientRect().width<760)return '<div class="ref-speed-cards"><div class="ref-speed-head"><span>原图名次／名称</span><span>面板</span><span>PVP</span></div>'+rows.map(function(row){return '<details class="ref-speed-row"><summary><span><small>原图第'+esc(row[0])+'名</small><strong>'+esc(row[name])+'</strong></span><b>'+esc(row[panel])+'</b><b>'+esc(row[pvp])+'</b></summary><div class="ref-detail-body"><p class="ref-muted">完整来源构成</p><dl>'+table.columns.map(function(c,i){return '<div><dt>'+esc(c)+'</dt><dd>'+esc(row[i])+'</dd></div>';}).join('')+'</dl></div></details>';}).join('')+'</div>';
        table=Object.assign({},table,{columns:order.map(function(i){return table.columns[i];})});rows=rows.map(function(row){return order.map(function(i){return row[i];});});
      }
      if(s.view==='cards')return '<div class="ref-card-grid">'+rows.map(function(row){return '<article class="ref-row-card"><h3>'+esc(row[0])+'</h3><dl>'+table.columns.slice(1).map(function(c,i){return '<div><dt>'+esc(c)+'</dt><dd>'+esc(row[i+1])+'</dd></div>';}).join('')+'</dl></article>';}).join('')+'</div>';
      return '<div class="ref-table-scroll" tabindex="0" role="region" aria-label="'+esc(titleFor(table))+'对照表"><table class="ref-table"><caption class="ref-visually-hidden">'+esc(titleFor(table))+'</caption><thead><tr>'+table.columns.map(function(c){return '<th scope="col">'+esc(c)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v,i){var quality=table.columns[i]==='品质'&&/^[蓝紫橙红]$/.test(v);return i===0?'<th scope="row">'+esc(v)+'</th>':'<td'+(String(v).length>20?' class="ref-long-text"':'')+'>'+(quality?'<span class="ref-quality ref-quality-'+({'蓝':'blue','紫':'purple','橙':'orange','红':'red'}[v])+'">'+esc(v)+'</span>':esc(v))+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
    }
    function results(){
      var table=currentTable(),s=state(),html='';
      if(table){
        var rows=filterRows(table,s.query,s.quality);if(sectionId==='levels'&&s.band!=='')rows=rows.filter(function(row){return matchesLevelBand(row[0],s.band);});
        if(sectionId==='speed'&&s.sort!=='source'){var index=table.columns.findIndex(function(c){return s.sort==='pvp'?/PVP/i.test(c):/面板/.test(c);});if(index>=0)rows=rows.slice().sort(function(a,b){return parseFloat(String(b[index]).replace(/,/g,''))-parseFloat(String(a[index]).replace(/,/g,''));});}
        var quantity=table.id==='elements-cost'?'各列数字表示对应五行属性所需的该气蕴数量。':table.id==='elements-stones'?'各列数字为五极石对应五行的需求数量，与属性增益资料分开查看。':'';
        var count=table.id==='origins-all'&&s.view==='auto'?new Set(rows.map(function(r){return r[0];})).size+'名弟子 · '+rows.length+'条来源记录':'匹配 '+rows.length+'／'+table.rows.length+'条';
        html=(quantity?'<p class="ref-quantity-note">'+quantity+'</p>':'')+'<div class="ref-result-toolbar"><span>'+count+'</span>'+sourceButtons(table.sourcePaths||[])+'</div>'+(table.verification==='partial'?'<p class="ref-warning" role="note">部分转录 · 存在待核对内容，请结合原图查看</p>':'')+renderTable(table,rows)+'<details data-ref-audit><summary>资料依据与审核详情</summary><p class="ref-status">'+(table.verification==='partial'?'部分转录 · 具体缺项见下方':table.verification==='user-confirmed'?'用户已确认修订':'据原图人工转录')+'</p><p class="ref-note">'+esc(table.note||'仅展示来源数据，不提供计算或推荐。')+'</p>'+sourceButtons(table.sourcePaths||[],true)+'</details>';
      }else html='<p class="ref-note">本分区高密文字尚待逐条复核，先提供清晰原图，不以猜测数值替代。</p>';
      if(sectionId==='cards'){
        var guides=data.guides.filter(function(g){return !s.query||g.title.includes(s.query)||g.text.includes(s.query);});
        html+='<section class="ref-guides"><h3>红卡攻略 · 六节</h3><details class="ref-guide-library"><summary>查看攻略章节（'+guides.length+'）</summary><p class="ref-note">以下数值、公式和概率为攻略作者示例，不作为工具计算公式。三册防御已按用户确认采用12万。</p>'+guides.map(function(g){return '<details><summary>'+esc(g.title)+'</summary><div class="ref-guide-text">'+esc(g.text)+'</div>'+sourceButtons(g.sourcePaths)+'</details>';}).join('')+'</details></section>';
      }
      body.querySelector('[data-ref-results]').innerHTML=html;
    }
    body.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;
      if(b.dataset.refSection){homeScroll=root.scrollY;sectionId=b.dataset.refSection;controls();root.scrollTo({top:state().scroll||0,behavior:'instant'});body.querySelector('h2').focus({preventScroll:true});}
      else if(b.hasAttribute('data-ref-home')){state().scroll=root.scrollY;sectionId='';home();root.scrollTo({top:homeScroll,behavior:'instant'});body.querySelector('h2').focus({preventScroll:true});}
      else if(b.dataset.refImage)openImage(b.dataset.refImage,b);
      else if(b.hasAttribute('data-ref-clear')){var s=state();s.query='';s.quality='';s.band='';body.querySelector('[data-ref-band]').value='';body.querySelector('[data-ref-search]').value='';body.querySelector('[data-ref-quality]').value='';var level=body.querySelector('[data-ref-level-search]');if(level)level.value='';results();}
    });
    body.addEventListener('input',function(e){if(e.target.hasAttribute('data-ref-search')){state().query=e.target.value;var level=body.querySelector('[data-ref-level-search]');if(level)level.value=e.target.value;if(!e.isComposing)results();}});
    body.addEventListener('compositionend',function(e){if(e.target.hasAttribute('data-ref-search')){state().query=e.target.value;results();}});
    body.addEventListener('change',function(e){if(e.target.hasAttribute('data-ref-search')||!e.target.matches('select'))return;var s=state();if(e.target.hasAttribute('data-ref-table')){s.perTable[s.table]={query:s.query,quality:s.quality,view:s.view,sort:s.sort,band:s.band};s.table=e.target.value;Object.assign(s,s.perTable[s.table]||{query:'',quality:'',view:'auto',sort:'source',band:''});body.querySelector('[data-ref-band]').value=s.band;body.querySelector('[data-ref-search]').value=s.query;body.querySelector('[data-ref-view]').value=s.view;body.querySelector('[data-ref-sort]').value=s.sort;fillQuality();}if(e.target.hasAttribute('data-ref-band'))s.band=e.target.value;if(e.target.hasAttribute('data-ref-quality'))s.quality=e.target.value;if(e.target.hasAttribute('data-ref-view'))s.view=e.target.value;if(e.target.hasAttribute('data-ref-sort'))s.sort=e.target.value;if(e.target.hasAttribute('data-ref-level-search')){s.query=e.target.value;body.querySelector('[data-ref-search]').value=s.query;}results();});
    root.document.addEventListener('qinshi:partitionchange',function(e){if(e.detail.name!=='other-reference')closeViewer();});
    home();
    var narrow=host.getBoundingClientRect().width<760,resizePending=false;
    if(root.ResizeObserver)new root.ResizeObserver(function(){var next=host.getBoundingClientRect().width<760;if(next===narrow||host.hidden)return;narrow=next;if(!sectionId||resizePending)return;resizePending=true;root.requestAnimationFrame(function(){resizePending=false;if(sectionId&&!host.hidden)results();});}).observe(host);
  }
  return {init:init,filterRows:filterRows,tablesFor:tablesFor,matchesLevelBand:matchesLevelBand};
});
