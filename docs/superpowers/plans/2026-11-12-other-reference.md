# Other Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** 按用户提供的完整实施包增加只读其他资料九分区，精确数据与原图并行展示。
**Architecture:** 复用一级分区与延迟加载器；独立数据、转录表与限定作用域UI，不访问账号或业务存储。原图按字节归档，按需打开原生dialog查看，不预加载大图。
**Tech Stack:** 原生JavaScript/CSS/HTML，Node test，Playwright Chromium/Edge。
**Spec:** assets/other-reference/sources/04_实施与验收/Codex_完整执行指令.md；用户要求严格实施并更新合并同步，直接执行。

## Global Constraints

- 固定九区：诸子卡、五行天枢录、橙弟子来源、灵宝、极限速度、守护神、功能开放等级、器灵、弟子相关。
- 不改旧资料、计算、账户、库存、存储键或备份格式；新模块无持久化状态。
- 三册防御采用用户确认120000，原图保持原样；概率仅作攻略示例。
- 本次任务书明确授权原有测试及响应式实测，使用隔离测试账号与浏览器。

## Review Focus

- 所有源图与清单哈希一致，误传14只留档，不用作等级资料。
- 搜索中文/符号不重建输入框，保留输入焦点，表格局部滚动不撑宽页面。
- 各分区/子表筛选状态独立且只存内存；切回旧模块不影响原筛选。
- 原图查看保留关闭、Escape、焦点返回、触控滚动/缩放及加载失败重试。
- 未核实密集资料明确partial，不能因存在图片宣称完整转录。

## Task 1: 原始资产与精确数据

Files: assets/other-reference/sources/**; data/other-reference-data.js; data/other-reference-tables-{a,b,c}.js; tests/other-reference.test.js。
- [x] 添加先失败的数据完整性/哈希测试。
- [x] 核对31张图片；直接读28条五行数据、红卡六节与确认修订；并行人工转录其余原图，记录明确不确定格子。
- [x] 所有表使用{id,section,title,columns,rows,sourcePaths,verification,note}统一只读结构。
- [x] 运行Node新测试并记录实际数量。

## Task 2: 九区查询和来源查看

Files: js/other-reference-ui.js; css/other-reference.css; index.html; js/partition-loader.js; js/app.js; tests/other-reference-browser.cjs。
- [x] 先写浏览测试：九区可达，中文筛选、品质/表选择、资料来源、dialog关闭与无持久化变化。
- [x] 接入唯一other-reference入口和容器，不变更其他分区路由。
- [x] 3×3索引、局部子栏目筛选、表格/卡片切换、长攻略折叠、来源与审核状态。
- [x] 原生dialog展示原图，缩放/平移/键盘关闭和加载错误，图片仅按需下载。
- [x] 11类视口及125/150/200%等效缩放检查，产出390/820/1440截图；检查无控制台异常。

## Task 3: 审计与发布

Files: docs/other-reference/DATA_AUDIT.md; version.json; service-worker.js; js/pwa.js; index.html。
- [x] 分区数量、转录行数、图片覆盖、partial状态逐项审计，提供接入说明。
- [x] 执行项目单元测试及针对性旧模块浏览器回归；如既有失败，精确记录，不顺带改业务。
- [x] 版本1.0.100，静态资源/延迟脚本/PWA身份一致；代码/data预缓存，原图按需缓存避免首次下载全包。
- [ ] 审查改动范围，仅提交任务文件，合并本地master并推送main，跟踪Pages及在线资源。
