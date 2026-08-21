# Machine Beasts Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive machine-beasts partition with saved progress, exact minimum-investment planning, reference data, PWA 1.0.11 packaging, local master integration, and GitHub publication.

**Architecture:** Keep spreadsheet-derived constants in `data/machine-beasts.js`, pure deterministic calculations in `js/machine-beasts.js`, and DOM/localStorage behavior in `js/machine-beasts-ui.js`. Integrate only the partition shell, navigation order, scripts, styles, backup copy, and PWA cache into existing files.

**Tech Stack:** Static HTML, CSS, browser JavaScript, CommonJS-compatible pure calculation module, Node built-in test runner, service worker PWA.

**Spec:** `docs/superpowers/specs/2026-08-21-machine-beasts-section-design.md`

## Global Constraints

- Preserve all existing partitions, saved-data formats, and user-owned uncommitted files.
- Personal progress storage key is exactly `qinshi_machine_beasts_progress_v1`.
- PWA version is exactly `1.0.11`.
- Mobile and tablet layouts must avoid page-level horizontal scrolling.
- Do not infer missing stage 2–5 advancement thresholds; display “数据待补充” only for those thresholds.
- `机关炎傀` and `机关岳獠` are orange tier 5, max level 25, and cannot exchange fragments through contribution.

---

### Task 1: Static machine-beast data

**Files:**
- Create: `data/machine-beasts.js`
- Test: `js/machine-beasts.test.js`

**Interfaces:**
- Produces: `globalThis.MACHINE_BEAST_DATA` and CommonJS export containing `researchThresholds`, `researchValues`, `modifications`, `schools`, `beasts`, `qualityRules`, and `resourceRules`.
- Consumes: The two spreadsheet sources named in the spec.

- [ ] **Step 1: Add a failing data-integrity test**

Assert all 27 detailed beast names are unique, each has a valid school/quality/tier/max level, effects do not exceed max level, both schools have five stage-effect records, only stage 1 has threshold 45, and exact corrected records for `机关炎傀` and `机关岳獠` exist.

- [ ] **Step 2: Run the data-integrity test and confirm missing-module failure**

Run `node --test js/machine-beasts.test.js`; expect failure because `data/machine-beasts.js` does not exist.

- [ ] **Step 3: Implement the static data module**

Transcribe the research values, 1–25 thresholds, 27 beasts, two school stage tables, quality limits, fragment equivalents, contribution rates, and research-resource divisors. Freeze exported top-level collections and expose the same object to browser and CommonJS consumers.

- [ ] **Step 4: Re-run the data-integrity test**

Run `node --test js/machine-beasts.test.js`; expect the integrity test to pass.

- [ ] **Step 5: Commit the data module**

Commit `data/machine-beasts.js` and the integrity portion of `js/machine-beasts.test.js` with message `feat: add machine beast reference data`.

### Task 2: Pure progress and effect calculations

**Files:**
- Create: `js/machine-beasts.js`
- Modify: `js/machine-beasts.test.js`

**Interfaces:**
- Consumes: `MACHINE_BEAST_DATA`.
- Produces: `levelForResearch(total, thresholds)`, `thresholdForLevel(level, thresholds)`, `nextEffectLevel(beast, currentLevel)`, `activeBeastEffect(beast, currentLevel)`, `normalizeBeastProgress(beast, raw)`, and `schoolSnapshot(school, progressByBeast, data)`.

- [ ] **Step 1: Add failing tests for level and progress rules**

Cover exact-threshold level changes, cumulative research not resetting, max-level clamping, default next effect level, highest reached effect replacing lower effects, invalid inventory normalization, and school totals counting missing beasts as level 0.

- [ ] **Step 2: Run the focused tests and confirm the missing exports**

Run `node --test --test-name-pattern="level|progress|school|effect" js/machine-beasts.test.js`; expect failures for undefined calculation functions.

- [ ] **Step 3: Implement minimal pure progress helpers**

Implement integer normalization, threshold lookup, next-effect lookup, active-effect lookup, per-beast progress normalization, and school snapshots returning `totalLevel`, `currentStage`, `stageOneCurrent`, `stageOneRemaining`, `currentEffects`, and `nextStage`.

- [ ] **Step 4: Re-run focused tests**

Run the same focused command; expect all focused tests to pass.

- [ ] **Step 5: Commit pure progress calculations**

Commit `js/machine-beasts.js` and the new tests with message `feat: calculate machine beast progress`.

### Task 3: Exact investment optimizer

**Files:**
- Modify: `js/machine-beasts.js`
- Modify: `js/machine-beasts.test.js`

**Interfaces:**
- Consumes: normalized beast progress, target level, static research values, quality and resource rules.
- Produces: `calculateInvestmentPlan(data, beast, progress, options)` returning `valid`, `errors`, `current`, `target`, `selected`, `unused`, `totals`, `shortage`, and `exchange`.

- [ ] **Step 1: Add failing optimizer tests**

Cover minimum invested count beating inventory preference, overflow tie-breaking, resource tie-breaking, 8/9/10 rank body-equivalent folding, modified inventory using actual research values, per-final-beast ceiling for blueprints and organ pieces, orange contribution tiers, orange-5 no-exchange behavior, already-complete targets, and stable output for exact ties.

- [ ] **Step 2: Run optimizer tests and confirm missing behavior**

Run `node --test --test-name-pattern="optimizer|investment|exchange|resource" js/machine-beasts.test.js`; expect failures for the missing optimizer.

- [ ] **Step 3: Implement bounded exact search**

Build candidate inventory records from enabled ranks/modifications, enumerate useful owned subsets with dominance pruning, and combine them with bounded 0–7 rank zero-mod purchase candidates. Compare plans lexicographically by invested beast count, overflow, body/fragment shortage, contribution/yuan, awakening blueprints, organ pieces, and stable rank order.

- [ ] **Step 4: Re-run optimizer tests**

Run the focused optimizer command; expect all optimizer tests to pass.

- [ ] **Step 5: Commit optimizer behavior**

Commit the optimizer and tests with message `feat: optimize machine beast investment`.

### Task 4: Partition markup, navigation, and saved progress UI

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Create: `js/machine-beasts-ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `MACHINE_BEAST_DATA` and `MACHINE_BEAST_CORE`.
- Produces: partition `#partition-machine-beasts`, mode controls, progress rendering, editor behavior, localStorage persistence, and navigation title `机关兽`.

- [ ] **Step 1: Add the partition shell in the confirmed global order**

Place the machine-beasts tab after inscription and before tactics, reorder existing tabs to the confirmed order, add the three internal modes, progress/result/reference containers, and load data/core/UI scripts before `js/app.js`.

- [ ] **Step 2: Implement localStorage loading and saving**

Use `qinshi_machine_beasts_progress_v1`, normalize every stored beast record through the core module, show an explicit error when storage fails, and keep edits local until Save is pressed.

- [ ] **Step 3: Implement school summaries**

Render total awakening level, 1-stage 45 progress, current achieved effects, and next-stage effects. Show “数据待补充” only on unknown stage 2–5 thresholds while retaining their three real effects.

- [ ] **Step 4: Implement beast cards and editors**

Render detailed names, quality badges, current level, cumulative research, max level, active effect, inventory summary, and edit controls. Add zero-mod 0–7 inventory by default, optional 8–10 and modification matrices, fragment input, and the minimum-research fill action.

- [ ] **Step 5: Commit the progress UI**

Commit the markup, app integration, UI module, and progress styles with message `feat: add machine beast progress interface`.

### Task 5: Calculator and reference UI

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `calculateInvestmentPlan`, progress storage, and static reference data.
- Produces: target calculator, top-position result card, save-back action, and four reference views.

- [ ] **Step 1: Implement calculator inputs and defaults**

Select a beast, auto-read saved progress, choose the next effective milestone by default, allow any valid target up to max level, expose high-rank/modification toggles, and preserve unsaved temporary values while switching calculation controls.

- [ ] **Step 2: Implement the top result card**

After Calculate, render the result before inputs with current/target research, deficit, selected existing inventory, new body/fragment shortage, invested count, research/overflow, blueprints, organ pieces, contribution/yuan or no-exchange status, projected level, and unused inventory.

- [ ] **Step 3: Implement the four reference blocks**

Render research thresholds, research-by-rank/modification, beast school/quality/effects, and school stage effects. Highlight 10/15/20/25 milestones and keep unknown threshold labels separate from known effect text.

- [ ] **Step 4: Implement save-back behavior**

Allow temporary calculator inventory changes to be written to the selected beast only after explicit Save Back, then re-render school totals and cards.

- [ ] **Step 5: Commit calculator and references**

Commit UI and styles with message `feat: add machine beast planner and references`.

### Task 6: Responsive mobile and tablet layout

**Files:**
- Modify: `css/style.css`
- Modify: `js/machine-beasts-ui.js`

**Interfaces:**
- Consumes: existing desktop markup.
- Produces: single-column progress cards, touch-sized controls, wrapping editors/results, and scroll-contained reference tables with sticky first columns.

- [ ] **Step 1: Add tablet breakpoints**

At widths up to 1024px, reduce panel gaps, use one-column school/beast/editor grids where necessary, and keep calculator result fields readable without page-level overflow.

- [ ] **Step 2: Add phone breakpoints**

At widths up to 767px and existing standalone-display media queries, make mode buttons, selects, and numeric inputs touch-sized; convert summaries and result grids to one column; wrap long effects; and keep reference tables inside local scrolling containers.

- [ ] **Step 3: Add sticky reference columns**

Give each reference scroller an opaque background and sticky first column on phone/tablet so scrolled content never shows through.

- [ ] **Step 4: Commit responsive styles**

Commit responsive changes with message `style: adapt machine beasts for mobile`.

### Task 7: PWA 1.0.11 and publication files

**Files:**
- Modify: `service-worker.js`
- Modify: `js/pwa.js`
- Modify: `index.html`
- Modify: `.github/workflows/pages.yml`
- Modify: `manifest.webmanifest`

**Interfaces:**
- Consumes: completed production files.
- Produces: PWA version 1.0.11, offline precache entries, and a Pages artifact containing the new runtime files.

- [ ] **Step 1: Bump visible and runtime versions**

Change `index.html`, `js/pwa.js`, and `service-worker.js` from 1.0.10 to 1.0.11.

- [ ] **Step 2: Update precache and Pages lists**

Add `data/machine-beasts.js`, `js/machine-beasts.js`, and `js/machine-beasts-ui.js` to the service worker precache list and include both new JavaScript runtime files in `.github/workflows/pages.yml`.

- [ ] **Step 3: Commit PWA release files**

Commit PWA and publication files with message `chore: release pwa 1.0.11`.

### Task 8: Integrate and publish

**Files:**
- No new production files.

**Interfaces:**
- Consumes: all feature branch commits.
- Produces: local `master` containing the feature and remote GitHub branch/master update.

- [ ] **Step 1: Inspect feature diff and user-data exclusions**

Confirm the feature branch contains only source/docs/PWA files and never stages the workbook, answer image, `.codex-tmp`, or other user-owned data.

- [ ] **Step 2: Merge into local master**

Merge `codex/machine-beasts-section` into `master` without resetting, cleaning, stashing, or overwriting the dirty user files in the main checkout.

- [ ] **Step 3: Push GitHub**

Push the updated `master` to the configured GitHub remote so GitHub Pages can publish PWA 1.0.11.

- [ ] **Step 4: Report manual verification points**

Ask the user to manually verify personal-progress persistence, both school summaries, optimizer ordering, resource calculations, mobile/tablet rendering, offline update to 1.0.11, and GitHub Pages availability.
