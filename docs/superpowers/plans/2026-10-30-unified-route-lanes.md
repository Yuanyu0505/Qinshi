# 全路线统一阅读布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已审核的示意图规则推广到所有铭文路线，保持合成语义与数据不变。

**Architecture:** `inscription-flow-model.js` 保持投料和概率真源；新增纯布局模块分配通用主线/辅助/其他结果区域，现有 flowchart 负责语义节点、绘图和交互。所有路线和收藏复用同一个入口。

**Tech Stack:** 原生 JavaScript、SVG、CSS、现有 PWA/GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-10-30-unified-route-lanes-design.md`

## Global Constraints

- 不改合成概率、库存、需求累计或收藏 ID。
- 不执行测试、lint、构建或实机验收；运行验证由用户负责。
- 使用当前 checkout 的 `codex/inscription-unified-flow` 分支，保留全部无关脏文件。
- 先补充回归用例；测试执行步骤按 AGENTS.md 留给用户。

## Review Focus

- 多前置分支/共享蓝二：各批独立备料，不能把并行主线错误串联。
- 独立洗练：无虚假入边，不挡住其他合成导线。
- 确定性单输入链：直下且有数量/必出提示，不能失去投料数量。
- 可选失败复用：不新增主线需求，不把替代成功产物当失败。
- 手机/平板：画布不撑破页面，保留缩放、触屏滚动和统一明细开关。

### Task 1: 通用语义分区与布局

**Files:** 新增 `js/inscription-flow-layout.js`、`js/inscription-flow-layout.test.js`；修改 `js/inscription-flowchart.js`。

**Interfaces:** `Layout.arrange(nodes, edges, operations)` 接收显示节点和边，原地设置坐标及角色区域，返回 `{width,height,bands}`；不读写路线和个人数据。

- [x] 先编写分区、同款连续链、共享素材、全遁位语义不变的回归用例（未运行）。
- [x] 实现分区布局与汇合/分叉分离、具体支线概率、标签和箭头避让。
- [x] 审阅主线/概率/复用路径共享入口，测试执行留给用户。

### Task 2: 信息层级与品质样式

**Files:** 修改 `js/inscription-flowchart.js`、`css/inscription-crafting.css`，调整受新布局影响的几何断言。

- [x] 主线卡片名称/词条/操作分层，独立素材浅品质底，晋升材料白底。
- [x] 失败整框品质色、图外明细词条与符号 X 品质色，操作条强调数量及必出。
- [x] 保持统一工具栏开关、90%默认、键盘高亮和响应式容器。

### Task 3: PWA与发布

**Files:** `index.html`、`service-worker.js`、`version.json`、`js/pwa.js`、既有资源清单及本任务报告。

- [x] 新布局模块接入页面和离线清单，版本统一1.0.73。
- [x] 静态代码审阅与差异核对，不执行功能验证，不声称验收通过。
- [ ] 仅暂存本任务文件，提交并合并本地master，推送现有部署分支origin/main；说明验证待用户执行。
