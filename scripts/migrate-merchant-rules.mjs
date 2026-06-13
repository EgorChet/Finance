#!/usr/bin/env node
/**
 * Normalize retired category names in merchant_rules.json before seeding prod.
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

/** Retired rule categories → current canonical labels (keep in sync with api reportService). */
const CATEGORY_MIGRATIONS = {
  "Sibus Flexi": "Groceries",
  "Home & Electronics": "Home & Furniture",
};

const inputPath = path.resolve(root, process.argv[2] || "statements/merchant_rules.json");
const outputPath = path.resolve(root, process.argv[3] || "data/merchant_rules.json");

const rules = JSON.parse(readFileSync(inputPath, "utf-8"));
let changed = 0;

for (const [hebrew, rule] of Object.entries(rules)) {
  const mapped = CATEGORY_MIGRATIONS[rule.category];
  if (!mapped) continue;
  rules[hebrew] = { ...rule, category: mapped };
  changed += 1;
}

writeFileSync(outputPath, `${JSON.stringify(rules, null, 2)}\n`, "utf-8");

console.log(`Read ${Object.keys(rules).length} rules from ${path.relative(root, inputPath)}`);
console.log(`Migrated ${changed} categor${changed === 1 ? "y" : "ies"}`);
console.log(`Wrote ${path.relative(root, outputPath)}`);
