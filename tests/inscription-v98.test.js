"use strict";

const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const fixtures = path.join(__dirname, "fixtures", "inscription-v98");
const golden = path.join(fixtures, "02_计算黄金用例_固定输入与预期.json");

function run(context, name, args) {
  try {
    context.diagnostic(execFileSync(process.execPath, [path.join(fixtures, name)].concat(args), {
      cwd: root, encoding: "utf8", windowsHide: true
    }).trim());
  } catch (error) {
    context.diagnostic([error.stdout, error.stderr].filter(Boolean).join("\n"));
    throw error;
  }
}

test("G01–G16 fixed golden cases: exact sets, errors, probabilities and normalization", context => {
  run(context, "03_黄金用例检查器_待授权运行.cjs", [root, golden]);
});

test("G05–G07 independent enumeration, without invoking production rules", context => {
  run(context, "14_G06G07独立组合Oracle_待授权运行.cjs", [golden]);
});

require("./fixtures/inscription-v98/15_H01-H08_可重放跨事件测试_需授权.cjs");
