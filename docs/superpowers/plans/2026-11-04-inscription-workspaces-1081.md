# Inscription Workspaces 1.0.81 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute inline; one fresh whole-branch review before release. User waived further document confirmation.

**Goal:** Separate inscription locators, merge reverse results correctly, and make reference data readable.
**Architecture:** Extend reverse pure core for result grouping. Add a small account-scoped locator store using optimistic tokens. Existing crafting controller hosts independent locator views and one shared simulator. Reference module retains public numeric APIs and replaces only its renderer.
**Tech Stack:** Vanilla JavaScript/CSS, Node test runner, Playwright/Edge, static PWA.
**Spec:** docs/superpowers/specs/2026-11-04-inscription-workspaces-1081-design.md

## Global Constraints
- Preserve all existing simulation/progress/backpack and unrelated workbook changes.
- No rule, numeric, probability changes. Green cannot reroll.
- User explicitly authorizes complete automated testing and release for this task.
- New runtime assets must be registered in index, partition loader, SW, Pages deployment list and account data whitelist where necessary.

## Review Focus
- Same-name identities with different positions or filtered-out divine counterparts must not merge incorrectly.
- Account changes, stale writes and damaged old locator documents cannot overwrite scenes or another account.
- Two pending asynchronous path generations must not render into the wrong child workspace.
- Applying a locator after cancellation must preserve every byte of the scene/backpack document.
- Ambiguous blue speed and absent green substats must not invent tiers, zero values or probabilities in comparisons.

### Task 1: Result identity and filters
**Files:** js/inscription-reverse.js, js/inscription-reverse.test.js
**Interfaces:** groupResults(rows, filters, context) produces cards with members and canonical combo identity; consumes concrete rows from search, explicit atlasTargets, exact common keys and formation names.
- [x] Add failing tests for default divine visibility, additive explicit/exact pairing, canonical term order, exact-position separation and filtering-before-merge.
- [x] Run node --test js/inscription-reverse.test.js (expected new tests fail).
- [x] Implement pure grouping/filtering without changing search calculation.
- [x] Run focused tests and commit task.

### Task 2: Independent locators and shared simulator
**Files:** js/inscription-crafting-ui.js, js/inscription-reverse.js (locator store; reviewed scope adjustment), css/inscription-crafting.css, js/accounts.js or actual registry, index.html, js/partition-loader.js, service-worker.js, .github/workflows/pages.yml; new unit/browser tests.
**Interfaces:** createLocatorStore(storage, mode, child) -> inspect/save target and result filters with account/raw token guards; legacy direct query and reverse drafts read for migration. Controller scoped views own plans, shared root simulator owns scene.
- [x] Add failing store tests and browser tests for direct/reverse isolation and explicit simulation apply/cancel.
- [x] Run new tests and observe failures.
- [x] Implement locator persistence and child controllers, grouped-result filters/identity selector; preserve the shared simulator actions and histories.
- [x] Update legacy browser tests to enter the now-explicit child/apply flow, preserving their original assertions.
- [x] Run targeted tests and commit task.

### Task 3: Reference local redesign
**Files:** js/inscription-reference.js, css/inscription-reference.css, js/inscription-reference.test.js, tests/inscription-reference.cjs.
**Interfaces:** existing mainStats/tiers/termRows/washOnlyRows/upgradeRows stay compatible; comparison rows derive from real tier data, no rule duplication.
- [x] Add failing tests for green recast UI, four local tabs, tier matrices, exclusive two-group comparisons/diffs, source filters, ambiguous speed and responsive overflow.
- [x] Implement relevant controls and matrices/cards; default quality o2, one dun; preserve full overview.
- [x] Run reference unit/browser tests and commit task.

### Task 4: Full verification and publication
**Files:** five PWA version sources, verification report.
- [x] Run npm test and npm run test:browser; fix failures with regression tests.
- [x] Fresh branch review against spec including Review Focus; fix important findings with RED/GREEN evidence.
- [x] Update version to 1.0.81, verify full suite plus real previous-release upgrade and responsive screenshots.
- [ ] Commit, merge local master, push origin master:main, verify Pages and deployed version/assets. Never stage unrelated workbook/artifacts.
