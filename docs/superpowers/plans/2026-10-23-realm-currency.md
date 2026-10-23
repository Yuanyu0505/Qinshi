# 秘境兑换道具与资料更新 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; use a fresh whole-branch reviewer after implementation. Steps use checkboxes for tracking.

**Goal:** 实施已确认双目标、抽光溢出、简化记录及资料/铭文/木人更新。
**Architecture:** 数据/纯状态迁移/精确规划/UI保持现有分工；原plan入口兼容；本地账号数据保留。
**Tech Stack:** 原生JS/CSS、Node test、Playwright Edge、PWA Worker。
**Spec:** docs/superpowers/specs/2026-10-23-realm-currency-design.md

## Global Constraints

- 6元固定3抽；98/198/328/648额外15/30/50/110；熊猫56、免费通行证40、付费额外70，每次实际抽取1。
- stop/all只改用券，不改购买组合，默认stop；道具目标默认off，当前余额手填。
- 不修改用户Excel，不调用生产同步，不追加依赖；最终两轮零失败才发1.0.60。

## Review Focus

- v1坏数据不得被迁移掩盖；未开始/过期不接受领取记录，旧pack6不修改全局库存。
- 兑换目标不能漏计券可生成道具，已购礼包赠送/历史抽数不能重复发。
- 无限648和大目标不产生目标规模数组；双目标组合与独立穷举一致。
- 草稿/只读/账号切换/删除平台及异步旧结果不能串数据。
- 一次性常用迁移不覆盖取消选择；保守档不超worst，新参考不污染概率模型。

### Task 1: 状态与资料
Files: data/secret-realm.js, js/secret-realm-core.js, js/secret-realm-core.test.js。
Interfaces: normalize(v1|v2)->v2; updateTotals新增目标/余额/模式字段；deletePlatform(state,id,data)；buildPlanningInput新增currency/directCurrency字段。
- [x] 写RED测试：合法v1迁移、坏v1拒绝、pack6固定及跨日限制、道具领取/目标开关、删除平台回退。
- [x] node --test js/secret-realm-core.test.js确认RED；最小实现；同命令GREEN，29项。
- [x] 检查全部既有state测试，更新因明确需求变更失效的旧断言，不削弱时间/只读保护。

### Task 2: 精确规划
Files: js/secret-realm-planner.js, js/secret-realm-planner.test.js。
Interfaces: plan(input)消费Task1；金额输出兼容，新增plannedDraws/remainingTickets/directCurrency/currencyBalance及逐期明细。
- [x] RED：仅道具、同时目标、直接赠送、不重复历史、已有库存、all只抽余券购买不变、有限不足/无限648/大数溢出。
- [x] 实现有限双约束精确组合及数学无限补足，兼容无新字段的旧输入。
- [x] 独立小规模穷举验证，不用自身生成期望；整个planner测试20项GREEN（100组新增双目标、160组原抽数穷举）。

### Task 3: UI与集成
Files: js/secret-realm-ui.js, css/secret-realm.css, tests/secret-realm-browser.cjs, tests/realm-currency-browser.cjs。
Interfaces: 现有账号/Worker沿用；新版state/input，所有目标草稿一次采集并校验fingerprint。
- [x] RED真实表单：大按钮切秘境、pack6无拆分、领取/余额、两目标开关及模式、合并方案、平台删除取消/确认/预设保护。
- [x] 实现UI，修订旧测试中明确被替换的select/partial6测试；保留跨日/旧结果/只读保护行为。
- [x] 5宽度/账号隔离/备份恢复/离线Worker GREEN，联调44项通过。

### Task 4: 铭文与木人
Files: data/inscription.js或现有补充机制, js/inscription.js, tests/inscription-common.cjs, data/wooden-man-alley.js, js/wooden-man-alley-planner.js, js/wooden-man-alley-planner.test.js, js/wooden-man-alley-ui.js。
- [x] RED木人remaining1保守1、各新增目标消费参考、铭文正确五位/默认一次/取消刷新不补。
- [x] 最小实现新弟子及名单迁移、奖励节点/对照表、保守min封顶，不改原概率及道具分配。
- [x] 专项GREEN，整套unit/browser检查；包含跨账号默认迁移与兑换余额保存。

### Task 5: 复审验收发布
Files: 版本文件、tests/update-1060-pwa.cjs、报告。
- [x] 独立全分支review，一次修复Important/Critical，RED→GREEN；损坏常用列表保护及迁移保存false回归3项通过。
- [x] 版本1.0.60统一、旧059真实升级+离线资源与进度保留，专项1项通过。
- [x] 冻结产品，同一代码连续两轮unit+browser，完整日志零失败/跳过。每轮798项单元、221项浏览器，共2038次，退出码0，75项运行文件SHA256保持不变。
- [ ] 仅提交本任务，快进master，非强推master:main，核实Pages及公网资源。
