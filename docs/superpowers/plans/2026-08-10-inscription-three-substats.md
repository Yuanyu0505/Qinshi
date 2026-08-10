# 铭文三副属性与筛选优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将铭文个人进度扩展为三条副属性，并修正极致属性、筛选展示、排序、高亮和删除交互。

**Architecture:** 继续由 `js/inscription.js` 独立维护铭文状态与渲染，使用 `subs` 数组替代单个 `sub` 字段并在加载时兼容旧数据。`css/style.css` 只调整铭文专属类，避免影响其他分区。

**Tech Stack:** 原生 JavaScript、HTML、CSS、localStorage。

## Global Constraints

- “3属性”表示该基础属性允许三条副属性同时出现，不是独立属性名。
- 筛选位置时只展示命中的天位·盾位。
- 排序为已保存优先、红色优先、同组拼音字母序。
- 不修改其他既有分区。
- 不执行自动验证。

---

### Task 1: 重构副属性数据与存储

**Files:**
- Modify: `js/inscription.js`

**Interfaces:**
- Consumes: 当前 `qinshi_inscription_progress_v2` 本地数据。
- Produces: 每个槽位包含 `subs: string[3]` 的规范化进度数据。

- [x] 将极致属性改为基础名称加能力标记。
- [x] 新增旧 `sub` 到 `subs` 的兼容转换。
- [x] 编辑器为每个位置生成副属性1、副属性2、副属性3。
- [x] 保存和只读展示均使用三个副属性。

### Task 2: 删除、筛选、排序与高亮

**Files:**
- Modify: `js/inscription.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `progress` 与当前品质、天位、盾位、关键词筛选值。
- Produces: 只包含命中位置且按既定优先级排序的结果卡片。

- [x] 增加个人进度删除按钮与确认操作。
- [x] 查询卡片仅渲染天位和盾位筛选命中的位置。
- [x] 实现已保存、品质、拼音字母序排序。
- [x] 将已保存弟子名称设为红色高亮。

### Task 3: 布局与极致属性说明

**Files:**
- Modify: `js/inscription.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: 每个盾位的极致属性列表。
- Produces: 编辑、个人进度、查询和资料图表中的统一极致备注。

- [x] 压缩品质、星级和主属性区域。
- [x] 扩大三个副属性选择及只读展示区域并强调内容。
- [x] 在各盾位标题和资料表中追加高亮极致属性备注。

### Task 4: 交接

- [x] 提交到累计分支 `codex/atlas-upgrade-target`。
- [x] 向用户列出手动检查重点，不执行自动验证。
