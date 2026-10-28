# Inscription Optional X Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持可选具体X，改正常规材料准备与失败复用展示。

**Architecture:** 保留规则引擎，调整代表路线的材料准备角色；节点独立保存符号与生产来源元数据，SVG和收藏共用该约定。UI留空采用符号模板，选定则使用具体词条。

**Tech Stack:** 原生JavaScript UMD、SVG、现有账号localStorage存储。

**Spec:** docs/superpowers/specs/2026-10-28-inscription-x-preparation-design.md

## Global Constraints

- 不执行测试、构建、lint、格式化、产品脚本或浏览器验收；用户自行验证。
- 不修改规则引擎概率模型、物理材料签名及模拟器合法性。
- 只本地master合并，不推送、不更新PWA。
- 不动用户工作簿与其他未跟踪文件。

## Review Focus

- 未选X可以查询，不能显示为必选或把符号模板概率冒充任意X概率。
- 有档X在蓝二合法但无法用于紫二低档洗练时，不能构造非法来源。
- 双蓝速度随机补词条无X输入，不应被符号化。
- 两种失败品重复2＋1覆盖目标应可复用，三枚缺目标不得可达。
- 收藏重载不能丢失X来源或关联到另一条相同物理失败产物。

---

### Task 1: 规划器

**Files:** js/inscription-paths.js、js/inscription-paths.test.js

**Interfaces:** representative(goal)新增可选goal.xTerm={attr,tier}；结果和strategy携带xTerm、symbolicX；base/wash节点以xSource标记显式符号来源，craft节点sourceKey稳定标识生产配方，复用failure节点携带sourceKey；复用craft携带coverageReuse=true。

- [x] 添加常规速度两族、具体X来源限制和复用覆盖回归用例（未运行）。
- [x] 实现X配置、按准备角色排序和两类紫二来源，避免局部概率剪枝。
- [x] 显式X来源只在模板输入节点标注，复用按覆盖且允许重复。

### Task 2: 图示与收藏

**Files:** js/inscription-flowchart.js、js/inscription-route-favorites.js及对应单测。

**Interfaces:** 读取strategy.xTerm/symbolicX与节点xSource/sourceKey；收藏紧凑保存这些元数据，重载重新计算与校验。

- [x] 添加继承X/随机补词条、具体X、2＋1复用与收藏往返用例（未运行）。
- [x] 图示依据来源传播符号，不按属性全局替换；复用显示覆盖条件。
- [x] 收藏保留新字段并兼容旧记录，原记录失效时保留而不换路线。

### Task 3: 选择界面和集成

**Files:** js/inscription-crafting-ui.js、js/inscription-crafting-state.js及对应单测。

- [x] 添加可选X原生下拉、模式说明，默认留空，清除选项同时清除X。
- [x] 将X仅作为路径查询选项保存，不改模拟投料语义；传入规划器并用于收藏。
- [x] 通读跨文件接口与差异，由独立审阅者做静态审阅（未执行验证）。
- [x] 修正静态审阅发现的收藏占位冲突、X筛选精确档位、错误来源说明三项问题，补充未执行回归用例。
- [ ] 按明确文件清单提交并快进合并本地master；不宣称运行验证通过。
