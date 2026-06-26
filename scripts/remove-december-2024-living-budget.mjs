#!/usr/bin/env node
/**
 * Remove the Jan 2024 → Dec 2024 living budget period from Supabase.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/remove-december-2024-living-budget.mjs
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const res = await fetch(`${url}/rest/v1/app_state?id=eq.living_budget&select=data`, { headers });
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const rows = await res.json();
const data = rows[0]?.data;
if (!data?.segments?.length) {
  console.log("No living budget segments in Supabase — nothing to change.");
  process.exit(0);
}

const before = data.segments.length;
const segments = data.segments.filter(
  (s) => !(s.from_month === "2024-01" && s.through_month === "2024-12"),
);

if (segments.length === before) {
  console.log("Jan 2024 → Dec 2024 period not found — already removed or different dates.");
  process.exit(0);
}

const next = { ...data, segments, updated_at: new Date().toISOString() };
const save = await fetch(`${url}/rest/v1/app_state?id=eq.living_budget`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ data: next }),
});

if (!save.ok) {
  console.error(`Save failed: ${save.status} ${await save.text()}`);
  process.exit(1);
}

console.log(`Removed Jan 2024 → Dec 2024 period (${before} → ${segments.length} segments).`);
