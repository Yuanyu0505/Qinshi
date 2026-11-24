"use strict";

// Same rules as the UI. The worker cannot read or write account storage.
var revision = self.location.search;
importScripts("inscription-rules.js" + revision, "inscription-paths.js" + revision);
var routeRequest = self.InscriptionPaths.serveRouteRequests(self);

self.onmessage = function (event) {
  try {
    var data = event.data;
    if (data.type === "inspect-workbench" || data.type === "prepare-workbench-write") {
      importScripts("inscription-simulation.js" + revision, "inscription-crafting-state.js" + revision);
      self.postMessage({ result: self.InscriptionCraftingState.runWorkbenchSnapshot(data) });
    } else routeRequest(event);
  } catch (error) {
    self.postMessage({ error: String(error.message || error) });
  }
};
