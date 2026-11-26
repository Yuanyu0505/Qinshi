"use strict";

// Local, read-only acceptance probe. Run explicitly; do not include in npm test.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { createServer } = require("../serve.js");
const { openApp } = require("./browser-test-helpers.cjs");

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

test("地泽二十四精确推荐与资料筛选：30 次浏览器耗时及真实取消", async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--enable-precise-memory-info"] });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  t.after(() => page.close());
  await openApp(page, `http://127.0.0.1:${server.address().port}`);
  await page.locator('.tab[data-partition="formations"]').click();
  await page.locator('[data-formation-view="reference"]').click();
  await page.locator('[data-max-formation]').selectOption("地泽二十四");
  await page.locator('[data-limit-output] .formation-benefits').first().waitFor();

  const measured = await page.evaluate(async () => {
    const formation = window.FORMATIONS_DATA.items.find(item => item.name === "地泽二十四");
    const reference = window.FORMATION_MAX_REFERENCE_DATA.formations.find(item => item.name === "地泽二十四");
    const progress = window.FORMATION_LIMIT_ADAPTER.buildLimitProgress(formation, reference).progress;
    const options = window.FORMATION_RECOMMENDATION_UI.defaults();
    const longTasks=[];
    const observer=PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>entry.duration))) : null;
    if(observer)observer.observe({entryTypes:['longtask']});
    const heartbeat=[];let lastBeat=performance.now();
    const timer=setInterval(()=>{const now=performance.now();heartbeat.push(now-lastBeat);lastBeat=now;},10);
    const run = async () => {
      const start = performance.now();
      const result = await window.FORMATION_RECOMMENDATION_UI.run("performance-acceptance", formation, progress, options);
      if (result.exactScore !== "5345260" || result.tieCount !== "2") throw Error("精确结果与黄金数据不符");
      return performance.now() - start;
    };
    for (let i = 0; i < 5; i++) await run();
    const solver = [];
    for (let i = 0; i < 30; i++) solver.push(await run());

    const query = document.querySelector('#formation-max-reference [data-max-query]');
    const filter = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      query.value = i % 2 ? "" : "神";
      query.dispatchEvent(new Event("input", { bubbles: true }));
      filter.push(performance.now() - start);
    }
    query.value = "";
    query.dispatchEvent(new Event("input", { bubbles: true }));

    const pending = window.FORMATION_RECOMMENDATION_UI.run("performance-cancel", formation, progress, options);
    window.FORMATION_RECOMMENDATION_UI.cancel("performance-cancel");
    let cancellation = "resolved";
    try { await pending; } catch (error) { cancellation = error.message; }
    clearInterval(timer);
    if(observer){longTasks.push(...observer.takeRecords().map(entry=>entry.duration));observer.disconnect();}
    return { solver, filter, cancellation, longTasks, heartbeatMaxGap:Math.max(0,...heartbeat) };
  });
  assert.equal(measured.cancellation, "计算已取消");
  t.diagnostic(JSON.stringify({
    browser: "Edge headless", viewport: "1440×900", repeats: 30,
    solverP50: percentile(measured.solver, .5), solverP95: percentile(measured.solver, .95),
    filterP50: percentile(measured.filter, .5), filterP95: percentile(measured.filter, .95),
    cancellation: measured.cancellation,
    mainThreadLongTaskCount:measured.longTasks.length,
    mainThreadMaxLongTaskMs:Math.max(0,...measured.longTasks),
    mainThreadHeartbeatMaxGapMs:measured.heartbeatMaxGap
  }));

  const cdp = await page.context().newCDPSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const mobile = await page.evaluate(async () => {
    const formation = window.FORMATIONS_DATA.items.find(item => item.name === "地泽二十四");
    const reference = window.FORMATION_MAX_REFERENCE_DATA.formations.find(item => item.name === "地泽二十四");
    const progress = window.FORMATION_LIMIT_ADAPTER.buildLimitProgress(formation, reference).progress;
    const options = window.FORMATION_RECOMMENDATION_UI.defaults();
    for (let i = 0; i < 5; i++) await window.FORMATION_RECOMMENDATION_UI.run("performance-mobile", formation, progress, options);
    const solver = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      const result = await window.FORMATION_RECOMMENDATION_UI.run("performance-mobile", formation, progress, options);
      if (result.exactScore !== "5345260") throw Error("移动模拟精确结果不符");
      solver.push(performance.now() - start);
    }
    const query = document.querySelector('#formation-max-reference [data-max-query]');
    const filter = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      query.value = i % 2 ? "" : "神";
      query.dispatchEvent(new Event("input", { bubbles: true }));
      filter.push(performance.now() - start);
    }
    query.value = "";
    query.dispatchEvent(new Event("input", { bubbles: true }));
    return { solver, filter };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  t.diagnostic(JSON.stringify({
    browser: "Edge headless", viewport: "390×844", pageCpuThrottle: "4x", repeats: 30,
    note: "CDP page-target throttling does not independently certify Worker CPU speed or a physical phone",
    solverP50: percentile(mobile.solver, .5), solverP95: percentile(mobile.solver, .95),
    filterP50: percentile(mobile.filter, .5), filterP95: percentile(mobile.filter, .95)
  }));

  async function liveListeners(selector) {
    const object = await cdp.send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})` });
    if (!object.result.objectId) return null;
    const result = await cdp.send("DOMDebugger.getEventListeners", { objectId: object.result.objectId });
    return result.listeners.length;
  }
  async function sample(cycle) {
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
    const listeners = {};
    for (const selector of ["#partition-formations", "#formation-selector", "#formation-workspace", "#formation-max-reference"])
      listeners[selector] = await liveListeners(selector);
    const workerTargets = (await browserCdp.send("Target.getTargets")).targetInfos
      .filter(target => target.type === "worker" && target.url.includes("formation-worker.js")).length;
    return { cycle, heap, listeners, workerTargets };
  }
  const browserCdp = await browser.newBrowserCDPSession();
  const trend = [await sample(0)];
  for (let block = 1; block <= 5; block++) {
    const cycles = await page.evaluate(async () => {
      const formation = window.FORMATIONS_DATA.items.find(item => item.name === "地泽二十四");
      const reference = window.FORMATION_MAX_REFERENCE_DATA.formations.find(item => item.name === "地泽二十四");
      const progress = window.FORMATION_LIMIT_ADAPTER.buildLimitProgress(formation, reference).progress;
      const options = window.FORMATION_RECOMMENDATION_UI.defaults();
      for (let i = 0; i < 10; i++) {
        document.querySelector('[data-formation-view="main"]').click();
        document.querySelector('[data-formation-view="reference"]').click();
        await window.FORMATION_RECOMMENDATION_UI.run("performance-cycle", formation, progress, options);
      }
      return { settingsForms: document.querySelectorAll('[data-limit-settings] form').length,
        sourceRows: document.querySelectorAll('#formation-max-reference tbody tr').length };
    });
    assert.equal(cycles.settingsForms, 1);
    assert.equal(cycles.sourceRows, 12);
    trend.push(await sample(block * 10));
  }
  t.diagnostic(JSON.stringify({ cycles: 50, trend,
    note: "GC-normalized main-page heap, four live containers and residual formation Worker targets; completed Workers are terminated, so there is no persistent Worker heap to sample" }));
  assert.ok(trend.every(item => item.workerTargets === 0), "completed calculation left a live formation Worker");

  const zoom = await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
    const out = { viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      horizontallyOverflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    document.documentElement.style.zoom = "";
    return out;
  });
  t.diagnostic(JSON.stringify({ simulatedCssZoom: "200%", ...zoom,
    note: "CSS zoom is a probe, not physical browser zoom or assistive-technology acceptance" }));

  const screenshotDir = path.join(__dirname, "..", "test-results", "formation-weighted-acceptance");
  fs.mkdirSync(screenshotDir, { recursive: true });
  for (const width of [320, 390, 768, 820, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[data-formation-view="main"]').click();
    await page.locator('#formation-selector [data-formation-id]').first().click();
    await page.locator('[data-personal-settings] form').waitFor();
    const personalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.screenshot({ path: path.join(screenshotDir, `${width}-personal.png`), fullPage: true });
    await page.locator('[data-formation-view="reference"]').click();
    await page.locator('[data-limit-output] .formation-benefits').first().waitFor();
    const referenceOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.screenshot({ path: path.join(screenshotDir, `${width}-reference.png`), fullPage: true });
    assert.equal(personalOverflow, false, `${width}px personal page has horizontal overflow`);
    assert.equal(referenceOverflow, false, `${width}px reference page has horizontal overflow`);
  }
  t.diagnostic(`Seven viewport pairs saved in ${screenshotDir}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  const zoomBefore = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth }));
  for (let i = 0; i < 6; i++) await page.keyboard.press("Control+Equal");
  const zoomAfter = await page.evaluate(() => ({ dpr: devicePixelRatio, width: innerWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }));
  t.diagnostic(JSON.stringify({ browserZoomKeyboardProbe: { before: zoomBefore, after: zoomAfter },
    note: "Only count as real browser zoom when DPR rises and the layout viewport contracts" }));
  if (zoomAfter.dpr >= zoomBefore.dpr * 1.9 && zoomAfter.width <= zoomBefore.width * .55) {
    assert.equal(zoomAfter.overflow, false, "200% browser zoom has page horizontal overflow");
    await page.locator('[data-formation-view="main"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await page.locator('[data-formation-view="reference"]').click();
    await page.locator('[data-limit-output] .formation-benefits').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    await page.screenshot({ path: path.join(screenshotDir, "1440-browser-zoom-200.png"), fullPage: true });
  }
});
