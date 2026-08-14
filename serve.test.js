const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createServer, lanIPv4s } = require("./serve.js");

function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, () => {
      const port = server.address().port;
      const done = () => server.close(() => resolve());
      fn(port).then(done, (err) => { server.close(() => reject(err)); });
    });
  });
}

function get(port, path, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: rawPath || path, method: "GET"
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("GET / 返回 index.html", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /text\/html/);
    assert.match(r.body, /特殊属性装备/);
  });
});

test("GET /data/special-equipment.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/special-equipment.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("不存在的文件返回 404", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/no-such-file.js");
    assert.strictEqual(r.status, 404);
  });
});

test("路径穿越返回 403", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/", "/..%2fserve.js");
    assert.strictEqual(r.status, 403);
  });
});

test("lanIPv4s 返回数组", () => {
  assert.ok(Array.isArray(lanIPv4s()));
});

test("index.html 引用数据与样式", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /<script src="data\/special-equipment\.js"><\/script>/);
    assert.match(r.body, /<link rel="stylesheet" href="css\/style\.css">/);
  });
});

test("GET /css/style.css 返回 200 且为 CSS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/css/style.css");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /text\/css/);
  });
});

test("首页提供合阵工作台及其数据、核心和界面脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-formations"/);
    assert.match(page.body, /id="formation-selector"/);
    assert.match(page.body, /id="formation-workspace"/);
    assert.match(page.body, /<script src="data\/formations\.js"><\/script>/);
    assert.match(page.body, /<script src="js\/formations\.js"><\/script>/);
    assert.match(page.body, /<script src="js\/formations-ui\.js"><\/script>/);

    for (const resource of ["/data/formations.js", "/js/formations.js", "/js/formations-ui.js"]) {
      const response = await get(port, resource);
      assert.strictEqual(response.status, 200, resource);
      assert.match(response.headers["content-type"], /javascript/, resource);
    }
  });
});

test("合阵在桌面导航和移动更多菜单中均位于兵法之后答题之前", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    const nav = page.body.match(/<nav class="tabs"[\s\S]*?<\/nav>/);
    const more = page.body.match(/<div class="mobile-more-grid">[\s\S]*?<\/div>/);
    assert.ok(nav);
    assert.ok(more);
    [nav[0], more[0]].forEach(fragment => {
      assert.ok(fragment.indexOf('data-partition="tactics"') < fragment.indexOf('data-partition="formations"'));
      assert.ok(fragment.indexOf('data-partition="formations"') < fragment.indexOf('data-partition="quiz"'));
    });
  });
});

test("合阵样式同时提供桌面矩阵和无横向滚动的移动单位置排行榜", async () => {
  await withServer(async (port) => {
    const css = await get(port, "/css/style.css");
    assert.strictEqual(css.status, 200);
    assert.match(css.body, /#partition-formations/);
    assert.match(css.body, /\.formation-desktop-matrix/);
    assert.match(css.body, /\.formation-mobile-ranking/);
    assert.match(css.body, /@media \(max-width: 1099px\)/);
    assert.match(css.body, /\.formation-desktop-matrix\s*\{\s*display:\s*none/);
    assert.match(css.body, /\.formation-mobile-ranking\s*\{\s*display:\s*block/);
  });
});

test("装备未选择分类时分别展示普通装备与各类典籍结果", async () => {
  await withServer(async (port) => {
    const app = await get(port, "/js/app.js");
    assert.strictEqual(app.status, 200);
    assert.match(app.body, /if \(state\.category === null\)/);
    assert.match(app.body, /const nonBooks = items\.filter/);
    assert.match(app.body, /初始橙色典籍/);
    assert.match(app.body, /初始紫色典籍/);
    assert.match(app.body, /神兵典籍/);
  });
});

test("典籍默认展示最高阶累计，并通过页面级气泡查看逐阶成长", async () => {
  await withServer(async (port) => {
    const [index, app, css] = await Promise.all([
      get(port, "/"),
      get(port, "/js/app.js"),
      get(port, "/css/style.css")
    ]);
    assert.strictEqual(index.status, 200);
    assert.strictEqual(app.status, 200);
    assert.strictEqual(css.status, 200);
    assert.strictEqual((index.body.match(/id="book-detail-popover"/g) || []).length, 1);
    assert.match(index.body, /id="book-detail-popover"[\s\S]*?hidden/);
    assert.match(index.body, /class="book-detail-close"[^>]*>收起</);
    assert.match(app.body, /Q\.finalBookStage\(item, tier\)/);
    assert.match(app.body, /Q\.cumulativeBookStages\(item, tier\)/);
    assert.match(app.body, /阶累计/);
    assert.doesNotMatch(app.body, /<details class="book-tier-details"/);
    assert.match(app.body, /class="book-detail-toggle"/);
    assert.match(app.body, /aria-expanded="false">进阶详情<\/button>/);
    assert.match(app.body, /activeBookDetail\.trigger\.textContent = "进阶详情"/);
    assert.match(app.body, /data-book-id=/);
    assert.match(app.body, /data-tier=/);
    assert.match(app.body, /aria-expanded="false"/);
    assert.match(app.body, /book-popover-stage-row/);
    assert.match(app.body, /tokenHtml\(stage\.tokens, "、"\)/);
    assert.match(app.body, /document\.addEventListener\("click"/);
    assert.match(app.body, /event\.key === "Escape"/);
    assert.match(app.body, /window\.addEventListener\("resize", closeBookDetailPopover\)/);
    assert.match(app.body, /window\.addEventListener\("scroll", closeBookDetailPopover, true\)/);
    assert.match(app.body, /function equipmentTableHtml\(items, tiers, title\)[\s\S]*?bookTierHtml\(item, tier\)/);
    assert.match(app.body, /function bookCardTiersHtml\(item\)[\s\S]*?bookTierHtml\(item, tier\)/);
    assert.doesNotMatch(app.body, /bookStageHtml\(item, tier, sharedStageCount\)/);
    assert.match(css.body, /#partition-equipment \.book-tier-block\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, max-content\)/);
    assert.match(css.body, /#partition-equipment \.book-tier-summary\s*\{[\s\S]*?display:\s*contents/);
    assert.match(css.body, /#partition-equipment \.book-detail-toggle\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?grid-row:\s*2[\s\S]*?justify-self:\s*start/);
    assert.match(css.body, /#partition-equipment \.book-card \.book-tier-block\s*\{[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
    assert.match(css.body, /\.book-detail-popover[\s\S]*?position:\s*fixed/);
    assert.match(css.body, /\.book-detail-popover[\s\S]*?z-index:/);
    assert.match(css.body, /\.book-popover-stage-row/);
    assert.match(css.body, /\.book-popover-stage-row\s*\{[\s\S]*?grid-template-columns:\s*46px minmax\(0, 1fr\)/);
    assert.match(css.body, /\.book-popover-stage-label\s*\{[\s\S]*?text-align:\s*right/);
  });
});

test("首页包含楼兰棋阵分区与两个玩法的图片引用", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /楼兰棋阵/);
    assert.match(r.body, /images\/楼兰\/楼兰 \(1\)\.png/);
    assert.match(r.body, /images\/棋阵\/棋阵 \(1\)\.png/);
  });
});

test("楼兰图片返回 200 且为 PNG", async () => {
  await withServer(async (port) => {
    const p = "/images/" + encodeURIComponent("楼兰") + "/" + encodeURIComponent("楼兰 (1).png");
    const r = await get(port, p);
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /image\/png/);
  });
});

test("棋阵图片返回 200 且为 PNG", async () => {
  await withServer(async (port) => {
    const p = "/images/" + encodeURIComponent("棋阵") + "/" + encodeURIComponent("棋阵 (1).png");
    const r = await get(port, p);
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /image\/png/);
  });
});

test("首页包含橙装锻造分区与数据引用", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /橙装锻造/);
    assert.match(r.body, /<script src="data\/forging\.js"><\/script>/);
    assert.match(r.body, /<script src="js\/forging\.js"><\/script>/);
  });
});

test("GET /data/forging.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/forging.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("首页包含关卡掉落分区与数据引用", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /关卡掉落/);
    assert.match(r.body, /<script src="data\/drops\.js"><\/script>/);
    assert.match(r.body, /<script src="js\/drops\.js"><\/script>/);
  });
});

test("GET /data/drops.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/drops.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("首页包含个人进度脚本引用", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /<script src="js\/progress\.js"><\/script>/);
    assert.match(r.body, /个人进度/);
  });
});

test("GET /js/progress.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/js/progress.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("首页包含图鉴分区与数据引用", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/");
    assert.match(r.body, /图鉴/);
    assert.match(r.body, /<script src="data\/atlas\.js"><\/script>/);
    assert.match(r.body, /<script src="js\/atlas\.js"><\/script>/);
  });
});

test("GET /data/atlas.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/atlas.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

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
    const section = r.body.match(/<section\b[^>]*\bid="drop-default-orange"[^>]*>([\s\S]*?)<\/section>/);
    assert.ok(section, "应找到默认橙装表容器");
    const tbody = section[1].match(/<tbody>([\s\S]*?)<\/tbody>/);
    assert.ok(tbody, "默认橙装表应包含 tbody");
    const rows = [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row], index) => {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
        .map(([, cell]) => cell.replace(/<[^>]+>/g, "").trim());
      assert.strictEqual(cells.length, 2, `第 ${index + 1} 行应恰好包含两列`);
      return cells;
    });
    assert.deepStrictEqual(rows, expected);
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

test("PWA 1.0.9 覆盖手机 1.0.6 后的功能并同步缓存与页面版本", async () => {
  const pagesWorkflow = fs.readFileSync(path.join(__dirname, ".github", "workflows", "pages.yml"), "utf8");
  assert.match(pagesWorkflow, /js\/tactics\.js/);
  assert.match(pagesWorkflow, /js\/tactics-ui\.js/);
  await withServer(async (port) => {
    const [index, worker, pwa, css] = await Promise.all([
      get(port, "/"),
      get(port, "/service-worker.js"),
      get(port, "/js/pwa.js"),
      get(port, "/css/style.css")
    ]);
    assert.strictEqual(index.status, 200);
    assert.strictEqual(worker.status, 200);
    assert.strictEqual(pwa.status, 200);
    assert.strictEqual(css.status, 200);
    assert.match(index.body, /id="pwa-version">1\.0\.9<\/strong>/);
    assert.match(worker.body, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*"1\.0\.9"/);
    assert.match(pwa.body, /APP_VERSION\s*=\s*"1\.0\.9"/);
    assert.match(worker.body, /"\.\/data\/tactics\.js"/);
    assert.match(worker.body, /"\.\/js\/tactics\.js"/);
    assert.match(worker.body, /"\.\/js\/tactics-ui\.js"/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.atlas-favorite-toggle\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
    assert.match(css.body, /#partition-tactics \.tactics-selector \.seg,[\s\S]*?#partition-equipment \.book-detail-toggle\s*\{[\s\S]*?min-height:\s*44px;/);
    assert.match(css.body, /#partition-tactics \.tactics-form-grid select,[\s\S]*?#partition-tactics \.tactics-form-grid input\s*\{[\s\S]*?font-size:\s*16px;/);
    assert.match(css.body, /#partition-equipment \.book-card \.book-tier-block\s*\{[\s\S]*?grid-template-columns:\s*64px minmax\(0, 1fr\)/);
    assert.match(css.body, /\.book-detail-popover\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 24px\)/);
    assert.match(css.body, /\.book-detail-popover-body\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 104px\)[\s\S]*?overscroll-behavior:\s*contain/);
    assert.match(css.body, /#partition-drops \.drop-default-orange-table\s*\{[\s\S]*?min-width:\s*0/);
  });
});
