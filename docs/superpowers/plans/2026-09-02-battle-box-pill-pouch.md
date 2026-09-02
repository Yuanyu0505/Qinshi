# 战匣丹囊分区实施计划

> **供自动化执行者使用：** 必须按任务逐项执行，并使用测试驱动开发；每个步骤使用复选框记录状态。实现期间不修改用户未提交的工作簿和图片。

**目标：** 新增响应式战匣丹囊分区，按弟子保存独立进度和槽位品质，支持多弟子材料规划、资料查阅、离线使用及发布。

**架构：** 工作簿派生的等级数据和品质规则存放在 `data/battle-box-pill-pouch.js`；无界面的归一化、上限、材料、属性和库存分配逻辑存放在 `js/battle-box-pill-pouch.js`；本地保存、搜索、编辑、渲染与交互存放在 `js/battle-box-pill-pouch-ui.js`。现有文件只负责挂载分区、导航、样式、备份说明和渐进式网页应用发布。

**技术组成：** 静态网页、层叠样式表、浏览器原生脚本、浏览器本地存储、服务工作线程、节点内置测试运行器。

**设计规范：** `docs/superpowers/specs/2026-09-02-battle-box-pill-pouch-design.md`

## 全局约束

- 保存键固定为 `qinshi_battle_box_pill_pouch_v1`，内部数据版本为 1。
- 新分区固定在“兵法”之后、“合阵”之前。
- 渐进式网页应用版本固定更新为 `1.0.26`。
- 材料数据是单级升级消耗，累计范围固定为当前等级加一至目标等级。
- 战匣 61 级血量固定为 557660。
- 玩家低于 46 级时模块未解锁；当前版本不臆造逐槽解锁等级。
- 槽位导致的降上限不覆盖当前进度，只产生超限状态。
- 不计算装备缘分，不创建内丹名称库，不修改图鉴和装备属性原始数据。
- 保留用户未提交的工作簿、图片、临时目录和其他个人文件。

---

### 任务一：生成并校验静态数据

**文件：**

- 新建：`tools/build_battle_box_pill_pouch.py`
- 新建：`data/battle-box-pill-pouch.js`
- 新建：`js/battle-box-pill-pouch.test.js`

**接口：**

- 输出全局对象 `BATTLE_BOX_PILL_POUCH_DATA`，并兼容节点模块导出。
- 数据对象包含 `battleLevels`、`pouchLevels`、`battleQualityCaps`、`pouchQualityCaps`、`battlePlayerCaps`、`pouchPlayerCaps`、`equipmentSlots`、`defaults` 和 `meta`。
- `battleLevels[等级]` 包含 `level`、`pearls`、`shells`、`attack`、`defense`、`health`、`pvpMitigation`。
- `pouchLevels[等级]` 包含 `level`、`pearls`、`shells`、`bonusPercent`。

- [ ] **步骤一：编写数据完整性失败测试**

```js
const { test } = require("node:test");
const assert = require("node:assert");
const DATA = require("../data/battle-box-pill-pouch.js");

test("战匣丹囊数据保留单级材料与已确认属性", () => {
  assert.strictEqual(DATA.battleLevels.length, 91);
  assert.strictEqual(DATA.pouchLevels.length, 91);
  assert.deepStrictEqual(DATA.battleLevels[51], {
    level: 51, pearls: 217, shells: DATA.battleLevels[51].shells,
    attack: 49409, defense: 49409, health: 395276,
    pvpMitigation: DATA.battleLevels[51].pvpMitigation
  });
  assert.strictEqual(DATA.battleLevels[61].health, 557660);
  assert.deepStrictEqual(DATA.battleQualityCaps, {
    green: 2, blue: 3, purple: 5, orange: 8,
    orangeGold: 12, red: 15, redGold: 20
  });
});
```

- [ ] **步骤二：运行测试并确认数据模块缺失**

运行：`node --test js/battle-box-pill-pouch.test.js`

预期：因 `data/battle-box-pill-pouch.js` 尚不存在而失败。

- [ ] **步骤三：实现工作簿读取脚本**

脚本只读打开 `秦时相关（更新贯侯钟离昧）20260618.xlsx` 的“战匣丹囊”工作表，按已核对的区域读取战匣 1–90 级和丹囊 1–90 级；在输出前把战匣 61 级血量修正为 557660，并在索引 0 写入全零记录。

```python
battle_levels = [{
    "level": 0, "pearls": 0, "shells": 0,
    "attack": 0, "defense": 0, "health": 0, "pvpMitigation": 0,
}]
pouch_levels = [{
    "level": 0, "pearls": 0, "shells": 0, "bonusPercent": 0,
}]
```

- [ ] **步骤四：生成静态数据文件并复核关键值**

生成文件同时暴露浏览器全局与节点导出；确认战匣、丹囊均为 0–90 共 91 条，51 级示例和 61 级修正准确，品质和玩家等级规则与规范完全一致。

- [ ] **步骤五：运行数据测试**

运行：`node --test js/battle-box-pill-pouch.test.js`

预期：数据完整性测试通过。

- [ ] **步骤六：提交静态数据**

```text
提交信息：feat: add battle box and pill pouch data
```

---

### 任务二：实现进度归一化与等级上限

**文件：**

- 新建：`js/battle-box-pill-pouch.js`
- 修改：`js/battle-box-pill-pouch.test.js`

**接口：**

- `integer(value, fallback)`：返回非负整数。
- `battlePlayerCap(playerLevel)`、`pouchPlayerCap(playerLevel)`：返回数字上限或 `null` 表示未解锁。
- `battleItemCap(slots)`、`pouchItemCap(slots)`：从基础 10 级和品质增量计算物品上限。
- `effectiveCaps(playerLevel, disciple)`：返回两分区的玩家上限、物品上限、实际上限、未解锁和超限状态。
- `normalizeAccount(raw)`：归一化账号等级、库存、购买参数和优先设置。
- `normalizeDisciple(raw)`：归一化弟子来源、四个装备槽、八个内丹槽、当前等级和目标等级。

- [ ] **步骤一：编写玩家等级边界失败测试**

```js
test("玩家等级上限覆盖全部边界", () => {
  assert.strictEqual(CORE.battlePlayerCap(45), null);
  assert.strictEqual(CORE.battlePlayerCap(46), 70);
  assert.strictEqual(CORE.battlePlayerCap(53), 70);
  assert.strictEqual(CORE.battlePlayerCap(54), 90);
  assert.strictEqual(CORE.pouchPlayerCap(56), 40);
  assert.strictEqual(CORE.pouchPlayerCap(57), 50);
  assert.strictEqual(CORE.pouchPlayerCap(80), 90);
});
```

- [ ] **步骤二：编写槽位品质、空槽和超限失败测试**

覆盖四件橙色装备物品上限 42、四件红金装备物品上限 90、八枚橙色内丹物品上限 42、八枚神级内丹物品上限 90，以及降低品质后保留当前等级但标记超限。

- [ ] **步骤三：运行聚焦测试并确认导出缺失**

运行：`node --test --test-name-pattern="玩家|品质|上限|归一化" js/battle-box-pill-pouch.test.js`

预期：因核心函数未实现而失败。

- [ ] **步骤四：实现最小归一化与上限函数**

```js
function effectiveCap(playerCap, itemCap) {
  return playerCap === null ? null : Math.min(playerCap, itemCap);
}
```

品质键只允许静态数据中定义的值；未知品质和不完整槽位归一化为空槽。图鉴弟子使用图鉴编号作为关联值，自由弟子只保存稳定的本地编号和名称。

- [ ] **步骤五：运行聚焦测试**

预期：玩家等级、品质、上限、归一化测试全部通过。

- [ ] **步骤六：提交进度核心**

```text
提交信息：feat: calculate battle box and pill pouch caps
```

---

### 任务三：实现材料、属性、库存分配与购买补足

**文件：**

- 修改：`js/battle-box-pill-pouch.js`
- 修改：`js/battle-box-pill-pouch.test.js`

**接口：**

- `costBetween(levels, currentLevel, targetLevel)`：累计当前加一至目标等级的单级材料。
- `attributeDelta(kind, currentLevel, targetLevel, data)`：返回战匣四项差值或丹囊比例差值。
- `buildPlanItems(selected, account, data)`：按弟子优先级和弟子内分区优先级生成升级项目。
- `allocateInventory(items, inventory, data)`：逐级同时检查两种材料并返回每项可达等级、实际消耗、总剩余。
- `fullTargetSummary(items, inventory, purchaseSettings, data)`：返回完整目标总需求、缺口、购买包数、购买后剩余和元宝总额。
- `calculatePlan(selected, account, data)`：组合完整计算结果。

- [ ] **步骤一：编写单级及跨级累计失败测试**

```js
test("材料按上一等级升至本等级逐行累计", () => {
  assert.strictEqual(CORE.costBetween(DATA.battleLevels, 50, 51).pearls, 217);
  const expected = DATA.battleLevels.slice(51, 56)
    .reduce((sum, row) => sum + row.pearls, 0);
  assert.strictEqual(CORE.costBetween(DATA.battleLevels, 50, 55).pearls, expected);
});
```

- [ ] **步骤二：编写多弟子优先分配失败测试**

构造两个弟子和有限库存，断言先满足排在前面的弟子；交换顺序后结果随之交换。同一弟子同时选择战匣和丹囊时，断言“战匣优先”和“丹囊优先”改变可达等级。

- [ ] **步骤三：编写完整目标缺口与购买失败测试**

断言完整目标需求不受库存分配顺序影响；沧海珠按 5 个一包、20 元宝，玄龟甲按 10 个一包、300 元宝向上取整，并允许传入修改后的每包数量和价格。

- [ ] **步骤四：运行聚焦测试并确认计算函数缺失**

运行：`node --test --test-name-pattern="材料|分配|购买|属性" js/battle-box-pill-pouch.test.js`

预期：新增测试失败。

- [ ] **步骤五：实现逐级分配算法**

每个升级项目从当前等级的下一等级开始；只有该级沧海珠和玄龟甲都足够才扣除并升级，否则停止该项目，不允许只扣一种材料。

```js
if (remaining.pearls < row.pearls || remaining.shells < row.shells) break;
remaining.pearls -= row.pearls;
remaining.shells -= row.shells;
reachableLevel = level;
```

- [ ] **步骤六：实现完整目标和属性差值**

完整目标对所有已启用项目独立累计，不使用逐级分配后的可达等级；属性差值按当前等级与目标等级对应行相减，并按弟子分别保留。

- [ ] **步骤七：运行全部核心测试**

运行：`node --test js/battle-box-pill-pouch.test.js`

预期：数据、上限、材料、分配、购买和属性测试全部通过。

- [ ] **步骤八：提交规划核心**

```text
提交信息：feat: plan battle box and pill pouch upgrades
```

---

### 任务四：实现个人进度界面与本地保存

**文件：**

- 修改：`index.html`
- 新建：`js/battle-box-pill-pouch-ui.js`
- 修改：`css/style.css`
- 修改：`serve.test.js`

**接口：**

- 页面容器为 `partition-battle-box-pill-pouch`。
- 子分区按钮使用 `data-battle-pouch-mode="progress|calculator|reference"`。
- 界面读取 `BATTLE_BOX_PILL_POUCH_DATA`、`BATTLE_BOX_PILL_POUCH_CORE`、`ATLAS_DATA` 和 `SPECIAL_EQUIPMENT_DATA`。
- 本地保存对象为 `{ version: 1, account, disciples }`。

- [ ] **步骤一：编写页面挂载与保存键失败测试**

```js
test("首页提供战匣丹囊三子分区及三层脚本", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /id="partition-battle-box-pill-pouch"/);
  assert.match(html, /data-battle-pouch-mode="progress">个人进度/);
  assert.match(html, /data-battle-pouch-mode="calculator">目标计算/);
  assert.match(html, /data-battle-pouch-mode="reference">资料图表/);
});
```

- [ ] **步骤二：运行聚焦测试并确认界面尚未挂载**

运行：`node --test --test-name-pattern="战匣丹囊" serve.test.js`

预期：页面结构与脚本引用断言失败。

- [ ] **步骤三：增加分区骨架和脚本加载顺序**

静态数据在核心脚本之前加载，核心脚本在界面脚本之前加载。个人进度页提供账号区、弟子搜索添加区、弟子列表和错误提示区。

- [ ] **步骤四：实现本地读取、归一化和保存**

读取失败时使用空白状态并显示提示；账号字段输入后自动保存；弟子编辑使用草稿，只有点击保存才覆盖正式数据。未保存退出需确认，删除需二次确认。

- [ ] **步骤五：实现弟子搜索与自由新增**

搜索结果按 `ATLAS_DATA.items` 原顺序展示；无结果且输入非空时显示“以此名称新增”。拦截已添加的同一图鉴编号或完全同名弟子。

- [ ] **步骤六：实现战匣与丹囊编辑器**

战匣固定武器、防具、饰品、典籍；搜索时普通和神兵分类都映射到对应基础槽位类型。自由输入装备允许保存但标注为自由输入。丹囊只显示八个空槽或品质选择。每次草稿变化实时显示上限计算。

- [ ] **步骤七：运行页面聚焦测试**

预期：分区、子分区、脚本顺序、保存键、弟子搜索和槽位文本断言通过。

- [ ] **步骤八：提交个人进度界面**

```text
提交信息：feat: add disciple battle box progress
```

---

### 任务五：实现目标计算与资料图表界面

**文件：**

- 修改：`js/battle-box-pill-pouch-ui.js`
- 修改：`css/style.css`
- 修改：`serve.test.js`

**接口：**

- 目标计算界面调用 `calculatePlan(selected, account, data)`。
- 资料图表直接读取静态等级数组，不在界面层重新计算材料或属性。

- [ ] **步骤一：编写目标计算结构失败测试**

断言存在多弟子选择、上移、下移、战匣目标、丹囊目标、战匣优先、丹囊优先、一键设为上限、共享库存、购买参数、材料总览和弟子明细。

- [ ] **步骤二：编写资料图表结构失败测试**

断言存在战匣与丹囊切换、当前附近、关键节点、全部等级、参照弟子选择，以及“上一等级升至本等级所需”和“槽位分级解锁规则待准确数据补充”。

- [ ] **步骤三：运行界面聚焦测试并确认缺少功能**

运行：`node --test --test-name-pattern="战匣丹囊.*计算|战匣丹囊.*资料" serve.test.js`

预期：新增界面断言失败。

- [ ] **步骤四：实现多弟子目标设置和排序**

每位弟子分别启用战匣、丹囊并设置目标；提供设为各自上限。排序支持拖动、上移和下移。未解锁或超限项目禁用并显示原因。

- [ ] **步骤五：实现结果渲染**

先显示账号材料总览和购买补足，再按弟子显示当前、目标、可达等级、材料需求、实际分配和属性差值。不同弟子属性不合并。

- [ ] **步骤六：实现资料图表**

电脑和平板显示表格，手机显示等级卡片；三种查看方式过滤同一静态数据。选择参照弟子后标记当前、目标、实际上限和超限状态。

- [ ] **步骤七：运行界面聚焦测试**

预期：目标计算与资料图表结构断言通过。

- [ ] **步骤八：提交计算与资料界面**

```text
提交信息：feat: add multi disciple battle box planner
```

---

### 任务六：接入导航并完成手机和平板布局

**文件：**

- 修改：`index.html`
- 修改：`js/app.js`
- 修改：`css/style.css`
- 修改：`serve.test.js`

**接口：**

- `js/app.js` 的标题和分区映射增加 `battle-box-pill-pouch`。
- 桌面导航与移动“更多”菜单顺序均为“兵法 → 战匣丹囊 → 合阵”。

- [ ] **步骤一：编写导航顺序与响应式失败测试**

断言桌面和移动导航均处于正确顺序；样式包含手机单列卡片、战匣纵向槽位、丹囊两列槽位、整页编辑层，以及平板双列弟子卡片和左右分栏编辑器。

- [ ] **步骤二：运行聚焦测试并确认导航尚未接入**

运行：`node --test --test-name-pattern="战匣丹囊.*导航|战匣丹囊.*手机|战匣丹囊.*平板" serve.test.js`

预期：新增断言失败。

- [ ] **步骤三：接入桌面导航、移动菜单、标题和分区映射**

保持现有主导航逻辑，新增分区键但不改变其他分区的事件处理。

- [ ] **步骤四：实现响应式样式**

品质颜色复用现有装备体系；橙金和红金增加金色高光。所有状态同时显示文字。分区内部宽表只在自身容器滚动，页面本身不产生横向溢出。

- [ ] **步骤五：统一数字输入行为**

新分区所有数字输入框使用数字键盘提示，但通过样式隐藏上下按钮，并在获得焦点时阻止滚轮改变值；不加入任何加减控件。

- [ ] **步骤六：运行导航与响应式测试**

预期：聚焦测试通过。

- [ ] **步骤七：提交响应式接入**

```text
提交信息：style: adapt battle box section for mobile
```

---

### 任务七：更新备份、渐进式网页应用和发布清单

**文件：**

- 修改：`index.html`
- 修改：`js/pwa.js`
- 修改：`manifest.webmanifest`
- 修改：`service-worker.js`
- 修改：`.github/workflows/pages.yml`
- 修改：`README.md`
- 修改：`HANDOVER.md`
- 修改：`serve.test.js`

**接口：**

- 服务工作线程缓存名更新为 `qinshi-site-1.0.26`。
- 预缓存和发布清单加入三个战匣丹囊脚本。
- 备份说明加入战匣丹囊进度；保存键因 `qinshi_` 前缀自动进入现有备份。

- [ ] **步骤一：编写发布资源失败测试**

断言首页、服务工作线程和发布流程均包含 `data/battle-box-pill-pouch.js`、`js/battle-box-pill-pouch.js`、`js/battle-box-pill-pouch-ui.js`，并断言版本文本为 `1.0.26`。

- [ ] **步骤二：运行发布聚焦测试并确认缺少资源**

运行：`node --test --test-name-pattern="1.0.26|战匣丹囊.*发布|渐进式网页应用" serve.test.js`

预期：新增资源和版本断言失败。

- [ ] **步骤三：更新预缓存、发布复制和文档**

只增加新资源并把版本从 1.0.25 更新到 1.0.26；不改变现有服务工作线程策略。

- [ ] **步骤四：运行全量测试**

运行：`node --test js/*.test.js serve.test.js`

预期：全部通过；若出现既有失败，先区分本次回归与无关失败并如实记录。

- [ ] **步骤五：检查差异与用户文件**

运行 `git diff --check`，确认工作簿和用户图片没有被暂存或修改，确认提交内容只包含本功能、规范、计划和发布文件。

- [ ] **步骤六：提交发布更新**

```text
提交信息：chore: release pwa 1.0.26
```

---

### 任务八：合并、推送与线上版本确认

**文件：**

- 不新增业务文件。

- [ ] **步骤一：确认功能分支工作区干净且测试证据完整**

记录分支最新提交、全量测试结果和 `git status --short`。

- [ ] **步骤二：快进合并到本地 `master`**

在主工作区执行只允许快进的合并；保留用户未提交的工作簿、图片和临时文件。

- [ ] **步骤三：推送 GitHub**

把本地 `master` 推送到远端 `main`。

- [ ] **步骤四：确认线上服务工作线程版本**

读取线上 `service-worker.js`，确认包含 `1.0.26`。若部署仍在进行，有限次数等待后再次检查，不改变发布配置。
