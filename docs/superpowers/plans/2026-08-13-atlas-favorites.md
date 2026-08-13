# 图鉴收藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为图鉴增加收藏切换、收藏分类、收藏优先排序、绿色高亮和备份兼容。

**Architecture:** 收藏 ID 独立保存到 `qinshi_atlas_favorites_v1`。纯逻辑层负责收藏分类和稳定的收藏优先排序，页面层负责收藏状态切换与渲染，CSS 负责星号及卡片高亮。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node 内置断言测试、localStorage

## Global Constraints

- 收藏 ID 使用字符串数组持久化。
- 所有图鉴结果中收藏项优先，收藏组和普通组内部保持原顺序。
- 已收藏图鉴分类继续叠加现有搜索与等级筛选。
- 现有 `qinshi_` 备份机制自动覆盖收藏键，不修改备份格式。
- 不修改升级计算、剩余装备搜索和生成数据。
- 按项目约定，自动测试和手动验收由用户执行；AI 不主动运行验证命令。

---

### Task 1: 收藏筛选与稳定优先排序

**Files:**
- Modify: `js/atlas.test.js`
- Modify: `js/atlas.js`

**Interfaces:**
- Consumes: `filterAtlas(items, options)`、`options.favorites`。
- Produces: `isFavorite(item, favorites)`、`favoriteFirst(items, favorites)`。

- [ ] 在测试中覆盖收藏分类、收藏优先、组内顺序和现有筛选叠加。
- [ ] 在纯逻辑层识别收藏 ID。
- [ ] `category === "已收藏"` 时只保留收藏项。
- [ ] 搜索结束后稳定地把收藏项移到前面。

### Task 2: 收藏存储与交互渲染

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 图鉴稳定 ID、`atlasState.favorites`、现有结果事件委托。
- Produces: `loadAtlasFavorites()`、`saveAtlasFavorites()`、收藏星号按钮、收藏卡片样式。

- [ ] 新增“已收藏图鉴”分类按钮。
- [ ] 读取和保存 `qinshi_atlas_favorites_v1` 字符串数组。
- [ ] 星号点击后切换状态并调用 `applyAtlas()`。
- [ ] 将收藏集合传给 `ATLAS.filterAtlas()`。
- [ ] 为收藏卡片、类型标识、弟子名和星号增加对应样式。
- [ ] 未收藏输出空心星 `☆`；已收藏输出金色实心星 `★`，并保留红色按钮背景与外框。
- [ ] 只暂存本任务代码与文档，不包含工作簿或图片。
