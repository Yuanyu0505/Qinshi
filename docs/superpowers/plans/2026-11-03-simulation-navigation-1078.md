# Simulation / Navigation 1.0.78 Implementation Plan

> **For agentic workers:** Use executing-plans inline for simulator, dispatching-parallel-agents for independent pilots and query performance domains. User authorized direct implementation and tests; no redundant approval pause.

**Goal:** Make repeated synthesis immediate, auto-credit optional, editing after outcomes usable, and reduce measured navigation redraw work.

**Architecture:** Preserve immutable lab records and transactional actions; introduce explicit UI synthesis actions. Reuse view invalidation and cancellable query batches instead of wholesale navigation rewrites.

**Tech Stack:** Vanilla JS/CSS, Node tests, isolated Edge browser.

**Spec:** docs/superpowers/specs/2026-11-03-simulation-navigation-1078-design.md

## Global Constraints
- Preserve probability rules, actual records, unrelated Excel and existing working files.
- Default auto-credit enabled, persisted per account; retry replaces, repeat accumulates exactly one result.
- Root owns simulation/core/crafting UI; pilots agent owns pilot UI/CSS/tests; query agent owns inscription.js/performance coordinator/tests only.
- Full tests before localmaster merge, PWA1.0.78 and remote main push.

## Review Focus
- Auto-credit and retry must never double-consume or double-credit.
- Repeat with insufficient stock must leave prior result and quantities unchanged.
- Editing new materials must preserve earlier outcomes/history and remain undo-safe.
- Cached views must invalidate on account/raw-store changes; lease protection cannot be bypassed.
- Cancelled render batches cannot append stale results after a new query or after navigation.

### Task 1: Continuous simulator
- [x] Add RED core/browser tests for default auto-credit, optional manual credit, repeat direct roll, retry replacement, material edits after pending, undo and insufficient stock.
- [x] Implement lab actions and controller option; only rerender active view, retain DOM on unchanged activation.
- [x] Verify targeted tests and responsive simulator.

### Task 2: Pilots
- [x] RED geometry and semantics tests, then compact filter rows, three-line notes and readable effect headings.
- [x] Targeted unit and offline/responsive browser tests.

### Task 3: Performance
- [x] Record measured switching hotspots, then RED cancellable query tests; implement bounded query batches and correct invalidation.
- [x] Re-measure query/navigation with isolated CPU4x browser and run regressions.

### Task 4: Release
- [x] Fresh-context read-only review; resolve important findings with regression tests.
- [x] Full unit/browser test pass (1052 unit tests; 346 browser tests across 39 files, no failures or skips); version1.0.78 prepared.
- [ ] Explicit scoped commit, ff master, merged-result tests, remote main push and online resource verification.
