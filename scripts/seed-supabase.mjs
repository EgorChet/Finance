#!/usr/bin/env node
/**
 * One-time upload of local data/*.json into Supabase app_state.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-supabase.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const rows = [
  { id: "statements", file: "statements.json" },
  { id: "rules", file: "merchant_rules.json" },
  { id: "review", file: "review_progress.json" },
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

for (const { id, file } of rows) {
  const filePath = path.join(dataDir, file);
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  await upsert(id, data);
}

console.log("Done — production API can now read your data from Supabase.");
