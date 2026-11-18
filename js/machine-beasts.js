(function (root, factory) {
  var core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.MACHINE_BEAST_CORE = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function integer(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return fallback === undefined ? 0 : fallback;
    return Math.floor(number);
  }

  function thresholdForLevel(level, thresholds) {
    var normalized = Math.max(0, integer(level));
    return integer(thresholds[normalized], 0);
  }

  function levelForResearch(total, thresholds, maxLevel) {
    var research = integer(total);
    var maximum = Math.max(0, integer(maxLevel, 25));
    var level = 0;
    for (var candidate = 1; candidate <= maximum; candidate += 1) {
      if (research < thresholdForLevel(candidate, thresholds)) break;
      level = candidate;
    }
    return level;
  }

  function nextEffectLevel(beast, currentLevel) {
    var current = integer(currentLevel);
    var next = beast.effects.find(function (effect) { return effect.level > current; });
    return next ? next.level : beast.maxLevel;
  }

  function activeBeastEffect(beast, currentLevel) {
    var current = integer(currentLevel);
    var active = null;
    beast.effects.forEach(function (effect) {
      if (effect.level <= current) active = effect;
    });
    return active;
  }

  function normalizeSearch(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/[\s·•・]/g, "");
  }

  function searchBeasts(data, query) {
    var keyword = normalizeSearch(query);
    if (!keyword) return data.beasts.slice();
    var schools = {};
    data.schools.forEach(function (school) { schools[school.id] = school.name; });
    return data.beasts.filter(function (beast) {
      var effectText = (beast.effects || []).map(function (effect) { return effect.text; }).join(" ");
      var sourceText = (beast.sources || []).join(" ");
      var searchable = [beast.name, beast.tier, schools[beast.schoolId] || "", effectText, sourceText]
        .map(normalizeSearch).join(" ");
      return searchable.indexOf(keyword) !== -1;
    });
  }

  function referenceNumber(value, fallback) {
    if (typeof value !== "number" && typeof value !== "string") return fallback;
    if (typeof value === "string" && !value.trim()) return fallback;
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function contributionPerYuan(data) {
    var rules = data && data.referenceCostRules || {};
    return referenceNumber(rules.contributionPerYuan, 2.7) || 2.7;
  }

  function decimalFraction(value) {
    var parts = String(value).toLowerCase().split("e");
    var decimal = parts[0].split(".");
    var fractionDigits = decimal[1] || "";
    var scale = fractionDigits.length - Number(parts[1] || 0);
    var numerator = BigInt(decimal[0] + fractionDigits);
    var denominator = BigInt(1);
    if (scale > 0) denominator = BigInt(10) ** BigInt(scale);
    else if (scale < 0) numerator *= BigInt(10) ** BigInt(-scale);
    return [numerator, denominator];
  }

  // Round the original decimal factors, not an already-rounded binary product.
  // Exact remainders preserve genuine fractions, including fractions below an epsilon.
  function ceilReferenceYuan(factors, divisor) {
    var numerator = BigInt(1);
    var denominator = BigInt(1);
    factors.forEach(function (factor) {
      var fraction = decimalFraction(factor);
      numerator *= fraction[0];
      denominator *= fraction[1];
    });
    var divisorFraction = decimalFraction(divisor);
    numerator *= divisorFraction[1];
    denominator *= divisorFraction[0];
    return Number((numerator + denominator - BigInt(1)) / denominator);
  }

  function normalizeReferenceCostSettings(data, raw) {
    var source = raw && typeof raw === "object" ? raw : {};
    var rules = data && data.referenceCostRules || {};
    var sourcePrices = source.beastPrices && typeof source.beastPrices === "object" ? source.beastPrices : {};
    var prices = {};
    var defaultBlueprintPrice = referenceNumber(rules.blueprintPrice, 70);
    var defaultOrangeFivePrice = referenceNumber(rules.orangeFiveBodyPrice, 45000);
    (data && data.beasts || []).forEach(function (beast) {
      if (referenceNumber(beast.contributionPerFragment, null) !== null) return;
      prices[beast.id] = Object.prototype.hasOwnProperty.call(sourcePrices, beast.id) ?
        referenceNumber(sourcePrices[beast.id], null) : (beast.tier === "橙五" ? defaultOrangeFivePrice : null);
    });
    return {
      bluePurpleInventoryOnly: source.bluePurpleInventoryOnly !== false,
      awakeningBlueprintStock: Math.floor(referenceNumber(source.awakeningBlueprintStock, 0)),
      useAwakeningBlueprintStock: source.useAwakeningBlueprintStock !== false,
      awakeningBlueprintPrice: Object.prototype.hasOwnProperty.call(source, "awakeningBlueprintPrice") ?
        referenceNumber(source.awakeningBlueprintPrice, null) : defaultBlueprintPrice,
      beastPrices: prices
    };
  }

  function calculateReferenceCost(data, requirements, rawSettings) {
    var settings = normalizeReferenceCostSettings(data, rawSettings);
    var requested = requirements && typeof requirements === "object" ? requirements : {};
    var contributionRatePerYuan = contributionPerYuan(data);
    var required = Math.floor(referenceNumber(requested.awakeningBlueprints, 0));
    var usedStock = settings.useAwakeningBlueprintStock ? Math.min(required, settings.awakeningBlueprintStock) : 0;
    var missing = required - usedStock;
    var blueprintYuan = !missing ? 0 : (settings.awakeningBlueprintPrice === null ? null :
      ceilReferenceYuan([missing, settings.awakeningBlueprintPrice], 1));
    var knownYuan = blueprintYuan === null ? 0 : blueprintYuan;
    var complete = blueprintYuan !== null;
    var missingPrices = [];
    var merged = new Map();
    (Array.isArray(requested.beasts) ? requested.beasts : []).forEach(function (entry) {
      var item = entry && typeof entry === "object" ? entry : {};
      var beastId = String(item.beastId == null ? "unknown-beast" : item.beastId);
      var fragments = Math.floor(referenceNumber(item.fragments, 0));
      merged.set(beastId, (merged.get(beastId) || 0) + fragments);
    });
    var beasts = [];
    merged.forEach(function (fragments, beastId) {
      var beast = (data && data.beasts || []).find(function (item) { return item.id === beastId; });
      var beastName = beast ? beast.name : beastId;
      var fragmentsPerBody = beast ? referenceNumber(beast.fragmentsPerBody, 0) : 0;
      var bodyEquivalent = fragmentsPerBody > 0 ? fragments / fragmentsPerBody : null;
      var contributionRate = beast ? referenceNumber(beast.contributionPerFragment, null) : null;
      var contribution = contributionRate === null ? null : fragments * contributionRate;
      var unitPrice = beast && contributionRate === null ? settings.beastPrices[beastId] : null;
      var yuan = 0;
      if (fragments > 0) {
        if (contribution !== null) yuan = Math.ceil(contribution / contributionRatePerYuan);
        else yuan = unitPrice !== null && unitPrice !== undefined && bodyEquivalent !== null ?
          ceilReferenceYuan([fragments, unitPrice], fragmentsPerBody) : null;
      }
      if (yuan === null) {
        complete = false;
        missingPrices.push({ beastId: beastId, beastName: beastName });
      } else knownYuan += yuan;
      beasts.push({
        beastId: beastId,
        beastName: beastName,
        fragments: fragments,
        bodyEquivalent: bodyEquivalent,
        unitPrice: unitPrice === undefined ? null : unitPrice,
        contribution: contribution,
        yuan: yuan
      });
    });
    return {
      complete: complete,
      totalYuan: complete ? knownYuan : null,
      knownYuan: knownYuan,
      blueprints: {
        required: required, usedStock: usedStock, missing: missing,
        unitPrice: settings.awakeningBlueprintPrice, yuan: blueprintYuan
      },
      beasts: beasts,
      missingPrices: missingPrices
    };
  }

  // School plans compare priced resources only. Keep the legacy single-beast
  // calculator's explicit blue/purple price behavior unchanged.
  function calculateSchoolReferenceCost(data, requirements, rawSettings) {
    var beastsById = new Map((data && data.beasts || []).map(function (beast) {
      return [beast.id, beast];
    }));
    var requested = requirements && typeof requirements === "object" ? requirements : {};
    var unpricedFragments = new Map();
    var entryOrder = new Map();
    var pricedEntries = (Array.isArray(requested.beasts) ? requested.beasts : []).filter(function (rawEntry) {
      var entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
      var beastId = String(entry.beastId == null ? "unknown-beast" : entry.beastId);
      if (!entryOrder.has(beastId)) entryOrder.set(beastId, entryOrder.size);
      var beast = beastsById.get(beastId);
      var unpriced = beast && (beast.quality === "blue" || beast.quality === "purple" || beast.tier === "蓝色" || beast.tier === "紫色");
      if (unpriced) unpricedFragments.set(beastId,
        (unpricedFragments.get(beastId) || 0) + Math.floor(referenceNumber(entry.fragments, 0)));
      return !unpriced;
    });
    // Exclude unknown acquisition costs before arithmetic, not by subtracting
    // their prices afterward: a large ignored price can erase small known costs.
    var result = calculateReferenceCost(data, Object.assign({}, requested, { beasts: pricedEntries }), rawSettings);
    result.unpricedResources = [];
    result.beasts.forEach(function (entry) {
      var beast = beastsById.get(entry.beastId);
      if (!beast) return;
      if (entry.contribution !== null) {
        // Aggregate identical deficits first (the legacy calculator does this),
        // then round original decimal factors, avoiding binary-product errors.
        var exactYuan = ceilReferenceYuan([entry.fragments, beast.contributionPerFragment], contributionPerYuan(data));
        result.knownYuan += exactYuan - entry.yuan;
        entry.yuan = exactYuan;
      }
    });
    unpricedFragments.forEach(function (fragments, beastId) {
      var beast = beastsById.get(beastId);
      var bodySize = referenceNumber(beast.fragmentsPerBody, 0);
      var bodyEquivalent = bodySize > 0 ? fragments / bodySize : null;
      result.beasts.push({ beastId: beastId, beastName: beast.name, fragments: fragments,
        bodyEquivalent: bodyEquivalent, unitPrice: null, contribution: null,
        yuan: fragments > 0 ? null : 0, priced: false });
      if (fragments > 0) result.unpricedResources.push({
        resource: "beast-body", beastId: beastId, beastName: beast.name,
        fragments: fragments, bodyEquivalent: bodyEquivalent,
        reason: "蓝紫本体获取成本未计入"
      });
    });
    result.beasts.sort(function (left, right) { return entryOrder.get(left.beastId) - entryOrder.get(right.beastId); });
    result.complete = result.blueprints.yuan !== null && result.missingPrices.length === 0;
    result.totalYuan = result.complete ? result.knownYuan : null;
    return result;
  }

  function emptyInventory(data) {
    var inventory = {};
    data.modifications.forEach(function (modification) { inventory[modification.id] = {}; });
    return inventory;
  }

  function normalizeBeastProgress(beast, raw, data) {
    var source = raw && typeof raw === "object" ? raw : {};
    var inventory = emptyInventory(data);
    var sourceInventory = source.inventory && typeof source.inventory === "object" ? source.inventory : {};
    data.modifications.forEach(function (modification) {
      var ranks = sourceInventory[modification.id];
      if (!ranks || typeof ranks !== "object") return;
      for (var rank = 0; rank <= beast.maxRank; rank += 1) {
        var value = integer(ranks[String(rank)]);
        if (value > 0) inventory[modification.id][String(rank)] = value;
      }
    });
    return {
      research: integer(source.research),
      fragments: integer(source.fragments),
      showHighRanks: Boolean(source.showHighRanks),
      showMods: Boolean(source.showMods),
      inventory: inventory
    };
  }

  function schoolSnapshot(school, progressByBeast, data) {
    var progress = progressByBeast && typeof progressByBeast === "object" ? progressByBeast : {};
    var totalLevel = school.beastIds.reduce(function (total, beastId) {
      var beast = data.beasts.find(function (item) { return item.id === beastId; });
      if (!beast) return total;
      var normalized = normalizeBeastProgress(beast, progress[beastId], data);
      return total + levelForResearch(normalized.research, data.researchThresholds, beast.maxLevel);
    }, 0);
    var reachedStages = school.stages.filter(function (stage) {
      return stage.requiredTotalLevel !== null && totalLevel >= stage.requiredTotalLevel;
    });
    var currentStage = reachedStages.length ? reachedStages[reachedStages.length - 1].stage : 0;
    var currentEffects = currentStage ? reachedStages[reachedStages.length - 1] : null;
    var nextStage = school.stages.find(function (stage) {
      return stage.requiredTotalLevel !== null && totalLevel < stage.requiredTotalLevel;
    }) || null;
    var finalStage = school.stages[school.stages.length - 1];
    var progressStage = nextStage ? nextStage.stage : finalStage.stage;
    var progressTarget = nextStage ? nextStage.requiredTotalLevel : finalStage.requiredTotalLevel;
    var progressCurrent = Math.min(totalLevel, progressTarget);
    return {
      schoolId: school.id,
      totalLevel: totalLevel,
      currentStage: currentStage,
      progressStage: progressStage,
      progressCurrent: progressCurrent,
      progressTarget: progressTarget,
      progressRemaining: Math.max(0, progressTarget - totalLevel),
      stageOneCurrent: Math.min(totalLevel, 45),
      stageOneRemaining: Math.max(0, 45 - totalLevel),
      currentEffects: currentEffects,
      nextStage: nextStage
    };
  }

  function researchFor(data, beast, rank, modificationId) {
    var qualityTable = data.researchValues[beast.quality];
    var rankTable = qualityTable && qualityTable[String(rank)];
    if (!rankTable) return 0;
    return integer(rankTable[modificationId] === undefined ? rankTable.none : rankTable[modificationId]);
  }

  function itemResources(research, data) {
    return {
      awakeningBlueprints: Math.ceil(research / data.resourceRules.blueprintDivisor),
      organPieces: Math.ceil(research / data.resourceRules.organPieceDivisor)
    };
  }

  function appendItem(items, descriptor, count) {
    if (!count) return items.slice();
    var next = items.map(function (item) { return Object.assign({}, item); });
    var match = next.find(function (item) {
      return item.source === descriptor.source && item.rank === descriptor.rank && item.modificationId === descriptor.modificationId;
    });
    if (match) match.count += count;
    else next.push({
      source: descriptor.source,
      rank: descriptor.rank,
      modificationId: descriptor.modificationId,
      count: count,
      researchEach: descriptor.researchEach,
      sevenRankEquivalent: descriptor.rank > 7 ? Math.pow(2, descriptor.rank - 7) : 1
    });
    next.sort(function (left, right) {
      return right.rank - left.rank || left.modificationId.localeCompare(right.modificationId);
    });
    return next;
  }

  function investedWeight(rank, options) {
    return options && options.investedCountMode === "equivalent" && rank > 7 ? Math.pow(2, rank - 7) : 1;
  }

  function stateKey(state) {
    return state.items.map(function (item) {
      return [item.source, item.modificationId, item.rank, item.count].join(":");
    }).join("|");
  }

  function preferSameResearch(left, right) {
    if (!right) return true;
    var fields = ["newInvestedCount", "newCount", "awakeningBlueprints", "organPieces"];
    for (var index = 0; index < fields.length; index += 1) {
      if (left[fields[index]] !== right[fields[index]]) return left[fields[index]] < right[fields[index]];
    }
    return stateKey(left) < stateKey(right);
  }

  function addState(targetMap, state, limit) {
    if (state.research > limit) return;
    var existing = targetMap.get(state.research);
    if (preferSameResearch(state, existing)) targetMap.set(state.research, state);
  }

  function buildBoundedStates(types, maximumCount, limit, data) {
    var states = Array.from({ length: maximumCount + 1 }, function () { return new Map(); });
    states[0].set(0, { research: 0, newCount: 0, newInvestedCount: 0, awakeningBlueprints: 0, organPieces: 0, items: [] });
    types.forEach(function (type) {
      var previous = states;
      var next = previous.map(function (map) { return new Map(map); });
      for (var count = 0; count <= maximumCount; count += 1) {
        previous[count].forEach(function (state) {
          var available = Math.min(type.available, Math.floor((maximumCount - count) / type.investedWeight));
          for (var quantity = 1; quantity <= available; quantity += 1) {
            var resources = itemResources(type.researchEach, data);
            addState(next[count + quantity * type.investedWeight], {
              research: state.research + type.researchEach * quantity,
              newCount: state.newCount,
              newInvestedCount: state.newInvestedCount,
              awakeningBlueprints: state.awakeningBlueprints + resources.awakeningBlueprints * quantity,
              organPieces: state.organPieces + resources.organPieces * quantity,
              items: appendItem(state.items, type, quantity)
            }, limit);
          }
        });
      }
      states = next;
    });
    return states;
  }

  function buildExactUnlimitedStates(types, exactCount, minimumNeeded, limit, data) {
    if (!exactCount) return [{ research: 0, newCount: 0, newInvestedCount: 0, awakeningBlueprints: 0, organPieces: 0, items: [] }];
    if (types.length <= 3 && types.every(function (type) { return type.investedWeight === 1; })) {
      var compact = new Map();
      var quantities = Array(types.length).fill(0);
      var resourcesByType = types.map(function (type) { return itemResources(type.researchEach, data); });
      function recordCompact() {
        var possibleResearch = quantities.reduce(function (total, quantity, index) {
          return total + types[index].researchEach * quantity;
        }, 0);
        if (possibleResearch < minimumNeeded || possibleResearch > limit) return;
        var research = 0;
        var awakeningBlueprints = 0;
        var organPieces = 0;
        var items = [];
        quantities.forEach(function (quantity, index) {
          research += types[index].researchEach * quantity;
          awakeningBlueprints += resourcesByType[index].awakeningBlueprints * quantity;
          organPieces += resourcesByType[index].organPieces * quantity;
          if (quantity) items = appendItem(items, types[index], quantity);
        });
        if (research < minimumNeeded) return;
        addState(compact, {
          research: research,
          newCount: exactCount,
          newInvestedCount: exactCount,
          awakeningBlueprints: awakeningBlueprints,
          organPieces: organPieces,
          items: items
        }, limit);
      }
      if (types.length === 1) {
        quantities[0] = exactCount;
        recordCompact();
      } else if (types.length === 2) {
        for (var first = 0; first <= exactCount; first += 1) {
          quantities[0] = first;
          quantities[1] = exactCount - first;
          recordCompact();
        }
      } else {
        for (var highest = 0; highest <= exactCount; highest += 1) {
          for (var middle = 0; middle <= exactCount - highest; middle += 1) {
            quantities[0] = highest;
            quantities[1] = middle;
            quantities[2] = exactCount - highest - middle;
            recordCompact();
          }
        }
      }
      return sortedStates(compact);
    }
    var states = Array.from({ length: exactCount + 1 }, function () { return new Map(); });
    var maximumPerWeight = Math.max.apply(null, types.map(function (type) { return type.researchEach / type.investedWeight; }));
    var minimumPerWeight = Math.min.apply(null, types.map(function (type) { return type.researchEach / type.investedWeight; }));
    states[0].set(0, { research: 0, newCount: 0, newInvestedCount: 0, awakeningBlueprints: 0, organPieces: 0, items: [] });
    for (var weight = 0; weight <= exactCount; weight += 1) {
      if (!states[weight].size) continue;
      states[weight].forEach(function (state) {
        types.forEach(function (type) {
          var nextWeight = weight + type.investedWeight;
          if (nextWeight > exactCount) return;
          var nextResearch = state.research + type.researchEach;
          if (nextResearch > limit) return;
          var remainingWeight = exactCount - nextWeight;
          if (nextResearch + remainingWeight * maximumPerWeight < minimumNeeded) return;
          if (nextResearch + remainingWeight * minimumPerWeight > limit) return;
          var resources = itemResources(type.researchEach, data);
          addState(states[nextWeight], {
            research: nextResearch,
            newCount: state.newCount + 1,
            newInvestedCount: state.newInvestedCount + type.investedWeight,
            awakeningBlueprints: state.awakeningBlueprints + resources.awakeningBlueprints,
            organPieces: state.organPieces + resources.organPieces,
            items: appendItem(state.items, type, 1)
          }, limit);
        });
      });
    }
    return sortedStates(new Map(Array.from(states[exactCount]).filter(function (entry) { return entry[0] >= minimumNeeded; })));
  }

  function ownedTypes(data, beast, progress, options, maximumCount) {
    if (options.useOwnedInventory === false) return [];
    var includeHigh = Boolean(options.includeHighRanks || progress.showHighRanks);
    var includeMods = Boolean(options.includeMods || progress.showMods);
    var ownedLimits = options.ownedLimits && typeof options.ownedLimits === "object" ? options.ownedLimits : {};
    var types = [];
    data.modifications.forEach(function (modification, modIndex) {
      if (modification.id !== "none" && (!includeMods || beast.quality !== "orange")) return;
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).forEach(function (rankKey) {
        var rank = integer(rankKey);
        if (rank > 7 && !includeHigh) return;
        var recordedAvailable = integer(ranks[rankKey]);
        var totalAvailable = recordedAvailable;
        var modificationLimits = ownedLimits[modification.id];
        if (modificationLimits && Object.prototype.hasOwnProperty.call(modificationLimits, rankKey)) {
          totalAvailable = Math.min(totalAvailable, integer(modificationLimits[rankKey]));
        }
        var weight = investedWeight(rank, options);
        var count = Math.min(totalAvailable, Math.floor(maximumCount / weight));
        var research = researchFor(data, beast, rank, modification.id);
        if (!count || !research) return;
        types.push({
          source: "owned", modificationId: modification.id, modificationIndex: modIndex,
          rank: rank, researchEach: research, investedWeight: weight, available: count, totalAvailable: recordedAvailable
        });
      });
    });
    return types.sort(function (left, right) {
      return right.researchEach - left.researchEach || right.rank - left.rank || left.modificationIndex - right.modificationIndex;
    });
  }

  function newTypes(data, beast, options) {
    var maximumRank = options.newRankMode === "zero" ? 0 :
      (options.allowNewHighRanks ? beast.maxRank : Math.min(7, beast.maxRank));
    var modifications = beast.quality === "orange" && options.allowNewModifications ? data.modifications : [data.modifications[0]];
    var types = [];
    for (var rank = maximumRank; rank >= 0; rank -= 1) {
      modifications.forEach(function (modification) {
        types.push({
          source: "new", modificationId: modification.id, rank: rank,
          researchEach: researchFor(data, beast, rank, modification.id),
          investedWeight: investedWeight(rank, options)
        });
      });
    }
    return types.filter(function (item) { return item.researchEach > 0; });
  }

  function baseBodies(rank) { return rank > 7 ? Math.pow(2, rank - 7) : 1; }
  function conversionMaterials(data, beast, progress, config) {
    var origins = [], excluded=[], limits = config.ownedLimits || {};
    data.modifications.forEach(function (mod) {
      Object.keys(progress.inventory[mod.id] || {}).forEach(function (key) {
        var rank = integer(key), recorded=progress.inventory[mod.id][key],count=config.useOwnedInventory===false?0:recorded;
        if (limits[mod.id] && Object.prototype.hasOwnProperty.call(limits[mod.id], key)) count = Math.min(count, integer(limits[mod.id][key]));
        if (count > 0) origins.push({ rank: rank, modificationId: mod.id, count: count, weight: baseBodies(rank), researchEach: researchFor(data, beast, rank, mod.id) });
        if(recorded>count)excluded.push({rank:rank,modificationId:mod.id,count:recorded-count,researchEach:researchFor(data,beast,rank,mod.id)});
      });
    });
    origins.sort(function (a,b) { return a.weight-b.weight || a.modificationId.localeCompare(b.modificationId) || a.rank-b.rank; });
    var pool = { origins: origins, excluded:excluded,baseCount: origins.reduce(function (n,o) { return n+o.count*o.weight; },0) };
    var maximumRank = config.newRankMode === 'zero' ? 0 : config.allowNewHighRanks ? beast.maxRank : Math.min(7, beast.maxRank);
    var types = [];
    origins.forEach(function (o) {
      // Plain forms inside the processing domain are identical to pool output.
      // Only zero-only explicitly permits original forms above that domain.
      if (config.newRankMode !== 'zero' && o.rank > maximumRank) return;
      if (o.rank <= maximumRank && (o.modificationId === 'none' || !config.plainOnly && beast.quality==='orange' && config.allowNewModifications)) return;
      if (config.plainOnly && o.modificationId !== 'none') return;
      types.push(Object.assign({ source:'owned', available:o.count },o));
    });
    for (var rank=0;rank<=maximumRank;rank++) data.modifications.forEach(function (mod) {
      if (mod.id !== 'none' && (config.plainOnly || beast.quality !== 'orange' || !config.allowNewModifications)) return;
      var research=researchFor(data,beast,rank,mod.id);
      if (research) types.push({source:'new',rank:rank,modificationId:mod.id,researchEach:research,weight:baseBodies(rank),available:null});
    });
    types.forEach(function (t) { t.blueprints=Math.ceil(t.researchEach/data.resourceRules.blueprintDivisor);t.pieces=Math.ceil(t.researchEach/data.resourceRules.organPieceDivisor); });
    return {pool:pool,types:types};
  }

  // Reserve original inputs first, then fund all processed inputs from the SAME
  // remaining original stock. Allocation is deterministic, not another solution.
  function allocateConvertedInventory(data, beast, pool, rawItems) {
    var remaining=pool.origins.map(function(o){return Object.assign({},o);}),items=[],sources=[],unused=(pool.excluded||[]).map(function(o){return Object.assign({},o);}),remainingBase=0;
    rawItems.filter(function(i){return i.source==='owned';}).forEach(function(i){
      var origin=remaining.find(function(o){return o.rank===i.rank&&o.modificationId===i.modificationId;});
      if(!origin||origin.count<i.count)throw Error('库存原形投入超出使用上限');
      origin.count-=i.count;items.push(Object.assign({},i));
    });
    var processing=[];
    rawItems.filter(function(i){return i.source!=='owned';}).forEach(function(i){
      var weight=baseBodies(i.rank),same=remaining.find(function(o){return o.rank===i.rank&&o.modificationId===i.modificationId;}),unchanged=same?Math.min(i.count,same.count):0;
      if(unchanged){same.count-=unchanged;items.push(Object.assign({},i,{source:'owned',count:unchanged}));}
      if(i.count>unchanged)processing.push(Object.assign({},i,{count:i.count-unchanged}));
    });
    var credit=remaining.reduce(function(n,o){return n+o.count*o.weight;},0),usedProcessed=0;
    processing.forEach(function(i){
      var weight=baseBodies(i.rank),requested=i.count,owned=Math.min(requested,Math.floor(credit/weight));
      if(owned){items.push(Object.assign({},i,{source:'owned',count:owned,converted:true}));credit-=owned*weight;usedProcessed+=owned*weight;}
      var left=requested-owned;
      if(left&&credit){var used=credit;items.push(Object.assign({},i,{count:1,converted:true,ownedBaseBodies:used,newBaseBodies:weight-used}));usedProcessed+=used;credit=0;left--;}
      if(left)items.push(Object.assign({},i,{count:left}));
    });
    var needed=usedProcessed;
    remaining.forEach(function(o){
      var count=Math.min(o.count,Math.ceil(needed/o.weight));
      if(count){var supplied=count*o.weight,used=Math.min(needed,supplied);needed-=used;remainingBase+=supplied-used;sources.push(Object.assign({},o,{count:count,baseBodies:supplied,sevenRankEquivalent:o.weight}));o.count-=count;}
      if(o.count)unused.push({rank:o.rank,modificationId:o.modificationId,count:o.count,researchEach:o.researchEach});
    });
    if(remainingBase)unused.push({rank:0,modificationId:'none',count:remainingBase,researchEach:researchFor(data,beast,0,'none'),converted:true});
    var total=rawItems.reduce(function(n,i){return n+i.count*baseBodies(i.rank);},0),added=Math.max(0,total-pool.baseCount);
    var allocatedNew=items.reduce(function(n,i){return n+(i.source==='owned'?0:i.newBaseBodies===undefined?i.count*baseBodies(i.rank):i.newBaseBodies);},0);
    if(allocatedNew!==added)throw Error('库存转换本体分配不守恒');
    return {items:items,unused:unused,invested:total,newCount:added,owned:total-added,
      ownedPhysical:items.filter(function(i){return i.source==='owned';}).reduce(function(n,i){return n+i.count;},0),
      newPhysical:items.filter(function(i){return i.source!=='owned';}).reduce(function(n,i){return n+i.count;},0),
      ownedModified:items.filter(function(i){return i.source==='owned'&&i.modificationId!=='none';}).reduce(function(n,i){return n+i.count*baseBodies(i.rank);},0),
      newModified:items.filter(function(i){return i.source!=='owned'&&i.modificationId!=='none';}).reduce(function(n,i){return n+i.count*baseBodies(i.rank);},0),
      inventoryConversion:{sources:sources,usedBaseBodies:usedProcessed,remainingBaseBodies:remainingBase,availableBaseBodies:pool.baseCount}};
  }

  // Sparse exact-research frontiers: both original inputs and processing use
  // base-body budget n. Per-origin bounded processing prevents double spending;
  // componentwise dominance is safe for every remaining type and shared fee.
  function conversionCandidates(data, beast, progress, config, gap, terminalAllowed) {
    var domain=conversionMaterials(data,beast,progress,config),types=domain.types,pool=domain.pool;
    if(!gap||!types.length)return [];
    function gcd(a,b){while(b){var c=a%b;a=b;b=c;}return a;}
    var unit=types.reduce(function(n,t){return gcd(n,t.researchEach);},0),stop=Math.ceil(gap/unit);
    var maximum=Math.max.apply(null,types.map(function(t){return t.researchEach/unit;}));
    var rows=Array(stop+maximum),limited=beast.quality!=='orange'&&config.bluePurpleInventoryOnly!==false;
    rows[0]=[{r:0,n:0,m:0,b:0,p:0,counts:Array(types.length).fill(0)}];
    function stable(counts){return counts.map(function(n){return String(n).padStart(16,'0');}).join('');}
    function put(from,index,quantity){
      var type=types[index],r=from.r+type.researchEach/unit*quantity,n=from.n+type.weight*quantity;
      if(r>=rows.length||(!terminalAllowed&&r>=stop)||limited&&n>pool.baseCount)return;
      var m=from.m+(type.modificationId==='none'?0:type.weight*quantity),b=from.b+type.blueprints*quantity,p=from.p+type.pieces*quantity;
      var bucket=rows[r]||[],counts=from.counts.slice();counts[index]+=quantity;
      for(var i=0;i<bucket.length;i++){
        var old=bucket[i];
        if(old.n<=n&&old.m<=m&&old.b<=b&&old.p<=p){
          if(old.n!==n||old.m!==m||old.b!==b||old.p!==p||stable(old.counts)<=stable(counts))return;
        }
      }
      bucket=bucket.filter(function(old){return !(n<=old.n&&m<=old.m&&b<=old.b&&p<=old.p);});
      bucket.push({r:r,n:n,m:m,b:b,p:p,counts:counts});rows[r]=bucket;
    }
    types.forEach(function(type,index){
      if(type.available!==null){
        var left=Math.min(type.available,Math.ceil(gap/type.researchEach)),chunk=1;
        while(left>0){var q=Math.min(left,chunk);for(var r=stop-1;r>=0;r--)if(rows[r])rows[r].slice().forEach(function(s){put(s,index,q);});left-=q;chunk*=2;}
      }else for(var r=0;r<stop;r++)if(rows[r])rows[r].slice().forEach(function(s){put(s,index,1);});
    });
    var compact=new Map(),start=levelForResearch(progress.research,data.researchThresholds,beast.maxLevel);
    rows.forEach(function(bucket){if(!bucket)return;bucket.forEach(function(s){
      if(!s.r)return;
      var research=s.r*unit,level=levelForResearch(progress.research+research,data.researchThresholds,beast.maxLevel);
      if(level<=start)return;
      var key=[level,s.n,s.b,s.m,s.p].join('/'),prior=compact.get(key),order=stable(s.counts);
      if(prior&&(prior.research<research||prior.research===research&&prior.stable<=order))return;
      var rawItems=[];s.counts.forEach(function(count,index){if(count){var t=types[index];rawItems.push({source:t.source,rank:t.rank,modificationId:t.modificationId,count:count,researchEach:t.researchEach,sevenRankEquivalent:t.weight});}});
      var allocation=allocateConvertedInventory(data,beast,pool,rawItems);
      compact.set(key,Object.assign(allocation,{endLevel:level,research:research,blueprints:s.b,pieces:s.p,modified:s.m,stable:order,rawItems:rawItems}));
    });});
    return Array.from(compact.values());
  }

  function conversionInvestmentPlan(data,beast,progress,config,targetLevel) {
    var target=thresholdForLevel(targetLevel,data.researchThresholds),current=levelForResearch(progress.research,data.researchThresholds,beast.maxLevel),gap=Math.max(0,target-progress.research);
    if(!gap)return emptyPlan(data,beast,progress,current,targetLevel,target);
    var candidates=conversionCandidates(data,beast,progress,Object.assign({},config,{bluePurpleInventoryOnly:false}),gap,true),best=null;
    candidates.forEach(function(r){
      if(r.research<gap)return;
      var state={items:r.items,newCount:r.newCount,newInvestedCount:r.newCount,research:r.research,awakeningBlueprints:r.blueprints,organPieces:r.pieces};
      var metrics=planMetrics(state,gap,beast,progress,data,Object.assign({},config,{investedCountMode:'equivalent'}));
      var candidate={state:state,metrics:metrics,raw:r};
      if(betterPlan(candidate,best,true,config.useOwnedInventory!==false))best=candidate;
    });
    if(!best)return {valid:false,errors:['当前条件下无法生成库存转换方案']};
    var r=best.raw,missing=best.metrics.missingFragments,contribution=beast.contributionPerFragment===null?null:missing*beast.contributionPerFragment;
    return {valid:true,errors:[],current:{level:current,research:progress.research},target:{level:targetLevel,research:target,deficit:gap},
      selected:{ownedItems:r.items.filter(function(i){return i.source==='owned';}),newItems:r.items.filter(function(i){return i.source!=='owned';})},unused:r.unused,inventoryConversion:r.inventoryConversion,
      totals:{investedCount:r.invested,newInvestedCount:r.newCount,research:r.research,overflow:r.research-gap,awakeningBlueprints:r.blueprints,organPieces:r.pieces,projectedLevel:r.endLevel},
      shortage:{bodies:r.newCount,bodyEquivalent:r.newCount,fragments:missing},exchange:{available:contribution!==null,contribution:contribution,yuan:contribution===null?null:Math.ceil(contribution/contributionPerYuan(data))}};
  }

  function minimumInvestedCount(deficit, newMaximumResearch, owned) {
    var premiums = [];
    owned.forEach(function (type) {
      if (type.researchEach <= newMaximumResearch) return;
      for (var count = 0; count < type.available; count += 1) premiums.push(type.researchEach - newMaximumResearch);
    });
    premiums.sort(function (left, right) { return right - left; });
    var premiumTotal = 0;
    for (var count = 1; count <= Math.ceil(deficit / newMaximumResearch); count += 1) {
      if (premiums[count - 1]) premiumTotal += premiums[count - 1];
      if (count * newMaximumResearch + premiumTotal >= deficit) return count;
    }
    return Math.ceil(deficit / newMaximumResearch);
  }

  function sortedStates(map) {
    return Array.from(map.values()).sort(function (left, right) { return left.research - right.research; });
  }

  function lowerBound(states, needed) {
    var low = 0;
    var high = states.length;
    while (low < high) {
      var middle = Math.floor((low + high) / 2);
      if (states[middle].research < needed) low = middle + 1;
      else high = middle;
    }
    return states[low] || null;
  }

  function combineStates(owned, added) {
    return {
      research: owned.research + added.research,
      newCount: added.newCount,
      newInvestedCount: added.newInvestedCount,
      awakeningBlueprints: owned.awakeningBlueprints + added.awakeningBlueprints,
      organPieces: owned.organPieces + added.organPieces,
      items: owned.items.concat(added.items)
    };
  }

  function planMetrics(state, deficit, beast, progress, data, options) {
    var countEquivalent = state.items.reduce(function (total, item) {
      return total + item.count * investedWeight(item.rank, options);
    }, 0);
    var missingFragments = Math.max(0, state.newInvestedCount * beast.fragmentsPerBody - progress.fragments);
    var contribution = beast.contributionPerFragment === null ? null : missingFragments * beast.contributionPerFragment;
    return {
      investedCount: countEquivalent,
      newInvestedCount: state.newInvestedCount,
      overflow: Math.max(0, state.research - deficit),
      missingFragments: missingFragments,
      contribution: contribution === null ? Number.MAX_SAFE_INTEGER : contribution,
      yuan: contribution === null ? Number.MAX_SAFE_INTEGER : Math.ceil(contribution / contributionPerYuan(data)),
      awakeningBlueprints: state.awakeningBlueprints,
      organPieces: state.organPieces,
      stable: stateKey(state)
    };
  }

  function betterPlan(candidate, best, preferOwned, stockFirst) {
    if (!best) return true;
    var keys = stockFirst ? ["newInvestedCount", "investedCount", "overflow", "missingFragments", "contribution", "yuan", "awakeningBlueprints", "organPieces"] : preferOwned ? ["investedCount", "newInvestedCount", "overflow", "missingFragments", "contribution", "yuan", "awakeningBlueprints", "organPieces"] :
      ["investedCount", "overflow", "missingFragments", "contribution", "yuan", "awakeningBlueprints", "organPieces"];
    for (var index = 0; index < keys.length; index += 1) {
      if (candidate.metrics[keys[index]] !== best.metrics[keys[index]]) {
        return candidate.metrics[keys[index]] < best.metrics[keys[index]];
      }
    }
    return candidate.metrics.stable < best.metrics.stable;
  }

  function emptyPlan(data, beast, progress, currentLevel, targetLevel, targetResearch) {
    return {
      valid: true,
      errors: [],
      current: { level: currentLevel, research: progress.research },
      target: { level: targetLevel, research: targetResearch, deficit: 0 },
      selected: { ownedItems: [], newItems: [] },
      unused: [],
      totals: { investedCount: 0, newInvestedCount: 0, research: 0, overflow: 0, awakeningBlueprints: 0, organPieces: 0, projectedLevel: currentLevel },
      shortage: { bodies: 0, bodyEquivalent: 0, fragments: 0 },
      exchange: { available: beast.contributionPerFragment !== null, contribution: 0, yuan: 0 }
    };
  }

  function buildInvestmentWorkspace(data, beast, progress, config, maximumTargetLevel) {
    var maximumTargetResearch = thresholdForLevel(maximumTargetLevel, data.researchThresholds);
    var maximumDeficit = Math.max(0, maximumTargetResearch - progress.research);
    var purchasable = newTypes(data, beast, config);
    if (!purchasable.length) return null;
    var minimumResearch = Math.min.apply(null, purchasable.map(function (item) { return item.researchEach; }));
    var maximumResearch = Math.max.apply(null, purchasable.map(function (item) { return item.researchEach; }));
    var bestNewType = purchasable.reduce(function (best, type) {
      return !best || type.researchEach / type.investedWeight > best.researchEach / best.investedWeight ? type : best;
    }, null);
    var provisionalMaximumCount = Math.ceil(maximumDeficit / minimumResearch) + 8;
    var owned = ownedTypes(data, beast, progress, config, provisionalMaximumCount);
    owned.forEach(function (item) { maximumResearch = Math.max(maximumResearch, item.researchEach); });
    var limit = maximumDeficit + maximumResearch;
    var maximumInvestedCount = Math.ceil(maximumDeficit / bestNewType.researchEach) * bestNewType.investedWeight + bestNewType.investedWeight;
    var ownedMaximumCount = maximumInvestedCount;
    if (config.prioritizeOwnedInventory && config.useOwnedInventory !== false && owned.length) {
      // Stock-first may need MORE total bodies than the all-new minimum. Any
      // irredundant owned subset has weight <= (gap-1)/minRate + maxWeight.
      // Never cap it at the count of a newly purchased high-rank solution.
      var minimumOwnedRate = Math.min.apply(null, owned.map(function (type) { return type.researchEach / type.investedWeight; }));
      var maximumOwnedWeight = Math.max.apply(null, owned.map(function (type) { return type.investedWeight; }));
      var availableWeight = owned.reduce(function (sum, type) { return sum + type.available * type.investedWeight; }, 0);
      ownedMaximumCount = Math.min(availableWeight, Math.floor((maximumDeficit - 1) / minimumOwnedRate) + maximumOwnedWeight);
    }
    var ownedStates = buildBoundedStates(owned, ownedMaximumCount, limit, data);
    return {
      beastId: beast.id,
      progressResearch: progress.research,
      purchasable: purchasable,
      bestNewType: bestNewType,
      owned: owned,
      limit: limit,
      maximumInvestedCount: maximumInvestedCount,
      ownedStates: ownedStates,
      ownedMaximums: ownedStates.map(function (states) {
        var maximum = 0;
        states.forEach(function (state) { maximum = Math.max(maximum, state.research); });
        return maximum;
      }),
      newStateCache: {},
      newStateMinimums: {}
    };
  }

  function calculateInvestmentPlan(data, beast, rawProgress, options) {
    var config = options || {};
    var progress = normalizeBeastProgress(beast, rawProgress, data);
    var currentLevel = levelForResearch(progress.research, data.researchThresholds, beast.maxLevel);
    var targetLevel = integer(config.targetLevel, nextEffectLevel(beast, currentLevel));
    var errors = [];
    if (targetLevel < currentLevel) errors.push("目标研发等级不能低于当前研发等级");
    if (targetLevel > beast.maxLevel) errors.push("目标研发等级不能超过该机关兽研发上限");
    if (!data.researchThresholds[targetLevel]) errors.push("目标研发等级无对应累计研发度");
    if (errors.length) return { valid: false, errors: errors };
    if (config.convertOwnedInventory) return conversionInvestmentPlan(data,beast,progress,config,targetLevel);
    var targetResearch = thresholdForLevel(targetLevel, data.researchThresholds);
    var deficit = Math.max(0, targetResearch - progress.research);
    if (!deficit) return emptyPlan(data, beast, progress, currentLevel, targetLevel, targetResearch);

    var workspace = config.investmentWorkspace;
    if (!workspace || workspace.beastId !== beast.id || workspace.progressResearch !== progress.research) {
      workspace = buildInvestmentWorkspace(data, beast, progress, config, targetLevel);
    }
    if (!workspace) return { valid: false, errors: ["未能生成可用的新增机关兽候选"] };
    var purchasable = workspace.purchasable;
    var bestNewType = workspace.bestNewType;
    var owned = workspace.owned;
    var limit = workspace.limit;
    var maximumInvestedCount = Math.min(workspace.maximumInvestedCount,
      Math.ceil(deficit / bestNewType.researchEach) * bestNewType.investedWeight + bestNewType.investedWeight);
    var ownedStates = workspace.ownedStates;
    var newStateCache = workspace.newStateCache;
    var newStateMinimums = workspace.newStateMinimums;
    var best = null;
    var stockFirst = config.prioritizeOwnedInventory && config.useOwnedInventory !== false;

    function considerCounts(ownedCount, newCount, minimumNeeded) {
      if (!ownedStates[ownedCount] || !ownedStates[ownedCount].size) return;
      if (stockFirst && best && ownedCount + newCount > best.metrics.investedCount) return;
      if (!newStateCache[newCount] || newStateMinimums[newCount] > minimumNeeded) {
        newStateCache[newCount] = buildExactUnlimitedStates(purchasable, newCount, minimumNeeded, limit, data);
        newStateMinimums[newCount] = minimumNeeded;
      }
      if (!newStateCache[newCount].length) return;
      ownedStates[ownedCount].forEach(function (ownedState) {
        var addedState = lowerBound(newStateCache[newCount], Math.max(0, deficit - ownedState.research));
        if (!addedState) return;
        var state = combineStates(ownedState, addedState);
        if (state.research < deficit) return;
        var candidate = { state: state, metrics: planMetrics(state, deficit, beast, progress, data, config) };
        if (betterPlan(candidate, best, config.preferOwnedOnTie, stockFirst)) best = candidate;
      });
    }

    // 即使假定最佳库存可以无限使用，少于此投入数也不可能达标。
    // 采用单位投入研发度，兼容高阶机关兽的七阶等价权重。
    var maximumResearchPerInvestment = Math.max.apply(null, purchasable.concat(owned).map(function (type) {
      return type.researchEach / type.investedWeight;
    }));
    var minimumCount = Math.ceil(deficit / maximumResearchPerInvestment);

    if (stockFirst) {
      var ownedMaximumResearch = workspace.ownedMaximums.reduce(function (maximum, research) { return Math.max(maximum, research); }, 0);
      var minimumNeeded = Math.max(0, deficit - ownedMaximumResearch);
      var maximumNewRate = Math.max.apply(null, purchasable.map(function (type) { return type.researchEach / type.investedWeight; }));
      // Enumerate new investment first, then all bounded owned counts. Only
      // stop after every owned combination for this new count is compared.
      for (var newCount = Math.ceil(minimumNeeded / maximumNewRate); newCount <= maximumInvestedCount && !best; newCount += 1) {
        for (var ownedCount = 0; ownedCount < ownedStates.length; ownedCount += 1) considerCounts(ownedCount, newCount, minimumNeeded);
      }
    } else for (var totalCount = minimumCount; totalCount <= maximumInvestedCount && !best; totalCount += 1) {
      for (var ownedCount = 0; ownedCount <= totalCount; ownedCount += 1) {
        var newCount = totalCount - ownedCount;
        if (!ownedStates[ownedCount] || !ownedStates[ownedCount].size) continue;
        var minimumNeeded = Math.max(0, deficit - workspace.ownedMaximums[ownedCount]);
        // 缓存可供更高缺口复用；缺口变小时必须重建，不能漏掉低研发组合。
        considerCounts(ownedCount, newCount, minimumNeeded);
      }
    }

    if (!best) return { valid: false, errors: ["未能生成有效机关兽投入方案"] };
    var selectedOwned = best.state.items.filter(function (item) { return item.source === "owned"; });
    var selectedNew = best.state.items.filter(function (item) { return item.source === "new"; });
    var unused = owned.map(function (type) {
      var selected = selectedOwned.find(function (item) { return item.rank === type.rank && item.modificationId === type.modificationId; });
      var count = type.totalAvailable - (selected ? selected.count : 0);
      return count > 0 ? { rank: type.rank, modificationId: type.modificationId, count: count, researchEach: type.researchEach } : null;
    }).filter(Boolean);
    var missingFragments = best.metrics.missingFragments;
    var contributionAvailable = beast.contributionPerFragment !== null;
    var contribution = contributionAvailable ? missingFragments * beast.contributionPerFragment : null;
    return {
      valid: true,
      errors: [],
      current: { level: currentLevel, research: progress.research },
      target: { level: targetLevel, research: targetResearch, deficit: deficit },
      selected: { ownedItems: selectedOwned, newItems: selectedNew },
      unused: unused,
      totals: {
        investedCount: best.metrics.investedCount,
        newInvestedCount: best.metrics.newInvestedCount,
        research: best.state.research,
        overflow: best.metrics.overflow,
        awakeningBlueprints: best.state.awakeningBlueprints,
        organPieces: best.state.organPieces,
        projectedLevel: levelForResearch(progress.research + best.state.research, data.researchThresholds, beast.maxLevel)
      },
      shortage: {
        bodies: best.state.newCount,
        bodyEquivalent: best.metrics.newInvestedCount,
        fragments: missingFragments
      },
      exchange: {
        available: contributionAvailable,
        contribution: contribution,
        yuan: contributionAvailable ? Math.ceil(contribution / contributionPerYuan(data)) : null
      }
    };
  }

  function calculateInvestmentCandidates(data, beast, rawProgress, options) {
    var config = options || {};
    var progress = normalizeBeastProgress(beast, rawProgress, data);
    var currentLevel = levelForResearch(progress.research, data.researchThresholds, beast.maxLevel);
    var maximumTargetLevel = Math.min(beast.maxLevel, Math.max(currentLevel,
      integer(config.maximumTargetLevel, beast.maxLevel)));
    if(config.convertOwnedInventory){var converted=[];for(var target=currentLevel+1;target<=maximumTargetLevel;target++)converted.push(calculateInvestmentPlan(data,beast,progress,Object.assign({},config,{targetLevel:target})));return converted;}
    var workspace = buildInvestmentWorkspace(data, beast, progress, config, maximumTargetLevel);
    if (!workspace) return [];
    var results = [];
    for (var targetLevel = currentLevel + 1; targetLevel <= maximumTargetLevel; targetLevel += 1) {
      results.push(calculateInvestmentPlan(data, beast, progress, Object.assign({}, config, {
        targetLevel: targetLevel,
        investmentWorkspace: workspace
      })));
    }
    return results;
  }

  return {
    integer: integer,
    thresholdForLevel: thresholdForLevel,
    levelForResearch: levelForResearch,
    nextEffectLevel: nextEffectLevel,
    activeBeastEffect: activeBeastEffect,
    searchBeasts: searchBeasts,
    normalizeReferenceCostSettings: normalizeReferenceCostSettings,
    calculateReferenceCost: calculateReferenceCost,
    calculateSchoolReferenceCost: calculateSchoolReferenceCost,
    normalizeBeastProgress: normalizeBeastProgress,
    schoolSnapshot: schoolSnapshot,
    researchFor: researchFor,
    conversionMaterials: conversionMaterials,
    allocateConvertedInventory: allocateConvertedInventory,
    conversionCandidates: conversionCandidates,
    calculateInvestmentPlan: calculateInvestmentPlan,
    calculateInvestmentCandidates: calculateInvestmentCandidates
  };
});
