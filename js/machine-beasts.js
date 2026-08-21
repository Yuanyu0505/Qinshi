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
    var currentStage = totalLevel >= 45 ? 1 : 0;
    var currentEffects = currentStage ? school.stages[currentStage - 1] : null;
    var nextStage = currentStage < school.stages.length ? school.stages[currentStage] : null;
    return {
      schoolId: school.id,
      totalLevel: totalLevel,
      currentStage: currentStage,
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

  function stateKey(state) {
    return state.items.map(function (item) {
      return [item.source, item.modificationId, item.rank, item.count].join(":");
    }).join("|");
  }

  function preferSameResearch(left, right) {
    if (!right) return true;
    var fields = ["newCount", "awakeningBlueprints", "organPieces"];
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
    states[0].set(0, { research: 0, newCount: 0, awakeningBlueprints: 0, organPieces: 0, items: [] });
    types.forEach(function (type) {
      var previous = states;
      var next = previous.map(function (map) { return new Map(map); });
      for (var count = 0; count <= maximumCount; count += 1) {
        previous[count].forEach(function (state) {
          var available = Math.min(type.available, maximumCount - count);
          for (var quantity = 1; quantity <= available; quantity += 1) {
            var resources = itemResources(type.researchEach, data);
            addState(next[count + quantity], {
              research: state.research + type.researchEach * quantity,
              newCount: state.newCount,
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

  function buildUnlimitedStates(types, maximumCount, limit, data) {
    var bounded = types.map(function (type) { return Object.assign({ available: maximumCount }, type); });
    var states = buildBoundedStates(bounded, maximumCount, limit, data);
    states.forEach(function (map) {
      map.forEach(function (state) { state.newCount = state.items.reduce(function (total, item) { return total + item.count; }, 0); });
    });
    return states;
  }

  function ownedTypes(data, beast, progress, options, maximumCount) {
    var includeHigh = Boolean(options.includeHighRanks || progress.showHighRanks);
    var includeMods = Boolean(options.includeMods || progress.showMods);
    var types = [];
    data.modifications.forEach(function (modification, modIndex) {
      if (modification.id !== "none" && (!includeMods || beast.quality !== "orange")) return;
      var ranks = progress.inventory[modification.id] || {};
      Object.keys(ranks).forEach(function (rankKey) {
        var rank = integer(rankKey);
        if (rank > 7 && !includeHigh) return;
        var count = Math.min(integer(ranks[rankKey]), maximumCount);
        var research = researchFor(data, beast, rank, modification.id);
        if (!count || !research) return;
        types.push({
          source: "owned", modificationId: modification.id, modificationIndex: modIndex,
          rank: rank, researchEach: research, available: count
        });
      });
    });
    return types.sort(function (left, right) {
      return right.researchEach - left.researchEach || right.rank - left.rank || left.modificationIndex - right.modificationIndex;
    });
  }

  function newTypes(data, beast) {
    var maximumRank = Math.min(7, beast.maxRank);
    var types = [];
    for (var rank = maximumRank; rank >= 0; rank -= 1) {
      types.push({ source: "new", modificationId: "none", rank: rank, researchEach: researchFor(data, beast, rank, "none") });
    }
    return types.filter(function (item) { return item.researchEach > 0; });
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
      awakeningBlueprints: owned.awakeningBlueprints + added.awakeningBlueprints,
      organPieces: owned.organPieces + added.organPieces,
      items: owned.items.concat(added.items)
    };
  }

  function planMetrics(state, deficit, beast, progress, data) {
    var missingFragments = Math.max(0, state.newCount * beast.fragmentsPerBody - progress.fragments);
    var contribution = beast.contributionPerFragment === null ? null : missingFragments * beast.contributionPerFragment;
    return {
      investedCount: state.items.reduce(function (total, item) { return total + item.count; }, 0),
      overflow: Math.max(0, state.research - deficit),
      missingFragments: missingFragments,
      contribution: contribution === null ? Number.MAX_SAFE_INTEGER : contribution,
      yuan: contribution === null ? Number.MAX_SAFE_INTEGER : Math.ceil(contribution * data.resourceRules.yuanPerContribution),
      awakeningBlueprints: state.awakeningBlueprints,
      organPieces: state.organPieces,
      stable: stateKey(state)
    };
  }

  function betterPlan(candidate, best) {
    if (!best) return true;
    var keys = ["investedCount", "overflow", "missingFragments", "contribution", "yuan", "awakeningBlueprints", "organPieces"];
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
      totals: { investedCount: 0, research: 0, overflow: 0, awakeningBlueprints: 0, organPieces: 0, projectedLevel: currentLevel },
      shortage: { bodies: 0, bodyEquivalent: 0, fragments: 0 },
      exchange: { available: beast.contributionPerFragment !== null, contribution: 0, yuan: 0 }
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
    var targetResearch = thresholdForLevel(targetLevel, data.researchThresholds);
    var deficit = Math.max(0, targetResearch - progress.research);
    if (!deficit) return emptyPlan(data, beast, progress, currentLevel, targetLevel, targetResearch);

    var purchasable = newTypes(data, beast);
    var minimumResearch = Math.min.apply(null, purchasable.map(function (item) { return item.researchEach; }));
    var maximumResearch = Math.max.apply(null, purchasable.map(function (item) { return item.researchEach; }));
    var provisionalMaximumCount = Math.ceil(deficit / minimumResearch) + 1;
    var owned = ownedTypes(data, beast, progress, config, provisionalMaximumCount);
    owned.forEach(function (item) { maximumResearch = Math.max(maximumResearch, item.researchEach); });
    var limit = deficit + maximumResearch;
    var ownedStates = buildBoundedStates(owned, provisionalMaximumCount, limit, data);
    var newStates = buildUnlimitedStates(purchasable, provisionalMaximumCount, limit, data);
    var sortedNew = newStates.map(sortedStates);
    var best = null;

    for (var totalCount = 1; totalCount <= provisionalMaximumCount && !best; totalCount += 1) {
      for (var ownedCount = 0; ownedCount <= totalCount; ownedCount += 1) {
        var newCount = totalCount - ownedCount;
        if (!ownedStates[ownedCount] || !sortedNew[newCount] || !sortedNew[newCount].length) continue;
        ownedStates[ownedCount].forEach(function (ownedState) {
          var addedState = lowerBound(sortedNew[newCount], Math.max(0, deficit - ownedState.research));
          if (!addedState) return;
          var state = combineStates(ownedState, addedState);
          if (state.research < deficit) return;
          var candidate = { state: state, metrics: planMetrics(state, deficit, beast, progress, data) };
          if (betterPlan(candidate, best)) best = candidate;
        });
      }
    }

    if (!best) return { valid: false, errors: ["未能生成有效机关兽投入方案"] };
    var selectedOwned = best.state.items.filter(function (item) { return item.source === "owned"; });
    var selectedNew = best.state.items.filter(function (item) { return item.source === "new"; });
    var unused = owned.map(function (type) {
      var selected = selectedOwned.find(function (item) { return item.rank === type.rank && item.modificationId === type.modificationId; });
      var count = type.available - (selected ? selected.count : 0);
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
        research: best.state.research,
        overflow: best.metrics.overflow,
        awakeningBlueprints: best.state.awakeningBlueprints,
        organPieces: best.state.organPieces,
        projectedLevel: levelForResearch(progress.research + best.state.research, data.researchThresholds, beast.maxLevel)
      },
      shortage: {
        bodies: best.state.newCount,
        bodyEquivalent: missingFragments / beast.fragmentsPerBody,
        fragments: missingFragments
      },
      exchange: {
        available: contributionAvailable,
        contribution: contribution,
        yuan: contributionAvailable ? Math.ceil(contribution * data.resourceRules.yuanPerContribution) : null
      }
    };
  }

  return {
    integer: integer,
    thresholdForLevel: thresholdForLevel,
    levelForResearch: levelForResearch,
    nextEffectLevel: nextEffectLevel,
    activeBeastEffect: activeBeastEffect,
    normalizeBeastProgress: normalizeBeastProgress,
    schoolSnapshot: schoolSnapshot,
    researchFor: researchFor,
    calculateInvestmentPlan: calculateInvestmentPlan
  };
});
