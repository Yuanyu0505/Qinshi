(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FORMATION_PROGRESS_STORE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var STORE_KEY = "qinshi_formation_progress_v1";
  var MEMBER_FIELDS = ["owned", "level", "attack", "health", "defense", "usesReference"];
  var INTEGER_FIELDS = [["level", 1], ["attack", 0], ["health", 0], ["defense", 0]];

  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function record(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function put(object, key, value) {
    Object.defineProperty(object, key, { value: value, enumerable: true, writable: true, configurable: true });
  }

  function decimalSignature(text) {
    var parts = text.toLowerCase().split("e");
    var mantissa = parts[0];
    var negative = mantissa.charAt(0) === "-";
    if (negative) mantissa = mantissa.slice(1);
    var point = mantissa.indexOf(".");
    var fractionLength = point < 0 ? 0 : mantissa.length - point - 1;
    var digits = mantissa.replace(".", "").replace(/^0+/, "");
    if (!digits) return "0";
    var significant = digits.replace(/0+$/, "");
    var exponent = BigInt(parts[1] || "0") - BigInt(fractionLength) + BigInt(digits.length - significant.length);
    return (negative ? "-" : "") + significant + "e" + String(exponent);
  }

  function preservesJsonNumbers(raw) {
    // Inspect numeric tokens outside quoted strings, including opaque extensions.
    // Reject a lossy JSON round-trip rather than silently rewriting future data.
    var tokens = /"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    var token;
    while ((token = tokens.exec(raw))) {
      if (token[1] === undefined) continue;
      var value = Number(token[1]);
      if (!Number.isFinite(value) || Object.is(value, -0) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value))) return false;
      if (decimalSignature(token[1]) !== decimalSignature(JSON.stringify(value))) return false;
    }
    return true;
  }

  function create(accounts, formations, core) {
    var list = Array.isArray(formations) ? formations : [];
    var accountId = null;
    var status = null;
    var committed = null;
    var originalRaw = null;
    var initializationError = "";
    try {
      var initialAccount = accounts && accounts.currentAccount();
      accountId = initialAccount && typeof initialAccount.id === "string" ? initialAccount.id : null;
    } catch (error) {
      initializationError = "读取当前账号失败，请重新加载后重试。";
    }

    function isCurrent() {
      try {
        if (!accountId || !accounts || typeof accounts.currentAccount !== "function") return false;
        var current = accounts.currentAccount();
        return Boolean(current && current.id === accountId &&
          (typeof accounts.isCurrentContext !== "function" || accounts.isCurrentContext()));
      } catch (error) { return false; }
    }

    function findFormation(id) {
      return list.find(function (formation) { return formation.id === id; });
    }

    function validMember(value) {
      if (!record(value) || typeof value.owned !== "boolean") return false;
      if (own(value, "usesReference") && typeof value.usesReference !== "boolean") return false;
      return INTEGER_FIELDS.every(function (field) {
        if (!own(value, field[0]) || value[field[0]] == null) return true;
        var input = value[field[0]];
        if (typeof input !== "string" && typeof input !== "number") return false;
        var parsed = core.parseIntegerInput(input, field[1]);
        return parsed.valid || parsed.missing;
      });
    }

    function validProgress(formation, value, isDraft) {
      if (!record(value) || !own(value, "members") || !record(value.members)) return false;
      if (own(value, "mainId") && value.mainId !== null && typeof value.mainId !== "string") return false;
      var valid = Object.keys(value.members).every(function (id) {
        var member = value.members[id];
        if (!record(member)) return false;
        var known = formation.candidates.some(function (candidate) { return candidate.id === id; });
        // Unknown candidates are opaque saved data, never normalized or silently removed.
        if (!known) return !isDraft;
        if (isDraft && member.owned === false) return true;
        return validMember(member);
      });
      if (!valid || !isDraft || value.mainId == null) return valid;
      return formation.candidates.some(function (candidate) { return candidate.id === value.mainId; }) &&
        own(value.members, value.mainId) && value.members[value.mainId].owned === true;
    }

    function validArchive(value) {
      if (!record(value)) return false;
      return list.every(function (formation) {
        return !own(value, formation.id) || validProgress(formation, value[formation.id], false);
      });
    }

    function readFailure(nextStatus, message) {
      status = nextStatus;
      return { status: status, stored: clone(committed), error: message };
    }

    function read() {
      if (initializationError) return readFailure("read-error", initializationError);
      if (!isCurrent()) return readFailure("read-error", "当前账号不可用或已切换，请重新加载后重试。");
      var raw;
      try {
        raw = accounts.getItem(STORE_KEY);
      } catch (error) {
        return readFailure("read-error", "读取合阵个人进度失败，请检查浏览器存储权限。");
      }
      if (!isCurrent()) return readFailure("read-error", "账号已切换，未读取其他账号的合阵进度。");
      var parsed;
      if (raw === null) parsed = {};
      else {
        if (typeof raw !== "string") return readFailure("invalid", "合阵存档格式异常，已保留原始数据并禁止覆盖。");
        try { parsed = JSON.parse(raw); }
        catch (error) { return readFailure("invalid", "合阵存档 JSON 异常，已保留原始数据并禁止覆盖。"); }
        try {
          if (!preservesJsonNumbers(raw)) {
            return readFailure("invalid", "合阵存档包含无法安全保留的数值，已保留原始数据并禁止覆盖。");
          }
        } catch (error) {
          return readFailure("invalid", "合阵存档数值无法安全读取，已保留原始数据并禁止覆盖。");
        }
      }
      try {
        if (!core || typeof core.parseIntegerInput !== "function" || !validArchive(parsed)) {
          return readFailure("invalid", "合阵存档结构不兼容，已保留原始数据并禁止覆盖。");
        }
      } catch (error) {
        return readFailure("invalid", "合阵存档结构不兼容，已保留原始数据并禁止覆盖。");
      }
      originalRaw = raw;
      committed = parsed;
      status = raw === null ? "missing" : (Object.keys(parsed).length ? "valid" : "empty");
      return { status: status, stored: clone(committed), error: "" };
    }

    function fail(message) { return { ok: false, stored: clone(committed), error: message }; }

    function save(formationId, normalizedDraft) {
      if (!isCurrent()) return fail("当前账号不可用或已切换，未保存合阵进度。请重新加载后重试。");
      if (status !== "missing" && status !== "empty" && status !== "valid") {
        return fail("合阵存档尚未安全读取，已禁止覆盖。请保留草稿并检查存档状态。");
      }
      var formation = findFormation(formationId);
      if (!formation) return fail("无法保存未知合阵的个人进度。");
      var next;
      var serialized;
      try {
        if (!validProgress(formation, normalizedDraft, true)) return fail("个人进度格式或成员数据无效，未保存。");
        var normalized = core.normalizeProgress(formation, normalizedDraft);
        if (!validProgress(formation, normalized, true)) return fail("个人进度无法安全规范化，未保存。");
        next = clone(committed);
        var oldProgress = own(next, formationId) ? next[formationId] : null;
        var progress = oldProgress ? clone(oldProgress) : { mainId: null, members: {} };
        formation.candidates.forEach(function (candidate) {
          var id = candidate.id;
          if (!own(normalized.members, id)) {
            // The editor omits known members only after an explicit un-own action.
            delete progress.members[id];
            return;
          }
          var merged = own(progress.members, id) ? clone(progress.members[id]) : {};
          MEMBER_FIELDS.forEach(function (field) { put(merged, field, normalized.members[id][field]); });
          put(progress.members, id, merged);
        });
        progress.mainId = normalized.mainId;
        var hasExtensions = Object.keys(progress).some(function (key) { return key !== "mainId" && key !== "members"; });
        if (!hasExtensions && !progress.mainId && !Object.keys(progress.members).length) delete next[formationId];
        else put(next, formationId, progress);
        if (!validArchive(next)) return fail("新合阵存档校验失败，未保存。");
        serialized = JSON.stringify(next);
      } catch (error) {
        return fail("构建合阵个人进度失败，原存档与草稿均未修改。");
      }

      // Synchronous compare-before-write: no stale view may replace a newer archive.
      // QinshiAccounts remains the sole authority for account/lease checks and writes.
      var latestRaw;
      try { latestRaw = accounts.getItem(STORE_KEY); }
      catch (error) { return fail("保存前读取合阵存档失败，未覆盖原存档。"); }
      if (!isCurrent()) return fail("账号已切换，未保存合阵进度。请重新加载后重试。");
      if (latestRaw !== originalRaw) return fail("合阵存档已在其他页面更新，未覆盖。请保留草稿并重新加载后处理。");
      try {
        if (accounts.setItem(STORE_KEY, serialized) !== true) {
          return fail("保存合阵个人进度失败，当前账号可能为只读；原进度和编辑草稿已保留。");
        }
      } catch (error) {
        return fail("保存合阵个人进度失败，请检查浏览器存储权限；原进度和编辑草稿已保留。");
      }
      originalRaw = serialized;
      committed = next;
      status = Object.keys(next).length ? "valid" : "empty";
      return { ok: true, stored: clone(committed), error: "" };
    }

    return { read: read, save: save, isCurrent: isCurrent };
  }

  return { create: create, storeKey: STORE_KEY };
});
