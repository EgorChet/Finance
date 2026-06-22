#!/usr/bin/env node
/**
 * Normalize merchant_rules.json: retired categories + chain vendor names.
 *
 * Usage:
 *   node scripts/migrate-merchant-rules.mjs [input] [output]
 *
 * Defaults: statements/merchant_rules.json → data/merchant_rules.json
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Retired categories → current canonical labels (keep in sync with api reportService). */
const CATEGORY_MIGRATIONS = {
  "Sibus Flexi": "Groceries",
  "Home & Electronics": "Home & Furniture",
};

/** Keep in sync with api/src/utils/merchantVendor.ts */
function canonicalMerchantEnglish(english, hebrew = "") {
  const n = (english || "").trim();
  if (!n) return n;
  const text = `${hebrew} ${n}`;

  if (/leumi\s*bonus|לאומי\s*בונוס/i.test(text)) return "Leumi Bonus";
  if (/arcaff|ארקפה/i.test(text)) return "Arcaffe";
  if (/good\s*[- ]?pharm|גוד\s*פארם/i.test(text)) return "Good Pharm";
  if (/super\s*[- ]?pharm|superpharm|סופר\s*פארם/i.test(text)) return "Super Pharm";
  if (/tiv\s*taam|טיב\s*טעם/i.test(text)) return "Tiv Taam";
  if (/shufersal|שופרסל/i.test(text)) return "Shufersal";
  if (/carrefour|קרפור/i.test(text)) return "Carrefour";
  if (/\bam:pm\b|am\s*pm/i.test(text)) return "AM:PM";
  if (/\bwolt\b|וולט/i.test(text) && !/tiv\s*taam|טיב\s*טעם/i.test(text)) return "Wolt";

  return n;
}

const inputPath = path.resolve(root, process.argv[2] || "statements/merchant_rules.json");
const outputPath = path.resolve(root, process.argv[3] || "data/merchant_rules.json");

const rules = JSON.parse(readFileSync(inputPath, "utf-8"));
let categoryChanges = 0;
let vendorChanges = 0;

for (const [hebrew, rule] of Object.entries(rules)) {
  let next = { ...rule };

  const mapped = CATEGORY_MIGRATIONS[next.category];
  if (mapped) {
    next.category = mapped;
    categoryChanges += 1;
  }

  const canon = canonicalMerchantEnglish(next.english || "", hebrew);
  if (canon && canon !== next.english) {
    next.english = canon;
    vendorChanges += 1;
  }

  rules[hebrew] = next;
}

writeFileSync(outputPath, `${JSON.stringify(rules, null, 2)}\n`, "utf-8");

console.log(`Read ${Object.keys(rules).length} rules from ${path.relative(root, inputPath)}`);
console.log(`Category migrations: ${categoryChanges}`);
console.log(`Vendor rollups: ${vendorChanges}`);
console.log(`Wrote ${path.relative(root, outputPath)}`);
