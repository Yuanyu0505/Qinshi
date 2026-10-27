# 示例式铭文流程图 Implementation Plan

> **For agentic workers:** Inline execution. User/project override test-running and repeated plan-approval gates.

**Goal:** 将铭文嵌套树改为用户示例式的分步流程图。
**Architecture:** 新增纯渲染模块消费现有 route.tree/reuse，依赖排序和产物编号后渲染 SVG；UI 仅调用展示及缩放接口，不改规则/状态。
**Tech Stack:** 原生 JS、内联 SVG、现有 CSS/PWA。
**Spec:** docs/superpowers/specs/2026-10-27-inscription-flowchart-design.md

## Global Constraints
- 不主动运行测试/构建/lint/实机验收；不宣称通过。
- 不改概率与合成规则，不改存档，不碰用户工作簿或无关文件。
- 自动合并本地 master、推送 origin main，PWA 1.0.64。

## Review Focus
- 编号不能混淆不同配方或失败品；相同 X 与随机补词条的含义不可改变。
- 晋升材料必须单独节点，成功与失败概率在实际对应边上。
- 失败品复用仅呈现已由规划器验证的组合，不臆造 A+A+B。
- 蓝二起点、洗练概率未知及品质终点不得遗漏。
- 多分支节点和长属性文本不能超出框，移动端局部滚动缩放。

### Task 1: 流程图模块及界面
- [x] 新建 js/inscription-flowchart.js：render(route,xAttr)、zoom(viewer,action)，图册与最终复用图。
- [x] 修改 js/inscription-crafting-ui.js、css/inscription-crafting.css，移除旧树状图渲染和冗余样式，模拟区域不变。

### Task 2: 发布配置
- [x] 注册 index.html、service-worker.js、.github/workflows/pages.yml 新资源，版本文件升至 1.0.64。
- [ ] 只读代码审查，不执行验收；提交任务文件、合并 master 并推送。
