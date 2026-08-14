# Default Orange Drop Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“关卡掉落”未搜索状态展示固定的 10 项橙色道具普通关卡表，并在用户搜索时恢复现有普通/英雄/声望完整查询。

**Architecture:** 默认表直接作为静态 HTML 写入 `index.html`，不读取或修改掉落数据生成链；`js/app.js` 只根据规范化搜索词切换默认表与现有搜索结果。样式限制在关卡掉落分区内，并通过 PWA `1.0.8` 触发已安装设备刷新 HTML、CSS 与 JS。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node `node:test`、Service Worker/PWA

## Global Constraints

- 固定表仅含“道具名称”“普通关卡”两列，不增加英雄关卡或声望奖励列。
- 固定顺序为：白羽绸衣、天问、醉梦、巨阙、纵横战袍、秋骊、苍云甲、墨眉、月华战袍、管事。
- 未输入关键词时只显示固定表；输入任意非空关键词时隐藏固定表，并继续使用既有 `DROPS.groupDrops(DROP_DATA, query)` 展示普通关卡、英雄关卡和声望奖励。
- 清空搜索框后立即恢复固定表并清空搜索结果。
- 固定表是静态页面内容；不得修改 `tools/build_drops.py`、`data/drops.js` 或 `js/drops.js`。
- 道具名称复用 `.mat.material-token.mat-orange`，保持橙色填充、2px 橙色外框和白色字体。
- 新增 CSS 必须限定在 `#partition-drops`，电脑、Android、iPhone 和 iPad 行为一致且页面不得横向溢出。
- PWA 缓存与页面显示版本同步提升到 `1.0.8`。
- 项目测试、lint、格式检查和手动验收由用户执行；实施代理只编写测试和列出命令，不主动运行验证命令。

## File Map

**Modify:**

- `index.html`：在搜索面板下新增固定橙装两列表格。
- `js/app.js`：登记 `#drop-default-orange`，在 `applyDrops()` 中切换默认表与搜索结果。
- `css/style.css`：提供分区内固定表和移动端布局。
- `serve.test.js`：记录静态表、搜索切换源码契约和 PWA 版本契约。
- `service-worker.js`：缓存版本提升到 `1.0.8`。
- `js/pwa.js`：页面显示版本提升到 `1.0.8`。
- `HANDOVER.md`：更新当前 PWA 版本与关卡掉落默认表维护说明。

**No change:**

- `tools/build_drops.py`
- `data/drops.js`
- `js/drops.js`

---

### Task 1: 新增固定橙装表并切换搜索状态

**Files:**

- Modify: `serve.test.js`
- Modify: `index.html:250-259`
- Modify: `js/app.js:60-61,864-874`
- Modify: `css/style.css:407-445`

**Interfaces:**

- Consumes: 既有 `#drop-search`、`#drop-results`、`DROPS.normalize()` 与 `DROPS.groupDrops()`。
- Produces: `#drop-default-orange` 静态容器；`applyDrops()` 以 `Boolean(q)` 控制其 `hidden` 属性。
- Preserves: 非空搜索的三分区结果 HTML 和排序规则。

- [ ] **Step 1: 在 `serve.test.js` 写静态表和切换契约**

在文件末尾新增：

```javascript
test("关卡掉落首页包含固定橙装普通关卡表", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /id="drop-default-orange"/);
    assert.match(r.body, /<th[^>]*>道具名称<\/th>\s*<th[^>]*>普通关卡<\/th>/);
    const expected = [
      ["白羽绸衣", "56-7、51-7"],
      ["天问", "56-5、51-5"],
      ["醉梦", "55-7、50-7"],
      ["巨阙", "55-5、50-5"],
      ["纵横战袍", "54-7、49-7"],
      ["秋骊", "54-5、49-5"],
      ["苍云甲", "53-7、48-7"],
      ["墨眉", "53-5、48-5"],
      ["月华战袍", "52-7"],
      ["管事", "52-5"]
    ];
    expected.forEach(([item, stages]) => {
      assert.match(r.body, new RegExp(`<span class="mat material-token mat-orange">${item}<\\/span>[\\s\\S]*?${stages}`));
    });
  });
});

test("关卡掉落搜索会隐藏默认表并保留完整查询", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/js/app.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.body, /dropDefaultOrange:\s*document\.getElementById\("drop-default-orange"\)/);
    assert.match(r.body, /dropDefaultOrange\.hidden\s*=\s*Boolean\(q\)/);
    assert.match(r.body, /DROPS\.groupDrops\(DROP_DATA, q\)/);
    assert.match(r.body, /dropSectionHtml\("普通关卡"/);
    assert.match(r.body, /dropSectionHtml\("英雄关卡"/);
    assert.match(r.body, /dropSectionHtml\("声望奖励"/);
  });
});
```

- [ ] **Step 2: 记录测试应由用户执行，实施代理不运行**

建议用户后续执行：

```powershell
node --test serve.test.js
```

在实施报告中注明：功能尚未实现时新增契约预期失败；依据项目 `AGENTS.md` 未由实施代理执行 RED 命令。

- [ ] **Step 3: 在 `index.html` 增加静态两列表格**

在关卡掉落搜索面板结束标签之后、`#drop-results` 之前加入：

```html
<section id="drop-default-orange" class="panel drop-default-orange">
  <table class="drop-default-orange-table">
    <thead>
      <tr><th>道具名称</th><th>普通关卡</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="mat material-token mat-orange">白羽绸衣</span></td><td>56-7、51-7</td></tr>
      <tr><td><span class="mat material-token mat-orange">天问</span></td><td>56-5、51-5</td></tr>
      <tr><td><span class="mat material-token mat-orange">醉梦</span></td><td>55-7、50-7</td></tr>
      <tr><td><span class="mat material-token mat-orange">巨阙</span></td><td>55-5、50-5</td></tr>
      <tr><td><span class="mat material-token mat-orange">纵横战袍</span></td><td>54-7、49-7</td></tr>
      <tr><td><span class="mat material-token mat-orange">秋骊</span></td><td>54-5、49-5</td></tr>
      <tr><td><span class="mat material-token mat-orange">苍云甲</span></td><td>53-7、48-7</td></tr>
      <tr><td><span class="mat material-token mat-orange">墨眉</span></td><td>53-5、48-5</td></tr>
      <tr><td><span class="mat material-token mat-orange">月华战袍</span></td><td>52-7</td></tr>
      <tr><td><span class="mat material-token mat-orange">管事</span></td><td>52-5</td></tr>
    </tbody>
  </table>
</section>
```

- [ ] **Step 4: 在 `js/app.js` 登记容器并切换显示状态**

在 `el` 映射中紧邻 `dropSearch` 加入：

```javascript
dropDefaultOrange: document.getElementById("drop-default-orange"),
```

将 `applyDrops()` 改为：

```javascript
function applyDrops() {
  const q = DROPS.normalize(el.dropSearch.value);
  el.dropDefaultOrange.hidden = Boolean(q);
  if (!q) {
    el.dropResults.innerHTML = "";
    return;
  }
  const groups = DROPS.groupDrops(DROP_DATA, q);
  el.dropResults.innerHTML = groups.length
    ? groups.map(dropItemHtml).join("")
    : '<div class="empty"><p>未找到匹配道具</p></div>';
}
```

不得修改 `dropItemHtml()` 和 `dropSectionHtml()`，以保证搜索“白羽绸衣”时仍展示普通、英雄、声望三个分区。

- [ ] **Step 5: 在 `css/style.css` 增加局限于关卡分区的样式**

放在既有 `.drop-chip` 规则之后：

```css
#partition-drops .drop-default-orange { overflow: hidden; }
#partition-drops .drop-default-orange-table {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
  border-collapse: collapse;
}
#partition-drops .drop-default-orange-table th,
#partition-drops .drop-default-orange-table td {
  padding: 10px 12px;
  text-align: center;
  vertical-align: middle;
  border-bottom: 1px solid rgba(58, 49, 37, .55);
  overflow-wrap: anywhere;
}
#partition-drops .drop-default-orange-table th {
  color: var(--gold-dim);
  background: var(--panel);
}
#partition-drops .drop-default-orange-table th:first-child,
#partition-drops .drop-default-orange-table td:first-child { width: 42%; }
#partition-drops .drop-default-orange-table tbody tr:last-child td { border-bottom: 0; }
#partition-drops .drop-default-orange-table .material-token { white-space: normal; }
```

在现有以下移动断点块内加入：

```css
@media (max-width: 767px),
       (max-width: 932px) and (max-height: 500px) and (orientation: landscape) {
  /* 将下列规则放入该块 */
}
```

加入的规则为：

```css
#partition-drops .drop-default-orange { padding: 10px; }
#partition-drops .drop-default-orange-table th,
#partition-drops .drop-default-orange-table td { padding: 8px 5px; }
#partition-drops .drop-default-orange-table th:first-child,
#partition-drops .drop-default-orange-table td:first-child { width: 46%; }
```

- [ ] **Step 6: 记录用户验证命令和手动场景，不主动执行**

```powershell
node --test serve.test.js
```

手动验收：首次进入显示 10 行；输入“白羽绸衣”后隐藏表格并出现完整三分区搜索结果；清空后恢复；在手机宽度下无横向溢出。

- [ ] **Step 7: 提交功能任务**

```powershell
git add serve.test.js index.html js/app.js css/style.css
git commit -m "feat: show default orange drop table"
```

---

### Task 2: 更新 PWA 缓存版本与交接说明

**Files:**

- Modify: `serve.test.js`
- Modify: `service-worker.js:4`
- Modify: `js/pwa.js:4`
- Modify: `HANDOVER.md:42,131-136`

**Interfaces:**

- Consumes: Task 1 修改后的 `index.html`、`css/style.css`、`js/app.js`，这些文件已在既有 `PRECACHE_URLS` 中。
- Produces: Service Worker 缓存名 `qinshi-site-1.0.8`；页面版本 `1.0.8`；交接文档中的当前版本说明。

- [ ] **Step 1: 在 `serve.test.js` 写 PWA 版本一致性契约**

新增：

```javascript
test("PWA 缓存与页面版本同步为 1.0.8", async () => {
  await withServer(async (port) => {
    const [worker, pwa] = await Promise.all([
      get(port, "/service-worker.js"),
      get(port, "/js/pwa.js")
    ]);
    assert.strictEqual(worker.status, 200);
    assert.strictEqual(pwa.status, 200);
    assert.match(worker.body, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*"1\.0\.8"/);
    assert.match(pwa.body, /APP_VERSION\s*=\s*"1\.0\.8"/);
  });
});
```

- [ ] **Step 2: 记录测试应由用户执行，实施代理不运行**

```powershell
node --test serve.test.js
```

预期修改前版本断言失败；依据项目规则不由实施代理执行。

- [ ] **Step 3: 同步提升缓存与页面版本**

在 `service-worker.js`：

```javascript
const CACHE_NAME = CACHE_PREFIX + "1.0.8";
```

在 `js/pwa.js`：

```javascript
var APP_VERSION = "1.0.8";
```

不改 `PRECACHE_URLS`：Task 1 修改的 `index.html`、`css/style.css`、`js/app.js` 已在列表内。

- [ ] **Step 4: 更新 `HANDOVER.md`**

在关卡掉落功能说明中补充：

```markdown
- 未搜索时固定展示 10 项橙色道具的普通关卡两列表格；输入关键词后隐藏该表，并恢复普通关卡、英雄关卡、声望奖励完整查询。
```

将当前 PWA 版本说明更新为：

```markdown
- `1.0.8` 用于刷新关卡掉落默认橙装表涉及的 HTML、CSS 和应用脚本；预缓存资源列表不变。
```

- [ ] **Step 5: 列出完整用户验收命令但不执行**

```powershell
node --test serve.test.js js/drops.test.js
```

设备验收：更新提示显示 `1.0.8`；刷新后默认表出现；离线重新进入仍保留新页面和搜索切换行为。

- [ ] **Step 6: 提交 PWA 与文档任务**

```powershell
git add serve.test.js service-worker.js js/pwa.js HANDOVER.md
git commit -m "chore: refresh pwa for orange drop table"
```

---

## Final Handoff

实施完成后向用户说明：

- 固定表仅展示 10 项橙色道具的普通关卡。
- 非空搜索继续展示普通、英雄、声望三类结果。
- 清空搜索恢复默认表。
- PWA 版本已提升到 `1.0.8`。
- 未由实施代理执行测试、lint、格式检查或浏览器验收。
- 建议用户执行：

```powershell
node --test serve.test.js js/drops.test.js
```
