# Exact school-level objectives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Both school plans reach exactly the selected total, never train past it, and distinguish newly crossed nodes from the highest active effect.

**Architecture:** Keep exact added level in both cross-beast DP passes; reject excess before pricing/state insertion. Restrict single-beast candidates to the remaining growth allowance. Preserve componentwise cost/blueprint frontiers within each exact gain. First prove feasibility with ordinary materials; only if zero-modification exact completion is impossible generate modified alternatives, with modification quantity first in all comparisons. UI gets a responsive top comparison and final active effects for every beast, including unchanged ones.

**Tech Stack:** Existing vanilla JS, Node tests, local Playwright/Edge; no dependency or storage-key changes.

**Spec:** User's 2026-11-09 final-rule message (45/90/135/180/225; exact difference; reached targets stop).

## Global Constraints
- No changes to game data, single-beast rules, account storage, blueprint pricing or blue-purple restrictions.
- Preserve unrelated dirty files; work on codex/school-exact-target-1089 in the existing checkout, per project preference to proceed without repeated questions.
- User explicitly requests regression testing and merge/update/push.

## Review Focus
- Sparse reachable levels: a modified material can reach an exact level ordinary materials skip.
- Shared-stock price ties must not discard a cheaper continuation.
- Already-exceeded target stops even with missing prices or no participants.
- Exact growth requires allocating between beasts; per-beast effect maxima are not safe.
- Highest active effect must not list replaced lower tiers as additive effects.

### Task 1: Exact solver and independent verification
- [x] Add literal regressions for 97→135, skipped level infeasibility, reached target, modification-only exact completion, and nonuniform effects; run RED.
- [x] Replace clamped gain and per-beast effect-max filtering; bound candidate final levels; restore modification alternatives only when zero-mod feasibility fails.
- [x] Make oracle enumerate equality (and reached stop), add modified sparse-level cases, retain money/stock tests; run GREEN and performance.

### Task 2: Honest result presentation
- [x] Add real-browser assertions for comparison current/target/final totals, labels, highest active effect and unchanged beasts; run RED.
- [x] Render responsive comparison and per-beast final effects; reached targets show a stop message. Preserve material details and all cost panels.
- [x] Run browser regression and inspect screenshots at mobile/tablet/desktop sizes.

### Task 3: Release
- [x] Bump existing PWA versions to 1.0.89 with no cache-list changes.
- [x] Run relevant unit/browser/PWA/performance checks, record any existing full-suite blockers, get independent review.
- [ ] Commit only scoped files, fast-forward master, push master:main, verify public version.

## Ledger
- Root cause: both main and free-body bounds DP clamp gain; effects pass independently maximizes each beast, violating exact total. Existing zero-mod proof assumes overshooting is legal and must be narrowed to proven zero-mod exact feasibility.
- Ruling: Reuse current checkout with a feature branch; no new worktree or dependency installation needed. Existing Excel and untracked exports are out of scope.
- Task 1: complete. Seven original new regressions RED→GREEN; 19 exact/oracle tests GREEN after additional tie/mod-weight coverage. Existing machine/unit/performance set 91 passed before latest three literal additions. Performance guard cases all exact 45/225, no weakened thresholds.
- Task 2: reached-price browser RED→GREEN, 320px comparison overflow RED→GREEN (global nowrap inheritance fixed locally); final browser run in progress.
- Full npm command repeated and stopped at existing inscription-route-favorites.test.js hang; remaining unit files now in isolated processes, do not claim full npm success.
- Task 2: complete. Browser30 + responsive7 passed; actual320 comparison screenshot visually inspected. PWA88→89 two actual Pages tests passed.
- Task 3 verification: machine95, server99 and other isolated units passed (1125 nonblocked units total). Transient safe.directory error resolved by process-only Git config, no global changes. Independent reviewer found no unresolved issues after 1100 in-memory brute-force checks. Production push still pending.
- Final review scope rulings: unrelated Excel/untracked files preserved; browser/performance/Pages release verified by main agent rather than duplicated by reviewer; corrupt non-project input is outside this targeted algorithm fix and existing normalization contract remains. No deferred minors.
