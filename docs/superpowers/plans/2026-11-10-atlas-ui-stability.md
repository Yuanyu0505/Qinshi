# 图鉴 UI 与交互稳定性 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. 用户已授权直接执行及发布，无需再次确认。

**Goal:** 修复图鉴卡片 DOM 更新异常，改善库存编辑、信息层级与响应式阅读，保持业务语义不变。

**Architecture:** 复用 app.js 图鉴模板及结果事件委托；稳定替换生命周期及焦点；专属 CSS 按实际容器宽度排版，不引入依赖。继续由 ATLAS 提供查询和计算结果。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node test、隔离 Playwright Edge。

**Spec:** 用户附件 `104cda1b-dd47-4b8b-8cb0-a17f730995c7/已粘贴的文本.txt`，含22节要求；用户特别要求先稳定性、手机库存与信息层级，后桌面密度。

## Global Constraints

- 不修改 js/atlas.js、data/atlas.js、查询规则、计算、库存规则、账号权限、存储键或格式。
- 保留所有资料和操作，纯 UI 状态只驻留内存；所有新增样式限图鉴作用域。
- 保留无关 Excel 和 untracked；模拟账号隔离，拦截外部网络，不使用真实数据。
- 最新任务明确要求实际测试，覆盖此前 AGENTS 中不主动测试的默认约定。
- 已明确授权合并、更新、推送，发布后核对 Actions 与线上版本。

## Review Focus

1. 焦点仍在已修改数字框时移除节点触发重入，必须不丢失后续点击。
2. 编辑中的中文备注、魂魄草稿、详情展开在无关重绘后保留；既有关闭编辑规则不变。
3. 底部导航、visualViewport、滚动与缩放后的菜单不能遮挡或越界。
4. 收藏排序与局部 DOM 顺序一致；同一ID不重复。
5. 容器宽度窄于视口，库存编辑不能强行四列；无结果与初始状态分开。

### Task 1: 稳定性及核心编辑体验

**Files:** js/app.js；tests/atlas-ui-browser.cjs。
**Interfaces:** ATLAS.queryAtlas/upgradePlan/summarizeAtlasStates 不变；refreshAtlasCard(id)、applyAtlas(changedId, previousEditor) 继续由事件委托消费。

- [x] 写浏览器回归：聚焦等级后变更、连续操作、非法小数、草稿保留与取消；先观察旧实现失败及日志。
- [x] 修复焦点导致的重入，稳定卡片局部更新；错误仅原位更新并定位原字段。
- [x] 测试通过，保留现有保存与关闭编辑行为。

### Task 2: 信息结构及响应式 UI

**Files:** index.html、css/style.css、js/app.js；同一浏览器测试。
**Interfaces:** 沿用已有 data-atlas-*、控件 ID；单模板的资料 details，临时展开状态不写账号。

- [x] 先写布局测试：分区三列、手机库存成组、摘要数值、桌面双列/编辑跨列、菜单顶部底部边界。
- [x] 分区/搜索/等级视觉分组；身份/目标资源/完整资料三层；轻量状态；统一5项汇总；一个空状态。
- [x] 备注菜单按实际剩余空间定位，内部滚动，保留多选语义和外部关闭；Escape回焦点。
- [x] 按内容宽度双列，编辑跨列；测试14视口及等效缩放宽度，截图逐类检查并调整。

### Task 3: 回归、审查与发布

**Files:** tests、报告及现有 PWA 版本文件。

- [x] 运行 npm test、图鉴新测试与原有 performance-queries/ui-performance/responsive-ux/图鉴备份相关测试；记录真实失败，不改预期掩盖。
- [x] 核对保护文件零差异、查询与汇总前后快照、账号切换与只读；记录软键盘/真机限制。
- [x] 独立只读代码审查，修复重要问题。
- [x] 更新 PWA 至1.0.97；图鉴32项、最终关联12项通过，完整单元结果及发布例外已记录。合并、推送和Pages的实际结果见最终交付消息。

## Decisions / Ledger

- 直接采用渐进改造：不新增密度切换控件，用同一模板的资料折叠和容器双列降低状态复杂度。
- 不创建新 worktree：沿用用户当前工作区，独立分支并精确暂存。
- 多选来源筛选保留选择后菜单打开，避免每选一项重复打开；这是保留既有交互，不新增筛选语义。
- Pre-flight: Task 1和2共享卡片更新机制；先稳定生命周期，再添加details与容器排版，Task 3验收两者。
- Task 1 complete: 新测试3项RED→GREEN，原有performance-queries合计7项通过；根因是同步blur重入，非吞错。
- Task 2 complete: 首轮14视口和草稿/状态测试通过；后补全177项、旧新14查询快照、等效缩放与账号测试后25项通过。
- Task 3 Ruling: 完整单元的既有机关兽溢出期望60000/实际59700保持不动。用户明确允许记录后发布，符合本次不改计算逻辑边界，风险为既有差异继续存在。
- Task 3 Ruling: Node24 navigator.locks导致原有收藏测试停滞，运行环境禁用该实验全局，20项原测试恢复；Git安全目录只用进程配置，不改仓库或系统配置。
- Final review: 一次独立只读复核。等级显示、details失点击、排序指针目标、隐藏覆盖及旧HTML对照问题均有失败先行测试并修复。新增键盘/排序焦点回归；不改变业务语义。
- Final Ruling: 隐藏样式与旧HTML对照原列Minor，但前者影响初始隐藏契约、后者影响新旧数据对照证据，按正确性问题在同一修复批次处理；没有遗留Minor。
- Final Ruling: 真机软键盘和Safari不作未经测试承诺；风险为这些平台仍需用户手动验收。Excel和历史untracked不属于任务，保持原样。
- Final verification: 最终图鉴套件32/32通过；完整单元1153/1154通过，仅用户已授权保留的机关兽差异。PWA版本与缓存为1.0.97，新样式已入预缓存；实际发布状态见交付消息。
