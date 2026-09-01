# Equipment Forging Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make equipment-result names open the corresponding main-equipment forging query and correct “伍德终始” to “五德终始” throughout generated tool data.

**Architecture:** Add a small UMD module that owns deterministic equipment-to-forging name resolution and returns the requested forging navigation state. The existing app consumes that state to switch partitions, select query/main mode, populate the search field, render results, and scroll into view. Keep source normalization and generated data synchronized for the book-name correction.

**Tech Stack:** Vanilla JavaScript, Node.js built-in test runner, Python data generator, HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-equipment-forging-links-design.md`

## Global Constraints

- Preserve the special one-to-one rules “鬼谷子→鬼谷子” and “神兵鬼谷子→神兵鬼谷子”.
- Use explicit aliases for confirmed non-identical names; do not fuzzy-match.
- Leave equipment without forging data non-clickable.
- Keep the favorite star interaction independent.
- After implementation approval, publish the feature through the requested PWA, local `master`, and GitHub release flow.

---

### Task 1: Deterministic forging-target resolver

**Files:**
- Create: `js/equipment-forging.js`
- Create: `js/equipment-forging.test.js`

**Interfaces:**
- Produces: `resolveForgeTarget(name, forgingItems): string | null`
- Produces: `buildForgeNavigation(name, forgingItems): { partition, view, mode, query } | null`

- [ ] **Step 1: Write the failing tests**

Cover direct normal names, ordinary 神兵 prefix removal, both 鬼谷子 cases, every confirmed explicit alias, and unresolved names with hand-written expected targets.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test js/equipment-forging.test.js`

Expected: FAIL because `js/equipment-forging.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a UMD module with the confirmed alias object. Resolution order is explicit alias, exact match, protected 神兵鬼谷子 exact match, then stripping 神兵 only when the stripped name exists in forging data.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test js/equipment-forging.test.js`

Expected: all resolver tests PASS.

### Task 2: Correct 五德终始 in generated equipment data

**Files:**
- Modify: `tools/build_special_equipment.py`
- Modify: `data/special-equipment.js`
- Create: `js/special-equipment-data.test.js`

**Interfaces:**
- Produces: displayed/searchable equipment name `五德终始`.

- [ ] **Step 1: Write the failing data test**

Load the real browser data file in a VM, assert that `五德终始` exists and `伍德终始` does not.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test js/special-equipment-data.test.js`

Expected: FAIL because the current data contains `伍德终始`.

- [ ] **Step 3: Add source normalization and synchronize generated output**

Add `伍德终始: 五德终始` to the shared name overrides and apply the override when parsing the book sheet; update the current generated item name to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test js/special-equipment-data.test.js`

Expected: PASS.

### Task 3: Wire equipment-result navigation

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `EquipmentForging.buildForgeNavigation(name, FDATA.items)`.
- Produces: click/tap/keyboard navigation from a resolvable equipment result name to the populated forging query.

- [ ] **Step 1: Load the resolver before the app**

Add `js/equipment-forging.js` before `js/app.js` in `index.html`.

- [ ] **Step 2: Render resolvable result names as buttons**

In `equipmentResultNameHtml`, wrap only a resolvable equipment-name badge in a dedicated button with an equipment id; keep the favorite button as its sibling.

- [ ] **Step 3: Handle the navigation action**

In the existing delegated results click listener, resolve the item and navigation state, switch to the forging partition, set query view and main mode, populate `forge-search`, call existing render functions, then scroll the query panel into view.

- [ ] **Step 4: Add responsive and focus styling**

Make the link button inherit the existing badge appearance, preserve layout at desktop/tablet/mobile widths, and add hover/focus-visible feedback without changing font size.

- [ ] **Step 5: Run focused regression tests**

Run: `node --test js/equipment-forging.test.js js/special-equipment-data.test.js js/query.test.js js/forging.test.js`

Expected: all focused tests PASS.
