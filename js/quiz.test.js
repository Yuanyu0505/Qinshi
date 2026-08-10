const { test } = require("node:test");
const assert = require("node:assert");
const QUIZ = require("./quiz.js");

const items = [
  { question: "石兰的真名是？", answer: "小虞" },
  { question: "荆轲的武器是？", answer: "残虹" }
];

test("search：仅按题目关键词返回匹配记录", () => {
  assert.deepStrictEqual(QUIZ.search(items, "真名"), [items[0]]);
  assert.deepStrictEqual(QUIZ.search(items, "小虞"), []);
});

test("search：空关键词返回全部记录的副本", () => {
  const result = QUIZ.search(items, " ");
  assert.deepStrictEqual(result, items);
  assert.notStrictEqual(result, items);
});
