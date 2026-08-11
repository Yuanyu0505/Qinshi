/**
 * 本地静态服务：电脑/手机访问特殊属性装备查询页。
 * 用法：node serve.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const ROOT = __dirname;
const PORT_START = 8000;
const PORT_END = 8010;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
      return;
    }
    const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, rel);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
      return;
    }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
  });
}

function lanIPv4s() {
  const result = [];
  const ifaces = os.networkInterfaces();
  for (const key of Object.keys(ifaces)) {
    for (const info of ifaces[key] || []) {
      if (info.family === "IPv4" && !info.internal) result.push(info.address);
    }
  }
  result.sort((a, b) => score(a) - score(b));
  return result;
  function score(ip) {
    if (/^192\.168\./.test(ip)) return 0;
    if (/^10\./.test(ip)) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 3;
  }
}

function startServer(onReady) {
  const server = createServer();
  let port = PORT_START;
  const attempt = () => {
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && port < PORT_END) {
        port += 1;
        server.close();
        attempt();
      } else {
        console.error(`端口 ${port} 启动失败：${err.message}`);
        if (onReady) onReady(null);
      }
    });
    server.listen(port, () => {
      console.log("==========================================");
      console.log("  秦时 · 特殊属性装备 本地服务已启动");
      console.log(`  电脑访问：http://localhost:${port}/`);
      for (const ip of lanIPv4s()) {
        console.log(`  手机访问：http://${ip}:${port}/`);
      }
      console.log("  手机与电脑需连接同一 Wi-Fi");
      console.log("  按 Ctrl+C 停止服务");
      console.log("==========================================");
      if (process.platform === "win32") exec(`start http://localhost:${port}/`, () => {});
      if (onReady) onReady(port, server);
    });
  };
  attempt();
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createServer, lanIPv4s, startServer };
