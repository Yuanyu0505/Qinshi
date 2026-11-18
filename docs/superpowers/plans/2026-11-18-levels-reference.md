# 功能开放等级修订 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 仅修订功能开放等级分区指定资料，保留原图、搜索语义与其他八分区。

**Architecture:** 复用当前三表及共享查询，等级区间仍在第一列。仅为联赛增加紧凑分组视图；levels 专属 CSS 控制列宽和垂直居中。钻石端点按原文重叠。

**Tech Stack:** 原生 JavaScript/CSS、Node test、Playwright/msedge。

**Spec:** 用户提供 `C:/Users/pghyl/Downloads/Qin_功能开放等级_完整修订与UI优化_Codex直接执行指令_20261118.md`。

## Global Constraints

- 只删 0级关卡/奇遇、59级青铜终点、69级白银终点；只清空星宿及兵法指定附注。
- 阵位表不变，其他功能条件不变；只改 levels 资料与展示。
- 联赛14段；83/87重叠保留，不推断唯一归属；前三类服务器字段留空。
- 青铜、白银、黄金护符说明仅属大类来源资料，不推断每小段奖励；钻石不编造奖励。
- 原图与查看器保留；不触碰账号、存储、同步、计算或权限。

## Review Focus

- 筛选后联赛分组仅呈现命中行，不把同组未命中段补回。
- 等级区间取第一列，按交集筛选；59/69仍能在联赛查询。
- 混服与折扣专服完全分开；83/87显示所有字面匹配结果。
- 320/390窄屏不整页溢出，条件不丢字；输入焦点及草稿不丢失。
- 比较修改前快照，只发生授权数据变化；原图引用和阵位保持不变。

## Task 1: 资料与回归

**Files:** `data/other-reference-tables-a.js`, `tests/levels-reference.test.js`, `tests/fixtures/levels-reference-1.1.30.json`。
- [x] 保存40/8/3行三表基线。
- [x] 写授权差异、14段、护符来源与范围交集测试并观察失败。
- [x] 最小补丁实施，运行定向测试4/4通过。

## Task 2: 专属布局与浏览器

**Files:** `js/other-reference-ui.js`, `css/other-reference.css`, `tests/levels-reference-browser.cjs`。
- [x] 添加联赛大类分组显示，原始表与逐项卡片选择保留；默认推荐视图不堆叠14张卡。
- [x] levels 表格/时间线/卡片垂直居中，保留其他分区样式。
- [x] 浏览器6/6通过，保存30张 before/after 截图并验证320/390/820/1366/1920宽度，搜索、筛选、原图、焦点、返回。

## Task 3: 交付发布

**Files:** 五个现有版本载体、`docs/superpowers/reports/2026-11-18-levels-reference.md`。
- [x] 执行定向/全量单测及静态构建检查；全量1187项1180通过，7项基线既有失败，报告逐项列出；245资源检查通过。
- [x] 独立最终审查，来源标题修订RED→GREEN；记录截图、数据diff、83/87边界与未验证项。
- [ ] 版本1.1.31，合并本地master、推送main并核对Pages/PWA线上版本。

## 执行记录

- 用户任务书明确要求直接实施及测试，覆盖项目“不主动测试”的默认约定；无需重复方案确认。
- 使用当前checkout的新分支，保护既有Excel改动和非本任务文件；不创建额外worktree。
- 表头与正文水平起点不一由截图发现，浏览器断言RED→GREEN修正；其他分区样式不变。
- 来源标识审查建议按任务书资料准确性要求处理，区间用户修订与护符原图说明分别明确。无遗留审查建议。
- 最终完整单测7项失败均在修改前基线复现，不扩展范围修改其对应模块；已如实向用户说明并记录。
