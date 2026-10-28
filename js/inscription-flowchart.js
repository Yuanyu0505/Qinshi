(function (root, factory) {
  'use strict';
  var common=typeof module==='object'&&module.exports;
  var api=factory(common?require('./inscription-rules.js'):root.InscriptionRules,common?require('./inscription-terms.js'):root.InscriptionTerms);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionFlowchart=api;
})(typeof window!=='undefined'?window:null,function(R,T){
  'use strict';
  var serial=0;
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function qLabel(id){return R.qualities.find(function(q){return q.id===id;}).label;}
  function percent(value){var n=value*100,i=Math.round(n);return value>0&&i===0?'不足1%':value<1&&i===100?'超过99%':(Math.abs(n-i)>1e-8?'约':'')+i+'%';}
  function terms(material,x){
    return material.terms.map(function(t,index){
      if(t.attr===x)return (index?'＋':'')+'杂词条 X（同一个）';
      var value=T.describe(t,material.quality);
      return {parts:[{text:index?'＋':''},{text:value.body,role:'value',rank:value.rank},{text:value.suffix,role:'tier'}]};
    });
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
  function box(id,x,y,width,lines,kind){var text=wrap(lines,width);return{id:id,x:x,y:y,w:width,h:24+text.length*20,lines:text,kind:kind||'material'};}
  function edge(from,to,label,extra){return Object.assign({from:from,to:to,label:label||''},extra||{});}
  function path(points){
    var a=points[0],b=points[1],c=points[2],d=points[3];
    if(a.x===d.x)return 'M '+a.x+' '+a.y+' V '+d.y;
    var sign=d.x>a.x?1:-1,r=Math.min(9,Math.abs(d.x-a.x)/2,Math.abs(b.y-a.y)/2,Math.abs(d.y-c.y)/2);
    return 'M '+a.x+' '+a.y+' V '+(b.y-r)+' Q '+b.x+' '+b.y+' '+(b.x+sign*r)+' '+b.y+
      ' H '+(c.x-sign*r)+' Q '+c.x+' '+c.y+' '+c.x+' '+(c.y+r)+' V '+d.y;
  }
  function svg(title,nodes,edges,width,height){
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
      return '<path class="craft-flow-connection" d="'+path([a,{x:a.x,y:via},{x:d.x,y:via},d])+'" marker-end="url(#'+id+'-arrow)"/>';
    }).join('');
    var description=nodes.map(function(n){return n.lines.map(lineText).join('，');}).join('；')+'。'+edges.filter(function(e){return e.label;}).map(function(e){return lineText(map.get(e.from).lines[0])+' → '+lineText(map.get(e.to).lines[0])+'：'+[].concat(e.label).join('，');}).join('；');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="craft-flow-svg" role="img" aria-labelledby="'+id+'-title '+id+'-desc" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" data-flow-width="'+width+'" data-flow-height="'+height+'">'+
      '<title id="'+id+'-title">'+esc(title)+'</title><desc id="'+id+'-desc">'+esc(description)+'</desc>'+
      '<defs><marker id="'+id+'-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="#929aa2" stroke-width="1.2"/></marker></defs>'+connections+
      nodes.map(function(n){return '<g class="craft-flow-box craft-flow-'+n.kind+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="17"/>'+n.lines.map(function(line,i){return '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+22+i*20)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>';}).join('')+labels.join('')+'</svg>';
  }
  function figure(title,drawing,note){
    return '<section class="craft-flow-step"><h5>'+esc(title)+'</h5><div class="craft-flow-viewer" data-flow-viewer data-zoom="1">'+
      '<div class="craft-flow-toolbar"><span>左右滑动查看连线</span><div>'+control('out','缩小')+control('reset','100%')+control('in','放大')+'</div></div>'+
      '<div class="craft-flow-viewport" tabindex="0" role="region" aria-label="'+esc(title)+'，可左右滚动">'+drawing+'</div></div>'+
      (note?'<p class="craft-note">'+esc(note)+'</p>':'')+'</section>';
  }
  function control(action,label){return '<button type="button" class="seg" data-craft-action="diagram-'+action+'" aria-label="'+esc(action==='reset'?'恢复当前流程图原始大小':label+'当前流程图')+'">'+esc(label)+'</button>';}
  function identity(node){return node.kind+'|'+R.signature(node.material)+'|'+node.children.map(function(c){return R.signature(c.node.material)+'*'+c.quantity;}).join('|');}
  function letter(index){var result='';do{result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26)-1;}while(index>=0);return result;}
  function collect(route){
    var steps=[],seen=new Map(),results=new Map();
    function visit(node){
      if(node.kind==='base'||node.kind==='failure')return null;
      var key=identity(node);if(seen.has(key))return seen.get(key);
      node.children.forEach(function(c){visit(c.node);});
      var number=steps.length+1,step={node:node,number:number,ref:(node.kind==='craft'&&node.probability<1?'S':'M')+number};
      seen.set(key,step);steps.push(step);
      if(node.kind==='craft'){
        var target=R.signature(node.material),failed=0;
        step.outputs=node.outcomes.slice().sort(function(a,b){return Number(R.signature(b.material)===target)-Number(R.signature(a.material)===target);}).map(function(o){
          var success=R.signature(o.material)===target,label=success?step.ref:letter(failed++)+number;
          var output={material:o.material,probability:o.probability,ref:label,success:success,step:number};
          var sig=R.signature(o.material);if(!results.has(sig))results.set(sig,[]);results.get(sig).push(output);return output;
        });
      }
      return step;
    }
    visit(route.tree);
    return{steps:steps,seen:seen,results:results};
  }
  function inputLines(entry,context,x){
    var node=entry.node,step=context.seen.get(identity(node)),name;
    if(node.kind==='base')name='洗练准备'+qLabel(node.material.quality)+' × '+entry.quantity;
    else if(node.kind==='failure'){
      var refs=context.results.get(R.signature(node.material))||[],failed=refs.find(function(r){return !r.success;});
      name='保留失败'+qLabel(node.material.quality)+' '+(failed?failed.ref:'未编号')+' × '+entry.quantity;
    }else name=(entry.quantity>1?'相同':'前述')+qLabel(node.material.quality)+' '+step.ref+' × '+entry.quantity;
    return [name].concat(terms(node.material,x));
  }
  function candidateInfo(node){
    if(node.kind==='wash')return ['置换 / 洗练','得到指定词条组合'];
    if(node.children.some(function(c){return c.node.material.terms.some(function(t){return t.tier==='?';});}))return ['蓝二速度特殊合成','按合法结果等概率生成'];
    var pool=new Set();node.children.forEach(function(c){c.node.material.terms.forEach(function(t){pool.add(t.attr+':'+t.tier);});});
    var count=R.qualities.find(function(q){return q.id===node.material.quality;}).count;
    if(pool.size<count)return ['候选不足，随机补词条','按完整合法结果分支'];
    var words={1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九'};
    return [pool.size+'种候选，'+(words[pool.size]||pool.size)+'选'+(words[count]||count)];
  }
  function recipeFigure(step,context,x,following){
    var node=step.node,inputs=node.children.map(function(entry){return inputLines(entry,context,x);});
    if(node.promotion)inputs.push([node.promotion+'晋升铭文 × 1']);
    var outputs=node.kind==='wash'?[{material:node.material,probability:null,success:true,ref:step.ref}]:step.outputs;
    var width=Math.max(360,inputs.length*244+24,outputs.length*230+24),nodes=[],edges=[];
    var sources=inputs.map(function(lines,i){return box('input-'+i,(width/inputs.length)*i+(width/inputs.length-220)/2,24,220,lines,i===inputs.length-1&&node.promotion?'promotion':'material');});
    var inputBottom=Math.max.apply(null,sources.map(function(n){return n.y+n.h;}));
    var operation=box('operation',width/2-135,inputBottom+66,270,candidateInfo(node),'operation');nodes=sources.concat([operation]);
    sources.forEach(function(source,i){edges.push(edge(source.id,'operation','',{toPort:(i+1)/(sources.length+1)}));});
    var outputY=operation.y+operation.h+116;
    outputs.forEach(function(o,i){
      var label=(o.success?(outputs.length>1?'成功':'产物'):'失败')+qLabel(o.material.quality)+' '+o.ref;
      var output=box('output-'+i,(width/outputs.length)*i+(width/outputs.length-210)/2,outputY,210,[label].concat(terms(o.material,x)),o.success?'success':'failure');nodes.push(output);
      edges.push(edge('operation',output.id,o.probability===null?'置换概率未知':percent(o.probability),{fromPort:(i+1)/(outputs.length+1)}));
    });
    if(following){
      var prior=nodes.find(function(n){return n.id==='output-0';}),next=following.node;
      var nextOutput=box('following',width/2-125,prior.y+prior.h+125,250,['产物'+qLabel(next.material.quality)+' '+following.ref].concat(terms(next.material,x)),'success');
      nodes.push(nextOutput);edges.push(edge(prior.id,nextOutput.id,'相同'+qLabel(node.material.quality)+' × '+next.children[0].quantity+'，'+percent(next.probability)));
    }
    var height=Math.max.apply(null,nodes.map(function(n){return n.y+n.h;}))+30;
    var title='第 '+step.number+(following?'–'+following.number:'')+' 步｜'+(node.kind==='wash'?'置换准备 '+qLabel(node.material.quality):qLabel(node.children[0].node.material.quality)+' → '+qLabel(node.material.quality))+(following?' → '+qLabel(following.node.material.quality):'');
    var note=node.kind==='wash'?'低档词条只能通过置换准备；此处不是定向合成。置换概率未知。':
      outputs.length>1?'成功品按编号继续使用；失败品也按字母编号保留，后面的复用图会引用这些编号。':following?'先按材料框内数量准备蓝二并合成紫一，再备齐 3 枚相同紫一合成 1 枚紫二；蓝二及初级晋升铭文的准备也需重复 3 份。':'本图制作 1 枚所示产物；后续需要多枚时，重复本步骤及其材料准备。';
    return figure(title,svg(title,nodes,edges,width,height),note);
  }
  function groupText(node,context){
    return node.children.map(function(c){
      if(c.node.kind==='failure'){
        var refs=context.results.get(R.signature(c.node.material))||[],ref=refs.find(function(r){return !r.success;});
        return(ref?ref.ref:'未编号失败品')+(c.quantity>1?' × '+c.quantity:'');
      }
      var step=context.seen.get(identity(c.node));return(step?step.ref:qLabel(c.node.material.quality))+(c.quantity>1?' × '+c.quantity:'');
    }).join(' ＋ ');
  }
  function finishFigure(root,reuse,context,x,positionLabel,index){
    var width=1060,nodes=[],edges=[];
    var leftLines=['成功品路线：'+groupText(root,context)];
    root.children.forEach(function(c){leftLines=leftLines.concat(terms(c.node.material,x));});
    var left=box('ready',45,74,300,leftLines,'material');
    var group=box('failure-group',675,24,330,['失败品互补分组，每组 3 枚',groupText(reuse,context)],'material');
    var lowerQuality=reuse.children[0].node.material.quality;
    var coverage=box('coverage',675,group.y+group.h+75,330,['候选池必须覆盖：'].concat(terms({quality:lowerQuality,terms:reuse.material.terms},x)),'operation');
    var targetY=Math.max(left.y+left.h,coverage.y+coverage.h)+130;
    var target=box('target',215,targetY,395,['目标：'+qLabel(root.material.quality)+(positionLabel?' · '+positionLabel:'')].concat(terms(root.material,x)),'success');
    nodes=[left,group,coverage,target];edges.push(edge('failure-group','coverage',''));
    edges.push(edge('ready','target',[candidateInfo(root).join('，'),percent(root.probability)],{toPort:0.12,viaY:left.y+left.h+40}));
    var wanted=new Set(reuse.material.terms.map(function(t){return t.attr+':'+t.tier;}));
    var extras=reuse.children.flatMap(function(c){return c.node.material.terms;}).filter(function(t){return !wanted.has(t.attr+':'+t.tier);});
    var sharedX=x&&extras.length&&extras.every(function(t){return t.attr===x&&t.tier==='U';});
    var condition=sharedX?'杂词条 X 必须相同':'仅限本图所示互补组合';
    edges.push(edge('coverage','target',[condition,candidateInfo(reuse).join('，')+'，'+percent(reuse.probability)],{fromPort:0.2,toPort:0.88,viaY:coverage.y+coverage.h+32}));
    if(reuse.probability<1){
      var failures=reuse.outcomes.filter(function(o){return R.signature(o.material)!==R.signature(reuse.material);});
      var other=box('other',765,targetY,240,['非目标'+qLabel(reuse.material.quality),'其余 '+failures.length+' 种结果（汇总）'],'failure');nodes.push(other);
      edges.push(edge('coverage','other',['选中非目标组合','合计 '+percent(1-reuse.probability)],{fromPort:0.78,viaY:coverage.y+coverage.h+32}));
    }
    var title='最终合成｜成功品与失败品复用'+(index?' · 分组 '+(index+1):'');
    return figure(title,svg(title,nodes,edges,width,Math.max.apply(null,nodes.map(function(n){return n.y+n.h;}))+28),
      '左右两条为备选方法，不是同时投料。右侧只使用前述步骤已得到且覆盖目标的失败品；需备齐所示种类与数量，概率以这些材料已备齐为前提。最终非目标出口按示例合并展示，其概率为非目标结果合计。');
  }
  function render(route,x,settings){
    settings=settings||{};var context=collect(route),root=route.tree;
    var combine=root.kind==='craft'&&root.probability===1&&route.reuse.length>0&&root.material.quality==='o2';
    var html='<div class="craft-flow-guide">从蓝二开始按步骤阅读。M 为中间产物，S 为成功品，A / B / C 等为各步失败品；数字后缀对应步骤。每张图按制作 1 枚产物展示，后续按框内数量重复准备。</div>';
    var folded=new Set();
    context.steps.forEach(function(step,index){
      if(folded.has(step.number)||(combine&&step.node===root))return;
      var next=context.steps[index+1],following=null;
      if(step.node.kind==='craft'&&step.node.probability===1&&step.node.material.quality==='p1'&&next&&next.node.kind==='craft'&&next.node.probability===1&&next.node.material.quality==='p2'&&next.node.children.length===1&&context.seen.get(identity(next.node.children[0].node))===step){following=next;folded.add(next.number);}
      html+=recipeFigure(step,context,x,following);
    });
    if(!context.steps.length){
      var node=box('base',30,24,300,['准备'+qLabel(root.material.quality)+' × 1'].concat(terms(root.material,x)));
      html+=figure('蓝二起点',svg('蓝二起点',[node],[],360,node.h+48),'直接收集或置换指定蓝二铭文，获取概率未知。');
    }
    route.reuse.forEach(function(reuse,index){
      if(combine)html+=finishFigure(root,reuse,context,x,settings.positionLabel,index);
      else{
        var number=context.steps.length+index+1,step={node:reuse,number:number,ref:'R'+(index+1)};
        var target=R.signature(reuse.material),failed=0;
        step.outputs=reuse.outcomes.map(function(o){var success=R.signature(o.material)===target;return{material:o.material,probability:o.probability,success:success,ref:success?step.ref:'R'+letter(failed++)};});
        html+='<h5 class="craft-flow-reuse-title">失败品继续利用｜'+esc(groupText(reuse,context))+'</h5>'+recipeFigure(step,context,x);
      }
    });
    if(route.kind==='probability'&&!route.reuse.length)html+='<p class="craft-note">本路线没有已知可直接复用成目标的失败品组合，不能把缺少目标词条的材料视为可达。</p>';
    return html;
  }
  function zoom(viewer,action){
    if(!viewer)return;var drawing=viewer.querySelector('svg');if(!drawing)return;
    var current=Number(viewer.dataset.zoom)||1,next=action==='reset'?1:Math.max(0.5,Math.min(1.6,Math.round((current+(action==='in'?0.1:-0.1))*10)/10));
    viewer.dataset.zoom=String(next);drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*next)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*next)+'px';
    var reset=viewer.querySelector('[data-craft-action="diagram-reset"]');if(reset)reset.textContent=Math.round(next*100)+'%';
  }
  return{render:render,zoom:zoom};
});
