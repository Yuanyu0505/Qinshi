# Semantic Flow Branches Implementation Plan

> 使用superpowers:executing-plans当前会话实施。用户已免除重复设计确认。

**Goal:** 用同批汇合/同点分叉消除虚假线交点，统一所有铭文路线图。
**Architecture:** 保留Model.project，仅更改SVG显示图和布局；按批次分开初始素材，以同列约束组织稳定链与复用链。结果用直线扇出而非逐边绕线。
**Tech Stack:** 原生JS/SVG、Node回归用例（未运行）。
**Spec:** docs/superpowers/specs/2026-10-30-semantic-flow-branches-design.md

## Global Constraints
- 不运行验证流程；不改合成算法、需求数或存储。既有未发布秘境显示调整一并发布。
- 只提交本任务文件，master合并后正常推送main，PWA版本1.0.72。

## Tasks
- [x] 1. 补同点直线分叉、蓝二按批次分开、独立洗练无引线、复用链同列的回归用例，更新旧几何断言（未运行，不代表通过）。
- [x] 2. 修改inscription-flowchart.js显示图及布局，保留原概率/需求；所有查询/收藏共用渲染。
- [x] 3. 一次独立只读审查，补齐收藏路线独立洗练蓝二按批次展示；版本入口更新为1.0.72。提交及部署结果以Git和发布平台的实际输出为准。

## Review Focus
- 同一操作的成功/失败从同一坐标直线出发，标签落在各自分支。
- 共享蓝二的复制仅是按批次备料展示，原模型数量及每次产出规则不改变。
- 独立洗练没有来自/去往无关合成的线或交点。
- 稳定主线和失败复用链各自同列，共享目标不同入口不把主线拉歪。
- 遁位/品质/收藏同一规则，单结果、多个可用结果、多个失败来源均不能掉节点。
