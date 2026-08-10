# 答题正确答案查询 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `答题.jpg` 录入题目与标红正确答案，在离线页面中按题目关键词搜索并只显示正确答案。

**Architecture:** `data/quiz.js` 只暴露题目与正确答案数组，`js/quiz.js` 提供独立的纯搜索函数，`js/app.js` 负责答题分区事件与渲染。HTML 新增分区和脚本，CSS 使用现有卡片视觉语言扩展题目结果样式。

**Tech Stack:** 原生 JavaScript、Node 内置 `node:test`、HTML、CSS。

## Global Constraints

- 在 `codex/atlas-upgrade-target` 累计分支修改，保留全部既有功能。
- 每道题仅保存和显示题目及红色正确答案，禁止保存或展示错误选项。
- 关键词仅匹配题目，不匹配答案。
- 用户指定手动验证，本次不运行自动测试、lint 或浏览器自动检查。

---

### Task 1: 题库数据与搜索核心

**Files:**
- Create: `data/quiz.js`
- Create: `js/quiz.js`
- Create: `js/quiz.test.js`

**Interfaces:**
- Consumes: `window.QUIZ_DATA.items`，每项为 `{ question: string, answer: string }`。
- Produces: `QUIZ.search(items, query)`，返回题目包含关键词的记录；空关键词返回全部记录副本。

- [x] **Step 1: 写入搜索规则用例**

```js
assert.deepStrictEqual(
  QUIZ.search([{ question: "石兰的真名是？", answer: "小虞" }], "真名"),
  [{ question: "石兰的真名是？", answer: "小虞" }]
);
assert.deepStrictEqual(QUIZ.search(items, "小虞"), []);
```

- [x] **Step 2: 实现题目搜索函数**

```js
function search(items, query) {
  var q = normalize(query);
  if (!q) return (items || []).slice();
  return (items || []).filter(function (item) {
    return normalize(item.question).indexOf(q) !== -1;
  });
}
```

- [x] **Step 3: 从 `答题.jpg` 录入数据**

将每行的第一列转为 `question`，把唯一红字选项转为 `answer`；不录入其余选项。

### Task 2: 答题分区界面

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `window.QUIZ_DATA` 和 `window.QUIZ.search`。
- Produces: `#partition-quiz`、`#quiz-search`、`#quiz-count`、`#quiz-results`。

- [x] **Step 1: 增加标签、分区和脚本加载顺序**

```html
<button type="button" class="tab" data-partition="quiz">答题</button>
<section id="partition-quiz" hidden>...</section>
<script src="data/quiz.js"></script>
<script src="js/quiz.js"></script>
```

- [x] **Step 2: 绑定输入与渲染**

```js
el.quizSearch.addEventListener("input", function () {
  quizState.query = el.quizSearch.value;
  applyQuiz();
});
```

- [x] **Step 3: 只渲染题目与正确答案**

```html
<article class="quiz-item">
  <div class="quiz-question">题目文本</div>
  <div class="quiz-answer"><span>正确答案</span>答案文本</div>
</article>
```

### Task 3: 交接

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-10-quiz-answer-search-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-quiz-answer-search.md`

**Interfaces:**
- Consumes: 完整题库和答题页面。
- Produces: 功能说明及人工验收项。

- [x] **Step 1: 补充 README 的分区说明**

新增“答题：题目关键词搜索，只显示正确答案”。

- [ ] **Step 2: 提交改动**

```bash
git diff --check
git add data/quiz.js js/quiz.js js/quiz.test.js index.html js/app.js css/style.css README.md docs/superpowers/specs/2026-08-10-quiz-answer-search-design.md docs/superpowers/plans/2026-08-10-quiz-answer-search.md
git commit -m "feat: add quiz answer search"
```

- [x] **Step 3: 交接人工检查项**

说明自动验证未执行；用户检查题目关键词搜索以及结果不含错误选项。
