(function () {
  "use strict";

  var APP_VERSION = "1.0.38";
  var registration = null;
  var waitingWorker = null;
  var deferredInstallPrompt = null;
  var reloadAfterUpdate = false;

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
    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  }

  function watchRegistration(nextRegistration) {
    registration = nextRegistration;
    if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
    watchInstalling(registration.installing);
    registration.addEventListener("updatefound", function () {
      watchInstalling(registration.installing);
    });
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
    }).catch(function (error) {
      setModeStatus("离线缓存未启用");
      setStatus("离线功能初始化失败：" + error.message, true);
    });
  }

  function checkForUpdate() {
    if (!registration) {
      setStatus(window.location.protocol === "file:" ? "本地文件模式不支持自动更新。" : "离线服务尚未准备完成。", false);
      return Promise.resolve(false);
    }
    setStatus("正在检查新版本…", false);
    return registration.update().then(function () {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
      watchInstalling(registration.installing);
      if (!waitingWorker) setStatus("已完成检查；如有新版本会显示更新提示。", false);
      return Boolean(waitingWorker);
    }).catch(function (error) {
      setStatus("检查更新失败：" + error.message, true);
      return false;
    });
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    reloadAfterUpdate = true;
    setStatus("正在切换到新版本…", false);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
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
    if (version) version.textContent = APP_VERSION;
    if (applyButton) applyButton.addEventListener("click", applyUpdate);
    if (checkButton) checkButton.addEventListener("click", checkForUpdate);
    bindInstall();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (!reloadAfterUpdate) return;
        reloadAfterUpdate = false;
        window.location.reload();
      });
    }
    window.addEventListener("load", registerServiceWorker, { once: true });
  }

  window.QinshiPWA = { checkForUpdate: checkForUpdate, version: APP_VERSION };
  document.addEventListener("DOMContentLoaded", init);
})();
