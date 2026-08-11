# Quiz Readonly and Inscription Subvalues Implementation Plan

> 状态更新：Task 1 的答题只读改动已按用户要求单独回退；Task 2、Task 3 的铭文改动继续保留。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将答题分区改为只读查询，并为铭文三条副属性增加可保存、可展示的附加内容。

**Architecture:** 答题继续加载默认题库与历史 localStorage 数据，但删除所有写入入口。铭文使用 `subs` 保存基础词条、`subValues` 保存对应附加内容，统一通过组合函数生成个人进度和查询结果中的展示文本。

**Tech Stack:** 原生 JavaScript、HTML 字符串渲染、CSS Grid、localStorage。

## Global Constraints

- 保留累计工作树中的全部既有改动。
- 不主动删除历史答题数据。
- 铭文极致属性和重复次数判断仅依据基础词条。
- 项目的测试、lint 和浏览器验收由用户自行执行。

---

### Task 1: 答题分区只读化

**Files:**
- Modify: `index.html:123-141`
- Modify: `js/app.js:71-76`
- Modify: `js/app.js:271-345`
- Modify: `css/style.css:124-132`

**Interfaces:**
- Consumes: `loadQuizItems()` 和 `QUIZ.search(items, query)`。
- Produces: 仅包含题目与正确答案的只读结果卡片。

- [x] **Step 1:** 删除新增题目的 HTML 表单和对应 DOM 引用。
- [x] **Step 2:** 删除新增、保存、删除事件和写入函数，保留历史题目加载。
- [x] **Step 3:** 从结果卡片中移除编辑输入框和按钮，并删除不再使用的 CSS。

### Task 2: 铭文副属性附加内容

**Files:**
- Modify: `js/inscription.js:86-108`
- Modify: `js/inscription.js:142-208`
- Modify: `css/style.css:144-170`
- Modify: `css/style.css:259-305`

**Interfaces:**
- Consumes: `slot.subs: string[]`、新增 `slot.subValues: string[]`。
- Produces: `subDisplayText(base, value)` 组合文本，以及带三个附加输入框的编辑界面。

- [x] **Step 1:** 加载进度时将 `subValues` 规范为三个字符串。
- [x] **Step 2:** 为副属性1至3各增加一个 `.ins-edit-sub-value` 输入框，恢复已保存内容。
- [x] **Step 3:** 保存时同时写入 `subs` 和 `subValues`，空基础词条不保存附加内容。
- [x] **Step 4:** 个人进度展示使用基础词条与附加内容的组合文本，极致样式仍依据基础词条。
- [x] **Step 5:** 调整桌面和窄屏布局，使下拉框与输入框清晰排列。

### Task 3: 查询结果显示当前副属性

**Files:**
- Modify: `js/inscription.js:250-258`
- Modify: `css/style.css:286-320`

**Interfaces:**
- Consumes: `progress[keyOf(item)].slots` 中按天位、盾位匹配的保存位置。
- Produces: `currentSubstatsHtml(savedSlot)` 绿色当前副属性区块。

- [x] **Step 1:** 为每个查询位置匹配对应的已保存天位·盾位。
- [x] **Step 2:** 在可洗练候选词条下方输出绿色当前副属性标签和三条组合内容。
- [x] **Step 3:** 对已保存但未设置副属性的位置输出绿色“未设置”。

### Task 4: 差异检查与提交

**Files:**
- Review: `index.html`
- Review: `js/app.js`
- Review: `js/inscription.js`
- Review: `css/style.css`

- [x] **Step 1:** 检查答题区不存在新增、编辑、保存、删除入口，且未清除历史数据读取。
- [x] **Step 2:** 检查铭文旧存档兼容、基础词条判断和附加内容组合逻辑。
- [ ] **Step 3:** 提交当前累计功能分支；不执行自动验证。
