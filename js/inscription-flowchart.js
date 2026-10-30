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
      if(symbols&&symbols.has(termKey(t))){parts.push({text:'杂词条 X（同一个）',role:'value',rank:T.describe(t,material.quality).rank});return;}
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
  function endpoints(e,map){
    var from=map.get(e.from),to=map.get(e.to);
    return [{x:from.x+from.w*(e.fromPort===undefined?0.5:e.fromPort),y:from.y+(from.kind==='junction'?from.h/2:from.h)},
      // Leave the complete V-shaped marker outside the subsequently painted
      // box; an arrow ending on the border loses half of its stroke.
      {x:to.x+to.w*(e.toPort===undefined?0.5:e.toPort),y:to.kind==='junction'?to.y+to.h/2:to.y-14}];
  }
  function labelSize(label){
    var lines=Array.isArray(label)?label:[label];
    return {lines:lines,w:Math.max(64,Math.max.apply(null,lines.map(function(s){return Array.from(s).reduce(function(n,c){return n+(/[\u0000-\u00ff]/.test(c)?8.4:14);},0);}))+24),h:lines.length*18+10};
  }
  function arrowBounds(start,end){
    var length=Math.hypot(end.x-start.x,end.y-start.y);
    if(!length)return null;
    var ux=(end.x-start.x)/length,uy=(end.y-start.y)/length;
    // Reserve slightly more than the marker's actual 14.4 x 7.2 wings.
    var xs=[end.x,end.x-ux*20-uy*10,end.x-ux*20+uy*10];
    var ys=[end.y,end.y-uy*20+ux*10,end.y-uy*20-ux*10];
    return {left:Math.min.apply(null,xs)-4,right:Math.max.apply(null,xs)+4,top:Math.min.apply(null,ys)-4,bottom:Math.max.apply(null,ys)+4};
  }
  function clearArrowLabels(nodes,edges){
    var map=new Map(nodes.map(function(n){return[n.id,n];}));
    var heads=edges.filter(function(e){return map.get(e.to).kind!=='junction';}).map(function(e){return arrowBounds(e.points[e.points.length-2],e.points[e.points.length-1]);}).filter(Boolean);
    edges.filter(function(e){return e.label;}).forEach(function(e){
      var size=labelSize(e.label);
      // All labels are painted after all wires. Check neighbouring batches as
      // well as this label's own arrow; moving above a blocker is monotonic.
      for(var attempt=0;attempt<heads.length;attempt++){
        var hits=heads.filter(function(head){return e.labelX+size.w/2>head.left&&e.labelX-size.w/2<head.right&&e.labelY+size.h/2>head.top&&e.labelY-size.h/2<head.bottom;});
        if(!hits.length)break;
        e.labelY=Math.min.apply(null,hits.map(function(head){return head.top;}))-size.h/2-8;
      }
    });
  }
  function routeWires(nodes,edges,width){
    var map=new Map(nodes.map(function(n){return[n.id,n];}));
    edges.forEach(function(e){
      var ends=endpoints(e,map),a=ends[0],d=ends[1],from=map.get(e.from),to=map.get(e.to),via=e.viaY;
      // Results fan out from ONE semantic operation, never from a second
      // horizontal bus. A stable continuation also has no gratuitous elbows.
      if(e.phase!=='input'){e.points=[a,d];return;}
      var obstacles=nodes.filter(function(n){return n.kind!=='junction'&&n.id!==e.from&&n.id!==e.to&&n.y<=d.y+8&&n.y+n.h>=a.y-8;});
      var exit=from.kind==='junction'?a.y:(from.rowBottom||a.y)+18;
      var entry=via;
      var candidates=[compactPoints([a,{x:a.x,y:via},{x:d.x,y:via},d])];
      function blocked(points){return points.some(function(p,i){return i&&obstacles.some(function(n){return cutsBox(points[i-1],p,n,8);});});}
      if(!blocked(candidates[0])){e.points=candidates[0];return;}
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
        }
        if(cost<score){best=points;score=cost;}
      });
      e.points=best||candidates[0];
    });
  }
  function svg(title,nodes,edges,width,height){
    var id='ins-flow-'+(++serial),map=new Map(nodes.map(function(n){return[n.id,n];})),labels=[],labelKeys=new Set();
    var connections=edges.map(function(e){
      var from=map.get(e.from),to=map.get(e.to),d=endpoints(e,map)[1],color=e.wireColor;
      if(e.label){
        var size=labelSize(e.label),labelLines=size.lines,lines=labelLines,w=size.w,h=size.h;
        var x=e.labelX===undefined?d.x:e.labelX,y=e.labelY===undefined?d.y-44:e.labelY;
        var labelKey=JSON.stringify([from.id,x,y,labelLines]);
        // Shared source segments may carry identical per-batch labels. Draw
        // that label once while retaining all recipe edges and descriptions.
        if(!labelKeys.has(labelKey)){
          labelKeys.add(labelKey);
          labels.push('<g class="craft-flow-label" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'"><rect x="'+(x-w/2)+'" y="'+(y-h/2)+'" width="'+w+'" height="'+h+'" rx="'+Math.min(15,h/2)+'"/>'+lines.map(function(line,i){return '<text x="'+x+'" y="'+(y-(lines.length-1)*9+i*18)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>');
        }
      }
      return '<path class="craft-flow-connection" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'" data-batch="'+esc(e.batch)+'" data-phase="'+e.phase+'" data-source-quality="'+esc(from.quality)+'" data-bus-y="'+e.viaY+'" style="stroke:'+wireColors[color]+'" d="'+path(e.points)+'"'+(to.kind==='junction'?'':' marker-end="url(#'+id+'-arrow-'+color+')"')+'/>';
    }).join('');
    function nodeTitle(node){return node.lines.length?lineText(node.lines[0]):'合成汇合';}
    var description=nodes.filter(function(n){return n.lines.length;}).map(function(n){return n.lines.map(lineText).join('，');}).join('；')+'。'+edges.filter(function(e){return e.label;}).map(function(e){return nodeTitle(map.get(e.from))+' → '+nodeTitle(map.get(e.to))+'：'+[].concat(e.label).join('，');}).join('；');
    return '<svg xmlns="http://www.w3.org/2000/svg" class="craft-flow-svg" role="img" aria-labelledby="'+id+'-title '+id+'-desc" viewBox="0 0 '+width+' '+height+'" width="'+Math.round(width*0.9)+'" height="'+Math.round(height*0.9)+'" data-flow-width="'+width+'" data-flow-height="'+height+'">'+
      '<title id="'+id+'-title">'+esc(title)+'</title><desc id="'+id+'-desc">'+esc(description)+'</desc>'+
      '<defs>'+wireColors.map(function(color,i){return '<marker id="'+id+'-arrow-'+i+'" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto" overflow="visible"><path d="M 1 1 L 7 4 L 1 7" fill="none" stroke="'+color+'" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></marker>';}).join('')+'</defs>'+
      connections+nodes.map(function(n){
        if(n.kind==='junction'){
          var inputs=new Set(edges.filter(function(e){return e.to===n.id;}).map(function(e){return e.from;}));
          var outputs=new Set(edges.filter(function(e){return e.from===n.id;}).map(function(e){return e.to;}));
          return inputs.size>1||outputs.size>1?'<circle class="craft-flow-junction" data-flow-junction="'+esc(n.id)+'" cx="'+(n.x+n.w/2)+'" cy="'+(n.y+n.h/2)+'" r="4"/>':'';
        }
        return '<g class="craft-flow-box craft-flow-'+n.kind+' craft-flow-quality-'+n.quality+(n.kind==='promotion'?' craft-flow-promotion-'+(n.promotion==='初级'?'initial':'intermediate'):'')+'" data-flow-node="'+esc(n.id)+'" role="button" tabindex="0" aria-label="'+esc(n.lines.map(lineText).join('，'))+'"><rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="17"/>'+n.lines.map(function(line,i){return '<text x="'+(n.x+n.w/2)+'" y="'+(n.y+22+i*20)+'">'+lineHtml(line)+'</text>';}).join('')+'</g>';
      }).join('')+labels.join('')+'</svg>';
  }
  function figure(title,drawing,note,actions){
    return '<section class="craft-flow-step"><h5>'+esc(title)+'</h5><div class="craft-flow-viewer" data-flow-viewer data-zoom="0.9">'+
      '<div class="craft-flow-toolbar"><span>同批投料同色；点选节点突出来源和去向，Esc取消</span><div>'+(actions||'')+control('width','适合宽度')+control('all','完整总览')+control('out','缩小')+control('reset','90%')+control('in','放大')+'</div></div>'+
      '<div class="craft-flow-viewport" tabindex="0" role="region" aria-label="'+esc(title)+'，可左右滚动">'+drawing+'</div></div>'+
      (note?'<p class="craft-note">'+esc(note)+'</p>':'')+'</section>';
  }
  function control(action,label){return '<button type="button" class="seg" data-craft-action="diagram-'+action+'" aria-label="'+esc(action==='reset'?'恢复当前流程图默认比例90%':label+'当前流程图')+'">'+esc(label)+'</button>';}
  function letter(index){var result='';do{result=String.fromCharCode(65+index%26)+result;index=Math.floor(index/26)-1;}while(index>=0);return result;}
  function render(route,x,settings){
    settings=settings||{};
    var graph=Model.project(route,x), nodes=[],edges=[],visual=new Map(),inputVisual=new Map(),opVisual=new Map(),forks=new Map(),details=[],operationOutputs=new Map();
    var byMaterial=new Map(graph.materials.map(function(m){return [m.id,m];})),byOperation=new Map(graph.operations.map(function(o){return [o.id,o];}));
    var levels={b2:0,p1:2,p2:4,o1:6,o2:8};
    function add(id,lines,level,kind,width,quality){
      var n=box(id,0,0,width||240,lines,kind);n.level=level;n.quality=quality;nodes.push(n);return n;
    }
    function drawnTerms(m){return terms(m.material,new Set(m.symbols));}
    function inputNode(op,id){return inputVisual.get(op.id+':'+id)||visual.get(id);}
    graph.materials.filter(function(m){return m.useful;}).forEach(function(m,index){
      var op=byOperation.get(m.producer),multi=op&&op.outputs.length>1;
      var title=qLabel(m.material.quality)+' '+(multi?'可用产物 ':'')+'M'+(index+1);
      var lines=[title].concat(drawnTerms(m));
      var initial=m.material.quality==='b2'&&(m.kind==='base'||op&&op.kind==='wash');
      if(initial)lines=[{parts:[{text:qLabel(m.material.quality)}].concat(drawnTerms(m)[0].parts)}];
      else if(m.material.quality!=='o2')lines.push(m.demand?'总共需要'+m.demand+'枚该铭文':'可替代同款材料（不重复计量）');
      var kind=m.kind==='base'?'material':'success';
      if(op&&op.kind==='wash'){kind='wash';lines=['另行置换合成素材铭文'].concat(lines);}
      var consumers=initial?graph.operations.filter(function(o){return o.inputs.some(function(i){return i.id===m.id;});}):[];
      if(consumers.length>1){
        // These are separate preparation cards for separate consumed batches,
        // not copies of a produced item or extra inventory/demand entries.
        consumers.forEach(function(consumer){
          var n=add(m.id+'-for-'+consumer.id,lines,levels[m.material.quality],kind,240,m.material.quality);
          n.batch=consumer.id;inputVisual.set(consumer.id+':'+m.id,n);
          if(!visual.has(m.id))visual.set(m.id,n);
        });
      }else{
        var n=add(m.id,lines,levels[m.material.quality],kind,240,m.material.quality);
        if(consumers.length)n.batch=consumers[0].id;
        visual.set(m.id,n);
      }
    });
    var reuseNumber=0;
    graph.operations.forEach(function(op){
      var useful=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return m.useful;});
      var unused=op.outputs.map(function(out){return byMaterial.get(out.id);}).filter(function(m){return !m.useful;});
      var folded=op.kind==='craft'&&op.outputs.length===1&&useful.length===1;
      var operation,qualityLevel=levels[op.quality];
      if(op.kind==='wash'){
        operation=visual.get(useful[0].id);
      }else{
        var fork;
        if(op.kind==='reuse')operation=add(op.id,['失败品复用'+(++reuseNumber),'三枚失败材料，同种可重复','候选词条池必须覆盖全部目标词条'],qualityLevel-1,'operation',330,op.quality);
        else {
          operation={id:op.id,x:0,y:0,w:8,h:8,lines:[],kind:'junction',level:qualityLevel-1};
          nodes.push(operation);
        }
        operation.folded=folded;
        if(op.kind==='reuse'){
          fork={id:op.id+'-fork',x:0,y:0,w:8,h:8,lines:[],kind:'junction',level:qualityLevel-.5};nodes.push(fork);
          edges.push(edge(operation.id,fork.id,'',{batch:op.id,phase:'stem'}));
        }else fork=operation;
        forks.set(op.id,fork);
        useful.forEach(function(m){
          var outcome=op.outputs.find(function(output){return output.id===m.id;});
          edges.push(edge(fork.id,visual.get(m.id).id,folded?'':'概率'+percent(outcome.probability),{output:true,batch:op.id,phase:folded?'continuation':'output'}));
        });
      }
      opVisual.set(op.id,operation);
      operationOutputs.set(op.id,useful.map(function(m){return visual.get(m.id);}));
      if(op.promotion){
        var source=byMaterial.get(op.inputs[0]&&op.inputs[0].id),inputQuality=source?source.material.quality:op.quality;
        var promotion=add('promotion-'+op.id,[op.promotion+'晋升铭文×1'],qualityLevel-2,'promotion',190,inputQuality);
        promotion.promotion=op.promotion;promotion.batch=op.id;
        edges.push(edge(promotion.id,operation.id,'',{promotion:true,batch:op.id,phase:'input'}));
      }
      if(unused.length){
        var total=op.outputs.filter(function(out){return !byMaterial.get(out.id).useful;}).reduce(function(sum,out){return sum+out.probability;},0);
        details.push('<section class="craft-unused-group"><h6>'+esc((op.kind==='reuse'?'复用其他结果':'其他产物（本路线暂不使用）')+' · '+qLabel(op.quality)+' · 合计 '+percent(total))+'</h6>'+
          unused.map(function(m,i){var prefix=(op.kind==='reuse'?'复用失败':'失败')+qLabel(m.material.quality)+' '+letter(i)+(graph.operations.indexOf(op)+1)+'：';
            return '<p>'+esc(prefix)+T.sortTerms(m.material.terms,m.material.quality).map(function(t){return m.symbols.includes(termKey(t))?'杂词条 X（同一个）':T.html(t,m.material.quality);}).join(' ＋ ')+' ｜ '+percent(m.probability)+'</p>';
          }).join('')+'</section>');
        var group=add('other-'+op.id,[unused.length+'种失败产物','见下方明细'],qualityLevel,'failure',190,op.quality);
        edges.push(edge(forks.get(op.id).id,group.id,'概率'+percent(total),{output:true,batch:op.id,phase:'output'}));
        operationOutputs.get(op.id).push(group);
        unused.forEach(function(m){visual.set(m.id,group);});
      }
    });
    graph.operations.forEach(function(op){
      var to=opVisual.get(op.id),merged=new Map();
      op.inputs.forEach(function(input){
        var from=inputNode(op,input.id);if(!from)return;
        if(!merged.has(from.id))merged.set(from.id,{from:from,quantity:0});
        merged.get(from.id).quantity+=input.quantity;
      });
      var folded=Boolean(to.folded);
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
    // Keep each initial preparation set together, including its promotion.
    rows.filter(function(row){return row.level===0;}).forEach(function(row){
      function batchOrder(n){var outputs=operationOutputs.get(n.batch);return outputs&&outputs.length?outputs.reduce(function(sum,p){return sum+p.x+p.w/2;},0)/outputs.length:n.x+n.w/2;}
      row.nodes.sort(function(a,b){return batchOrder(a)-batchOrder(b)||String(a.batch||a.id).localeCompare(String(b.batch||b.id))||a.x-b.x;});
      var left=(width-row.span)/2;row.nodes.forEach(function(n){n.x=left;left+=n.w+gap;});
    });
    // Stable continuations and one-source reuse form vertical columns. Solve
    // row separation for whole columns, rather than nudging one box and then
    // drawing a last-minute dogleg back to its former position.
    var columns=new Map();
    nodes.filter(function(n){return n.kind!=='junction';}).forEach(function(n){columns.set(n.id,{id:n.id,members:[n]});});
    function joinColumns(a,b){
      var one=columns.get(a.id),two=columns.get(b.id);
      if(one===two)return;
      if(one.members.some(function(n){return two.members.some(function(m){return n.level===m.level;});}))return;
      two.members.forEach(function(n){one.members.push(n);columns.set(n.id,one);});
    }
    graph.operations.forEach(function(op){
      var inputs=Array.from(new Set(op.inputs.map(function(i){return inputNode(op,i.id);}))).filter(Boolean),outputs=operationOutputs.get(op.id);
      if(op.kind==='craft'&&!op.promotion&&inputs.length===1&&op.outputs.length===1)joinColumns(inputs[0],outputs[0]);
      if(op.kind==='reuse'){
        if(inputs.length===1)joinColumns(inputs[0],opVisual.get(op.id));
        var failure=nodes.find(function(n){return n.id==='other-'+op.id;});
        if(failure)joinColumns(opVisual.get(op.id),failure);
      }
    });
    var groups=Array.from(new Set(columns.values()));
    groups.forEach(function(group){
      group.first=Math.min.apply(null,group.members.map(function(n){return n.level;}));
      group.last=Math.max.apply(null,group.members.map(function(n){return n.level;}));
      var anchors=group.members.filter(function(n){return n.level===group.first;});
      group.desired=anchors.reduce(function(sum,n){return sum+n.x+n.w/2;},0)/anchors.length;
      group.w=Math.max.apply(null,group.members.map(function(n){return n.w;}));group.before=[];
    });
    groups.sort(function(a,b){return a.desired-b.desired||a.id.localeCompare(b.id);});
    groups.forEach(function(group,i){group.rank=i;});
    rows.forEach(function(row){
      var occupants=groups.map(function(group){
        var n=group.members.find(function(item){return item.level===row.level;});
        // Reserve a narrow straight-through corridor for a stable chain that
        // skips a reuse row, so another box cannot occupy its vertical rail.
        return n?{group:group,w:n.w}:group.first<row.level&&group.last>row.level?{group:group,w:32}:null;
      }).filter(Boolean).sort(function(a,b){return a.group.rank-b.group.rank;});
      occupants.forEach(function(item,i){if(i)item.group.before.push({group:occupants[i-1].group,distance:(occupants[i-1].w+item.w)/2+gap});});
    });
    groups.forEach(function(group){
      group.center=Math.max(group.desired,44+group.w/2);
      group.before.forEach(function(rule){group.center=Math.max(group.center,rule.group.center+rule.distance);});
      group.members.forEach(function(n){n.x=group.center-n.w/2;});
    });
    width=Math.max.apply(null,nodes.filter(function(n){return n.kind!=='junction';}).map(function(n){return n.x+n.w;}))+44;
    y=18;
    rows.forEach(function(row,i){
      if(i){
        var atRow=graph.operations.filter(function(op){return levels[op.quality]===row.level;});
        var count=atRow.filter(function(op){return op.kind==='craft';}).length;
        var hasFan=atRow.some(function(op){return op.outputs.length>1;});
        y+=(hasFan?150:110)+Math.max(0,count-1)*24;
      }
      var height=Math.max.apply(null,row.nodes.map(function(n){return n.h;}));
      row.nodes.forEach(function(n){n.y=y;n.rowBottom=y+height;});y+=height;
    });
    var laneEnds=new Map();
    graph.operations.forEach(function(op){
      var junction=forks.get(op.id);
      if(!junction)return;
      var outputs=operationOutputs.get(op.id),incoming=edges.filter(function(e){return e.to===junction.id;}).map(function(e){return byId.get(e.from);});
      var top=Math.min.apply(null,outputs.map(function(n){return n.y;}));
      var xs=incoming.map(function(n){return n.x+n.w/2;}).sort(function(a,b){return a-b;});
      var center=op.kind==='reuse'?opVisual.get(op.id).x+opVisual.get(op.id).w/2:
        opVisual.get(op.id).folded||!xs.length?outputs[0].x+outputs[0].w/2:xs.length%2?xs[(xs.length-1)/2]:(xs[xs.length/2-1]+xs[xs.length/2])/2;
      // Two outcomes read as a balanced fork, rather than one almost vertical
      // leg and one very shallow leg. Reuse retains its source-aligned column.
      if(op.kind==='craft'&&!opVisual.get(op.id).folded&&outputs.length===2){
        center=(outputs[0].x+outputs[0].w/2+outputs[1].x+outputs[1].w/2)/2;
      }
      var lane=0;
      if(op.kind==='craft'){
        var ranges=laneEnds.get(top)||[],left=Math.min.apply(null,xs.concat(center)),right=Math.max.apply(null,xs.concat(center));
        while(ranges.some(function(range){return range.lane===lane&&left<=range.right+16&&right>=range.left-16;}))lane++;
        ranges.push({left:left,right:right,lane:lane});laneEnds.set(top,ranges);
      }
      junction.x=center-junction.w/2;junction.y=top-(opVisual.get(op.id).folded?68:96)-lane*24-junction.h/2;
    });
    edges.forEach(function(e){
      var from=byId.get(e.from),to=byId.get(e.to);
      // All inputs of one batch meet at one height, regardless of different
      // box heights (in particular promotion material vs multi-line products).
      e.viaY=e.phase==='input'?(to.kind==='junction'?to.y+to.h/2:to.y-42):to.y-46;
      var incoming=edges.filter(function(other){return other.to===e.to;}).sort(function(a,b){return byId.get(a.from).x-byId.get(b.from).x;});
      var batches=Array.from(new Set(incoming.map(function(other){return other.batch;})));
      var operation=byOperation.get(e.batch);
      e.toPort=e.output&&operation.kind==='reuse'&&batches.length>1?(from.x+from.w/2>=to.x+to.w/2?.82:.18):.5;
      var uses=Array.from(new Set(edges.filter(function(other){return other.from===e.from&&other.phase==='input';}).map(function(other){return other.batch;})));
      if(e.phase==='input'&&uses.length>1)e.fromPort=(uses.indexOf(e.batch)+1)/(uses.length+1);
      e.wireColor=graph.operations.indexOf(operation)%wireColors.length;
      if(e.label){
        var ends=endpoints(e,byId),start=ends[0],end=ends[1];
        e.labelX=e.output?start.x+(end.x-start.x)*.5:start.x;
        e.labelY=e.output?start.y+(end.y-start.y)*.5:from.y+from.h+22;
      }
    });
    routeWires(nodes,edges,width);
    clearArrowLabels(nodes,edges);
    var title='完整合成流程'+(settings.positionLabel?' · '+settings.positionLabel:'');
    var xTerm=route.xTerm===undefined?(x?{attr:x,tier:'U'}:null):route.xTerm,symbolic=route.symbolicX!==false;
    var xNote=!xTerm?'':symbolic?'符号模板 A：X 采用同一种合法不分档词条；概率只对该模板条件成立。':'具体模式 B：杂词 X 固定为'+xTerm.attr+'（'+T.tierLabel(xTerm.tier)+'），不替换属性或档位。';
    var drawing=svg(title,nodes,edges,width,Math.max.apply(null,nodes.map(function(n){return n.y+n.h;}))+24);
    var actions=details.length?'<button type="button" class="seg" data-craft-action="diagram-failures" aria-expanded="'+Boolean(settings.showFailures)+'">'+(settings.showFailures?'收起所有失败结果':'展开所有失败结果')+'</button>':'';
    return '<div class="craft-flow-guide">每次只产出一枚；同款蓝二按不同批次分别备料。需求按从零制作一枚目标累计，连线数量是每批投料。</div>'+
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
