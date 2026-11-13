# Other reference 1.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 按用户完整执行包优化其他资料九区展示、澄清五行需求数量、修复首次原图点击，以1.1.0合并发布。

**Architecture:** 保留tablesFor/filterRows/matchesLevelBand及四个原始data文件。展示映射和分组仅在other-reference-ui.js中进行；CSS仅作用于该分区。内存状态不落盘，PWA沿用现有发布机制。

**Tech Stack:** 原生JavaScript、DOM、CSS container queries/ResizeObserver、Node test、Playwright/Edge。

**Spec:** docs/other-reference/1.1.0-request.md（用户ZIP原文）；版本号以用户后续1.1.0指令为准。

## Global Constraints

- 50表970浏览行（49表807原行+163派生行）、九区、六节攻略、31原图、原值/顺序/列/来源/审核状态保持不变。
- 五行复用elements-cost25条与elements-stones3条；同图不新增asset。三册防御120000及五张partial保留。
- 不改计算、存储、其他模块业务；当前工作区新功能分支，显式暂存，保护用户Excel/无关未跟踪资料。
- 用户已提供详细方案且要求直接执行，沿用其不重复确认的偏好；本包明确要求实际浏览器验收，按本次授权运行测试。直接“合并同步”覆盖包内不得擅自部署限制。

## Review Focus

1. 搜索失焦触发change先移除按钮，导致首次点击丢失：原框保持聚焦直接点击、中文组合及键盘关闭回焦。
2. 来源分组吞并重复来源或改变筛选：按filterRows结果顺序分组，逐记录保留三列及163总数。
3. 速度断点只用viewport，桌面侧栏后窄容器不切换：ResizeObserver按容器测宽，仅跨断点重绘，不清筛选。
4. 降级审核信息把partial隐藏：警示持续可见；源路径折叠但可查；未确认名称不猜填。
5. 纯UI改动修改源数据/账号：冻结运行时内容hash、原始四data与31图hash、隔离上下文localStorage字节不变。

## Task 1: 数据基线与首次点击

Files: tests/other-reference-110.test.js、tests/other-reference-110.cjs、tests/fixtures/other-reference-elements-110.json；js/other-reference-ui.js事件分支。

- [ ] 先写原生浏览器“输入后第一次点击原图”用例，按原样运行看到dialog未打开，再精准过滤搜索框change，不吞错不刷新。
- [ ] 固定970行规范化内容hash f08f62f45fa01f13bb8f279ffa0e3e142d3e292b402815906d4c7b5be9a294c5；完整25+3与用户JSON逐行相等。
- [ ] 验证首次点击、Esc回焦、存储不变、原字节不变。

## Task 2: 统一层级及九区阅读视图

Files: js/other-reference-ui.js、css/other-reference.css；tests/other-reference-110.cjs。

- [ ] 先写需求数量标签、来源43组163记录、分组optgroup、partial可见、首屏单表无选择器、窄容器速度及等级时间线断言，运行看到旧UI不满足。
- [ ] 使用可见标题映射，不改tablesFor元数据；常规表caption语义保留但视觉隐藏；长说明/来源路径折叠，partial显式警示。
- [ ] 九区配置分组；来源按姓名归组保留原序；速度紧凑行/构成展开；等级移动时间线；灵宝单表去冗余；器灵和弟子材料分组/快速切换。普通宽表保留局部横滚与逐项卡片。
- [ ] 原图简洁按钮、次级文件名、精简移动工具栏，保留白名单/双指/重试/键盘/关闭回焦。
- [ ] 用容器宽度适配速度；目录窄手机2列；IME仅在组合完成更新结果；每子表独立草稿及原排序/区间语义保持。

## Task 3: 真实多端回归与发布

Files: tests/other-reference-browser.cjs（旧展示断言合理更新）、docs/other-reference/1.1.0-verification.md、版本文件。

- [ ] 包内11视口加1024×1366、三档等效CSS布局缩放，实际搜索/品质/原图/切表/排序/滚动和无页溢出；生成九区截图。
- [ ] 原资料单元、完整项目单元及新旧资料浏览器和PWA离线实测；记录实际通过/失败，不把等效布局冒称物理真机或菜单缩放。
- [ ] 升级version.json、js/pwa.js、service-worker.js、index.html资源身份为1.1.0，无新增脚本/数据依赖。
- [ ] 单独整分支审查；合并master后复验；推送GitHub main，跟踪Pages，核对线上代码与31图hash；交付各区实施与剩余限制。
