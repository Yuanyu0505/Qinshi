# Inscription Common Substats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全部九个铭文盾位统一增加闪避、招架、治疗效果三个普通副属性选项。

**Architecture:** 保留每个盾位现有 `SUBS` 词条与极致标记，新增公共普通副属性名称数组，并在初始化数据时统一合并。个人进度编辑、查询筛选结果和资料图表继续读取同一 `SUBS` 数据源，因此无需分别修改三个展示模块。

**Tech Stack:** 原生 JavaScript、现有铭文前端数据结构。

## Global Constraints

- 只修改铭文分区，不改变弟子天位/盾位映射和本地存储格式。
- 闪避、招架、治疗效果均为非极致属性，同名最多选择两条。
- 项目的测试、lint 和手动验收由用户自行执行。

---

### Task 1: 合并公共副属性

**Files:**
- Modify: `js/inscription.js:15-25`
- Modify: `docs/superpowers/specs/2026-08-10-inscription-three-substats-design.md`

**Interfaces:**
- Consumes: `SHIELDS` 九个盾位名称、`SUBS` 各盾位原始词条。
- Produces: 每个 `SUBS[shield]` 均额外包含 `{ n: "闪避" }`、`{ n: "招架" }`、`{ n: "治疗效果" }`。

- [x] **Step 1:** 定义公共副属性名称数组，不设置 `x: true`。
- [x] **Step 2:** 在九个盾位基础词条建立后统一追加公共词条，并防止名称重复。
- [x] **Step 3:** 保留现有 `isExtremeAttr` 和重复次数校验逻辑，使新增词条自动遵守普通属性最多两条的规则。
- [ ] **Step 4:** 检查差异范围并提交当前累计功能分支；不执行项目自动验证。
