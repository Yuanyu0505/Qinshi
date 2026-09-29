/**
 * 本地静态服务：电脑/手机访问特殊属性装备查询页。
 * 用法：node serve.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const { exec } = require("child_process");

const ROOT = __dirname;
// Keep this origin exclusive to Qin; mail automation uses 127.0.0.1:8765.
const PORT = 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

function cacheControl(rel, versioned) {
  if (rel === "service-worker.js" || rel === "version.json") return "no-store";
  if (rel === "index.html" || rel === "manifest.webmanifest") return "no-cache";
  if (versioned) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

function createServer() {
  return http.createServer((req, res) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, "http://localhost");
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
      return;
    }
    let urlPath;
    try { urlPath = decodeURIComponent(parsedUrl.pathname); }
    catch (e) {
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
      const acceptsGzip = /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
      const useGzip = acceptsGzip && COMPRESSIBLE.has(ext) && st.size >= 1024;
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": cacheControl(rel, parsedUrl.searchParams.has("v")),
        "X-Content-Type-Options": "nosniff"
      };
      if (COMPRESSIBLE.has(ext)) headers.Vary = "Accept-Encoding";
      if (useGzip) headers["Content-Encoding"] = "gzip";
      else headers["Content-Length"] = st.size;
      res.writeHead(200, headers);
      if (req.method === "HEAD") { res.end(); return; }
      const stream = fs.createReadStream(filePath);
      stream.on("error", () => { if (!res.destroyed) res.destroy(); });
      if (useGzip) stream.pipe(zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED })).pipe(res);
      else stream.pipe(res);
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
  const port = PORT;
  server.once("error", (err) => {
    console.error(`秦时专用端口 ${port} 启动失败：${err.message}`);
    console.error("不会切换端口或打开网页。请关闭重复启动的秦时服务，或检查占用该端口的程序。");
    if (onReady) onReady(null);
    else process.exitCode = 1;
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
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createServer, lanIPv4s, startServer };
