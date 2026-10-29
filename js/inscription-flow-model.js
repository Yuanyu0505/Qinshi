(function(root,factory){
  'use strict';
  var common=typeof module==='object'&&module.exports;
  var api=factory(common?require('./inscription-rules.js'):root.InscriptionRules);
  if(common)module.exports=api;
  if(root)root.InscriptionFlowModel=api;
})(typeof window!=='undefined'?window:null,function(R){
  'use strict';
  function termKey(term){return term.attr+':'+term.tier;}
  // Rules.signature deliberately omits origin. A display projection cannot:
  // washed and crafted preparations remain independently supplied sources.
  function physical(material){return JSON.stringify([R.signature(material),material.origin]);}
  function copy(material){return Object.assign({},material,{terms:material.terms.map(function(t){return Object.assign({},t);})});}
  function unique(values){return Array.from(new Set(values));}
  function alias(node){
    if(node.sourceKey)return node.sourceKey;
    var inputs=[];
    (node.children||[]).forEach(function(c){for(var i=0;i<c.quantity;i++)inputs.push(R.signature(c.node.material));});
    return JSON.stringify([R.signature(node.material),inputs.sort()]);
  }
  function project(route,xAttr){
    var materials=[],operations=[],materialMap=new Map(),operationMap=new Map(),byId=new Map(),failures=new Map();
    var legacy=route.xTerm===undefined&&route.symbolicX===undefined;
    var xTerm=route.xTerm===undefined?(xAttr?{attr:xAttr,tier:'U'}:null):route.xTerm;
    var symbolic=route.symbolicX!==false;
    function retained(material,symbols){return unique(material.terms.map(termKey).filter(function(k){return symbols.indexOf(k)>=0;})).sort();}
    function sourceSymbols(node){
      return symbolic&&xTerm&&(node.xSource===true||legacy&&node.xSource===undefined)?retained(node.material,[termKey(xTerm)]):[];
    }
    function inherit(inputs){return unique(inputs.flatMap(function(input){return byId.get(input.id).symbols;})).sort();}
    function material(key,value,kind,producer,probability,symbols){
      if(!materialMap.has(key)){
        var entry={id:'m'+materials.length,material:copy(value),kind:kind,demand:0,symbols:retained(value,symbols),probability:probability,
          producer:producer,useful:false,sourceKeys:[]};
        materials.push(entry);materialMap.set(key,entry);byId.set(entry.id,entry);
      }
      return materialMap.get(key);
    }
    function groupInputs(inputs){
      var grouped=new Map();
      inputs.forEach(function(input){grouped.set(input.id,(grouped.get(input.id)||0)+input.quantity);});
      return Array.from(grouped,function(pair){return {id:pair[0],quantity:pair[1]};});
    }
    function countCandidates(inputs){
      return new Set(inputs.flatMap(function(input){return byId.get(input.id).material.terms.map(termKey);})).size;
    }
    function outcomes(node){
      return node.kind==='wash'?[{material:node.material,probability:null}]:node.outcomes||[{material:node.material,probability:node.probability}];
    }
    function recipeKey(node,inputs,symbols,kind){
      // Input IDs already include their complete producing recipe and X source.
      // Deliberately omit the selected target; include the complete result pool.
      var pool=outcomes(node).map(function(o){return [physical(o.material),o.probability];});
      pool.sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});
      return JSON.stringify([kind,node.material.prefix,node.material.dun,node.material.quality,node.promotion||null,
        inputs.map(function(i){return [i.id,i.quantity];}).sort(),symbols,pool]);
    }
    function addOperation(node,inputs,symbols,kind,target){
      var key=recipeKey(node,inputs,symbols,kind),operation=operationMap.get(key);
      if(!operation){
        operation={id:'op'+operations.length,kind:kind,quality:node.material.quality,inputs:inputs,outputs:[],promotion:node.promotion||null,
          sourceKeys:[],candidateCount:countCandidates(inputs),coverageReuse:kind==='reuse'||Boolean(node.coverageReuse)};
        operationMap.set(key,operation);operations.push(operation);
        outcomes(node).forEach(function(outcome){
          var matchesTarget=target&&physical(outcome.material)===physical(target.material)&&JSON.stringify(retained(outcome.material,symbols))===JSON.stringify(target.symbols);
          var output=matchesTarget?target:material(operation.id+':'+physical(outcome.material),outcome.material,kind==='wash'?'wash':'failure',operation.id,outcome.probability,symbols);
          operation.outputs.push({id:output.id,probability:outcome.probability});
        });
      }
      var source=alias(node);
      if(operation.sourceKeys.indexOf(source)<0)operation.sourceKeys.push(source);
      operation.outputs.forEach(function(output){
        var entry=byId.get(output.id);
        if(entry.producer!==operation.id)return;
        if(entry.sourceKeys.indexOf(source)<0)entry.sourceKeys.push(source);
        // Reuse references describe failure outputs of each original tree node,
        // not just any numerically equivalent material from the merged view.
        if(kind==='craft'&&physical(entry.material)!==physical(node.material)){
          var signature=physical(entry.material);
          if(!failures.has(signature))failures.set(signature,[]);
          var refs=failures.get(signature);
          if(!refs.some(function(ref){return ref.id===entry.id&&ref.source===source;}))refs.push({id:entry.id,source:source});
        }
      });
      return operation;
    }
    function build(node,demand){
      var entry;
      if(node.kind==='base'||node.kind==='failure'){
        var symbols=node.kind==='base'?sourceSymbols(node):[];
        var key=JSON.stringify([node.kind,physical(node.material),symbols,node.sourceKey||null]);
        entry=material(key,node.material,node.kind,null,null,symbols);
        if(node.sourceKey&&entry.sourceKeys.indexOf(node.sourceKey)<0)entry.sourceKeys.push(node.sourceKey);
      }else{
        // Old wash nodes may carry an illustrative child. It is not consumed.
        var inputs=node.kind==='wash'?[]:groupInputs((node.children||[]).map(function(child){return {id:build(child.node,demand*child.quantity).id,quantity:child.quantity};}));
        var inherited=node.kind==='wash'?sourceSymbols(node):inherit(inputs);
        var operation=addOperation(node,inputs,inherited,node.kind==='wash'?'wash':'craft');
        entry=byId.get(operation.outputs.find(function(output){return physical(byId.get(output.id).material)===physical(node.material);}).id);
        if(node.kind!=='wash')entry.kind='product';
      }
      entry.demand+=demand;entry.useful=true;
      return entry;
    }
    var target=build(route.tree,1);
    (route.reuse||[]).forEach(function(node){
      var inputs=(node.children||[]).map(function(child){
        var refs=failures.get(physical(child.node.material))||[];
        if(child.node.sourceKey)refs=refs.filter(function(ref){return ref.source===child.node.sourceKey;});
        var ids=unique(refs.map(function(ref){return ref.id;}));
        return {id:ids.length===1?ids[0]:null,quantity:child.quantity};
      });
      if(!inputs.length||inputs.some(function(input){return !input.id;}))return;
      inputs=groupInputs(inputs);
      // Optional incoming edges reuse the existing target, without adding any
      // demand, changing its producer, or creating a duplicate target material.
      addOperation(node,inputs,inherit(inputs),'reuse',target);
    });
    // Finish classification only after collecting the entire required tree.
    // Alternatives keep their own producer and zero demand; they are not wired
    // into the primary recipe, and their X interpretation must match exactly.
    var required=materials.filter(function(entry){return entry.demand>0;});
    materials.forEach(function(entry){
      if(entry.demand||entry.kind!=='failure')return;
      var matches=required.filter(function(wanted){return physical(wanted.material)===physical(entry.material)&&JSON.stringify(wanted.symbols)===JSON.stringify(entry.symbols);});
      if(matches.length){entry.kind='product';entry.useful=true;entry.alternateFor=matches.map(function(wanted){return wanted.id;});}
    });
    return {materials:materials,operations:operations,targetId:target.id,notes:[
      '每次合成只得到一枚产物；各分支为互斥结果，概率保持原路线不变。',
      '需求数量按制作一枚目标的强制主树累计，不代表固定合成次数或概率期望；可选复用不增加需求。'
    ]};
  }
  return {project:project};
});
