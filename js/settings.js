(function () {
  "use strict";

  var APP_NAME = "Qin";
  var BACKUP_FORMAT_VERSION = 1;
  var STORAGE_PREFIX = "qinshi_";

  function collectManagedData() {
    var data = {};
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      var value = key && key.indexOf(STORAGE_PREFIX) === 0 ? localStorage.getItem(key) : null;
      if (typeof value === "string") data[key] = value;
    }
    return data;
  }

  function makePayload(reason, metadata) {
    var payload = {
      formatVersion: BACKUP_FORMAT_VERSION,
      appName: APP_NAME,
      reason: reason || "manual",
      exportedAt: new Date().toISOString(),
      data: collectManagedData()
    };
    if (metadata !== undefined) payload.metadata = metadata;
    return payload;
  }

  function backupFileName(reason) {
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    var suffix = reason === "before-import" || reason === "before-cloud-sync" ? reason : "manual";
    return "Qin-backup-" + suffix + "-" + stamp + ".json";
  }

  function downloadPayload(payload, reason) {
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = backupFileName(reason);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadBackup(reason) {
    downloadPayload(makePayload(reason), reason);
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("备份文件不是有效对象。");
    }
    if (payload.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw new Error("备份版本不受支持。");
    }
    return validateManagedData(payload.data);
  }

  function validateManagedData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("备份文件缺少本机进度数据。");
    }
    Object.keys(data).forEach(function (key) {
      if (key.indexOf(STORAGE_PREFIX) !== 0 || typeof data[key] !== "string") {
        throw new Error("备份文件包含不允许的数据项。");
      }
    });
    return data;
  }

  function clearManagedData() {
    var keys = [];
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index);
      if (key && key.indexOf(STORAGE_PREFIX) === 0) keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
  }

  function replaceManagedData(data) {
    validateManagedData(data);
    var previous = collectManagedData();
    var added = [];
    var replaced = [];
    try {
      Object.keys(data).forEach(function (key) {
        var existed = Object.prototype.hasOwnProperty.call(previous, key);
        localStorage.setItem(key, data[key]);
        if (existed) replaced.push(key);
        else added.push(key);
      });
      Object.keys(previous).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) localStorage.removeItem(key);
      });
    } catch (error) {
      added.forEach(function (key) { localStorage.removeItem(key); });
      replaced.forEach(function (key) { localStorage.setItem(key, previous[key]); });
      throw error;
    }
    return { previous: previous };
  }

  function restoreManagedData(previous) {
    validateManagedData(previous);
    clearManagedData();
    Object.keys(previous).forEach(function (key) { localStorage.setItem(key, previous[key]); });
  }

  function setStatus(message, isError) {
    var status = document.getElementById("settings-backup-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error-text", Boolean(isError));
  }

  async function importBackup(file) {
    if (!file) return;
    setStatus("正在读取备份文件…", false);
    try {
      var payload = JSON.parse(await file.text());
      var data = validatePayload(payload);
      if (!window.confirm("导入将覆盖本机现有个人进度。系统会先自动下载当前备份，是否继续？")) {
        setStatus("已取消导入。", false);
        return;
      }
      downloadBackup("before-import");
      replaceManagedData(data);
      setStatus("导入完成，正在重新载入页面…", false);
      window.setTimeout(function () { window.location.reload(); }, 500);
    } catch (error) {
      setStatus("导入失败：" + (error && error.message ? error.message : "无法读取备份文件"), true);
    }
  }

  function init() {
    var exportButton = document.getElementById("settings-export");
    var importButton = document.getElementById("settings-import-trigger");
    var importFile = document.getElementById("settings-import-file");
    if (exportButton) {
      exportButton.addEventListener("click", function () {
        try {
          downloadBackup("manual");
          setStatus("备份文件已生成。", false);
        } catch (error) {
          setStatus("导出失败：浏览器未能生成备份文件。", true);
        }
      });
    }
    if (importButton && importFile) {
      importButton.addEventListener("click", function () { importFile.click(); });
      importFile.addEventListener("change", function () {
        var file = importFile.files && importFile.files[0];
        importBackup(file);
        importFile.value = "";
      });
    }
  }

  window.QinshiSettings = {
    collectManagedData: collectManagedData,
    validateManagedData: validateManagedData,
    makePayload: makePayload,
    downloadPayload: downloadPayload,
    replaceManagedData: replaceManagedData,
    restoreManagedData: restoreManagedData,
    exportBackup: function () { downloadBackup("manual"); },
    importBackup: importBackup,
    downloadBackup: downloadBackup
  };
  document.addEventListener("DOMContentLoaded", init);
})();
