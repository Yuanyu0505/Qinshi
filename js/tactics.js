/**
 * 兵法进度与材料计算核心（纯逻辑，无 DOM 依赖）。
 * 浏览器暴露 window.TACTICS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TACTICS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function object(value) {
    return value && typeof value === "object" ? value : {};
  }

  function integer(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function findRank(tactic, rank) {
    var rows = array(tactic && tactic.ranks);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].rank === rank) return rows[i];
    }
    return null;
  }

  function findMantra(tactic, mantraId) {
    var mantras = array(tactic && tactic.mantras);
    for (var i = 0; i < mantras.length; i++) {
      if (mantras[i] && mantras[i].id === mantraId) return mantras[i];
    }
    return null;
  }

  function findMantraStage(mantra, rank) {
    var stages = array(mantra && mantra.stages);
    for (var i = 0; i < stages.length; i++) {
      if (stages[i] && stages[i].rank === rank) return stages[i];
    }
    return null;
  }

  function allowedMantraRank(tactic, mantraId, tacticRank) {
    var mantra = findMantra(tactic, mantraId);
    var rank = integer(tacticRank, -1);
    if (!mantra || rank < integer(mantra.unlockTacticRank, 0)) return -1;
    return array(mantra.stages).reduce(function (max, stage) {
      if (!stage || integer(stage.tacticRank, Infinity) > rank) return max;
      return Math.max(max, integer(stage.rank, -1));
    }, -1);
  }

  function defaultProgress(tactic) {
    var mantras = {};
    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (mantra && mantra.id) mantras[mantra.id] = -1;
    });
    return { rank: 0, rehearsalSpent: 0, mantras: mantras };
  }

  function actualMaximum(rehearsalInput) {
    var rehearsal = object(rehearsalInput);
    var singleHorn = integer(rehearsal.singleHorn, 0);
    var guaranteeHorn = integer(rehearsal.guaranteeHorn, 0);
    if (singleHorn <= 0 || guaranteeHorn <= 0) return 0;
    return Math.ceil(guaranteeHorn / singleHorn) * singleHorn;
  }

  function normalizeRehearsalSpent(rehearsal, value) {
    var singleHorn = integer(object(rehearsal).singleHorn, 0);
    var maximum = actualMaximum(rehearsal);
    if (!singleHorn || !maximum) return 0;
    var spent = clamp(integer(value, 0), 0, maximum);
    return Math.floor(spent / singleHorn) * singleHorn;
  }

  function validateRehearsalSpent(tactic, input) {
    var raw = object(input);
    var row = findRank(tactic, clamp(integer(raw.rank, 0), 0, 15));
    var rehearsal = row && object(row.rehearsal);
    var singleHorn = rehearsal ? integer(rehearsal.singleHorn, 0) : 0;
    var maximum = actualMaximum(rehearsal);
    if (!singleHorn || !maximum) return [];

    var rawSpent = raw.rehearsalSpent == null ? 0 : raw.rehearsalSpent;
    var spent = Number(rawSpent);
    var blank = typeof rawSpent === "string" && rawSpent.trim() === "";
    if (blank || !Number.isFinite(spent) || Math.trunc(spent) !== spent ||
        spent < 0 || spent > maximum || spent % singleHorn !== 0) {
      return ["本阶已消耗号角必须为0至" + maximum + "的" + singleHorn + "的倍数"];
    }
    return [];
  }

  /**
   * 兼容历史本地数据：只保留已知字段，任何非法数值都会回落到安全范围。
   */
  function normalizeProgress(tactic, input) {
    var raw = object(input);
    var rank = clamp(integer(raw.rank, 0), 0, 15);
    var row = findRank(tactic, rank);
    var rehearsal = row && object(row.rehearsal);
    var rawMantras = object(raw.mantras);
    var mantras = {};

    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (!mantra || !mantra.id) return;
      var allowed = allowedMantraRank(tactic, mantra.id, rank);
      mantras[mantra.id] = clamp(integer(rawMantras[mantra.id], -1), -1, allowed);
    });

    return {
      rank: rank,
      rehearsalSpent: normalizeRehearsalSpent(rehearsal, raw.rehearsalSpent),
      mantras: mantras
    };
  }

  function changeRank(tactic, progress, nextRank) {
    var copy = normalizeProgress(tactic, progress);
    var rank = clamp(integer(nextRank, 0), 0, 15);
    copy.rank = rank;
    copy.rehearsalSpent = 0;
    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (!mantra || !mantra.id) return;
      copy.mantras[mantra.id] = Math.min(copy.mantras[mantra.id], allowedMantraRank(tactic, mantra.id, rank));
    });
    return copy;
  }

  function validateState(tactic, startInput, targetInput) {
    var start = normalizeProgress(tactic, startInput);
    var target = normalizeProgress(tactic, targetInput);
    var errors = validateRehearsalSpent(tactic, startInput);
    if (target.rank < start.rank) errors.push("目标兵法阶数不能低于当前阶数");
    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (!mantra || !mantra.id) return;
      if (target.mantras[mantra.id] < start.mantras[mantra.id]) {
        errors.push("真言“" + mantra.name + "”的目标阶数不能低于当前阶数");
      }
    });
    return errors;
  }

  function attributeSnapshot(tactic, stateInput) {
    var state = normalizeProgress(tactic, stateInput);
    var row = findRank(tactic, state.rank) || {};
    var attributes = [];

    function append(group, rows) {
      array(rows).forEach(function (attribute) {
        if (!attribute || !attribute.name) return;
        attributes.push({
          key: group + ":" + attribute.name + ":" + attribute.unit,
          group: group,
          name: attribute.name,
          value: attribute.value,
          unit: attribute.unit
        });
      });
    }

    append("base", row.baseAttributes);
    append("extra", row.extraAttributes);
    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (!mantra || state.mantras[mantra.id] < 0) return;
      var stage = findMantraStage(mantra, state.mantras[mantra.id]);
      if (!stage) return;
      attributes.push({
        key: "mantra:" + mantra.id,
        group: "mantra",
        name: mantra.attribute,
        value: stage.value,
        unit: mantra.unit,
        mantraName: mantra.name
      });
    });
    return attributes;
  }

  function mantraPlans(tactic, startMantras, targetMantras) {
    var plans = {};
    array(tactic && tactic.mantras).forEach(function (mantra) {
      if (!mantra || !mantra.id) return;
      var start = integer(object(startMantras)[mantra.id], -1);
      var target = integer(object(targetMantras)[mantra.id], -1);
      var steps = [];
      var fragments = 0;
      for (var rank = start + 1; rank <= target; rank++) {
        var stage = findMantraStage(mantra, rank);
        if (!stage) continue;
        var cost = integer(stage.fragments, 0);
        fragments += cost;
        steps.push({
          rank: stage.rank,
          tacticRank: stage.tacticRank,
          value: stage.value,
          fragments: cost
        });
      }
      plans[mantra.id] = {
        id: mantra.id,
        name: mantra.name,
        materialName: mantra.materialName,
        currentRank: start,
        targetRank: target,
        fragments: fragments,
        steps: steps
      };
    });
    return plans;
  }

  function rehearsalPlan(tactic, start, target) {
    var row = findRank(tactic, target.rank);
    var rehearsal = row && object(row.rehearsal);
    if (!rehearsal || !integer(rehearsal.singleHorn, 0) || !integer(rehearsal.guaranteeHorn, 0)) return null;

    var singleHorn = integer(rehearsal.singleHorn, 0);
    var guaranteeHorn = integer(rehearsal.guaranteeHorn, 0);
    var maximum = actualMaximum(rehearsal);
    var carriedSpent = start.rank === target.rank
      ? clamp(integer(start.rehearsalSpent, 0), 0, maximum)
      : 0;
    var remainingRuns = Math.ceil(Math.max(0, guaranteeHorn - carriedSpent) / singleHorn);

    return {
      rank: target.rank,
      proficiency: row.proficiency,
      singleHorn: singleHorn,
      guaranteeHorn: guaranteeHorn,
      actualMaximumHorn: maximum,
      carriedSpent: carriedSpent,
      remainingRuns: remainingRuns,
      actualAdditionalHorn: remainingRuns * singleHorn
    };
  }

  function attributeDeltas(tactic, start, target) {
    var startMap = {};
    attributeSnapshot(tactic, start).forEach(function (attribute) {
      startMap[attribute.key] = attribute;
    });
    var targetMap = {};
    attributeSnapshot(tactic, target).forEach(function (attribute) {
      targetMap[attribute.key] = attribute;
    });
    var keys = {};
    Object.keys(startMap).forEach(function (key) { keys[key] = true; });
    Object.keys(targetMap).forEach(function (key) { keys[key] = true; });

    return Object.keys(keys).map(function (key) {
      var before = startMap[key] || targetMap[key];
      var after = targetMap[key] || startMap[key];
      return {
        key: key,
        group: after.group,
        name: after.name,
        unit: after.unit,
        mantraName: after.mantraName,
        startValue: startMap[key] ? startMap[key].value : 0,
        targetValue: targetMap[key] ? targetMap[key].value : 0,
        delta: (targetMap[key] ? targetMap[key].value : 0) - (startMap[key] ? startMap[key].value : 0)
      };
    }).filter(function (item) {
      return item.delta !== 0;
    });
  }

  function calculatePlan(tactic, startInput, targetInput) {
    var errors = validateState(tactic, startInput, targetInput);
    if (errors.length) return { valid: false, errors: errors };
    var start = normalizeProgress(tactic, startInput);
    var target = normalizeProgress(tactic, targetInput);

    var steps = array(tactic && tactic.ranks).filter(function (row) {
      return row && row.rank > start.rank && row.rank <= target.rank;
    });
    var advance = steps.reduce(function (sum, row) {
      var cost = object(row.advance);
      sum.mark += integer(cost.mark, 0);
      sum.merit += integer(cost.merit, 0);
      sum.horn += integer(cost.horn, 0);
      sum.steps.push({ rank: row.rank, advance: row.advance });
      return sum;
    }, { mark: 0, merit: 0, horn: 0, steps: [] });

    return {
      valid: true,
      start: start,
      target: target,
      advance: advance,
      mantras: mantraPlans(tactic, start.mantras, target.mantras),
      rehearsal: rehearsalPlan(tactic, start, target),
      startAttributes: attributeSnapshot(tactic, start),
      targetAttributes: attributeSnapshot(tactic, target),
      attributeDeltas: attributeDeltas(tactic, start, target)
    };
  }

  return {
    defaultProgress: defaultProgress,
    allowedMantraRank: allowedMantraRank,
    actualMaximum: actualMaximum,
    validateRehearsalSpent: validateRehearsalSpent,
    normalizeProgress: normalizeProgress,
    changeRank: changeRank,
    validateState: validateState,
    attributeSnapshot: attributeSnapshot,
    calculatePlan: calculatePlan
  };
});
