"use strict";

// Intentionally not executed by the coding agent: project acceptance is manual.
const test = require("node:test");
const assert = require("node:assert/strict");
const Rules = require("./inscription-rules.js");
const Progress = require("./inscription-progress-rules.js");

test("blue one is record-only and collapses indistinguishable tiers", function () {
  assert.equal(Rules.qualities.some(function (quality) { return quality.id === "b1"; }), false);
  assert.equal(Object.prototype.hasOwnProperty.call(Rules.recipes, "b1"), false);
  assert.deepEqual(Progress.termsFor("鬼盾", "b1").filter(function (term) { return term.attr === "速"; }), [{ attr: "速", tier: "?" }]);
  assert.equal(Progress.plain({ attr: "速", tier: "?" }, "b1", "鬼遁"), "1速（档位不可辨）");
  assert.equal(Progress.resolve("速", "+1", "", "鬼遁", "b1").term.tier, "?");
  assert.equal(Progress.resolve("抗暴击", "1%", "", "人遁", "b1").term.tier, "?");
  assert.equal(Progress.resolve("速", "1", "H", "鬼遁", "b1").term, null);
});

test("records preserve explicit tiers, legacy unknowns, and excess entries", function () {
  var raw = { quality: "橙色", star: "2", shield: "鬼盾", subs: ["速", "old text", "防", "extra"], subValues: ["4", "+old", "12%", "7"] };
  assert.equal(Progress.qualityId(raw), "o2");
  assert.equal(Progress.entries(raw).length, 4);
  assert.equal(Progress.resolve("速", "4", "M", "鬼盾", "o2").term.tier, "M");
  assert.equal(Progress.resolve("old text", "+old", "", "鬼遁", "o2").term, null);
  assert.deepEqual(raw.subValues, ["4", "+old", "12%", "7"]);
  assert.equal(Progress.qualityId({ quality: "unknown", star: "2" }), "");
  assert.equal(Progress.resolve("3防御", "12%", "", "鬼盾", "o2").term.tier, "H");
});

test("legal completions enforce sources, distinct identities, and two high maximum", function () {
  assert.equal(Progress.canComplete("天府", "天遁", "o2", [{ attr: "攻", tier: "H" }, { attr: "暴击伤害", tier: "H" }, { attr: "内力", tier: "M" }]), true);
  assert.equal(Progress.canComplete("天府", "天遁", "o2", [{ attr: "攻", tier: "H" }, { attr: "攻", tier: "H" }]), false);
  assert.equal(Progress.canComplete("天府", "人遁", "p2", [{ attr: "血", tier: "L" }, { attr: "血", tier: "M" }]), false);
  assert.equal(Progress.canComplete("天府", "人遁", "p2", [{ attr: "血", tier: "L" }, { attr: "血", tier: "H" }]), true);
  assert.equal(Progress.validateSlot({ tian: "天府", shield: "鬼遁", quality: "蓝色", star: "1", subs: ["速"], subValues: ["1"], subTiers: ["?"] }).valid, true);
  assert.equal(Progress.validateSlot({ tian: "天府", shield: "鬼遁", quality: "蓝色", star: "1", subs: ["", ""], subValues: ["", "orphan"] }).valid, false);
});

test("formation classification uses every candidate without fuzzy disciple merging", function () {
  var data = { items: [{ candidates: [{ name: "端木蓉" }, { name: "神镜仙端木蓉" }] }] };
  var names = Progress.formationNames(data);
  assert.equal(names.has("端木蓉"), true);
  assert.equal(names.has("神镜仙端木蓉"), true);
  assert.equal(names.has("神端木蓉"), false);
});
