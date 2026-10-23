# 秘境分区 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for integration; independent pure state and planner domains may run under dispatching-parallel-agents. Steps use checkboxes for tracking.

**Goal:** 实施用户确认的离线秘境进度、来源和精确跨期规划。
**Architecture:** 独立数据、纯状态核、纯精确规划和UI；现有账号/PWA/Worker作为集成边界。状态核与规划器通过明确纯JSON接口隔离，主代理负责UI和集成。
**Tech Stack:** 原生JS/CSS、Node test、Playwright/Edge、Service Worker。
**Spec:** docs/superpowers/specs/2026-10-23-secret-realm-design.md

## Global Constraints

- 严守设计中的来源、35档奖励、初始期数、UTC+8/14天和排序规则。
- 只使用账号存储qinshi_secret_realms_v1，无真实充值、云API、付费依赖。
- 已结束期不编辑，不以预测更新真实累计/库存，不重复计入已得抽数。
- 无关Excel和用户资料保持原样；用户已授权两轮测试及最终发布。

## Review Focus

- 日期恰在UTC+8零点、挂后台跨期及系统时钟回退不能重开结束期。
- 已购通行证部分领取、每日错过与今日已领不能双算或重复收款。
- 代金耗尽/足额和自定义折扣尾差，行/期/总计一致，最优性独立验证。
- 已删除秘境、损坏存储、只读账号、账号切换/同步覆盖不能回填旧结果。
- 超大目标和648无限不得造成按目标规模内存分配或UI长任务。

## Task 1: 数据与纯状态核

Files: data/secret-realm.js, js/secret-realm-core.js, js/secret-realm-core.test.js。
Interfaces: SECRET_REALM_DATA和设计中SECRET_REALM_CORE全部API；buildPlanningInput是Task2/3唯一计算输入。
- [x] 测试先行：首次/删除后默认、14天零点、每日剩余、部分已购、过去锁定、结束自动推进、保存数据损坏与不可变输入。
- [x] node --test js/secret-realm-core.test.js，先确认RED再实现GREEN。
- [x] 正常化严格验证和纯操作，完整覆盖设计中的中文错误。

## Task 2: 精确规划

Files: js/secret-realm-planner.js, js/secret-realm-planner.test.js。
Interfaces: consumes buildPlanningInput JSON shape; produces SECRET_REALM_PLANNER.plan(input) -> design result schema。
- [x] 先测已达标零购买、有限组合非贪心、逐期648许可、最快/最省钱不同、代金和尾差、超大目标。
- [x] node --test js/secret-realm-planner.test.js，记录RED→GREEN；以独立穷举小例验证，不调用自身生成期望。
- [x] 有界礼包精确求解、无限648数学补足，所有输出按期/行重建。

## Task 3: 账号UI和离线集成

Files: js/secret-realm-ui.js, css/secret-realm.css, index.html, js/app.js, js/partition-loader.js, js/calculation-worker.js, service-worker.js, .github/workflows/pages.yml, tests/secret-realm-browser.cjs。
Interfaces: consumes state/planner above and existingQinshiAccounts/QinshiCalculationRunner；UI导出SECRET_REALM_UI.init(window)、captureView()、restoreView(view)。
- [x] 浏览器RED：hash进区、初始历史锁定/首期隐藏、未开始不写实际、逐期设置、费用、账户隔离和320/390/768/1100/1440布局。
- [x] 采用显式表单保存+源行保存，避免输入重建；展示进度/规划/参考子页、共享代金/平台管理、所有方案/费用/不足反馈。
- [x] 注册kind=secret-realm后台计算，取消过期任务；前台/进入/下一北京时间零点定时器和每次操作前复核时序。
- [x] 真实账号存储导出导入/清空、删除不复生和PWA离线Worker测试，无生产同步请求。
- [x] node --test tests/secret-realm-browser.cjs及全量Node/browser必须通过。

## Task 4: 复审、两轮验收和发布

Files: docs/superpowers/reports/2026-10-23-secret-realm.md，版本相关文件。
- [x] 一次新上下文全分支复审，Important/Critical逐项RED→GREEN，不隐藏失败。
- [x] 升级为1.0.59，核对HTML/SW/PWA/loader/version.json一致及Pages资源。
- [x] 同一最终代码连续两轮 node tools/run-tests.cjs unit 和 node tools/run-tests.cjs browser，零失败零跳过。每轮788项Node及205项浏览器，合计1986次，退出码0。
- [ ] 仅提交本任务文件，快进合并master，普通推送master:main，读工作流结果和线上版本/新资源。
- [x] 报告实际测试数量和模拟限制，不把桌面模拟当实机；最终交付中记录发布提交及线上核实结果。
