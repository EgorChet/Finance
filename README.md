# Finance — Hebrew Bank Statement Analyzer

Parse Leumi Visa exports (Hebrew), summarize spending in English, remember monthly statements and merchant labels.

**Stack:** Vue 3 frontend · Node.js API · Python analyzer (XLSX parsing)

## Quick start (local)

Uses the **same Supabase project** as production — no local statement files.

```bash
# Copy env and paste SUPABASE_URL + SUPABASE_SERVICE_KEY from Supabase/Render
cp .env.example .env

# 1. Python analyzer (statement parsing)
cd analyzer
pip install -r requirements.txt
PYTHONPATH=engine:. uvicorn service.main:app --port 8001
cd ..

# 2. Product API (new terminal)
cd api && npm install && npm run dev

# 3. Vue app (new terminal)
cd web && npm install && npm run dev
```

Open http://localhost:5173 — upload statements in the app; they are stored in Supabase.

Or use Docker (still needs Supabase keys in `.env`):

```bash
docker compose up --build
```

## Auth & demo mode

When deployed, set `AUTH_PASSWORD` and `AUTH_SECRET` on the API (Render).

- **Sign in** — password protects your real statements
- **Try demo** — no password; sample spending data only (upload/sync disabled)

Locally, leave `AUTH_PASSWORD` empty to skip login, or use the values in `.env`.

## Data

All personal data lives in **Supabase** (`app_state` table), for both local dev and production.

Monthly workflow: open the app → **Upload statement** for new `.xlsx` files. Nothing is kept in the repo.

Optional one-time seed from old local JSON (if you still have it):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node tools/seed-supabase.mjs
```

Fully offline without Supabase is possible with `STORAGE=local`, but that is not the normal path.

## Deploy (free tier, password-protected)

Full step-by-step: **[docs/DEPLOY.md](./docs/DEPLOY.md)**

Summary:

1. **Supabase** — statements, rules, budget, calendar (not in git)
2. **Render** — API + analyzer; set `AUTH_PASSWORD`, `AUTH_SECRET`, Supabase keys
3. **GitHub Pages** — Vue app; set repo variable `VITE_API_URL` to your Render API URL

## Project layout

```
web/                 Vue UI (features/ = menu pages, shared/ = common code)
api/                 Product API (Node) — auth, Supabase, chat, calendar, portfolio
analyzer/
  service/           HTTP wrapper (FastAPI) — parses uploaded statements
  engine/            Python library — parse XLSX, translate, categorize
tools/               Deploy check + optional Supabase seed
docs/                Deploy guide
supabase/            Database schema
docker-compose.yml   Local full stack
render.yaml          Render blueprint (API + analyzer)
```

**Ignore at the root:** `.venv/` (Python env), `.env` (secrets), `.github/` (CI for Pages).
