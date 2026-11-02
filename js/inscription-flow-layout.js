(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InscriptionFlowLayout=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  // Geometry only: semantic materials, recipes, demand and probabilities are
  // deliberately not accepted or modified here.
  function arrange(nodes,edges){
    var visible=nodes.filter(function(n){return n.kind!=='junction';});
    var byId=new Map(nodes.map(function(n){return[n.id,n];})),columns=new Map(),batches=new Map();
    visible.forEach(function(n){
      n.role=n.role||'main';
      columns.set(n.id,{members:[n],role:n.role});
    });
    edges.forEach(function(e){
      if(!batches.has(e.batch))batches.set(e.batch,{inputs:[],outputs:[],actions:[]});
      var batch=batches.get(e.batch);
      if(e.phase==='input')batch.inputs.push(byId.get(e.from));
      if(e.output)batch.outputs.push(byId.get(e.to));
      var action=byId.get(e.to);
      if(action&&action.kind==='operation'&&batch.actions.indexOf(action)<0)batch.actions.push(action);
      if(!e.output&&action&&action.kind!=='junction'&&action.role==='main')batch.outputs.push(action);
    });
    function join(a,b){
      var one=columns.get(a.id),two=columns.get(b.id);
      if(!one||!two||one===two||one.role!==two.role)return;
      if(one.members.some(function(n){return two.members.some(function(m){return n.level===m.level;});}))return;
      two.members.forEach(function(n){one.members.push(n);columns.set(n.id,one);});
    }
    batches.forEach(function(batch){
      var inputs=Array.from(new Set(batch.inputs)),outputs=Array.from(new Set(batch.outputs));
      var required=outputs.filter(function(n){return n.role==='main'&&n.demand>0;});
      var mainInputs=inputs.filter(function(n){return n.role==='main';}).sort(function(a,b){return (b.demand||0)-(a.demand||0);});
      if(required.length===1&&mainInputs.length)join(mainInputs[0],required[0]);
      batch.actions.forEach(function(action){
        var sideInputs=inputs.filter(function(n){return n.role==='side';});
        if(sideInputs.length===1)join(sideInputs[0],action);
        outputs.filter(function(n){return n.role==='side';}).forEach(function(n){join(action,n);});
      });
    });
    var groups=Array.from(new Set(columns.values()));
    groups.forEach(function(g){
      g.first=Math.min.apply(null,g.members.map(function(n){return n.level;}));
      g.last=Math.max.apply(null,g.members.map(function(n){return n.level;}));
      g.w=Math.max.apply(null,g.members.map(function(n){return n.w;}));
      g.demand=Math.max.apply(null,g.members.map(function(n){return n.demand||0;}));
    });
    function tracksFor(role){
      var tracks=[];
      groups.filter(function(g){return g.role===role;}).sort(function(a,b){return a.first-b.first||b.last-a.last||b.demand-a.demand;}).forEach(function(group){
        var track=tracks.find(function(t){return t.groups.every(function(other){return group.first>other.last||group.last<other.first;});});
        if(!track){track={groups:[],w:0};tracks.push(track);}
        track.groups.push(group);track.w=Math.max(track.w,group.w);
      });
      return tracks;
    }
    var mainTracks=tracksFor('main'),sideTracks=tracksFor('side');
    var auxiliary=visible.filter(function(n){return n.role==='auxiliary';});
    auxiliary.forEach(function(n){
      var outgoing=edges.find(function(e){return e.from===n.id&&e.phase==='input';});
      n.batch=n.batch||(outgoing&&outgoing.batch)||n.id;
    });
    var gap=36,pad=28,x=pad,bands=[];
    function placeTracks(tracks,role,label){
      if(!tracks.length)return;
      var start=x;
      tracks.forEach(function(track,i){
        if(i)x+=28;
        track.groups.forEach(function(group){group.members.forEach(function(n){n.x=x+(track.w-n.w)/2;});});
        x+=track.w;
      });
      bands.push({role:role,x:start,w:x-start,label:label});x+=gap;
    }
    placeTracks(mainTracks,'main','主合成路径');
    placeTracks(sideTracks,'side','其他结果 / 失败品复用');
    var width=Math.max(360,x-gap+pad),levels=Array.from(new Set(visible.map(function(n){return n.level;}))).sort(function(a,b){return a-b;});
    var y=68;
    levels.forEach(function(level,index){
      var row=visible.filter(function(n){return n.level===level;}),aux=row.filter(function(n){return n.role==='auxiliary';});
      aux.sort(function(a,b){return String(a.batch).localeCompare(String(b.batch),undefined,{numeric:true});});
      var auxBatchOrder=Array.from(new Set(aux.map(function(n){return n.batch;})));
      if(index){
        var resultEdges=edges.filter(function(e){var to=byId.get(e.to);return e.output&&to&&to.level===level;});
        var batchCount=new Set(resultEdges.map(function(e){return e.batch;})).size;
        var random=resultEdges.some(function(e){return e.phase==='output';});
        // Space for a material bus, a distinct random fork and full arrowheads.
        y+=(random?160:84)+Math.max(0,batchCount-1)*28;
      }
      row.filter(function(n){return n.role!=='auxiliary';}).forEach(function(n){n.y=y;});
      // Put each preparation batch under its own input row, in the gaps
      // between descent corridors. No remote auxiliary column or shared trunk.
      var main=row.filter(function(n){return n.role!=='auxiliary';});
      var auxY=main.length?Math.max.apply(null,main.map(function(n){return n.y+n.h;}))+32:y;
      var corridors=main.flatMap(function(n){
        var uses=Array.from(new Set(edges.filter(function(e){return e.from===n.id&&e.phase==='input';}).map(function(e){return e.batch;})));
        return uses.length>1?uses.map(function(_,i){return n.x+n.w*(i+1)/(uses.length+1);}):[n.x+n.w/2];
      }),occupied=[];
      auxBatchOrder.forEach(function(batchId){
        var group=aux.filter(function(n){return n.batch===batchId;}),batch=batches.get(batchId);
        var inputCenters=batch?batch.inputs.filter(function(n){return n.role!=='auxiliary'&&n.level===level;}).map(function(n){return n.x+n.w/2;}):[];
        var desired=inputCenters.length?(Math.min.apply(null,inputCenters)+Math.max.apply(null,inputCenters))/2:pad;
        group.forEach(function(n,index){
          var candidates=[Math.max(pad,desired-n.w/2)];
          corridors.slice().sort(function(a,b){return a-b;}).forEach(function(cx){candidates.push(cx+24);});
          occupied.forEach(function(rect){candidates.push(rect.right+24);});
          candidates.push(Math.max.apply(null,[pad].concat(corridors.map(function(cx){return cx+24;}),occupied.map(function(rect){return rect.right+24;}))));
          function fits(left){return corridors.every(function(cx){return cx<=left-20||cx>=left+n.w+20;})&&occupied.every(function(rect){return left+n.w+20<=rect.left||left>=rect.right+20;});}
          var picked=candidates.filter(fits).sort(function(a,b){return Math.abs(a+n.w/2-desired)-Math.abs(b+n.w/2-desired);})[0];
          n.x=picked===undefined?width+24:picked;n.y=auxY;
          occupied.push({left:n.x,right:n.x+n.w});width=Math.max(width,n.x+n.w+pad);
          desired=n.x+n.w+24+(group[index+1]?group[index+1].w/2:0);
        });
      });
      var bottom=Math.max.apply(null,row.map(function(n){return n.y+n.h;}));
      row.forEach(function(n){n.rowBottom=bottom;});y=bottom;
    });
    bands.forEach(function(band){band.y=42;band.h=y-24;});
    return {width:width,height:y+24,bands:bands};
  }
  return {arrange:arrange};
});
