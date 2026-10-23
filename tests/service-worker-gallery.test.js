const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const CURRENT_VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../version.json'), 'utf8')).version;
function worker(options = {}) {
  const handlers = {}, stores = new Map(), requests = [];
  let failGallery = true;
  const key = url => new URL(String(url.url || url),'http://local.test/').href;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    return { async match(url,settings = {}) { const target = key(url); let response = data.get(target); if (!response && settings.ignoreSearch) { const found = [...data.entries()].find(([stored]) => stored.split('?')[0] === target.split('?')[0]); response = found && found[1]; } return response && response.clone(); }, async put(url,response) { if (options.galleryPutFailure && name === 'qinshi-gallery-v1') throw Error('quota exceeded'); data.set(key(url),response.clone()); } };
  };
  const caches = { async open(name) { if (options.galleryStorageFailure && name === 'qinshi-gallery-v1') throw Error('quota exceeded'); return cache(name); }, async keys() { return [...stores.keys()]; }, async delete(name) { return stores.delete(name); }, async match(url,settings) { for (const name of stores.keys()) { const found = await cache(name).match(url,settings); if(found) return found; } } };
  const context = vm.createContext({
    caches, URL, Promise, crypto:webcrypto, AbortController,
    Request: class { constructor(url,settings = {}) { this.url = url; this.signal=settings.signal; } },
    setTimeout(fn) { queueMicrotask(fn); }, clearTimeout() {},
    fetch: async request => {
      const url = String(request.url || request); requests.push(url);
      const image = decodeURIComponent(new URL(url,'http://local.test/').pathname).slice(1);
      if (options.galleryHang && /images\/(楼兰|棋阵)/.test(image)) {
        return new Promise((_,reject) => {
          if (request.signal && request.signal.aborted) reject(Error('timeout'));
          else if (request.signal) request.signal.addEventListener('abort',() => reject(Error('timeout')),{ once:true });
        });
      }
      if ((failGallery && /images\/(楼兰|棋阵)/.test(image)) || (options.coreFailure && url === './js/app.js')) throw Error('offline');
      return new Response(image.startsWith('images/') ? (options.galleryBodies && options.galleryBodies[image] || fs.readFileSync(path.resolve(__dirname,'..',image))) : 'core');
    },
    self: { location: { origin: 'http://local.test', href:'http://local.test/service-worker.js' }, clients: { async claim() {}, async matchAll() { return []; } }, addEventListener(type,fn) { handlers[type] = fn; } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../service-worker.js'), 'utf8'), context);
  async function dispatch(type,data = {}) { const waits=[]; handlers[type]({ ...data, waitUntil(p) { waits.push(p); } }); await Promise.all(waits); }
  async function respond(url) { let response; const waits=[]; handlers.fetch({ request:{ method:'GET', url:key(url) }, respondWith(value) { response=value; },waitUntil(value) { waits.push(value); } }); const result=await response; await Promise.all(waits); return result; }
  return { dispatch, respond, stores, requests, context, key, cache, setOnline() { failGallery=false; } };
}
test('gallery failure does not block core install and later retry completes independent offline cache', async () => {
  const w = worker();
  await w.dispatch('install');
  assert.ok(w.stores.get('qinshi-site-' + CURRENT_VERSION).has(w.key('./index.html')));
  assert.equal(w.requests.filter(url => /images\/(楼兰|棋阵)/.test(url)).length, 0);
  await w.dispatch('activate');
  assert.equal(w.requests.filter(url => /images\/(楼兰|棋阵)/.test(url)).length, 0);
  await w.dispatch('message', { data: { type: 'PRECACHE_GALLERY' } });
  assert.equal(vm.runInContext('galleryState.status', w.context), 'partial');
  w.setOnline();
  await w.dispatch('message', { data: { type: 'PRECACHE_GALLERY' } });
  assert.equal(vm.runInContext('galleryState.status', w.context), 'ready');
  assert.equal(w.stores.get('qinshi-gallery-v1').size,16);
});
test('upgrade migrates cached old gallery before deleting old core and retains stable gallery', async () => {
  const w = worker();
  const oldGallery = new Map();
  oldGallery.set(w.key('./images/楼兰/楼兰 (1).png'),new Response(fs.readFileSync(path.resolve(__dirname,'../images/楼兰/楼兰 (1).png'))));
  w.stores.set('qinshi-site-1.0.56', oldGallery);
  w.stores.set('qinshi-gallery-v1',new Map());
  await w.dispatch('install');
  await w.dispatch('activate');
  assert.ok(!w.stores.has('qinshi-site-1.0.56'));
  assert.ok(await w.cache('qinshi-gallery-v1').match('./images/楼兰/楼兰 (1).png',{ ignoreSearch:true }));
});
test('gallery storage failure cannot prevent core activation or discard the previous offline gallery', async () => {
  const w = worker({ galleryStorageFailure:true });
  w.stores.set('qinshi-site-1.0.56',new Map([[w.key('./images/楼兰/楼兰 (1).png'),new Response('image')]]));
  await w.dispatch('install');
  await w.dispatch('activate');
  assert.ok(w.stores.has('qinshi-site-1.0.56'));
  assert.ok(w.stores.get('qinshi-site-' + CURRENT_VERSION).has(w.key('./index.html')));
  await w.dispatch('message', { data: { type: 'PRECACHE_GALLERY' } });
  assert.equal(vm.runInContext('galleryState.status',w.context),'partial');
});

for (const failure of ['galleryStorageFailure', 'galleryPutFailure']) {
  test(failure + ' still displays verified old offline image rather than requiring a successful migration write', async () => {
    const w = worker({ [failure]: true });
    const image = fs.readFileSync(path.resolve(__dirname, '../images/楼兰/楼兰 (1).png'));
    await w.cache('qinshi-site-1.0.56').put('./images/楼兰/楼兰 (1).png', new Response(image));
    await w.dispatch('install');
    await w.dispatch('activate');
    assert.ok(w.stores.has('qinshi-site-1.0.56'));
    const response = await w.respond('./images/楼兰/楼兰 (1).png');
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(image));
    assert.equal(w.requests.filter(url => /images\/(楼兰|棋阵)/.test(url)).length, 0);
  });
}
test('cached image with wrong bytes cannot migrate into the current fingerprint', async () => {
  const w = worker();
  await w.cache('qinshi-site-1.0.56').put('./images/楼兰/楼兰 (1).png',new Response('obsolete-image'));
  await w.dispatch('install');
  await w.dispatch('activate');
  assert.equal((await w.cache('qinshi-gallery-v1').match('./images/楼兰/楼兰 (1).png',{ ignoreSearch:true })),undefined);
});

test('one changed image refetches once while fifteen unchanged fingerprints remain reusable', async () => {
  const options = { galleryBodies:{} };
  const w = worker(options);
  w.setOnline();
  await w.dispatch('install');
  await w.dispatch('activate');
  await w.dispatch('message',{ data:{ type:'PRECACHE_GALLERY' } });
  const before = w.requests.length;
  const changed = Buffer.from('new gallery content');
  const hash = createHash('sha256').update(changed).digest('hex');
  options.galleryBodies['images/楼兰/楼兰 (1).png'] = changed;
  vm.runInContext('GALLERY_FINGERPRINTS["./images/楼兰/楼兰 (1).png"] = "' + hash + '"',w.context);
  await w.dispatch('message',{ data:{ type:'PRECACHE_GALLERY' } });
  assert.equal(w.requests.length-before,1);
  const current = await w.cache('qinshi-gallery-v1').match('./images/楼兰/楼兰 (1).png?gallery='+hash);
  assert.equal(await current.text(),'new gallery content');
  assert.equal(await (await w.respond('./images/楼兰/楼兰 (1).png')).text(),'new gallery content');
});
test('gallery fetch cannot serve an obsolete unversioned response from old core cache', async () => {
  const w = worker();
  w.setOnline();
  await w.cache('qinshi-site-1.0.56').put('./images/楼兰/楼兰 (1).png',new Response('obsolete-image'));
  const response = await w.respond('./images/楼兰/楼兰 (1).png');
  assert.equal(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.resolve(__dirname,'../images/楼兰/楼兰 (1).png'))),true);
  assert.equal(w.requests.length,1);
});
test('network image not matching current content fingerprint is retried but never marked ready', async () => {
  const w = worker({ galleryBodies:{ 'images/楼兰/楼兰 (1).png':Buffer.from('wrong-image') } });
  w.setOnline();
  await w.dispatch('install');
  await w.dispatch('activate');
  await w.dispatch('message',{ data:{ type:'PRECACHE_GALLERY' } });
  assert.equal(vm.runInContext('galleryState.status',w.context),'partial');
  assert.equal(vm.runInContext('galleryState.cached',w.context),15);
  assert.equal(w.requests.filter(url => decodeURIComponent(url).includes('images/楼兰/楼兰 (1).png')).length,3);
});
test('missing core script still fails installation after bounded retries', async () => {
  const w = worker({ coreFailure:true });
  await assert.rejects(w.dispatch('install'),/offline/);
  assert.equal(w.requests.filter(url => url === './js/app.js').length,3);
});

test('never-settling gallery network is bounded and later online retry can finish', async () => {
  const options = { galleryHang:true };
  const w = worker(options);
  w.setOnline();
  await w.dispatch('install');
  await w.dispatch('activate');
  let deadline;
  const finished = await Promise.race([
    w.dispatch('message',{ data:{ type:'PRECACHE_GALLERY' } }).then(() => 'settled'),
    new Promise(resolve => { deadline = setTimeout(() => resolve('stuck'),1000); })
  ]);
  clearTimeout(deadline);
  assert.equal(finished,'settled');
  assert.equal(vm.runInContext('galleryState.status',w.context),'partial');
  options.galleryHang=false;
  await w.dispatch('message',{ data:{ type:'PRECACHE_GALLERY' } });
  assert.equal(vm.runInContext('galleryState.status',w.context),'ready');
});
