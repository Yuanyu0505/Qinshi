(function () {
  "use strict";

  var APP_VERSION = "1.0.39";
  var VERSION_URL = "./version.json";
  var UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;
  var RETRY_DELAYS = [0, 500, 1500];
  var CACHE_PREFIX = "qinshi-site-";
  var registration = null;
  var waitingWorker = null;
  var deferredInstallPrompt = null;
  var reloadAfterUpdate = false;
  var updateCheckPromise = null;
  var watchedInstallingWorker = null;

  function byId(id) { return document.getElementById(id); }

  function setStatus(message, isError) {
    var status = byId("pwa-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error-text", Boolean(isError));
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function setModeStatus(message) {
    var mode = byId("pwa-mode-status");
    if (mode) mode.textContent = message;
  }

  function showUpdate(worker) {
    waitingWorker = worker;
    var notice = byId("pwa-update-notice");
    if (notice) notice.hidden = false;
    setStatus("发现新版本，点击“立即更新”后生效。", false);
  }

  function watchInstalling(worker) {
    if (!worker) return;
    function handleStateChange() {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdate(registration.waiting || worker);
      }
    }
    if (worker === watchedInstallingWorker) {
      handleStateChange();
      return;
    }
    watchedInstallingWorker = worker;
    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  }

  function syncRegistrationState() {
    if (!registration) return false;
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
    watchInstalling(registration.installing);
    return Boolean(waitingWorker);
  }

  function watchRegistration(nextRegistration) {
    registration = nextRegistration;
    syncRegistrationState();
    registration.addEventListener("updatefound", function () {
      watchInstalling(registration.installing);
    });
  }

  function wait(delay) {
    return new Promise(function (resolve) { setTimeout(resolve, delay); });
  }

  function withRetry(operation) {
    var attempt = 0;
    function run() {
      return Promise.resolve().then(operation).catch(function (error) {
        attempt += 1;
        if (attempt >= RETRY_DELAYS.length) throw error;
        return wait(RETRY_DELAYS[attempt]).then(run);
      });
    }
    return run();
  }

  function fetchRemoteVersion() {
    var url = VERSION_URL + "?t=" + Date.now();
    return fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    }).then(function (response) {
      if (!response.ok) throw new Error("版本信息请求失败（HTTP " + response.status + "）");
      return response.json();
    }).then(function (payload) {
      if (!payload || typeof payload.version !== "string" || !payload.version.trim()) {
        throw new Error("版本信息格式无效");
      }
      return payload.version.trim();
    });
  }

  function updateRegistration() {
    return withRetry(function () { return registration.update(); }).then(function () {
      return syncRegistrationState();
    });
  }

  function performUpdateCheck(manual) {
    if (!registration) {
      if (manual) {
        setStatus(window.location.protocol === "file:" ? "本地文件模式不支持自动更新。" : "离线服务尚未准备完成。", false);
      }
      return Promise.resolve(false);
    }
    if (syncRegistrationState()) return Promise.resolve(true);
    if (manual) setStatus("正在检查新版本…", false);

    return withRetry(fetchRemoteVersion).then(function (remoteVersion) {
      if (remoteVersion !== APP_VERSION) {
        setStatus("检测到新版本 " + remoteVersion + "，正在准备更新…", false);
        return updateRegistration().then(function (hasWaitingWorker) {
          if (!hasWaitingWorker && registration.installing) {
            setStatus("新版本正在下载，完成后会显示更新提示。", false);
          } else if (!hasWaitingWorker) {
            setStatus("已检测到新版本，浏览器正在同步资源，请稍后再试。", false);
          }
          return hasWaitingWorker;
        });
      }
      if (!manual) return false;
      return updateRegistration().then(function (hasWaitingWorker) {
        if (!hasWaitingWorker) setStatus("当前已是最新版本 " + APP_VERSION + "。", false);
        return hasWaitingWorker;
      });
    }).catch(function (error) {
      if (manual) setStatus("检查更新失败，已自动重试：" + error.message, true);
      return false;
    });
  }

  function requestUpdateCheck(manual) {
    if (updateCheckPromise) {
      if (!manual) return updateCheckPromise;
      return updateCheckPromise.then(function () { return requestUpdateCheck(true); });
    }
    updateCheckPromise = performUpdateCheck(Boolean(manual)).finally(function () {
      updateCheckPromise = null;
    });
    return updateCheckPromise;
  }

  function checkForUpdate() {
    return requestUpdateCheck(true);
  }

  function checkForUpdateSilently() {
    return requestUpdateCheck(false);
  }

  function registerServiceWorker() {
    if (window.location.protocol === "file:") {
      setModeStatus("本地文件模式");
      setStatus("Windows 双击模式可正常使用；PWA 安装和自动更新仅在 HTTPS 地址启用。", false);
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setModeStatus("浏览器不支持离线安装");
      setStatus("当前浏览器不支持 Service Worker，请改用较新的 Safari、Chrome 或 Edge。", true);
      return;
    }
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).then(function (nextRegistration) {
      watchRegistration(nextRegistration);
      return navigator.serviceWorker.ready;
    }).then(function () {
      setModeStatus(isStandalone() ? "已安装 · 可离线使用" : "网页模式 · 可离线使用");
      if (!waitingWorker) setStatus("全部工具资源已准备离线使用。", false);
      return checkForUpdateSilently();
    }).catch(function (error) {
      setModeStatus("离线缓存未启用");
      setStatus("离线功能初始化失败：" + error.message, true);
    });
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    reloadAfterUpdate = true;
    setStatus("正在切换到新版本…", false);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  function repairUpdate() {
    if (!("serviceWorker" in navigator) || typeof caches === "undefined") {
      setStatus("当前浏览器不支持自动修复，请清除该网站缓存后重新打开。", true);
      return Promise.resolve(false);
    }
    setStatus("正在修复更新；个人进度不会被删除…", false);
    var appScope = new URL("./", window.location.href).href;
    return navigator.serviceWorker.getRegistrations().then(function (registrations) {
      return Promise.all(registrations.filter(function (item) {
        return item.scope === appScope;
      }).map(function (item) { return item.unregister(); }));
    }).then(function () {
      return caches.keys();
    }).then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key.indexOf(CACHE_PREFIX) === 0;
      }).map(function (key) { return caches.delete(key); }));
    }).then(function () {
      var target = new URL(window.location.href);
      target.searchParams.set("pwa-repair", String(Date.now()));
      window.location.replace(target.href);
      return true;
    }).catch(function (error) {
      setStatus("修复更新失败：" + error.message, true);
      return false;
    });
  }

  function bindInstall() {
    var installButton = byId("pwa-install");
    var help = byId("pwa-install-help");
    if (isStandalone()) {
      if (help) help.textContent = "Qin 已安装到当前设备。";
      return;
    }
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (installButton) installButton.hidden = false;
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      if (installButton) installButton.hidden = true;
      setModeStatus("已安装 · 可离线使用");
      setStatus("Qin 已安装到设备。", false);
    });
    if (installButton) {
      installButton.addEventListener("click", function () {
        if (!deferredInstallPrompt) {
          setStatus("请使用浏览器菜单中的“安装应用”或“添加到主屏幕”。", false);
          return;
        }
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function () {
          deferredInstallPrompt = null;
          installButton.hidden = true;
        });
      });
    }
  }

  function init() {
    var version = byId("pwa-version");
    var applyButton = byId("pwa-apply-update");
    var checkButton = byId("pwa-check-update");
    var repairButton = byId("pwa-repair-update");
    if (version) version.textContent = APP_VERSION;
    if (applyButton) applyButton.addEventListener("click", applyUpdate);
    if (checkButton) checkButton.addEventListener("click", checkForUpdate);
    if (repairButton) repairButton.addEventListener("click", repairUpdate);
    bindInstall();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!reloadAfterUpdate) return;
        reloadAfterUpdate = false;
        window.location.reload();
      });
      window.addEventListener("online", checkForUpdateSilently);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) checkForUpdateSilently();
      });
      setInterval(checkForUpdateSilently, UPDATE_CHECK_INTERVAL);
    }
    window.addEventListener("load", registerServiceWorker, { once: true });
  }

  window.QinshiPWA = {
    checkForUpdate: checkForUpdate,
    repairUpdate: repairUpdate,
    version: APP_VERSION
  };
  document.addEventListener("DOMContentLoaded", init);
})();
