(function (root, factory) {
  var core = root && root.MACHINE_BEAST_CORE;
  if (typeof module === 'object' && module.exports) core = require('./machine-beasts.js');
  var api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MACHINE_BEAST_EQUIVALENTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CORE) {
  'use strict';

  function append(previous, candidate) { return { edges: [{ previous: previous, candidate: candidate }] }; }
  function merge(target, other) {
    other.edges.forEach(function (edge) {
      if (!target.edges.some(function (old) { return old.previous === edge.previous && old.candidate === edge.candidate; })) target.edges.push(edge);
    });
    return target;
  }
  function signature(beasts) {
    return JSON.stringify(beasts.filter(function (b) { return b.items.length; }).map(function (b) {
      return [b.beastId, b.items.map(function (i) { return [i.source, i.modificationId, i.rank, i.count]; }).sort()];
    }).sort());
  }
  function gcd(a, b) { while (b) { var n = a % b; a = b; b = n; } return a; }

  function physicalKey(items) {
    var groups = new Map();
    items.forEach(function (i) {
      var key = [i.source, i.rank, i.modificationId, i.ownedBaseBodies || 0, i.newBaseBodies || 0].join('/');
      groups.set(key, (groups.get(key) || 0) + i.count);
    });
    return JSON.stringify(Array.from(groups).sort());
  }

  // Count distinct realized material plans before multiplying them across
  // beasts. Only graphs containing a live folded/explicit high-rank alias
  // need this local pass; never enumerate the full school Cartesian product.
  function removeOriginalAliases(data, beast, pool, graph) {
    if (!pool || graph.count === '1') return graph;
    var r7 = CORE.researchFor(data, beast, 7, 'none'), rules = data.resourceRules;
    if (!r7 || !graph.types.some(function (t) { return t.rank > 7 && t.modificationId === 'none' && t.available !== 0; })) return graph;
    var active = new Set(graph.nodes.filter(function (node) {
      return node.edges.some(function (edge) { return edge[0] > 0; });
    }).map(function (node) { return node.type; }));
    if (!r7 || !graph.types.some(function (t, i) {
      return active.has(i) && t.rank === 7 && t.modificationId === 'none';
    })) return graph;
    var aliases = pool.origins.some(function (origin) {
      return origin.rank > 7 && origin.modificationId === 'none' && origin.researchEach === r7 * origin.weight &&
        Math.ceil(origin.researchEach / rules.blueprintDivisor) === origin.weight * Math.ceil(r7 / rules.blueprintDivisor) &&
        Math.ceil(origin.researchEach / rules.organPieceDivisor) === origin.weight * Math.ceil(r7 / rules.organPieceDivisor) &&
        graph.types.some(function (t, i) { return active.has(i) && t.rank === origin.rank && t.modificationId === 'none'; });
    });
    if (!aliases) return graph;
    var seen = new Map(), size = BigInt(graph.count);
    for (var ordinal = 0n; ordinal < size; ordinal++) {
      var allocation = CORE.allocateConvertedInventory(data, beast, pool, materialItems(graph, ordinal));
      var key = physicalKey(allocation.items), previous = seen.get(key), c = allocation.inventoryConversion;
      var score = [allocation.modificationCores.externalDeficit, c.operations, c.rankDistance];
      var first = previous ? score.findIndex(function (n, i) { return n !== previous.score[i]; }) : -1;
      if (!previous || first >= 0 && score[first] < previous.score[first]) seen.set(key, { ordinal: String(ordinal), score: score });
    }
    if (BigInt(seen.size) < size) {
      graph.count = String(seen.size);
      graph.physicalOrdinals = Array.from(seen.values()).map(function (entry) { return entry.ordinal; });
    }
    return graph;
  }

  // Reconstruct ALL tied quantity vectors, not the bounded-stock binary chunk
  // histories. Fixed type order gives every physical allocation exactly one path.
  function materialGraph(data, candidate, source, settings) {
    var targetResearch = candidate.addedResearch, targetB = candidate.resources.awakeningBlueprints;
    var targetM = candidate.modifiedInvestedCount, targetBody = candidate.resources.pricedBodyYuan;
    var beast = data.beasts.find(function (b) { return b.id === candidate.beastId; });
    var types = source.types.filter(function (t) {
      return t.researchEach <= targetResearch && t.blueprints <= targetB &&
        (t.modificationId === 'none' || t.weight <= targetM);
    });
    var feeCache = new Map(), memo = new Map(), nodes = [{ count: '1', edges: [] }];
    function body(newCount) {
      if (beast.quality !== 'orange') return 0;
      if (!feeCache.has(newCount)) {
        var fragments = Math.max(0, newCount * beast.fragmentsPerBody - source.fragments);
        var cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: 0, beasts: [{ beastId: beast.id, fragments: fragments }] }, settings);
        if (!cost.complete) throw Error('同等方案缺少本体参考价格');
        feeCache.set(newCount, cost.knownYuan);
      }
      return feeCache.get(newCount);
    }
    var suffixGcd = Array(types.length + 1).fill(0);
    for (var i = types.length - 1; i >= 0; i--) suffixGcd[i] = gcd(types[i].researchEach, suffixGcd[i + 1]);
    function visit(index, research, blueprints, modified, newCount, cores, ownedOnly) {
      if(source.baseLimit!=null&&newCount>source.baseLimit)return -1;
      if(source.conversionPool&&(ownedOnly>source.conversionPool.baseCount||!source.conversionPool.allowExternalCores&&cores>source.conversionPool.coreCount+source.conversionPool.looseCores))return -1;
      if (research < 0 || blueprints < 0 || modified < 0 || body(newCount) > targetBody) return -1;
      var waste = blueprints * data.resourceRules.blueprintDivisor - research;
      if (waste < 0) return -1;
      if (index === types.length) return research === 0 && blueprints === 0 && modified === 0 && body(newCount) === targetBody ? 0 : -1;
      if (research % suffixGcd[index]) return -1;
      var key = [index, research, blueprints, modified, newCount,source.conversionPool&&!source.conversionPool.allowExternalCores?cores:0,ownedOnly].join('/');
      if (memo.has(key)) return memo.get(key);
      var t = types[index], mod = t.modificationId === 'none' ? 0 : t.weight;
      var cap = Math.min(Math.floor(research / t.researchEach), Math.floor(blueprints / t.blueprints), t.available == null ? Infinity : t.available);
      if(t.rankCap!=null)cap=Math.min(cap,Math.floor((t.rankCap-newCount)/t.weight));
      var typeWaste = t.blueprints * data.resourceRules.blueprintDivisor - t.researchEach;
      if (typeWaste > 0) cap = Math.min(cap, Math.floor(waste / typeWaste));
      if (mod) cap = Math.min(cap, Math.floor(modified / mod));
      var edges = [], count = 0n;
      for (var quantity = 0; quantity <= cap; quantity++) {
        var nextNew = newCount + (source.convertible || t.source === 'new' && beast.quality === 'orange' ? quantity * t.weight : 0);
        var child = visit(index + 1, research - quantity * t.researchEach, blueprints - quantity * t.blueprints, modified - quantity * mod, nextNew,cores+quantity*(t.cores||0),ownedOnly+quantity*(t.ownedWeight||0));
        if (child < 0) continue;
        edges.push([quantity, child]); count += BigInt(nodes[child].count);
      }
      var id = -1;
      if (count) { id = nodes.length; nodes.push({ type: index, count: String(count), edges: edges }); }
      memo.set(key, id); return id;
    }
    var root = visit(0, targetResearch, targetB, targetM, 0,0,0);
    if (root < 0) throw Error('无法重建主方案的同等材料路径');
    return removeOriginalAliases(data, beast, source.conversionPool, { types: types, nodes: nodes, root: root, count: nodes[root].count });
  }

  function pack(data, trace, sources, settings) {
    var nodes = [{ count: '1', edges: [] }], candidates = [], nodeIds = new Map(), candidateIds = new Map();
    function candidateId(candidate) {
      if (candidateIds.has(candidate)) return candidateIds.get(candidate);
      var source = sources[candidate.beastId];
      var materials = candidate.items.length ? materialGraph(data, candidate, source, settings) : { types: [], nodes: [{ count: '1', edges: [] }], root: 0, count: '1' };
      var id = candidates.length;
      candidates.push({ detail: candidate, fragmentsBefore: source.originalFragments===undefined?source.fragments:source.originalFragments, materials: materials,conversionPool:source.conversionPool });
      candidateIds.set(candidate, id); return id;
    }
    function visit(node) {
      if (!node) return 0;
      if (nodeIds.has(node)) return nodeIds.get(node);
      var count = 0n, edges = node.edges.map(function (edge) {
        var parent = visit(edge.previous), candidate = candidateId(edge.candidate);
        count += BigInt(nodes[parent].count) * BigInt(candidates[candidate].materials.count);
        return [parent, candidate];
      });
      var id = nodes.length; nodes.push({ count: String(count), edges: edges }); nodeIds.set(node, id); return id;
    }
    var root = visit(trace);
    return { version: 1, count: nodes[root].count, root: root, nodes: nodes, candidates: candidates, settings: settings };
  }

  function materialItems(graph, rank) {
    if (graph.physicalOrdinals) rank = BigInt(graph.physicalOrdinals[Number(rank)]);
    var items = [], at = graph.root;
    while (at !== 0) {
      var node = graph.nodes[at], selected = null;
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i], count = BigInt(graph.nodes[edge[1]].count);
        if (rank >= count) { rank -= count; continue; }
        selected = edge; break;
      }
      if (!selected) throw Error('同等材料序号无效');
      if (selected[0]) {
        var type = graph.types[node.type];
        items.push({ source: type.source, modificationId: type.modificationId, rank: type.rank,
          count: selected[0], researchEach: type.researchEach, sevenRankEquivalent: type.weight });
      }
      at = selected[1];
    }
    return items;
  }

  function detailFor(data, packed, items, settings) {
    var base = packed.detail, beast = data.beasts.find(function (b) { return b.id === base.beastId; });
    if (!items.length) return null;
    var detail = Object.assign({}, base, { items: items, investedCount: 0, ownedInvestedCount: 0, newInvestedCount: 0,
      ownedPhysicalCount: 0, newPhysicalCount: 0, ownedModifiedInvestedCount: 0, newModifiedInvestedCount: 0 });
    var pieces = 0;
    var allocation=packed.conversionPool?CORE.allocateConvertedInventory(data,beast,packed.conversionPool,items):null;
    items.forEach(function (item) {
      var weight = item.count * item.sevenRankEquivalent, owned = item.source === 'owned';
      detail.investedCount += weight;
      detail[owned ? 'ownedInvestedCount' : 'newInvestedCount'] += weight;
      detail[owned ? 'ownedPhysicalCount' : 'newPhysicalCount'] += item.count;
      if (item.modificationId !== 'none') detail[owned ? 'ownedModifiedInvestedCount' : 'newModifiedInvestedCount'] += weight;
      pieces += item.count * Math.ceil(item.researchEach / data.resourceRules.organPieceDivisor);
    });
    if(allocation){
      detail.items=allocation.items;detail.investedCount=allocation.invested;detail.ownedInvestedCount=allocation.owned;detail.newInvestedCount=allocation.newCount;
      detail.ownedPhysicalCount=allocation.ownedPhysical;detail.newPhysicalCount=allocation.newPhysical;
      detail.ownedModifiedInvestedCount=allocation.ownedModified;detail.newModifiedInvestedCount=allocation.newModified;
      detail.inventoryConversion=allocation.inventoryConversion;
      detail.modificationCores=allocation.modificationCores;
      if(allocation.realizedResources){
        detail.addedResearch=allocation.realizedResources.research;
        pieces=allocation.realizedResources.pieces;
      }
    }
    var fragments = Math.max(0, detail.newInvestedCount * beast.fragmentsPerBody - packed.fragmentsBefore);
    var cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: 0, beasts: [{ beastId: beast.id, fragments: fragments }] }, settings);
    detail.resources = Object.assign({}, base.resources, { organPieces: pieces, fragments: fragments,
      awakeningBlueprints: allocation&&allocation.realizedResources?allocation.realizedResources.blueprints:base.resources.awakeningBlueprints,
      contribution: cost.beasts.length ? cost.beasts[0].contribution : 0, yuan: cost.knownYuan, pricedBodyYuan: cost.knownYuan });
    detail.finalEffect = CORE.activeBeastEffect(beast, detail.endLevel);
    return detail;
  }

  function decode(data, plan, rank) {
    var graph = plan.equivalents;
    function visit(at, index) {
      if (at === 0) return [];
      var node = graph.nodes[at];
      for (var i = 0; i < node.edges.length; i++) {
        var edge = node.edges[i], candidate = graph.candidates[edge[1]], materialCount = BigInt(candidate.materials.count);
        var count = BigInt(graph.nodes[edge[0]].count) * materialCount;
        if (index >= count) { index -= count; continue; }
        var beasts = visit(edge[0], index / materialCount);
        var detail = detailFor(data, candidate, materialItems(candidate.materials, index % materialCount), graph.settings);
        return detail ? beasts.concat(detail) : beasts;
      }
      throw Error('同等方案序号无效');
    }
    var beasts = visit(graph.root, rank), totals = Object.assign({}, plan.totals);
    var fields = ['investedCount','ownedInvestedCount','newInvestedCount','ownedPhysicalCount','newPhysicalCount','ownedModifiedInvestedCount','newModifiedInvestedCount'];
    fields.forEach(function (field) { totals[field] = beasts.reduce(function (n, b) { return n + b[field]; }, 0); });
    totals.organPieces = beasts.reduce(function (n,b) { return n + b.resources.organPieces; }, 0);
    totals.fragments = beasts.reduce(function (n,b) { return n + b.resources.fragments; }, 0);
    totals.modifiedInvestedCount = totals.ownedModifiedInvestedCount + totals.newModifiedInvestedCount;
    totals.unlockedEffects = beasts.reduce(function (n,b) { return n + b.unlockedEffects; }, 0);
    totals.milestoneCount = totals.unlockedEffects;
    totals.overflowResearch = beasts.reduce(function (n,b) { return n + b.overflowResearch; }, 0);
    totals.awakeningBlueprints = beasts.reduce(function (n,b) { return n + b.resources.awakeningBlueprints; }, 0);
    totals.projectedTotalLevel = plan.totals.projectedTotalLevel - plan.beasts.reduce(function (n,b) { return n + b.endLevel - b.startLevel; }, 0) + beasts.reduce(function (n,b) { return n + b.endLevel - b.startLevel; }, 0);
    totals.contribution = beasts.some(function (b) { return b.resources.contribution === null; }) ? null : beasts.reduce(function (n,b) { return n + b.resources.contribution; }, 0);
    var cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: totals.awakeningBlueprints, beasts: beasts.map(function (b) { return { beastId: b.beastId, fragments: b.resources.fragments }; }) }, graph.settings);
    totals.yuan = beasts.reduce(function (n,b) { return n + b.resources.pricedBodyYuan; }, 0);
    totals.pricedYuan = cost.totalYuan;
    if (!cost.complete || ['modifiedInvestedCount','pricedYuan','unlockedEffects','overflowResearch','awakeningBlueprints','projectedTotalLevel'].some(function (field) { return totals[field] !== plan.totals[field]; })) throw Error('同等组合指标不一致，请重新计算');
    var finalEffects = (plan.finalEffects || []).map(function (row) {
      var detail = beasts.find(function (b) { return b.beastId === row.beastId; });
      var level = detail ? detail.endLevel : (graph.candidates.find(function (c) { return c.detail.beastId === row.beastId; }) || { detail: { startLevel: row.level } }).detail.startLevel;
      var beast = data.beasts.find(function (b) { return b.id === row.beastId; });
      return Object.assign({}, row, { level: level, changed: Boolean(detail), effect: CORE.activeBeastEffect(beast, level) });
    });
    return { kind: plan.kind, totals: totals, beasts: beasts, cost: cost, finalEffects: finalEffects, stableKey: signature(beasts) };
  }

  function preferFewerOperations(data, plan) {
    var graph=plan.equivalents,candidates=new Map(),nodes=new Map(),zero=[0,0,0];
    function add(a,b){return a.map(function(n,i){return n+b[i];});}
    var current=plan.beasts.reduce(function(score,b){return add(score,CORE.processingScore(b));},zero);
    if(!current.some(Boolean))return plan;
    function bestCandidate(id){
      if(candidates.has(id))return candidates.get(id);
      var c=graph.candidates[id],materials=c.materials,best={score:zero,ordinal:0n};
      if(c.conversionPool&&c.detail.items.length&&(c.conversionPool.baseCount||materials.types.some(function(t){
        return t.modificationId!=='none';
      }))){
        var beast=data.beasts.find(function(b){return b.id===c.detail.beastId;});
        var top=materials.types.reduce(function(best,t){
          return t.available!==0&&(!best||t.researchEach*best.weight>best.researchEach*t.weight)?t:best;
        },null);
        var bodies=top?Number((BigInt(c.detail.addedResearch)*BigInt(top.weight)+BigInt(top.researchEach)-1n)/BigInt(top.researchEach)):0;
        var floor=CORE.processingFloor(materials.types,c.conversionPool,bodies,CORE.minimumCoreDeficit(materials.types,c.conversionPool,c.detail.modifiedInvestedCount,true));
        best=null;
        for(var step=0n,end=BigInt(materials.count);step<end;step++){
          var i=step%2n===0n?step/2n:end-1n-step/2n;
          var allocation=CORE.allocateConvertedInventory(data,beast,c.conversionPool,materialItems(materials,i));
          var score=CORE.processingScore(allocation);
          if(!best||CORE.compareProcessing(score,best.score)<0)best={score:score,ordinal:i};
          if(CORE.compareProcessing(score,floor)<=0)break;
        }
      }
      candidates.set(id,best);return best;
    }
    function bestNode(id){
      if(!id)return {score:zero,ordinal:0n};
      if(nodes.has(id))return nodes.get(id);
      var best=null,offset=0n;
      graph.nodes[id].edges.some(function(edge){
        var prior=bestNode(edge[0]),local=bestCandidate(edge[1]),width=BigInt(graph.candidates[edge[1]].materials.count);
        var score=add(prior.score,local.score);
        if(!best||CORE.compareProcessing(score,best.score)<0)best={score:score,ordinal:offset+prior.ordinal*width+local.ordinal};
        offset+=BigInt(graph.nodes[edge[0]].count)*width;
        return !score.some(Boolean);
      });
      nodes.set(id,best);return best;
    }
    var best=bestNode(graph.root);
    return CORE.compareProcessing(best.score,current)<0?Object.assign(plan,decode(data,plan,best.ordinal)):plan;
  }

  function page(data, plan, offset, limit) {
    var graph = plan.equivalents, at = BigInt(offset || '0'), size = Math.max(1, Math.min(50, CORE.integer(limit, 10)));
    if (!graph) return { plans: [], nextOffset: '0', hasMore: false, count: '1' };
    if (at < 0n) throw Error('同等方案分页序号无效');
    var compare = graph.candidates.some(function (candidate) { return candidate.materials.physicalOrdinals; }) ?
      function (beasts) {
        return JSON.stringify(beasts.filter(function (b) { return b.items.length; }).map(function (b) {
          return [b.beastId, physicalKey(b.items)];
        }).sort());
      } : signature;
    var total = BigInt(graph.count), primary = compare(plan.beasts), plans = [];
    while (at < total && plans.length < size) {
      var candidate = decode(data, plan, at++);
      if (compare(candidate.beasts) !== primary) plans.push(candidate);
    }
    // Do not leave a spurious final page containing only the excluded primary.
    if (at + 1n === total && compare(decode(data, plan, at).beasts) === primary) at = total;
    return { plans: plans, nextOffset: String(at), hasMore: at < total, count: graph.count };
  }
  return { append: append, merge: merge, pack: pack, page: page, signature: signature, preferFewerOperations: preferFewerOperations };
});
