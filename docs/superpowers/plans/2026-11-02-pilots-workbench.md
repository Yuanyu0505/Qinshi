# Pilots and Inscription Workbench Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for state integration; independent data and layout tasks use dispatching-parallel-agents. Track tasks below.

**Goal:** Add searchable pilot reference data and repair independent inscription query/simulator, legacy recovery, grouped backpack and recipe layout.
**Architecture:** Static pilot data with lazy UI; independent query target in account storage; existing simulation provenance retained behind grouped inventory.
**Tech Stack:** Browser JavaScript, Node test runner, existing Playwright browser harness.
**Spec:** docs/superpowers/specs/2026-11-02-pilots-workbench-design.md

## Global Constraints
- Preserve existing account data and unrelated dirty workbook.
- No rule/model probability changes. Test data is isolated from live accounts.
- Active full verification authorized for this task; no release before pass.

## Review Focus
- Invalid legacy pending/history must not disable query or lose raw recovery data.
- Multi-select counts include occupied/reserved slots and cannot overdraw grouped lots.
- Duplicate lots retain independent actual provenance and undo behavior.
- Names of normal/god disciples and overlapping pilot classes stay distinct.
- Mobile layouts, lazy loading and PWA asset manifest include new partition.

### Task 1: Pilot and machine reference
- [x] Read original images, transcribe and structure pilot/breakthrough data with source attribution.
- [x] Add failing tests for classifications, names, filters and reference material totals.
- [x] Implement data/independent UI and breakthrough tables; run targeted tests.

### Task 2: Independent target and legacy recovery
Files: js/inscription-crafting-state.js, js/inscription-crafting-ui.js, js/inscription-simulation.js and matching tests.
- [x] Add failing tests for query independence and corrupted/legacy simulation recovery.
- [x] Keep query target separate; simulator changes own target only; provide keep-isolate / clear-all simulation actions with explicit confirmation.
- [x] Run targeted tests including account switching and storage conflicts.

### Task 3: Backpack grouping and picker
- [x] Add failing tests for grouped quantity, independent provenance and fill-empty semantics.
- [x] Add groups/selection allocation in simulation engine; UI shows one aggregate card with source route selector.
- [x] Dynamically cap selection total by available slots and stock; preserve choices until apply/cancel.
- [x] Run targeted tests.

### Task 4: All-route layout
Files: js/inscription-flow-layout.js, js/inscription-flowchart.js, css/inscription.css and matching tests.
- [x] Reproduce interleaved ingredients; assert recipe grouping, non-overlap, smaller text and compact auto-height.
- [x] Implement recipe-aware layout ordering across templates and actual routes; run targeted tests.

### Task 5: Integration and release
- [x] Wire desktop/mobile navigation, lazy loader, CSS and deployment assets.
- [x] Run full unit suite and browser tests; exercise desktop/phone/tablet, recovery and multi-select flows.
- [x] Review diff, fix regressions, record evidence; bump all PWA versions together.
- [ ] Commit scoped files; merge master; push master:main; verify Pages deployment and live version (release gate; terminal records completion).
