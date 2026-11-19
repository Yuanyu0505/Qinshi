(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SIX_HALLS = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var STORE_KEY = "qinshi_six_halls_progress_v1";

  function parseInteger(value, minimum, maximum, allowEmpty) {
    var empty = value == null || (typeof value === "string" && value.trim() === "");
    if (empty) return { valid: Boolean(allowEmpty), value: null };
    if (typeof value !== "string" && typeof value !== "number") return { valid: false, value: null };
    var number = Number(value);
    var min = minimum === undefined ? 0 : minimum;
    var max = maximum === undefined ? Number.MAX_SAFE_INTEGER : maximum;
    return Number.isSafeInteger(number) && number >= min && number <= max
      ? { valid: true, value: number }
      : { valid: false, value: null };
  }

  function normalizeProgress(raw, data) {
    var source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    var sourceHalls = source.halls && typeof source.halls === "object" ? source.halls : {};
    var player = parseInteger(source.playerLevel, 0, Number.MAX_SAFE_INTEGER, true);
    var herbs = parseInteger(source.herbs, 0, Number.MAX_SAFE_INTEGER, false);
    var progress = { version: 1, playerLevel: player.valid ? player.value : null, herbs: herbs.valid ? herbs.value : 0, halls: {} };
    data.halls.forEach(function (hall) {
      var entry = sourceHalls[hall.id] || {};
      var level = parseInteger(entry.level, 0, data.maxLevel, false);
      var tokens = parseInteger(entry.tokens, 0, Number.MAX_SAFE_INTEGER, false);
      progress.halls[hall.id] = { level: level.valid ? level.value : 0, tokens: tokens.valid ? tokens.value : 0 };
    });
    return progress;
  }

  function defaultPlan(data, progress) {
    var targets = {};
    var cap = progress ? playerCap(progress.playerLevel, data) : null;
    data.halls.forEach(function (hall) {
      var current = progress && progress.halls[hall.id] ? progress.halls[hall.id].level : 0;
      targets[hall.id] = Math.max(current, cap === null ? data.maxLevel : cap);
    });
    return { selected: [], targets: targets };
  }

  function playerCap(playerLevel, data) {
    var parsed = parseInteger(playerLevel, 0, Number.MAX_SAFE_INTEGER, true);
    if (!parsed.valid || parsed.value === null) return null;
    var cap = data.maxLevel;
    data.milestones.some(function (milestone) {
      if (parsed.value < milestone.playerLevel) {
        cap = milestone.hallLevel - 1;
        return true;
      }
      return false;
    });
    return cap;
  }

  function calculateCost(from, to, data) {
    var start = parseInteger(from, 0, data.maxLevel, false);
    var end = parseInteger(to, 0, data.maxLevel, false);
    if (!start.valid || !end.valid || end.value < start.value) throw new RangeError("升级起点和目标必须为0至50级整数，且目标不能低于当前等级。");
    var steps = data.steps.filter(function (step) { return step.from >= start.value && step.to <= end.value; });
    if (steps.length !== end.value - start.value) throw new RangeError("升级资料不完整，无法计算该等级区间。");
    return steps.reduce(function (cost, step) {
      cost.herbs += step.herbs;
      cost.tokens += step.tokens;
      cost.steps.push(Object.assign({}, step));
      return cost;
    }, { herbs: 0, tokens: 0, steps: [] });
  }

  function referenceRows(data, from, to) {
    var cost = calculateCost(from === undefined ? 0 : from, to === undefined ? data.maxLevel : to, data);
    var herbs = 0;
    var tokens = 0;
    return cost.steps.map(function (step) {
      herbs += step.herbs;
      tokens += step.tokens;
      return Object.assign({}, step, { cumulativeHerbs: herbs, cumulativeTokens: tokens });
    });
  }

  function requiredPlayerLevel(target, data) {
    var required = null;
    data.milestones.forEach(function (milestone) {
      if (target >= milestone.hallLevel) required = milestone.playerLevel;
    });
    return required;
  }

  function targetLimitError(current, target, playerLevel, data) {
    var cap = playerCap(playerLevel, data);
    if (cap !== null && target > current && target > cap) {
      return "当前等级最大可升级至" + cap + "级六堂，无法升级至您指定的目标等级。";
    }
    return "";
  }

  function calculatePlan(rawProgress, draft, data) {
    var progress = normalizeProgress(rawProgress, data);
    var cap = playerCap(progress.playerLevel, data);
    var selected = draft && Array.isArray(draft.selected) ? Array.from(new Set(draft.selected)) : [];
    var targets = draft && draft.targets || {};
    var errors = [];
    var rows = [];
    var totalHerbs = 0;
    selected.forEach(function (id) {
      if (!data.halls.some(function (hall) { return hall.id === id; })) {
        errors.push({ hallId: id, message: "未识别的堂口，请重新选择。" });
      }
    });
    data.halls.forEach(function (hall) {
      if (selected.indexOf(hall.id) === -1) return;
      var current = progress.halls[hall.id];
      var target = parseInteger(targets[hall.id], current.level, data.maxLevel, false);
      if (!target.valid) {
        errors.push({ hallId: hall.id, message: hall.name + "目标必须为" + current.level + "至" + data.maxLevel + "级整数。" });
        return;
      }
      var limitError = targetLimitError(current.level, target.value, progress.playerLevel, data);
      if (limitError) {
        errors.push({ hallId: hall.id, message: hall.name + "：" + limitError });
        return;
      }
      var cost = calculateCost(current.level, target.value, data);
      totalHerbs += cost.herbs;
      rows.push({
        id: hall.id,
        name: hall.name,
        current: current.level,
        target: target.value,
        herbs: cost.herbs,
        tokens: cost.tokens,
        tokenStock: current.tokens,
        tokenMissing: Math.max(0, cost.tokens - current.tokens),
        tokenRemaining: Math.max(0, current.tokens - cost.tokens),
        requiredPlayerLevel: requiredPlayerLevel(target.value, data)
      });
    });
    return {
      valid: errors.length === 0,
      errors: errors,
      rows: errors.length ? [] : rows,
      herbs: errors.length ? null : {
        need: totalHerbs,
        stock: progress.herbs,
        missing: Math.max(0, totalHerbs - progress.herbs),
        remaining: Math.max(0, progress.herbs - totalHerbs)
      },
      playerCap: cap,
      playerLevelKnown: cap !== null,
      selectedCount: selected.length
    };
  }

  return {
    STORE_KEY: STORE_KEY,
    parseInteger: parseInteger,
    normalizeProgress: normalizeProgress,
    defaultPlan: defaultPlan,
    playerCap: playerCap,
    targetLimitError: targetLimitError,
    calculateCost: calculateCost,
    referenceRows: referenceRows,
    calculatePlan: calculatePlan
  };
});
