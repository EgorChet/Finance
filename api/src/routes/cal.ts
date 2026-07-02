import { Router } from "express";
import { createHash } from "crypto";
import {
  applyMerchantRules,
  finalizeReportAsync,
  normalizeProvisionalChargesAsync,
  rememberReport,
} from "../services/reportService.js";
import { analyzeFileBuffer } from "../services/analyzerClient.js";
import {
  cancelCalJob,
  consumeCalJob,
  createCalSyncJob,
  getCalJobStatus,
  submitCalOtpCode,
} from "../services/calSyncService.js";
import {
  calSyncEnabled,
  maskNationalId,
  readCalCredentials,
  writeCalCredentials,
} from "../storage/calCredentials.js";
import { readRules, readStatements, writeStatements } from "../storage/index.js";
import { openCycleBillingDate } from "../utils/billingCycle.js";

const router = Router();

function assertCalEnabled(): void {
  if (!calSyncEnabled()) {
    throw new Error("Cal sync is not enabled on this server");
  }
}

router.get("/status", async (_req, res) => {
  try {
    const creds = await readCalCredentials();
    res.json({
      enabled: calSyncEnabled(),
      configured: Boolean(creds),
      national_id_masked: creds ? maskNationalId(creds.national_id) : null,
      card_last4_masked: creds ? `••••${creds.card_last4.slice(-4)}` : null,
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

async function savePartialCalReportFromXlsx(buffer: Buffer, filename: string) {
  const billingDate = openCycleBillingDate();
  const report = await analyzeFileBuffer(buffer, filename, true);
  const storedReport = await normalizeProvisionalChargesAsync(report);
  const hash = createHash("sha256").update(buffer).digest("hex");

  const data = await readStatements();
  const rules = await readRules();
  const key = rememberReport(
    data,
    storedReport,
    `cal-sync:${billingDate}`,
    filename,
    hash,
    true,
  );
  applyMerchantRules(data, rules);
  await writeStatements(data);
  return { key, report: await finalizeReportAsync(data.statements[key]!.report) };
}

router.post("/sync/start", async (_req, res) => {
  try {
    assertCalEnabled();
    const creds = await readCalCredentials();
    if (!creds) {
      res.status(400).json({ error: "Cal credentials not configured" });
      return;
    }

    const job = await createCalSyncJob(creds);
    res.json({ jobId: job.id, status: job.status });
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
    const status = getCalJobStatus(req.params.jobId);
    if (!status) {
      res.status(404).json({ error: "Sync session not found" });
      return;
    }
    if (status.status === "error") {
      res.status(400).json({ error: status.error || "Cal sync failed" });
      return;
    }
    if (status.status !== "done") {
      res.status(409).json({ error: "Sync not finished yet", status: status.status });
      return;
    }

    const { buffer, filename } = consumeCalJob(req.params.jobId);
    const saved = await savePartialCalReportFromXlsx(buffer, filename);
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
