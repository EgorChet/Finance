# Google Drive auto-ingest

Drop a Leumi Visa `.xlsx` into Drive; Apps Script wakes the Render API/analyzer and imports it. In-app **Import statement** still works as a fallback.

## Why a timer (not “react to new file”)?

Personal Google Apps Script **does not** get a reliable push trigger for “file added to this Drive folder.” Google’s Drive change APIs are for Workspace add-ons / limited cases, not a simple folder watcher you can paste into a script.

So the script **polls** `partial/` and `final/` on a timer. That is intentional. Empty polls exit immediately (no wake). A **script lock** skips overlapping runs so free Render is not hammered by many cold starts at once.

## Drive folders

Create this tree in Google Drive (names can differ; IDs matter):

```
Finance/
  statements/
    partial/              # mid-cycle snapshots
    final/                # closes the billing cycle
    imported/
      partial/            # moved here after success
      final/
      failed/             # quarantine after hard failure (bad file / auth)
```

Open each folder → copy the ID from the URL (`…/folders/<ID>`).

## API secret

1. Generate a long random secret, e.g. `openssl rand -hex 32`
2. Set `INGEST_SECRET` on **finance-api** (Render dashboard + local `.env` if testing)
3. Redeploy the API

Endpoints (machine auth via `X-Ingest-Key`):

- `GET /api/ingest/wake` — wait until analyzer is ready
- `POST /api/ingest` — multipart `file` + `statement_type=partial|final`

Public (no key): `GET /health?deep=1` — used first to wake a sleeping Render service.

## Apps Script setup

1. Go to [script.google.com](https://script.google.com) → **New project**
2. Paste [`Code.gs`](./Code.gs) over `Code.gs`
3. **Project Settings → Script properties** → add:

| Property | Value |
|----------|--------|
| `API_BASE` | `https://YOUR_API.onrender.com` (no trailing slash) |
| `INGEST_SECRET` | same value as Render `INGEST_SECRET` |
| `FOLDER_PARTIAL` | Drive folder ID |
| `FOLDER_FINAL` | Drive folder ID |
| `FOLDER_IMPORTED_PARTIAL` | Drive folder ID |
| `FOLDER_IMPORTED_FINAL` | Drive folder ID |
| `FOLDER_IMPORTED_FAILED` | Drive folder ID |

4. Run `runOnce` once from the editor → authorize **Drive** + **external URL** (UrlFetch) when prompted
5. Run `installTriggers` → installs a **5-minute** timer that scans `partial/` and `final/`

After a successful import the file leaves the inbox folder, so the next tick is a no-op.

## First test

1. Confirm API is up: open `https://YOUR_API.onrender.com/health?deep=1` in a browser and wait until JSON looks healthy (wakes free Render)
2. Drop a small `.xlsx` into `Finance/statements/partial`
3. Run `runOnce` **once** (or wait for the timer) — do **not** click Run repeatedly while one is still going
4. File should move to `imported/partial` (or stay in inbox if Render is still cold — next tick retries)
5. Open the app → spending for that cycle should update

If the file lands in `imported/failed`, open **Executions** for a hard error (wrong secret, bad file, etc.). Wake timeouts are **not** moved to failed anymore.

### `Timed out waking… Analyzer not ready`

The API woke, but **finance-analyzer** did not become healthy in time (common on Render free tier).

1. In Render: confirm **finance-analyzer** is not suspended / crashed
2. On **finance-api**, `ANALYZER_URL` must be the analyzer’s **public** `https://….onrender.com` URL (free services cannot use private networking)
3. Re-deploy API if you just changed wake code; paste latest `Code.gs` (polls ~6 min, shallow `/health` only)
4. Run `runOnce` once and watch Executions — new logs include `analyzer_url` on failed wake attempts

## If too many executions / wake timeouts

1. Run **`removeTriggers`** so nothing new starts
2. Wait until all Executions finish
3. Paste the latest `Code.gs` (lock + longer wake)
4. Move any good `.xlsx` from `imported/failed` back into `partial/` or `final/` if it failed only because of cold start
5. Wake the API in a browser: `/health?deep=1`
6. Run **`runOnce` once**, then **`installTriggers`** once

## Ops tips

- Re-run `installTriggers` after copying the project (triggers do not always copy).
- `removeTriggers` clears timers if you want to pause automation.
- Duplicate drops of the same final file are skipped by content hash on the API.
- Keep `INGEST_SECRET` out of git; treat it like a password.
