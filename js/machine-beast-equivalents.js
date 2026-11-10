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
    function visit(index, research, blueprints, modified, newCount) {
      if (research < 0 || blueprints < 0 || modified < 0 || body(newCount) > targetBody) return -1;
      var waste = blueprints * data.resourceRules.blueprintDivisor - research;
      if (waste < 0) return -1;
      if (index === types.length) return research === 0 && blueprints === 0 && modified === 0 && body(newCount) === targetBody ? 0 : -1;
      if (research % suffixGcd[index]) return -1;
      var key = [index, research, blueprints, modified, newCount].join('/');
      if (memo.has(key)) return memo.get(key);
      var t = types[index], mod = t.modificationId === 'none' ? 0 : t.weight;
      var cap = Math.min(Math.floor(research / t.researchEach), Math.floor(blueprints / t.blueprints), t.available == null ? Infinity : t.available);
      var typeWaste = t.blueprints * data.resourceRules.blueprintDivisor - t.researchEach;
      if (typeWaste > 0) cap = Math.min(cap, Math.floor(waste / typeWaste));
      if (mod) cap = Math.min(cap, Math.floor(modified / mod));
      var edges = [], count = 0n;
      for (var quantity = 0; quantity <= cap; quantity++) {
        var nextNew = newCount + (t.source === 'new' && beast.quality === 'orange' ? quantity * t.weight : 0);
        var child = visit(index + 1, research - quantity * t.researchEach, blueprints - quantity * t.blueprints, modified - quantity * mod, nextNew);
        if (child < 0) continue;
        edges.push([quantity, child]); count += BigInt(nodes[child].count);
      }
      var id = -1;
      if (count) { id = nodes.length; nodes.push({ type: index, count: String(count), edges: edges }); }
      memo.set(key, id); return id;
    }
    var root = visit(0, targetResearch, targetB, targetM, 0);
    if (root < 0) throw Error('无法重建主方案的同等材料路径');
    return { types: types, nodes: nodes, root: root, count: nodes[root].count };
  }

  function pack(data, trace, sources, settings) {
    var nodes = [{ count: '1', edges: [] }], candidates = [], nodeIds = new Map(), candidateIds = new Map();
    function candidateId(candidate) {
      if (candidateIds.has(candidate)) return candidateIds.get(candidate);
      var source = sources[candidate.beastId];
      var materials = candidate.items.length ? materialGraph(data, candidate, source, settings) : { types: [], nodes: [{ count: '1', edges: [] }], root: 0, count: '1' };
      var id = candidates.length;
      candidates.push({ detail: candidate, fragmentsBefore: source.fragments, materials: materials });
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
    items.forEach(function (item) {
      var weight = item.count * item.sevenRankEquivalent, owned = item.source === 'owned';
      detail.investedCount += weight;
      detail[owned ? 'ownedInvestedCount' : 'newInvestedCount'] += weight;
      detail[owned ? 'ownedPhysicalCount' : 'newPhysicalCount'] += item.count;
      if (item.modificationId !== 'none') detail[owned ? 'ownedModifiedInvestedCount' : 'newModifiedInvestedCount'] += weight;
      pieces += item.count * Math.ceil(item.researchEach / data.resourceRules.organPieceDivisor);
    });
    var fragments = Math.max(0, detail.newInvestedCount * beast.fragmentsPerBody - packed.fragmentsBefore);
    var cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: 0, beasts: [{ beastId: beast.id, fragments: fragments }] }, settings);
    detail.resources = Object.assign({}, base.resources, { organPieces: pieces, fragments: fragments,
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

  function page(data, plan, offset, limit) {
    var graph = plan.equivalents, at = BigInt(offset || '0'), size = Math.max(1, Math.min(50, CORE.integer(limit, 10)));
    if (!graph) return { plans: [], nextOffset: '0', hasMore: false, count: '1' };
    if (at < 0n) throw Error('同等方案分页序号无效');
    var total = BigInt(graph.count), primary = signature(plan.beasts), plans = [];
    while (at < total && plans.length < size) {
      var candidate = decode(data, plan, at++);
      if (signature(candidate.beasts) !== primary) plans.push(candidate);
    }
    // Do not leave a spurious final page containing only the excluded primary.
    if (at + 1n === total && signature(decode(data, plan, at).beasts) === primary) at = total;
    return { plans: plans, nextOffset: String(at), hasMore: at < total, count: graph.count };
  }
  return { append: append, merge: merge, pack: pack, page: page, signature: signature };
});
