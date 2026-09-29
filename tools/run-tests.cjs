"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function filesIn(directory, suffix) {
  return fs.readdirSync(path.join(ROOT, directory))
    .filter(name => name.endsWith(suffix))
    .sort()
    .map(name => path.join(directory, name));
}

function run(files) {
  const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1"].concat(files), {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status == null ? 1 : result.status;
}

const mode = process.argv[2] || "unit";
if (mode === "unit") {
  const rootTests = ["serve.test.js", "serve-startup.test.js"].filter(file => fs.existsSync(path.join(ROOT, file)));
  process.exitCode = run(filesIn("js", ".test.js").concat(filesIn("tests", ".test.js"), rootTests));
} else if (mode === "browser") {
  const browserTests = filesIn("tests", ".cjs").filter(file => !file.endsWith("browser-test-helpers.cjs"));
  for (const file of browserTests) {
    const status = run([file]);
    if (status !== 0) { process.exitCode = status; break; }
  }
} else {
  console.error("未知测试类型：" + mode);
  process.exitCode = 2;
}
