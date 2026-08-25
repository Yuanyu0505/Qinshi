# Equipment Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive, session-only multi-equipment comparison workspace and remove two redundant machine-beast result labels.

**Architecture:** Create a pure UMD comparison module that derives large categories, tier tokens, dynamic dimensions, highest values, and deltas from existing equipment data. Keep UI/session state in `js/app.js`, render a desktop comparison table and mobile cards, and reuse existing query helpers for cumulative book tiers.

**Tech Stack:** Static HTML, CSS, browser JavaScript, UMD CommonJS-compatible logic, Node built-in test contracts.

**Spec:** `docs/superpowers/specs/2026-08-25-equipment-comparison-design.md`

## Global Constraints

- Do not modify generated equipment source data.
- Comparison state is session-only and must not use localStorage.
- Desktop, phone, and tablet layouts are included.
- Do not update PWA or push GitHub.
- Add test contracts but do not execute validation; project policy assigns validation to the user.
- Commit the completed change and fast-forward local `master` without staging the user's workbook or unrelated files.

---

### Task 1: Pure comparison core

**Files:**
- Create: `js/equipment-compare.js`
- Create: `js/equipment-compare.test.js`

**Interfaces:**
- Consumes: `QSQuery.finalBookStage(item, tier)` and existing `item.tiers`, `item.stages`, `token.t`, `token.v` data.
- Produces: `groupForCategory`, `tokensForTier`, `availableDimensions`, `dimensionValue`, `compareItems` on `window.QSEquipmentCompare` / CommonJS export.

- [ ] **Step 1: Write comparison tests before production code**

Cover exact category grouping, missing tiers, book final cumulative tiers, fixed dimension order, single-stat expansion of `攻防血`, raw-only `攻防血` comparison, repeated-token summation, zero values, ties, percent differences, speed differences, and unavailable items.

- [ ] **Step 2: Implement the UMD comparison module**

Use `ATTRIBUTE_ORDER`, `CATEGORY_GROUPS`, and small pure helpers. `compareItems(items, tier, dimensions)` must return a stable model shaped as:

```js
{
  tier: "红金",
  dimensions: ["暴击"],
  maxima: { 暴击: 15 },
  rows: [{
    item,
    available: true,
    values: { 暴击: { value: 10, isMax: false, difference: -5, display: "10%", differenceDisplay: "-5%" } }
  }]
}
```

- [ ] **Step 3: Add browser script ordering contract**

Update `serve.test.js` to require `js/equipment-compare.js` after `js/query.js` and before `js/app.js`.

### Task 2: Comparison panel and result actions

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `window.QSEquipmentCompare` from Task 1 and `SPECIAL_EQUIPMENT_DATA.items`.
- Produces: session state `comparison`, compare-panel markup, add/remove/clear/tier/dimension/start interactions.

- [ ] **Step 1: Add static UI contracts before markup**

Require IDs for panel, controls, selected equipment, result region, tier selection, dimension selection, and compare actions. Require add buttons in both table and card renderers.

- [ ] **Step 2: Add the comparison panel to `index.html`**

Place it after the equipment filter panel and before `#results`. Load `js/equipment-compare.js` between query and app scripts.

- [ ] **Step 3: Add session state and helpers in `js/app.js`**

Initialize the confirmed default tier `红金`; implement item lookup, group lock, add/remove/clear, dimension reconciliation, action-label rendering, and no-localStorage behavior.

- [ ] **Step 4: Render and bind the comparison controls**

Render selected tags, exact tier choices, ordered dimension buttons, full-select/clear actions, validation messages, and result refresh after an initial comparison starts.

- [ ] **Step 5: Add result-list actions**

Add an action column to desktop tables and an action button to mobile cards. Preserve existing book detail interactions through delegated event handling.

### Task 3: Desktop and mobile comparison results

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `QSEquipmentCompare.compareItems()` result model.
- Produces: `.equipment-compare-table` for desktop and `.equipment-compare-cards` for phone/tablet.

- [ ] **Step 1: Add result-rendering contracts**

Require highest-value, difference, unavailable, desktop-table, and mobile-card class names and responsive visibility rules.

- [ ] **Step 2: Render desktop comparison table**

Use equipment columns and dimension rows. Render red bold highest values, normal white non-highest values, and green normal-weight negative differences.

- [ ] **Step 3: Render mobile and tablet cards**

Show one equipment per vertical card with category, main attribute, tier availability, and selected dimensions without horizontal scrolling.

- [ ] **Step 4: Add focused responsive styling**

Style the compare tray, selected tags, disabled/add states, dimension controls, desktop table, mobile cards, red maxima, and green deltas. Switch table/cards at the existing mobile breakpoint.

### Task 4: Remove redundant machine-beast labels

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: existing single and school result renderers.
- Produces: unchanged result structures without the two redundant captions.

- [ ] **Step 1: Add absence contracts**

Assert the UI source no longer contains the standalone strings `最优方案` and `目标流派阶数计算`, while retaining `计算结果`, `自由等级方案`, and `效果档位方案`.

- [ ] **Step 2: Remove only the requested captions**

Delete the two `<span>` nodes without changing headings, totals, plan calculations, or result layout structure.

### Task 5: Documentation, commit, and local integration

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-equipment-comparison-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-equipment-comparison.md`

**Interfaces:**
- Consumes: completed implementation and tracked file list.
- Produces: one feature commit merged to local `master`.

- [ ] **Step 1: Self-review coverage and placeholders**

Confirm every confirmed rule maps to a test contract and implementation step; remove vague placeholders and keep names consistent with Task 1 interfaces.

- [ ] **Step 2: Inspect the scoped diff**

Limit staging to comparison code, markup, styling, tests, documents, and the machine-beast UI label removal. Do not stage the workbook, `.codex-tmp/`, `答题.jpg`, or unrelated files.

- [ ] **Step 3: Commit the feature branch**

```powershell
git add -- 'index.html' 'js/app.js' 'js/equipment-compare.js' 'js/equipment-compare.test.js' 'js/machine-beasts-ui.js' 'css/style.css' 'serve.test.js' 'docs/superpowers/specs/2026-08-25-equipment-comparison-design.md' 'docs/superpowers/plans/2026-08-25-equipment-comparison.md'
git commit -m "feat: compare equipment attributes"
```

- [ ] **Step 4: Fast-forward local master**

```powershell
git -c safe.directory='C:/Users/pghyl/Desktop/deepseek' merge --ff-only codex/machine-beast-school-planner
```

