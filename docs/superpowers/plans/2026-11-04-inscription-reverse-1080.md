# Inscription Reverse 1.0.80 Implementation Plan

> **For agentic workers:** Use executing-plans for root integration and dispatching-parallel-agents for independent provenance and reference domains; each has disjoint file ownership. User approved direct execution and test/release.

**Goal:** Preserve expanded inventory provenance, add safe reverse lookup, and complete inscription references.
**Architecture:** Existing Rules remains authoritative. A pure reverse module computes legal maximal matches, separate account drafts preserve live simulations, and a dedicated reference module owns numeric reference data.
**Tech Stack:** Vanilla JS/CSS, Node tests, isolated Edge browser.
**Spec:** docs/superpowers/specs/2026-11-04-inscription-reverse-1080-design.md

## Global Constraints
- No old manual-source migration; no probability changes or invented unknown green stats.
- Separate query/simulator reverse drafts per account; null X must remain an unselected target slot.
- No real inventory deduction or recast calculator; 7-tier reference values exactly as spec.
- Preserve unrelated Excel; full tests before master/PWA/GitHub release.

## Review Focus
- Multi-source group increments cannot assign another signature's record or rewrite old consumed history.
- Merely filtering and cancelling an applied simulation change must preserve all existing data.
- Repeated query attrs must satisfy whole-item origin legality and high-tier cap.
- Corrupt/readonly/stale/account-changed reverse storage must not silently clobber other state.
- Source-group route counts, blue speed ambiguity and local scrolling must survive export/import and PWA upgrade.

### Task 1: Provenance core (parallel domain)
Files: js/inscription-simulation.js, js/inscription-simulation.test.js only.
Interface: existing act group-quantity/quantity accept optional sourceRecordId; immutable records and signature checks preserved.
- [x] Write RED tests: unique inheritance, multi-source explicit choice, missing/foreign source rejection, old manual preservation, route ancestor counts and undo conflicts.
- [x] Implement, run node --test js/inscription-simulation.test.js (PASS), report semantics to root. No git mutations by agent.

### Task 2: Reference (parallel domain)
Files: new js/inscription-reference.js, js/inscription-reference.test.js, css/inscription-reference.css, tests/inscription-reference.cjs; modify js/inscription.js only.
Interface: global/CommonJS InscriptionReference exports mainStats(prefix,quality): [{attr,value}], render(host): bind local reference controls; root registers assets before inscription.js.
- [x] RED tests exact mainStats, static stone values, wash-only p2 and true tier growth, green unknown; implement module + reference UI and progress integration.
- [x] Unit and responsive 390/768/1440 browser tests, no runtime script registration/git edits by agent.

### Task 3: Reverse core and controller (root)
Files: new js/inscription-reverse.js/.test.js, tests/inscription-reverse.cjs; modify crafting UI/CSS; register new scripts/styles in index/SW.
Interfaces: normalizeDraft, combinations, options, duns, search from reverse module; existing Rules validate/bestTargets; provenance sourceRecordId.
- [x] RED tests counts vs quality, no unsupported pairs, maximal allocations, X placeholder, no M+L illegal p2, speed ambiguity.
- [x] Implement bounded cached computation and account-mode draft persistence; UI fields stay independent until result apply.
- [x] Browser: filtering does not change pending/target, both pages isolate; apply with X, cancellation, stale/corrupt guards. Core tests cover readonly and account switch.
- [x] Add provenance selector payload and browser coverage. Keep old query tests/target attrs working.

### Task 4: Integrate and release
- [x] Review independent diffs, run targeted tests + fresh full npm test (1081/1081).
- [x] One fresh whole-branch review; important fixes covered by regression tests. No pre-fix RED run for the reviewer-originated UI guard/absent-draft fixes; do not claim otherwise.
- [x] Bump all release versions1.0.80, run complete browser suite including PWA old-upgrade/offline, diff check (41 files,363/363; extra1.0.79 upgrade2/2).
- [ ] Scoped commits, ff master, merged-unit tests, push master:main, online version/resource equality.
