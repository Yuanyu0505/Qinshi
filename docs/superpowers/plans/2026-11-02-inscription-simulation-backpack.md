# Inscription Simulation Backpack Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. User waived further document approval.

**Goal:** Reliable account-scoped virtual inventory, undo and traceable simulation with clearer recipe diagrams.
**Architecture:** Pure transaction/provenance engine, existing account store, UI adapter and common graph renderer.
**Tech Stack:** Vanilla JS UMD, HTML/CSS/SVG, existing Node test files (not executed).
**Spec:** docs/superpowers/specs/2026-11-02-inscription-simulation-backpack-design.md

## Global Constraints
- No tests/build/lint/device acceptance run by assistant (AGENTS.md).
- No real progress changes; preserve old drafts and unrelated workbook/files.
- Keep random probabilities, account token guard and existing favorites stable.

## Review Focus
- Retry after bag credit must not duplicate stock or consume ingredients twice.
- Undo after manual stock edits must not overwrite them.
- Manual increments cannot inherit simulated provenance.
- Legacy mid-tier inputs remain recoverable but cannot masquerade as washed inputs.
- Each recipe's input bus remains independent even when ingredients are shared.

### Task 1: Transaction and provenance engine
Files: new js/inscription-simulation.js, js/inscription-simulation.test.js; modify js/inscription-crafting-state.js.
- [x] Write behavior tests for credit idempotency, retry, next/repeat/back, quantity conflicts, source trace and migration (not executed).
- [x] Implement upgrade(w), validate(w), preview(w), act(w,action,payload), route(w,id).
- [x] Integrate optional lab state into existing store, retain legacy v1 behavior and token checks.
- [x] Static read of data transitions; do not execute tests.

### Task 2: Simulator UI
Files: js/inscription-crafting-ui.js, css/inscription-crafting.css.
- [x] Wash-only manual options; explicit legacy recovery.
- [x] Bag panel, quantities, reserve selection, clear confirmation, undo and retry feedback.
- [x] Actual route viewer from terminal result and backpack, autosave, account switching, narrow-screen layout.
- [x] Static read of handlers and failure paths; user acceptance pending.

### Task 3: Common graph layout and release
Files: js/inscription-flow-layout.js, js/inscription-flowchart.js, CSS, related test files, index.html, SW, pwa, loader, workflow, version.
- [x] Regression cases for independent recipe buses, next-note focus and provenance rendering (not executed).
- [x] Place auxiliary materials by consuming recipe; separate adjacent input buses; enlarge note metrics/remove next-band.
- [x] Register simulation module in browser/precache/deployment; increment to1.0.74.
- [ ] Whole-change static review, no runtime validation; commit, fast-forward master, push master:main, observe deployment metadata.
