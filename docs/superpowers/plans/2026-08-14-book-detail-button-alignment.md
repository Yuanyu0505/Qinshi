# 典籍进阶详情按钮对齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将典籍详情按钮改名为“进阶详情”，并与右侧累计属性起点严格对齐。

**Architecture:** 复用既有 `book-tier-block`，将摘要的标签、属性和值按钮统一放入同一个两列网格。JavaScript 只调整按钮默认及复位文案，气泡行为保持不变。

**Tech Stack:** HTML、CSS、原生 JavaScript、Node.js 静态契约测试。

## Global Constraints

- 不修改典籍数据、累计计算或排序逻辑。
- 不更新 PWA。
- 根据项目约定，不主动运行测试、lint、格式化或浏览器验证。

---

### Task 1: 固化文案与对齐契约

**Files:**
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `js/app.js` 生成的 `.book-detail-toggle` 与 `css/style.css` 中的典籍品质布局。
- Produces: “进阶详情”文案和第二列对齐的静态契约。

- [ ] **Step 1: 添加默认文案契约**

断言默认按钮及关闭气泡后的文案均为“进阶详情”。

- [ ] **Step 2: 添加网格对齐契约**

断言按钮位于网格第二列、第二行并向左对齐，移动端卡片复用相同网格。

- [ ] **Step 3: 记录验证方式**

建议用户运行 `node --test serve.test.js`；本次不由 AI 执行。

### Task 2: 实现文案与布局

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `bookTierSummaryHtml()`、`bookTierDetailsHtml()`、`closeBookDetailPopover()`。
- Produces: 默认“进阶详情”按钮，以及与累计属性同起点的两列网格。

- [ ] **Step 1: 修改按钮文案**

将默认及关闭后的文案改为“进阶详情”，保留展开后的“收起”。

- [ ] **Step 2: 调整两列网格**

让摘要容器使用 `display: contents`，标签位于第一列，属性位于第二列，按钮位于第二行第二列并 `justify-self: start`。

- [ ] **Step 3: 保持移动端适配**

移动端卡片只调整父网格右列为弹性宽度，不改变气泡和其他装备布局。

- [ ] **Step 4: 静态检查并提交**

检查差异范围和空白错误，不运行自动测试；提交功能分支并以 fast-forward 合并到本地 `master`。
