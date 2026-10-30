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
    var auxiliaryWidth=auxiliary.length?Math.max.apply(null,auxiliary.map(function(n){return n.w;})):0;
    auxiliary.forEach(function(n){
      var outgoing=edges.find(function(e){return e.from===n.id&&e.phase==='input';});
      n.batch=n.batch||(outgoing&&outgoing.batch)||n.id;
    });
    var auxiliaryBatches=Math.max.apply(null,[1].concat(auxiliary.map(function(n){return new Set(auxiliary.filter(function(other){return other.level===n.level;}).map(function(other){return other.batch;})).size;})));
    var gap=36,pad=28,x=pad,bands=[];
    if(auxiliary.length){bands.push({role:'auxiliary',x:x,w:auxiliaryWidth,label:'辅助材料 / 独立准备'});x+=auxiliaryWidth+gap+(auxiliaryBatches-1)*14;}
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
      // Keep each batch together. Upper batches use outer gutters; later
      // cards cannot accidentally tee into an earlier batch's vertical wire.
      aux.sort(function(a,b){return String(a.batch).localeCompare(String(b.batch),undefined,{numeric:true});});
      var auxBatchOrder=Array.from(new Set(aux.map(function(n){return n.batch;})));
      if(index){
        var resultEdges=edges.filter(function(e){var to=byId.get(e.to);return e.output&&to&&to.level===level;});
        var batchCount=new Set(resultEdges.map(function(e){return e.batch;})).size;
        var random=resultEdges.some(function(e){return e.phase==='output';});
        // Space for a material bus, a distinct random fork and full arrowheads.
        y+=(random?160:84)+Math.max(0,batchCount-1)*28;
      }
      var auxY=y;
      aux.forEach(function(n){
        n.x=pad+(auxiliaryWidth-n.w)/2;n.y=auxY;n.auxiliaryRight=pad+auxiliaryWidth;
        n.auxiliaryGutter=n.auxiliaryRight+18+(auxBatchOrder.length-1-auxBatchOrder.indexOf(n.batch))*14;
        auxY+=n.h+14;
      });
      row.filter(function(n){return n.role!=='auxiliary';}).forEach(function(n){n.y=y;});
      var bottom=Math.max.apply(null,row.map(function(n){return n.y+n.h;}));
      row.forEach(function(n){n.rowBottom=bottom;});y=bottom;
    });
    bands.forEach(function(band){band.y=42;band.h=y-24;});
    return {width:width,height:y+24,bands:bands};
  }
  return {arrange:arrange};
});
