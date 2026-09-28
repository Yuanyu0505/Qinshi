const { test } = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../data/wooden-man-alley.js");
const CORE = require("./wooden-man-alley.js");
const PLANNER = require("./wooden-man-alley-planner.js");
const UI = require("./wooden-man-alley-ui.js");

function fakeStore() {
  let active = "a";
  const accounts = { a: { id: "a", name: "主号", server: "一区" }, b: { id: "b", name: "小号", server: "二区" } };
  const values = { a: {}, b: {} };
  return {
    currentAccount: () => accounts[active],
    switchTo: id => { active = id; },
    getItem: key => values[active][key] ?? null,
    setItem: (key, value) => { values[active][key] = String(value); return true; },
    removeItem: key => { delete values[active][key]; return true; },
    raw: values
  };
}

function controller(options = {}) {
  return UI.createController(Object.assign({ data: DATA, core: CORE, planner: PLANNER, store: fakeStore(), confirm: () => true }, options));
}

test("loads missing or corrupt progress with safe defaults", () => {
  const store = fakeStore();
  store.setItem(UI.STORE_KEY, "not json");
  const control = controller({ store });
  assert.strictEqual(control.state.progress.currentFloor, 1);
  assert.deepEqual(control.state.progress.openedCells, []);
  assert.match(control.state.error, /读取失败/);
});

test("keeps progress isolated between game accounts", () => {
  const store = fakeStore();
  const first = controller({ store });
  first.setResource("woodSword", 20);
  store.switchTo("b");
  const second = controller({ store });
  assert.strictEqual(second.state.progress.resources.woodSword, 0);
  second.setResource("woodSword", 3);
  store.switchTo("a");
  const restored = controller({ store });
  assert.strictEqual(restored.state.progress.resources.woodSword, 20);
  assert.strictEqual(restored.accountLabel(), "主号 · 一区");
});

test("toggles, undoes and clears board cells", () => {
  const control = controller();
  control.toggleCell(2);
  assert.deepEqual(control.state.progress.openedCells, [2]);
  control.undoBoard();
  assert.deepEqual(control.state.progress.openedCells, []);
  control.toggleCell(1);
  control.clearBoard();
  assert.deepEqual(control.state.progress.openedCells, []);
});

test("all opened cells and explicit completion advance the floor", () => {
  const control = controller();
  for (let index = 0; index < 9; index += 1) control.toggleCell(index);
  assert.strictEqual(control.state.progress.currentFloor, 2);
  assert.deepEqual(control.state.progress.openedCells, []);
  control.completeFloor();
  assert.strictEqual(control.state.progress.currentFloor, 3);
});

test("floor 500 completion stops without creating floor 501", () => {
  const control = controller();
  control.setFloor(500);
  control.completeFloor();
  assert.strictEqual(control.state.progress.currentFloor, 500);
  assert.strictEqual(control.state.progress.completedAllFloors, true);
});

test("calculator drafts do not persist until explicit save", () => {
  const store = fakeStore();
  const control = controller({ store });
  const draft = CORE.normalizeProgress({ currentFloor: 12, resources: { woodSword: 88 } }, DATA);
  control.setCalculatorDraft(draft);
  assert.strictEqual(JSON.parse(store.getItem(UI.STORE_KEY) || "{}").currentFloor || 1, 1);
  control.saveCalculatorProgress();
  assert.strictEqual(JSON.parse(store.getItem(UI.STORE_KEY)).currentFloor, 12);
});

test("captures and restores subpage view state", () => {
  const control = controller();
  control.setMode("reference");
  const snapshot = control.captureView();
  control.setMode("progress");
  control.restoreView(snapshot);
  assert.strictEqual(control.state.mode, "reference");
});
