"use strict";

const CACHE_PREFIX = "qinshi-site-";
const CACHE_NAME = CACHE_PREFIX + "1.0.58";
const GALLERY_CACHE_NAME = "qinshi-gallery-v1";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./css/six-halls.css",
  "./data/special-equipment.js",
  "./data/forging.js",
  "./data/drops.js",
  "./data/atlas.js",
  "./data/forbidden.js",
  "./data/quiz.js",
  "./data/inscription.js",
  "./data/tactics.js",
  "./data/formations.js",
  "./data/six-halls.js",
  "./data/machine-beasts.js",
  "./data/battle-box-pill-pouch.js",
  "./data/zhulu.js",
  "./data/2026-09-content-update.js",
  "./data/2026-10-equipment-update.js",
  "./data/2026-10-forging-update.js",
  "./data/wooden-man-alley.js",
  "./js/account-edit-lease.js",
  "./js/account-profiles.js",
  "./js/account-profiles-ui.js",
  "./js/wooden-man-alley.js",
  "./js/wooden-man-alley-planner.js",
  "./js/wooden-man-alley-ui.js",
  "./js/query.js",
  "./js/forging.js",
  "./js/drops.js",
  "./js/progress.js",
  "./js/atlas.js",
  "./js/forbidden.js",
  "./js/forbidden-ui.js",
  "./js/quiz.js",
  "./js/inscription-performance.js",
  "./js/ui-performance.js",
  "./js/partition-loader.js",
  "./js/calculation-runner.js",
  "./js/calculation-worker.js",
  "./js/inscription.js",
  "./js/tactics.js",
  "./js/tactics-ui.js",
  "./js/formations.js",
  "./js/formations-ui.js",
  "./js/six-halls.js",
  "./js/six-halls-ui.js",
  "./js/machine-beasts.js",
  "./js/machine-beast-school-planner.js",
  "./js/machine-beasts-ui.js",
  "./js/battle-box-pill-pouch.js",
  "./js/battle-box-pill-pouch-ui.js",
  "./js/zhulu.js",
  "./js/zhulu-ui.js",
  "./js/equipment-compare.js",
  "./js/equipment-forging.js",
  "./js/item-navigation.js",
  "./js/settings.js",
  "./js/cloud-sync-config.js",
  "./js/cloud-sync-core.js",
  "./js/cloud-sync-crypto.js",
  "./js/cloud-sync-storage.js",
  "./js/cloud-sync-api.js",
  "./js/pwa.js",
  "./js/cloud-sync.js",
  "./js/app.js",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
  "./icons/apple-touch-icon.png",
  "./images/nav-sword.png",
  "./images/qin-ink-landscape.webp"
];
const GALLERY_URLS = [
  "./images/楼兰/楼兰 (1).png",
  "./images/楼兰/楼兰 (2).png",
  "./images/楼兰/楼兰 (3).png",
  "./images/楼兰/楼兰 (4).png",
  "./images/楼兰/楼兰 (5).png",
  "./images/棋阵/棋阵 (1).png",
  "./images/棋阵/棋阵 (2).png",
  "./images/棋阵/棋阵 (3).png",
  "./images/棋阵/棋阵 (4).png",
  "./images/棋阵/棋阵 (5).png",
  "./images/棋阵/棋阵 (6).png",
  "./images/棋阵/棋阵 (7).png",
  "./images/棋阵/棋阵 (8).png",
  "./images/棋阵/棋阵 (9).png",
  "./images/棋阵/棋阵 (10).png",
  "./images/棋阵/棋阵(11).png"
];

// Content fingerprints, not release versions: unchanged files reuse the stable cache.
// When replacing an image at the same path, update its SHA-256 here (Get-FileHash
// -Algorithm SHA256 <file>). Never copy an old response to a new key without hashing.
const GALLERY_FINGERPRINTS = {
  "./images/楼兰/楼兰 (1).png": "947dbf112a087499aa95dbe026b932347f5d9b7220db3eab08289c90944f3cde",
  "./images/楼兰/楼兰 (2).png": "04416c7feb94b329696b99b718be8bb00536e4fb7c1bed1ca70eecbb6ffddceb",
  "./images/楼兰/楼兰 (3).png": "92c9f1895240e51384d7fb54de58f819262d47e13891d04978cb11484f9b3cc7",
  "./images/楼兰/楼兰 (4).png": "a87da83d93fcf5259b0abba8b3d4f0a40a5e80f09b281a5d6c256f2e2862e11b",
  "./images/楼兰/楼兰 (5).png": "c7b2868a5e653fdf22345b93aa81c839fb669a2ab3aba7162bde9161324279ad",
  "./images/棋阵/棋阵 (1).png": "2511ad1a64a426a9c5f5feab7c795f2756e62b57cfb0409abaff850044c7225e",
  "./images/棋阵/棋阵 (2).png": "64fb1e070121fdb583249331f4ed84869baff32f1f654e1e97570b196dce2bb0",
  "./images/棋阵/棋阵 (3).png": "eff2c2e31b0fdeeeba396d2273ada843ce423696069b23abaee8464a5c29a706",
  "./images/棋阵/棋阵 (4).png": "6aa29ae8ab30a7195cb755612e67d30f5d55cb2bf8c9341e20de2454912d342c",
  "./images/棋阵/棋阵 (5).png": "df50de0406fd86cc11013f5f1cda4ed2d3489c2c338f6b4869760e8f43cbba49",
  "./images/棋阵/棋阵 (6).png": "5d181e6a918bb66100080973f273d53d6f1568ae023378c9bf13af3a039f852d",
  "./images/棋阵/棋阵 (7).png": "833f8e4112e208bed1ce506c0b7616d6b06c566a7828da5e51a96a49b116e32c",
  "./images/棋阵/棋阵 (8).png": "8b97e2d2243156fa55dc4a67a04637cccab6f42f207269b2c620f442da26433a",
  "./images/棋阵/棋阵 (9).png": "51e261ee7dcde921e2a1ff13df760e7516efed4da542084ca51de25bf76bfd96",
  "./images/棋阵/棋阵 (10).png": "2bb5b28f364ab60913c0ec0639f17d8d9dc6d74e1048dfc9573d345fa6e3f257",
  "./images/棋阵/棋阵(11).png": "6ff015251ca3c15c3a6414f95b3d00f1d5c787bdaf59f0dd09f2b2f6d28e9f21"
};

function galleryKey(url) { return url + "?gallery=" + GALLERY_FINGERPRINTS[url]; }

function matchesGalleryFingerprint(response, url) {
  if (!response || !response.ok) return Promise.resolve(false);
  return response.clone().arrayBuffer().then(function (bytes) {
    return crypto.subtle.digest("SHA-256", bytes);
  }).then(function (digest) {
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("") === GALLERY_FINGERPRINTS[url];
  });
}

function verifiedOldGallery(url) {
  return caches.keys().then(function (names) {
    return names.reduce(function (ready, name) {
      return ready.then(function (found) {
        if (found) return found;
        return caches.open(name).then(function (cache) {
          return cache.match(url, { ignoreSearch: true });
        }).then(function (candidate) {
          return matchesGalleryFingerprint(candidate, url).then(function (matches) { return matches ? candidate : undefined; });
        }).catch(function () { return undefined; });
      });
    }, Promise.resolve());
  });
}

function cachedGallery(cache, url, strictWrite) {
  return cache.match(galleryKey(url)).then(function (current) {
    if (current) return current;
    return verifiedOldGallery(url).then(function (old) {
      if (!old) return undefined;
      return cache.put(galleryKey(url), old.clone()).then(function () { return old; }, function (error) {
        if (strictWrite !== false) throw error;
        return old;
      });
    });
  });
}

function fetchGallery(url) {
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 10000);
  return fetch(new Request(galleryKey(url), { cache: "reload", signal: controller.signal })).then(function (response) {
    return matchesGalleryFingerprint(response, url).then(function (matches) {
      if (!matches) throw new Error("图库内容校验失败：" + url);
      return response;
    });
  }).finally(function () { clearTimeout(timeout); });
}

function cacheGalleryOne(cache, url, attempt) {
  return fetchGallery(url).then(function (response) { return cache.put(galleryKey(url), response); }).catch(function (error) {
    if (attempt >= 3) throw error;
    return wait(attempt * 250).then(function () { return cacheGalleryOne(cache, url, attempt + 1); });
  });
}

var galleryState = { status: "pending", total: GALLERY_URLS.length, cached: 0 };
var galleryTask = null;
function galleryCache() {
  if (galleryTask) return galleryTask;
  galleryState.status = "loading";
  galleryTask = caches.open(GALLERY_CACHE_NAME).then(function (cache) {
    var next = 0;
    var completed = 0;
    function worker() {
      var index = next++;
      if (index >= GALLERY_URLS.length) return Promise.resolve();
      var url = GALLERY_URLS[index];
      return cachedGallery(cache, url).then(function (existing) {
        if (existing) return;
        return cacheGalleryOne(cache, url, 1);
      }).then(function () { completed++; }, function () { /* Other images must still be attempted. */ }).then(worker);
    }
    return Promise.all([worker(), worker(), worker()]).then(function () {
      galleryState.cached = completed;
      galleryState.status = completed === GALLERY_URLS.length ? "ready" : "partial";
    });
  }).catch(function () { galleryState.status = "partial"; }).then(function () {
    galleryTask = null;
    return galleryState;
  });
  return galleryTask;
}

function migrateGallery() {
  return caches.open(GALLERY_CACHE_NAME).then(function (cache) {
    return Promise.all(GALLERY_URLS.map(function (url) {
      return cachedGallery(cache, url);
    }));
  });
}

function wait(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

function cacheOne(cache, url, attempts) {
  var remaining = attempts || 3;
  function attempt() {
    return fetch(new Request(url, { cache: "reload" })).then(function (response) {
      if (!response || !response.ok) throw new Error("预缓存失败：" + url);
      return cache.put(url, response);
    }).catch(function (error) {
      remaining -= 1;
      if (remaining <= 0) throw error;
      return wait((4 - remaining) * 250).then(attempt);
    });
  }
  return attempt();
}

function precacheInBatches(cache, urls, concurrency) {
  var next = 0;
  var workerCount = Math.min(concurrency || 6, urls.length);
  function worker() {
    var index = next;
    next += 1;
    if (index >= urls.length) return Promise.resolve();
    return cacheOne(cache, urls[index], 3).then(worker);
  }
  return Promise.all(Array.from({ length: workerCount }, worker));
}

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return precacheInBatches(cache, PRECACHE_URLS, 6);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(Promise.all([
    migrateGallery().then(function () { return caches.keys(); }, function () {
      // Keep old offline images if migration cannot write (for example quota).
      // A gallery-only storage problem must not prevent core activation.
      return [];
    }).then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
      }).map(function (key) { return caches.delete(key); }));
    }),
    self.clients.claim()
  ]));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "PRECACHE_GALLERY") {
    event.waitUntil(galleryCache().then(function (state) {
      if (event.ports && event.ports[0]) event.ports[0].postMessage(state);
    }));
  }
  if (event.data && event.data.type === "GALLERY_STATUS" && event.ports && event.ports[0]) event.ports[0].postMessage(galleryState);
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  var galleryUrl = GALLERY_URLS.find(function (url) { return new URL(url, self.location.href).pathname === requestUrl.pathname; });
  if (galleryUrl) {
    // Never let ignoreSearch on a previous core/stable cache pick obsolete bytes.
    event.respondWith(caches.open(GALLERY_CACHE_NAME).catch(function () { return null; }).then(function (cache) {
      return (cache ? cachedGallery(cache, galleryUrl, false) : verifiedOldGallery(galleryUrl)).then(function (cached) {
        if (cached) return cached;
        return fetchGallery(galleryUrl).then(function (response) {
          if (cache) event.waitUntil(cache.put(galleryKey(galleryUrl), response.clone()).catch(function () {}));
          return response;
        });
      });
    }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(caches.match("./index.html", { ignoreSearch: true }).then(function (cachedPage) {
      return cachedPage || fetch(request, { cache: "reload" });
    }));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then(function (cachedResponse) {
    if (cachedResponse) return cachedResponse;
    return fetch(request, { cache: "reload" }).then(function (networkResponse) {
      if (!networkResponse || !networkResponse.ok) return networkResponse;
      var copy = networkResponse.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.put(request, copy); }));
      return networkResponse;
    });
  }));
});
