# Machine Beast School Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the machine-beast calculator with selectable owned inventory and a globally optimized 霸道／非攻 target-stage planner that emits both free-level and milestone-friendly plans.

**Architecture:** Keep the existing single-beast core compatible, add inventory-policy inputs to it, and place cross-beast dynamic programming in a focused `machine-beast-school-planner.js` module. The UI gains calculator submodes and keeps all edits in temporary state; results are read-only planning output and never mutate saved progress.

**Tech Stack:** Static HTML, CSS, browser JavaScript (ES5-compatible style), Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-machine-beast-school-planner-design.md`

## Global Constraints

- Preserve every existing partition and all existing `localStorage` data.
- Do not change the meaning of `qinshi_machine_beasts_progress_v1`.
- Temporary calculator edits must not overwrite personal progress.
- The target-stage mapping is exactly 1–5阶 → 45／90／135／180／225 cumulative awakening levels.
- Existing inventory can only feed the same named machine beast.
- New candidates default to 0改 and ranks 0–7; higher ranks and modifications require explicit switches.
- Checked owned high-rank or modified inventory remains usable regardless of new-candidate switches.
- School-plan 8／9／10-rank invested-count weights are exactly 2／4／8 rank-7 bodies.
- Do not update PWA version, service-worker cache, or GitHub in this task.
- Per project instructions, add or update verification contracts but do not run tests, lint, formatting checks, or manual verification; hand those checks to the user.
- Commit only task-owned files and preserve the modified workbook, `.codex-tmp/`, and `答题.jpg` without staging them.

---

## File Structure

- Modify `js/machine-beasts.js`: accept owned-inventory policies in the existing single-beast calculator while retaining default behavior.
- Create `js/machine-beast-school-planner.js`: generate per-beast candidates, perform school-level dynamic programming, compare plans, merge identical outputs, and aggregate resources.
- Modify `js/machine-beasts-ui.js`: own temporary calculator state, render single/school submodes, inventory selection, participation controls, and results.
- Modify `index.html`: add calculator submode controls and load the new planner module before the machine-beast UI.
- Modify `css/style.css`: desktop and mobile layouts for school controls, inventory rows, summaries, and details without horizontal scrolling.
- Modify `js/machine-beasts.test.js`: core and school-planner behavior contracts.
- Modify `serve.test.js`: static resource, markup, script-order, and responsive-style contracts.

---

### Task 1: Add owned-inventory policy support to the single-beast core

**Files:**
- Modify: `js/machine-beasts.js`
- Test: `js/machine-beasts.test.js`

**Interfaces:**
- Consumes: existing `calculateInvestmentPlan(data, beast, rawProgress, options)`.
- Produces: support for `options.useOwnedInventory: boolean` and `options.ownedLimits: Record<modificationId, Record<rank, number>>` without changing existing callers.

- [ ] **Step 1: Add behavior contracts for disabling and limiting inventory**

Add tests that construct a beast with owned rank-7 inventory, then assert:

```js
const ignored = CORE.calculateInvestmentPlan(DATA, beast, progress, {
  targetLevel: 10,
  useOwnedInventory: false
});
assert.strictEqual(ignored.selected.ownedItems.length, 0);

const limited = CORE.calculateInvestmentPlan(DATA, beast, progress, {
  targetLevel: 10,
  useOwnedInventory: true,
  ownedLimits: { none: { "7": 1 } }
});
assert.ok(limited.selected.ownedItems.reduce((sum, item) => sum + item.count, 0) <= 1);
```

- [ ] **Step 2: Apply inventory policy inside `ownedTypes`**

Change the function signature to:

```js
function ownedTypes(data, beast, progress, options, maximumCount)
```

Return `[]` when `options.useOwnedInventory === false`. When `options.ownedLimits` contains a rank entry, cap `totalAvailable` with `integer(limit)`; when it has no entry, retain the normalized inventory total for backward compatibility.

- [ ] **Step 3: Keep existing default behavior intact**

Ensure calls with no new options still use all visible inventory exactly as before. Do not add fields to normalized personal progress and do not store selection limits in `localStorage`.

- [ ] **Step 4: Record the user verification command without executing it**

User-run command:

```powershell
node --test js/machine-beasts.test.js
```

Expected result after implementation: the existing tests and the two new inventory-policy contracts pass.

- [ ] **Step 5: Commit the core inventory policy**

```powershell
git add -- js/machine-beasts.js js/machine-beasts.test.js
git commit -m "feat: control machine beast calculator inventory"
```

---

### Task 2: Build the cross-beast school planner

**Files:**
- Create: `js/machine-beast-school-planner.js`
- Test: `js/machine-beasts.test.js`

**Interfaces:**
- Consumes: `MACHINE_BEAST_CORE.integer`, `thresholdForLevel`, `levelForResearch`, `normalizeBeastProgress`, and `researchFor`.
- Produces:

```js
MACHINE_BEAST_SCHOOL_PLANNER.defaultTargetStage(data, school, progressByBeast)
MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans(data, school, progressByBeast, options)
```

`calculateSchoolPlans` options:

```js
{
  targetStage: 1,
  participatingBeastIds: ["beast-id"],
  useOwnedInventory: true,
  ownedLimitsByBeast: { "beast-id": { none: { "7": 2 } } },
  allowNewHighRanks: false,
  allowNewModifications: false
}
```

- [ ] **Step 1: Add target-stage and participation contracts**

Add tests requiring:

```js
assert.strictEqual(PLANNER.defaultTargetStage(DATA, school, progress), 1);
assert.strictEqual(
  PLANNER.calculateSchoolPlans(DATA, school, progress, { targetStage: 2 }).target.totalLevel,
  90
);
```

Also assert that a non-participating beast contributes its current level to `current.totalLevel` but never appears in changed beast details.

- [ ] **Step 2: Define normalized planner primitives**

Implement private helpers with stable shapes:

```js
function bodyWeight(rank) {
  return rank > 7 ? Math.pow(2, rank - 7) : 1;
}

function targetTotalForStage(school, stage) {
  var match = school.stages.find(function (item) { return item.stage === stage; });
  return match ? match.requiredTotalLevel : null;
}
```

Normalize every beast into `{ beast, progress, currentLevel, participating, ownedLimits }`. Reject target stages outside 1–5 and return `{ valid: false, errors: [...] }` rather than throwing.

- [ ] **Step 3: Generate per-beast inventory and new-item types**

Each item type must carry:

```js
{
  source: "owned" | "new",
  beastId: "...",
  rank: 7,
  modificationId: "none",
  available: 2,
  researchEach: 75252,
  investedWeight: 1,
  awakeningBlueprintsEach: Math.ceil(75252 / 500),
  organPiecesEach: Math.ceil(75252 / 100)
}
```

Owned entries respect `useOwnedInventory` and per-entry limits. New entries are unlimited, default to ranks 0–7 and `none`; explicit switches add ranks 8–10 and orange modification states. Existing checked high-rank or modified inventory is never filtered by those new-candidate switches.

- [ ] **Step 4: Generate non-dominated candidates for every reachable integer level**

For each participating beast, combine bounded owned items and unbounded new items up to the beast maximum research threshold plus the largest single-item overflow. Candidate output:

```js
{
  beastId: "...",
  startLevel: 8,
  endLevel: 12,
  startResearch: 250000,
  endResearch: 410000,
  addedResearch: 160000,
  investedCount: 3,
  ownedInvestedCount: 2,
  newInvestedCount: 1,
  milestone: false,
  items: [],
  resources: { awakeningBlueprints: 0, organPieces: 0, fragments: 0, contribution: 0, yuan: 0 }
}
```

For each final integer level, retain candidates that are not dominated on invested count, new invested count, end research, and resources. Include the unchanged candidate for every beast.

- [ ] **Step 5: Combine beast candidates with dynamic programming**

The cross-beast state key is cumulative added level capped at the target deficit. Combine one candidate per beast and compare free-plan states using:

```js
[investedCount, newInvestedCount, overflowResearch,
 awakeningBlueprints, organPieces, fragments, contribution, yuan, stableKey]
```

For the milestone plan insert `-milestoneCount` after `newInvestedCount`, so a larger milestone count wins only after total and new invested counts tie. Count a milestone when a changed beast ends at 10, 15, 20, or 25.

- [ ] **Step 6: Aggregate and merge result plans**

Return:

```js
{
  valid: true,
  current: { totalLevel: 30 },
  target: { stage: 1, totalLevel: 45, remaining: 15 },
  plans: [
    {
      kind: "free" | "milestone" | "merged",
      totals: {},
      beasts: []
    }
  ]
}
```

Merge the two plans when their sorted beast IDs, end levels, item sources, ranks, modifications, and quantities are identical. If the target is already met, return one merged zero-cost plan.

- [ ] **Step 7: Add optimizer priority contracts**

Add focused tests asserting:

- rank 8／9／10 count as 2／4／8 invested bodies;
- checked owned inventory is preferred over new bodies when invested count ties;
- free mode may end at a non-milestone integer level;
- milestone mode prefers more 10／15／20／25 endpoints only after invested counts tie;
- identical free and milestone plans merge;
- per-beast resources sum exactly to the result totals;
- orange-five beasts report fragment shortage but no contribution/yuan exchange.

- [ ] **Step 8: Record the user verification command without executing it**

User-run command:

```powershell
node --test js/machine-beasts.test.js
```

Expected result: all core, single-beast, school snapshot, and school planner contracts pass.

- [ ] **Step 9: Commit the school planner core**

```powershell
git add -- js/machine-beast-school-planner.js js/machine-beasts.test.js
git commit -m "feat: calculate machine beast school plans"
```

---

### Task 3: Add calculator submodes and temporary state

**Files:**
- Modify: `index.html`
- Modify: `js/machine-beasts-ui.js`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `MACHINE_BEAST_SCHOOL_PLANNER.defaultTargetStage` and `calculateSchoolPlans`.
- Produces: `single` and `school` calculator UI modes, neither of which mutates personal progress during calculation.

- [ ] **Step 1: Add static page contracts**

Require `index.html` to include:

```html
<button data-machine-calculator-mode="single">单只机关兽</button>
<button data-machine-calculator-mode="school">目标流派阶数</button>
<script src="js/machine-beast-school-planner.js"></script>
```

Assert the planner script loads after `js/machine-beasts.js` and before `js/machine-beasts-ui.js`.

- [ ] **Step 2: Add calculator submode markup**

Inside `#machine-beast-calculator`, add a compact segmented control before the result and controls containers. Keep “单只机关兽” active by default.

- [ ] **Step 3: Extend UI state without changing stored progress**

Add temporary state fields:

```js
calculatorMode: "single",
singleInventoryPolicy: null,
schoolDraft: null,
schoolResult: null
```

`singleInventoryPolicy` and `schoolDraft` are recreated from `state.beasts` when the user requests a reload; neither is passed to `saveProgress()`.

- [ ] **Step 4: Initialize school draft from saved progress**

Implement:

```js
function resetSchoolCalculator(schoolId) { /* clone school progress and defaults */ }
```

It must select all school beasts, enable all nonzero inventory entries with their full counts, disable new high-rank/modification candidates, and set the target to `PLANNER.defaultTargetStage(...)`.

- [ ] **Step 5: Switch calculator modes safely**

Add one delegated click handler for `[data-machine-calculator-mode]`. Switching modes hides the previous result, preserves temporary edits within the current visit, and renders the selected controls.

- [ ] **Step 6: Commit the structural UI change**

```powershell
git add -- index.html js/machine-beasts-ui.js serve.test.js
git commit -m "feat: add machine beast calculator modes"
```

---

### Task 4: Implement selectable inventory controls

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: normalized personal inventory and the Task 1 inventory-policy options.
- Produces: reusable `calculatorInventorySelector(beast, progress, policy, scope)` markup and delegated input/change handling.

- [ ] **Step 1: Add UI contracts for inventory selection**

Assert source contains controls for “使用已有库存”, per-entry `data-machine-owned-enabled`, and `data-machine-owned-limit`, and that CSS defines a responsive `.machine-owned-inventory-grid`.

- [ ] **Step 2: Render only meaningful inventory rows**

For every nonzero inventory entry render:

```html
<label class="machine-owned-inventory-row">
  <input type="checkbox" data-machine-owned-enabled>
  <span>0改 7阶</span>
  <span>已有 ×5</span>
  <input type="number" min="0" max="5" value="5" data-machine-owned-limit>
</label>
```

Group school-calculator entries beneath their machine-beast name. When no inventory exists, show “暂无可用库存” rather than an empty grid.

- [ ] **Step 3: Connect the single-beast policy**

Pass `useOwnedInventory` and `ownedLimits` into `CORE.calculateInvestmentPlan`. Turning off the global switch disables the item rows without erasing selections, so turning it back on restores the prior limits.

- [ ] **Step 4: Connect the school policy**

Maintain `ownedLimitsByBeast` and selected flags in `state.schoolDraft`. Keep checked high-rank and modified rows visible in the selected-inventory summary even when new-candidate switches are off.

- [ ] **Step 5: Add desktop and mobile layouts**

Desktop inventory rows use a compact grid. Under the existing phone/tablet breakpoint, use one or two columns based on available width, keep labels and numeric inputs readable, and do not introduce horizontal scrolling.

- [ ] **Step 6: Commit inventory controls**

```powershell
git add -- js/machine-beasts-ui.js css/style.css serve.test.js
git commit -m "feat: select machine beast planning inventory"
```

---

### Task 5: Render school planner controls and results

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `css/style.css`
- Test: `serve.test.js`

**Interfaces:**
- Consumes: `state.schoolDraft` and `PLANNER.calculateSchoolPlans(...)`.
- Produces: school target form, free/milestone result cards, merged result card, total summary, and per-beast detail cards.

- [ ] **Step 1: Add rendering contracts**

Require UI copy and selectors for:

```text
目标流派阶数
霸道机关术
非攻机关术
自由等级方案
效果档位方案
同时满足自由等级与效果档位优化
```

Require CSS hooks `.machine-school-calculator-grid`, `.machine-school-plan-summary`, and `.machine-school-plan-beasts`.

- [ ] **Step 2: Render school and target controls**

Show school selection, target 1–5阶 with mapped total level, current total, remaining level, existing-inventory toggle, new high-rank toggle, and new modification toggle. Target defaults follow the confirmed next-stage rule.

- [ ] **Step 3: Render participant controls**

For every school beast display its name, tier, current level/max level, temporary research input, fragment input, and “参与后续培养” checkbox. Unchecked cards remain visible and state that their existing level is still included.

- [ ] **Step 4: Calculate without saving**

On the school calculate action, call:

```js
PLANNER.calculateSchoolPlans(DATA, school, temporaryProgress, {
  targetStage: draft.targetStage,
  participatingBeastIds: draft.participatingBeastIds,
  useOwnedInventory: draft.useOwnedInventory,
  ownedLimitsByBeast: draft.ownedLimitsByBeast,
  allowNewHighRanks: draft.allowNewHighRanks,
  allowNewModifications: draft.allowNewModifications
});
```

Render the result above controls and scroll it into view. Do not call `saveProgress()`.

- [ ] **Step 5: Render summary and per-beast details**

Each plan summary shows current/target/recommended levels, invested equivalent count, owned/new counts, overflow, blueprint, organ piece, fragment, contribution, and yuan totals. Only changed beasts receive detail cards. Each detail lists start→end, owned items, new items, research increase/overflow, and exchange shortage.

- [ ] **Step 6: Handle already-completed and invalid states**

An achieved target renders one merged zero-cost plan. Invalid target or impossible participation constraints render core error text inside the result panel and retain the user inputs.

- [ ] **Step 7: Make results readable on desktop and mobile**

Use wrapping summary tiles and vertically stacked beast details. At phone/tablet widths, collapse to a single-column reading order with no horizontal table, keeping calculate/reset actions reachable.

- [ ] **Step 8: Commit school planner UI**

```powershell
git add -- js/machine-beasts-ui.js css/style.css serve.test.js
git commit -m "feat: show machine beast school recommendations"
```

---

### Task 6: Complete dependency guards and user verification handoff

**Files:**
- Modify: `js/machine-beasts-ui.js`
- Modify: `serve.test.js`
- Modify: `docs/superpowers/specs/2026-08-25-machine-beast-school-planner-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-machine-beast-school-planner.md`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: explicit dependency failure messaging and a complete manual verification checklist.

- [ ] **Step 1: Extend dependency validation**

Require `MACHINE_BEAST_SCHOOL_PLANNER` and its two public functions. If missing, show the existing machine-beast error panel with a message naming `js/machine-beast-school-planner.js`.

- [ ] **Step 2: Add final static contracts**

Update `serve.test.js` to assert the planner resource is served, appears in script order, and the new mobile selectors exist. Do not change PWA version or service-worker resource lists in this task.

- [ ] **Step 3: Perform a non-executing consistency review**

Review the diff and confirm by inspection that:

- all new calculator state is temporary;
- `saveProgress()` still writes only `{ beasts: state.beasts }`;
- no workbook, `.codex-tmp/`, or `答题.jpg` path is staged;
- no PWA/GitHub files changed;
- UI names match the approved Chinese copy.

- [ ] **Step 4: Provide user-run verification commands**

Hand off these commands without running them:

```powershell
node --test js/machine-beasts.test.js
node --test serve.test.js
```

Manual checks:

1. Single-beast inventory can be disabled, selected, and quantity-limited.
2. Both schools default to the next target stage.
3. Cancelled participants retain baseline levels but receive no new input.
4. Free and milestone plans differ only when the optimization rules require it.
5. Identical plans merge.
6. Calculation does not modify personal progress after refresh.
7. Desktop and narrow viewport layouts require vertical scrolling only.

- [ ] **Step 5: Commit documentation and contract completion**

```powershell
git add -- js/machine-beasts-ui.js serve.test.js docs/superpowers/specs/2026-08-25-machine-beast-school-planner-design.md docs/superpowers/plans/2026-08-25-machine-beast-school-planner.md
git commit -m "docs: complete machine beast school planner"
```

- [ ] **Step 6: Merge the completed feature into local `master`**

Use the project-approved integration flow: preserve the feature branch, fast-forward local `master`, do not push GitHub, and do not update PWA.

