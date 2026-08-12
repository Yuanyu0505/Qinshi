# 动态分区标题与 Qin 名称统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有设备只显示当前分区名作为页面和浏览器标题，并将安装、设置、提示、备份及文档中的工具名称统一为 `Qin`。

**Architecture:** 复用现有单页分区切换入口 `switchPartition(name)`，通过一份分区名称映射同步更新唯一顶部标题和 `document.title`。删除内容区重复标题及附带统计 DOM，并让旧渲染代码对缺失的显示元素安全兼容；产品名称在 PWA、设置和文档各自的现有来源中直接统一，不修改存储键或备份格式版本。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Web App Manifest、Service Worker。

## Global Constraints

- 页面和浏览器标签只显示当前分区名，不附加 `Qin`、数量、版本或其他文字。
- 工具安装名称、设置名称、提示、备份文件名和 README 产品名统一为 `Qin`。
- 保留所有 `qinshi_` 本地存储键、备份格式版本和旧备份导入兼容。
- 不修改图标、数据、筛选规则、个人进度或业务功能。
- Service Worker 缓存版本从 `1.0.4` 更新为 `1.0.5`，PWA 显示版本同步为 `1.0.5`。
- 项目验证由用户手动执行；实施者不主动运行测试、lint、格式检查或浏览器验收。
- 不暂存用户未跟踪的 `答题.jpg`，不删除保险 stash。

---

### Task 1: 建立唯一动态分区标题

**Files:**
- Modify: `index.html:3-22, 44-314`
- Modify: `js/app.js:24-75, 113-155, 350-365, 950-978`
- Modify: `js/inscription.js:48-55`
- Modify: `css/style.css:75-84`

**Interfaces:**
- Consumes: `switchPartition(name)`、`data-partition` 值、默认分区 `atlas`。
- Produces: `PARTITION_TITLES`、`el.pageTitle`、`setPartitionTitle(name)`。

- [ ] **Step 1: 将页面静态标题改为默认分区名**

在 `index.html` 中：

```html
<title>图鉴</title>
<meta name="apple-mobile-web-app-title" content="Qin">
...
<header class="top">
  <h1 id="page-title">图鉴</h1>
</header>
```

页面顶部只保留当前分区名；Apple 安装名使用 `Qin`。

- [ ] **Step 2: 删除八个内容区重复标题**

从 `partition-equipment`、`partition-loulan`、`partition-quiz`、`partition-inscription`、`partition-forging`、`partition-drops`、`partition-atlas`、`partition-settings` 中删除 `.partition-head` 节点，包括装备数量/版本、答题数量和铭文数量的附加元素。

不移动这些附加信息到其他位置。

- [ ] **Step 3: 增加分区名映射与统一更新函数**

在 `js/app.js` 中增加：

```js
const PARTITION_TITLES = {
  atlas: "图鉴",
  drops: "关卡掉落",
  equipment: "装备属性",
  forging: "橙装锻造",
  inscription: "铭文",
  quiz: "答题",
  loulan: "楼兰棋阵",
  settings: "设置"
};

function setPartitionTitle(name) {
  const title = PARTITION_TITLES[name] || "图鉴";
  if (el.pageTitle) el.pageTitle.textContent = title;
  document.title = title;
}
```

`el` 映射新增 `pageTitle: document.getElementById("page-title")`。在 `switchPartition(name)` 成功确认分区存在后调用 `setPartitionTitle(name)`，桌面、移动底栏和“更多”弹层自动共用该逻辑。

- [ ] **Step 4: 移除已删除统计元素的写入依赖**

- 从 `el` 中删除 `count`、`version`、`quizCount` 映射。
- 删除初始化中的装备版本显示。
- 删除装备 `apply()` 中“等待筛选”和结果数量写入，只保留结果显隐。
- 删除 `applyQuiz()` 中答题数量写入。
- `js/inscription.js` 删除 `el.count` 映射和所有 `el.count.textContent` 写入，保留数据过滤和渲染。

- [ ] **Step 5: 清理失效标题样式**

删除 `.partition-head` 和 `.partition-head .meta` 规则。保留 `.top h1` 的现有风格，使唯一动态标题继续使用原顶部视觉。

- [ ] **Step 6: 提交动态标题改动**

```powershell
git add -- index.html js/app.js js/inscription.js css/style.css
git commit -m "feat: use active partition as page title"
```

---

### Task 2: 将产品名称统一为 Qin 并更新缓存版本

**Files:**
- Modify: `index.html:10, 21-23, 308-316`
- Modify: `manifest.webmanifest:1-4`
- Modify: `js/pwa.js:4, 93-110`
- Modify: `js/settings.js:4-30`
- Modify: `service-worker.js:3-5`
- Modify: `README.md:1-22`

**Interfaces:**
- Consumes: `APP_NAME`、`APP_VERSION`、`CACHE_NAME`、现有备份 `formatVersion: 1`。
- Produces: 安装名称 `Qin`、显示版本 `1.0.5`、备份文件名前缀 `Qin-backup-`。

- [ ] **Step 1: 更新 Manifest 和设置页名称**

```json
{
  "name": "Qin",
  "short_name": "Qin"
}
```

`index.html` 设置页“应用名称”显示 `Qin`，更新提示改为“Qin 有新版本可用。”。

- [ ] **Step 2: 更新 PWA 提示和显示版本**

在 `js/pwa.js`：

```js
var APP_VERSION = "1.0.5";
```

将“秦时攻略站已安装到当前设备/设备”改为“Qin 已安装到当前设备/设备”。其他不含产品名的状态文字保持不变。

- [ ] **Step 3: 更新新备份名称并保留旧备份兼容**

在 `js/settings.js`：

```js
var APP_NAME = "Qin";
...
return "Qin-backup-" + suffix + "-" + stamp + ".json";
```

`formatVersion` 继续为 `1`；`validatePayload()` 仍不限制 `payload.appName`，因此旧的“秦时攻略站”备份可以继续导入。

- [ ] **Step 4: 更新 README 产品名称**

标题改为 `# Qin`，iPhone/iPad 安装说明中的主屏幕名称改为 `Qin`。功能描述和使用步骤保持不变。

- [ ] **Step 5: 更新 Service Worker 缓存版本**

```js
const CACHE_NAME = CACHE_PREFIX + "1.0.5";
```

保留 `CACHE_PREFIX = "qinshi-site-"`，以便激活新版本时仍能识别并清理旧缓存；该前缀不是用户可见产品名称。

- [ ] **Step 6: 提交 Qin 名称与缓存版本改动**

```powershell
git add -- index.html manifest.webmanifest js/pwa.js js/settings.js service-worker.js README.md
git commit -m "feat: rename installed app to Qin"
```

---

### Task 3: 范围检查与用户手动验证清单

**Files:**
- Review: `index.html`
- Review: `js/app.js`
- Review: `js/inscription.js`
- Review: `js/pwa.js`
- Review: `js/settings.js`
- Review: `manifest.webmanifest`
- Review: `service-worker.js`
- Review: `README.md`
- Review: `css/style.css`

**Interfaces:**
- Consumes: 前两个任务的提交。
- Produces: 等待用户手动验收的交付说明。

- [ ] **Step 1: 检查名称残留和改动范围**

只读搜索“秦时攻略站”和 `.partition-head`，确认用户可见产品名和重复标题已经移除；允许保留 `qinshi_`、`qinshi-site-`、`window.QinshiPWA`、`window.QinshiSettings` 等兼容性内部标识。使用 `git status --short`、`git diff --stat` 和提交列表确认 `答题.jpg` 未被暂存。

- [ ] **Step 2: 列出用户手动验证重点**

- 八个分区切换时顶部与浏览器标签只显示当前分区名。
- 手机底部导航与“更多”弹层切换时标题同步。
- 内容区不再重复显示分区名、数量或版本。
- PWA 安装名、设置页、更新提示和安装提示使用 `Qin`。
- 新导出的备份文件以 `Qin-backup-` 开头，旧备份仍可导入。
- 重新部署后客户端可收到 `1.0.5` 缓存更新。
- 既有个人进度与其他本地数据仍然存在。

