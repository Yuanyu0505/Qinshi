# 答题区仅搜索时展示结果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让答题分区默认隐藏题库，仅在输入有效关键词后展示搜索结果。

**Architecture:** 题库纯逻辑层提供有效关键词判断，页面渲染层在搜索前控制结果容器的隐藏和清空。现有搜索及只读结果卡片保持不变。

**Tech Stack:** 原生 JavaScript、Node 内置断言测试

## Global Constraints

- 空关键词与纯空格不得渲染题目或无结果提示。
- 有效关键词继续复用现有题库匹配规则。
- 不修改题库数据、答案、存储格式或布局。
- 按项目约定，自动测试和手动验收由用户执行；AI 不主动运行验证命令。

---

### Task 1: 增加有效查询判断并控制结果容器

**Files:**
- Modify: `index.html`
- Modify: `js/quiz.test.js`
- Modify: `js/quiz.js`
- Modify: `js/app.js`

**Interfaces:**
- Produces: `QUIZ.hasQuery(query): boolean`。
- Consumes: `quizState.query`、`el.quizResults`、现有 `QUIZ.search()`。

- [ ] 测试空字符串、纯空格和有效关键词的查询状态。
- [ ] 在 `js/quiz.js` 增加并导出 `hasQuery()`。
- [ ] `applyQuiz()` 在无有效关键词时清空并隐藏结果容器后提前返回。
- [ ] 有有效关键词时取消隐藏并继续渲染匹配结果或无结果提示。
- [ ] 只提交上述三个 JavaScript 文件，不包含工作簿或图片。
