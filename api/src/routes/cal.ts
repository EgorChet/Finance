import { Router } from "express";
import { createHash } from "crypto";
import {
  applyMerchantRules,
  finalizeReportAsync,
  normalizeProvisionalChargesAsync,
  rememberReport,
} from "../services/reportService.js";
import { analyzeCalTransactions } from "../services/analyzerClient.js";
import { mapCalTransactions } from "../services/calTransactionMapper.js";
import {
  awaitJobCompletion,
  cancelCalJob,
  consumeCalJob,
  createCalSyncJob,
  submitCalOtpCode,
  waitForJobPhase,
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

async function savePartialCalReport(transactions: ReturnType<typeof mapCalTransactions>) {
  const billingDate = openCycleBillingDate();
  const sourceFile = `cal-partial-${billingDate}.xlsx`;
  const metadata = {
    billing_date: billingDate,
    source_file: sourceFile,
    source: "cal-sync",
  };
  const report = await analyzeCalTransactions(
    transactions as unknown as Array<Record<string, unknown>>,
    metadata,
    true,
  );
  const storedReport = await normalizeProvisionalChargesAsync(report);
  const hash = createHash("sha256").update(JSON.stringify(transactions)).digest("hex");

  const data = await readStatements();
  const rules = await readRules();
  const key = rememberReport(
    data,
    storedReport,
    `cal-sync:${billingDate}`,
    sourceFile,
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
    const phase = await waitForJobPhase(job.id, ["otp_required", "done", "error"], 90_000);

    if (phase.status === "otp_required") {
      res.json({ jobId: job.id, status: "otp_required" });
      return;
    }

    if (phase.status === "done") {
      await job.pipelineDone;
      const raw = consumeCalJob(job.id);
      const mapped = mapCalTransactions(raw);
      const saved = await savePartialCalReport(mapped);
      res.json({ jobId: job.id, status: "done", ...saved });
      return;
    }

    throw new Error(phase.error || "Cal sync failed");
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
    await awaitJobCompletion(jobId);
    const raw = consumeCalJob(jobId);
    const mapped = mapCalTransactions(raw);
    const saved = await savePartialCalReport(mapped);
    res.json({ ok: true, status: "done", ...saved });
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
