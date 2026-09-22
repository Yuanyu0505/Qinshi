#!/usr/bin/env node

import fs from "node:fs";
import { TextDecoder } from "node:util";

const CANARY_FIELDS = Object.freeze([
  ["deviceName", "device-name"],
  ["qinshiValue", "qinshi-value"],
  ["password", "password"],
  ["recoveryKey", "recovery-key"],
  ["deviceToken", "device-token"]
]);

class InputError extends Error {}

function usage() {
  return "用法：node scripts/check-smoke-export.mjs <本地 D1 导出.sql> <canary 清单.json>";
}

function readUtf8(pathname, kind) {
  let bytes;
  try {
    bytes = fs.readFileSync(pathname);
  } catch {
    throw new InputError(`无法读取${kind}文件`);
  }
  try {
    return { bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    throw new InputError(`${kind}文件不是有效 UTF-8`);
  }
}

function readCanaries(pathname) {
  const { text } = readUtf8(pathname, "canary 清单");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InputError("canary 清单无效：必须是 JSON 对象");
  }
  const expected = CANARY_FIELDS.map(([field]) => field);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" ||
      Object.keys(parsed).sort().join("\0") !== expected.slice().sort().join("\0")) {
    throw new InputError("canary 清单无效：必须且只能包含五个规定分类");
  }
  const seen = new Set();
  return CANARY_FIELDS.map(([field, label]) => {
    const value = parsed[field];
    if (typeof value !== "string" || !value.trim() || value.length > 4096 || seen.has(value)) {
      throw new InputError("canary 清单无效：五个值必须是非空、互异的短字符串");
    }
    seen.add(value);
    return Object.freeze({ label, bytes: Buffer.from(value, "utf8") });
  });
}

function parseHexBlobs(sqlText) {
  const blobs = [];
  const startPattern = /\bX'/gi;
  let match;
  while ((match = startPattern.exec(sqlText)) !== null) {
    const contentStart = startPattern.lastIndex;
    const contentEnd = sqlText.indexOf("'", contentStart);
    if (contentEnd < 0) throw new InputError("SQL 十六进制 BLOB 无效：缺少结束引号");
    const hex = sqlText.slice(contentStart, contentEnd);
    if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) {
      throw new InputError("SQL 十六进制 BLOB 无效：内容必须是完整字节");
    }
    blobs.push(Buffer.from(hex, "hex"));
    startPattern.lastIndex = contentEnd + 1;
  }
  return blobs;
}

function encodedNeedles(bytes) {
  const base64 = bytes.toString("base64");
  const base64url = bytes.toString("base64url");
  const paddedBase64url = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  return [
    { bytes: Buffer.from(base64, "ascii"), kind: "base64" },
    { bytes: Buffer.from(base64.replace(/=+$/, ""), "ascii"), kind: "base64" },
    { bytes: Buffer.from(base64url, "ascii"), kind: "base64url" },
    { bytes: Buffer.from(paddedBase64url, "ascii"), kind: "base64url" }
  ];
}

function inspect(sqlBytes, sqlText, canaries) {
  const findings = [];
  const regions = [{ bytes: sqlBytes, kind: "raw" }];
  for (const blob of parseHexBlobs(sqlText)) regions.push({ bytes: blob, kind: "hex-blob" });

  for (const canary of canaries) {
    for (const region of regions) {
      if (region.bytes.indexOf(canary.bytes) >= 0) findings.push({ label: canary.label, kind: region.kind });
      for (const encoded of encodedNeedles(canary.bytes)) {
        if (region.bytes.indexOf(encoded.bytes) >= 0) {
          const prefix = region.kind === "raw" ? "" : `${region.kind}/`;
          findings.push({ label: canary.label, kind: `${prefix}${encoded.kind}` });
        }
      }
    }
  }
  return findings;
}

function main(argv) {
  if (argv.length !== 2) throw new InputError(usage());
  const { bytes: sqlBytes, text: sqlText } = readUtf8(argv[0], "SQL 导出");
  const canaries = readCanaries(argv[1]);
  const findings = inspect(sqlBytes, sqlText, canaries);
  if (findings.length) {
    const unique = new Map(findings.map((finding) => [`${finding.label}\0${finding.kind}`, finding]));
    for (const finding of unique.values()) process.stderr.write(`发现禁止明文：${finding.label} [${finding.kind}]\n`);
    return 1;
  }
  process.stdout.write("检查完成：未发现已知明文 canary。\n");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof InputError) process.stderr.write(`错误：${error.message}\n`);
  else process.stderr.write("错误：校验器发生未预期失败；未输出任何 canary 值。\n");
  process.exitCode = 2;
}
