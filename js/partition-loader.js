(function (root) {
  "use strict";
  // Static paths also work when index.html is opened directly (file:).
  var version = "1.0.62";
  var registry = {
    "secret-realm": { scripts: ["data/secret-realm.js", "js/secret-realm-core.js", "js/secret-realm-planner.js", "js/secret-realm-ui.js"], api: "SECRET_REALM_UI", rootArgument: true },
    tactics: { scripts: ["js/tactics.js", "js/tactics-ui.js"], api: "TACTICS_UI" },
    formations: { scripts: ["js/formations.js", "js/formations-ui.js"], api: "FORMATIONS_UI" },
    "six-halls": { scripts: ["js/six-halls.js", "js/six-halls-ui.js"], api: "SIX_HALLS_UI", rootArgument: true },
    "machine-beasts": { scripts: ["js/machine-beasts.js", "js/machine-beast-school-planner.js", "js/machine-beasts-ui.js"], api: "MACHINE_BEAST_UI" },
    "battle-box-pill-pouch": { scripts: ["js/battle-box-pill-pouch.js", "js/battle-box-pill-pouch-ui.js"], api: "BATTLE_BOX_PILL_POUCH_UI" },
    "wooden-man-alley": { scripts: ["data/wooden-man-alley.js", "js/wooden-man-alley.js", "js/wooden-man-alley-planner.js", "js/wooden-man-alley-ui.js"], api: "WOODEN_MAN_ALLEY_UI", rootArgument: true }
  };
  var scripts = Object.create(null);
  var partitions = Object.create(null);
  var readyPartitions = Object.create(null);
  function retryGallery() {
    if (!root.navigator || !root.navigator.serviceWorker || root.location.protocol === "file:") return;
    root.navigator.serviceWorker.ready.then(function (registration) {
      var worker = registration.active;
      if (worker) worker.postMessage({ type: "PRECACHE_GALLERY" });
    }).catch(function () { /* PWA unavailable: regular image loading still works. */ });
  }
  function loadScript(path) {
    if (scripts[path]) return scripts[path];
    scripts[path] = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = path + "?v=" + version;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        script.remove();
        delete scripts[path];
        reject(new Error("分区脚本加载失败：" + path));
      };
      document.head.appendChild(script);
    });
    return scripts[path];
  }
  function ensure(name) {
    if (partitions[name]) return partitions[name];
    if (name === "loulan") {
      retryGallery();
      document.querySelectorAll("#partition-loulan img[data-src]").forEach(function (image) {
        image.src = image.dataset.src;
        image.removeAttribute("data-src");
      });
      return Promise.resolve();
    }
    var entry = registry[name];
    if (!entry) return Promise.resolve();
    partitions[name] = entry.scripts.reduce(function (ready, path) {
      return ready.then(function () { return loadScript(path); });
    }, Promise.resolve()).then(function () {
      var api = root[entry.api];
      if (!api || typeof api.init !== "function") throw new Error("分区初始化不可用：" + name);
      api.init(entry.rootArgument ? root : undefined);
      readyPartitions[name] = true;
    }).catch(function (error) { delete partitions[name]; throw error; });
    return partitions[name];
  }
  root.QinshiPartitionLoader = { ensure: ensure, isReady: function (name) { return !registry[name] || readyPartitions[name] === true; } };
  root.addEventListener("online", retryGallery);
  retryGallery();
})(window);
