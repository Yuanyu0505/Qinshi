# 左侧导航与铭文布局优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重排全局分区并改为桌面左侧导航，同时修复铭文查询重叠、主属性换行、高亮颜色与资料备注。

**Architecture:** `index.html` 负责导航语义顺序与页面外壳，`css/style.css` 负责响应式侧栏和铭文网格，`js/inscription.js` 负责铭文展示文本与备注映射。既有分区数据和业务模块保持不变。

**Tech Stack:** 原生 HTML、CSS、JavaScript。

## Global Constraints

- 分区顺序为图鉴、关卡掉落、装备属性、橙装锻造、铭文、答题、楼兰棋阵。
- 桌面侧栏不得压缩既有正文空间；窄屏恢复顶部导航。
- 只改展示，不改其他分区业务逻辑。
- 不执行自动验证。

---

### Task 1: 全局导航结构

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [x] 将导航按钮重排并把特殊属性装备改名为装备属性。
- [x] 增加侧栏与主体内容外壳，默认显示图鉴。
- [x] 桌面端扩大页面宽度并使用纵向粘性导航。
- [x] 窄屏恢复横向导航且正文保持全宽。

### Task 2: 铭文布局与高亮

**Files:**
- Modify: `js/inscription.js`
- Modify: `css/style.css`

- [x] 将查询结果三块内容改成互不覆盖的独立列。
- [x] 极致备注在盾位标题下方显示。
- [x] 已保存弟子姓名改为绿色。
- [x] 个人进度主属性拆为上下两行。

### Task 3: 资料图表备注

**Files:**
- Modify: `js/inscription.js`

- [x] 新增盾位备注映射。
- [x] 在盾位副属性表新增备注列并渲染图中四条规则。

### Task 4: 交接

- [x] 提交到累计分支 `codex/atlas-upgrade-target`。
- [x] 列出手动检查重点，不执行自动验证。
