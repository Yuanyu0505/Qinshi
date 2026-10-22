# 机关兽资料与参考成本实施计划

> 执行方式：子任务开发与只读代码审阅；不主动运行验证命令。

Spec: `docs/superpowers/specs/2026-10-22-machine-beast-reference-cost-design.md`

## Global Constraints

- 贡献折元宝为除以 2.7；保持逐只神图取整及原优化器目标/排序。
- 不录入固定攻略方案，不新增最省神图模式，不改掉落，不新增 PWA 发布。
- 参考成本仅包含觉醒神图和缺少的机关兽；缺价格不等于免费。
- 神图库存在每个备选方案独立抵扣一次，不修改真实库存；设置按账号保存。
- 联合标签格式为「（0改）7阶×13」。
- 不运行测试、构建、lint 或实机验收；保留无关工作区修改；不提交、不推送。

### Task 1: 来源与材料数据

Own `data/machine-beasts.js` and a new dedicated data test file `js/machine-beasts-sources.test.js` only. Read spec. Add each beast `sources` array and data `materialSources` catalog (stable `{id,name,sources,stages?}` records), `referenceCostRules` with default blueprint price, presets, default orange-five body price, contributionPerYuan, treasureBox note.

Exact values: awakening blueprint presets 奇遇64、元宝商城70、商城134; default70; orange-five45000; contributionPerYuan2.7. Existing `resourceRules.yuanPerContribution` becomes `1 / 2.7`.

All 27 beasts source mapping:
- 聚宝盆: mechanical-bear, mechanical-qingluan, mechanical-kunpeng, mechanical-flame-puppet, mechanical-yueliao.
- 禁地、流派自选宝箱: war-demon, mirage-tower, nine-headed-jade, zero-white-tiger, pumpkin-monster, mechanical-divine-dragon, mechanical-yuan-beast, mechanical-year-beast, mechanical-black-tortoise, mechanical-vermilion-bird, mechanical-white-tiger.
- mechanical-azure-dragon: 禁地、流派自选宝箱、每日登录.
- potu-sanlang: 禁地、流派自选宝箱、庄园.
- red-serpent: 禁地、流派自选宝箱、尚同墨方.
- mechanical-bronze-man: 禁地、流派自选宝箱、尚同墨方、论剑.
- mechanical-bat:43-10、流派自选宝箱.
- eight-claw-centipede:41-10、流派自选宝箱、论剑、千机楼.
- four-claw-spider:流派自选宝箱、论剑、千机楼.
- mechanical-sand-ship:流派自选宝箱.
- mechanical-snake:15-10.
- potu-qilang:12-10.
- mechanical-wing:尚同墨方.

Materials: 铅块来源好友副本/聚宝盆；青铜十章后普通黄色关卡；精钢十章后精英蓝色关卡；玄铁十章后首领红色关卡；觉醒神图元宝商城/商城/奇遇；机关破片元宝商城/商城/千机楼。
Designs: 青铜螺栓53-9/35-10/24-10/11-10；精钢底座54-9/36-9/25-9/14-10；精钢管55-9/36-10/25-10/16-10；玄铁外壳48-9/37-10/27-10；玄铁关节49-9/38-10/28-10；玄铁箱50-9/39-10/29-10。目录名加设计图。
TreasureBox note: 幻音宝盒消耗30000元宝，以上六种设计图对应成品各1个，仅说明不参与计算。
Write assertive data tests but do not run. No other files.

### Task 2: 纯成本与搜索

Own `js/machine-beasts.js`, `js/machine-beasts.test.js`, and new `js/machine-beasts-reference-cost.test.js` only. Read spec and Task 1 interface above. Implement exports `normalizeReferenceCostSettings(data, raw)` and `calculateReferenceCost(data, requirements, rawSettings)` exactly as spec input.

Return contract:
```
{ complete, totalYuan, knownYuan,
  blueprints: { required, usedStock, missing, unitPrice, yuan },
  beasts: [{beastId, beastName, fragments, bodyEquivalent, unitPrice, contribution, yuan}],
  missingPrices: [{beastId, beastName}] }
```
Use `null` yuan and unitPrice for missing non-contribution prices; `totalYuan:null` if incomplete. Merge duplicate beast requirements before rounding. Zero missing fragments implies yuan0 and no missing price. Invalid unknown beast requirement must not silently be counted free (return incomplete with identifiable missing price). Pure functions never mutate settings/data/requirements. Enforce nonnegative finite prices, stock integer. Defaults derived from data rules with fallback70/45000/2.7 for legacy mocks.

Extend `searchBeasts` to include beast.sources and update existing yuan assertions to divide2.7 without changing optimizer. Add unit cases: blueprint default/no stock/use stock off/excess stock/alternative independence, contribution600=ceil(600/2.7)=223, orange-five full/partial (20 of40=22500), explicit zero/manual missing price/invalid input, aggregate duplicate beasts, zero-deficit, nonmutation. Tests written before implementation, not executed.

### Task 3: 页面、存储与标签

Own `js/machine-beasts-ui.js`, `css/style.css` and new `tests/machine-beasts-reference-cost-browser.cjs` only. Read spec. Consume Task 1 fields, Task 2 API/return contract.

Add shared reference cost settings to single and school controls: stock, use stock checkbox, default/preset/custom blueprint price, non-contribution beast unit prices. Persist under original account key `{beasts,referenceCost}`, read legacy form. Handle setItem false and throw clearly and avoid saved-state corruption. Cost input invalidity must replace cost panels with error, not retain a stale valid total. Refresh cost only on setting changes without rerunning optimizer or losing typing focus.

For single use total blueprint need and `shortage.fragments`. For school aggregate `plan.totals.awakeningBlueprints` with each detail.resources.fragments; deduct stock once per plan. Every displayed alternative must get own cost block, with blueprint need/stock/deficit cost, beast cost and total or incomplete known subtotal. Clearly state fractional equivalent body pricing, exclude other materials, no real stock consumption, no cost-based optimization.

All inline combined modification/rank labels use fullwidth parentheses; inventory summary, selector, used/new/unused plans. Material/reference source lists, per-beast source and source search hints. Treasurebox explanation note only. Mobile narrow grids minmax(0,1fr), labels wrap, avoid horizontal overflow.

Write focused browser assertions compatible with existing project harness, do not run. No new runtime assets, index/SW/version edits. Report exact manual acceptance checkpoints and test file.

### Task 4: 集成审阅与交付

Root coordinates task-scoped review then full diff review; resolve actionable findings via owner. Read storage integration and mobile styles statically. No validation command, no publishing. Document changes and user manual acceptance points, preserving dirty workbook and prior untracked files.
