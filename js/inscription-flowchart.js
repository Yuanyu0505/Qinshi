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
    var parts=[];
    material.terms.forEach(function(t,index){
      if(index)parts.push({text:'＋'});
      if(t.attr===x){parts.push({text:'杂词条 X（同一个）'});return;}
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
  function letter(index){var result='';do{result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26)-1;}while(index>=0);return result;}
  function candidateInfo(node){
    if(node.kind==='wash')return ['置换 / 洗练','得到指定词条组合'];
    if(node.children.some(function(c){return c.node.material.terms.some(function(t){return t.tier==='?';});}))return ['蓝二速度特殊合成','按合法结果等概率生成'];
    var pool=new Set();node.children.forEach(function(c){c.node.material.terms.forEach(function(t){pool.add(t.attr+':'+t.tier);});});
    var count=R.qualities.find(function(q){return q.id===node.material.quality;}).count;
    if(pool.size<count)return ['候选不足，随机补词条','按完整合法结果分支'];
    var words={1:'一',2:'二',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九'};
    return [pool.size+'种候选，'+(words[pool.size]||pool.size)+'选'+(words[count]||count)];
  }
  function render(route,x,settings){
    settings=settings||{};
    var nodes=[],edges=[],cache=new Map(),outputs=new Map(),column=0,number=0;
    var levels={b2:0,p1:2,p2:4,o1:6,o2:8};
    function add(lines,level,kind,center){
      var id='n'+nodes.length,n=box(id,0,0,240,lines,kind);
      n.level=level;n.center=center===undefined?140+(column++)*280:center;
      nodes.push(n);return n;
    }
    function link(from,to,label,extra){edges.push(edge(from.id,to.id,label,extra));}
    function remember(material,n){
      var sig=R.signature(material);if(!outputs.has(sig))outputs.set(sig,[]);
      outputs.get(sig).push(n);
    }
    function build(node){
      var key=node.kind+'|'+R.signature(node.material);
      if(cache.has(key))return cache.get(key);
      var level=levels[node.material.quality],inputs=[];
      // Washing prepares an independently supplied inscription of this quality.
      // Its old illustrative base is NOT a consumed output from another branch.
      if(node.kind!=='wash')inputs=node.children.map(function(c){return {n:build(c.node),quantity:c.quantity};});
      if(node.kind==='base'||node.kind==='failure'){
        var leaf=add(['准备'+qLabel(node.material.quality)+' × 1'].concat(terms(node.material,x)),level,'material');
        cache.set(key,leaf);remember(node.material,leaf);return leaf;
      }
      var promotion;
      if(node.promotion){promotion=add([node.promotion+'晋升铭文 × 1'],level-2,'promotion');}
      var anchors=inputs.map(function(c){return c.n.center;});if(promotion)anchors.push(promotion.center);
      var center=anchors.length?anchors.reduce(function(a,b){return a+b;},0)/anchors.length:140+(column++)*280;
      var operation=add(node.kind==='wash'?['独立置换 / 洗练准备','另备同品质铭文，不消耗其他支线产物']:candidateInfo(node),level-1,'operation',center);
      inputs.forEach(function(c,i){link(c.n,operation,'× '+c.quantity,{toPort:(i+1)/(inputs.length+(promotion?1:0)+1)});});
      if(promotion)link(promotion,operation,'',{toPort:(inputs.length+1)/(inputs.length+2)});
      var ref=(node.kind==='craft'&&node.probability<1?'S':'M')+(++number);
      var result=add([qLabel(node.material.quality)+' '+ref].concat(terms(node.material,x)),level,'success',center);
      cache.set(key,result);remember(node.material,result);
      link(operation,result,node.kind==='wash'?'置换概率未知':percent(node.probability));
      if(node.kind==='craft'){
        var wanted=R.signature(node.material),failures=node.outcomes.filter(function(o){return R.signature(o.material)!==wanted;});
        if(failures.length){
          var rows=failures.map(function(o,i){
            return {parts:[{text:'失败'+qLabel(o.material.quality)+' '+letter(i)+number+'：'}].concat(terms(o.material,x)[0].parts,[{text:' ｜ '+percent(o.probability)}])};
          });
          var group=add(['失败结果（逐项列示）'].concat(rows),level,'failure');
          failures.forEach(function(o,i){remember(o.material,Object.assign({},group,{ref:letter(i)+number}));});
          link(operation,group,'失败合计 '+percent(failures.reduce(function(sum,o){return sum+o.probability;},0)));
        }
      }
      return result;
    }
    var goal=build(route.tree);
    route.reuse.forEach(function(reuse,index){
      var chosen=reuse.children.map(function(c){
        var candidates=outputs.get(R.signature(c.node.material))||[];
        return {n:candidates.find(function(n){return n.kind==='failure';}),quantity:c.quantity};
      });
      // Only connect actual, visible failure outputs. Never invent disconnected
      // aliases that look like available materials.
      if(chosen.some(function(c){return !c.n;}))return;
      var center=chosen.reduce(function(sum,c){return sum+c.n.center;},0)/chosen.length;
      var operation=add(['失败品互补复用 '+(index+1),'投料：'+chosen.map(function(c){return c.n.ref+' × '+c.quantity;}).join('＋')].concat(candidateInfo(reuse)),levels[reuse.material.quality]-1,'operation',center);
      var groups=new Map();
      chosen.forEach(function(c){if(!groups.has(c.n.id))groups.set(c.n.id,{n:c.n,labels:[]});groups.get(c.n.id).labels.push(c.n.ref+' × '+c.quantity);});
      var grouped=Array.from(groups.values());
      grouped.forEach(function(g,i){link(g.n,operation,'',{toPort:(i+1)/(grouped.length+1)});});
      link(operation,goal,percent(reuse.probability),{toPort:(index+1)/(route.reuse.length+2)});
      if(reuse.probability<1){
        var other=add(['非目标'+qLabel(reuse.material.quality),'其他结果汇总'],levels[reuse.material.quality],'failure');
        link(operation,other,'合计 '+percent(1-reuse.probability));
      }
    });
    var y=24,width=360;
    for(var level=0;level<=8;level++){
      var row=nodes.filter(function(n){return n.level===level;}).sort(function(a,b){return a.center-b.center;});
      if(!row.length)continue;
      var right=-20;
      row.forEach(function(n){n.x=Math.max(24,n.center-n.w/2,right+40);n.y=y;right=n.x+n.w;width=Math.max(width,right+24);});
      y+=Math.max.apply(null,row.map(function(n){return n.h;}))+112;
    }
    var title='完整合成流程'+(settings.positionLabel?' · '+settings.positionLabel:'');
    var byId=new Map(nodes.map(function(n){return[n.id,n];}));
    var sharedGoal=edges.filter(function(e){return e.to===goal.id;}).length>1;
    edges.forEach(function(e){if((typeof e.label==='string'&&e.label.indexOf('× ')===0)||(sharedGoal&&e.to===goal.id)){var from=byId.get(e.from);e.labelX=from.x+from.w/2;e.labelY=from.y+from.h+38;}});
    return '<div class="craft-flow-guide">每个方案一图到底。合成材料与独立置换材料并行汇入下一次合成；箭头上的 × 数量表示投料数。成功品和失败品直接连到后续用途，不靠跨图编号衔接。多次尝试需重复准备相应材料。</div>'+
      figure(title,svg(title,nodes,edges,width,y-80),'置换概率未知；合成与失败品复用概率以所连材料已经备齐为前提。独立置换分支需另备同品质铭文，不是把其他支线的 M 材料继续洗掉。');
  }
  function zoom(viewer,action){
    if(!viewer)return;var drawing=viewer.querySelector('svg');if(!drawing)return;
    var current=Number(viewer.dataset.zoom)||1,next=action==='reset'?1:Math.max(0.5,Math.min(1.6,Math.round((current+(action==='in'?0.1:-0.1))*10)/10));
    viewer.dataset.zoom=String(next);drawing.style.width=Math.round(Number(drawing.dataset.flowWidth)*next)+'px';drawing.style.height=Math.round(Number(drawing.dataset.flowHeight)*next)+'px';
    var reset=viewer.querySelector('[data-craft-action="diagram-reset"]');if(reset)reset.textContent=Math.round(next*100)+'%';
  }
  return{render:render,zoom:zoom};
});
