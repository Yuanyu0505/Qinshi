"use strict";
var loadedKinds = {};
function loadKind(kind) {
  if (loadedKinds[kind]) return;
  var paths;
  if (kind === "wooden") paths = ["../data/wooden-man-alley.js", "wooden-man-alley.js", "wooden-man-alley-planner.js"];
  else if (kind === "secret-realm") paths = ["secret-realm-planner.js"];
  else if (kind === "beast-single" || kind === "beast-school") paths = ["../data/machine-beasts.js", "machine-beasts.js", "machine-beast-school-planner.js"];
  else throw new Error("未知计算类型");
  paths.forEach(function (path) { importScripts(path + self.location.search); });
  loadedKinds[kind] = true;
}
self.onmessage = function (event) {
  var message = event.data || {};
  try {
    loadKind(message.kind);
    var payload = message.input, result;
    if (message.kind === "secret-realm") {
      result = self.SECRET_REALM_PLANNER.plan(payload);
    } else if (message.kind === "wooden") {
      result = payload.direction === "reachable"
        ? self.WOODEN_MAN_ALLEY_PLANNER.planReachable(payload.input, self.WOODEN_MAN_ALLEY_DATA, self.WOODEN_MAN_ALLEY_CORE)
        : self.WOODEN_MAN_ALLEY_PLANNER.planToTarget(payload.input, self.WOODEN_MAN_ALLEY_DATA, self.WOODEN_MAN_ALLEY_CORE);
    } else if (message.kind === "beast-single") {
      var beast = self.MACHINE_BEAST_DATA.beasts.find(function (item) { return item.id === payload.beastId; });
      result = self.MACHINE_BEAST_CORE.calculateInvestmentPlan(self.MACHINE_BEAST_DATA, beast, payload.progress, payload.options);
    } else {
      result = self.MACHINE_BEAST_SCHOOL_PLANNER.calculateSchoolPlans(self.MACHINE_BEAST_DATA, payload.schoolId, payload.progressByBeast, payload.options);
    }
    self.postMessage({ id: message.id, result: result });
  } catch (error) { self.postMessage({ id: message.id, error: error.message || "计算失败" }); }
};
