# Reference Expansion Implementation Plan

> **For agentic workers:** Use test-driven-development for each independent task and verification-before-completion for integration.

**Goal:** 实现已确认七类资料与临时计算、合阵极限参考和机关兽表头修订。

**Architecture:** 数据由只读工作簿提取到独立UMD；纯计算不触碰账户；独立扩展视图由现有资料目录挂载。合阵模块仅追加独立参考资料。

**Tech Stack:** Python标准库XML、原生JavaScript、CSS、Node test、隔离Edge/Playwright。

**Spec:** docs/superpowers/specs/2026-11-24-reference-expansion-design.md

## Global Constraints
不修改原工作簿，不保存新个人进度；固定27天4周、账号上限100、累计领取、四位分隔、下拉最多十项；不改变合阵计算与原资料语义。

## Review Focus
1. 合并单元格不能把金蟾结果当作其他选项继承。
2. 空值、零值、重复选中和异常材料不得形成虚假合计。
3. 星段区间与等级边界不可多算终点。
4. 重进分区不可堆积监听器或写入账号。
5. 新脚本同时进入lazy loader、PWA缓存和Pages打包。

## Task 1: 数据与纯计算
- Files: tools/build_reference_expansion.py; data/reference-expansion.js; js/reference-calculators.js; tests/reference-calculators.test.js。
- Produces: REFERENCE_EXPANSION_DATA和REFERENCE_CALCULATORS（accountCost、awakeningCost、fishTotal、sageEstimate）。
- [ ] 先测试新增记录、累计任务最高档5300、满额无充值336.2圣贤令取整336、非法值和100级边界失败。
- [ ] 提取数据与实现纯计算；运行专项并核对来源异常。

## Task 2: 其他资料视图
- Files: js/reference-expansion-ui.js; css/reference-expansion.css; tests/reference-expansion-browser.cjs。
- Consumes: Task 1 的数据与core。
- Produces: REFERENCE_EXPANSION_UI.hasSection(id)/mount(root,body,id)。
- [ ] 先写隔离浏览器七区入口、筛选、计算和不写账号测试并观察失败。
- [ ] 实现专用资料视图，复用通用数字与select增强。
- [ ] 验证重复进入、手机无整页溢出、选择和错误状态。

## Task 3: 合阵参考
- Files: data/formation-max-reference.js; js/formations-ui.js; css/formations.css; tests/formation-max-reference.test.cjs。
- [ ] 先写19组合及代表数据、空建议不填0、原个人属性不变断言。
- [ ] 录入三张图，独立查询与排序，运行专项。

## Task 4: 集成与交付
- Files: js/other-reference-ui.js; js/partition-loader.js; index.html; service-worker.js; .github/workflows/pages.yml; version.json; js/pwa.js; css/machine-beasts.css。
- [ ] 集成目录append及专用mount，新增资源到lazy loader和发布缓存。
- [ ] 机关兽表头修订并同步断言。
- [ ] npm test、相关浏览器回归、静态发布资源检查。日志写入outputs，不提交无关文件。
- [ ] 新鲜审查并修复，更新版本，提交、推送，核对线上版本。

## Execution ledger
- 2026-11-24: 用户明确授权方案确认后直接实施、测试、合并推送；并确认B9=10艮山之尘。
- 采用现有checkout，不创建新worktree；显式白名单提交以保留用户工作簿与未跟踪文件。三个无共享编辑文件的工作域并行，主线程集成。
