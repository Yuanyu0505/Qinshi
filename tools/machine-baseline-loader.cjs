'use strict';
// Compile an internally consistent, private CommonJS graph without require.cache
// mutation. Native functions keep differential/performance runs out of VM realms.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function load(revision = null, transform = (_, source) => source) {
  const modules = new Map();
  function get(relative) {
    relative = relative.replaceAll('\\', '/');
    if (modules.has(relative)) return modules.get(relative).exports;
    const filename = path.join(root, relative);
    const source = revision ? execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'show', revision + ':' + relative], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 }) : fs.readFileSync(filename, 'utf8');
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    modules.set(relative, compiled);
    compiled.require = name => name.startsWith('.') ? get(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name))) : require(name);
    compiled._compile(transform(relative, source), filename);
    return compiled.exports;
  }
  return { core: get('js/machine-beasts.js'), equivalents: get('js/machine-beast-equivalents.js'), planner: get('js/machine-beast-school-planner.js'), data: get('data/machine-beasts.js') };
}
module.exports = { load };
