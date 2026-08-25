(function (root, factory) {
  var core = root && root.MACHINE_BEAST_CORE;
  if (typeof module === "object" && module.exports) core = require("./machine-beasts.js");
  var planner = factory(core);
  if (typeof module === "object" && module.exports) module.exports = planner;
  if (root) root.MACHINE_BEAST_SCHOOL_PLANNER = planner;
})(typeof globalThis !== "undefined" ? globalThis : this, function (CORE) {
  "use strict";

  var MILESTONES = [10, 15, 20, 25];

  function beastById(data, id) {
    return data.beasts.find(function (beast) { return beast.id === id; });
  }

  function schoolById(data, schoolOrId) {
    if (schoolOrId && typeof schoolOrId === "object") return schoolOrId;
    return data.schools.find(function (school) { return school.id === schoolOrId; });
  }

  function targetTotalForStage(school, stage) {
    var normalized = CORE.integer(stage);
    var match = school && school.stages.find(function (item) { return item.stage === normalized; });
    return match ? match.requiredTotalLevel : null;
  }

  function defaultTargetStage(data, schoolOrId, progressByBeast) {
    var school = schoolById(data, schoolOrId);
    if (!school) return 1;
    var snapshot = CORE.schoolSnapshot(school, progressByBeast || {}, data);
    return snapshot.currentStage >= 5 ? 5 : snapshot.currentStage + 1;
  }

  function hasSelectedHighRank(limits) {
    return Object.keys(limits || {}).some(function (modificationId) {
      return Object.keys(limits[modificationId] || {}).some(function (rank) {
        return CORE.integer(rank) > 7 && CORE.integer(limits[modificationId][rank]) > 0;
      });
    });
  }

  function hasSelectedModification(limits) {
    return Object.keys(limits || {}).some(function (modificationId) {
      if (modificationId === "none") return false;
      return Object.keys(limits[modificationId] || {}).some(function (rank) {
        return CORE.integer(limits[modificationId][rank]) > 0;
      });
    });
  }

  function candidateStableKey(candidate) {
    return candidate.items.map(function (item) {
      return [item.source, item.modificationId, item.rank, item.count].join(":");
    }).sort().join("|");
  }

  function numericResource(value) {
    return value === null || value === undefined ? Number.MAX_SAFE_INTEGER : value;
  }

  function betterBeastCandidate(left, right) {
    if (!right) return true;
    var leftValues = [
      left.investedCount, left.newInvestedCount, left.overflowResearch,
      left.resources.fragments, numericResource(left.resources.contribution), numericResource(left.resources.yuan),
      left.resources.awakeningBlueprints, left.resources.organPieces
    ];
    var rightValues = [
      right.investedCount, right.newInvestedCount, right.overflowResearch,
      right.resources.fragments, numericResource(right.resources.contribution), numericResource(right.resources.yuan),
      right.resources.awakeningBlueprints, right.resources.organPieces
    ];
    for (var index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) return leftValues[index] < rightValues[index];
    }
    return candidateStableKey(left) < candidateStableKey(right);
  }

  function unchangedCandidate(beast, progress, currentLevel) {
    return {
      beastId: beast.id,
      beastName: beast.name,
      startLevel: currentLevel,
      endLevel: currentLevel,
      startResearch: progress.research,
      endResearch: progress.research,
      addedResearch: 0,
      overflowResearch: 0,
      investedCount: 0,
      ownedInvestedCount: 0,
      newInvestedCount: 0,
      milestone: MILESTONES.indexOf(currentLevel) >= 0,
      items: [],
      resources: { awakeningBlueprints: 0, organPieces: 0, fragments: 0, contribution: 0, yuan: 0 }
    };
  }

  function machineBeastCandidates(data, beast, rawProgress, options) {
    var config = options || {};
    var progress = CORE.normalizeBeastProgress(beast, rawProgress, data);
    var currentLevel = CORE.levelForResearch(progress.research, data.researchThresholds, beast.maxLevel);
    var limits = config.ownedLimits && typeof config.ownedLimits === "object" ? config.ownedLimits : {};
    var byEndLevel = {};
    byEndLevel[String(currentLevel)] = unchangedCandidate(beast, progress, currentLevel);

    for (var targetLevel = currentLevel + 1; targetLevel <= beast.maxLevel; targetLevel += 1) {
      var result = CORE.calculateInvestmentPlan(data, beast, progress, {
        targetLevel: targetLevel,
        useOwnedInventory: config.useOwnedInventory !== false,
        ownedLimits: limits,
        includeHighRanks: hasSelectedHighRank(limits),
        includeMods: hasSelectedModification(limits),
        allowNewHighRanks: Boolean(config.allowNewHighRanks),
        allowNewModifications: Boolean(config.allowNewModifications),
        investedCountMode: "equivalent",
        preferOwnedOnTie: true
      });
      if (!result.valid) continue;
      var endLevel = result.totals.projectedLevel;
      var endResearch = progress.research + result.totals.research;
      var newInvestedCount = CORE.integer(result.totals.newInvestedCount, result.shortage.bodyEquivalent);
      var contribution = result.exchange.available ? result.exchange.contribution : (result.shortage.fragments ? null : 0);
      var yuan = result.exchange.available ? result.exchange.yuan : (result.shortage.fragments ? null : 0);
      var candidate = {
        beastId: beast.id,
        beastName: beast.name,
        startLevel: currentLevel,
        endLevel: endLevel,
        startResearch: progress.research,
        endResearch: endResearch,
        addedResearch: result.totals.research,
        overflowResearch: Math.max(0, endResearch - CORE.thresholdForLevel(endLevel, data.researchThresholds)),
        investedCount: result.totals.investedCount,
        ownedInvestedCount: Math.max(0, result.totals.investedCount - newInvestedCount),
        newInvestedCount: newInvestedCount,
        milestone: MILESTONES.indexOf(endLevel) >= 0,
        items: result.selected.ownedItems.concat(result.selected.newItems),
        resources: {
          awakeningBlueprints: result.totals.awakeningBlueprints,
          organPieces: result.totals.organPieces,
          fragments: result.shortage.fragments,
          contribution: contribution,
          yuan: yuan
        }
      };
      var key = String(endLevel);
      if (betterBeastCandidate(candidate, byEndLevel[key])) byEndLevel[key] = candidate;
    }

    return Object.keys(byEndLevel).map(function (level) { return byEndLevel[level]; }).sort(function (left, right) {
      return left.endLevel - right.endLevel || left.investedCount - right.investedCount;
    });
  }

  function emptyTotals(currentTotalLevel) {
    return {
      investedCount: 0,
      ownedInvestedCount: 0,
      newInvestedCount: 0,
      milestoneCount: 0,
      overflowResearch: 0,
      awakeningBlueprints: 0,
      organPieces: 0,
      fragments: 0,
      contribution: 0,
      yuan: 0,
      projectedTotalLevel: currentTotalLevel
    };
  }

  function addNullable(left, right) {
    if (left === null || right === null) return null;
    return left + right;
  }

  function appendCandidate(state, candidate, currentTotalLevel) {
    var changed = candidate.endLevel !== candidate.startLevel || candidate.items.length > 0;
    var totals = {
      investedCount: state.totals.investedCount + candidate.investedCount,
      ownedInvestedCount: state.totals.ownedInvestedCount + candidate.ownedInvestedCount,
      newInvestedCount: state.totals.newInvestedCount + candidate.newInvestedCount,
      milestoneCount: state.totals.milestoneCount + (changed && candidate.milestone ? 1 : 0),
      overflowResearch: state.totals.overflowResearch + candidate.overflowResearch,
      awakeningBlueprints: state.totals.awakeningBlueprints + candidate.resources.awakeningBlueprints,
      organPieces: state.totals.organPieces + candidate.resources.organPieces,
      fragments: state.totals.fragments + candidate.resources.fragments,
      contribution: addNullable(state.totals.contribution, candidate.resources.contribution),
      yuan: addNullable(state.totals.yuan, candidate.resources.yuan),
      projectedTotalLevel: currentTotalLevel + state.addedLevel + candidate.endLevel - candidate.startLevel
    };
    return {
      addedLevel: state.addedLevel + candidate.endLevel - candidate.startLevel,
      totals: totals,
      beasts: changed ? state.beasts.concat([candidate]) : state.beasts.slice()
    };
  }

  function planStableKey(plan) {
    return plan.beasts.map(function (beast) {
      return beast.beastId + ":" + beast.endLevel + ":" + candidateStableKey(beast);
    }).sort().join("||");
  }

  function betterSchoolPlan(left, right, milestoneMode) {
    if (!right) return true;
    var leftValues = [left.totals.investedCount, left.totals.newInvestedCount];
    var rightValues = [right.totals.investedCount, right.totals.newInvestedCount];
    if (milestoneMode) {
      leftValues.push(-left.totals.milestoneCount);
      rightValues.push(-right.totals.milestoneCount);
    }
    leftValues = leftValues.concat([
      left.totals.overflowResearch, left.totals.fragments,
      numericResource(left.totals.contribution), numericResource(left.totals.yuan),
      left.totals.awakeningBlueprints, left.totals.organPieces
    ]);
    rightValues = rightValues.concat([
      right.totals.overflowResearch, right.totals.fragments,
      numericResource(right.totals.contribution), numericResource(right.totals.yuan),
      right.totals.awakeningBlueprints, right.totals.organPieces
    ]);
    for (var index = 0; index < leftValues.length; index += 1) {
      if (leftValues[index] !== rightValues[index]) return leftValues[index] < rightValues[index];
    }
    return planStableKey(left) < planStableKey(right);
  }

  function combineSchoolCandidates(candidateSets, currentTotalLevel, targetTotalLevel, milestoneMode) {
    var needed = Math.max(0, targetTotalLevel - currentTotalLevel);
    var states = new Map();
    states.set(0, { addedLevel: 0, totals: emptyTotals(currentTotalLevel), beasts: [] });
    candidateSets.forEach(function (candidates) {
      var next = new Map();
      states.forEach(function (state) {
        candidates.forEach(function (candidate) {
          var combined = appendCandidate(state, candidate, currentTotalLevel);
          var key = Math.min(needed, combined.addedLevel);
          var existing = next.get(key);
          if (betterSchoolPlan(combined, existing, milestoneMode)) next.set(key, combined);
        });
      });
      states = next;
    });
    return states.get(needed) || null;
  }

  function samePlan(left, right) {
    return Boolean(left && right && planStableKey(left) === planStableKey(right));
  }

  function calculateSchoolPlans(data, schoolOrId, progressByBeast, options) {
    var config = options || {};
    var school = schoolById(data, schoolOrId);
    if (!school) return { valid: false, errors: ["未找到对应机关术流派"] };
    var targetStage = CORE.integer(config.targetStage, defaultTargetStage(data, school, progressByBeast));
    var targetTotalLevel = targetTotalForStage(school, targetStage);
    if (targetTotalLevel === null) return { valid: false, errors: ["目标流派阶数必须为1至5阶"] };

    var progress = progressByBeast && typeof progressByBeast === "object" ? progressByBeast : {};
    var snapshot = CORE.schoolSnapshot(school, progress, data);
    var currentTotalLevel = snapshot.totalLevel;
    var target = {
      stage: targetStage,
      totalLevel: targetTotalLevel,
      remaining: Math.max(0, targetTotalLevel - currentTotalLevel)
    };
    if (!target.remaining) {
      return {
        valid: true,
        errors: [],
        current: { totalLevel: currentTotalLevel },
        target: target,
        plans: [{ kind: "merged", totals: emptyTotals(currentTotalLevel), beasts: [] }]
      };
    }

    var participatingIds = Array.isArray(config.participatingBeastIds) ? config.participatingBeastIds : school.beastIds.slice();
    var participating = {};
    participatingIds.forEach(function (id) { participating[id] = true; });
    var candidateSets = [];
    school.beastIds.forEach(function (beastId) {
      if (!participating[beastId]) return;
      var beast = beastById(data, beastId);
      if (!beast) return;
      candidateSets.push(machineBeastCandidates(data, beast, progress[beastId], {
        useOwnedInventory: config.useOwnedInventory !== false,
        ownedLimits: config.ownedLimitsByBeast && config.ownedLimitsByBeast[beastId],
        allowNewHighRanks: config.allowNewHighRanks,
        allowNewModifications: config.allowNewModifications
      }));
    });

    var free = combineSchoolCandidates(candidateSets, currentTotalLevel, targetTotalLevel, false);
    var milestone = combineSchoolCandidates(candidateSets, currentTotalLevel, targetTotalLevel, true);
    if (!free || !milestone) {
      return {
        valid: false,
        errors: ["当前参与范围内的机关兽无法达到目标流派阶数"],
        current: { totalLevel: currentTotalLevel },
        target: target
      };
    }
    free.kind = "free";
    milestone.kind = "milestone";
    var plans = samePlan(free, milestone) ? [Object.assign({}, free, { kind: "merged" })] : [free, milestone];
    return {
      valid: true,
      errors: [],
      current: { totalLevel: currentTotalLevel },
      target: target,
      plans: plans
    };
  }

  return {
    defaultTargetStage: defaultTargetStage,
    machineBeastCandidates: machineBeastCandidates,
    calculateSchoolPlans: calculateSchoolPlans
  };
});
