# 全工具性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已确认的九项审查建议减少重复计算/渲染和启动开销，并用本地浏览器实测验证。
**Architecture:** 三组现有模块内改动并行实施，共享接口由主代理整合；保留纯计算核心作为结果基准，只有必要计算移到后台。
**Tech Stack:** 原生JavaScript/CSS、Service Worker、Node test、Playwright/msedge。
**Spec:** `docs/superpowers/specs/2026-10-23-performance-design.md`

## Global Constraints

- 计算、排序、账号隔离、写失败反馈、离线完整性保持不变。
- 本地隔离测试；无付费依赖、无真实同步空间请求、无发布。
- 不修改无关用户资料。

## Review Focus

- 已收藏排序依赖等级/缺口：图鉴局部更新不能漏掉位置变化。
- 未访问模块的跨区跳转与直接hash入口不能先捕获未定义依赖。
- 图库后台预取失败不能阻塞核心安装，但不能悄悄宣称图库已离线可用。
- 计算时编辑输入、切换账号/模块，不能回填旧快照结果。
- 写入去重只能跳过与已持久化内容相同的值，写入失败后必须可重试。

## Task 1: 查询与列表

**Files:** `js/app.js`, `js/atlas.js`, `js/progress.js`, 对应unit/browser测试。
**Interfaces:** 复用现有公开函数；新增图鉴派生查询API由app消费，原filterAtlas兼容。
- [x] 新增真实测试：一轮结果复用派生值；改变等级仍满足排序/汇总；搜索IME中间态不渲染；索引不同数据实例不串。
- [x] 运行新增测试确认预期失败。
- [x] 实现派生复用、索引和统一搜索，新增布局/行为测试。
- [x] 运行关联Node与浏览器测试，报告失败与结果。

## Task 2: 木人巷与计算响应

**Files:** `js/wooden-man-alley-ui.js`、对应planner（仅性能等价改动）、独立回归与测量脚本。
**Interfaces:** 原同步核心输入/输出保持，先测量再决定后台任务边界；与主代理协商公共计算任务helper。
- [x] 基线测量：500层目标/反向规划/道具库存，记录主线程阻塞和结果。
- [x] 新增失败测试：棋盘/高级设置编辑后控件节点、焦点、details保留。
- [x] 实现局部更新与必要后台执行，覆盖忙碌、异常、过期任务与离线回退。
- [x] 运行关联unit/browser测试及同输入复测。

## Task 3: 加载/PWA/绘制

**Files:** `index.html`, `service-worker.js`, `css/style.css`, 必要启动loader/模块初始化导出、Pages文件清单、独立测试。
**Interfaces:** 启动loader向app提供按分区加载/初始化的Promise API；app集成由主代理协调，禁止同时改同一文件。
- [x] 先测首次加载资源与滚动帧间隔基线。
- [x] 新增失败测试：大图懒加载、图库失败核心仍安装、完整图库可独立离线、迟加载分区和跨区导航可用。
- [x] 实现按需加载和稳定图库缓存、移动端低绘制成本；无Worker/file协议不得报错失去功能。
- [x] 运行关联PWA/browser测试，核对离线与完整性无退化。

## Task 4: 整合/验证

**Files:** `js/machine-beasts-ui.js`, `js/six-halls-ui.js`, 必要公共helper及报告。
- [x] 实测机关兽复杂流派规划；以原同步核心核对后台结果。
- [x] 新增无变化写入、失败重试测试后，实现成本输入刷新/保存去重。
- [x] 整合分区加载与后台任务，逐项检查三组接口。
- [x] 执行 `node tools/run-tests.cjs unit` 与 `node tools/run-tests.cjs browser`；连续完整通过两轮，记录各轮数量/失败。
- [x] 写入前后测量、模拟限制、剩余风险及全部改动清单；不自行发布。
