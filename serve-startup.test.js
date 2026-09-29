"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");

function launchOnce() {
  const source = `
    const opened = [];
    require('child_process').exec = (command, callback) => {
      opened.push(command);
      if (callback) callback(null);
    };
    require('./serve').startServer((port, server) => {
      const report = () => console.log('STARTUP_RESULT:' + JSON.stringify({ port, opened }));
      if (server) server.close(report);
      else report();
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", source], { cwd: __dirname, windowsHide: true });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Startup timed out: " + output)); }, 10000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", () => {
      clearTimeout(timer);
      const match = output.match(/STARTUP_RESULT:(.*)/);
      if (!match) reject(new Error(output));
      else resolve(JSON.parse(match[1]));
    });
  });
}

test("normal startup keeps the dedicated Qin port", async () => {
  const result = await launchOnce();
  assert.equal(result.port, 8000);
  if (process.platform === "win32") {
    assert.deepEqual(result.opened, ["start http://localhost:8000/"]);
  }
});

test("occupied Qin port fails without drifting or opening another website", async () => {
  const occupied = http.createServer((request, response) => response.end("unrelated-service"));
  await new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen(8000, resolve);
  });
  try {
    const result = await launchOnce();
    assert.equal(result.port, null);
    assert.deepEqual(result.opened, []);
  } finally {
    await new Promise(resolve => occupied.close(resolve));
  }
});
