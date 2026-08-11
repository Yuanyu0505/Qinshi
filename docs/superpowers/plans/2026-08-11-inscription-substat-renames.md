# Inscription Substat Renames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将铭文盾位副属性“防御”和“技能减免”统一更名为“防”和“技伤减免”。

**Architecture:** 直接更新 `SUBS` 中的标准名称，使编辑、查询和资料图表同步显示新词条；在现有 `normalizeAttrName` 入口加入旧名称映射，使 localStorage 中的既有进度在读取时兼容迁移。

**Tech Stack:** 原生 JavaScript、现有铭文 localStorage 数据结构。

## Global Constraints

- 只修改铭文副属性名称，不调整极致属性标记和重复次数规则。
- 不改变 localStorage 的 key、对象结构或其他分区。
- 自动测试、lint 和浏览器验收由用户自行执行。

---

### Task 1: 标准词条与旧存档迁移

**Files:**
- Modify: `js/inscription.js:15-32`
- Modify: `js/inscription.js:103-108`
- Modify: `docs/superpowers/specs/2026-08-10-inscription-three-substats-design.md`

**Interfaces:**
- Consumes: `SUBS[shield]` 标准词条及 `normalizeAttrName(shield, value)` 旧存档加载入口。
- Produces: 新词条名称“防”“技伤减免”，并将旧值“防御”“技能减免”映射到新值。

- [x] **Step 1:** 替换 `SUBS` 中所有“防御”和“技能减免”名称。
- [x] **Step 2:** 定义旧名称到新名称的兼容映射，在极致属性数字前缀处理前完成转换。
- [ ] **Step 3:** 检查项目中铭文范围内不存在遗留旧词条，并提交累计功能分支；不执行自动验证。
