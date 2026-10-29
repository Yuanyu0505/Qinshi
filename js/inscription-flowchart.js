(function (root, factory) {
  'use strict';
  var common=typeof module==='object'&&module.exports;
  var api=factory(common?require('./inscription-rules.js'):root.InscriptionRules,common?require('./inscription-terms.js'):root.InscriptionTerms,common?require('./inscription-flow-model.js'):root.InscriptionFlowModel);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionFlowchart=api;
})(typeof window!=='undefined'?window:null,function(R,T,Model){
  'use strict';
  var serial=0;
  var wireColors=['#0072b2','#c45100','#00856a','#a339a3','#b72745','#6351bd','#626b16','#445563'];
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function qLabel(id){return R.qualities.find(function(q){return q.id===id;}).label;}
  function percent(value){var n=value*100,i=Math.round(n);return value>0&&i===0?'不足1%':value<1&&i===100?'超过99%':(Math.abs(n-i)>1e-8?'约':'')+i+'%';}
  function termKey(term){return term.attr+':'+term.tier;}
  function terms(material,symbols){
    var parts=[];
    T.sortTerms(material.terms,material.quality).forEach(function(t,index){
      if(index)parts.push({text:'＋'});
      if(symbols&&symbols.has(termKey(t))){parts.push({text:'杂词条 X（同一个）'});return;}
      var value=T.describe(t,material.quality);
      parts.push({text:value.body,role:'value',rank:value.rank},{text:value.suffix,role:'tier'});
    });
    return [{parts:parts}];
  }
  function lineText(line){return typeof line==='string'?line:line.parts.map(function(part){return part.text;}).join('');}
  function lineHtml(line){
    if(typeof line==='string')return esc(line);
    return line.parts.map(function(part){
      var css=part.role==='value'?'ins-term-value ins-term-'+part.rank:part.role==='tier'?'ins-term-tier':'';
      return '<tspan'+(css?' class="'+css+'"':'')+'>'+esc(part.text)+'</tspan>';
    }).join('');
  }
  function wrap(lines,width){
    var limit=(width-32)/14,result=[];
    lines.forEach(function(line){
      var rich=typeof line!=='string',parts=rich?line.parts:[{text:line}],picked=[],size=0;
      function flush(){result.push(rich?{parts:picked}:picked.map(function(p){return p.text;}).join(''));picked=[];size=0;}
      parts.forEach(function(part){Array.from(part.text).forEach(function(c){
        var weight=/[\u0000-\u00ff]/.test(c)?0.6:1;
        if(size+weight>limit&&picked.length)flush();
        var last=picked[picked.length-1];
        if(last&&last.role===part.role&&last.rank===part.rank)last.text+=c;
        else picked.push({text:c,role:part.role,rank:part.rank});
        size+=weight;
      });});flush();
    });
    return result;
  }
  function box(id,x,y,width,lines,kind){
    // A complete stat combination is indivisible. Widen the local scrollable
    // canvas instead of splitting a term or placing each stat on another line.
    lines.forEach(function(line){if(typeof line!=='string')width=Math.max(width,Math.ceil(Array.from(lineText(line)).reduce(function(sum,c){return sum+(/[\u0000-\u00ff]/.test(c)?8.4:14);},0))+48);});
    var text=wrap(lines,width);return{id:id,x:x,y:y,w:width,h:24+text.length*20,lines:text,kind:kind||'material'};
  }
  function edge(from,to,label,extra){return Object.assign({from:from,to:to,label:label||''},extra||{});}
  function path(points){
    var a=points[0],b=points[1],c=points[2],d=points[3];
    if(a.x===d.x)return 'M '+a.x+' '+a.y+' V '+d.y;
    var sign=d.x>a.x?1:-1,r=Math.min(9,Math.abs(d.x-a.x)/2,Math.abs(b.y-a.y)/2,Math.abs(d.y-c.y)/2);
    return 'M '+a.x+' '+a.y+' V '+(b.y-r)+' Q '+b.x+' '+b.y+' '+(b.x+sign*r)+' '+b.y+
      ' H '+(c.x-sign*r)+' Q '+c.x+' '+c.y+' '+c.x+' '+(c.y+r)+' V '+d.y;
  }
  function svg(title,nodes,edges,width,height,stages){
    var id='ins-flow-'+(++serial),map=new Map(nodes.map(function(n){return[n.id,n];})),labels=[];
    var connections=edges.map(function(e){
      var from=map.get(e.from),to=map.get(e.to),a={x:from.x+from.w*(e.fromPort===undefined?0.5:e.fromPort),y:from.y+from.h};
      var d={x:to.x+to.w*(e.toPort===undefined?0.5:e.toPort),y:to.y};
      var via=e.viaY===undefined?(a.y+d.y)/2:e.viaY;
      if(e.label){
        var lines=wrap(Array.isArray(e.label)?e.label:[e.label],230),w=Math.min(230,Math.max(64,Math.max.apply(null,lines.map(function(s){return Array.from(s).reduce(function(n,c){return n+(/[\u0000-\u00ff]/.test(c)?8.4:14);},0);}))+24));
        var h=lines.length*18+10,x=e.labelX===undefined?d.x:e.labelX,y=e.labelY===undefined?d.y-44:e.labelY;
        labels.push('<g class="craft-flow-label"><rect x="'+(x-w/2)+'" y="'+(y-h/2)+'" width="'+w+'" height="'+h+'" rx="'+Math.min(15,h/2)+'"/>'+lines.map(function(line,i){return '<text x="'+x+'" y="'+(y-(lines.length-1)*9+i*18)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>');
      }
      return '<path class="craft-flow-connection" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'" style="stroke:'+wireColors[from.wireColor]+'" d="'+path([a,{x:a.x,y:via},{x:d.x,y:via},d])+'" marker-end="url(#'+id+'-arrow-'+from.wireColor+')"/>';
    }).join('');
    var description=nodes.map(function(n){return n.lines.map(lineText).join('，');}).join('；')+'。'+edges.filter(function(e){return e.label;}).map(function(e){return lineText(map.get(e.from).lines[0])+' → '+lineText(map.get(e.to).lines[0])+'：'+[].concat(e.label).join('，');}).join('；');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="craft-flow-svg" role="img" aria-labelledby="'+id+'-title '+id+'-desc" viewBox="0 0 '+width+' '+height+'" width="'+Math.round(width*0.9)+'" height="'+Math.round(height*0.9)+'" data-flow-width="'+width+'" data-flow-height="'+height+'">'+
      '<title id="'+id+'-title">'+esc(title)+'</title><desc id="'+id+'-desc">'+esc(description)+'</desc>'+
      '<defs>'+wireColors.map(function(color,i){return '<marker id="'+id+'-arrow-'+i+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="'+color+'" stroke-width="1.8"/></marker>';}).join('')+'</defs>'+
      stages.map(function(stage){return '<g class="craft-flow-stage craft-flow-stage-'+stage.kind+'"><rect x="4" y="'+stage.top+'" width="'+(width-8)+'" height="'+(stage.bottom-stage.top)+'" rx="12"/><text x="18" y="'+(stage.top+20)+'">'+stage.label+'</text></g>';}).join('')+connections+
      nodes.map(function(n){return '<g class="craft-flow-box craft-flow-'+n.kind+'" data-flow-node="'+esc(n.id)+'" role="button" tabindex="0" aria-label="'+esc(n.lines.map(lineText).join('，'))+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="17"/>'+n.lines.map(function(line,i){return '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+22+i*20)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>';}).join('')+labels.join('')+'</svg>';
  }
  function figure(title,drawing,note,actions){
    return '<section class="craft-flow-step"><h5>'+esc(title)+'</h5><div class="craft-flow-viewer" data-flow-viewer data-zoom="0.9">'+
      '<div class="craft-flow-toolbar"><span>同源连线同色；点选节点突出来源和去向，Esc取消</span><div>'+(actions||'')+control('width','适合宽度')+control('all','完整总览')+control('out','缩小')+control('reset','90%')+control('in','放大')+'</div></div>'+
      '<div class="craft-flow-viewport" tabindex="0" role="region" aria-label="'+esc(title)+'，可左右滚动">'+drawing+'</div></div>'+
      (note?'<p class="craft-note">'+esc(note)+'</p>':'')+'</section>';
  }
  function control(action,label){return '<button type="button" class="seg" data-craft-action="diagram-'+action+'" aria-label="'+esc(action==='reset'?'恢复当前流程图默认比例90%':label+'当前流程图')+'">'+esc(label)+'</button>';}
  function letter(index){var result='';do{result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26)-1;}while(index>=0);return result;}
  function render(route,x,settings){
    settings=settings||{};
    var graph=Model.project(route,x), nodes=[],edges=[],visual=new Map(),opVisual=new Map(),details=[];
    var byMaterial=new Map(graph.materials.map(function(m){return [m.id,m];})),byOperation=new Map(graph.operations.map(function(o){return [o.id,o];}));
    var levels={b2:0,p1:2,p2:4,o1:6,o2:8};
    function add(id,lines,level,kind,width){
      var n=box(id,0,0,width||240,lines,kind);n.level=level;nodes.push(n);return n;
    }
    function info(op){
      var count=R.qualities.find(function(q){return q.id===op.quality;}).count;
      var unknown=op.inputs.some(function(input){return byMaterial.get(input.id).material.terms.some(function(t){return t.tier==='?';});});
      if(op.kind==='reuse')return [{parts:[{text:'候选词条池必须覆盖全部目标词条，目前'+op.candidateCount+'选'+count}]}];
      if(unknown)return ['蓝二速度档位不可辨'];
      return [op.candidateCount+'种候选，'+op.candidateCount+'选'+count];
    }
    function drawnTerms(m){return terms(m.material,new Set(m.symbols));}
    graph.materials.filter(function(m){return m.useful;}).forEach(function(m,index){
      var op=byOperation.get(m.producer),multi=op&&op.outputs.length>1;
      var title=qLabel(m.material.quality)+' '+(multi?'可用产物 ':'')+'M'+(index+1);
      var lines=[title].concat(drawnTerms(m));
      if(m.kind==='base')lines[0]='准备'+qLabel(m.material.quality);
      else if(m.kind==='wash')lines=lines.concat(['另行置换合成素材铭文','当前概率：未知']);
      else if(op&&op.outputs.length===1&&op.kind==='craft')lines=lines.concat(info(op),op.promotion?[op.promotion+'晋升铭文 × 1']:[],['当前概率：100%']);
      else if(m.probability!==null)lines.push('当前概率：'+percent(m.probability));
      if(m.kind!=='base')lines.push(m.demand?'本路线需'+m.demand+'枚':'可替代同款材料（不重复计量）');
      visual.set(m.id,add(m.id,lines,levels[m.material.quality],m.kind==='base'?'material':'success'));
    });
    var reuseNumber=0;
    graph.operations.forEach(function(op){
      var useful=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return m.useful;});
      var unused=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return !m.useful;});
      var folded=op.kind==='wash'||op.kind==='craft'&&op.outputs.length===1&&useful.length===1;
      var operation;
      if(folded)operation=visual.get(useful[0].id);
      else {
        var lines=op.kind==='reuse'?['失败品复用'+(++reuseNumber),'三枚失败材料，同种可重复'].concat(info(op)):
          info(op).concat(['每次随机产出一枚'],op.promotion?[op.promotion+'晋升铭文 × 1']:[]);
        if(op.kind==='reuse'){
          var hit=op.outputs.find(function(o){return o.id===graph.targetId;});
          lines.push('当前概率：'+percent(hit?hit.probability:0));
        }
        if(unused.length&&op.kind!=='reuse')lines.push('另有'+unused.length+'种产物，见下方明细');
        operation=add(op.id,lines,levels[op.quality]-1,'operation');
        useful.forEach(function(m){edges.push(edge(operation.id,visual.get(m.id).id));});
      }
      opVisual.set(op.id,operation);
      if(unused.length){
        var total=op.outputs.filter(function(out){return !byMaterial.get(out.id).useful;}).reduce(function(sum,out){return sum+out.probability;},0);
        details.push('<section class="craft-unused-group"><h6>'+esc((op.kind==='reuse'?'复用其他结果':'其他产物（本路线暂不使用）')+' · '+qLabel(op.quality)+' · 合计 '+percent(total))+'</h6>'+
          unused.map(function(m,i){var prefix=(op.kind==='reuse'?'复用失败':'失败')+qLabel(m.material.quality)+' '+letter(i)+(graph.operations.indexOf(op)+1)+'：';
            return '<p>'+esc(prefix)+T.sortTerms(m.material.terms,m.material.quality).map(function(t){return m.symbols.includes(termKey(t))?'杂词条 X（同一个）':T.html(t,m.material.quality);}).join(' ＋ ')+' ｜ '+percent(m.probability)+'</p>';
          }).join('')+'</section>');
        var usedForReuse=unused.filter(function(m){return graph.operations.some(function(other){return other.kind==='reuse'&&other.inputs.some(function(input){return input.id===m.id;});});});
        if(usedForReuse.length){
          var group=add('other-'+op.id,['可复用产物 '+usedForReuse.length+'种','具体词条见下方明细'],levels[op.quality],'failure',200);
          edges.push(edge(operation.id,group.id));
          usedForReuse.forEach(function(m){visual.set(m.id,group);});
        }
      }
    });
    graph.operations.forEach(function(op){
      var to=opVisual.get(op.id),merged=new Map();
      op.inputs.forEach(function(input){
        var from=visual.get(input.id);if(!from)return;
        if(!merged.has(from.id))merged.set(from.id,{from:from,quantity:0});
        merged.get(from.id).quantity+=input.quantity;
      });
      merged.forEach(function(input){edges.push(edge(input.from.id,to.id,'× '+input.quantity));});
    });
    var width=360,y=12,gap=18,rows=[],stages=[],stage;
    for(var level=0;level<=8;level++){
      var row=nodes.filter(function(n){return n.level===level;});
      if(!row.length)continue;
      var span=row.reduce(function(sum,n){return sum+n.w;},0)+gap*(row.length-1);
      rows.push({nodes:row,span:span,level:level});width=Math.max(width,span+32);
    }
    var byId=new Map(nodes.map(function(n){return[n.id,n];}));
    rows.forEach(function(row){
      var kind=row.level<2?'blue':row.level<6?'purple':'orange';
      if(!stage||stage.kind!==kind){stage={kind:kind,label:kind==='blue'?'蓝色品质流程':kind==='purple'?'紫色品质流程':'橙色品质流程',top:y,bottom:y};stages.push(stage);y+=32;}
      row.nodes.forEach(function(n){
        var parents=edges.filter(function(e){return e.to===n.id;}).map(function(e){return byId.get(e.from);}).filter(function(p){return p.level<n.level;});
        n.order=parents.length?parents.reduce(function(sum,p){return sum+p.x+p.w/2;},0)/parents.length:nodes.indexOf(n)*100;
      });
      row.nodes.sort(function(a,b){return a.order-b.order;});
      var left=(width-row.span)/2,height=Math.max.apply(null,row.nodes.map(function(n){return n.h;}));
      row.nodes.forEach(function(n,i){n.x=left;n.y=y+height-n.h;n.wireColor=i%wireColors.length;left+=n.w+gap;});
      y+=height+42;stage.bottom=y-30;
    });
    edges.forEach(function(e){
      var from=byId.get(e.from),to=byId.get(e.to);
      e.viaY=from.y+from.h+30;
      if(e.label){e.labelX=from.x+from.w/2;e.labelY=from.y+from.h+18;}
      var incoming=edges.filter(function(other){return other.to===e.to;}).sort(function(a,b){return byId.get(a.from).x-byId.get(b.from).x;});
      e.toPort=(incoming.indexOf(e)+1)/(incoming.length+1);
    });
    var title='完整合成流程'+(settings.positionLabel?' · '+settings.positionLabel:'');
    var xTerm=route.xTerm===undefined?(x?{attr:x,tier:'U'}:null):route.xTerm,symbolic=route.symbolicX!==false;
    var xNote=!xTerm?'':symbolic?'符号模板 A：X 采用同一种合法不分档词条；概率只对该模板条件成立。':'具体模式 B：杂词 X 固定为'+xTerm.attr+'（'+T.tierLabel(xTerm.tier)+'），不替换属性或档位。';
    var drawing=svg(title,nodes,edges,width,y-22,stages);
    var actions=details.length?'<button type="button" class="seg" data-craft-action="diagram-failures" aria-expanded="'+Boolean(settings.showFailures)+'">'+(settings.showFailures?'收起所有失败结果':'展开所有失败结果')+'</button>':'';
    return '<div class="craft-flow-guide">共享入口每次只产出一枚，不会同时获得所有分支。需求按从零制作目标一枚累计，随机步骤需按实际产出收集；箭头×数量是每批投料。</div>'+
      (xNote?'<p class="craft-note">'+esc(xNote)+'</p>':'')+
      figure(title,drawing,'概率为原路线等概率模型，非游戏实测频率。置换概率未知。独立洗练另行准备素材；共享入口不代表重复使用同一枚材料。',actions)+
      (details.length?'<div class="craft-flow-details" data-flow-details'+(settings.showFailures?'':' hidden')+'>'+details.join('')+'</div>':'');
  }
  function zoom(viewer,action){
    if(!viewer)return;var drawing=viewer.querySelector('svg');if(!drawing)return;
    var current=Number(viewer.dataset.zoom)||0.9,next=action==='reset'?0.9:Math.max(0.5,Math.min(1.6,Math.round((current+(action==='in'?0.1:-0.1))*10)/10));
    var viewport=viewer.querySelector('.craft-flow-viewport');
    if(action==='width'||action==='all'){
      next=Math.min(1,(viewport.clientWidth-12)/Number(drawing.dataset.flowWidth));
      if(action==='all')next=Math.min(next,(Math.min(700,viewport.clientHeight||700)-12)/Number(drawing.dataset.flowHeight));
      next=Math.max(0.1,next);
    }
    viewer.dataset.zoom=String(next);drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*next)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*next)+'px';
    var reset=viewer.querySelector('[data-craft-action="diagram-reset"]');if(reset)reset.textContent=Math.round(next*100)+'%';
  }
  function bind(viewer){
    if(!viewer||viewer.dataset.flowBound)return;viewer.dataset.flowBound='true';
    function focus(id){
      var boxes=Array.from(viewer.querySelectorAll('[data-flow-node]')),wires=Array.from(viewer.querySelectorAll('[data-from]'));
      var selected=new Set(id?[id]:[]);
      if(id){
        // Traverse upstream and downstream separately: a sibling sharing one
        // input is not automatically part of this material's dependency chain.
        ['up','down'].forEach(function(direction){var seen=new Set([id]),queue=[id];while(queue.length){var next=queue.pop();wires.forEach(function(wire){var a=wire.dataset.from,b=wire.dataset.to;if((direction==='up'?b:a)===next){var other=direction==='up'?a:b;if(!seen.has(other)){seen.add(other);selected.add(other);queue.push(other);}}});}});
      }
      viewer.dataset.flowFocus=id||'';
      boxes.forEach(function(box){box.classList.toggle('is-focused',box.dataset.flowNode===id);box.classList.toggle('is-dimmed',!!id&&!selected.has(box.dataset.flowNode));box.setAttribute('aria-pressed',String(box.dataset.flowNode===id));});
      wires.forEach(function(wire){wire.classList.toggle('is-dimmed',!!id&&!(selected.has(wire.dataset.from)&&selected.has(wire.dataset.to)));});
    }
    viewer.addEventListener('click',function(event){var box=event.target.closest('[data-flow-node]');if(box)focus(viewer.dataset.flowFocus===box.dataset.flowNode?'':box.dataset.flowNode);else if(event.target.closest('svg'))focus('');});
    viewer.addEventListener('keydown',function(event){if(event.key==='Escape'){focus('');return;}var box=event.target.closest('[data-flow-node]');if(box&&(event.key==='Enter'||event.key===' ')){event.preventDefault();focus(viewer.dataset.flowFocus===box.dataset.flowNode?'':box.dataset.flowNode);}});
  }
  return{render:render,zoom:zoom,bind:bind};
});
