(function (root, factory) {
  "use strict";
  var api = factory(typeof module === "object" && module.exports ? require("./inscription-rules.js") : root.InscriptionRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InscriptionProgressRules = api;
})(typeof window !== "undefined" ? window : null, function (Rules) {
  "use strict";

  // Blue one belongs to personal records only, never the crafting recipes.
  var qualities = [{ id: "b1", label: "蓝一", count: 1 }].concat(Rules.qualities);
  var tierLabels = { H: "高档", M: "中档", L: "低档", U: "不分档", "?": "档位不可辨" };
  var attrAliases = { "速度": "速", "PVP速度": "PVP速", "攻击": "攻" };
  function normalizeAttr(value) {
    value = String(value == null ? "" : value);
    var normalized = Rules.normalizeAttr(attrAliases[value] || value);
    var historical = normalized.replace(/^3/, "");
    historical = Rules.normalizeAttr(attrAliases[historical] || historical);
    return Rules.attributes.some(function (attr) { return attr.id === historical; }) ? historical : normalized;
  }
  function normalizeDun(value) { return Rules.normalizeDun(String(value == null ? "" : value).trim()); }
  function qualityInfo(id) { return qualities.find(function (quality) { return quality.id === id; }); }
  function qualityId(slot) {
    if (!slot || typeof slot !== "object") return "";
    if (qualityInfo(slot.quality)) return slot.quality;
    var prefix = { "蓝色": "b", "紫色": "p", "橙色": "o" }[slot.quality];
    return prefix && /^[12]$/.test(String(slot.star)) ? prefix + String(slot.star) : "";
  }
  function qualityFields(id) {
    return qualityInfo(id) ? { quality: { b: "蓝色", p: "紫色", o: "橙色" }[id.charAt(0)], star: id.charAt(1) } : null;
  }
  function identity(term) { return term ? term.attr + ":" + term.tier : ""; }
  function blueOneTerms(dun) {
    var info = Rules.duns.find(function (entry) { return entry.id === normalizeDun(dun); });
    if (!info) return [];
    var result = [];
    info.attrs.concat(["闪避", "招架", "治疗效果"]).forEach(function (attr) {
      var tiers = ["H", "M", "L", "U"].filter(function (tier) {
        return !(tier === "H" && info.high.indexOf(attr) < 0) && Rules.value({ attr: attr, tier: tier }, "b1") !== null;
      });
      var amounts = {};
      tiers.forEach(function (tier) {
        var amount = Rules.value({ attr: attr, tier: tier }, "b1");
        if (!amounts[amount]) amounts[amount] = [];
        amounts[amount].push(tier);
      });
      Object.keys(amounts).forEach(function (amount) {
        result.push({ attr: attr, tier: amounts[amount].length > 1 ? "?" : amounts[amount][0] });
      });
    });
    return result;
  }
  function termsFor(dun, quality, origin) {
    if (quality !== "b1") return Rules.termsFor(normalizeDun(dun), quality, origin);
    if (origin !== undefined && origin !== "wash") return [];
    return blueOneTerms(dun);
  }
  function value(term, quality, dun) {
    if (!term) return null;
    if (quality !== "b1" || term.tier !== "?") return Rules.value(term, quality);
    if (!blueOneTerms(dun).some(function (candidate) { return identity(candidate) === identity(term); })) return null;
    var amounts = ["H", "M"].map(function (tier) { return Rules.value({ attr: term.attr, tier: tier }, quality); });
    return amounts[0] !== null && amounts[0] === amounts[1] ? amounts[0] : null;
  }
  function describe(term, quality, dun) {
    var meta = term && Rules.attributes.find(function (attr) { return attr.id === normalizeAttr(term.attr); });
    var amount = value(term, quality, dun), tier = term && tierLabels[term.tier];
    return meta && amount !== null && tier ? { body: String(amount) + meta.unit + meta.id, suffix: "（" + tier + "）" } : null;
  }
  function plain(term, quality, dun) {
    var description = describe(term, quality, dun);
    return description ? description.body + description.suffix : "";
  }
  function entries(slot) {
    slot = slot && typeof slot === "object" ? slot : {};
    var subs = Array.isArray(slot.subs) ? slot.subs : [slot.sub == null ? "" : slot.sub];
    var values = Array.isArray(slot.subValues) ? slot.subValues : [];
    var tiers = Array.isArray(slot.subTiers) ? slot.subTiers : [];
    var result = [];
    for (var index = 0; index < Math.max(subs.length, values.length, tiers.length); index++) {
      result.push({ attr: subs[index] == null ? "" : String(subs[index]), raw: values[index] == null ? "" : String(values[index]), tier: tiers[index] == null ? "" : String(tiers[index]) });
    }
    return result;
  }
  function resolve(attr, raw, tier, dun, quality) {
    var name = normalizeAttr(attr), meta = Rules.attributes.find(function (entry) { return entry.id === name; });
    var numeric = String(raw == null ? "" : raw).trim();
    var failure = { term: null, error: "不支持的历史属性、数值或档位" };
    if (!meta || !/^\+?\d+(?:\.\d+)?%?$/.test(numeric) || (numeric.endsWith("%") && meta.unit !== "%")) return failure;
    var amount = Number(numeric.replace(/[+%]/g, ""));
    var choices = termsFor(dun, quality).filter(function (term) { return term.attr === name && value(term, quality, dun) === amount && (!tier || term.tier === tier); });
    return choices.length === 1 ? { term: choices[0], error: "" } : failure;
  }
  function canComplete(prefix, dun, quality, terms) {
    var info = qualityInfo(quality);
    if (!info || Rules.prefixes.indexOf(prefix) < 0 || !Array.isArray(terms) || terms.length > info.count || terms.some(function (term) { return !term || typeof term.attr !== "string" || typeof term.tier !== "string"; })) return false;
    var seen = new Set(), high = 0;
    if (terms.some(function (term) {
      var key = identity(term);
      if (seen.has(key)) return true;
      seen.add(key);
      if (term.tier === "H") high++;
      return false;
    }) || high > 2) return false;
    return ["wash", "crafted"].some(function (origin) {
      var pool = termsFor(dun, quality, origin), keys = pool.map(identity);
      if (terms.some(function (term) { return keys.indexOf(identity(term)) < 0; })) return false;
      var available = pool.filter(function (term) { return !seen.has(identity(term)); });
      var nonHigh = available.filter(function (term) { return term.tier !== "H"; }).length;
      var extraHigh = Math.min(2 - high, available.length - nonHigh);
      return nonHigh + extraHigh >= info.count - terms.length;
    });
  }
  function validateSlot(slot) {
    slot = slot && typeof slot === "object" ? slot : {};
    var quality = qualityId(slot), info = qualityInfo(quality), parts = entries(slot), errors = [];
    if (!info) return { valid: false, errors: ["未知或缺失品质星级，请明确调整"] };
    if (!parts.some(function (entry) { return entry.attr || entry.raw || entry.tier; })) return { valid: true, draft: true, errors: ["未填写草稿，不作为有效材料"] };
    if (parts.filter(function (entry) { return entry.attr || entry.raw || entry.tier; }).length !== info.count || parts.slice(info.count).some(function (entry) { return entry.attr || entry.raw || entry.tier; })) errors.push("此品质需恰好" + info.count + "条副属性，历史条数无效时请明确调整");
    var terms = [];
    for (var index = 0; index < info.count; index++) {
      var entry = parts[index] || {}, result = resolve(entry.attr, entry.raw, entry.tier, slot.shield, quality);
      if (!result.term) errors.push("副属性" + (index + 1) + "不是此品质支持的精确词条，请重新选择");
      else terms.push(result.term);
    }
    var legal = !errors.length && (quality === "b1" ? canComplete(slot.tian, slot.shield, quality, terms) : ["wash", "crafted"].some(function (origin) {
      return Rules.validate({ prefix: slot.tian, dun: normalizeDun(slot.shield), quality: quality, origin: origin, terms: terms }).valid;
    }));
    if (!errors.length && !legal) errors.push("词条组合无合法洗练/合成来源（同档或不分档重复、高档上限或来源不符）");
    return { valid: !errors.length, errors: errors };
  }
  function formationNames(data) {
    var names = new Set();
    ((data && data.items) || []).forEach(function (formation) {
      (formation.candidates || []).forEach(function (candidate) { if (candidate && typeof candidate.name === "string") names.add(candidate.name); });
    });
    return names;
  }

  return { qualities: qualities, qualityInfo: qualityInfo, qualityId: qualityId, qualityFields: qualityFields, normalizeAttr: normalizeAttr, normalizeDun: normalizeDun, termsFor: termsFor, value: value, describe: describe, plain: plain, identity: identity, entries: entries, resolve: resolve, canComplete: canComplete, validateSlot: validateSlot, formationNames: formationNames };
});
