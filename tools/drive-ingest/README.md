# Google Drive auto-ingest

Drop a Leumi Visa `.xlsx` into Drive; Apps Script wakes the Render API/analyzer and imports it. In-app **Import statement** still works as a fallback.

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
      failed/             # quarantine after hard failure
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
5. Run `installTriggers` → installs a **1-minute** timer that scans `partial/` and `final/`

Drive has no reliable “file created in folder” trigger for personal scripts, so polling every minute is intentional. After a successful import the file leaves the inbox folder, so the next tick is a no-op.

## First test

1. Confirm API is up: `curl "https://YOUR_API.onrender.com/health"`
2. Drop a small `.xlsx` into `Finance/statements/partial`
3. Within ~1–2 minutes (plus Render cold start) the file should move to `imported/partial`
4. Open the app → spending for that cycle should update

If the file lands in `imported/failed`, open **Executions** in the Apps Script project for the error (wrong secret, wake timeout, bad file, etc.).

## Ops tips

- Re-run `installTriggers` after copying the project (triggers do not always copy).
- `removeTriggers` clears timers if you want to pause automation.
- Duplicate drops of the same final file are skipped by content hash on the API.
- Keep `INGEST_SECRET` out of git; treat it like a password.
