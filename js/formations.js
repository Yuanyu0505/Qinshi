(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORMATIONS = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var ATTRIBUTE_KEYS = { "攻": "attack", "血": "health", "防": "defense" };
  var ATTRIBUTE_LABELS = { level: "等级", attack: "攻", health: "血", defense: "防" };
  var TARGET_PRIORITY = ["全体攻", "全体血", "追加伤害", "全体护盾", "全体内力", "全体防"];
  var TARGET_ATTRIBUTES = ["全体攻", "全体血", "全体护盾", "追加伤害", "全体内力", "全体防"];
  var DEFAULT_WEIGHTS = [12, 10, 5, 4, 3, 1];
  var DEFAULT_SCALES = [1, 8, 6, 1.5, 2, 1];
  var DEFAULT_COEFFICIENTS = [144, 15, 10, 32, 18, 12];

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
    if (!key || !stats) throw new TypeError("未知源属性");
    var source = parseIntegerInput(stats[key], 0);
    if (!source.valid) throw new RangeError("源属性必须为非负安全整数");
    var rate = parseDecimal(slot.ratePercent, "转换比例", 6);
    return safeNumber(BigInt(source.value) * rate.numerator / (rate.denominator * 100n));
  }

  function safeNumber(value) {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("计算结果超出安全整数范围");
    return Number(value);
  }

  function safeAdd(left, right) {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) {
      throw new RangeError("累计值必须为非负安全整数");
    }
    return safeNumber(BigInt(left) + BigInt(right));
  }

  function gcd(left, right) {
    while (right) { var remainder = left % right; left = right; right = remainder; }
    return left;
  }

  function parseDecimal(value, label, digits) {
    if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
      throw new TypeError(label + "不能为空");
    }
    var text = String(value).trim();
    if (!(new RegExp("^\\d+(?:\\.\\d{1," + digits + "})?$")).test(text) || text.length > 24) {
      throw new RangeError(label + "须为最多" + digits + "位小数的非负有限数");
    }
    var parts = text.split(".");
    var denominator = 10n ** BigInt((parts[1] || "").length);
    var numerator = BigInt(parts[0]) * denominator + BigInt(parts[1] || "0");
    var divisor = gcd(numerator, denominator);
    return { numerator: numerator / divisor, denominator: denominator / divisor };
  }

  function scoringOptions(formation, options) {
    options = options || {};
    var mode = options.mode === undefined ? "weighted" : options.mode;
    if (["weighted", "target", "custom", "legacy"].indexOf(mode) < 0) throw new RangeError("未知推荐模式");
    var target = mode === "target" ? options.target : null;
    if (mode === "target" && !(formation.slots || []).some(function (slot) { return slot.targetAttribute === target; })) {
      throw new RangeError("本阵无该属性");
    }
    var coefficients = DEFAULT_COEFFICIENTS.map(function (value) { return BigInt(value); });
    var denominator = 12n;
    if (mode === "custom") {
      if ((Array.isArray(options.weights) && options.weights.length !== 6) || (Array.isArray(options.scales) && options.scales.length !== 6)) {
        throw new RangeError("自定义参数必须包含六项权重与比例");
      }
      var ratios = TARGET_ATTRIBUTES.map(function (attribute, index) {
        var weight = parseDecimal(Array.isArray(options.weights) ? options.weights[index] : options.weights && options.weights[attribute], attribute + "权重", 2);
        var scale = parseDecimal(Array.isArray(options.scales) ? options.scales[index] : options.scales && options.scales[attribute], attribute + "比例", 2);
        if (weight.numerator > 100n * weight.denominator) throw new RangeError("权重范围为0–100");
        if (scale.numerator * 100n < scale.denominator || scale.numerator > 1000n * scale.denominator) throw new RangeError("比例范围为0.01–1000");
        var top = weight.numerator * scale.denominator;
        var bottom = weight.denominator * scale.numerator;
        var divisor = gcd(top, bottom);
        return { numerator: top / divisor, denominator: bottom / divisor };
      });
      denominator = ratios.reduce(function (multiple, ratio) { return multiple / gcd(multiple, ratio.denominator) * ratio.denominator; }, 1n);
      coefficients = ratios.map(function (ratio) { return ratio.numerator * (denominator / ratio.denominator); });
      if (!(formation.slots || []).some(function (slot) { return coefficients[TARGET_ATTRIBUTES.indexOf(slot.targetAttribute)] > 0n; })) {
        throw new RangeError("本阵至少一项有效属性权重必须大于0");
      }
    }
    var offsetText = options.offset === undefined ? "0" : String(options.offset);
    if (!/^\d+$/.test(offsetText) || (typeof options.offset === "number" && !Number.isSafeInteger(options.offset))) throw new RangeError("分页起点必须为非负整数");
    var limit = options.limit === undefined ? 20 : options.limit;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 200) throw new RangeError("每页数量范围为0–200");
    return { mode: mode, target: target, coefficients: coefficients, denominator: denominator, offset: BigInt(offsetText), limit: limit };
  }

  function validateOptions(formation, options) {
    var parsed = scoringOptions(formation, options);
    return { mode: parsed.mode, target: parsed.target, coefficients: parsed.coefficients.map(String), scoreDenominator: String(parsed.denominator), offset: String(parsed.offset), limit: parsed.limit };
  }

  function scoreTotals(formation, totals, options) {
    var config = scoringOptions(formation, options);
    var score = TARGET_ATTRIBUTES.reduce(function (sum, attribute, index) {
      var value = totals[attribute] === undefined ? 0 : totals[attribute];
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("总收益必须为非负安全整数");
      return sum + BigInt(value) * config.coefficients[index];
    }, 0n);
    return { exactScore: String(score), scoreDenominator: String(config.denominator) };
  }

  function usableMembers(formation, progress) {
    var normalized = normalizeProgress(formation, progress);
    var available = [];
    var excluded = [];
    var eligibleMains = [];
    (formation.candidates || []).forEach(function (candidate) {
      var member = normalized.members[candidate.id];
      if (!member || !member.owned) return;
      eligibleMains.push({ candidate: candidate, member: member });
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
    return { progress: normalized, available: available, eligibleMains: eligibleMains, excluded: excluded };
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
      item.rank = distinct.indexOf(item.value) + 1;
      item.rankClass = item.value === distinct[0] ? "highest" : (item.value === distinct[1] ? "second" : null);
      return item;
    });
  }

  function zeroTotals() {
    return TARGET_ATTRIBUTES.reduce(function (totals, attribute) { totals[attribute] = 0; return totals; }, {});
  }

  function compareVector(left, right, attributes) {
    for (var index = 0; index < attributes.length; index += 1) {
      var key = attributes[index];
      if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
    }
    return 0;
  }

  function comparePrimary(left, right, config) {
    if (config.mode === "legacy") return compareVector(left.totals, right.totals, TARGET_PRIORITY) || Math.sign(left.filled - right.filled);
    if (config.mode === "target" && left.totals[config.target] !== right.totals[config.target]) {
      return left.totals[config.target] > right.totals[config.target] ? 1 : -1;
    }
    return left.score === right.score ? 0 : (left.score > right.score ? 1 : -1);
  }

  function compareIds(left, right) {
    return left === right ? 0 : (left < right ? -1 : 1);
  }

  function betterRepresentative(left, right, config) {
    if (config.mode !== "legacy") {
      var vector = compareVector(left.totals, right.totals, TARGET_ATTRIBUTES);
      if (vector) return vector > 0;
      if (left.filled !== right.filled) return left.filled > right.filled;
    }
    if (left.officialMatches !== right.officialMatches) return left.officialMatches > right.officialMatches;
    if (config.mode === "legacy") {
      var mainOrder = compareNames(left.main.candidate.name, right.main.candidate.name);
      if (mainOrder) return mainOrder < 0;
      return left.tieKey.localeCompare(right.tieKey, "zh-CN", { sensitivity: "base" }) < 0;
    }
    return compareIds(left.tieKey, right.tieKey) < 0 || (left.tieKey === right.tieKey && compareIds(left.main.candidate.id, right.main.candidate.id) < 0);
  }

  // Each path identifies exactly one support arrangement. The terminal state reserves
  // at least one legal main; its multiplicity counts mains without duplicating paths.
  // DP stores only one representative and exact counts, never all optimal paths.
  function solveAssignments(formation, entries, mains, config) {
    if (entries.length > 30) throw new RangeError("候选弟子超过位掩码安全上限30");
    var slots = formation.slots.slice().sort(function (left, right) { return left.position - right.position; });
    var memo = new Map();
    var mainBits = mains.map(function (entry) {
      var index = entries.findIndex(function (support) { return support.candidate.id === entry.candidate.id; });
      return index < 0 ? 0 : 1 << index;
    });
    function mainOptions(usedMask) {
      return mains.filter(function (entry, index) { return !mainBits[index] || !(usedMask & mainBits[index]); });
    }
    var cells = slots.map(function (slot) {
      if (TARGET_ATTRIBUTES.indexOf(slot.targetAttribute) < 0) throw new RangeError("未知目标属性");
      var values = entries.map(function (entry) { return calculateCell(entry.stats, slot); });
      var maximum = values.reduce(function (largest, value) { return Math.max(largest, value); }, 0);
      return entries.map(function (entry, index) {
        return {
          position: slot.position, candidateId: entry.candidate.id, name: entry.candidate.name,
          sourceAttribute: slot.sourceAttribute, sourceValue: entry.stats[ATTRIBUTE_KEYS[slot.sourceAttribute]],
          ratePercent: slot.ratePercent, targetAttribute: slot.targetAttribute, value: values[index],
          normalizedScore: maximum > 0 ? values[index] / maximum : 0,
          official: entry.candidate.name === slot.officialDisciple, usesReference: entry.member.usesReference,
        };
      });
    });

    function branch(slotIndex, usedMask, entryIndex) {
      var tail = solve(slotIndex + 1, entryIndex < 0 ? usedMask : usedMask | (1 << entryIndex));
      if (!tail) return null;
      var assignment = entryIndex < 0 ? null : cells[slotIndex][entryIndex];
      var totals = Object.assign({}, tail.totals);
      if (assignment) totals[assignment.targetAttribute] = safeAdd(totals[assignment.targetAttribute], assignment.value);
      return {
        totals: totals,
        score: tail.score + (assignment ? BigInt(assignment.value) * config.coefficients[TARGET_ATTRIBUTES.indexOf(assignment.targetAttribute)] : 0n),
        filled: tail.filled + (assignment ? 1 : 0),
        officialMatches: tail.officialMatches + (assignment && assignment.official ? 1 : 0),
        tieKey: (assignment ? String(assignment.position).padStart(2, "0") + ":" + (config.mode === "legacy" ? assignment.name : JSON.stringify(assignment.candidateId)) : "~" + slots[slotIndex].position) + ";" + tail.tieKey,
        main: tail.main, tail: tail, assignment: assignment, entryIndex: entryIndex,
        tieCount: tail.tieCount, combinationCount: tail.combinationCount,
      };
    }

    function solve(slotIndex, usedMask) {
      var memoKey = slotIndex + "|" + usedMask;
      if (memo.has(memoKey)) return memo.get(memoKey);
      if (slotIndex === slots.length) {
        var remaining = mainOptions(usedMask);
        if (!remaining.length) { memo.set(memoKey, null); return null; }
        var terminal = { totals: zeroTotals(), score: 0n, filled: 0, officialMatches: remaining[0].candidate.name === formation.officialMain ? 1 : 0,
          tieKey: "", main: remaining[0], assignment: null, tail: null, tieCount: 1n, combinationCount: BigInt(remaining.length) };
        memo.set(memoKey, terminal);
        return terminal;
      }
      var best = null;
      var count = 0n;
      var combinations = 0n;
      for (var index = -1; index < entries.length; index += 1) {
        if (index >= 0 && (usedMask & (1 << index))) continue;
        var attempt = branch(slotIndex, usedMask, index);
        if (!attempt) continue;
        var comparison = best ? comparePrimary(attempt, best, config) : 1;
        if (comparison > 0) {
          best = attempt; count = attempt.tieCount; combinations = attempt.combinationCount;
        } else if (comparison === 0) {
          count += attempt.tieCount; combinations += attempt.combinationCount;
          if (betterRepresentative(attempt, best, config)) best = attempt;
        }
      }
      if (best) best = Object.assign({}, best, { tieCount: count, combinationCount: combinations });
      memo.set(memoKey, best);
      return best;
    }

    var best = solve(0, 0);
    var ties = [];
    var offset = config.offset;
    // Skip entire optimal subtrees using exact path counts; pages never truncate counts.
    function collect(slotIndex, usedMask, path) {
      if (ties.length >= config.limit) return;
      if (slotIndex === slots.length) {
        if (offset > 0n) { offset -= 1n; return; }
        ties.push({ assignments: path.slice(), mains: mainOptions(usedMask) });
        return;
      }
      var node = solve(slotIndex, usedMask);
      if (!node) return;
      for (var index = -1; index < entries.length && ties.length < config.limit; index += 1) {
        if (index >= 0 && (usedMask & (1 << index))) continue;
        var attempt = branch(slotIndex, usedMask, index);
        if (!attempt || comparePrimary(attempt, node, config) !== 0) continue;
        if (offset >= attempt.tieCount) { offset -= attempt.tieCount; continue; }
        if (attempt.assignment) path.push(attempt.assignment);
        collect(slotIndex + 1, index < 0 ? usedMask : usedMask | (1 << index), path);
        if (attempt.assignment) path.pop();
      }
    }
    if (best && config.limit > 0 && config.offset < best.tieCount) collect(0, 0, []);
    var assignments = [];
    var cursor = best;
    while (cursor && cursor.tail) { if (cursor.assignment) assignments.push(cursor.assignment); cursor = cursor.tail; }
    var usedMask = 0;
    assignments.forEach(function (assignment) {
      usedMask |= 1 << entries.findIndex(function (entry) { return entry.candidate.id === assignment.candidateId; });
    });
    return { best: best, assignments: assignments, mains: best ? mainOptions(usedMask) : [], ties: ties };
  }

  function summarizeTargets(assignments) {
    return assignments.reduce(function (summary, assignment) {
      var key = assignment.targetAttribute;
      summary[key] = safeAdd(summary[key] || 0, assignment.value);
      return summary;
    }, {});
  }

  function recommendFormation(formation, progress, options) {
    var config = scoringOptions(formation, options);
    if ((formation.candidates || []).length > 30) throw new RangeError("候选弟子超过位掩码安全上限30");
    var candidateIds = new Set();
    (formation.candidates || []).forEach(function (candidate) {
      if (typeof candidate.id !== "string" || !candidate.id || candidateIds.has(candidate.id)) throw new RangeError("候选弟子ID无效或重复");
      candidateIds.add(candidate.id);
    });
    var usable = usableMembers(formation, progress);
    var normalized = usable.progress;
    var manualMain = normalized.mainId;
    var mains = usable.eligibleMains.filter(function (entry) { return !manualMain || entry.candidate.id === manualMain; });
    mains.sort(function (left, right) {
      var official = Number(right.candidate.name === formation.officialMain) - Number(left.candidate.name === formation.officialMain);
      return official || (config.mode === "legacy" ? compareNames(left.candidate.name, right.candidate.name) : compareIds(left.candidate.id, right.candidate.id));
    });
    var entries = usable.available.filter(function (entry) { return entry.candidate.id !== manualMain; }).sort(function (left, right) { return compareIds(left.candidate.id, right.candidate.id); });
    var solved = solveAssignments(formation, entries, mains, config);

    function formatPlan(assignments, eligibleMains, chosenMain) {
      chosenMain = chosenMain || eligibleMains[0] || null;
      var referenceIds = {};
      var totals = Object.assign(zeroTotals(), summarizeTargets(assignments));
      var score = TARGET_ATTRIBUTES.reduce(function (sum, attribute, index) { return sum + BigInt(totals[attribute]) * config.coefficients[index]; }, 0n);
      if (chosenMain && chosenMain.member.usesReference) referenceIds[chosenMain.candidate.id] = true;
      assignments.forEach(function (assignment) { if (assignment.usesReference) referenceIds[assignment.candidateId] = true; });
      return {
        mainId: chosenMain ? chosenMain.candidate.id : null,
        mainName: chosenMain ? chosenMain.candidate.name : null,
        manualMain: Boolean(manualMain), assignments: assignments, filled: assignments.length,
        missingPositions: Math.max(0, formation.slots.length - assignments.length),
        normalizedScore: assignments.reduce(function (sum, assignment) { return sum + assignment.normalizedScore; }, 0),
        officialMatches: assignments.filter(function (assignment) { return assignment.official; }).length + (chosenMain && chosenMain.candidate.name === formation.officialMain ? 1 : 0),
        totals: totals, referenceCount: Object.keys(referenceIds).length,
        exactScore: String(score), scoreDenominator: String(config.denominator), mode: config.mode, target: config.target,
        mainOptions: eligibleMains.map(function (entry) { return { candidateId: entry.candidate.id, name: entry.candidate.name }; }),
      };
    }
    var result = formatPlan(solved.assignments, solved.mains, solved.best && solved.best.main);
    return Object.assign(result, {
      excluded: usable.excluded, unavailableReason: solved.best ? null : "没有已拥有且可担任主将的弟子",
      tieCount: String(solved.best ? solved.best.tieCount : 0n),
      combinationCount: String(solved.best ? solved.best.combinationCount : 0n),
      ties: solved.ties.map(function (tie) { return formatPlan(tie.assignments, tie.mains); }),
      offset: String(config.offset), limit: config.limit,
    });
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
    validateOptions: validateOptions,
    scoreTotals: scoreTotals,
    TARGET_ATTRIBUTES: TARGET_ATTRIBUTES.slice(),
    DEFAULT_WEIGHTS: DEFAULT_WEIGHTS.slice(),
    DEFAULT_SCALES: DEFAULT_SCALES.slice(),
  };
});
