/**
 * 橙装锻造 · 个人进度核心（纯逻辑，无 DOM 依赖）
 * 浏览器暴露 window.PROGRESS；Node 中通过 require 使用（UMD）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PROGRESS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CAT_ORDER = ["武器", "盔甲", "首饰", "典籍"];
  var PROGRESS_STORE_VERSION = 2;
  var QUALITY_LIMITS = { orange: 6, red: 11 };
  var nameIndexes = new WeakMap();
  var catalogIndexes = new WeakMap();

  // Validate the small metadata snapshot once at each public query boundary.
  // Mutating a row/alias or replacing an array must never leave a stale index.
  function nameIndex(items) {
    var rows = Array.isArray(items) ? items : [];
    var names = rows.map(function (row) { return row.name; });
    var cached = nameIndexes.get(rows);
    if (cached && names.length === cached.names.length && rows.every(function (row, i) {
      return row === cached.rows[i] && names[i] === cached.names[i];
    })) return cached.index;
    var index = new Map();
    rows.forEach(function (row, i) { if (!index.has(names[i])) index.set(names[i], row); });
    nameIndexes.set(rows, { rows: rows.slice(), names: names, index: index });
    return index;
  }

  function catalogIndex(catalog) {
    var entries = Array.isArray(catalog) ? catalog : [];
    var snapshots = entries.map(function (entry) {
      return [entry.forgeName, entry.equipmentName, entry.preferred, (entry.aliases || []).slice()];
    });
    var signature = JSON.stringify(snapshots);
    var cached = catalogIndexes.get(entries);
    if (cached && cached.signature === signature && entries.every(function (entry, i) { return entry === cached.entries[i]; })) return cached.index;
    var index = { equipment: new Map(), names: new Map(), families: new Map(), forge: new Map() };
    function add(map, key, entry) {
      if (!map.has(key)) map.set(key, []);
      if (map.get(key).indexOf(entry) === -1) map.get(key).push(entry);
    }
    entries.forEach(function (entry, i) {
      var snapshot = snapshots[i];
      add(index.equipment, snapshot[1], entry);
      if (!index.forge.has(snapshot[0])) index.forge.set(snapshot[0], entry);
      [snapshot[0], snapshot[1]].concat(snapshot[3]).forEach(function (name) {
        add(index.names, name, entry);
        add(index.families, normalizeSearch(name), snapshot[0]);
      });
    });
    catalogIndexes.set(entries, { entries: entries.slice(), signature: signature, index: index });
    return index;
  }

  function normalizeSearch(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function findItem(data, name, index) {
    var items = data && data.items;
    if (!items) return null;
    return (index || nameIndex(items)).get(name) || null;
  }

  /** progress = 已完成阶段数（0..stages.length）；返回剩余阶段（含下一阶段） */
  function qualityStageLimit(quality) {
    return quality === "orange" ? QUALITY_LIMITS.orange : QUALITY_LIMITS.red;
  }

  function remainingStages(item, progress, quality) {
    if (!item || !item.stages) return [];
    var limit = Math.min(item.stages.length, qualityStageLimit(quality));
    var p = Math.max(0, Math.min(progress | 0, limit));
    return item.stages.slice(p, limit);
  }

  function nextStage(item, progress, quality) {
    var rem = remainingStages(item, progress, quality);
    return rem.length ? rem[0] : null;
  }

  function convertQuality(progressItem, nextQuality) {
    var quality = nextQuality === "orange" ? "orange" : "red";
    return Object.assign({}, progressItem, {
      quality: quality,
      progress: Math.min(Math.max(0, progressItem.progress | 0), qualityStageLimit(quality))
    });
  }

  function requiresQualityDowngradeConfirmation(progressItem, nextQuality) {
    return Boolean(progressItem && progressItem.quality === "red" && nextQuality === "orange" &&
      (progressItem.progress | 0) > QUALITY_LIMITS.orange);
  }

  function progressStatus(progressItem) {
    var quality = progressItem && progressItem.quality === "orange" ? "orange" : "red";
    var limit = qualityStageLimit(quality);
    var progress = Math.max(0, Math.min(progressItem && progressItem.progress | 0, limit));
    return {
      label: progress >= limit ? "满锻" : progress + "锻",
      tier: progress >= limit ? quality + "-gold" : quality
    };
  }

  function catalogMatch(catalog, item, legacy, lookup) {
    var index = lookup || catalogIndex(catalog);
    if (!legacy && item && item.equipmentName) {
      var exact = (index.equipment.get(item.equipmentName) || []).find(function (entry) {
        return !item.forgeName || entry.forgeName === item.forgeName;
      });
      if (exact) return exact;
    }
    var name = String(item && (item.name || item.equipmentName || item.forgeName) || "");
    if (legacy && name === "鬼谷子") {
      var divineGhost = index.forge.get("神兵鬼谷子");
      if (divineGhost) return divineGhost;
    }
    var matches = index.names.get(name) || [];
    return matches.find(function (entry) { return entry.preferred; }) || matches[0] || null;
  }

  function normalizeProgressStore(raw, catalog, forgingItems) {
    var source = raw && typeof raw === "object" ? raw : {};
    var legacy = source.version !== PROGRESS_STORE_VERSION;
    var forgeRows = Array.isArray(forgingItems) ? forgingItems : [];
    var forgeLookup = nameIndex(forgeRows);
    var catalogLookup = catalogIndex(catalog);
    var disciples = (Array.isArray(source.disciples) ? source.disciples : []).map(function (disciple) {
      return {
        id: String(disciple && disciple.id || ""),
        name: String(disciple && disciple.name || "弟子"),
        items: (Array.isArray(disciple && disciple.items) ? disciple.items : []).map(function (progressItem) {
          var option = catalogMatch(catalog, progressItem, legacy, catalogLookup);
          var fallbackName = String(progressItem && (progressItem.forgeName || progressItem.name) || "");
          var forgeName = option ? option.forgeName : fallbackName;
          var forgeItem = forgeLookup.get(forgeName);
          var quality = legacy ? "red" : (progressItem.quality === "orange" ? "orange" : "red");
          return {
            id: String(progressItem && progressItem.id || ""),
            forgeName: forgeName,
            equipmentName: option ? option.equipmentName : String(progressItem && (progressItem.equipmentName || progressItem.name) || forgeName),
            equipmentId: option ? option.equipmentId : null,
            cat: option ? option.cat : String(progressItem && progressItem.cat || forgeItem && forgeItem.cat || ""),
            quality: quality,
            progress: Math.max(0, Math.min(progressItem && progressItem.progress | 0, qualityStageLimit(quality)))
          };
        })
      };
    });
    return { version: PROGRESS_STORE_VERSION, disciples: disciples };
  }

  function compareMaterialTokens(a, b) {
    var aMissing = !a || !a.n;
    var bMissing = !b || !b.n;
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : (aMissing ? 1 : -1);
    var qualityOrder = (a.q === "紫" ? 0 : 1) - (b.q === "紫" ? 0 : 1);
    return qualityOrder || a.n.localeCompare(b.n, "zh-Hans-CN");
  }

  function sortMaterialTokens(tokens) {
    return (Array.isArray(tokens) ? tokens : []).slice().sort(compareMaterialTokens);
  }

  /** 汇总一组阶段的所有材料（横杠除外），紫色优先，同品质按名称拼音升序 */
  function aggregateMaterials(stageList) {
    var map = {};
    (stageList || []).forEach(function (st) {
      (st.tokens || []).forEach(function (tk) {
        if (!tk.n) return;
        if (!map[tk.n]) map[tk.n] = { n: tk.n, q: tk.q || "橙", count: 0 };
        map[tk.n].count += 1;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(compareMaterialTokens);
  }

  function discipleSummary(data, disciple, lookup) {
    var index = lookup || nameIndex(data && data.items);
    var stages = [];
    (disciple.items || []).forEach(function (it) {
      stages = stages.concat(remainingStages(findItem(data, it.forgeName || it.name, index), it.progress, it.quality));
    });
    return { id: disciple.id, name: disciple.name, materials: aggregateMaterials(stages) };
  }

  function overallSummary(data, disciples) {
    var index = nameIndex(data && data.items);
    var stages = [];
    (disciples || []).forEach(function (d) {
      stages = stages.concat(discipleSummary(data, d, index).materials.map(function (m) {
        var arr = [];
        for (var i = 0; i < m.count; i++) arr.push({ stage: "", tokens: [{ n: m.n, q: m.q }] });
        return arr;
      }));
    });
    var flat = [];
    stages.forEach(function (a) { flat = flat.concat(a); });
    return aggregateMaterials(flat);
  }

  function orderedProgressItems(items) {
    return (Array.isArray(items) ? items : []).map(function (item, index) {
      return { item: item, index: index };
    }).sort(function (a, b) {
      var ai = CAT_ORDER.indexOf(a.item && a.item.cat);
      var bi = CAT_ORDER.indexOf(b.item && b.item.cat);
      if (ai === -1) ai = CAT_ORDER.length;
      if (bi === -1) bi = CAT_ORDER.length;
      return ai - bi || a.index - b.index;
    }).map(function (entry) {
      return entry.item;
    });
  }

  /**
   * 跨全部弟子搜索个人进度中的装备关系。
   * owned：弟子直接持有的装备；required：未完成阶段中的材料需求。
   */
  function exactCatalogFamily(catalog, value, lookup) {
    var query = normalizeSearch(value);
    if (!query) return null;
    var families = (lookup || catalogIndex(catalog)).families.get(query) || [];
    return families.length === 1 ? families[0] : null;
  }

  function searchEquipment(data, disciples, keyword, catalog, familyKey) {
    var q = normalizeSearch(keyword);
    var result = { owned: [], required: [] };
    if (!q) return result;
    var catalogLookup = catalogIndex(catalog);
    var forgeLookup = nameIndex(data && data.items);
    var exactFamily = String(familyKey || exactCatalogFamily(catalog, keyword, catalogLookup) || "");

    (Array.isArray(disciples) ? disciples : []).forEach(function (disciple) {
      if (!disciple || typeof disciple !== "object") return;
      orderedProgressItems(disciple.items).forEach(function (progressItem) {
        if (!progressItem || typeof progressItem !== "object") return;
        var savedName = String(progressItem.equipmentName || progressItem.forgeName || progressItem.name || "");
        if (!savedName) return;

        var item = findItem(data, progressItem.forgeName || progressItem.name, forgeLookup);
        var option = catalogMatch(catalog, progressItem, false, catalogLookup);
        var searchable = [savedName, progressItem.forgeName || ""].concat(option ? option.aliases : []);
        var ownedMatches = exactFamily
          ? (option ? option.forgeName : String(progressItem.forgeName || progressItem.name || "")) === exactFamily
          : searchable.some(function (value) { return normalizeSearch(value).indexOf(q) !== -1; });
        if (ownedMatches) {
          result.owned.push({
            disciple: disciple,
            progressItem: progressItem,
            item: item
          });
        }

        if (!item || !Array.isArray(item.stages)) return;
        var limit = Math.min(item.stages.length, qualityStageLimit(progressItem.quality));
        var progress = Math.max(0, Math.min(progressItem.progress | 0, limit));
        var hits = [];
        for (var si = progress; si < limit; si++) {
          var stage = item.stages[si] || {};
          var tokenHits = [];
          (Array.isArray(stage.tokens) ? stage.tokens : []).forEach(function (token, tokenIdx) {
            var tokenMatches = token && token.n && (exactFamily
              ? (exactCatalogFamily(catalog, token.n, catalogLookup) || String(token.n)) === exactFamily
              : normalizeSearch(token.n).indexOf(q) !== -1);
            if (tokenMatches) {
              tokenHits.push({ tokenIdx: tokenIdx, token: token });
            }
          });
          if (tokenHits.length) {
            hits.push({
              stageIdx: si,
              stage: stage.stage || "",
              tokens: tokenHits
            });
          }
        }
        if (hits.length) {
          result.required.push({
            disciple: disciple,
            progressItem: progressItem,
            item: item,
            hits: hits
          });
        }
      });
    });

    return result;
  }

  function searchDisciples(disciples, keyword) {
    var q = normalizeSearch(keyword);
    if (!q) return [];
    return (Array.isArray(disciples) ? disciples : []).map(function (disciple, index) {
      var name = normalizeSearch(disciple && disciple.name);
      return {
        disciple: disciple,
        index: index,
        exact: name === q,
        matched: name.indexOf(q) !== -1
      };
    }).filter(function (entry) {
      return entry.disciple && entry.matched;
    }).map(function (entry) {
      return { disciple: entry.disciple, index: entry.index, exact: entry.exact };
    });
  }

  function buildRequiredSearchPresentation(entry) {
    var source = entry && typeof entry === "object" ? entry : {};
    var disciple = source.disciple || {};
    var progressItem = source.progressItem || {};
    var item = source.item || {};
    var hitStageIndexes = [];
    var segments = (Array.isArray(source.hits) ? source.hits : []).map(function (hit) {
      var stageIdx = hit && Number.isInteger(hit.stageIdx) ? hit.stageIdx : -1;
      if (stageIdx >= 0 && hitStageIndexes.indexOf(stageIdx) === -1) hitStageIndexes.push(stageIdx);
      return {
        stageIdx: stageIdx,
        stage: String(hit && hit.stage || ""),
        tokens: (Array.isArray(hit && hit.tokens) ? hit.tokens : []).map(function (tokenHit) {
          var token = tokenHit && tokenHit.token || {};
          return { name: String(token.n || ""), quality: String(token.q || "") };
        }).filter(function (token) { return token.name !== ""; })
      };
    });
    return {
      ownerLabel: String(disciple.name || "未命名弟子") + "【" + String(progressItem.equipmentName || item.name || "未知装备") + "】",
      hitStageIndexes: hitStageIndexes,
      segments: segments
    };
  }

  function buildOwnedSearchLabel(entry) {
    var source = entry && typeof entry === "object" ? entry : {};
    var disciple = source.disciple || {};
    return String(disciple.name || "未命名弟子") + " 已佩戴该装备";
  }

  function swapDisciples(disciples, firstId, secondId) {
    var result = Array.isArray(disciples) ? disciples.slice() : [];
    if (!firstId || !secondId || firstId === secondId) return result;
    var firstIndex = result.findIndex(function (disciple) { return disciple && disciple.id === firstId; });
    var secondIndex = result.findIndex(function (disciple) { return disciple && disciple.id === secondId; });
    if (firstIndex === -1 || secondIndex === -1) return result;
    var first = result[firstIndex];
    result[firstIndex] = result[secondIndex];
    result[secondIndex] = first;
    return result;
  }

  return {
    findItem: findItem,
    qualityStageLimit: qualityStageLimit,
    convertQuality: convertQuality,
    requiresQualityDowngradeConfirmation: requiresQualityDowngradeConfirmation,
    progressStatus: progressStatus,
    normalizeProgressStore: normalizeProgressStore,
    remainingStages: remainingStages,
    nextStage: nextStage,
    sortMaterialTokens: sortMaterialTokens,
    aggregateMaterials: aggregateMaterials,
    discipleSummary: discipleSummary,
    overallSummary: overallSummary,
    searchDisciples: searchDisciples,
    searchEquipment: searchEquipment,
    buildOwnedSearchLabel: buildOwnedSearchLabel,
    buildRequiredSearchPresentation: buildRequiredSearchPresentation,
    swapDisciples: swapDisciples
  };
});
