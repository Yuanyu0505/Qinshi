# 铭文精简工作台 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; user explicitly waived further document approval and proactive verification.

**Goal:** 重构路径与模拟界面，保留规则准确性、账号隔离与旧数据。
**Architecture:** 共享目标 + 无库存模拟状态 + 代表完整路线；复用 Rules.preview/validate/bestTargets。
**Tech Stack:** 原生 JavaScript/CSS，既有账号存储与 PWA。
**Spec:** docs/superpowers/specs/2026-10-27-inscription-workbench-design.md

## Global Constraints

- 不主动运行测试、构建、lint、实机验收；用户人工验收，不标记未经验证的通过。
- 不覆盖用户已改工作簿及无关未跟踪文件，不清空旧存档。
- 先在当前 checkout 的任务分支修改，完工合并 master 并推送 origin main。

## Review Focus

- 不完整材料草稿可保存，但非法完整材料及伪造合成结果不可采样。
- 切换账号、并发编辑和保存失败不得污染其他账号/覆盖新状态。
- 紫二低+中、第三条高档、跨位置不得绕过；速度特殊规则不改。
- 概率路线失败品复用不得虚构覆盖目标，必须经精确预览确认。
- 手机版三槽同排、路线局部滚动而非全页溢出，键盘和触屏建议选择。

### Task 1: 轻量状态与完整代表路线

**Files:** js/inscription-crafting-state.js; js/inscription-paths.js
**Interfaces:** createWorkbench(storage).inspect()/save(value,expected); representative(goal) -> targets, strategies with full material/operation trees and reuse branches.
- [x] 保存独立 draft 状态，保留旧键及旧数据；自动推断合法来源，保存时检查并发与账号。
- [x] 从目标递归前推蓝二，单独说明洗练低档，代表路线按机制归并；失败品复用经规则预览计算。

### Task 2: 两个分区界面重构

**Files:** js/inscription-crafting-ui.js; css/inscription-crafting.css
- [x] 单输入建议、四筛选、固定同排属性、可行组合及数值表；两页共享。
- [x] 树状完整路线，移除命名目标/实际库存/节点记录/来源选择及相关 UI 代码。
- [x] 当前材料编辑、预览、采样、阶段推进或重复；自动保存、取消不兼容切换、账号刷新。

### Task 3: 发布

**Files:** index.html; version.json; service-worker.js; js/pwa.js; js/partition-loader.js
- [x] 版本升至 1.0.63，既有缓存更新保障不改。
- [ ] 仅提交本任务文件，合并本地 master，推送 master:main。
- [ ] 如实报告未运行验证，交付人工检查重点。
