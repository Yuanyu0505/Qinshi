(function (root, factory) {
  var core = root && root.MACHINE_BEAST_CORE;
  var equivalents = root && root.MACHINE_BEAST_EQUIVALENTS;
  if (typeof module === "object" && module.exports) { core = require("./machine-beasts.js"); equivalents = require("./machine-beast-equivalents.js"); }
  var api = factory(core, equivalents);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MACHINE_BEAST_SCHOOL_PLANNER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (CORE, EQUIVALENTS) {
  "use strict";

  function schoolById(data, id) {
    return id && typeof id === "object" ? id : data.schools.find(function (s) { return s.id === id; });
  }
  function defaultTargetStage(data, id, progress) {
    var school = schoolById(data, id);
    return school ? Math.min(5, CORE.schoolSnapshot(school, progress || {}, data).currentStage + 1) : 1;
  }
  function gcd(a, b) { while (b) { var c = a % b; a = b; b = c; } return a; }
  function pad(n) { return String(n).padStart(16, "0"); }
  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }
  function sumSafe(a, b) {
    var value = a + b;
    if (!Number.isSafeInteger(value) || value < 0) throw Error("机关兽资源数量或费用超出安全整数范围");
    return value;
  }
  function effectsBetween(beast, start, end) {
    return (beast.effects || []).filter(function (e) { return start < e.level && e.level <= end; }).length;
  }
  function emptyCandidate(beast, progress, level) {
    return { beastId: beast.id, beastName: beast.name, startLevel: level, endLevel: level,
      startResearch: progress.research, endResearch: progress.research, addedResearch: 0,
      overflowResearch: 0, investedCount: 0, ownedInvestedCount: 0, newInvestedCount: 0,
      ownedPhysicalCount: 0, newPhysicalCount: 0, unlockedEffects: 0,
      modifiedInvestedCount: 0, ownedModifiedInvestedCount: 0, newModifiedInvestedCount: 0,
      stableKey: "", items: [], resources: { awakeningBlueprints: 0, organPieces: 0,
        fragments: 0, contribution: 0, yuan: 0, pricedBodyYuan: 0 } };
  }

  // Exact levels can have holes: ordinary materials may jump over a level
  // that a modified material can reach. Omit modifications only in a first
  // pass whose ZERO-modification exact school feasibility is explicitly proven.
  function materialTypes(data, beast, progress, config, gap) {
    var types = [], limits = config.ownedLimits || {};
    if (config.useOwnedInventory !== false) {
      data.modifications.forEach(function (mod) {
        if (mod.id !== "none" && (config.plainOnly || beast.quality !== "orange" ||
            !progress.showMods && !Object.keys(limits[mod.id] || {}).length)) return;
        var ranks = progress.inventory[mod.id] || {};
        Object.keys(ranks).forEach(function (key) {
          var rank = CORE.integer(key), cap = ranks[key];
          if (limits[mod.id] && Object.prototype.hasOwnProperty.call(limits[mod.id], key)) cap = Math.min(cap, CORE.integer(limits[mod.id][key]));
          var research = CORE.researchFor(data, beast, rank, mod.id);
          if (cap && research) types.push({ source: "owned", modificationId: mod.id, rank: rank,
            researchEach: research, weight: rank > 7 ? Math.pow(2, rank - 7) : 1,
            available: Math.min(cap, Math.ceil(gap / research)) });
        });
      });
    }
    if (beast.quality === "orange" || config.bluePurpleInventoryOnly === false) {
      var maxRank = config.newRankMode === "zero" ? 0 : config.allowNewHighRanks ? beast.maxRank : Math.min(7, beast.maxRank);
      for (var rank = 0; rank <= maxRank; rank++) {
        data.modifications.forEach(function (mod) {
          if (mod.id !== "none" && (config.plainOnly || beast.quality !== "orange" || !config.allowNewModifications)) return;
          var research = CORE.researchFor(data, beast, rank, mod.id);
          if (research) types.push({ source: "new", modificationId: mod.id, rank: rank,
            researchEach: research, weight: rank > 7 ? Math.pow(2, rank - 7) : 1,
            available: null });
        });
      }
    }
    types.sort(function (a, b) {
      var x = a.source + ":" + a.modificationId + ":" + pad(a.rank), y = b.source + ":" + b.modificationId + ":" + pad(b.rank);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    types.forEach(function (t) {
      t.blueprints = Math.ceil(t.researchEach / data.resourceRules.blueprintDivisor);
      t.pieces = Math.ceil(t.researchEach / data.resourceRules.organPieceDivisor);
    });
    return types;
  }

  function rawCandidates(data, beast, progress, config) {
    var start = CORE.levelForResearch(progress.research, data.researchThresholds, beast.maxLevel);
    var capLevel = Math.min(beast.maxLevel, start + CORE.integer(config.maxAddedLevel, beast.maxLevel));
    if (capLevel <= start) return [];
    var terminalAllowed = capLevel === beast.maxLevel;
    var gap = Math.max(0, CORE.thresholdForLevel(terminalAllowed ? capLevel : capLevel + 1, data.researchThresholds) - progress.research);
    if (!gap) return [];
    var types = materialTypes(data, beast, progress, config, gap);
    // An optimal irredundant solution uses at most ceil(gap/r) copies of
    // any one rank. Sufficient same-rank owned stock can replace ALL new copies
    // without changing research/B and without increasing acquisition cost.
    // On a full formal tie our fixed vector prefers fewer 'new' entries.
    types = types.filter(function (t) {
      return t.source !== "new" || !types.some(function (owned) {
        return owned.source === "owned" && owned.rank === t.rank && owned.modificationId === t.modificationId &&
          owned.available >= Math.ceil(gap / t.researchEach);
      });
    });
    if (!types.length) return [];
    var unit = types.reduce(function (g, t) { return gcd(g, t.researchEach); }, 0);
    var internalRows = Math.ceil(gap / unit);
    var newTypes = types.filter(function (t) { return t.source === "new"; });
    // Blue/purple acquisition is deliberately unpriced: their new count never
    // affects any formal objective, so exact research + B is sufficient there.
    var trackNew = beast.quality === "orange" && newTypes.length > 0;
    var minimumRate = trackNew ? Math.min.apply(null, newTypes.map(function (t) { return t.researchEach / t.weight; })) : 1;
    var stride = trackNew ? Math.floor((gap - 1) / minimumRate) + 1 : 1;
    var size = internalRows * stride;
    var blueprint = new Float64Array(size); blueprint.fill(Infinity); blueprint[0] = 0;
    var modified = new Float64Array(size); modified.fill(Infinity); modified[0] = 0;
    // Dense typed values avoid millions of Map/state/linked-list objects.
    // A complete quantity vector makes in-place bounded/unbounded updates safe
    // to reconstruct, and is extension-monotone for stable tie comparison.
    var counts = types.map(function (t) {
      return Math.ceil(gap / t.researchEach) <= 65535 ? new Uint16Array(size) : new Uint32Array(size);
    });
    var terminals = new Map();
    function betterVector(from, type, quantity, prior) {
      for (var i = 0; i < types.length; i++) {
        var a = counts[i][from] + (i === type ? quantity : 0);
        var b = typeof prior === "number" ? counts[i][prior] : prior[i];
        if (a !== b) return a < b;
      }
      return false;
    }
    function put(from, r, n, b, type, quantity) {
      var m = modified[from] + (types[type].modificationId === "none" ? 0 : quantity * types[type].weight);
      if (r >= internalRows) {
        if (!terminalAllowed) return;
        var key = n + "/" + b, old = terminals.get(key);
        if (old && (old.m < m || old.m === m && (old.r < r || old.r === r && !betterVector(from, type, quantity, old.counts)))) return;
        terminals.set(key, { r: r, n: n, b: b, m: m, counts: types.map(function (_, i) { return counts[i][from] + (i === type ? quantity : 0); }) });
        return;
      }
      var target = r * stride + n;
      if (modified[target] < m || modified[target] === m && (blueprint[target] < b || blueprint[target] === b && !betterVector(from, type, quantity, target))) return;
      blueprint[target] = b; modified[target] = m;
      for (var i = 0; i < types.length; i++) counts[i][target] = counts[i][from] + (i === type ? quantity : 0);
    }
    types.forEach(function (type, index) {
      var step = type.researchEach / unit;
      if (type.source === "owned") {
        var left = type.available, chunk = 1;
        while (left > 0) {
          var quantity = Math.min(left, chunk);
          for (var r = internalRows - 1; r >= 0; r--) {
            for (var n = 0; n < stride; n++) {
              var from = r * stride + n, b = blueprint[from];
              if (b !== Infinity) put(from, r + step * quantity, n, b + type.blueprints * quantity, index, quantity);
            }
          }
          left -= quantity; chunk *= 2;
        }
      } else {
        for (var r = 0; r < internalRows; r++) {
          for (var n = 0; n < stride; n++) {
            var from = r * stride + n, b = blueprint[from];
            if (b !== Infinity) put(from, r + step, trackNew ? n + type.weight : 0, b + type.blueprints, index, 1);
          }
        }
      }
    });
    var compact = new Map();
    function record(r, n, b, m, vector) {
      var research = r * unit;
      var level = CORE.levelForResearch(progress.research + research, data.researchThresholds, beast.maxLevel);
      if (level === start || level > capLevel) return;
      var key = level + "/" + n + "/" + b;
      var prior = compact.get(key);
      var stable = vector.map(pad).join("");
      if (prior && (prior.modified < m || prior.modified === m && (prior.research < research || prior.research === research && prior.stable <= stable))) return;
      var items = [], invested = 0, owned = 0, pieces = 0, ownedPhysical = 0, newPhysical = 0, newCount = 0, ownedModified = 0, newModified = 0;
      vector.forEach(function (count, i) {
        if (!count) return;
        var t = types[i];
        items.push({ source: t.source, rank: t.rank, modificationId: t.modificationId, count: count,
          researchEach: t.researchEach, sevenRankEquivalent: t.weight });
        invested += count * t.weight; pieces += count * t.pieces;
        if (t.source === "owned") { owned += count * t.weight; ownedPhysical += count; }
        else { newPhysical += count; newCount += count * t.weight; }
        if (t.modificationId !== "none") {
          if (t.source === "owned") ownedModified += count * t.weight; else newModified += count * t.weight;
        }
      });
      compact.set(key, { endLevel: level, research: research, newCount: newCount,
        blueprints: b, pieces: pieces, invested: invested, owned: owned,
        ownedPhysical: ownedPhysical, newPhysical: newPhysical, items: items, stable: stable,
        modified: m, ownedModified: ownedModified, newModified: newModified });
    }
    for (var r = 1; r < internalRows; r++) {
      var level = CORE.levelForResearch(progress.research + r * unit, data.researchThresholds, beast.maxLevel);
      if (level === start) continue;
      for (var n = 0; n < stride; n++) {
        var from = r * stride + n, b = blueprint[from];
        var prior = compact.get(level + "/" + n + "/" + b);
        if (b === Infinity || prior && prior.modified <= modified[from]) continue;
        record(r, n, b, modified[from], counts.map(function (array) { return array[from]; }));
      }
    }
    terminals.forEach(function (s) { record(s.r, s.n, s.b, s.m, s.counts); });
    return Array.from(compact.values());
  }

  function dominates(a, b) {
    // Componentwise monotone for ANY future shared blueprint demand. Never
    // prune using the current post-stock price alone.
    if (a.body > b.body || a.blueprints > b.blueprints || a.effects < b.effects || a.overflow > b.overflow) return false;
    return a.body < b.body || a.blueprints < b.blueprints || a.effects > b.effects ||
      a.overflow < b.overflow || a.key <= b.key;
  }
  function paretoInsert(frontier, value) {
    for (var i = 0; i < frontier.length; i++) if (dominates(frontier[i], value)) return;
    for (var i = frontier.length - 1; i >= 0; i--) if (dominates(value, frontier[i])) frontier.splice(i, 1);
    frontier.push(value);
  }

  function machineBeastCandidates(data, beast, rawProgress, options) {
    var config = options || {}, progress = CORE.normalizeBeastProgress(beast, rawProgress, data);
    var settings = CORE.normalizeReferenceCostSettings(data, config.referenceCostSettings);
    var stock = settings.useAwakeningBlueprintStock ? settings.awakeningBlueprintStock : 0;
    var price = settings.awakeningBlueprintPrice;
    var current = CORE.levelForResearch(progress.research, data.researchThresholds, beast.maxLevel);
    var cache = config.materialCache, typesKey = JSON.stringify([beast.quality, beast.maxLevel, beast.maxRank,
      progress.research, progress.inventory, config.ownedLimits || {}, config.useOwnedInventory !== false,
      config.bluePurpleInventoryOnly !== false, config.newRankMode || "zeroToSeven", !!config.allowNewHighRanks,
      config.plainOnly, config.allowNewModifications, progress.showMods, config.maxAddedLevel]);
    var raw = cache && cache.get(typesKey);
    if (!raw) { raw = rawCandidates(data, beast, progress, config); if (cache) cache.set(typesKey, raw); }
    var byLevel = new Map(), costs = new Map();
    var minimumModified = new Map();
    raw.forEach(function (r) { minimumModified.set(r.endLevel, Math.min(minimumModified.has(r.endLevel) ? minimumModified.get(r.endLevel) : Infinity, r.modified)); });
    raw.forEach(function (r) {
      if (r.modified !== minimumModified.get(r.endLevel)) return;
      var cost = costs.get(r.newCount);
      if (!cost) {
        var fragments = Math.max(0, r.newCount * beast.fragmentsPerBody - progress.fragments);
        cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: 0, beasts: [{ beastId: beast.id, fragments: fragments }] }, settings);
        costs.set(r.newCount, cost);
      }
      if (!cost.complete) throw Error(beast.name + "缺少本体参考价格，请先补齐再计算");
      var candidate = {
        beastId: beast.id, beastName: beast.name, startLevel: current, endLevel: r.endLevel,
        startResearch: progress.research, endResearch: progress.research + r.research,
        addedResearch: r.research, overflowResearch: progress.research + r.research - CORE.thresholdForLevel(r.endLevel, data.researchThresholds),
        investedCount: r.invested, ownedInvestedCount: r.owned, newInvestedCount: r.newCount,
        ownedPhysicalCount: r.ownedPhysical, newPhysicalCount: r.newPhysical,
        modifiedInvestedCount: r.modified, ownedModifiedInvestedCount: r.ownedModified, newModifiedInvestedCount: r.newModified,
        unlockedEffects: effectsBetween(beast, current, r.endLevel), stableKey: r.stable, items: r.items,
        resources: { awakeningBlueprints: r.blueprints, organPieces: r.pieces,
          fragments: Math.max(0, r.newCount * beast.fragmentsPerBody - progress.fragments),
          contribution: cost.beasts.length ? cost.beasts[0].contribution : 0,
          yuan: cost.knownYuan, pricedBodyYuan: cost.knownYuan }
      };
      var bucket = byLevel.get(r.endLevel) || [];
      var value = { body: cost.knownYuan, blueprints: r.blueprints, effects: candidate.unlockedEffects,
        overflow: candidate.overflowResearch, key: r.stable, candidate: candidate };
      // Once the SAME candidate alone covers shared stock, integer blueprint
      // pricing is linear under every future continuation.
      if (Number.isInteger(price) && r.blueprints >= stock) {
        var saturated = bucket.find(function (v) { return v.blueprints >= stock; });
        if (saturated) {
          var compare = cmp([sumSafe(value.body, price * (value.blueprints-stock)), value.overflow, value.blueprints, value.key],
            [sumSafe(saturated.body, price * (saturated.blueprints-stock)), saturated.overflow, saturated.blueprints, saturated.key]);
          if (compare >= 0) return;
          bucket.splice(bucket.indexOf(saturated), 1);
        }
      }
      paretoInsert(bucket, value); byLevel.set(r.endLevel, bucket);
    });
    return [emptyCandidate(beast, progress, current)].concat(Array.from(byLevel.values()).flat().map(function (v) { return v.candidate; }));
  }

  function combine(data, sets, baseline, needed, settings, effectMode) {
    var stock = settings.useAwakeningBlueprintStock ? settings.awakeningBlueprintStock : 0;
    var price = settings.awakeningBlueprintPrice, feeCache = new Map();
    function fee(b) {
      if (!feeCache.has(b)) feeCache.set(b, Number.isInteger(price) ? sumSafe(0, Math.max(0, b - stock) * price) :
        CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: b, beasts: [] }, settings).blueprints.yuan);
      return feeCache.get(b);
    }
    function order(s, withoutStable) {
      var yuan = sumSafe(s.body, fee(s.blueprints));
      return [s.modified].concat(effectMode ? [-s.effects, yuan, s.overflow, s.blueprints] : [yuan, -s.effects, s.overflow, s.blueprints]).concat(withoutStable ? [] : [s.key]);
    }
    function mergeEquivalent(prior, value) {
      var trace = EQUIVALENTS.merge(prior.trace, value.trace);
      var chosen = value.key < prior.key ? value : prior;
      chosen.trace = trace;
      return chosen;
    }
    // Exact remaining gain, with modification count first and crossed nodes
    // second. This is a feasibility bound, not a cost/frontier replacement.
    var suffixGoals = Array(sets.length + 1);
    suffixGoals[sets.length] = new Map([[0, { modified: 0, effects: 0 }]]);
    for (var si = sets.length - 1; si >= 0; si--) {
      var goals = new Map();
      sets[si].forEach(function (c) {
        suffixGoals[si + 1].forEach(function (tail, gain) {
          var added = gain + c.endLevel - c.startLevel;
          if (added > needed) return;
          var value = { modified: tail.modified + c.modifiedInvestedCount, effects: tail.effects + c.unlockedEffects };
          var old = goals.get(added);
          if (!old || cmp([value.modified, -value.effects], [old.modified, -old.effects]) < 0) goals.set(added, value);
        });
      });
      suffixGoals[si] = goals;
    }
    var goal = suffixGoals[0].get(needed);
    if (!goal) return null;
    var suffixGain=Array(sets.length+1).fill(0),suffixEffects=Array(sets.length+1).fill(0);
    for(var k=sets.length-1;k>=0;k--){
      suffixGain[k]=suffixGain[k+1]+Math.max.apply(null,sets[k].map(function(c){return c.endLevel-c.startLevel;}));
      suffixEffects[k]=suffixEffects[k+1]+Math.max.apply(null,sets[k].map(function(c){return c.unlockedEffects;}));
    }
    var requiredEffects=effectMode ? goal.effects : null,blueprintBudget=Infinity;
    if(!effectMode&&sets.every(function(cs){return cs.every(function(c){return c.resources.pricedBodyYuan===0;});})){
      // With free owned bodies, first determine the exact achievable primary
      // fee and effect count using minimum B per (level,effects). This pass is
      // ONLY a feasibility bound; overflow/stable optimization still follows.
      var width=suffixEffects[0]+1, bounds=new Map([[0,{ modified: 0, b: 0 }]]);
      sets.forEach(function(cs){var nextBounds=new Map();bounds.forEach(function(prior,key){
        var gain=Math.floor(key/width),effects=key%width;
        cs.forEach(function(c){var added=gain+c.endLevel-c.startLevel;if(added>needed)return;
          var nk=added*width+effects+c.unlockedEffects;
          var value={modified:prior.modified+c.modifiedInvestedCount,b:prior.b+c.resources.awakeningBlueprints},old=nextBounds.get(nk);
          if(!old||cmp([value.modified,value.b],[old.modified,old.b])<0)nextBounds.set(nk,value);});
      });bounds=nextBounds;});
      var bestFee=Infinity;requiredEffects=-1;
      bounds.forEach(function(value,key){if(Math.floor(key/width)!==needed||value.modified!==goal.modified)return;var y=fee(value.b),e=key%width;
        if(y<bestFee||y===bestFee&&e>requiredEffects){bestFee=y;requiredEffects=e;}});
      var hi=sets.reduce(function(n,cs){return n+Math.max.apply(null,cs.map(function(c){return c.resources.awakeningBlueprints;}));},0),lo=0;
      while(lo<hi){var mid=Math.ceil((lo+hi)/2);if(fee(mid)<=bestFee)lo=mid;else hi=mid-1;}blueprintBudget=lo;
    }
    var states = new Map([[0, [{ gain: 0, modified: 0, body: 0, blueprints: 0, effects: 0, overflow: 0, key: "", beasts: [], trace: null }]]]);
    sets.forEach(function (allCandidates,setIndex) {
      var candidates = allCandidates;
      var collected = new Map();
      states.forEach(function (frontier) {
        frontier.forEach(function (s) {
          candidates.forEach(function (c) {
            var gain = s.gain + c.endLevel - c.startLevel;
            if (gain > needed) return;
            var tail = suffixGoals[setIndex + 1].get(needed - gain);
            var modified = s.modified + c.modifiedInvestedCount;
            if (!tail || modified + tail.modified !== goal.modified) return;
            var changed = c.items.length > 0;
            var v = { gain: gain, modified: modified,
              body: sumSafe(s.body, c.resources.pricedBodyYuan),
              blueprints: sumSafe(s.blueprints, c.resources.awakeningBlueprints),
              effects: s.effects + c.unlockedEffects, overflow: sumSafe(s.overflow, c.overflowResearch),
              key: s.key + c.beastId + ":" + c.stableKey + "|",
              beasts: changed ? s.beasts.concat([c]) : s.beasts, trace: EQUIVALENTS.append(s.trace, c) };
            if(v.gain+suffixGain[setIndex+1]<needed||v.blueprints>blueprintBudget)return;
            if(requiredEffects!==null&&(v.effects>requiredEffects||v.effects+suffixEffects[setIndex+1]<requiredEffects))return;
            if(effectMode&&v.effects+tail.effects<requiredEffects)return;
            var key = v.gain, bucket = collected.get(key);
            if (!bucket) { bucket = { saturated: null, values: new Map() }; collected.set(key, bucket); }
            if (Number.isInteger(price) && v.blueprints >= stock) {
              var comparison = bucket.saturated ? cmp(order(v, true), order(bucket.saturated, true)) : -1;
              if (comparison < 0) bucket.saturated = v;
              else if (comparison === 0) bucket.saturated = mergeEquivalent(bucket.saturated, v);
              return;
            }
            var identity = v.modified + "/" + v.body + "/" + v.blueprints + "/" + v.effects;
            var prior = bucket.values.get(identity);
            if (!prior || v.overflow < prior.overflow) bucket.values.set(identity,v);
            else if (v.overflow === prior.overflow) bucket.values.set(identity,mergeEquivalent(prior,v));
          });
        });
      });
      var next = new Map();
      collected.forEach(function (bucket, key) {
        var values = Array.from(bucket.values.values());
        if (bucket.saturated) values.push(bucket.saturated);
        var frontier = [];
        if (values.length && values.every(function (v) { return v.body === values[0].body; })) {
          // Equal body cost: exact 3D dominance sweep, O(n log effects), rather
          // than quadratic pairwise scans for thousands of free-stock states.
          values.sort(function (a,b) { return cmp([a.blueprints,-a.effects,a.overflow,a.key],[b.blueprints,-b.effects,b.overflow,b.key]); });
          var maximum = Math.max.apply(null,values.map(function(v){return v.effects;}));
          var tree = Array(maximum+3).fill(Infinity);
          values.forEach(function(v){
            var at=maximum-v.effects+1, best=Infinity;
            for(var i=at;i>0;i-=i&-i)best=Math.min(best,tree[i]);
            if(best<=v.overflow)return;
            frontier.push(v);
            for(var i=at;i<tree.length;i+=i&-i)tree[i]=Math.min(tree[i],v.overflow);
          });
        } else values.forEach(function(v){paretoInsert(frontier,v);});
        next.set(key,frontier);
      });
      states = next;
    });
    var finals = states.get(needed);
    if (!finals || !finals.length) return null;
    finals.sort(function (a, b) { return cmp(order(a), order(b)); });
    var best = finals[0];
    var cost = CORE.calculateSchoolReferenceCost(data, { awakeningBlueprints: best.blueprints,
      beasts: best.beasts.map(function (b) { return { beastId: b.beastId, fragments: b.resources.fragments }; }) }, settings);
    if (!cost.complete) throw Error("存在未设置价格的计价资源，不能给出最优方案");
    var totals = { investedCount: 0, ownedInvestedCount: 0, newInvestedCount: 0, ownedPhysicalCount: 0,
      newPhysicalCount: 0, milestoneCount: best.effects, unlockedEffects: best.effects,
      modifiedInvestedCount: 0, ownedModifiedInvestedCount: 0, newModifiedInvestedCount: 0,
      overflowResearch: best.overflow, awakeningBlueprints: best.blueprints, organPieces: 0,
      fragments: 0, contribution: 0, yuan: 0, pricedYuan: cost.totalYuan, projectedTotalLevel: baseline + best.gain };
    best.beasts.forEach(function (b) {
      ["investedCount", "ownedInvestedCount", "newInvestedCount", "ownedPhysicalCount", "newPhysicalCount", "modifiedInvestedCount", "ownedModifiedInvestedCount", "newModifiedInvestedCount"].forEach(function (field) { totals[field] += b[field]; });
      totals.organPieces += b.resources.organPieces; totals.fragments += b.resources.fragments;
      totals.contribution = totals.contribution === null || b.resources.contribution === null ? null : totals.contribution + b.resources.contribution;
      totals.yuan += b.resources.pricedBodyYuan;
    });
    return { kind: effectMode ? "effects" : "cost", totals: totals, beasts: best.beasts, cost: cost, stableKey: best.key, _trace: best.trace };
  }

  function calculateSchoolPlans(data, id, progressByBeast, options) {
    try {
      var config = options || {}, school = schoolById(data, id);
      if (!school) throw Error("未找到对应机关术流派");
      var stage = CORE.integer(config.targetStage, defaultTargetStage(data, school, progressByBeast));
      var targetStage = school.stages.find(function (s) { return s.stage === stage; });
      if (!targetStage || targetStage.requiredTotalLevel === null) throw Error("目标流派阶数必须为1至5阶");
      var progress = progressByBeast || {}, baseline = CORE.schoolSnapshot(school, progress, data).totalLevel;
      var needed = Math.max(0, targetStage.requiredTotalLevel - baseline);
      var resultBase = { valid: true, errors: [], current: { totalLevel: baseline },
        target: { stage: stage, totalLevel: targetStage.requiredTotalLevel, remaining: needed } };
      if (!needed) return Object.assign(resultBase, { alreadyReached: true, plans: [] });
      var settings = CORE.normalizeReferenceCostSettings(data, config.referenceCostSettings);
      if (settings.awakeningBlueprintPrice === null) throw Error("请先设置有效的觉醒神图单价再计算");
      var participating = new Set(config.participatingBeastIds || school.beastIds);
      var cache = new Map(), sets = [], equivalentSources = {};
      function buildSets(plainOnly) {
        sets = [];
        school.beastIds.slice().sort().forEach(function (beastId) {
          if (!participating.has(beastId)) return;
          var beast = data.beasts.find(function (b) { return b.id === beastId; });
          if (!beast) return;
          var current = CORE.normalizeBeastProgress(beast, progress[beastId], data);
          if (beast.quality === "orange" && beast.contributionPerFragment === null &&
              CORE.levelForResearch(current.research, data.researchThresholds, beast.maxLevel) < beast.maxLevel &&
              settings.beastPrices[beastId] === null) throw Error(beast.name + "缺少本体参考价格，请先补齐再计算");
          var beastConfig = Object.assign({}, config, {
            plainOnly: plainOnly, maxAddedLevel: needed,
            materialCache: cache, referenceCostSettings: settings,
            bluePurpleInventoryOnly: config.bluePurpleInventoryOnly === undefined ? settings.bluePurpleInventoryOnly : config.bluePurpleInventoryOnly,
            ownedLimits: config.ownedLimitsByBeast && config.ownedLimitsByBeast[beastId]
          });
          sets.push(machineBeastCandidates(data, beast, current, beastConfig));
          // Keep the full type domain for tied-material reconstruction, including
          // new types removed from the representative search by owned-stock ties.
          equivalentSources[beastId] = { fragments: current.fragments, types: materialTypes(data, beast, current, beastConfig,
            Math.max(0, CORE.thresholdForLevel(beast.maxLevel, data.researchThresholds) - current.research)) };
        });
      }
      function exactReachable() {
        var reachable = new Set([0]);
        sets.forEach(function (cs) {
          var next = new Set();
          reachable.forEach(function (gain) { cs.forEach(function (c) {
            var added = gain + c.endLevel - c.startLevel;
            if (added <= needed) next.add(added);
          }); });
          reachable = next;
        });
        return reachable.has(needed);
      }
      buildSets(true);
      // If a zero-modification exact solution exists it dominates EVERY
      // modified solution under both formal orders, regardless of its price.
      if (!exactReachable()) buildSets(false);
      if (!exactReachable()) throw Error("当前条件下无法精确达到目标，请调整参与范围、材料或蓝紫库存限制");
      var cost = combine(data, sets, baseline, needed, settings, false);
      var effects = combine(data, sets, baseline, needed, settings, true);
      if (!cost || !effects) throw Error("当前条件下无法精确达到目标");
      var plans = cost.stableKey === effects.stableKey ? [Object.assign({}, cost, { kind: "merged" })] : [cost, effects];
      plans.forEach(function (plan) {
        plan.beasts.forEach(function (b) { b.finalEffect = CORE.activeBeastEffect(data.beasts.find(function (beast) { return beast.id === b.beastId; }), b.endLevel); });
        plan.finalEffects = school.beastIds.map(function (beastId) {
          var beast = data.beasts.find(function (b) { return b.id === beastId; });
          if (!beast) return null;
          var detail = plan.beasts.find(function (b) { return b.beastId === beastId; });
          var level = detail ? detail.endLevel : CORE.levelForResearch((progress[beastId] || {}).research, data.researchThresholds, beast.maxLevel);
          return { beastId: beastId, beastName: beast.name, level: level, changed: Boolean(detail), effect: CORE.activeBeastEffect(beast, level) };
        }).filter(Boolean);
        plan.equivalents = EQUIVALENTS.pack(data, plan._trace, equivalentSources, settings);
        delete plan._trace;
      });
      return Object.assign(resultBase, { alreadyReached: false, plans: plans,
        model: { exact: true, modificationMinimum: cost.totals.modifiedInvestedCount, bluePurpleInventoryOnly: config.bluePurpleInventoryOnly === undefined ? settings.bluePurpleInventoryOnly : config.bluePurpleInventoryOnly,
          excludedCosts: ["蓝紫本体获取", "机关破片获取", "高阶制作", "改造制作"] } });
    } catch (error) { return { valid: false, errors: [error.message || "流派计算失败"] }; }
  }
  return { defaultTargetStage: defaultTargetStage, machineBeastCandidates: machineBeastCandidates, calculateSchoolPlans: calculateSchoolPlans, equivalentPlansPage: EQUIVALENTS.page };
});
