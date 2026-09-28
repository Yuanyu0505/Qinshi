# Wooden Man Alley Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an account-isolated “木人巷” section with progress tracking, exact current-board advice, forward/reverse resource planning, reference tables, responsive UI, and PWA delivery.

**Architecture:** Follow the repository’s existing UMD/CommonJS split: immutable rules in `data/wooden-man-alley.js`, pure normalization and board analysis in `js/wooden-man-alley.js`, pure cross-floor and purchase optimization in `js/wooden-man-alley-planner.js`, and all DOM/account-storage behavior in `js/wooden-man-alley-ui.js`. Integrate the partition through the existing navigation and `QinshiAccounts` account-scoped storage, then release it as PWA 1.0.45.

**Tech Stack:** Static HTML/CSS, browser JavaScript (ES5-compatible UMD modules), Node.js `node:test`/`assert`, existing `QinshiAccounts` storage, service worker and GitHub Pages workflow.

**Spec:** `docs/superpowers/specs/2026-09-28-wooden-man-alley-design.md`

## Global Constraints

- Navigation label is exactly “木人巷”; desktop order is after “战匣丹囊” and before “合阵”; mobile placement is under “更多”.
- Floors are limited to 1–500; 331–500 remains 6×6 with 36 wooden men and uses the 231–330 auxiliary-item costs.
- Default risk level is conservative: sum remaining expected demand, multiply once by 1.20, then ceil once.
- Mystery-box contents are unknown; store and display mystery-box counts but never convert them into swords or planning value.
- Do not implement automatic sword production, daily goals, activity history, or unused-item refunds.
- All editable progress, inventory, package templates and package purchase counts are isolated by the current game account through `QinshiAccounts`.
- The calculator never mutates saved progress unless the user explicitly confirms “保存回个人进度”.
- Desktop, tablet and mobile layouts must remain readable; a 6×6 board must not cause horizontal page scrolling.
- Project policy: write verification tests but do not run tests, lint, builds or manual acceptance as the AI; list commands and expected results for the user.
- Preserve unrelated dirty files in the main checkout and commit only task-owned paths.

## Review Focus

- Corrupt or partial saved JSON must normalize to safe defaults without preventing the rest of the app from opening; Task 1 pins this behavior.
- The current floor at boundary values 50/51, 130/131, 230/231, 330/331 and completed 500 must choose the correct board and costs; Task 1 pins every boundary.
- A board with sparse, asymmetric opened cells must produce a deterministic row/column/cross recommendation and stable tie-breaking; Task 2 pins this behavior.
- Package counts where `purchased > limit`, negative fields or missing fields must be clamped safely and must not create free resources; Tasks 1 and 3 pin this behavior.
- Account switching, import/restore and PWA refresh must not leak one account’s wood-man data into another account or serve stale 1.0.44 assets; Tasks 4 and 6 pin this behavior.

---

### Task 1: Rules, progress schema and floor transitions

**Files:**
- Create: `data/wooden-man-alley.js`
- Create: `js/wooden-man-alley.js`
- Create: `js/wooden-man-alley.test.js`

**Interfaces:**
- Produces: `window.WOODEN_MAN_ALLEY_DATA` / CommonJS data object with `tiers`, `tools`, `targets`, `defaultPackages`, `maxFloor`, `swordIngotPrice`, `discountedSwordIngotPrice`.
- Produces: `WOODEN_MAN_ALLEY_CORE.tierForFloor(floor, data)`, `normalizeProgress(raw, data)`, `normalizeResources(raw)`, `boardCellCount(floor, data)`, `advanceFloor(progress, data)`, and `remainingDays(endDate, now)`.
- Consumes: no new feature modules.

- [ ] **Step 1: Write the failing rule and normalization tests**

Add tests named `resolves every floor boundary`, `normalizes corrupt progress safely`, `clamps package purchase counts`, `advances and resets a completed floor`, and `stops after floor 500`. Assert the exact five tier rows, default floor 1, unique in-range opened-cell indices, non-negative integer resources, per-account package defaults, next-floor empty board and `{ currentFloor: 500, completedAllFloors: true }` after completing floor 500.

- [ ] **Step 2: Provide the user verification command**

Command: `node --test js/wooden-man-alley.test.js`

Expected before implementation: FAIL because the data/core modules do not exist. Per project policy, the AI records this command but does not run it.

- [ ] **Step 3: Implement immutable rules in `data/wooden-man-alley.js`**

Use the repository’s UMD data pattern. Encode the exact floor ranges, board sizes, tool costs, six target shortcuts and four editable package defaults from the spec. Freeze or clone exposed collections so UI edits cannot mutate global defaults.

- [ ] **Step 4: Implement schema normalization and transitions in `js/wooden-man-alley.js`**

Use `schemaVersion: 1`. Normalize unknown/missing values without throwing, discard invalid board indices, clamp package `purchased` to `limit`, reset the board on floor advance, and compute remaining days without blocking the module on an invalid date.

- [ ] **Step 5: Provide the passing verification command**

Command: `node --test js/wooden-man-alley.test.js`

Expected after implementation: all Task 1 tests PASS when the user runs them.

- [ ] **Step 6: Commit the independently testable rules layer**

```bash
git add data/wooden-man-alley.js js/wooden-man-alley.js js/wooden-man-alley.test.js
git commit -m "feat: add wooden man alley rules"
```

### Task 2: Exact current-board analysis

**Files:**
- Modify: `js/wooden-man-alley.js`
- Modify: `js/wooden-man-alley.test.js`

**Interfaces:**
- Consumes: `tierForFloor`, normalized progress and tool definitions from Task 1.
- Produces: `WOODEN_MAN_ALLEY_CORE.analyzeCurrentBoard({ floor, openedCells, resources, allowedTools }, data)` returning `{ remaining, pureSwordExpected, actions, recommendation }`.
- Each action returns `{ toolId, cost, affectedCells, hitProbability, expectedSwordSaving, position }`; `position` is null or `{ type, row, column }`.

- [ ] **Step 1: Write failing board-analysis tests**

Cover an empty 3×3 board, an asymmetric 5×5 board, a nearly completed 6×6 board, unavailable tools, bomb coverage capped by remaining cells, iron-sword immediate completion, mirror/wood-sword equivalence, and deterministic tie-breaking from top-to-bottom then left-to-right.

- [ ] **Step 2: Provide the user verification command**

Command: `node --test --test-name-pattern="board|action|recommendation" js/wooden-man-alley.test.js`

Expected before implementation: FAIL because `analyzeCurrentBoard` is missing.

- [ ] **Step 3: Implement candidate generation**

Generate a candidate for every valid row, column and cross point using actual unopened-cell indices. Compute immediate hit probability as `affected unopened cells / remaining unopened cells`; represent iron sword, bomb, mirror and wood sword through the same action shape.

- [ ] **Step 4: Implement expected saving and stable ranking**

Evaluate immediate outcome and the analytically expected continuation cost. Rank by reduced sword/ingot demand, then preservation of high-value tools for higher floors, then compactness of the failure-state board, then fixed positional order. Do not use randomness.

- [ ] **Step 5: Provide the passing verification command**

Command: `node --test js/wooden-man-alley.test.js`

Expected after implementation: all Task 1–2 tests PASS when run by the user.

- [ ] **Step 6: Commit current-board analysis**

```bash
git add js/wooden-man-alley.js js/wooden-man-alley.test.js
git commit -m "feat: analyze wooden man boards"
```

### Task 3: Cross-floor, reverse and purchase planners

**Files:**
- Create: `js/wooden-man-alley-planner.js`
- Create: `js/wooden-man-alley-planner.test.js`

**Interfaces:**
- Consumes: `WOODEN_MAN_ALLEY_CORE`, `WOODEN_MAN_ALLEY_DATA`, normalized calculator input `{ progress, resources, packages, includePurchasablePackages, stageLimits, risk }`.
- Produces: `WOODEN_MAN_ALLEY_PLANNER.planToTarget(input, data, core)`, `planReachable(input, data, core)`, `planPurchases(shortage, input, data)`, and `applyRisk(expectedTotal, worstTotal, risk)`.
- `planToTarget` returns `{ achievable, targetFloor, demand, shortages, remaining, stages, currentFloorAdvice, purchasePlans }`.
- `planReachable` returns `{ completedFloor, nextFloor, expectedBrokenOnNextFloor, remaining, stages }`.

- [ ] **Step 1: Write failing risk and stage-allocation tests**

Assert pure-sword expectations, worst cases, conservative rounding only after total aggregation, stage boundaries, 331–500 costs, mixed/repeated tools, per-stage allow/deny and maximum quantities, and high-value tools being retained for later tiers on equal savings.

- [ ] **Step 2: Write failing forward and reverse tests**

Cover all six shortcuts, an arbitrary target, current partial board, target below current progress, fully completed floor 500, insufficient resources, exact completion, highest complete floor plus partial next-floor count, and the default exclusion of unpurchased packages.

- [ ] **Step 3: Write failing purchase-plan tests**

Assert zero-paid, minimum-RMB and minimum-ingot plans; 200/100-ingot sword pricing; coupons capped by purchased swords; package remaining limits; mystery-box totals displayed but excluded from optimization; corrupt/negative package data producing no free swords.

- [ ] **Step 4: Provide the user verification command**

Command: `node --test js/wooden-man-alley-planner.test.js`

Expected before implementation: FAIL because the planner does not exist.

- [ ] **Step 5: Implement deterministic stage planning**

Aggregate floors into the five exact tier ranges. Allocate owned tools under stage limits by marginal expected sword/ingot savings, with stable high-tier preservation as the tie-break. Return transparent per-stage quantities instead of opaque scores.

- [ ] **Step 6: Implement forward and reverse planning**

Use the actual current-board result for the current floor, then stage planning for future floors. Keep theoretical, conservative and worst totals available together; apply the selected risk only when deciding affordability/reachability.

- [ ] **Step 7: Implement discrete package planning**

Enumerate legal package quantities up to each remaining limit. Compare tuples in the exact objective order for zero-paid, minimum-RMB and minimum-ingot plans. Apply coupons only to ingot-purchased swords and return mystery-box yield as display-only metadata.

- [ ] **Step 8: Provide the passing verification command**

Command: `node --test js/wooden-man-alley-planner.test.js`

Expected after implementation: all Task 3 tests PASS when run by the user.

- [ ] **Step 9: Commit the planning engine**

```bash
git add js/wooden-man-alley-planner.js js/wooden-man-alley-planner.test.js
git commit -m "feat: plan wooden man alley resources"
```

### Task 4: Partition shell, personal progress and account persistence

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Create: `js/wooden-man-alley-ui.js`
- Create: `js/wooden-man-alley-ui.test.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `WOODEN_MAN_ALLEY_DATA`, `WOODEN_MAN_ALLEY_CORE`, `WOODEN_MAN_ALLEY_PLANNER`, `window.QinshiAccounts`.
- Produces: `window.WOODEN_MAN_ALLEY_UI.init()`, `captureView()`, and `restoreView(snapshot)`; persists `qinshi_wooden_man_alley_progress_v1` through `QinshiAccounts`.

- [ ] **Step 1: Write failing integration/structure tests**

Assert the desktop and mobile navigation order, `partition-wooden-man-alley`, the three exact subpage labels, script load order (account store → data → core → planner → UI → app), and registration in `PARTITION_TITLES`, `secondaryPartitions` and the partition element map.

- [ ] **Step 2: Write failing UI-state and account-isolation tests**

Using a minimal fake DOM/storage harness, assert safe load from missing/corrupt JSON, account A/B isolation, current-account label, cell toggling, undo, clear-current-board confirmation, all-cells-complete confirmation, floor advance, floor-500 completion and “保存回个人进度” as the only calculator-to-storage write path.

- [ ] **Step 3: Provide the user verification commands**

Commands: `node --test js/wooden-man-alley-ui.test.js` and `node --test --test-name-pattern="wooden man|木人巷" serve.test.js`

Expected before implementation: FAIL because the partition and UI do not exist.

- [ ] **Step 4: Add the partition shell and navigation hooks**

Insert “木人巷” after “战匣丹囊” in desktop markup and inside the mobile “更多” list. Add the section shell with progress/calculator/reference containers and load scripts in dependency order.

- [ ] **Step 5: Implement personal progress rendering and persistence**

Render account identity, end date/remaining days, responsive board, resource editor and per-account package editor. Use event delegation, preserve current subpage/view state, and show non-blocking storage errors. Confirm destructive/overwriting actions.

- [ ] **Step 6: Integrate navigation lifecycle**

Register the partition in `js/app.js`, ensure switching away and back preserves the selected subpage and scroll/view state, and refresh personal data when the active game account changes or the document is restored.

- [ ] **Step 7: Provide the passing verification commands**

Commands: `node --test js/wooden-man-alley-ui.test.js` and `node --test --test-name-pattern="wooden man|木人巷" serve.test.js`

Expected after implementation: all Task 4 tests PASS when run by the user.

- [ ] **Step 8: Commit the partition and progress UI**

```bash
git add index.html js/app.js js/wooden-man-alley-ui.js js/wooden-man-alley-ui.test.js serve.test.js
git commit -m "feat: add wooden man alley progress UI"
```

### Task 5: Calculator, reference view and responsive styling

**Files:**
- Modify: `js/wooden-man-alley-ui.js`
- Modify: `js/wooden-man-alley-ui.test.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: planner result contracts from Task 3 and UI shell/storage from Task 4.
- Produces: forward/reverse calculator rendering, editable stage limits, three purchase-plan cards, current-floor action highlighting, and reference tables/cards.

- [ ] **Step 1: Write failing calculator interaction tests**

Assert the two calculation directions, six shortcut targets plus arbitrary input, conservative default, all three risk summaries, package opt-in defaulting off, stage tool/quantity controls, recalculation without persistence, explicit save-back confirmation, insufficiency messages and package mystery-box display.

- [ ] **Step 2: Write failing responsive/CSS structure tests**

Assert scoped `#partition-wooden-man-alley` styles, square grid cells, 6-column mobile board without page-level overflow, minimum touch sizing, mobile single-column resources/results, tablet two-column board/advice layout, collapsed advanced controls and stage-card fallback for wide result tables.

- [ ] **Step 3: Provide the user verification commands**

Commands: `node --test js/wooden-man-alley-ui.test.js` and `node --test --test-name-pattern="wooden man|木人巷|responsive" serve.test.js`

Expected before implementation: FAIL on missing calculator/reference markup and CSS contracts.

- [ ] **Step 4: Implement calculator rendering and controls**

Render summary first, then the recommended plan, then stage details. Highlight conservative by default while keeping theoretical/worst visible. Apply current-board action highlights only as advice; never mutate progress from calculation.

- [ ] **Step 5: Implement reference content**

Render tier rules, tool effects/costs, shortcut rewards, editable package defaults and methodology notes. State explicitly that mystery-box contents are unknown, swords do not auto-produce and unused-item refunds are not calculated.

- [ ] **Step 6: Implement responsive styles**

Use partition-scoped CSS. Keep the 6×6 board within its container through CSS grid and aspect ratio; convert wide results to cards at mobile breakpoints and use existing tablet/mobile breakpoints where possible.

- [ ] **Step 7: Provide the passing verification commands**

Commands: `node --test js/wooden-man-alley-ui.test.js` and `node --test --test-name-pattern="wooden man|木人巷|responsive" serve.test.js`

Expected after implementation: all Task 5 tests PASS when run by the user.

- [ ] **Step 8: Commit calculator/reference/responsive UI**

```bash
git add js/wooden-man-alley-ui.js js/wooden-man-alley-ui.test.js css/style.css serve.test.js
git commit -m "feat: add wooden man alley calculator"
```

### Task 6: Backup/sync coverage and PWA 1.0.45 release

**Files:**
- Modify: `js/account-profiles.test.js`
- Modify: `js/cloud-sync.test.js`
- Modify: `serve.test.js`
- Modify: `service-worker.js`
- Modify: `.github/workflows/pages.yml`
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `version.json`
- Modify: `manifest.webmanifest` if its current version metadata requires a synchronized bump
- Modify: `README.md`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: account-scoped key `qinshi_wooden_man_alley_progress_v1` and all new runtime assets.
- Produces: PWA version `1.0.45`, precached/deployed wood-man assets, version-check visibility and documented manual acceptance checklist.

- [ ] **Step 1: Write failing account/backup/PWA tests**

Assert that the new logical key is stored under the active account, included in account snapshot export/import, restored without cross-account leakage, and retained through source-device overwrite semantics. Assert the service worker and Pages workflow include all four new runtime assets, every cache-busted HTML asset uses 1.0.45, and `version.json`, `js/pwa.js`, service-worker cache name and visible version agree.

- [ ] **Step 2: Provide the user verification commands**

Commands: `node --test js/account-profiles.test.js js/cloud-sync.test.js serve.test.js`

Expected before release edits: FAIL on missing new assets and version mismatch.

- [ ] **Step 3: Confirm account snapshot inclusion through existing generic storage behavior**

If the existing account/sync implementation already captures all account-prefixed logical keys, add only regression tests. Modify production account/sync code only if those tests reveal an explicit allowlist that must include the wood-man key.

- [ ] **Step 4: Bump and wire PWA 1.0.45**

Add `data/wooden-man-alley.js`, `js/wooden-man-alley.js`, `js/wooden-man-alley-planner.js` and `js/wooden-man-alley-ui.js` to service-worker precache and GitHub Pages copying. Update all 1.0.44 version references that form the release contract to 1.0.45 without changing unrelated content.

- [ ] **Step 5: Update project documentation**

Document the new partition, storage key, module boundaries, version and user-run validation commands. Preserve unrelated user edits in `README.md` and `HANDOVER.md`; patch only the relevant sections.

- [ ] **Step 6: Provide final user-run verification and acceptance commands**

Commands:

```powershell
node --test js/wooden-man-alley.test.js js/wooden-man-alley-planner.test.js js/wooden-man-alley-ui.test.js
node --test js/account-profiles.test.js js/cloud-sync.test.js serve.test.js
```

Manual acceptance focus: desktop navigation, mobile “更多”, 3×3 through 6×6 boards, account switching, current-floor completion, forward/reverse calculations, package opt-in, offline reload and update from an older installed PWA. Expected: user reports all checks passed; the AI does not claim or perform them.

- [ ] **Step 7: Commit the release changes**

```bash
git add js/account-profiles.test.js js/cloud-sync.test.js serve.test.js service-worker.js .github/workflows/pages.yml index.html js/pwa.js version.json manifest.webmanifest README.md HANDOVER.md
git commit -m "chore: release pwa 1.0.45"
```

### Task 7: Integration, merge and GitHub delivery

**Files:**
- No new product files; Git history and branch integration only.

**Interfaces:**
- Consumes: the completed feature branch. Tests and acceptance remain explicitly user-run under project policy and do not block the requested merge/push workflow.
- Produces: local `master` containing the feature and remote `main` updated to the same release commit.

- [ ] **Step 1: Review task-owned diff without executing validation**

Inspect `git status`, `git diff --check`, changed-file list and commits. Confirm no unrelated dirty files, secrets or local configuration were staged. `git diff --check` is a read-only source check, not a test/build/lint run.

- [ ] **Step 2: Report the unverified state and hand the commands to the user**

State explicitly that tests/build/manual acceptance were not run per project policy. List the commands and mobile/tablet/PWA acceptance points from Task 6.

- [ ] **Step 3: Merge to local master**

After preserving unrelated main-checkout changes, perform a fast-forward merge from `codex/wooden-man-alley` into local `master`. Do not reset, discard or stage unrelated user files.

- [ ] **Step 4: Push GitHub only under the user’s standing instruction for this feature**

Push local `master` to remote `main`. Report the exact commit hash and push result. If the push fails, report the error without rewriting history or force-pushing.
