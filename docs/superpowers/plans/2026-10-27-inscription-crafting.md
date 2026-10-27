# Inscription Crafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 铭文统一规则、可保存路径与实际库存、独立虚拟合成模拟，双轮验收后发布。

**Architecture:** UMD纯规则 + 纯路径生成 + 可注入账号存储的事务状态 + 单独UI。旧铭文复用规则，保留旧数据。原静态站点直接本地加载，不引入CDN或构建依赖。

**Tech Stack:** JavaScript UMD, HTML/CSS, node:test, Playwright existing harness.

**Spec:** docs/superpowers/specs/2026-10-27-inscription-crafting-design.md

## Global Constraints

- Preserve unrelated Excel/untracked files; work on codex/inscription-crafting, no master implementation or arbitrary cleanup.
- Target b2,p1,p2,o1,o2; default o2; filled slots 1,2,2,3,3.
- Same prefix/dun only; unique attribute+tier; max2H; random H/M/U only, no newL; exact speed exceptions in Spec.
- All distinct legal observable outcomes equiprobable; ambiguous b2 speed is not user-assigned hidden tier.
- Actual inventory shared by concrete signature per account; simulation never writes it; pending commits once only.
- No automatic old record deletion/value correction; no network dependencies; mobile/tablet/file/PWA.
- User authorizes tests, two consecutive frozen full rounds required before master merge and GitHub/PWA publish.

## Review Focus

- p2 crafted with L must be rejected, wash with M must be rejected; changing origin is not bypass.
- b2 speed unknown and duplicated speed results use observable unique outputs, never hidden-tier guesses.
- Wildcard inventory requires concrete entries; same stock reused across goals is not duplicated physically.
- Retrying/refreshing pending must not double-credit or mutate actual inventory; write failure preserves state.
- Missing high-support markers in old module corrected without destroying invalid/free-text historical data.

### Task 1: Shared rule engine

**Files:** Create js/inscription-rules.js, js/inscription-rules.test.js.
**Interfaces:** UMD window.InscriptionRules and CommonJS; quality IDs b2,p1,p2,o1,o2. Term={attr,tier} tier H/M/L/U/?; material={prefix,dun,quality,origin,terms}. Export qualities/attributes/duns, termsFor(dun,quality,origin?), validate(material), value(term,quality), label(term,quality), signature(material), bestTargets(dun,quality,attrs), preview(materials), sample(outcomes,random).
- [ ] RED tests: p2 wash low/high valid vs low/mid invalid; p2 crafted low invalid; ghost b2speed+highdef -> literal two outputs; ghost/dragon double speed fixedM+complete complement pool; three penetration earth valid human invalid; equipment/source/count rejects; probability sums1; four-select3 exact25 and triple exact1; all max2H; every growth vector table.
- [ ] Run focused node --test with bundled runtime, record expected missing module RED.
- [ ] Implement according to Spec, normalized aliases旧盾/防御/技能减免. Interface may add helpers but document exact exports for downstream.
- [ ] Focused GREEN and full unit once; self-review and commit only owned files. Report TDD and interface examples.

### Task 2: Paths and persistent workbench

**Files:** Create js/inscription-paths.js, js/inscription-crafting-state.js and corresponding .test.js.
**Interfaces:** Paths.generate({prefix,dun,quality,attrs}) -> target(s), grouped routes with material/operation nodes and subroutes; consumes Rules. State.createStore(accountStorage) -> actual inventory, goals, per-goal virtual workspace; pure transactions via checked saves. Expose add/update actual by signature, save/delete goal, copy actual, set virtual, stage pending, retry, commitPending(action), reset workspace. Source validators use Rules.
- [ ] RED earth three pen deterministic and probability including failures; human doublepen+PVP no forged deterministic; arbitrary mixed goals and lower qualities; all duns; all concrete X alternatives; no invalid generated recipes. State tests save/restore goals, actual shared signatures, no actual writes from sim, double-submit, insufficient inventory, random input bounds, failed save rollback, malformed saved state preserved.
- [ ] Implement recursive/partitioned source planning, cache canonically, same-shape grouping with full branch data; low seeds wash, M sources crafted; probability and reuse computed with Rules preview. No template-only coverage or silent cap.
- [ ] Implement validated versioned account store; pending holds recipe/result/unique token, commit rechecks stock, atomic single saved payload, retry no writes to inventory. Inventory integers >=0, fail loudly on storage false/errors, raw malformed data not overwritten.
- [ ] GREEN focused + full unit; self-review commit and interface usage report.

### Task 3: UI, legacy consistency, browser tests

**Files:** Create js/inscription-crafting-ui.js, css/inscription-crafting.css, tests/inscription-crafting.cjs. Modify index.html, js/inscription.js, js/inscription-performance.js, relevant old tests and loader/sw asset registry.
**Interfaces:** Consumes Rules/Paths/State; two added mode sections. Locally drawn HTML/SVG/CSS flows, concrete inventory editors, simulation add/source/preview/pending actions, autosaved target switcher.
- [ ] RED browser key journey and responsive layouts before implementation; use existing browser helper server and bundled Chromium packages. Test exact same input probabilities vs target, expected illegal washedM option absent, blue speed only visible1, file origin, refresh, account switch, old invalid progress no data loss, simulator snapshot isolation, doublecommit/retry, backup payload inclusion.
- [ ] Add independent target/quality/dun/attribute filters; disciple optional; explicit prefix only after genericfilter. Detailed reason + alternative suggestion, no silent targetchange. Per-quality table and old editor normalize/warnings while preserving legacy serialized records until user saves valid adjustments.
- [ ] Flow nodes have concrete input/output/probability/stock; X expansion all legal choices, failure complementary recipe builder, grouped collapsible branches. Preserve focus and lazy rendering. Add material collections with qty/source, inventory copies confirm replacement, simulator slot selection/count checks, all previews with pagination (probability not truncated), pending only commit once, saved current workspace.
- [ ] Wire original modes to coordinator and version asset loading; no external library. Mobile native accessible controls, visual flows with arrows. Run focused+full tests, self-review, commit.

### Task 4: Frozen acceptance and release

**Files:** version.json, index.html, service-worker.js, js/pwa.js, js/partition-loader.js, .github/workflows/pages.yml, docs/superpowers/reports/2026-10-27-inscription-crafting.md.
- [ ] Independent branch review, repair with regression tests; ensure all user cases in report. Review own diff and sources values.
- [ ] Set version1.0.62 everywhere and cache all new assets; verify loader order rules->paths/state->legacy/UI.
- [ ] Freeze runtime files. Run complete unit then browser round1, same round2; capture full logs and input SHA. Any failure/code fix restarts count. Check actual desktop/mobile/tablet DOM, file:// and PWA offline/upgrades. No production game writes.
- [ ] Commit tracked feature-only files; fastforward master; push existing master:main remote. Verify Pages workflow SHA and online version/static assets, report observed results. Preserve unrelated local content.
