'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Validate the assembled public artifact, not the source checkout where every file exists.
function checkStaticSite(directory) {
  const root = path.resolve(directory);
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const html = read('index.html');
  const worker = read('service-worker.js');
  const precache = worker.match(/const\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!precache) throw new Error('Cannot locate PRECACHE_URLS in the published service worker.');
  const required = new Set(['index.html', 'service-worker.js', 'version.json', 'manifest.webmanifest']);
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) required.add(match[1]);
  for (const match of precache[1].matchAll(/["']([^"']+)["']/g)) required.add(match[1]);
  const loader = read('js/partition-loader.js');
  for (const match of loader.matchAll(/["']((?:data|js)\/[^"']+\.js)["']/g)) required.add(match[1]);
  const missing = [];
  for (const resource of required) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(resource)) continue;
    const relative = decodeURIComponent(resource.split(/[?#]/, 1)[0]);
    const target = path.resolve(root, relative === './' || relative === '' ? 'index.html' : relative);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) missing.push(resource);
  }
  if (missing.length) throw new Error('Published artifact is missing required resources:\n' + missing.join('\n'));
  return required.size;
}

module.exports = { checkStaticSite };
if (require.main === module) {
  try { console.log('Static artifact resources complete: ' + checkStaticSite(process.argv[2] || '_site')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
