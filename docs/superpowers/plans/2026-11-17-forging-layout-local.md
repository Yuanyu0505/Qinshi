# 锻造布局重整 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one independent read-only review.

**Goal:** 按直接执行任务书降低锻造界面的视觉噪声，保留全部查询、进度及管理操作。
**Architecture:** 复用当前原生 HTML/CSS、事件委托和 UI 状态恢复；只修改锻造外壳、展示模板与局部样式。现有 P0 修复保持不变，不重做已回退的素材表容器查询方案。
**Tech Stack:** HTML/CSS/JavaScript、Node tests、隔离 Playwright/Edge。
**Spec:** C:/Users/pghyl/Downloads/Qin_1.1.16_橙装锻造_布局重整_Codex直接执行指令.md

## Global Constraints

- 当前基线 e061317 / 1.1.22；保留神兵新虹、锻造正名及其他最新改动。
- data/*、js/forging.js、js/progress.js、js/equipment-forging.js、js/item-navigation.js、账号/备份/同步、loadProgress/saveProgress、导航会话均不修改。
- qinshi_forging_progress_v1 与 version:2 格式不变；仅使用合成测试账号。
- 用户明确仅本地 master 合并；不推送、不联网部署、不升版本，不修改 PWA 缓存载体。
- 任务书明确要求本轮测试、截图，覆盖项目默认不主动验证约定。

## Review Focus

- 品质、当前锻数、命中和危险操作采用不同可见状态，不只靠颜色。
- 汇总仍按原计算顺序完整输出，名称与数量对齐且均可打开原物品菜单。
- 所有阶段按钮、候选 data-selected、排序保存/取消及只读搜索阶段编辑保持原事件。
- 重绘保留名称草稿、候选、details及焦点；搜索重复装备卡按原上下文独立。
- 手机复用现有表格DOM转换，不缩到9px，不隐藏后续阶段或造成整页横滚。

### Task 1: 基线及代表性装备卡

- [x] 运行已有五视口八场景截图与完整公共数据/计算快照，保存至outputs/forging-layout-local/before。
- [x] 新增浏览器断言：卡头主次与管理区、品质文字/锻数独立、无强光；先失败后改equipmentHtml和局部CSS。
- [x] 保持完整阶段和下一步/details；运行专项及原锻数回归。

### Task 2: 材料与查询/管理外壳

- [x] 新增汇总材料可点击、数值右对齐、品质非纯颜色、全部token/计数一致测试；先RED再改progressSummaryHtml。
- [x] 顶部改装备查询/个人进度与主装备查询/素材反查，去重复模式/查找方式标题，保留全部ID和数据事件。
- [x] 材料用轻色/细线，命中用局部标记不叠加整行强背景；减轻手机总览重复边框。
- [x] 调整分页与弟子管理区、候选与排序样式，不改变交互业务逻辑。

### Task 3: 验证、审查与本地合并

- [x] 五视口与过渡/横屏/CSS缩放、IME/触控/导航回归；比较冻结的数据和计算结果。
- [x] 完整单测、静态产物资源检查；与基线区分既有失败，不削弱断言。
- [x] 输出真实截图对照、P0/P1/P2报告与未测项；独立只读审查并验证重要修复。
- [x] 只提交本任务文件，快进合并到本地master；版本与PWA载体不改，不推送。
