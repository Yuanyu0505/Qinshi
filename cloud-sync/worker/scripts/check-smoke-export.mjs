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
const MIB = 1024 * 1024;
const MAX_EXPORT_BYTES = 256 * MIB;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_TOTAL_BLOB_BYTES = 128 * MIB;
const MAX_BASE64_CANDIDATE_CHARS = 16 * MIB;
const MAX_BASE64_CANDIDATES = 250000;
const MAX_TOTAL_DECODED_CANDIDATE_BYTES = 256 * MIB;
const MAX_SQL_STATEMENT_CHARS = 1 * MIB;
const MAX_SQL_STATEMENTS = 1000000;

class InputError extends Error {}

function usage() {
  return "用法：node scripts/check-smoke-export.mjs <本地 D1 导出.sql> <canary 清单.json>";
}

function readUtf8(pathname, kind, maxBytes) {
  let bytes;
  try {
    const stat = fs.statSync(pathname);
    if (!stat.isFile()) throw new Error("not a file");
    if (stat.size > maxBytes) throw new InputError(`${kind}文件过大，已停止检查`);
    bytes = fs.readFileSync(pathname);
    if (bytes.length > maxBytes) throw new InputError(`${kind}文件过大，已停止检查`);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(`无法读取${kind}文件`);
  }
  try {
    return { bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    throw new InputError(`${kind}文件不是有效 UTF-8`);
  }
}

function readCanaries(pathname) {
  const { text } = readUtf8(pathname, "canary 清单", MAX_MANIFEST_BYTES);
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
  let totalBytes = 0;
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
    totalBytes += hex.length / 2;
    if (totalBytes > MAX_TOTAL_BLOB_BYTES) throw new InputError("SQL 十六进制 BLOB 总量过大，已停止检查");
    blobs.push({ bytes: Buffer.from(hex, "hex"), start: match.index, end: contentEnd + 1 });
    startPattern.lastIndex = contentEnd + 1;
  }
  return blobs;
}

function validateSqlExport(sqlText) {
  if (!sqlText.trim()) throw new InputError("SQL 导出无效：文件为空");
  const requiredTables = new Set(["sync_spaces", "devices", "snapshot_chunks"]);
  let state = "normal";
  let statement = "";
  let depth = 0;
  let statementCount = 0;
  let firstStatement = "";
  let lastStatement = "";
  let beginCount = 0;
  let commitCount = 0;
  let beginStatementPosition = 0;

  function append(character) {
    if (statement.length >= MAX_SQL_STATEMENT_CHARS) {
      throw new InputError("SQL 导出无效：单条语句过大");
    }
    statement += character;
  }

  function finishStatement() {
    const value = statement.slice(0, -1).trim();
    statement = "";
    if (!value) return;
    statementCount += 1;
    if (statementCount > MAX_SQL_STATEMENTS) throw new InputError("SQL 导出无效：语句数量过多");
    if (!firstStatement) firstStatement = value;
    lastStatement = value;
    if (/^BEGIN(?:\s+(?:DEFERRED|IMMEDIATE|EXCLUSIVE))?(?:\s+TRANSACTION)?$/i.test(value)) {
      beginCount += 1;
      beginStatementPosition = statementCount;
    }
    if (/^(?:COMMIT|END)(?:\s+TRANSACTION)?$/i.test(value)) commitCount += 1;
    for (const table of [...requiredTables]) {
      const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const create = new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:[\"\\x60\\[]?${escaped}[\"\\x60\\]]?)\\s*\\(`, "i");
      if (create.test(value)) requiredTables.delete(table);
    }
  }

  for (let index = 0; index < sqlText.length; index += 1) {
    const character = sqlText[index];
    const next = sqlText[index + 1];
    if (state === "line-comment") {
      if (character === "\n") { state = "normal"; append("\n"); }
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") { state = "normal"; index += 1; append(" "); }
      continue;
    }
    if (state === "single-quote") {
      if (character === "'" && next === "'") { index += 1; continue; }
      if (character === "'") { state = "normal"; append(" "); }
      continue;
    }
    if (state === "double-quote") {
      append(character);
      if (character === '"' && next === '"') { append(next); index += 1; continue; }
      if (character === '"') state = "normal";
      continue;
    }
    if (character === "-" && next === "-") { state = "line-comment"; index += 1; append(" "); continue; }
    if (character === "/" && next === "*") { state = "block-comment"; index += 1; append(" "); continue; }
    if (character === "'") { state = "single-quote"; append(" "); continue; }
    if (character === '"') { state = "double-quote"; append(character); continue; }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth < 0) throw new InputError("SQL 导出无效：括号不匹配");
    }
    append(character);
    if (character === ";" && depth === 0) finishStatement();
  }

  if (state === "single-quote" || state === "double-quote" || state === "block-comment") {
    throw new InputError("SQL 导出无效：存在未闭合内容");
  }
  if (depth !== 0 || statement.trim()) throw new InputError("SQL 导出无效：末尾语句不完整");
  if (requiredTables.size) throw new InputError("SQL 导出无效：缺少必要的数据表");
  const wranglerPreamble = /^PRAGMA\s+defer_foreign_keys\s*=\s*(?:TRUE|1)$/i.test(firstStatement);
  const transactional = beginCount === 1 && commitCount === 1 &&
    (beginStatementPosition === 1 || (wranglerPreamble && beginStatementPosition === 2)) &&
    /^(?:COMMIT|END)(?:\s+TRANSACTION)?$/i.test(lastStatement);
  const wranglerExport = wranglerPreamble && beginCount === 0 && commitCount === 0;
  if (!wranglerExport && !transactional) {
    throw new InputError("SQL 导出无效：事务或 Wrangler 导出边界不完整");
  }
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

function decodeBase64Candidate(token) {
  if (token.length > MAX_BASE64_CANDIDATE_CHARS) {
    throw new InputError("SQL Base64 候选过大，已停止检查");
  }
  const paddingAt = token.indexOf("=");
  const body = paddingAt < 0 ? token : token.slice(0, paddingAt);
  const padding = paddingAt < 0 ? "" : token.slice(paddingAt);
  if (body.length < 2 || body.length % 4 === 1 || (padding && !/^={1,2}$/.test(padding))) return null;
  const expectedPadding = (4 - (body.length % 4)) % 4;
  if (padding && (token.length % 4 !== 0 || padding.length !== expectedPadding)) return null;
  const standardOnly = /[+/]/.test(body);
  const urlOnly = /[-_]/.test(body);
  if (standardOnly && urlOnly) return null;
  const kind = urlOnly ? "base64url" : "base64";
  const normalized = urlOnly ? body.replace(/-/g, "+").replace(/_/g, "/") : body;
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64");
  const canonical = urlOnly ? decoded.toString("base64url") : decoded.toString("base64").replace(/=+$/, "");
  return canonical === body ? { bytes: decoded, kind } : null;
}

function inspectCandidates(text, location, canaries, skipRanges, budget, findings) {
  const pattern = /[A-Za-z0-9+/_-]{2,}={0,2}/g;
  let rangeIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    budget.candidates += 1;
    if (budget.candidates > MAX_BASE64_CANDIDATES) throw new InputError("SQL Base64 候选过多，已停止检查");
    const matchEnd = match.index + match[0].length;
    while (rangeIndex < skipRanges.length && skipRanges[rangeIndex].end <= match.index) rangeIndex += 1;
    if (rangeIndex < skipRanges.length && skipRanges[rangeIndex].start < matchEnd && skipRanges[rangeIndex].end > match.index) continue;
    const decoded = decodeBase64Candidate(match[0]);
    if (!decoded) continue;
    budget.decodedBytes += decoded.bytes.length;
    if (budget.decodedBytes > MAX_TOTAL_DECODED_CANDIDATE_BYTES) {
      throw new InputError("SQL Base64 解码总量过大，已停止检查");
    }
    for (const canary of canaries) {
      if (decoded.bytes.indexOf(canary.bytes) >= 0) {
        findings.push({ label: canary.label, kind: `${location === "raw" ? "" : `${location}/`}${decoded.kind}` });
      }
    }
  }
}

function inspect(sqlBytes, sqlText, canaries, blobs) {
  const findings = [];
  const regions = [{ bytes: sqlBytes, kind: "raw" }];
  for (const blob of blobs) regions.push({ bytes: blob.bytes, kind: "hex-blob" });

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
  const budget = { candidates: 0, decodedBytes: 0 };
  inspectCandidates(sqlText, "raw", canaries, blobs, budget, findings);
  for (const blob of blobs) inspectCandidates(blob.bytes.toString("latin1"), "hex-blob", canaries, [], budget, findings);
  return findings;
}

function main(argv) {
  if (argv.length !== 2) throw new InputError(usage());
  const { bytes: sqlBytes, text: sqlText } = readUtf8(argv[0], "SQL 导出", MAX_EXPORT_BYTES);
  const canaries = readCanaries(argv[1]);
  validateSqlExport(sqlText);
  const blobs = parseHexBlobs(sqlText);
  const findings = inspect(sqlBytes, sqlText, canaries, blobs);
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
