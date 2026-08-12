# 典籍装备属性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“典籍属性”工作表的 52 件典籍加入“装备属性”分区，并实现已确认的分类、标准化、无限副属性筛选、分阶展示和排序规则。

**Architecture:** 扩展现有 `SPECIAL_EQUIPMENT_DATA`，为典籍记录增加 `bookGroup` 和按档次分组的 `stages`，同时保留扁平 `tiers` 供统一查询。查询核心新增复合词条别名、默认排除典籍和返回真实排序 token 的能力；页面层按当前分类选择普通四档表或典籍分组分阶表。

**Tech Stack:** Python 3、openpyxl、原生 JavaScript（UMD 查询模块）、HTML、CSS、Node `node:test`、Python `unittest`

## Global Constraints

- 数据源固定为 `C:\Users\pghyl\Desktop\deepseek\秦时相关（更新贯侯钟离昧）20260618.xlsx` 的“特殊属性装备”和“典籍属性”工作表。
- 只更新电脑网页端展示，不专门改动手机和平板端布局。
- 不修改其他既有分区或浏览器个人进度存储。
- “减伤”和“减免”在装备属性全分区统一为“技伤减免”。
- 项目测试、lint、格式检查及手动验收由用户执行；实施者只写测试和提供验证命令，不主动运行。

---

### Task 1: 扩展 Excel 数据生成器

**Files:**
- Modify: `tools/build_special_equipment.py`
- Modify: `tests/test_build_special_equipment.py`
- Regenerate: `data/special-equipment.js`

**Interfaces:**
- Consumes: `parse_cell(value)` 解析旧装备单值属性；工作簿“特殊属性装备”“典籍属性”。
- Produces: `parse_book_cell(value)`、`parse_book_sheet(workbook)`，以及含 `bookGroup`、`stages`、复合 token `matches` 的 `SPECIAL_EQUIPMENT_DATA`。

- [ ] **Step 1: 先补解析测试**

  在 `tests/test_build_special_equipment.py` 增加以下行为用例：

  - `减伤`、`减免`均生成内部类型和展示文字“技伤减免”。
  - `130速`生成数值 130、类型“速”。
  - `敌方-3.6%防`生成类型“敌方减防”并保留展示原文。
  - `10%攻防血`生成 `matches=["攻", "防", "血", "攻防血"]`。
  - 典籍总数为 52，分组数量为 18/21/13。
  - 初始紫色典籍有五档；另外两组没有紫色档。
  - 紫色、橙色为三个阶次，其他档次为四个阶次。

- [ ] **Step 2: 用户可手动确认测试在旧实现下失败**

  建议命令：

  ```powershell
  python -m unittest tests.test_build_special_equipment
  ```

  预期旧实现缺少典籍解析接口和新标准化规则，因此新增用例失败。

- [ ] **Step 3: 实现最小数据扩展**

  - 用工作表名称读取，避免依赖索引。
  - 将单元格按换行拆成多个 token。
  - 为普通、敌方减少、速度、复合“攻防血”建立明确解析分支。
  - 旧装备 token 继续保留 `t/v/raw`；需要复合匹配时增加 `matches`。
  - 典籍同时生成扁平 `tiers` 与分阶 `stages`。
  - 将 52 件典籍追加到原 123 件装备后，并扩展元数据分类、词条列表与总数。

- [ ] **Step 4: 生成新版静态数据**

  使用最新工作簿作为输入：

  ```powershell
  python tools/build_special_equipment.py "C:\Users\pghyl\Desktop\deepseek\秦时相关（更新贯侯钟离昧）20260618.xlsx"
  ```

  预期生成 175 件记录，且数据中的普通典籍和神兵典籍数量分别为 39、13。

### Task 2: 扩展统一查询与排序语义

**Files:**
- Modify: `js/query.js`
- Modify: `js/query.test.js`

**Interfaces:**
- Consumes: token `{t, v, raw, matches?}`、典籍 `bookGroup/stages`、查询参数 `{search, category, main, filters, sortAttr, valueSource}`。
- Produces: `tokenMatches(tk, attr)`、`sortToken(item, attr, valueSource)`；`sortValue`继续返回数值以兼容现有调用。

- [ ] **Step 1: 先补查询测试**

  覆盖以下行为：

  - 默认空分类只返回除典籍外装备。
  - 明确选择“典籍”或“神兵典籍”后仅返回对应分类。
  - 典籍完整主属性文本按 `mainKey` 匹配攻、防、血。
  - 一个“攻防血”token 同时满足攻、防、血、攻防血，并可满足多条件 AND。
  - 三个以上副属性仍能参与 AND 查询。
  - `最高值`跨档次、跨阶次取最大值。
  - `橙金/红色/红金`只从指定档次取最大值，无值返回 `null`。
  - `sortToken`返回真实展示 token，复合属性不改写成单项属性。

- [ ] **Step 2: 用户可手动确认测试在旧实现下失败**

  建议命令：

  ```powershell
  node --test js/query.test.js
  ```

- [ ] **Step 3: 实现查询规则**

  - 分类顺序加入普通典籍与神兵典籍。
  - 空分类改为严格排除两类典籍。
  - 主属性通过 `mainKey || main`匹配。
  - `hasSubAttr`通过 `matches`识别复合词条。
  - 新增 `sortToken`，在目标档次或全部档次中选择数值最大的真实 token。
  - 排序同值时使用 `sourceOrder`，无该字段时回退 ID。

### Task 3: 实现电脑网页端典籍分组与分阶表格

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `Q.TIER_ORDER`、`Q.sortToken(...)`、典籍 `bookGroup/stages`。
- Produces: 普通装备单表、普通典籍上下分组表、神兵典籍单表，以及每档按阶次纵向展示的 HTML。

- [ ] **Step 1: 更新固定筛选控件**

  - 搜索框示例加入典籍。
  - 分类默认按钮文案改为“除典籍外”。
  - 取值档位按 `最高值 → 橙金 → 红色 → 红金`排列。

- [ ] **Step 2: 移除副属性数量限制**

  - 点击任意未选词条都可继续加入筛选。
  - 不再因已选两项而禁用其他按钮。
  - 移除当前排序属性时，排序属性自动切换到剩余第一项。

- [ ] **Step 3: 重构结果表容器**

  - 普通装备继续输出现有四档表格。
  - “典籍”按初始橙色在上、初始紫色在下输出两个独立表格，空组隐藏。
  - “神兵典籍”输出一张四档表格。
  - 初始紫色典籍表输出五档，其他表不产生紫色列。

- [ ] **Step 4: 增加阶次单元格渲染**

  每个档次单元格使用固定小行：

  ```html
  <div class="book-stage-row">
    <span class="book-stage-label">5阶</span>
    <span class="book-stage-values">5.5%攻防血 + 12%技伤减免</span>
  </div>
  ```

  无属性的小行显示“—”，命中筛选的 token 沿用高亮语义。

- [ ] **Step 5: 显示真实排序来源**

  排序值从 `Q.sortToken`获取并直接显示 `raw`；速度、敌方减少和复合词条均保持已确认格式。

- [ ] **Step 6: 添加桌面端样式**

  - 为典籍分组标题、分阶小行、阶次标签和档次列设置清晰边界。
  - 样式放在桌面通用规则中，不新增或修改移动端媒体查询规则。
  - 保持原装备表格和卡片视觉不变。

### Task 4: 缓存更新与交付说明

**Files:**
- Modify: `service-worker.js`

**Interfaces:**
- Consumes: 新版 HTML、CSS、JS、静态数据。
- Produces: 新缓存版本，使部署后的浏览器能够获取本次更新文件。

- [ ] **Step 1: 更新静态缓存版本**

  仅提升缓存名称版本号，不改变缓存资源清单和离线策略。

- [ ] **Step 2: 检查改动范围**

  仅查看 Git diff，确认没有修改 Excel 原文件、其他分区数据或个人进度存储键；不运行测试、lint 或页面验收。

- [ ] **Step 3: 提交功能改动**

  提交数据生成器、测试、生成数据、查询、页面、样式和缓存版本，并向用户列出建议手动验证命令及网页检查点。
