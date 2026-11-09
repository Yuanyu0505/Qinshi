# 机关兽展示层重整 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User explicitly requests autonomous implementation without design approval; project AGENTS.md reserves tests/lint/manual acceptance to the user.

**Goal:** Apply the provided 1.0.89 UI review without changing calculators, game data, reference numbers, or account storage semantics.
**Architecture:** Keep current templates and delegated events; add identity-keyed presentation state and minimal replacement of affected cards. Inputs precede results. Layer summaries/navigation before disclosure details. Move existing module-scoped CSS into one dedicated stylesheet and keep global theme rules intact.
**Tech Stack:** Vanilla JS/HTML/CSS, existing Worker and storage APIs; no new dependency.
**Spec:** `C:/Users/pghyl/Downloads/秦时机关兽_UI布局审查与改造方案_1.0.89.md` plus user's UI-only restriction.

## Global Constraints
- Do not edit `data/*`, `js/machine-beasts.js`, `js/machine-beast-school-planner.js`, calculation runner/worker, account storage APIs or keys.
- Do not execute tests, lint, format checking or manual acceptance automatically; provide user checklist and do not claim unrun verification passed.
- User authorizes merge to local master, PWA update and GitHub push. Preserve unrelated Excel, exports and untracked files.
- UI state is in-memory / existing navigation snapshot only, never added to saved beast inventory.

## Review Focus
- Search while a Worker is active must retain busy/results unless the actual beast/school changes.
- High-rank/modification toggles must retain disclosure, draft values, focus identity and nearby scroll position.
- Repricing invalidates school results; single result only refreshes its displayed cost.
- All result material/metrics/effects and all seven reference sections remain reachable on keyboard and mobile.
- New CSS must be included in Pages/PWA cache; scoped extraction must not change other modules' global styles.

### Task 1: Interaction continuity
- [x] Stable disclosure keys, focus/scroll restoration, presentation snapshot integration.
- [x] Search cancellation only on actual context switch; guard native search change/composition events.
- [x] Local per-card control updates for inventory/participation; no full inventory redraw per numeric input.

### Task 2: Readable task layout
- [x] Controls before results in real DOM, reachable calculation/navigation controls and reduced-motion-aware result focus.
- [x] Single core fields/inventory/prices grouped; school goal/strategy/prices/participants organized near each other.
- [x] Progress quality/inventory presentation filters and compact cards with source/full stock disclosure.
- [x] Desktop comparison + mobile summaries, plan/effects anchors, foldable materials/secondary metrics preserving all values.
- [x] Reference seven-section anchors, truthful search label and partial search refresh; more compact effect/threshold/research presentation.

### Task 3: CSS and release
- [x] Consolidate module rules and add responsive container-aware grids without changing global UI theme.
- [x] PWA1.0.90, precache and Pages asset coverage, scope-only static review and independent read-only reviewer.
- [ ] Commit only task files, merge master, push master:main; report actual validation limits and user acceptance checklist.

## Decisions / Ledger
- Use anchors instead of new reference tabs; no new global reference search, density preference or clipboard feature.
- No new fixed bottom toolbar: use in-flow sticky/local actions above existing mobile global navigation, avoiding duplicate fixed layers.
- Only presentation arithmetic for summaries/differences/counts is allowed; all numeric game inputs/results are read from existing data and result objects.
- Current checkout reused on a feature branch; no user files are cleaned up. New layout stylesheet loaded after shared responsive CSS with module scope.
- Static review: restoreView hidden-region stale DOM, filtered explicit navigation, radio focus identity, obsolete result links all addressed. No runtime verification claimed; new and adapted regression cases are user-run only.
- Header/progress level labels and single cost priority summary refresh from existing CORE helpers; no new optimizer or pricing formula.
