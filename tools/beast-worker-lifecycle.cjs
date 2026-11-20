'use strict';
// Isolated localhost-only browser experiment. No account or stored input is used.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createServer } = require('../serve.js');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { specifications, buildInput } = require('./benchmark-machine-school.cjs');

async function main() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let fingerprint;
  const spec = specifications()[Number(process.env.LIFECYCLE_CASE || 1)];
  assert.ok(spec, 'LIFECYCLE_CASE must identify a standard performance scenario');
  const fixture = buildInput(spec);
  const input = { schoolId: spec.schoolId, progressByBeast: fixture.progressByBeast, options: fixture.options };
  try {
    for (const policy of ['reuse', 'disposable']) {
      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      try {
        const cdp = await browser.newBrowserCDPSession();
        const context = await browser.newContext({ serviceWorkers: 'block' });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const workerSource = fs.readFileSync(require.resolve('../js/calculation-worker.js'), 'utf8');
        const finalPost = 'self.postMessage({ id: message.id, result: result });';
        assert.ok(workerSource.includes(finalPost), 'worker result timing probe must match exactly');
        await context.route('**/js/calculation-worker.js*', route => route.fulfill({ contentType: 'application/javascript', body: workerSource.replace(finalPost, 'self.postMessage({ id: message.id, result: result, lifecycleSentAt: performance.timeOrigin + performance.now() });') }));
        const page = await context.newPage();
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.addScriptTag({ url: origin + '/data/machine-beasts.js' });
        const sourceSha256 = Object.fromEntries(['machine-beasts.js', 'machine-beast-school-planner.js', 'calculation-worker.js'].map(file => [file, createHash('sha256').update(fs.readFileSync(require.resolve('../js/' + file))).digest('hex')]));
        console.log('WORKER_ENV ' + JSON.stringify({ policy, scenario: spec.id, spec, inputSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'), sourceSha256, diagnosticSolverProbe: false, browser: browser.version(), node: process.version, platform: process.platform, rssScope: 'sum of isolated browser process working sets; not private bytes or Node RSS' }));
        const pending = new Map();
        let commandId = 0;
        cdp.on('Target.receivedMessageFromTarget', event => {
          const message = JSON.parse(event.message), callback = pending.get(message.id);
          if (callback) { pending.delete(message.id); callback(message); }
        });
        async function heap() {
          const targets = (await cdp.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker');
          let used = 0;
          for (const target of targets) {
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId });
            const id = ++commandId;
            const response = new Promise(resolve => pending.set(id, resolve));
            await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method: 'Runtime.getHeapUsage' }) });
            const message = await response;
            assert.ok(message.result, JSON.stringify(message));
            used += message.result.usedSize;
            await cdp.send('Target.detachFromTarget', { sessionId });
          }
          return { workerCount: targets.length, workerHeapUsedMiB: used / 1048576 };
        }
        async function rss() {
          if (process.platform !== 'win32') return null;
          const pids = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(item => item.id);
          return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-Process -Id ' + pids.join(',') + ' -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum).Sum'], { encoding: 'utf8', windowsHide: true }).trim()) / 1048576;
        }
        for (let iteration = 1; iteration <= 3; iteration++) {
          const record = await page.evaluate(async input => {
            if (!window.lifecycleWorker) window.lifecycleWorker = new Worker('/js/calculation-worker.js?lifecycle1147');
            const worker = window.lifecycleWorker, started = performance.now(), phases = [];
            let cloneAndQueueMs = null;
            let ticks = 0; const timer = setInterval(() => ticks++, 10);
            let timeoutReject;
            const watchdog = setTimeout(() => { worker.terminate(); window.lifecycleWorker = null; timeoutReject(Error('Exact lifecycle sample exceeded 30000ms; no result accepted')); }, 30000);
            try {
              const result = await new Promise((resolve, reject) => {
                timeoutReject = reject;
                worker.onmessage = event => {
                  if (event.data.progress) { phases.push(event.data.progress.phase); return; }
                  cloneAndQueueMs = performance.timeOrigin + performance.now() - event.data.lifecycleSentAt;
                  if (event.data.error) reject(Error(event.data.error)); else resolve(event.data.result);
                };
                worker.onerror = event => reject(Error(event.message));
                worker.postMessage({ id: 1, kind: 'beast-school', input });
              });
              const receivedMs = performance.now() - started;
              const serialized = JSON.stringify(result);
              return { valid: result.valid, target: result.target, roundTripMs: receivedMs, cloneAndQueueMs, ticks, phases, resultBytes: new TextEncoder().encode(serialized).length, serialized };
            } finally { clearInterval(timer); clearTimeout(watchdog); }
          }, input);
          assert.equal(record.valid, true, record.serialized);
          const hash = createHash('sha256').update(record.serialized).digest('hex');
          delete record.serialized;
          console.log('WORKER_RECEIVED ' + JSON.stringify({ policy, iteration, ...record }));
          if (fingerprint) assert.equal(hash, fingerprint, 'every lifecycle run preserves the full result'); else fingerprint = hash;
          const before = await heap(), rssBeforeMiB = await rss();
          if (policy === 'disposable') await page.evaluate(() => { window.lifecycleWorker.terminate(); window.lifecycleWorker = null; });
          await page.waitForTimeout(250);
          const after = await heap(), rssAfterMiB = await rss();
          await page.waitForTimeout(1750);
          const afterTwoSeconds = await heap(), rssAfterTwoSecondsMiB = await rss();
          console.log('WORKER_LIFECYCLE ' + JSON.stringify({ policy, iteration, ...record, resultSha256: hash, before, after, afterTwoSeconds, rssBeforeMiB, rssAfterMiB, rssAfterTwoSecondsMiB, peakMemory: 'not measured; CDP heap and OS working sets sampled after structured clone receipt; 2s sample is at least 2s due to OS sampling overhead' }));
        }
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
