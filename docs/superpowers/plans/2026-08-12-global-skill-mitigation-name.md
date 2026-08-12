# “技免”全分区统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工具所有技能伤害减免词条统一为“技免”，并兼容铭文旧个人进度。

**Architecture:** 装备属性从 Excel 解析源头统一名称并重新生成数据；铭文在静态属性定义和旧存档标准化映射中统一名称。PWA 缓存版本随脚本和数据变更提升，Excel 原文件不修改。

**Tech Stack:** Python 3、openpyxl、原生 JavaScript、Python `unittest`、Node `node:test`

## Global Constraints

- “减伤”“减免”“技能减免”“技伤减免”的技能伤害减免语义统一为“技免”。
- `PVP免伤`等其他语义词条保持原名。
- 兼容已有铭文个人进度，不修改浏览器存储键。
- 不修改 Excel 源文件。
- 测试、lint 和页面验收由用户手动执行，实施者不主动运行。

---

### Task 1: 装备属性源头统一

**Files:**
- Modify: `tests/test_build_special_equipment.py`
- Modify: `js/query.test.js`
- Modify: `tools/build_special_equipment.py`
- Regenerate: `data/special-equipment.js`

**Interfaces:**
- Consumes: Excel 原词条“减伤”“减免”“技能减免”“技伤减免”。
- Produces: token `{t: "技免", v, raw: "<数值>%技免"}`。

- [ ] **Step 1: 先将测试期望改为“技免”**

  解析测试覆盖四个旧名称均归一为“技免”；查询 fixture 和 AND 筛选改用“技免”。

- [ ] **Step 2: 用户可手动确认旧实现不满足新期望**

  ```powershell
  python -m unittest tests.test_build_special_equipment
  node --test js/query.test.js
  ```

- [ ] **Step 3: 修改生成器并重新生成数据**

  将 `NORMALIZE` 和 `ATTR_ORDER` 标准名改为“技免”，输出展示文字同步改为 `<数值>%技免`，再使用最新工作簿重新生成数据。

### Task 2: 铭文定义与旧存档迁移

**Files:**
- Modify: `js/inscription.js`

**Interfaces:**
- Consumes: 旧存档值“技能减免”“技伤减免”。
- Produces: 标准值“技免”。

- [ ] **Step 1: 扩展旧名称映射**

  ```js
  var LEGACY_SUB_NAMES = {
    "防御": "防",
    "技能减免": "技免",
    "技伤减免": "技免"
  };
  ```

- [ ] **Step 2: 更新所有盾位属性定义**

  将天盾、龙盾、云盾中的标准选项改成“技免”，不修改 `PVP免伤`。

- [ ] **Step 3: 保持保存结构与展示逻辑不变**

  继续通过 `normalizeAttrName`迁移旧值；用户再次保存时自然写入“技免”。

### Task 3: 文档、缓存和范围检查

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-book-equipment-properties-design.md`
- Modify: `service-worker.js`

**Interfaces:**
- Consumes: 新版脚本和装备属性数据。
- Produces: 与当前规则一致的规格及新缓存版本。

- [ ] **Step 1: 更新当前典籍规格中的标准词条名称**

  将“技伤减免”替换为“技免”，保留“减伤/减免”作为 Excel 旧名称说明。

- [ ] **Step 2: 提升 PWA 缓存版本**

  将缓存版本从 `1.0.3`提升为 `1.0.4`。

- [ ] **Step 3: 只读检查范围并提交**

  搜索运行时代码和当前规格中的“技伤减免/技能减免”，确认只剩旧值迁移映射或历史记录；不运行自动验证。
