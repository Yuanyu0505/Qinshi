# 禁地寻宝布局专项 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; final requesting-code-review.

**Goal:** 让禁地按期次→弟子/需求/奖励大类→道具操作的顺序阅读，全部资料与业务行为不变。
**Architecture:** 保留原生事件委托和分批渲染；默认当前/下一期上下排列；九类奖励置于三个有标题的语义分区；需求用原生details提供轻量摘要，展开状态仅存UI内存并参与现有导航快照；集中修改禁地CSS，不碰魂店和全站公共组件。
**Tech Stack:** Vanilla JS/CSS、Node test、隔离Edge/Playwright。
**Spec:** C:/Users/pghyl/Downloads/Qin_1.1.12_禁地寻宝_UI布局专项优化_Codex执行指令.md

## Global Constraints

- 基线1.1.13，提交b5a66b28046ea2fb38344fc86ea3b44899d91f3b；资料包旧1.1.12仅参考，不回退新修复。
- 不改data、核心筛选/日期/任选/公式、账号权限、存储键/schema、个人勾选或未来同步。
- 用户明确“只测试禁地这部分”，因此不运行全站、魂店、PWA交互测试；只核对发布产物引用及版本。
- 用户要求直接执行并合并推送，覆盖任务书的不部署建议和技能的重复确认步骤。
- 保留用户Excel和无关未跟踪文件；不导入真实备份，不使用真实账号。

## Review Focus

- 需求明细折叠不会写账号；局部替换保持展开与准确焦点。
- 图鉴导航返回保留新增UI展开态、原筛选与滚动。
- 奖励三大区不改变各子组选项身份、数量、顺序和任选边界。
- 分批渲染的展开卡全宽、收起卡自适应不能改变DOM顺序。
- 工具栏按钮移位不丢事件；选择/名称/用途按钮保持独立触控目标。

### Task 1: 基线与失败测试

- [x] 固定11/17隔离账号，五视口记录默认、已勾选、用途浮层前截图及全部奖励身份。
- [x] 新建tests/forbidden-layout-browser.cjs，摘要无写入、三大标题、当前/下一期上下排列断言先RED。

### Task 2: 展示实现

Files: index.html、js/forbidden-ui.js、css/style.css。
- [x] requirementSummaryHtml使用details，内存needsExpanded，不改token数据或saveNeeds；现有captureView/restoreView携带UI态。
- [x] cardHtml三大奖励标题、子组保留；当前日期为主；默认上下、预测折叠卡自适应。
- [x] 工具栏查询/用途/浏览操作分层，道具轻边界与局部状态；合并既有禁地响应式规则。
- [x] 先核对代表卡五视口，再全部期次身份与子组顺序比对。

### Task 3: 禁地回归与发布

- [x] 禁地单测、新浏览器10/10及既有禁地保护8/8；搜索IME/跨日/导航与断点。遵循用户限制，不跑全站。
- [x] 优化前后截图索引、14个受保护文件哈希无变化；新版本1.1.14，产物245引用检查通过。
- [ ] 独立审查、修复、提交本轮文件；合并master推送main，核对Pages实际状态。

审查：无Important/Critical；平板点击区重叠已RED→GREEN修复；本地基线缺失可能跳过对比已改用冻结指纹强制校验。真实软键盘、屏幕阅读器和浏览器原生缩放未实测，已记录报告。
