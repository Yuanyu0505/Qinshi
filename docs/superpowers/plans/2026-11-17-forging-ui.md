# 橙装锻造 UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement inline, with one final independent review.

**Goal:** 按用户任务书改善查询、总览、个人进度的可读性和编辑稳定性。
**Architecture:** 复用现有手机 CSS 卡片和事件委托；只改模块内展示模板、作用域样式、瞬时 UI 状态。资料、算法、导航会话、权限和存储结构保持原样。
**Tech Stack:** 原生 HTML/CSS/JavaScript，Node test，隔离 Edge/Playwright。
**Spec:** C:/Users/pghyl/Downloads/Qin_1.1.16_橙装锻造_UIUX评审与Codex执行指令.md

## Global Constraints

- 基线 cbae832 / 1.1.18；保留已有用户 Excel 与全部不相关文件。
- data/*、js/forging.js、js/progress.js、js/equipment-forging.js、js/item-navigation.js 不修改。
- qinshi_forging_progress_v1 和 version:2 序列化结构不变；不接触真实账号。
- 用户已要求直接执行和合并发布，无需另行方案确认；目标版本 1.1.19。

## Review Focus

- 多列汇总不得缩小到不可读；局部横滚不能变成整页横滚。
- 重绘时未提交的名称、候选选择及 details 状态不能丢失或误存。
- 阶段按钮连续操作后键盘焦点与材料明细保持合理位置。
- 只读或失败保存不能显示虚假的已保存反馈。
- 搜索和物品菜单返回语义不能因模板改变而变化。

### Task 1: 基线及查询可读性

- [x] 新建 tests/forging-ui-browser.cjs，在相同合成账号保存五视口、八场景截图和资料/计算快照。
- [x] 添加汇总字号、命中边框、首列粘滞的浏览器断言；基线失败后改 css/style.css 的原有规则。
- [x] 运行浏览器断言至通过，保留手机原模板并比对结果。

### Task 2: 个人进度展示与稳定性

- [x] 先复现草稿/焦点被 renderProgress 替换丢失及保存失败提示问题。
- [x] 在 js/app.js 包装重绘以保留同一 UI 会话的草稿/焦点/details，不调用保存来恢复 UI。
- [x] equipmentHtml 采用下一步摘要 + 可展开完整剩余材料；CSS 自然两列，不再 translateX。
- [x] 测试候选、阶段、品质确认、删除、排序保存/取消、搜索及导航；与基线输出比较。

### Task 3: 回归与交付

- [x] 生成五视口八场景修改后真实截图，对照基线；补充横屏、中间宽度和缩放等边界。
- [x] 单元测试、已有锻造浏览器回归、静态站点装配/PWA资源检查；记录既有失败不弱化断言。
- [x] 独立审查后修复重要问题，更新版本载体和报告，只提交本次文件。
- [ ] 本地 master 快进合并、推送 origin main，核对 Pages 发布结果。
