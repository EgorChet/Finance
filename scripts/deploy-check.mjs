#!/usr/bin/env node
/**
 * Pre-deploy checklist — run from repo root: node scripts/deploy-check.mjs
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, "data");

const checks = [];

function ok(msg) {
  checks.push({ ok: true, msg });
}
function warn(msg) {
  checks.push({ ok: false, msg });
}

if (existsSync(path.join(root, ".git"))) ok("Git repository initialized");
else warn("No git repo — run: git init && git add . && git commit -m 'Initial commit'");

for (const f of ["web/package.json", "api/package.json", "render.yaml", "supabase/schema.sql"]) {
  if (existsSync(path.join(root, f))) ok(`Found ${f}`);
  else warn(`Missing ${f}`);
}

for (const f of ["data/statements.json", "data/merchant_rules.json"]) {
  const p = path.join(dataDir, f.replace("data/", ""));
  if (existsSync(p)) ok(`Local ${f} exists (ready to seed Supabase)`);
  else warn(`${f} missing locally — seed step will fail until you export data`);
}

if (existsSync(path.join(dataDir, "fixed_charges.json"))) ok("fixed_charges.json present (ships with API Docker image)");

const gitignore = readFileSync(path.join(root, ".gitignore"), "utf-8");
if (gitignore.includes("data/statements.json")) ok("statements.json is gitignored");
else warn("Add data/statements.json to .gitignore before pushing to a public repo");

console.log("\nFinance deploy checklist\n");
for (const c of checks) {
  console.log(`${c.ok ? "✓" : "⚠"}  ${c.msg}`);
}

console.log(`
Next steps (see DEPLOY.md):

  1. Push to a private GitHub repo
  2. Supabase → run supabase/schema.sql → seed with scripts/seed-supabase.mjs
  3. Render → New Blueprint → render.yaml → set AUTH_PASSWORD, Supabase keys, ALLOWED_ORIGINS
  4. GitHub → Settings → Pages → GitHub Actions
  5. GitHub → Variables → VITE_API_URL = your Render API URL (no trailing slash)
  6. Push to main → site live at https://YOUR_USER.github.io/REPO_NAME/
`);

process.exit(checks.some((c) => !c.ok) ? 1 : 0);
