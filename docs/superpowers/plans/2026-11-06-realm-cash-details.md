# Secret Realm Cash Details Implementation Plan

**Goal:** 每期默认收起；各方案独立展开/收起所有期次；修复跨期现金显示差异并发布 PWA 1.0.86。

**Execution:** 在当前会话按已确认方案实施，不委派子代理；按 AGENTS.md 不执行测试、lint 或手动验收。

**Architecture:** 用户已确认 A：明细按各自折前净价独立计算、四舍五入显示到分；方案总预算保持向上取整到元，并单列取整差额。保留旧 `after`、`totalAfter` 及最优排序语义；增加仅用于展示的 `discountedCash` 与方案 `roundingAdjustment`，不写入用户存储。详情按钮只修改当前方案 DOM，不触发重算或保存。

**Tech Stack:** 原生 JavaScript、BigInt 有理数、原生 details、Node test、已有 Playwright 测试设施。

## 已确认设计与边界

- 旧实现以累计费用的取整预算差额生成每行、每期 `after`，同样的 1806 元组合、4.3 折会出现 777 / 777 / 776；实际各期都为 776.58 元。
- 新增 `discountedCash` 按 `(原价分 - 代金分) × 折扣 / 10` 使用 BigInt 精确四舍五入到分。来源、期次和总额分别从自己的净价计算，禁止分摊其他明细的舍入余数。
- `roundingAdjustment` 为原总预算与总折后金额（保留到分）的差。界面区分实际折后金额与向上取整预算。
- 自定义折扣可能产生不足一分的金额：说明明细独立显示到分、合计按未舍入金额计算，避免误导。零金额、已达标空方案同样提供零明细。
- 每次生成/恢复结果时所有期次默认关闭。每方案一个按钮；部分展开时按钮为「一键展开每期详情」，全展开时为「一键收起每期详情」，手动切换单期同步按钮状态。
- 不修改存储键、库存、实际购买记录、礼包资料、目标、领取或代金消耗逻辑。

## Task 1: Regression cases first

- [x] 新增 `js/secret-realm-cash.test.js`：1806×4.3折跨三期、同来源跨期、分来源/期次金额、代金、联合目标、空方案、自定义小数折扣；明确原预算排序字段不变。
- [x] 新增 `tests/update-1086.cjs`：320/390/820/1280 宽度默认折叠、批量与单期联动、独立方案、金额展示、操作不写数据。
- [x] 按 AGENTS.md 本次不执行测试；以下命令交用户运行：
  `node --test js/secret-realm-cash.test.js js/secret-realm-planner.test.js js/secret-realm-streamline.test.js js/secret-realm-core.test.js`
  `node --test --test-concurrency=1 tests/update-1086.cjs tests/secret-realm-browser.cjs tests/realm-currency-browser.cjs tests/release-assets.test.js`

## Task 2: Monetary presentation metadata

- [x] 修改 `js/secret-realm-planner.js`，增加 `discountedCash(cents, discount)`。分子为 `BigInt(cents) * discount.numerator`，分母为 `discount.denominator * 10n`；四舍五入后的分值为 `(2n * numerator + denominator) / (2n * denominator)`。
- [x] 重建来源/期次时从各自净价增加 `discountedCash`；重建方案时增加总 `discountedCash` 和 `roundingAdjustment`。空方案设为 0。不触及候选生成、比较及旧预算分摊字段。

## Task 3: Independent details and correct labels

- [x] 修改 `js/secret-realm-ui.js` 的 `money()` 保留最多两位小数，不对每条明细再次向上取整。
- [x] 方案总览同时展示「折后金额合计」「总计折后预算（向上取整）」「预算取整差额」；期次和来源使用 `discountedCash`。
- [x] 方案期次包在有唯一 ID 的容器内，按钮以 `aria-controls` 关联，`aria-expanded` 跟随所有单期是否展开；只在有期次时出现按钮。
- [x] 委托 click 和捕获 toggle 事件，限定到 `.realm-plan`；默认 `<details>` 无 open 属性。补充最小 44px 按钮和 summary 触控高度。

## Task 4: Release

- [x] 更新 index.html、js/pwa.js、js/partition-loader.js、service-worker.js、version.json 的 1.0.85 为 1.0.86。
- [ ] 记录未执行测试及用户手动验证重点；仅提交本次文件，保留 Excel/临时文件。
- [ ] 按明确授权快进合并本地 master，推送 master:main，报告发布状态；不宣称本次功能测试通过。
