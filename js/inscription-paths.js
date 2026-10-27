(function (root, factory) {
  "use strict";
  var api = factory(typeof module === "object" && module.exports ? require("./inscription-rules.js") : root.InscriptionRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InscriptionPaths = api;
})(typeof window !== "undefined" ? window : null, function (Rules) {
  "use strict";
  var cache = new Map();
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function termKey(t) { return t.attr + ":" + t.tier; }
  function unique(terms) { var map=new Map(); terms.forEach(function (t) { map.set(termKey(t),t); }); return Array.from(map.values()).sort(function (a,b) { return termKey(a)<termKey(b) ? -1 : termKey(a)>termKey(b) ? 1 : 0; }); }
  function choose(pool, count, repeat, visit) {
    function walk(start, picked) {
      if (picked.length === count) { visit(picked); return; }
      for (var i=start;i<pool.length;i++) walk(repeat ? i : i+1,picked.concat([pool[i]]));
    }
    walk(0,[]);
  }
  function sources(material) {
    return ["wash","crafted"].filter(function (origin) { return Rules.validate(Object.assign({},material,{origin:origin})).valid; });
  }
  function previous(quality) { return Object.keys(Rules.recipes).find(function (q) { return Rules.recipes[q].quality===quality; }); }
  function error(message) { return { valid:false, errors:[message], bestTargets:{targets:[],reason:message}, targets:[], routes:[], groups:[], nodes:[], preparations:[], reuseBranches:[], additionalBranches:[] }; }
  function materialNode(material, quantity) {
    var available=sources(material);
    return { id:Rules.signature(material), type:"material", material:material, quantity:quantity || 1, sources:available,
      preparation:available.includes("wash") ? "wash" : "craft", washProbability:null, expandable:material.quality!=="b2" };
  }
  function verifiedRoute(target, inputs) {
    inputs=inputs.slice().sort(function (a,b) { return Rules.signature(a)<Rules.signature(b) ? -1 : Rules.signature(a)>Rules.signature(b) ? 1 : 0; });
    var preview=Rules.preview(inputs), signature=Rules.signature(target);
    if (!preview.valid) return null;
    var outcome=preview.outcomes.find(function (o) { return Rules.signature(o.material)===signature; });
    if (!outcome) return null;
    var counts=new Map();
    inputs.forEach(function (m) { var sig=Rules.signature(m); if (!counts.has(sig)) counts.set(sig,{material:m,quantity:0,sources:sources(m)}); counts.get(sig).quantity++; });
    return { id:JSON.stringify([signature,inputs.map(Rules.signature)]), type:"operation", target:target, targetSignature:signature,
      inputs:inputs, requirements:Array.from(counts.values()), quantity:inputs.length, promotion:preview.promotion,
      probability:outcome.probability, model:preview.model, outcomes:preview.outcomes, source:"craft",
      inputQuality:inputs[0].quality, quality:preview.quality, deterministic:outcome.probability===1 };
  }
  function enumerate(target) {
    var prev=previous(target.quality), result={routes:[],preparations:[],nodes:[],groups:[]};
    if (sources(target).includes("wash")) result.preparations.push({type:"preparation",source:"wash",material:Object.assign({},target,{origin:"wash"}),quantity:1,probability:null,note:"洗练概率未知；合成概率以已备齐具体材料为条件"});
    result.nodes.push(materialNode(target,1));
    if (!prev) return result;
    var metadata=Rules.recipes[prev], all=Rules.termsFor(target.dun,prev);
    // A blue visible speed is deliberately unknown. The preview, not this projection,
    // decides whether it can grow into the requested high/middle speed.
    var core=unique(target.terms.map(function (t) { return all.find(function (p) { return p.attr===t.attr && (p.tier===t.tier || p.tier==="?"); }); }).filter(Boolean));
    var pools=[core];
    all.forEach(function (extra) { if (!core.some(function (t) { return termKey(t)===termKey(extra); })) pools.push(unique(core.concat([extra]))); });
    var routes=new Map(), inputCount=Rules.qualities.find(function (q) { return q.id===prev; }).count;
    pools.forEach(function (pool) {
      var candidates=[];
      choose(pool,inputCount,false,function (terms) {
        var material={prefix:target.prefix,dun:target.dun,quality:prev,terms:terms}, origins=sources(material);
        if (origins.length) candidates.push(Object.assign(material,{origin:origins[0]}));
      });
      choose(candidates,metadata.count,true,function (inputs) {
        var route=verifiedRoute(target,inputs);
        if (route && !routes.has(route.id)) routes.set(route.id,route);
      });
    });
    result.routes=Array.from(routes.values()).sort(function (a,b) { return b.probability-a.probability || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0); });
    var groups=new Map(), nodeMap=new Map();
    result.routes.forEach(function (route) {
      var extras=unique(route.inputs.flatMap(function (m) { return m.terms; })).filter(function (t) { return !core.some(function (c) { return termKey(c)===termKey(t); }); });
      var kind=route.deterministic ? "deterministic" : "probability", groupKey=JSON.stringify([kind,extras.map(termKey)]);
      if (!groups.has(groupKey)) groups.set(groupKey,{id:groupKey,kind:kind,extras:extras,routeIds:[],preferred:extras.length===1 && extras[0].tier==="U"});
      groups.get(groupKey).routeIds.push(route.id);
      route.requirements.forEach(function (entry) { var sig=Rules.signature(entry.material); if (!nodeMap.has(sig)) nodeMap.set(sig,materialNode(entry.material,entry.quantity)); });
      result.nodes.push(route);
    });
    result.groups=Array.from(groups.values()).sort(function (a,b) { return Number(b.preferred)-Number(a.preferred) || (a.id<b.id ? -1 : a.id>b.id ? 1 : 0); });
    result.nodes=result.nodes.concat(Array.from(nodeMap.values()));
    return result;
  }
  function makeResult(targets,best) {
    var result={valid:true,errors:[],bestTargets:best,targets:targets,routes:[],groups:[],nodes:[],preparations:[],reuseBranches:[],additionalBranches:[]};
    targets.forEach(function (target) { var part=enumerate(target); ["routes","groups","nodes","preparations"].forEach(function (key) { result[key]=result[key].concat(part[key]); }); });
    // Parametric branches intentionally have no numeric probability: choosing actual
    // materials invokes reuseRecipes, which recomputes the complete outcome pool.
    if (targets[0].quality==="o2") [1,2,3].forEach(function (count) {
      result.reuseBranches.push({id:"reuse-x-"+count,kind:"failure-reuse",distinctX:count,quantity:3,inputQuality:"o1",probability:null,
        label:count===1 ? "相同X失败品复用" : count+"种X混合复用",selectConcrete:true,planner:"reuseRecipes",requiresTargetCoverage:true});
    });
    var prev=previous(targets[0].quality);
    if (prev) {
      var inputSlots=Rules.qualities.find(function (q) { return q.id===prev; }).count;
      var maxExtras=Rules.recipes[prev].count*inputSlots-targets[0].terms.length;
      for (var extraCount=2;extraCount<=maxExtras;extraCount++) result.additionalBranches.push({
        id:"extra-"+extraCount,kind:"multi-extra",distinctExtras:extraCount,inputQuality:prev,quantity:Rules.recipes[prev].count,
        probability:null,selectConcrete:true,planner:"reuseRecipes",requiresTargetCoverage:true,
        label:extraCount+"种额外词条：选择具体材料计算"});
    }
    return result;
  }
  function generate(goal) {
    if (!goal || Rules.prefixes.indexOf(goal.prefix)<0) return error("请选择正确前缀");
    var best=Rules.bestTargets(goal.dun,goal.quality,goal.attrs);
    if (!best.targets.length) return error(best.reason);
    var targets=best.targets.map(function (terms) { var material={prefix:goal.prefix,dun:Rules.normalizeDun(goal.dun),quality:goal.quality,terms:terms}; return Object.assign(material,{origin:sources(material)[0]}); });
    if (goal.targetTerms) { var wanted=Rules.signature(Object.assign({},targets[0],{terms:goal.targetTerms})); targets=targets.filter(function (m) { return Rules.signature(m)===wanted; }); if (!targets.length) return error("具体目标不符合所选最高属性组合"); }
    var key=targets.map(Rules.signature).sort().join("|");
    if (!cache.has(key)) cache.set(key,makeResult(targets,best));
    return clone(cache.get(key));
  }
  function expand(material) {
    var checked=Rules.validate(material);
    if (!checked.valid) return error(checked.errors.join("；"));
    var target=checked.material, key="expand:"+Rules.signature(target);
    if (!cache.has(key)) cache.set(key,makeResult([target],{targets:[target.terms],reason:""}));
    return clone(cache.get(key));
  }
  function reuseRecipes(goal, inventory) {
    var generated=goal && Array.isArray(goal.terms) ? expand(goal) : generate(goal);
    if (!generated.valid) return Object.assign(generated,{recipes:[]});
    if (!Array.isArray(inventory)) return Object.assign(error("复用材料列表无效"),{recipes:[]});
    var available=new Map(), invalid=[];
    Array.from(inventory).forEach(function (entry) {
      var counted=!!(entry && entry.material), material=counted ? entry.material : entry;
      var checked=Rules.validate(material), amount=counted ? (entry.quantity === undefined ? entry.qty : entry.quantity) : null;
      if (!checked.valid || (counted && (!Number.isSafeInteger(amount)||amount<0))) { invalid.push("复用材料或数量无效"); return; }
      var sig=Rules.signature(checked.material), old=available.get(sig);
      if (old && old.quantity!==null && amount!==null) { if (!Number.isSafeInteger(old.quantity+amount)) invalid.push("复用数量超出安全范围"); else old.quantity+=amount; }
      else if (!old) available.set(sig,{material:checked.material,quantity:amount});
      else old.quantity=null;
    });
    if (invalid.length) return Object.assign(error(invalid.join("；")),{recipes:[]});
    var recipes=new Map();
    generated.targets.forEach(function (target) {
      var prev=previous(target.quality), meta=Rules.recipes[prev];
      if (!meta) return;
      var candidates=Array.from(available.values()).filter(function (entry) { var m=entry.material; return entry.quantity!==0 && m.quality===prev && m.prefix===target.prefix && m.dun===target.dun; });
      choose(candidates,meta.count,true,function (entries) {
        var counts=new Map(); entries.forEach(function (e) { counts.set(e,(counts.get(e)||0)+1); });
        if (Array.from(counts).some(function (entry) { return entry[0].quantity!==null && entry[1]>entry[0].quantity; })) return;
        var inputs=entries.map(function (entry) { return entry.material; });
        // Only orange-two failure reuse requires exact inherited coverage (no
        // missing-target AAA). Other grades may project unknown blue speed or
        // fill missing terms; Rules.preview is the authority for their reachability.
        if (target.quality==="o2" && !target.terms.every(function (term) { return inputs.some(function (m) { return m.terms.some(function (t) { return termKey(t)===termKey(term); }); }); })) return;
        var route=verifiedRoute(target,inputs); if (route) { route.inventoryBound=entries.every(function (entry) { return entry.quantity!==null; }); recipes.set(route.id,route); }
      });
    });
    return {valid:true,errors:[],recipes:Array.from(recipes.values()).sort(function (a,b) { return b.probability-a.probability || (a.id<b.id ? -1 : 1); }),templateMode:Array.from(available.values()).some(function (entry) { return entry.quantity===null; })};
  }
  // Presentation planning is separate from exhaustive exact-material planning.
  // Every operation is still accepted only after the existing rule preview.
  function representative(goal) {
    var best = Rules.bestTargets(goal.dun, goal.quality, goal.attrs);
    if (!best.targets.length) return { valid:false, errors:[best.reason], targets:[], strategies:[] };
    var prefix = goal.prefix || Rules.prefixes[0];
    if (!Rules.prefixes.includes(prefix)) return { valid:false, errors:["前缀无效"], targets:[], strategies:[] };
    var xAttr = ["闪避", "招架", "治疗效果"].find(function (attr) { return !goal.attrs.includes(attr); });
    var exactCache = new Map(), treeCache = new Map();
    function material(quality, terms) {
      var m = { prefix:prefix, dun:goal.dun, quality:quality, terms:clone(terms) }, origins = sources(m);
      return origins.length ? Object.assign(m, {origin:origins[0]}) : null;
    }
    function routesFor(target) {
      var sig = Rules.signature(target);
      if (!exactCache.has(sig)) {
        var prev = previous(target.quality), core = prev ? Rules.termsFor(target.dun, prev).filter(function (t) {
          return target.terms.some(function (wanted) { return wanted.attr===t.attr && (wanted.tier===t.tier || t.tier==="?"); });
        }) : [];
        var selected=[], metadata=prev && Rules.recipes[prev];
        if (metadata) {
          var pool=unique(core.concat(xAttr ? [{attr:xAttr,tier:"U"}] : [])), candidates=[];
          var count=Rules.qualities.find(function(q){return q.id===prev;}).count;
          choose(pool,count,false,function(terms){var m=material(prev,terms);if(m)candidates.push(m);});
          choose(candidates,metadata.count,true,function(inputs){var route=verifiedRoute(target,inputs);if(route)selected.push(route);});
        }
        // Prefer one consistent, ungraded X across the entire diagram. Never
        // manufacture a probability from an unspecified multi-X material pool.
        selected = selected.filter(function (route) {
          return route.inputs.every(function (input) { return input.terms.every(function (t) {
            return core.some(function (c) { return termKey(c)===termKey(t); }) || (t.tier==="U" && t.attr===xAttr);
          }); });
        });
        selected.sort(function (a,b) {
          return b.probability-a.probability || a.requirements.length-b.requirements.length || (a.id<b.id ? -1 : 1);
        });
        exactCache.set(sig, selected);
      }
      return exactCache.get(sig);
    }
    function fromRoute(route, mode) {
      var children = [];
      for (var i=0;i<route.requirements.length;i++) {
        var entry = route.requirements[i], child = build(entry.material, mode);
        if (!child) return null;
        children.push({ quantity:entry.quantity, node:child });
      }
      return { kind:"craft", material:clone(route.target), children:children, promotion:route.promotion,
        probability:route.probability, outcomes:clone(route.outcomes), hasChance:route.probability<1 || children.some(function (c) { return c.node.hasChance; }) };
    }
    function washed(target, mode) {
      if (!sources(target).includes("wash")) return null;
      // A purple low term is prepared by washing an already crafted base, NOT
      // by inheriting a low tier from blue materials.
      var terms = target.terms.map(function (t) { return {attr:t.attr,tier:t.tier==="L" ? "M" : t.tier}; });
      var base = material(target.quality, terms);
      if (!base || Rules.signature(base)===Rules.signature(target)) {
        var pool = Rules.termsFor(target.dun,target.quality,"crafted"), count = Rules.qualities.find(function (q) { return q.id===target.quality; }).count;
        base = null;
        choose(pool,count,false,function (candidate) {
          if (base) return;
          var value = material(target.quality,candidate);
          if (value && sources(value).includes("crafted") && !candidate.some(function (t) { return t.tier==="L"; })) base=value;
        });
      }
      if (!base || Rules.signature(base)===Rules.signature(target)) return null;
      var child = build(base,mode,true);
      return child ? { kind:"wash", material:Object.assign(clone(target),{origin:"wash"}), children:[{quantity:1,node:child}], probability:null, hasChance:child.hasChance,
        note:"置换至指定词条；低档只能通过置换准备。洗练概率未知，不计入合成成功率。" } : null;
    }
    function build(target, mode, noWash) {
      var key = Rules.signature(target)+":"+mode+":"+Boolean(noWash);
      if (treeCache.has(key)) return clone(treeCache.get(key));
      if (target.quality==="b2") return {kind:"base",material:clone(target),children:[],probability:null,hasChance:false};
      var list = routesFor(target), ordered = list.slice();
      if (mode==="chance" && target.quality==="o1") ordered.sort(function (a,b) {
        return Number(a.deterministic)-Number(b.deterministic) || b.probability-a.probability || a.requirements.length-b.requirements.length;
      });
      var tree = null;
      // Guaranteed operations are preferred in the stable route. If the model
      // necessarily randomizes a blue speed, show it honestly as probability.
      for (var i=0;i<ordered.length && !tree;i++) tree=fromRoute(ordered[i],mode);
      if (!tree && !noWash) tree=washed(target,mode);
      treeCache.set(key,tree);
      return tree && clone(tree);
    }
    function shape(node) {
      return JSON.stringify([node.kind,Rules.signature(node.material),node.children.map(function(c){return [c.quantity,shape(c.node)];})]);
    }
    function probabilityNodes(node, output) {
      if (node.kind==="craft" && node.probability<1 && node.material.quality==="o1") output.push(node);
      node.children.forEach(function (c) { probabilityNodes(c.node,output); });
    }
    function reuse(tree, target) {
      if (target.quality!=="o2") return [];
      var nodes=[]; probabilityNodes(tree,nodes);
      var seen=new Set(), result=[];
      nodes.forEach(function (node) {
        var wanted=Rules.signature(node.material);
        if (seen.has(wanted)) return;
        seen.add(wanted);
        var failures=node.outcomes.filter(function(o){return Rules.signature(o.material)!==wanted;}).map(function(o){return o.material;});
        var possible=[];
        choose(failures,3,true,function(inputs){
          if (!target.terms.every(function(t){return inputs.some(function(m){return m.terms.some(function(x){return termKey(t)===termKey(x);});});})) return;
          var recipe=verifiedRoute(target,inputs);
          if (recipe) possible.push(recipe);
        });
        possible.sort(function(a,b){return b.probability-a.probability || b.requirements.length-a.requirements.length;});
        if (possible.length) {
          var route=possible[0];
          result.push({ kind:"craft",material:clone(target),probability:route.probability,promotion:null,outcomes:clone(route.outcomes),hasChance:route.probability<1,
            note:"下列材料均为上方概率步骤留下的失败品；需备齐所示种类与数量，不能把缺少目标词条的失败品视为可达。",
            children:route.requirements.map(function(e){return {quantity:e.quantity,node:{kind:"failure",material:clone(e.material),children:[],probability:null,hasChance:false}};}) });
        }
      });
      return result;
    }
    var targets=best.targets.map(function(terms){return material(goal.quality,terms);}).filter(Boolean), strategies=[], seen=new Set();
    targets.forEach(function (target) {
      var candidates=[build(target,"stable"),build(target,"chance")];
      if (target.quality!=="b2" && sources(target).includes("wash")) candidates.push(washed(target,"stable"));
      // Direct complementary inputs and a single-X pool are distinct ideas,
      // not every permutation of concrete attributes.
      var categories=new Set();
      routesFor(target).forEach(function(route){
        var category=(route.deterministic ? "exact" : "chance")+":"+(route.requirements.length===1 ? "repeat" : "complement");
        if (!categories.has(category)) { categories.add(category); candidates.push(fromRoute(route,"stable")); }
      });
      candidates.filter(Boolean).forEach(function(tree){
        var identity=shape(tree); if (seen.has(identity)) return; seen.add(identity);
        strategies.push({ kind:tree.hasChance ? "probability" : "deterministic", tree:tree, reuse:reuse(tree,target) });
      });
    });
    return {valid:true,errors:[],targets:targets,strategies:strategies,xAttr:xAttr};
  }
  return {generate:generate,expand:expand,reuseRecipes:reuseRecipes,representative:representative};
});
