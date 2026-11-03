# Inscription Allocation and Lease Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. User project instructions override automatic verification and redundant approval gates.

**Goal:** Correct interchangeable recipe guidance, expired editing access and cramped material-card layout.

**Architecture:** Keep rule calculation and saved trees unchanged. Project equivalent positive input allocations only into flow metadata. Recover only a matching expired edit lease at the shared account-write boundary, retaining conflict guards.

**Tech Stack:** Vanilla JavaScript, CSS, existing Node test and browser fixtures (not run by agent).

**Spec:** docs/superpowers/specs/2026-11-02-inscription-allocation-lease-design.md

## Global Constraints

- 不主动运行测试、构建、lint、格式检查或实机验收。
- 不提交已有 Excel 改动或无关未跟踪文件；不清除真实账号数据。
- 发布版本 1.0.76；本地 master，远程 main。

## Review Focus

- 过期原租约可恢复，但别的标签页 token 不可自动接管。
- BFCache 恢复后编辑权释放与恢复；账号/原始存档变化仍被拒绝覆盖。
- 等价配比只对完整结果池相等者开放，实际记录的真实消耗不变。
- 图中备料总数明确为示例配比，用户不被迫按 2+1 备料。
- 材料清空禁用条件、背包引用和手机换行不回退。

### Task 1: Write regression cases before implementation
- [x] Add lease expiry/replacement tests and account-store recovery integration case.
- [x] Add graph allocation and output geometry tests, plus material-header browser assertions.
- [x] Leave execution to the user under AGENTS.md; do not label RED/GREEN.

### Task 2: Implement scoped changes
- [x] Lease matching-token renewal, BFCache lifecycle and readable refusal messages.
- [x] Equivalent allocation projection and concise route guidance without changing saved trees.
- [x] Node padding and shared top-right clear controls with responsive wrapping.

### Task 3: Integrate and publish
- [x] Read final changed code and preserve unrelated files.
- [x] Update version references to 1.0.76; commit and fast-forward master remain release actions.
- [ ] Push master:main; report deployment status without claiming unrun functional tests passed.

## Execution notes — 2026-11-03

- Ruling: 用户要求直接实施并发布，跳过重复设计审批；用户 AGENTS.md 禁止主动验证，因此测试用例已补充但未运行，未执行构建、lint 或手动验收。不使用任务脚本隐式执行测试。
- Read-only independent review: raised two BFCache issues (foreign expired token takeover; stale account context). Both addressed in the same implementation pass with added cases, **not runtime verified**.
- Material-header browser case also covers transition from a backpack material to the manual editor after clearing.
- Remaining runtime risks: actual BFCache/browser storage restrictions, mobile/tablet visual rendering, full regression suite. These remain user verification responsibilities, not claims of passing.
- 不删除工作区、分支、旧档、原有 Excel 或其他未跟踪文件。
