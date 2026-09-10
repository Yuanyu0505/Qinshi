(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FORBIDDEN = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ATTRIBUTE_QUERIES = { "攻": true, "血": true, "内": true, "内力": true, "防": true };
  var SECTION_ORDER = ["contribution5", "contribution10", "rank1", "rank2", "rank3to10", "equipmentFragments", "machineBeasts", "nuclei", "orangeDrops"];
  var PURPOSES = ["atlas", "forging", "machine-lineup", "machine-modification"];
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
  var templateCacheData = null;
  var templateCache = {};

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

  function correctedRewardName(value) {
    var name = String(value == null ? "" : value).trim();
    return name.replace(/^共工戟(?=碎片$|$)/, "共工戒");
  }

  function resolveTemplate(data, occurrence) {
    if (templateCacheData !== data) {
      templateCacheData = data;
      templateCache = {};
    }
    var templateId = occurrence && occurrence.templateId;
    if (Object.prototype.hasOwnProperty.call(templateCache, templateId)) return templateCache[templateId];
    var source = data && data.templates ? data.templates[occurrence.templateId] : null;
    if (!source) return null;
    var rows = source.rankingRows || [[], [], []];
    var rank1Rows = uniqueRows([rows[0] || [], rows[1] || []]);
    var rank2Rows = uniqueRows([rows[1] || [], rows[2] || []]);
    var rank3to10Rows = uniqueRows([rows[2] || []]);
    var equipmentFragmentRows = uniqueRows(source.equipmentFragmentRows || [source.equipmentFragments || []]);
    var resolved = {
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
    templateCache[templateId] = resolved;
    return resolved;
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

  function clearHistoricalNeeds(needs, occurrences, today) {
    if (!needs || needs.version !== 2 || !needs.events || typeof needs.events !== "object") return [];
    var occurrenceById = {};
    (occurrences || []).forEach(function (occurrence) {
      if (occurrence && occurrence.id) occurrenceById[occurrence.id] = occurrence;
    });
    var removed = [];
    Object.keys(needs.events).forEach(function (eventId) {
      var occurrence = occurrenceById[eventId];
      if (occurrence && statusFor(occurrence, today) === "history") {
        delete needs.events[eventId];
        removed.push(eventId);
      }
    });
    return removed;
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

  function rewardCategory(sectionKey) {
    if (sectionKey === "machineBeasts") return "machine-beast";
    if (sectionKey === "nuclei") return "nucleus";
    return "equipment";
  }

  function allowedPurposes(category) {
    if (category === "machine-beast") return ["machine-lineup"];
    if (category === "nucleus") return ["machine-modification"];
    return ["atlas", "forging"];
  }

  function cleanPurposes(values, category) {
    var allowed = allowedPurposes(category);
    var migrated = (Array.isArray(values) ? values : []).map(function (purpose) {
      if (purpose !== "machine-beasts") return purpose;
      if (category === "machine-beast") return "machine-lineup";
      if (category === "nucleus") return "machine-modification";
      return "";
    });
    return unique(migrated).filter(function (purpose) {
      return PURPOSES.indexOf(purpose) !== -1 && allowed.indexOf(purpose) !== -1;
    });
  }

  function machineBeastTarget(name) {
    var value = String(name == null ? "" : name).trim().replace(/(?:碎片|神核)$/, "");
    return BEAST_NAMES[value] || value;
  }

  function rewardDisplayName(sectionKey, name) {
    var raw = correctedRewardName(name);
    if (sectionKey === "equipmentFragments") return /碎片$/.test(raw) ? raw : raw + "碎片";
    if (sectionKey === "machineBeasts") return machineBeastTarget(raw) + "碎片";
    if (sectionKey === "nuclei") return machineBeastTarget(raw) + "神核";
    return raw;
  }

  function defaultPurposes(category) {
    if (category === "machine-beast") return ["machine-lineup"];
    if (category === "nucleus") return ["machine-modification"];
    return [];
  }

  function rewardIdentity(sectionKey, rawName, resolvedFamilyKey) {
    var raw = correctedRewardName(rawName);
    var category = rewardCategory(sectionKey);
    var displayName = rewardDisplayName(sectionKey, raw);
    var baseName = category === "equipment" ? displayName.replace(/碎片$/, "") : machineBeastTarget(raw);
    var familyKey = category === "equipment"
      ? String(resolvedFamilyKey || baseName).trim()
      : category + ":" + machineBeastTarget(raw);
    return {
      key: category + ":" + normalize(displayName),
      name: displayName,
      rawName: category === "equipment" ? raw : baseName,
      baseName: baseName,
      sectionKey: sectionKey,
      category: category,
      familyKey: familyKey
    };
  }

  function occurrenceRewardIdentities(data, occurrence) {
    var resolved = resolveTemplate(data, occurrence);
    if (!resolved) return [];
    var identities = [];
    SECTION_ORDER.forEach(function (sectionKey) {
      (resolved[sectionKey] || []).forEach(function (name) {
        identities.push(rewardIdentity(sectionKey, name));
      });
    });
    var seen = {};
    return identities.filter(function (identity) {
      if (seen[identity.key]) return false;
      seen[identity.key] = true;
      return true;
    });
  }

  function discipleAtlasTargets(data, name) {
    var mappings = data && data.discipleAtlasTargets || {};
    return unique(Array.isArray(mappings[name]) ? mappings[name] : []);
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
        var text = rewardDisplayName(key, item);
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

  function emptyNeedsV2() {
    return { version: 2, events: {} };
  }

  function normalizeRewardRecord(key, record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    var category = ["equipment", "machine-beast", "nucleus"].indexOf(record.category) !== -1
      ? record.category
      : "equipment";
    var storedName = correctedRewardName(record.name);
    if (!storedName) return null;
    var sectionKey = category === "machine-beast"
      ? "machineBeasts"
      : category === "nucleus"
        ? "nuclei"
        : String(record.sectionKey || "");
    var rawName = correctedRewardName(record.rawName == null ? storedName : record.rawName);
    if (category === "machine-beast" || category === "nucleus") {
      rawName = machineBeastTarget(rawName);
      var machineName = rewardDisplayName(sectionKey, rawName);
      return {
        name: machineName,
        rawName: rawName,
        baseName: rawName,
        sectionKey: sectionKey,
        category: category,
        familyKey: category + ":" + rawName,
        purposes: cleanPurposes(record.purposes, category),
        key: category + ":" + normalize(machineName)
      };
    }
    return {
      name: storedName,
      rawName: rawName,
      baseName: correctedRewardName(record.baseName == null ? storedName.replace(/碎片$/, "") : record.baseName),
      sectionKey: sectionKey,
      category: category,
      familyKey: correctedRewardName(record.familyKey || storedName.replace(/碎片$/, "")),
      purposes: cleanPurposes(record.purposes, category),
      key: category + ":" + normalize(storedName)
    };
  }

  function normalizeNeedsV2(rawV2, rawV1, data) {
    var source = rawV2 && typeof rawV2 === "object" && !Array.isArray(rawV2) ? rawV2 : null;
    var sourceEvents = source && source.events && typeof source.events === "object" && !Array.isArray(source.events)
      ? source.events
      : null;
    var result = emptyNeedsV2();
    if (sourceEvents) {
      Object.keys(sourceEvents).forEach(function (eventId) {
        var event = sourceEvents[eventId];
        if (!event || typeof event !== "object" || Array.isArray(event)) return;
        var disciples = unique(Array.isArray(event.disciples) ? event.disciples : []);
        var rewards = {};
        var sourceRewards = event.rewards && typeof event.rewards === "object" && !Array.isArray(event.rewards)
          ? event.rewards
          : {};
        Object.keys(sourceRewards).forEach(function (key) {
          var normalized = normalizeRewardRecord(key, sourceRewards[key]);
          if (normalized) rewards[normalized.key] = normalized;
        });
        if (disciples.length || Object.keys(rewards).length) {
          result.events[eventId] = { disciples: disciples, rewards: rewards };
        }
      });
      return result;
    }

    var legacy = normalizeNeeds(rawV1, data);
    Object.keys(legacy).forEach(function (eventId) {
      var occurrence = (data && data.occurrences || []).find(function (item) { return item.id === eventId; });
      var available = occurrence ? occurrenceRewardIdentities(data, occurrence) : [];
      var rewards = {};
      legacy[eventId].items.forEach(function (legacyName) {
        var matched = available.filter(function (identity) {
          return normalize(identity.name) === normalize(legacyName) || normalize(identity.rawName) === normalize(legacyName);
        });
        if (!matched.length) matched = [rewardIdentity("legacy", legacyName)];
        matched.forEach(function (identity) {
          rewards[identity.key] = Object.assign({}, identity, { purposes: [] });
        });
      });
      if (legacy[eventId].disciples.length || Object.keys(rewards).length) {
        result.events[eventId] = { disciples: legacy[eventId].disciples.slice(), rewards: rewards };
      }
    });
    return result;
  }

  function ensureEvent(needs, eventId) {
    if (!needs.events) needs.events = {};
    if (!needs.events[eventId]) needs.events[eventId] = { disciples: [], rewards: {} };
    if (!Array.isArray(needs.events[eventId].disciples)) needs.events[eventId].disciples = [];
    if (!needs.events[eventId].rewards || typeof needs.events[eventId].rewards !== "object") needs.events[eventId].rewards = {};
    return needs.events[eventId];
  }

  function cleanupEvent(needs, eventId) {
    var event = needs.events && needs.events[eventId];
    if (event && !event.disciples.length && !Object.keys(event.rewards).length) delete needs.events[eventId];
  }

  function setDiscipleSelection(needs, eventId, name, selected) {
    var event = ensureEvent(needs, eventId);
    var next = event.disciples.filter(function (item) { return normalize(item) !== normalize(name); });
    if (selected) next.push(name);
    event.disciples = unique(next);
    cleanupEvent(needs, eventId);
    return needs;
  }

  function setRewardSelection(needs, eventId, identity, selected, purposes) {
    var event = ensureEvent(needs, eventId);
    if (!selected) {
      delete event.rewards[identity.key];
      cleanupEvent(needs, eventId);
      return needs;
    }
    event.rewards[identity.key] = Object.assign({}, identity, {
      purposes: cleanPurposes(purposes, identity.category)
    });
    return needs;
  }

  function applyFamilyChange(needs, data, identity, change) {
    (data && data.occurrences || []).forEach(function (occurrence) {
      occurrenceRewardIdentities(data, occurrence).forEach(function (candidate) {
        if (candidate.familyKey !== identity.familyKey) return;
        setRewardSelection(needs, occurrence.id, candidate, change.selected !== false, change.purposes || []);
      });
    });
    return needs;
  }

  function eventNeeds(needs, id) {
    if (needs && needs.version === 2) {
      var current = needs.events && needs.events[id];
      var rewards = current && current.rewards && typeof current.rewards === "object" ? current.rewards : {};
      return {
        disciples: unique(current && current.disciples),
        rewards: rewards,
        items: Object.keys(rewards).map(function (key) { return rewards[key].name; })
      };
    }
    var entry = needs && needs[id];
    return {
      disciples: unique(entry && entry.disciples),
      items: unique(entry && entry.items),
      rewards: {}
    };
  }

  function hasNeeds(needs, id) {
    var entry = eventNeeds(needs, id);
    return Boolean(entry.disciples.length || entry.items.length);
  }

  function matchesPurpose(needs, id, purpose) {
    if (!purpose) return true;
    var rewards = eventNeeds(needs, id).rewards;
    return Object.keys(rewards).some(function (key) {
      var purposes = cleanPurposes(rewards[key].purposes, rewards[key].category);
      return purpose === "unclassified" ? purposes.length === 0 : purposes.indexOf(purpose) !== -1;
    });
  }

  function filterOccurrences(data, options) {
    var opts = options || {};
    var query = normalize(opts.query);
    return (data && data.occurrences || []).reduce(function (results, occurrence) {
      if (opts.size && occurrence.size !== opts.size) return results;
      if (opts.selectedOnly && !hasNeeds(opts.needs, occurrence.id)) return results;
      if (opts.purpose && !matchesPurpose(opts.needs, occurrence.id, opts.purpose)) return results;
      var matches = query ? findMatches(data, occurrence, query) : [];
      if (query && !matches.length) return results;
      results.push({ occurrence: occurrence, matches: matches });
      return results;
    }, []).sort(function (a, b) { return compareByStatus(a.occurrence, b.occurrence, opts.today); });
  }

  return {
    SECTION_ORDER: SECTION_ORDER,
    PURPOSES: PURPOSES,
    normalize: normalize,
    unique: unique,
    resolveTemplate: resolveTemplate,
    shouldToggleToken: shouldToggleToken,
    statusFor: statusFor,
    compareByStatus: compareByStatus,
    getDefaultView: getDefaultView,
    clearHistoricalNeeds: clearHistoricalNeeds,
    dateAliases: dateAliases,
    discipleText: discipleText,
    discipleAtlasTargets: discipleAtlasTargets,
    machineBeastTarget: machineBeastTarget,
    rewardDisplayName: rewardDisplayName,
    defaultPurposes: defaultPurposes,
    rewardIdentity: rewardIdentity,
    occurrenceRewardIdentities: occurrenceRewardIdentities,
    allowedPurposes: allowedPurposes,
    cleanPurposes: cleanPurposes,
    findMatches: findMatches,
    normalizeNeeds: normalizeNeeds,
    normalizeNeedsV2: normalizeNeedsV2,
    setDiscipleSelection: setDiscipleSelection,
    setRewardSelection: setRewardSelection,
    applyFamilyChange: applyFamilyChange,
    eventNeeds: eventNeeds,
    hasNeeds: hasNeeds,
    matchesPurpose: matchesPurpose,
    filterOccurrences: filterOccurrences
  };
});
