(function (root, factory) {
  var core = typeof module === "object" && module.exports ? require("./formations.js") : root && root.FORMATIONS;
  var api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORMATION_LIMIT_ADAPTER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (CORE) {
  "use strict";

  var SOURCE_KEYS = { "攻": "attack", "血": "health", "防": "defense" };
  var GAIN_TARGETS = {
    "攻": "全体攻", "血": "全体血", "护盾": "全体护盾",
    "追加伤害": "追加伤害", "内力": "全体内力", "防": "全体防"
  };

  function fail(reason) {
    throw new Error("极限资料：" + reason);
  }

  function validName(name, context) {
    if (typeof name !== "string" || !CORE.normalizeName(name)) fail(context + "名称缺失");
    return CORE.normalizeName(name);
  }

  function requireStat(row, key) {
    var value = row[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      fail(row.name + "的" + key + "必须是非负安全整数");
    }
    return value;
  }

  /*
   * Pure, transient bridge for the limit tab only. `owned` satisfies the shared
   * solver's eligible-member contract; it is NOT personal ownership. Neither
   * this object nor its virtual members may enter personal progress or storage.
   */
  function buildLimitProgress(formation, reference) {
    if (!CORE || typeof CORE.normalizeName !== "function" || typeof CORE.calculateCell !== "function") {
      fail("计算核心尚未加载");
    }
    if (!formation || !reference || typeof formation !== "object" || typeof reference !== "object") {
      fail("合阵或参考记录缺失");
    }
    if (typeof formation.id !== "string" || !formation.id.trim()) fail("合阵ID缺失");
    if (validName(formation.name, "合阵") !== validName(reference.name, "参考合阵")) {
      fail("参考合阵名称与所选合阵不一致");
    }
    if (!Array.isArray(formation.candidates) || !formation.candidates.length ||
        !Array.isArray(reference.members) || reference.members.length !== formation.candidates.length) {
      fail("候选数量与完整参考记录不一致");
    }
    if (!Array.isArray(formation.slots) || !formation.slots.length) fail("基础助阵位置缺失");

    var candidateNames = new Map();
    var candidateIds = new Set();
    formation.candidates.forEach(function (candidate) {
      if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim()) fail("候选ID缺失");
      var name = validName(candidate.name, "候选");
      if (candidateIds.has(candidate.id)) fail("候选ID重复：" + candidate.id);
      if (candidateNames.has(name)) fail("本阵候选规范化名称重复：" + candidate.name);
      candidateIds.add(candidate.id);
      candidateNames.set(name, candidate);
    });

    var slots = new Map();
    formation.slots.forEach(function (slot) {
      if (!slot || !Number.isSafeInteger(slot.position) || slot.position < 1 || slots.has(slot.position)) {
        fail("基础助阵位置缺失、非法或重复");
      }
      if (!Object.prototype.hasOwnProperty.call(SOURCE_KEYS, slot.sourceAttribute) ||
          typeof slot.ratePercent !== "number" || !Number.isFinite(slot.ratePercent) || slot.ratePercent < 0 ||
          !Object.keys(GAIN_TARGETS).some(function (key) { return GAIN_TARGETS[key] === slot.targetAttribute; })) {
        fail("助阵" + slot.position + "的基础转换规则非法");
      }
      slots.set(slot.position, slot);
    });

    var referenceNames = new Set();
    var positions = new Set();
    var members = Object.create(null);
    var originalAssignments = [];
    var conflicts = [];
    reference.members.forEach(function (row) {
      if (!row || typeof row !== "object") fail("参考弟子记录缺失");
      var normalizedName = validName(row.name, "参考弟子");
      if (referenceNames.has(normalizedName)) fail("本阵参考规范化名称重复：" + row.name);
      referenceNames.add(normalizedName);
      var candidate = candidateNames.get(normalizedName);
      if (!candidate) fail("参考弟子无法唯一匹配本阵候选：" + row.name);
      var member = {
        owned: true,
        level: 300,
        attack: requireStat(row, "attack"),
        defense: requireStat(row, "defense"),
        health: requireStat(row, "hp"),
        usesReference: false,
        source: "limit",
        virtual: true
      };
      members[candidate.id] = member;
      // Null is deliberately preserved as "not recommended in original data".
      if (row.position === null) return;
      if (!Number.isSafeInteger(row.position) || !slots.has(row.position) || positions.has(row.position)) {
        fail(row.name + "的原资料建议位置非法、未知或重复");
      }
      positions.add(row.position);
      var slot = slots.get(row.position);
      var value = CORE.calculateCell(member, slot);
      if (!Number.isSafeInteger(value) || value < 0) fail("助阵" + slot.position + "收益超出安全整数范围");
      originalAssignments.push({
        position: slot.position,
        candidateId: candidate.id,
        name: candidate.name,
        sourceAttribute: slot.sourceAttribute,
        sourceValue: member[SOURCE_KEYS[slot.sourceAttribute]],
        ratePercent: slot.ratePercent,
        targetAttribute: slot.targetAttribute,
        value: value,
        usesReference: false,
        source: "limit",
        referenceSource: reference.source,
        rawName: row.name,
        rawTrainAttribute: row.trainAttribute,
        rawGainAttribute: row.gainAttribute
      });
      if (GAIN_TARGETS[row.gainAttribute] !== slot.targetAttribute || row.trainAttribute !== slot.sourceAttribute) {
        conflicts.push({
          formationId: formation.id,
          formationName: formation.name,
          position: slot.position,
          candidateId: candidate.id,
          name: candidate.name,
          rawTrainAttribute: row.trainAttribute,
          rawGainAttribute: row.gainAttribute,
          sourceAttribute: slot.sourceAttribute,
          targetAttribute: slot.targetAttribute,
          status: "待核实"
        });
      }
    });
    if (referenceNames.size !== candidateNames.size) fail("候选与参考弟子未一一对应");
    if (positions.size !== slots.size) fail("原资料建议位置未完整覆盖全部基础助阵位置");
    originalAssignments.sort(function (left, right) { return left.position - right.position; });
    return {
      progress: { mainId: null, members: members, source: "limit", virtual: true },
      originalAssignments: originalAssignments,
      conflicts: conflicts
    };
  }

  // Project the actual selected optimum, never the original suggested labels.
  function recommendationRows(reference, result) {
    return reference.members.map(function (row) {
      var assignment = (result.assignments || []).find(function (item) {
        return CORE.normalizeName(item.name) === CORE.normalizeName(row.name);
      });
      return Object.assign({}, row, {
        position: assignment ? assignment.position : null,
        trainAttribute: assignment ? assignment.sourceAttribute : null,
        gainAttribute: assignment ? assignment.targetAttribute.replace(/^全体/, "") : null
      });
    });
  }

  return { buildLimitProgress: buildLimitProgress, recommendationRows: recommendationRows };
});
