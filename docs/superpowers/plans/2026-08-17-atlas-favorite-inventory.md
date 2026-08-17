# 已收藏图鉴个人库存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅为已收藏图鉴保存并展示魂魄库存、逐阶段装备拥有状态和未拥有备注。

**Architecture:** `js/atlas.js` 提供无 DOM 的库存规范化、装备键和魂魄状态计算；`js/app.js` 负责收藏约束、草稿编辑、本地存储与卡片渲染；`css/style.css` 提供桌面和窄屏样式。新数据使用独立 `qinshi_atlas_inventory_v1` 键，自动进入现有备份。

**Tech Stack:** 原生 JavaScript、localStorage、HTML、CSS、Node.js `node:test`

## Global Constraints

- 未收藏图鉴不可编辑且不展示库存信息。
- 取消收藏保留库存但隐藏，再次收藏恢复。
- 装备状态按图鉴、阶段和阶段内序号独立保存。
- 顶部图鉴汇总不扣除个人库存。
- 不更新 PWA、Service Worker 或 GitHub Pages，不推送 GitHub。
- AI 不运行测试、lint、格式化或浏览器验证；命令仅供用户手动执行。
- 完成后提交并快进合并到本地 `master`。

---

### Task 1: 图鉴库存纯逻辑

**Files:**
- Modify: `js/atlas.test.js`
- Modify: `js/atlas.js`

**Interfaces:**
- Produces: `equipmentRecordKey(stageKey, index)`、`normalizeInventoryRecord(record)`、`soulInventoryStatus(required, owned)`。
- Consumes: 图鉴阶段键和当前升级计划。

- [ ] **Step 1: 增加纯逻辑契约**

```js
test("图鉴装备库存按阶段和位置独立", () => {
  assert.equal(A.equipmentRecordKey("9→10", 0), "9→10|0");
  assert.notEqual(A.equipmentRecordKey("7→8", 0), A.equipmentRecordKey("9→10", 0));
});

test("魂魄库存显示差额、达标和未填写", () => {
  assert.deepEqual(A.soulInventoryStatus(765, 760), { state: "short", owned: 760, missing: 5 });
  assert.deepEqual(A.soulInventoryStatus(765, 765), { state: "enough", owned: 765, missing: 0 });
  assert.deepEqual(A.soulInventoryStatus(765, null), { state: "unset", owned: null, missing: 765 });
});
```

- [ ] **Step 2: 实现最小纯逻辑**

```js
function equipmentRecordKey(stageKey, index) {
  return String(stageKey || "") + "|" + Math.max(0, Math.trunc(Number(index) || 0));
}

function soulInventoryStatus(requiredInput, ownedInput) {
  var required = nonNegativeInteger(requiredInput, 0);
  if (ownedInput === null || ownedInput === undefined || ownedInput === "") {
    return { state: "unset", owned: null, missing: required };
  }
  var owned = nonNegativeInteger(ownedInput, 0);
  var missing = Math.max(0, required - owned);
  return { state: missing ? "short" : "enough", owned: owned, missing: missing };
}
```

`normalizeInventoryRecord` 只保留合法 `soulsOwned` 与 `{name, owned, note}`，丢弃数组和未知结构。

- [ ] **Step 3: 建议用户运行纯逻辑测试**

```powershell
node --test js/atlas.test.js
```

### Task 2: 收藏卡片库存存储与编辑

**Files:**
- Modify: `js/app.js`
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: `ATLAS.normalizeInventoryRecord`、`ATLAS.equipmentRecordKey`、`ATLAS.soulInventoryStatus`、`atlasState.favorites`。
- Produces: `qinshi_atlas_inventory_v1` 存储、收藏卡片“编辑库存／保存／取消”交互。

- [ ] **Step 1: 建立状态和存储函数**

```js
const ATLAS_INVENTORY_KEY = "qinshi_atlas_inventory_v1";

const atlasState = {
  // 现有字段保持不变
  inventory: loadAtlasInventory(),
  inventoryEditingId: "",
  inventoryDraft: null,
  inventoryError: ""
};
```

`loadAtlasInventory()` 按图鉴 ID 调用纯逻辑规范化；`saveAtlasInventory()` 捕获存储异常并返回布尔值。

- [ ] **Step 2: 为收藏卡片构建只读库存文案**

魂魄：

```js
function atlasSoulInventoryHtml(required, record) {
  var status = ATLAS.soulInventoryStatus(required, record && record.soulsOwned);
  if (status.state === "unset") return "";
  if (status.state === "enough") return "（库存达标）";
  return "（已有" + status.owned + "，还差" + status.missing + "）";
}
```

装备只对收藏项附加状态；已拥有输出 `<strong class="atlas-equipment-owned">√</strong>`，未拥有输出转义后的备注或“未拥有”。

- [ ] **Step 3: 构建编辑草稿**

点击 `data-atlas-inventory-edit` 时，从当前图鉴记录和当前升级计划生成草稿。每件装备使用阶段键和序号定位；若旧记录中的 `name` 与当前装备名不同，则新建默认 `{name, owned:false, note:""}`。

- [ ] **Step 4: 绑定保存和取消**

- 魂魄空值保存为未填写；非空值必须是非负整数。
- 已拥有/未拥有使用 select 或单选按钮。
- 未拥有备注原样保存、渲染转义；切换已拥有不删除备注。
- 保存成功后退出编辑并重新渲染；失败时保持草稿并显示错误。
- 收藏按钮取消收藏时退出当前编辑状态，但不删除 `atlasState.inventory[id]`。

- [ ] **Step 5: 增加 DOM 契约**

`serve.test.js` 断言存在 `ATLAS_INVENTORY_KEY`、`data-atlas-inventory-edit`、`atlas-equipment-owned` 和收藏条件分支，且设置备份说明提及图鉴个人库存。

- [ ] **Step 6: 建议用户运行页面契约测试**

```powershell
node --test js/atlas.test.js serve.test.js
```

### Task 3: 响应式样式和交接说明

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: Task 2 输出的库存编辑 class。
- Produces: 桌面内联编辑与手机/平板单列布局。

- [ ] **Step 1: 增加库存展示样式**

```css
.atlas-equipment-owned {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 2px 6px;
  color: #fff;
  background: #238a45;
  border-radius: 5px;
  font-weight: 800;
}
```

为备注、错误、编辑动作和魂魄输入增加分区作用域样式，不改变未收藏卡片。

- [ ] **Step 2: 增加窄屏布局**

在现有 `max-width: 1024px` 和手机媒体查询内将库存编辑器改为单列，按钮和输入最小高度 44px，数值输入字号 16px。

- [ ] **Step 3: 更新备份说明和 HANDOVER**

设置页面备份文案加入“图鉴个人库存”；HANDOVER 记录新存储键、取消收藏保留和装备键规则。

- [ ] **Step 4: 提交并合并**

```powershell
git add js/atlas.js js/atlas.test.js js/app.js css/style.css index.html serve.test.js HANDOVER.md
git commit -m "feat: track favorite atlas inventory"
git -C C:\Users\pghyl\Desktop\deepseek merge --ff-only codex/atlas-tactics-planning
```
