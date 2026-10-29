# Shared Inscription Flow Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task, with TDD and a final independent review.

**Goal:** 实施已确认的属性冲突联动与共享产物紧凑图。
**Architecture:** 规则引擎不变；UI选择器枚举可完成目标；流程图在已有完整树上构建只读共享投影。两个独立任务文件分开实施，最终集成。
**Tech Stack:** 原生JS/CSS、Node test、Playwright Edge、PWA。
**Spec:** `docs/superpowers/specs/2026-10-29-shared-flow-design.md`

## Global Constraints

- 不改变概率/档位/规则签名/收藏identity，不推测蓝二速度档位，不把一次随机合成画成同时获得多枚。
- 只对相同制作来源的相同配方共享；洗练与合成、不同X来源不可误并。
- 目标冲突项能看原因不能选入，路径模拟共享；剩余槽可补全才允许选项。
- 保护无关工作簿/图片；最终测试全绿才发布1.0.68。

## Review Focus

- 共享两紫一产物各50%且各需9枚，不能把总路线标必中。
- 旧收藏tree和reuse引用不因投影去重失效；不同来源不得误连。
- X继承与随机补出的真实词条不同；未知速度不可辨标签保留。
- 键盘/触控点击禁用目标项只解释不写入，旧测试仍验证共享目标和账号隔离。
- 手机/平板宽度/缩放/高亮和失败详情不撑宽主图。

### Task 1: 自定义目标属性选择器

Files: `js/inscription-crafting-ui.js`, `css/inscription-crafting.css`, 独立新浏览器测试；需要时新增纯UI辅助单测。
- [x] 先写红测：鬼遁第三暴伤不可选、换品质动态更新、空槽合法补全、点击原因/键盘/触控、旧目标不改、路径模拟同步。
- [x] 实施自定义combobox/listbox及aria-disabled，保留原select作为兼容隐藏状态桥；图控件渲染后调用`if(F.bind)F.bind(viewer)`以接入Task2高亮，其他图代码由Task2负责。
- [x] 定向绿；不提交、不碰其他任务文件。

### Task 2: 全路线共享产物投影与紧凑图

Files: `js/inscription-flowchart.js`, `js/inscription-flowchart.test.js`，独立新图浏览器测试；Task1结束后追加同CSS中的图样式。
- [x] 红测：鬼遁相同配方仅一个、两可用紫一分支概率和需求、龙遁PVP速度推广、来源/X/洗练隔离、输入树不变、真实reuse保留。
- [x] 共享配方注册表，多个产物出口，原sourceKey作为别名保留以兼容reuse，不修改原树。累计需求只对强制主树计算，复用为可选来源。
- [x] 合并稳定操作/产物、晋升材料徽注、失败详情外置、紧凑布局，增加缩放/聚焦。
- [x] 定向测试与手机截图；对因明确界面重构失效的旧定位做等价行为迁移，不削弱规则断言。

### Task 3: 集成验证与发布

- [x] 独立review，补充重要回归；1.0.68版本入口同步。
- [x] 一轮全量unit和相关浏览器（含实际1.0.67升级）全绿，记录模拟设备限制。
- [ ] 明确暂存本次文件，提交并快进master，正常推送main，确认Pages及在线版本。
