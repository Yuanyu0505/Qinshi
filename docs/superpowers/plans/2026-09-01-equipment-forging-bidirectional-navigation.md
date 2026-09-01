# Equipment Forging Bidirectional Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reversible equipment-to-forging navigation and divine-first forging-to-equipment navigation without changing existing query semantics.

**Architecture:** Extend the existing UMD mapping module with deterministic reverse resolution and pure return-session helpers. Centralize partition switching in `js/app.js`, retain one in-memory return session, and render only resolvable forging result names as accessible buttons. Release the verified feature as PWA `1.0.22`.

**Tech Stack:** Vanilla JavaScript, DOM event delegation, Node.js built-in test runner, HTML/CSS, service worker, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-01-equipment-forging-bidirectional-navigation-design.md`

## Global Constraints

- Scrolling alone must not invalidate the return session.
- Search edits, mode/view changes, other partitions, and different forging results must invalidate it.
- Reverse resolution prefers divine equipment; both 鬼谷子 forging names resolve to 神兵鬼谷子.
- Ordinary reverse navigation clears result-affecting filters but preserves favorites, comparison state, and the main-attribute visibility switch.
- Return sessions remain memory-only and never alter URL or browser history.
- Forging personal progress, material names, and the common summary remain non-clickable.
- All new controls must work on desktop, tablet, and phone.

---

### Task 1: Reverse Mapping and Return-Session Core

**Files:**
- Modify: `js/equipment-forging.js`
- Modify: `js/equipment-forging.test.js`

**Interfaces:**
- Consumes: `resolveForgeTarget(name, forgingItems): string | null`
- Produces: `resolveEquipmentTarget(forgeName, equipmentItems, forgingItems): object | null`
- Produces: `createReturnSession(sourceItemId, forgeName, equipmentView, scrollY): object`
- Produces: `matchesReturnSession(session, forgeName): boolean`

- [ ] **Step 1: Write failing reverse-resolution tests**

Add assertions equivalent to:

```js
assert.strictEqual(resolveEquipmentTarget("非攻九变", equipmentItems, forgingItems).name, "神兵非攻");
assert.strictEqual(resolveEquipmentTarget("韩非子", equipmentItems, forgingItems).name, "神兵韩非子");
assert.strictEqual(resolveEquipmentTarget("鬼谷子", equipmentItems, forgingItems).name, "神兵鬼谷子");
assert.strictEqual(resolveEquipmentTarget("神兵鬼谷子", equipmentItems, forgingItems).name, "神兵鬼谷子");
assert.strictEqual(resolveEquipmentTarget("五德终始", equipmentItems, forgingItems).name, "五德终始");
assert.strictEqual(resolveEquipmentTarget("银针", equipmentItems, forgingItems), null);
```

- [ ] **Step 2: Write failing return-session tests**

Verify snapshots are cloned, exact matching accepts only the same forge name, and invalid/null sessions do not match:

```js
const session = createReturnSession("item-1", "韩非子", view, 640);
view.filters.push("暴击");
assert.deepStrictEqual(session.equipmentView.filters, ["速"]);
assert.strictEqual(matchesReturnSession(session, "韩非子"), true);
assert.strictEqual(matchesReturnSession(session, "非攻九变"), false);
```

- [ ] **Step 3: Run the focused tests and preserve the red evidence**

Run: `node --test js/equipment-forging.test.js`

Expected: FAIL because the reverse and session functions are not exported.

- [ ] **Step 4: Implement deterministic reverse resolution and cloning**

Implement candidate discovery by filtering equipment items whose `resolveForgeTarget(item.name, forgingItems)` equals the normalized forge name. Return the explicit 鬼谷子 override first, then a `神兵` candidate, then an exact ordinary candidate, then the first remaining candidate. Implement session construction with a JSON-safe deep clone of `equipmentView` and numeric non-negative `scrollY`.

- [ ] **Step 5: Run the focused tests**

Run: `node --test js/equipment-forging.test.js`

Expected: all mapping and session tests PASS.

### Task 2: Central Partition Controller and Forward Return Flow

**Files:**
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `createReturnSession(...)`, `matchesReturnSession(...)`
- Produces: `switchPartition(name, options)` with `source` and `preserveEquipment` options
- Produces: one in-memory `forgeReturnSession`

- [ ] **Step 1: Add failing integration assertions**

In `serve.test.js`, assert that `js/app.js` contains a centralized `switchPartition`, captures equipment view state and `window.scrollY`, restores the snapshot, and defers `window.scrollTo` until after rendering. Assert that user forging search/mode/view and navigation handlers invalidate the session.

- [ ] **Step 2: Run the targeted integration test**

Run: `node --test --test-name-pattern="装备属性与橙装锻造支持一次性原页返回" serve.test.js`

Expected: FAIL because the session controller is absent.

- [ ] **Step 3: Centralize partition switching**

Move the existing partition activation logic behind `switchPartition(name, options)`. Keep ordinary user navigation to `equipment` calling `resetEquipmentView()`, while programmatic return/reverse navigation passes `preserveEquipment: true`.

- [ ] **Step 4: Capture and restore the equipment view**

Create helpers that copy these fields: `search`, `category`, `favoritesOnly`, `main`, `showMain`, `filters`, `sortAttr`, `valueSource`, `activated`, and `comparison`. On return, restore them, synchronize `el.search.value`, call `apply()`, then run `window.scrollTo({ top: session.scrollY, behavior: "auto" })` inside `requestAnimationFrame`.

- [ ] **Step 5: Wire invalidation rules**

Invalidate only for real user events: forging input, forging mode click, forging view click, another partition, or a different result. Do not attach any scroll listener and do not invalidate while the forward navigation code writes its initial query.

- [ ] **Step 6: Run the targeted integration test**

Run: `node --test --test-name-pattern="装备属性与橙装锻造支持一次性原页返回" serve.test.js`

Expected: PASS.

### Task 3: Forging Result Buttons and Ordinary Reverse Navigation

**Files:**
- Modify: `js/app.js`
- Modify: `css/style.css`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `resolveEquipmentTarget(...)`, `matchesReturnSession(...)`, `switchPartition(...)`
- Produces: `data-forging-equipment` buttons in both query result modes

- [ ] **Step 1: Add failing UI assertions**

Assert that `forgingRowHtml` resolves the row name, renders a button only when a target exists, distinguishes return and ordinary tooltips, and that the delegated click handler supports both exact return and reverse navigation. Assert CSS includes focus-visible feedback and a 44px mobile/tablet target.

- [ ] **Step 2: Run the targeted UI test**

Run: `node --test --test-name-pattern="橙装锻造结果装备名支持返回与神兵优先反向跳转" serve.test.js`

Expected: FAIL before the buttons and styles exist.

- [ ] **Step 3: Render resolvable forging names as buttons**

In both main and material result rows, call `resolveEquipmentTarget(item.name, DATA.items, FDATA.items)`. Render non-resolvable names with the original `span`. Render resolvable names as a button carrying the exact forging name, preserving `eq-block`, `eq-purple`, and `eq-orange` classes.

- [ ] **Step 4: Implement delegated result clicks**

When `matchesReturnSession` is true, consume the session and restore the captured equipment view. Otherwise invalidate any old session, resolve the equipment target, set `state.search` and `el.search.value`, set `category`, `favoritesOnly`, `main`, `filters`, and `sortAttr` to their neutral values, reset `valueSource` to `max`, preserve `favorites`, `comparison`, and `showMain`, set `activated = true`, enter equipment with preservation, and call `apply()`.

- [ ] **Step 5: Add responsive interaction styling**

Reuse the quality block appearance, remove native button chrome, add hover and `:focus-visible` treatment, and add `min-height: 44px; touch-action: manipulation` under the existing tablet/mobile media query.

- [ ] **Step 6: Run focused tests**

Run: `node --test js/equipment-forging.test.js --test-name-pattern="橙装锻造结果装备名支持返回与神兵优先反向跳转" serve.test.js`

Expected: all reverse navigation and responsive assertions PASS.

### Task 4: Regression Verification and PWA 1.0.22 Release

**Files:**
- Modify: `index.html`
- Modify: `js/pwa.js`
- Modify: `service-worker.js`
- Modify: `serve.test.js`
- Modify: `HANDOVER.md`
- Verify: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: PWA cache and visible app version `1.0.22`

- [ ] **Step 1: Update the PWA release assertions**

Change the PWA test to expect `1.0.22` in `index.html`, `js/pwa.js`, and `service-worker.js`; retain assertions that `js/equipment-forging.js` is served, precached, and copied by the Pages workflow.

- [ ] **Step 2: Run the PWA test to verify it fails**

Run: `node --test --test-name-pattern="PWA 1.0.22" serve.test.js`

Expected: FAIL while the app remains at `1.0.21`.

- [ ] **Step 3: Update release files and handover notes**

Set the visible version, `APP_VERSION`, and service-worker cache suffix to `1.0.22`. Add a handover entry describing reversible navigation, divine-first reverse resolution, responsive controls, and test coverage.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node --test js/equipment-forging.test.js js/query.test.js js/forging.test.js
node --test
git diff --check
```

Expected: all tests PASS and `git diff --check` reports no errors.

- [ ] **Step 5: Commit, merge, push, and verify Pages**

Commit only task files in the isolated branch, fast-forward local `master`, and push `master:main`. Verify remote `main` equals local `HEAD`, then confirm the deployed service worker contains `1.0.22` and the deployed `js/equipment-forging.js` exposes the reverse resolver.
