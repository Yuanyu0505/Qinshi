(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORMATIONS = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var ATTRIBUTE_KEYS = { "攻": "attack", "血": "health", "防": "defense" };
  var ATTRIBUTE_LABELS = { level: "等级", attack: "攻", health: "血", defense: "防" };
  var TARGET_PRIORITY = ["全体攻", "全体血", "追加伤害", "全体护盾", "全体内力", "全体防"];

  function normalizeName(value) {
    return String(value == null ? "" : value).replace(/[·•・\s]+/g, "").trim();
  }

  function compareNames(left, right) {
    return String(left || "").localeCompare(String(right || ""), "zh-CN", { sensitivity: "base" });
  }

  function parseIntegerInput(value, minimum) {
    var text = String(value == null ? "" : value).replace(/[\s,，]/g, "");
    if (!text) return { valid: false, missing: true, value: null };
    if (!/^\d+$/.test(text)) return { valid: false, missing: false, value: null };
    var parsed = Number(text);
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      return { valid: false, missing: false, value: null };
    }
    return { valid: true, missing: false, value: parsed };
  }

  function normalizeStoredInteger(value, minimum) {
    var parsed = parseIntegerInput(value, minimum);
    return parsed.valid ? parsed.value : null;
  }

  function candidateMap(formation) {
    return (formation.candidates || []).reduce(function (map, candidate) {
      map[candidate.id] = candidate;
      return map;
    }, {});
  }

  function normalizeProgress(formation, raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var known = candidateMap(formation);
    var rawMembers = raw.members && typeof raw.members === "object" ? raw.members : {};
    var members = {};
    Object.keys(rawMembers).forEach(function (candidateId) {
      var source = rawMembers[candidateId];
      if (!known[candidateId] || !source || typeof source !== "object" || source.owned !== true) return;
      members[candidateId] = {
        owned: true,
        level: normalizeStoredInteger(source.level, 1),
        attack: normalizeStoredInteger(source.attack, 0),
        health: normalizeStoredInteger(source.health, 0),
        defense: normalizeStoredInteger(source.defense, 0),
        usesReference: source.usesReference === true,
      };
    });
    var mainId = typeof raw.mainId === "string" && members[raw.mainId] ? raw.mainId : null;
    return { mainId: mainId, members: members };
  }

  function referenceMember(candidate) {
    return {
      owned: true,
      level: 1,
      attack: candidate.level1.attack,
      health: candidate.level1.health,
      defense: candidate.level1.defense,
      usesReference: true,
    };
  }

  function memberStatus(member) {
    var missing = [];
    var errors = [];
    [["level", 1], ["attack", 0], ["health", 0], ["defense", 0]].forEach(function (entry) {
      var key = entry[0];
      var parsed = parseIntegerInput(member && member[key], entry[1]);
      if (parsed.missing) missing.push(ATTRIBUTE_LABELS[key]);
      else if (!parsed.valid) errors.push(ATTRIBUTE_LABELS[key] + "必须为" + (key === "level" ? "大于等于1" : "大于等于0") + "的整数");
    });
    return { valid: missing.length === 0 && errors.length === 0, missing: missing, errors: errors };
  }

  function memberStats(member) {
    return {
      attack: Number(member.attack),
      health: Number(member.health),
      defense: Number(member.defense),
    };
  }

  function calculateCell(stats, slot) {
    var key = ATTRIBUTE_KEYS[slot.sourceAttribute];
    if (!key || !stats || !Number.isFinite(Number(stats[key]))) return 0;
    return Math.floor(Number(stats[key]) * Number(slot.ratePercent) / 100);
  }

  function usableMembers(formation, progress) {
    var normalized = normalizeProgress(formation, progress);
    var available = [];
    var excluded = [];
    (formation.candidates || []).forEach(function (candidate) {
      var member = normalized.members[candidate.id];
      if (!member || !member.owned) return;
      var status = memberStatus(member);
      if (!status.valid) {
        excluded.push({
          candidateId: candidate.id,
          name: candidate.name,
          missing: status.missing,
          errors: status.errors,
        });
        return;
      }
      available.push({
        candidate: candidate,
        member: member,
        stats: memberStats(member),
      });
    });
    return { progress: normalized, available: available, excluded: excluded };
  }

  function buildMatrix(formation, progress) {
    var usable = usableMembers(formation, progress);
    var rows = usable.available.filter(function (entry) {
      return entry.candidate.id !== usable.progress.mainId;
    }).map(function (entry) {
      var values = {};
      formation.slots.forEach(function (slot) {
        values[slot.position] = calculateCell(entry.stats, slot);
      });
      return {
        candidateId: entry.candidate.id,
        name: entry.candidate.name,
        usesReference: entry.member.usesReference,
        stats: entry.stats,
        values: values,
      };
    });
    return { rows: rows, excluded: usable.excluded, progress: usable.progress };
  }

  function rankColumn(rows, position) {
    var ordered = rows.map(function (row) {
      return { candidateId: row.candidateId, name: row.name, value: Number(row.values[position] || 0), row: row };
    }).sort(function (left, right) {
      return right.value - left.value || compareNames(left.name, right.name);
    });
    var distinct = [];
    ordered.forEach(function (item) {
      if (distinct.indexOf(item.value) === -1) distinct.push(item.value);
    });
    return ordered.map(function (item) {
      item.rankClass = item.value === distinct[0] ? "highest" : (item.value === distinct[1] ? "second" : null);
      return item;
    });
  }

  function positionMaxima(formation, entries) {
    var maxima = {};
    formation.slots.forEach(function (slot) {
      maxima[slot.position] = entries.reduce(function (maximum, entry) {
        return Math.max(maximum, calculateCell(entry.stats, slot));
      }, 0);
    });
    return maxima;
  }

  function compareTieKeys(left, right) {
    return left.localeCompare(right, "zh-CN", { sensitivity: "base" });
  }

  function addTargetValue(totals, targetAttribute, value) {
    var next = Object.assign({}, totals);
    next[targetAttribute] = (next[targetAttribute] || 0) + value;
    return next;
  }

  function comparePlanPriority(left, right) {
    for (var index = 0; index < TARGET_PRIORITY.length; index += 1) {
      var targetAttribute = TARGET_PRIORITY[index];
      var leftValue = Number(left.targetTotals[targetAttribute] || 0);
      var rightValue = Number(right.targetTotals[targetAttribute] || 0);
      if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
    }
    if (left.filled !== right.filled) return left.filled > right.filled ? 1 : -1;
    return 0;
  }

  function betterPlan(left, right) {
    if (!right) return true;
    var priorityComparison = comparePlanPriority(left, right);
    if (priorityComparison) return priorityComparison > 0;
    if (left.officialMatches !== right.officialMatches) return left.officialMatches > right.officialMatches;
    return compareTieKeys(left.tieKey, right.tieKey) < 0;
  }

  function solveAssignments(formation, entries, maxima) {
    var slots = formation.slots.slice().sort(function (left, right) { return left.position - right.position; });
    var memo = {};

    function solve(slotIndex, usedMask) {
      if (slotIndex >= slots.length) {
        return { filled: 0, score: 0, targetTotals: {}, officialMatches: 0, assignments: [], tieKey: "" };
      }
      var memoKey = slotIndex + "|" + usedMask;
      if (memo[memoKey]) return memo[memoKey];
      var slot = slots[slotIndex];
      var skipped = solve(slotIndex + 1, usedMask);
      var best = {
        filled: skipped.filled,
        score: skipped.score,
        targetTotals: Object.assign({}, skipped.targetTotals),
        officialMatches: skipped.officialMatches,
        assignments: skipped.assignments.slice(),
        tieKey: "~" + slot.position + ";" + skipped.tieKey,
      };
      entries.forEach(function (entry, entryIndex) {
        var bit = 1 << entryIndex;
        if (usedMask & bit) return;
        var tail = solve(slotIndex + 1, usedMask | bit);
        var value = calculateCell(entry.stats, slot);
        var normalizedScore = maxima[slot.position] > 0 ? value / maxima[slot.position] : 0;
        var assignment = {
          position: slot.position,
          candidateId: entry.candidate.id,
          name: entry.candidate.name,
          sourceAttribute: slot.sourceAttribute,
          sourceValue: entry.stats[ATTRIBUTE_KEYS[slot.sourceAttribute]],
          ratePercent: slot.ratePercent,
          targetAttribute: slot.targetAttribute,
          value: value,
          normalizedScore: normalizedScore,
          official: entry.candidate.name === slot.officialDisciple,
          usesReference: entry.member.usesReference,
        };
        var candidate = {
          filled: tail.filled + 1,
          score: tail.score + normalizedScore,
          targetTotals: addTargetValue(tail.targetTotals, assignment.targetAttribute, assignment.value),
          officialMatches: tail.officialMatches + (assignment.official ? 1 : 0),
          assignments: [assignment].concat(tail.assignments),
          tieKey: String(slot.position).padStart(2, "0") + ":" + entry.candidate.name + ";" + tail.tieKey,
        };
        if (betterPlan(candidate, best)) best = candidate;
      });
      memo[memoKey] = best;
      return best;
    }

    return solve(0, 0);
  }

  function betterMainPlan(left, right, formation) {
    if (!right) return true;
    var priorityComparison = comparePlanPriority(left.plan, right.plan);
    if (priorityComparison) return priorityComparison > 0;
    var leftOfficial = left.plan.officialMatches + (left.main.candidate.name === formation.officialMain ? 1 : 0);
    var rightOfficial = right.plan.officialMatches + (right.main.candidate.name === formation.officialMain ? 1 : 0);
    if (leftOfficial !== rightOfficial) return leftOfficial > rightOfficial;
    var mainCompare = compareNames(left.main.candidate.name, right.main.candidate.name);
    if (mainCompare !== 0) return mainCompare < 0;
    return compareTieKeys(left.plan.tieKey, right.plan.tieKey) < 0;
  }

  function summarizeTargets(assignments) {
    return assignments.reduce(function (summary, assignment) {
      var key = assignment.targetAttribute;
      summary[key] = (summary[key] || 0) + assignment.value;
      return summary;
    }, {});
  }

  function recommendFormation(formation, progress) {
    var usable = usableMembers(formation, progress);
    var normalized = usable.progress;
    var chosenMain = null;
    var chosenPlan = null;
    var manualMain = normalized.mainId;

    if (manualMain) {
      chosenMain = usable.available.find(function (entry) { return entry.candidate.id === manualMain; }) || {
        candidate: (formation.candidates || []).find(function (candidate) { return candidate.id === manualMain; }),
        member: normalized.members[manualMain],
      };
      var supportEntries = usable.available.filter(function (entry) { return entry.candidate.id !== manualMain; });
      chosenPlan = solveAssignments(formation, supportEntries, positionMaxima(formation, supportEntries));
    } else if (usable.available.length) {
      var sharedMaxima = positionMaxima(formation, usable.available);
      var bestMainPlan = null;
      usable.available.forEach(function (mainEntry) {
        var supportPool = usable.available.filter(function (entry) {
          return entry.candidate.id !== mainEntry.candidate.id;
        });
        var attempt = { main: mainEntry, plan: solveAssignments(formation, supportPool, sharedMaxima) };
        if (betterMainPlan(attempt, bestMainPlan, formation)) bestMainPlan = attempt;
      });
      chosenMain = bestMainPlan.main;
      chosenPlan = bestMainPlan.plan;
    } else {
      chosenPlan = { filled: 0, score: 0, targetTotals: {}, officialMatches: 0, assignments: [], tieKey: "" };
    }

    var assignments = chosenPlan.assignments.slice().sort(function (left, right) {
      return left.position - right.position;
    });
    var mainId = chosenMain && chosenMain.candidate ? chosenMain.candidate.id : manualMain;
    var referenceIds = {};
    if (chosenMain && chosenMain.member && chosenMain.member.usesReference) referenceIds[mainId] = true;
    assignments.forEach(function (assignment) {
      if (assignment.usesReference) referenceIds[assignment.candidateId] = true;
    });
    return {
      mainId: mainId || null,
      mainName: chosenMain && chosenMain.candidate ? chosenMain.candidate.name : null,
      manualMain: Boolean(manualMain),
      assignments: assignments,
      filled: chosenPlan.filled,
      missingPositions: Math.max(0, formation.slots.length - chosenPlan.filled),
      normalizedScore: chosenPlan.score,
      officialMatches: chosenPlan.officialMatches + (
        chosenMain && chosenMain.candidate && chosenMain.candidate.name === formation.officialMain ? 1 : 0
      ),
      totals: summarizeTargets(assignments),
      excluded: usable.excluded,
      referenceCount: Object.keys(referenceIds).length,
    };
  }

  return {
    normalizeName: normalizeName,
    compareNames: compareNames,
    parseIntegerInput: parseIntegerInput,
    normalizeProgress: normalizeProgress,
    referenceMember: referenceMember,
    memberStatus: memberStatus,
    calculateCell: calculateCell,
    buildMatrix: buildMatrix,
    rankColumn: rankColumn,
    recommendFormation: recommendFormation,
    summarizeTargets: summarizeTargets,
  };
});
