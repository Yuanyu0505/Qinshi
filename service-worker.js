"use strict";

const CACHE_PREFIX = "qinshi-site-";
const CACHE_NAME = CACHE_PREFIX + "1.0.19";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./data/special-equipment.js",
  "./data/forging.js",
  "./data/drops.js",
  "./data/atlas.js",
  "./data/forbidden.js",
  "./data/quiz.js",
  "./data/inscription.js",
  "./data/tactics.js",
  "./data/formations.js",
  "./data/machine-beasts.js",
  "./js/query.js",
  "./js/forging.js",
  "./js/drops.js",
  "./js/progress.js",
  "./js/atlas.js",
  "./js/forbidden.js",
  "./js/forbidden-ui.js",
  "./js/quiz.js",
  "./js/inscription.js",
  "./js/tactics.js",
  "./js/tactics-ui.js",
  "./js/formations.js",
  "./js/formations-ui.js",
  "./js/machine-beasts.js",
  "./js/machine-beast-school-planner.js",
  "./js/machine-beasts-ui.js",
  "./js/equipment-compare.js",
  "./js/settings.js",
  "./js/pwa.js",
  "./js/app.js",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
  "./icons/apple-touch-icon.png",
  "./images/nav-sword.png",
  "./images/qin-ink-landscape.webp",
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

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return cache.addAll(PRECACHE_URLS);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(Promise.all([
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
      }).map(function (key) { return caches.delete(key); }));
    }),
    self.clients.claim()
  ]));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then(function (cachedPage) {
      return cachedPage || fetch(request);
    }));
    return;
  }

  event.respondWith(caches.match(request).then(function (cachedResponse) {
    if (cachedResponse) return cachedResponse;
    return fetch(request).then(function (networkResponse) {
      if (!networkResponse || !networkResponse.ok) return networkResponse;
      var copy = networkResponse.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
      return networkResponse;
    });
  }));
});
