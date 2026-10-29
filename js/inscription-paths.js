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
    goal=goal||{};
    var symbolicX=goal.xTerm==null, notes=new Set();
    function failed(message,xTerm) {
      return {valid:false,errors:[message],targets:[],strategies:[],xTerm:xTerm||null,symbolicX:symbolicX,notes:Array.from(notes)};
    }
    var best = Rules.bestTargets(goal.dun, goal.quality, goal.attrs);
    if (!best.targets.length) return failed(best.reason);
    var prefix = goal.prefix || Rules.prefixes[0];
    if (!Rules.prefixes.includes(prefix)) return failed("前缀无效");
    var xTerm=symbolicX ? {attr:["闪避","招架","治疗效果"].find(function(attr){return !goal.attrs.map(Rules.normalizeAttr).includes(attr);})||"闪避",tier:"U"} :
      {attr:Rules.normalizeAttr(goal.xTerm && goal.xTerm.attr),tier:goal.xTerm && goal.xTerm.tier};
    if (!xTerm.attr || xTerm.tier==="?" || !Rules.qualities.some(function(q){return Rules.termsFor(goal.dun,q.id).some(function(t){return termKey(t)===termKey(xTerm);});}))
      return failed("具体杂词 X 的属性或档位不适用于当前遁位",xTerm);
    if (!symbolicX && best.targets.some(function(terms){return terms.some(function(t){return termKey(t)===termKey(xTerm);});}))
      return failed("具体杂词 X 不能与目标词条相同，请选择另一属性或档位",xTerm);
    if (symbolicX) notes.add("未指定具体 X：按同一种合法不分档词条计算符号模板，概率不代表任意有档 X。");
    else Rules.qualities.forEach(function(q){
      if (!Rules.termsFor(goal.dun,q.id).some(function(t){return termKey(t)===termKey(xTerm);}))
        notes.add("所选具体 X（"+xTerm.attr+"／"+xTerm.tier+"）在"+q.label+"没有对应合法档位，已剔除相关来源，不替换为其他 X。");
    });
    var xAttr=xTerm.attr;
    var xIsExtra=!best.targets.some(function(terms){return terms.some(function(t){return termKey(t)===termKey(xTerm);});});
    var exactCache = new Map(), treeCache = new Map();
    function containsX(m) { return m.terms.some(function(t){return termKey(t)===termKey(xTerm);}); }
    function sourceKey(target,inputs) { return JSON.stringify([Rules.signature(target),inputs.map(Rules.signature).sort()]); }
    function inherited(target,inputs){
      var pool=unique(inputs.flatMap(function(m){return m.terms;})),counts=new Map();
      target.terms.forEach(function(t){if(!counts.has(t.attr))counts.set(t.attr,[]);counts.get(t.attr).push(t);});
      return Array.from(counts).every(function(entry){
        var wanted=entry[1],known=pool.filter(function(t){return t.attr===entry[0]&&t.tier!=='?';});
        var unknown=inputs.reduce(function(n,m){return n+m.terms.filter(function(t){return t.attr===entry[0]&&t.tier==='?';}).length;},0);
        return wanted.filter(function(t){return !known.some(function(k){return termKey(k)===termKey(t);});}).length<=unknown;
      });
    }
    function material(quality, terms) {
      var m = { prefix:prefix, dun:goal.dun, quality:quality, terms:clone(terms) }, origins = sources(m);
      if (!symbolicX && quality==="p2" && containsX(m) && terms.some(function(t){return t.tier==="L";}) && !origins.length)
        notes.add("所选具体 X（"+xTerm.attr+"／"+xTerm.tier+"）不能提供紫二低档＋X的合法洗练或合成来源，已剔除对应路线。");
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
          var allowed=Rules.termsFor(target.dun,prev), pool=unique(core.concat(allowed.some(function(t){return termKey(t)===termKey(xTerm);}) ? [xTerm] : [])), candidates=[];
          var count=Rules.qualities.find(function(q){return q.id===prev;}).count;
          choose(pool,count,false,function(terms){var m=material(prev,terms);if(m)candidates.push(m);});
          choose(candidates,metadata.count,true,function(inputs){if(!inherited(target,inputs))return;var route=verifiedRoute(target,inputs);if(route)selected.push(route);});
        }
        // The optional concrete X is one fixed attr+tier at every quality. The
        // default U term is only a symbolic template, never an arbitrary tier.
        selected = selected.filter(function (route) {
          return route.inputs.every(function (input) { return input.terms.every(function (t) {
            return core.some(function (c) { return termKey(c)===termKey(t); }) || termKey(t)===termKey(xTerm);
          }); });
        });
        selected.sort(function (a,b) {
          return b.probability-a.probability || a.requirements.length-b.requirements.length || (a.id<b.id ? -1 : 1);
        });
        // Orange-two's identical-material upgrade is sufficient. Purple-two
        // deliberately keeps its complementary M+X / H+X preparation family.
        if(target.quality==='o2'&&selected.some(function(r){return r.deterministic;}))selected=selected.filter(function(r){return r.deterministic;});
        exactCache.set(sig, selected);
      }
      return exactCache.get(sig);
    }
    function fromRoute(route, mode, variant, pairFamily) {
      var children = [];
      for (var i=0;i<route.requirements.length;i++) {
        var entry = route.requirements[i], child = build(entry.material, mode, false, variant, pairFamily);
        if (!child) return null;
        children.push({ quantity:entry.quantity, node:child });
      }
      return { kind:"craft", material:Object.assign(clone(route.target),{origin:"crafted"}), children:children, promotion:route.promotion, sourceKey:sourceKey(route.target,route.inputs),
        probability:route.probability, outcomes:clone(route.outcomes), hasChance:route.probability<1 || children.some(function (c) { return c.node.hasChance; }) };
    }
    function washed(target, mode) {
      if (!sources(target).includes("wash")) return null;
      // Do not actively prepare a difficult high+low purple pair as the normal
      // shortcut. A user-selected high-tier X in an explicit L+X role is exact.
      if (target.quality==="p2" && !containsX(target) && target.terms.some(function(t){return t.tier==="H";}) && target.terms.some(function(t){return t.tier==="L";})) return null;
      var node={kind:'wash',material:Object.assign(clone(target),{origin:'wash'}),children:[],probability:null,hasChance:false,
        note:'另行置换合成素材铭文；从当前品质开始，洗练概率未知。'};
      if (symbolicX && xIsExtra && containsX(target)) node.xSource=true;
      return node;
    }
    function build(target, mode, noWash, variant, pairFamily) {
      variant=variant||0;
      pairFamily=pairFamily||0;
      var key = Rules.signature(target)+":"+mode+":"+Boolean(noWash)+":"+variant+":"+pairFamily;
      if (treeCache.has(key)) return clone(treeCache.get(key));
      if (target.quality==="b2") {
        var base={kind:"base",material:clone(target),children:[],probability:null,hasChance:false};
        if (symbolicX && xIsExtra && containsX(target)) base.xSource=true;
        return base;
      }
      var list = routesFor(target), ordered = list.slice();
      // This is a material preparation choice, not a locally best-probability
      // search: retain both HM×3 and complementary same-X (2+1) families.
      if (target.quality==="p2" && pairFamily && !containsX(target)) {
        var complementary=ordered.filter(function(route){return route.requirements.length===2 && route.inputs.every(containsX);});
        if (complementary.length) ordered=complementary;
      }
      if (mode==="chance" && target.quality==="o1") ordered.sort(function (a,b) {
        return Number(a.deterministic)-Number(b.deterministic) || b.probability-a.probability || a.requirements.length-b.requirements.length;
      });
      var tree = null;
      // Preserve meaningful alternative intermediate recipes instead of always
      // discarding every complementary tree after the first one. Limit the
      // search to six pivots; never take a Cartesian product of all subtrees.
      if (variant && ordered.length && target.quality==='o1') {
        var preferred=ordered.filter(function(r){return mode==='stable'?r.deterministic:!r.deterministic;});
        if(preferred.length) ordered=preferred;
        var offset=variant%Math.min(6,ordered.length);
        ordered=ordered.slice(offset).concat(ordered.slice(0,offset));
      }
      // Guaranteed operations are preferred in the stable route. If the model
      // necessarily randomizes a blue speed, show it honestly as probability.
      for (var i=0;i<ordered.length && !tree;i++) tree=fromRoute(ordered[i],mode,variant,pairFamily);
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
        var wanted=Rules.signature(node.material), producerKey=node.sourceKey;
        if (seen.has(producerKey)) return;
        seen.add(producerKey);
        var failures=node.outcomes.filter(function(o){return Rules.signature(o.material)!==wanted;}).map(function(o){return o.material;});
        var possible=[];
        choose(failures,3,true,function(inputs){
          if (!target.terms.every(function(t){return inputs.some(function(m){return m.terms.some(function(x){return termKey(t)===termKey(x);});});})) return;
          var recipe=verifiedRoute(target,inputs);
          if (recipe) possible.push(recipe);
        });
        // Prefer a minimal 2+1 example when its candidate pool covers the target;
        // coverage, not a forced one-of-each A/B/C collection, is the condition.
        possible.sort(function(a,b){return b.probability-a.probability || a.requirements.length-b.requirements.length || (a.id<b.id ? -1 : 1);});
        if (possible.length) {
          var route=possible[0];
          result.push({ kind:"craft",material:Object.assign(clone(target),{origin:"crafted"}),probability:route.probability,promotion:null,outcomes:clone(route.outcomes),hasChance:route.probability<1,
            sourceKey:sourceKey(target,route.inputs),coverageReuse:true,
            note:"取三枚合法同品质失败品，同种可重复；去重候选池必须覆盖全部目标词条，缺少目标词条的组合不可达。图中为可行的2＋1示例，不要求A、B、C各一枚。",
            children:route.requirements.map(function(e){return {quantity:e.quantity,node:{kind:"failure",material:clone(e.material),children:[],probability:null,hasChance:false,sourceKey:producerKey}};}) });
        }
      });
      return result;
    }
    var targets=best.targets.map(function(terms){return material(goal.quality,terms);}).filter(Boolean), strategies=[], seen=new Set();
    targets.forEach(function (target) {
      // Two preparation families and a few whole-tree pivots retain useful
      // alternatives without taking a Cartesian product of material subtrees.
      var candidates=[];
      [0,1].forEach(function(family){
        candidates.push(build(target,"stable",false,0,family),build(target,"chance",false,0,family));
        for(var variant=1;variant<4;variant++) candidates.push(build(target,'stable',false,variant,family),build(target,'chance',false,variant,family));
      });
      if (target.quality!=="b2" && sources(target).includes("wash")) candidates.push(washed(target,"stable"));
      // Direct complementary inputs and a single-X pool are distinct ideas,
      // not every permutation of concrete attributes.
      var categories=new Set();
      routesFor(target).forEach(function(route){
        var category=(route.deterministic ? "exact" : "chance")+":"+route.requirements.map(function(e){return Rules.signature(e.material)+'*'+e.quantity;}).join('|');
        if (!categories.has(category) && categories.size<4) { categories.add(category); candidates.push(fromRoute(route,"stable",0,0)); }
      });
      candidates.filter(Boolean).forEach(function(tree){
        var identity=shape(tree); if (seen.has(identity)) return; seen.add(identity);
        strategies.push({ kind:tree.hasChance ? "probability" : "deterministic", tree:tree, reuse:reuse(tree,target),xTerm:clone(xTerm),symbolicX:symbolicX });
      });
    });
    if (!strategies.length) return Object.assign(failed(symbolicX ? "没有合法的常规材料准备路线" : "所选具体 X 无法提供合法的常规材料准备路线，请查看来源限制",xTerm),{targets:targets});
    return {valid:true,errors:[],targets:targets,strategies:strategies,xAttr:xAttr,xTerm:clone(xTerm),symbolicX:symbolicX,notes:Array.from(notes)};
  }
  // A presentation-only projection: recipes, probabilities and favorite identities
  // stay on the original strategy. Ignore ingredient names/counts, but retain the
  // nested preparation mechanisms (including washing and unknown blue speed).
  function groupStrategies(strategies) {
    var groups=[], byIdea=new Map();
    function pattern(node, stages) {
      var speed=node.material.terms.some(function(t){return (t.attr==='速'||t.attr==='PVP速')&&t.tier==='?';});
      var mode=node.kind==='craft' ? (node.probability<1?'chance':'stable') : node.kind;
      var stage=node.material.quality;
      if(node.kind!=='base'){
        if(!stages.has(stage))stages.set(stage,new Set());
        stages.get(stage).add(mode);
      }
      var children=Array.from(new Set(node.children.map(function(c){return pattern(c.node,stages);}))).sort();
      var candidates=node.kind==='craft'?unique(node.children.flatMap(function(c){return c.node.material.terms;})).length:null;
      return JSON.stringify([stage,mode,speed,node.kind==='craft'?node.probability:null,candidates,children]);
    }
    strategies.forEach(function(route,index){
      var stages=new Map(), shape=pattern(route.tree,stages);
      var id=JSON.stringify([route.kind,Rules.signature(route.tree.material),route.symbolicX,route.xTerm,shape]);
      // Guaranteed routes deliberately remain independent cards.
      if(route.kind==='deterministic')id+=':'+index;
      if(!byIdea.has(id)){
        var label=Rules.qualities.filter(function(q){return stages.has(q.id);}).map(function(q){
          var modes=stages.get(q.id), labels=[];
          if(modes.has('wash'))labels.push('置换准备');
          if(modes.has('chance'))labels.push('含概率合成');
          else if(modes.has('stable'))labels.push('稳定合成');
          return q.label+labels.join('／');
        }).join(' → ');
        var group={id:id,kind:route.kind,label:label,variants:[]};
        byIdea.set(id,group);groups.push(group);
      }
      byIdea.get(id).variants.push({route:route,index:index});
    });
    return groups;
  }
  return {generate:generate,expand:expand,reuseRecipes:reuseRecipes,representative:representative,groupStrategies:groupStrategies};
});
