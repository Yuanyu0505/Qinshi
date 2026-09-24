const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { createServer, lanIPv4s } = require("./serve.js");

function hasExplicitCloudProhibition(text, capability) {
  const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const directivePattern = /(?:禁止|不得|不允许|严禁|不可)(?:\s*(?:启用|使用|配置|创建))?|(?:允许|可以|可)(?:\s*(?:启用|使用|配置|创建))/g;
  return text.split(/[\n。；;]+/).some((sentence) => {
    const capabilityMatch = new RegExp(escaped, "i").exec(sentence);
    if (!capabilityMatch) return false;
    const directives = [...sentence.matchAll(directivePattern)];
    const isNegative = (directive) => /^(?:禁止|不得|不允许|严禁|不可)/.test(directive);
    if (directives.some((match) => !isNegative(match[0]))) return false;
    const before = sentence.slice(0, capabilityMatch.index);
    const after = sentence.slice(capabilityMatch.index + capabilityMatch[0].length);
    const beforeDirectives = [...before.matchAll(directivePattern)];
    const afterDirectives = [...after.matchAll(directivePattern)];
    const directive = beforeDirectives.at(-1)?.[0] || afterDirectives[0]?.[0] || "";
    return isNegative(directive);
  });
}

function findForbiddenCloudConfig(content) {
  const forbidden = [
    "r2_buckets", "durable_objects", "queues", "triggers", "crons",
    "usage_model", "plan", "paid", "add_ons", "addons", "billing",
    "auto_purchase", "auto_charge", "auto_upgrade", "kv_namespaces",
    "vectorize", "hyperdrive", "analytics_engine_datasets"
  ];
  return forbidden.filter((key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const assignment = new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)\\s*[:=]`, "i");
    const table = new RegExp(`\\[\\[?\\s*${escaped}(?:\\.[^\\]]+)?\\s*\\]\\]?`, "i");
    return assignment.test(content) || table.test(content);
  });
}

function runSmokeExportVerifier(sql, manifest) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qin-smoke-export-"));
  const sqlPath = path.join(tempDir, "export.sql");
  const manifestPath = path.join(tempDir, "canaries.json");
  const scriptPath = path.join(__dirname, "cloud-sync", "worker", "scripts", "check-smoke-export.mjs");
  fs.writeFileSync(sqlPath, sql, "utf8");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  const result = spawnSync(process.execPath, [scriptPath, sqlPath, manifestPath], { encoding: "utf8" });
  fs.rmSync(tempDir, { recursive: true, force: true });
  return { ...result, output: `${result.stdout || ""}${result.stderr || ""}` };
}

const SMOKE_EXPORT_SENTINEL = "-- QIN_CLOUD_SYNC_SMOKE_EXPORT_COMPLETE_V1";

function completeSmokeSql(statement = "", { wrangler = false } = {}) {
  return [
    wrangler ? "PRAGMA defer_foreign_keys=TRUE;" : "BEGIN TRANSACTION;",
    "CREATE TABLE sync_spaces (id TEXT PRIMARY KEY);",
    "CREATE TABLE devices (id TEXT PRIMARY KEY, space_id TEXT);",
    "CREATE TABLE snapshots (id TEXT PRIMARY KEY, space_id TEXT, device_id TEXT);",
    "CREATE TABLE snapshot_chunks (snapshot_id TEXT, chunk_index INTEGER, body BLOB);",
    "CREATE TABLE upload_sessions (id TEXT PRIMARY KEY, snapshot_id TEXT);",
    "CREATE TABLE auth_throttles (locator_hash TEXT PRIMARY KEY);",
    "CREATE TABLE lifecycle_idempotency (scope_hash TEXT, key_hash TEXT);",
    "CREATE INDEX idx_snapshots_device_role_time ON snapshots(device_id);",
    "CREATE UNIQUE INDEX idx_snapshots_one_latest ON snapshots(device_id);",
    "CREATE INDEX idx_upload_sessions_expiry ON upload_sessions(snapshot_id);",
    "CREATE INDEX idx_lifecycle_idempotency_expiry ON lifecycle_idempotency(scope_hash);",
    "CREATE UNIQUE INDEX idx_upload_sessions_snapshot ON upload_sessions(snapshot_id);",
    "CREATE INDEX idx_snapshots_device_history ON snapshots(device_id);",
    "INSERT INTO sync_spaces VALUES ('space');",
    "INSERT INTO devices VALUES ('device', 'space');",
    "INSERT INTO snapshots VALUES ('snapshot', 'space', 'device');",
    "INSERT INTO snapshot_chunks VALUES ('snapshot', 0, X'018FA4D2C197BEE0');",
    statement,
    wrangler ? "" : "COMMIT;",
    SMOKE_EXPORT_SENTINEL,
    ""
  ].filter((line) => line !== "").join("\n");
}

function paddedBase64Url(value) {
  const encoded = Buffer.from(value).toString("base64url");
  return encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
}

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
    assert.match(r.body, /<h1 id="page-title">图鉴<\/h1>/);
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
    assert.match(r.body, /<script src="data\/special-equipment\.js\?v=1\.0\.43"><\/script>/);
    assert.match(r.body, /<script src="data\/2026-09-content-update\.js\?v=1\.0\.43"><\/script>/);
    assert.match(r.body, /<link rel="stylesheet" href="css\/style\.css\?v=1\.0\.43">/);
  });
});

test("首页提供禁地用途编辑与机关兽统一返回入口", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.match(page.body, /id="forbidden-purpose-filter"/);
    assert.match(page.body, /id="forbidden-expand-all"/);
    assert.match(page.body, /id="forbidden-purpose-editor"/);
    assert.match(page.body, /id="forbidden-purpose-family-label">全部同装备系列</);
    assert.match(page.body, /data-forbidden-purpose="machine-lineup">上阵\/流派</);
    assert.match(page.body, /data-forbidden-purpose="machine-modification">改造</);
    assert.match(page.body, /data-item-navigation-return="machine-beasts"/);
  });
});

test("首页提供逐鹿分区及数据、核心和界面脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-zhulu"/);
    assert.match(page.body, /data-partition="zhulu">逐鹿</);
    assert.match(page.body, /data-item-navigation-return="zhulu"/);
    assert.match(page.body, /<script src="data\/zhulu\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/zhulu\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/zhulu-ui\.js\?v=1\.0\.43"><\/script>/);

    for (const resource of ["/data/zhulu.js", "/js/zhulu.js", "/js/zhulu-ui.js"]) {
      const response = await get(port, resource);
      assert.strictEqual(response.status, 200, resource);
      assert.match(response.headers["content-type"], /javascript/, resource);
    }
  });
});

test("PWA 1.0.43 离线缓存包含逐鹿、统一导航和禁地资源", () => {
  const worker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  const pwa = fs.readFileSync(path.join(__dirname, "js", "pwa.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8"));
  assert.match(worker, /CACHE_NAME = CACHE_PREFIX \+ "1\.0\.43"/);
  assert.match(worker, /\.\/data\/zhulu\.js/);
  assert.match(worker, /\.\/data\/2026-09-content-update\.js/);
  assert.match(worker, /\.\/js\/account-edit-lease\.js/);
  assert.match(worker, /\.\/js\/account-profiles\.js/);
  assert.match(worker, /\.\/js\/account-profiles-ui\.js/);
  assert.match(worker, /\.\/js\/zhulu\.js/);
  assert.match(worker, /\.\/js\/zhulu-ui\.js/);
  assert.match(worker, /\.\/js\/item-navigation\.js/);
  assert.match(pwa, /APP_VERSION = "1\.0\.43"/);
  assert.match(worker, /pathname\.endsWith\("\/version\.json"\)[\s\S]*?cache:\s*"no-store"/);
  assert.match(worker, /cachedPage \|\| fetch\(request, \{ cache: "reload" \}\)/);
  assert.doesNotMatch(worker.match(/const PRECACHE_URLS = \[[\s\S]*?\n\];/)[0], /version\.json/);
  assert.match(manifest.description, /逐鹿/);
});

test("多账号档案提供全局切换、初始化、设置管理和正确脚本顺序", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /id="account-switcher"/);
  assert.match(html, /id="account-init-overlay"/);
  assert.match(html, /id="account-manager"/);
  assert.match(html, /id="account-readonly-banner"/);
  assert.ok(html.indexOf("js/account-edit-lease.js") < html.indexOf("js/account-profiles.js"));
  assert.ok(html.indexOf("js/account-profiles.js") < html.indexOf("js/inscription.js"));
  assert.ok(html.indexOf("js/settings.js") < html.indexOf("js/account-profiles-ui.js"));
  assert.match(css, /@media \(max-width:767px\)[\s\S]*?\.account-manager-list,[\s\S]*?grid-template-columns:1fr/);
  assert.match(css, /\.account-switcher-toggle\{[^}]*min-height:44px/);
});

test("设置页按账号、同步、备份和应用划分为四个独立子分区", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  const settings = fs.readFileSync(path.join(__dirname, "js", "settings.js"), "utf8");
  for (const section of ["accounts", "sync", "backup", "app"]) {
    assert.match(html, new RegExp(`data-settings-section="${section}"`));
    assert.match(html, new RegExp(`data-settings-section-panel="${section}"`));
  }
  assert.match(html, /data-settings-section="accounts"[^>]*aria-selected="true"/);
  assert.match(html, /data-settings-section-panel="sync"[^>]*hidden/);
  assert.match(html, /data-settings-section-panel="backup"[^>]*hidden/);
  assert.match(html, /data-settings-section-panel="app"[^>]*hidden/);
  assert.match(settings, /initSettingsNavigation/);
  assert.match(settings, /data-settings-section-panel/);
  assert.match(css, /\.settings-section-nav/);
  assert.match(css, /@media \(max-width:767px\)[\s\S]*?\.settings-section-nav[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("个人数据模块不再直接读写 localStorage", () => {
  ["app.js", "battle-box-pill-pouch-ui.js", "forbidden-ui.js", "inscription.js", "formations-ui.js", "tactics-ui.js", "machine-beasts-ui.js"].forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, "js", file), "utf8");
    assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\(/, file);
  });
});

test("铭文页面统一使用遁位术语", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const inscription = fs.readFileSync(path.join(__dirname, "js", "inscription.js"), "utf8");
  assert.match(html, /全部遁位/);
  assert.match(html, /天遁/);
  assert.doesNotMatch(html, /全部盾位|天位·盾位/);
  assert.match(inscription, /遁位副属性/);
  assert.match(inscription, /normalizeDunName/);
  assert.doesNotMatch(inscription, /"天盾"|"云盾"/);
  assert.doesNotMatch(inscription, /INITIAL_COMMON_NAMES/);
});

test("GET /css/style.css 返回 200 且为 CSS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/css/style.css");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /text\/css/);
  });
});

test("云同步设置页包含完整手动流程且脚本依赖顺序正确", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const scriptIndex = (name) => html.indexOf(`js/${name}.js`);
  assert.match(html, /id="cloud-sync-panel"/);
  assert.match(html, /id="cloud-sync-unbound"/);
  assert.match(html, /id="cloud-sync-paired"[^>]*hidden/);
  assert.match(html, /id="cloud-sync-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /上传本机快照/);
  assert.match(html, /从其他设备同步/);
  assert.match(html, /手动选择一台来源设备，用它的全部工具数据覆盖当前设备；不会自动合并。/);
  assert.match(html, /工具版本由 PWA 更新；本面板只同步工具内保存的数据。同步开始前会先检查并更新工具版本。/);
  assert.ok(scriptIndex("cloud-sync-core") < scriptIndex("cloud-sync"));
  assert.ok(scriptIndex("cloud-sync-config") < scriptIndex("cloud-sync-api"));
  assert.ok(scriptIndex("settings") < scriptIndex("cloud-sync"));
  assert.ok(scriptIndex("pwa") < scriptIndex("cloud-sync"));
});

test("云同步脚本全部使用当前 PWA 版本并进入离线预缓存", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  const pagesWorkflow = fs.readFileSync(path.join(__dirname, ".github", "workflows", "pages.yml"), "utf8");
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8")).version;
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const file of ["cloud-sync-config.js", "cloud-sync-core.js", "cloud-sync-crypto.js",
    "cloud-sync-storage.js", "cloud-sync-api.js", "cloud-sync.js"]) {
    assert.match(html, new RegExp(`js/${escapeRegex(file)}\\?v=${escapeRegex(version)}`));
    assert.match(serviceWorker, new RegExp(`\\./js/${escapeRegex(file)}`));
    assert.match(pagesWorkflow, new RegExp(`js/${escapeRegex(file)}`));
  }
});

test("云同步设置页保留 JSON 备份并提供显式来源、确认、恢复密钥和安全操作", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /id="settings-export"[^>]*>导出备份/);
  assert.match(html, /id="settings-import-trigger"[^>]*>导入备份/);
  assert.match(html, /id="settings-import-file"[^>]*accept="application\/json,.json"[^>]*hidden/);
  assert.match(html, /id="cloud-sync-source-list"/);
  assert.match(html, /id="cloud-sync-confirm-check"[^>]*type="checkbox"/);
  assert.match(html, /id="cloud-sync-confirm-overwrite"[^>]*disabled[^>]*>确认覆盖当前设备/);
  assert.match(html, /id="cloud-sync-progress"[^>]*>\s*<progress/s);
  assert.match(html, /id="cloud-sync-recovery-ack"[^>]*type="checkbox"/);
  assert.match(html, /id="cloud-sync-recovery-confirm"[^>]*disabled/);
  assert.match(html, /id="cloud-sync-copy-code"[^>]*>复制同步码/);
  assert.match(html, /id="cloud-sync-copy-recovery"[^>]*>复制恢复密钥/);
  assert.match(html, /id="cloud-sync-copy-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="cloud-sync-delete-auth-password"[^>]*name="authMethod"[^>]*value="password"/);
  assert.match(html, /id="cloud-sync-delete-auth-recovery"[^>]*name="authMethod"[^>]*value="recoveryKey"/);
  assert.match(html, /id="cloud-sync-delete-confirm-layer"[^>]*hidden[\s\S]*role="dialog"[\s\S]*aria-labelledby="cloud-sync-delete-confirm-title"/);
  assert.match(html, /id="cloud-sync-delete-confirm-text"[^>]*autocomplete="off"/);
  assert.doesNotMatch(html.match(/<form id="cloud-sync-delete-form"[\s\S]*?<\/form>/)[0], /name="confirmation"/);
  for (const id of ["cloud-sync-upload", "cloud-sync-rename", "cloud-sync-revoke",
    "cloud-sync-reset-password-action", "cloud-sync-change-password", "cloud-sync-rotate-recovery", "cloud-sync-forget", "cloud-sync-delete-space"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /aria-label="显示创建同步密码"/);
  assert.match(html, /aria-label="显示加入同步密码"/);
});

test("云同步部署手册限定 Workers Free 与 D1 Free 并在免费额度耗尽时暂停", () => {
  const runbookPath = path.join(__dirname, "cloud-sync", "worker", "README.md");
  assert.ok(fs.existsSync(runbookPath), "应提供云同步 Worker 免费部署手册");
  const runbook = fs.readFileSync(runbookPath, "utf8");
  assert.match(runbook, /Workers Free/);
  assert.match(runbook, /D1 Free/);
  for (const prohibited of ["R2", "Durable Objects", "scheduled triggers", "Workers Paid", "paid add-ons", "usage-based upgrades", "auto-purchase", "auto-charge"]) {
    assert.equal(hasExplicitCloudProhibition(runbook, prohibited), true, `${prohibited} 必须处在明确禁止语义中`);
  }
  const permissive = "允许启用 R2、Workers Paid 和 auto-charge。";
  for (const prohibited of ["R2", "Workers Paid", "auto-charge"]) {
    assert.equal(hasExplicitCloudProhibition(permissive, prohibited), false, `允许文案不得通过：${prohibited}`);
  }
  const misleadingPermissive = "禁止误判：这里允许启用 R2、Workers Paid 和 auto-charge。";
  for (const prohibited of ["R2", "Workers Paid", "auto-charge"]) {
    assert.equal(hasExplicitCloudProhibition(misleadingPermissive, prohibited), false, `带有无关“禁止”的允许文案不得通过：${prohibited}`);
  }
  assert.equal(hasExplicitCloudProhibition("禁止 R2，但随后允许启用 R2。", "R2"), false, "前后冲突的允许文案不得通过");
  assert.match(runbook, /免费额度[^\n]*(?:耗尽|用尽)[^\n]*(?:暂停|停止)[^\n]*云同步/);
  assert.match(runbook, /本地功能[^\n]*JSON[^\n]*备份[^\n]*(?:继续|仍然|不受影响)/);
  assert.match(runbook, /第三方[^\n]*(?:政策|条款|额度|定价)[^\n]*(?:变化|调整)/);
  assert.match(runbook, /Free[^\n]*(?:计划|套餐)[^\n]*(?:条件|前提)/);
  assert.match(runbook, /只同步[^\n]*(?:加密的)?工具数据快照/);
  assert.match(runbook, /PWA[^\n]*(?:更新|发布)[^\n]*(?:代码|功能)/);
  assert.doesNotMatch(runbook, /(?:保证|承诺)[^\n]{0,20}(?:Cloudflare|第三方)[^\n]{0,20}(?:永久免费|永远免费)/);
});

test("云同步部署手册固定本地命令、密文检查和安全发布顺序", () => {
  const runbookPath = path.join(__dirname, "cloud-sync", "worker", "README.md");
  assert.ok(fs.existsSync(runbookPath), "应提供云同步 Worker 免费部署手册");
  const runbook = fs.readFileSync(runbookPath, "utf8");
  for (const command of [
    "cd cloud-sync/worker",
    "npm ci",
    "npx wrangler d1 migrations apply qin-cloud-sync-test --local -c wrangler.test.jsonc",
    "npm test -- --max-workers=1 --no-isolate",
    "npx wrangler dev -c wrangler.test.jsonc",
    "node scripts/check-smoke-export.mjs .wrangler/qin-cloud-sync-smoke.sql .wrangler/qin-cloud-sync-smoke-canaries.json"
  ]) assert.ok(runbook.includes(command), command);

  const orderedStages = [
    "登录、whoami 与 Free 计划检查",
    "创建 D1",
    "生成忽略的本地配置",
    "执行远端迁移",
    "部署向后兼容 Worker",
    "公网健康、CORS 与仅密文检查",
    "后续配置 PWA API URL",
    "最后提升最低写入版本"
  ];
  let previous = -1;
  for (const stage of orderedStages) {
    const current = runbook.indexOf(stage);
    assert.ok(current > previous, `安全发布顺序缺少或错序：${stage}`);
    previous = current;
  }
  for (const operation of ["health", "create", "pair", "upload", "source replacement", "keep 3 histories", "revoke", "recovery"]) {
    assert.match(runbook, new RegExp(`\\b${operation.replace(/ /g, "\\s+")}\\b`, "i"), operation);
  }
  for (const plaintext of ["device name", "qinshi_", "password", "recovery key", "device token"]) {
    assert.match(runbook, new RegExp(plaintext.replace(/ /g, "\\s+"), "i"), plaintext);
  }
  assert.match(runbook, /来源设备[^\n]*→[^\n]*当前设备/);
  assert.match(runbook, /最近[^\n]*3[^\n]*(?:份|次)[^\n]*历史/);
  assert.match(runbook, /解码[^\n]*Base64[^\n]*Base64URL[^\n]*前后缀/);
  assert.match(runbook, /空白[^\n]*错误数据库[^\n]*(?:截断|不完整)[^\n]*(?:拒绝|失败)/);
  assert.ok(runbook.includes(SMOKE_EXPORT_SENTINEL), "手册必须使用固定非秘密导出完成标记");
  const exportCommand = runbook.indexOf("npx wrangler d1 export qin-cloud-sync-test --local");
  const exitGuard = runbook.indexOf("if ($LASTEXITCODE -ne 0)", exportCommand);
  const sentinelAppend = runbook.indexOf("Add-Content", exitGuard);
  assert.ok(exportCommand >= 0 && exitGuard > exportCommand && sentinelAppend > exitGuard,
    "只有本地导出成功后才能追加完成标记");
  assert.match(runbook, /真实数据行[^\n]*sync_spaces[^\n]*devices[^\n]*snapshots[^\n]*snapshot_chunks/);
});

test("云同步导出命令失败时不会创建完成标记", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qin-smoke-export-failure-"));
  const exportPath = path.join(tempDir, "failed.sql");
  const shell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
  const script = [
    `& cmd.exe /c exit 7`,
    `if ($LASTEXITCODE -ne 0) { exit 0 }`,
    `Add-Content -LiteralPath '${exportPath.replace(/'/g, "''")}' -Value '${SMOKE_EXPORT_SENTINEL}' -Encoding utf8`,
    `exit 1`
  ].join("; ");
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout || ""}${result.stderr || ""}`);
  assert.equal(fs.existsSync(exportPath), false, "失败导出不得产生带完成标记的文件");
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("云同步烟雾导出校验器识别原文、十六进制 BLOB、Base64 和 Base64URL", () => {
  const canaries = {
    deviceName: "FAKE_SMOKE_DEVICE_NAME_c7x",
    qinshiValue: "FAKE_SMOKE_qinshi_VALUE_c7x",
    password: "FAKE_SMOKE_PASSWORD_c7x",
    recoveryKey: "FAKE_SMOKE_RECOVERY_KEY_࠾_c7x",
    deviceToken: "FAKE_SMOKE_DEVICE_TOKEN_c7x"
  };
  const cases = [
    ["device-name", canaries.deviceName, completeSmokeSql(`INSERT INTO devices VALUES ('${canaries.deviceName}', NULL);`), /raw/i],
    ["qinshi-value", canaries.qinshiValue, completeSmokeSql(`INSERT INTO snapshot_chunks VALUES ('s', 0, X'${Buffer.from(canaries.qinshiValue).toString("hex").toUpperCase()}');`), /hex-blob/i],
    ["password", canaries.password, completeSmokeSql(`INSERT INTO devices VALUES ('${Buffer.from(canaries.password).toString("base64")}', NULL);`), /base64/i],
    ["recovery-key", canaries.recoveryKey, completeSmokeSql(`INSERT INTO devices VALUES ('${paddedBase64Url(canaries.recoveryKey)}', NULL);`), /base64url/i],
    ["device-token", canaries.deviceToken, completeSmokeSql(`INSERT INTO snapshot_chunks VALUES ('s', 0, x'${Buffer.from(Buffer.from(canaries.deviceToken).toString("base64")).toString("hex")}');`), /hex-blob[^\n]*base64|base64[^\n]*hex-blob/i]
  ];
  for (const [label, secret, sql, location] of cases) {
    const result = runSmokeExportVerifier(sql, canaries);
    assert.notEqual(result.status, 0, `${label} 编码泄漏必须失败`);
    assert.match(result.output, new RegExp(label, "i"), `${label} 应使用安全分类报告`);
    assert.match(result.output, location, `${label} 应报告编码位置类型`);
    assert.doesNotMatch(result.output, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "不得打印 canary 值");
  }

  const embeddedBase64 = Buffer.from(canaries.password).toString("base64");
  const embedded = runSmokeExportVerifier(
    completeSmokeSql(`INSERT INTO devices VALUES ('aa${embeddedBase64}zz', NULL);`),
    canaries
  );
  assert.notEqual(embedded.status, 0, "与其他 Base64 字符相邻时也不得漏检");
  assert.match(embedded.output, /password[^\n]*base64/i);
  assert.doesNotMatch(embedded.output, new RegExp(canaries.password));

  const clean = runSmokeExportVerifier(
    completeSmokeSql("INSERT INTO snapshot_chunks VALUES ('s', 0, X'018FA4D2C197BEE0');"),
    canaries
  );
  assert.equal(clean.status, 0, clean.output);
  assert.match(clean.output, /未发现已知明文 canary/);
  for (const secret of Object.values(canaries)) assert.doesNotMatch(clean.output, new RegExp(secret));
});

test("云同步烟雾导出校验器解码带前后缀的 Base64 与 Base64URL 候选", () => {
  const canaries = {
    deviceName: "FAKE_SMOKE_DEVICE_NAME_align",
    qinshiValue: "FAKE_SMOKE_qinshi_VALUE_align",
    password: "FAKE_SMOKE_PASSWORD_align",
    recoveryKey: "FAKE_SMOKE_RECOVERY_KEY_align",
    deviceToken: "FAKE_SMOKE_DEVICE_TOKEN_align"
  };
  const canaryBytes = Buffer.from(canaries.qinshiValue);
  for (let prefixLength = 0; prefixLength < 3; prefixLength += 1) {
    const prefix = Buffer.alloc(prefixLength, 0xfb);
    let suffix = Buffer.from([0xff]);
    if ((prefix.length + canaryBytes.length + suffix.length) % 3 === 0) suffix = Buffer.from([0xff, 0xfe]);
    const payload = Buffer.concat([prefix, canaryBytes, suffix]);
    const variants = [
      ["base64", payload.toString("base64")],
      ["base64-unpadded", payload.toString("base64").replace(/=+$/, "")],
      ["base64url", payload.toString("base64url")],
      ["base64url-padded", paddedBase64Url(payload)]
    ];
    for (const [kind, encoded] of variants) {
      const raw = runSmokeExportVerifier(completeSmokeSql(`INSERT INTO devices VALUES ('${encoded}', NULL);`), canaries);
      assert.notEqual(raw.status, 0, `${kind} 前缀偏移 ${prefixLength} 的候选必须解码检查`);
      assert.match(raw.output, /qinshi-value[^\n]*base64/i);
      assert.doesNotMatch(raw.output, new RegExp(canaries.qinshiValue));

      const blob = runSmokeExportVerifier(
        completeSmokeSql(`INSERT INTO snapshot_chunks VALUES ('s', 0, X'${Buffer.from(encoded).toString("hex")}');`),
        canaries
      );
      assert.notEqual(blob.status, 0, `${kind} 前缀偏移 ${prefixLength} 的十六进制 BLOB 候选必须解码检查`);
      assert.match(blob.output, /qinshi-value[^\n]*hex-blob\/base64/i);
      assert.doesNotMatch(blob.output, new RegExp(canaries.qinshiValue));
    }
  }
});

test("云同步烟雾导出校验器拒绝错误、空白和不完整导出", () => {
  const canaries = {
    deviceName: "FAKE_EXPORT_DEVICE", qinshiValue: "FAKE_EXPORT_VALUE", password: "FAKE_EXPORT_PASSWORD",
    recoveryKey: "FAKE_EXPORT_RECOVERY", deviceToken: "FAKE_EXPORT_TOKEN"
  };
  const invalidExports = [
    ["空文件", ""],
    ["空白文件", "  \r\n\t"],
    ["无关 SQL", `BEGIN TRANSACTION; SELECT 1; COMMIT;\n${SMOKE_EXPORT_SENTINEL}`],
    ["错误数据库", `BEGIN TRANSACTION; CREATE TABLE unrelated (id TEXT); COMMIT;\n${SMOKE_EXPORT_SENTINEL}`],
    ["缺少 COMMIT", completeSmokeSql().replace(`COMMIT;\n${SMOKE_EXPORT_SENTINEL}`, SMOKE_EXPORT_SENTINEL)],
    ["截断语句", completeSmokeSql().replace(`COMMIT;\n${SMOKE_EXPORT_SENTINEL}`, `INSERT INTO devices VALUES ('cut\n${SMOKE_EXPORT_SENTINEL}`)],
    ["未闭合十六进制 BLOB", completeSmokeSql().replace(`COMMIT;\n${SMOKE_EXPORT_SENTINEL}`, `INSERT INTO snapshot_chunks VALUES ('s', 0, X'AB\n${SMOKE_EXPORT_SENTINEL}`)],
    ["伪 Wrangler 导出", `PRAGMA defer_foreign_keys=TRUE; CREATE TABLE unrelated (id TEXT);\n${SMOKE_EXPORT_SENTINEL}`],
    ["事务后仍有语句", [
      "PRAGMA defer_foreign_keys=TRUE;",
      "CREATE TABLE sync_spaces (id TEXT);",
      "CREATE TABLE devices (id TEXT);",
      "CREATE TABLE snapshot_chunks (id TEXT);",
      "BEGIN TRANSACTION;",
      "COMMIT;",
      "SELECT 1;",
      SMOKE_EXPORT_SENTINEL
    ].join("\n")]
  ];
  for (const [label, sql] of invalidExports) {
    const result = runSmokeExportVerifier(sql, canaries);
    assert.notEqual(result.status, 0, `${label} 必须失败关闭`);
    assert.match(result.output, /SQL 导出无效/);
    for (const canary of Object.values(canaries)) assert.doesNotMatch(result.output, new RegExp(canary));
  }

  const wranglerStyle = completeSmokeSql("", { wrangler: true });
  const valid = runSmokeExportVerifier(wranglerStyle, canaries);
  assert.equal(valid.status, 0, valid.output);

  const invalidUtf8 = runSmokeExportVerifier(Buffer.from([0xff, 0xfe, 0xfd]), canaries);
  assert.notEqual(invalidUtf8.status, 0, "非法 UTF-8 导出必须失败关闭");
  assert.match(invalidUtf8.output, /SQL 导出文件不是有效 UTF-8/);
  for (const canary of Object.values(canaries)) assert.doesNotMatch(invalidUtf8.output, new RegExp(canary));
});

test("云同步烟雾导出校验器要求当前完整结构、真实数据行和唯一终止标记", () => {
  const canaries = {
    deviceName: "FAKE_STRUCTURE_DEVICE", qinshiValue: "FAKE_STRUCTURE_VALUE", password: "FAKE_STRUCTURE_PASSWORD",
    recoveryKey: "FAKE_STRUCTURE_RECOVERY", deviceToken: "FAKE_STRUCTURE_TOKEN"
  };
  const valid = completeSmokeSql();
  assert.equal(runSmokeExportVerifier(valid, canaries).status, 0);
  assert.equal(runSmokeExportVerifier(`${valid}\n \t`, canaries).status, 0,
    "完成标记后的空白不改变其最后非空白行语义");

  const qualified = valid
    .replace(/^CREATE TABLE ([a-z_]+)/gmi, 'CREATE TABLE "main"."$1"')
    .replace(/^CREATE (UNIQUE )?INDEX ([a-z_]+) ON ([a-z_]+)/gmi,
      (_match, unique = "", index, table) => `CREATE ${unique}INDEX "main"."${index}" ON "main"."${table}"`)
    .replace(/^INSERT INTO ([a-z_]+)/gmi, 'INSERT INTO "main"."$1"');
  assert.equal(runSmokeExportVerifier(qualified, canaries).status, 0,
    "Wrangler 使用引号和数据库限定标识符时仍应识别完整结构与数据行");

  const invalidExports = [
    ["仅结构无烟雾数据", valid.replace(/^INSERT INTO (?:sync_spaces|devices|snapshots|snapshot_chunks).*\r?\n/gm, "")],
    ["仅三个早期表", [
      "BEGIN TRANSACTION;",
      "CREATE TABLE sync_spaces (id TEXT);",
      "CREATE TABLE devices (id TEXT);",
      "CREATE TABLE snapshot_chunks (id TEXT);",
      "INSERT INTO sync_spaces VALUES ('s');",
      "INSERT INTO devices VALUES ('d');",
      "INSERT INTO snapshot_chunks VALUES ('x');",
      "COMMIT;",
      SMOKE_EXPORT_SENTINEL
    ].join("\n")],
    ["缺 sync_spaces 数据行", valid.replace(/^INSERT INTO sync_spaces.*\r?\n/m, "")],
    ["缺 devices 数据行", valid.replace(/^INSERT INTO devices.*\r?\n/m, "")],
    ["缺 snapshots 数据行", valid.replace(/^INSERT INTO snapshots.*\r?\n/m, "")],
    ["缺 snapshot_chunks 数据行", valid.replace(/^INSERT INTO snapshot_chunks.*\r?\n/m, "")],
    ["缺晚期迁移索引", valid.replace(/^CREATE INDEX idx_snapshots_device_history.*\r?\n/m, "")],
    ["无完成标记", valid.replace(SMOKE_EXPORT_SENTINEL, "")],
    ["重复完成标记", `${valid}\n${SMOKE_EXPORT_SENTINEL}`],
    ["标记不是终止行", `${valid}\n-- trailing comment`],
    ["标记嵌入内容", valid.replace(SMOKE_EXPORT_SENTINEL, `-- prefix ${SMOKE_EXPORT_SENTINEL} suffix`)],
    ["完整语句边界截断", `${valid.slice(0, valid.indexOf("CREATE INDEX idx_snapshots_device_history"))}COMMIT;\n${SMOKE_EXPORT_SENTINEL}`]
  ];
  for (const [label, sql] of invalidExports) {
    const result = runSmokeExportVerifier(sql, canaries);
    assert.notEqual(result.status, 0, `${label} 必须失败关闭`);
    assert.match(result.output, /SQL 导出无效/);
    for (const canary of Object.values(canaries)) assert.doesNotMatch(result.output, new RegExp(canary));
  }

  const deceptiveEvidence = completeSmokeSql()
    .replace(/^CREATE TABLE lifecycle_idempotency.*\r?\n/m, "-- CREATE TABLE lifecycle_idempotency (id TEXT);\n")
    .replace(/^CREATE INDEX idx_snapshots_device_history.*\r?\n/m,
      "INSERT INTO devices VALUES ('CREATE INDEX idx_snapshots_device_history ON snapshots(device_id)', 'space');\n")
    .replace(/^INSERT INTO snapshots.*\r?\n/m,
      `INSERT INTO snapshot_chunks VALUES ('snapshot', 1, X'${Buffer.from("INSERT INTO snapshots VALUES (1)").toString("hex")}');\n`);
  const deceptive = runSmokeExportVerifier(deceptiveEvidence, canaries);
  assert.notEqual(deceptive.status, 0, "注释、字符串和 BLOB 中的伪结构或伪数据不得计入证据");
  assert.match(deceptive.output, /SQL 导出无效/);
});

test("云同步烟雾导出校验器接受项目允许的最大快照分块导出", () => {
  const canaries = {
    deviceName: "FAKE_MAX_DEVICE", qinshiValue: "FAKE_MAX_VALUE", password: "FAKE_MAX_PASSWORD",
    recoveryKey: "FAKE_MAX_RECOVERY", deviceToken: "FAKE_MAX_TOKEN"
  };
  const maxChunk = Buffer.allocUnsafe(512 * 1024);
  for (let index = 0; index < maxChunk.length; index += 1) maxChunk[index] = (index * 131 + 17) & 0xff;
  const result = runSmokeExportVerifier(
    completeSmokeSql(`INSERT INTO snapshot_chunks VALUES ('s', 0, X'${maxChunk.toString("hex")}');`),
    canaries
  );
  assert.equal(result.status, 0, result.output);
});

test("云同步烟雾导出校验器拒绝缺失参数、非法清单和畸形十六进制 BLOB", () => {
  const scriptPath = path.join(__dirname, "cloud-sync", "worker", "scripts", "check-smoke-export.mjs");
  const missing = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(`${missing.stdout}${missing.stderr}`, /用法|usage/i);

  const invalidManifest = runSmokeExportVerifier(completeSmokeSql(), { deviceName: "ONLY_ONE_FAKE_VALUE" });
  assert.notEqual(invalidManifest.status, 0);
  assert.match(invalidManifest.output, /canary 清单无效/);
  assert.doesNotMatch(invalidManifest.output, /ONLY_ONE_FAKE_VALUE/);

  const validManifest = {
    deviceName: "FAKE_A", qinshiValue: "FAKE_B", password: "FAKE_C",
    recoveryKey: "FAKE_D", deviceToken: "FAKE_E"
  };
  const malformedBlob = runSmokeExportVerifier(completeSmokeSql("INSERT INTO snapshot_chunks VALUES ('s', 0, X'ABC');"), validManifest);
  assert.notEqual(malformedBlob.status, 0);
  assert.match(malformedBlob.output, /SQL 十六进制 BLOB 无效/);

  const shortManifest = {
    deviceName: "!A", qinshiValue: "!B", password: "!C",
    recoveryKey: "!D", deviceToken: "!E"
  };
  const shortBase64 = runSmokeExportVerifier(completeSmokeSql("INSERT INTO devices VALUES ('IUM=', NULL);"), shortManifest);
  assert.notEqual(shortBase64.status, 0, "校验器接受的短 canary 也必须检测其 Base64 表示");
  assert.match(shortBase64.output, /password[^\n]*base64/i);
});

test("云同步提交的 Wrangler 配置不含额外云产品、定时触发或付费设置", () => {
  const listed = spawnSync("git", ["ls-files", "-z", "--", "cloud-sync/worker/wrangler*"], {
    cwd: __dirname,
    encoding: "utf8"
  });
  assert.equal(listed.status, 0, listed.stderr);
  const configs = listed.stdout.split("\0")
    .filter((relative) => relative && /(?:\.jsonc|\.toml)(?:\.example)?$/i.test(relative))
    .map((relative) => [relative, fs.readFileSync(path.join(__dirname, relative), "utf8")]);
  assert.ok(configs.length >= 2, "应检查生产示例和本地测试配置");
  for (const [name, content] of configs) {
    assert.deepStrictEqual(findForbiddenCloudConfig(content), [], `${name} 只能绑定 D1 Free`);
  }
});

test("云同步免费配置扫描会拒绝 JSONC、TOML 与付费设置变体", () => {
  const forbiddenFixtures = [
    ['{"r2_buckets": []}', "r2_buckets"],
    ['durable_objects = { bindings = [] }', "durable_objects"],
    ['[[queues.producers]]\nqueue = "sync"', "queues"],
    ['[triggers]\ncrons = ["0 * * * *"]', "triggers"],
    ['usage_model = "bundled"', "usage_model"],
    ['plan = "paid"', "plan"],
    ['{"auto_charge": true}', "auto_charge"]
  ];
  for (const [fixture, expected] of forbiddenFixtures) {
    assert.ok(findForbiddenCloudConfig(fixture).includes(expected), `应拒绝 ${expected}`);
  }
  assert.deepStrictEqual(findForbiddenCloudConfig('{"d1_databases": [{"binding": "DB"}], "send_metrics": false}'), []);
});

test("云同步部署配置只提交零 UUID 并忽略本地生产配置", () => {
  const example = fs.readFileSync(path.join(__dirname, "cloud-sync", "worker", "wrangler.jsonc.example"), "utf8");
  const gitignore = fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8");
  assert.match(example, /"database_id"\s*:\s*"00000000-0000-0000-0000-000000000000"/);
  assert.match(example, /intentionally non-deployable/i);
  assert.match(gitignore, /^cloud-sync\/worker\/wrangler\.local\.jsonc$/m);

  const checkedFiles = [
    "README.md",
    "cloud-sync/worker/README.md",
    "cloud-sync/worker/wrangler.jsonc.example",
    "cloud-sync/worker/wrangler.test.jsonc",
    "js/cloud-sync-config.js"
  ];
  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/ig;
  for (const relative of checkedFiles) {
    const absolute = path.join(__dirname, relative);
    assert.ok(fs.existsSync(absolute), `${relative} 应存在`);
    const uuids = (fs.readFileSync(absolute, "utf8").match(uuidPattern) || [])
      .filter((value) => value.toLowerCase() !== zeroUuid);
    assert.deepStrictEqual(uuids, [], `${relative} 不得提交真实 UUID`);
  }
});

test("云同步部署后公共配置启用 HTTPS workers.dev 端点且根说明指向免费手册", () => {
  const config = require("./js/cloud-sync-config.js");
  const rootReadme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  const endpoint = new URL(config.apiBaseUrl);
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(endpoint.protocol, "https:");
  assert.match(endpoint.hostname, /\.workers\.dev$/);
  assert.match(rootReadme, /cloud-sync\/worker\/README\.md/);
  assert.match(rootReadme, /云同步只同步[^\n]*工具数据/);
  assert.match(rootReadme, /工具代码[^\n]*PWA[^\n]*更新/);
  assert.match(rootReadme, /生产 Worker 已启用/);
  assert.doesNotMatch(rootReadme, /生产 Worker 当前尚未启用/);
});

test("首页提供合阵工作台及其数据、核心和界面脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-formations"/);
    assert.match(page.body, /id="formation-selector"/);
    assert.match(page.body, /id="formation-workspace"/);
    assert.match(page.body, /<script src="data\/formations\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/formations\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/formations-ui\.js\?v=1\.0\.43"><\/script>/);

    for (const resource of ["/data/formations.js", "/js/formations.js", "/js/formations-ui.js"]) {
      const response = await get(port, resource);
      assert.strictEqual(response.status, 200, resource);
      assert.match(response.headers["content-type"], /javascript/, resource);
    }
  });
});

test("首页提供机关兽个人进度、方案计算、资料图表及其三层脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-machine-beasts"/);
    assert.match(page.body, /data-machine-beast-mode="progress">个人进度/);
    assert.match(page.body, /data-machine-beast-mode="calculator">方案计算/);
    assert.match(page.body, /data-machine-beast-mode="reference">资料图表/);
    assert.match(page.body, /<script src="data\/machine-beasts\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/machine-beasts\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/machine-beasts-ui\.js\?v=1\.0\.43"><\/script>/);
    for (const resource of ["/data/machine-beasts.js", "/js/machine-beasts.js", "/js/machine-beast-school-planner.js", "/js/machine-beasts-ui.js"]) {
      const response = await get(port, resource);
      assert.strictEqual(response.status, 200, resource);
      assert.match(response.headers["content-type"], /javascript/, resource);
    }
  });
});

test("机关兽方案计算提供单只与目标流派阶数子页面", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "js", "machine-beasts-ui.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /data-machine-calculator-mode="single"[^>]*>单只机关兽/);
  assert.match(html, /data-machine-calculator-mode="school"[^>]*>目标流派阶数/);
  assert.match(html, /<script src="js\/machine-beast-school-planner\.js\?v=1\.0\.43"><\/script>/);
  assert.ok(html.indexOf("js/machine-beasts.js") < html.indexOf("js/machine-beast-school-planner.js"));
  assert.ok(html.indexOf("js/machine-beast-school-planner.js") < html.indexOf("js/machine-beasts-ui.js"));
  assert.match(ui, /使用已有库存/);
  assert.match(ui, /data-machine-owned-enabled/);
  assert.match(ui, /data-machine-owned-limit/);
  assert.match(ui, /自由等级方案/);
  assert.match(ui, /效果档位方案/);
  assert.match(ui, /同时满足自由等级与同等投入效果档位优化/);
  assert.match(ui, /仅0阶/);
  assert.match(ui, /0–7阶/);
  assert.match(ui, /newRankModeSelector\("single", state\.singleNewRankMode\)/);
  assert.match(ui, /newRankModeSelector\("school", draft\.newRankMode\)/);
  assert.match(css, /\.machine-owned-inventory-grid/);
  assert.match(css, /\.machine-school-calculator-grid/);
  assert.match(css, /\.machine-school-plan-summary/);
  assert.match(css, /\.machine-new-rank-mode\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(css, /\.machine-new-rank-mode label\s*\{[^}]*white-space:\s*nowrap/);
});

test("机关兽新增投入突出需求，资料图表使用纵向自适应卡片", () => {
  const ui = fs.readFileSync(path.join(__dirname, "js", "machine-beasts-ui.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");

  assert.match(ui, /emphasisClass[\s\S]*?"machine-owned-investment"[\s\S]*?"machine-investment-demand"/);
  assert.match(ui, /itemList\(result\.selected\.ownedItems,[\s\S]*?"owned"\)/);
  assert.match(ui, /itemList\(result\.selected\.newItems,[\s\S]*?true\)/);
  assert.match(ui, /machine-threshold-grid/);
  assert.match(ui, /machine-research-card-grid/);
  assert.match(ui, /machine-beast-reference-grid/);
  assert.match(ui, /machine-school-stage-grid/);
  assert.match(ui, /DATA\.schools\.map[\s\S]*?beast\.schoolId === school\.id/);
  assert.match(ui, /snapshot\.progressStage \+ "阶进度："/);
  assert.match(ui, /各阶累计觉醒等级要求：45／90／135／180／225/);
  assert.doesNotMatch(ui, /2–5阶升阶等级要求：数据待补充/);
  assert.match(css, /#partition-machine-beasts \.machine-reference-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,/);
  assert.match(css, /#partition-machine-beasts \.machine-investment-demand\s*\{[\s\S]*?color:\s*#ff4b4b;[\s\S]*?font-weight:\s*800;/);
  assert.match(css, /#partition-machine-beasts \.machine-owned-investment\s*\{[\s\S]*?color:\s*#4fd67b;[\s\S]*?font-weight:\s*800;/);
  assert.match(css, /#partition-machine-beasts \.machine-reference-pair b\s*\{[\s\S]*?white-space:\s*nowrap;/);
});

test("机关兽三个页面提供搜索、流派切换、命中高亮和移动端自适应布局", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "js", "machine-beasts-ui.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");

  assert.match(ui, /searchBar\("progress"/);
  assert.match(html, /id="machine-beast-calculator-search"/);
  assert.match(html, /id="machine-beast-progress-search"/);
  assert.match(html, /id="machine-beast-progress-content"/);
  assert.match(html, /id="machine-beast-reference-search"/);
  assert.match(html, /id="machine-beast-reference-content"/);
  assert.match(ui, /calculatorSearch\.innerHTML\s*=\s*searchBar\("calculator"/);
  assert.match(ui, /progressSearch\.innerHTML\s*=\s*searchBar\("progress"/);
  assert.match(ui, /referenceSearch\.innerHTML\s*=\s*searchBar\("reference"/);
  assert.match(ui, /compositionstart/);
  assert.match(ui, /compositionend/);
  assert.match(ui, /event\.isComposing/);
  assert.match(ui, /searchBar\("reference"/);
  assert.match(ui, /schoolSwitcher\("progress"/);
  assert.match(ui, /schoolSwitcher\("reference-beasts"/);
  assert.match(ui, /schoolSwitcher\("reference-stages"/);
  assert.match(ui, /machine-search-match/);
  assert.match(ui, /renderReference\(\)[\s\S]*?beastReference\(\)\s*\+\s*schoolReference\(\)\s*\+\s*thresholdReference\(\)\s*\+\s*researchReference\(\)/);
  assert.match(css, /#partition-machine-beasts \.machine-search-bar/);
  assert.match(css, /#partition-machine-beasts \.machine-search-match/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?#partition-machine-beasts \.machine-search-bar/);
});

test("全端导航使用确认后的十个分区顺序", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    const nav = page.body.match(/<nav class="tabs"[\s\S]*?<\/nav>/);
    assert.ok(nav);
    const order = ["atlas", "forging", "drops", "equipment", "inscription", "machine-beasts", "tactics", "formations", "loulan", "quiz"];
    let cursor = -1;
    order.forEach(partition => {
      const next = nav[0].indexOf('data-partition="' + partition + '"');
      assert.ok(next > cursor, partition);
      cursor = next;
    });
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

test("装备属性提供同大类多装备对比工作台与响应式结果", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /id="equipment-compare-panel"/);
  assert.match(html, /id="equipment-compare-toggle"/);
  assert.match(html, /id="equipment-compare-body"/);
  assert.match(html, /id="equipment-compare-result"/);
  assert.match(html, /<script src="js\/equipment-compare\.js\?v=1\.0\.43"><\/script>/);
  assert.ok(html.indexOf("js/query.js") < html.indexOf("js/equipment-compare.js"));
  assert.ok(html.indexOf("js/equipment-compare.js") < html.indexOf("js/app.js"));
  assert.match(app, /data-compare-add/);
  assert.match(app, /data-compare-remove/);
  assert.match(app, /data-compare-dimension/);
  assert.match(app, /equipment-compare-table/);
  assert.match(app, /equipment-compare-cards/);
  assert.doesNotMatch(app, /equipment-compare-table[\s\S]*?<small>\$\{escapeHtml\(row\.item\.cat\)\} · 主属性/);
  assert.match(css, /\.equipment-compare-highest/);
  assert.match(css, /\.equipment-compare-difference/);
  assert.match(css, /\.equipment-compare-action-head,[\s\S]*?\.equipment-compare-action\s*\{[^}]*width:\s*64px/);
  assert.match(css, /@media \(max-width: 1099px\)[\s\S]*?\.equipment-compare-table-wrap\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(max-width: 1099px\)[\s\S]*?\.equipment-compare-cards\s*\{\s*display:\s*grid/);
});

test("装备主属性默认隐藏并可按需展示", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /id="show-main-attribute"[^>]*type="checkbox"/);
  assert.doesNotMatch(html, /id="show-main-attribute"[^>]*checked/);
  assert.match(app, /showMain:\s*false/);
  assert.match(app, /state\.showMain\s*\?\s*'<th class="equipment-main-cell">主属性<\/th>'\s*:\s*""/);
  assert.match(app, /state\.showMain\s*\?\s*`<td class="main equipment-main-cell">/);
  assert.match(app, /state\.showMain\s*\?\s*`<div class="card-main">主属性：/);
  assert.match(css, /\.equipment-result-table \.equipment-category-cell/);
  assert.match(css, /\.book-equipment-table\.hide-main tr > \.equipment-name-cell/);
});

test("机关兽计算结果不展示冗余结果类型标题", () => {
  const ui = fs.readFileSync(path.join(__dirname, "js", "machine-beasts-ui.js"), "utf8");
  assert.doesNotMatch(ui, /<span>最优方案<\/span>/);
  assert.doesNotMatch(ui, /<span>目标流派阶数计算<\/span>/);
  assert.match(ui, />计算结果<\/b>/);
  assert.match(ui, /自由等级方案/);
  assert.match(ui, /效果档位方案/);
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
    assert.match(r.body, /<script src="data\/forging\.js\?v=1\.0\.43"><\/script>/);
    assert.match(r.body, /<script src="js\/forging\.js\?v=1\.0\.43"><\/script>/);
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
    assert.match(r.body, /<script src="data\/drops\.js\?v=1\.0\.43"><\/script>/);
    assert.match(r.body, /<script src="js\/drops\.js\?v=1\.0\.43"><\/script>/);
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
    assert.match(r.body, /<script src="js\/progress\.js\?v=1\.0\.43"><\/script>/);
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
    assert.match(r.body, /<script src="data\/atlas\.js\?v=1\.0\.43"><\/script>/);
    assert.match(r.body, /<script src="js\/atlas\.js\?v=1\.0\.43"><\/script>/);
  });
});

test("GET /data/atlas.js 返回 200 且为 JS", async () => {
  await withServer(async (port) => {
    const r = await get(port, "/data/atlas.js");
    assert.strictEqual(r.status, 200);
    assert.match(r.headers["content-type"], /javascript/);
  });
});

test("已收藏图鉴可保存魂魄和逐件装备库存，未收藏不展示编辑入口", async () => {
  await withServer(async (port) => {
    const [app, atlas, css, index] = await Promise.all([
      get(port, "/js/app.js"),
      get(port, "/js/atlas.js"),
      get(port, "/css/style.css"),
      get(port, "/")
    ]);
    assert.match(app.body, /ATLAS_INVENTORY_KEY\s*=\s*"qinshi_atlas_inventory_v1"/);
    assert.match(app.body, /favorite\s*\?\s*`<button[^`]*data-atlas-inventory-edit/);
    assert.match(app.body, /equipmentRecordKey\(stage\.key, token\.inventoryIndex\)/);
    assert.match(app.body, /库存达标/);
    assert.match(atlas.body, /function soulInventoryStatus/);
    assert.match(css.body, /\.atlas-equipment-owned/);
    assert.match(app.body, /class="atlas-head-secondary"/);
    assert.match(app.body, />编辑库存<\/button>/);
    assert.match(app.body, /class="atlas-level-label">图鉴等级/);
  });
});

test("图鉴提供紧凑库存筛选、排序和手机平板两行布局", async () => {
  await withServer(async (port) => {
    const [index, app, css] = await Promise.all([
      get(port, "/"),
      get(port, "/js/app.js"),
      get(port, "/css/style.css")
    ]);
    assert.match(index.body, /id="atlas-favorite-type"/);
    assert.match(index.body, /id="atlas-soul-filter"/);
    assert.match(index.body, /id="atlas-equipment-filter"/);
    assert.match(index.body, /id="atlas-note-filter"/);
    assert.match(index.body, /data-atlas-note-source="碎片\/禁地"/);
    assert.match(index.body, /id="atlas-sort-field"/);
    assert.match(index.body, /id="atlas-sort-direction"/);
    assert.match(index.body, /id="atlas-filter-clear"/);
    assert.match(app.body, /noteSources:\s*\[\]/);
    assert.match(app.body, /sortField:\s*"default"/);
    assert.match(app.body, /equipmentFilter:\s*"all"/);
    assert.match(css.body, /\.atlas-advanced-filters\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.atlas-advanced-filters\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  });
});

test("图鉴置顶使用独立存储、取消收藏联动取消置顶并显示红色卡片", async () => {
  await withServer(async (port) => {
    const [app, css] = await Promise.all([
      get(port, "/js/app.js"),
      get(port, "/css/style.css")
    ]);
    assert.match(app.body, /ATLAS_PINS_KEY\s*=\s*"qinshi_atlas_pins_v1"/);
    assert.match(app.body, /function loadAtlasPins/);
    assert.match(app.body, /function saveAtlasPins/);
    assert.match(app.body, /data-atlas-pin/);
    assert.match(app.body, /atlas-pin-badge/);
    assert.match(app.body, /atlasState\.pins\s*=\s*atlasState\.pins\.filter/);
    assert.match(css.body, /\.atlas-item-pinned\s*\{/);
    assert.match(css.body, /\.atlas-pin-badge\s*\{/);
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

test("兵法包含详情与综合计算子分区，并保存计算配置", async () => {
  await withServer(async (port) => {
    const [index, core, ui, css] = await Promise.all([
      get(port, "/"),
      get(port, "/js/tactics.js"),
      get(port, "/js/tactics-ui.js"),
      get(port, "/css/style.css")
    ]);
    assert.match(index.body, /data-tactics-mode="detail">兵法详情/);
    assert.match(index.body, /data-tactics-mode="cost">计算/);
    assert.match(index.body, /id="tactics-cost-mode"/);
    assert.match(ui.body, /COST_STORE_KEY\s*=\s*"qinshi_tactics_cost_calculator_v1"/);
    assert.match(ui.body, /data-cost-action="select-all"/);
    assert.match(ui.body, /data-cost-action="clear-all"/);
    assert.match(ui.body, /从个人进度重新读取/);
    assert.match(ui.body, /总价未完整/);
    assert.match(ui.body, /costResultsHtml\(\) \+ tacticControls/);
    assert.match(ui.body, /tacticControls \+ materialControls \+ costResultsHtml\(\)/);
    assert.match(ui.body, /class="tactics-cost-buying"/);
    assert.match(ui.body, /class="tactics-cost-range-row"/);
    assert.match(ui.body, /class="tactics-cost-range-name">兵法/);
    assert.match(ui.body, /<span>起点<\/span><select[\s\S]*?data-cost-side="start"/);
    assert.match(ui.body, /<span>终点<\/span><select[\s\S]*?data-cost-side="target"/);
    assert.match(ui.body, /class="tactics-cost-range-row is-spent"/);
    assert.match(core.body, /function rehearsalAdvancePlan/);
    assert.match(core.body, /mantra:shared:tong/);
    assert.match(core.body, /mantra:shared:extreme/);
    assert.match(css.body, /\.tactics-cost-tactic-grid/);
    assert.match(css.body, /\.tactics-cost-buying[\s\S]*?color:\s*#ff4b4b[\s\S]*?font-weight:\s*800/);
    assert.match(css.body, /\.tactics-cost-range-row[\s\S]*?grid-template-columns:\s*minmax\(72px, \.36fr\) minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  });
});

test("装备属性与橙装锻造接入统一多级返回界面", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /<script src="js\/item-navigation\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /data-item-navigation-return="equipment"/);
    assert.match(page.body, /data-item-navigation-return="forging"/);
    const core = await get(port, "/js/item-navigation.js");
    assert.strictEqual(core.status, 200);
    assert.match(core.headers["content-type"], /javascript/);
  });
});

test("橙装锻造结果使用统一操作菜单并保留键盘焦点样式", async () => {
  await withServer(async (port) => {
    const [page, css] = await Promise.all([
      get(port, "/"),
      get(port, "/css/style.css")
    ]);
    assert.strictEqual(page.status, 200);
    assert.strictEqual(css.status, 200);
    assert.match(page.body, /id="item-navigation-menu"/);
    assert.match(page.body, /id="item-navigation-actions"/);
    assert.match(css.body, /\.forging-equipment-link:focus-visible/);
    assert.match(css.body, /\.item-navigation-actions \.seg\s*\{[^}]*min-height:\s*44px/);
  });
});

test("锻造个人进度使用神兵名称底色、品质换算和锻数状态", async () => {
  await withServer(async (port) => {
    const [app, css] = await Promise.all([get(port, "/js/app.js"), get(port, "/css/style.css")]);
    assert.match(app.body, /buildProgressEquipmentCatalog/);
    assert.match(app.body, /normalizeProgressStore/);
    assert.match(app.body, /data-act="switch-quality"/);
    assert.match(app.body, /progress-equipment-link[^\n]*data-item-menu-source="forging"/);
    assert.doesNotMatch(app.body, /data-progress-equipment=/);
    assert.match(app.body, /progressStatus/);
    assert.match(app.body, /progress-equipment-unavailable[^\n]*暂无装备属性/);
    assert.doesNotMatch(app.body, /\$\{item\.quality\}色/);
    assert.match(css.body, /\.progress-equipment-red-gold/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.progress-equipment-link[\s\S]*?min-height:\s*44px/);
  });
});

test("橙金与红金装备名使用强金色双描边、高光和角饰", async () => {
  await withServer(async (port) => {
    const css = await get(port, "/css/style.css");
    assert.match(css.body, /\.progress-equipment-orange-gold,\s*\.progress-equipment-red-gold\s*\{[\s\S]*?border:\s*3px solid #ffd75a;[\s\S]*?outline:\s*1px solid #6b4304;[\s\S]*?box-shadow:/);
    assert.match(css.body, /\.progress-equipment-orange-gold::after,\s*\.progress-equipment-red-gold::after\s*\{[\s\S]*?transform:\s*rotate\(45deg\);/);
    assert.match(css.body, /\.progress-equipment-orange-gold\s*\{[\s\S]*?linear-gradient\(110deg/);
    assert.match(css.body, /\.progress-equipment-red-gold\s*\{[\s\S]*?linear-gradient\(110deg/);
  });
});

test("个人进度装备与装备属性共享统一返回入口", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.match(page.body, /id="prog-search-results"/);
    assert.match(page.body, /data-item-navigation-return="forging"/);
    assert.match(page.body, /data-item-navigation-return="equipment"/);
  });
});

test("锻造个人进度提供可取消保存的弟子顺序调整界面", async () => {
  await withServer(async (port) => {
    const [page, css] = await Promise.all([get(port, "/"), get(port, "/css/style.css")]);
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="prog-reorder-toggle"[^>]*aria-controls="prog-reorder-panel"/);
    assert.match(page.body, /id="prog-reorder-panel"[^>]*hidden/);
    assert.match(page.body, /id="prog-reorder-list"/);
    assert.match(page.body, /id="prog-reorder-save"/);
    assert.match(page.body, /id="prog-reorder-cancel"/);
    assert.match(css.body, /\.prog-reorder-list\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(160px, 1fr\)\)/);
    assert.match(css.body, /@media \(max-width:\s*767px\)[\s\S]*?\.prog-reorder-list\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});

test("PWA 1.0.43 发布响应式禁地、统一导航、逐鹿资料与既有完整资源", async () => {
  const pagesWorkflow = fs.readFileSync(path.join(__dirname, ".github", "workflows", "pages.yml"), "utf8");
  assert.match(pagesWorkflow, /js\/tactics\.js/);
  assert.match(pagesWorkflow, /js\/tactics-ui\.js/);
  assert.match(pagesWorkflow, /js\/formations\.js/);
  assert.match(pagesWorkflow, /js\/formations-ui\.js/);
  assert.match(pagesWorkflow, /js\/machine-beasts\.js/);
  assert.match(pagesWorkflow, /js\/machine-beast-school-planner\.js/);
  assert.match(pagesWorkflow, /js\/machine-beasts-ui\.js/);
  assert.match(pagesWorkflow, /js\/equipment-compare\.js/);
  assert.match(pagesWorkflow, /js\/equipment-forging\.js/);
  assert.match(pagesWorkflow, /js\/forbidden\.js/);
  assert.match(pagesWorkflow, /js\/forbidden-ui\.js/);
  assert.match(pagesWorkflow, /js\/battle-box-pill-pouch\.js/);
  assert.match(pagesWorkflow, /js\/battle-box-pill-pouch-ui\.js/);
  assert.match(pagesWorkflow, /js\/inscription-performance\.js/);
  assert.match(pagesWorkflow, /js\/zhulu\.js/);
  assert.match(pagesWorkflow, /js\/zhulu-ui\.js/);
  assert.match(pagesWorkflow, /js\/item-navigation\.js/);
  assert.match(pagesWorkflow, /js\/account-edit-lease\.js/);
  assert.match(pagesWorkflow, /js\/account-profiles\.js/);
  assert.match(pagesWorkflow, /js\/account-profiles-ui\.js/);
  assert.match(pagesWorkflow, /version\.json/);
  await withServer(async (port) => {
    const [index, worker, pwa, version, css, schoolPlanner, equipmentCompare, equipmentForging, accountLease, accountProfiles, accountProfilesUi, contentUpdate, forbiddenData, forbiddenCore, forbiddenUi] = await Promise.all([
      get(port, "/"),
      get(port, "/service-worker.js"),
      get(port, "/js/pwa.js"),
      get(port, "/version.json"),
      get(port, "/css/style.css"),
      get(port, "/js/machine-beast-school-planner.js"),
      get(port, "/js/equipment-compare.js"),
      get(port, "/js/equipment-forging.js"),
      get(port, "/js/account-edit-lease.js"),
      get(port, "/js/account-profiles.js"),
      get(port, "/js/account-profiles-ui.js"),
      get(port, "/data/2026-09-content-update.js"),
      get(port, "/data/forbidden.js"),
      get(port, "/js/forbidden.js"),
      get(port, "/js/forbidden-ui.js")
    ]);
    assert.strictEqual(index.status, 200);
    assert.strictEqual(worker.status, 200);
    assert.strictEqual(pwa.status, 200);
    assert.strictEqual(version.status, 200);
    assert.match(version.headers["content-type"], /application\/json/);
    assert.strictEqual(css.status, 200);
    assert.strictEqual(schoolPlanner.status, 200);
    assert.strictEqual(equipmentCompare.status, 200);
    assert.strictEqual(equipmentForging.status, 200);
    assert.strictEqual(accountLease.status, 200);
    assert.strictEqual(accountProfiles.status, 200);
    assert.strictEqual(accountProfilesUi.status, 200);
    assert.strictEqual(contentUpdate.status, 200);
    assert.strictEqual(forbiddenData.status, 200);
    assert.strictEqual(forbiddenCore.status, 200);
    assert.strictEqual(forbiddenUi.status, 200);
    assert.match(index.body, /id="pwa-version">1\.0\.43<\/strong>/);
    assert.match(worker.body, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*"1\.0\.43"/);
    assert.match(pwa.body, /APP_VERSION\s*=\s*"1\.0\.43"/);
    assert.match(index.body, /id="pwa-repair-update"/);
    assert.match(pwa.body, /addEventListener\("online", checkForUpdateSilently\)/);
    assert.equal(JSON.parse(version.body).version, "1.0.43");
    assert.match(worker.body, /"\.\/data\/tactics\.js"/);
    assert.match(worker.body, /"\.\/js\/tactics\.js"/);
    assert.match(worker.body, /"\.\/js\/tactics-ui\.js"/);
    assert.match(worker.body, /"\.\/data\/formations\.js"/);
    assert.match(worker.body, /"\.\/js\/formations\.js"/);
    assert.match(worker.body, /"\.\/js\/formations-ui\.js"/);
    assert.match(worker.body, /"\.\/data\/machine-beasts\.js"/);
    assert.match(worker.body, /"\.\/js\/machine-beasts\.js"/);
    assert.match(worker.body, /"\.\/js\/machine-beast-school-planner\.js"/);
    assert.match(worker.body, /"\.\/js\/machine-beasts-ui\.js"/);
    assert.match(worker.body, /"\.\/js\/equipment-compare\.js"/);
    assert.match(worker.body, /"\.\/js\/equipment-forging\.js"/);
    assert.match(worker.body, /"\.\/data\/forbidden\.js"/);
    assert.match(worker.body, /"\.\/js\/forbidden\.js"/);
    assert.match(worker.body, /"\.\/js\/forbidden-ui\.js"/);
    assert.match(worker.body, /"\.\/data\/battle-box-pill-pouch\.js"/);
    assert.match(worker.body, /"\.\/js\/battle-box-pill-pouch\.js"/);
    assert.match(worker.body, /"\.\/js\/battle-box-pill-pouch-ui\.js"/);
    assert.match(worker.body, /"\.\/data\/zhulu\.js"/);
    assert.match(worker.body, /"\.\/js\/zhulu\.js"/);
    assert.match(worker.body, /"\.\/js\/zhulu-ui\.js"/);
    assert.match(worker.body, /"\.\/js\/item-navigation\.js"/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.atlas-favorite-toggle\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
    assert.match(css.body, /#partition-tactics \.tactics-selector \.seg,[\s\S]*?#partition-equipment \.book-detail-toggle\s*\{[\s\S]*?min-height:\s*44px;/);
    assert.match(css.body, /#partition-tactics \.tactics-form-grid select,[\s\S]*?#partition-tactics \.tactics-form-grid input\s*\{[\s\S]*?font-size:\s*16px;/);
    assert.match(css.body, /#partition-equipment \.book-card \.book-tier-block\s*\{[\s\S]*?grid-template-columns:\s*64px minmax\(0, 1fr\)/);
    assert.match(css.body, /\.book-detail-popover\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 24px\)/);
    assert.match(css.body, /\.book-detail-popover-body\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 104px\)[\s\S]*?overscroll-behavior:\s*contain/);
    assert.match(css.body, /#partition-drops \.drop-default-orange-table\s*\{[\s\S]*?min-width:\s*0/);
    assert.match(css.body, /#partition-machine-beasts \.machine-reference-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?\.atlas-meta\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
    assert.match(css.body, /@media \(max-width: 1024px\)[\s\S]*?#partition-forbidden \.forbidden-token\s*\{[\s\S]*?min-height:\s*44px/);
    assert.match(css.body, /@media \(max-width: 767px\),[\s\S]*?#partition-forbidden \.forbidden-reward-row\.has-label\s*\{[\s\S]*?grid-template-columns:\s*38px minmax\(0, 1fr\)/);
  });
});

test("手机导航提供历史返回、滚动恢复和更多弹层焦点管理", () => {
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(app, /partitionScrollPositions/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.addEventListener\("popstate"/);
  assert.match(app, /mobileMoreRestoreTarget/);
  assert.match(app, /appShell\.inert/);
  assert.match(app, /trapMobileMoreFocus/);
  assert.match(css, /mobile short landscape navigation reset/);
  assert.match(css, /\.tabs\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?height:\s*auto;/);
});

test("图鉴和装备属性提供手机高级筛选折叠区与统一触控尺寸", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /id="equipment-advanced-toggle"/);
  assert.match(html, /id="equipment-advanced-content"/);
  assert.match(html, /id="atlas-advanced-toggle"/);
  assert.match(html, /id="atlas-advanced-content"/);
  assert.match(app, /bindMobileDisclosure/);
  assert.match(css, /mobile-filter-toggle/);
  assert.match(css, /mobile touch target normalization/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(app, /el\.progPrev\.hidden\s*=\s*total === 0/);
  assert.match(app, /mobile-result-summary/);
});

test("手机装备结果将品质改为折叠卡片", () => {
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(app, /function equipmentMobileTierHtml/);
  assert.match(app, /<details class="equipment-mobile-tier"/);
  assert.match(app, /<summary>/);
  assert.match(css, /\.equipment-mobile-tier/);
});

test("手机和平板装备卡保持品质顺序且在1024像素内默认展开红色与红金", () => {
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  assert.match(app, /Q\.TIER_ORDER\.map\(\(tier\) => equipmentMobileTierHtml\(item, tier, tokenHtml\(item\.tiers\[tier\]\), equipmentCardTierExpanded\(tier\)\)\)/);
  assert.match(app, /function equipmentCardTierExpanded\(tier\)/);
  assert.match(app, /window\.matchMedia\("\(max-width: 1024px\)"\)/);
  assert.match(app, /return !mobile \|\| tier === "红色" \|\| tier === "红金";/);
});

test("平板装备结果使用品质折叠卡片而不是横向宽表", () => {
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  const tablet = css.match(/@media \(min-width: 768px\) and \(max-width: 1024px\) \{([\s\S]*?)\n\}/);
  assert.ok(tablet, "应存在768至1024像素的平板样式");
  assert.match(tablet[1], /#partition-equipment #table-wrap\s*\{\s*display:\s*none;/);
  assert.match(tablet[1], /#partition-equipment \.cards\s*\{\s*display:\s*block;/);
});

test("兵法综合计算在手机端折叠长表单并提供悬浮计算入口", () => {
  const ui = fs.readFileSync(path.join(__dirname, "js", "tactics-ui.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(ui, /tactics-cost-config-disclosure/);
  assert.match(ui, /tactics-cost-material-disclosure/);
  assert.match(ui, /tactics-cost-floating-calculate/);
  assert.match(ui, /scrollIntoView/);
  assert.match(css, /\.tactics-cost-floating-calculate/);
});

test("锻造查询和铭文宽表保留滑动提示而锻造总览改为响应式布局", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const inscription = fs.readFileSync(path.join(__dirname, "js", "inscription.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /class="summary-table-scroll forging-summary-table-wrap"[^>]*aria-label="锻造材料总览"/);
  assert.doesNotMatch(html, /aria-label="锻造材料总览，可左右滑动"/);
  assert.match(app, /forgeScrollHintHtml/);
  assert.match(app, /aria-label="主锻造装备材料表，可左右滑动"/);
  assert.match(inscription, /mobile-scroll-hint/);
  assert.match(css, /\.mobile-scroll-region/);
});

test("铭文性能协调器先于页面逻辑加载并加入离线资源", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    const helper = await get(port, "/js/inscription-performance.js");
    const helperScript = '<script src="js/inscription-performance.js?v=1.0.43"></script>';
    const pageScript = '<script src="js/inscription.js?v=1.0.43"></script>';
    assert.strictEqual(helper.status, 200);
    assert.match(helper.headers["content-type"], /javascript/);
    assert.ok(page.body.indexOf(helperScript) >= 0, "首页应加载铭文性能协调器");
    assert.ok(page.body.indexOf(helperScript) < page.body.indexOf(pageScript), "协调器必须先于铭文页面逻辑加载");
  });
  const serviceWorker = fs.readFileSync(path.join(__dirname, "service-worker.js"), "utf8");
  assert.match(serviceWorker, /\.\/js\/inscription-performance\.js/);
});

test("铭文长列表跳过视口外绘制且星形不使用滤镜", () => {
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(css, /#ins-results\s*\{[^}]*contain:\s*layout style;/);
  assert.match(css, /#ins-results \.ins-query-card[\s\S]*?content-visibility:\s*auto;[\s\S]*?contain-intrinsic-size:\s*auto 640px;/);
  const starRule = css.match(/\.ins-rank-star\s*\{([^}]*)\}/);
  assert.ok(starRule, "应存在铭文星形样式");
  assert.match(starRule[1], /text-shadow:/);
  assert.doesNotMatch(starRule[1], /filter:/);
});

test("装备副属性筛选与进阶详情保持单行并自适应压缩", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /class="filter-row equipment-sub-filter"/);
  assert.match(css, /#partition-equipment #chips\s*\{[^}]*flex-wrap:\s*nowrap;/);
  assert.match(css, /#partition-equipment #chips \.chip\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(css, /#partition-equipment \.book-detail-toggle\s*\{[^}]*white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /#partition-equipment #chips\s*\{[^}]*overflow-x:\s*auto;/);
  assert.match(app, /equipment-chip-short/);
  assert.match(css, /\.equipment-chip-short\s*\{\s*display:\s*none;/);
});

test("锻造材料总览三端均不依赖横向滑动", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(html, /class="summary-table-scroll forging-summary-table-wrap"[^>]*aria-label="锻造材料总览"/);
  assert.doesNotMatch(html, /锻造材料总览，可左右滑动/);
  assert.match(app, /data-label="\$\{escapeHtml\(FDATA\.meta\.stageNames\[index\]\)\}"/);
  assert.match(css, /#partition-forging \.forging-summary-table-wrap\s*\{[^}]*overflow:\s*visible;/);
  assert.match(css, /#partition-forging \.summary-table\s*\{[^}]*min-width:\s*0;[^}]*table-layout:\s*fixed;/);
  assert.match(css, /#partition-forging \.forging-summary-table-wrap \.summary-table td::before/);
});

test("首页提供战匣丹囊三子分区及三层脚本", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="partition-battle-box-pill-pouch"/);
    assert.match(page.body, /data-battle-pouch-mode="progress">个人进度/);
    assert.match(page.body, /data-battle-pouch-mode="calculator">目标计算/);
    assert.match(page.body, /data-battle-pouch-mode="reference">资料图表/);
    assert.match(page.body, /<script src="data\/battle-box-pill-pouch\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/battle-box-pill-pouch\.js\?v=1\.0\.43"><\/script>/);
    assert.match(page.body, /<script src="js\/battle-box-pill-pouch-ui\.js\?v=1\.0\.43"><\/script>/);
    for (const resource of [
      "/data/battle-box-pill-pouch.js",
      "/js/battle-box-pill-pouch.js",
      "/js/battle-box-pill-pouch-ui.js"
    ]) {
      const response = await get(port, resource);
      assert.strictEqual(response.status, 200, resource);
      assert.match(response.headers["content-type"], /javascript/, resource);
    }
  });
});

test("战匣丹囊个人进度提供弟子搜索、自由新增和固定槽位", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const ui = fs.readFileSync(path.join(__dirname, "js", "battle-box-pill-pouch-ui.js"), "utf8");
  assert.match(html, /id="battle-pouch-account"/);
  assert.match(html, /id="battle-pouch-disciple-search"/);
  assert.match(html, /id="battle-pouch-progress-list"/);
  assert.match(ui, /qinshi_battle_box_pill_pouch_v1/);
  assert.match(ui, /以此名称新增/);
  assert.match(ui, /武器/);
  assert.match(ui, /防具/);
  assert.match(ui, /饰品/);
  assert.match(ui, /典籍/);
  assert.match(ui, /八个内丹槽位/);
});

test("战匣丹囊目标计算提供多弟子排序、共享库存和购买补足", () => {
  const ui = fs.readFileSync(path.join(__dirname, "js", "battle-box-pill-pouch-ui.js"), "utf8");
  assert.match(ui, /一键全部设为各自实际等级上限/);
  assert.match(ui, /上移/);
  assert.match(ui, /下移/);
  assert.match(ui, /战匣优先/);
  assert.match(ui, /丹囊优先/);
  assert.match(ui, /共享库存/);
  assert.match(ui, /购买补足/);
  assert.match(ui, /可达到/);
});

test("战匣丹囊资料区分单级与关键节点累计口径", () => {
  const ui = fs.readFileSync(path.join(__dirname, "js", "battle-box-pill-pouch-ui.js"), "utf8");
  assert.match(ui, /上一等级升至本等级所需/);
  assert.match(ui, /上一关键节点升至本关键节点的累计消耗/);
  assert.match(ui, /if \(view === "key"\) return CORE\.keyReferenceRows\(levels\)/);
  assert.match(ui, /PVP免伤/);
  assert.doesNotMatch(ui, /\["等级", "攻击", "防御", "血量", "玩家对战免伤"/);
  assert.match(ui, /data-label=/);
  assert.match(ui, /当前附近/);
  assert.match(ui, /关键节点/);
  assert.match(ui, /全部等级/);
  assert.match(ui, /槽位分级解锁规则待准确数据补充/);
  assert.match(ui, /参照弟子/);
});

test("战匣丹囊在桌面和移动导航中位于兵法与合阵之间", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "js", "app.js"), "utf8");
  const desktop = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>'));
  const mobile = html.slice(html.indexOf('class="mobile-more-grid"'), html.indexOf('</div>', html.indexOf('class="mobile-more-grid"')));
  [desktop, mobile].forEach(fragment => {
    assert.ok(fragment.indexOf('data-partition="tactics"') < fragment.indexOf('data-partition="battle-box-pill-pouch"'));
    assert.ok(fragment.indexOf('data-partition="battle-box-pill-pouch"') < fragment.indexOf('data-partition="formations"'));
  });
  assert.match(app, /"battle-box-pill-pouch": "战匣丹囊"/);
  assert.match(app, /"battle-box-pill-pouch": document\.getElementById\("partition-battle-box-pill-pouch"\)/);
});

test("战匣丹囊样式覆盖手机单列和平板双列布局", () => {
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(css, /#partition-battle-box-pill-pouch/);
  assert.match(css, /\.battle-pouch-progress-list\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.battle-pouch-editor-columns\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.battle-pouch-pill-slots\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?\.battle-pouch-progress-list/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.battle-pouch-editor/);
  assert.match(css, /#partition-battle-box-pill-pouch input\[type="number"\]::-webkit-inner-spin-button/);
});

test("战匣丹囊子页签随页面滚动且没有整体外框", () => {
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  const modes = css.match(/\.battle-pouch-modes\s*\{([\s\S]*?)\}/);
  assert.ok(modes, "应存在战匣丹囊子页签样式");
  assert.match(modes[1], /position:\s*static/);
  assert.match(modes[1], /padding:\s*0/);
  assert.match(modes[1], /background:\s*transparent/);
  assert.match(modes[1], /border:\s*0/);
  assert.doesNotMatch(modes[1], /position:\s*sticky/);
});

test("战匣丹囊资料表各列水平居中且上下对齐", () => {
  const css = fs.readFileSync(path.join(__dirname, "css", "style.css"), "utf8");
  assert.match(css, /\.battle-pouch-reference-table table\s*\{[^}]*table-layout:\s*fixed/);
  assert.match(css, /\.battle-pouch-reference-table th,\s*\n\.battle-pouch-reference-table td\s*\{[^}]*text-align:\s*center;[^}]*vertical-align:\s*middle/);
  assert.match(css, /\.battle-pouch-reference-table th:first-child,\s*\n\.battle-pouch-reference-table td:first-child\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.battle-pouch-reference-table td\s*\{[^}]*align-items:\s*center/);
});

test("典雅水墨秦风主题统一三端层级并保护既有交互", async () => {
  await withServer(async (port) => {
    const css = await get(port, "/css/style.css");
    assert.strictEqual(css.status, 200);

    const start = css.body.indexOf("Qin elegant ink final theme");
    assert.ok(start >= 0, "应提供唯一的最终典雅水墨秦风主题层");
    const theme = css.body.slice(start);

    assert.match(theme, /--qin-space-1:\s*4px/);
    assert.match(theme, /--qin-space-6:\s*24px/);
    assert.match(theme, /--qin-surface-panel:/);
    assert.match(theme, /--qin-color-cinnabar:/);
    assert.match(theme, /font-variant-numeric:\s*tabular-nums/);
    assert.match(theme, /\.panel::before,\s*\n\.panel::after\s*\{\s*display:\s*none/);
    assert.match(theme, /\.wrap::before,\s*\n\.app-content::before,\s*\n\.app-content::after\s*\{\s*display:\s*none/);
    assert.match(theme, /\.battle-pouch-modes\s*\{[^}]*position:\s*static;[^}]*border:\s*0/);
    assert.match(theme, /\.battle-pouch-progress-list\s*>\s*\.empty\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
    assert.match(theme, /@media \(min-width:\s*1025px\)/);
    assert.match(theme, /@media \(min-width:\s*768px\) and \(max-width:\s*1024px\)/);
    assert.match(theme, /@media \(max-width:\s*767px\),/);
    assert.match(theme, /min-height:\s*44px/);
    assert.match(theme, /@media \(prefers-reduced-motion:\s*reduce\)/);
  });
});

test("首页提供统一物品操作菜单和六分区返回入口", async () => {
  await withServer(async (port) => {
    const page = await get(port, "/");
    assert.strictEqual(page.status, 200);
    assert.match(page.body, /id="item-navigation-menu"/);
    for (const name of ["equipment", "forging", "drops", "atlas", "forbidden", "zhulu"]) {
      assert.match(page.body, new RegExp('data-item-navigation-return="' + name + '"'));
    }
    assert.doesNotMatch(page.body, /data-drop-action="forging-main"/);
    assert.doesNotMatch(page.body, /data-drop-action="forging-material"/);
  });
});
