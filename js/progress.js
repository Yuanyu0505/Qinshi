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

  function normalizeSearch(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  function findItem(data, name) {
    var items = data && data.items;
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].name === name) return items[i];
    }
    return null;
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

  function catalogMatch(catalog, item, legacy) {
    var entries = Array.isArray(catalog) ? catalog : [];
    if (!legacy && item && item.equipmentName) {
      var exact = entries.find(function (entry) {
        return entry.equipmentName === item.equipmentName && (!item.forgeName || entry.forgeName === item.forgeName);
      });
      if (exact) return exact;
    }
    var name = String(item && (item.name || item.equipmentName || item.forgeName) || "");
    if (legacy && name === "鬼谷子") {
      var divineGhost = entries.find(function (entry) { return entry.forgeName === "神兵鬼谷子"; });
      if (divineGhost) return divineGhost;
    }
    var matches = entries.filter(function (entry) {
      return entry.forgeName === name || entry.equipmentName === name || entry.aliases.indexOf(name) >= 0;
    });
    return matches.find(function (entry) { return entry.preferred; }) || matches[0] || null;
  }

  function normalizeProgressStore(raw, catalog, forgingItems) {
    var source = raw && typeof raw === "object" ? raw : {};
    var legacy = source.version !== PROGRESS_STORE_VERSION;
    var forgeRows = Array.isArray(forgingItems) ? forgingItems : [];
    var disciples = (Array.isArray(source.disciples) ? source.disciples : []).map(function (disciple) {
      return {
        id: String(disciple && disciple.id || ""),
        name: String(disciple && disciple.name || "弟子"),
        items: (Array.isArray(disciple && disciple.items) ? disciple.items : []).map(function (progressItem) {
          var option = catalogMatch(catalog, progressItem, legacy);
          var fallbackName = String(progressItem && (progressItem.forgeName || progressItem.name) || "");
          var forgeName = option ? option.forgeName : fallbackName;
          var forgeItem = forgeRows.find(function (entry) { return entry.name === forgeName; });
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

  function discipleSummary(data, disciple) {
    var stages = [];
    (disciple.items || []).forEach(function (it) {
      stages = stages.concat(remainingStages(findItem(data, it.forgeName || it.name), it.progress, it.quality));
    });
    return { id: disciple.id, name: disciple.name, materials: aggregateMaterials(stages) };
  }

  function overallSummary(data, disciples) {
    var stages = [];
    (disciples || []).forEach(function (d) {
      stages = stages.concat(discipleSummary(data, d).materials.map(function (m) {
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
  function exactCatalogFamily(catalog, value) {
    var query = normalizeSearch(value);
    if (!query) return null;
    var families = [];
    (Array.isArray(catalog) ? catalog : []).forEach(function (entry) {
      var names = [entry.forgeName, entry.equipmentName].concat(entry.aliases || []);
      if (names.some(function (name) { return normalizeSearch(name) === query; }) && families.indexOf(entry.forgeName) === -1) {
        families.push(entry.forgeName);
      }
    });
    return families.length === 1 ? families[0] : null;
  }

  function progressItemFamily(catalog, progressItem) {
    var option = catalogMatch(catalog, progressItem, false);
    return option ? option.forgeName : String(progressItem && (progressItem.forgeName || progressItem.name) || "");
  }

  function searchEquipment(data, disciples, keyword, catalog, familyKey) {
    var q = normalizeSearch(keyword);
    var result = { owned: [], required: [] };
    if (!q) return result;
    var exactFamily = String(familyKey || exactCatalogFamily(catalog, keyword) || "");

    (Array.isArray(disciples) ? disciples : []).forEach(function (disciple) {
      if (!disciple || typeof disciple !== "object") return;
      orderedProgressItems(disciple.items).forEach(function (progressItem) {
        if (!progressItem || typeof progressItem !== "object") return;
        var savedName = String(progressItem.equipmentName || progressItem.forgeName || progressItem.name || "");
        if (!savedName) return;

        var item = findItem(data, progressItem.forgeName || progressItem.name);
        var option = catalogMatch(catalog, progressItem, false);
        var searchable = [savedName, progressItem.forgeName || ""].concat(option ? option.aliases : []);
        var ownedMatches = exactFamily
          ? progressItemFamily(catalog, progressItem) === exactFamily
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
              ? (exactCatalogFamily(catalog, token.n) || String(token.n)) === exactFamily
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
    searchEquipment: searchEquipment
  };
});
