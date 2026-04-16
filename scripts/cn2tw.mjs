#!/usr/bin/env node
/**
 * Convert zh-CN.json to zh-TW.json using OpenCC + post-processing replacement table.
 *
 * Usage:
 *   node scripts/cn2tw.mjs            # dry-run, prints coverage stats
 *   node scripts/cn2tw.mjs --write    # overwrite zh-TW.json
 *
 * Requirements: opencc (brew install opencc)
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(__dirname, "..", "packages", "ui", "messages");
const shouldWrite = process.argv.includes("--write");

// ─── Global replacement table (OpenCC s2twp → Taiwan preferred terms) ───
// Safe global string replacements — no context ambiguity.
// Order: longer strings first to avoid partial matches.
const globalReplacements = [
  // 歸檔 → 封存
  ["歸檔", "封存"],
  // 重置 → 重設
  ["重置", "重設"],
  // 更改 → 變更
  ["更改", "變更"],
  // 覆蓋 → 覆寫 (override context)
  ["覆蓋", "覆寫"],
  // 全域性 → 全域 (OpenCC over-converts)
  ["全域性", "全域"],
  // 許可權 → 權限
  ["許可權", "權限"],
  // 自定義 → 自訂
  ["自定義", "自訂"],
  // 當前 → 目前
  ["當前", "目前"],
  // 引數 → 參數 (programming context)
  ["引數", "參數"],
  // 社羣 → 社群
  ["社羣", "社群"],
  // 高階 → 進階 (advanced)
  ["高階", "進階"],
  // 身份 → 身分
  ["身份", "身分"],
  // 死迴圈 → 死循環
  ["死迴圈", "死循環"],
];

// ─── Per-key overrides ──────────────────────────────────────────────────
// For terms where global replacement is too aggressive (e.g. "智慧體" → "代理"
// would corrupt existing "智慧代理" compounds). Instead, map specific keys.
// Key format: "key": "exact replacement value"
// Values here are the FINAL output — they override everything.
const keyOverrides = {};

// ─── Load source files ───────────────────────────────────────────────────

const zhCN = JSON.parse(readFileSync(join(messagesDir, "zh-CN.json"), "utf8"));
const zhTWExisting = JSON.parse(readFileSync(join(messagesDir, "zh-TW.json"), "utf8"));
const en = JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8"));

// ─── OpenCC conversion ───────────────────────────────────────────────────

const NEWLINE_PLACEHOLDER = "⏎LINEBREAK⏎";
const keys = Object.keys(zhCN);
const values = keys.map((k) => zhCN[k].replace(/\n/g, NEWLINE_PLACEHOLDER));

const tmpIn = "/tmp/cn2tw-input.txt";
const tmpOut = "/tmp/cn2tw-output.txt";
writeFileSync(tmpIn, values.join("\n"));

execSync(`opencc -c s2twp.json -i ${tmpIn} -o ${tmpOut}`, { stdio: "pipe" });

const convertedLines = readFileSync(tmpOut, "utf8").split("\n");

// ─── Apply replacement table ─────────────────────────────────────────────

function applyGlobalReplacements(text) {
  let result = text;
  for (const [from, to] of globalReplacements) {
    result = result.replaceAll(from, to);
  }
  return result;
}

// ─── Build output ────────────────────────────────────────────────────────

const zhTWNew = {};
for (let i = 0; i < keys.length; i++) {
  const k = keys[i];
  let val = convertedLines[i] || "";
  // Restore newlines
  val = val.replace(new RegExp(NEWLINE_PLACEHOLDER, "g"), "\n");
  // Apply global replacements
  val = applyGlobalReplacements(val);
  // Apply per-key override if present
  if (keyOverrides[k]) {
    val = keyOverrides[k];
  }
  zhTWNew[k] = val;
}

// ─── Stats ───────────────────────────────────────────────────────────────

let stats = {
  total: keys.length,
  cnIsEn: 0, // both CN and EN same — no Chinese to convert
  twWasEn: 0, // existing TW was still English — now fixed
  exactMatch: 0, // output matches existing TW exactly
  differs: 0, // output differs from existing TW
};

const diffs = [];

for (const k of keys) {
  const cn = zhCN[k];
  const twOld = zhTWExisting[k];
  const twNew = zhTWNew[k];
  const enVal = en[k];

  if (cn === enVal && twOld === enVal) {
    stats.cnIsEn++;
    continue;
  }

  if (twOld === enVal && cn !== enVal) {
    stats.twWasEn++;
    continue;
  }

  if (twNew === twOld) {
    stats.exactMatch++;
  } else {
    stats.differs++;
    if (diffs.length < 100) {
      diffs.push({ key: k, opencc: twNew, existing: twOld });
    }
  }
}

const translated = stats.total - stats.cnIsEn;
console.log(`=== cn→tw conversion (opencc s2twp + replacements) ===\n`);
console.log(`Total keys:                ${stats.total}`);
console.log(`No translation needed:     ${stats.cnIsEn}`);
console.log(`Previously untranslated:   ${stats.twWasEn} (now fixed)`);
console.log(
  `Exact match existing TW:   ${stats.exactMatch} (${((stats.exactMatch / translated) * 100).toFixed(1)}%)`,
);
console.log(
  `Differs from existing TW:  ${stats.differs} (${((stats.differs / translated) * 100).toFixed(1)}%)`,
);

const covered = stats.exactMatch + stats.twWasEn;
console.log(
  `\nCoverage: ${covered}/${translated} (${((covered / translated) * 100).toFixed(1)}%)`,
);

if (diffs.length > 0) {
  console.log(`\n=== Remaining diffs (sample) ===`);
  diffs.slice(0, 30).forEach((d) => {
    console.log(`  ${d.key}:`);
    console.log(`    new:      ${d.opencc}`);
    console.log(`    existing: ${d.existing}`);
  });
  if (diffs.length > 30) {
    console.log(`  ... and ${diffs.length - 30} more`);
  }
}

// ─── Write output ────────────────────────────────────────────────────────

if (shouldWrite) {
  // Preserve key order from zh-CN
  const sorted = {};
  keys.forEach((k) => (sorted[k] = zhTWNew[k]));
  writeFileSync(
    join(messagesDir, "zh-TW.json"),
    JSON.stringify(sorted, null, 2) + "\n",
  );
  console.log(`\n✅ Written to zh-TW.json`);
} else {
  console.log(`\nDry run — use --write to apply.`);
}
