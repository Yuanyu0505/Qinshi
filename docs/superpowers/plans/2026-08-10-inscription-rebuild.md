# 铭文分区重建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除铭文分区旧实现并按普通4天位、红将5天位规则重建完整的查询、资料和个人进度功能。

**Architecture:** Excel 解析器只负责生成规范化弟子映射；`js/inscription.js` 独立管理铭文规则、查询、渲染和本地进度，`js/app.js` 仅保留全局分区切换。页面和样式通过独立的铭文类名与其他分区隔离。

**Tech Stack:** Python/openpyxl 数据生成、原生 JavaScript、HTML、CSS、localStorage。

## Global Constraints

- 普通橙色只有天府、天相、天同、天梁；红色神将增加天机。
- 页面顺序为个人进度、查询筛选、资料图表。
- 排除九个 Excel 盾位表头及九个页面盾位名称，不得生成伪弟子。
- 紫色不展示主属性；橙色按星级展示主属性。
- 不修改任何其他既有分区。
- 不执行自动验证。

---

### Task 1: 重写数据生成

**Files:**
- Modify: `tools/build_inscription.py`
- Replace: `data/inscription.js`

- [x] 只在 B 列出现该品质允许的有效天位时切换天位。
- [x] 将 Excel 的九个“遁”表头映射为页面的九个“盾”名称。
- [x] 跳过重复表头，并按普通4天位范围、红将5天位范围生成弟子数据。

### Task 2: 重建页面与核心逻辑

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Create: `js/inscription.js`
- Modify: `css/style.css`

- [x] 清除 `js/app.js` 中旧铭文常量和内联实现。
- [x] 按个人进度、查询筛选、资料图表顺序重建 HTML。
- [x] 在独立模块中实现筛选、详情、极致词条、保存/编辑与高亮。

### Task 3: 交接

- [x] 提交当前累计分支。
- [x] 向用户列出个人进度、筛选示例和伪弟子排除的手动检查重点。
