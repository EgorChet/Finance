#!/usr/bin/env node
/**
 * Pre-deploy checklist — run from repo root: node tools/deploy-check.mjs
 */
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const checks = [];

function ok(msg) {
  checks.push({ ok: true, msg });
}
function warn(msg) {
  checks.push({ ok: false, msg });
}

if (existsSync(path.join(root, ".git"))) ok("Git repository initialized");
else warn("No git repo — run: git init && git add . && git commit -m 'Initial commit'");

for (const f of [
  "web/package.json",
  "api/package.json",
  "analyzer/Dockerfile",
  "analyzer/requirements.txt",
  "render.yaml",
  "supabase/schema.sql",
]) {
  if (existsSync(path.join(root, f))) ok(`Found ${f}`);
  else warn(`Missing ${f}`);
}

const gitignore = readFileSync(path.join(root, ".gitignore"), "utf-8");
if (gitignore.includes(".env")) ok(".env is gitignored");
else warn("Add .env to .gitignore before pushing");

const envExample = existsSync(path.join(root, ".env.example"))
  ? readFileSync(path.join(root, ".env.example"), "utf-8")
  : "";
if (envExample.includes("SUPABASE_URL")) ok(".env.example documents Supabase keys");
else warn(".env.example should document SUPABASE_URL");

console.log("\nFinance deploy checklist\n");
for (const c of checks) {
  console.log(`${c.ok ? "✓" : "⚠"}  ${c.msg}`);
}

console.log(`
Next steps (see docs/DEPLOY.md):

  1. Push to a private GitHub repo
  2. Supabase → run supabase/schema.sql
  3. Render → New Blueprint → render.yaml → set AUTH_PASSWORD, Supabase keys, ALLOWED_ORIGINS
  4. GitHub → Settings → Pages → GitHub Actions
  5. GitHub → Variables → VITE_API_URL = your Render API URL (no trailing slash)
  6. Locally: put the same Supabase keys in .env and run the app
`);

process.exit(checks.some((c) => !c.ok) ? 1 : 0);
