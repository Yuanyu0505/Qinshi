(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FORBIDDEN = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ATTRIBUTE_QUERIES = { "攻": true, "血": true, "内": true, "内力": true, "防": true };
  var SECTION_ORDER = ["contribution5", "contribution10", "rank1", "rank2", "rank3to10", "equipmentFragments", "machineBeasts", "nuclei", "orangeDrops"];
  var BEAST_NAMES = {
    "王蛇": "赤练王蛇",
    "玄武": "机关玄武",
    "朱雀": "机关朱雀",
    "白虎": "机关白虎",
    "青龙": "机关青龙",
    "元兽": "机关元兽",
    "神龙": "机关神龙",
    "年兽": "机关年兽",
    "铜人": "机关铜人",
    "三郎": "破土三郎",
    "零号": "零号白虎",
    "九头": "九头勾玉",
    "南瓜": "南瓜怪人"
  };

  function normalize(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/\s+/g, "").replace(/[—–－~～]/g, "-");
  }

  function unique(items) {
    var seen = {};
    return (items || []).filter(function (item) {
      var key = normalize(item);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function uniqueRows(rows) {
    return (rows || []).map(function (row) { return unique(row); });
  }

  function flattenRows(rows) {
    return unique([].concat.apply([], rows || []));
  }

  function canonicalBeasts(items) {
    return unique((items || []).map(function (item) { return BEAST_NAMES[item] || item; }));
  }

  function resolveTemplate(data, occurrence) {
    var source = data && data.templates ? data.templates[occurrence.templateId] : null;
    if (!source) return null;
    var rows = source.rankingRows || [[], [], []];
    var rank1Rows = uniqueRows([rows[0] || [], rows[1] || []]);
    var rank2Rows = uniqueRows([rows[1] || [], rows[2] || []]);
    var rank3to10Rows = uniqueRows([rows[2] || []]);
    var equipmentFragmentRows = uniqueRows(source.equipmentFragmentRows || [source.equipmentFragments || []]);
    return {
      contribution5: unique(source.contribution && source.contribution["5W"]),
      contribution10: unique(source.contribution && source.contribution["10W"]),
      rank1: flattenRows(rank1Rows),
      rank2: flattenRows(rank2Rows),
      rank3to10: flattenRows(rank3to10Rows),
      rank1Rows: rank1Rows,
      rank2Rows: rank2Rows,
      rank3to10Rows: rank3to10Rows,
      equipmentFragments: flattenRows(equipmentFragmentRows),
      equipmentFragmentRows: equipmentFragmentRows,
      machineBeasts: canonicalBeasts(source.machineBeasts),
      nuclei: canonicalBeasts(source.nuclei),
      orangeDrops: unique(source.orangeDrops)
    };
  }

  function shouldToggleToken(start, end, selectionText) {
    if (String(selectionText || "").trim()) return false;
    if (!start || !end) return true;
    var dx = Number(end.x) - Number(start.x);
    var dy = Number(end.y) - Number(start.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return true;
    return Math.sqrt(dx * dx + dy * dy) <= 6;
  }

  function parseLocalDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    var parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(function (n) { return !Number.isFinite(n); })) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function statusFor(occurrence, today) {
    var day = parseLocalDate(today || new Date());
    var start = parseLocalDate(occurrence.start);
    var end = parseLocalDate(occurrence.end);
    if (!day || !start || !end) return "unknown";
    if (day < start) return "future";
    if (day > end) return "history";
    return "current";
  }

  function compareByStatus(a, b, today) {
    var ranks = { current: 0, future: 1, history: 2, unknown: 3 };
    var aStatus = statusFor(a, today);
    var bStatus = statusFor(b, today);
    var difference = ranks[aStatus] - ranks[bStatus];
    if (difference) return difference;
    if (aStatus === "history") return b.start.localeCompare(a.start);
    return a.start.localeCompare(b.start);
  }

  function getDefaultView(occurrences, today) {
    var list = (occurrences || []).slice().sort(function (a, b) { return a.start.localeCompare(b.start); });
    var current = list.find(function (item) { return statusFor(item, today) === "current"; }) || null;
    var future = list.filter(function (item) { return statusFor(item, today) === "future"; });
    var history = list.filter(function (item) { return statusFor(item, today) === "history"; });
    return {
      current: current,
      next: future.length ? future[0] : null,
      latestHistory: history.length ? history[history.length - 1] : null,
      beforeSchedule: !current && !history.length && Boolean(future.length),
      afterSchedule: !current && !future.length && Boolean(history.length)
    };
  }

  function dateAliases(occurrence) {
    var start = parseLocalDate(occurrence.start);
    var end = parseLocalDate(occurrence.end);
    if (!start || !end) return [];
    var sm = start.getMonth() + 1;
    var sd = start.getDate();
    var em = end.getMonth() + 1;
    var ed = end.getDate();
    return unique([
      occurrence.start,
      occurrence.end,
      sm + "." + sd,
      sm + "月" + sd + "日",
      em + "." + ed,
      em + "月" + ed + "日",
      sm + "." + sd + "-" + em + "." + ed,
      sm === em ? sm + "." + sd + "-" + ed : "",
      sm + "月" + sd + "日-" + em + "月" + ed + "日"
    ]);
  }

  function discipleText(disciple) {
    var parts = [disciple.name];
    if (disciple.base) parts.push("本体" + disciple.base, disciple.base === "内" ? "内力" : disciple.base);
    if (disciple.divine) parts.push("神" + disciple.divine, disciple.divine === "内" ? "内力" : disciple.divine);
    return parts.join(" ");
  }

  function findMatches(data, occurrence, query) {
    var q = normalize(query);
    if (!q) return [];
    var matches = [];
    var attributesOnly = Boolean(ATTRIBUTE_QUERIES[q]);
    var discipleMatch = (occurrence.disciples || []).some(function (disciple) {
      if (attributesOnly) {
        var target = q === "内力" ? "内" : q;
        return disciple.base === target || disciple.divine === target;
      }
      return normalize(discipleText(disciple)).indexOf(q) !== -1;
    });
    if (discipleMatch) matches.push("disciples");
    if (attributesOnly) return matches;

    if (dateAliases(occurrence).some(function (text) { return normalize(text).indexOf(q) !== -1; }) ||
        normalize(occurrence.size + "禁地").indexOf(q) !== -1) {
      matches.push("meta");
    }
    var resolved = resolveTemplate(data, occurrence);
    if (!resolved) return matches;
    SECTION_ORDER.forEach(function (key) {
      var matched = resolved[key].some(function (item) {
        var text = key === "equipmentFragments" ? item + "碎片" : item;
        return normalize(text).indexOf(q) !== -1 || normalize(item).indexOf(q) !== -1;
      });
      if (matched) matches.push(key);
    });
    return unique(matches);
  }

  function normalizeNeeds(raw, data) {
    var source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    var validIds = {};
    (data && data.occurrences || []).forEach(function (item) { validIds[item.id] = true; });
    var cleaned = {};
    Object.keys(source).forEach(function (id) {
      var entry = source[id];
      if (!entry || typeof entry !== "object") return;
      var disciples = unique(Array.isArray(entry.disciples) ? entry.disciples : []);
      var items = unique(Array.isArray(entry.items) ? entry.items : []);
      if (disciples.length || items.length || !validIds[id]) cleaned[id] = { disciples: disciples, items: items };
    });
    return cleaned;
  }

  function eventNeeds(needs, id) {
    var entry = needs && needs[id];
    return {
      disciples: unique(entry && entry.disciples),
      items: unique(entry && entry.items)
    };
  }

  function hasNeeds(needs, id) {
    var entry = eventNeeds(needs, id);
    return Boolean(entry.disciples.length || entry.items.length);
  }

  function filterOccurrences(data, options) {
    var opts = options || {};
    var query = normalize(opts.query);
    return (data && data.occurrences || []).filter(function (occurrence) {
      if (opts.size && occurrence.size !== opts.size) return false;
      if (opts.selectedOnly && !hasNeeds(opts.needs, occurrence.id)) return false;
      return !query || findMatches(data, occurrence, query).length > 0;
    }).map(function (occurrence) {
      return { occurrence: occurrence, matches: query ? findMatches(data, occurrence, query) : [] };
    }).sort(function (a, b) { return compareByStatus(a.occurrence, b.occurrence, opts.today); });
  }

  return {
    SECTION_ORDER: SECTION_ORDER,
    normalize: normalize,
    unique: unique,
    resolveTemplate: resolveTemplate,
    shouldToggleToken: shouldToggleToken,
    statusFor: statusFor,
    compareByStatus: compareByStatus,
    getDefaultView: getDefaultView,
    dateAliases: dateAliases,
    discipleText: discipleText,
    findMatches: findMatches,
    normalizeNeeds: normalizeNeeds,
    eventNeeds: eventNeeds,
    hasNeeds: hasNeeds,
    filterOccurrences: filterOccurrences
  };
});
