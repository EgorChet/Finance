#!/usr/bin/env node
/**
 * One-time upload of local/data/*.json into Supabase app_state.
 * Missing files are seeded with empty defaults — all user data lives in Supabase after this.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/seed-supabase.mjs
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "local", "data");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const EMPTY = {
  statements: { statements: {}, updated_at: null },
  rules: {},
  review: { reviewed_transactions: [], reviewed_merchants: [] },
  living_budget: { segments: [], month_topups: [], updated_at: null },
  fixed_charges: { charges: [], updated_at: null },
  exclusions: { entries: [], restored_keys: [], updated_at: null },
  adjustments: { entries: [], updated_at: null },
  calendar: { events: [], updated_at: null },
};

const rows = [
  { id: "statements", file: "statements.json" },
  { id: "rules", file: "merchant_rules.json" },
  { id: "review", file: "review_progress.json" },
  { id: "living_budget", file: "living_budget.json", alt: "user_living_budget.json" },
  { id: "fixed_charges", file: "fixed_charges.json", alt: "user_fixed_charges.json" },
  { id: "exclusions", file: "excluded_transactions.json", alt: "user_exclusions.json" },
  { id: "adjustments", file: "user_adjustments.json" },
  { id: "calendar", file: "user_calendar.json" },
];

async function upsert(id, data) {
  const res = await fetch(`${url}/rest/v1/app_state`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ id, data }),
  });
  if (!res.ok) {
    throw new Error(`${id}: ${res.status} ${await res.text()}`);
  }
  console.log(`✓ ${id}`);
}

function loadRow({ id, file, alt }) {
  for (const name of [file, alt].filter(Boolean)) {
    const filePath = path.join(dataDir, name);
    if (existsSync(filePath)) {
      console.log(`  → ${name}`);
      return JSON.parse(readFileSync(filePath, "utf-8"));
    }
  }
  console.log(`  → (empty default)`);
  return EMPTY[id];
}

for (const row of rows) {
  const data = loadRow(row);
  await upsert(row.id, data);
}

console.log("Done — app data is in Supabase.");
