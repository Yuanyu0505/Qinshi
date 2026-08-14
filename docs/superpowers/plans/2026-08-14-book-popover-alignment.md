# 典籍详情气泡属性列对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让典籍详情气泡中所有阶段的属性列上下对齐。

**Architecture:** 只调整阶段行的 CSS 网格列定义，不改 DOM 和累计数据。通过统一固定标签列宽消除每行独立 `max-content` 造成的属性起点偏移。

**Tech Stack:** CSS、现有 Node 源码契约。

## Global Constraints

- 阶段标签列统一为 `46px` 并右对齐。
- 属性列左对齐，允许同一阶段内部自然换行。
- 不修改 JavaScript、HTML、PWA 或其他分区。
- 测试与浏览器验收由用户执行，AI 只编写契约并进行静态复核。

---

### Task 1: 统一阶段标签列宽

**Files:**
- Modify: `serve.test.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.book-popover-stage-row` 与 `.book-popover-stage-label`。
- Produces: 所有阶段行共享相同的属性列起点。

- [ ] **Step 1: 写 CSS 契约**

在 `serve.test.js` 增加断言，要求阶段行使用 `46px minmax(0, 1fr)`，阶段标签包含 `text-align: right`。

- [ ] **Step 2: 记录用户可执行的 RED 命令**

```powershell
node --test serve.test.js
```

实现前预期新增契约失败；按照项目约定，AI 不主动执行。

- [ ] **Step 3: 修改 CSS**

```css
.book-popover-stage-row {
  grid-template-columns: 46px minmax(0, 1fr);
}
.book-popover-stage-label {
  text-align: right;
}
```

- [ ] **Step 4: 记录用户可执行的 GREEN 命令**

建议用户执行 `node --test serve.test.js`，并在浏览器检查四个阶段的首个属性左边缘一致。

- [ ] **Step 5: 提交并合并**

```powershell
git add serve.test.js css/style.css docs/superpowers/specs/2026-08-14-book-popover-alignment-design.md docs/superpowers/plans/2026-08-14-book-popover-alignment.md
git commit -m "fix: align book popover stage values"
git merge --ff-only codex/book-popover-alignment
```

不更新 PWA，保留功能分支和工作树。
