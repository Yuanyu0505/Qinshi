# 秦时攻略站 PWA 与 GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本项目按用户约定不由 AI 执行测试、lint 或浏览器验收，完成后提供人工验收重点。

**Goal:** 在完整保留现有桌面功能与 Windows 双击 `index.html` 用法的前提下，将工具改造成可安装、可完整离线、适配 Android/iOS 手机和平板并通过 GitHub Pages 发布的 PWA。

**Architecture:** 继续使用无构建步骤的静态 HTML/CSS/JavaScript。新增 Web App Manifest、Service Worker、PWA 生命周期脚本与本机数据管理脚本；现有业务数据结构和 `localStorage` 键保持不变。手机使用底部四分区导航加“更多”菜单，平板和桌面保留完整左侧导航。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、Web App Manifest、Service Worker、GitHub Actions、GitHub Pages。

## Global Constraints

- 应用名称固定为“秦时攻略站”。
- 应用图标必须使用用户提供的正方形人物图片，不重新绘制人物。
- 首次联网后缓存全部运行时数据、脚本、样式、图标及楼兰棋阵图片，后续可完全离线使用。
- 个人进度仍按设备保存在浏览器本地，不引入账号、数据库或云同步。
- 导入备份前先自动下载当前数据备份，再整体覆盖 `qinshi_` 命名空间内的本机数据。
- 新版本安装完成后显示更新提示，只有用户点击才切换版本并刷新。
- Windows 直接双击 `index.html` 时继续可用；Service Worker 仅在 HTTP/HTTPS 环境注册。
- 不改动现有业务数据格式，不删除既有分区，不丢失已完成的历史功能。
- 手机密集内容优先纵向重排；平板继续使用左侧导航并保留宽屏表格。
- GitHub Pages 使用远程 `main` 分支和 GitHub Actions 发布。
- 功能验证、测试、lint、格式检查和浏览器验收由用户手动执行。

---

### Task 1: PWA 元数据与应用图标

**Files:**
- Create: `manifest.webmanifest`
- Create: `icons/app-icon-192.png`
- Create: `icons/app-icon-512.png`
- Create: `icons/apple-touch-icon.png`
- Modify: `index.html`

**Interfaces:**
- Produces: 浏览器安装元数据、Android/桌面 PWA 图标、iOS 主屏幕图标。
- Consumes: 用户提供的 `codex-clipboard-244c7f6f-225f-479b-8c9f-84157b808625.png`。

- [ ] **Step 1:** 将用户图标等比缩放为 192、512、180 像素的非透明 PNG，不裁剪、不重绘人物。
- [ ] **Step 2:** 创建 `manifest.webmanifest`，设置 `name`/`short_name` 为“秦时攻略站”、`start_url` 为 `./`、`scope` 为 `./`、`display` 为 `standalone`、主题色与背景色沿用项目黑金主题。
- [ ] **Step 3:** 在 `index.html` 中加入 manifest、theme-color、iOS 主屏幕图标与 standalone 元数据，并把页面标题和页头名称改为“秦时攻略站”。

### Task 2: 手机底部导航、更多菜单与设置分区

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `js/app.js`

**Interfaces:**
- Produces: `switchPartition(name)` 导航行为；`#mobile-more-panel` 手机更多菜单；`#partition-settings` 设置页面。
- Consumes: 既有七个 `partition-*` 内容分区。

- [ ] **Step 1:** 给现有导航补充无障碍标签和设置入口，并添加手机“更多”按钮及包含铭文、答题、楼兰棋阵、设置的菜单。
- [ ] **Step 2:** 将 `bindTabs()` 改为绑定所有 `[data-partition]` 导航按钮，使重复的手机/平板入口保持同一激活状态，并在切换后关闭更多菜单。
- [ ] **Step 3:** 在不改动业务内容结构的前提下重写响应式断点：手机固定底部导航并为正文预留安全区，平板/桌面使用左侧导航；表单、筛选按钮、铭文和锻造进度在窄屏纵向重排。
- [ ] **Step 4:** 设置分区展示应用版本、离线说明、安装说明、导出/导入按钮和更新状态。

### Task 3: 本机数据备份与恢复

**Files:**
- Create: `js/settings.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `window.QinshiSettings.exportBackup()`、`window.QinshiSettings.importBackup(file)`、`window.QinshiSettings.downloadBackup(reason)`。
- Consumes: 所有以 `qinshi_` 开头的 `localStorage` 键。

- [ ] **Step 1:** 导出版本化 JSON，包含 `formatVersion`、`appName`、`exportedAt` 和 `data`，其中 `data` 只收集 `qinshi_` 命名空间。
- [ ] **Step 2:** 导入时校验 JSON 结构和命名空间；校验成功后先自动下载当前数据备份，再清除本机现有 `qinshi_` 键、写入导入数据并刷新页面。
- [ ] **Step 3:** 对文件读取失败、格式错误、浏览器阻止下载和存储失败显示明确中文状态，不触碰其他站点本机数据。

### Task 4: 完整离线缓存与可控更新

**Files:**
- Create: `service-worker.js`
- Create: `js/pwa.js`
- Modify: `index.html`

**Interfaces:**
- Produces: `window.QinshiPWA.checkForUpdate()`；Service Worker 消息 `SKIP_WAITING`；页面更新提示 `#pwa-update-notice`。
- Consumes: 全部页面运行时静态文件及 Task 1 的 PWA 元数据和图标。

- [ ] **Step 1:** 在 `service-worker.js` 中使用带版本号的预缓存，列出 HTML、CSS、数据脚本、业务脚本、图标及全部楼兰棋阵图片。
- [ ] **Step 2:** 导航请求离线时回退到缓存的 `index.html`；同源静态资源优先从缓存读取，并在后台更新缓存。
- [ ] **Step 3:** `js/pwa.js` 仅在 HTTP/HTTPS 且支持 Service Worker 时注册；检测到 waiting worker 后显示更新提示，点击后发送 `SKIP_WAITING`，在 `controllerchange` 后仅刷新一次。
- [ ] **Step 4:** 设置分区提供手动检查更新按钮；`file://` 环境显示“本地文件模式”，不报错也不影响现有功能。

### Task 5: GitHub Pages 自动发布与使用文档

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `.nojekyll`
- Modify: `README.md`
- Modify: `HANDOVER.md`

**Interfaces:**
- Produces: 推送远程 `main` 后自动上传静态文件并部署 GitHub Pages。
- Consumes: GitHub 官方 `actions/checkout@v6`、`actions/configure-pages@v5`、`actions/upload-pages-artifact@v4`、`actions/deploy-pages@v4`。

- [ ] **Step 1:** 创建只在 `main` 推送或手动触发时运行的 Pages 工作流，授予 `contents: read`、`pages: write`、`id-token: write`，部署环境使用 `github-pages`。
- [ ] **Step 2:** 更新 README，写明公开地址、Android/Chrome 安装步骤、iPhone/iPad Safari“添加到主屏幕”步骤、首次离线缓存、更新提示、导入导出和 Windows 双击用法。
- [ ] **Step 3:** 更新交接文档，记录 Service Worker 缓存版本升级规则、发布分支、备份格式和所有新增文件职责。

### Task 6: 提交、推送与 Pages 启用

**Files:**
- Modify: Git branch metadata and remote repository only.

**Interfaces:**
- Produces: 远程 `main` 分支、GitHub Actions Pages 部署、公开 HTTPS 地址。
- Consumes: 已配置的 `origin=https://github.com/Yuanyu0505/Qinshi.git`。

- [ ] **Step 1:** 检查变更范围，提交全部 PWA 与移动端改造文件。
- [ ] **Step 2:** 将当前最新分支推送为远程 `main`；若 Git Credential Manager 请求授权，让用户在浏览器中登录 GitHub 并授权。
- [ ] **Step 3:** 在仓库 Pages 设置中选择 GitHub Actions（如首次部署尚未启用），等待工作流完成并获取正式页面地址。
- [ ] **Step 4:** 向用户列出改动范围和手机、平板、桌面、离线、更新、备份恢复的手动验收重点，不宣称未经用户验收的结果通过。
