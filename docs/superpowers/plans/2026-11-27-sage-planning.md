# Sage Planning Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. 按AGENTS.md不运行测试、lint或验收，不提交推送。

**Goal:** 修订小圣贤庄经验规则并加入兑换需求及精确反向规划。

**Architecture:** 在reference-calculators.js内实现纯计算；reference-expansion-ui.js维护页面内存需求；数据与生成器只修订相关口径和文案，CSS限定sage。

**Tech Stack:** 原生JavaScript、CSS、Python资料生成器、node:test与Playwright测试源码。

**Spec:** docs/superpowers/specs/2026-11-27-sage-planning-design.md

## Global Constraints

- 固定27天、4周；每项目最高档；解锁按前层累计消费；不改变其他分区与账号存储。
- 用户自行验收。测试代码会更新但不执行，不声称通过。

## Review Focus

- 逐层校验只使用已解锁前层的累计消费，不能使用未解锁后层消费。
- 周充值附带经验不能漏算或重复计算。
- 筛选／表格卡片切换不能丢失需求；输入中间空值与非法数量须阻止旧结果展示。
- 反向档位次数不能超过27日／4周；宗师倍率只在最终经验兑换时使用。
- 手机表格局部滚动而非挤压需求、贡献或操作控件。

### Task 1: 纯计算

- [x] 先更新最高档单测及新增兑换校验、反向任务组合单测（未执行）。
- [x] 实施sageEstimate(input)、sageExchange(rows,demands)、sagePlan(tokens,master)。
- [ ] 用户后续可运行：node --test tests/reference-calculators.test.js（预期全部通过；本轮不执行）。

### Task 2: 资料与交互

- [x] 同步最高档数据标记、生成器、表头、层级名、规则短标题和顿号文案。
- [x] 估算改下拉、实时需求表、逐层提示与反向方案；新增浏览器回归源码（未执行）。

### Task 3: 布局与交接

- [x] sage专属列宽、同排控件、最终圣贤令红色、规则两端对齐。
- [x] 阅读改动，记录未执行检查；不合并、不推送。

## 实施记录

- 用户将商城门槛由单层消费更正为前层累计消费，已同步实现与用例；原商品和限购数量不变。
- 反向同来源内先最小化经验溢出，经验相同时最小化该来源总投入，再最小化参与次数；前来源不足时用满再考虑后来源。
- 只读独立审查未发现核心算法普通游戏输入的重要问题；发现商品勾选／宗师勾选焦点丢失及规则搜索与显示文案不一致，已补焦点恢复、统一格式化搜索，并写入浏览器测试源码。未进行第二轮运行验证。
- 未运行node测试、浏览器、lint、资料生成器；未提交、合并、更新PWA或推送。
- 用户建议验收：默认四项目最高档、宗师切换、前层不足与刚好达到60／180／300、超限／空白兑换次数、筛选／卡片切换保留需求、262令混合周充值方案、手机控件与商城局部横向滚动。
- 回滚范围仅本轮sage相关代码：reference-calculators.js的sage函数，reference-expansion-ui.js内sage分支与扩展表格选项，reference-expansion.css内sage选择器，data/reference-expansion.js与生成器的sage文案／规则。不要整文件覆盖，以免丢失已有其他分区未提交改动。
