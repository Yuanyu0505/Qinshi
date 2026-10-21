# 2026年10月装备资料更新 Implementation Plan

**Goal:** 按用户确认的图片对照清单和补充数值更新装备资料，并发布PWA 1.0.50。

**Architecture:** 独立十月增量数据文件；查询层兼容已知累计端点和按品质主属性；现有桌面、手机、平板共用同一渲染逻辑。

**Spec:** docs/superpowers/specs/2026-10-21-equipment-data-update-design.md

**Tech Stack:** 原生JavaScript、GitHub Pages、Service Worker。

## Global Constraints

- 用户已批准直接执行并发布，无需再次确认计划。
- 依AGENTS不主动运行测试、构建、lint或实机验收；保留用户手动检查清单。
- 不更改已有资料ID，不重建或提交工作簿；只改已确认数据。
- 无法确认的中间阶段、品质保持暂无资料，不能补零。

## Review Focus

- 十月增量在九月增量后加载，重复应用不新增重复条目。
- 满阶快照参与排序和对比但不再与旧增量累加。
- 春秋红金血、红色攻；五本更正全部品质。
- 手机/平板新典籍也可显示已知累计与缺失提示。
- 发布版本、缓存、页面脚本、Pages打包包含新资料。

## Task 1: 十月增量数据

- [x] 创建data/2026-10-equipment-update.js，8个稳定ID、已有7件条目的确认更正，更新meta。
- [x] snapshots接口：stageSnapshots[tier]为已知累计数组；stageDetailsIncomplete为true；神兵幻音summaryLabels区分红色0锻与红金满锻。
- [x] 五本主属性直接更正main/mainKey；春秋mainByTier仅红金覆盖为血、内力。

## Task 2: 查询与关联

- [x] js/query.js累计读取支持stageSnapshots并保留旧stages语义；排序/筛选保持一致。
- [x] 提供mainForTier(item,tier)、mainDisplay(item,valueSource)、matchMain(item,main,valueSource)。
- [x] js/equipment-forging.js、js/item-navigation.js增加必要普通/神兵名称映射，不新增配方。
- [x] 相关有意义的回归用例已编写但未执行，由用户运行。

## Task 3: 界面与发布

- [x] js/app.js桌面/手机品质展示、累计标签、未知中间阶段说明接入新接口。
- [x] index.html加载新资料，service-worker.js预缓存，Pages复制数据目录已覆盖新文件。
- [x] 同步版本号1.0.50及必要现有发布断言，README更新资料来源说明。
- [x] 独立只读代码审阅，处理实际缺陷；未运行测试。
- [ ] 精确暂存、提交本地master并推送master:main；查询线上版本信标和缓存版本。

## Execution Record

- 初始HEAD: 86ed7d5。
- 数据更新与查询核心分配到互不重叠文件，主代理负责渲染和发布。
- Ruling: 使用现有工作目录master执行用户明确要求的直接提交；不引入额外工作树，避免遗漏本地资料。无关工作簿及图片不提交。
- Ruling: 用户与AGENTS明确由用户执行功能验证，覆盖技能默认测试要求；本次不得宣称功能已通过测试。
- Task 1/2/3实现完成：数据、查询、界面和发布文件已落地，回归用例仅编写未运行。
- 独立静态审阅发现两项集成问题并处理：新书手机/平板不再隐藏未知品质；新增神兵橘裳/幻音的普通全名搜索别名。未知阶段说明跨列换行。
- 人工验收重点：神兵幻音红色0锻与红金数值；春秋按红色/红金筛选；五本主属性全品质；新增装备手机/平板的暂无资料显示与搜索别名。
