"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const UI = require("./account-profiles-ui.js");

test("账号显示同时包含名称、服务器和主账号标记", () => {
  assert.equal(UI.accountLabel({ name: "主号", server: "微信一区" }, true), "主号 · 微信一区 · 主账号");
  assert.equal(UI.accountLabel({ name: "小号", server: "QQ一区" }, false), "小号 · QQ一区");
});

test("手动排序只交换两个非主账号", () => {
  assert.deepEqual(UI.swapOrder(["main", "a", "b"], "a", "b", "main"), ["main", "b", "a"]);
  assert.deepEqual(UI.swapOrder(["main", "a", "b"], "main", "b", "main"), ["main", "a", "b"]);
});

test("确认名称比较会去除首尾空格但保持文字精确", () => {
  assert.equal(UI.confirmationMatches(" 主号 ", "主号"), true);
  assert.equal(UI.confirmationMatches("主号1", "主号"), false);
});
