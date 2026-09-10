# 手机、平板适配与 PWA 1.0.37 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PWA 1.0.36 之后的全部业务改动适配手机和平板，完成自动化与浏览器验收，并发布 PWA 1.0.37。

**Architecture:** 保留现有桌面结构，通过禁地分区的 1024px 平板层和 767px 手机层修正工具栏、奖励标签及用途编辑器。验证继续复用静态 Node 服务和 Playwright，不引入依赖或新的运行时模块。

**Tech Stack:** HTML、CSS、原生 JavaScript、Node `node:test`、Playwright、Service Worker、GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-10-mobile-tablet-pwa-1.0.37-design.md`

## Global Constraints

- 适配宽度为 320px、390px、768px、900px、1024px。
- 手机和平板主要触控目标不低于 44px。
- 不提交源工作簿、截图及主目录既有未提交资料。
- 不改变禁地奖励数据、用途语义、搜索排序或跨分区返回逻辑。
- PWA 应用显示版本和缓存版本统一为 `1.0.37`；manifest 保持当前分区说明。

---

### Task 1: 建立响应式回归测试

**Files:**
- Modify: `tests/mobile-layout.cjs`
- Modify: `tests/forging-search-stage.cjs`
- Modify: `tests/ui-performance.cjs`

**Interfaces:**
- Consumes: `createServer()`、现有分区 `data-partition`、禁地 `data-forbidden-*` 控件。
- Produces: 全分区溢出审计、禁地手机/平板布局与交互断言、统一装备族跳转后的正确测试语义。

- [x] **Step 1: 写入失败的禁地手机/平板测试**

```js
for (const width of [390, 768, 1024]) {
  test(`${width} 宽度禁地控件可触达且完整预测无页面溢出`, async () => {
    // 打开禁地，展开完整预测，检查根页面宽度、全局按钮、标签子操作与用途弹窗。
  });
}
```

- [x] **Step 2: 运行新测试并确认因 38px 子操作或平板布局失败**

Run: `$env:PLAYWRIGHT_MODULE='<bundled playwright>'; node --test tests/mobile-layout.cjs`

Expected: FAIL，失败断言指向禁地子操作触控高度或工具栏列布局，而不是加载错误。

- [x] **Step 3: 更新既有跳转测试以匹配已确认业务语义**

```js
assert.ok(await page.locator('[data-progress-card]').count() >= seededDisciples.length);
await page.locator('[data-item-action]').click();
await page.getByRole('button', { name: '前往橙装锻造分区查询' }).click();
```

- [x] **Step 4: 单独运行更新后的测试并确认不再依赖旧 DOM 数量和旧按钮**

Run: `$env:PLAYWRIGHT_MODULE='<bundled playwright>'; node --test tests/forging-search-stage.cjs tests/ui-performance.cjs`

Expected: PASS。

### Task 2: 修正禁地手机和平板布局

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `#partition-forbidden`、`.forbidden-control-row`、`.forbidden-token`、`.forbidden-purpose-dialog`。
- Produces: 1024px 平板双列控制区、767px 手机单列控制区、44px 标签子操作与无横向溢出的奖励卡片。

- [x] **Step 1: 在 1024px 响应层加入平板工具栏和触控规则**

```css
#partition-forbidden .forbidden-control-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
#partition-forbidden .forbidden-size-row { grid-column: 1 / -1; }
#partition-forbidden .forbidden-token-check,
#partition-forbidden .forbidden-token-name,
#partition-forbidden .forbidden-purpose-edit { min-height: 44px; }
```

- [x] **Step 2: 在手机响应层将用途筛选和标签改为宽松网格**

```css
#partition-forbidden .forbidden-purpose-row .segs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
#partition-forbidden .forbidden-token.is-selected { display: grid; grid-template-columns: 44px minmax(0, 1fr); }
```

- [x] **Step 3: 运行响应式测试验证修复**

Run: `$env:PLAYWRIGHT_MODULE='<bundled playwright>'; node --test tests/mobile-layout.cjs`

Expected: PASS，390px、768px、1024px 均无整页横向溢出且目标尺寸达标。

### Task 3: 完整自动化与浏览器验收

**Files:**
- Modify only if a verified defect is found: `css/style.css`, `js/forbidden-ui.js`, relevant test file

**Interfaces:**
- Consumes: 所有 Node/Python/Playwright 测试和静态站点。
- Produces: 可追溯的自动化结果与手机/平板关键页面截图。

- [x] **Step 1: 运行完整 Node 测试**

Run: `node --test`

Expected: 0 fail。

- [x] **Step 2: 运行完整 Playwright UI 套件**

Run: `$env:PLAYWRIGHT_MODULE='<bundled playwright>'; node --test tests/*.cjs`

Expected: 0 fail。

- [x] **Step 3: 运行 Python 数据生成测试并校准源表断言**

Run: `python -m unittest discover -s tests -v`

Expected: 67 项全部通过；章节掉落计数断言与仓库内工作簿的 55 条记录一致，不修改工作簿或应用数据。

- [x] **Step 4: 使用浏览器在 390px、768px、1024px 验收禁地默认视图、完整预测、用途弹窗和批量展开**

Expected: 内容清晰、按钮可点击、弹窗可关闭、无页面级横向滚动。

### Task 4: 发布 PWA 1.0.37

**Files:**
- Modify: `service-worker.js`
- Modify: `js/pwa.js`
- Inspect: `manifest.webmanifest`
- Modify: `.github/workflows/pages.yml` only if the resource inventory is incomplete
- Modify: `serve.test.js`

**Interfaces:**
- Consumes: 通过验收的静态站点资源。
- Produces: 缓存名与界面版本一致、manifest 分区说明完整的 PWA 1.0.37。

- [x] **Step 1: 先将发布断言更新为 1.0.37 并确认失败**

```js
assert.match(serviceWorker.body, /qinshi-site-1\.0\.37/);
assert.match(pwa.body, /APP_VERSION = "1\.0\.37"/);
```

- [x] **Step 2: 将三处版本统一升级为 1.0.37**

```text
service-worker.js CACHE_NAME → 1.0.37
js/pwa.js APP_VERSION → 1.0.37
index.html pwa-version → 1.0.37
```

- [x] **Step 3: 重跑完整 Node 与 Playwright 测试**

Run: `node --test`

Run: `$env:PLAYWRIGHT_MODULE='<bundled playwright>'; node --test tests/*.cjs`

Expected: 两组均 0 fail。

- [ ] **Step 4: 提交、快进合并并推送**

```bash
git add <本轮文件>
git commit -m "chore: release pwa 1.0.37 with responsive forbidden UI"
git -C <main> merge --ff-only codex/mobile-tablet-pwa-1.0.37
git -C <main> push origin master:main
```

- [ ] **Step 5: 检查线上 Service Worker**

Run: `Invoke-WebRequest 'https://yuanyu0505.github.io/Qinshi/service-worker.js?deploy=1.0.37'`

Expected: HTTP 200 且响应包含 `1.0.37`。
