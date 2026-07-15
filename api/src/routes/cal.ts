import { Router } from "express";
import {
  cancelCalJob,
  consumeCalJob,
  createCalSyncJob,
  getCalJob,
  getCalJobStatus,
  releaseCalJob,
  submitCalOtpCode,
  type CalSyncMode,
} from "../services/calSyncService.js";
import { persistCalSyncExport } from "../services/calSyncPersist.js";
import { assessCalSessionFreshness } from "../services/calSessionFreshness.js";
import {
  calSyncEnabled,
  maskNationalId,
  readCalCredentials,
  writeCalCredentials,
} from "../storage/calCredentials.js";
import { clearCalSession, readCalSession } from "../storage/calSession.js";

const router = Router();

function assertCalEnabled(): void {
  if (!calSyncEnabled()) {
    throw new Error("Cal sync is not enabled on this server");
  }
}

router.get("/status", async (_req, res) => {
  try {
    const creds = await readCalCredentials();
    let session = await readCalSession();
    let freshness = assessCalSessionFreshness(session);
    // Drop clearly expired browser sessions so Auto sync disappears and Sync Cal (SMS) is offered.
    // Credentials (teudat + card last4) stay — only the Cal website login cookie/token is cleared.
    if (session && !freshness.usable) {
      try {
        await clearCalSession();
      } catch {
        /* ignore — still report as not saved */
      }
      session = null;
      freshness = assessCalSessionFreshness(null);
    }
    res.json({
      enabled: calSyncEnabled(),
      configured: Boolean(creds),
      national_id_masked: creds ? maskNationalId(creds.national_id) : null,
      card_last4_masked: creds ? `••••${creds.card_last4.slice(-4)}` : null,
      session_saved: Boolean(session) && freshness.usable,
      session_saved_at: session?.saved_at ?? null,
      session_age_minutes:
        freshness.savedAgeMs != null ? Math.round(freshness.savedAgeMs / 60_000) : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.put("/credentials", async (req, res) => {
  try {
    assertCalEnabled();
    const nationalId = String(req.body?.national_id || "").trim();
    const cardLast4 = String(req.body?.card_last4 || "").replace(/\D/g, "");
    if (!nationalId || cardLast4.length !== 4) {
      res.status(400).json({ error: "national_id and 4-digit card_last4 required" });
      return;
    }
    await writeCalCredentials(nationalId, cardLast4);
    res.json({
      ok: true,
      configured: true,
      national_id_masked: maskNationalId(nationalId),
      card_last4_masked: `••••${cardLast4}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.post("/sync/start", async (req, res) => {
  try {
    assertCalEnabled();
    const creds = await readCalCredentials();
    if (!creds) {
      res.status(400).json({ error: "Cal credentials not configured" });
      return;
    }

    const modeRaw = String(req.body?.mode || "classic");
    const mode: CalSyncMode = modeRaw === "auto" ? "auto" : "classic";
    const job = await createCalSyncJob(creds, mode);
    res.json({ jobId: job.id, status: job.status, mode: job.mode });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.get("/sync/:jobId/status", (req, res) => {
  try {
    assertCalEnabled();
    const status = getCalJobStatus(req.params.jobId);
    if (!status) {
      res.status(404).json({ error: "Sync session not found" });
      return;
    }
    res.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.post("/sync/:jobId/finish", async (req, res) => {
  try {
    assertCalEnabled();
    const jobId = req.params.jobId;
    const status = getCalJobStatus(jobId);
    if (!status) {
      res.status(404).json({ error: "Sync session not found" });
      return;
    }
    if (status.status === "error") {
      res.status(400).json({ error: status.error || "Cal sync failed" });
      return;
    }
    if (status.saved && status.statementKey) {
      releaseCalJob(jobId);
      res.json({ ok: true, status: "done", key: status.statementKey });
      return;
    }
    if (status.status !== "done") {
      res.status(409).json({ error: "Sync not finished yet", status: status.status });
      return;
    }

    const job = getCalJob(jobId);
    if (!job?.xlsxBuffer?.length) {
      res.status(409).json({ error: "Sync export not available anymore" });
      return;
    }

    const { buffer, filename } = consumeCalJob(jobId);
    const saved = await persistCalSyncExport(buffer, filename);
    releaseCalJob(jobId);
    res.json({ ok: true, status: "done", ...saved });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.post("/sync/otp", async (req, res) => {
  try {
    assertCalEnabled();
    const jobId = String(req.body?.jobId || "");
    const code = String(req.body?.code || "");
    if (!jobId || !code) {
      res.status(400).json({ error: "jobId and code required" });
      return;
    }

    submitCalOtpCode(jobId, code);
    res.json({ ok: true, jobId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

router.delete("/sync/:jobId", async (req, res) => {
  try {
    await cancelCalJob(req.params.jobId);
    res.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: message });
  }
});

export default router;
