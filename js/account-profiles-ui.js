(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.QinshiAccountProfilesUI = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function accountLabel(account, primary) {
    if (!account) return "未创建账号";
    return account.name + " · " + account.server + (primary ? " · 主账号" : "");
  }
  function confirmationMatches(input, name) { return text(input) === text(name); }
  function swapOrder(order, first, second, primaryId) {
    var next = Array.isArray(order) ? order.slice() : [];
    if (!first || !second || first === primaryId || second === primaryId || first === second) return next;
    var a = next.indexOf(first);
    var b = next.indexOf(second);
    if (a < 0 || b < 0) return next;
    var hold = next[a]; next[a] = next[b]; next[b] = hold;
    return next;
  }

  function init() {
    if (!root || !root.document || !root.QinshiAccounts) return;
    var accounts = root.QinshiAccounts;
    var settings = root.QinshiSettings;
    var doc = root.document;
    var el = {
      initOverlay: doc.getElementById("account-init-overlay"), initForm: doc.getElementById("account-init-form"),
      initName: doc.getElementById("account-init-name"), initServer: doc.getElementById("account-init-server"), initStatus: doc.getElementById("account-init-status"),
      switcher: doc.getElementById("account-switcher"), switchToggle: doc.getElementById("account-switcher-toggle"), switchLabel: doc.getElementById("account-switcher-label"), switchList: doc.getElementById("account-switcher-list"),
      managerList: doc.getElementById("account-manager-list"), editor: doc.getElementById("account-editor"), editorId: doc.getElementById("account-editor-id"),
      editorName: doc.getElementById("account-editor-name"), editorServer: doc.getElementById("account-editor-server"), editorSave: doc.getElementById("account-editor-save"), editorCancel: doc.getElementById("account-editor-cancel"),
      managerStatus: doc.getElementById("account-manager-status"), reorderToggle: doc.getElementById("account-reorder-toggle"), reorderPanel: doc.getElementById("account-reorder-panel"),
      reorderList: doc.getElementById("account-reorder-list"), reorderSave: doc.getElementById("account-reorder-save"), reorderCancel: doc.getElementById("account-reorder-cancel"),
      readonlyBanner: doc.getElementById("account-readonly-banner"), readonlyText: doc.getElementById("account-readonly-text"), takeover: doc.getElementById("account-takeover")
    };
    var reorderDraft = [];
    var reorderFirst = null;

    function status(message, error) {
      if (!el.managerStatus) return;
      el.managerStatus.textContent = message || "";
      el.managerStatus.classList.toggle("error-text", Boolean(error));
    }
    function button(label, className, action, disabled) {
      var value = doc.createElement("button");
      value.type = "button";
      value.className = className || "seg";
      value.textContent = label;
      value.disabled = Boolean(disabled);
      value.addEventListener("click", action);
      return value;
    }
    function returnState() {
      var active = doc.querySelector(".tab.active[data-partition]");
      return { partition: active ? active.dataset.partition : "atlas" };
    }
    function switchTo(id) { accounts.switchAccount(id, returnState()); }
    function ensureEditing(id) {
      if (accounts.claimEditing(id)) return true;
      if (!root.confirm("该账号正在其他标签页编辑。是否接管编辑权后继续？")) return false;
      return accounts.takeOverEditing(id);
    }
    function requireFullBackup(reason) {
      if (!settings || typeof settings.downloadBackup !== "function") throw new Error("完整备份功能不可用，操作已取消。");
      if (!settings.downloadBackup(reason)) throw new Error("未能生成完整备份，操作已取消。");
    }
    function exactConfirmation(account, verb) {
      var input = root.prompt(verb + "将影响“" + account.name + " · " + account.server + "”。\n请输入账号名称“" + account.name + "”确认：", "");
      return confirmationMatches(input, account.name);
    }
    function resetEditor() {
      if (!el.editor) return;
      el.editor.reset(); el.editorId.value = ""; el.editorSave.textContent = "创建账号"; el.editorCancel.hidden = true;
      var atLimit = accounts.listAccounts().length >= 3;
      el.editorName.disabled = atLimit; el.editorServer.disabled = atLimit; el.editorSave.disabled = atLimit;
    }
    function editAccount(account) {
      el.editorId.value = account.id; el.editorName.value = account.name; el.editorServer.value = account.server;
      el.editorName.disabled = false; el.editorServer.disabled = false; el.editorSave.disabled = false;
      el.editorSave.textContent = "保存修改"; el.editorCancel.hidden = false; el.editorName.focus();
    }
    function destructive(account, kind) {
      try {
        requireFullBackup(kind === "clear" ? "before-account-clear" : "before-account-delete");
        if (!exactConfirmation(account, kind === "clear" ? "清空账号数据" : "删除账号")) { status("账号名称不匹配，操作已取消。", true); return; }
        if (!ensureEditing(account.id)) { status("未取得该账号编辑权。", true); return; }
        if (kind === "clear") {
          accounts.clearAccountData(account.id);
          status("账号数据已清空。", false);
          if (accounts.currentAccount() && accounts.currentAccount().id === account.id) root.location.reload();
        } else {
          var current = accounts.currentAccount();
          var result = accounts.deleteAccount(account.id);
          status("账号已删除。", false);
          if (!current || current.id === account.id || result.empty) root.location.reload();
          else render();
        }
      } catch (error) { status(error.message || "操作失败。", true); }
    }
    function renderSwitcher(list, current, primary) {
      if (!el.switchList) return;
      el.switchLabel.textContent = accountLabel(current, current && primary && current.id === primary.id);
      el.switchList.innerHTML = "";
      list.forEach(function (account) {
        var item = button(accountLabel(account, primary && account.id === primary.id), "account-switch-option", function () {
          if (!current || current.id !== account.id) switchTo(account.id);
          el.switchList.hidden = true; el.switchToggle.setAttribute("aria-expanded", "false");
        });
        item.classList.toggle("is-current", Boolean(current && current.id === account.id));
        el.switchList.appendChild(item);
      });
    }
    function renderManager(list, current, primary) {
      if (!el.managerList) return;
      el.managerList.innerHTML = "";
      list.forEach(function (account) {
        var card = doc.createElement("article"); card.className = "account-manager-card";
        if (current && current.id === account.id) card.classList.add("is-current");
        var head = doc.createElement("div"); head.className = "account-manager-head";
        var name = doc.createElement("strong"); name.textContent = account.name + " · " + account.server; head.appendChild(name);
        var badges = doc.createElement("span"); badges.className = "account-manager-badges";
        if (primary && primary.id === account.id) badges.appendChild(Object.assign(doc.createElement("b"), { textContent: "主账号" }));
        if (current && current.id === account.id) badges.appendChild(Object.assign(doc.createElement("b"), { textContent: "当前" }));
        head.appendChild(badges); card.appendChild(head);
        var actions = doc.createElement("div"); actions.className = "account-manager-actions";
        actions.appendChild(button("切换", "seg", function () { switchTo(account.id); }, current && current.id === account.id));
        actions.appendChild(button("编辑", "seg", function () { editAccount(account); }));
        actions.appendChild(button("设为主账号", "seg", function () { try { accounts.setPrimary(account.id); status("已设为主账号，下次新开工具时优先进入。", false); render(); } catch (error) { status(error.message, true); } }, primary && primary.id === account.id));
        actions.appendChild(button("清空数据", "seg danger", function () { destructive(account, "clear"); }));
        actions.appendChild(button("删除账号", "seg danger", function () { destructive(account, "delete"); }));
        card.appendChild(actions); el.managerList.appendChild(card);
      });
      var atLimit = list.length >= 3;
      el.editorName.disabled = atLimit && !el.editorId.value;
      el.editorServer.disabled = atLimit && !el.editorId.value;
      el.editorSave.disabled = atLimit && !el.editorId.value;
      el.reorderToggle.disabled = list.length < 3;
    }
    function renderReorder(primary) {
      if (!el.reorderList) return;
      el.reorderList.innerHTML = "";
      reorderDraft.forEach(function (id) {
        var account = accounts.listAccounts().find(function (item) { return item.id === id; });
        if (!account) return;
        var item = button(accountLabel(account, id === primary.id), "account-reorder-item", function () {
          if (id === primary.id) return;
          if (!reorderFirst) { reorderFirst = id; item.classList.add("is-selected"); return; }
          reorderDraft = swapOrder(reorderDraft, reorderFirst, id, primary.id); reorderFirst = null; renderReorder(primary);
        }, id === primary.id);
        if (id === reorderFirst) item.classList.add("is-selected");
        el.reorderList.appendChild(item);
      });
    }
    function renderAccess(current) {
      if (!el.readonlyBanner) return;
      var readOnly = Boolean(current && accounts.isReadOnly());
      el.readonlyBanner.hidden = !readOnly;
      doc.documentElement.classList.toggle("account-readonly", readOnly);
      if (readOnly) el.readonlyText.textContent = accountLabel(current, false) + " 正在其他标签页编辑，当前页面为只读模式。";
    }
    function render() {
      var list = accounts.listAccounts();
      var current = accounts.currentAccount();
      var primary = accounts.primaryAccount();
      if (el.initOverlay) el.initOverlay.hidden = list.length > 0;
      doc.documentElement.classList.toggle("account-needs-init", list.length === 0);
      renderSwitcher(list, current, primary);
      renderManager(list, current, primary);
      renderAccess(current);
    }

    if (el.initForm) el.initForm.addEventListener("submit", function (event) {
      event.preventDefault();
      try { accounts.createAccount({ name: el.initName.value, server: el.initServer.value }); root.location.reload(); }
      catch (error) { el.initStatus.textContent = error.message; el.initStatus.classList.add("error-text"); }
    });
    if (el.switchToggle) el.switchToggle.addEventListener("click", function () {
      el.switchList.hidden = !el.switchList.hidden; el.switchToggle.setAttribute("aria-expanded", String(!el.switchList.hidden));
    });
    if (el.editor) el.editor.addEventListener("submit", function (event) {
      event.preventDefault();
      try {
        if (el.editorId.value) accounts.updateAccount(el.editorId.value, { name: el.editorName.value, server: el.editorServer.value });
        else accounts.createAccount({ name: el.editorName.value, server: el.editorServer.value });
        resetEditor(); status("账号信息已保存。", false); render();
      } catch (error) { status(error.message, true); }
    });
    if (el.editorCancel) el.editorCancel.addEventListener("click", resetEditor);
    if (el.reorderToggle) el.reorderToggle.addEventListener("click", function () {
      reorderDraft = accounts.listAccounts().map(function (item) { return item.id; }); reorderFirst = null;
      el.reorderPanel.hidden = false; renderReorder(accounts.primaryAccount());
    });
    if (el.reorderCancel) el.reorderCancel.addEventListener("click", function () { el.reorderPanel.hidden = true; reorderFirst = null; });
    if (el.reorderSave) el.reorderSave.addEventListener("click", function () {
      try { accounts.reorderAccounts(reorderDraft); el.reorderPanel.hidden = true; status("账号顺序已保存。", false); render(); }
      catch (error) { status(error.message, true); }
    });
    if (el.takeover) el.takeover.addEventListener("click", function () {
      var current = accounts.currentAccount(); if (current) accounts.takeOverEditing(current.id); renderAccess(current);
    });
    accounts.subscribeAccess(function (state) {
      var current = accounts.currentAccount(); if (current && state.accountId === current.id) renderAccess(current);
    });
    var restored = accounts.consumeReturnState();
    if (restored && restored.partition) {
      var tab = doc.querySelector('.tab[data-partition="' + restored.partition.replace(/"/g, "") + '"]');
      if (tab) root.setTimeout(function () { tab.click(); }, 0);
    }
    render();
  }

  if (root && root.document) root.document.addEventListener("DOMContentLoaded", init);
  return { init: init, accountLabel: accountLabel, swapOrder: swapOrder, confirmationMatches: confirmationMatches };
});
