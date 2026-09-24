(function () {
  "use strict";

  var APP_NAME = "Qin";
  var BACKUP_FORMAT_VERSION = 2;
  var STORAGE_PREFIX = "qinshi_";
  var ACCOUNTS = window.QinshiAccountProfiles;

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
    var suffix = /^[a-z0-9-]+$/.test(String(reason || "")) ? reason : "manual";
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
    return true;
  }

  function downloadBackup(reason) {
    return downloadPayload(makePayload(reason), reason);
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("备份文件不是有效对象。");
    }
    if (payload.formatVersion === 1) return upgradeV1Data(payload.data);
    if (payload.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error("备份版本不受支持。");
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
    if (!Object.prototype.hasOwnProperty.call(data, ACCOUNTS.REGISTRY_KEY)) {
      throw new Error("这是旧版单账号云快照，请先在来源设备更新工具并重新上传快照。");
    }
    var registry;
    try { registry = ACCOUNTS.normalizeRegistry(JSON.parse(data[ACCOUNTS.REGISTRY_KEY])); }
    catch (error) { throw new Error("账号注册表无效：" + error.message); }
    var ids = new Set(registry.accounts.map(function (account) { return account.id; }));
    Object.keys(data).forEach(function (key) {
      if (key === ACCOUNTS.REGISTRY_KEY) return;
      var parsed = ACCOUNTS.parsePhysicalKey(key);
      if (!parsed || !ids.has(parsed.accountId) || parsed.logicalKey.indexOf(STORAGE_PREFIX) !== 0) {
        throw new Error("备份文件包含未归属账号的数据项。");
      }
    });
    return data;
  }

  function upgradeV1Data(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("备份文件缺少本机进度数据。");
    var id = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "account-import-" + Date.now().toString(36);
    var stamp = new Date().toISOString();
    var registry = {
      schemaVersion: 1,
      primaryAccountId: id,
      order: [id],
      accounts: [{ id: id, name: "默认账号", server: "未填写", createdAt: stamp, updatedAt: stamp }]
    };
    var upgraded = {};
    upgraded[ACCOUNTS.REGISTRY_KEY] = JSON.stringify(registry);
    Object.keys(data).forEach(function (key) {
      if (key.indexOf(STORAGE_PREFIX) !== 0 || typeof data[key] !== "string" || key === ACCOUNTS.REGISTRY_KEY || key.indexOf(ACCOUNTS.ACCOUNT_PREFIX) === 0) {
        throw new Error("旧版备份包含不允许的数据项。");
      }
      upgraded[ACCOUNTS.physicalKey(id, key)] = data[key];
    });
    return validateManagedData(upgraded);
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
    if (!previous || !Object.prototype.hasOwnProperty.call(previous, ACCOUNTS.REGISTRY_KEY)) previous = upgradeV1Data(previous);
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

  function initSettingsNavigation() {
    if (typeof document.querySelectorAll !== "function") return;
    var tabs = Array.from(document.querySelectorAll("[data-settings-section]"));
    var panels = Array.from(document.querySelectorAll("[data-settings-section-panel]"));
    if (!tabs.length || !panels.length) return;

    function activate(section, moveFocus) {
      if (!tabs.some(function (tab) { return tab.dataset.settingsSection === section; })) section = "accounts";
      tabs.forEach(function (tab) {
        var active = tab.dataset.settingsSection === section;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && moveFocus) tab.focus();
      });
      panels.forEach(function (panel) { panel.hidden = panel.dataset.settingsSectionPanel !== section; });
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { activate(tab.dataset.settingsSection, false); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        activate(tabs[next].dataset.settingsSection, true);
      });
    });
    var selected = tabs.find(function (tab) { return tab.getAttribute("aria-selected") === "true"; });
    activate(selected ? selected.dataset.settingsSection : "accounts", false);
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
      if (!downloadBackup("before-import")) throw new Error("未能生成导入前备份。");
      replaceManagedData(data);
      setStatus("导入完成，正在重新载入页面…", false);
      window.setTimeout(function () { window.location.reload(); }, 500);
    } catch (error) {
      setStatus("导入失败：" + (error && error.message ? error.message : "无法读取备份文件"), true);
    }
  }

  function init() {
    initSettingsNavigation();
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
    validatePayload: validatePayload,
    upgradeV1Data: upgradeV1Data,
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
