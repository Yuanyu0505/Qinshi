# 图鉴剩余装备搜索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让图鉴装备关键词只匹配当前等级到目标等级之间仍然需要的装备。

**Architecture:** 在纯逻辑搜索层复用已有 `neededStages()` 计算剩余阶段，避免在 DOM 渲染后补删结果。调用层只新增目标等级参数，其他字段搜索、升级计划、汇总和存储结构保持不变。

**Tech Stack:** 原生 JavaScript、Node 内置断言测试

## Global Constraints

- 装备匹配阶段必须满足 `currentLevel < stage.end <= targetLevel`。
- “全部”字段搜索中的装备分支同样使用剩余装备语义。
- 非装备字段搜索行为不变。
- 不修改存储格式、升级成本、汇总统计、数据生成或布局。
- 按项目约定，自动测试和手动验收由用户执行；AI 不主动运行验证命令。

---

### Task 1: 限制图鉴装备搜索到剩余升级阶段

**Files:**
- Modify: `js/atlas.test.js`
- Modify: `js/atlas.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `neededStages(item, level, targetLevel)`、`levelOf(item, levels)`、`atlasState.targetLevel`。
- Produces: `searchAtlas(items, query, levels, field, targetLevel)` 和支持 `options.targetLevel` 的 `filterAtlas(items, options)`。

- [ ] **Step 1: 增加剩余装备搜索回归用例**

在 `js/atlas.test.js` 增加四组断言：已经达到目标、已完成阶段、目标区间阶段、目标之后阶段；另加“全部”字段通过弟子名仍可命中已完成图鉴的断言。

- [ ] **Step 2: 修改装备匹配函数**

将 `equipmentContains(item, query)` 改为接收当前等级与目标等级，并只遍历：

```js
neededStages(item, currentLevel, targetLevel)
```

- [ ] **Step 3: 将目标等级传入搜索核心**

扩展 `searchAtlas()` 与 `filterAtlas()` 的参数传递：

```js
return searchAtlas(result, opts.query, opts.levels, opts.field, opts.targetLevel);
```

装备分支调用：

```js
var equipmentMatch = equipmentContains(item, q, L, targetLevel);
```

- [ ] **Step 4: 从页面状态传入目标等级**

在 `applyAtlas()` 的 `ATLAS.filterAtlas()` 参数对象加入：

```js
targetLevel: atlasState.targetLevel
```

- [ ] **Step 5: 提交功能改动**

只暂存 `js/atlas.test.js`、`js/atlas.js`、`js/app.js` 并提交；工作簿与 `答题.jpg` 不纳入提交。
