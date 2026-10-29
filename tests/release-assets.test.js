"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

function runtimeAssets() {
  const assets = new Set();
  for (const match of read("index.html").matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (match[1].toLowerCase() === "link" && !/\brel=["']stylesheet["']/i.test(tag)) continue;
    const source = tag.match(/\b(?:src|href)=["']([^"']+)["']/i);
    if (source && !/^(?:[a-z]+:|\/\/)/i.test(source[1])) assets.add(source[1].split(/[?#]/)[0].replace(/^\.\//, ""));
  }
  // These loaders use literal .js paths; retain their real URL resolution bases.
  for (const [file, base] of [
    ["js/partition-loader.js", ""],
    ["js/calculation-runner.js", "js"],
    ["js/calculation-worker.js", "js"]
  ]) {
    for (const match of read(file).matchAll(/["']([^"'\r\n]+\.js)["']/g)) assets.add(path.posix.normalize(path.posix.join(base, match[1])));
  }
  return [...assets].sort();
}

function pageCopies() {
  // The Pages build uses explicit cp sources and recursive asset directories.
  return read(".github/workflows/pages.yml").split(/\r?\n/).filter(line => /^\s*cp\s/.test(line)).flatMap(line => {
    const parts = line.trim().split(/\s+/);
    const destination = parts.pop();
    assert.match(destination, /^_site\//, "Pages copy destinations must be inside _site");
    const directory = destination.slice("_site/".length);
    const recursive = parts.includes("-R") || parts.includes("-r");
    return parts.slice(1).filter(source => !source.startsWith("-")).map(source => ({ source, directory, recursive }));
  });
}

function isPublished(asset, copies) {
  return copies.some(({ source, directory, recursive }) => {
    if (source === asset && path.posix.join(directory, path.posix.basename(source)) === asset) return true;
    if (!recursive || !asset.startsWith(source + "/")) return false;
    return path.posix.join(directory, path.posix.basename(source), asset.slice(source.length + 1)) === asset;
  });
}

function precacheAssets() {
  const context = vm.createContext({ self: { addEventListener() {} } });
  vm.runInContext(read("service-worker.js"), context);
  return Array.from(vm.runInContext("PRECACHE_URLS", context), url => url.replace(/^\.\//, "") || "index.html");
}

test("HTML and lazy runtime dependencies resolve to existing local files", () => {
  const assets = runtimeAssets();
  assert.ok(assets.includes("js/app.js") && assets.includes("css/style.css"), "The entrypoint must expose its script and stylesheet dependencies");
  assert.ok(assets.includes("js/calculation-worker.js") && assets.includes("data/wooden-man-alley.js"), "Lazy and worker dependencies must be included");
  assert.deepEqual(assets.filter(asset => !fs.existsSync(path.join(ROOT, asset)) || !fs.statSync(path.join(ROOT, asset)).isFile()), []);
});

test("Pages publishes every HTML and lazy runtime dependency at its requested path", () => {
  const copies = pageCopies();
  assert.deepEqual(runtimeAssets().filter(asset => !isPublished(asset, copies)), [], "Runtime assets missing from the Pages artifact");
});

test("service worker precaches every HTML and lazy runtime dependency before offline use", () => {
  const cached = new Set(precacheAssets());
  assert.deepEqual(runtimeAssets().filter(asset => !cached.has(asset)), [], "Runtime assets missing from the install-time precache");
});

test("every core precache URL exists and is included in the Pages artifact", () => {
  const copies = pageCopies();
  assert.deepEqual(precacheAssets().filter(asset => !fs.existsSync(path.join(ROOT, asset)) || !isPublished(asset, copies)), []);
});
