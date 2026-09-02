# Mobile UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the complete mobile layout and interaction system without changing application data or calculations.

**Architecture:** Add one reusable mobile enhancement layer across the existing HTML, CSS, and event binding code. Keep domain modules intact; only navigation state, presentation wrappers, accessibility attributes, and responsive rules change.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-02-mobile-ux-overhaul-design.md`

## Global Constraints

- Do not alter equipment, atlas, forbidden-land, inscription, machine-beast, tactics, formation, quiz, or forging domain data.
- Preserve the existing equipment/forging and progress/equipment one-time return sessions.
- Preserve localStorage keys and stored value formats.
- Do not update PWA versions, merge to master, or push GitHub without a separate user request.
- Project verification is performed by the user; add regression assertions but do not proactively run test, lint, or formatting commands.

---

### Task 1: Mobile navigation and dialog behavior

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: hash-backed user partition navigation, per-partition scroll restoration, mobile-more focus management.

- [x] Add static regression assertions for hash navigation, focus restoration, inert background, and landscape nav reset.
- [x] Extend `bindTabs()` with active partition tracking, scroll snapshots, hash history, and `popstate` handling.
- [x] Reset scrolling only for direct user partition changes; leave internal navigation sources untouched.
- [x] Trap focus in the mobile-more dialog and restore it on close.
- [x] Add final mobile-landscape CSS overrides that reset desktop navigation min-height and padding.

### Task 2: Mobile filter disclosure and touch targets

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: `bindMobileDisclosure(toggleId, contentId)` and two mobile-only advanced filter disclosures.

- [x] Add advanced-filter buttons and wrappers for atlas and equipment filters.
- [x] Add static assertions for the disclosure IDs and 44px mobile touch rules.
- [x] Bind disclosure state to the mobile media query without changing desktop visibility.
- [x] Add programmatic labels to search controls and expand checkbox label hit areas.

### Task 3: Compact equipment quality cards

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: `equipmentMobileTierHtml(item, tier, content, expanded)` used only by mobile result cards.

- [x] Add regression assertions for mobile quality `details` markup.
- [x] Render each quality as a 44px accordion summary with the first available quality initially open.
- [x] Preserve favorite, forge navigation, detail popover, and comparison actions.
- [x] Style the accordion without changing desktop tables.

### Task 4: Compact tactics calculator

**Files:**
- Modify: `js/tactics-ui.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: responsive `details` wrappers for tactic configs/material inventory and a duplicate mobile calculate action.

- [x] Add regression assertions for tactic and material disclosure markup and mobile calculate control.
- [x] Keep details open on desktop/tablet and collapsed on phone portrait/short landscape.
- [x] Render a fixed mobile calculate button using the existing `data-cost-action="calculate"` handler.
- [x] After calculation, move the result ahead of inputs and scroll its heading into view.

### Task 5: Horizontal-scroll affordances

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `js/inscription.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Produces: `.mobile-scroll-hint` and `.mobile-scroll-region` reusable wrappers.

- [x] Add assertions for hints and accessible scroll labels.
- [x] Add the hint to forging summary and dynamic forging result tables.
- [x] Add the hint to both inscription reference tables.
- [x] Add focus-visible and edge-gradient styling without introducing page-level overflow.

### Task 6: Release handoff

**Files:**
- Review: `git diff -- index.html css/style.css js/app.js js/tactics-ui.js js/inscription.js serve.test.js docs/superpowers/specs/2026-09-02-mobile-ux-overhaul-design.md docs/superpowers/plans/2026-09-02-mobile-ux-overhaul.md`

**Interfaces:**
- Produces: a reviewable `codex/mobile-ux-overhaul` branch.

- [x] Review the diff for accidental data, PWA version, or storage-key changes.
- [x] Record the user-run verification checklist for portrait, landscape, tablet, navigation, and cross-partition return flows.
- [x] Do not merge, update PWA, or push until explicitly requested.
