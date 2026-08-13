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

test("hasQuery：只有非空白关键词才进入结果展示状态", () => {
  assert.strictEqual(QUIZ.hasQuery(""), false);
  assert.strictEqual(QUIZ.hasQuery("   "), false);
  assert.strictEqual(QUIZ.hasQuery("机关"), true);
});

test("mergeItems：默认题编辑后保留编辑结果，不补回原错误题目", () => {
  const defaults = [
    { question: "石门峡残月谷，是唯一人一剑，尽屠三百秦军？", answer: "盖聂" },
    { question: "第二道默认题", answer: "答案二" }
  ];
  const saved = [
    { id: "default-0", question: "石门以残月谷，是唯一一人一剑，尽屠三百秦兵的是？", answer: "盖聂" },
    { id: "custom-1", question: "手动新增题", answer: "自定义答案" },
    { id: "default-0", question: defaults[0].question, answer: defaults[0].answer }
  ];

  assert.deepStrictEqual(QUIZ.mergeItems(defaults, saved), [
    saved[0],
    saved[1],
    { id: "default-1", question: "第二道默认题", answer: "答案二" }
  ]);
});
