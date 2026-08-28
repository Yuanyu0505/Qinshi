# Qin Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a unified Qin-era ink, lacquer, bronze, cinnabar and jade visual system without changing any data, behavior, storage or layout contracts.

**Architecture:** Add a self-contained visual override section at the end of the existing stylesheet. Reuse current semantic classes and the existing sword navigation asset; add no JavaScript, DOM structure, dependency or PWA-version changes.

**Tech Stack:** Static HTML, CSS custom properties, CSS gradients, pseudo-elements, responsive media queries.

**Spec:** `docs/superpowers/specs/2026-08-28-qin-visual-refresh-design.md`

## Global Constraints

- Do not change data, feature logic, storage keys or event handling.
- Preserve existing purple, orange and red equipment-quality semantics.
- Preserve existing mobile/tablet touch targets, sticky tables and bottom safe-area navigation.
- Do not update the PWA version or push GitHub in this change.
- Per project instructions, manual validation is performed by the user; do not run tests, lint or browser verification.

---

### Task 1: Add the Qin visual-system token and background layer

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: existing `:root`, `body`, `.wrap`, `.top`, `.app-shell` styles.
- Produces: Qin theme variables and a low-contrast CSS-only page backdrop.

- [ ] **Step 1: Append theme tokens and layered background**

```css
:root {
  --qin-ink: #0b0907;
  --qin-lacquer: #17110c;
  --qin-bronze: #806132;
  --qin-cinnabar: #a63b2f;
  --qin-jade: #45bd78;
}
body { background-image: radial-gradient(...), linear-gradient(...); }
```

- [ ] **Step 2: Add restrained page-title and divider ornamentation**

Use `header.top::after` for a short gold divider and `h1::after` for a non-interactive cinnabar seal dot. Keep the title text unchanged.

### Task 2: Restyle navigation, panels, controls and tables

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.tabs`, `.tab`, `.panel`, `.summary-card`, `.seg`, form controls, `.table-wrap`, `table`.
- Produces: consistent lacquer panels, bronze borders, cinnabar active controls and readable table hierarchy.

- [ ] **Step 1: Add desktop bamboo-directory navigation details**

Create a subtle vertical bronze line and diamond nodes for inactive entries while preserving the existing `nav-sword.png` selected state.

- [ ] **Step 2: Add lacquer-panel and Qin-corner treatments**

Apply gradients, inset highlights and small corner motifs only to top-level panels and summary containers. All decorative pseudo-elements must use `pointer-events: none`.

- [ ] **Step 3: Refine buttons, inputs, selects and focus states**

Use a short transition, warm border highlight on hover/focus, cinnabar active fill, and consistent disabled opacity without modifying dimensions or handlers.

- [ ] **Step 4: Refine table and result-card hierarchy**

Use dark lacquer headers, bronze separators, restrained row hover and inset card depth. Do not modify existing quality-token colors.

### Task 3: Add mobile/tablet reduction rules

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: existing responsive ranges at 1024px and 767px.
- Produces: lower-cost visual effects, clear bottom navigation and preserved touch targets.

- [ ] **Step 1: Reduce texture and ornament density below 1024px**

Disable large panel corner motifs for nested and dense cards, reduce shadow spread and keep all current layout rules intact.

- [ ] **Step 2: Restyle mobile bottom navigation**

Remove desktop line/node decorations, retain five-column navigation, add lacquer background and cinnabar/gold active feedback.

- [ ] **Step 3: Respect reduced-motion preference**

Disable transitions and animated sheen under `@media (prefers-reduced-motion: reduce)`.

### Task 4: Review, commit and integrate locally

**Files:**
- Review: `css/style.css`
- Review: `docs/superpowers/specs/2026-08-28-qin-visual-refresh-design.md`
- Review: `docs/superpowers/plans/2026-08-28-qin-visual-refresh.md`

**Interfaces:**
- Consumes: completed theme changes.
- Produces: a committed feature branch fast-forwarded into local `master`.

- [ ] **Step 1: Inspect the diff for scope and accidental functional changes**

Confirm only CSS and the two documentation files changed; confirm no PWA, data or JavaScript files changed.

- [ ] **Step 2: Commit the visual refresh**

```bash
git add css/style.css docs/superpowers/specs/2026-08-28-qin-visual-refresh-design.md docs/superpowers/plans/2026-08-28-qin-visual-refresh.md
git commit -m "style: apply Qin visual theme"
```

- [ ] **Step 3: Fast-forward local master**

```bash
git -C C:/Users/pghyl/Desktop/deepseek merge --ff-only codex/qin-visual-refresh
```

- [ ] **Step 4: Provide manual-review points**

Ask the user to inspect desktop sword navigation, common panels, filters, dense tables, mobile bottom navigation and status/quality colors. State explicitly that PWA and GitHub were not updated.
