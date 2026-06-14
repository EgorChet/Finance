# Deploy with password protection

Your real spending data never ships in the Vue build. It lives in **Supabase** and is only returned by the **API after password login**.

Anyone can open the public site URL, but without the password they only get **Try demo** (fake sample data).

You and your wife share the same password — both sign in on any device.

**Pre-flight:** from the repo root run `node scripts/deploy-check.mjs`

---

## Step 0 — GitHub repo

This folder is not on GitHub until you push it:

```bash
cd /path/to/Finance
git init
git add .
git commit -m "Initial commit"
# Create a private repo on github.com, then:
git remote add origin git@github.com:YOUR_USER/Finance.git
git branch -M main
git push -u origin main
```

Use a **private** repo if `data/` was ever committed in the past.

---

## Architecture

| Piece | Host | Public? | Holds real data? |
|-------|------|---------|------------------|
| Vue app | GitHub Pages | Yes (UI only) | No |
| Node API | Render | Yes (endpoints) | No — reads Supabase |
| Python analyzer | Render | Internal | No |
| JSON database | Supabase | No (service key only) | **Yes** |

---

## Step 1 — Supabase (free)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run `supabase/schema.sql`.
3. **Settings → API** → copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (never put this in the frontend or git).

4. Seed your local data once (from your Mac):

```bash
cd /path/to/Finance
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
node scripts/seed-supabase.mjs
```

Re-run after big local changes if you want production to match.

---

## Step 2 — Render (free)

1. Push this repo to **GitHub** (use a **private** repo if `data/` was ever committed).
2. [render.com](https://render.com) → **New Blueprint** → connect repo → apply `render.yaml`.
3. Set these env vars on **finance-api** (Render dashboard):

| Variable | Value |
|----------|--------|
| `AUTH_PASSWORD` | Shared family password (you + wife) |
| `AUTH_SECRET` | Long random string (Render can auto-generate) |
| `SUPABASE_URL` | From Supabase |
| `SUPABASE_SERVICE_KEY` | From Supabase |
| `STORAGE` | `supabase` |
| `ALLOWED_ORIGINS` | Your GitHub Pages origin only, e.g. `https://YOUR_USER.github.io` (no path, no trailing slash) |

4. Wait for both services (API + analyzer) to go green.
5. Copy the API URL, e.g. `https://finance-api-xxxx.onrender.com`.

**Verify API ↔ analyzer link** (no login needed):

```bash
curl "https://YOUR_API.onrender.com/health?deep=1"
```

You want:

```json
{ "status": "ok", "analyzer": true, "analyzer_env_set": true, "analyzer_url": "http://finance-analyzer-xxxx:10000" }
```

If `analyzer_env_set` is **false** → `ANALYZER_URL` was never wired. Re-apply the Blueprint or set it manually (see troubleshooting below).

If `analyzer` is **false** → API cannot reach the Python service (wrong port, analyzer asleep, or not deployed).

**Do not** set `ANALYZER_URL` to the analyzer’s public URL (`https://finance-analyzer-xxxx.onrender.com`). The API must use Render’s **internal** host:port from **Link service** (looks like `http://finance-analyzer:10000` in API logs — **http**, service **name**, no `-jsoq` slug, no `.onrender.com`).

If you typed host:port by hand and used `finance-analyzer-jsoq`, that is wrong — `-jsoq` is only in the public URL. Use **`finance-analyzer:10000`** (matches `name:` in `render.yaml`) or link via **Add from → finance-analyzer → Host and port**.

**Render dashboard checklist**

| Check | Where | Expected |
|-------|--------|----------|
| Two web services | Dashboard | `finance-api` **and** `finance-analyzer` |
| Same Blueprint | Both service pages | Created from `render.yaml` together |
| `ANALYZER_URL` on API | finance-api → Environment | Value like `finance-analyzer:10000` (from **Link service**) |
| Analyzer healthy | finance-analyzer → Logs | `Uvicorn running on 0.0.0.0:10000` |
| API log on start | finance-api → Logs | `Analyzer URL: http://finance-analyzer-...` |

To link manually if Blueprint missed it: **finance-api** → **Environment** → add `ANALYZER_URL` → **Add from** → select **finance-analyzer** → **Host and port**.

**First request after idle** may take ~30s (Render free tier cold start).

---

## Step 3 — GitHub Pages (free)

1. Repo **Settings → Pages** → Source: **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_API_URL` = your Render API URL (no trailing slash)
3. Push to `main` — workflow `.github/workflows/deploy-pages.yml` builds and deploys.
4. Site URL: `https://YOUR_USER.github.io/Finance/` (or your repo name).

---

## Step 4 — Verify security

1. Open the Pages URL in a private window.
2. Click **Try demo** → sample data only, no upload.
3. Click **Sign in** with wrong password → rejected.
4. Sign in with `AUTH_PASSWORD` → your real months appear.
5. Open `https://YOUR_API.onrender.com/api/months` without a token → `401 Unauthorized`.

---

## Monthly workflow (production)

1. Export new `.xlsx` from Leumi.
2. Sign in on the deployed site.
3. **Upload statement** in the sidebar (Sync is local-only; production uses upload).

Review / mappings update Supabase automatically.

---

## Local dev (unchanged)

Leave `AUTH_PASSWORD` empty → no login required.

```bash
# terminal 1
uvicorn analyzer_api.main:app --port 8001

# terminal 2
cd api && npm run dev

# terminal 3
cd web && npm run dev
```

---

## Optional: two passwords

Instead of one shared password, set on Render:

```
AUTH_PASSWORDS=your-password,wife-password
```

(`AUTH_PASSWORD` still works if you only need one.)

---

## Keep data off GitHub

These files are gitignored — do **not** force-add them:

- `data/statements.json`
- `data/merchant_rules.json`
- `data/review_progress.json`
- `statements/*.xlsx`

If they were committed before, use a **private** repo or remove them from git history before going public.
