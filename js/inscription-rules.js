(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.InscriptionRules = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  // Values are displayed percentage points, not fractions. b1 is reference only.
  var qualityIds = ["b1", "b2", "p1", "p2", "o1", "o2"];
  var qualities = [
    { id: "b2", label: "蓝二", count: 1 }, { id: "p1", label: "紫一", count: 2 },
    { id: "p2", label: "紫二", count: 2 }, { id: "o1", label: "橙一", count: 3 },
    { id: "o2", label: "橙二", count: 3 }
  ];
  var prefixes = ["天府", "天相", "天同", "天梁", "天机"];
  var groups = {
    base: { H: [2,4,6,8,10,12], M: [1,2,4,6,8,10], L: [null,null,null,4,6,8] },
    percent: { H: [1,2,3,4,5,6], M: [1,1,2,3,4,5], L: [null,null,null,2,3,4] },
    speed: { H: [1,1,2,3,4,5], M: [1,1,1,2,3,4], L: [null,null,null,1,2,3] },
    extra: { H: [800,1400,2500,4500,8100,14500], M: [400,800,1400,2500,4500,8100], L: [null,null,null,1400,2500,4500] },
    common: { U: [1,2,3,4,5,6] }
  };
  var attributes = [];
  [
    ["base", "%", ["攻", "防", "血", "内力", "护盾"]],
    ["percent", "%", ["暴击", "抗暴击", "暴击伤害", "技能穿透", "技免", "PVP伤害", "PVP免伤"]],
    ["speed", "", ["速", "PVP速"]], ["extra", "", ["追加伤害"]],
    ["common", "%", ["闪避", "招架", "治疗效果"]]
  ].forEach(function (entry) {
    entry[2].forEach(function (attr) { attributes.push({ id: attr, group: entry[0], unit: entry[1] }); });
  });
  var duns = [
    { id: "天遁", attrs: ["攻","暴击伤害","技免","内力","追加伤害"], high: ["攻","暴击伤害"] },
    { id: "地遁", attrs: ["PVP速","暴击","PVP免伤","技能穿透","防"], high: ["技能穿透","防"] },
    { id: "人遁", attrs: ["血","抗暴击","PVP伤害","技能穿透","防"], high: ["血","抗暴击"] },
    { id: "神遁", attrs: ["PVP速","攻","PVP伤害","技能穿透","内力"], high: ["攻","PVP伤害"] },
    { id: "鬼遁", attrs: ["速","血","护盾","暴击伤害","防"], high: ["速","防"] },
    { id: "龙遁", attrs: ["PVP速","血","暴击","PVP伤害","技免"], high: ["PVP速","暴击"] },
    { id: "虎遁", attrs: ["血","暴击伤害","抗暴击","内力","追加伤害"], high: ["血","内力"] },
    { id: "风遁", attrs: ["攻","暴击","护盾","PVP免伤","追加伤害"], high: ["PVP免伤","追加伤害"] },
    { id: "云遁", attrs: ["护盾","抗暴击","PVP免伤","技免","防"], high: ["护盾","技免"] }
  ];
  var recipes = {
    b2: { quality: "p1", count: 2, promotion: "初级" },
    p1: { quality: "p2", count: 3, promotion: null },
    p2: { quality: "o1", count: 2, promotion: "中级" },
    o1: { quality: "o2", count: 3, promotion: null }
  };
  var aliases = { "防御": "防", "技能减免": "技免", "技伤减免": "技免" };
  function normalizeAttr(attr) {
    return typeof attr === "string" ? (Object.prototype.hasOwnProperty.call(aliases, attr) ? aliases[attr] : attr) : null;
  }
  function normalizeDun(dun) {
    if (typeof dun !== "string") return null;
    return dun.replace(/盾$/, "遁");
  }
  function attrInfo(attr) { return attributes.find(function (a) { return a.id === normalizeAttr(attr); }); }
  function dunInfo(dun) { return duns.find(function (d) { return d.id === normalizeDun(dun); }); }
  function qualityInfo(quality) { return qualities.find(function (q) { return q.id === quality; }); }
  function makeTerm(attr, tier) { return { attr: normalizeAttr(attr), tier: tier }; }
  function key(term) { return term.attr + ":" + term.tier; }
  function sorted(terms) {
    return terms.map(function (t) { return makeTerm(t.attr, t.tier); }).sort(function (a, b) {
      return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
    });
  }
  function value(term, quality) {
    if (!term || typeof term !== "object" || typeof term.tier !== "string") return null;
    var info = attrInfo(term.attr), index = qualityIds.indexOf(quality);
    if (!info || index < 0) return null;
    if (term.tier === "?" && info.group === "speed" && quality === "b2") return 1;
    var values = groups[info.group][term.tier];
    return Array.isArray(values) ? values[index] : null;
  }
  function label(term, quality) {
    var amount = value(term, quality), info = term && attrInfo(term.attr);
    return amount === null || !info ? "" : info.id + amount + info.unit;
  }
  // origin omitted: all observable tiers, including wash-only p2 L.
  function termsFor(dun, quality, origin) {
    var info = dunInfo(dun);
    if (!info || !qualityInfo(quality) || (origin !== undefined && origin !== "wash" && origin !== "crafted")) return [];
    var result = [];
    info.attrs.concat(["闪避", "招架", "治疗效果"]).forEach(function (attr) {
      var meta = attrInfo(attr);
      if (meta.group === "common") { result.push(makeTerm(attr, "U")); return; }
      if (quality === "b2" && meta.group === "speed") { result.push(makeTerm(attr, "?")); return; }
      ["H", "M", "L"].forEach(function (tier) {
        if (tier === "H" && info.high.indexOf(attr) < 0) return;
        if (value(makeTerm(attr, tier), quality) === null) return;
        if (origin === "wash" && quality !== "b2" && tier === "M") return;
        if (origin === "crafted" && quality === "p2" && tier === "L") return;
        result.push(makeTerm(attr, tier));
      });
    });
    return result;
  }
  function validate(material) {
    var errors = [];
    if (!material || typeof material !== "object" || Array.isArray(material)) return { valid: false, errors: ["铭文材料格式无效"] };
    var info = qualityInfo(material.quality), dun = normalizeDun(material.dun);
    if (prefixes.indexOf(material.prefix) < 0) errors.push("未知或缺失前缀");
    if (!dunInfo(dun)) errors.push("未知或缺失遁位");
    if (!info) errors.push("未知或缺失品质");
    if (material.origin !== "wash" && material.origin !== "crafted") errors.push("来源必须为wash或crafted");
    var terms = Array.isArray(material.terms) ? material.terms : [];
    if (!Array.isArray(material.terms) || !info || terms.length !== info.count) errors.push("词条数量必须符合品质要求");
    var allowed = termsFor(dun, material.quality, material.origin).map(key), seen = new Set(), highCount = 0;
    Array.from(terms).forEach(function (t) {
      if (!t || typeof t !== "object" || Array.isArray(t) || !attrInfo(t.attr) || typeof t.tier !== "string") { errors.push("未知或缺失属性/档位"); return; }
      var normalized = makeTerm(t.attr, t.tier), identity = key(normalized);
      if (allowed.indexOf(identity) < 0) errors.push("属性/档位不支持此遁位、品质或来源：" + identity);
      if (seen.has(identity)) errors.push("同属性同档位不得重复：" + identity);
      seen.add(identity);
      if (t.tier === "H") highCount++;
    });
    if (highCount > 2) errors.push("每枚最多两条高档");
    if (errors.length) return { valid: false, errors: errors };
    return { valid: true, errors: [], material: { prefix: material.prefix, dun: dun, quality: material.quality, origin: material.origin, terms: sorted(terms) } };
  }
  // Signature deliberately ignores source audit information; validate before storage.
  function signature(material) {
    if (!material || !Array.isArray(material.terms) || material.terms.some(function (t) { return !t || !attrInfo(t.attr); })) return null;
    return JSON.stringify([material.prefix, normalizeDun(material.dun), material.quality, sorted(material.terms).map(key)]);
  }
  function legal(terms) {
    return new Set(terms.map(key)).size === terms.length && terms.filter(function (t) { return t.tier === "H"; }).length <= 2;
  }
  function combinations(pool, count) {
    var result = [];
    function visit(start, picked) {
      if (picked.length === count) { if (legal(picked)) result.push(picked); return; }
      for (var i = start; i <= pool.length - (count - picked.length); i++) {
        var next = picked.concat([pool[i]]);
        if (legal(next)) visit(i + 1, next);
      }
    }
    visit(0, []);
    return result;
  }
  function uniqueTerms(terms) {
    var map = new Map();
    terms.forEach(function (t) { map.set(key(t), t); });
    return sorted(Array.from(map.values()));
  }
  function bestTargets(dun, quality, attrs) {
    var info = qualityInfo(quality), pool = termsFor(dun, quality);
    function failure(reason) { return { targets: [], reason: reason }; }
    if (!dunInfo(dun) || !info) return failure("未知遁位或品质，请重新选择");
    if (!Array.isArray(attrs) || attrs.length !== info.count) return failure("必须选满" + info.count + "条属性，请调整条数");
    var counts = new Map();
    for (var i = 0; i < attrs.length; i++) {
      var attr = normalizeAttr(attrs[i]);
      if (!pool.some(function (t) { return t.attr === attr; })) return failure("此遁位不支持属性：" + String(attrs[i]) + "；请选择支持属性");
      counts.set(attr, (counts.get(attr) || 0) + 1);
    }
    var choices = [[]], impossible = "";
    counts.forEach(function (count, attr) {
      var variants = combinations(pool.filter(function (t) { return t.attr === attr; }), count);
      if (!variants.length) impossible = attr + "缺少" + count + "条不同合法档位；请减少重复次数或更换遁位/品质";
      var next = [];
      choices.forEach(function (choice) { variants.forEach(function (variant) { if (legal(choice.concat(variant))) next.push(choice.concat(variant)); }); });
      choices = next;
    });
    if (!choices.length) return failure(impossible || "目标超过两条高档限制，请减少高档需求");
    choices = choices.filter(function (terms) {
      return ["wash", "crafted"].some(function (origin) {
        return validate({ prefix: prefixes[0], dun: dun, quality: quality, origin: origin, terms: terms }).valid;
      });
    });
    if (!choices.length) return failure("没有合法洗练或合成来源可提供此档位组合；请更换属性或提高品质");
    // Pareto comparison aligns repeated attrs by descending displayed value.
    function dominates(a, b) {
      var greater = false, smaller = false;
      counts.forEach(function (_, attr) {
        var av = a.filter(function (t) { return t.attr === attr; }).map(function (t) { return value(t, quality); }).sort(function (x,y) { return y-x; });
        var bv = b.filter(function (t) { return t.attr === attr; }).map(function (t) { return value(t, quality); }).sort(function (x,y) { return y-x; });
        av.forEach(function (v, i) { if (v > bv[i]) greater = true; if (v < bv[i]) smaller = true; });
      });
      return greater && !smaller;
    }
    return { targets: choices.filter(function (choice) { return !choices.some(function (other) { return dominates(other, choice); }); }).map(sorted), reason: "" };
  }
  function preview(materials) {
    function failure(errors) { return { valid: false, errors: errors, outcomes: [] }; }
    if (!Array.isArray(materials) || !materials.length) return failure(["请选择足量合成材料"]);
    var normalized = [], errors = [];
    Array.from(materials).forEach(function (material, index) {
      var result = validate(material);
      if (!result.valid) result.errors.forEach(function (error) { errors.push("材料" + (index + 1) + "：" + error); });
      else normalized.push(result.material);
    });
    if (errors.length) return failure(errors);
    var first = normalized[0], recipe = recipes[first.quality];
    if (!recipe) return failure(["此品质没有后续合成配方"]);
    if (normalized.length !== recipe.count) return failure(["配方需要" + recipe.count + "枚" + first.quality + "材料"]);
    if (normalized.some(function (m) { return m.prefix !== first.prefix || m.dun !== first.dun || m.quality !== first.quality; })) return failure(["合成材料必须同前缀、遁位和品质"]);
    var count = qualityInfo(recipe.quality).count, pools = [[]];
    var unknown = normalized.flatMap(function (m) { return m.terms; }).filter(function (t) { return t.tier === "?"; });
    normalized.forEach(function (m) { m.terms.forEach(function (t) {
      if (t.tier !== "?") { pools.forEach(function (pool) { pool.push(t); }); return; }
      // Repeated blue speed is one visible anchor M, never two hidden H rolls.
      if (unknown.filter(function (u) { return u.attr === t.attr; }).length > 1) {
        pools.forEach(function (pool) { pool.push(makeTerm(t.attr, "M")); }); return;
      }
      var tiers = dunInfo(first.dun).high.indexOf(t.attr) >= 0 ? ["M", "H"] : ["M"], next = [];
      pools.forEach(function (pool) { tiers.forEach(function (tier) { next.push(pool.concat([makeTerm(t.attr, tier)])); }); });
      pools = next;
    }); });
    var observable = new Map(), fill = termsFor(first.dun, recipe.quality, "crafted").filter(function (t) { return t.tier !== "L"; });
    function add(terms) {
      var material = { prefix: first.prefix, dun: first.dun, quality: recipe.quality, origin: "crafted", terms: sorted(terms) };
      if (validate(material).valid) observable.set(signature(material), material);
    }
    pools.forEach(function (pool) {
      pool = uniqueTerms(pool);
      var direct = combinations(pool, count);
      if (direct.length) { direct.forEach(add); return; }
      // Fill only after retaining a maximum legally inheritable subset.
      var anchors = [];
      for (var size = Math.min(pool.length, count - 1); size >= 0 && !anchors.length; size--) anchors = combinations(pool, size);
      anchors.forEach(function (anchor) {
        var available = fill.filter(function (t) { return !anchor.some(function (a) { return key(a) === key(t); }); });
        combinations(available, count - anchor.length).forEach(function (extra) { if (legal(anchor.concat(extra))) add(anchor.concat(extra)); });
      });
    });
    var results = Array.from(observable.values());
    if (!results.length) return failure(["材料无法产生合法满槽结果，请调整属性/档位"]);
    results.sort(function (a,b) { var ak=signature(a),bk=signature(b); return ak < bk ? -1 : ak > bk ? 1 : 0; });
    return { valid: true, errors: [], quality: recipe.quality, promotion: recipe.promotion, model: "等概率模型，非实测游戏频率", outcomes: results.map(function (material) {
      return { material: material, terms: material.terms, probability: 1 / results.length };
    }) };
  }
  function sample(outcomes, random) {
    if (!Array.isArray(outcomes) || !outcomes.length || outcomes.some(function (o) { return !o || !Number.isFinite(o.probability) || o.probability <= 0; })) throw new TypeError("Invalid outcomes");
    var total = outcomes.reduce(function (sum, o) { return sum + o.probability; }, 0);
    if (Math.abs(total - 1) > 1e-9) throw new RangeError("Outcome probabilities must sum to one");
    var draw = (random === undefined ? Math.random : random)();
    if (typeof draw !== "number" || !Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError("random must return a finite number in [0,1)");
    var cumulative = 0;
    for (var i = 0; i < outcomes.length; i++) { cumulative += outcomes[i].probability; if (draw < cumulative) return outcomes[i]; }
    return outcomes[outcomes.length - 1]; // Floating point accumulation only.
  }
  function freeze(value) {
    Object.keys(value).forEach(function (key) { if (value[key] && typeof value[key] === "object") freeze(value[key]); });
    return Object.freeze(value);
  }
  return freeze({ qualities: qualities, attributes: attributes, duns: duns, prefixes: prefixes, recipes: recipes,
    normalizeAttr: normalizeAttr, normalizeDun: normalizeDun, termsFor: termsFor, validate: validate,
    value: value, label: label, signature: signature, bestTargets: bestTargets, preview: preview, sample: sample });
});
