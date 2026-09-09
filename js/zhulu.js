(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ZHULU = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/伍德终始/g, "五德终始")
      .replace(/\s+/g, "");
  }

  function locateProgressRewards(rewards, query) {
    var items = (rewards || []).slice().sort(function (a, b) { return a.progress - b.progress; });
    var raw = String(query == null ? "" : query).trim();
    if (!raw) return { mode: "all", items: items, message: "" };

    if (/^\d+$/.test(raw)) {
      var progress = Number(raw);
      var exact = items.filter(function (item) { return item.progress === progress; });
      if (exact.length) return { mode: "progress", items: exact, message: "已定位 " + progress + " 进度奖励" };
      if (!items.length) return { mode: "progress", items: [], message: "暂无进度资料" };
      if (progress < items[0].progress) {
        return { mode: "progress", items: [items[0]], message: "低于首个奖励节点，已定位 " + items[0].progress + " 进度" };
      }
      if (progress > items[items.length - 1].progress) {
        return { mode: "progress", items: [items[items.length - 1]], message: "已超过现有资料上限，最高节点为 " + items[items.length - 1].progress + " 进度" };
      }
      var lower = null;
      var upper = null;
      items.some(function (item) {
        if (item.progress < progress) lower = item;
        if (item.progress > progress) {
          upper = item;
          return true;
        }
        return false;
      });
      return {
        mode: "progress",
        items: [lower, upper].filter(Boolean),
        message: "当前进度位于 " + lower.progress + " 与 " + upper.progress + " 两个奖励节点之间"
      };
    }

    var needle = normalizeText(raw);
    var matches = items.filter(function (item) { return normalizeText(item.item).indexOf(needle) !== -1; });
    return { mode: "item", items: matches, message: matches.length ? "找到 " + matches.length + " 个奖励节点" : "未找到匹配的奖励" };
  }

  function serialMonth(year, month) {
    return Number(year) * 12 + Number(month) - 1;
  }

  function fromSerial(serial) {
    return { year: Math.floor(serial / 12), month: serial % 12 + 1 };
  }

  function seasonKey(season) {
    return season.year + "-" + String(season.month).padStart(2, "0");
  }

  function explicitSeason(data, year, month) {
    return (data.seasons || []).find(function (season) {
      return season.year === Number(year) && season.month === Number(month);
    }) || null;
  }

  function predictSeason(data, year, month) {
    year = Number(year);
    month = Number(month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    if (explicitSeason(data, year, month)) return null;
    var lastParts = String(data.meta && data.meta.lastSeason || "2026-12").split("-").map(Number);
    if (serialMonth(year, month) <= serialMonth(lastParts[0], lastParts[1])) return null;

    var anchorParts = String(data.meta && data.meta.predictionAnchor || "2024-03").split("-").map(Number);
    var cycleLength = Number(data.meta && data.meta.predictionCycleLength) || 10;
    var anchorSerial = serialMonth(anchorParts[0], anchorParts[1]);
    var offset = ((serialMonth(year, month) - anchorSerial) % cycleLength + cycleLength) % cycleLength;
    var templateDate = fromSerial(anchorSerial + offset);
    var template = explicitSeason(data, templateDate.year, templateDate.month);
    if (!template) return null;
    return {
      year: year,
      month: month,
      rewards: Object.assign({}, template.rewards),
      predicted: true
    };
  }

  function defaultPredictionMonths(data, now, count) {
    var date = now instanceof Date ? now : new Date();
    var start = serialMonth(date.getFullYear(), date.getMonth() + 1);
    var result = [];
    for (var index = 1; index <= Number(count || 12); index += 1) {
      var target = fromSerial(start + index);
      var predicted = predictSeason(data, target.year, target.month);
      if (predicted) result.push(predicted);
    }
    return result;
  }

  function rewardEntries(data, season) {
    return (data.seasonTiers || []).map(function (tier) {
      return {
        progress: tier.progress,
        quality: tier.quality,
        yuanbao: tier.yuanbao,
        book: season.rewards[tier.progress]
      };
    });
  }

  function matchesSeason(data, season, filters) {
    var year = filters.year == null || filters.year === "" ? null : Number(filters.year);
    var month = filters.month == null || filters.month === "" ? null : Number(filters.month);
    if (year !== null && season.year !== year) return null;
    if (month !== null && season.month !== month) return null;
    var needle = normalizeText(filters.query);
    var quality = filters.quality || null;
    var progress = filters.progress == null || filters.progress === "" ? null : Number(filters.progress);
    var matches = rewardEntries(data, season).filter(function (entry) {
      if (needle && normalizeText(entry.book).indexOf(needle) === -1) return false;
      if (quality && entry.quality !== quality) return false;
      if (progress !== null && entry.progress !== progress) return false;
      return true;
    });
    return matches.length ? Object.assign({}, season, { matches: matches }) : null;
  }

  function requestedPredictionMonths(data, filters, now) {
    var year = filters.year == null || filters.year === "" ? null : Number(filters.year);
    var month = filters.month == null || filters.month === "" ? null : Number(filters.month);
    if (year !== null && month !== null) {
      var one = predictSeason(data, year, month);
      return one ? [one] : [];
    }
    if (year !== null) {
      var yearItems = [];
      for (var value = 1; value <= 12; value += 1) {
        var item = predictSeason(data, year, value);
        if (item) yearItems.push(item);
      }
      return yearItems;
    }
    return defaultPredictionMonths(data, now, 12);
  }

  function sortSeasonsDescending(items) {
    return items.sort(function (a, b) { return serialMonth(b.year, b.month) - serialMonth(a.year, a.month); });
  }

  function querySeasons(data, filters, now) {
    filters = filters || {};
    var explicit = (data.seasons || []).map(function (season) {
      return matchesSeason(data, season, filters);
    }).filter(Boolean);
    var predicted = requestedPredictionMonths(data, filters, now).map(function (season) {
      return matchesSeason(data, season, filters);
    }).filter(Boolean);
    return {
      explicit: sortSeasonsDescending(explicit),
      predicted: sortSeasonsDescending(predicted)
    };
  }

  function groupDefaultSeasons(data, now) {
    var date = now instanceof Date ? now : new Date();
    var currentSerial = serialMonth(date.getFullYear(), date.getMonth() + 1);
    var current = [];
    var upcoming = [];
    var history = [];
    (data.seasons || []).forEach(function (season) {
      var enriched = Object.assign({}, season, { matches: rewardEntries(data, season) });
      var value = serialMonth(season.year, season.month);
      if (value === currentSerial) current.push(enriched);
      else if (value > currentSerial) upcoming.push(enriched);
      else history.push(enriched);
    });
    if (!current.length) {
      var predictedCurrent = predictSeason(data, date.getFullYear(), date.getMonth() + 1);
      if (predictedCurrent) current.push(Object.assign({}, predictedCurrent, { matches: rewardEntries(data, predictedCurrent) }));
    }
    return {
      current: current,
      upcoming: upcoming.sort(function (a, b) { return serialMonth(a.year, a.month) - serialMonth(b.year, b.month); }),
      history: sortSeasonsDescending(history),
      predicted: defaultPredictionMonths(data, date, 12).map(function (season) {
        return Object.assign({}, season, { matches: rewardEntries(data, season) });
      })
    };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    return Object.keys(value).sort().reduce(function (result, key) {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }

  function fingerprint(value) {
    return JSON.stringify(stableValue(value));
  }

  function createJumpSession(target, zhuluView, targetView, appliedTargetView) {
    return {
      target: target,
      zhuluView: stableValue(zhuluView || {}),
      targetView: stableValue(targetView || {}),
      appliedFingerprint: fingerprint(appliedTargetView || {})
    };
  }

  function shouldRestoreJumpTarget(session, currentTargetView) {
    return Boolean(session && session.appliedFingerprint === fingerprint(currentTargetView || {}));
  }

  return {
    normalizeText: normalizeText,
    locateProgressRewards: locateProgressRewards,
    serialMonth: serialMonth,
    seasonKey: seasonKey,
    predictSeason: predictSeason,
    defaultPredictionMonths: defaultPredictionMonths,
    querySeasons: querySeasons,
    groupDefaultSeasons: groupDefaultSeasons,
    createJumpSession: createJumpSession,
    shouldRestoreJumpTarget: shouldRestoreJumpTarget
  };
});
