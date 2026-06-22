# Finance — Hebrew Bank Statement Analyzer

Parse Leumi Visa exports (Hebrew), summarize spending in English, remember monthly statements and merchant labels.

**Stack:** Vue 3 frontend · Node.js API · Python analyzer (XLSX parsing)

## Quick start (local)

```bash
# 1. Python analyzer
pip install -r requirements.txt
uvicorn analyzer_api.main:app --port 8001

# 2. Node API (new terminal) — copy .env.example to .env and set Supabase keys
cd api && npm install && npm run dev

# 3. Vue app (new terminal)
cd web && npm install && npm run dev
```

Open http://localhost:5173

Or use Docker:

```bash
docker compose up --build
```

Open http://localhost:5173

## Auth & demo mode

When deployed, set `AUTH_PASSWORD` and `AUTH_SECRET` on the API (Render).

- **Sign in** — password protects your real statements
- **Try demo** — no password; sample spending data only (upload/sync disabled)

Locally, leave `AUTH_PASSWORD` empty to skip login.

## Data

All personal data (statements, merchant rules, fixed charges, living budget, exclusions, calendar) lives in **Supabase** (`app_state` table). Nothing is hardcoded in the repo.

For local dev, copy `.env.example` → `.env` and set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. The API reads and writes through Supabase automatically.

To seed Supabase from any local JSON you still have on disk:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-supabase.mjs
```

Put `.xlsx` files in `statements/` and click **Sync** in the app, or run:

```bash
python cli.py --sync
```

(`cli.py` saves to local `data/statements.json` only — use the web app + Supabase for the full workflow.)

## Deploy (free tier, password-protected)

Full step-by-step: **[DEPLOY.md](./DEPLOY.md)**

Summary:

1. **Supabase** — store `statements`, rules, review progress (not in git)
2. **Render** — API + analyzer; set `AUTH_PASSWORD`, `AUTH_SECRET`, Supabase keys
3. **GitHub Pages** — Vue app; set repo variable `VITE_API_URL` to your Render API URL

Sign in with the shared password to see real data. **Try demo** works without login (sample data only).

Monthly workflow: sign in on the deployed site → **Upload statement** for new `.xlsx` files.

## CLI (offline)

```bash
python cli.py --sync
python cli.py "statements/2026-05-visa-2553.xlsx"
```

## Project layout

```
web/            Vue 3 SPA
api/            Node.js Express API
analyzer_api/   Python FastAPI wrapper
backend/        Core Python parsing & analysis
data/           Runtime cache only (gitignored); Supabase is source of truth
statements/     Bank .xlsx exports (gitignored)
```
