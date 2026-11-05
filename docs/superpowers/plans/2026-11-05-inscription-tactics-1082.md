# Inscription and Tactics 1.0.82 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User waived repeated design/plan confirmation. AGENTS overrides execution of tests and automated verification; write regression cases for user execution, do not run them.

**Goal:** Fix IME/reverse interaction, simplify reference data and restore tactics price/maximum controls.
**Architecture:** Existing locator store adds a backward-compatible collapsed flag; controller updates result bodies without replacing filters. Reference keeps public numeric APIs and derives arbitrary reachable higher-quality values from real tiers. Tactics supplies screenshot defaults while preserving overrides, with an explicit edit/save price transaction.
**Tech Stack:** Vanilla JS/CSS, existing Node/Edge regression files, static PWA.
**Spec:** docs/superpowers/specs/2026-11-05-inscription-tactics-1082-design.md

## Global Constraints
- No proactive tests, lint, formatting checks, builds, or real-device acceptance this task.
- Preserve unrelated workbook, account progress, bag, snapshots and custom prices.
- No invented extreme-mantra price or blue-speed probabilities.
- Merge local master and push master:main only; bump five version sources to 1.0.82.

## Review Focus
- Composition input and persistent filter nodes, including path and simulator reverse children.
- Collapse survives switching/reload, reselect retains criteria, scene does not mutate.
- Higher-quality ranges remain reachable; ambiguous speed carries H/M alternatives.
- Missing/zero/custom prices and invalid edits cannot corrupt valid settings.
- Max target changes only plan, never saved personal progress.

### Task 1: Reverse interaction
- [x] Add regression cases (unrun) for IME, node identity, collapse/reselect/scene isolation.
- [x] Add collapsed locator flag; stable result-body updates and composition guards.

### Task 2: Reference tables
- [x] Adjust existing difference UI assertions and add higher-quality/keyword regressions (unrun).
- [x] Remove comparison delta controls/results; keep upgrade delta with %; add target-quality and other-dun lookup; center cells.

### Task 3: Tactics
- [x] Add defaults/custom override/max-target regression cases (unrun).
- [x] Implement price edit/save/cancel and real maximum target; preserve inventory and personal progress.

### Task 4: Integration
- [x] Source review only; no runtime pass claims. Record user validation points.
- [ ] Bump 1.0.82, explicit stage/commit/merge/push, report publication status separately from functional validation.
