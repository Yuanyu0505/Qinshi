# Interface Cleanup and Atlas Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 精简各分区界面文案，统一装备属性配色，并让图鉴结果只在用户主动操作后显示。

**Architecture:** 保持现有单页应用结构不变：在 `index.html` 删除纯展示标题和页脚，在 `css/style.css` 通过分区作用域调整颜色及收藏按钮视觉，在 `js/atlas.js` 增加不持久化的首次激活状态。所有数据模型、存储键和备份格式保持不变。

**Tech Stack:** HTML、CSS、原生 JavaScript、localStorage

## Global Constraints

- 只实现已确认的 11 项界面与交互需求。
- 不修改数据源、个人进度、收藏和备份格式。
- 按项目约定，功能验证、测试、lint、格式检查和手动验收由用户执行。

---

### Task 1: 删除冗余标题和全局页脚

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 现有各分区 HTML 面板结构。
- Produces: 无冗余面板标题、无数据来源页脚的页面结构。

- [ ] **Step 1: 删除指定标题节点**

  从对应面板删除文字为 `图鉴分区`、`掉落查询`、`按属性筛选`、`视图`、`新增弟子铭文`、`题目搜索` 的 `.panel-title` 节点，保留其下所有筛选控件和提示。

- [ ] **Step 2: 删除全局页脚及样式**

  从 `index.html` 删除 `<footer class="foot">`，并从 `css/style.css` 删除仅服务于该页脚的 `.foot` 规则，使底部不再保留空白占位。

- [ ] **Step 3: 提交结构清理**

```powershell
git add index.html css/style.css
git commit -m "style: simplify partition panels"
```

### Task 2: 调整收藏星号与装备属性配色

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `.atlas-favorite-toggle`、装备结果表格和移动卡片的既有 class。
- Produces: 无框未收藏星号、白色主属性、鲜红色命中属性和排序值。

- [ ] **Step 1: 调整未收藏和已收藏按钮视觉**

  默认 `.atlas-favorite-toggle` 使用透明边框和透明背景以隐藏方框并维持点击区域；`.is-favorite` 继续覆盖为红色边框、红色背景和金色星号。

- [ ] **Step 2: 将装备主属性限定为白色**

  使用 `#partition-equipment` 作用域，将桌面表格 `.main` 和移动卡片 `.card-main b` 的主属性文字设为白色，避免影响其他分区。

- [ ] **Step 3: 将命中属性和排序值设为鲜红色**

  使用 `#ff4b4b` 设置装备分区中的 `.tier-attr.hit`、结果表格 `td.badge` 和移动卡片 `.badge`，表头保持原有金色。

- [ ] **Step 4: 提交配色调整**

```powershell
git add css/style.css
git commit -m "style: refine atlas and equipment highlights"
```

### Task 3: 增加图鉴首次激活状态

**Files:**
- Modify: `index.html`
- Modify: `js/atlas.js`

**Interfaces:**
- Consumes: `atlasState`、`applyAtlas()`、图鉴分类和筛选控件事件。
- Produces: `atlasState.activated: boolean` 和首次操作后才渲染图鉴结果的交互。

- [ ] **Step 1: 默认隐藏图鉴结果容器**

  为 `#atlas-upgrade-summary` 和 `#atlas-results` 添加 `hidden`，避免脚本初始化前闪现旧结果。

- [ ] **Step 2: 在状态中加入非持久化激活标记**

  在 `atlasState` 添加 `activated: false`。`applyAtlas()` 在该值为 `false` 时清空并隐藏汇总和结果容器后直接返回；激活时取消隐藏并运行原有筛选、排序和渲染流程。

- [ ] **Step 3: 在主动操作时激活**

  分类按钮点击、搜索字段变更、有效搜索词输入、等级范围调整和目标等级调整时，将 `atlasState.activated` 设为 `true` 后调用 `applyAtlas()`。已激活后清空搜索仍保持激活。

- [ ] **Step 4: 保持收藏刷新行为**

  收藏按钮仍调用现有收藏写入和 `applyAtlas()`；因为收藏按钮只会出现在已激活结果中，无需新增存储字段。

- [ ] **Step 5: 提交图鉴交互**

```powershell
git add index.html js/atlas.js
git commit -m "feat: activate atlas results on user input"
```

## 用户手动验证重点

- 首次打开图鉴时，结果卡片和升级汇总均为空；点击“全部”后正常出现。
- 搜索、搜索限制、等级范围、目标等级和各分类按钮均可激活图鉴结果。
- 未收藏星号无可见方框；已收藏仍为金色星号、红底红框。
- 装备主属性为白色，筛选命中值和排序值为鲜红色。
- 六个指定标题和所有分区底部数据来源行均消失，控件自然上移且功能不变。
