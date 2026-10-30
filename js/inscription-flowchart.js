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
    return points.map(function(p,i){return (i?'L ':'M ')+p.x+' '+p.y;}).join(' ');
  }
  function compactPoints(points){
    var result=[];
    points.forEach(function(p){
      var last=result[result.length-1];if(last&&last.x===p.x&&last.y===p.y)return;
      var before=result[result.length-2];
      if(before&&last&&(before.x===last.x&&last.x===p.x||before.y===last.y&&last.y===p.y))result.pop();
      result.push(p);
    });
    return result;
  }
  function cutsBox(a,b,n,padding){
    var left=n.x-padding,right=n.x+n.w+padding,top=n.y-padding,bottom=n.y+n.h+padding;
    return a.x===b.x?a.x>left&&a.x<right&&Math.max(a.y,b.y)>top&&Math.min(a.y,b.y)<bottom:
      a.y===b.y&&a.y>top&&a.y<bottom&&Math.max(a.x,b.x)>left&&Math.min(a.x,b.x)<right;
  }
  function crosses(a,b,c,d){
    if(a.x===b.x&&c.y===d.y)return a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y);
    return a.y===b.y&&c.x===d.x&&crosses(c,d,a,b);
  }
  function overlapLength(a,b,c,d){
    if(a.x===b.x&&c.x===d.x&&a.x===c.x)return Math.max(0,Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)));
    if(a.y===b.y&&c.y===d.y&&a.y===c.y)return Math.max(0,Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)));
    return 0;
  }
  function endpoints(e,map){
    var from=map.get(e.from),to=map.get(e.to);
    return [{x:from.x+from.w*(e.fromPort===undefined?0.5:e.fromPort),y:from.y+(from.kind==='junction'?from.h/2:from.h)},
      {x:to.x+to.w*(e.toPort===undefined?0.5:e.toPort),y:to.y+(to.kind==='junction'?to.h/2:0)}];
  }
  function routeWires(nodes,edges,width){
    var map=new Map(nodes.map(function(n){return[n.id,n];})),routed=[];
    // Short local links establish their lanes first. Longer links can then use
    // an adjacent clear corridor instead of running through unrelated stages.
    edges.slice().sort(function(a,b){return (map.get(a.to).y-map.get(a.from).y)-(map.get(b.to).y-map.get(b.from).y);}).forEach(function(e){
      var ends=endpoints(e,map),a=ends[0],d=ends[1],from=map.get(e.from),to=map.get(e.to),via=e.viaY;
      var obstacles=nodes.filter(function(n){return n.kind!=='junction'&&n.id!==e.from&&n.id!==e.to&&n.y<=d.y+8&&n.y+n.h>=a.y-8;});
      var exit=from.kind==='junction'?a.y:(from.rowBottom||a.y)+18;
      var entry=via;
      var candidates=[compactPoints([a,{x:a.x,y:via},{x:d.x,y:via},d])];
      var lanes=[20,width-20,a.x,d.x];
      obstacles.forEach(function(n){lanes.push(n.x-16,n.x+n.w+16);});
      Array.from(new Set(lanes)).filter(function(x){return x>=16&&x<=width-16;}).forEach(function(x){
        candidates.push(compactPoints([a,{x:a.x,y:exit},{x:x,y:exit},{x:x,y:entry},{x:d.x,y:entry},d]));
      });
      var best=null,score=Infinity;
      candidates.forEach(function(points){
        var cost=(points.length-2)*20;
        for(var i=1;i<points.length;i++){
          var p=points[i-1],q=points[i];
          if(obstacles.some(function(n){return cutsBox(p,q,n,8);}))return;
          cost+=Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
          if(cost>=score)return;
          routed.forEach(function(other){
            if(other.batch===e.batch||other.from===e.from)return;
            for(var j=1;j<other.points.length;j++){
              var overlap=overlapLength(p,q,other.points[j-1],other.points[j]);
              if(overlap)cost+=160+overlap*2;
              else if(crosses(p,q,other.points[j-1],other.points[j]))cost+=90;
            }
          });
        }
        if(cost<score){best=points;score=cost;}
      });
      e.points=best||candidates[0];routed.push(e);
    });
  }
  function svg(title,nodes,edges,width,height){
    var id='ins-flow-'+(++serial),map=new Map(nodes.map(function(n){return[n.id,n];})),labels=[],labelKeys=new Set();
    var connections=edges.map(function(e){
      var from=map.get(e.from),to=map.get(e.to),d=endpoints(e,map)[1];
      if(e.label){
        var labelLines=Array.isArray(e.label)?e.label:[e.label];
        var w=Math.max(64,Math.max.apply(null,labelLines.map(function(s){return Array.from(s).reduce(function(n,c){return n+(/[\u0000-\u00ff]/.test(c)?8.4:14);},0);}))+24),lines=labelLines;
        var h=lines.length*18+10,x=e.labelX===undefined?d.x:e.labelX,y=e.labelY===undefined?d.y-44:e.labelY;
        var labelKey=JSON.stringify([from.id,x,y,labelLines]);
        // Shared source segments may carry identical per-batch labels. Draw
        // that label once while retaining all recipe edges and descriptions.
        if(!labelKeys.has(labelKey)){
          labelKeys.add(labelKey);
          labels.push('<g class="craft-flow-label" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'"><rect x="'+(x-w/2)+'" y="'+(y-h/2)+'" width="'+w+'" height="'+h+'" rx="'+Math.min(15,h/2)+'"/>'+lines.map(function(line,i){return '<text x="'+x+'" y="'+(y-(lines.length-1)*9+i*18)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>');
        }
      }
      return '<path class="craft-flow-connection" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'" data-batch="'+esc(e.batch)+'" data-phase="'+e.phase+'" data-bus-y="'+e.viaY+'" style="stroke:'+wireColors[from.wireColor]+'" d="'+path(e.points)+'"'+(to.kind==='junction'?'':' marker-end="url(#'+id+'-arrow-'+from.wireColor+')"')+'/>';
    }).join('');
    function nodeTitle(node){return node.lines.length?lineText(node.lines[0]):'合成汇合';}
    var description=nodes.filter(function(n){return n.lines.length;}).map(function(n){return n.lines.map(lineText).join('，');}).join('；')+'。'+edges.filter(function(e){return e.label;}).map(function(e){return nodeTitle(map.get(e.from))+' → '+nodeTitle(map.get(e.to))+'：'+[].concat(e.label).join('，');}).join('；');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="craft-flow-svg" role="img" aria-labelledby="'+id+'-title '+id+'-desc" viewBox="0 0 '+width+' '+height+'" width="'+Math.round(width*0.9)+'" height="'+Math.round(height*0.9)+'" data-flow-width="'+width+'" data-flow-height="'+height+'">'+
      '<title id="'+id+'-title">'+esc(title)+'</title><desc id="'+id+'-desc">'+esc(description)+'</desc>'+
      '<defs>'+wireColors.map(function(color,i){return '<marker id="'+id+'-arrow-'+i+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="'+color+'" stroke-width="1.8"/></marker>';}).join('')+'</defs>'+
      connections+nodes.map(function(n){
        if(n.kind==='junction')return '<circle class="craft-flow-junction" cx="'+(n.x+n.w/2)+'" cy="'+(n.y+n.h/2)+'" r="4"/>';
        return '<g class="craft-flow-box craft-flow-'+n.kind+' craft-flow-quality-'+n.quality+(n.kind==='promotion'?' craft-flow-promotion-'+(n.promotion==='初级'?'initial':'intermediate'):'')+'" data-flow-node="'+esc(n.id)+'" role="button" tabindex="0" aria-label="'+esc(n.lines.map(lineText).join('，'))+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="17"/>'+n.lines.map(function(line,i){return '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+22+i*20)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>';
      }).join('')+labels.join('')+'</svg>';
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
    var graph=Model.project(route,x), nodes=[],edges=[],visual=new Map(),opVisual=new Map(),details=[],operationOutputs=new Map();
    var byMaterial=new Map(graph.materials.map(function(m){return [m.id,m];})),byOperation=new Map(graph.operations.map(function(o){return [o.id,o];}));
    var levels={b2:0,p1:2,p2:4,o1:6,o2:8};
    function add(id,lines,level,kind,width,quality){
      var n=box(id,0,0,width||240,lines,kind);n.level=level;n.quality=quality;nodes.push(n);return n;
    }
    function drawnTerms(m){return terms(m.material,new Set(m.symbols));}
    graph.materials.filter(function(m){return m.useful;}).forEach(function(m,index){
      var op=byOperation.get(m.producer),multi=op&&op.outputs.length>1;
      var title=qLabel(m.material.quality)+' '+(multi?'可用产物 ':'')+'M'+(index+1);
      var lines=[title].concat(drawnTerms(m));
      if(m.kind==='base')lines=[{parts:[{text:qLabel(m.material.quality)}].concat(drawnTerms(m)[0].parts)}];
      else lines.push(m.demand?'总共需要'+m.demand+'枚该铭文':'可替代同款材料（不重复计量）');
      visual.set(m.id,add(m.id,lines,levels[m.material.quality],m.kind==='base'?'material':'success',240,m.material.quality));
    });
    var reuseNumber=0;
    graph.operations.forEach(function(op){
      var useful=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return m.useful;});
      var unused=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return !m.useful;});
      var folded=op.kind==='craft'&&op.outputs.length===1&&useful.length===1;
      var operation,qualityLevel=levels[op.quality];
      if(op.kind==='wash'){
        operation=add(op.id,['另行置换合成素材铭文'],qualityLevel-1,'wash',260,op.quality);
        useful.forEach(function(m){edges.push(edge(operation.id,visual.get(m.id).id,'概率未知',{output:true,batch:op.id,phase:'output'}));});
      }else if(folded)operation=visual.get(useful[0].id);
      else {
        if(op.kind==='reuse')operation=add(op.id,['失败品复用'+(++reuseNumber),'三枚失败材料，同种可重复','候选词条池必须覆盖全部目标词条'],qualityLevel-1,'operation',330,op.quality);
        else {
          operation={id:op.id,x:0,y:0,w:8,h:8,lines:[],kind:'junction',level:qualityLevel-1};
          nodes.push(operation);
        }
        useful.forEach(function(m){
          var outcome=op.outputs.find(function(output){return output.id===m.id;});
          edges.push(edge(operation.id,visual.get(m.id).id,'概率'+percent(outcome.probability),{output:true,batch:op.id,phase:'output'}));
        });
      }
      opVisual.set(op.id,operation);
      operationOutputs.set(op.id,useful.map(function(m){return visual.get(m.id);}));
      if(op.promotion){
        var source=byMaterial.get(op.inputs[0]&&op.inputs[0].id),inputQuality=source?source.material.quality:op.quality;
        var promotion=add('promotion-'+op.id,[op.promotion+'晋升铭文×1'],qualityLevel-2,'promotion',190,inputQuality);
        promotion.promotion=op.promotion;
        edges.push(edge(promotion.id,operation.id,'',{promotion:true,batch:op.id,phase:'input'}));
      }
      if(unused.length){
        var total=op.outputs.filter(function(out){return !byMaterial.get(out.id).useful;}).reduce(function(sum,out){return sum+out.probability;},0);
        details.push('<section class="craft-unused-group"><h6>'+esc((op.kind==='reuse'?'复用其他结果':'其他产物（本路线暂不使用）')+' · '+qLabel(op.quality)+' · 合计 '+percent(total))+'</h6>'+
          unused.map(function(m,i){var prefix=(op.kind==='reuse'?'复用失败':'失败')+qLabel(m.material.quality)+' '+letter(i)+(graph.operations.indexOf(op)+1)+'：';
            return '<p>'+esc(prefix)+T.sortTerms(m.material.terms,m.material.quality).map(function(t){return m.symbols.includes(termKey(t))?'杂词条 X（同一个）':T.html(t,m.material.quality);}).join(' ＋ ')+' ｜ '+percent(m.probability)+'</p>';
          }).join('')+'</section>');
        var group=add('other-'+op.id,[unused.length+'种失败产物','见下方明细'],qualityLevel,'failure',190,op.quality);
        edges.push(edge(operation.id,group.id,'概率'+percent(total),{output:true,batch:op.id,phase:'output'}));
        operationOutputs.get(op.id).push(group);
        unused.forEach(function(m){visual.set(m.id,group);});
      }
    });
    graph.operations.forEach(function(op){
      var to=opVisual.get(op.id),merged=new Map();
      op.inputs.forEach(function(input){
        var from=visual.get(input.id);if(!from)return;
        if(!merged.has(from.id))merged.set(from.id,{from:from,quantity:0});
        merged.get(from.id).quantity+=input.quantity;
      });
      var folded=to.kind!=='junction'&&to.kind!=='operation'&&op.kind==='craft';
      merged.forEach(function(input){
        var label='该铭文×'+input.quantity;
        // A deterministic recipe is folded directly into its product; its
        // batch quantity and probability share one label, not another row.
        if(folded)label+='、概率'+percent(op.outputs[0].probability);
        edges.push(edge(input.from.id,to.id,label,{batch:op.id,phase:'input'}));
      });
    });
    var width=360,y=18,gap=24,rows=[];
    var firstLevel=Math.min(0,Math.min.apply(null,nodes.map(function(n){return n.level;})));
    for(var level=firstLevel;level<=8;level++){
      var row=nodes.filter(function(n){return n.level===level&&n.kind!=='junction';});
      if(!row.length)continue;
      var span=row.reduce(function(sum,n){return sum+n.w;},0)+gap*(row.length-1);
      rows.push({nodes:row,span:span,level:level});width=Math.max(width,span+88);
    }
    var byId=new Map(nodes.map(function(n){return[n.id,n];}));
    rows.forEach(function(row){
      row.nodes.forEach(function(n){
        var parents=edges.filter(function(e){return e.to===n.id;}).flatMap(function(e){
          var p=byId.get(e.from);
          return p&&p.kind==='junction'?edges.filter(function(other){return other.to===p.id;}).map(function(other){return byId.get(other.from);}):[p];
        }).filter(function(p){return p&&p.level<n.level;});
        n.order=parents.length?parents.reduce(function(sum,p){return sum+p.x+p.w/2;},0)/parents.length:nodes.indexOf(n)*100;
      });
      row.nodes.sort(function(a,b){return a.order-b.order;});
      var left=(width-row.span)/2,height=Math.max.apply(null,row.nodes.map(function(n){return n.h;}));
      row.nodes.forEach(function(n,i){n.x=left;n.y=y;n.rowBottom=y+height;n.wireColor=i%wireColors.length;left+=n.w+gap;});
      y+=height+110;
    });
    // Both halves of a shared recipe influence ordering. Looking only at
    // parents left independent wash/promotion nodes in arbitrary columns.
    function neighbours(n,up){
      return edges.filter(function(e){return(up?e.to:e.from)===n.id;}).flatMap(function(e){
        var other=byId.get(up?e.from:e.to);
        return other.kind==='junction'?neighbours(other,up):[other];
      }).filter(function(other){return up?other.level<n.level:other.level>n.level;});
    }
    for(var sweep=0;sweep<4;sweep++){
      (sweep%2?rows:rows.slice().reverse()).forEach(function(row){
        row.nodes.forEach(function(n){var linked=neighbours(n,Boolean(sweep%2));n.order=linked.length?linked.reduce(function(sum,p){return sum+p.x+p.w/2;},0)/linked.length:n.x+n.w/2;});
        row.nodes.sort(function(a,b){return a.order-b.order||a.x-b.x;});
        var left=(width-row.span)/2;
        row.nodes.forEach(function(n){n.x=left;left+=n.w+gap;});
      });
    }
    // Wash is a separate preparation directly above its own output; never an
    // implied continuation from the preceding, unrelated crafted material.
    rows.forEach(function(row){row.nodes.forEach(function(n,i){
      if(n.kind!=='wash')return;
      var target=operationOutputs.get(n.id)[0],desired=target.x+target.w/2-n.w/2;
      var left=i?row.nodes[i-1].x+row.nodes[i-1].w+gap:44,right=i+1<row.nodes.length?row.nodes[i+1].x-gap-n.w:width-44-n.w;
      n.x=Math.max(left,Math.min(right,desired));
    });});
    graph.operations.forEach(function(op){
      var junction=opVisual.get(op.id);
      if(junction.kind!=='junction')return;
      var outputs=operationOutputs.get(op.id),incoming=edges.filter(function(e){return e.to===junction.id;}).map(function(e){return byId.get(e.from);});
      var top=Math.min.apply(null,outputs.map(function(n){return n.y;}));
      junction.x=outputs.reduce(function(sum,n){return sum+n.x+n.w/2;},0)/outputs.length-junction.w/2;
      junction.y=top-68-junction.h/2;junction.wireColor=incoming[0]?incoming[0].wireColor:0;
    });
    edges.forEach(function(e){
      var from=byId.get(e.from),to=byId.get(e.to);
      // All inputs of one batch meet at one height, regardless of different
      // box heights (in particular promotion material vs multi-line products).
      e.viaY=e.phase==='input'?(to.kind==='junction'?to.y+to.h/2:to.y-42):to.y-46;
      var incoming=edges.filter(function(other){return other.to===e.to;}).sort(function(a,b){return byId.get(a.from).x-byId.get(b.from).x;});
      var batches=Array.from(new Set(incoming.map(function(other){return other.batch;})));
      e.toPort=to.kind==='junction'?0.5:(batches.indexOf(e.batch)+1)/(batches.length+1);
      if(e.output&&batches.length>1){
        // Separate the original result and optional reuse near a shared goal:
        // distinct target ports alone still let their horizontal stems overlap.
        var latest=Math.max.apply(null,incoming.map(function(other){var n=byId.get(other.from);return n.y+n.h;}));
        var spacing=Math.min(16,Math.max(0,(to.y-latest-64)/(batches.length-1)));
        e.viaY-=spacing*batches.indexOf(e.batch);
      }
      if(e.label){
        e.labelX=e.output?endpoints(e,byId)[1].x:from.x+from.w/2;
        e.labelY=e.output?to.y-22:from.y+from.h+22;
      }
    });
    routeWires(nodes,edges,width);
    var title='完整合成流程'+(settings.positionLabel?' · '+settings.positionLabel:'');
    var xTerm=route.xTerm===undefined?(x?{attr:x,tier:'U'}:null):route.xTerm,symbolic=route.symbolicX!==false;
    var xNote=!xTerm?'':symbolic?'符号模板 A：X 采用同一种合法不分档词条；概率只对该模板条件成立。':'具体模式 B：杂词 X 固定为'+xTerm.attr+'（'+T.tierLabel(xTerm.tier)+'），不替换属性或档位。';
    var drawing=svg(title,nodes,edges,width,Math.max.apply(null,nodes.map(function(n){return n.y+n.h;}))+24);
    var actions=details.length?'<button type="button" class="seg" data-craft-action="diagram-failures" aria-expanded="'+Boolean(settings.showFailures)+'">'+(settings.showFailures?'收起所有失败结果':'展开所有失败结果')+'</button>':'';
    return '<div class="craft-flow-guide">共享入口每次只产出一枚，不会同时获得所有分支。需求按从零制作目标一枚累计，随机步骤需按实际产出收集；连线数量是每批投料。</div>'+
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
